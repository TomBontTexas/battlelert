/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert pilot station: the helm. Pure simulation, no screen code; the Mission steps it
   (the ring turret calls step for the turn, Mission.runPilot calls runEngines for the power).
   The pilot steers with a wheel, which stays where it's left, and gives each engine its order.
   The rudder and engines answer late (lag), a turn builds and dies away slowly (inertia), and
   turning past the safe rate stresses the hull. Split engines turn the ship faster. The captain
   (the coxswain on a gunboat) gives course and engine orders ahead of time; between them the
   pilot is free to fight the ship. The gun crew fires every gun (ring.js, crewAll). A gunboat
   starts each sortie in the carrier's launch tube. Compass headings run 0-359, clockwise. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function norm(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  function to360(a) { return ((a % 360) + 360) % 360; }
  BL.hdgText = function (h) { return ("00" + Math.round(to360(h)) % 360).slice(-3); };

  function Helm(m) {
    this.m = m;
    this.H = BL.HELM;
    this.C = this.H.classes[m.data.classId] || this.H.classes.destroyer;
    this.rng = BL.rng((m.seed ^ 0x3c6ef372) >>> 0);     // its own stream: the mission's stays unchanged
    this.who = m.hasDrive ? "Captain" : "Coxswain";
    this.wheel = 0;                       // -1 hard to port .. 1 hard to starboard
    this.port = { g: 0, ord: "stop" };    // each engine's order: thrust in G, and the order (null = a G order)
    this.stbd = { g: 0, ord: "stop" };
    this.out = { port: 0, stbd: 0 };      // what the engines are actually giving (G)
    this.omega = 0;                       // turn rate, degrees per second, clockwise
    this.want = 0;                        // the turn rate the rudder and engines are asking for now
    this.speed = 0;                       // forward speed, in G of thrust (the stars stream with it)
    this.hist = [];                       // [time, wheel, port G, starboard G]: answered `lag` seconds later
    this.stress = 0; this.flankT = 0;
    this.auto = false; this.autoHdg = 0;
    this.base = 0;                        // compass heading when the turret's heading was 0
    this.inTube = false; this.launchAt = -99; this.clearAt = 0;
    this.curOrder = null; this.nextOrderAt = Infinity; this.warnReadyAt = 0;
    this.stats = { orders: 0, ordersMet: 0, stressHits: 0, flankHits: 0, autoT: 0, manualT: 0, overT: 0, hardT: 0, liveT: 0, launches: [] };
    this.jumps = []; this.cur = null;
  }
  BL.Helm = Helm;

  /* ---------------------------------------------------------------- Views */
  Helm.prototype.compass = function () { return to360(this.base + (this.m.turret ? this.m.turret.heading : 0)); };
  Helm.prototype.turnFactor = function () { return 1 - (this.m.ship.turnLoss || 0); };
  Helm.prototype.topTurn = function () { return this.C.top * this.turnFactor(); };
  Helm.prototype.full = function () { return Math.max(1, this.m.ship.maxG); };
  Helm.prototype.preset = function (id) { for (var i = 0; i < this.H.orders.length; i++) if (this.H.orders[i].id === id) return this.H.orders[i]; return null; };
  Helm.prototype.gOf = function (id) { var p = this.preset(id); return p ? Math.round(p.f * this.full() * 10) / 10 : 0; };
  // Engine orders are locked while the gunboat is in the tube and until it's clear of it.
  Helm.prototype.locked = function () { return this.inTube || this.m.totalT < this.clearAt; };
  // Where the bow will stop if the wheel is centered now: the rudder answers after the lag,
  // then the turn dies away at the class's build rate.
  Helm.prototype.stopHeading = function () {
    var b = this.C.build * this.turnFactor(), w = this.omega;
    return to360(this.compass() + w * this.C.lag + w * Math.abs(w) / (2 * b));
  };
  // Words for an engine order: "Ahead full", "Astern 2 G", "Stop".
  Helm.prototype.engineWords = function (e) {
    if (e.ord) return this.preset(e.ord).name;
    return e.g === 0 ? "Stop" : (e.g > 0 ? "Ahead " : "Astern ") + Math.abs(e.g) + " G";
  };
  Helm.prototype.telegraph = function () {
    function low(w) { return w.charAt(0).toLowerCase() + w.slice(1); }
    var p = this.engineWords(this.port), s = this.engineWords(this.stbd);
    if (p === s) return p === "Stop" ? "All stop" : "All " + low(p);
    return "Port " + low(p) + " · starboard " + low(s);
  };
  // The order the captain gave or is about to give: { hdg, eng, in, left, active }.
  Helm.prototype.orderView = function () {
    var m = this.m, o = this.curOrder;
    if (o) return { hdg: o.e.hdg, eng: o.e.eng, turn: o.e.turn, in: 0, left: Math.max(0, o.end - m.t), active: true, held: o.held / Math.max(0.1, o.e.dur) };
    var next = null;
    (m.events || []).forEach(function (e) { if (e.type === "order" && e.announced && !e.done && (!next || e.at < next.at)) next = e; });
    return next ? { hdg: next.hdg, eng: next.eng, turn: next.turn, in: Math.max(0, next.at - m.t), left: next.dur, active: false } : null;
  };

  /* ---------------------------------------------------------- Pilot input */
  // The wheel stays where it's put. Touching it takes the ship off autopilot.
  Helm.prototype.setWheel = function (v) { if (this.inTube) return; this.wheel = clamp(v, -1, 1); this.auto = false; };
  Helm.prototype.nudgeWheel = function (d) { this.setWheel(Math.round((this.wheel + d) * 100) / 100); };
  Helm.prototype.midships = function () { this.setWheel(0); };
  // side: "port", "stbd" or "both"; id: an engine order from BL.HELM.orders.
  Helm.prototype.setOrder = function (side, id) {
    if (this.locked() || !this.preset(id)) return false;
    var g = this.gOf(id), self = this;
    (side === "both" ? ["port", "stbd"] : [side]).forEach(function (k) { self[k] = { g: g, ord: id }; });
    this.m.cue("tick");
    return true;
  };
  // One order up or down (Up/Down both engines; Q/A port; P/L starboard).
  Helm.prototype.stepOrder = function (side, dir) {
    if (this.locked()) return false;
    var list = this.H.orders, e = this[side === "both" ? "port" : side], i = -1, self = this;
    if (side === "both" && this.port.ord !== this.stbd.ord) e = dir > 0 ? (this.port.g >= this.stbd.g ? this.port : this.stbd) : (this.port.g <= this.stbd.g ? this.port : this.stbd);
    list.forEach(function (p, k) { if (p.id === e.ord) i = k; });
    if (i < 0) {                          // a G order: the next order past it
      i = dir > 0 ? list.length - 1 : 0;
      list.forEach(function (p, k) { var g = self.gOf(p.id); if (dir > 0 ? g > e.g && k < i : g < e.g && k > i) i = k; });
      if (dir > 0 && this.gOf(list[i].id) <= e.g) return false;
      if (dir < 0 && this.gOf(list[i].id) >= e.g) return false;
    } else i = clamp(i + dir, 0, list.length - 1);
    return this.setOrder(side, list[i].id);
  };
  // A G order for both engines: "all ahead 3 G". From the order they have, one whole G up or down.
  Helm.prototype.nudgeG = function (dir) {
    if (this.locked()) return false;
    var full = this.full(), g = Math.round((this.port.g + this.stbd.g) / 2) + dir;
    g = clamp(g, -Math.floor(full * 0.5), Math.floor(full * 1.1));
    this.port = { g: g, ord: null }; this.stbd = { g: g, ord: null };
    this.m.cue("tick");
    return true;
  };
  // Autopilot: it flies to `hdg` (default: the heading now), carefully: never past the safe
  // turn rate, never with split engines.
  Helm.prototype.setAuto = function (on, hdg) {
    if (this.inTube) return;
    this.auto = !!on;
    if (on) this.autoHdg = hdg === undefined ? this.compass() : to360(hdg);
    this.m.cue("toggle");
  };
  // Warn engineering: the AI engineer sees a full burn coming and gets the power ready.
  Helm.prototype.warn = function () {
    var m = this.m;
    if (m.totalT < this.warnReadyAt || m.phase === "done") return false;
    this.warnReadyAt = m.totalT + this.H.warnCooldown;
    m.events.push({ id: m.nextId++, type: "burn", at: m.t + 2, dur: 8, g: this.full(), announceAt: m.t, announced: true, visible: true, warned: true });
    m.chat("warnEng", null, "good");
    return true;
  };
  Helm.prototype.launch = function () {
    var m = this.m;
    if (!this.inTube || m.phase === "done") return false;
    this.inTube = false;
    this.launchAt = m.totalT; this.clearAt = m.totalT + this.H.launch.clear;
    // The catapult throws the boat out at flank; once clear, it comes back to standard.
    var g = this.gOf("flank");
    this.port = { g: g, ord: "flank" }; this.stbd = { g: g, ord: "flank" };
    this.out.port = this.out.stbd = this.speed = g;
    this.hist = [];
    var wait = Math.max(0, m.t - m.cfg.arrivalSeconds);
    this.stats.launches.push(Math.round(wait * 10) / 10); if (this.cur) this.cur.launchWait = Math.round(wait * 10) / 10;
    m.cue("launch");
    m.chat("helmLaunched", null, "good");
    return true;
  };

  /* ------------------------------------------------------------ Lifecycle */
  Helm.prototype.reset = function () {
    var m = this.m, r = this.rng, enc = m.encounter();
    this.inTube = !m.hasDrive; this.launchAt = -99; this.clearAt = 0; this.tubeSaid = 0;
    this.omega = 0; this.want = 0; this.wheel = 0; this.hist = []; this.stress = 0; this.flankT = 0;
    this.stressSaid = false; this.flankSaid = false; this.curOrder = null; this.auto = false;
    this.base = 10 * Math.floor(r.next() * 36);
    var start = this.inTube ? "stop" : "cruise", g = this.gOf(start);
    this.port = { g: g, ord: start }; this.stbd = { g: g, ord: start };
    this.out.port = this.out.stbd = this.speed = g;
    this.rollTurn();
    this.nextOrderAt = enc.burns ? m.cfg.arrivalSeconds + Math.max(this.H.order.minGap, r.range(enc.burns.every) * 0.6) : Infinity;
    this.cur = { orders: 0, ordersMet: 0, stressHits: 0, launchWait: 0 };
    this.jumps[m.jumpIndex] = this.cur;
  };

  // The captain's orders, on the bridge's burn schedule (Mission.schedule calls this at the helm).
  Helm.prototype.schedule = function (t) {
    var m = this.m, enc = m.encounter(), b = enc.burns, H = this.H, r = this.rng;
    if (!b) return;
    // Bigger ships get more warning: time to swing at a safe rate, plus the lag.
    var C = this.C, turn = this.nextTurn, lead = b.warning + Math.max(0, Math.abs(turn) / (C.safe * 0.8) + C.lag - 2);
    if (t < this.nextOrderAt - lead) return;
    var at = Math.max(this.nextOrderAt, t + lead), dur = Math.round(r.range(b.duration)) + 2;
    // The engine order nearest the burn the bridge would have called.
    var want = Math.min(m.ship.maxG, r.int(b.g) * m.data.gScale) / this.full(), eng = "standard", best = 9, self = this;
    ["cruise", "standard", "full", "flank"].forEach(function (id) { var d = Math.abs(self.preset(id).f - want); if (d < best) { best = d; eng = id; } });
    m.events.push({ id: m.nextId++, type: "order", at: at, dur: dur, hdg: Math.round(to360(this.compass() + turn)), turn: turn, eng: eng, g: this.gOf(eng),
      announceAt: t, announced: false, visible: true });
    this.nextOrderAt = at + dur + Math.max(H.order.minGap, r.range(b.every));
    this.rollTurn();
  };
  // The next order's turn: bigger ships get smaller ones.
  Helm.prototype.rollTurn = function () {
    var H = this.H, r = this.rng, big = Math.min(H.order.turn[1], this.C.safe * 5), small = Math.min(H.order.turn[0], big / 2);
    this.nextTurn = Math.round(r.range([small, big]) / 5) * 5 * (r.chance(0.5) ? 1 : -1);
  };
  Helm.prototype.orderWords = function (e) { return "all ahead " + this.preset(e.eng).name.toLowerCase(); };
  Helm.prototype.beginOrder = function (e) {
    if (this.curOrder) this.finishOrder();
    this.curOrder = { e: e, held: 0, end: e.at + e.dur };
  };
  Helm.prototype.finishOrder = function () {
    var o = this.curOrder, m = this.m; this.curOrder = null;
    var met = o.held >= o.e.dur * this.H.order.held;
    this.stats.orders++; if (this.cur) this.cur.orders++;
    if (met) { this.stats.ordersMet++; if (this.cur) this.cur.ordersMet++; }
    m.chat(met ? "helmMet" : "helmMissed", { who: this.who, hdg: BL.hdgText(o.e.hdg) }, met ? "good" : "bad");
  };
  // On the ordered heading, and both engines ordered near what the captain asked for.
  Helm.prototype.onOrder = function (e) {
    var want = this.gOf(e.eng), avg = (this.port.g + this.stbd.g) / 2;
    return Math.abs(norm(e.hdg - this.compass())) <= this.H.order.heading && Math.abs(avg - want) <= Math.max(0.6, want * 0.15);
  };

  /* ---------------------------------------------------------------- Tick */
  // What the rudder and engines are answering: the pilot's input `lag` seconds ago.
  Helm.prototype.lagged = function () {
    var t = this.m.totalT - this.C.lag, h = this.hist, pick = h[0];
    for (var i = 0; i < h.length && h[i][0] <= t + 1e-6; i++) pick = h[i];
    while (h.length > 2 && h[1][0] <= t - 0.2) h.shift();
    return pick;
  };
  Helm.prototype.step = function (dt) {
    var m = this.m, H = this.H, C = this.C, ship = m.ship, tu = m.turret;
    if (this.inTube) { this.tube(); return; }
    if (this.clearAt && m.totalT >= this.clearAt) {
      this.clearAt = 0;
      this.setOrder("both", "standard");
      m.chat("helmClear", null, "info");
    }
    // Presets follow the class's top G (thruster damage lowers it).
    if (this.port.ord) this.port.g = this.gOf(this.port.ord);
    if (this.stbd.ord) this.stbd.g = this.gOf(this.stbd.ord);
    if (this.auto) this.autopilot();
    this.hist.push([m.totalT, this.wheel, this.port.g, this.stbd.g]);
    var lag = this.lagged();
    var k = 1 - Math.exp(-dt / H.engineTau);
    this.out.port += (lag[2] - this.out.port) * k;
    this.out.stbd += (lag[3] - this.out.stbd) * k;
    this.speed += ((this.out.port + this.out.stbd) / 2 - this.speed) * (1 - Math.exp(-dt / H.speedTau));
    // The turn: the wheel asks for a share of the top rate, split engines add more; the ship
    // gets there (and back) at its build rate.
    var top = this.topTurn(), full = this.full();
    var want = lag[1] * top + (this.out.port - this.out.stbd) / (2 * full) * H.split * top;
    this.want = want = clamp(want, -top * 1.6, top * 1.6);
    var b = C.build * this.turnFactor() * (ship.crippled ? 0.7 : 1);
    this.omega += clamp(want - this.omega, -b * dt, b * dt);
    if (Math.abs(this.omega) < 1e-4 && !want) this.omega = 0;
    if (this.omega) tu.rotate(this.omega * dt);
    this.runStress(dt);
    this.runFlank(dt);
    // The captain's order under way.
    var o = this.curOrder;
    if (o) { if (this.onOrder(o.e)) o.held += dt; if (m.t >= o.end) this.finishOrder(); }
    if (m.phase === "engage" || m.phase === "countdown") {
      var st = this.stats; st.liveT += dt;
      if (this.auto) st.autoT += dt; else st.manualT += dt;
      if (Math.abs(this.omega) > C.safe) st.overT += dt;
      if ((this.port.g + this.stbd.g) / 2 >= full - 0.01) st.hardT += dt;
    }
  };
  // In the carrier's tube: the carrier calls "launch when ready", nags, then launches you itself.
  Helm.prototype.tube = function () {
    var m = this.m, L = this.H.launch, wait = m.t - m.cfg.arrivalSeconds;
    if (wait >= L.nagAfter && this.tubeSaid < 1) { this.tubeSaid = 1; m.chat("helmNag", null, "warn"); m.cue("warn"); }
    if (wait >= L.autoAfter) { m.chat("helmAuto", null, "bad"); this.launch(); }
  };
  Helm.prototype.autopilot = function () {
    var C = this.C, top = this.topTurn(), b = C.build * this.turnFactor() * 0.8;
    var err = norm(this.autoHdg - this.compass()), pred = err - this.omega * C.lag;
    var vmax = Math.min(C.safe * 0.92, top);
    var want = (pred < 0 ? -1 : 1) * Math.min(vmax, Math.sqrt(2 * b * Math.abs(pred)));
    if (Math.abs(err) < 0.5 && Math.abs(this.omega) < 1) want = 0;
    this.wheel = clamp(want / top, -1, 1);
  };
  // Turning past the safe rate fills the stress bar; a full bar is a structural hit.
  Helm.prototype.runStress = function (dt) {
    var m = this.m, S = this.H.stress, safe = this.C.safe, over = Math.abs(this.omega) - safe;
    if (over > 0.01) this.stress += over / safe * S.fill * dt;
    else this.stress = Math.max(0, this.stress - S.drain * dt);
    if (!this.stressSaid && this.stress >= S.warnAt) { this.stressSaid = true; m.chat("stressWarn", null, "warn"); m.cue("warn"); }
    if (this.stress < 0.3) this.stressSaid = false;
    if (this.stress < 1) return;
    this.stress = S.after;
    var ship = m.ship, dmg = Math.max(1, Math.round(ship.hullMax * S.hullShare)), R = m.turret.R;
    ship.hull -= dmg; ship.fresh.hull += dmg; m.stats.hullLost += dmg; m.jumpStats.hullLost += dmg;
    this.stats.stressHits++; if (this.cur) this.cur.stressHits++;
    m.turret.effects.push({ type: "hullHit", x: R.cx, y: R.cy - R.ry, at: m.totalT, mj: 40 });
    m.cue("hullHit"); m.cue("breach");
    m.chat("stressHit", { dmg: dmg }, "bad");
    if (this.rng.chance(S.thrusterChance)) this.thrusterHit("stress");
  };
  // Flank is over the engines' rating: held too long, it can burn out a thruster.
  Helm.prototype.runFlank = function (dt) {
    var m = this.m, F = this.H.flank, flank = !this.clearAt && (this.port.ord === "flank" || this.stbd.ord === "flank" || Math.max(this.port.g, this.stbd.g) > this.full() + 0.01);
    this.flankT = flank ? this.flankT + dt : Math.max(0, this.flankT - dt);
    if (flank && !this.flankSaid && this.flankT >= F.warnAt) { this.flankSaid = true; m.chat("flankWarn", null, "warn"); m.cue("warn"); }
    if (this.flankT < 5) this.flankSaid = false;
    if (flank && this.flankT > F.safe && this.rng.chance(F.damagePerSec * dt)) {
      this.stats.flankHits++;
      var what = this.thrusterHit("flank");
      m.chat("flankDamage", { what: what.charAt(0).toUpperCase() + what.slice(1) }, "bad");
      this.flankT = F.safe - 5;
    }
  };
  Helm.prototype.thrusterHit = function (why) {
    var m = this.m, what = m.damageThrusters();
    m.stats.damageReports.push({ jump: m.jumpIndex + 1, what: what });
    if (why === "stress") m.chat("damaged", { what: what }, "bad");
    return what;
  };
  // Engine power (Mission.runPilot calls this at the helm): each engine draws its share, ahead
  // or astern. In a minefield the engines get only what the capacitors leave.
  Helm.prototype.runEngines = function () {
    var m = this.m, ship = m.ship, perG = m.perG(), enc = m.encounter();
    var g = (Math.abs(this.out.port) + Math.abs(this.out.stbd)) / 2;
    ship.starved = false;
    if (enc && enc.mines && g > 0) {
      var R = ship.reactors, charging = R.map(function () { return 0; }), avail = Infinity;
      ship.systems.forEach(function (s) { charging[s.reactor] += s.rate; });
      for (var k = 0; k < R.length; k++) avail = Math.min(avail, Math.max(0, R[k].max - charging[k]) * R.length);
      if (g * perG > avail) { var f = avail / (g * perG); this.out.port *= f; this.out.stbd *= f; g *= f; ship.starved = true; }
    }
    ship.g = g; ship.gWant = g;
    ship.gTarget = (Math.abs(this.port.g) + Math.abs(this.stbd.g)) / 2;     // what the AI engineer plans for
    ship.engineMW = g * perG;
  };

  /* --------------------------------------------------------------- Score
     Objective and ship condition as everywhere; orders met and ship handling (structural hits
     and burned-out thrusters) for the helm. Time on autopilot earns less (BL.HELM.autopilotRep). */
  BL.scoreHelm = function (m, outcome) {
    var r = BL.score(m, outcome), h = m.helm, st = h.stats, tu = m.turret;
    var orders = st.orders ? st.ordersMet / st.orders : 1;
    var handling = Math.max(0, 1 - 0.2 * st.stressHits - 0.2 * st.flankHits);
    var live = st.autoT + st.manualT, autoShare = live ? st.autoT / live : 0, f = 1 - autoShare * (1 - BL.HELM.autopilotRep);
    r.station = "pilot";
    r.parts = { objective: r.parts.objective, condition: r.parts.condition, orders: Math.round(25 * orders * f), handling: Math.round(25 * handling * f) };
    r.raw = r.parts.objective + r.parts.condition + r.parts.orders + r.parts.handling;
    r.score = Math.round(r.raw * Math.pow(1 - m.cfg.lookCostPct / 100, r.looks));
    r.aggression = st.liveT ? Math.min(1, (st.overT + st.hardT) / st.liveT * 2) : 0;
    r.engineer = tu.engineer;
    r.crew = tu.bats.map(function (b) { return b.crew; }).filter(Boolean);
    r.helm = {
      orders: st.orders, ordersMet: st.ordersMet, stressHits: st.stressHits, flankHits: st.flankHits,
      autoPct: Math.round(autoShare * 100), launches: st.launches.slice(),
      ships: tu.stats.ships, kills: tu.stats.kills, torps: tu.stats.torps, downed: tu.stats.downed, ptFired: tu.stats.ptFired, ptHits: tu.stats.ptHits,
      jumps: h.jumps.map(function (j) { return j ? Object.assign({}, j) : null; })
    };
    return r;
  };

  /* -------------------------------------------------------------- Test bot
     Flies the helm for headless tests: launches at once, follows each order on autopilot. */
  function HelmBot() {}
  BL.HelmBot = HelmBot;
  HelmBot.prototype.think = function (m) {
    var h = m.helm; if (!h) return;
    if (h.inTube && m.t >= 1) h.launch();
    if (h.locked()) return;
    var o = h.orderView(), lead = Math.abs(norm(o ? o.hdg - h.compass() : 0)) / (h.C.safe * 0.8) + h.C.lag + 1;
    if (o && (o.active || o.in < lead)) {
      if (!h.auto || Math.abs(norm(h.autoHdg - o.hdg)) > 0.5) h.setAuto(true, o.hdg);
      if (h.port.ord !== o.eng || h.stbd.ord !== o.eng) h.setOrder("both", o.eng);
    } else if (h.port.ord !== "cruise" || h.stbd.ord !== "cruise") h.setOrder("both", "cruise");   // back to cruise between orders
  };
  BL.runHelmHeadless = function (seed, classId, tl, idle) {
    classId = classId || "gunboat";
    var rc = BL.GUNNERY.ring.classes[classId];
    var m = new BL.Mission({ seed: seed, quiet: true, classId: classId, tl: tl || 4, helm: true,
      gunner: { weapons: BL.GUNNERY.loadout[classId], ring: true, arcs: rc.arcs, arcNames: rc.arcNames, helm: true } });
    var eng = new BL.AIEngineer(0.5, 0.25, m.turret.engineer.skill), bot = new HelmBot();
    m.beginJump();
    var guard = 0;
    while (m.phase !== "done" && guard++ < BL.TICK_RATE * 60 * 30) {
      if (m.phase === "gravspace") m.beginJump();
      eng.think(m);
      if (!idle) bot.think(m); else if (m.helm.inTube && m.t >= 1) m.helm.launch();
      m.step();
    }
    if (m.phase !== "done") m.finish("timeout");
    return m.result;
  };
})(typeof window !== "undefined" ? window : globalThis);
