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
    // At the helm (opts.helm) the player holds no gun: a crewman works every one of them.
    this.crewAll = !!opts.helm;
    var crew = BL.pickGunCrew(m.seed, m.data.classId, this.crewAll);
    this.bats.forEach(function (b, i) { b.crew = crew[i] || null; });
    this.pilot = cls.pilot || null;            // main gun ships: the AI pilot turns the bow onto the big target
    this.heading = 0;                          // degrees the ship has turned (the starfield turns with it)
    this.firesMain = !!m.sys("main");          // the main gun is yours: one heavy shot straight off the bow
    this.mainFx = null; this.mainWasReady = false; this.nextMineAt = Infinity;
    this.wing = []; this.lastSquadron = m.squadron;   // the gunboat squadron, while it's out
    this.stats.mines = 0; this.stats.minesDowned = 0; this.stats.mainShots = 0; this.stats.mainHits = 0;
    this.stats.strikes = 0; this.stats.strikesCiws = 0; this.stats.strikesShot = 0; this.stats.strikesHit = 0;
  }
  RingTurret.prototype = Object.create(BL.Turret.prototype);
  RingTurret.prototype.constructor = RingTurret;
  BL.RingTurret = RingTurret;
  RingTurret.prototype.reset = function () {
    BL.Turret.prototype.reset.call(this);
    this.cur.mines = 0; this.cur.minesDowned = 0; this.cur.mainShots = 0; this.cur.mainHits = 0;
    this.cur.strikes = 0; this.cur.strikesCiws = 0; this.cur.strikesShot = 0; this.cur.strikesHit = 0;
    this.nextMineAt = this.m.cfg.arrivalSeconds + 2; this.pilotTarget = null; this.mainFx = null; this.ptSeen = 0; this.mainSeen = 0;
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
  // The warp drive, in the stern (drive strikes aim here), and the CIWS mounts on the hull.
  // The mounts sit on the CIWS domes drawn on each class's hull (art.js); without art, the generic
  // mounts, for a ship drawn about 0.37 times as wide as it is long.
  RingTurret.prototype.drivePoint = function () { var R = this.R; return { x: R.cx, y: R.cy + R.shipH * 0.4 }; };
  RingTurret.prototype.ciwsMounts = function () {
    var R = this.R, w = R.shipH * 0.37, art = BL.ART && BL.ART.ciwsMounts && BL.ART.ciwsMounts(this.m.data.classId);
    if (!this.m.sys("pd")) return [];
    if (art) return art.map(function (q) { return { x: R.cx + q[0] * R.shipH, y: R.cy + q[1] * R.shipH }; });
    return this.G.ring.ciws.mounts.map(function (q) { return { x: R.cx + q[0] * w, y: R.cy + q[1] * R.shipH }; });
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
  // A crewman fires slower than the gun's best rate (GUNNERY.crew.pace); you fire it at full rate.
  RingTurret.prototype.interval = function (b) {
    b = this.bat(b);
    var base = BL.Turret.prototype.interval.call(this, b), C = this.G.crew, cw = b.crew;
    if (!cw || (b === this.bat() && !this.crewAll)) return base;
    var k = clamp((cw.skill - C.skill[0]) / (C.skill[1] - C.skill[0]), 0, 1);
    return base * (C.pace[0] + (C.pace[1] - C.pace[0]) * k);
  };
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
  // Your gun holds fire while it swings to a clicked target. At the helm the crew fires them all.
  RingTurret.prototype.fire = function (dt) {
    if (this.crewAll) { var self = this; this.bats.forEach(function (x) { self.fireBattery(x, dt, false); }); return; }
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
  // You trade places with the gunner of the gun you take.
  RingTurret.prototype.select = function (i) {
    var old = this.bat(), ok = BL.Turret.prototype.select.call(this, i);
    if (ok) {
      var b = this.bat(); b.aimRel = b.rel; this.bats.forEach(function (x) { x.seek = null; });
      old.crew = b.crew; b.crew = null; old.aiNext = this.m.totalT + 0.5; old.aiTarget = null;
    }
    return ok;
  };

  /* ---------------------------------------------------------------- Tick */
  RingTurret.prototype.step = function (dt) {
    var m = this.m, G = this.G, self = this;
    m.waves.forEach(function (w) { if (!w.ships && !w.dead) self.spawnShips(w); });
    this.ships.forEach(function (s) {
      if (s.state !== "leave" && !s.dead && !m.waves.some(function (w) { return w.id === s.wave; })) s.state = "leave";
    });
    this.bats.forEach(function (b, i) { if (i !== self.sel || self.crewAll) self.aiBattery(b); });
    this.steer(dt);
    if (this.crewAll) { this.crewWeapons(); this.crewCalls(); }
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
    this.runCIWS();
    this.dropMines();
    var ms = this.mainState();
    if (ms && ms.ready && !this.mainWasReady) m.chat("mainReady", null, "good");
    this.mainWasReady = !!(ms && ms.ready);
    this.ships.forEach(function (s) { s.chargeAt = 0; });
    m.events.forEach(function (e) {
      if ((e.type !== "salvo" && e.type !== "strike") || e.done || e.torp || !e.announced || !e.visible) return;
      var s = self.shipOf(e), la = e.at - (e.travel || G.torpedo.travel);
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
    // At the helm the player flies the ship (helm.js); the big target still slides off the bow.
    if (this.m.helm) {
      if (this.live()) this.m.helm.step(dt);
      if (P) { var pt = this.pilotTarget; if (!pt || pt.dead || pt.state === "leave" || this.ships.indexOf(pt) < 0) this.pilotTarget = this.bigTarget(); }
      return;
    }
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
    this.torps.forEach(function (tp) {
      rot(tp, "x0", "y0"); rot(tp, "x", "y");
      if (tp.strike) return;                   // it homes on the drive, which turns with the ship
      if (self.m.helm) { rot(tp, "x1", "y1"); return; }     // at the helm it flies at the point it was aimed at
      tp.hitB -= deg; var p = self.rim(tp.hitB); tp.x1 = p.x; tp.y1 = p.y;
    });
    this.bolts.forEach(function (b) { rot(b, "x", "y"); var vx = b.vx; b.vx = vx * ca - b.vy * sa; b.vy = vx * sa + b.vy * ca; });
    this.ptTorps.forEach(function (tp) { rot(tp, "x", "y"); tp.a += a; });
    this.wing.forEach(function (g) { rot(g, "x", "y"); g.a += a; });
  };

  /* At the helm the gunners fire everything: the gunboat's torpedoes once a frigate or siege
     battery is within BL.HELM.ptBow degrees of the bow, and the main gun once a ship is on its
     line, each after a moment to react (a sharper crew reacts sooner). */
  RingTurret.prototype.crewReact = function () {
    var best = 0; this.bats.forEach(function (b) { if (b.crew) best = Math.max(best, b.crew.skill); });
    var C = this.G.crew, k = clamp((best - C.skill[0]) / (C.skill[1] - C.skill[0]), 0, 1);
    return 1 - 0.7 * k;                        // 1 s for a raw crew, 0.3 s for a sharp one
  };
  /* A gunner whose arc has been empty a while, with a ship their weapon is best against outside
     it, tells the captain, who orders the helm round (helm.js). The turn asked for
     puts that ship halfway inside the arc. All-round guns never need to ask. */
  RingTurret.prototype.crewCalls = function () {
    var m = this.m, h = m.helm, now = m.totalT, self = this, Q = BL.HELM.request, R = this.R;
    // (gunners hold their calls while the captain's order is pending or under way, and once
    // the ship is lining up for the jump)
    if (!h || m.phase !== "engage" || now < (this.reqNext || 0) || h.orderView() || h.jumpNear()) return;
    this.reqNext = now + 0.5;
    var called = false;
    function alive(s) { return !s.dead && s.state !== "leave" && s.state !== "enter"; }
    this.bats.forEach(function (b) {
      if (called || self.full(b)) return;
      if (self.ships.some(function (s) { return alive(s) && self.inReachOf(b, s.x, s.y) !== null; })) { b.idleSince = 0; return; }
      if (!b.idleSince) b.idleSince = now;
      if (now - b.idleSince < Q.idle || now < (b.reqReady || 0)) return;
      var reach = self.reach(b) + Math.max(R.rx, R.ry), best = null, bd = 1e9;
      self.ships.forEach(function (s) {
        if (!alive(s) || b.w.best.indexOf(s.type) < 0 || s.r > reach) return;
        var d = Math.abs(norm(s.bearing - b.arcC));
        if (d < bd) { bd = d; best = s; }
      });
      if (!best) return;
      var rel = norm(best.bearing - b.arcC), turn = Math.round((rel - (rel > 0 ? 1 : -1) * b.arcH * 0.5) / 5) * 5;
      if (Math.abs(turn) < 10) return;
      b.idleSince = 0; called = true;
      h.request(b, turn, best);
    });
  };
  RingTurret.prototype.crewWeapons = function () {
    var m = this.m, now = m.totalT;
    if (!this.live() || m.phase === "arrival") return;
    var tube = this.pt.indexOf(true), bow = BL.HELM.ptBow;
    if (tube >= 0 && !this.ptTorps.length) {
      var tg = this.ships.some(function (s) { return s.lockable && !s.dead && s.state === "hold" && Math.abs(norm(s.bearing)) <= bow; });
      if (!tg) this.ptSeen = 0;
      else if (!this.ptSeen) this.ptSeen = now + this.crewReact();
      else if (now >= this.ptSeen) { this.ptSeen = 0; this.launchPT(tube); }
    }
    var ms = this.mainState();
    if (ms) {
      if (!ms.ready || !this.mainLine()) this.mainSeen = 0;
      else if (!this.mainSeen) this.mainSeen = now + this.crewReact();
      else if (now >= this.mainSeen) { this.mainSeen = 0; this.fireMain(); }
    }
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
     shield hits like a torpedo.
     At the helm the mines sit still and the ship moves through them: they stream down the view
     from ahead (up from astern when going astern), as fast as the ship moves and as often (none
     while she's stopped), and turning swings the whole field around her. One that touches the
     shield hits; the rest pass by. The pilot steers between them; the guns still shoot them. */
  RingTurret.prototype.dropMines = function () {
    var m = this.m, enc = m.encounter(), M = enc && enc.mines && enc.mines.gunner, R = this.R, r = this.rng;
    if (m.phase !== "engage" && m.phase !== "countdown") return;
    if (enc && enc.sweep) { this.dropFieldMine(enc.sweep, enc.sweep.mj); return; }      // the mine lane, either station
    if (!M) return;
    // The mines sit still and the ship moves through them, at the gun as at the helm (at the gun
    // the coxswain or captain holds her at standard and nobody steers round them: shoot them).
    this.dropFieldMine(enc.mines.helm, M.mj.map(function (x) { return x * enc.mines.helm.mj; }), m.force("minefield"));
  };
  // How fast a field of still mines streams past (fields/s, + down the view), from the ship's
  // speed at the helm; at the gun the coxswain holds her at standard.
  RingTurret.prototype.fieldFlow = function (H) {
    var h = this.m.helm, C = BL.HELM.classes[this.m.data.classId];
    if (!h) return H.flow / (H.lagSlow && C ? 1 + H.lagSlow * C.lag : 1);   // at the gun: standard, as the helm's field would stream
    var f = h.speed / Math.max(1, h.gOf("standard")), slow = H.lagSlow ? 1 + H.lagSlow * h.C.lag : 1;
    return h.inTube ? 0 : H.flow / slow * Math.max(-H.maxFlow, Math.min(H.maxFlow, f));
  };
  // Mines come up ahead (astern when going astern) as the ship covers ground. mj: their charge range.
  // dense: how thick the field is (the encounter's force on our class; 1 = one per `every` s).
  RingTurret.prototype.dropFieldMine = function (H, mj, dense) {
    var m = this.m, r = this.rng, R = this.R, v = this.fieldFlow(H), dt = 1 / BL.TICK_RATE;
    this.mineDue = (this.mineDue || 0) + (dense || 1) * Math.abs(v) / H.flow * dt / r.range(H.every);   // one per `every` s at standard
    if (this.mineDue < 1) return;
    this.mineDue -= 1;
    var x = R.cx + (r.next() * 2 - 1) * H.spread * R.rx, y = v >= 0 ? -0.3 : 1.3;      // (out of sight on a tall view)
    var e = { id: m.nextId++, type: "mine", at: Infinity, mj: Math.round(r.range(mj)), announced: true, visible: true };
    m.events.push(e);
    var tp = { id: this.nextId++, ev: e, mine: true, field: true, crewHit: H.crewHit && H.crewHit * Math.min(1, 3 / this.bats.length), x0: x, y0: y, x1: x, y1: y, hitB: 0, t0: m.t, t1: m.t + 99, x: x, y: y, spin: r.next() * 6 };
    e.torp = tp; this.torps.push(tp);
    count(this, "mines");
  };
  // The helm: move the field's mines with the ship; one touching the shield hits, one past the view is gone.
  RingTurret.prototype.moveFieldMines = function (list) {
    var m = this.m, R = this.R, self = this, enc = m.encounter(), H = enc && (enc.sweep || (enc.mines && enc.mines.helm));
    var v = H ? this.fieldFlow(H) : 0, dt = 1 / BL.TICK_RATE;
    list.forEach(function (tp) {
      var e = tp.ev;
      if (e.done) {
        if (!e.downed && !e.passed) self.effects.push({ type: e.outcome === "hull" ? "hullHit" : "shieldHit", x: tp.x1, y: tp.y1, at: m.totalT, mj: e.mj });
        return;
      }
      if (m.events.indexOf(e) < 0) return;
      if (e.at <= m.t) { self.torps.push(tp); return; }               // touched: the simulation fires it
      tp.y += v * dt;
      var dx = (tp.x - R.cx) / R.rx, dy = (tp.y - R.cy) / R.ry;
      if (dx * dx + dy * dy <= 1) { e.at = m.t; tp.x1 = tp.x; tp.y1 = tp.y; tp.t1 = m.t; self.torps.push(tp); return; }
      if (tp.y > 1.35 || tp.y < -0.35 || tp.x < -0.35 || tp.x > 1.35) { e.done = true; e.passed = true; return; }
      // Where and when it would touch the shield if the ship holds this course (for the warning ring
      // and the gunners); one that will pass by: when it's abeam (the gunners still shoot it, no ring).
      tp.pass = false;
      if (Math.abs(dx) < 1 && v) {
        var edge = R.ry * Math.sqrt(1 - dx * dx), yh = v > 0 ? R.cy - edge : R.cy + edge;
        if ((yh - tp.y) * v > 0) { tp.x1 = tp.x; tp.y1 = yh; tp.t1 = m.t + (yh - tp.y) / v; self.torps.push(tp); return; }
      }
      tp.pass = true; tp.x1 = tp.x; tp.y1 = tp.y;
      tp.t1 = v && (R.cy - tp.y) * v > 0 ? m.t + (R.cy - tp.y) / v : m.t + 99;
      self.torps.push(tp);
    });
  };
  RingTurret.prototype.downMine = function (tp, b) {
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
    if (wave.bearing === undefined) wave.bearing = look.bearing !== undefined ? look.bearing : this.pickBearing();
    var band = look.ringR || [0.36, 0.44], groupPhase = r.next() * Math.PI * 2, groupPeriod = r.range(look.period);
    var hold = r.range(band) - R.pull, spread = (look.w + 0.05) / hold / RAD;
    for (var i = 0; i < n; i++) {
      var home = wave.bearing + (i - (n - 1) / 2) * spread;
      var s = {
        id: this.nextId++, wave: wave.id, type: type, name: look.ship, w: look.w, h: look.h,
        lockable: !!look.capital || type === "siege", still: !!look.still, jinkUntil: 0, jinkDir: 0,
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
      // The pilot's target won't sit on our bow: it slides away while it's near it (a fortress can't).
      var P = this.pilot;
      if (P && s === this.pilotTarget && !s.still && s.state !== "leave" && Math.abs(norm(s.bearing)) < P.dodge) s.home += (norm(s.bearing) >= 0 ? 1 : -1) * P.evade * dt;
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
      if (t < e.at - (e.travel || G.torpedo.travel)) return;
      var s = self.shipOf(e);
      if (!s || s.dead || s.state === "leave") { e.done = true; e.cancelled = true; e.visible = false; return; }
      var ion = BL.WEAPONS.ion.ion;
      if (t < s.ionUntil && !e.ionized) {
        e.ionized = true; e.at += ion.delay; e.mj = Math.round(e.mj * ion.salvoMult);
        if (t < e.at - (e.travel || G.torpedo.travel)) return;
      }
      if (m.helm && e.type === "salvo") m.helm.torpedoLaunched(e, s);       // Tactical reports it; the captain: break, or take it
      var hitB = s.bearing + (self.rng.next() - 0.5) * 24, hit = self.rim(hitB);
      var nose = { x: s.x - Math.sin(s.rot) * s.h / 2, y: s.y + Math.cos(s.rot) * s.h / 2 };
      var torp = { id: self.nextId++, ev: e, x0: nose.x, y0: nose.y, x1: hit.x, y1: hit.y, hitB: hitB, t0: t, t1: e.at, x: nose.x, y: nose.y, weak: !!e.ionized,
        size: (BL.TORPEDOES[e.torpSize] || {}).down || 1 };      // a dart is a small target, a ship killer a big one
      if (e.type === "strike") {
        // A drive strike swings wide around the shield and dives into the stern: its curve bends
        // through a point off the beam on its own side, halfway round to the stern.
        var dp = self.drivePoint(), sb = norm(s.bearing), mid = (sb >= 0 ? sb + 180 : sb - 180) / 2, R = self.R, far = Math.max(R.ry * 1.9, 0.3);
        torp.strike = true; torp.x1 = dp.x; torp.y1 = dp.y; torp.hitB = 180;
        torp.cx = R.cx + far * Math.sin(mid * RAD); torp.cy = R.cy - far * Math.cos(mid * RAD);
        count(self, "strikes");
      }
      e.torp = torp; self.torps.push(torp);
      if (self.cur) { self.stats.torps++; self.cur.torps++; } else self.stats.torps++;
      m.cue("torpLaunch");
    });
  };

  // An enemy gun fires (Mission.runEnemyGuns): a red bolt from one of the wave's ships to our shield.
  RingTurret.prototype.enemyShot = function (w, size, hit) {
    var live = (w.ships || []).filter(function (s) { return !s.dead && s.state !== "leave" && s.state !== "enter"; });
    if (!live.length) return;
    var s = live[Math.floor(this.rng.next() * live.length)], p = this.rim(s.bearing + (this.rng.next() - 0.5) * 20);
    var miss = hit ? 0 : 0.06;
    this.effects.push({ type: "ebolt", x: s.x, y: s.y, x1: p.x + (this.rng.next() - 0.5) * miss * 2, y1: p.y + (this.rng.next() - 0.5) * miss * 2, at: this.m.totalT, big: size !== "light", hit: hit });
  };

  /* ----------------------------------------------------------------- CIWS
     Destroyer escort and up: the CIWS mounts fire on each drive strike by themselves as it closes
     on the stern. If the CIWS capacitor holds that strike's charge, the burst kills it most of the
     time (ciws.kill); if not, it fires what it has and misses, and the strike hits the drive. Any
     gun can shoot one down first. */
  RingTurret.prototype.runCIWS = function () {
    var m = this.m, pd = m.sys("pd"), C = this.G.ring.ciws, self = this, now = m.totalT, dead = [];
    if (!pd) return;
    this.torps.forEach(function (tp) {
      if (!tp.strike) return;
      var e = tp.ev;
      if (!tp.ciws && e.at - m.t <= C.engage) {
        var full = pd.mj >= e.mj - 0.5, had = pd.mj > 1, kill = full && self.rng.chance(C.kill);
        pd.mj = full ? pd.mj - e.mj : 0;
        tp.ciws = { at: now, kill: kill, fire: full ? C.burst : had ? C.burst * 0.5 : 0, next: 0 };
        if (!full) m.chat("ciwsDry", null, "bad");
      }
      var cw = tp.ciws;
      if (cw && now - cw.at < cw.fire && now >= cw.next) {
        cw.next = now + 0.05;
        var mt = self.nearestMount(tp), miss = cw.kill ? 0.006 : 0.04;
        if (mt) self.effects.push({ type: "ciws", x: mt.x, y: mt.y, x1: tp.x + (self.rng.next() - 0.5) * miss, y1: tp.y + (self.rng.next() - 0.5) * miss, at: now });
        if (cw.next - cw.at < 0.06) m.cue("pd");
      }
      if (cw && cw.kill && now - cw.at >= cw.fire) dead.push(tp);
    });
    dead.forEach(function (tp) {
      var e = tp.ev, st = m.stats;
      e.done = true; e.downed = true;
      self.torps = self.torps.filter(function (x) { return x !== tp; });
      count(self, "strikesCiws");
      st.strikes++; if (e.visible) { st.strikesAnnounced++; st.strikesStopped++; }
      self.effects.push({ type: "torpBoom", x: tp.x, y: tp.y, at: now });
      if (self.rng.chance(0.4)) m.chat("pdStopped", null, "good");
    });
  };
  RingTurret.prototype.nearestMount = function (tp) {
    var best = null, bd = 1e9;
    this.ciwsMounts().forEach(function (p) { var d = Math.hypot(p.x - tp.x, p.y - tp.y); if (d < bd) { bd = d; best = p; } });
    return best;
  };
  // Where a drive strike is at share p of its flight (a curve through cx, cy), and its heading.
  RingTurret.prototype.strikeAt = function (tp, p) {
    var u = 1 - p;
    return { x: u * u * tp.x0 + 2 * u * p * tp.cx + p * p * tp.x1, y: u * u * tp.y0 + 2 * u * p * tp.cy + p * p * tp.y1,
             dx: 2 * u * (tp.cx - tp.x0) + 2 * p * (tp.x1 - tp.cx), dy: 2 * u * (tp.cy - tp.y0) + 2 * p * (tp.y1 - tp.cy) };
  };
  RingTurret.prototype.downTorpedo = function (tp, b) {
    if (tp.strike) count(this, "strikesShot");
    return this.downMine(tp, b);
  };
  // Drive strikes fly their curve; one that lands blows up on the drive. The rest land as usual.
  RingTurret.prototype.landTorpedoes = function () {
    var m = this.m, self = this, strikes = [], field = [];
    this.torps = this.torps.filter(function (tp) { if (tp.strike) strikes.push(tp); if (tp.field) field.push(tp); return !tp.strike && !tp.field; });
    BL.Turret.prototype.landTorpedoes.call(this);
    this.moveFieldMines(field);
    strikes.forEach(function (tp) {
      var e = tp.ev;
      if (e.done) {
        if (!e.downed) {
          count(self, "strikesHit");
          self.effects.push({ type: "boom", x: tp.x1, y: tp.y1, at: m.totalT, size: 0.09 }, { type: "driveHit", x: tp.x1, y: tp.y1, at: m.totalT });
        }
        return;
      }
      if (m.events.indexOf(e) < 0) { self.effects.push({ type: "torpBoom", x: tp.x, y: tp.y, at: m.totalT }); return; }
      tp.t1 = e.at;
      var q = self.strikeAt(tp, clamp((m.t - tp.t0) / Math.max(0.1, tp.t1 - tp.t0), 0, 1));
      tp.x = q.x; tp.y = q.y; tp.dx = q.dx; tp.dy = q.dy;
      self.torps.push(tp);
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
      this.torps.forEach(function (tp) { consider(tp.x, tp.y, 0.024 * (tp.size || 1), { torp: tp }); });
      this.ships.forEach(function (s) { if (!s.dead && s.state !== "leave") consider(s.x, s.y, Math.max(s.w, s.h) * 0.45, { ship: s }); });
      if (best && b.dist + step * bestT <= maxD) {
        var d = b.dist + step * bestT;
        b.power = d <= reach ? 1 : lg.at + (lg.end - lg.at) * Math.min(1, (d - reach) / lg.extra);
        b.x = x0 + (x1 - x0) * bestT; b.y = y0 + (y1 - y0) * bestT;
        // (a helm minefield's mines are small: the crew's bolts mostly near-miss them)
        if (best.torp && ((b.power < 1 && !this.rng.chance(b.power)) || (best.torp.crewHit !== undefined && !b.mine && !this.rng.chance(best.torp.crewHit)))) {
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

  /* ------------------------------------------------------------ Gun crew
     Same standing orders as the rail view; a target counts only if it's inside the gun's arc
     and within reach of the rim, and the gun turns to face it. A crewman (b.crew) plays it like
     a person: slow to take things in, aim a little off, rough about when to open fire, and now
     and then after the wrong target (GUNNERY.crew). With no crewman (the test bot) it plays
     like a machine. */
  RingTurret.prototype.inReachOf = function (b, x, y) {
    var phi = this.bearingOf(x, y), rel = this.relFor(b, phi);
    if (rel === null) return null;
    var p = this.rim(phi);
    return Math.hypot(x - p.x, y - p.y) <= this.reach(b) ? rel : null;
  };
  RingTurret.prototype.aiBattery = function (b) {
    var m = this.m, G = this.G, r = this.rng, self = this, cw = b.crew, C = G.crew;
    if (m.totalT < b.aiNext) return;
    var skill = cw ? cw.skill : G.aiGunner, k = cw ? (skill - C.skill[0]) / (C.skill[1] - C.skill[0]) : 1;
    function lerp(p) { return p[0] + (p[1] - p[0]) * clamp(k, 0, 1); }
    var strain = cw && (m.ship.crippled || m.ship.hull < m.data.hull * 0.5) ? C.strain : 1;
    var react = cw ? lerp(C.react) * strain : 0.12;
    b.aiNext = m.totalT + react * (cw ? 0.7 + 0.6 * r.next() : 1);
    var order = this.orderFor(b).order, target = null, rel = 0, best = 1e9, seen = [];
    function torps(within) {
      self.torps.forEach(function (tp) {
        if (cw && m.t - tp.t0 < react * C.notice) return;          // not spotted yet
        var left = tp.t1 - m.t, rr = self.inReachOf(b, tp.x, tp.y);
        if (rr !== null) seen.push([tp, rr]);
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
        seen.push([s, rr]);
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
    for (var q = 0; q < plans.length && !target; q++) { best = 1e9; plans[q][0](plans[q][1], plans[q][2]); }
    if (cw) {
      // A person: sometimes after something else they can see; once on a target, they stay on
      // it a while (a new pick only when it's gone or out of reach, or now and then).
      var keep = b.aiTarget && !b.aiTarget.dead && b.aiTarget.state !== "leave" && seen.some(function (x) { return x[0] === b.aiTarget; });
      if (keep && r.chance(0.7)) { target = b.aiTarget; seen.forEach(function (x) { if (x[0] === target) rel = x[1]; }); }
      else if (seen.length && r.chance(lerp(C.wrong) * strain)) { var w = r.pick(seen); target = w[0]; rel = w[1]; }
      if (target !== b.aiTarget) b.aiOnAt = m.totalT;
      var settle = 1 / (1 + (m.totalT - (b.aiOnAt || 0)) / C.settle);   // walking their fire in
      if (target !== b.aiTarget || r.chance(0.25)) b.aiJitter = (r.next() + r.next() - 1) * lerp(C.aimErr) * strain * settle;
      b.aiTarget = target;
    } else if (r.chance(0.2)) b.aiJitter = (r.next() - 0.5) * 6 * (1 - skill);
    if (target) { b.aimRel = this.full(b) ? b.rel + norm(rel + b.aiJitter - b.rel) : clamp(rel + b.aiJitter, -b.arcH, b.arcH); }
    b.dir = 0;
    var gun = this.gun(b), aligned = false;
    if (target) {
      // On the firing line: the target's distance from the gun's straight-out line (a crewman
      // judges it from where they think it is, their aim error included).
      var dx = target.x - b.x, dy = target.y - b.y, along = dx * b.nx + dy * b.ny, off = Math.abs(dx * b.ny - dy * b.nx);
      var rad = target.w ? Math.max(target.w, target.h) * 0.45 : 0.024;
      if (cw) { var d = Math.hypot(dx, dy), miss = Math.abs(norm(self.bearingOf(target.x, target.y) + b.aiJitter - b.phi));
        aligned = along > 0 && miss * RAD * d < rad * lerp(C.loose); }
      else aligned = along > 0 && off < rad * (0.6 + 0.6 * skill);
    }
    b.firing = aligned && gun.mj >= b.w.shotMJ;
    if (target && gun.mj < b.w.shotMJ * 2) this.callPower(b);
  };
})(typeof window !== "undefined" ? window : globalThis);
