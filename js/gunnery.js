/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert gunner station: the turret. Pure simulation, no screen code, stepped by the
   Mission it belongs to (Mission.step calls turret.step before the events run).
   The engine room sees a wave as one pool of hit points; here it is several ships, and each
   salvo is a torpedo launched by one of them. The player slides the turret and fires straight
   up; a bolt hits the first ship or torpedo it reaches. A torpedo shot down never lands. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // opts: { weapons: ["pulse", "rail"] } (one per battery, Gun 1 first), or { weapon: "rail" }
  // for a single battery. The player aims one battery (sel); an AI gunner works the others.
  function Turret(m, opts) {
    this.m = m;
    this.G = BL.GUNNERY;
    var list = opts.weapons || [opts.weapon || "pulse"], n = list.length, orders = opts.orders || [];
    this.bats = list.map(function (id, i) {
      var wid = BL.WEAPONS[id] ? id : "pulse", x = n === 1 ? 0.5 : 0.2 + 0.6 * i / (n - 1);
      return { i: i, gunNo: i + 1, gunId: "gun" + (i + 1), weaponId: wid, w: BL.WEAPONS[wid], x: x, aimX: x, dir: 0,
        firing: false, nextShot: 0, dryCueAt: 0, callReadyAt: 0, aiNext: 0, aiJitter: 0,
        // hit rate on this gun for the whole mission: yours, and the AI gunner's when it has the gun
        shots: 0, hits: 0, aiShots: 0, aiHits: 0,
        order: BL.GUNNERY.orders[orders[i]] ? orders[i] : "auto" };
    });
    this.sel = 0;
    this.rng = BL.rng((m.seed ^ 0x5bd1e995) >>> 0);
    this.ships = []; this.torps = []; this.bolts = []; this.effects = [];
    this.nextId = 1;
    this.engineer = BL.pickEngineer(m.seed, m.data.classId);
    this.stats = { shots: 0, hits: 0, torpHits: 0, torps: 0, downed: 0, ships: 0, kills: 0, damage: 0, dryTime: 0, calls: 0, hullTorps: 0,
      ptFired: 0, ptHits: 0, ptDowned: 0, ptMissed: 0, firingTime: 0, liveTime: 0 };
    this.ptTorps = []; this.pt = [];
    this.jumps = [];                    // per sortie / system: the same counts
  }
  BL.Turret = Turret;
  // Height of the shield dome's surface at x (field units); torpedoes land on it.
  BL.shieldY = function (x) {
    var S = BL.GUNNERY.shield, k = (x - S.cx) / S.rx;
    return S.cy - S.ry * Math.sqrt(Math.max(0, 1 - k * k));
  };
  // The selected battery's fields read as the turret's own, so screens written for one gun work.
  ["x", "aimX", "dir", "firing", "w", "weaponId", "gunNo", "gunId", "nextShot"].forEach(function (k) {
    Object.defineProperty(Turret.prototype, k, { get: function () { return this.bats[this.sel][k]; }, set: function (v) { this.bats[this.sel][k] = v; } });
  });
  Turret.prototype.bat = function (b) { return b === undefined ? this.bats[this.sel] : b; };
  Turret.prototype.owns = function (gunNo) { return this.bats.some(function (b) { return b.gunNo === gunNo; }); };
  // Hand the player another battery; the AI gunner takes over the one left behind.
  Turret.prototype.select = function (i) {
    if (i < 0 || i >= this.bats.length || i === this.sel) return false;
    var old = this.bats[this.sel]; old.firing = false; old.dir = 0;
    this.sel = i; var b = this.bats[i]; b.firing = false; b.dir = 0; b.aimX = b.x;
    this.m.cue("toggle");
    return true;
  };

  Turret.prototype.gun = function (b) { return this.m.sys(this.bat(b).gunId); };
  // The gun as damage has left it: range, time between shots, slide speed.
  Turret.prototype.reach = function (b) { b = this.bat(b); return b.w.reach * this.m.turretFactor(this.gun(b), "reach"); };
  Turret.prototype.interval = function (b) { b = this.bat(b); return b.w.interval / this.m.turretFactor(this.gun(b), "rate") * (this.m.ship.crippled ? 1.6 : 1); };
  Turret.prototype.traverse = function (b) { b = this.bat(b); return this.G.traverse * this.m.turretFactor(this.gun(b), "slide") * (this.m.ship.crippled ? 0.7 : 1); };

  // The engineer running the power while you're at the gun: a name and a skill, rolled from
  // the mission seed (its own random stream, so the mission itself is unchanged). Job offers
  // call it too, so the offer names the engineer you'll actually get.
  BL.pickEngineer = function (seed, classId) {
    var E = BL.GUNNERY.engineer, r = BL.rng((seed ^ 0x2c1b3c6d) >>> 0);
    var range = E.skill[classId] || E.skill.other, skill = Math.round(r.range(range) * 100) / 100;
    var rank = E.ranks[skill >= 0.85 ? 2 : skill >= 0.7 ? 1 : 0];
    var first = r.pick(E.first), last = r.pick(E.last);
    return { name: rank + " " + first + " " + last, who: first + " " + last, skill: skill,
      label: skill >= 0.85 ? "sharp" : skill >= 0.7 ? "steady" : skill >= 0.5 ? "green" : "sloppy" };
  };

  /* ---------------------------------------------------------- Player input */
  Turret.prototype.aimAt = function (x) { this.aimX = clamp(x, 0.03, 0.97); this.dir = 0; };
  Turret.prototype.setDir = function (d) { this.dir = d; if (!d) this.aimX = this.x; };
  Turret.prototype.trigger = function (on) { this.firing = !!on; };
  // CALL FOR POWER: a rapid-fire request to the engineer, like the ones AI gunners make.
  // b = another battery calling (its AI gunner); default the player's.
  Turret.prototype.callPower = function (b) {
    var player = b === undefined || b === this.bats[this.sel];
    b = this.bat(b);
    var m = this.m, s = this.gun(b), t = m.t;
    if (!s || s.request || t < b.callReadyAt || !this.live()) return false;
    s.request = { until: t + this.G.call.seconds, wanted: 0, fired: 0, dryCalled: false, jump: m.jumpIndex + 1, t: t, gun: b.gunNo, player: player };
    b.callReadyAt = s.request.until + this.G.call.cooldown;
    if (player) { this.stats.calls++; m.cue("request"); m.chat("powerCall", null, "good"); }
    else m.chat("request", { n: b.gunNo }, "warn");
    return true;
  };
  Turret.prototype.callState = function (b) {
    b = this.bat(b);
    var s = this.gun(b), t = this.m.t;
    if (s && s.request) return { state: "on", left: s.request.until - t };
    if (t < b.callReadyAt) return { state: "wait", left: b.callReadyAt - t };
    return { state: "ready", left: 0 };
  };
  Turret.prototype.live = function () { var p = this.m.phase; return p === "arrival" || p === "engage" || p === "countdown"; };

  /* ------------------------------------------------------------- Lifecycle */
  Turret.prototype.reset = function () {
    this.clear();
    this.cur = { ships: 0, kills: 0, torps: 0, downed: 0, shots: 0, hits: 0, hullTorps: 0, ptFired: 0, ptHits: 0, ptDowned: 0, ptMissed: 0 };
    this.jumps[this.m.jumpIndex] = this.cur;
    // The carrier reloads the torpedo tubes on every recovery.
    var n = this.m.data.torpedoes || 0;
    this.pt = []; for (var i = 0; i < n; i++) this.pt.push(true);
    // Timers run on the system's clock, which restarts at 0 on every launch or arrival.
    this.bats.forEach(function (b) { b.callReadyAt = 0; b.nextShot = 0; b.aiNext = 0; });
  };
  Turret.prototype.clear = function () {
    this.ships = []; this.torps = []; this.bolts = []; this.ptTorps = [];
    this.bats.forEach(function (b) { b.firing = false; b.dir = 0; b.aimX = b.x; });
  };
  function bump(self, key, n) { self.stats[key] += n || 1; if (self.cur && self.cur[key] !== undefined) self.cur[key] += n || 1; }

  // A new wave arrives as a group of ships; its toughness is split between them. A capital
  // ship brings escorts, who take their share; the wave's torpedoes all come from the big ship.
  Turret.prototype.spawnShips = function (wave) {
    var look = this.G.looks[wave.type] || this.G.looks.raiders, esc = look.escorts, list = [];
    var n = this.addGroup(list, wave, wave.type, look, this.rng.int(look.count), wave.hpMax * (esc ? 1 - esc.share : 1));
    if (esc) this.addGroup(list, wave, esc.type, this.G.looks[esc.type], esc.count, wave.hpMax * esc.share);
    wave.ships = list;
    bump(this, "ships", list.length);
    // Each of the wave's salvos is a torpedo from one of its main ships, in turn.
    var k = 0;
    this.m.events.forEach(function (e) {
      if (e.wave === wave.id && (e.type === "salvo" || e.type === "strike")) e.shipIdx = e.escort !== undefined ? n + e.escort : k++ % n;
    });
  };
  Turret.prototype.addGroup = function (list, wave, type, look, n, totalHp) {
    var r = this.rng, t = this.m.t, hp = totalHp / n;
    var groupPhase = r.next() * Math.PI * 2, groupPeriod = r.range(look.period);
    var span = Math.min(0.78, n * (look.w + 0.08)), left = 0.5 - span / 2 + (r.next() - 0.5) * (0.9 - span) * 0.5;
    for (var i = 0; i < n; i++) {
      var homeX = n === 1 ? 0.5 : left + span * (i + 0.5) / n;
      var s = {
        id: this.nextId++, wave: wave.id, type: type, name: look.ship, w: look.w, h: look.h,
        lockable: !!look.capital || type === "siege", jinkUntil: 0, jinkDir: 0,
        hp: hp, hpMax: hp, homeX: homeX, x: homeX, y: -0.08 - r.next() * 0.08,
        stationY: r.range(look.band), sway: look.sway * (look.formation ? 1 : 0.7 + r.next() * 0.6),
        period: look.formation ? groupPeriod : r.range(look.period),
        phase: look.formation ? groupPhase : r.next() * Math.PI * 2,
        dive: look.dive, diveAt: t + 3 + r.next() * 4, diveUntil: 0,
        born: t, state: "enter", ionUntil: 0, flashAt: -9, dead: false
      };
      list.push(s); this.ships.push(s);
    }
    return n;
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

    // The AI gunner works every battery the player isn't aiming.
    this.bats.forEach(function (b, i) { if (i !== self.sel) self.aiBattery(b); });
    // Traverse: keys push the aim point along; a turret never slides faster than its drive.
    // Turrets pass each other freely: each has the whole rail.
    this.bats.forEach(function (b) {
      var trav = self.traverse(b);
      if (b.dir) b.aimX = clamp(b.x + b.dir * trav * 0.25, 0.03, 0.97);
      var dx = b.aimX - b.x, mv = trav * dt;
      b.x += Math.abs(dx) <= mv ? dx : (dx > 0 ? mv : -mv);
    });

    // For the profile's aggression: how much of the fight the trigger was held.
    if (this.live() && m.phase !== "arrival") { this.stats.liveTime += dt; if (this.firing) this.stats.firingTime += dt; }
    this.moveShips(dt);
    this.launchTorpedoes();
    // Ships about to fire: from the warning until launch they charge, so every call has a ship to watch.
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

  Turret.prototype.moveShips = function (dt) {
    var t = this.m.t, keep = [];
    for (var i = 0; i < this.ships.length; i++) {
      var s = this.ships[i];
      if (s.dead) continue;
      // A big ship sidesteps a torpedo closing on it.
      if (t < s.jinkUntil) s.homeX = clamp(s.homeX + s.jinkDir * (this.G.pt.jink[s.type] || 0) * dt, s.w / 2 + 0.02, 1 - s.w / 2 - 0.02);
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
      var ion = BL.WEAPONS.ion.ion;
      if (t < s.ionUntil && !e.ionized) {
        e.ionized = true; e.at += ion.delay; e.mj = Math.round(e.mj * ion.salvoMult);
        if (t < e.at - G.torpedo.travel) return;          // launches later
      }
      var x1 = 0.22 + self.rng.next() * 0.56;
      var torp = { id: self.nextId++, ev: e, x0: s.x, y0: s.y + s.h / 2, x1: x1, y1: BL.shieldY(x1), t0: t, t1: e.at, x: s.x, y: s.y + s.h / 2, weak: !!e.ionized };
      e.torp = torp;
      self.torps.push(torp);
      bump(self, "torps");
      m.cue("torpLaunch");
    });
  };

  Turret.prototype.fire = function (dt) {
    var self = this;
    this.bats.forEach(function (b, i) { self.fireBattery(b, dt, i === self.sel); });
  };
  // mine = the player is aiming this battery: only those shots count toward your stats.
  Turret.prototype.fireBattery = function (b, dt, mine) {
    var m = this.m, t = m.t, s = this.gun(b), w = b.w;
    if (!s) return;
    if (s.request && t >= s.request.until) m.closeRequest(s);
    if (!b.firing || !this.live() || t < b.nextShot) return;
    if (s.mj >= w.shotMJ) {
      s.mj -= w.shotMJ;
      b.nextShot = t + this.interval(b);
      if (s.request) { s.request.wanted++; s.request.fired++; }
      this.bolts.push({ id: this.nextId++, bat: b.i, weaponId: b.weaponId, mine: mine, x: b.x, y: this.G.turretY - 0.03, y0: this.G.turretY - 0.03, born: m.totalT });
      if (mine) { bump(this, "shots"); b.shots++; } else b.aiShots++;
      m.cue(b.weaponId);
    } else {
      if (mine) this.stats.dryTime += dt;
      if (s.request && t >= b.nextShot) { s.request.wanted++; b.nextShot = t + this.interval(b); }
      if (mine && m.totalT >= b.dryCueAt) { b.dryCueAt = m.totalT + 0.45; m.cue("dry"); }
    }
  };

  /* Standing orders. setOrder cycles or sets a gun's order; orderFor says what the gun is
     actually doing ("auto" resolves to the suggestion for this fight) and why. */
  Turret.prototype.setOrder = function (b, order) {
    b = this.bat(b);
    b.order = this.G.orders[order] ? order : "auto";
    this.m.say("Gunner " + b.gunNo + ": " + this.G.orders[b.order].ack, "good");
    this.m.cue("toggle");
    return b.order;
  };
  Turret.prototype.suggestOrder = function (b) {
    b = this.bat(b);
    var m = this.m, types = {}, enc = m.route[m.jumpIndex];
    this.ships.forEach(function (s) { if (!s.dead && s.state !== "leave") types[s.type] = (types[s.type] || 0) + (s.lockable ? 3 : 1); });
    var main = Object.keys(types).sort(function (a, c) { return types[c] - types[a]; })[0] || enc;
    var look = this.G.looks[main] || {}, foe = look.ship ? BL.plural(look.ship) : "the enemy";
    if (b.w.best.indexOf(main) >= 0) return { order: "hunt", why: "the " + b.w.name.toLowerCase() + " is best against " + foe };
    return { order: "defend", why: "the " + b.w.name.toLowerCase() + " has no edge on " + foe + ", so it guards against torpedoes" };
  };
  Turret.prototype.orderFor = function (b) {
    b = this.bat(b);
    if (b.order !== "auto") return { order: b.order, auto: false, why: this.G.orders[b.order].what };
    var s = this.suggestOrder(b); s.auto = true; return s;
  };

  // The AI gunner on a battery the player isn't aiming, following that gun's standing order.
  Turret.prototype.aiBattery = function (b) {
    var m = this.m, G = this.G, r = this.rng, skill = G.aiGunner;
    if (m.totalT < b.aiNext) return;
    b.aiNext = m.totalT + 0.12;
    var order = this.orderFor(b).order;
    var top = G.turretY - this.reach(b), target = null, tx = b.x, best = 1e9;
    function inReach(s) { return !s.dead && s.state !== "leave" && s.y + s.h / 2 >= top && s.y >= 0; }
    // Torpedoes closer than `within` seconds to landing, soonest first.
    function torps(within) {
      this.torps.forEach(function (tp) {
        var left = tp.t1 - m.t;
        if (left < within && tp.y > top && left < best) { best = left; target = tp; tx = tp.x1 + (tp.x - tp.x1) * 0.3; }
      });
    }
    // Ships charging to fire, the one that fires soonest first.
    function charging() {
      this.ships.forEach(function (s) {
        if (!inReach(s) || !(s.chargeAt > m.t)) return;
        var d = s.chargeAt - m.t + Math.abs(s.x - b.x) * 0.5;
        if (d < best) { best = d; target = s; tx = s.x; }
      });
    }
    // Ships, nearest first; with `matched`, only those this weapon is best against.
    function ships(matched, penalty) {
      this.ships.forEach(function (s) {
        if (!inReach(s)) return;
        var good = b.w.best.indexOf(s.type) >= 0;
        if (matched && !good) return;
        var d = Math.abs(s.x - b.x) + (good ? 0 : penalty);
        if (d < best) { best = d; target = s; tx = s.x; }
      });
    }
    var plans = {
      defend: [[torps, 2.4], [charging], [ships, false, 0.35]],
      stop:   [[charging], [torps, 1.2], [ships, false, 0.35]],
      hunt:   [[torps, 0.8], [ships, true], [ships, false, 0.35]],
      free:   [[torps, 1.6], [ships, false, 0.35]]
    }[order] || [[torps, 1.6], [ships, false, 0.35]];
    for (var k = 0; k < plans.length && !target; k++) { best = 1e9; plans[k][0].call(this, plans[k][1], plans[k][2]); }
    if (r.chance(0.2)) b.aiJitter = (r.next() - 0.5) * 0.06 * (1 - skill);
    b.aimX = clamp(tx + b.aiJitter, 0.03, 0.97); b.dir = 0;
    var half = target ? (target.w ? target.w / 2 : G.torpedo.size) : 0, gun = this.gun(b);
    b.firing = !!target && Math.abs(b.x - tx) < half * (0.6 + 0.6 * skill) && gun.mj >= b.w.shotMJ;
    if (target && gun.mj < b.w.shotMJ * 2) this.callPower(b);
  };

  // Bolts fly straight up; each tick sweeps from where it was to where it is, so fast rail
  // slugs can't skip through a ship. The nearest thing in the sweep takes the hit.
  Turret.prototype.moveBolts = function (dt) {
    var G = this.G, keep = [];
    for (var i = 0; i < this.bolts.length; i++) {
      var b = this.bolts[i], bat = this.bats[b.bat], w = bat.w, top = G.turretY - this.reach(bat);
      var yOld = b.y, yNew = b.y - w.speed * dt, best = null, bestY = -1;
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
        if (b.mine) { bump(this, "hits"); this.bats[b.bat].hits++; } else this.bats[b.bat].aiHits++;
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
    if (b && b.mine) { bump(this, "downed"); bump(this, "torpHits"); }
    this.effects.push({ type: "torpBoom", x: tp.x, y: tp.y, at: m.totalT });
    m.cue("torpDown");
    if (this.rng.chance(0.3)) m.chat("torpDown", null, "good");
  };

  Turret.prototype.hitShip = function (s, b) {
    var m = this.m, bat = this.bats[b.bat], w = bat.w, bonus = w.best.indexOf(s.type) >= 0 ? this.G.bonus : 1;
    if (w.ion) s.ionUntil = m.t + w.ion.seconds;
    s.flashAt = m.totalT;
    this.effects.push({ type: "spark", x: b.x, y: s.y + s.h / 2, at: m.totalT, weapon: bat.weaponId });
    m.cue("shipHit");
    this.damageShip(s, w.damage * bonus, b.mine ? 0 : bat.gunNo, b.mine);
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
    if (s.chargeAt > m.t && this.rng.chance(0.6)) m.chat("chargeStopped", null, "good");
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

  /* -------------------------------------------------- Our torpedoes (PT) */
  // LAUNCH 1 / LAUNCH 2: tube i fires from its side of the bow, locked on the nearest big ship.
  Turret.prototype.launchPT = function (i) {
    var m = this.m;
    if (!this.live() || !this.pt[i]) return false;
    this.pt[i] = false;
    var tp = { id: this.nextId++, x: clamp(this.x + (i ? 0.035 : -0.035), 0.03, 0.97), y: this.G.turretY - 0.02, a: -Math.PI / 2, target: null, tube: i + 1 };
    tp.target = this.lockFor(tp);
    this.ptTorps.push(tp);
    bump(this, "ptFired");
    m.cue("ptLaunch");
    m.chat("ptAway", { n: i + 1 }, "good");
    return true;
  };
  Turret.prototype.touches = function (s, x, y) { return Math.abs(s.x - x) <= s.w / 2 && Math.abs(s.y - y) <= s.h / 2; };
  Turret.prototype.lockFor = function (tp) {
    var best = null, bd = 1e9;
    this.ships.forEach(function (s) {
      if (!s.lockable || s.dead || s.state === "leave" || s.y < 0) return;
      var d = Math.hypot(s.x - tp.x, s.y - tp.y);
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  };
  Turret.prototype.movePT = function (dt) {
    var m = this.m, P = this.G.pt, t = m.t, keep = [];
    for (var i = 0; i < this.ptTorps.length; i++) {
      var tp = this.ptTorps[i], tg = tp.target;
      if (!tg || tg.dead || tg.state === "leave") tg = tp.target = this.lockFor(tp);
      if (tg) {
        var want = Math.atan2(tg.y - tp.y, tg.x - tp.x), diff = want - tp.a;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        var mt = P.turn * Math.PI / 180 * dt;
        tp.a += clamp(diff, -mt, mt);
        var d = Math.hypot(tg.x - tp.x, tg.y - tp.y);
        if (d < P.jinkAt && t >= tg.jinkUntil) { tg.jinkUntil = t + P.jinkSeconds; tg.jinkDir = tg.x >= tp.x ? 1 : -1; }
        if (d < P.pdRange && this.rng.chance((P.pd[tg.type] || 0) * dt)) {
          bump(this, "ptDowned");
          this.effects.push({ type: "torpBoom", x: tp.x, y: tp.y, at: m.totalT });
          m.cue("torpDown"); m.chat("ptDowned", null, "bad");
          continue;
        }
      }
      tp.x += Math.cos(tp.a) * P.speed * dt; tp.y += Math.sin(tp.a) * P.speed * dt;
      var hit = null;
      for (var k = 0; k < this.ships.length && !hit; k++) {
        var s = this.ships[k];
        if (!s.dead && s.state !== "leave" && this.touches(s, tp.x, tp.y)) hit = s;
      }
      if (hit) {
        bump(this, "ptHits");
        hit.flashAt = m.totalT;
        this.effects.push({ type: "boom", x: tp.x, y: tp.y, at: m.totalT, size: 0.16 });
        m.cue("main");
        m.chat("ptHit", { enemy: hit.name }, "good");
        this.damageShip(hit, P.damage * m.data.threat.hp, 0, true);
        continue;
      }
      if (tp.y < -0.08 || tp.x < -0.08 || tp.x > 1.08 || tp.y > 1.05) { bump(this, "ptMissed"); m.chat("ptMiss", null, "info"); continue; }
      keep.push(tp);
    }
    this.ptTorps = keep;
  };

  // Torpedoes fly on a straight line to land exactly when their salvo does. Once the
  // simulation has fired the salvo (shields or hull), the torpedo is gone.
  Turret.prototype.landTorpedoes = function () {
    var m = this.m, t = m.t, keep = [], self = this;
    this.torps.forEach(function (tp) {
      var e = tp.ev;
      if (e.done) {
        if (!e.downed) {
          self.effects.push({ type: e.outcome === "hull" ? "hullHit" : "shieldHit", x: tp.x1, y: tp.y1, at: m.totalT, mj: e.mj });
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
    var all = st.ships + st.torps + (st.mines || 0), threats = all ? (st.kills + st.downed + (st.minesDowned || 0)) / all : 0;
    r.station = "gunner";
    r.aggression = st.liveTime ? Math.min(1, st.firingTime / st.liveTime * 1.5) : 0;
    r.engineer = m.turret.engineer;
    r.weapon = m.turret.bats[0].weaponId;
    r.weapons = m.turret.bats.map(function (b) { return b.weaponId; });
    r.parts = { objective: r.parts.objective, condition: r.parts.condition, accuracy: Math.round(25 * accuracy), threats: Math.round(25 * threats) };
    r.raw = r.parts.objective + r.parts.condition + r.parts.accuracy + r.parts.threats;
    r.score = Math.round(r.raw * Math.pow(1 - m.cfg.lookCostPct / 100, r.looks));
    r.gunner = {
      shots: st.shots, hits: st.hits, accuracyPct: Math.round(accuracy * 100), ships: st.ships, kills: st.kills,
      torps: st.torps, downed: st.downed, hullTorps: st.hullTorps, damage: Math.round(st.damage), dryTime: Math.round(st.dryTime), calls: st.calls,
      ptFired: st.ptFired, ptHits: st.ptHits, ptDowned: st.ptDowned, ptMissed: st.ptMissed,
      mines: st.mines || 0, minesDowned: st.minesDowned || 0, mainShots: st.mainShots || 0, mainHits: st.mainHits || 0,
      guns: m.turret.bats.map(function (b) { return { gun: b.gunNo, weapon: b.weaponId, shots: b.shots, hits: b.hits, aiShots: b.aiShots, aiHits: b.aiHits }; }),
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
    // Ring view: aim the gun you hold the way the AI gunners do (Free fire), choosing the gun
    // whose arc and weapon suit the nearest ship.
    if (tu.ring) {
      if (m.totalT >= (this.pickAt || 0)) {
        this.pickAt = m.totalT + 3;
        var near = tu.ships.filter(function (s) { return !s.dead && s.state !== "leave"; }).sort(function (a, b) { return a.r - b.r; })[0];
        if (near) tu.bats.forEach(function (b, i) { if (tu.inReachOf(b, near.x, near.y) !== null && b.w.best.indexOf(near.type) >= 0) tu.select(i); });
      }
      var held = tu.bat(), keep = held.order; held.order = "free"; held.aiNext = 0;
      tu.aiBattery(held); held.order = keep;
      this.launchTorps(tu);
      if (tu.firesMain && tu.mainState().ready && tu.mainLine()) tu.fireMain();
      return;
    }
    var w = tu.w, G = tu.G, top = G.turretY - tu.reach(), target = null, tx = tu.x, best = 1e9;
    // With several batteries, take the one whose weapon suits the nearest ship best.
    if (tu.bats.length > 1 && m.totalT >= (this.pickAt || 0)) {
      this.pickAt = m.totalT + 3;
      var near = tu.ships.filter(function (s) { return !s.dead && s.state !== "leave" && s.y > 0; }).sort(function (a, b) { return b.y - a.y; })[0];
      if (near) tu.bats.forEach(function (b, i) { if (b.w.best.indexOf(near.type) >= 0) tu.select(i); });
      w = tu.w; top = G.turretY - tu.reach(); tx = tu.x;
    }
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
    this.launchTorps(tu);
  };
  // Torpedoes: one at a time, at a big ship that has settled into its station.
  AIGunner.prototype.launchTorps = function (tu) {
    if (!tu.ptTorps.length && tu.ships.some(function (s) { return s.lockable && !s.dead && s.state === "hold"; })) {
      var tube = tu.pt.indexOf(true);
      if (tube >= 0) tu.launchPT(tube);
    }
  };

  // Plays a whole gunner mission with no screen: AI engineer on the power, AI gunner on the gun.
  // weapon: one gun for every battery count of one; null = the class's own loadout.
  BL.runGunnerHeadless = function (seed, weapon, classId, tl, skill) {
    classId = classId || "gunboat";
    var rc = BL.GUNNERY.ring.classes[classId];
    var gunner = weapon ? { weapon: weapon } : { weapons: BL.GUNNERY.loadout[classId] };
    if (rc && !weapon) { gunner.ring = true; gunner.arcs = rc.arcs; gunner.arcNames = rc.arcNames; }
    var m = new BL.Mission({ seed: seed, quiet: true, classId: classId, tl: tl || 4, gunner: gunner });
    var eng = new BL.AIEngineer(0.5, 0.25, m.turret.engineer.skill), gun = new AIGunner(skill);
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
