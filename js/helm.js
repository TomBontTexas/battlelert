/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert pilot station: the helm. Pure simulation, no screen code; the Mission steps it
   (the ring turret calls step for the turn, Mission.runPilot calls runEngines for the power).
   The pilot steers with a wheel, which stays where it's left, and gives each engine its order.
   The rudder and engines answer late (lag), a turn builds and dies away slowly (inertia), and
   turning past the safe rate stresses the hull. Split engines turn the ship faster. The captain
   (the coxswain on a gunboat) gives course and engine orders ahead of time; between them the
   pilot is free to fight the ship. Only the captain orders the helm: the crew report (Tactical
   the torpedoes, Damage control the hull stress, Navigation the jump heading, the gunners an
   empty arc) and the captain decides. The gun crew fires every gun (ring.js, crewAll). A gunboat
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
    this.stats = { orders: 0, ordersMet: 0, stressHits: 0, flankHits: 0, autoT: 0, manualT: 0, overT: 0, hardT: 0, liveT: 0, launches: [],
      torps: 0, dodged: 0, requests: 0, requestsMet: 0, evasive: 0, evasiveMet: 0, disobeyed: 0 };
    this.evade = null;                    // the captain's order to break (dodge) the torpedo just launched
    this.course = null;                   // the captain's standing course: the corridor's middle (BL.HELM.corridor)
    this.jumpHdg = null; this.jumpShown = false;
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
  Helm.prototype.setWheel = function (v) {
    if (this.inTube) return;
    v = clamp(v, -1, 1);
    // The pilot steered (see disobeying); steering through a break the captain ordered doesn't count.
    if (Math.abs(v - this.wheel) > 0.01 && !this.inBreak()) this.steerAt = this.m.t;
    this.wheel = v; this.auto = false;
  };
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
    if (this.auto !== !!on) this.m.cue("toggle");      // (no click for every step of a drag on the compass)
    if (on && hdg !== undefined && Math.abs(norm(hdg - this.compass())) > 2 && !this.inBreak()) this.steerAt = this.m.t;   // a new heading is steering
    this.auto = !!on;
    if (on) this.autoHdg = hdg === undefined ? this.compass() : to360(hdg);
  };
  // Nudge the autopilot's course `d` degrees (by hand: put her on autopilot that far off the heading she's on).
  Helm.prototype.nudgeCourse = function (d) {
    if (this.inTube) return;
    this.setAuto(true, (this.auto ? this.autoHdg : Math.round(this.compass())) + d);
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
    this.cur = { orders: 0, ordersMet: 0, stressHits: 0, launchWait: 0, torps: 0, dodged: 0, requests: 0, requestsMet: 0, evasive: 0, evasiveMet: 0, disobeyed: 0 };
    this.course = null; this.corrOut = false; this.corrSaid = -99;
    this.evade = null; this.burst = null; this.steady = false; this.steadyHdg = null; this.steadyLast = -99; this.verdict = null; this.engOrder = null; this.mainOrdered = false; this.jumpOrderAt = -99; this.lastBreak = -99; this.lastDisobey = -99; this.steerAt = -99;
    this.jumps[m.jumpIndex] = this.cur;
    this.jumpSaid = false; this.conT = 0; this.conTaken = false;
    // Ships with a warp drive jump on a heading Navigation gives on arrival.
    this.jumpHdg = m.hasDrive ? 5 * Math.floor(r.next() * 72) : null;
    this.jumpShown = this.jumpHdg !== null;
    // The captain's course on arrival: the way she's heading (a gunboat's once it's out of the tube).
    if (!this.inTube) this.course = Math.round(this.compass()) % 360;
  };

  // The captain's orders, on the bridge's burn schedule (Mission.schedule calls this at the helm).
  Helm.prototype.schedule = function (t) {
    var m = this.m, enc = m.encounter(), b = enc.burns, H = this.H, r = this.rng;
    if (!b || enc.mines) return;                          // (in a minefield the pilot steers through it: no course orders)
    if (this.jumpNear()) return;                          // time to make the jump heading
    // Bigger ships get more warning: time to swing at a safe rate, plus the lag.
    var C = this.C, turn = this.nextTurn, lead = b.warning + Math.max(0, this.turnTime(turn) - 2);
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
  // About how long a careful turn of `deg` takes: swing at the safe rate, build up and ease off, lag.
  Helm.prototype.turnTime = function (deg) { var C = this.C; return Math.abs(deg) / (0.7 * C.safe) + C.safe / C.build + C.lag + 1; };
  // The next order's turn: bigger ships get smaller ones.
  Helm.prototype.rollTurn = function () {
    var H = this.H, r = this.rng, big = Math.min(H.order.turn[1], this.C.safe * 5), small = Math.min(H.order.turn[0], big / 2);
    this.nextTurn = Math.round(r.range([small, big]) / 5) * 5 * (r.chance(0.5) ? 1 : -1);
  };
  Helm.prototype.orderWords = function (e) { return "all ahead " + this.preset(e.eng).name.toLowerCase(); };
  // A course order the captain gives on the spot (for a gunner's call, the main gun, the jump
  // heading): `warn` s of notice plus time to swing, then hold it `dur` s. The engines keep the
  // ahead order they have (standard if they're split or going astern).
  Helm.prototype.orderCourse = function (hdg, dur) {
    var m = this.m, A = this.H.order, turn = Math.round(norm(hdg - this.compass()));
    var eng = this.port.ord && this.port.ord === this.stbd.ord && this.preset(this.port.ord).f > 0 ? this.port.ord : "standard";
    var at = m.t + A.warn + Math.max(0, this.turnTime(turn) - 2);
    m.events.push({ id: m.nextId++, type: "order", at: at, dur: dur, hdg: Math.round(to360(hdg)), turn: turn, eng: eng, g: this.gOf(eng), announceAt: m.t, announced: false, visible: true });
    this.nextOrderAt = Math.max(this.nextOrderAt, at + dur + A.minGap);
  };
  // Busy: an order pending or under way, lined up for the jump, or still leaving the carrier.
  Helm.prototype.busy = function () { return !!(this.curOrder || this.orderView() || this.engOrder || (this.jumpNear() && this.onJumpHeading()) || this.locked()); };
  Helm.prototype.beginOrder = function (e) {
    if (this.curOrder) this.finishOrder();
    // held: time on the whole order; hdgT, engT: on each part (to say which was missed). The first
    // `grace` s after the order starts don't count against the pilot.
    this.curOrder = { e: e, held: 0, hdgT: 0, engT: 0, end: e.at + e.dur };
    this.course = e.hdg;
  };
  Helm.prototype.finishOrder = function () {
    var o = this.curOrder, m = this.m, A = this.H.order; this.curOrder = null;
    var judged = Math.max(1, o.e.dur - A.grace), met = o.held >= judged * A.held;
    this.stats.orders++; if (this.cur) this.cur.orders++;
    if (met) { this.stats.ordersMet++; if (this.cur) this.cur.ordersMet++; }
    var key = met ? "helmMet" : o.hdgT >= judged * A.held ? "helmMissedEng" : o.engT >= judged * A.held ? "helmMissedHdg" : "helmMissed";
    m.chat(key, { who: this.who, hdg: BL.hdgText(o.e.hdg), eng: this.orderWords(o.e) }, met ? "good" : "bad");
    this.setVerdict(met, key === "helmMissedEng" ? "engines" : key === "helmMissedHdg" ? "heading" : "");
  };
  // How the order just finished went, shown on the order panel for a few seconds.
  Helm.prototype.setVerdict = function (met, part) {
    this.verdict = { met: met, text: met ? "Order met" : part ? "Missed: " + part : "Order missed", until: this.m.t + this.H.order.verdict };
  };
  // "Steady as she goes": lined up for the jump, from BL.HELM.corridor.jumpLead s before the window.
  Helm.prototype.runSteady = function () {
    var m = this.m, K = this.H.corridor;
    if (this.steady || this.jumpHdg === null || this.conTaken || m.t < m.windowAt() - K.jumpLead || !this.onJumpHeading() || this.curOrder || this.inBreak()) return;
    this.steady = true; this.steadyHdg = this.jumpHdg; this.course = this.jumpHdg;
    m.chat("jumpSteady", { who: this.who }, "info");
  };
  // Steady in force (lined up for the jump): the heading to hold; else null.
  Helm.prototype.steadyView = function () { return this.steady ? { hdg: this.steadyHdg, fish: 0 } : null; };
  // The corridor in force: { hdg, width, steady, order }, or null while there's none (in the tube,
  // a minefield, turning onto an order not yet begun, mid-break, the captain has the conn).
  Helm.prototype.corridorView = function () {
    var m = this.m, K = this.H.corridor, enc = m.encounter();
    if (this.course === null || this.locked() || (enc && enc.mines) || this.conTaken || this.inBreak()) return null;
    if (!this.curOrder && this.orderView()) return null;
    if (this.curOrder && m.t < this.curOrder.e.at + this.H.order.grace) return null;     // (the order's grace: still coming round)
    return { hdg: this.course, width: this.steady ? K.jump : K.width, steady: this.steady, order: !!this.curOrder };
  };
  Helm.prototype.inCorridor = function () {
    var c = this.corridorView();
    return !c || Math.abs(norm(c.hdg - this.compass())) <= c.width;
  };
  // Out of the corridor: the captain says so; outside a course order (which is judged on its own)
  // it's disobeying, once per time out.
  Helm.prototype.runCorridor = function () {
    var m = this.m, c = this.corridorView();
    if (!c || (m.phase !== "engage" && m.phase !== "countdown")) { this.corrOut = false; return; }
    // After a break the pilot has `rejoin` s to bring her back inside before it counts.
    var ev = this.evade, out0 = Math.abs(norm(c.hdg - this.compass())) > c.width;
    if (ev && !ev.rejoined) { if (!out0) ev.rejoined = true; else if (m.t < ev.until + this.H.corridor.rejoin) { this.corrOut = out0; return; } }
    var out = Math.abs(norm(c.hdg - this.compass())) > c.width;
    if (out && !this.corrOut) {
      if (m.t - this.corrSaid >= this.H.corridor.say) { this.corrSaid = m.t; m.chat("corridor", { who: this.who }, "bad"); m.cue("warn"); }
      if (!c.order) { this.stats.disobeyed++; if (this.cur) this.cur.disobeyed++; }
    }
    this.corrOut = out;
  };
  // On the ordered heading (inside the corridor); both engines ordered near what the captain asked for; both.
  Helm.prototype.onHeading = function (e) { return Math.abs(norm(e.hdg - this.compass())) <= this.H.corridor.width; };
  Helm.prototype.onEngines = function (e) {
    var want = this.gOf(e.eng), avg = (this.port.g + this.stbd.g) / 2;
    return Math.abs(avg - want) <= Math.max(0.6, want * 0.15);
  };
  Helm.prototype.onOrder = function (e) { return this.onHeading(e) && this.onEngines(e); };

  /* ------------------------------------------------------- Evasive orders
     On every burst of torpedoes launched at us (launched within BL.HELM.evade.burst s) the
     captain gives one of two orders: "Steady as she goes. The shields can take it." or a break
     ("Break left, now!"). Steady is said once and stands until his next order changes things (a
     break, a course order), or until the torpedoes he said to take are gone and none have come for
     BL.HELM.evade.steadyLapse s; he doesn't repeat it for every burst. He orders steady while a course order is pending or under way (swerving
     fails the order anyway), while the ship is lined up for the jump, and on ships too slow to
     swing far enough (big ships); otherwise he breaks when the shields can't take what's in the
     air, and about half the time when they can. He keeps watching: if the shields can no longer
     take the fish he said to take (they drained, or more came), he orders a break then. The clock
     starts when the break order is heard: the fish it covers land no sooner than the torpedo's
     flight time after it (BL.HELM.evade.orderTime allows for it being spoken). A break carried
     out in time (the bow BL.HELM.dodge.turn degrees or more off where a steady turn would have
     put it) makes them miss, and counts as an order met. Dodging after "Steady" is disobeying
     an order: it counts as an order not met and costs BL.HELM.evade.disobeyCost of the
     mission's score. It's disobeying only if the pilot steered after the order (moved the wheel,
     or set the autopilot to a new heading); finishing a turn already under way, or turning for
     the captain's own course order, is fine. */
  // Steering during an ordered break, or just after it (a late break, straightening out), isn't steering against the captain.
  Helm.prototype.inBreak = function () { return !!this.evade && this.m.t <= this.evade.until + this.H.evade.settle; };
  Helm.prototype.aimSnap = function () { return { hdg: this.compass(), omega: this.omega, t: this.m.t }; };
  // How far the bow is off where a steady turn from snapshot `snap` would have put it.
  Helm.prototype.offSnap = function (snap) { return Math.abs(norm(this.compass() - (snap.hdg + snap.omega * (this.m.t - snap.t)))); };
  Helm.prototype.dodged = function (snap) { return this.offSnap(snap) >= this.H.dodge.turn; };
  // Can this ship swing far enough in `t` seconds, from a standing start after the lag?
  Helm.prototype.canBreak = function (t) {
    var b = this.C.build * this.turnFactor(), s = Math.max(0, t - this.C.lag - 0.4);
    return 0.5 * b * s * s >= this.H.dodge.turn * 1.3;
  };
  // Enemy torpedoes in the air at us that no break covers.
  Helm.prototype.fishInAir = function () {
    var m = this.m;
    return m.events.filter(function (f) { return f.type === "salvo" && f.torp && !f.done && !f.evade && f.at > m.t; });
  };
  // Torpedoes about to leave their tubes in the same burst (launching within `burst` s).
  Helm.prototype.burstToCome = function () {
    var m = this.m, la = BL.GUNNERY.torpedo.travel, w = this.H.evade.burst;
    return m.events.filter(function (f) { return f.type === "salvo" && !f.torp && !f.done && f.at - la <= m.t + w; });
  };
  // Torpedo f lands no sooner than `t`.
  Helm.prototype.landBy = function (f, t) { if (f.at < t) f.at = t; if (f.torp) f.torp.t1 = f.at; };
  // A torpedo just launched at us from ship s (ring.js calls this before drawing it).
  Helm.prototype.torpedoLaunched = function (e, s) {
    var m = this.m, E = this.H.evade, now = m.t, bu = this.burst, travel = BL.GUNNERY.torpedo.travel;
    e.snap = this.aimSnap();                                            // what the enemy aimed for
    if (bu && now - bu.at < E.burst) {                                  // the same burst: the same order
      if (bu.evade && !bu.evade.judged) this.cover(e, bu.evade); else e.hold = bu.hold;
      return;
    }
    bu = this.burst = { at: now, hold: false, evade: null };
    var ev = this.evade;
    if (ev && now < ev.until) return;                                   // mid-break: the pilot's busy; no new order
    var free = !this.busy() && now - this.lastBreak >= E.gap && this.canBreak(travel);
    var mj = e.mj; this.fishInAir().concat(this.burstToCome()).forEach(function (f) { if (f !== e) mj += f.mj; });
    if (free && (m.sys("shield").mj < mj * E.cover || this.rng.chance(E.chance))) { this.orderBreak([e], s); return; }
    // Take it: no order; the pilot may dodge it inside the corridor. He keeps watching (recheck).
    e.hold = bu.hold = true;
  };
  // The break covers torpedo f: it lands no sooner than the break allows.
  Helm.prototype.cover = function (f, ev) { f.evade = ev; f.hold = false; this.landBy(f, ev.until); };
  // The captain orders a break covering `fish`, cutting in.
  Helm.prototype.orderBreak = function (fish, s) {
    var m = this.m, E = this.H.evade, now = m.t, self = this;
    // Against the turn the ship is making (that throws the aim off fastest), else away from the torpedo.
    var dir = Math.abs(this.omega) > 3 ? (this.omega > 0 ? -1 : 1) : s && norm(s.bearing) < 0 ? 1 : -1;
    this.lastBreak = now;
    var ev = this.evade = { at: now, until: now + E.orderTime + BL.GUNNERY.torpedo.travel, dir: dir, snap: this.aimSnap(), judged: false };
    if (this.burst && now - this.burst.at < E.burst) this.burst.evade = ev;
    fish.forEach(function (f) { self.cover(f, ev); });
    this.stats.evasive++; if (this.cur) this.cur.evasive++;
    m.chat("evade", { who: this.who, dir: dir > 0 ? "right" : "left" }, "warn", true);
    m.cue("warn");
  };
  // The captain keeps watching the fish he said to take: once the shields can't take them, break.
  Helm.prototype.recheck = function () {
    var m = this.m, E = this.H.evade, ev = this.evade;
    if ((ev && m.t <= ev.until) || m.t - this.lastBreak < E.gap || this.busy() || !this.canBreak(BL.GUNNERY.torpedo.travel)) return;
    var fish = this.fishInAir().filter(function (f) { return f.hold && f.at - m.t >= E.lateMin; });
    if (!fish.length) return;
    var mj = 0; fish.forEach(function (f) { mj += f.mj; });
    if (m.sys("shield").mj >= mj * E.cover) return;
    this.orderBreak(fish, m.turret.shipOf(fish[0]));
  };
  // Mission.salvoHits asks this for every torpedo that reaches the ship: true = it missed.
  Helm.prototype.torpedoArrives = function (e) {
    var ev = e.evade, m = this.m;
    if (!e.torp || e.type === "mine") return false;                      // a mine is steered round, not dodged
    this.stats.torps++; if (this.cur) this.cur.torps++;
    if (!this.dodged(ev ? ev.snap : e.snap || this.aimSnap())) return false;
    this.stats.dodged++; if (this.cur) this.cur.dodged++;
    // (dodging inside the corridor is the pilot's to do; leaving it is what's disobeying: runCorridor)
    return true;
  };
  // A break is judged when its torpedoes land, whether or not the crew shot them down first.
  Helm.prototype.judgeBreak = function () {
    var ev = this.evade, m = this.m;
    if (!ev || ev.judged || m.t < ev.until) return;
    ev.judged = true;
    if (this.dodged(ev.snap)) { this.stats.evasiveMet++; if (this.cur) this.cur.evasiveMet++; }
    else m.chat("evadeMissed", { who: this.who }, "bad");
  };
  Helm.prototype.evadeView = function () {
    var ev = this.evade, m = this.m;
    if (!ev || m.t > ev.until + 0.5) return null;
    return { dir: ev.dir, left: Math.max(0, ev.until - m.t), off: this.offSnap(ev.snap) };
  };

  /* -------------------------------------------------------- Gunners' calls
     A gunner whose arc is empty while a ship his weapon is best against sits outside it tells
     the captain (ring.js makes the call), and the captain orders the helm round: a course order
     like any other. He lets it go while he's breaking. */
  Helm.prototype.request = function (b, turn, ship) {
    var m = this.m, rel = norm(ship.bearing);
    b.reqReady = m.totalT + this.H.request.cooldown;
    m.chat("helmReq", { n: b.gunNo, side: Math.abs(rel) > 150 ? "astern" : Math.abs(rel) < 30 ? "ahead" : rel < 0 ? "to port" : "to starboard" }, "info");
    if (this.inBreak() || this.busy()) return;
    this.orderCourse(this.compass() + turn, this.H.order.callHold);
  };
  // The main gun is charged: the captain puts the bow on the biggest ship out there.
  Helm.prototype.runMainGun = function () {
    var m = this.m, tu = m.turret, ms = tu.mainState();
    if (!ms || !ms.ready) { this.mainOrdered = false; return; }
    if (this.mainOrdered || this.busy() || this.jumpNear() || this.inBreak()) return;
    var big = null;
    tu.ships.forEach(function (s) { if (!s.dead && s.state === "hold" && (!big || s.hpMax > big.hpMax)) big = s; });
    if (!big) return;
    this.mainOrdered = true;
    if (Math.abs(norm(big.bearing)) > this.H.order.heading) this.orderCourse(this.compass() + big.bearing, this.H.order.callHold);
  };
  // Clear of the carrier, the coxswain orders all ahead standard: met once both engines are on it in time.
  Helm.prototype.runEngOrder = function () {
    var q = this.engOrder, m = this.m;
    if (!q) return;
    var met = this.port.ord === q.eng && this.stbd.ord === q.eng;
    if (!met && m.t < q.until) return;
    this.engOrder = null;
    this.stats.orders++; if (this.cur) this.cur.orders++;
    if (met) { this.stats.ordersMet++; if (this.cur) this.cur.ordersMet++; }
    else m.chat("helmMissedE", { who: this.who }, "bad");
    this.setVerdict(met, "engines");
  };

  /* ---------------------------------------------------------- Jump heading */
  Helm.prototype.onJumpHeading = function () { return this.jumpHdg === null || Math.abs(norm(this.jumpHdg - this.compass())) <= this.H.order.heading; };
  // Drive full, window open, bow still off the jump heading for 20 s: the captain takes the
  // conn and has the autopilot bring her round (the jump is late).
  Helm.prototype.runConn = function (dt) {
    var m = this.m, d = m.sys("drive");
    if (this.jumpHdg === null || this.conTaken || !d || m.t < m.windowAt() || d.mj < d.maxMJ - 0.5 || this.onJumpHeading()) { this.conT = 0; return; }
    this.conT += dt;
    if (this.conT < 20) return;
    this.conTaken = true;
    this.setAuto(true, this.jumpHdg);
    m.chat("takeConn", { hdg: BL.hdgText(this.jumpHdg) }, "bad");
  };
  // Lining up for the jump, off the heading: the captain orders it (again, if the bow wanders off).
  Helm.prototype.runJumpOrder = function () {
    var m = this.m;
    if (this.jumpHdg === null || !this.jumpNear() || this.conTaken || this.onJumpHeading() || this.curOrder || this.orderView() || this.inBreak() || this.locked()) return;
    if (m.t - this.jumpOrderAt < this.H.order.callHold + this.H.order.warn + 4) return;
    this.jumpOrderAt = m.t;
    this.orderCourse(this.jumpHdg, this.H.order.callHold);
  };
  // Close enough to the jump window that the ship should be lining up for it (no new orders or calls).
  Helm.prototype.jumpNear = function () { var m = this.m; return this.jumpHdg !== null && m.t > m.windowAt() - 15 - this.turnTime(180); };
  Helm.prototype.jumpView = function () {
    var m = this.m;
    return this.jumpHdg === null || !this.jumpShown ? null : { hdg: this.jumpHdg, in: m.windowAt() - m.t, on: this.onJumpHeading() };
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
      this.engOrder = { eng: "standard", until: m.t + H.launch.setIn };
      this.course = Math.round(this.compass()) % 360;          // the coxswain's course: the way she came out
      m.chat("helmClear", null, "warn");
    }
    // Presets follow the class's top G (thruster damage lowers it).
    if (this.port.ord) this.port.g = this.gOf(this.port.ord);
    if (this.stbd.ord) this.stbd.g = this.gOf(this.stbd.ord);
    if (this.auto) this.autopilot();
    this.hist.push([m.totalT, this.wheel, this.port.g, this.stbd.g]);
    var lag = this.lagged();
    var k = 1 - Math.exp(-dt / (H.engineTau + H.engineLagTau * C.lag));     // big ships' engines spool slower too
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
    if (o) {
      if (m.t >= o.e.at + H.order.grace) {
        var oh = this.onHeading(o.e), oe = this.onEngines(o.e);
        if (oh) o.hdgT += dt; if (oe) o.engT += dt; if (oh && oe) o.held += dt;
      }
      if (m.t >= o.end) this.finishOrder();
    }
    this.runEngOrder();
    this.runMainGun();
    this.runJumpOrder();
    this.runConn(dt);
    this.judgeBreak();
    this.recheck();
    this.runSteady();
    this.runCorridor();
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
    // Far out it brakes on a square-root curve (stop exactly in the distance left); close in
    // the gain is capped by the lag, or the wheel slams side to side and never settles.
    var gain = Math.min(2, 1 / (3 * (C.lag + 0.05)));
    var want = (pred < 0 ? -1 : 1) * Math.min(vmax, Math.sqrt(2 * b * Math.abs(pred)), gain * Math.abs(pred));
    if (Math.abs(err) < 0.3 && Math.abs(this.omega) < 0.5) want = 0;
    this.wheel = clamp(want / top, -1, 1);
  };
  // Turning past the safe rate fills the stress bar; a full bar is a structural hit.
  Helm.prototype.runStress = function (dt) {
    var m = this.m, S = this.H.stress, safe = this.C.safe, over = Math.abs(this.omega) - safe;
    if (over > 0.01) this.stress += over / safe * S.fill * dt;
    else this.stress = Math.max(0, this.stress - S.drain * dt);
    if (!this.stressSaid && this.stress >= S.warnAt) {
      this.stressSaid = true; m.chat("stressWarn", null, "warn"); m.cue("warn");
      if (!this.inBreak()) m.chat("easeOff", { who: this.who }, "warn");
    }
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
    // (a disobeyed "take it" counts as an order not met)
    var asked = st.orders + st.requests + st.evasive + st.disobeyed, orders = asked ? (st.ordersMet + st.requestsMet + st.evasiveMet) / asked : 1;
    var handling = Math.max(0, 1 - 0.2 * st.stressHits - 0.2 * st.flankHits);
    var live = st.autoT + st.manualT, autoShare = live ? st.autoT / live : 0, f = 1 - autoShare * (1 - BL.HELM.autopilotRep);
    r.station = "pilot";
    r.parts = { objective: r.parts.objective, condition: r.parts.condition, orders: Math.round(25 * orders * f), handling: Math.round(25 * handling * f) };
    r.raw = r.parts.objective + r.parts.condition + r.parts.orders + r.parts.handling;
    r.score = Math.round(r.raw * Math.pow(1 - m.cfg.lookCostPct / 100, r.looks) * Math.pow(1 - BL.HELM.evade.disobeyCost, st.disobeyed));
    r.aggression = st.liveT ? Math.min(1, (st.overT + st.hardT) / st.liveT * 2) : 0;
    r.engineer = tu.engineer;
    r.crew = tu.bats.map(function (b) { return b.crew; }).filter(Boolean);
    r.helm = {
      orders: st.orders, ordersMet: st.ordersMet, stressHits: st.stressHits, flankHits: st.flankHits,
      torpsAtUs: st.torps, dodged: st.dodged, requests: st.requests, requestsMet: st.requestsMet, evasive: st.evasive, evasiveMet: st.evasiveMet, disobeyed: st.disobeyed,
      autoPct: Math.round(autoShare * 100), launches: st.launches.slice(),
      ships: tu.stats.ships, kills: tu.stats.kills, torps: tu.stats.torps, downed: tu.stats.downed, ptFired: tu.stats.ptFired, ptHits: tu.stats.ptHits,
      jumps: h.jumps.map(function (j) { return j ? Object.assign({}, j) : null; })
    };
    return r;
  };

  /* -------------------------------------------------------------- Test bot
     Flies the helm for headless tests: launches at once, follows each order on autopilot, and
     breaks hard the way the captain orders, then holds the new heading. */
  function HelmBot() { this.breaking = false; this.side = 1; this.weaveFor = null; }
  BL.HelmBot = HelmBot;
  HelmBot.prototype.think = function (m) {
    var h = m.helm; if (!h) return;
    if (h.inTube && m.t >= 1) h.launch();
    if (h.locked()) return;
    if (h.engOrder) h.setOrder("both", h.engOrder.eng);
    var ev = h.evadeView();
    // A break: wheel over until the bow is well off (1.4 x the dodge), then ease the wheel.
    if (ev && ev.left > 0) { h.setWheel(ev.off >= BL.HELM.dodge.turn * 1.4 ? 0 : ev.dir * Math.min(1, h.C.safe / h.topTurn() * 0.98)); this.breaking = true; return; }
    if (this.breaking) { this.breaking = false; h.setAuto(true, h.compass()); }
    var o = h.orderView(), lead = h.turnTime(norm(o ? o.hdg - h.compass() : 0)) + 1;
    // Torpedoes it was told to take: jink inside the corridor (a dodge is a change of turn, not a
    // steady swing): wheel over at the safe rate, reversing before the corridor's edge and on
    // each new launch, so the bow keeps leaving where the enemy aimed.
    var cv = h.corridorView(), fish = h.fishInAir().filter(function (f) { return f.hold && f.at - m.t > 0.3; });
    var aim = o && (o.active || o.in < lead) ? o.hdg : cv ? cv.hdg : null;
    if (cv && !cv.steady && fish.length && (!o || o.active)) {     // (lined up for the jump, it holds: 5° is no room to dodge)
      var off = norm(h.stopHeading() - cv.hdg), edge = cv.width * 0.8, newest = 0;   // where the bow will stop: it carries on turning
      fish.forEach(function (f) { if (f.snapT === undefined) f.snapT = m.t; newest = Math.max(newest, f.snapT); });
      if (newest > (this.flipAt || -99) + 1.2) { this.flipAt = m.t; this.side = -this.side; }
      if (off > edge) this.side = -1; else if (off < -edge) this.side = 1;
      if (o && (h.port.ord !== o.eng || h.stbd.ord !== o.eng)) h.setOrder("both", o.eng);
      h.setWheel(this.side * Math.min(1, h.C.safe / h.topTurn() * 0.98)); this.breaking = true;
      return;
    }
    if (o && (o.active || o.in < lead)) {
      if (!h.auto || Math.abs(norm(h.autoHdg - aim)) > 0.5) h.setAuto(true, aim);
      if (h.port.ord !== o.eng || h.stbd.ord !== o.eng) h.setOrder("both", o.eng);
    } else {
      var j = h.jumpView(), goal = cv ? aim : j && j.in < 10 + h.turnTime(180) ? j.hdg : null;   // the captain's course stands; he orders the jump heading
      if (goal !== null && (!h.auto || Math.abs(norm(h.autoHdg - goal)) > 0.5)) h.setAuto(true, goal);
      if (!h.engOrder && (h.port.ord !== "cruise" || h.stbd.ord !== "cruise")) h.setOrder("both", "cruise");   // back to cruise between orders
    }
  };
  BL.runHelmHeadless = function (seed, classId, tl, idle, extra) {
    classId = classId || "gunboat";
    var rc = BL.GUNNERY.ring.classes[classId];
    var m = new BL.Mission(Object.assign({ seed: seed, quiet: true, classId: classId, tl: tl, helm: true,
      gunner: { weapons: BL.GUNNERY.loadout[classId], ring: true, arcs: rc.arcs, arcNames: rc.arcNames, helm: true } }, extra));
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
