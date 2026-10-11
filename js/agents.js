/* AI engineers. They use only what the player sees and touches: the forecast strip,
   capacitor levels, setpoints, aux switches. The test harness plays missions with them,
   and later phases reuse them as AI crew. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  // temper: 0 = conservative (keeps heat low), 1 = aggressive (runs hot).
  // every: seconds between decisions (a slow value stands in for human reaction time).
  function AIEngineer(temper, every) {
    this.temper = temper === undefined ? 0.5 : temper;
    this.every = every || 0.25;
    this.next = 0;
  }
  BL.AIEngineer = AIEngineer;

  AIEngineer.prototype.think = function (m) {
    if (m.totalT < this.next) return;
    this.next = m.totalT + this.every;
    var ship = m.ship, fc = m.forecast(), d = m.data;
    var self = this, R = ship.reactors, n = R.length;
    // In a minefield the engines only get what's left under 100%, so never plan past it.
    var mines = !!(m.encounter() && m.encounter().mines);

    // Expected engine draw over the next couple of seconds; it comes evenly off every reactor.
    var g = ship.gTarget;
    fc.forEach(function (e) { if (e.type === "burn" && e.in < 1.5 && e.in + e.dur > 0) g = Math.max(g, e.g); });
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
      return { next: list.length ? list[0].in : 99, mj: list.filter(function (e) { return e.in < 8; }).reduce(function (a, e) { return a + e.mj; }, 0) };
    }
    // Shields and point defense: enough charge for what's announced, refilled before it lands.
    function guard(s, inc) {
      var need = Math.max(s.maxMJ - s.mj, inc.mj - s.mj);
      var w = need <= 0 ? 0 : Math.min(s.maxMW, need / Math.max(1.2, inc.next - 0.8));
      return inc.next > 8 ? Math.min(w, (s.maxMJ - s.mj) / 6) : w;
    }
    var salvos = incomingOf("salvo"), strikes = incomingOf("strike");

    var want = {};
    want.life = life.mj < life.maxMJ * 0.9 ? 7 : 3.5;
    want.shield = guard(shield, salvos);
    if (pd) want.pd = guard(pd, strikes);
    var wavesUp = m.waves && m.waves.some(function (w) { return !w.dead; });
    ship.systems.forEach(function (s) {
      if (s.kind !== "gun") return;
      var req = s.request || fc.some(function (e) { return e.type === "request" && e.gun === s.gunner && e.in < 2.5; });
      var room = s.maxMJ - s.mj;
      want[s.id] = req ? s.maxMW : wavesUp ? Math.min(s.maxMW, 9 + room / 6) : room / 8;
    });
    // Main gun and hangar: full power when a call is open or coming soon, else top up slowly.
    ship.systems.forEach(function (s) {
      if (s.kind !== "main" && s.kind !== "hangar") return;
      var type = s.kind === "main" ? "main" : s.mode === "recover" ? "recover" : "launch", room = s.maxMJ - s.mj;
      if (s.mode === "lost") { want[s.id] = 0; return; }
      var soon = s.call || fc.some(function (e) { return e.type === type && e.in < room / Math.max(1, s.maxMW) + 4; });
      want[s.id] = soon ? s.maxMW : Math.min(s.maxMW, room / 12);
    });

    // Fill in priority order, each from its own reactor; the drive and buster take what's left.
    m.priority.forEach(function (id) {
      var s = m.sys(id);
      if (s.kind === "drive" || s.kind === "buster") return;
      var full = s.mj >= s.maxMJ - 0.5;
      var w = Math.min(want[id] || 0, s.maxMW);
      var draw = full ? Math.min(w, s.drainMW) : w;
      var give = Math.max(0, Math.min(w, left[s.reactor] + (full ? w : 0)));
      m.setSetpoint(id, give);
      left[s.reactor] -= Math.min(draw, give);
    });
    if (drive) {
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
  BL.runHeadless = function (seed, engineer, classId, tl) {
    var m = new BL.Mission({ seed: seed, quiet: true, classId: classId, tl: tl });
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
