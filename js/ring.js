/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert gunner station, ring view (destroyer and up). The ship sits in the center inside
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
    this.R = BL.GUNNERY.ring;
    var arcs = opts.arcs || [], self = this;
    this.bats.forEach(function (b, i) {
      var a = arcs[i] || [0, 180];
      b.arcC = a[0]; b.arcH = a[1]; b.arcName = (opts.arcNames || [])[i] || "";
      b.rel = b.aimRel = a[2] === undefined ? 0 : norm(a[2] - a[0]);
      self.placeBattery(b);
    });
  }
  RingTurret.prototype = Object.create(BL.Turret.prototype);
  RingTurret.prototype.constructor = RingTurret;
  BL.RingTurret = RingTurret;

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
    this.launchTorpedoes();
    this.ships.forEach(function (s) { s.chargeAt = 0; });
    m.events.forEach(function (e) {
      if ((e.type !== "salvo" && e.type !== "strike") || e.done || e.torp || !e.announced || !e.visible) return;
      var s = self.shipOf(e), la = e.at - G.torpedo.travel;
      if (s && !s.dead && s.state !== "leave" && (!s.chargeAt || la < s.chargeAt)) { s.chargeAt = la; s.chargeFrom = Math.min(e.announceAt, la - 0.5); }
    });
    this.fire(dt);
    this.moveBolts(dt);
    this.landTorpedoes();
    var now = m.totalT;
    this.effects = this.effects.filter(function (f) { return now - f.at < 1.6; });
  };

  /* --------------------------------------------------------------- Enemies */
  // A wave comes in from one bearing (mostly ahead and on the flanks on a destroyer) and its
  // ships spread out around it at their holding distance.
  RingTurret.prototype.addGroup = function (list, wave, type, look, n, totalHp) {
    var r = this.rng, t = this.m.t, R = this.R, hp = totalHp / n;
    if (wave.bearing === undefined) {
      var bw = R.bearings, keys = Object.keys(bw), tot = 0, pick = r.next() * keys.reduce(function (a, k) { return a + bw[k]; }, 0);
      for (var q = 0; q < keys.length; q++) { tot += bw[keys[q]]; if (pick <= tot) { wave.bearing = +keys[q] + (r.next() - 0.5) * 30; break; } }
      if (wave.bearing === undefined) wave.bearing = 0;
    }
    var band = look.ringR || [0.36, 0.44], groupPhase = r.next() * Math.PI * 2, groupPeriod = r.range(look.period);
    var hold = r.range(band), spread = (look.w + 0.05) / hold / RAD;
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
      if (t < s.jinkUntil) s.home += s.jinkDir * 40 * dt;
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
      var hit = self.rim(s.bearing + (self.rng.next() - 0.5) * 24);
      var nose = { x: s.x - Math.sin(s.rot) * s.h / 2, y: s.y + Math.cos(s.rot) * s.h / 2 };
      var torp = { id: self.nextId++, ev: e, x0: nose.x, y0: nose.y, x1: hit.x, y1: hit.y, t0: t, t1: e.at, x: nose.x, y: nose.y, weak: !!e.ionized };
      e.torp = torp; self.torps.push(torp);
      if (self.cur) { self.stats.torps++; self.cur.torps++; } else self.stats.torps++;
      m.cue("torpLaunch");
    });
  };

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
  // first ship or torpedo along it takes the hit.
  RingTurret.prototype.moveBolts = function (dt) {
    var keep = [];
    for (var i = 0; i < this.bolts.length; i++) {
      var b = this.bolts[i], bat = this.bats[b.bat], w = bat.w, reach = this.reach(bat);
      var step = w.speed * dt * 0.6, x0 = b.x, y0 = b.y, x1 = b.x + b.vx * step, y1 = b.y + b.vy * step;
      var best = null, bestT = 2;
      var consider = function (px, py, rad, what) {
        var dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
        var u = clamp(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1), cx = x0 + u * dx - px, cy = y0 + u * dy - py;
        if (cx * cx + cy * cy <= rad * rad && u < bestT) { bestT = u; best = what; }
      };
      this.torps.forEach(function (tp) { consider(tp.x, tp.y, 0.024, { torp: tp }); });
      this.ships.forEach(function (s) { if (!s.dead && s.state !== "leave") consider(s.x, s.y, Math.max(s.w, s.h) * 0.45, { ship: s }); });
      if (best && b.dist + step * bestT <= reach) {
        if (b.mine) { this.stats.hits++; if (this.cur) this.cur.hits++; bat.hits++; } else bat.aiHits++;
        b.x = x0 + (x1 - x0) * bestT; b.y = y0 + (y1 - y0) * bestT;
        if (best.torp) this.downTorpedo(best.torp, b); else this.hitShip(best.ship, b);
        continue;
      }
      b.x = x1; b.y = y1; b.dist += step;
      if (b.dist < reach && b.x > -0.05 && b.x < 1.05 && b.y > -0.05 && b.y < 1.05) keep.push(b);
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
    this.damageShip(s, w.damage * bonus, b.mine ? 0 : bat.gunNo, b.mine);
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
