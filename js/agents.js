/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* AI engineers. They use only what the player sees and touches: the forecast strip,
   capacitor levels, setpoints, aux switches. The test harness plays missions with them,
   and later phases reuse them as AI crew. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  // temper: 0 = conservative (keeps heat low), 1 = aggressive (runs hot).
  // every: seconds between decisions (a slow value stands in for human reaction time).
  // skill: 1 = sharp and exact (the default, used by the balance tests). Lower skill plays
  // like a person: slower decisions, now and then a distracted moment, salvos misjudged,
  // shields charged late, and a slow answer when a gunner calls for power.
  function AIEngineer(temper, every, skill) {
    this.temper = temper === undefined ? 0.5 : temper;
    this.skill = skill === undefined ? 1 : skill;
    this.slack = 1 - this.skill;
    this.every = (every || 0.25) + this.slack * 1.2;
    this.next = 0;
    this.rng = null;
  }
  BL.AIEngineer = AIEngineer;

  AIEngineer.prototype.think = function (m) {
    if (m.totalT < this.next) return;
    this.next = m.totalT + this.every;
    var slack = this.slack, rr = this.rng;
    if (slack > 0) {
      rr = this.rng = this.rng || BL.rng((m.seed ^ 0x51ed270b) >>> 0);
      if (rr.chance(slack * 0.25)) { this.next += 1 + rr.next() * 2 * slack; return; }   // distracted
    }
    var misjudge = slack > 0 ? 1 - slack * rr.next() * 0.7 : 1;      // under-reads the salvo
    var late = slack > 0 ? slack * rr.next() * 3 : 0;                 // seconds slow to react
    var ship = m.ship, fc = m.forecast(), d = m.data;
    var self = this, R = ship.reactors, n = R.length;
    // In a minefield the engines only get what's left under 100%, so never plan past it.
    var mines = !!(m.encounter() && m.encounter().mines);

    // Expected engine draw over the next couple of seconds; it comes evenly off every reactor.
    var g = ship.gTarget;
    fc.forEach(function (e) { if ((e.type === "burn" || e.type === "order") && e.in < 1.5 && e.in + e.dur > 0) g = Math.max(g, e.g); });
    // Budget per reactor: each has its own heat and failsafe.
    var left = R.map(function (rx) {
      var target = (0.9 + 0.2 * self.temper) * rx.max;
      if (rx.heat > 50 + 30 * self.temper) target = 0.85 * rx.max;
      if (mines) target = Math.min(target, 0.97 * rx.max);
      return target - g * m.perG() / n;
    });

    var shield = m.sys("shield"), life = m.sys("life"), drive = m.sys("drive"), pd = m.sys("pd"), buster = m.sys("buster");
    function incomingOf(type) {
      var list = fc.filter(function (e) { return e.type === type && e.in > -0.2; });
      return { next: list.length ? list[0].in : 99, mj: misjudge * list.filter(function (e) { return e.in < 8; }).reduce(function (a, e) { return a + e.mj; }, 0) };
    }
    // Shields and point defense: enough charge for what's announced, refilled before it lands.
    function guard(s, inc) {
      var need = Math.max(s.maxMJ - s.mj, inc.mj - s.mj);
      if (late && inc.next > 1.5) inc = { next: inc.next + late, mj: inc.mj };   // thinks there's more time
      var w = need <= 0 ? 0 : Math.min(s.maxMW, need / Math.max(1.2, inc.next - 0.8));
      return inc.next > 8 ? Math.min(w, (s.maxMJ - s.mj) / (6 + slack * 14)) : w;
    }
    var salvos = incomingOf("salvo"), strikes = incomingOf("strike");

    var want = {};
    want.life = life.mj < life.maxMJ * 0.9 ? 7 : 3.5;
    want.shield = guard(shield, salvos);
    // The CIWS only matters where drive hunters can come (their own system, or stragglers among them).
    var enc = m.encounter(), hunted = !!enc && (!!(enc.wave && enc.wave.strikes) || !!(enc.stragglers && enc.stragglers.types.indexOf("hunters") >= 0));
    if (pd) want.pd = hunted || strikes.next < 99 ? guard(pd, strikes) : 0;
    var wavesUp = m.waves && m.waves.some(function (w) { return !w.dead; });
    ship.systems.forEach(function (s) {
      if (s.kind !== "gun") return;
      var req = (s.request && m.t - s.request.t >= slack * 2.5) || fc.some(function (e) { return e.type === "request" && e.gun === s.gunner && e.in < 2.5; });
      var room = s.maxMJ - s.mj;
      want[s.id] = req ? s.maxMW : wavesUp ? Math.min(s.maxMW, 9 + room / 6) : room / 8;
    });
    // Main gun: fires whenever full, so feed it hard while there's a target, else let it sit.
    var main = m.sys("main");
    if (main) want.main = wavesUp || m.mainFirst ? main.maxMW : Math.min(main.maxMW, (main.maxMJ - main.mj) / 20);
    // Hangar: full power when a call is open or coming soon, else top up slowly.
    ship.systems.forEach(function (s) {
      if (s.kind !== "hangar") return;
      var type = s.mode === "recover" ? "recover" : "launch", room = s.maxMJ - s.mj;
      if (s.mode === "lost") { want[s.id] = 0; return; }
      var soon = s.call || fc.some(function (e) { return e.type === type && e.in < room / Math.max(1, s.maxMW) + 4; });
      // (on the bridge the captain launches and recovers when he likes: keep it charging until full)
      want[s.id] = soon || (m.captain && room > 0.3) ? s.maxMW : Math.min(s.maxMW, room / 12);
    });

    // A player's call for power: a careful engineer keeps the shields first; a less careful one
    // (decided once per call) routes the gun ahead of them, and the shields can come up short.
    var order = m.priority;
    if (slack > 0) ship.systems.forEach(function (s) {
      var q = s.request;
      if (s.kind !== "gun" || !q || !q.player) return;
      if (q.starve === undefined) q.starve = rr.chance(Math.min(1, slack * 2.5));
      if (q.starve && m.t - q.t >= slack * 2.5) order = [s.id].concat(order.filter(function (id) { return id !== s.id; }));
    });
    // A launch or recovery call open or coming: the hangar goes first (a squadron out is worth more
    // than a few seconds of shield charge; one left behind is gone).
    ship.systems.forEach(function (s) {
      if (s.kind !== "hangar" || s.mode === "lost" || !want[s.id] || want[s.id] < s.maxMW) return;
      order = [s.id].concat(order.filter(function (id) { return id !== s.id; }));
    });
    // Fill in priority order, each from its own reactor; the drive and buster take what's left
    // (unless the captain's stance is drive first: then the drive in its place, fast enough to be
    // full a few seconds before the window, at its full rate once the window is near or open).
    if (drive && m.driveFirst) want.drive = Math.min(drive.maxMW, 1.2 * (drive.maxMJ - drive.mj) / Math.max(1, m.windowIn() - 8));
    order.forEach(function (id) {
      var s = m.sys(id);
      if ((s.kind === "drive" && !m.driveFirst) || s.kind === "buster") return;
      var full = s.mj >= s.maxMJ - 0.5;
      var w = Math.min(want[id] || 0, s.maxMW);
      var draw = full ? Math.min(w, m.holdMW(s)) : w;
      // (shields split over several reactors: an even share of each, so the tightest one sets the limit)
      var room = s.split ? n * Math.min.apply(null, left) : left[s.reactor];
      var give = Math.max(0, Math.min(w, room + (full ? w : 0)));
      m.setSetpoint(id, give);
      if (s.split) for (var k = 0; k < n; k++) left[k] -= Math.min(draw, give) / n;
      else left[s.reactor] -= Math.min(draw, give);
    });
    // (drive first: it has its share already, and takes what's left on top)
    if (drive && m.driveFirst) m.setSetpoint("drive", Math.min(drive.maxMW, drive.set + Math.max(0, left[drive.reactor])));
    else if (drive) {
      var behind = m.windowIn() < (drive.maxMJ - drive.mj) / Math.max(1, drive.maxMW) + 5;
      var dg = Math.max(behind ? 12 : 0, Math.min(drive.maxMW, left[drive.reactor]));
      m.setSetpoint("drive", dg);
      left[drive.reactor] -= dg;
    }
    if (buster) {
      // Spread the buster's charge over the time left in the mission, with a margin.
      var timeLeft = Math.max(0, m.windowIn());
      for (var j = m.jumpIndex + 1; j < m.cfg.jumps; j++) timeLeft += m.windowFor(j);
      var needRate = (buster.maxMJ - buster.mj) / Math.max(10, timeLeft - 15);
      m.setSetpoint("buster", Math.min(buster.maxMW, Math.max(needRate * 1.2, left[buster.reactor])));
    }

    // Aux: bridge shield and point-defense gaps right before a hit, and dry guns during a request.
    function auxOn(s, on) { if (s && s.aux !== on) m.toggleAux(s.id); }
    function bank(s) { return m.auxFor(s); }
    auxOn(shield, bank(shield).mj > 0 && salvos.next < 3.5 && shield.mj < salvos.mj);
    if (pd) auxOn(pd, bank(pd).mj > 0 && strikes.next < 3.5 && pd.mj < strikes.mj);
    ship.systems.forEach(function (s) {
      if (s.kind !== "gun") return;
      var b = bank(s);
      auxOn(s, b.mj > 0 && !!s.request && s.mj < 40 && b.mj > b.cap * 0.3);
    });
  };

  // Sets moderate charge rates once and never touches them again.
  function StaticEngineer() { this.done = false; }
  BL.StaticEngineer = StaticEngineer;
  // Shares (of the reactor's safe output) a sensible player might set and forget.
  var STATIC_SHARE = { life: 0.04, shield: 0.25, gun: 0.1, drive: 0.26, main: 0.06, hangar: 0.05, pd: 0.05, buster: 0.06 };
  StaticEngineer.prototype.think = function (m) {
    if (this.done) return;
    this.done = true;
    var out = m.ship.reactorMax, guns = m.gunCount();
    m.ship.systems.forEach(function (s) {
      var share = s.kind === "gun" ? STATIC_SHARE.gun * 3 / guns : STATIC_SHARE[s.kind];
      m.setSetpoint(s.id, s.kind === "life" ? s.drainMW + 1 : Math.round(out * share));
    });
  };

  // Plays a whole mission with no screen. Returns the score object.
  BL.runHeadless = function (seed, engineer, classId, tl, extra) {
    var m = new BL.Mission(Object.assign({ seed: seed, quiet: true, classId: classId, tl: tl }, extra));
    m.beginJump();
    var guard = 0;
    while (m.phase !== "done" && guard++ < BL.TICK_RATE * 60 * 30) {
      if (m.phase === "gravspace") m.beginJump();
      engineer.think(m);
      m.step();
    }
    if (m.phase !== "done") m.finish("timeout");
    return m.result;
  };
})(typeof window !== "undefined" ? window : globalThis);
