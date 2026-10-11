/* Battlelert data: ship, encounters, chatter lines and sound recipes.
   Balance lives here so tuning never touches the simulation code.
   Units: power in MW (MJ per second), stored energy in MJ, time in seconds. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  BL.APP_TAG = "BATTLELERT";
  BL.TICK_RATE = 20;                       // simulation ticks per second

  /* ---------------------------------------------------------------- Ship */
  BL.SHIPS = {
    destroyer: {
      name: "Destroyer",
      hull: 100,
      crew: 6,
      reactorMW: 100,                      // safe output; load above this builds heat
      engineMWperG: 5,                     // engines are wired straight to the reactor
      cruiseG: 2,
      aux: { capacity: 450, rateMW: 40 },  // reserve bank; refills only in GravSpace
      // Systems, listed in their starting priority order (first = highest).
      systems: [
        { id: "life",   name: "Life support", short: "LIFE", kind: "life",   maxMJ: 60,   maxMW: 12, startMJ: 60,  startSet: 4,  drainMW: 3 },
        { id: "shield", name: "Shields",      short: "SHLD", kind: "shield", maxMJ: 160,  maxMW: 70, startMJ: 80,  startSet: 20 },
        { id: "gun1",   name: "Gun 1",        short: "GUN1", kind: "gun",    maxMJ: 100,  maxMW: 40, startMJ: 50,  startSet: 10, gunner: 1 },
        { id: "gun2",   name: "Gun 2",        short: "GUN2", kind: "gun",    maxMJ: 100,  maxMW: 40, startMJ: 50,  startSet: 10, gunner: 2 },
        { id: "gun3",   name: "Gun 3",        short: "GUN3", kind: "gun",    maxMJ: 100,  maxMW: 40, startMJ: 50,  startSet: 10, gunner: 3 },
        { id: "drive",  name: "GravSpace drive", short: "DRIVE", kind: "drive", maxMJ: 3200, maxMW: 60, startMJ: 0, startSet: 0 }
      ],
      gun: { shotMJ: 15, normalInterval: 2.0, fullInterval: 0.5, hitChance: 0.7, damage: 10 },
      hullPerMJ: 0.12                      // hull points lost per MJ of salvo the shields don't stop
    }
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
    jumps: 3,
    arrivalSeconds: 8,                 // calm before the first wave of each jump
    jumpWindowAt: [130, 140, 150],     // seconds after arrival the jump window opens, per jump
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
