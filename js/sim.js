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
    this.data = BL.shipFor(opts.classId || "destroyer", opts.tl || 4);
    this.cfg = Object.assign({}, BL.MISSION, { jumps: this.data.mission.jumps, jumpWindowAt: this.data.mission.windows });
    this.phys = BL.PHYSICS;
    this.dt = 1 / BL.TICK_RATE;
    this.quiet = !!opts.quiet;              // harness: skip chatter text and sound cues

    this.route = this.planRoute();
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
    this.stats = {
      heatSum: 0, heatTime: 0,
      deliveredMJ: 0, wastedMJ: 0, trips: 0, looks: 0,
      salvos: 0, salvosAnnounced: 0, salvosShielded: 0, surprises: 0, hullLost: 0,
      requests: [], jumps: [], kills: 0, crippledTime: 0,
      overloadRun: 0, overloadRunStart: 0,
      longestOverload: { dur: 0, jump: 0, t: 0 },
      damageReports: []
    };
  }
  BL.Mission = Mission;

  Mission.prototype.planRoute = function () {
    var types = (this.data.encounters || Object.keys(BL.ENCOUNTERS)).slice(), route = [];
    for (var i = 0; i < this.cfg.jumps; i++) route.push(this.rng.pick(types));
    // On longer routes every encounter type appears at least once.
    if (route.length >= types.length) types.forEach(function (ty, k) {
      if (route.indexOf(ty) < 0) route[(k + this.seed) % route.length] = ty;
    }, this);
    return route;
  };

  Mission.prototype.buildShip = function () {
    var d = this.data;
    this.ship = {
      name: d.name,
      hull: d.hull, hullMax: d.hull,
      reactorBase: d.reactorMW, reactorMax: d.reactorMW,
      load: 0, loadPct: 0, heat: 0, lastTrip: -99, heatAlarm: false,
      g: d.cruiseG, gTarget: d.cruiseG, engineMW: d.cruiseG * d.engineMWperG,
      aux: { mj: d.aux.capacity, cap: d.aux.capacity, rateMW: d.aux.rateMW, out: 0 },
      crippled: false, lifeLowSaid: false,
      systems: d.systems.map(function (s) {
        return {
          id: s.id, name: s.name, short: s.short, kind: s.kind, gunner: s.gunner || 0,
          baseMJ: s.maxMJ, maxMJ: s.maxMJ, baseMW: s.maxMW, maxMW: s.maxMW,
          mj: s.startMJ, set: s.startSet, rate: 0, auxRate: 0, drainMW: s.drainMW || 0,
          tripped: false, tripUntil: 0, aux: false,
          // gunner state
          nextShot: 0, request: null
        };
      })
    };
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
  Mission.prototype.windowAt = function () { return this.cfg.jumpWindowAt[Math.min(this.jumpIndex, this.cfg.jumpWindowAt.length - 1)]; };

  /* ---------------------------------------------------------- Player input */
  Mission.prototype.setSetpoint = function (id, mw) {
    var s = this.sys(id); if (!s) return;
    s.set = clamp(Math.round(mw * 2) / 2, 0, s.baseMW);
  };
  Mission.prototype.hasAux = function () { return this.ship.aux.cap > 0; };
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
  Mission.prototype.say = function (text, kind) {
    if (this.quiet) return;
    this.logSeq = (this.logSeq || 0) + 1;
    this.log.push({ seq: this.logSeq, t: this.totalT, jump: this.jumpIndex + 1, text: text, kind: kind || "info" });
    if (this.log.length > 80) this.log.shift();
  };
  Mission.prototype.chat = function (key, vars, kind) {
    if (this.quiet) return;
    var lines = BL.CHATTER[key]; if (!lines) return;
    this.say(fill(this.rng.pick(lines), vars), kind);
    this.cue("chatter");
  };
  Mission.prototype.cue = function (name) { if (!this.quiet) this.fx.push(name); };

  /* --------------------------------------------------------------- Phases */
  Mission.prototype.arrive = function () {
    var enc = this.encounter(), r = this.rng;
    this.phase = "arrival";
    this.t = 0;
    this.events = [];
    this.waves = [];
    this.gunRotor = 0;
    this.nextWaveAt = this.cfg.arrivalSeconds + r.range(enc.firstWave);
    this.nextBurnAt = this.cfg.arrivalSeconds + r.range(enc.burns.every) * 0.6;
    this.driveFullAt = null;
    this.jumpAt = null;
    this.burnUntil = 0;
    this.ship.gTarget = this.data.cruiseG;
    var drive = this.sys("drive"); if (drive) drive.mj = 0;
    this.ship.systems.forEach(function (s) { s.request = null; s.nextShot = 0; });
    this.jumpStats = { salvos: 0, shielded: 0, hullLost: 0, trips: 0, kills: 0, start: this.totalT };
    this.events.push({ id: this.nextId++, type: "jump", at: this.windowAt(), announceAt: this.windowAt() - this.cfg.jumpWindowNotice, announced: false, visible: true });
    this.cue("arrive");
    this.chat(this.hasDrive ? "arrival" : "launch", null, "info");
    this.chat("briefing", { enemy: enc.enemy, what: enc.what }, "info");
  };

  // Called by the display after the GravSpace report (or by the harness).
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
    this.ship.systems.forEach(function (s) { s.request = null; });
    if (this.hasDrive) this.sys("drive").mj = 0;
    this.ship.aux.mj = this.ship.aux.cap;            // aux refills only in GravSpace
    this.ship.gTarget = this.data.cruiseG;
    this.closeOverloadRun();
    this.cue("jump");
    if (!this.hasDrive) {
      this.chat("recovered", null, "good");
      this.finish("success");
    } else if (this.jumpIndex >= this.cfg.jumps - 1) {
      this.say("Bridge: Archonian world dead ahead. Planet buster away!", "good");
      this.finish("success");
    } else {
      this.phase = "gravspace";
      this.jumpIndex++;
    }
  };

  Mission.prototype.finish = function (outcome) {
    this.phase = "done";
    this.closeOverloadRun();
    this.result = BL.score(this, outcome);
    this.cue(outcome === "success" ? "win" : "lose");
  };

  /* ----------------------------------------------------------- Scheduler */
  Mission.prototype.schedule = function () {
    var enc = this.encounter(), r = this.rng, t = this.t;
    if (t >= this.nextWaveAt) {
      this.spawnWave(enc);
      this.nextWaveAt = t + r.range(enc.waveEvery);
    }
    var b = enc.burns;
    if (t >= this.nextBurnAt - b.warning) {
      var at = this.nextBurnAt, dur = Math.round(r.range(b.duration)), g = Math.round(r.int(b.g) * this.data.gScale);
      this.events.push({ id: this.nextId++, type: "burn", at: at, dur: dur, g: g, announceAt: t, announced: false, visible: true });
      this.nextBurnAt = at + dur + r.range(b.every);
    }
  };

  Mission.prototype.spawnWave = function (enc) {
    var r = this.rng, w = enc.wave, t = this.t;
    var th = this.data.threat, hp = Math.round(w.hp * th.hp);
    var wave = { id: this.nextId++, type: this.route[this.jumpIndex], name: enc.enemy, hp: hp, hpMax: hp, spawn: t, lastAt: 0, dead: false };
    var n = r.int(w.salvos), at = t + r.range(w.approach);
    for (var i = 0; i < n; i++) {
      if (i > 0) at += r.range(w.salvoGap);
      var surprise = r.chance(enc.surpriseChance);
      this.events.push({ id: this.nextId++, type: "salvo", wave: wave.id, at: at, mj: Math.round(r.range(w.salvoMJ) * th.dmg),
        announceAt: Math.max(t, at - enc.salvoWarning), announced: false, visible: !surprise });
    }
    wave.lastAt = at;
    for (var k = 0; k < w.requests; k++) {
      var gun = 1 + (this.gunRotor++ % this.gunCount()), start = t + enc.request.lead + k * 3;
      this.events.push({ id: this.nextId++, type: "request", wave: wave.id, gun: gun, at: start, dur: Math.round(r.range(enc.request.duration)),
        announceAt: start - enc.request.lead, announced: false, visible: true });
    }
    this.waves.push(wave);
    this.chat("waveIn", { enemy: wave.name }, "info");
  };

  /* ------------------------------------------------------------ The tick */
  Mission.prototype.step = function () {
    if (this.phase !== "arrival" && this.phase !== "engage" && this.phase !== "countdown") return;
    var dt = this.dt;
    this.t += dt; this.totalT += dt;
    if (this.phase === "arrival" && this.t >= this.cfg.arrivalSeconds) this.phase = "engage";
    if (this.phase !== "arrival") this.schedule();
    this.runEvents();
    this.runGunners(dt);
    this.runPilot(dt);
    this.runCapacitors(dt);
    this.runReactor(dt);
    this.runLifeSupport(dt);
    this.runWaves();
    this.runJump();
    if (this.ship.hull <= 0 && this.phase !== "done") {
      this.ship.hull = 0;
      this.say("Damage control: hull failure! We're breaking up!", "bad");
      this.finish("destroyed");
    }
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
    if (e.type === "salvo") { this.chat("salvo", { t: lead }, "warn"); this.cue("warn"); }
    else if (e.type === "burn") { this.chat("burn", { t: lead, g: e.g, d: e.dur }, "warn"); this.cue("warnBurn"); }
    else if (e.type === "request") { this.chat("request", { n: e.gun }, "warn"); this.cue("request"); }
    else if (e.type === "jump") { this.chat(this.hasDrive ? "jumpNotice" : "recoveryNotice", { t: lead }, "info"); }
  };

  Mission.prototype.fire = function (e) {
    if (e.type === "salvo") this.salvoHits(e);
    else if (e.type === "burn") { this.ship.gTarget = e.g; this.burnUntil = e.at + e.dur; }
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

  Mission.prototype.salvoHits = function (e) {
    var sh = this.sys("shield"), st = this.stats, js = this.jumpStats;
    var absorbed = Math.min(sh.mj, e.mj), overflow = e.mj - absorbed;
    sh.mj -= absorbed;
    st.salvos++; js.salvos++;
    if (e.visible) st.salvosAnnounced++; else { st.surprises++; this.chat("surprise", null, "bad"); }
    if (overflow <= 0.5) {
      if (e.visible) st.salvosShielded++;
      js.shielded++;
      this.cue("shieldHit");
      if (this.rng.chance(0.35)) this.chat("shielded", null, "good");
      return;
    }
    var dmg = Math.max(1, Math.round(overflow * this.data.hullPerMJ));
    this.ship.hull -= dmg; st.hullLost += dmg; js.hullLost += dmg;
    this.cue("hullHit");
    this.chat("hit", { dmg: dmg }, "bad");
    if (this.rng.chance(Math.min(0.85, overflow / 110))) this.damageSystem();
  };

  Mission.prototype.damageSystem = function () {
    var r = this.rng, ship = this.ship, what;
    var roll = r.next();
    if (roll < 0.4) {
      var s = r.pick(ship.systems);
      s.maxMJ = Math.round(s.maxMJ * 0.9); s.mj = Math.min(s.mj, s.maxMJ);
      what = s.name + " capacitor damaged, 10% smaller";
    } else if (roll < 0.8) {
      var c = r.pick(ship.systems);
      c.maxMW = Math.round(c.maxMW * 0.88 * 2) / 2;
      what = c.name + " charger damaged, max rate now " + c.maxMW + " MW";
    } else {
      ship.reactorMax = Math.round(ship.reactorMax * 0.95);
      what = "reactor damaged, safe output now " + ship.reactorMax + " MW";
    }
    this.stats.damageReports.push({ jump: this.jumpIndex + 1, what: what });
    this.chat("damaged", { what: what }, "bad");
  };

  Mission.prototype.liveWave = function () {
    for (var i = 0; i < this.waves.length; i++) if (!this.waves[i].dead && this.t >= this.waves[i].spawn + 1) return this.waves[i];
    return null;
  };

  Mission.prototype.runGunners = function (dt) {
    var g = this.data.gun, ship = this.ship, t = this.t;
    var target = this.liveWave();
    for (var i = 0; i < ship.systems.length; i++) {
      var s = ship.systems[i];
      if (s.kind !== "gun") continue;
      if (s.request && t >= s.request.until) this.closeRequest(s);
      if (!target) continue;
      if (t < s.nextShot) continue;
      var interval = s.request ? g.fullInterval : g.normalInterval;
      if (ship.crippled) interval *= 1.6;
      s.nextShot = t + interval * (0.85 + this.rng.next() * 0.3);
      if (s.request) s.request.wanted++;
      if (s.mj >= g.shotMJ) {
        s.mj -= g.shotMJ;
        if (s.request) s.request.fired++;
        this.cue("shot");
        var hit = g.hitChance * (ship.crippled ? 0.6 : 1);
        if (this.rng.chance(hit)) {
          target.hp -= g.damage;
          if (target.hp <= 0 && !target.dead) this.killWave(target, s.gunner);
        }
      } else if (s.request && !s.request.dryCalled) {
        s.request.dryCalled = true;
        this.chat("requestDry", { n: s.gunner }, "bad");
      }
    }
  };

  Mission.prototype.closeRequest = function (s) {
    var q = s.request; s.request = null;
    if (!q || q.wanted === 0) return;
    q.missed = q.wanted - q.fired;
    q.filled = q.fired >= q.wanted * 0.8;
    this.stats.requests.push(q);
  };

  Mission.prototype.killWave = function (w, gunner) {
    w.dead = true;
    this.stats.kills++; this.jumpStats.kills++;
    // Its remaining salvos and gun requests never come.
    this.events = this.events.filter(function (e) { return e.wave !== w.id || e.done; });
    var self = this;
    this.ship.systems.forEach(function (s) { if (s.request && !self.liveWaveOtherThan(w)) self.closeRequest(s); });
    this.cue("kill");
    this.chat("killed", { n: gunner, enemy: w.name }, "good");
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
    var ship = this.ship;
    if (this.burnUntil && this.t >= this.burnUntil) { ship.gTarget = this.data.cruiseG; this.burnUntil = 0; }
    ship.g += (ship.gTarget - ship.g) * (1 - Math.exp(-dt / 0.5));
    ship.engineMW = ship.g * this.data.engineMWperG;
  };

  Mission.prototype.runCapacitors = function (dt) {
    var P = this.phys, ship = this.ship, aux = ship.aux, list = ship.systems;
    // Aux bank: split its output across the switched capacitors that still have room.
    var takers = 0;
    for (var i = 0; i < list.length; i++) if (list[i].aux && list[i].mj < list[i].maxMJ) takers++;
    var share = takers && aux.mj > 0 ? Math.min(aux.rateMW, aux.mj / dt) / takers : 0;
    aux.out = 0;
    var upK = 1 - Math.exp(-dt / P.rampUpTau), downK = 1 - Math.exp(-dt / P.rampDownTau);
    for (i = 0; i < list.length; i++) {
      var s = list[i];
      var sp = Math.min(s.set, s.maxMW), target;
      if (s.tripped) { s.rate = 0; target = 0; }
      else if (s.mj >= s.maxMJ - 1e-6) target = Math.min(sp, s.drainMW);
      else {
        var wb = s.kind === "drive" ? 0.99 : P.windBackAt;
        var frac = clamp((s.maxMJ - s.mj) / (s.maxMJ * (1 - wb)), 0, 1);
        target = Math.max(sp * Math.max(frac, 0.08), Math.min(sp, s.drainMW));
      }
      if (target > s.rate) s.rate += Math.min((target - s.rate) * upK + 0.02, P.rampUpSlew * dt, target - s.rate);
      else s.rate += (target - s.rate) * downK;
      if (s.rate < 0.01) s.rate = 0;
      s.auxRate = (s.aux && s.mj < s.maxMJ) ? share : 0;
      var room = s.maxMJ - s.mj + s.drainMW * dt;
      var fromAux = Math.min(s.auxRate * dt, Math.max(0, room));
      var fromReactor = Math.min(s.rate * dt, Math.max(0, room - fromAux));
      s.mj = clamp(s.mj + fromAux + fromReactor - s.drainMW * dt, 0, s.maxMJ);
      aux.mj = Math.max(0, aux.mj - fromAux);
      aux.out += fromAux / dt;
      this.stats.deliveredMJ += fromReactor;
    }
    if (takers && aux.mj <= 0 && !this.auxEmptySaid) { this.auxEmptySaid = true; this.chat("auxEmpty", null, "warn"); }
    if (aux.mj > 0) this.auxEmptySaid = false;
  };

  Mission.prototype.runReactor = function (dt) {
    var P = this.phys, ship = this.ship, t = this.t, list = ship.systems;
    var load = ship.engineMW;
    for (var i = 0; i < list.length; i++) load += list[i].rate;
    ship.load = load;
    ship.loadPct = load / ship.reactorMax * 100;
    if (ship.loadPct > 100) {
      ship.heat += (ship.loadPct - 100) * P.heatUpPerPct * dt;
      this.stats.wastedMJ += (load - ship.reactorMax) * dt;
      if (this.stats.overloadRun === 0) this.stats.overloadRunStart = t;
      this.stats.overloadRun += dt;
    } else {
      ship.heat -= ((100 - ship.loadPct) * P.heatDownPerPct + P.heatDownBase) * dt;
      this.closeOverloadRun();
    }
    ship.heat = clamp(ship.heat, 0, 100);
    if (this.phase !== "arrival") { this.stats.heatSum += ship.heat * dt; this.stats.heatTime += dt; }
    if (!ship.heatAlarm && ship.heat >= P.alarmHeat) { ship.heatAlarm = true; this.chat("heat", null, "warn"); }
    if (ship.heatAlarm && ship.heat < P.alarmHeat - 15) ship.heatAlarm = false;

    // Failsafe: at max heat, trip the lowest-priority capacitor still on the reactor.
    if (ship.heat >= 100 && t - ship.lastTrip >= P.tripCooldown) {
      var victim = null;
      for (var k = this.priority.length - 1; k >= 0 && !victim; k--) {
        var s = this.sys(this.priority[k]);
        if (!s.tripped && s.rate > 0.5) victim = s;
      }
      if (victim) {
        victim.tripped = true; victim.tripUntil = t + P.tripSeconds; victim.rate = 0;
        ship.lastTrip = t;
        this.stats.trips++; this.jumpStats.trips++;
        this.cue("trip");
        this.chat("trip", { sys: victim.name }, "bad");
      }
    }
    for (var j = 0; j < list.length; j++) {
      var c = list[j];
      if (c.tripped && t >= c.tripUntil) { c.tripped = false; this.cue("reclose"); this.chat("reclose", { sys: c.name }, "info"); }
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
      out.push({ id: e.id, type: e.type, in: inS, dur: e.dur || 0, g: e.g, gun: e.gun, mj: e.mj });
    }
    return out;
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
    var asked = st.salvosAnnounced + st.requests.length + (m.hasDrive ? jumpsDone : 0);
    if (!m.hasDrive) onTime = 0;
    var met = asked ? (st.salvosShielded + reqFilled + onTime) / asked : 0;
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
