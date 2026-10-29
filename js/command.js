/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert command: the captain's bridge (Phase 5, stage 1). Pure simulation, no screen code.
   Each system has a map from the mission seed: where the ship comes out of warp space, the jump
   point with its jump zone, asteroid fields and enemy clusters. In warp space the captain plots
   1 to 8 legs to the jump zone (or takes the navigator's plot); in the system an NPC pilot flies
   them on the helm model (helm.js), and the captain gives the orders: a course or engines of his
   own, a break or "take it" on each torpedo burst, the gunners' priority, the engineer's stance,
   warn engineering, and the jump. Each system's jump heading is set by the program: the plot's
   last leg must run along it, and in the zone she must be on it to jump. The enemy is the same as at every station. Map units: what the
   ship covers in a second at 1 G (BL.COMMAND.scale); x runs east, y north, headings clockwise
   from north as on the compass. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var RAD = Math.PI / 180;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function norm(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  function to360(a) { return ((a % 360) + 360) % 360; }
  function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
  function bearing(a, b) { return to360(Math.atan2(b.x - a.x, b.y - a.y) / RAD); }
  function along(p, hdg, d) { return { x: p.x + Math.sin(hdg * RAD) * d, y: p.y + Math.cos(hdg * RAD) * d }; }
  // How far point c is from the segment a-b, and the nearest point on it.
  function segNear(a, b, c) {
    var dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, u = L ? clamp(((c.x - a.x) * dx + (c.y - a.y) * dy) / L, 0, 1) : 0;
    var p = { x: a.x + u * dx, y: a.y + u * dy };
    return { d: dist(p, c), p: p, u: u };
  }
  BL.navBearing = bearing;

  /* ------------------------------------------------------------------ The map */
  // One system's map. opts: { window (s), cruiseG, hasDrive }.
  BL.makeNavMap = function (seed, i, opts) {
    var K = BL.COMMAND, r = BL.rng(((seed ^ Math.imul(0x2545f491, i + 1)) >>> 0) || 1);
    var D = opts.cruiseG * K.scale * K.reach * opts.window;
    var start = { x: 0, y: 0, hdg: 10 * Math.floor(r.next() * 36) };
    var jb = to360(start.hdg + r.range(K.jumpOff) * (r.chance(0.5) ? 1 : -1));
    var jump = along(start, jb, D);
    // The jump heading (to the nearest 5 degrees) and the approach point on the line leading in to it.
    var jh = Math.round(to360(jb + r.range([0, K.jumpTurn]) * (r.chance(0.5) ? 1 : -1)) / 5) * 5 % 360;
    var app = along(jump, jh + 180, K.approach * D);
    var map = { D: D, start: start, jump: { x: jump.x, y: jump.y, r: K.zone * D }, jumpHdg: jh, approach: app, rocks: [], clusters: [], window: opts.window };
    // Room for an area: every lobe clear of the start, the jump zone and its approach lane, and a
    // lane (K.lane margins) from every lobe already placed, so there's always a way between them.
    var lobesNow = function () { return [].concat.apply([], map.rocks.concat(map.clusters).map(function (o) { return o.lobes; })); };
    var clear = function (o) {
      var have = lobesNow(), lane = K.lane * K.margin * D;
      return o.lobes.every(function (l) {
        if (dist(l, start) < l.r + K.zone * D * 1.5 || dist(l, jump) < l.r + K.zone * D * 1.5) return false;
        if (segNear(along(app, jh + 180, K.margin * D), jump, l).d < l.r + 1.5 * K.margin * D) return false;
        return have.every(function (e) { return dist(e, l) > e.r + l.r + lane; });
      });
    };
    // n areas into list, centred `along` of the way from a to b and up to `side` off that line.
    function place(list, n, make, a, b, fr, off) {
      var L = dist(a, b), hb = bearing(a, b);
      for (var k = 0, tries = 0; k < n && tries < 200; tries++) {
        var f = r.range(fr), sd = r.range(off) * (r.chance(0.5) ? 1 : -1);
        var o = make(along(along(a, hb, f * L), hb + 90, sd * D));
        if (!clear(o)) continue;
        list.push(o); k++;
      }
    }
    // An area (asteroid field or enemy area): overlapping lobes along a bent line, sometimes with a
    // knob on the side, so it's oblong and lumpy. { x, y, r (a circle round all of it), lobes: [{ x, y, r }] }.
    function field(c, R, N) {
      var n = r.int(N), dir = r.next() * 360, bend = r.range([-50, 50]), lobes = [], p = { x: 0, y: 0 }, pr = 0;
      for (var k = 0; k < n; k++) {
        var rad = r.range(R) * D;
        if (k) { p = along(p, dir, (pr + rad) * r.range([0.45, 0.7])); dir += bend * r.range([0.4, 1.2]); }
        lobes.push({ x: p.x, y: p.y, r: rad }); pr = rad;
      }
      for (var kn = r.int([0, 2]); kn > 0; kn--) { var b = lobes[r.int([0, n - 1])], q = along(b, r.next() * 360, b.r * 0.85); lobes.push({ x: q.x, y: q.y, r: b.r * r.range([0.4, 0.65]) }); }
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      lobes.forEach(function (l) { x0 = Math.min(x0, l.x - l.r); x1 = Math.max(x1, l.x + l.r); y0 = Math.min(y0, l.y - l.r); y1 = Math.max(y1, l.y + l.r); });
      var mx = (x0 + x1) / 2, my = (y0 + y1) / 2, R = 0;
      lobes = lobes.map(function (l) { var o = { x: c.x + l.x - mx, y: c.y + l.y - my, r: l.r }; R = Math.max(R, dist(o, c) + l.r); return o; });
      return { x: c.x, y: c.y, r: R, lobes: lobes };
    }
    var rock = function (c) { return field(c, K.rockR, K.rockLobes); }, enemy = function (c) { return field(c, K.clusterR, K.clusterLobes); };
    // First the blockers, across the straight way to the approach point (so the course has to go
    // round), the first an asteroid field, then an enemy area;
    var nb = r.int(K.blockers);
    place(map.rocks, 1, rock, start, app, [0.3, 0.7], [0, 0.03]);
    if (nb > 1) place(map.clusters, 1, enemy, start, app, [0.25, 0.75], [0, 0.04]);
    // then the rest, a field and an enemy area in turn, while there's room.
    var nr = r.int(K.rocks), ne = r.int(K.clusters);
    for (var turn = 0; turn < 12 && (map.rocks.length < nr || map.clusters.length < ne); turn++) {
      if (map.rocks.length < nr) place(map.rocks, 1, rock, start, jump, K.along, K.side);
      if (map.clusters.length < ne) place(map.clusters, 1, enemy, start, jump, K.along, K.side);
    }
    return map;
  };
  // The circles that make up the map's obstacles: each area's lobes.
  function rockLobes(map) { return [].concat.apply([], map.rocks.map(function (o) { return o.lobes; })); }
  function enemyLobes(map) { return [].concat.apply([], map.clusters.map(function (o) { return o.lobes || [o]; })); }
  BL.inField = function (map, p) { return rockLobes(map).some(function (l) { return dist(l, p) < l.r; }); };
  // Every obstacle on the map, with the margin the navigator keeps.
  function obstacles(map) { var m = BL.COMMAND.margin * map.D; return rockLobes(map).concat(enemyLobes(map)).map(function (o) { return { x: o.x, y: o.y, r: o.r + m }; }); }
  // The first obstacle the segment a-b runs through (with its margin), or null.
  function blocked(map, a, b, obs) {
    var hit = null, best = 2;
    (obs || obstacles(map)).forEach(function (o) { var n = segNear(a, b, o); if (n.d < o.r && n.u < best) { best = n.u; hit = { o: o, n: n }; } });
    return hit;
  }

  /* ------------------------------------------------------------------ A plot
     { pts: [start, wp1, ..., jump point], eng: [one engine order per leg] }. The last leg must
     run along the map's jump heading (within BL.COMMAND.jumpTol). */
  BL.plotInfo = function (map, plot, gOf) {
    var K = BL.COMMAND, legs = [], eta = 0, rocks = false, clusters = false, sharp = 0, pts = plot.pts, lobes = rockLobes(map), elobes = enemyLobes(map);
    for (var k = 0; k < pts.length - 1; k++) {
      var a = pts[k], b = pts[k + 1], L = dist(a, b), hdg = bearing(a, b), g = Math.max(0.1, gOf(plot.eng[k] || "cruise"));
      var turn = k ? norm(hdg - legs[k - 1].hdg) : norm(hdg - map.start.hdg);
      var rk = lobes.some(function (o) { return segNear(a, b, o).d < o.r; }), cl = elobes.some(function (o) { return segNear(a, b, o).d < o.r; });
      rocks = rocks || rk; clusters = clusters || cl;
      if (Math.abs(turn) > K.maxTurn) sharp++;
      eta += L / (g * K.scale);
      legs.push({ hdg: Math.round(hdg) % 360, len: L, turn: turn, eng: plot.eng[k] || "cruise", rocks: rk, clusters: cl, eta: eta });
    }
    // When she reaches the zone's edge (the last leg's last stretch is inside it): that's what's
    // timed against the window.
    var n = legs.length, last = legs[n - 1], zoneEta = n ? eta - Math.min(last.len, map.jump.r) / (Math.max(0.1, gOf(last.eng)) * K.scale) : eta;
    var late = zoneEta > map.window - K.early, lastHdg = n ? last.hdg : null;
    var offJump = lastHdg === null || Math.abs(norm(lastHdg - map.jumpHdg)) > K.jumpTol;
    return { legs: legs, eta: eta, zoneEta: zoneEta, late: late, rocks: rocks, clusters: clusters, sharp: sharp, count: n, offJump: offJump, lastHdg: lastHdg,
      ok: n >= K.legs[0] && n <= K.legs[1] && !late && !rocks && !clusters && !offJump, jumpHdg: map.jumpHdg };
  };
  // The navigator's plot: the shortest way round every obstacle (corners of an octagon drawn
  // round each one, so a leg between them stays clear) to the approach point, then in along the
  // jump heading; 1 to 8 legs, engines set to arrive in time.
  BL.navPlot = function (map, gOf, lc) {
    var K = BL.COMMAND, obs = obstacles(map), start = { x: map.start.x, y: map.start.y }, goal = { x: map.approach.x, y: map.approach.y }, jp = { x: map.jump.x, y: map.jump.y };
    var nodes = [start, goal];
    obs.forEach(function (o) {
      var R = o.r * 1.04 / Math.cos(Math.PI / 8);
      for (var k = 0; k < 8; k++) {
        var p = along(o, k * 45 + 22.5, R);
        if (obs.every(function (q) { return q === o || dist(p, q) > q.r; })) nodes.push(p);
      }
    });
    // Dijkstra from the start over the clear legs between nodes.
    var n = nodes.length, best = nodes.map(function () { return Infinity; }), prev = nodes.map(function () { return -1; }), done = nodes.map(function () { return false; });
    lc = lc || K.legCost; best[0] = 0; var legCost = lc * map.D;
    for (var it = 0; it < n; it++) {
      var u = -1;
      for (var i = 0; i < n; i++) if (!done[i] && (u < 0 || best[i] < best[u])) u = i;
      if (u < 0 || best[u] === Infinity || u === 1) break;
      done[u] = true;
      for (var v = 0; v < n; v++) {
        if (done[v]) continue;
        var w = best[u] + dist(nodes[u], nodes[v]) + legCost;      // (a little for each leg, so fewer of them)
        if (w < best[v] && !blocked(map, nodes[u], nodes[v], obs)) { best[v] = w; prev[v] = u; }
      }
    }
    var pts = [];
    if (prev[1] < 0) pts = [start, goal];                 // (no clear way: straight on, through it)
    else for (var c = 1; c >= 0; c = prev[c]) pts.unshift({ x: nodes[c].x, y: nodes[c].y });
    pts.push(jp);
    // A corner is dropped while the leg between its neighbours stays clear (no needless jogs); the
    // approach point only when the leg past it still runs along the jump heading.
    for (var k = 1; k < pts.length - 1;) {
      var lastOk = k < pts.length - 2 || Math.abs(norm(bearing(pts[k - 1], pts[k + 1]) - map.jumpHdg)) < 2;
      if (pts.length - 1 > K.legs[0] && lastOk && !blocked(map, pts[k - 1], pts[k + 1], obs)) pts.splice(k, 1);
      else k++;
    }
    // At least K.legs[0] legs: split the longest leg with a small dogleg (whichever side is clear).
    for (var g2 = 0, side = 1; pts.length - 1 < K.legs[0] && g2 < 12; g2++, side = -side) {
      var li = 0, ll = 0;
      for (var j = 0; j < pts.length - 1; j++) { var L = dist(pts[j], pts[j + 1]); if (L > ll) { ll = L; li = j; } }
      var mid = { x: (pts[li].x + pts[li + 1].x) / 2, y: (pts[li].y + pts[li + 1].y) / 2 }, hb = bearing(pts[li], pts[li + 1]);
      var cand = [along(mid, hb + 90 * side, K.dogleg * map.D), along(mid, hb - 90 * side, K.dogleg * map.D)].filter(function (c) {
        return !blocked(map, pts[li], c, obs) && !blocked(map, c, pts[li + 1], obs);
      });
      pts.splice(li + 1, 0, cand[0] || mid);
    }
    // Too many legs: again, with each leg costing more.
    if (pts.length - 1 > K.legs[1] && lc < 0.6) return BL.navPlot(map, gOf, lc * 2.5);
    var plot = { pts: pts, eng: pts.slice(1).map(function () { return "cruise"; }) };
    // Late at cruise: standard from the first leg on, then full, until it fits.
    ["standard", "full"].forEach(function (eng) {
      for (var k = 0; k < plot.eng.length && BL.plotInfo(map, plot, gOf).late; k++) plot.eng[k] = eng;
    });
    return plot;
  };

  /* ------------------------------------------------------------- The captain */
  function Captain(m) {
    this.m = m;
    var h = m.helm, self = this;
    this.who = "Captain";
    this.maps = m.route.map(function (id, i) { return BL.makeNavMap(m.seed, i, { window: m.windowFor(i), cruiseG: h.gOf("cruise"), hasDrive: m.hasDrive }); });
    this.plots = [];
    this.stance = BL.COMMAND.standing.stance; this.guns = BL.COMMAND.standing.guns;
    this.basePriority = m.priority.slice();
    this.stats = { rockHits: 0, calls: 0, breaks: 0, breaksMade: 0, taken: 0, unanswered: 0, systems: [] };
    this.pilot = new CaptainPilot();
  }
  BL.Captain = Captain;
  // The system she's in (set on arrival: after a jump the display still shows the last one until the next arrival).
  Captain.prototype.map = function () { return this.maps[this.at === undefined ? this.m.jumpIndex : this.at]; };
  Captain.prototype.gOf = function (id) { return this.m.helm.gOf(id); };
  // The plot for system i (the display sets it in warp space; the navigator's if none).
  Captain.prototype.setPlot = function (i, plot) { this.plots[i] = { pts: plot.pts.map(function (p) { return { x: p.x, y: p.y }; }), eng: plot.eng.slice() }; };
  Captain.prototype.plotFor = function (i) {
    if (!this.plots[i]) this.setPlot(i, BL.navPlot(this.maps[i], this.gOf.bind(this)));
    return this.plots[i];
  };
  // On arrival in a system (after the helm's reset): the ship at the map's start, on its heading.
  Captain.prototype.reset = function () {
    this.at = this.m.jumpIndex;
    var m = this.m, h = m.helm, map = this.map(), plot = this.plotFor(this.at), info = BL.plotInfo(map, plot, this.gOf.bind(this));
    this.pos = { x: map.start.x, y: map.start.y };
    h.base = to360(map.start.hdg - (m.turret ? m.turret.heading : 0));
    h.jumpHdg = info.jumpHdg; h.jumpShown = h.jumpHdg !== null; h.course = null;
    this.info = info; this.leg = 0; this.hdgOrder = null; this.engOrder = null; this.jumpOrdered = false;
    this.inRock = false; this.rockNext = 0; this.zoneAt = null; this.holding = false; this.call = null; this.drRate = null; this.drLast = null;
    this.cur = { rockHits: 0, zoneAt: null, window: m.windowAt(), legs: info.count };
    this.stats.systems[m.jumpIndex] = this.cur;
    this.applyStance(); this.applyGuns(true);
  };
  /* Where the plot says to go: the next waypoint's bearing; on the last leg the jump heading
     once she's at the jump point (she holds in the zone until the jump). */
  Captain.prototype.navView = function () {
    var plot = this.plotFor(this.at), pts = plot.pts, k = Math.min(this.leg, pts.length - 2), wp = pts[k + 1], last = k === pts.length - 2;
    // Steer for a point a little ahead on the plotted leg (the leg is clear of every obstacle),
    // so after a break or a course of his own she comes back onto the line, not across a field.
    var a = pts[k], L = dist(a, wp), u = L ? segNear(a, wp, this.pos).u : 1, ahead = Math.min(1, u + BL.COMMAND.lookahead * this.map().D / Math.max(1, L));
    var aim = { x: a.x + (wp.x - a.x) * ahead, y: a.y + (wp.y - a.y) * ahead };
    var steer = (last || this.jumpOrdered) && this.inZone() ? this.info.jumpHdg : Math.round(bearing(this.pos, ahead >= 1 ? wp : aim)) % 360;
    var spd = Math.max(0.1, this.m.helm.speed) * BL.COMMAND.scale, d = dist(this.pos, wp);
    var next = last ? null : { hdg: this.info.legs[k + 1].hdg, in: d / spd };
    return { leg: k + 1, legs: pts.length - 1, steer: steer, eng: plot.eng[k], wp: wp, last: last, next: next, toZone: Math.max(0, dist(this.pos, this.map().jump) - this.map().jump.r), d: d };
  };
  // Seconds to the jump zone at her speed now, along what's left of the plot (0 in it; null stopped).
  Captain.prototype.zoneEta = function () {
    if (this.inZone()) return 0;
    var pts = this.plotFor(this.at).pts, k = Math.min(this.leg, pts.length - 2), j = this.map().jump, v = this.m.helm.speed * BL.COMMAND.scale;
    if (v < 0.05) return null;
    var d = dist(this.pos, pts[k + 1]);
    for (var i = k + 1; i < pts.length - 1; i++) d += dist(pts[i], pts[i + 1]);
    return Math.max(0, d - j.r) / v;
  };
  // When the jump can go: the window open and the drive full, the drive at the rate it's charging
  // now (BL.COMMAND.driveTau s average). { at: s from now (null: the drive isn't charging), by:
  // "window" | "drive", win, drive }.
  Captain.prototype.readyEta = function () {
    var m = this.m, d = m.sys("drive"), win = Math.max(0, m.windowAt() - m.t), drv = 0;
    if (d && d.mj < d.maxMJ - 0.5) drv = this.drRate > 0.05 ? (d.maxMJ - d.mj) / this.drRate : null;
    var at = drv === null ? null : Math.max(win, drv);
    return { at: at, by: drv === null || drv > win ? "drive" : "window", win: win, drive: drv };
  };
  // In the jump zone (k: times its radius, for an ordered jump that's coasting to a stop).
  Captain.prototype.inZone = function (k) { var j = this.map().jump; return dist(this.pos, j) <= j.r * (k || 1); };
  // What the helm is to do now: the captain's own course and engines, else the plot's.
  Captain.prototype.helmView = function () {
    var nv = this.navView(), j = this.map().jump, hd = (this.info.jumpHdg || 0) * RAD;
    // Holding in the zone: dead slow up to the jump point, stopped once she's past it.
    var past = (this.pos.x - j.x) * Math.sin(hd) + (this.pos.y - j.y) * Math.cos(hd) > 0;
    var hold = past ? "stop" : "deadSlow";
    return { hdg: this.hdgOrder !== null ? this.hdgOrder : nv.steer, eng: this.engOrder || (this.holding ? hold : nv.eng), own: this.hdgOrder !== null || !!this.engOrder, nav: nv, holding: this.holding };
  };

  /* ------------------------------------------------------------- Orders */
  Captain.prototype.orderCourse = function (hdg) {
    this.hdgOrder = Math.round(to360(hdg)) % 360;
    this.m.cue("tick");
  };
  Captain.prototype.orderEngines = function (id) { if (!this.m.helm.preset(id)) return; this.engOrder = id; this.m.cue("tick"); };
  // Back to the plot: the navigation computer steers for the next waypoint.
  Captain.prototype.resumePlot = function () { this.hdgOrder = null; this.engOrder = null; this.m.cue("tick"); };
  Captain.prototype.setStance = function (id) { if (!BL.COMMAND.stances[id]) return; this.stance = id; this.applyStance(); this.m.cue("tick"); };
  // The engineer's stance is his priority order: shields first, guns first, or as the ship comes.
  Captain.prototype.applyStance = function () {
    var m = this.m, base = this.basePriority.slice(), guns = base.filter(function (id) { var s = m.sys(id); return s && s.kind === "gun"; });
    var first = this.stance === "shields" ? ["shield"] : this.stance === "guns" ? guns : [];
    m.setPriority(first.concat(base.filter(function (id) { return first.indexOf(id) < 0; })));
  };
  Captain.prototype.setGuns = function (id) { if (!BL.GUNNERY.orders[id]) return; this.guns = id; this.applyGuns(); this.m.cue("tick"); };
  Captain.prototype.applyGuns = function (quiet) {
    var tu = this.m.turret, id = this.guns;
    if (!tu) return;
    tu.bats.forEach(function (b) { b.order = id; });
    if (!quiet) this.m.say("Gunners: " + BL.GUNNERY.orders[id].ack, "good");
  };
  // Torpedoes at us that no break covers and that haven't landed.
  Captain.prototype.openFish = function () { var h = this.m.helm; return h.fishInAir().filter(function (f) { return f.hold; }); };
  // The helm told us torpedoes are away (Helm.torpedoLaunched): the captain's call is open
  // until they land. The standing order is "take it".
  Captain.prototype.torpedoLaunched = function (e, s) {
    var m = this.m;
    e.hold = true;
    if (this.call && m.t - this.call.at < BL.HELM.evade.burst && !this.call.done) { this.call.fish.push(e); return; }
    if (this.call && !this.call.done) { this.call.done = true; this.stats.unanswered++; }
    this.call = { at: m.t, fish: [e], ship: s, done: false };
    this.stats.calls++;
  };
  Captain.prototype.callView = function () {
    var m = this.m, c = this.call, h = m.helm;
    if (!c || c.done) return null;
    var live = c.fish.filter(function (f) { return !f.done && f.hold && f.at > m.t; });
    if (!live.length) { c.done = true; this.stats.unanswered++; return null; }
    var land = Math.min.apply(null, live.map(function (f) { return f.at; }));
    return { n: live.length, in: land - m.t, mj: live.reduce(function (a, f) { return a + f.mj; }, 0), canBreak: h.canBreak(BL.GUNNERY.torpedo.travel) && !(h.evade && m.t < h.evade.until),
      bearing: c.ship ? norm(c.ship.bearing) : 0 };
  };
  // dir: -1 break to port, 1 to starboard; 0 = take it on the shields.
  Captain.prototype.answer = function (dir) {
    var m = this.m, h = m.helm, cv = this.callView();
    if (!cv) return false;
    this.call.done = true;
    if (!dir) { this.stats.taken++; m.cue("tick"); return true; }
    if (!cv.canBreak) return false;
    this.stats.breaks++;
    h.orderBreak(this.openFish(), this.call.ship, dir);
    return true;
  };
  // The break side `dir`, unless an asteroid field lies close on that side: then the other way.
  Captain.prototype.awayFromRocks = function (dir) {
    var hdg = this.m.helm.compass() * RAD, pos = this.pos, D = this.map().D, near = null, nd = Infinity;
    rockLobes(this.map()).forEach(function (o) { var d = dist(o, pos) - o.r; if (d < nd) { nd = d; near = o; } });
    if (!near || nd > 0.15 * D) return dir;
    var side = Math.sin(hdg) * (near.y - pos.y) - Math.cos(hdg) * (near.x - pos.x);     // > 0: the field is to port
    return side > 0 ? 1 : -1;
  };
  Captain.prototype.warn = function () { return this.m.helm.warn(); };
  // Ready to order the jump: drive full (and the buster, the squadron home: Mission.runJump),
  // window open, in the jump zone, and on the jump heading (BL.HELM.corridor.jump either side):
  // keeping her on it is the captain's job (on the plot the pilot flies the last leg along it).
  // Once ordered, it goes when she's in the zone and on the heading; `wait` says what it's waiting for.
  Captain.prototype.jumpView = function () {
    var m = this.m, d = m.sys("drive"), h = m.helm;
    var drive = !d ? null : d.mj < d.maxMJ - 0.5 ? "Drive " + Math.floor(d.mj / d.maxMJ * 100) + "%" : null;
    var steer = "Steer " + BL.hdgText(this.info.jumpHdg);
    var why = drive || (m.t < m.windowAt() ? "Window in " + Math.ceil(m.windowAt() - m.t) + "s" : !this.inZone() ? "Outside the zone" : !h.inJumpCorridor() ? steer : null);
    var wait = !this.jumpOrdered ? null : drive || (!this.inZone(BL.COMMAND.zoneHold) ? "BACK TO THE ZONE" : !h.inJumpCorridor() ? steer.toUpperCase() : null);
    return { ready: !why, why: why, ordered: this.jumpOrdered, wait: wait };
  };
  Captain.prototype.orderJump = function () {
    if (!this.jumpView().ready || this.jumpOrdered) return false;
    this.jumpOrdered = true; this.m.cue("tick");
    return true;
  };
  // Mission.runJump asks: may the countdown run?
  Captain.prototype.mayJump = function () { return this.jumpOrdered && this.inZone(BL.COMMAND.zoneHold); };

  /* ------------------------------------------------------------- The tick */
  Captain.prototype.step = function (dt) {
    var m = this.m, h = m.helm, K = BL.COMMAND, map = this.map();
    if (!this.pos) return;
    // The ship moves on the map at her speed, on her compass heading.
    var hdg = h.compass(), v = h.speed * K.scale;
    this.pos.x += Math.sin(hdg * RAD) * v * dt; this.pos.y += Math.cos(hdg * RAD) * v * dt;
    // The drive's charge rate, MJ/s, averaged over the last few seconds.
    var dr = m.sys("drive");
    if (dr && dt > 0) {
      if (this.drLast !== null) { var rate = (dr.mj - this.drLast) / dt, a = Math.min(1, dt / K.driveTau); this.drRate = this.drRate === null ? rate : this.drRate + (rate - this.drRate) * a; }
      this.drLast = dr.mj;
    }
    // Waypoints: passed once she's close, or abeam of it.
    var plot = this.plotFor(this.at), pts = plot.pts;
    while (this.leg < pts.length - 2) {
      var a = pts[this.leg], b = pts[this.leg + 1], n = segNear(a, b, this.pos);
      if (dist(this.pos, b) > K.capture * map.D && n.u < 0.999) break;
      this.leg++;
    }
    var zone = this.inZone();
    if (zone && this.cur.zoneAt === null) this.cur.zoneAt = m.t;
    // In the zone on the last leg, the pilot holds her there (dead slow, then stopped) for the jump.
    this.holding = zone && (this.leg >= pts.length - 2 || this.jumpOrdered);
    // Asteroids: inside a field, a hit every `rockEvery` s.
    var rock = BL.inField(map, this.pos);
    if (rock && m.t >= this.rockNext && (m.phase === "engage" || m.phase === "countdown" || m.phase === "arrival")) { this.rockNext = m.t + K.rockEvery; this.rockHit(); }
    this.inRock = rock;
    if (m.phase !== "done") this.pilot.think(m, this);
  };
  // An asteroid hit, like a mine: the shields take it first.
  Captain.prototype.rockHit = function () {
    var m = this.m, sh = m.sys("shield"), mj = BL.COMMAND.rockMJ, took = Math.min(sh.mj, mj);
    sh.mj -= took; this.stats.rockHits++; this.cur.rockHits++;
    var R = m.turret.R; m.turret.effects.push({ type: "hullHit", x: R.cx, y: R.cy - R.ry, at: m.totalT, mj: mj });
    var dmg = Math.round((mj - took) * m.data.hullPerMJ);
    if (dmg < 1) { m.cue("shieldHit"); m.cue("shieldBoom"); return; }
    m.ship.hull -= dmg; m.ship.fresh.hull += dmg; m.stats.hullLost += dmg; m.jumpStats.hullLost += dmg;
    m.cue("hullHit"); m.cue("breach");
    m.chat("hit", { dmg: dmg }, "bad");
    if (m.rng.chance(0.4)) m.damageSystem();
  };

  /* ------------------------------------------------------------- The NPC pilot
     Flies what the captain wants (Captain.helmView) on autopilot, with the engines it says, and
     breaks hard when the captain orders a break, then comes back to the course. He doesn't dodge
     on his own: his standing order is to take torpedoes on the shields. */
  function CaptainPilot() { this.breaking = false; }
  BL.CaptainPilot = CaptainPilot;
  CaptainPilot.prototype.think = function (m, c) {
    var h = m.helm;
    if (h.locked()) return;
    var ev = h.evadeView();
    if (ev && ev.left > 0) { h.setWheel(ev.off >= BL.HELM.dodge.turn * 1.4 ? 0 : ev.dir * Math.min(1, h.C.safe / h.topTurn() * 0.98)); this.breaking = true; return; }
    this.breaking = false;
    var hv = c.helmView();
    if (!h.auto || Math.abs(norm(h.autoHdg - hv.hdg)) > 0.5) h.setAuto(true, hv.hdg);
    if (h.port.ord !== hv.eng || h.stbd.ord !== hv.eng) h.setOrder("both", hv.eng);
  };

  /* ---------------------------------------------------------------- Score
     Four parts of 25: objective and ship condition as everywhere; navigation (in the jump zone by
     the window, no asteroid hits); command (how the crew did under him: the shields and guns
     against the torpedoes, the breaks he ordered made). */
  BL.scoreCaptain = function (m, outcome) {
    var r = BL.score(m, outcome), c = m.captain, st = c.stats, K = BL.COMMAND, tu = m.turret;
    var sys = st.systems.filter(Boolean), nav = 0;
    sys.forEach(function (s) { nav += (s.zoneAt !== null && s.zoneAt <= s.window + K.zoneGrace ? 1 : s.zoneAt !== null ? 0.5 : 0) * Math.max(0, 1 - 0.25 * s.rockHits); });
    nav = sys.length ? nav / sys.length : 0;
    var hs = m.helm.stats, stopped = m.stats.salvos ? (m.stats.salvosShielded + (tu.stats.downed || 0)) / (m.stats.salvos + (tu.stats.downed || 0)) : 1;
    var made = st.breaks ? hs.evasiveMet / st.breaks : 1;
    var command = clamp(0.6 * stopped + 0.4 * made, 0, 1);
    r.station = "captain";
    r.parts = { objective: r.parts.objective, condition: r.parts.condition, navigation: Math.round(25 * nav), command: Math.round(25 * command) };
    r.raw = r.parts.objective + r.parts.condition + r.parts.navigation + r.parts.command;
    r.score = Math.round(r.raw * Math.pow(1 - m.cfg.lookCostPct / 100, r.looks));
    r.captain = { rockHits: st.rockHits, calls: st.calls, breaks: st.breaks, breaksMade: hs.evasiveMet, taken: st.taken, unanswered: st.unanswered,
      systems: sys.map(function (s) { return { zoneAt: s.zoneAt === null ? null : Math.round(s.zoneAt), window: s.window, rockHits: s.rockHits, legs: s.legs }; }),
      ships: tu.stats.ships, kills: tu.stats.kills, downed: tu.stats.downed };
    return r;
  };

  /* -------------------------------------------------------------- Test bot
     Takes the navigator's plot, answers each burst the way the AI captain does at the helm
     (break when the shields can't take what's in the air, else about half the time), and orders
     the jump as soon as it's ready. */
  function CaptainBot() { this.rng = null; }
  BL.CaptainBot = CaptainBot;
  CaptainBot.prototype.think = function (m) {
    var c = m.captain, E = BL.HELM.evade; if (!c) return;
    this.rng = this.rng || BL.rng((m.seed ^ 0x7f4a7c15) >>> 0);
    var cv = c.callView();
    if (cv && cv.in < BL.GUNNERY.torpedo.travel + 0.5) {
      if (cv.canBreak && (m.sys("shield").mj < cv.mj * E.cover || this.rng.chance(E.chance))) c.answer(c.awayFromRocks(cv.bearing < 0 ? 1 : -1));
      else c.answer(0);
    }
    if (c.jumpView().ready && !c.jumpOrdered) c.orderJump();
  };
  BL.runCaptainHeadless = function (seed, classId, tl, idle, extra) {
    classId = classId || "destroyer";
    var rc = BL.GUNNERY.ring.classes[classId];
    var m = new BL.Mission(Object.assign({ seed: seed, quiet: true, classId: classId, tl: tl, helm: true, captain: true,
      gunner: { weapons: BL.GUNNERY.loadout[classId], ring: true, arcs: rc.arcs, arcNames: rc.arcNames, helm: true } }, extra));
    var eng = new BL.AIEngineer(0.5, 0.25, m.turret.engineer.skill), bot = new CaptainBot();
    m.beginJump();
    var guard = 0;
    while (m.phase !== "done" && guard++ < BL.TICK_RATE * 60 * 30) {
      if (m.phase === "gravspace") m.beginJump();
      eng.think(m);
      if (!idle) bot.think(m); else if (m.captain.jumpView().ready) m.captain.orderJump();
      m.step();
    }
    if (m.phase !== "done") m.finish("timeout");
    return m.result;
  };
})(typeof window !== "undefined" ? window : globalThis);
