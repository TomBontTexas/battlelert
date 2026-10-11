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
    var targetLoad = (0.9 + 0.2 * this.temper) * ship.reactorMax;
    if (ship.heat > 50 + 30 * this.temper) targetLoad = 0.85 * ship.reactorMax;
    // In a minefield the engines only get what's left under 100%, so never plan past it.
    var mines = !!(m.encounter() && m.encounter().mines);
    if (mines) targetLoad = Math.min(targetLoad, 0.97 * ship.reactorMax);

    // Expected engine draw over the next couple of seconds.
    var g = ship.gTarget;
    fc.forEach(function (e) { if (e.type === "burn" && e.in < 1.5 && e.in + e.dur > 0) g = Math.max(g, e.g); });
    var budget = targetLoad - g * m.perG();

    var shield = m.sys("shield"), life = m.sys("life"), drive = m.sys("drive");
    var salvos = fc.filter(function (e) { return e.type === "salvo" && e.in > -0.2; });
    var nextSalvo = salvos.length ? salvos[0].in : 99;
    var incoming = salvos.filter(function (e) { return e.in < 8; }).reduce(function (a, e) { return a + e.mj; }, 0);

    var want = {};
    want.life = life.mj < life.maxMJ * 0.9 ? 7 : 3.5;
    var shieldNeed = Math.max(shield.maxMJ - shield.mj, incoming - shield.mj);
    want.shield = shieldNeed <= 0 ? 0 : Math.min(shield.maxMW, shieldNeed / Math.max(1.2, nextSalvo - 0.8));
    if (nextSalvo > 8) want.shield = Math.min(want.shield, (shield.maxMJ - shield.mj) / 6);
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
      var type = s.kind === "main" ? "main" : "launch", room = s.maxMJ - s.mj;
      var soon = s.call || fc.some(function (e) { return e.type === type && e.in < room / Math.max(1, s.maxMW) + 4; });
      want[s.id] = soon ? s.maxMW : Math.min(s.maxMW, room / 12);
    });

    // Fill in priority order; the drive takes whatever is left.
    var left = budget;
    m.priority.forEach(function (id) {
      var s = m.sys(id);
      if (s.kind === "drive") return;
      var full = s.mj >= s.maxMJ - 0.5;
      var w = Math.min(want[id] || 0, s.maxMW);
      var draw = full ? Math.min(w, s.drainMW) : w;
      var give = Math.max(0, Math.min(w, left + (full ? w : 0)));
      m.setSetpoint(id, give);
      left -= Math.min(draw, give);
    });
    if (drive) {
      var behind = m.windowIn() < (drive.maxMJ - drive.mj) / Math.max(1, drive.maxMW) + 5;
      m.setSetpoint("drive", Math.max(behind ? 12 : 0, Math.min(drive.maxMW, left)));
    }

    // Aux: bridge shield gaps right before a salvo, and dry guns during a request.
    var aux = ship.aux.mj > 0;
    var shieldAux = aux && nextSalvo < 3.5 && shield.mj < incoming;
    if (shield.aux !== shieldAux) m.toggleAux("shield");
    ship.systems.forEach(function (s) {
      if (s.kind !== "gun") return;
      var on = aux && !!s.request && s.mj < 40 && ship.aux.mj > ship.aux.cap * 0.3;
      if (s.aux !== on) m.toggleAux(s.id);
    });
  };

  // Sets moderate charge rates once and never touches them again.
  function StaticEngineer() { this.done = false; }
  BL.StaticEngineer = StaticEngineer;
  // Shares (of the reactor's safe output) a sensible player might set and forget.
  var STATIC_SHARE = { life: 0.04, shield: 0.25, gun: 0.1, drive: 0.26, main: 0.06, hangar: 0.05 };
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
