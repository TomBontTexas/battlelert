/* Battlelert data: ship classes, encounters, chatter lines and sound recipes.
   Balance lives here so tuning never touches the simulation code.
   Units: power in MW (MJ per second), stored energy in MJ, time in seconds. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  BL.APP_TAG = "BATTLELERT";
  BL.TICK_RATE = 20;                       // simulation ticks per second

  /* ------------------------------------------------------- Ship classes
     Nine classes, smallest to largest. `built` classes can be offered as jobs; the rest
     arrive in later steps. Each ship's numbers are its tech-level-4 values: BL.shipFor()
     scales them for the tech level on the job offer.
     threat: multipliers on encounter salvo damage (dmg) and enemy toughness (hp).
     gScale: multiplier on the G of announced burns (small ships burn harder).
     maxG: thruster top speed; burns never exceed it, and thruster damage lowers it by 1 G.
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
      aux: { capacity: 0, rateMW: 0 }, hullPerMJ: 0.3, threat: { dmg: 0.35, hp: 0.4 },
      mission: { jumps: 3, windows: [70, 80, 90] }, encounters: ["raiders", "interceptors"],
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
    { n: 5, id: "lightCruiser", name: "Light Cruiser", built: false, baseRep: 550 },
    { n: 6, id: "cruiser", name: "Cruiser", built: false, baseRep: 662 },
    { n: 7, id: "heavyCruiser", name: "Heavy Cruiser", built: false, baseRep: 775 },
    { n: 8, id: "battleship", name: "Battleship", built: false, baseRep: 887 },
    { n: 9, id: "dreadnought", name: "Dreadnaught", built: false, baseRep: 1000 }
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
    return {
      classId: c.id, className: c.name, n: c.n, tl: tl || 4,
      name: c.name, hull: c.hull, crew: c.crew,
      reactorMW: r(c.reactorMW * f), engineMWperG: c.engineMWperG, cruiseG: c.cruiseG, maxG: c.maxG, gScale: c.gScale,
      aux: { capacity: r(c.aux.capacity * f), rateMW: r(c.aux.rateMW * f) },
      hullPerMJ: c.hullPerMJ, threat: c.threat, mission: c.mission, encounters: c.encounters,
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
    tripCooldown: 1.5,      // min seconds between failsafe trips
    alarmHeat: 80           // heat alarm sounds above this
  };

  /* ------------------------------------------------------------ Mission */
  BL.MISSION = {
    arrivalSeconds: 8,                 // calm before the first wave of each jump
    jumpWindowNotice: 40,              // "Jump window in 40 s"
    jumpOnTimeGrace: 5,                // drive full within this many seconds of the window = on time
    jumpCountdown: 3,
    forecastSpan: 15,                  // seconds shown on the forecast strip
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
    }
  };

  /* ------------------------------------------------------------ Chatter
     Several lines per event; {placeholders} are filled in by the simulation. */
  BL.CHATTER = {
    launch:      ["Coxswain: launch! We're clear of the carrier.", "Carrier: gunboat away. Good hunting.", "Coxswain: off the deck and into it."],
    recoveryNotice: ["Carrier: recovery in {t} s. Hold on out there.", "Coxswain: carrier picks us up in {t} seconds."],
    recovered:   ["Carrier: gunboat recovered. Well flown.", "Coxswain: we're on the deck. Nice work, Engineering."],
    arrival:     ["Bridge: dropping out of GravSpace. Drive is empty.", "Bridge: we're out of GravSpace. Start charging the drive, Engineering.", "Helm: normal space. Drive reads empty."],
    briefing:    ["Tactical: expect {enemy}s. {what}.", "Tactical: scopes show {enemy}s on approach."],
    waveIn:      ["Tactical: {enemy} on scope.", "Tactical: new contacts, {enemy}.", "Tactical: {enemy} closing."],
    salvo:       ["Tactical: enemy salvo in {t} s.", "Tactical: incoming fire, {t} seconds.", "Tactical: they're locking on. Salvo in {t}."],
    burn:        ["Helm: evasive burn in {t} s, {g} G for {d} s.", "Helm: hard burn coming, {g} G in {t} seconds.", "Helm: evading in {t}. {g} G, {d} seconds."],
    request:     ["Gunner {n}: requesting full battery!", "Gunner {n}: need full power on my gun!", "Gunner {n}: target locked, give me everything!"],
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
    auxEmpty:    ["Aux bank is empty."]
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
    win:      { ch: "fx",    wave: "triangle", f0: 523,  f1: 1046, a: 0.01,  s: 0.25, d: 0.4,  vol: 0.22, repeat: 3, gap: 0.18 },
    lose:     { ch: "fx",    wave: "sawtooth", f0: 300,  f1: 50,   a: 0.01,  s: 0.8,  d: 0.8,  vol: 0.25, noise: 0.3 }
  };
})(typeof window !== "undefined" ? window : globalThis);
