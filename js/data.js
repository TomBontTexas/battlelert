/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert data: ship classes, encounters, chatter lines and sound recipes.
   Balance lives here so tuning never touches the simulation code.
   Units: power in MW (MJ per second), stored energy in MJ, time in seconds. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  BL.APP_TAG = "BATTLELERT";
  // "siege battery" -> "siege batteries", "raider" -> "raiders", "fortress" -> "fortresses".
  BL.plural = function (w) { return /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + "ies" : /(s|x|ch|sh)$/i.test(w) ? w + "es" : w + "s"; };
  BL.TICK_RATE = 20;                       // simulation ticks per second

  /* ------------------------------------------------------- Ship classes
     Nine classes, smallest to largest. `built` classes can be offered as jobs; the rest
     arrive in later steps. Each ship's numbers are its tech-level-4 values: BL.shipFor()
     scales them for the tech level on the job offer.
     Ratings (tuning step 4, approved Oct 20, 2026): each class up multiplies hull by 1.35, shields
     and reactor by 1.3 and the shield charger by 1.25; every MJ past the shields does hullPerMJ
     (0.3, every class) hull damage. Enemies don't scale with our class (BL.TORPEDOES, BL.ENEMY_GUNS).
     gScale: multiplier on the G of announced burns (small ships burn harder).
     maxG: thruster top speed; burns never exceed it, and thruster damage lowers it by 1 G.
     mainGun (light cruiser and up): fires by itself the moment its capacitor is full and a target
     is up, spending the whole charge for dmgPerMJ damage per MJ. Keep feeding it to keep firing.
     hangar (cruiser and up): the hangar capacitor is the launchers (full = launch) while the
     squadron is aboard and the arresters (full = recover) while it is out. The launch is called
     launchAfter s into each system (again `retry` s after a miss); the recovery recoverBefore s
     before the jump window. While out, the squadron shoots down `intercept` of salvos and does dps.
     reactors (battleship and up): several reactors, each with its own safe output and aux
     bank; each system's `reactor` (0 = A, 1 = B, 2 = C) is where it starts out wired.
     gunnerEncounters: the route's encounters at the gunner station, if they differ (the
     Azurian capital ships are met only at the gun for now). gunnerFinal: the encounter that
     always holds the final system at the gun (the dreadnought's homeworld fortress).
     mission: jumps and when each jump window opens (s after arrival). A ship with no
     warp drive flies one timed sortie per carrier jump: the carrier recovers it when
     the sortie timer runs out, carries it through warp space, and launches it again. */
  var GUN = { shotMJ: 15, normalInterval: 2.0, fullInterval: 0.5, hitChance: 0.7, damage: 10 };
  function sys(id, name, short, kind, maxMJ, maxMW, startMJ, startSet, extra) {
    var o = { id: id, name: name, short: short, kind: kind, maxMJ: maxMJ, maxMW: maxMW, startMJ: startMJ, startSet: startSet };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  }
  BL.CLASSES = [
    { n: 1, id: "gunboat", name: "Gunboat", built: true, baseRep: 100,
      crew: 4, hull: 30, reactorMW: 45, engineMWperG: 2, cruiseG: 4, maxG: 16, gScale: 1.5,
      aux: { capacity: 0, rateMW: 0 }, hullPerMJ: 0.3, torpedoes: 2,
      mission: { jumps: 3, windows: [70, 80, 90] }, encounters: ["raiders", "interceptors", "frigate"],
      systems: [
        sys("life", "Life support", "LIFE", "life", 25, 6, 25, 2, { drainMW: 1.2 }),
        sys("shield", "Shields", "SHLD", "shield", 90, 35, 45, 4),
        sys("gun1", "Gun 1", "GUN1", "gun", 60, 30, 30, 4, { gunner: 1 })
      ] },
    { n: 2, id: "picket", name: "Picket Ship", built: true, baseRep: 212,
      crew: 4, hull: 41, reactorMW: 59, engineMWperG: 3, cruiseG: 2, maxG: 11, gScale: 1.2,
      aux: { capacity: 0, rateMW: 0 }, hullPerMJ: 0.3,
      mission: { jumps: 3, windows: [110, 120, 130] }, encounters: ["raiders", "interceptors", "siege"],
      systems: [
        sys("life", "Life support", "LIFE", "life", 35, 8, 35, 2, { drainMW: 1.5 }),
        sys("shield", "Shields", "SHLD", "shield", 117, 44, 58, 12),
        sys("gun1", "Gun 1", "GUN1", "gun", 70, 30, 35, 8, { gunner: 1 }),
        sys("drive", "Warp drive", "DRIVE", "drive", 1800, 40, 0, 0)
      ] },
    { n: 3, id: "destroyerEscort", name: "Destroyer Escort", built: true, baseRep: 325,
      crew: 5, hull: 55, reactorMW: 76, engineMWperG: 4, cruiseG: 2, maxG: 10, gScale: 1.1,
      aux: { capacity: 0, rateMW: 0 }, hullPerMJ: 0.3,
      mission: { jumps: 3, windows: [120, 130, 140] }, encounters: ["raiders", "interceptors", "siege", "hunters"],
      systems: [
        sys("life", "Life support", "LIFE", "life", 45, 10, 45, 3, { drainMW: 2.2 }),
        sys("shield", "Shields", "SHLD", "shield", 152, 55, 76, 16),
        sys("gun1", "Gun 1", "GUN1", "gun", 85, 35, 42, 9, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 85, 35, 42, 9, { gunner: 2 }),
        sys("pd", "CIWS", "CIWS", "pd", 70, 20, 35, 6),
        sys("drive", "Warp drive", "DRIVE", "drive", 2400, 50, 0, 0)
      ] },
    { n: 4, id: "destroyer", name: "Destroyer", built: true, baseRep: 437,
      crew: 6, hull: 74, reactorMW: 99, engineMWperG: 5, cruiseG: 2, maxG: 9, gScale: 1,
      aux: { capacity: 450, rateMW: 40 }, hullPerMJ: 0.3,
      mission: { jumps: 3, windows: [130, 140, 150] }, encounters: ["raiders", "interceptors", "siege", "hunters"],
      systems: [
        sys("life", "Life support", "LIFE", "life", 60, 12, 60, 4, { drainMW: 3 }),
        sys("shield", "Shields", "SHLD", "shield", 198, 68, 99, 20),
        sys("gun1", "Gun 1", "GUN1", "gun", 100, 40, 50, 10, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 100, 40, 50, 10, { gunner: 2 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 100, 40, 50, 10, { gunner: 3 }),
        sys("pd", "CIWS", "CIWS", "pd", 95, 25, 48, 6),
        sys("drive", "Warp drive", "DRIVE", "drive", 3200, 60, 0, 0)
      ] },
    { n: 5, id: "lightCruiser", name: "Light Cruiser", built: true, baseRep: 550,
      crew: 7, hull: 100, reactorMW: 129, engineMWperG: 6, cruiseG: 2, maxG: 8, gScale: 0.9,
      aux: { capacity: 550, rateMW: 45 }, hullPerMJ: 0.3,
      mission: { jumps: 3, windows: [140, 150, 160] }, encounters: ["raiders", "interceptors", "siege", "minefield", "hunters"],
      mainGun: { dmgPerMJ: 0.6 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 70, 14, 70, 4, { drainMW: 3.5 }),
        sys("shield", "Shields", "SHLD", "shield", 257, 85, 128, 22),
        sys("gun1", "Gun 1", "GUN1", "gun", 105, 40, 52, 10, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 105, 40, 52, 10, { gunner: 2 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 105, 40, 52, 10, { gunner: 3 }),
        sys("gun4", "Gun 4", "GUN4", "gun", 105, 40, 52, 10, { gunner: 4 }),
        sys("main", "Main gun", "MAIN", "main", 480, 45, 160, 8),
        sys("pd", "CIWS", "CIWS", "pd", 125, 32, 62, 7),
        sys("drive", "Warp drive", "DRIVE", "drive", 4000, 70, 0, 0)
      ] },
    { n: 6, id: "cruiser", name: "Cruiser", built: true, baseRep: 662,
      crew: 8, hull: 134, reactorMW: 167, engineMWperG: 7, cruiseG: 2, maxG: 7, gScale: 0.85,
      aux: { capacity: 650, rateMW: 50 }, hullPerMJ: 0.3,
      mission: { jumps: 3, windows: [150, 160, 170] }, encounters: ["raiders", "interceptors", "siege", "minefield", "hunters"],
      mainGun: { dmgPerMJ: 0.6 },
      hangar: { launchAfter: [6, 12], lead: 10, window: 8, retry: 15, recoverBefore: 25, recoverLead: 12, recoverWindow: 10, intercept: 0.25, dps: 6 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 80, 16, 80, 4, { drainMW: 4 }),
        sys("shield", "Shields", "SHLD", "shield", 334, 107, 167, 24),
        sys("gun1", "Gun 1", "GUN1", "gun", 110, 40, 55, 10, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 110, 40, 55, 10, { gunner: 2 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 110, 40, 55, 10, { gunner: 3 }),
        sys("gun4", "Gun 4", "GUN4", "gun", 110, 40, 55, 10, { gunner: 4 }),
        sys("gun5", "Gun 5", "GUN5", "gun", 110, 40, 55, 10, { gunner: 5 }),
        sys("main", "Main gun", "MAIN", "main", 520, 50, 170, 8),
        sys("hangar", "Launchers", "LNCH", "hangar", 600, 40, 300, 6),
        sys("pd", "CIWS", "CIWS", "pd", 150, 38, 75, 8),
        sys("drive", "Warp drive", "DRIVE", "drive", 4800, 80, 0, 0)
      ] },
    { n: 7, id: "heavyCruiser", name: "Heavy Cruiser", built: true, baseRep: 775,
      crew: 9, hull: 181, reactorMW: 217, engineMWperG: 8, cruiseG: 2, maxG: 6, gScale: 0.8,
      aux: { capacity: 750, rateMW: 55 }, hullPerMJ: 0.3,
      mission: { jumps: 3, windows: [160, 170, 180] }, encounters: ["raiders", "interceptors", "siege", "minefield", "hunters"],
      gunnerEncounters: ["raiders", "interceptors", "siege", "minefield", "hunters", "cruiserA"],
      mainGun: { dmgPerMJ: 0.6 },
      hangar: { launchAfter: [6, 12], lead: 10, window: 8, retry: 15, recoverBefore: 25, recoverLead: 12, recoverWindow: 10, intercept: 0.25, dps: 6 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 90, 18, 90, 5, { drainMW: 4.5 }),
        sys("shield", "Shields", "SHLD", "shield", 434, 134, 217, 26),
        sys("gun1", "Gun 1", "GUN1", "gun", 115, 42, 57, 10, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 115, 42, 57, 10, { gunner: 2 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 115, 42, 57, 10, { gunner: 3 }),
        sys("gun4", "Gun 4", "GUN4", "gun", 115, 42, 57, 10, { gunner: 4 }),
        sys("gun5", "Gun 5", "GUN5", "gun", 115, 42, 57, 10, { gunner: 5 }),
        sys("gun6", "Gun 6", "GUN6", "gun", 115, 42, 57, 10, { gunner: 6 }),
        sys("main", "Main gun", "MAIN", "main", 560, 55, 180, 8),
        sys("hangar", "Launchers", "LNCH", "hangar", 650, 45, 320, 6),
        sys("pd", "CIWS", "CIWS", "pd", 180, 45, 90, 8),
        sys("drive", "Warp drive", "DRIVE", "drive", 5600, 90, 0, 0)
      ] },
    { n: 8, id: "battleship", name: "Battleship", built: true, baseRep: 887,
      crew: 10, hull: 245, engineMWperG: 9, cruiseG: 2, maxG: 5, gScale: 0.75,
      reactors: [{ name: "A", mw: 142, aux: { capacity: 450, rateMW: 35 } }, { name: "B", mw: 142, aux: { capacity: 450, rateMW: 35 } }],
      hullPerMJ: 0.3,
      mission: { jumps: 3, windows: [170, 180, 190] }, encounters: ["raiders", "interceptors", "siege", "minefield", "hunters"],
      gunnerEncounters: ["raiders", "interceptors", "siege", "minefield", "hunters", "cruiserA", "battleshipA"],
      mainGun: { dmgPerMJ: 0.6 },
      hangar: { launchAfter: [6, 12], lead: 10, window: 8, retry: 15, recoverBefore: 25, recoverLead: 12, recoverWindow: 10, intercept: 0.25, dps: 7 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 100, 20, 100, 5, { drainMW: 5, reactor: 0 }),
        sys("shield", "Shields", "SHLD", "shield", 565, 167, 282, 28, { reactor: 0 }),
        sys("gun1", "Gun 1", "GUN1", "gun", 120, 44, 60, 10, { gunner: 1, reactor: 0 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 120, 44, 60, 10, { gunner: 2, reactor: 0 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 120, 44, 60, 10, { gunner: 3, reactor: 1 }),
        sys("gun4", "Gun 4", "GUN4", "gun", 120, 44, 60, 10, { gunner: 4, reactor: 1 }),
        sys("gun5", "Gun 5", "GUN5", "gun", 120, 44, 60, 10, { gunner: 5, reactor: 1 }),
        sys("gun6", "Gun 6", "GUN6", "gun", 120, 44, 60, 10, { gunner: 6, reactor: 1 }),
        sys("gun7", "Gun 7", "GUN7", "gun", 120, 44, 60, 10, { gunner: 7, reactor: 1 }),
        sys("main", "Main gun", "MAIN", "main", 600, 60, 200, 8, { reactor: 1 }),
        sys("hangar", "Launchers", "LNCH", "hangar", 700, 48, 350, 6, { reactor: 1 }),
        sys("pd", "CIWS", "CIWS", "pd", 200, 50, 100, 8, { reactor: 0 }),
        sys("drive", "Warp drive", "DRIVE", "drive", 6400, 100, 0, 0, { reactor: 1 })
      ] },
    { n: 9, id: "dreadnought", name: "Dreadnaught", built: true, baseRep: 1000,
      crew: 12, hull: 331, engineMWperG: 10, cruiseG: 2, maxG: 4, gScale: 0.7,
      reactors: [{ name: "A", mw: 122, aux: { capacity: 380, rateMW: 30 } }, { name: "B", mw: 122, aux: { capacity: 380, rateMW: 30 } },
        { name: "C", mw: 122, aux: { capacity: 380, rateMW: 30 } }],
      hullPerMJ: 0.3,
      mission: { jumps: 3, windows: [180, 190, 200] }, encounters: ["raiders", "interceptors", "siege", "minefield", "hunters"],
      gunnerEncounters: ["raiders", "interceptors", "siege", "minefield", "hunters", "cruiserA", "battleshipA"], gunnerFinal: "fortress",
      mainGun: { dmgPerMJ: 0.6 },
      hangar: { launchAfter: [6, 12], lead: 10, window: 8, retry: 15, recoverBefore: 25, recoverLead: 12, recoverWindow: 10, intercept: 0.25, dps: 8 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 110, 22, 110, 6, { drainMW: 5.5, reactor: 0 }),
        sys("shield", "Shields", "SHLD", "shield", 734, 209, 367, 30, { reactor: 0 }),
        sys("gun1", "Gun 1", "GUN1", "gun", 125, 45, 62, 10, { gunner: 1, reactor: 0 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 125, 45, 62, 10, { gunner: 2, reactor: 1 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 125, 45, 62, 10, { gunner: 3, reactor: 1 }),
        sys("gun4", "Gun 4", "GUN4", "gun", 125, 45, 62, 10, { gunner: 4, reactor: 1 }),
        sys("gun5", "Gun 5", "GUN5", "gun", 125, 45, 62, 10, { gunner: 5, reactor: 2 }),
        sys("gun6", "Gun 6", "GUN6", "gun", 125, 45, 62, 10, { gunner: 6, reactor: 2 }),
        sys("gun7", "Gun 7", "GUN7", "gun", 125, 45, 62, 10, { gunner: 7, reactor: 2 }),
        sys("gun8", "Gun 8", "GUN8", "gun", 125, 45, 62, 10, { gunner: 8, reactor: 2 }),
        sys("main", "Main gun", "MAIN", "main", 640, 65, 210, 8, { reactor: 1 }),
        sys("hangar", "Launchers", "LNCH", "hangar", 750, 50, 370, 6, { reactor: 2 }),
        sys("pd", "CIWS", "CIWS", "pd", 220, 55, 110, 8, { reactor: 0 }),
        sys("buster", "Planet buster", "BUSTER", "buster", 9000, 45, 0, 18, { reactor: 2 }),
        sys("drive", "Warp drive", "DRIVE", "drive", 7200, 110, 0, 0, { reactor: 1 })
      ] }
  ];
  BL.classById = function (id) { return BL.CLASSES.filter(function (c) { return c.id === id; })[0]; };
  BL.classByN = function (n) { return BL.CLASSES[n - 1]; };

  /* Tech level: lower tech = smaller reactor, capacitors and chargers, weaker guns,
     and more reputation. Tech levels run 4 to 7: the gunboat is always tech level 4; every other
     class (they all carry a warp drive, which needs tech level 5) comes in 5, 6 or 7. The class
     numbers above are the gunboat's tech level 4 and the others' tech level 6. */
  BL.TECH = {
    // The tech levels a class comes in, and the usual one (tests and headless runs).
    levels: function (classId) { return classId === "gunboat" ? [4] : [5, 6, 7]; },
    base: function (classId) { return classId === "gunboat" ? 4 : 6; },
    clamp: function (classId, tl) { var L = BL.TECH.levels(classId); return Math.max(L[0], Math.min(L[L.length - 1], Math.round(+tl) || BL.TECH.base(classId))); },
    // Strength against the class numbers: the gunboat's one level is its numbers; TL5 0.9 (its reactor 0.95), TL6 1.0, TL7 1.1.
    factor: function (tl, classId) { return classId === "gunboat" ? 1 : 1 + 0.1 * (BL.TECH.clamp(classId, tl) - 6); },
    // The reactor's own output: as factor, except TL5's is 95% (Oct 24, 2026: its engines and life
    // support draw what a TL6 ship's do, and at 90% the engine room had too little to spare).
    reactor: function (tl, classId) { return BL.TECH.clamp(classId, tl) === 5 ? 0.95 : BL.TECH.factor(tl, classId); },
    forceStep: 0.15,         // enemy force x (1 + forceStep x (tl - 6)) for our tech level (Mission.force)
    repMult: function (tl) { return 1 + 0.25 * (7 - Math.max(4, Math.min(7, tl))); }   // TL4 x1.75 ... TL7 x1.0
  };

  // The gun crew shooting torpedoes down. At the gun and the helm the crew's guns shoot at the
  // torpedoes on screen (ring.js); in the engine room there's no screen, so each torpedo is shot
  // down with this chance x the share of the ship's guns charged for a shot, and it costs that gun
  // a shot. The shares are what the crew managed at the helm on every story mission (Oct 15, 2026),
  // so every station fights the same enemy with the same torpedoes.
  // The pilot dodging torpedoes. At the helm you fly the ship; at the other stations the pilot is a
  // crewman, and dodges this share of the torpedoes (what the pilot at the helm managed on each class
  // across the story missions; remeasured Oct 23, 2026 with the corridor (the pilot dodges inside his
  // 30 degrees, and the captain's breaks): small ships swing in time, big ones can't).
  BL.PILOT_DODGE = { gunboat: 0.62, picket: 0.37, destroyerEscort: 0.31, destroyer: 0.22, lightCruiser: 0.08,
    cruiser: 0.02, heavyCruiser: 0, battleship: 0, dreadnought: 0 };

  // The gun crew's hits on enemy ships in the engine room. There the guns aren't on screen, so each
  // gun's shot hits with GUN.hitChance x this share: what a crew aiming real guns lands (the gun crew
  // at the helm, every gun crewed; on the one-gun gunboat and picket, a crewman on the gun at the gun
  // station), set so the engine room's gun damage per gun matches it on the same ships and routes (Oct 23, 2026).
  // Before, the engine room's guns did 1.5 to 2.6 times what a real crew does (the one-gun ships were already even).
  BL.CREW_GUNS = { gunboat: 1, picket: 1, destroyerEscort: 0.66, destroyer: 0.7, lightCruiser: 0.72,
    cruiser: 0.75, heavyCruiser: 0.52, battleship: 0.44, dreadnought: 0.34 };
  // And by enemy and class: a crew on real guns has a harder time with some. Drive hunters sway and
  // dive, so a real crew kills them slower and more of their strikes come in: set so the share of
  // drive strikes that reach the drive in the engine room matches the gun and helm (Oct 23, 2026).
  BL.CREW_GUNS_VS = { hunters: { destroyerEscort: 0.21, destroyer: 0.15, lightCruiser: 0.22, cruiser: 0.15,
    heavyCruiser: 0.43, battleship: 0.33, dreadnought: 0.31 } };

  // Pilot training's buoy course (training.js). vStd: battle units a second at standard speed;
  // buoys `gapBase + gapPerSafe / safe turn rate` s apart at cruise (gapMin to gapMax), and at least
  // `lengths` ship lengths; each `clear` past the hull's side from the course line; the course bends
  // `bend` degrees a buoy; `ahead` buoys laid out; a pass wider than `wide` x that offset is a miss;
  // `lost` gaps away and opening for 3 s, the course is laid again ahead. ratings: share passed, name.
  BL.TRAINING = { vStd: 0.1, gapBase: 5, gapPerSafe: 80, gapMin: 6, gapMax: 22, lengths: 2, clear: 0.05, bend: [15, 40],
    ahead: 3, wide: 3, lost: 2.5, ratings: [[0.9, "Excellent"], [0.75, "Good"], [0.5, "Fair"], [0, "Needs work"]] };

  BL.CREW_DOWN = { gunboat: 0.38, picket: 0.33, destroyerEscort: 0.49, destroyer: 0.57, lightCruiser: 0.64,
    cruiser: 0.52, heavyCruiser: 0.55, battleship: 0.64, dreadnought: 0.61 };

  // A ship of class `classId` at tech level `tl`, ready for BL.Mission.
  // Our guns' Mk is the ship's class: each Mk up hits x1.2 as hard for x1.15 the charge per shot.
  // Gun capacitors grow with the charge per shot (same shots held); gun chargers don't.
  BL.MK = { dmg: function (n) { return Math.pow(1.2, n - 1); }, charge: function (n) { return Math.pow(1.15, n - 1); } };
  BL.shipFor = function (classId, tl) {
    var c = BL.classById(classId); tl = BL.TECH.clamp(c.id, tl); var f = BL.TECH.factor(tl, c.id), mkD = BL.MK.dmg(c.n), mkC = BL.MK.charge(c.n);
    function r(v) { return Math.round(v); }
    var reactors = (c.reactors || [{ name: "", mw: c.reactorMW, aux: c.aux }]).map(function (x) {
      return { name: x.name, mw: r(x.mw * BL.TECH.reactor(tl, c.id)), aux: { capacity: r(x.aux.capacity * f), rateMW: r(x.aux.rateMW * f) } };
    });
    return {
      classId: c.id, className: c.name, n: c.n, tl: tl, reactors: reactors,
      name: c.name, hull: r(c.hull * f), crew: c.crew, mk: c.n, mkDmg: mkD * f, mkCharge: mkC,
      reactorMW: reactors.reduce(function (a, x) { return a + x.mw; }, 0), engineMWperG: c.engineMWperG, cruiseG: c.cruiseG, maxG: c.maxG, gScale: c.gScale,
      aux: reactors[0].aux,
      hullPerMJ: c.hullPerMJ, mission: c.mission, encounters: c.encounters, gunnerEncounters: c.gunnerEncounters, gunnerFinal: c.gunnerFinal,
      mainGun: c.mainGun || null, torpedoes: c.torpedoes || 0,
      hangar: c.hangar ? Object.assign({}, c.hangar, { dps: c.hangar.dps * f }) : null,
      gun: { shotMJ: GUN.shotMJ * mkC, normalInterval: GUN.normalInterval, fullInterval: GUN.fullInterval, hitChance: GUN.hitChance, damage: GUN.damage * f * mkD },
      systems: c.systems.map(function (s) {
        var o = {}; for (var k in s) o[k] = s[k];
        if (s.kind !== "life") { o.maxMJ = r(s.maxMJ * f); o.maxMW = r(s.maxMW * f); o.startMJ = r(s.startMJ * f); }
        if (s.kind === "gun") { o.maxMJ = r(o.maxMJ * mkC); o.startMJ = r(o.startMJ * mkC); }
        return o;
      })
    };
  };

  /* ------------------------------------------------------- Power physics */
  BL.PHYSICS = {
    rampUpTau: 0.6,         // s; the charge controller eases toward the setting...
    rampUpSlew: 45,         // ...but never faster than this many MW per second
    rampDownTau: 0.25,
    windBackAt: 0.96,       // near full, the controller winds the charge back to a trickle
    heatUpPerPct: 0.5,      // heat points per second for each % of load above 100
    heatDownPerPct: 0.3,    // heat points per second shed for each % below 100...
    heatDownBase: 1.0,      // ...plus this
    tripSeconds: 10,        // a tripped capacitor stays off the reactor this long
    tripCooldown: 1.5,      // min seconds between failsafe trips (per reactor)
    switchSeconds: 2,       // a capacitor moved to another reactor draws nothing this long
    // Bleed: every capacitor loses this share of its stored charge each second, so holding a
    // capacitor full keeps costing reactor power. Life support already drains; the drive and
    // the planet buster store far more and leak far less.
    bleed: { other: 0.02, life: 0, drive: 0.0015, buster: 0.0004 },
    alarmHeat: 80           // heat alarm sounds above this
  };

  /* ------------------------------------------------------------ Mission */
  BL.MISSION = {
    arrivalSeconds: 8,                 // calm before the first wave of each jump
    jumpWindowNotice: 40,              // "Jump window in 40 s"
    jumpOnTimeGrace: 5,                // drive full within this many seconds of the window = on time
    jumpCountdown: 3,
    forecastSpan: 15,                  // seconds shown on the forecast strip
    breakOff: 60,                      // no new enemy waves this long after the jump window opens
    staggerGap: 3,                     // s between enemy groups that are due at the same time
    lookCostPct: 10                    // looking at the console while paused
  };

  /* ------------------------------------------- Enemy weapons (ratings model)
     The same at every station and on every ship we serve on. Three torpedo sizes, set by the ship
     that fires them: mj = damage, travel = s from launch to impact, warn = s of warning, down =
     how hard it is to shoot down (the crew's chance and the torpedo's size as a target, x).
     Guns: steady fire once a wave closes, mj per hit, rate = shots per second per ship, a hit
     chance of `hit`; only the shields stop it. Enemy tech level: an encounter's `tl` list (the
     interceptors are tech level 4; the rest 5 or 6, drawn per wave): toughness and damage x
     1 + 0.1 x (tl - 6), the tables being tech level 6 (the interceptors' their 4). */
  BL.TORPEDOES = {
    dart:    { name: "dart",        mj: 20,  travel: 1.8, warn: 4, down: 0.6 },
    torpedo: { name: "torpedo",     mj: 45,  travel: 2.6, warn: 6, down: 1 },
    killer:  { name: "ship killer", mj: 150, travel: 3.6, warn: 8, down: 1.4 }
  };
  BL.ENEMY_GUNS = { light: { mj: 4, rate: 0.7 }, heavy: { mj: 6, rate: 0.8 }, capital: { mj: 10, rate: 0.7 }, hit: 0.5, after: 4 };
  BL.enemyTlFactor = function (tl) { return tl === 4 ? 1 : 1 + 0.1 * (tl - 6); };
  // Force: how many enemy waves arrive together on each class (Mission.forceCount), set so the
  // story missions are an even fight for the AI crews (tuning, Oct 20, 2026). Minefields aren't
  // affected (no waves). Raised x1.2 on Oct 21, 2026, when groups due together began arriving
  // BL.MISSION.staggerGap apart instead of all at once (an even fight again).
  // Oct 23, 2026: set per class so the test gunner who plays like TexasBont (BL.GUNNERY.testGunner)
  // wins about half his story missions, after the engine room's guns and salvos were brought to
  // the same standard as the gun and the helm (BL.CREW_GUNS; part-destroyed waves fire less).
  // FORCE_ENC: an encounter's own force on a class, so each kind of fight is even, not just the
  // class's average (a minefield's force is how thick the field is: mines per second x force).
  // Oct 25, 2026 (TexasBont): the floor rule. Each class's forces are set so the station that wins
  // least there (AI crews: engineer, test gunner, test pilot on that station's story missions; the
  // pilot bot leaves out minefields, it doesn't steer round mines) wins about half; the other two
  // win more. As a weak station's own model improves, its class's enemies go back up.
  // Oct 27, 2026: the shields draw from every reactor; the engineer improved, so battleship x1.03 and
  // dreadnought x1.1 (TexasBont, after playing the battleship).
  BL.FORCE_ENC = {
    gunboat:         { raiders: 3.6, interceptors: 2.01, frigate: 1.27, minefield: 3.5 },   // interceptors a notch under the AI's even (TexasBont at the gun)
    picket:          { raiders: 3.39, interceptors: 2.29, frigate: 1.15 },
    destroyerEscort: { raiders: 4.37, interceptors: 3.9, frigate: 1.57, hunters: 0.5 },
    destroyer:       { interceptors: 5.04, siege: 5.2, frigate: 2.72, cruiserA: 1.7, hunters: 0.5 },
    lightCruiser:    { raiders: 8.72, siege: 7.3, frigate: 3.55, cruiserA: 2.3, hunters: 0.5 },
    cruiser:         { raiders: 12.7, interceptors: 9.01, frigate: 4.78, cruiserA: 3.63, hunters: 0.5 },
    heavyCruiser:    { interceptors: 10.81, frigate: 5.84, cruiserA: 4.51, battleshipA: 2.75 },
    battleship:      { siege: 12.77, frigate: 6.04, cruiserA: 4.7, battleshipA: 3.16 },
    dreadnought:     { siege: 15.13, frigate: 7.13, cruiserA: 5.64, battleshipA: 3.73 }
    // (drive hunters can't sink a ship, they drain its drive. They meet the destroyer escort and up,
    // which all carry a CIWS: on the destroyer escort to the cruiser a pack comes half the times one
    // is due; the class's force from the heavy cruiser up)
  };
  BL.FORCE = { gunboat: 2.39, picket: 2.41, destroyerEscort: 3.05, destroyer: 2.54, lightCruiser: 2.68, cruiser: 3.8, heavyCruiser: 4.77, battleship: 3.19, dreadnought: 4.06 };

  /* --------------------------------------------------------- Encounters
     Each encounter is a load pattern. Ranges [a, b] are rolled from the mission seed.
     wave.hp: the whole wave's toughness at enemy tech level 6 (ships x their toughness: raider 40,
     interceptor 12, drive hunter 30, siege battery 45, frigate 250, Azurian cruiser 450, Azurian
     battleship 800, fortress 2,500). torp: the size of its torpedoes (killerEvery: every Nth salvo
     is a ship killer). guns: [gun size, ships carrying it] (BL.ENEMY_GUNS). tl: its tech levels. */
  BL.ENCOUNTERS = {
    raiders: {
      name: "Raiders",
      enemy: "Raider pack",
      what: "Short, heavy salvos with long gaps",
      tests: "Shield timing",
      salvoWarning: 7,
      firstWave: [4, 6],
      waveEvery: [24, 32],
      wave: { hp: 120, salvos: [3, 4], approach: [6, 8], salvoGap: [2.5, 4], torp: "torpedo", requests: 2 },
      guns: [["light", 3]],
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [28, 40], g: [5, 6], duration: [3, 4], warning: 5 },
      surpriseChance: 0.08
    },
    siege: {
      name: "Siege line",
      enemy: "Siege battery",
      what: "Steady fire for the whole engagement",
      tests: "Sustained efficiency, heat control",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [38, 48],
      wave: { hp: 180, salvos: [4, 6], approach: [6, 7], salvoGap: [5, 8], torp: "torpedo", requests: 3 },
      guns: [["heavy", 4]],                 // the gun line: steady gunfire, torpedoes now and then
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [35, 50], g: [3, 4], duration: [3, 5], warning: 5 },
      surpriseChance: 0.05
    },
    interceptors: {
      name: "Interceptors",
      enemy: "Interceptor flight",
      what: "Fast ships; the pilot burns hard and often",
      tests: "Engine spikes vs. charging",
      salvoWarning: 5,
      firstWave: [3, 5],
      waveEvery: [15, 21],
      wave: { hp: 54, salvos: [4, 6], approach: [4, 6], salvoGap: [1.8, 2.8], torp: "dart", requests: 1 },
      guns: [["light", 4.5]], tl: [4],
      request: { lead: 3, duration: [5, 7] },
      burns: { every: [9, 14], g: [7, 9], duration: [4, 6], warning: 5 },
      surpriseChance: 0.1
    },
    // Pilot training (training.js): no enemies, no orders; the trainer lays the buoys.
    training: {
      name: "Training course", enemy: "buoy", what: "Buoys: keep red to port, green to starboard",
      firstWave: [1e9, 1e9], waveEvery: [1e9, 1e9], wave: {}, salvoWarning: 5, surpriseChance: 0,
      burns: { every: [1e9, 1e9], g: [1, 1], duration: [1, 1], warning: 5 }
    },
    // Destroyer escort and up. Hunters fire drive strikes: the CIWS (close-in weapon system) stops
    // most of them if it has the charge (mj = CIWS charge per strike; BL.GUNNERY.ring.ciws.kill);
    // the guns can shoot them down too. One that gets through drains `driveDrain` of the drive.
    hunters: {
      name: "Drive hunters",
      enemy: "Drive hunter",
      what: "They fire at the warp drive; the CIWS stops most of them",
      tests: "Priority order, shielding the drive",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [20, 28],
      wave: { hp: 90, salvos: [4, 6], approach: [5, 7], salvoGap: [2.5, 4], salvoMJ: [30, 45], requests: 2, strikes: true },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [20, 30], g: [4, 5], duration: [3, 5], warning: 5 },
      surpriseChance: 0.05, driveDrain: 0.15,
      breakOff: 0                      // hunters send no new waves once the jump window is open
    },
    // An Azurian frigate with two interceptor escorts: one big hull, torpedoes in pairs.
    frigate: {
      name: "Frigate group",
      enemy: "Azurian frigate",
      what: "A frigate and two escorts; torpedoes come in pairs every 6 to 8 s",
      tests: "Shield timing under steady pairs",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [70, 80],
      guns: [["heavy", 1], ["light", 2]],
      wave: { hp: 274, salvos: [8, 10], approach: [6, 8], salvoGap: [6, 8], torp: "torpedo", requests: 3, pairs: true,
              // each escort fires its own light torpedoes, like an interceptor flight's
              escortFire: { count: 2, salvos: [3, 4], start: [2, 4], gap: [4, 6], torp: "dart" } },
      // Light attack craft keep coming while the frigate fights: stragglers from another quadrant.
      stragglers: { first: [12, 16], every: [18, 26], types: ["interceptors", "interceptors", "interceptors", "raiders", "raiders"] },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [24, 34], g: [5, 6], duration: [3, 4], warning: 5 },
      surpriseChance: 0.05
    },
    // An Azurian cruiser (heavy cruiser, gunner station) with three interceptor escorts: a bigger hull
    // than the frigate's, heavier torpedoes in pairs, and stragglers joining the fight.
    cruiserA: {
      name: "Cruiser group",
      enemy: "Azurian cruiser",
      what: "A cruiser and three escorts; heavy torpedoes come in pairs every 5 to 7 s",
      tests: "Shield timing under heavy pairs",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [80, 90],
      guns: [["capital", 1], ["light", 3]],
      wave: { hp: 486, salvos: [10, 12], approach: [6, 8], salvoGap: [5, 7], torp: "torpedo", killerEvery: 3, requests: 3, pairs: true,
              escortFire: { count: 3, salvos: [3, 4], start: [2, 4], gap: [4, 6], torp: "dart" } },
      stragglers: { first: [14, 18], every: [20, 28], types: ["interceptors", "interceptors", "raiders", "raiders"] },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [24, 34], g: [5, 6], duration: [3, 4], warning: 5 },
      surpriseChance: 0.05
    },
    // An Azurian battleship (battleship and dreadnought, gunner station) screened by three
    // raiders: the biggest hull yet, torpedoes in volleys of three (a broadside), and stragglers,
    // drive hunters among them. volley = torpedoes per salvo call, 0.6 s apart.
    battleshipA: {
      name: "Battleship group",
      enemy: "Azurian battleship",
      what: "A battleship and three raiders; its torpedoes come in threes every 6 to 8 s",
      tests: "Shield timing under broadsides",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [100, 115],
      guns: [["capital", 1], ["light", 3]],
      wave: { hp: 920, salvos: [10, 12], approach: [6, 8], salvoGap: [6, 8], torp: "killer", requests: 3, volley: 3,
              escortFire: { count: 3, salvos: [2, 3], start: [3, 5], gap: [6, 8], torp: "torpedo" } },
      stragglers: { first: [16, 20], every: [22, 30], types: ["interceptors", "interceptors", "raiders", "hunters"] },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [26, 36], g: [4, 5], duration: [3, 4], warning: 5 },
      surpriseChance: 0.05
    },
    // The fortress guarding the Azurian homeworld: the final system of every dreadnought
    // mission at the gun. It never moves and never gives up; its torpedoes (volleys of three)
    // keep coming for the whole fight unless it is destroyed. Four interceptor escorts, stragglers.
    fortress: {
      name: "Homeworld fortress",
      enemy: "Azurian fortress",
      what: "The fortress guarding the Azurian world and four escorts; its torpedoes come in threes every 6 to 8 s for the whole fight",
      tests: "Holding out until the planet buster is away",
      chat: "fortressIn",              // its own arrival call instead of the usual "expect ..."
      salvoWarning: 6,
      firstWave: [2, 3],
      waveEvery: [999, 999],
      guns: [["capital", 1], ["light", 4]],
      wave: { hp: 2548, salvos: [34, 38], approach: [8, 10], salvoGap: [6, 8], torp: "killer", requests: 3, volley: 3,
              escortFire: { count: 4, salvos: [3, 4], start: [2, 4], gap: [4, 6], torp: "dart" } },
      stragglers: { first: [18, 24], every: [20, 28], types: ["interceptors", "interceptors", "raiders", "hunters"] },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [26, 36], g: [3, 4], duration: [3, 4], warning: 5 },
      surpriseChance: 0.05
    },
    // Gunboats only, the helm and turret tests for now: sweep a lane through a minefield so the
    // fleet behind can get through. No enemy ships. The mines sit still and stream past as the boat
    // moves (at the gun the coxswain holds her at standard): `flow` fields/s at standard, one every
    // `every` s, scattered `spread` x the shield's half-width either side of her track; one that
    // touches the shield hits for mj x the class's threat dmg. Scored by the share of the lane's
    // mines destroyed.
    sweep: {
      name: "Mine lane",
      enemy: "mines",
      what: "Clear the lane so the fleet behind can get through: shoot as many mines as you can, and don't hit any",
      tests: "Clearing mines",
      firstWave: [0, 0], waveEvery: [999, 999],
      burns: { every: [999, 999], g: [1, 1], duration: [1, 1], warning: 5 },   // none: no burns, no course orders
      sweep: { every: [1.3, 2.0], flow: 0.1, spread: 5, maxFlow: 1.5, mj: [90, 90] },
      surpriseChance: 0
    },
    // No enemy fire. The pilot weaves through the field with long burns, and the engines get
    // only what the capacitors leave of the reactor. Short of power = drifting = mine strikes.
    minefield: {
      name: "Minefield",
      enemy: "drifting mine",
      what: "No enemy fire; the helm weaves with long burns, and the engines get only the power you leave them",
      tests: "Keeping engines fed",
      firstWave: [0, 0], waveEvery: [999, 999],
      burns: { every: [7, 11], g: [6, 8], duration: [6, 9], warning: 6 },
      mines: { strikePerSec: 0.5, mj: [90, 90], engineMult: 2,     // one mine size at every station (90 MJ)     // weaving takes twice the engine power
               // At the gun and the helm the mines are seen, sitting still in the ship's path (helm
               // below, at standard at the gun); mj: each mine's charge. No random strikes there.
               gunner: { mj: [90, 90] },
               // At the helm the mines sit still and the ship moves through them: a steering test
               // (the captain gives no course orders here). At standard they stream past at `flow`
               // fields/s, one every `every` s, scattered `spread` x the shield's half-width either
               // side of the ship's track (so every class meets about the same share), each mj x the
               // gunner station's; faster and more often at higher thrust, up to `maxFlow` x
               // standard; none while stopped. Big ships move slower: the flow (and so how often
               // mines come) is divided by 1 + `lagSlow` x the class's helm lag, giving a slow
               // turner time to steer clear. Small and hard for the gun crew: a crew bolt that
               // reaches one destroys it only with `crewHit` x 3 / the number of guns (so a big
               // battery doesn't do the steering), else a near miss.
               helm: { every: [3.2, 4.6], flow: 0.12, spread: 2.6, maxFlow: 1, mj: 1, lagSlow: 2, crewHit: 0.12 } },
      windowScale: 0.7,                // the captain wants out: the jump window comes sooner
      surpriseChance: 0
    }
  };

  /* ------------------------------------------------------ Gunner station
     The gunner aims one battery and fires straight up; every bolt hits whatever ship or
     torpedo it reaches first (no dice). The turret's view is a square field 1 wide and 1 tall,
     0 at the top. speed and reach are in fields per second and fields; interval = seconds
     between shots while FIRE is held; best = encounters it does `bonus` times damage against. */
  BL.WEAPONS = {
    // long (ring view): past its reach (the dotted line) a bolt flies on another `extra`, hitting
    // for `at` of its damage just past the line, fading to `end` (a torpedo: that chance to kill it).
    pulse: { name: "Pulse cannon", short: "PULSE", shotMJ: 4, interval: 0.25, damage: 3, speed: 1.7, reach: 0.7, best: ["interceptors"],
             long: { at: 0.35, end: 0.1, extra: 0.6 },
             what: "Short effective range (the dotted line), fast fire, light hits. Past the line its bolts fly on but hit far weaker. Best against interceptors." },
    rail:  { name: "Rail gun", short: "RAIL", shotMJ: 18, interval: 1.0, damage: 15, speed: 6, reach: 1.0, best: ["raiders", "siege", "frigate", "cruiserA", "carrier", "battleshipA", "fortress"],
             what: "Long reach, slow fire, heavy hits. Best against raiders, siege lines and capital ships." },
    ion:   { name: "Ion gun", short: "ION", shotMJ: 7, interval: 0.5, damage: 3, speed: 1.1, reach: 0.85, best: ["hunters"],
             ion: { seconds: 4, salvoMult: 0.5, delay: 1.5 },
             what: "Medium reach, light hits. A hit drains the target's weapons for 4 s: its torpedoes launch late and hit half as hard. Best against drive hunters." }
  };
  BL.GUNNERY = {
    bonus: 1.5,                        // damage multiplier against a weapon's best targets
    turretY: 0.93,                     // where the turret sits; bolts start here
    // Our shield dome: an ellipse over the bow, high enough that about half of each turret's
    // barrels stick out of it. Torpedoes strike its surface.
    shield: { cx: 0.5, cy: 1.035, rx: 0.64, ry: 0.13 },
    traverse: 1.3,                     // fields per second the turret slides
    torpedo: { travel: 2.6, size: 0.022 },   // seconds from launch to impact; hit box half-size
    call: { seconds: 6, cooldown: 4 }, // CALL FOR POWER: rapid-fire request length, wait before the next
    // What each class's batteries carry at the gunner station, Gun 1 first. With two or more,
    // the player aims one and an AI gunner works the others; turrets share one rail and pass freely.
    loadout: { gunboat: ["pulse"], picket: ["rail"], destroyerEscort: ["pulse", "rail"], destroyer: ["rail", "pulse", "rail"],
               lightCruiser: ["rail", "rail", "pulse", "pulse"], cruiser: ["rail", "rail", "rail", "pulse", "pulse"],
               heavyCruiser: ["rail", "rail", "rail", "ion", "pulse", "pulse"],
               battleship: ["rail", "rail", "rail", "rail", "ion", "pulse", "pulse"],
               dreadnought: ["rail", "rail", "rail", "rail", "ion", "ion", "pulse", "pulse"] },
    // Ring view (every class): the ship in the center inside an oval shield (cx, cy, rx, ry);
    // guns ride its rim inside their arcs ([center bearing, half width], 0 = ahead, clockwise).
    // reach = how far a bolt flies from the rim; traverse = degrees per second along the rim;
    // enemies enter from radius `enter` and hold at their look's ringR; bearings = how often a
    // wave comes from each direction.
    ring: {
      cx: 0.5, cy: 0.5, rx: 0.16, ry: 0.27, shipH: 0.4, enter: 0.78, traverse: 140,
      reach: { pulse: 0.15, rail: 0.45, ion: 0.24 },
      bearings: { "0": 3, "45": 2, "-45": 2, "90": 2, "-90": 2, "135": 1, "-135": 1, "180": 1 },
      classes: {
        // arcs: [center, half width, starting bearing]. view: this class's sizes in the ring view
        // (shipH, the shield's rx and ry, gun icon size gunSize, and pull = how much closer than
        // their look's ringR the enemies hold, so the gap from the shield stays the same). The
        // defaults above are the biggest ships' (dreadnought); smaller classes draw smaller.
        gunboat:         { arcs: [[0, 180, 0]], arcNames: ["on its back"],
                           view: { shipH: 0.095, rx: 0.042, ry: 0.07, gunSize: 0.034, pull: 0.16 } },
        picket:          { arcs: [[0, 180, 0]], arcNames: ["on the bow"],
                           view: { shipH: 0.13, rx: 0.056, ry: 0.095, gunSize: 0.038, pull: 0.14 } },
        destroyerEscort: { arcs: [[0, 100, 0], [180, 100, 180]], arcNames: ["on the bow", "on the stern"],
                           view: { shipH: 0.165, rx: 0.07, ry: 0.12, gunSize: 0.042, pull: 0.12 } },
        destroyer: { arcs: [[0, 100, 0], [0, 180, 90], [180, 100, 180]], arcNames: ["on the bow", "amidships", "on the stern"],
                     view: { shipH: 0.2, rx: 0.085, ry: 0.145, gunSize: 0.045, pull: 0.1 } },
        // pilot (main gun ships): the AI pilot turns the ship up to `turn` degrees per second to
        // put the bow on the big target; that target slides away at `evade` degrees per second
        // while it's within `dodge` degrees of the bow.
        lightCruiser: { arcs: [[-90, 100, -90], [90, 100, 90], [0, 180, -150], [0, 180, 150]],
                        arcNames: ["to port", "to starboard", "aft, port side", "aft, starboard side"],
                        view: { shipH: 0.255, rx: 0.112, ry: 0.185, gunSize: 0.048, pull: 0.065 },
                        pilot: { turn: 10, evade: 5, dodge: 30 } },
        cruiser: { arcs: [[-90, 100, -90], [90, 100, 90], [0, 180, 0], [0, 180, -150], [0, 180, 150]],
                   arcNames: ["to port", "to starboard", "on the centerline", "aft, port side", "aft, starboard side"],
                   view: { shipH: 0.3, rx: 0.135, ry: 0.218, gunSize: 0.05, pull: 0.04 },
                   pilot: { turn: 8, evade: 5, dodge: 30 } },
        heavyCruiser: { arcs: [[-90, 100, -90], [90, 100, 90], [0, 180, 0], [0, 180, 180], [0, 180, -150], [0, 180, 150]],
                        arcNames: ["to port", "to starboard", "on the centerline", "on the centerline", "aft, port side", "aft, starboard side"],
                        view: { shipH: 0.335, rx: 0.15, ry: 0.243, gunSize: 0.052, pull: 0.02 },
                        pilot: { turn: 7, evade: 5, dodge: 30 } },
        battleship: { arcs: [[-90, 100, -90], [90, 100, 90], [0, 180, 0], [0, 180, 180], [0, 180, 120], [0, 180, -150], [0, 180, 150]],
                      arcNames: ["to port", "to starboard", "forward, on the centerline", "aft, on the centerline", "on the centerline", "aft, port side", "aft, starboard side"],
                      view: { shipH: 0.368, rx: 0.155, ry: 0.256, gunSize: 0.056, pull: 0.01 },
                      pilot: { turn: 6, evade: 4, dodge: 30 } },
        // (the pilot must turn faster than the target slides, or the bow never catches it)
        dreadnought: { arcs: [[-90, 100, -90], [90, 100, 90], [0, 180, 0], [0, 180, 180], [0, 180, -120], [0, 180, 120], [0, 180, -155], [0, 180, 155]],
                       arcNames: ["to port", "to starboard", "forward, on the centerline", "aft, on the centerline", "port side", "starboard side", "aft, port side", "aft, starboard side"],
                       view: { shipH: 0.4, rx: 0.16, ry: 0.27, gunSize: 0.06, pull: 0 },
                       pilot: { turn: 5, evade: 3, dodge: 30 } }
      },
      // CIWS (destroyer escort and up): mounts on the hull fire on a drive strike by themselves
      // `engage` s before it lands, if the CIWS capacitor holds that strike's charge; the burst
      // lasts `burst` s and kills it with chance `kill` (now and then one gets through anyway). mounts: [x, y] as shares of the ship's drawn width and height from its center.
      ciws: { engage: 0.8, burst: 0.4, kill: 0.85, mounts: [[-0.3, 0.3], [0.3, 0.3], [-0.32, -0.1], [0.32, -0.1]] },
      // The gunboat squadron (cruiser and up) as the gunner sees it: n gunboats fly at `speed`,
      // circle their target at `orbit` (spin radians/s) strafing it, and every `tick` s shoot at
      // a torpedo within `look` (kill = the chance it goes down). Their strafing adds up to the
      // class's hangar dps.
      wing: { n: 4, speed: 0.32, orbit: 0.075, spin: 1.4, size: 0.042, look: 0.1, tick: 0.4, kill: 0.35
      }
    },
    aiGunner: 0.75,                    // skill of the machine gunner (rail view)
    // The test gunner on the ring (balance runs): it plays the gun it holds like TexasBont, not a
    // machine. On his own missions (Oct 23, 2026: 62-83% hits, 809 damage and 56 kills in his first
    // 2.3 minutes on seed 320939) he matched a raw crewman (skill) with his eyes on the gun `duty`
    // of each `period` seconds. The machine took no damage there; this one dies where he did.
    testGunner: { skill: 0.25, duty: 0.55, period: 5 },
    // The gun crew ("man, not machine"): every gun but yours has a gunner, a fresh crew each
    // mission, skill rolled from `skill`. Skill runs from green (first value of each pair) to
    // sharp (second): react = seconds to take in the fight and pick a target; notice = how long a
    // torpedo flies before they spot it (x react); aimErr = degrees their aim is off, rerolled
    // now and then (they don't lead a moving target either); loose = how roughly on target they
    // open fire (x the target's size); wrong = the chance a pick goes after the wrong target;
    // settle = seconds on one target to walk their fire in (the aim error shrinks, so slow or
    // holding targets get hit); pace = how much slower than the gun's best rate they fire;
    // strain = how much worse all of it gets once the hull is under half or the crew is crippled.
    crew: { skill: [0.25, 0.85], react: [1.6, 0.6], notice: 1.5, aimErr: [16, 5], loose: [2.5, 1.3], wrong: [0.5, 0.1], settle: 2.5, pace: [1.8, 1.2], strain: 1.2,
            ranks: ["Gunner's Mate", "Petty Officer", "Chief"] },
    // Standing orders for the gun crew, one per gun. Each fight one of them is suggested: hunt if
    // the gun's weapon is best against the enemy, else point defense against torpedoes. A gun whose
    // order was never picked ("auto") follows the suggestion. key = its letter in the menu.
    orders: {
      auto:   { name: "Follow the suggestion each fight", short: "SUGGESTED", ack: "following the suggested orders, aye!" },
      defend: { name: "Point defense", short: "POINT DEFENSE", key: "P", what: "Shoots torpedoes about to land first, then ships charging to fire.", ack: "point defense, aye!" },
      stop:   { name: "Stop launches", short: "STOP LAUNCHES", key: "L", what: "Shoots ships charging to fire first, then torpedoes.", ack: "going after the launchers!" },
      hunt:   { name: "Hunt", short: "HUNT", key: "H", what: "Shoots the ships its weapon is best against; torpedoes only at the last second.", ack: "hunting, aye!" },
      free:   { name: "Free fire", short: "FREE FIRE", key: "F", what: "Picks its own targets: torpedoes about to land, else the nearest ship.", ack: "free fire, aye!" }
    },
    orderList: ["defend", "stop", "hunt", "free"],
    // Our torpedoes (gunboats carry two; the carrier reloads them every sortie). No energy.
    // Slow and homing on the nearest siege battery or capital ship; damage x the class's threat
    // hp. A target sidesteps (jink, fields/s) when one gets within jinkAt, and its point defense
    // has pd chance per second to kill one within pdRange.
    pt: { speed: 0.3, turn: 60, damage: 110, size: 0.018, jinkAt: 0.3, jinkSeconds: 1.2,
          jink: { frigate: 0.18, cruiserA: 0.12, carrier: 0.08, battleshipA: 0.04, fortress: 0, siege: 0.03 },
          pdRange: 0.35, pd: { frigate: 0.3, cruiserA: 0.4, carrier: 0.35, battleshipA: 0.55, fortress: 0.7, siege: 0.15 } },
    // Guns sit outside the shields. When a hit damages a gun's charger it damages its turret too,
    // taking turns: slower slide, slower fire, shorter range (share lost per hit, up to `max`).
    damage: { order: ["slide", "rate", "reach"], loss: { slide: 0.2, rate: 0.15, reach: 0.12 }, max: 0.6 },
    // The AI engineer at the gunner station: skill rolled per mission (1 = the old perfect AI).
    // Gunboats draw from the better end: they are the easy first job.
    engineer: { skill: { gunboat: [0.6, 0.95], other: [0.3, 0.95] },
      ranks: ["Engineer's Mate", "Petty Officer", "Chief"],
      first: ["Dana", "Ike", "Mara", "Theo", "Priya", "Sol", "Wren", "Kofi", "Lena", "Rafe", "Juno", "Tam", "Ines", "Bo", "Nadia", "Cass"],
      last: ["Reyes", "Okafor", "Lindqvist", "Brandt", "Kowalski", "Haddad", "Moreau", "Tanaka", "Byrne", "Novak", "Silva", "Petrov", "Achebe", "Quinn", "Varga", "Holt"] },
    // How each encounter's enemies look and fly. count = ships per wave (the wave's toughness is
    // split between them); band = the height they hold; sway = side-to-side swing; dive = how far
    // they swoop down now and then.
    looks: {
      raiders:      { ship: "raider", ringR: [0.38, 0.44], count: [3, 3], w: 0.11, h: 0.072, band: [0.13, 0.28], sway: 0.14, period: [6, 8], dive: 0.14, formation: true,
                      what: "big, slow and tough; they hang back and swoop into range now and then" },
      interceptors: { ship: "interceptor", ringR: [0.33, 0.4], count: [4, 5], w: 0.06, h: 0.066, band: [0.2, 0.45], sway: 0.28, period: [2.4, 3.4], dive: 0.22,
                      what: "small, fast and fragile; they weave and dive, and launch torpedoes often" },
      siege:        { ship: "siege battery", ringR: [0.43, 0.47], count: [4, 4], w: 0.09, h: 0.075, band: [0.1, 0.2], sway: 0.04, period: [9, 12], dive: 0, formation: true,
                      what: "a slow line that holds far out and never stops firing" },
      // Azurian capital ships: one big hull (the wave's toughness minus the escorts' share).
      frigate:      { ship: "frigate", ringR: [0.42, 0.46], capital: true, count: [1, 1], w: 0.13, h: 0.25, band: [0.15, 0.2], sway: 0.1, period: [10, 12], dive: 0,
                      escorts: { type: "interceptors", count: 2, share: 0.088 },
                      what: "one big hull escorted by two interceptors; it holds far out and fires torpedoes in pairs" },
      cruiserA:     { ship: "Azurian cruiser", ringR: [0.44, 0.48], capital: true, count: [1, 1], w: 0.2, h: 0.23, band: [0.15, 0.2], sway: 0.08, period: [11, 13], dive: 0,
                      escorts: { type: "interceptors", count: 3, share: 0.074 },
                      what: "one heavy hull escorted by three interceptors; it holds far out and fires heavy torpedoes in pairs" },
      battleshipA:  { ship: "Azurian battleship", ringR: [0.54, 0.58], capital: true, count: [1, 1], w: 0.24, h: 0.29, band: [0.15, 0.2], sway: 0.06, period: [12, 14], dive: 0,
                      escorts: { type: "raiders", count: 3, share: 0.13 },
                      what: "the biggest hull yet, screened by three raiders; it holds far out and fires torpedoes in threes" },
      // still: it never moves (no sway, no sliding away from the bow); bearing: always comes from dead ahead;
      // only: there is just the one.
      fortress:     { ship: "Azurian fortress", ringR: [0.53, 0.57], capital: true, still: true, bearing: 0, count: [1, 1], w: 0.3, h: 0.3, band: [0.12, 0.16], sway: 0, period: [12, 14], dive: 0,
                      escorts: { type: "interceptors", count: 4, share: 0.019 },
                      only: true,
                      what: "fixed dead ahead, guarding the Azurian world with four interceptors; it fires torpedoes in threes for the whole fight" },
      hunters:      { ship: "drive hunter", ringR: [0.35, 0.42], count: [3, 3], w: 0.065, h: 0.07, band: [0.18, 0.4], sway: 0.24, period: [3, 4], dive: 0.12,
                      what: "nimble ships that fire missiles at the warp drive" }
    }
  };

  /* --------------------------------------------------------------- Helm
     The pilot station (helm.js). Per class: top = fastest turn with the wheel hard over (deg/s),
     safe = above this the hull takes stress, build = how fast the turn grows toward what the
     wheel asks and dies away when it's centered (deg/s^2), lag = seconds before the rudder and
     the engines answer. Proposed numbers, for the joint tuning pass. */
  BL.HELM = {
    classes: {
      gunboat:         { top: 90, safe: 90,  build: 240, lag: 0.1 },
      picket:          { top: 50, safe: 40,  build: 80,  lag: 0.2 },
      destroyerEscort: { top: 36, safe: 28,  build: 40,  lag: 0.3 },
      destroyer:       { top: 26, safe: 20,  build: 20,  lag: 0.45 },
      lightCruiser:    { top: 18, safe: 13,  build: 9,   lag: 0.6 },
      cruiser:         { top: 15, safe: 11,  build: 6,   lag: 0.7 },
      heavyCruiser:    { top: 12, safe: 9,   build: 4,   lag: 0.85 },
      battleship:      { top: 10, safe: 7,   build: 2.5, lag: 1.0 },
      dreadnought:     { top: 8,  safe: 5.5, build: 1.6, lag: 1.2 }
    },
    // Engine orders, each a share of the class's top G (full). Each engine takes its own order;
    // a G order ("all ahead 2 G") sets an exact thrust in whole G.
    orders: [
      { id: "fullAstern", name: "Full astern",      short: "FULL AST", f: -0.5 },
      { id: "halfAstern", name: "Half astern",      short: "HALF AST", f: -0.25 },
      { id: "slowAstern", name: "Slow astern",      short: "SLOW AST", say: "Dead slow astern", f: -0.1 },
      { id: "stop",       name: "Stop",             short: "STOP",     f: 0 },
      { id: "deadSlow",   name: "Slow",             short: "SLOW", say: "Dead slow", f: 0.1 },     // (say: the words spoken in an order; shown as Slow)
      { id: "cruise",     name: "Cruise",           short: "CRUISE",   f: 0.25 },
      { id: "standard",   name: "Standard",         short: "STANDARD", f: 0.5 },
      { id: "full",       name: "Full",             short: "FULL",     f: 1 },
      { id: "flank",      name: "Flank",            short: "FLANK",    f: 1.1 }
    ],
    split: 0.625,          // engines giving different thrust add up to this share of the top turn (see yaw below)
    engineTau: 0.5,        // engines spool toward their order (s), plus engineLagTau x the class's lag
    engineLagTau: 1.5,
    speedTau: 2,           // the ship eases to the speed its engines order (s)
    stress: { fill: 0.6, drain: 1 / 6, hullShare: 0.05, thrusterChance: 0.3, warnAt: 0.6, after: 0.25 },
    flank: { warnAt: 15, safe: 20, damagePerSec: 0.05 },
    // Engine damage at the helm (Oct 24, 2026, TexasBont): a thruster hit takes `engineHit` of one
    // engine's thrust (port or starboard, 50/50; never under `engineMin`), so at any speed the
    // strong engine pushes the bow toward the weak side. Engines give (port - starboard) G x `yaw`
    // of the safe turn rate (up to `split` of the top rate), so the pilot trims them (`trim` G a step)
    // to stop the drift. (At the other stations a hit still costs 1 G of top speed and turn rate.)
    engineHit: 0.15, engineMin: 0.4, yaw: 0.5, trim: 0.25,
    turnLoss: 0.15,        // a thruster hit costs this share of the top turn rate (up to 60%)
    // captain's orders: tolerance, share held, spacing; the first `grace` s after an order starts
    // don't count (judged on `held` of the rest); one given on the spot (a gunner's call, the main
    // gun, the jump heading) comes with `warn` s notice (time to hear it) plus time to swing, held `callHold` s
    // The corridor (Oct 23, 2026, TexasBont): the captain's course stands between orders, and the
    // pilot may swing `width` degrees either side of it (to dodge); from `jumpLead` s before the
    // jump window, once the drive holds `drive` of its charge (Oct 24, 2026), he says "Steady as she goes" and the corridor narrows to `jump` degrees on the
    // jump heading. Out of it, the captain says so (at most every `say` s); outside a course order
    // that's disobeying. While turning onto a new order, mid-break or in a minefield there's none.
    corridor: { width: 30, jump: 5, jumpLead: 10, drive: 0.95, say: 6, rejoin: 10 },   // rejoin: s after a break to come back inside
    order: { heading: 10, held: 0.7, minGap: 12, turn: [30, 100], warn: 6, grace: 2, callHold: 6, verdict: 3 },   // verdict: s the result shows on the panel
    autopilotRep: 0.75,    // autopilot time earns this share of the helm's reputation
    launch: { nagAfter: 8, autoAfter: 20, clear: 2.5, setIn: 5 },     // the gunboat in the carrier's tube; setIn: s to set the coxswain's standard
    ptBow: 20,             // the gunner launches torpedoes once a target is this close to the bow (deg)
    // Dodging (only when the captain orders a break): a torpedo misses if the bow ends `turn`
    // degrees off a steady turn when it arrives.
    dodge: { turn: 15 },
    // The captain's order on each burst (torpedoes launched within `burst` s): break if the
    // shields hold less than `cover` x what's in the air, else with `chance`, else steady; a later
    // break once the shields can't take the fish he said to take (only with `lateMin` s or more
    // left on them); never two breaks within `gap` s. A break covers its fish for the flight time
    // after it's heard (`orderTime` s to speak it).
    evade: { cover: 1.2, chance: 0.5, burst: 1.2, gap: 6, orderTime: 1, lateMin: 0.8, steadyLapse: 6, disobeyCost: 0.05, settle: 2.5 },     // gap: seconds between breaks
    // A gunner tells the captain their arc is empty after `idle` s; `cooldown` before that gun calls again.
    request: { idle: 4, cooldown: 15 },
    warnCooldown: 6,       // seconds between warnings to engineering
    // Chatter not heard at the helm (no voice, no log line): the crew's running commentary. The
    // pilot hears only orders, break and steady orders, gunners' turn requests, launch control,
    // jump calls, warnings and damage, so an order is never stuck behind other talk.
    quiet: ["salvo", "waveIn", "withdrew", "straggler", "surprise", "shielded", "dodged", "intercepted", "pdStopped",
            "torpDown", "chargeStopped", "killed", "killedOther", "request", "requestDry",
            "ptAway", "ptHit", "ptMiss", "ptDowned", "helmMet", "shipKill", "mineDown", "mainShotHit", "mainShotKill", "mainShotMiss", "mainFired", "mainKill",
            // the engineer's business on the big ships: the squadron's launchers and arresters, drive strikes, power
            "launchCall", "launchMissed", "launched", "recoverCall", "recovered2", "recoverLate", "strike",
            "auxEmpty", "auxEmptyR", "heat", "heatR", "trip", "reclose"]
  };

  /* ----------------------------------------------------------- Command
     The captain's bridge (command.js; approved Oct 28, 2026). Each system's map from the seed:
     the jump point lies as far as cruise covers in `reach` of the time to the window (scale: map
     units per second at 1 G), up to `jumpOff` degrees off the arrival heading; the jump zone's
     radius, asteroid fields and enemy clusters (counts, radius) are shares of that distance; the
     navigator keeps `margin` clear of them. legs: what a plot may have; maxTurn: the sharpest
     turn at a waypoint; early: s a plot must reach the jump point before the window; capture:
     how close counts as passing a waypoint; dogleg: the navigator's sidestep to make a third leg;
     lookahead: how far ahead on the leg the NPC pilot steers for.
     A plot may cross an asteroid field (with a warning); inside one the rocks come at her like a
     minefield's mines (rockField), and at the enemy ships around her too.
     Navigation scores full marks in the zone by the window + zoneGrace s. An ordered jump allows
     zoneHold x the zone's radius (the ship coasting to a stop). */
  BL.COMMAND = {
    scale: 1, reach: 0.9, driveTau: 5, jumpOff: [0, 50], zone: 0.08,
    // Asteroid fields and enemy areas: each overlapping lobes (rockR / clusterR) along a bent line,
    // oblong and lumpy, placed `along` of the way to the jump point and up to `side` off that line,
    // a lane (lane x margin) apart. blockers of them sit across the straight way to the jump.
    rocks: [6, 9], rockR: [0.028, 0.062], rockLobes: [3, 6], clusters: [3, 5], clusterR: [0.03, 0.058], clusterLobes: [2, 5],
    along: [0.08, 0.92], side: [0, 0.5], blockers: [1, 2], lane: 2.1, margin: 0.07,
    // The jump heading: set by the program, up to jumpTurn off the line from the start; the plot's
    // last leg must be within jumpTol of it, and the approach lane (approach x the distance, back
    // from the jump point) is kept clear.
    jumpTurn: 60, jumpTol: 10, approach: 0.3,
    legs: [1, 8], legCost: 0.04, maxTurn: 100, early: 12, capture: 0.05, dogleg: 0.08, lookahead: 0.1,
    zoneGrace: 5, zoneHold: 1.5,
    // Rocks and mines on the bridge have their places in their fields on the map (Captain.fieldObjs,
    // ring.js mapFields). The battle view's scale: at standard the map streams past at `flow` view
    // units/s (divided by 1 + lagSlow x the class's helm lag, as at the helm). An asteroid field is
    // as thick as one rock per `every` s at standard across `spread` x the shield's half-width
    // either side of her track. One that touches the shield hits like a mine (mj); the gunners
    // shoot the ones on a collision course (a crew bolt breaks one with crewHit x 3 / the number of
    // guns); the pilot steers round rocks and mines, `dodge` degrees off the course, from `look` s
    // out. They show within `near` view units of her. An enemy ship a rock touches takes `enemy`
    // damage, a mine mineEnemy.
    rockField: { every: [2.2, 3.2], flow: 0.12, spread: 2.6, lagSlow: 2, mj: [90, 90], crewHit: 0.12, enemy: 15, dodge: 25, look: 4, near: 1.0 },
    mineEnemy: 25,
    // A mine scenario (the minefield, the gunboat's mine lane): one big minefield over most of the
    // way, `lobes` lobes of radius `r` (x the map's size) scattered `along` of the line to the jump
    // point and up to `wide` either side of it. Its mines are as thick as the encounter's own
    // (enc.sweep or enc.mines.helm x its force) x `thick` (the NPC pilot steers round them well). A
    // plot crosses it with a warning; nothing goes round it.
    minefield: { r: [0.13, 0.2], lobes: [9, 12], along: [0.22, 0.78], wide: 0.32, thick: 1 },
    // A burst with no call from the captain that the shields can't take: the pilot breaks on his
    // own this share of the time (decided once per burst).
    pilotOwn: 0.5,
    // Escort missions (bridge test; command.js Escort): the ward sails the plotted course to the
    // jump point in `arrive` of the time to the window; our station is `station` x the map's size
    // off her (sides: ahead, port, starboard, astern), on it within `near`; the pilot aims `lead` s
    // ahead of it. In the battle view she sits where she is from us (at Captain.kView). `share` of
    // the enemy's torpedoes go at her; each that lands costs its ship mj x perMJ of its hull. COVER
    // works within `cover` view units of her, the torpedoes landing in `coverTime` s or later.
    // The squadron is `squad` ships, ours included; a wingman shoots down `wingStop` of the
    // torpedoes at her from his side, and `wingRisk` of those he takes mj x wingPerMJ of his hull.
    // Each enemy group picks its target as it arrives: the ward `aimWard` of the time, else one of
    // the squadron's ships alike (us too); it forms up round it and fires only at it. A wingman
    // shoots down `wingSelf` of the torpedoes at himself; gunfire hits the ward at gunWard x its mj, a wingman at gunWing x.
    // The ward steers for a point wardLead x the map's size ahead on her course, turning on a
    // circle of wardRadius x the map's size; wingmen fly to their stations at full, turning wingTurn degrees a second.
    // The ward (kinds): a gunboat squadron's carrier; a destroyer escort squadron's convoy of
    // merchants (`ships`, two abreast, at least `gap` apart) or capital ship, rolled per mission. In
    // the battle view each of her ships is `size` x our ship's length, `width` x as wide; a station
    // keeps `clear` view units between our shield and her.
    escort: { arrive: 0.9, station: 0.06, near: 0.025, lead: 3, sides: { ahead: 0, port: -90, stbd: 90, astern: 180 },
              cover: 0.55, coverTime: 0.8, squad: [2, 4], wingStop: 0.5, wingRisk: 0.2, wingPerMJ: 0.1, wingHull: 100,
              aimWard: 0.5, wingSelf: 0.5, gunWard: 0.3, gunWing: 0.3, wardLead: 0.04, wardRadius: 0.025, wingTurn: 60,
              kinds: { carrier: { name: "carrier", label: "CARRIER", ships: [1, 1], hull: 100, perMJ: 0.03, size: 1.8, width: 0.29 },
                       capital: { name: "capital ship", label: "CAPITAL SHIP", ships: [1, 1], hull: 100, perMJ: 0.03, size: 1.8, width: 0.26 },
                       convoy: { name: "convoy", label: "CONVOY", ships: [3, 5], hull: 100, perMJ: 0.08, gap: 0.015, station: 0.075, size: 0.9, width: 0.42 } }, clear: 0.08 },
    // A picket's scouting run (the captain's path): `n` checkpoints of radius `r` (x the map's size)
    // to fly through in order, spread over `along` of the way to the jump point and `side` off it.
    // The navigator's plot keeps `slack` s in hand for each one.
    checkpoints: { classes: ["picket"], n: [2, 4], r: 0.06, along: [0.15, 0.8], side: [0.08, 0.22], slack: 8 },
    // Light cruiser and up: MAIN GUN swings the bow onto the biggest ship until the crew fires (at
    // most `timeout` s), then she comes back to the plot; the crew fires it only on that order. Cruiser and up: LAUNCH / RECOVER call the
    // squadron in `lead` s (the window `launch` or `recover` s); with no order the flight deck
    // launches and recovers on its own schedule, and once the captain has recovered it early it stays aboard until he launches.
    mainSwing: { timeout: 25, botSwing: 60 },      // (botSwing: the test bot swings only for a target that far off the bow)
    hangarOrder: { lead: 5, launch: 10, recover: 12 },
    // Standing orders at the start of a mission (the captain changes them on the bridge).
    standing: { guns: "auto", stance: "balanced" },
    // (drive first: after life support the drive charges to be full by the window, the rest share what's left)
    stances: { shields: { name: "Shields first", short: "SHIELDS" }, balanced: { name: "Balanced", short: "BALANCED" }, guns: { name: "Guns first", short: "GUNS" },
      drive: { name: "Drive first", short: "DRIVE" }, main: { name: "Main gun first", short: "MAIN GUN" } },
    stanceList: ["shields", "balanced", "guns", "main", "drive"],      // (main: light cruiser and up; drive: ships with a warp drive)
    // The gunners' order buttons on the bridge: what the guns go after (BL.GUNNERY.orders underneath).
    gunShort: { auto: "SUGG", defend: "TORP", stop: "LAUNCH", hunt: "HUNT", free: "FREE" }
  };

  /* ------------------------------------------------------------ Chatter
     Several lines per event; {placeholders} are filled in by the simulation. Only the captain
     gives orders or chases a station; Bridge only announces (jump in 5, out of warp space). */
  BL.CHATTER = {
    launch:      ["Coxswain: launch! We're clear of the carrier.", "Carrier: gunboat away. Good hunting.", "Coxswain: off the deck and into it."],
    recoveryNotice: ["Carrier: recovery in {t} s. Hold on out there.", "Coxswain: carrier picks us up in {t} seconds."],
    recovered:   ["Carrier: gunboat recovered. Well flown.", "Coxswain: we're on the deck. Nice work, Engineering."],
    arrival:     ["Bridge: dropping out of warp space. Drive is empty.", "Captain: we're out of warp space. Start charging the drive, Engineering.", "Helm: normal space. Drive reads empty."],
    briefing:    ["Tactical: expect {enemies}. {what}.", "Tactical: scopes show {enemies} on approach."],
    fortressIn:  ["Tactical: the homeworld fortress, dead ahead. Hold it off until the buster's away.", "Captain: there's the fortress guarding their world. Guns, keep it off us.",
                  "Tactical: Azurian fortress dead ahead. It won't move and it won't stop firing."],
    waveIn:      ["Tactical: {enemy} on scope.", "Tactical: new contacts, {enemy}.", "Tactical: {enemy} closing."],
    salvo:       ["Tactical: enemy salvo in {t} s.", "Tactical: incoming fire, {t} seconds.", "Tactical: they're locking on. Salvo in {t}."],
    burn:        ["Helm: evasive burn in {t} s, {g} G for {d} s.", "Helm: hard burn coming, {g} G in {t} seconds.", "Helm: evading in {t}. {g} G, {d} seconds."],
    request:     ["Gunner {n}: gonna need that capacitor!", "Gunner {n}: rapid fire coming up!", "Gunner {n}: gonna get some!", "Gunner {n}: bore's going hot!",
                  "Gunner {n}: gimme all the juice!", "Gunner {n}: let's light 'em up!", "Gunner {n}: about to pour it on!"],
    requestDry:  ["Gunner {n}: my gun's dry!", "Gunner {n}: no charge, I can't fire!", "Gunner {n}: capacitor empty!"],
    shielded:    ["Damage control: shields held.", "Damage control: salvo absorbed.", "Shields took it. No damage."],
    hit:         ["Damage control: hull breach! {dmg} damage.", "Damage control: we're hit! Hull down {dmg}.", "That one got through! Hull down {dmg}."],
    surprise:    ["Tactical: unannounced salvo! Sorry, Engineering!", "Tactical: that one came out of nowhere!"],
    killed:      ["Gunner {n}: {enemy} destroyed!", "Tactical: {enemy} breaking up.", "Gunner {n}: splash one {enemy}!"],
    withdrew:    ["Tactical: {enemy} pulling back.", "Tactical: {enemy} out of range."],
    trip:        ["Failsafe: {sys} tripped offline.", "Failsafe: reactor overheat. {sys} breaker open.", "Failsafe tripped {sys}!"],
    reclose:     ["Failsafe: {sys} breaker closed.", "{sys} back on the reactor."],
    heat:        ["Reactor room: heat is climbing!", "Reactor room: we're running hot down here!"],
    lifeLow:     ["Medical: air's getting thin.", "Medical: life support is failing."],
    lifeOut:     ["Medical: crew passing out! Gunners are slowing down.", "Medical: life support's out. The crew can't keep this up."],
    lifeBack:    ["Medical: air's back. Crew recovering."],
    jumpNotice:  ["Navigation: jump window in {t} s. Drive must be full.", "Bridge: jump window opens in {t} seconds."],
    jumpOpen:    ["Navigation: jump window open. Waiting on the drive.", "Captain: window's open. Where's my drive, Engineering?"],
    jumpOpenNav: ["Navigation: jump window open. Waiting on the drive."],      // the bridge: Navigation's line only
    jumpGo:      ["Bridge: drive full. Jumping in {t}.", "Bridge: all hands, jump in {t}."],
    damaged:     ["Damage control: {what}."],
    killedOther: ["Tactical: {enemy} destroyed.", "Tactical: {enemy} breaking up."],
    mainFired:   ["Gunnery: main gun fired! Direct hit.", "Gunnery: main gun away! {enemy} is hurting.", "Gunnery: main gun on target. Keep it coming, Engineering!"],
    mainKill:    ["Gunnery: main gun fired! {enemy} gutted.", "Bridge: main gun on target. Scratch one {enemy}."],
    // The main gun at the gunner station: you fire it.
    mainReady:   ["Engineering: main gun's charged. Your shot, Gunnery.", "Captain: main gun ready. Wait for the bow to come on.", "Helm: main gun's up. I'm bringing her around."],
    mainShotHit: ["Bridge: main gun hit! The {enemy} is hurting.", "Tactical: direct hit on the {enemy}!"],
    mainShotKill:["Bridge: main gun on target. Scratch one {enemy}!", "Tactical: {enemy} gutted. Beautiful shot."],
    mainShotMiss:["Bridge: main gun missed! Nothing on the bow.", "Tactical: clean miss. That's a minute of charge gone."],
    mineDown:    ["Tactical: mine destroyed.", "Helm: thanks, Gunnery. That one was close.", "Tactical: mine cleared."],
    launchCall:  ["Flight deck: squadron launch in {t} s. Charge the launchers.", "Captain: launching gunboats in {t} seconds. Launchers must be full.", "Flight deck: gunboats to launch in {t}. Need full launchers."],
    launched:    ["Bridge: Transferring launch control to gunboats. Launch when ready."],
    launchMissed:["Flight deck: launchers weren't charged. Launch scrubbed.", "Captain: no launch, Engineering. The launchers were short."],
    recoverCall: ["Flight deck: recovering the squadron in {t} s. Charge the arresters.", "Captain: gunboats coming home in {t} seconds. Arresters must be full."],
    recovered2:  ["Flight deck: squadron recovered. All gunboats aboard.", "Flight deck: arresters caught them. Squadron's home."],
    recoverLate: ["Flight deck: arresters aren't charged! The gunboats are circling.", "Captain: we can't take the squadron aboard, Engineering. Charge those arresters!"],
    holdForSquadron: ["Bridge: holding the jump until the squadron is aboard.", "Captain: we don't leave without our gunboats."],
    squadronLeft:["Captain: we can't wait for the gunboats. Jumping now!", "Bridge: hull's too far gone. We're leaving the squadron behind."],
    intercepted: ["Squadron: we caught that salvo!", "Flight deck: gunboats knocked down a salvo."],
    mineHit:     ["Damage control: mine strike! Hull down {dmg}.", "We clipped a mine! Hull down {dmg}."],
    strike:      ["Tactical: drive strike inbound, {t} s!", "Tactical: hunters are going for the drive. Impact in {t}.", "Tactical: missile on the drive in {t} seconds!"],
    pdStopped:   ["CIWS: splash one missile.", "CIWS: got it."],
    ciwsDry:     ["CIWS: out of charge! Missile through.", "CIWS: dry! It's going for the drive."],
    driveHit:    ["Damage control: drive strike! We lost {pct}% of the drive charge.", "Navigation: they hit the drive. Charge down {pct}%!"],
    heatR:       ["Reactor room: reactor {r} is running hot!", "Reactor room: heat's climbing on reactor {r}!"],
    auxEmptyR:   ["Aux bank {r} is empty."],
    busterWait:  ["Bridge: the planet buster isn't charged. We can't make the final jump!", "Weapons: buster's not ready, Captain. Holding the jump."],
    starved:     ["Helm: engines are starved! I can't hold the course!", "Helm: not enough power to the engines, we're drifting into the mines!"],
    auxEmpty:    ["Aux bank is empty."],
    // Gunner station. A key ending in G replaces the plain one while the player is at a gun.
    arrivalG:    ["Captain: dropping out of warp space. Guns, stand by.", "Captain: normal space. Gunnery, weapons free.", "Helm: we're out of warp space. Guns up!"],
    recoveredG:  ["Carrier: gunboat recovered. Good shooting.", "Coxswain: we're on the deck. Nice shooting, Guns."],
    burnG:       [],                     // the helm's burns matter to the engineer, not the gunner
    surpriseG:   ["Tactical: torpedo out of nowhere!", "Tactical: didn't see that one launch!"],
    powerCall:   ["Engineering: power's coming to your gun!", "Engineering: you've got it, full charge for a few seconds.", "Engineering: routing everything I can spare to you."],
    shipKill:    ["Tactical: splash one {enemy}!", "Tactical: {enemy} down!", "Tactical: scratch one {enemy}."],
    torpDown:    ["Tactical: torpedo destroyed!", "Tactical: nice, you got the torpedo."],
    ptAway:      ["Coxswain: torpedo {n} away!", "Torpedo {n} running hot and straight!", "Coxswain: fish {n} in the water!"],
    ptHit:       ["Tactical: torpedo hit! {enemy} is burning!", "Coxswain: direct hit on the {enemy}!", "Tactical: that one hurt the {enemy}!"],
    ptDowned:    ["Tactical: their point defense got our torpedo.", "Tactical: torpedo intercepted."],
    chargeStopped: ["Tactical: got it before it could fire!", "Tactical: that one won't be shooting at us.", "Tactical: nice, it never got that torpedo off."],
    straggler:   ["Tactical: stragglers from another quadrant. {enemy} inbound!", "Tactical: more contacts, {enemy} breaking off from another fight.", "Tactical: {enemy} joining in from the flank!"],
    ptMiss:      ["Tactical: torpedo missed.", "Coxswain: it slipped the torpedo."],
    // The helm. A key ending in H replaces the plain one (and the gunner's G one) at the helm.
    launchH:     ["Carrier: Transferring launch control to gunboats. Launch when ready."],   // TexasBont's launch line (Oct 13, 2026)
    arrivalH:    ["Navigation: out of warp space. Jump heading {hdg}, Helm.", "Captain: normal space. Helm, she's yours; jump heading is {hdg}."],
    takeConn:    ["Captain: I have the conn. Coming to {hdg} for the jump.", "Captain: I'll take her, Helm. Jump heading {hdg}."],
    recoveredH:  ["Carrier: gunboat recovered. Nice flying.", "Coxswain: we're on the deck. Good flying, Helm."],
    burnH:       [],                     // the captain's orders replace the bridge's burns at the helm
    mainReadyH:  ["Engineering: main gun's charged."],   // a report only: where the bow goes is the captain's call
    helmNag:     ["Carrier: launch, launch, launch!", "Coxswain: we're holding up the line, Helm. Launch!"],
    helmAuto:    ["Carrier: launching you now."],
    helmLaunched:["Coxswain: we're out! Clear of the tube.", "Carrier: gunboat away. Good hunting.", "Coxswain: off the deck and into it."],
    helmClear:   ["Coxswain: clear of the carrier. All ahead standard.", "Coxswain: we're clear. All ahead standard."],
    helmOrder:   ["{who}: come {dir} to {hdg}, {eng}, in {t} s.", "{who}: helm, {dir} to {hdg}, {eng}. {t} seconds.", "{who}: stand by to come {dir} to {hdg}, {eng}, in {t}."],
    helmMet:     ["{who}: very well.", "{who}: steady as she goes. Well done.", "{who}: nicely done, Helm."],
    helmMissed:  ["{who}: that's not what I ordered, Helm.", "{who}: Helm, mind your orders!", "{who}: we were supposed to be on {hdg}."],
    helmMissedE: ["{who}: that's not what I ordered, Helm.", "{who}: Helm, mind your orders!"],     // an engine order missed
    helmMissedHdg: ["{who}: we were supposed to be on {hdg}."],         // a course order: the heading was the problem
    helmMissedEng: ["{who}: we were supposed to be at {eng}."],         // a course order: the engines were the problem
    stressWarn:  ["Damage control: she's groaning!", "Damage control: hull stress climbing!"],   // reports only: easing off is the captain's order
    easeOff:     ["{who}: ease the turn!", "{who}: ease off!"],
    stressHit:   ["Damage control: structural damage from that turn! Hull down {dmg}.", "Damage control: frames buckling! Hull down {dmg}."],
    flankWarn:   ["Engineering: we can't hold flank much longer!", "Engineering: engines are over their rating, Bridge!"],
    flankDamage: ["Engineering: we burned out a thruster holding flank! {what}.", "Engineering: that's what flank does. {what}."],
    dodged:      ["Tactical: it missed! Nice flying.", "Tactical: torpedo went wide!", "Tactical: clean miss!"],
    evade:       ["{who}: break {dir}, now!", "{who}: evasive! Hard {dir}!", "{who}: break {dir}, Helm! Break {dir}!"],
    evadeHold:   ["{who}: steady, Helm.", "{who}: maintain heading.", "{who}: steady as she goes. The shields can take it."],     // TexasBont's wording (Oct 14, 2026); no longer used: the corridor replaced it
    jumpSteady:  ["{who}: steady as she goes."],                         // lined up for the jump (TexasBont, Oct 23, 2026)
    corridor:    ["{who}: Helm, you're outside the corridor."],          // out of the corridor (TexasBont, Oct 23, 2026)
    disobey:     ["{who}: Helm, I said hold your course!", "{who}: that was not my order, Helm. It goes in my report.", "{who}: Helm! Steady means steady!"],
    evadeOwn:    ["Helm: breaking {dir}!"],
    evadeMissed: ["{who}: too slow on that break, Helm!", "{who}: I said break, Helm!"],
    helmReq:     ["Gunner {n}: Captain, nothing in my arc. Target {side}."],     // to the captain, who orders the helm
    jumpNoticeH: ["Navigation: jump window in {t} s. Jump heading {hdg}."],     // reports; the captain orders the heading
    jumpHeading: ["Navigation: drive's full. We're off the jump heading."],
    warnEng:     ["Engineering: standing by for your burn.", "Engineering: understood, power's ready for the engines.", "Engineering: copy, Helm. Engines get first call."]
  };

  /* ------------------------------------------------------ Sound recipes
     bfxr-style: wave, frequency start/end (Hz), attack/sustain/decay (s), volume,
     optional vibrato, square duty, noise mix. Channel picks the volume slider. */
  BL.SOUNDS = {
    click:    { ch: "fx",    wave: "square",   f0: 880,  f1: 660,  a: 0.002, s: 0.02, d: 0.04, vol: 0.18 },
    tick:     { ch: "fx",    wave: "triangle", f0: 1200, f1: 1100, a: 0.001, s: 0.005, d: 0.02, vol: 0.10 },
    toggle:   { ch: "fx",    wave: "square",   f0: 440,  f1: 880,  a: 0.002, s: 0.03, d: 0.05, vol: 0.18 },
    warn:     { ch: "alarm", wave: "square",   f0: 1320, f1: 1320, a: 0.005, s: 0.07, d: 0.03, vol: 0.20, repeat: 2, gap: 0.11 },
    warnBurn: { ch: "alarm", wave: "sawtooth", f0: 220,  f1: 440,  a: 0.01,  s: 0.20, d: 0.08, vol: 0.16 },
    request:  { ch: "alarm", wave: "triangle", f0: 660,  f1: 990,  a: 0.005, s: 0.06, d: 0.04, vol: 0.18, repeat: 2, gap: 0.08 },
    shot:     { ch: "fx",    wave: "square",   f0: 1400, f1: 300,  a: 0.001, s: 0.02, d: 0.08, vol: 0.06, duty: 0.25 },
    shieldHit:{ ch: "fx",    wave: "sawtooth", f0: 300,  f1: 1200, a: 0.002, s: 0.06, d: 0.25, vol: 0.20, noise: 0.25, vib: { rate: 30, depth: 0.08 } },
    hullHit:  { ch: "fx",    wave: "noise",    f0: 140,  f1: 40,   a: 0.002, s: 0.12, d: 0.5,  vol: 0.40 },
    trip:     { ch: "alarm", wave: "square",   f0: 180,  f1: 60,   a: 0.001, s: 0.05, d: 0.25, vol: 0.30, noise: 0.4 },
    reclose:  { ch: "fx",    wave: "square",   f0: 120,  f1: 240,  a: 0.001, s: 0.03, d: 0.08, vol: 0.16 },
    alarm:    { ch: "alarm", wave: "square",   f0: 740,  f1: 520,  a: 0.01,  s: 0.25, d: 0.05, vol: 0.14 },
    kill:     { ch: "fx",    wave: "noise",    f0: 900,  f1: 100,  a: 0.002, s: 0.1,  d: 0.6,  vol: 0.22 },
    chatter:  { ch: "chat",  wave: "square",   f0: 1800, f1: 1700, a: 0.001, s: 0.025, d: 0.01, vol: 0.06, repeat: 3, gap: 0.035, noise: 0.3 },
    jump:     { ch: "fx",    wave: "sine",     f0: 80,   f1: 2400, a: 0.2,   s: 1.0,  d: 0.6,  vol: 0.30, vib: { rate: 8, depth: 0.05 } },
    arrive:   { ch: "fx",    wave: "sine",     f0: 1600, f1: 90,   a: 0.05,  s: 0.5,  d: 0.6,  vol: 0.25 },
    pd:       { ch: "fx",    wave: "square",   f0: 2200, f1: 600,  a: 0.001, s: 0.04, d: 0.1,  vol: 0.12, repeat: 3, gap: 0.05 },
    main:     { ch: "fx",    wave: "noise",    f0: 220,  f1: 30,   a: 0.005, s: 0.25, d: 1.1,  vol: 0.45 },
    launch:   { ch: "fx",    wave: "sawtooth", f0: 160,  f1: 900,  a: 0.05,  s: 0.5,  d: 0.4,  vol: 0.18, noise: 0.3 },
    pulse:    { ch: "fx",    wave: "square",   f0: 1700, f1: 700,  a: 0.001, s: 0.015, d: 0.05, vol: 0.07, duty: 0.25 },
    rail:     { ch: "fx",    wave: "sawtooth", f0: 2400, f1: 120,  a: 0.001, s: 0.03, d: 0.22, vol: 0.16, noise: 0.35 },
    ion:      { ch: "fx",    wave: "sine",     f0: 520,  f1: 1300, a: 0.005, s: 0.05, d: 0.12, vol: 0.13, vib: { rate: 40, depth: 0.15 } },
    dry:      { ch: "fx",    wave: "square",   f0: 160,  f1: 140,  a: 0.001, s: 0.02, d: 0.03, vol: 0.10 },
    shipHit:  { ch: "fx",    wave: "noise",    f0: 2400, f1: 900,  a: 0.001, s: 0.01, d: 0.06, vol: 0.10 },
    torpLaunch:{ ch: "fx",   wave: "sawtooth", f0: 90,   f1: 260,  a: 0.02,  s: 0.15, d: 0.2,  vol: 0.10, noise: 0.4 },
    ptLaunch: { ch: "fx",    wave: "sawtooth", f0: 70,   f1: 420,  a: 0.03,  s: 0.35, d: 0.4,  vol: 0.2,  noise: 0.5 },
    shieldBoom: { ch: "fx",  wave: "noise",    f0: 180,  f1: 35,   a: 0.004, s: 0.12, d: 0.7,  vol: 0.5 },
    breach:   { ch: "alarm", wave: "square",   f0: 560,  f1: 400,  a: 0.01,  s: 0.16, d: 0.05, vol: 0.2,  repeat: 3, gap: 0.07 },
    torpDown: { ch: "fx",    wave: "noise",    f0: 1800, f1: 300,  a: 0.001, s: 0.05, d: 0.3,  vol: 0.20 },
    win:      { ch: "fx",    wave: "triangle", f0: 523,  f1: 1046, a: 0.01,  s: 0.25, d: 0.4,  vol: 0.22, repeat: 3, gap: 0.18 },
    lose:     { ch: "fx",    wave: "sawtooth", f0: 300,  f1: 50,   a: 0.01,  s: 0.8,  d: 0.8,  vol: 0.25, noise: 0.3 }
  };
})(typeof window !== "undefined" ? window : globalThis);
