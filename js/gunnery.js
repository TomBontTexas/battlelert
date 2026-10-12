/* Battlelert gunner station: the turret. Pure simulation, no screen code, stepped by the
   Mission it belongs to (Mission.step calls turret.step before the events run).
   The engine room sees a wave as one pool of hit points; here it is several ships, and each
   salvo is a torpedo launched by one of them. The player slides the turret and fires straight
   up; a bolt hits the first ship or torpedo it reaches. A torpedo shot down never lands. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // opts: { weapon: "pulse" | "rail" | "ion", gun: 1 } (gun = the battery the player aims)
  function Turret(m, opts) {
    this.m = m;
    this.G = BL.GUNNERY;
    this.weaponId = BL.WEAPONS[opts.weapon] ? opts.weapon : "pulse";
    this.w = BL.WEAPONS[this.weaponId];
    this.gunNo = opts.gun || 1;
    this.gunId = "gun" + this.gunNo;
    this.rng = BL.rng((m.seed ^ 0x5bd1e995) >>> 0);
    this.x = 0.5; this.aimX = 0.5; this.dir = 0;
    this.firing = false; this.nextShot = 0; this.dryCueAt = 0; this.callReadyAt = 0;
    this.ships = []; this.torps = []; this.bolts = []; this.effects = [];
    this.nextId = 1;
    this.stats = { shots: 0, hits: 0, torpHits: 0, torps: 0, downed: 0, ships: 0, kills: 0, damage: 0, dryTime: 0, calls: 0, hullTorps: 0 };
    this.jumps = [];                    // per sortie / system: the same counts
  }
  BL.Turret = Turret;

  Turret.prototype.gun = function () { return this.m.sys(this.gunId); };

  /* ---------------------------------------------------------- Player input */
  Turret.prototype.aimAt = function (x) { this.aimX = clamp(x, 0.03, 0.97); this.dir = 0; };
  Turret.prototype.setDir = function (d) { this.dir = d; if (!d) this.aimX = this.x; };
  Turret.prototype.trigger = function (on) { this.firing = !!on; };
  // CALL FOR POWER: a rapid-fire request to the engineer, like the ones AI gunners make.
  Turret.prototype.callPower = function () {
    var m = this.m, s = this.gun(), t = m.t;
    if (!s || s.request || t < this.callReadyAt || !this.live()) return false;
    s.request = { until: t + this.G.call.seconds, wanted: 0, fired: 0, dryCalled: false, jump: m.jumpIndex + 1, t: t, gun: this.gunNo, player: true };
    this.callReadyAt = s.request.until + this.G.call.cooldown;
    this.stats.calls++;
    m.cue("request");
    m.chat("powerCall", null, "good");
    return true;
  };
  Turret.prototype.callState = function () {
    var s = this.gun(), t = this.m.t;
    if (s && s.request) return { state: "on", left: s.request.until - t };
    if (t < this.callReadyAt) return { state: "wait", left: this.callReadyAt - t };
    return { state: "ready", left: 0 };
  };
  Turret.prototype.live = function () { var p = this.m.phase; return p === "arrival" || p === "engage" || p === "countdown"; };

  /* ------------------------------------------------------------- Lifecycle */
  Turret.prototype.reset = function () {
    this.clear();
    this.cur = { ships: 0, kills: 0, torps: 0, downed: 0, shots: 0, hits: 0, hullTorps: 0 };
    this.jumps[this.m.jumpIndex] = this.cur;
    // Timers run on the system's clock, which restarts at 0 on every launch.
    this.callReadyAt = 0; this.nextShot = 0;
  };
  Turret.prototype.clear = function () {
    this.ships = []; this.torps = []; this.bolts = [];
    this.firing = false; this.dir = 0; this.aimX = this.x;
  };
  function bump(self, key, n) { self.stats[key] += n || 1; if (self.cur && self.cur[key] !== undefined) self.cur[key] += n || 1; }

  // A new wave arrives as a group of ships; its toughness is split between them.
  Turret.prototype.spawnShips = function (wave) {
    var look = this.G.looks[wave.type] || this.G.looks.raiders, r = this.rng, t = this.m.t;
    var n = r.int(look.count), hp = wave.hpMax / n, list = [];
    var groupPhase = r.next() * Math.PI * 2, groupPeriod = r.range(look.period);
    var span = Math.min(0.78, n * (look.w + 0.08)), left = 0.5 - span / 2 + (r.next() - 0.5) * (0.9 - span) * 0.5;
    for (var i = 0; i < n; i++) {
      var homeX = n === 1 ? 0.5 : left + span * (i + 0.5) / n;
      var s = {
        id: this.nextId++, wave: wave.id, type: wave.type, name: look.ship, w: look.w, h: look.h,
        hp: hp, hpMax: hp, homeX: homeX, x: homeX, y: -0.08 - r.next() * 0.08,
        stationY: r.range(look.band), sway: look.sway * (look.formation ? 1 : 0.7 + r.next() * 0.6),
        period: look.formation ? groupPeriod : r.range(look.period),
        phase: look.formation ? groupPhase : r.next() * Math.PI * 2,
        dive: look.dive, diveAt: t + 3 + r.next() * 4, diveUntil: 0,
        born: t, state: "enter", ionUntil: 0, flashAt: -9, dead: false
      };
      list.push(s); this.ships.push(s);
    }
    wave.ships = list;
    bump(this, "ships", n);
    // Each of the wave's salvos is a torpedo from one of its ships, in turn.
    var k = 0;
    this.m.events.forEach(function (e) {
      if (e.wave === wave.id && (e.type === "salvo" || e.type === "strike")) e.shipIdx = k++ % n;
    });
  };

  /* ---------------------------------------------------------------- Tick */
  Turret.prototype.step = function (dt) {
    var m = this.m, t = m.t, G = this.G, self = this;
    var crippled = m.ship.crippled;
    // New waves become ships; waves that withdrew fly off.
    m.waves.forEach(function (w) { if (!w.ships && !w.dead) self.spawnShips(w); });
    this.ships.forEach(function (s) {
      if (s.state !== "leave" && !s.dead && !m.waves.some(function (w) { return w.id === s.wave; })) s.state = "leave";
    });

    // Turret traverse: keys push the aim point along; it never slides faster than its drive.
    var trav = G.traverse * (crippled ? 0.7 : 1);
    if (this.dir) this.aimX = clamp(this.x + this.dir * trav * 0.25, 0.03, 0.97);
    var dx = this.aimX - this.x, mv = trav * dt;
    this.x += Math.abs(dx) <= mv ? dx : (dx > 0 ? mv : -mv);

    this.moveShips(dt);
    this.launchTorpedoes();
    this.fire(dt);
    this.moveBolts(dt);
    this.landTorpedoes();
    var now = m.totalT;
    this.effects = this.effects.filter(function (f) { return now - f.at < 1.6; });
  };

  Turret.prototype.moveShips = function (dt) {
    var t = this.m.t, keep = [];
    for (var i = 0; i < this.ships.length; i++) {
      var s = this.ships[i];
      if (s.dead) continue;
      var swing = Math.sin((t - s.born) * 2 * Math.PI / s.period + s.phase);
      var tx = clamp(s.homeX + s.sway * swing, s.w / 2 + 0.02, 1 - s.w / 2 - 0.02);
      if (s.state === "leave") {
        s.y -= 0.35 * dt;
        if (s.y < -0.2) continue;
      } else {
        var ty = s.stationY;
        // Divers swoop down now and then, into short-range weapons' reach.
        if (s.dive) {
          if (t >= s.diveAt && !s.diveUntil) s.diveUntil = t + 2.2;
          if (s.diveUntil) {
            var p = 1 - (s.diveUntil - t) / 2.2;
            if (p >= 1) { s.diveUntil = 0; s.diveAt = t + 3 + this.rng.next() * 4; }
            else ty += s.dive * Math.sin(p * Math.PI);
          }
        }
        if (s.state === "enter") { s.y += Math.min(0.5 * dt, ty - s.y); if (s.y >= ty - 0.005) s.state = "hold"; }
        else s.y += (ty - s.y) * Math.min(1, dt * 3);
      }
      s.x += (tx - s.x) * Math.min(1, dt * 4);
      keep.push(s);
    }
    this.ships = keep;
  };

  Turret.prototype.shipOf = function (e) {
    for (var i = 0; i < this.m.waves.length; i++) {
      var w = this.m.waves[i];
      if (w.id === e.wave) return w.ships ? w.ships[e.shipIdx || 0] : null;
    }
    return null;
  };

  // A salvo becomes a torpedo `travel` seconds before it lands. If the ship meant to fire it is
  // dead or gone, it never comes. An ionized ship launches late and weak.
  Turret.prototype.launchTorpedoes = function () {
    var m = this.m, t = m.t, G = this.G, self = this;
    m.events.forEach(function (e) {
      if ((e.type !== "salvo" && e.type !== "strike") || e.done || e.torp) return;
      if (t < e.at - G.torpedo.travel) return;
      var s = self.shipOf(e);
      if (!s || s.dead || s.state === "leave") { e.done = true; e.cancelled = true; e.visible = false; return; }
      var ion = self.w.ion;
      if (ion && t < s.ionUntil && !e.ionized) {
        e.ionized = true; e.at += ion.delay; e.mj = Math.round(e.mj * ion.salvoMult);
        if (t < e.at - G.torpedo.travel) return;          // launches later
      }
      var torp = { id: self.nextId++, ev: e, x0: s.x, y0: s.y + s.h / 2, x1: 0.22 + self.rng.next() * 0.56, y1: G.turretY + 0.02, t0: t, t1: e.at, x: s.x, y: s.y + s.h / 2, weak: !!e.ionized };
      e.torp = torp;
      self.torps.push(torp);
      bump(self, "torps");
      m.cue("torpLaunch");
    });
  };

  Turret.prototype.fire = function (dt) {
    var m = this.m, t = m.t, s = this.gun(), w = this.w;
    if (!s) return;
    if (s.request && t >= s.request.until) m.closeRequest(s);
    if (!this.firing || !this.live() || t < this.nextShot) return;
    if (s.mj >= w.shotMJ) {
      s.mj -= w.shotMJ;
      this.nextShot = t + w.interval * (m.ship.crippled ? 1.6 : 1);
      if (s.request) { s.request.wanted++; s.request.fired++; }
      this.bolts.push({ id: this.nextId++, x: this.x, y: this.G.turretY - 0.03, y0: this.G.turretY - 0.03, born: m.totalT });
      bump(this, "shots");
      m.cue(this.weaponId);
    } else {
      this.stats.dryTime += dt;
      if (s.request && t >= this.nextShot) { s.request.wanted++; this.nextShot = t + w.interval; }
      if (m.totalT >= this.dryCueAt) { this.dryCueAt = m.totalT + 0.45; m.cue("dry"); }
    }
  };

  // Bolts fly straight up; each tick sweeps from where it was to where it is, so fast rail
  // slugs can't skip through a ship. The nearest thing in the sweep takes the hit.
  Turret.prototype.moveBolts = function (dt) {
    var w = this.w, G = this.G, keep = [], top = G.turretY - w.reach;
    for (var i = 0; i < this.bolts.length; i++) {
      var b = this.bolts[i], yOld = b.y, yNew = b.y - w.speed * dt, best = null, bestY = -1;
      for (var k = 0; k < this.torps.length; k++) {
        var tp = this.torps[k], hs = G.torpedo.size;
        if (Math.abs(tp.x - b.x) <= hs + 0.006 && tp.y + hs >= yNew && tp.y - hs <= yOld && tp.y > bestY) { best = { torp: tp }; bestY = tp.y; }
      }
      for (k = 0; k < this.ships.length; k++) {
        var s = this.ships[k];
        if (s.dead || s.state === "leave" || s.y < -0.02) continue;
        if (Math.abs(s.x - b.x) <= s.w / 2 + 0.004 && s.y + s.h / 2 >= Math.max(yNew, top) && s.y - s.h / 2 <= yOld && s.y > bestY) { best = { ship: s }; bestY = s.y; }
      }
      if (best) {
        bump(this, "hits");
        if (best.torp) this.downTorpedo(best.torp, b);
        else this.hitShip(best.ship, b);
        continue;
      }
      b.y = yNew;
      if (b.y > top && b.y > -0.05) keep.push(b);
      else this.effects.push({ type: "fizzle", x: b.x, y: Math.max(top, 0), at: this.m.totalT });
    }
    this.bolts = keep;
  };

  Turret.prototype.downTorpedo = function (tp, b) {
    var m = this.m, e = tp.ev;
    e.done = true; e.downed = true;
    this.torps = this.torps.filter(function (x) { return x !== tp; });
    bump(this, "downed"); bump(this, "torpHits");
    this.effects.push({ type: "torpBoom", x: tp.x, y: tp.y, at: m.totalT });
    m.cue("torpDown");
    if (this.rng.chance(0.3)) m.chat("torpDown", null, "good");
  };

  Turret.prototype.hitShip = function (s, b) {
    var m = this.m, w = this.w, bonus = w.best.indexOf(s.type) >= 0 ? this.G.bonus : 1;
    if (w.ion) s.ionUntil = m.t + w.ion.seconds;
    s.flashAt = m.totalT;
    this.effects.push({ type: "spark", x: b ? b.x : s.x, y: s.y + s.h / 2, at: m.totalT, weapon: this.weaponId });
    m.cue("shipHit");
    this.damageShip(s, w.damage * bonus, 0, true);
  };

  // Damage one ship; the wave's pool drops with it. The last ship down kills the wave.
  Turret.prototype.damageShip = function (s, dmg, gunner, mine) {
    var m = this.m, wave = null;
    for (var i = 0; i < m.waves.length; i++) if (m.waves[i].id === s.wave) wave = m.waves[i];
    var dealt = Math.min(dmg, s.hp);
    s.hp -= dealt;
    if (mine) bump(this, "damage", dealt);
    if (wave) wave.hp -= dealt;
    if (s.hp > 0.001) return;
    s.dead = true;
    if (mine) bump(this, "kills");
    this.effects.push({ type: "boom", x: s.x, y: s.y, at: m.totalT, size: s.w });
    var rest = wave ? wave.ships.filter(function (x) { return !x.dead; }).length : 0;
    if (wave && !rest && !wave.dead) { wave.hp = 0; m.killWave(wave, gunner); }
    else { m.cue("kill"); if (mine && this.rng.chance(0.45)) m.chat("shipKill", { enemy: s.name }, "good"); }
  };

  // Damage from anyone else (AI gunners, the squadron): it lands on one of the wave's ships.
  Turret.prototype.hitWave = function (w, dmg, gunner) {
    if (!w.ships) return false;
    var live = w.ships.filter(function (s) { return !s.dead && s.state !== "leave"; });
    if (!live.length) return true;
    this.damageShip(live[Math.floor(this.rng.next() * live.length)], dmg, gunner, false);
    return true;
  };

  // Torpedoes fly on a straight line to land exactly when their salvo does. Once the
  // simulation has fired the salvo (shields or hull), the torpedo is gone.
  Turret.prototype.landTorpedoes = function () {
    var m = this.m, t = m.t, keep = [], self = this;
    this.torps.forEach(function (tp) {
      var e = tp.ev;
      if (e.done) {
        if (!e.downed) {
          self.effects.push({ type: e.outcome === "hull" ? "hullHit" : "shieldHit", x: tp.x1, y: tp.y1, at: m.totalT });
          if (e.outcome === "hull") bump(self, "hullTorps");
        }
        return;
      }
      // Its wave was destroyed: the simulation dropped the salvo, so the torpedo blows up.
      if (m.events.indexOf(e) < 0) { self.effects.push({ type: "torpBoom", x: tp.x, y: tp.y, at: m.totalT }); return; }
      tp.t1 = e.at;
      var p = clamp((t - tp.t0) / Math.max(0.1, tp.t1 - tp.t0), 0, 1);
      tp.x = tp.x0 + (tp.x1 - tp.x0) * p; tp.y = tp.y0 + (tp.y1 - tp.y0) * p;
      keep.push(tp);
    });
    this.torps = keep;
  };

  /* --------------------------------------------------------------- Score
     Four parts like the engine room's: objective and ship condition are the same; accuracy
     (hits per shot, torpedoes included) and threats stopped (ships destroyed and torpedoes
     shot down, out of everything that came at you) replace efficiency and demands met. */
  BL.scoreGunner = function (m, outcome) {
    var r = BL.score(m, outcome), st = m.turret.stats;
    var accuracy = st.shots ? st.hits / st.shots : 0;
    var threats = st.ships + st.torps ? (st.kills + st.downed) / (st.ships + st.torps) : 0;
    r.station = "gunner";
    r.weapon = m.turret.weaponId;
    r.parts = { objective: r.parts.objective, condition: r.parts.condition, accuracy: Math.round(25 * accuracy), threats: Math.round(25 * threats) };
    r.raw = r.parts.objective + r.parts.condition + r.parts.accuracy + r.parts.threats;
    r.score = Math.round(r.raw * Math.pow(1 - m.cfg.lookCostPct / 100, r.looks));
    r.gunner = {
      shots: st.shots, hits: st.hits, accuracyPct: Math.round(accuracy * 100), ships: st.ships, kills: st.kills,
      torps: st.torps, downed: st.downed, hullTorps: st.hullTorps, damage: Math.round(st.damage), dryTime: Math.round(st.dryTime), calls: st.calls,
      jumps: m.turret.jumps.map(function (j) { return j ? Object.assign({}, j) : null; })
    };
    return r;
  };

  /* ------------------------------------------------------------ AI gunner
     Plays the turret for headless tests: shoots down a torpedo that is close to landing,
     otherwise leads the nearest ship in reach; calls for power when the gun runs low. */
  function AIGunner(skill) { this.skill = skill === undefined ? 0.8 : skill; this.next = 0; this.jitter = 0; }
  BL.AIGunner = AIGunner;
  AIGunner.prototype.think = function (m) {
    var tu = m.turret; if (!tu || m.totalT < this.next) return;
    this.next = m.totalT + 0.1;
    var w = tu.w, G = tu.G, top = G.turretY - w.reach, target = null, tx = tu.x, best = 1e9;
    tu.torps.forEach(function (tp) {
      var left = tp.t1 - m.t;
      if (left < 2 && tp.y > top && left < best) { best = left; target = tp; tx = tp.x1 + (tp.x - tp.x1) * 0.3; }
    });
    if (!target) tu.ships.forEach(function (s) {
      if (s.dead || s.state === "leave" || s.y + s.h / 2 < top) return;
      var d = Math.abs(s.x - tu.x) + (G.turretY - s.y) * 0.3;
      if (d < best) { best = d; target = s; tx = s.x; }
    });
    if (Math.random() < 0.2) this.jitter = (Math.random() - 0.5) * 0.06 * (1 - this.skill);
    tu.aimAt(tx + this.jitter);
    var half = target ? (target.w ? target.w / 2 : G.torpedo.size) : 0;
    var gun = tu.gun();
    tu.trigger(!!target && Math.abs(tu.x - tx) < half * (0.6 + 0.6 * this.skill) && gun.mj >= w.shotMJ);
    if (target && gun.mj < w.shotMJ * 3) tu.callPower();
  };

  // Plays a whole gunner mission with no screen: AI engineer on the power, AI gunner on the gun.
  BL.runGunnerHeadless = function (seed, weapon, classId, tl, skill) {
    var m = new BL.Mission({ seed: seed, quiet: true, classId: classId || "gunboat", tl: tl || 4, gunner: { weapon: weapon || "pulse" } });
    var eng = new BL.AIEngineer(0.5, 0.25), gun = new AIGunner(skill);
    m.beginJump();
    var guard = 0;
    while (m.phase !== "done" && guard++ < BL.TICK_RATE * 60 * 30) {
      if (m.phase === "gravspace") m.beginJump();
      eng.think(m); gun.think(m);
      m.step();
    }
    if (m.phase !== "done") m.finish("timeout");
    return m.result;
  };
})(typeof window !== "undefined" ? window : globalThis);
