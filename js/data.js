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
     threat: multipliers on encounter salvo damage (dmg) and enemy toughness (hp).
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
     Archonian capital ships are met only at the gun for now). gunnerFinal: the encounter that
     always holds the final system at the gun (the dreadnought's homeworld fortress).
     mission: jumps and when each jump window opens (s after arrival). A ship with no
     GravSpace drive flies one timed sortie per carrier jump: the carrier recovers it when
     the sortie timer runs out, carries it through GravSpace, and launches it again. */
  var GUN = { shotMJ: 15, normalInterval: 2.0, fullInterval: 0.5, hitChance: 0.7, damage: 10 };
  function sys(id, name, short, kind, maxMJ, maxMW, startMJ, startSet, extra) {
    var o = { id: id, name: name, short: short, kind: kind, maxMJ: maxMJ, maxMW: maxMW, startMJ: startMJ, startSet: startSet };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  }
  BL.CLASSES = [
    { n: 1, id: "gunboat", name: "Gunboat", built: true, baseRep: 100,
      crew: 4, hull: 30, reactorMW: 40, engineMWperG: 2, cruiseG: 4, maxG: 16, gScale: 1.5,
      aux: { capacity: 0, rateMW: 0 }, hullPerMJ: 0.3, threat: { dmg: 0.35, hp: 0.4 }, torpedoes: 2,
      mission: { jumps: 3, windows: [70, 80, 90] }, encounters: ["raiders", "interceptors", "frigate"],
      systems: [
        sys("life", "Life support", "LIFE", "life", 25, 6, 25, 2, { drainMW: 1.2 }),
        sys("shield", "Shields", "SHLD", "shield", 90, 35, 45, 4),
        sys("gun1", "Gun 1", "GUN1", "gun", 60, 30, 30, 4, { gunner: 1 })
      ] },
    { n: 2, id: "picket", name: "Picket Ship", built: true, baseRep: 212,
      crew: 4, hull: 60, reactorMW: 60, engineMWperG: 3, cruiseG: 2, maxG: 11, gScale: 1.2,
      aux: { capacity: 0, rateMW: 0 }, hullPerMJ: 0.16, threat: { dmg: 0.6, hp: 0.55 },
      mission: { jumps: 3, windows: [110, 120, 130] }, encounters: ["raiders", "interceptors", "siege"],
      systems: [
        sys("life", "Life support", "LIFE", "life", 35, 8, 35, 2, { drainMW: 1.5 }),
        sys("shield", "Shields", "SHLD", "shield", 120, 45, 60, 12),
        sys("gun1", "Gun 1", "GUN1", "gun", 70, 30, 35, 8, { gunner: 1 }),
        sys("drive", "GravSpace drive", "DRIVE", "drive", 1800, 40, 0, 0)
      ] },
    { n: 3, id: "destroyerEscort", name: "Destroyer Escort", built: true, baseRep: 325,
      crew: 5, hull: 80, reactorMW: 80, engineMWperG: 4, cruiseG: 2, maxG: 10, gScale: 1.1,
      aux: { capacity: 0, rateMW: 0 }, hullPerMJ: 0.14, threat: { dmg: 0.8, hp: 0.75 },
      mission: { jumps: 3, windows: [120, 130, 140] }, encounters: ["raiders", "interceptors", "siege"],
      systems: [
        sys("life", "Life support", "LIFE", "life", 45, 10, 45, 3, { drainMW: 2.2 }),
        sys("shield", "Shields", "SHLD", "shield", 140, 55, 70, 16),
        sys("gun1", "Gun 1", "GUN1", "gun", 85, 35, 42, 9, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 85, 35, 42, 9, { gunner: 2 }),
        sys("drive", "GravSpace drive", "DRIVE", "drive", 2400, 50, 0, 0)
      ] },
    { n: 4, id: "destroyer", name: "Destroyer", built: true, baseRep: 437,
      crew: 6, hull: 100, reactorMW: 100, engineMWperG: 5, cruiseG: 2, maxG: 9, gScale: 1,
      aux: { capacity: 450, rateMW: 40 }, hullPerMJ: 0.12, threat: { dmg: 1, hp: 1 },
      mission: { jumps: 3, windows: [130, 140, 150] }, encounters: ["raiders", "interceptors", "siege"],
      systems: [
        sys("life", "Life support", "LIFE", "life", 60, 12, 60, 4, { drainMW: 3 }),
        sys("shield", "Shields", "SHLD", "shield", 160, 70, 80, 20),
        sys("gun1", "Gun 1", "GUN1", "gun", 100, 40, 50, 10, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 100, 40, 50, 10, { gunner: 2 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 100, 40, 50, 10, { gunner: 3 }),
        sys("drive", "GravSpace drive", "DRIVE", "drive", 3200, 60, 0, 0)
      ] },
    { n: 5, id: "lightCruiser", name: "Light Cruiser", built: true, baseRep: 550,
      crew: 7, hull: 120, reactorMW: 125, engineMWperG: 6, cruiseG: 2, maxG: 7, gScale: 0.9,
      aux: { capacity: 550, rateMW: 45 }, hullPerMJ: 0.17, threat: { dmg: 1.35, hp: 1.6 },
      mission: { jumps: 3, windows: [140, 150, 160] }, encounters: ["raiders", "interceptors", "siege", "minefield"],
      mainGun: { dmgPerMJ: 0.6 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 70, 14, 70, 4, { drainMW: 3.5 }),
        sys("shield", "Shields", "SHLD", "shield", 225, 85, 110, 22),
        sys("gun1", "Gun 1", "GUN1", "gun", 105, 40, 52, 10, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 105, 40, 52, 10, { gunner: 2 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 105, 40, 52, 10, { gunner: 3 }),
        sys("gun4", "Gun 4", "GUN4", "gun", 105, 40, 52, 10, { gunner: 4 }),
        sys("main", "Main gun", "MAIN", "main", 480, 45, 160, 8),
        sys("drive", "GravSpace drive", "DRIVE", "drive", 4000, 70, 0, 0)
      ] },
    { n: 6, id: "cruiser", name: "Cruiser", built: true, baseRep: 662,
      crew: 8, hull: 140, reactorMW: 150, engineMWperG: 7, cruiseG: 2, maxG: 6, gScale: 0.85,
      aux: { capacity: 650, rateMW: 50 }, hullPerMJ: 0.19, threat: { dmg: 1.55, hp: 1.9 },
      mission: { jumps: 3, windows: [150, 160, 170] }, encounters: ["raiders", "interceptors", "siege", "minefield"],
      mainGun: { dmgPerMJ: 0.6 },
      hangar: { launchAfter: [6, 12], lead: 10, window: 8, retry: 15, recoverBefore: 25, recoverLead: 12, recoverWindow: 10, intercept: 0.25, dps: 6 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 80, 16, 80, 4, { drainMW: 4 }),
        sys("shield", "Shields", "SHLD", "shield", 265, 95, 130, 24),
        sys("gun1", "Gun 1", "GUN1", "gun", 110, 40, 55, 10, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 110, 40, 55, 10, { gunner: 2 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 110, 40, 55, 10, { gunner: 3 }),
        sys("gun4", "Gun 4", "GUN4", "gun", 110, 40, 55, 10, { gunner: 4 }),
        sys("gun5", "Gun 5", "GUN5", "gun", 110, 40, 55, 10, { gunner: 5 }),
        sys("main", "Main gun", "MAIN", "main", 520, 50, 170, 8),
        sys("hangar", "Launchers", "LNCH", "hangar", 600, 40, 300, 6),
        sys("drive", "GravSpace drive", "DRIVE", "drive", 4800, 80, 0, 0)
      ] },
    { n: 7, id: "heavyCruiser", name: "Heavy Cruiser", built: true, baseRep: 775,
      crew: 9, hull: 160, reactorMW: 175, engineMWperG: 8, cruiseG: 2, maxG: 5, gScale: 0.8,
      aux: { capacity: 750, rateMW: 55 }, hullPerMJ: 0.26, threat: { dmg: 1.75, hp: 2.2 },
      mission: { jumps: 3, windows: [160, 170, 180] }, encounters: ["raiders", "interceptors", "siege", "minefield", "hunters"],
      gunnerEncounters: ["raiders", "interceptors", "siege", "minefield", "hunters", "cruiserA"],
      mainGun: { dmgPerMJ: 0.6 },
      hangar: { launchAfter: [6, 12], lead: 10, window: 8, retry: 15, recoverBefore: 25, recoverLead: 12, recoverWindow: 10, intercept: 0.25, dps: 6 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 90, 18, 90, 5, { drainMW: 4.5 }),
        sys("shield", "Shields", "SHLD", "shield", 300, 105, 150, 26),
        sys("gun1", "Gun 1", "GUN1", "gun", 115, 42, 57, 10, { gunner: 1 }),
        sys("gun2", "Gun 2", "GUN2", "gun", 115, 42, 57, 10, { gunner: 2 }),
        sys("gun3", "Gun 3", "GUN3", "gun", 115, 42, 57, 10, { gunner: 3 }),
        sys("gun4", "Gun 4", "GUN4", "gun", 115, 42, 57, 10, { gunner: 4 }),
        sys("gun5", "Gun 5", "GUN5", "gun", 115, 42, 57, 10, { gunner: 5 }),
        sys("gun6", "Gun 6", "GUN6", "gun", 115, 42, 57, 10, { gunner: 6 }),
        sys("main", "Main gun", "MAIN", "main", 560, 55, 180, 8),
        sys("hangar", "Launchers", "LNCH", "hangar", 650, 45, 320, 6),
        sys("pd", "CIWS", "CIWS", "pd", 180, 45, 90, 8),
        sys("drive", "GravSpace drive", "DRIVE", "drive", 5600, 90, 0, 0)
      ] },
    { n: 8, id: "battleship", name: "Battleship", built: true, baseRep: 887,
      crew: 10, hull: 180, engineMWperG: 9, cruiseG: 2, maxG: 4, gScale: 0.75,
      reactors: [{ name: "A", mw: 112, aux: { capacity: 450, rateMW: 35 } }, { name: "B", mw: 112, aux: { capacity: 450, rateMW: 35 } }],
      hullPerMJ: 0.42, threat: { dmg: 1.6, hp: 3.2 },
      mission: { jumps: 3, windows: [170, 180, 190] }, encounters: ["raiders", "interceptors", "siege", "minefield", "hunters"],
      gunnerEncounters: ["raiders", "interceptors", "siege", "minefield", "hunters", "cruiserA", "battleshipA"],
      mainGun: { dmgPerMJ: 0.6 },
      hangar: { launchAfter: [6, 12], lead: 10, window: 8, retry: 15, recoverBefore: 25, recoverLead: 12, recoverWindow: 10, intercept: 0.25, dps: 7 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 100, 20, 100, 5, { drainMW: 5, reactor: 0 }),
        sys("shield", "Shields", "SHLD", "shield", 280, 110, 140, 28, { reactor: 0 }),
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
        sys("drive", "GravSpace drive", "DRIVE", "drive", 6400, 100, 0, 0, { reactor: 1 })
      ] },
    { n: 9, id: "dreadnought", name: "Dreadnaught", built: true, baseRep: 1000,
      crew: 12, hull: 220, engineMWperG: 10, cruiseG: 2, maxG: 3, gScale: 0.7,
      reactors: [{ name: "A", mw: 112, aux: { capacity: 380, rateMW: 30 } }, { name: "B", mw: 112, aux: { capacity: 380, rateMW: 30 } },
        { name: "C", mw: 112, aux: { capacity: 380, rateMW: 30 } }],
      hullPerMJ: 0.48, threat: { dmg: 1.7, hp: 3.6 },
      mission: { jumps: 3, windows: [180, 190, 200] }, encounters: ["raiders", "interceptors", "siege", "minefield", "hunters"],
      gunnerEncounters: ["raiders", "interceptors", "siege", "minefield", "hunters", "cruiserA", "battleshipA"], gunnerFinal: "fortress",
      mainGun: { dmgPerMJ: 0.6 },
      hangar: { launchAfter: [6, 12], lead: 10, window: 8, retry: 15, recoverBefore: 25, recoverLead: 12, recoverWindow: 10, intercept: 0.25, dps: 8 },
      systems: [
        sys("life", "Life support", "LIFE", "life", 110, 22, 110, 6, { drainMW: 5.5, reactor: 0 }),
        sys("shield", "Shields", "SHLD", "shield", 300, 115, 150, 30, { reactor: 0 }),
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
        sys("drive", "GravSpace drive", "DRIVE", "drive", 7200, 110, 0, 0, { reactor: 1 })
      ] }
  ];
  BL.classById = function (id) { return BL.CLASSES.filter(function (c) { return c.id === id; })[0]; };
  BL.classByN = function (n) { return BL.CLASSES[n - 1]; };

  /* Tech level: lower tech = smaller reactor, capacitors and chargers, weaker guns,
     and more reputation. The class numbers above are tech level 4. */
  BL.TECH = {
    factor: function (tl) { return 0.85 + 0.05 * (tl - 1); },     // TL1 0.85 ... TL6 1.10
    repMult: function (tl) { return 2.0 - 0.2 * (tl - 1); }       // TL1 x2.0 ... TL6 x1.0
  };

  // A ship of class `classId` at tech level `tl`, ready for BL.Mission.
  BL.shipFor = function (classId, tl) {
    var c = BL.classById(classId), f = BL.TECH.factor(tl || 4);
    function r(v) { return Math.round(v); }
    var reactors = (c.reactors || [{ name: "", mw: c.reactorMW, aux: c.aux }]).map(function (x) {
      return { name: x.name, mw: r(x.mw * f), aux: { capacity: r(x.aux.capacity * f), rateMW: r(x.aux.rateMW * f) } };
    });
    return {
      classId: c.id, className: c.name, n: c.n, tl: tl || 4, reactors: reactors,
      name: c.name, hull: c.hull, crew: c.crew,
      reactorMW: reactors.reduce(function (a, x) { return a + x.mw; }, 0), engineMWperG: c.engineMWperG, cruiseG: c.cruiseG, maxG: c.maxG, gScale: c.gScale,
      aux: reactors[0].aux,
      hullPerMJ: c.hullPerMJ, threat: c.threat, mission: c.mission, encounters: c.encounters, gunnerEncounters: c.gunnerEncounters, gunnerFinal: c.gunnerFinal,
      mainGun: c.mainGun || null, torpedoes: c.torpedoes || 0,
      hangar: c.hangar ? Object.assign({}, c.hangar, { dps: c.hangar.dps * f }) : null,
      gun: { shotMJ: GUN.shotMJ, normalInterval: GUN.normalInterval, fullInterval: GUN.fullInterval, hitChance: GUN.hitChance, damage: GUN.damage * f },
      systems: c.systems.map(function (s) {
        var o = {}; for (var k in s) o[k] = s[k];
        if (s.kind !== "life") { o.maxMJ = r(s.maxMJ * f); o.maxMW = r(s.maxMW * f); o.startMJ = r(s.startMJ * f); }
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
    lookCostPct: 10                    // looking at the console while paused
  };

  /* --------------------------------------------------------- Encounters
     Each encounter is a load pattern. Ranges [a, b] are rolled from the mission seed. */
  BL.ENCOUNTERS = {
    raiders: {
      name: "Raiders",
      enemy: "Raider pack",
      what: "Short, heavy salvos with long gaps",
      tests: "Shield timing",
      salvoWarning: 7,
      firstWave: [4, 6],
      waveEvery: [24, 32],
      wave: { hp: 300, salvos: [3, 4], approach: [6, 8], salvoGap: [2.5, 4], salvoMJ: [120, 170], requests: 2 },
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
      wave: { hp: 420, salvos: [11, 14], approach: [6, 7], salvoGap: [2.5, 3.8], salvoMJ: [75, 105], requests: 3 },
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
      wave: { hp: 130, salvos: [4, 6], approach: [4, 6], salvoGap: [1.8, 2.8], salvoMJ: [45, 70], requests: 1 },
      request: { lead: 3, duration: [5, 7] },
      burns: { every: [9, 14], g: [7, 9], duration: [4, 6], warning: 5 },
      surpriseChance: 0.1
    },
    // Heavy cruiser and up. Hunters fire drive strikes: the CIWS (close-in weapon system) stops
    // them if it has the charge (mj = CIWS charge per strike); one that gets through drains
    // `driveDrain` of the drive.
    hunters: {
      name: "Drive hunters",
      enemy: "Drive hunter",
      what: "They fire at the GravSpace drive; only the CIWS stops them",
      tests: "Priority order, shielding the drive",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [20, 28],
      wave: { hp: 200, salvos: [4, 6], approach: [5, 7], salvoGap: [2.5, 4], salvoMJ: [30, 45], requests: 2, strikes: true },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [20, 30], g: [4, 5], duration: [3, 5], warning: 5 },
      surpriseChance: 0.05, driveDrain: 0.15,
      breakOff: 0                      // hunters send no new waves once the jump window is open
    },
    // An Archonian frigate with two interceptor escorts: one big hull, torpedoes in pairs.
    frigate: {
      name: "Frigate group",
      enemy: "Archonian frigate",
      what: "A frigate and two escorts; torpedoes come in pairs every 6 to 8 s",
      tests: "Shield timing under steady pairs",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [70, 80],
      wave: { hp: 360, salvos: [8, 10], approach: [6, 8], salvoGap: [6, 8], salvoMJ: [70, 100], requests: 3, pairs: true,
              // each escort fires its own light torpedoes, like an interceptor flight's
              escortFire: { count: 2, salvos: [3, 4], start: [2, 4], gap: [4, 6], salvoMJ: [45, 70] } },
      // Light attack craft keep coming while the frigate fights: stragglers from another quadrant.
      stragglers: { first: [12, 16], every: [18, 26], types: ["interceptors", "interceptors", "interceptors", "raiders", "raiders"] },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [24, 34], g: [5, 6], duration: [3, 4], warning: 5 },
      surpriseChance: 0.05
    },
    // An Archonian cruiser (heavy cruiser, gunner station) with three interceptor escorts: a bigger hull
    // than the frigate's, heavier torpedoes in pairs, and stragglers joining the fight.
    cruiserA: {
      name: "Cruiser group",
      enemy: "Archonian cruiser",
      what: "A cruiser and three escorts; heavy torpedoes come in pairs every 5 to 7 s",
      tests: "Shield timing under heavy pairs",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [80, 90],
      wave: { hp: 560, salvos: [10, 12], approach: [6, 8], salvoGap: [5, 7], salvoMJ: [80, 110], requests: 3, pairs: true,
              escortFire: { count: 3, salvos: [3, 4], start: [2, 4], gap: [4, 6], salvoMJ: [45, 70] } },
      stragglers: { first: [14, 18], every: [20, 28], types: ["interceptors", "interceptors", "raiders", "raiders"] },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [24, 34], g: [5, 6], duration: [3, 4], warning: 5 },
      surpriseChance: 0.05
    },
    // An Archonian battleship (battleship and dreadnought, gunner station) screened by three
    // raiders: the biggest hull yet, torpedoes in volleys of three (a broadside), and stragglers,
    // drive hunters among them. volley = torpedoes per salvo call, 0.6 s apart.
    battleshipA: {
      name: "Battleship group",
      enemy: "Archonian battleship",
      what: "A battleship and three raiders; its torpedoes come in threes every 6 to 8 s",
      tests: "Shield timing under broadsides",
      salvoWarning: 6,
      firstWave: [3, 5],
      waveEvery: [100, 115],
      wave: { hp: 760, salvos: [10, 12], approach: [6, 8], salvoGap: [6, 8], salvoMJ: [60, 85], requests: 3, volley: 3,
              escortFire: { count: 3, salvos: [2, 3], start: [3, 5], gap: [6, 8], salvoMJ: [90, 130] } },
      stragglers: { first: [16, 20], every: [22, 30], types: ["interceptors", "interceptors", "raiders", "hunters"] },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [26, 36], g: [4, 5], duration: [3, 4], warning: 5 },
      surpriseChance: 0.05
    },
    // The fortress guarding the Archonian homeworld: the final system of every dreadnought
    // mission at the gun. It never moves and never gives up; its torpedoes (volleys of three)
    // keep coming for the whole fight unless it is destroyed. Four interceptor escorts, stragglers.
    fortress: {
      name: "Homeworld fortress",
      enemy: "Archonian fortress",
      what: "The fortress guarding the Archonian world and four escorts; its torpedoes come in threes every 6 to 8 s for the whole fight",
      tests: "Holding out until the planet buster is away",
      chat: "fortressIn",              // its own arrival call instead of the usual "expect ..."
      salvoWarning: 6,
      firstWave: [2, 3],
      waveEvery: [999, 999],
      wave: { hp: 2000, salvos: [34, 38], approach: [8, 10], salvoGap: [6, 8], salvoMJ: [55, 80], requests: 3, volley: 3,
              escortFire: { count: 4, salvos: [3, 4], start: [2, 4], gap: [4, 6], salvoMJ: [45, 70] } },
      stragglers: { first: [18, 24], every: [20, 28], types: ["interceptors", "interceptors", "raiders", "hunters"] },
      request: { lead: 4, duration: [6, 8] },
      burns: { every: [26, 36], g: [3, 4], duration: [3, 4], warning: 5 },
      surpriseChance: 0.05
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
      mines: { strikePerSec: 0.5, mj: [90, 140], engineMult: 2,     // weaving takes twice the engine power
               // At the gunner station the mines are seen: one drifts in every `every` s (twice as
               // often while the engines are starved), `drift` fields/s; one that reaches the shield
               // hits like a torpedo of mj x the class's threat dmg. No random strikes there.
               gunner: { every: [1.8, 2.8], drift: [0.06, 0.09], mj: [45, 70], starvedMult: 2 } },
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
      // CIWS (heavy cruiser and up): mounts on the hull fire on a drive strike by themselves
      // `engage` s before it lands, if the CIWS capacitor holds that strike's charge; the burst
      // lasts `burst` s. mounts: [x, y] as shares of the ship's drawn width and height from its center.
      ciws: { engage: 0.8, burst: 0.4, mounts: [[-0.3, 0.3], [0.3, 0.3], [-0.32, -0.1], [0.32, -0.1]] },
      // The gunboat squadron (cruiser and up) as the gunner sees it: n gunboats fly at `speed`,
      // circle their target at `orbit` (spin radians/s) strafing it, and every `tick` s shoot at
      // a torpedo within `look` (kill = the chance it goes down). Their strafing adds up to the
      // class's hangar dps.
      wing: { n: 4, speed: 0.32, orbit: 0.075, spin: 1.4, size: 0.042, look: 0.1, tick: 0.4, kill: 0.35
      }
    },
    aiGunner: 0.75,                    // skill of the machine gunner (rail view, and the test bot)
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
    pt: { speed: 0.3, turn: 60, damage: 135, size: 0.018, jinkAt: 0.3, jinkSeconds: 1.2,
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
      // Archonian capital ships: one big hull (the wave's toughness minus the escorts' share).
      frigate:      { ship: "frigate", ringR: [0.42, 0.46], capital: true, count: [1, 1], w: 0.13, h: 0.25, band: [0.15, 0.2], sway: 0.1, period: [10, 12], dive: 0,
                      escorts: { type: "interceptors", count: 2, share: 0.17 },
                      what: "one big hull escorted by two interceptors; it holds far out and fires torpedoes in pairs" },
      cruiserA:     { ship: "Archonian cruiser", ringR: [0.44, 0.48], capital: true, count: [1, 1], w: 0.2, h: 0.23, band: [0.15, 0.2], sway: 0.08, period: [11, 13], dive: 0,
                      escorts: { type: "interceptors", count: 3, share: 0.2 },
                      what: "one heavy hull escorted by three interceptors; it holds far out and fires heavy torpedoes in pairs" },
      battleshipA:  { ship: "Archonian battleship", ringR: [0.54, 0.58], capital: true, count: [1, 1], w: 0.24, h: 0.29, band: [0.15, 0.2], sway: 0.06, period: [12, 14], dive: 0,
                      escorts: { type: "raiders", count: 3, share: 0.22 },
                      what: "the biggest hull yet, screened by three raiders; it holds far out and fires torpedoes in threes" },
      // still: it never moves (no sway, no sliding away from the bow); bearing: always comes from dead ahead;
      // only: there is just the one.
      fortress:     { ship: "Archonian fortress", ringR: [0.53, 0.57], capital: true, still: true, bearing: 0, count: [1, 1], w: 0.3, h: 0.3, band: [0.12, 0.16], sway: 0, period: [12, 14], dive: 0,
                      escorts: { type: "interceptors", count: 4, share: 0.12 },
                      only: true,
                      what: "fixed dead ahead, guarding the Archonian world with four interceptors; it fires torpedoes in threes for the whole fight" },
      hunters:      { ship: "drive hunter", ringR: [0.35, 0.42], count: [3, 3], w: 0.065, h: 0.07, band: [0.18, 0.4], sway: 0.24, period: [3, 4], dive: 0.12,
                      what: "nimble ships that fire missiles at the GravSpace drive" }
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
      { id: "slowAstern", name: "Dead slow astern", short: "SLOW AST", f: -0.1 },
      { id: "stop",       name: "Stop",             short: "STOP",     f: 0 },
      { id: "deadSlow",   name: "Dead slow",        short: "DEAD SLOW", f: 0.1 },
      { id: "cruise",     name: "Cruise",           short: "CRUISE",   f: 0.25 },
      { id: "standard",   name: "Standard",         short: "STANDARD", f: 0.5 },
      { id: "full",       name: "Full",             short: "FULL",     f: 1 },
      { id: "flank",      name: "Flank",            short: "FLANK",    f: 1.1 }
    ],
    split: 0.625,          // split engines add this share of top turn per unit of (port - starboard) / (2 x full)
    engineTau: 0.5,        // engines spool toward their order (s)
    speedTau: 2,           // the ship eases to the speed its engines order (s)
    stress: { fill: 0.6, drain: 1 / 6, hullShare: 0.05, thrusterChance: 0.3, warnAt: 0.6, after: 0.25 },
    flank: { warnAt: 15, safe: 20, damagePerSec: 0.05 },
    turnLoss: 0.15,        // a thruster hit costs this share of the top turn rate (up to 60%)
    order: { heading: 10, held: 0.7, minGap: 12, turn: [30, 100] },   // captain's orders: tolerance, share held, spacing
    autopilotRep: 0.75,    // autopilot time earns this share of the helm's reputation
    launch: { nagAfter: 8, autoAfter: 20, clear: 2.5 },               // the gunboat in the carrier's tube
    ptBow: 20,             // the gunner launches torpedoes once a target is this close to the bow (deg)
    warnCooldown: 6        // seconds between warnings to engineering
  };

  /* ------------------------------------------------------------ Chatter
     Several lines per event; {placeholders} are filled in by the simulation. */
  BL.CHATTER = {
    launch:      ["Coxswain: launch! We're clear of the carrier.", "Carrier: gunboat away. Good hunting.", "Coxswain: off the deck and into it."],
    recoveryNotice: ["Carrier: recovery in {t} s. Hold on out there.", "Coxswain: carrier picks us up in {t} seconds."],
    recovered:   ["Carrier: gunboat recovered. Well flown.", "Coxswain: we're on the deck. Nice work, Engineering."],
    arrival:     ["Bridge: dropping out of GravSpace. Drive is empty.", "Bridge: we're out of GravSpace. Start charging the drive, Engineering.", "Helm: normal space. Drive reads empty."],
    briefing:    ["Tactical: expect {enemies}. {what}.", "Tactical: scopes show {enemies} on approach."],
    fortressIn:  ["Tactical: the homeworld fortress, dead ahead. Hold it off until the buster's away.", "Bridge: there's the fortress guarding their world. Guns, keep it off us.",
                  "Tactical: Archonian fortress dead ahead. It won't move and it won't stop firing."],
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
    jumpOpen:    ["Navigation: jump window open. Waiting on the drive.", "Bridge: window's open. Where's my drive, Engineering?"],
    jumpGo:      ["Bridge: drive full. Jumping in {t}.", "Bridge: all hands, jump in {t}."],
    damaged:     ["Damage control: {what}."],
    killedOther: ["Tactical: {enemy} destroyed.", "Tactical: {enemy} breaking up."],
    mainFired:   ["Gunnery: main gun fired! Direct hit.", "Gunnery: main gun away! {enemy} is hurting.", "Gunnery: main gun on target. Keep it coming, Engineering!"],
    mainKill:    ["Gunnery: main gun fired! {enemy} gutted.", "Bridge: main gun on target. Scratch one {enemy}."],
    // The main gun at the gunner station: you fire it.
    mainReady:   ["Engineering: main gun's charged. Your shot, Gunnery.", "Bridge: main gun ready. Wait for the bow to come on.", "Helm: main gun's up. I'm bringing her around."],
    mainShotHit: ["Bridge: main gun hit! The {enemy} is hurting.", "Tactical: direct hit on the {enemy}!"],
    mainShotKill:["Bridge: main gun on target. Scratch one {enemy}!", "Tactical: {enemy} gutted. Beautiful shot."],
    mainShotMiss:["Bridge: main gun missed! Nothing on the bow.", "Tactical: clean miss. That's a minute of charge gone."],
    mineDown:    ["Tactical: mine destroyed.", "Helm: thanks, Gunnery. That one was close.", "Tactical: mine cleared."],
    launchCall:  ["Flight deck: squadron launch in {t} s. Charge the launchers.", "Bridge: launching gunboats in {t} seconds. Launchers must be full.", "Flight deck: gunboats to launch in {t}. Need full launchers."],
    launched:    ["Bridge: Transferring launch control to PT Squadron. Launch when ready."],
    launchMissed:["Flight deck: launchers weren't charged. Launch scrubbed.", "Bridge: no launch, Engineering. The launchers were short."],
    recoverCall: ["Flight deck: recovering the squadron in {t} s. Charge the arresters.", "Bridge: gunboats coming home in {t} seconds. Arresters must be full."],
    recovered2:  ["Flight deck: squadron recovered. All gunboats aboard.", "Flight deck: arresters caught them. Squadron's home."],
    recoverLate: ["Flight deck: arresters aren't charged! The gunboats are circling.", "Bridge: we can't take the squadron aboard, Engineering. Charge those arresters!"],
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
    arrivalG:    ["Bridge: dropping out of GravSpace. Guns, stand by.", "Bridge: normal space. Gunnery, weapons free.", "Helm: we're out of GravSpace. Guns up!"],
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
    launchH:     ["Carrier: gunboat in the tube. Launch when ready.", "Carrier: you're in the tube, Helm. Launch when ready.", "Coxswain: launch control is ours. Launch when ready."],
    arrivalH:    ["Bridge: dropping out of GravSpace. Helm, she's yours.", "Bridge: normal space. Helm, stand by for orders."],
    recoveredH:  ["Carrier: gunboat recovered. Nice flying.", "Coxswain: we're on the deck. Good flying, Helm."],
    burnH:       [],                     // the captain's orders replace the bridge's burns at the helm
    mainReadyH:  ["Engineering: main gun's charged. Helm, put the bow on the big one.", "Gunnery: main gun's up. Bring the bow around and hold it."],
    helmNag:     ["Carrier: launch, launch, launch!", "Coxswain: we're holding up the line, Helm. Launch!"],
    helmAuto:    ["Carrier: launching you now."],
    helmLaunched:["Coxswain: we're out! Clear of the tube.", "Carrier: gunboat away. Good hunting.", "Coxswain: off the deck and into it."],
    helmClear:   ["Coxswain: clear of the carrier. Coming back to standard.", "Coxswain: we're clear. Standard speed."],
    helmOrder:   ["{who}: come {dir} to {hdg}, {eng}, in {t} s.", "{who}: helm, {dir} to {hdg}, {eng}. {t} seconds.", "{who}: stand by to come {dir} to {hdg}, {eng}, in {t}."],
    helmMet:     ["{who}: very well.", "{who}: steady as she goes. Well done.", "{who}: nicely done, Helm."],
    helmMissed:  ["{who}: that's not what I ordered, Helm.", "{who}: Helm, mind your orders!", "{who}: we were supposed to be on {hdg}."],
    stressWarn:  ["Damage control: she's groaning, ease the turn!", "Damage control: hull stress climbing! Ease off!"],
    stressHit:   ["Damage control: structural damage from that turn! Hull down {dmg}.", "Damage control: frames buckling! Hull down {dmg}."],
    flankWarn:   ["Engineering: we can't hold flank much longer!", "Engineering: engines are over their rating, Helm!"],
    flankDamage: ["Engineering: we burned out a thruster holding flank! {what}.", "Engineering: that's what flank does. {what}."],
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
