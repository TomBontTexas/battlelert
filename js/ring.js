/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert gunner station, ring view (every class). The ship sits in the center inside
   an oval shield; each gun rides the shield's rim inside its own arc and fires straight out.
   Enemies come in from every direction. Builds on the Turret: waves, torpedoes, damage,
   scoring and standing orders are the same; only geometry, aiming and movement differ.
   Angles are bearings in degrees: 0 = straight ahead (up), clockwise positive. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function norm(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  var RAD = Math.PI / 180;

  // opts: { weapons: [...], arcs: [[center, halfWidth], ...], ring: true, orders }
  function RingTurret(m, opts) {
    BL.Turret.call(this, m, opts);
    this.ring = true;
    var cls = BL.GUNNERY.ring.classes[m.data.classId] || {};
    this.R = Object.assign({ gunSize: 0.06, pull: 0 }, BL.GUNNERY.ring, cls.view || {});
    var arcs = opts.arcs || [], self = this;
    this.bats.forEach(function (b, i) {
      var a = arcs[i] || [0, 180];
      b.arcC = a[0]; b.arcH = a[1]; b.arcName = (opts.arcNames || [])[i] || "";
      b.rel = b.aimRel = a[2] === undefined ? 0 : norm(a[2] - a[0]);
      self.placeBattery(b);
    });
    this.pilot = cls.pilot || null;            // main gun ships: the AI pilot turns the bow onto the big target
    this.heading = 0;                          // degrees the ship has turned (the starfield turns with it)
    this.firesMain = !!m.sys("main");          // the main gun is yours: one heavy shot straight off the bow
    this.mainFx = null; this.mainWasReady = false; this.nextMineAt = Infinity;
    this.wing = []; this.lastSquadron = m.squadron;   // the gunboat squadron, while it's out
    this.stats.mines = 0; this.stats.minesDowned = 0; this.stats.mainShots = 0; this.stats.mainHits = 0;
  }
  RingTurret.prototype = Object.create(BL.Turret.prototype);
  RingTurret.prototype.constructor = RingTurret;
  BL.RingTurret = RingTurret;
  RingTurret.prototype.reset = function () {
    BL.Turret.prototype.reset.call(this);
    this.cur.mines = 0; this.cur.minesDowned = 0; this.cur.mainShots = 0; this.cur.mainHits = 0;
    this.nextMineAt = this.m.cfg.arrivalSeconds + 2; this.pilotTarget = null; this.mainFx = null;
    this.wing = []; this.lastSquadron = this.m.squadron;
  };
  RingTurret.prototype.clear = function () {
    BL.Turret.prototype.clear.call(this);
    this.wing = []; this.lastSquadron = this.m.squadron;
  };
  function count(self, key) { self.stats[key]++; if (self.cur) self.cur[key]++; }

  /* ------------------------------------------------------------- Geometry */
  // Point on the shield's rim at bearing phi, and the outward direction a gun there fires in.
  RingTurret.prototype.rim = function (phi) {
    var R = this.R, s = Math.sin(phi * RAD), c = Math.cos(phi * RAD);
    var nx = s / R.rx, ny = -c / R.ry, l = Math.hypot(nx, ny);
    return { x: R.cx + R.rx * s, y: R.cy - R.ry * c, nx: nx / l, ny: ny / l };
  };
  RingTurret.prototype.bearingOf = function (x, y) { return Math.atan2(x - this.R.cx, -(y - this.R.cy)) / RAD; };
  RingTurret.prototype.placeBattery = function (b) {
    b.phi = norm(b.arcC + b.rel);
    var p = this.rim(b.phi);
    b.x = p.x; b.y = p.y; b.nx = p.nx; b.ny = p.ny;
  };
  RingTurret.prototype.full = function (b) { return b.arcH >= 180; };
  // The arc-relative angle for a bearing, or null if the bearing is outside the gun's arc.
  RingTurret.prototype.relFor = function (b, phi) {
    var rel = norm(phi - b.arcC);
    return this.full(b) || Math.abs(rel) <= b.arcH ? rel : null;
  };
  RingTurret.prototype.reach = function (b) {
    b = this.bat(b);
    return (this.R.reach[b.weaponId] || 0.3) * this.m.turretFactor(this.gun(b), "reach");
  };
  // Degrees per second a gun turns along the rim.
  RingTurret.prototype.traverse = function (b) {
    b = this.bat(b);
    return this.R.traverse * this.m.turretFactor(this.gun(b), "slide") * (this.m.ship.crippled ? 0.7 : 1);
  };

  /* ---------------------------------------------------------- Player input */
  // Right turns clockwise, left counterclockwise; d runs -1..1, the share of full traverse
  // (a key gives 1, the mouse or a finger anything between).
  RingTurret.prototype.setDir = function (d) {
    var b = this.bat(); b.dir = d;
    if (d) b.seek = null; else if (!b.seek) b.aimRel = b.rel;
  };
  /* Click or tap on a ship or torpedo: the gun turns toward it, following it as it moves, and
     holds its fire until it's on. Returns false if nothing is there. */
  RingTurret.prototype.seekAt = function (x, y) {
    var b = this.bat(), best = null, bd = 1e9;
    this.torps.forEach(function (tp) { var d = Math.hypot(tp.x - x, tp.y - y); if (d < 0.04 && d < bd) { bd = d; best = tp; } });
    this.ships.forEach(function (s) {
      if (s.dead || s.state === "leave") return;
      var d = Math.hypot(s.x - x, s.y - y);
      if (d < Math.max(s.w, s.h) * 0.6 + 0.012 && d < bd) { bd = d; best = s; }
    });
    if (!best) return false;
    b.seek = best; b.dir = 0; this.trackSeek(b);
    return true;
  };
  RingTurret.prototype.trackSeek = function (b) {
    var s = b.seek;
    if (s.dead || s.state === "leave" || (this.ships.indexOf(s) < 0 && this.torps.indexOf(s) < 0)) { b.seek = null; return; }
    var rel = norm(this.bearingOf(s.x, s.y) - b.arcC);
    b.aimRel = this.full(b) ? b.rel + norm(rel - b.rel) : clamp(rel, -b.arcH, b.arcH);
  };
  // Your gun holds fire while it swings to a clicked target.
  RingTurret.prototype.fire = function (dt) {
    var b = this.bat(), f = b.firing;
    if (b.seek) b.firing = false;
    BL.Turret.prototype.fire.call(this, dt);
    b.firing = f;
  };
  // Mouse, trackpad or a finger moving sideways: degrees to turn (right = clockwise).
  RingTurret.prototype.nudge = function (deg) {
    var b = this.bat();
    b.dir = 0;
    b.aimRel = this.full(b) ? b.aimRel + deg : clamp(b.aimRel + deg, -b.arcH, b.arcH);
  };
  RingTurret.prototype.aimAt = function () {};          // the rail view's absolute aim has no meaning here
  // The pointer at (x, y): turn toward its bearing from the ship, inside the arc (a clicked
  // target being chased keeps the gun until it's on). Right at the center means nothing.
  RingTurret.prototype.pointAt = function (x, y) {
    var b = this.bat(), R = this.R;
    if (b.seek || Math.hypot((x - R.cx) / R.rx, (y - R.cy) / R.ry) < 0.15) return;
    var rel = norm(this.bearingOf(x, y) - b.arcC);
    b.dir = 0;
    b.aimRel = this.full(b) ? b.rel + norm(rel - b.rel) : clamp(rel, -b.arcH, b.arcH);
  };
  RingTurret.prototype.select = function (i) {
    var ok = BL.Turret.prototype.select.call(this, i);
    if (ok) { var b = this.bat(); b.aimRel = b.rel; this.bats.forEach(function (x) { x.seek = null; }); }
    return ok;
  };

  /* ---------------------------------------------------------------- Tick */
  RingTurret.prototype.step = function (dt) {
    var m = this.m, G = this.G, self = this;
    m.waves.forEach(function (w) { if (!w.ships && !w.dead) self.spawnShips(w); });
    this.ships.forEach(function (s) {
      if (s.state !== "leave" && !s.dead && !m.waves.some(function (w) { return w.id === s.wave; })) s.state = "leave";
    });
    this.bats.forEach(function (b, i) { if (i !== self.sel) self.aiBattery(b); });
    this.steer(dt);
    // Turn each gun toward its aim along its arc, never faster than its drive.
    var held = this.bat();
    if (held.seek) this.trackSeek(held);
    this.bats.forEach(function (b) {
      var mv = self.traverse(b) * dt;
      if (b.dir) b.aimRel = self.full(b) ? b.rel + b.dir * mv : clamp(b.rel + b.dir * mv, -b.arcH, b.arcH);
      var diff = self.full(b) ? norm(b.aimRel - b.rel) : b.aimRel - b.rel;
      b.rel += clamp(diff, -mv, mv);
      if (self.full(b)) { b.rel = norm(b.rel); b.aimRel = b.rel + norm(b.aimRel - b.rel); }
      self.placeBattery(b);
    });
    if (held.seek && Math.abs(norm(held.aimRel - held.rel)) < 1) held.seek = null;    // on target
    if (this.live() && m.phase !== "arrival") { this.stats.liveTime += dt; if (this.firing) this.stats.firingTime += dt; }
    this.moveShips(dt);
    this.runWing(dt);
    this.launchTorpedoes();
    this.dropMines();
    var ms = this.mainState();
    if (ms && ms.ready && !this.mainWasReady) m.chat("mainReady", null, "good");
    this.mainWasReady = !!(ms && ms.ready);
    this.ships.forEach(function (s) { s.chargeAt = 0; });
    m.events.forEach(function (e) {
      if ((e.type !== "salvo" && e.type !== "strike") || e.done || e.torp || !e.announced || !e.visible) return;
      var s = self.shipOf(e), la = e.at - G.torpedo.travel;
      if (s && !s.dead && s.state !== "leave" && (!s.chargeAt || la < s.chargeAt)) { s.chargeAt = la; s.chargeFrom = Math.min(e.announceAt, la - 0.5); }
    });
    this.fire(dt);
    this.moveBolts(dt);
    this.movePT(dt);
    this.landTorpedoes();
    var now = m.totalT;
    this.effects = this.effects.filter(function (f) { return now - f.at < 1.6; });
  };

  /* ------------------------------------------------------------ The pilot
     On a ship with a main gun the AI pilot swings the bow toward the big target (a siege
     battery or capital ship first, else the toughest ship up). The ship stays drawn nose up,
     so turning swings everything outside it the other way around the center. */
  RingTurret.prototype.steer = function (dt) {
    var P = this.pilot;
    if (!P || !this.live()) return;
    var tg = this.pilotTarget;
    if (!tg || tg.dead || tg.state === "leave" || this.ships.indexOf(tg) < 0) tg = this.pilotTarget = this.bigTarget();
    if (!tg) return;
    var mv = P.turn * dt * (this.m.ship.crippled ? 0.7 : 1), turn = clamp(norm(tg.bearing), -mv, mv);
    if (Math.abs(turn) > 1e-4) this.rotate(turn);
  };
  RingTurret.prototype.bigTarget = function () {
    var best = null, bs = -1;
    this.ships.forEach(function (s) {
      if (s.dead || s.state === "leave") return;
      var sc = s.hp + (s.lockable ? 1e4 : 0);
      if (sc > bs) { bs = sc; best = s; }
    });
    return best;
  };
  // The ship turns `deg` clockwise.
  RingTurret.prototype.rotate = function (deg) {
    var R = this.R, a = -deg * RAD, ca = Math.cos(a), sa = Math.sin(a), self = this;
    function rot(o, kx, ky) { var dx = o[kx] - R.cx, dy = o[ky] - R.cy; o[kx] = R.cx + dx * ca - dy * sa; o[ky] = R.cy + dx * sa + dy * ca; }
    this.heading += deg;
    this.ships.forEach(function (s) { s.home -= deg; s.bearing -= deg; self.placeShip(s); });
    this.torps.forEach(function (tp) { rot(tp, "x0", "y0"); rot(tp, "x", "y"); tp.hitB -= deg; var p = self.rim(tp.hitB); tp.x1 = p.x; tp.y1 = p.y; });
    this.bolts.forEach(function (b) { rot(b, "x", "y"); var vx = b.vx; b.vx = vx * ca - b.vy * sa; b.vy = vx * sa + b.vy * ca; });
    this.ptTorps.forEach(function (tp) { rot(tp, "x", "y"); tp.a += a; });
    this.wing.forEach(function (g) { rot(g, "x", "y"); g.a += a; });
  };

  /* ------------------------------------------------------------ Squadron
     Cruiser and up: when the launchers fire, the gunboats fly out of the hangar bays, circle
     the enemy ships strafing them, and shoot down torpedoes that pass close. When the arresters
     bring them home they fly back aboard. Your bolts pass them by. */
  RingTurret.prototype.runWing = function (dt) {
    var m = this.m, hg = m.data.hangar, W = this.G.ring.wing, self = this;
    if (!hg) return;
    var sq = m.squadron;
    if (sq !== this.lastSquadron) {
      if (sq === "out") this.launchWing();
      else if (this.lastSquadron === "out") this.wing.forEach(function (g) { g.state = "home"; });
      this.lastSquadron = sq;
    }
    var keep = [];
    this.wing.forEach(function (g, i) {
      var tx, ty;
      if (g.state === "home") {
        var bay = self.rim(g.bay); tx = bay.x; ty = bay.y;
        if (Math.hypot(tx - g.x, ty - g.y) < 0.02) return;             // aboard
      } else {
        var tg = g.target;
        if (!tg || tg.dead || tg.state === "leave" || self.ships.indexOf(tg) < 0) tg = g.target = self.wingTarget(i);
        g.orbitA += W.spin * dt;
        if (tg) { tx = tg.x + Math.cos(g.orbitA) * W.orbit; ty = tg.y + Math.sin(g.orbitA) * W.orbit; }
        else {                                                           // nothing to fight: patrol off our side
          var R = self.R, p = self.rim(g.bay);
          tx = R.cx + (p.x - R.cx) * 2.2 + Math.cos(g.orbitA) * 0.04; ty = R.cy + (p.y - R.cy) * 1.5 + Math.sin(g.orbitA) * 0.04;
        }
      }
      var dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        var diff = Math.atan2(dy, dx) - g.a;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        g.a += clamp(diff, -6 * dt, 6 * dt);
        var mv = Math.min(d, W.speed * dt);
        g.x += Math.cos(g.a) * mv; g.y += Math.sin(g.a) * mv;
      }
      if (g.state !== "home" && m.totalT >= g.next) {
        g.next = m.totalT + W.tick;
        var tp = null, bd = W.look;
        self.torps.forEach(function (x) { var dd = Math.hypot(x.x - g.x, x.y - g.y); if (dd < bd) { bd = dd; tp = x; } });
        if (tp) {
          self.effects.push({ type: "tracer", x: g.x, y: g.y, x1: tp.x, y1: tp.y, at: m.totalT });
          if (self.rng.chance(W.kill)) { self.downTorpedo(tp, null); m.stats.intercepts++; }
        } else if (g.target && Math.hypot(g.target.x - g.x, g.target.y - g.y) < W.orbit * 1.6) {
          self.effects.push({ type: "tracer", x: g.x, y: g.y, x1: g.target.x, y1: g.target.y, at: m.totalT });
          g.target.flashAt = m.totalT;
          self.damageShip(g.target, hg.dps / W.n * W.tick, 0, false);
        }
      }
      keep.push(g);
    });
    this.wing = keep;
  };
  RingTurret.prototype.launchWing = function () {
    var W = this.G.ring.wing;
    this.wing = [];
    for (var i = 0; i < W.n; i++) {
      var bay = i % 2 ? 125 : -125, p = this.rim(bay);
      this.wing.push({ x: p.x, y: p.y, a: Math.atan2(p.ny, p.nx), bay: bay, state: "out", target: null, orbitA: i * 1.6, next: this.m.totalT + 1 + i * 0.2 });
    }
  };
  // Spread the gunboats over the ships that are up.
  RingTurret.prototype.wingTarget = function (i) {
    var live = this.ships.filter(function (s) { return !s.dead && s.state !== "leave"; });
    return live.length ? live[i % live.length] : null;
  };

  /* ------------------------------------------------------------ Main gun
     Yours to fire once it's full (M or the MAIN GUN button): the whole charge in one shot
     straight off the bow, into the first ship on that line. Nothing there, and it's wasted. */
  RingTurret.prototype.mainState = function () {
    var mg = this.firesMain ? this.m.sys("main") : null;
    if (!mg) return null;
    return { mj: mg.mj, max: mg.maxMJ, tripped: mg.tripped, ready: !mg.tripped && mg.mj >= mg.maxMJ - 0.5 && this.live() };
  };
  RingTurret.prototype.mainLine = function () {
    var p = this.rim(0), best = null, by = -1e9;
    this.ships.forEach(function (s) {
      if (s.dead || s.state === "leave" || s.y >= p.y) return;
      if (Math.abs(s.x - p.x) <= Math.max(s.w, s.h) * 0.45 && s.y > by) { by = s.y; best = s; }
    });
    return best;
  };
  RingTurret.prototype.fireMain = function () {
    var m = this.m, mg = m.sys("main"), st = this.mainState();
    if (!st || !st.ready) return false;
    var dmg = mg.mj * m.data.mainGun.dmgPerMJ, s = this.mainLine(), p = this.rim(0);
    mg.mj = 0;
    count(this, "mainShots"); m.stats.mainShots++;
    m.cue("main");
    this.mainFx = { at: m.totalT, x: p.x, y0: p.y, y1: s ? s.y : p.y - 2 };
    if (!s) { m.chat("mainShotMiss", null, "bad"); return true; }
    count(this, "mainHits"); m.stats.mainDamage += Math.min(dmg, s.hp);
    var name = s.name, kill = dmg >= s.hp;
    s.flashAt = m.totalT;
    this.effects.push({ type: "boom", x: s.x, y: s.y, at: m.totalT, size: 0.16 });
    this.damageShip(s, dmg, 0, true);
    m.chat(kill ? "mainShotKill" : "mainShotHit", { enemy: name }, "good");
    return true;
  };

  /* --------------------------------------------------------------- Mines
     In a minefield, mines drift in from ahead and the flanks toward the shield. They fly like
     torpedoes (same list, so guns, clicks and AI gunners treat them alike); one that reaches the
     shield hits like a torpedo. */
  RingTurret.prototype.dropMines = function () {
    var m = this.m, enc = m.encounter(), M = enc && enc.mines && enc.mines.gunner, R = this.R, r = this.rng;
    if (!M || (m.phase !== "engage" && m.phase !== "countdown") || m.t < this.nextMineAt) return;
    this.nextMineAt = m.t + r.range(M.every) / (m.ship.starved ? M.starvedMult : 1);
    var b0 = this.pickBearing(), hitB = b0 + (r.next() - 0.5) * 20, p = this.rim(hitB);
    var x0 = R.cx + R.enter * Math.sin(b0 * RAD), y0 = R.cy - R.enter * Math.cos(b0 * RAD);
    var travel = Math.hypot(x0 - p.x, y0 - p.y) / r.range(M.drift);
    var e = { id: m.nextId++, type: "mine", at: m.t + travel, mj: Math.round(r.range(M.mj) * m.data.threat.dmg), announced: true, visible: true };
    m.events.push(e);
    var tp = { id: this.nextId++, ev: e, mine: true, x0: x0, y0: y0, x1: p.x, y1: p.y, hitB: hitB, t0: m.t, t1: e.at, x: x0, y: y0, spin: r.next() * 6 };
    e.torp = tp; this.torps.push(tp);
    count(this, "mines");
  };
  RingTurret.prototype.downTorpedo = function (tp, b) {
    if (!tp.mine) return BL.Turret.prototype.downTorpedo.call(this, tp, b);
    var m = this.m, e = tp.ev;
    e.done = true; e.downed = true;
    this.torps = this.torps.filter(function (x) { return x !== tp; });
    if (b && b.mine) count(this, "minesDowned");
    this.effects.push({ type: "boom", x: tp.x, y: tp.y, at: m.totalT, size: 0.07 });
    m.cue("torpDown");
    if (this.rng.chance(0.25)) m.chat("mineDown", null, "good");
  };

  /* --------------------------------------------------------------- Enemies */
  // Where a wave (or a mine) comes from: mostly ahead and on the flanks.
  RingTurret.prototype.pickBearing = function () {
    var r = this.rng, bw = this.R.bearings, keys = Object.keys(bw), tot = 0, pick = r.next() * keys.reduce(function (a, k) { return a + bw[k]; }, 0);
    for (var q = 0; q < keys.length; q++) { tot += bw[keys[q]]; if (pick <= tot) return +keys[q] + (r.next() - 0.5) * 30; }
    return 0;
  };
  // A wave comes in from one bearing and its ships spread out around it at their holding distance.
  RingTurret.prototype.addGroup = function (list, wave, type, look, n, totalHp) {
    var r = this.rng, t = this.m.t, R = this.R, hp = totalHp / n;
    if (wave.bearing === undefined) wave.bearing = this.pickBearing();
    var band = look.ringR || [0.36, 0.44], groupPhase = r.next() * Math.PI * 2, groupPeriod = r.range(look.period);
    var hold = r.range(band) - R.pull, spread = (look.w + 0.05) / hold / RAD;
    for (var i = 0; i < n; i++) {
      var home = wave.bearing + (i - (n - 1) / 2) * spread;
      var s = {
        id: this.nextId++, wave: wave.id, type: type, name: look.ship, w: look.w, h: look.h,
        lockable: !!look.capital || type === "siege", jinkUntil: 0, jinkDir: 0,
        hp: hp, hpMax: hp, home: home, bearing: home, r: R.enter + r.next() * 0.08, hold: hold + (r.next() - 0.5) * 0.03,
        sway: look.sway * 120 * (look.formation ? 1 : 0.7 + r.next() * 0.6),
        period: look.formation ? groupPeriod : r.range(look.period), phase: look.formation ? groupPhase : r.next() * Math.PI * 2,
        dive: look.dive * 0.5, diveAt: t + 3 + r.next() * 4, diveUntil: 0,
        born: t, state: "enter", ionUntil: 0, flashAt: -9, dead: false, x: 0, y: 0, rot: 0
      };
      this.placeShip(s);
      list.push(s); this.ships.push(s);
    }
    return n;
  };
  RingTurret.prototype.placeShip = function (s) {
    var R = this.R;
    s.x = R.cx + s.r * Math.sin(s.bearing * RAD); s.y = R.cy - s.r * Math.cos(s.bearing * RAD);
    s.rot = s.bearing * RAD;                 // the art's nose (down) turned to face the ship
  };
  RingTurret.prototype.moveShips = function (dt) {
    var t = this.m.t, keep = [];
    for (var i = 0; i < this.ships.length; i++) {
      var s = this.ships[i];
      if (s.dead) continue;
      // A big ship sidesteps a torpedo closing on it (fields per second, turned into degrees).
      if (t < s.jinkUntil) s.home += s.jinkDir * (this.G.pt.jink[s.type] || 0) / Math.max(0.1, s.r) / RAD * dt;
      // The pilot's target won't sit on our bow: it slides away while it's near it.
      var P = this.pilot;
      if (P && s === this.pilotTarget && s.state !== "leave" && Math.abs(norm(s.bearing)) < P.dodge) s.home += (norm(s.bearing) >= 0 ? 1 : -1) * P.evade * dt;
      var swing = Math.sin((t - s.born) * 2 * Math.PI / s.period + s.phase);
      var want = s.home + s.sway * swing;
      if (s.state === "leave") { s.r += 0.3 * dt; if (s.r > 0.85) continue; }
      else {
        var tr = s.hold;
        if (s.dive) {
          if (t >= s.diveAt && !s.diveUntil) s.diveUntil = t + 2.2;
          if (s.diveUntil) {
            var p = 1 - (s.diveUntil - t) / 2.2;
            if (p >= 1) { s.diveUntil = 0; s.diveAt = t + 3 + this.rng.next() * 4; }
            else tr -= s.dive * Math.sin(p * Math.PI);
          }
        }
        if (s.state === "enter") { s.r -= Math.min(0.28 * dt, s.r - tr); if (s.r <= tr + 0.005) s.state = "hold"; }
        else s.r += (tr - s.r) * Math.min(1, dt * 3);
      }
      s.bearing += norm(want - s.bearing) * Math.min(1, dt * 3);
      this.placeShip(s);
      keep.push(s);
    }
    this.ships = keep;
  };

  // Torpedoes fly from the ship that fired them to the shield's rim on its side.
  RingTurret.prototype.launchTorpedoes = function () {
    var m = this.m, t = m.t, G = this.G, self = this;
    m.events.forEach(function (e) {
      if ((e.type !== "salvo" && e.type !== "strike") || e.done || e.torp) return;
      if (t < e.at - G.torpedo.travel) return;
      var s = self.shipOf(e);
      if (!s || s.dead || s.state === "leave") { e.done = true; e.cancelled = true; e.visible = false; return; }
      var ion = BL.WEAPONS.ion.ion;
      if (t < s.ionUntil && !e.ionized) {
        e.ionized = true; e.at += ion.delay; e.mj = Math.round(e.mj * ion.salvoMult);
        if (t < e.at - G.torpedo.travel) return;
      }
      var hitB = s.bearing + (self.rng.next() - 0.5) * 24, hit = self.rim(hitB);
      var nose = { x: s.x - Math.sin(s.rot) * s.h / 2, y: s.y + Math.cos(s.rot) * s.h / 2 };
      var torp = { id: self.nextId++, ev: e, x0: nose.x, y0: nose.y, x1: hit.x, y1: hit.y, hitB: hitB, t0: t, t1: e.at, x: nose.x, y: nose.y, weak: !!e.ionized };
      e.torp = torp; self.torps.push(torp);
      if (self.cur) { self.stats.torps++; self.cur.torps++; } else self.stats.torps++;
      m.cue("torpLaunch");
    });
  };

  /* -------------------------------------------------- Our torpedoes (PT) */
  // Tube 1 fires from the bow's left side, tube 2 from its right, turned toward the ship it locks onto.
  RingTurret.prototype.launchPT = function (i) {
    var m = this.m;
    if (!this.live() || !this.pt[i]) return false;
    this.pt[i] = false;
    var p = this.rim(i ? 14 : -14), tp = { id: this.nextId++, x: p.x, y: p.y, a: Math.atan2(p.ny, p.nx), target: null, tube: i + 1 };
    tp.target = this.lockFor(tp);
    if (tp.target) tp.a = Math.atan2(tp.target.y - tp.y, tp.target.x - tp.x);
    this.ptTorps.push(tp);
    this.stats.ptFired++; if (this.cur) this.cur.ptFired++;
    m.cue("ptLaunch");
    m.chat("ptAway", { n: i + 1 }, "good");
    return true;
  };
  RingTurret.prototype.touches = function (s, x, y) { return Math.hypot(s.x - x, s.y - y) <= Math.max(s.w, s.h) * 0.45; };

  /* ---------------------------------------------------------------- Guns */
  RingTurret.prototype.fireBattery = function (b, dt, mine) {
    var before = this.bolts.length;
    BL.Turret.prototype.fireBattery.call(this, b, dt, mine);
    if (this.bolts.length > before) {        // aim the new bolt straight out from the rim
      var bolt = this.bolts[this.bolts.length - 1];
      bolt.x = b.x + b.nx * 0.012; bolt.y = b.y + b.ny * 0.012; bolt.vx = b.nx; bolt.vy = b.ny; bolt.dist = 0;
    }
  };
  // Bolts fly out along the gun's direction; each tick sweeps the segment it crossed, and the
  // first ship or torpedo along it takes the hit. A weapon with `long` flies on past its reach,
  // hitting weaker the farther it goes (b.power); a weak bolt may glance off a torpedo.
  RingTurret.prototype.moveBolts = function (dt) {
    var keep = [];
    for (var i = 0; i < this.bolts.length; i++) {
      var b = this.bolts[i], bat = this.bats[b.bat], w = bat.w, reach = this.reach(bat), lg = w.long, maxD = reach + (lg ? lg.extra : 0);
      var step = w.speed * dt * 0.6, x0 = b.x, y0 = b.y, x1 = b.x + b.vx * step, y1 = b.y + b.vy * step;
      var best = null, bestT = 2;
      var consider = function (px, py, rad, what) {
        var dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
        var u = clamp(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1), cx = x0 + u * dx - px, cy = y0 + u * dy - py;
        if (cx * cx + cy * cy <= rad * rad && u < bestT) { bestT = u; best = what; }
      };
      this.torps.forEach(function (tp) { consider(tp.x, tp.y, 0.024, { torp: tp }); });
      this.ships.forEach(function (s) { if (!s.dead && s.state !== "leave") consider(s.x, s.y, Math.max(s.w, s.h) * 0.45, { ship: s }); });
      if (best && b.dist + step * bestT <= maxD) {
        var d = b.dist + step * bestT;
        b.power = d <= reach ? 1 : lg.at + (lg.end - lg.at) * Math.min(1, (d - reach) / lg.extra);
        b.x = x0 + (x1 - x0) * bestT; b.y = y0 + (y1 - y0) * bestT;
        if (best.torp && b.power < 1 && !this.rng.chance(b.power)) {
          this.effects.push({ type: "spark", x: b.x, y: b.y, at: this.m.totalT, weapon: bat.weaponId });
          continue;
        }
        if (b.mine) { this.stats.hits++; if (this.cur) this.cur.hits++; bat.hits++; } else bat.aiHits++;
        if (best.torp) this.downTorpedo(best.torp, b); else this.hitShip(best.ship, b);
        continue;
      }
      b.x = x1; b.y = y1; b.dist += step;
      // (bolts fly until spent or well past any view: zoomed-out and wide views show beyond the square)
      if (b.dist < maxD && Math.hypot(b.x - 0.5, b.y - 0.5) < 1.1) keep.push(b);
      else this.effects.push({ type: "fizzle", x: b.x, y: b.y, at: this.m.totalT });
    }
    this.bolts = keep;
  };
  RingTurret.prototype.hitShip = function (s, b) {
    var m = this.m, bat = this.bats[b.bat], w = bat.w, bonus = w.best.indexOf(s.type) >= 0 ? this.G.bonus : 1;
    if (w.ion) s.ionUntil = m.t + w.ion.seconds;
    s.flashAt = m.totalT;
    this.effects.push({ type: "spark", x: b.x, y: b.y, at: m.totalT, weapon: bat.weaponId });
    m.cue("shipHit");
    this.damageShip(s, w.damage * bonus * (b.power || 1), b.mine ? 0 : bat.gunNo, b.mine);
  };

  /* ------------------------------------------------------------ AI gunner
     Same standing orders as the rail view; a target counts only if it's inside the gun's arc
     and within reach of the rim, and the gun turns to face it. */
  RingTurret.prototype.inReachOf = function (b, x, y) {
    var phi = this.bearingOf(x, y), rel = this.relFor(b, phi);
    if (rel === null) return null;
    var p = this.rim(phi);
    return Math.hypot(x - p.x, y - p.y) <= this.reach(b) ? rel : null;
  };
  RingTurret.prototype.aiBattery = function (b) {
    var m = this.m, G = this.G, r = this.rng, skill = G.aiGunner, self = this;
    if (m.totalT < b.aiNext) return;
    b.aiNext = m.totalT + 0.12;
    var order = this.orderFor(b).order, target = null, rel = 0, best = 1e9;
    function torps(within) {
      self.torps.forEach(function (tp) {
        var left = tp.t1 - m.t, rr = self.inReachOf(b, tp.x, tp.y);
        if (rr !== null && left < within && left < best) { best = left; target = tp; rel = rr; }
      });
    }
    function charging() {
      self.ships.forEach(function (s) {
        if (s.dead || s.state === "leave" || !(s.chargeAt > m.t)) return;
        var rr = self.inReachOf(b, s.x, s.y); if (rr === null) return;
        var d = s.chargeAt - m.t + Math.abs(norm(rr - b.rel)) / 180;
        if (d < best) { best = d; target = s; rel = rr; }
      });
    }
    function ships(matched, penalty) {
      self.ships.forEach(function (s) {
        if (s.dead || s.state === "leave") return;
        var rr = self.inReachOf(b, s.x, s.y); if (rr === null) return;
        var good = b.w.best.indexOf(s.type) >= 0;
        if (matched && !good) return;
        var d = Math.abs(norm(rr - b.rel)) / 180 + (good ? 0 : penalty);
        if (d < best) { best = d; target = s; rel = rr; }
      });
    }
    var plans = {
      defend: [[torps, 2.4], [charging], [ships, false, 0.35]],
      stop:   [[charging], [torps, 1.2], [ships, false, 0.35]],
      hunt:   [[torps, 0.8], [ships, true], [ships, false, 0.35]],
      free:   [[torps, 1.6], [ships, false, 0.35]]
    }[order] || [[torps, 1.6], [ships, false, 0.35]];
    for (var k = 0; k < plans.length && !target; k++) { best = 1e9; plans[k][0](plans[k][1], plans[k][2]); }
    if (r.chance(0.2)) b.aiJitter = (r.next() - 0.5) * 6 * (1 - skill);
    if (target) { b.aimRel = this.full(b) ? b.rel + norm(rel + b.aiJitter - b.rel) : clamp(rel + b.aiJitter, -b.arcH, b.arcH); }
    b.dir = 0;
    var gun = this.gun(b), aligned = false;
    if (target) {
      // On the firing line: the target's distance from the gun's straight-out line.
      var dx = target.x - b.x, dy = target.y - b.y, along = dx * b.nx + dy * b.ny, off = Math.abs(dx * b.ny - dy * b.nx);
      var rad = target.w ? Math.max(target.w, target.h) * 0.45 : 0.024;
      aligned = along > 0 && off < rad * (0.6 + 0.6 * skill);
    }
    b.firing = aligned && gun.mj >= b.w.shotMJ;
    if (target && gun.mj < b.w.shotMJ * 2) this.callPower(b);
  };
})(typeof window !== "undefined" ? window : globalThis);
