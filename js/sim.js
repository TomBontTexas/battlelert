/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert simulation core. Pure JavaScript, no screen code: the page, the test
   harness and any future station all drive the same Mission object.
   Runs on fixed ticks (BL.TICK_RATE per second). Same seed + same inputs = same result. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  /* ------------------------------------------------- Seeded random numbers */
  BL.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    function next() {                       // mulberry32
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      range: function (r) { return Array.isArray(r) ? r[0] + next() * (r[1] - r[0]) : r; },
      int: function (r) { return Array.isArray(r) ? r[0] + Math.floor(next() * (r[1] - r[0] + 1)) : r; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      chance: function (p) { return next() < p; }
    };
  };

  BL.randomSeed = function () { return 1 + Math.floor(Math.random() * 999999); };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? vars[k] : m; });
  }

  /* --------------------------------------------------------------- Mission */
  function Mission(opts) {
    opts = opts || {};
    this.seed = opts.seed || BL.randomSeed();
    this.rng = BL.rng(this.seed);
    this.data = BL.shipFor(opts.classId || "destroyer", opts.tl);
    this.cfg = Object.assign({}, BL.MISSION, { jumps: this.data.mission.jumps, jumpWindowAt: this.data.mission.windows });
    this.phys = BL.PHYSICS;
    this.dt = 1 / BL.TICK_RATE;
    this.quiet = !!opts.quiet;              // harness: skip chatter text and sound cues

    this.route = this.planRoute(!!opts.gunner);
    if (opts.sweep && this.route.length > 1) this.route[1] = "sweep";        // the gunboat tests: sortie 2 sweeps a mine lane
    // A story mission (story.js) flies the systems its story names. The mine lane needs the gun
    // view, so in the engine room it's a minefield. reports: a line to play in each system.
    if (opts.route) this.route = opts.route.map(function (id) { return id === "sweep" && !opts.gunner ? "minefield" : id; });
    this.reports = opts.reports || [];
    this.jumpIndex = 0;
    this.phase = "briefing";                // briefing | arrival | engage | countdown | gravspace | done
    this.t = 0;                             // seconds since arrival in the current system
    this.totalT = 0;
    this.nextId = 1;
    this.log = [];
    this.fx = [];                           // sound cues for the display layer
    this.result = null;
    this.buildShip();
    this.hasDrive = !!this.sys("drive");
    // Gunner station: the player aims one gun (opts.gunner = { weapon, gun }); see gunnery.js.
    this.turret = !opts.gunner ? null : opts.gunner.ring ? new BL.RingTurret(this, opts.gunner) : new BL.Turret(this, opts.gunner);
    // Pilot station: the player at the helm (opts.helm), the gun crew on every gun; see helm.js.
    this.helm = opts.helm && this.turret && this.turret.ring ? new BL.Helm(this) : null;
    this.stats = {
      heatSum: 0, heatTime: 0,
      deliveredMJ: 0, wastedMJ: 0, trips: 0, looks: 0,
      salvos: 0, salvosAnnounced: 0, salvosShielded: 0, surprises: 0, hullLost: 0,
      requests: [], jumps: [], kills: 0, crippledTime: 0,
      calls: [],                            // launch and recovery calls: { type, filled }
      mainShots: 0, mainDamage: 0, bleedMJ: 0,
      squadronsLost: 0,
      burns: [],                            // minefield burns: { met }
      mineStrikes: 0, intercepts: 0, crewDowned: 0,
      strikes: 0, strikesAnnounced: 0, strikesStopped: 0, driveDrainedMJ: 0,
      overloadRun: 0, overloadRunStart: 0,
      longestOverload: { dur: 0, jump: 0, t: 0 },
      damageReports: []
    };
  }
  BL.Mission = Mission;

  Mission.prototype.planRoute = function (gunner) {
    var types = ((gunner && this.data.gunnerEncounters) || this.data.encounters || Object.keys(BL.ENCOUNTERS)).slice(), route = [];
    // At the gun a dreadnought's final system is always the homeworld fortress.
    var last = gunner && this.data.gunnerFinal;
    for (var i = 0; i < this.cfg.jumps; i++) route.push(last && i === this.cfg.jumps - 1 ? last : this.rng.pick(types));
    // On longer routes every encounter type appears at least once.
    if (!last && route.length >= types.length) types.forEach(function (ty, k) {
      if (route.indexOf(ty) < 0) route[(k + this.seed) % route.length] = ty;
    }, this);
    return route;
  };

  Mission.prototype.buildShip = function () {
    var d = this.data;
    this.ship = {
      name: d.name,
      hull: d.hull, hullMax: d.hull,
      // One or more reactors, each with its own load, heat, failsafe and aux bank. The ship-wide
      // numbers below (reactorMax, load, loadPct, heat) are totals / the worst reactor, for displays.
      reactors: d.reactors.map(function (r) {
        return { name: r.name, base: r.mw, max: r.mw, load: 0, loadPct: 0, heat: 0, lastTrip: -99, heatAlarm: false, fresh: 0,
          aux: { mj: r.aux.capacity, cap: r.aux.capacity, rateMW: r.aux.rateMW, out: 0, emptySaid: false } };
      }),
      reactorBase: d.reactorMW, reactorMax: d.reactorMW,
      load: 0, loadPct: 0, heat: 0,
      g: d.cruiseG, gTarget: d.cruiseG, engineMW: d.cruiseG * d.engineMWperG, maxG: d.maxG,
      turnLoss: 0,                      // share of the top turn rate lost to thruster damage (the helm feels it)
      crippled: false, lifeLowSaid: false,
      fresh: { hull: 0, g: 0, turn: 0 }, // damage taken since the last warp space repair
      systems: d.systems.map(function (s) {
        return {
          id: s.id, name: s.name, short: s.short, kind: s.kind, gunner: s.gunner || 0,
          baseMJ: s.maxMJ, maxMJ: s.maxMJ, baseMW: s.maxMW, maxMW: s.maxMW,
          mj: s.startMJ, set: s.startSet, rate: 0, auxRate: 0, drainMW: s.drainMW || 0,
          tripped: false, tripUntil: 0, aux: false, freshMW: 0, reactor: s.reactor || 0, switchUntil: 0,
          // gunner state; tdmg = turret damage (share lost: slide, rate, reach), tfresh = since the last repair
          nextShot: 0, request: null, call: null,
          tdmg: { slide: 0, rate: 0, reach: 0 }, tfresh: { slide: 0, rate: 0, reach: 0 }, turretHits: 0
        };
      })
    };
    this.ship.aux = this.ship.reactors[0].aux;      // single-reactor ships: the aux bank
    this.priority = d.systems.map(function (s) { return s.id; });
  };

  Mission.prototype.sys = function (id) {
    var list = this.ship.systems;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  Mission.prototype.gunCount = function () {
    return this.ship.systems.filter(function (s) { return s.kind === "gun"; }).length;
  };
  Mission.prototype.encounter = function () { return BL.ENCOUNTERS[this.route[this.jumpIndex]]; };
  Mission.prototype.windowAt = function () { return this.windowFor(this.jumpIndex); };
  // Jump window (or carrier recovery) for system i; a minefield shortens it: the captain wants out.
  Mission.prototype.windowFor = function (i) {
    var w = this.cfg.jumpWindowAt[Math.min(i, this.cfg.jumpWindowAt.length - 1)], enc = BL.ENCOUNTERS[this.route[i]];
    return Math.round(w * ((enc && enc.windowScale) || 1));
  };

  /* ---------------------------------------------------------- Player input */
  Mission.prototype.setSetpoint = function (id, mw) {
    var s = this.sys(id); if (!s) return;
    s.set = clamp(Math.round(mw * 2) / 2, 0, s.baseMW);
  };
  Mission.prototype.hasAux = function () { return this.ship.reactors.some(function (r) { return r.aux.cap > 0; }); };
  Mission.prototype.auxFor = function (s) { return this.ship.reactors[s.reactor].aux; };
  // Rewire a capacitor to the next reactor. It draws nothing for 2 s while it switches.
  // Aux banks can't be moved: each feeds only the capacitors on its own reactor.
  Mission.prototype.moveReactor = function (id, to) {
    var n = this.ship.reactors.length, s = this.sys(id);
    if (n < 2 || !s) return false;
    s.reactor = to === undefined ? (s.reactor + 1) % n : clamp(to, 0, n - 1);
    s.switchUntil = this.t + this.phys.switchSeconds; s.rate = 0;
    return true;
  };
  Mission.prototype.toggleAux = function (id) {
    if (!this.hasAux()) return false;
    var s = this.sys(id); if (s) s.aux = !s.aux;
    return s ? s.aux : false;
  };
  Mission.prototype.setPriority = function (order) {
    if (order.length === this.priority.length) this.priority = order.slice();
  };
  Mission.prototype.movePriority = function (id, delta) {
    var i = this.priority.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= this.priority.length) return;
    this.priority.splice(i, 1); this.priority.splice(j, 0, id);
  };
  Mission.prototype.recordLook = function () { this.stats.looks++; };
  Mission.prototype.abandon = function () {
    if (this.phase === "done") return;
    this.say("Captain: all hands, abandon ship!", "bad");
    this.finish("abandoned");
  };

  /* ------------------------------------------------------------ Messaging */
  // now: a line that can't wait (a break order); the voice cuts in with it.
  Mission.prototype.say = function (text, kind, now) {
    if (this.quiet) return;
    this.logSeq = (this.logSeq || 0) + 1;
    this.log.push({ seq: this.logSeq, t: this.totalT, jump: this.jumpIndex + 1, text: text, kind: kind || "info", now: !!now });
    if (this.log.length > 80) this.log.shift();
  };
  Mission.prototype.chat = function (key, vars, kind, now) {
    if (this.quiet || this.hushed(key)) return;
    // At the helm a key ending in H wins, at the gun one ending in G.
    var lines = (this.helm && BL.CHATTER[key + "H"]) || (this.turret && BL.CHATTER[key + "G"]) || BL.CHATTER[key]; if (!lines || !lines.length) return;
    this.say(fill(this.rng.pick(lines), vars), kind, now);
    this.cue("chatter");
  };
  // The helm hears no running commentary (BL.HELM.quiet).
  Mission.prototype.hushed = function (key) { return !!this.helm && BL.HELM.quiet.indexOf(key) >= 0; };
  Mission.prototype.cue = function (name) { if (!this.quiet) this.fx.push(name); };

  /* --------------------------------------------------------------- Phases */
  Mission.prototype.arrive = function () {
    var enc = this.encounter(), r = this.rng;
    this.phase = "arrival";
    this.t = 0;
    this.events = [];
    this.waves = [];
    this.spawnQueue = [];
    this.gunRotor = 0;
    this.nextWaveAt = this.cfg.arrivalSeconds + r.range(enc.firstWave);
    this.nextStragglerAt = enc.stragglers ? this.cfg.arrivalSeconds + r.range(enc.stragglers.first) : Infinity;
    this.nextBurnAt = this.cfg.arrivalSeconds + r.range(enc.burns.every) * 0.6;
    this.driveFullAt = null;
    this.jumpAt = null;
    this.burnUntil = 0;
    this.curBurn = null;
    this.starvedSaid = false;
    // Cruiser and up: the squadron launches near the start of each system and must be
    // recovered before the jump. A squadron left behind is gone for the rest of the mission.
    if (this.squadron !== "lost") this.squadron = "aboard";
    this.recoverCalled = false; this.holdSaid = false;
    this.nextLaunchAt = this.sys("hangar") && !enc.mines && this.squadron === "aboard" ? this.cfg.arrivalSeconds + r.range(this.data.hangar.launchAfter) : Infinity;
    this.hangarMode("launch");
    this.ship.gTarget = this.data.cruiseG;
    var drive = this.sys("drive"); if (drive) drive.mj = 0;
    // Out of warp space, everything is back on its reactor: trips and reactor switches are
    // timed on this system's clock (t restarts at 0), so clear them rather than carry them over.
    this.ship.systems.forEach(function (s) { s.request = null; s.call = null; s.nextShot = 0; s.tripped = false; s.tripUntil = 0; s.switchUntil = 0; });
    this.ship.reactors.forEach(function (rx) { rx.lastTrip = -99; });
    this.jumpStats = { salvos: 0, shielded: 0, hullLost: 0, trips: 0, kills: 0, start: this.totalT };
    this.events.push({ id: this.nextId++, type: "jump", at: this.windowAt(), announceAt: this.windowAt() - this.cfg.jumpWindowNotice, announced: false, visible: true });
    this.cue("arrive");
    if (this.turret) this.turret.reset();
    if (this.helm) this.helm.reset();
    this.chat(this.hasDrive ? "arrival" : "launch", { hdg: this.helm && this.helm.jumpHdg !== null ? BL.hdgText(this.helm.jumpHdg) : "" }, "info");
    this.chat(enc.chat || "briefing", { enemies: BL.plural(enc.enemy), what: enc.what }, "info");
    this.reportAt = this.reports[this.jumpIndex] ? this.cfg.arrivalSeconds + 4 : Infinity;   // the story's report for this system
    this.gunSaid = false; this.spawnedHere = 0;
  };

  // Called by the display after the warp space report (or by the harness).
  Mission.prototype.beginJump = function () {
    if (this.phase === "briefing" || this.phase === "gravspace") this.arrive();
  };

  Mission.prototype.doJump = function () {
    var js = this.jumpStats;
    js.duration = this.totalT - js.start;
    js.onTime = !this.hasDrive || (this.driveFullAt !== null && this.driveFullAt <= this.windowAt() + this.cfg.jumpOnTimeGrace);
    js.encounter = this.route[this.jumpIndex];
    this.stats.jumps.push(js);
    this.events = []; this.waves = [];
    if (this.turret) this.turret.clear();
    this.endBurn();
    this.ship.systems.forEach(function (s) { s.request = null; s.call = null; });
    if (this.hasDrive) this.sys("drive").mj = 0;
    this.ship.reactors.forEach(function (rx) { rx.aux.mj = rx.aux.cap; });   // aux refills only in warp space
    this.ship.gTarget = this.data.cruiseG;
    this.closeOverloadRun();
    this.cue("jump");
    if (!this.hasDrive) this.chat("recovered", null, "good");
    if (this.jumpIndex >= this.cfg.jumps - 1) {
      if (this.sys("buster")) this.say("Bridge: Azurian world dead ahead. Planet buster away!", "good");   // (only a dreadnought carries one)
      this.finish("success");
    } else {
      this.phase = "gravspace";
      this.jumpIndex++;
      this.repairInWarp();
    }
  };

  // Testing: end the mission now as a success scored pct% (the systems not flown count as flown,
  // with nothing in them). Reputation and qualification follow from that score as usual.
  Mission.prototype.testWin = function (pct) {
    if (this.phase === "done") return;
    while (this.stats.jumps.length < this.cfg.jumps) {
      this.stats.jumps.push({ salvos: 0, shielded: 0, hullLost: 0, trips: 0, kills: 0, start: this.totalT, duration: 0, onTime: true,
        encounter: this.route[this.stats.jumps.length] });
    }
    this.jumpIndex = this.cfg.jumps - 1;
    this.finish("success");
    var r = this.result;
    Object.keys(r.parts).forEach(function (k) { r.parts[k] = Math.round(25 * pct / 100); });
    r.score = r.raw = pct; r.testWin = true;
  };

  Mission.prototype.finish = function (outcome) {
    this.phase = "done";
    this.closeOverloadRun();
    this.result = this.helm ? BL.scoreHelm(this, outcome) : this.turret ? BL.scoreGunner(this, outcome) : BL.score(this, outcome);
    this.cue(outcome === "success" ? "win" : "lose");
  };

  /* ----------------------------------------------------------- Scheduler */
  // How many waves come at once (BL.FORCE for our class: 2.4 = two, and a 40% chance of a third).
  // The same at every station: the battle is balanced by the enemy's numbers, never our ratings.
  // The force of an encounter on our class: its own entry in BL.FORCE_ENC, else the class's.
  Mission.prototype.force = function (encId) {
    var c = this.data.classId, e = BL.FORCE_ENC[c];
    var id = encId || this.route[this.jumpIndex];
    var f = (e && e[id]) || (id === "minefield" ? 1 : BL.FORCE[c] || 1);   // (a field's thickness is its own)
    // Our ship's tech level: the forces are set for tech level 6 (the gunboat's 4); an older ship
    // meets fewer of them, a newer one more (BL.TECH.forceStep a level), so lower tech is harder
    // but not hopeless.
    return c === "gunboat" ? f : f * (1 + BL.TECH.forceStep * (this.data.tl - 6));
  };
  // Under 1, it's the chance a wave comes at all when one is due (the system's first always comes).
  Mission.prototype.forceCount = function () {
    var f = this.force(), n = Math.floor(f) + (this.rng.chance(f - Math.floor(f)) ? 1 : 0);
    if (!n && !this.spawnedHere) n = 1;
    this.spawnedHere = (this.spawnedHere || 0) + n;
    return n;
  };
  Mission.prototype.schedule = function () {
    var enc = this.encounter(), r = this.rng, t = this.t;
    // Once the jump window has been open a while, the enemy breaks off (drive hunters at once),
    // so a drive that can't keep up never stalls the mission forever.
    var cutoff = this.windowAt() + (enc.breakOff === undefined ? this.cfg.breakOff : enc.breakOff);
    if (!enc.mines && !enc.sweep && t >= this.nextWaveAt && t < cutoff) {
      this.queueWaves(this.forceCount(), enc);
      this.nextWaveAt = t + r.range(enc.waveEvery);
    }
    // Stragglers: light waves of another encounter type that join the fight (frigate groups).
    if (enc.stragglers && t >= this.nextStragglerAt && t < cutoff) {
      for (var q = this.forceCount(), qi = 0; qi < q; qi++) { var sty = r.pick(enc.stragglers.types); this.queueWaves(1, BL.ENCOUNTERS[sty], sty, "straggler", qi); }
      this.nextStragglerAt = t + r.range(enc.stragglers.every);
    }
    // Groups that were due together come in one after another (BL.MISSION.staggerGap apart).
    while (this.spawnQueue.length && this.spawnQueue[0].at <= t) { var sq = this.spawnQueue.shift(); this.spawnWave(sq.enc, sq.typeId, sq.line); }
    var b = enc.burns;
    // At the helm the captain gives course and engine orders instead of the bridge's burns.
    if (this.helm) this.helm.schedule(t);
    else if (t >= this.nextBurnAt - b.warning) {
      var at = this.nextBurnAt, dur = Math.round(r.range(b.duration)), g = Math.min(this.ship.maxG, Math.round(r.int(b.g) * this.data.gScale));
      this.events.push({ id: this.nextId++, type: "burn", at: at, dur: dur, g: g, announceAt: t, announced: false, visible: true });
      this.nextBurnAt = at + dur + r.range(b.every);
    }
    // Cruiser and up: the bridge calls the launch (launchers must be full), then, near the end,
    // the recovery (arresters must be full).
    var hg = this.data.hangar;
    if (hg && this.squadron === "aboard" && t >= this.nextLaunchAt - hg.lead) {
      var la = this.nextLaunchAt;
      this.events.push({ id: this.nextId++, type: "launch", at: la, dur: hg.window, announceAt: t, announced: false, visible: true });
      this.nextLaunchAt = Infinity;
    }
    if (hg && this.squadron === "out" && !this.recoverCalled && t >= this.windowAt() - hg.recoverBefore - hg.recoverLead) {
      this.recoverCalled = true;
      var ra = Math.max(t + hg.recoverLead, this.windowAt() - hg.recoverBefore);
      this.events.push({ id: this.nextId++, type: "recover", at: ra, dur: hg.recoverWindow, announceAt: t, announced: false, visible: true });
    }
  };

  // n groups due now: the first comes at once, the rest staggerGap apart, so their torpedoes come
  // in a stream rather than one burst the shields can't hold (the same numbers either way).
  Mission.prototype.queueWaves = function (n, enc, typeId, line, first) {
    for (var k = first || 0; k < (first || 0) + n; k++) {
      if (!k) { this.spawnWave(enc, typeId, line); continue; }
      this.spawnQueue.push({ at: this.t + k * this.cfg.staggerGap, enc: enc, typeId: typeId, line: line });
    }
    this.spawnQueue.sort(function (x, y) { return x.at - y.at; });
  };

  // typeId: the encounter this wave belongs to (default: this system's); line: its chatter.
  Mission.prototype.spawnWave = function (enc, typeId, line) {
    var r = this.rng, w = enc.wave, t = this.t;
    // The enemy's own tech level (not ours): toughness and weapons x its factor.
    var tl = r.pick(enc.tl || [5, 6]), f = BL.enemyTlFactor(tl), hp = Math.round(w.hp * f);
    var wave = { id: this.nextId++, type: typeId || this.route[this.jumpIndex], name: enc.enemy, hp: hp, hpMax: hp, spawn: t, lastAt: 0, dead: false, tl: tl, factor: f };
    function torp(size) { var T = BL.TORPEDOES[size] || BL.TORPEDOES.torpedo; return { torpSize: size, mj: Math.round(T.mj * f), travel: T.travel, warn: T.warn }; }
    var n = r.int(w.salvos), at = t + r.range(w.approach);
    for (var i = 0; i < n; i++) {
      if (i > 0) at += r.range(w.salvoGap);
      var surprise = r.chance(enc.surpriseChance);
      // Drive hunters fire drive strikes (mj = CIWS charge needed to stop one); the rest torpedoes
      // of their size, a ship killer every killerEvery-th salvo.
      var T = w.strikes ? { mj: Math.round(r.range(w.salvoMJ) * f), warn: enc.salvoWarning } : torp(w.killerEvery && (i + 1) % w.killerEvery === 0 ? "killer" : w.torp);
      this.events.push(Object.assign({ id: this.nextId++, type: w.strikes ? "strike" : "salvo", wave: wave.id, at: at,
        announceAt: Math.max(t, at - T.warn), announced: false, visible: !surprise }, T));
      // A frigate fires in pairs, a battleship or fortress in threes: equal salvos 0.6 s apart.
      var e1 = this.events[this.events.length - 1];
      for (var v = 1; v < (w.volley || (w.pairs ? 2 : 1)); v++) this.events.push(Object.assign({}, e1, { id: this.nextId++, at: at + 0.6 * v, announceAt: e1.announceAt + 0.6 * v }));
    }
    wave.lastAt = at;
    // Escorts (frigate group) fire their own salvos; `escort` names which one.
    if (w.escortFire) {
      var ef = w.escortFire;
      for (var q = 0; q < ef.count; q++) {
        var ns = r.int(ef.salvos), ea = t + r.range(w.approach) + r.range(ef.start);
        for (var z = 0; z < ns; z++) {
          if (z > 0) ea += r.range(ef.gap);
          var TE = torp(ef.torp);
          this.events.push(Object.assign({ id: this.nextId++, type: "salvo", wave: wave.id, at: ea, escort: q,
            announceAt: Math.max(t, ea - TE.warn), announced: false, visible: true }, TE));
          wave.lastAt = Math.max(wave.lastAt, ea);
        }
      }
    }
    for (var k = 0; k < w.requests; k++) {
      var gun = 1 + (this.gunRotor++ % this.gunCount()), start = t + enc.request.lead + k * 3;
      if (this.turret && this.turret.owns(gun)) continue;     // turret gunners call for power themselves
      this.events.push({ id: this.nextId++, type: "request", wave: wave.id, gun: gun, at: start, dur: Math.round(r.range(enc.request.duration)),
        announceAt: start - enc.request.lead, announced: false, visible: true });
    }
    this.waves.push(wave);
    this.chat(line || "waveIn", { enemy: wave.name }, "info");
  };

  /* ------------------------------------------------------------ The tick */
  Mission.prototype.step = function () {
    if (this.phase !== "arrival" && this.phase !== "engage" && this.phase !== "countdown") return;
    var dt = this.dt;
    this.t += dt; this.totalT += dt;
    // (a gunboat at the helm waits in the carrier's tube until the pilot launches it)
    if (this.phase === "arrival" && this.t >= this.cfg.arrivalSeconds && !(this.helm && this.helm.inTube)) this.phase = "engage";
    if (this.phase !== "arrival") this.schedule();
    if (this.turret) this.turret.step(dt);       // before events: a torpedo shot down never lands
    this.runEvents();
    this.runGunners(dt);
    this.runCalls(dt);
    this.runPilot(dt);
    this.runCapacitors(dt);
    this.runReactor(dt);
    this.runLifeSupport(dt);
    this.runWaves();
    this.runJump();
    this.runEnemyGuns(dt);
    if (this.t >= this.reportAt) { this.reportAt = Infinity; this.say(this.reports[this.jumpIndex], "info"); this.cue("chatter"); }
    if (this.ship.hull <= 0 && this.phase !== "done") {
      this.ship.hull = 0;
      this.say("Damage control: hull failure! We're breaking up!", "bad");
      this.finish("destroyed");
    }
  };

  /* Enemy guns (BL.ENEMY_GUNS): once a wave has closed, each of its gun-carrying ships still in the
     fight fires `rate` shots a second, hitting with `hit`; only the shields stop it, and what gets
     past them hits the hull at hullPerMJ like a torpedo. Range, our motion and aiming come later
     (tuning steps 5 to 7). */
  Mission.prototype.runEnemyGuns = function (dt) {
    if (this.phase !== "engage" && this.phase !== "countdown") return;
    var G = BL.ENEMY_GUNS, self = this, t = this.t;
    this.waves.forEach(function (w) {
      var enc = BL.ENCOUNTERS[w.type];
      if (w.dead || !enc || !enc.guns || t < w.spawn + G.after) return;
      // the share of the wave still fighting: its ships at the gun and the helm, its toughness in the engine room
      var alive = w.ships ? w.ships.filter(function (s) { return !s.dead && s.state !== "leave"; }).length / Math.max(1, w.ships.length) : w.hp / w.hpMax;
      if (alive <= 0) return;
      enc.guns.forEach(function (g) {
        var spec = G[g[0]], n = Math.ceil(g[1] * alive - 1e-9);
        for (var k = 0; k < n; k++) if (self.rng.chance(spec.rate * dt)) {
          var hit = self.rng.chance(G.hit);
          if (self.turret && self.turret.enemyShot) self.turret.enemyShot(w, g[0], hit);
          if (hit) self.gunHit(spec.mj * (w.factor || 1));
        }
      });
    });
  };
  Mission.prototype.gunHit = function (mj) {
    var sh = this.sys("shield"), st = this.stats, js = this.jumpStats, took = Math.min(sh.mj, mj);
    sh.mj -= took; st.gunMJ = (st.gunMJ || 0) + mj; js.gunMJ = (js.gunMJ || 0) + mj;
    if (!this.gunSaid) { this.gunSaid = true; this.say("Tactical: they're in gun range.", "warn"); }
    var over = mj - took; if (over <= 0) return;
    this.gunHull = (this.gunHull || 0) + over * this.data.hullPerMJ;
    if (this.gunHull < 1) return;
    var dmg = Math.floor(this.gunHull); this.gunHull -= dmg;
    this.ship.hull -= dmg; this.ship.fresh.hull += dmg; st.hullLost += dmg; js.hullLost += dmg; st.gunHull = (st.gunHull || 0) + dmg;
    this.cue("hullHit");
  };

  Mission.prototype.runEvents = function () {
    var t = this.t, keep = [];
    for (var i = 0; i < this.events.length; i++) {
      var e = this.events[i];
      if (!e.announced && t >= e.announceAt) {
        e.announced = true;
        if (e.visible) this.announce(e);
      }
      if (t >= e.at && !e.done) {
        e.done = true;
        this.fire(e);
      }
      var endAt = e.at + (e.dur || 0);
      if (!e.done || t < endAt || e.type === "jump") keep.push(e);
    }
    this.events = keep;
  };

  Mission.prototype.announce = function (e) {
    var lead = Math.max(1, Math.round(e.at - this.t));
    if (e.type === "salvo") {
      // At the gun: no call for a ship that's already dead, and one call per burst, not per torpedo.
      if (this.turret) {
        var from = this.turret.shipOf(e);
        if (from && from.dead) return;
        if (this.totalT - (this.lastSalvoCall || -99) < 3) return;
        this.lastSalvoCall = this.totalT;
      }
      this.chat("salvo", { t: lead }, "warn"); if (!this.hushed("salvo")) this.cue("warn");
    }
    else if (e.type === "strike") { this.chat("strike", { t: lead }, "warn"); this.cue("warn"); }
    else if (e.type === "burn") { this.chat("burn", { t: lead, g: e.g, d: e.dur }, "warn"); this.cue("warnBurn"); }
    else if (e.type === "order") {
      this.chat("helmOrder", { who: this.helm.who, dir: e.turn > 0 ? "right" : "left", hdg: BL.hdgText(e.hdg), eng: this.helm.orderWords(e), t: lead }, "warn");
      this.cue("warnBurn");
    }
    else if (e.type === "request") { this.chat("request", { n: e.gun }, "warn"); this.cue("request"); }
    else if (e.type === "launch") { this.chat("launchCall", { t: lead }, "warn"); this.cue("request"); }
    else if (e.type === "recover") { this.chat("recoverCall", { t: lead }, "warn"); this.cue("request"); }
    else if (e.type === "jump") {
      if (this.helm) this.helm.jumpShown = true;
      this.chat(this.hasDrive ? "jumpNotice" : "recoveryNotice", { t: lead, hdg: this.helm && this.helm.jumpHdg !== null ? BL.hdgText(this.helm.jumpHdg) : "" }, "info");
    }
  };

  Mission.prototype.fire = function (e) {
    // In the engine room a wave is its toughness, not ships on screen: a salvo from a wave already
    // part destroyed comes only with the share still fighting (at the gun and the helm a dead
    // ship's torpedoes never launch, ring.js; the enemy guns go the same way, runEnemyGuns).
    if (!this.turret && (e.type === "salvo" || e.type === "strike") && e.wave) {
      var w = null; for (var k = 0; k < this.waves.length; k++) if (this.waves[k].id === e.wave) w = this.waves[k];
      if (w && w.hpMax && !this.rng.chance(Math.max(0, w.hp) / w.hpMax)) { e.cancelled = true; return; }
    }
    if (e.type === "salvo" || e.type === "mine") this.salvoHits(e);
    else if (e.type === "strike") this.strikeHits(e);
    else if (e.type === "order") { if (this.helm) this.helm.beginOrder(e); }
    else if (e.type === "burn") {
      if (this.helm) return;                    // a pilot's warning to engineering: the helm flies the burn itself
      this.endBurn();
      this.ship.gTarget = e.g; this.burnUntil = e.at + e.dur;
      if (this.encounter().mines) this.curBurn = { short: 0, jump: this.jumpIndex + 1 };
    }
    else if (e.type === "launch" || e.type === "recover") { var hg = this.sys("hangar"); if (hg) hg.call = { until: e.at + e.dur, type: e.type }; }
    else if (e.type === "request") {
      var s = this.sys("gun" + e.gun);
      if (s) {
        if (s.request) this.closeRequest(s);
        s.request = { until: e.at + e.dur, wanted: 0, fired: 0, dryCalled: false, jump: this.jumpIndex + 1, t: this.t, gun: e.gun };
        s.nextShot = Math.min(s.nextShot, this.t);
      }
    } else if (e.type === "jump") {
      if (this.hasDrive && this.phase !== "countdown") this.chat("jumpOpen", null, "warn");
    }
  };

  // The engine room's gun crew fires at an incoming torpedo or drive-hunter missile: the class's crew
  // share (BL.CREW_DOWN) x how hard it is to hit x the share of guns charged; a try costs a gun a shot.
  Mission.prototype.crewShootsDown = function (e) {
    var g = this.data.gun, guns = this.ship.systems.filter(function (x) { return x.kind === "gun"; });
    var ready = guns.filter(function (x) { return x.mj >= g.shotMJ && !x.tripped; });
    var down = (BL.TORPEDOES[e.torpSize] || {}).down || 1;
    if (!ready.length || !this.rng.chance(Math.min(0.95, (BL.CREW_DOWN[this.data.classId] || 0) * down * ready.length / guns.length))) return false;
    this.rng.pick(ready).mj -= g.shotMJ;
    return true;
  };
  Mission.prototype.salvoHits = function (e) {
    var sh = this.sys("shield"), st = this.stats, js = this.jumpStats;
    if (this.squadron === "out" && !(this.turret && this.turret.ring) && this.rng.chance(this.data.hangar.intercept)) {
      st.salvos++; js.salvos++; st.intercepts++;
      if (e.visible) { st.salvosAnnounced++; st.salvosShielded++; }
      js.shielded++;
      this.cue("kill");
      this.chat("intercepted", null, "good");
      return;
    }
    // In the engine room the gun crew shoots some down (BL.CREW_DOWN), each with a gun's charged shot.
    if (!this.turret && e.type === "salvo" && this.crewShootsDown(e)) {
      st.salvos++; js.salvos++; st.crewDowned++;
      if (e.visible) { st.salvosAnnounced++; st.salvosShielded++; }
      js.shielded++; e.outcome = "downed";
      this.cue("torpDown");
      if (this.rng.chance(0.3)) this.chat("torpDown", null, "good");
      return;
    }
    // At the helm a torpedo can miss altogether: the captain ordered a break and the pilot made it (helm.js).
    // In the engine room and at the gun the pilot is a crewman: he dodges the share of torpedoes a
    // pilot at the helm does on this class (BL.PILOT_DODGE), as the crew shoots its share down.
    if (this.helm ? this.helm.torpedoArrives(e) : e.type === "salvo" && this.rng.chance(BL.PILOT_DODGE[this.data.classId] || 0)) {
      st.salvos++; js.salvos++; js.dodged = (js.dodged || 0) + 1;
      if (e.visible) { st.salvosAnnounced++; st.salvosShielded++; }
      js.shielded++; e.outcome = "dodged";
      this.cue("torpDown");
      if (this.rng.chance(0.4)) this.chat("dodged", null, "good");
      return;
    }
    var absorbed = Math.min(sh.mj, e.mj), overflow = e.mj - absorbed;
    sh.mj -= absorbed;
    st.salvos++; js.salvos++;
    if (e.visible) st.salvosAnnounced++; else { st.surprises++; this.chat("surprise", null, "bad"); }
    e.outcome = overflow <= 0.5 ? "shield" : "hull";
    if (overflow <= 0.5) {
      if (e.visible) st.salvosShielded++;
      js.shielded++;
      this.cue("shieldHit");
      if (this.turret) this.cue("shieldBoom");
      if (this.rng.chance(0.35)) this.chat("shielded", null, "good");
      return;
    }
    var dmg = Math.max(1, Math.round(overflow * this.data.hullPerMJ));
    this.ship.hull -= dmg; this.ship.fresh.hull += dmg; st.hullLost += dmg; js.hullLost += dmg;
    this.cue("hullHit");
    if (this.turret) { this.cue("shieldBoom"); this.cue("breach"); }
    this.chat("hit", { dmg: dmg }, "bad");
    if (this.rng.chance(Math.min(0.85, overflow / 110))) this.damageSystem();
  };

  // A drive strike: the CIWS stops most of them if it holds the charge; shields don't help.
  // One that gets through drains a slice of the warp drive (the hull is untouched).
  Mission.prototype.strikeHits = function (e) {
    // (drive strikes are always drive hunters', even when they join another fight as stragglers)
    var pd = this.sys("pd"), drive = this.sys("drive"), st = this.stats, drain = BL.ENCOUNTERS.hunters.driveDrain;
    st.strikes++;
    if (e.visible) st.strikesAnnounced++; else this.chat("surprise", null, "bad");
    if (this.squadron === "out" && !(this.turret && this.turret.ring) && this.rng.chance(this.data.hangar.intercept)) {
      st.intercepts++; if (e.visible) st.strikesStopped++;
      this.cue("kill"); this.chat("intercepted", null, "good"); return;
    }
    // In the engine room the gun crew shoots at it too, as the guns do at the gun station.
    if (!this.turret && this.crewShootsDown(e)) {
      if (e.visible) st.strikesStopped++; st.crewDowned = (st.crewDowned || 0) + 1;
      this.cue("torpDown"); return;
    }
    // At the gun the CIWS mounts already fired on it as it came in (ring.js); it got through.
    var seen = this.turret && this.turret.ring;
    if (pd && !seen && pd.mj >= e.mj - 0.5) {
      pd.mj -= e.mj;
      if (!this.rng.chance(BL.GUNNERY.ring.ciws.kill)) { this.cue("pd"); pd = null; }   // it fired and missed
    }
    else if (pd && !seen) { pd.mj = 0; pd = null; }                 // it fired everything it had and missed
    if (pd && !seen) {
      if (e.visible) st.strikesStopped++;
      this.cue("pd");
      if (this.rng.chance(0.4)) this.chat("pdStopped", null, "good");
      return;
    }
    if (drive) {
      var loss = Math.min(drive.mj, drive.maxMJ * drain);
      drive.mj -= loss; st.driveDrainedMJ += loss;
      this.cue("hullHit");
      this.chat("driveHit", { pct: Math.round(drain * 100) }, "bad");
    }
  };

  Mission.prototype.damageSystem = function () {
    var r = this.rng, ship = this.ship, what;
    // Thrusters 20%, a charger 40%, the reactor 40%. Capacitors never shrink: a smaller
    // warp space capacitor would fill sooner and make damage speed up the jump.
    var roll = r.next();
    if (roll < 0.2 && ship.maxG > 1) {
      what = this.damageThrusters();
    } else if (roll < 0.6) {
      var c = r.pick(ship.systems);
      var mw = Math.round(c.maxMW * 0.88 * 2) / 2;
      c.freshMW += c.maxMW - mw; c.maxMW = mw;
      what = c.name + " charger damaged, max rate now " + c.maxMW + " MW";
      if (c.kind === "gun") what += "; its turret " + this.damageTurret(c);
    } else {
      var rx = r.pick(ship.reactors), out = Math.round(rx.max * 0.95);
      rx.fresh += rx.max - out; rx.max = out;
      what = (ship.reactors.length > 1 ? "reactor " + rx.name : "reactor") + " damaged, safe output now " + rx.max + " MW";
      this.totalReactors();
    }
    this.stats.damageReports.push({ jump: this.jumpIndex + 1, what: what });
    this.chat("damaged", { what: what }, "bad");
  };

  // Thruster damage: top speed down 1 G, and the ship turns 15% slower (the helm feels that).
  Mission.prototype.damageThrusters = function () {
    var ship = this.ship, add = Math.min(BL.HELM.turnLoss, 0.6 - ship.turnLoss);
    if (ship.maxG > 1) { ship.maxG -= 1; ship.fresh.g += 1; }
    ship.turnLoss += add; ship.fresh.turn += add;
    return "thrusters damaged, top speed now " + ship.maxG + " G" + (this.helm ? ", turning " + Math.round(ship.turnLoss * 100) + "% slower" : "");
  };

  // Guns sit outside the shields: the hit that damages a gun's charger damages its turret too.
  // Hits take turns (slide, fire rate, range), so no extra random roll changes the mission.
  Mission.prototype.damageTurret = function (s) {
    var D = BL.GUNNERY.damage, k = D.order[s.turretHits++ % D.order.length];
    var add = Math.min(D.loss[k], D.max - s.tdmg[k]);
    s.tdmg[k] += add; s.tfresh[k] += add;
    return turretWords(k, s.tdmg[k]);
  };
  function turretWords(k, lost) {
    var p = Math.round(lost * 100);
    return k === "slide" ? "now slides " + p + "% slower" : k === "rate" ? "now fires " + p + "% slower" : "range now " + p + "% shorter";
  }
  BL.turretWords = turretWords;
  // 1 = undamaged. Slide and range scale down; fire rate scales the time between shots up.
  Mission.prototype.turretFactor = function (s, k) { return 1 - ((s && s.tdmg) ? s.tdmg[k] : 0); };

  /* Damage control: automatic, during warp space transit, on every class. Each transit
     restores half of the damage taken since the last one; the other half is permanent. */
  Mission.prototype.repairInWarp = function () {
    var ship = this.ship, f = ship.fresh, done = [];
    function half(v) { return Math.round(v / 2 * 2) / 2; }
    if (f.hull > 0) { var h = half(f.hull); ship.hull = Math.min(ship.hullMax, ship.hull + h); done.push("hull +" + h + ", now " + Math.round(ship.hull) + " / " + ship.hullMax); }
    ship.reactors.forEach(function (rx) {
      if (rx.fresh > 0) { rx.max += half(rx.fresh); rx.fresh = 0; done.push((ship.reactors.length > 1 ? "reactor " + rx.name : "reactor") + " safe output now " + rx.max + " MW"); }
    });
    this.totalReactors();
    ship.systems.forEach(function (s) {
      if (s.freshMW > 0) { s.maxMW = Math.min(s.baseMW, s.maxMW + half(s.freshMW)); s.freshMW = 0; done.push(s.name + " charger max rate now " + s.maxMW + " MW"); }
      if (s.tfresh) Object.keys(s.tfresh).forEach(function (k) {
        if (s.tfresh[k] <= 0) return;
        s.tdmg[k] = Math.max(0, s.tdmg[k] - s.tfresh[k] / 2); s.tfresh[k] = 0;
        done.push(s.name + " turret " + (s.tdmg[k] > 0.005 ? turretWords(k, s.tdmg[k]) : "fully repaired"));
      });
    });
    if (f.g > 0) { ship.maxG += f.g / 2; done.push("thrusters top speed now " + ship.maxG + " G"); }
    if (f.turn > 0) { ship.turnLoss = Math.max(0, ship.turnLoss - f.turn / 2); if (this.helm) done.push("thrusters turning " + (ship.turnLoss > 0.005 ? Math.round(ship.turnLoss * 100) + "% slower" : "at full rate")); }
    ship.fresh = { hull: 0, g: 0, turn: 0 };
    this.lastRepairs = done;
    if (done.length) this.say("Damage control: repairs complete. Half the damage is fixed; the rest needs a shipyard.", "good");
    return done;
  };

  Mission.prototype.liveWave = function () {
    for (var i = 0; i < this.waves.length; i++) if (!this.waves[i].dead && this.t >= this.waves[i].spawn + 1) return this.waves[i];
    return null;
  };

  Mission.prototype.runGunners = function (dt) {
    var g = this.data.gun, ship = this.ship, t = this.t;
    var target = this.liveWave();
    if (target && this.squadron === "out" && !(this.turret && this.turret.ring)) {   // at the gun, the squadron is flown (ring.js)
      this.hitWave(target, this.data.hangar.dps * dt, 0);
      if (target.dead) target = this.liveWave();
    }
    for (var i = 0; i < ship.systems.length; i++) {
      var s = ship.systems[i];
      if (s.kind !== "gun") continue;
      if (this.turret && this.turret.owns(s.gunner)) continue;   // worked by the turret (player or its AI)
      if (s.request && t >= s.request.until) this.closeRequest(s);
      if (!target) continue;
      if (t < s.nextShot) continue;
      var interval = (s.request ? g.fullInterval : g.normalInterval) / this.turretFactor(s, "rate");
      if (ship.crippled) interval *= 1.6;
      s.nextShot = t + interval * (0.85 + this.rng.next() * 0.3);
      if (s.request) s.request.wanted++;
      if (s.mj >= g.shotMJ) {
        s.mj -= g.shotMJ;
        if (s.request) s.request.fired++;
        this.cue("shot");
        var hit = g.hitChance * (ship.crippled ? 0.6 : 1) * this.turretFactor(s, "slide") * this.turretFactor(s, "reach");
        if (!this.turret) hit *= (BL.CREW_GUNS[this.data.classId] || 1) * ((BL.CREW_GUNS_VS[target.type] || {})[this.data.classId] || 1);   // a real crew's aim
        if (this.rng.chance(hit)) {
          this.hitWave(target, g.damage, s.gunner);
        }
      } else if (s.request && !s.request.dryCalled) {
        s.request.dryCalled = true;
        this.chat("requestDry", { n: s.gunner }, "bad");
      }
    }
  };

  // Damage to a wave. At the gunner station the wave is several ships, so the turret picks one.
  Mission.prototype.hitWave = function (w, dmg, gunner) {
    if (this.turret && this.turret.hitWave(w, dmg, gunner)) return;
    w.hp -= dmg;
    if (w.hp <= 0 && !w.dead) this.killWave(w, gunner);
  };

  Mission.prototype.closeRequest = function (s) {
    var q = s.request; s.request = null;
    if (!q || q.wanted === 0) return;
    q.missed = q.wanted - q.fired;
    q.filled = q.fired >= q.wanted * 0.8;
    this.stats.requests.push(q);
  };

  // gunner 0 = not a gun battery (main gun or squadron); quiet = the caller already said it.
  Mission.prototype.killWave = function (w, gunner, quiet) {
    w.dead = true;
    this.stats.kills++; this.jumpStats.kills++;
    // Its remaining salvos and gun requests never come.
    this.events = this.events.filter(function (e) { return e.wave !== w.id || e.done; });
    var self = this;
    this.ship.systems.forEach(function (s) { if (s.request && !self.liveWaveOtherThan(w)) self.closeRequest(s); });
    this.cue("kill");
    if (!quiet) this.chat(gunner ? "killed" : "killedOther", { n: gunner, enemy: w.name }, "good");
  };
  Mission.prototype.liveWaveOtherThan = function (w) {
    return this.waves.some(function (x) { return x !== w && !x.dead; });
  };

  Mission.prototype.runWaves = function () {
    var t = this.t, self = this;
    this.waves = this.waves.filter(function (w) {
      if (w.dead) return false;
      if (t > w.lastAt + 3) { self.chat("withdrew", { enemy: w.name }, "info"); return false; }
      return true;
    });
  };

  Mission.prototype.runPilot = function (dt) {
    if (this.helm) { this.helm.runEngines(dt); return; }
    var ship = this.ship, perG = this.perG(), enc = this.encounter();
    if (this.burnUntil && this.t >= this.burnUntil) { ship.gTarget = this.data.cruiseG; this.burnUntil = 0; this.endBurn(); }
    if (ship.gWant === undefined) ship.gWant = ship.g;
    ship.gWant += (ship.gTarget - ship.gWant) * (1 - Math.exp(-dt / 0.5));
    ship.g = ship.gWant; ship.starved = false;
    if (enc.mines) {
      // In a minefield the engines get what the capacitors leave of the reactor's safe output.
      var R = ship.reactors, charging = R.map(function () { return 0; });
      for (var i = 0; i < ship.systems.length; i++) charging[ship.systems[i].reactor] += ship.systems[i].rate;
      var avail = Infinity;
      for (var k = 0; k < R.length; k++) avail = Math.min(avail, Math.max(0, R[k].max - charging[k]) * R.length);
      if (ship.gWant * perG > avail) ship.g = avail / perG;
      var short = ship.gWant - ship.g;
      if (short > 0.25 && this.phase !== "arrival") {
        ship.starved = true;
        if (this.curBurn) this.curBurn.short += dt;
        if (!this.starvedSaid) { this.starvedSaid = true; this.chat("starved", null, "bad"); }
        // (At the gunner station the mines are seen and shot instead; starving brings more of them.)
        if (!(this.turret && this.turret.ring) && this.rng.chance(enc.mines.strikePerSec * this.force("minefield") * Math.min(1, short / Math.max(1, ship.gWant)) * dt)) this.mineStrike(enc);
      } else if (short < 0.05) this.starvedSaid = false;
    }
    ship.engineMW = ship.g * perG;
  };
  Mission.prototype.endBurn = function () {
    if (!this.curBurn) return;
    this.stats.burns.push({ met: this.curBurn.short < 0.5, jump: this.curBurn.jump });
    this.curBurn = null;
  };
  // In the engine room the mines aren't seen: the helm weaves through the field, and a mine strikes
  // only when the engines are starved and she can't turn clear. Like a mine at the gun or the helm,
  // it hits the shields first; what gets past them hits the hull at hullPerMJ.
  Mission.prototype.mineStrike = function (enc) {
    var sh = this.sys("shield"), mj = this.rng.range(enc.mines.mj), took = Math.min(sh.mj, mj);
    sh.mj -= took; this.stats.mineStrikes++;
    var dmg = Math.round((mj - took) * this.data.hullPerMJ);
    if (dmg < 1) { this.cue("shieldHit"); this.chat("shielded", null, "good"); return; }
    this.ship.hull -= dmg; this.ship.fresh.hull += dmg;
    this.stats.hullLost += dmg; this.jumpStats.hullLost += dmg;
    this.cue("hullHit");
    this.chat("mineHit", { dmg: dmg }, "bad");
    if (this.rng.chance(0.4)) this.damageSystem();
  };

  /* The main gun fires by itself whenever it is full and a target is up: the whole charge, for
     dmgPerMJ damage per MJ. Hangar calls: the bridge names a window; the capacitor must be full
     in it. The hangar capacitor is the
     launchers while the squadron is aboard (full = launch; the squadron then shoots down some
     salvos and strafes the enemy) and the arresters while it is out (full = recovered). */
  Mission.prototype.runCalls = function (dt) {
    var t = this.t, list = this.ship.systems, hgd = this.data.hangar;
    // At the gunner station (ring view) the gunner fires the main gun; see ring.js.
    var mg = this.sys("main"), tw = mg && !mg.tripped && mg.mj >= mg.maxMJ - 0.5 && !(this.turret && this.turret.firesMain) ? this.liveWave() : null;
    if (tw) {
      var dmg = mg.mj * this.data.mainGun.dmgPerMJ;
      mg.mj = 0;
      this.stats.mainShots++; this.stats.mainDamage += Math.min(dmg, tw.hp);
      tw.hp -= dmg;
      this.cue("main");
      if (tw.hp <= 0) { this.chat("mainKill", { enemy: tw.name }, "good"); this.killWave(tw, 0, true); }
      else this.chat("mainFired", { enemy: tw.name }, "good");
    }
    for (var i = 0; i < list.length; i++) {
      var s = list[i], q = s.call;
      if (!q) continue;
      var full = s.mj >= s.maxMJ - 0.5;
      if (full) {
        s.mj = 0; s.call = null;
        this.stats.calls.push({ type: q.type, filled: true, jump: this.jumpIndex + 1 });
        if (q.type === "launch") {
          this.cue("launch");
          this.squadron = "out"; this.hangarMode("recover");
          this.chat("launched", null, "good");
        } else {
          this.cue("launch");
          this.squadron = "aboard"; this.hangarMode("launch");
          this.chat("recovered2", null, "good");
        }
        if (q.late) this.stats.calls.pop();          // a late recovery was already scored as missed
      } else if (t >= q.until && !q.late) {
        if (q.type === "recover") {
          // The recovery can't be skipped: the call stays open, but it's scored as missed.
          q.late = true;
          this.stats.calls.push({ type: q.type, filled: false, jump: this.jumpIndex + 1 });
          this.chat("recoverLate", null, "bad");
          continue;
        }
        s.call = null;
        this.stats.calls.push({ type: q.type, filled: false, jump: this.jumpIndex + 1 });
        this.chat("launchMissed", null, "bad");
        // A missed launch is called again, if there's still time before the recovery.
        if (q.type === "launch" && t + hgd.retry < this.windowAt() - hgd.recoverBefore - 20) this.nextLaunchAt = t + hgd.retry;
      }
    }
  };

  // Bleed rate (share of stored charge per second), and the power that holds a capacitor full.
  Mission.prototype.bleedOf = function (s) {
    var b = this.phys.bleed; if (!b) return 0;
    return b[s.kind] !== undefined ? b[s.kind] : b.other;
  };
  Mission.prototype.holdMW = function (s) { return s.drainMW + s.mj * this.bleedOf(s); };

  Mission.prototype.hangarMode = function (mode) {
    var s = this.sys("hangar"); if (!s) return;
    s.mode = mode;
    s.name = mode === "launch" ? "Launchers" : "Arresters";
    s.short = mode === "launch" ? "LNCH" : "ARST";
  };

  Mission.prototype.runCapacitors = function (dt) {
    var P = this.phys, ship = this.ship, R = ship.reactors, list = ship.systems, t = this.t;
    // Each aux bank splits its output across the switched capacitors on its reactor that have room.
    var takers = R.map(function () { return 0; }), share = [];
    function feeding(s) { return s.aux && s.mj < s.maxMJ && t >= s.switchUntil; }
    for (var i = 0; i < list.length; i++) if (feeding(list[i])) takers[list[i].reactor]++;
    for (var k = 0; k < R.length; k++) {
      var a = R[k].aux; a.out = 0;
      share[k] = takers[k] && a.mj > 0 ? Math.min(a.rateMW, a.mj / dt) / takers[k] : 0;
    }
    var upK = 1 - Math.exp(-dt / P.rampUpTau), downK = 1 - Math.exp(-dt / P.rampDownTau);
    for (i = 0; i < list.length; i++) {
      var s = list[i];
      var sp = Math.min(s.set, s.maxMW), target, dr = this.holdMW(s);
      if (s.tripped || t < s.switchUntil) { s.rate = 0; target = 0; }
      else if (s.mj >= s.maxMJ - 1e-6) target = Math.min(sp, dr);
      else {
        var wb = s.kind === "drive" ? 0.99 : P.windBackAt;
        var frac = clamp((s.maxMJ - s.mj) / (s.maxMJ * (1 - wb)), 0, 1);
        target = Math.min(sp, dr + sp * Math.max(frac, 0.08));     // drain and bleed come first
      }
      if (target > s.rate) s.rate += Math.min((target - s.rate) * upK + 0.02, P.rampUpSlew * dt, target - s.rate);
      else s.rate += (target - s.rate) * downK;
      if (s.rate < 0.01) s.rate = 0;
      var aux = R[s.reactor].aux;
      s.auxRate = feeding(s) ? share[s.reactor] : 0;
      var room = s.maxMJ - s.mj + dr * dt;
      var fromAux = Math.min(s.auxRate * dt, Math.max(0, room));
      var fromReactor = Math.min(s.rate * dt, Math.max(0, room - fromAux));
      var bleed = s.mj * this.bleedOf(s) * dt;
      s.mj = clamp(s.mj + fromAux + fromReactor - s.drainMW * dt - bleed, 0, s.maxMJ);
      this.stats.bleedMJ += bleed;
      aux.mj = Math.max(0, aux.mj - fromAux);
      aux.out += fromAux / dt;
      this.stats.deliveredMJ += fromReactor;
    }
    for (k = 0; k < R.length; k++) {
      var b = R[k].aux;
      if (takers[k] && b.mj <= 0 && !b.emptySaid) { b.emptySaid = true; this.chat(R.length > 1 ? "auxEmptyR" : "auxEmpty", { r: R[k].name }, "warn"); }
      if (b.mj > 0) b.emptySaid = false;
    }
  };

  Mission.prototype.runReactor = function (dt) {
    var P = this.phys, ship = this.ship, t = this.t, list = ship.systems, R = ship.reactors, multi = R.length > 1;
    var over = false;
    for (var k = 0; k < R.length; k++) {
      var rx = R[k], load = ship.engineMW / R.length;      // engines draw evenly from every reactor
      for (var i = 0; i < list.length; i++) if (list[i].reactor === k) load += list[i].rate;
      rx.load = load;
      rx.loadPct = load / rx.max * 100;
      if (rx.loadPct > 100) {
        rx.heat += (rx.loadPct - 100) * P.heatUpPerPct * dt;
        this.stats.wastedMJ += (load - rx.max) * dt;
        over = true;
      } else rx.heat -= ((100 - rx.loadPct) * P.heatDownPerPct + P.heatDownBase) * dt;
      rx.heat = clamp(rx.heat, 0, 100);
      if (!rx.heatAlarm && rx.heat >= P.alarmHeat) { rx.heatAlarm = true; this.chat(multi ? "heatR" : "heat", { r: rx.name }, "warn"); }
      if (rx.heatAlarm && rx.heat < P.alarmHeat - 15) rx.heatAlarm = false;
      // Failsafe: at max heat, trip the lowest-priority capacitor still drawing on this reactor.
      if (rx.heat >= 100 && t - rx.lastTrip >= P.tripCooldown) {
        var victim = null;
        for (var j = this.priority.length - 1; j >= 0 && !victim; j--) {
          var s = this.sys(this.priority[j]);
          if (s.reactor === k && !s.tripped && s.rate > 0.5) victim = s;
        }
        if (victim) {
          victim.tripped = true; victim.tripUntil = t + P.tripSeconds; victim.rate = 0;
          rx.lastTrip = t;
          this.stats.trips++; this.jumpStats.trips++;
          this.cue("trip");
          this.chat("trip", { sys: victim.name }, "bad");
        }
      }
    }
    if (over) {
      if (this.stats.overloadRun === 0) this.stats.overloadRunStart = t;
      this.stats.overloadRun += dt;
    } else this.closeOverloadRun();
    this.totalReactors();
    if (this.phase !== "arrival") { this.stats.heatSum += ship.heat * dt; this.stats.heatTime += dt; }
    for (var j = 0; j < list.length; j++) {
      var c = list[j];
      if (c.tripped && t >= c.tripUntil) { c.tripped = false; this.cue("reclose"); this.chat("reclose", { sys: c.name }, "info"); }
    }
  };

  // Ship-wide reactor numbers for displays and AI: total output and load, worst load % and heat.
  Mission.prototype.totalReactors = function () {
    var ship = this.ship, R = ship.reactors;
    ship.reactorMax = 0; ship.load = 0; ship.loadPct = 0; ship.heat = 0;
    for (var k = 0; k < R.length; k++) {
      ship.reactorMax += R[k].max; ship.load += R[k].load;
      ship.loadPct = Math.max(ship.loadPct, R[k].loadPct); ship.heat = Math.max(ship.heat, R[k].heat);
    }
  };

  Mission.prototype.closeOverloadRun = function () {
    var st = this.stats;
    if (st.overloadRun > st.longestOverload.dur) st.longestOverload = { dur: st.overloadRun, jump: this.jumpIndex + 1, t: st.overloadRunStart };
    st.overloadRun = 0;
  };

  Mission.prototype.runLifeSupport = function (dt) {
    var life = this.sys("life"), ship = this.ship;
    var frac = life.mj / life.maxMJ;
    if (!ship.lifeLowSaid && frac < 0.3) { ship.lifeLowSaid = true; this.chat("lifeLow", null, "warn"); }
    if (frac > 0.5) ship.lifeLowSaid = false;
    if (!ship.crippled && life.mj <= 0.01) { ship.crippled = true; this.chat("lifeOut", null, "bad"); }
    else if (ship.crippled && frac > 0.2) { ship.crippled = false; this.chat("lifeBack", null, "good"); }
    if (ship.crippled) this.stats.crippledTime += dt;
  };

  Mission.prototype.runJump = function () {
    var drive = this.sys("drive"), t = this.t;
    if (!drive) {                       // gunboat: the carrier recovers it when the sortie timer runs out
      if (this.phase === "engage" && t >= this.windowAt()) this.doJump();
      return;
    }
    var full = drive.mj >= drive.maxMJ - 0.5;
    // Dreadnought: the planet buster must be full too before the final jump.
    if (this.jumpIndex === this.cfg.jumps - 1 && !this.busterFull()) {
      if (full && this.phase === "engage" && t >= this.windowAt() && !this.busterSaid) { this.busterSaid = true; this.chat("busterWait", null, "bad"); }
      full = false;
    }
    // The captain won't jump without the gunboats, unless the hull is down to 20% or less.
    if (full && this.squadron === "out") {
      if (this.ship.hull <= this.ship.hullMax * 0.2 && t >= this.windowAt()) {
        this.squadron = "lost"; this.stats.squadronsLost++;
        var hs = this.sys("hangar"); if (hs) { hs.call = null; hs.name = "Hangar"; hs.short = "HNGR"; hs.mode = "lost"; }
        this.chat("squadronLeft", null, "bad");
      } else {
        if (t >= this.windowAt() && !this.holdSaid) { this.holdSaid = true; this.chat("holdForSquadron", null, "warn"); }
        full = false;
      }
    }
    // At the helm the bow must be on the jump heading too.
    if (full && this.helm && !this.helm.onJumpHeading()) {
      if (t >= this.windowAt() && !this.helm.jumpSaid) { this.helm.jumpSaid = true; this.chat("jumpHeading", { hdg: BL.hdgText(this.helm.jumpHdg) }, "warn"); this.cue("warn"); }
      full = false;
    }
    if (full && this.driveFullAt === null) this.driveFullAt = t;
    if (this.phase === "engage" && full && t >= this.windowAt()) {
      this.phase = "countdown";
      this.jumpAt = t + this.cfg.jumpCountdown;
      this.chat("jumpGo", { t: this.cfg.jumpCountdown }, "good");
    }
    if (this.phase === "countdown" && t >= this.jumpAt) this.doJump();
  };

  /* ------------------------------------------------- Views for the display */
  // Announced demands inside the forecast span, plus ones already under way.
  Mission.prototype.forecast = function () {
    var span = this.cfg.forecastSpan, t = this.t, out = [];
    for (var i = 0; i < this.events.length; i++) {
      var e = this.events[i];
      if (!e.announced || !e.visible || e.type === "jump") continue;
      var inS = e.at - t;
      if (inS > span) continue;
      if (inS + (e.dur || 0) < -0.6) continue;
      if (e.done && (e.type === "launch" || e.type === "recover")) continue;   // shown below while open
      out.push({ id: e.id, type: e.type, in: inS, dur: e.dur || 0, g: e.g, gun: e.gun, mj: e.mj });
    }
    // An open main-gun or launch call stays on the strip until it is met or runs out.
    for (var k = 0; k < this.ship.systems.length; k++) {
      var s = this.ship.systems[k];
      if (s.call) out.push({ id: "call-" + s.id, type: s.call.type, in: 0, dur: Math.max(0, s.call.until - t), open: true, late: !!s.call.late });
    }
    return out;
  };
  // Engine MW per G right now: weaving through a minefield is harder work.
  Mission.prototype.perG = function () {
    var enc = this.encounter();
    return this.data.engineMWperG * (enc && enc.mines ? enc.mines.engineMult : 1);
  };
  Mission.prototype.busterFull = function () {
    var b = this.sys("buster");
    return !b || b.mj >= b.maxMJ - 0.5;
  };
  Mission.prototype.windowIn = function () { return this.windowAt() - this.t; };

  /* ---------------------------------------------------------------- Score */
  BL.score = function (m, outcome) {
    var st = m.stats, ship = m.ship, jumpsDone = st.jumps.length, total = m.cfg.jumps;
    var objective = outcome === "success" ? 1 : 0.5 * jumpsDone / total;
    var condition = outcome === "destroyed" ? 0 : ship.hull / ship.hullMax;
    var efficiency = st.deliveredMJ > 0 ? st.deliveredMJ / (st.deliveredMJ + 4 * st.wastedMJ) : 0;
    var reqFilled = st.requests.filter(function (q) { return q.filled; }).length;
    var onTime = st.jumps.filter(function (j) { return j.onTime; }).length;
    var callsFilled = st.calls.filter(function (c) { return c.filled; }).length;
    var burnsMet = st.burns.filter(function (b) { return b.met; }).length;
    var asked = st.salvosAnnounced + st.requests.length + (m.hasDrive ? jumpsDone : 0) + st.calls.length + st.burns.length + st.strikesAnnounced;
    if (!m.hasDrive) onTime = 0;
    var met = asked ? (st.salvosShielded + reqFilled + onTime + callsFilled + burnsMet + st.strikesStopped) / asked : 0;
    var parts = {
      objective: Math.round(25 * objective),
      condition: Math.round(25 * condition),
      efficiency: Math.round(25 * efficiency),
      demands: Math.round(25 * met)
    };
    var raw = parts.objective + parts.condition + parts.efficiency + parts.demands;
    var lookFactor = Math.pow(1 - m.cfg.lookCostPct / 100, st.looks);
    var worstReq = st.requests.reduce(function (a, q) { return (!a || q.missed > a.missed) ? q : a; }, null);
    return {
      outcome: outcome, seed: m.seed, route: m.route.slice(), jumpsDone: jumpsDone, jumpsTotal: total,
      classId: m.data.classId, className: m.data.className, tl: m.data.tl, hasDrive: m.hasDrive,
      aggression: st.heatTime > 0 ? Math.min(1, st.heatSum / st.heatTime / 50) : 0,
      parts: parts, raw: raw, looks: st.looks, score: Math.round(raw * lookFactor),
      hull: Math.max(0, Math.round(ship.hull)), hullMax: ship.hullMax,
      detail: {
        salvos: st.salvos, salvosAnnounced: st.salvosAnnounced, salvosShielded: st.salvosShielded, surprises: st.surprises,
        requests: st.requests.length, requestsFilled: reqFilled, jumpsOnTime: onTime,
        mainShots: st.mainShots, mainDamage: Math.round(st.mainDamage), bleedMJ: Math.round(st.bleedMJ),
        launchCalls: st.calls.filter(function (c) { return c.type === "launch"; }).length,
        launchFilled: st.calls.filter(function (c) { return c.type === "launch" && c.filled; }).length,
        recoverCalls: st.calls.filter(function (c) { return c.type === "recover"; }).length,
        recoverFilled: st.calls.filter(function (c) { return c.type === "recover" && c.filled; }).length,
        squadronsLost: st.squadronsLost,
        intercepts: st.intercepts, crewDowned: st.crewDowned, mineStrikes: st.mineStrikes,
        burns: st.burns.length, burnsMet: burnsMet,
        strikes: st.strikesAnnounced, strikesStopped: st.strikesStopped, driveDrainedMJ: Math.round(st.driveDrainedMJ),
        trips: st.trips, kills: st.kills, hullLost: st.hullLost, crippledTime: Math.round(st.crippledTime),
        deliveredMJ: Math.round(st.deliveredMJ), wastedMJ: Math.round(st.wastedMJ), efficiencyPct: Math.round(efficiency * 100),
        minutes: Math.round(m.totalT / 6) / 10
      },
      longestOverload: { dur: Math.round(st.longestOverload.dur * 10) / 10, jump: st.longestOverload.jump, t: Math.round(st.longestOverload.t) },
      worstRequest: worstReq ? { gun: worstReq.gun, missed: worstReq.missed, wanted: worstReq.wanted, jump: worstReq.jump, t: Math.round(worstReq.t) } : null,
      jumps: st.jumps.map(function (j) { return { encounter: j.encounter, salvos: j.salvos, shielded: j.shielded, hullLost: j.hullLost, trips: j.trips, kills: j.kills, onTime: j.onTime, seconds: Math.round(j.duration) }; }),
      damage: st.damageReports.slice()
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
