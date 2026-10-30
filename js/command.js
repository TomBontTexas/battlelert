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
    var map = { D: D, start: start, jump: { x: jump.x, y: jump.y, r: K.zone * D }, jumpHdg: jh, approach: app, rocks: [], clusters: [], window: opts.window, recovery: opts.hasDrive === false };     // (recovery: a gunboat's carrier pickup)
    // A picket's scouting run (opts.checkpoints): checkpoints to fly through in order, spread along
    // the way to the jump point and off to either side. Placed first: every area keeps clear of them.
    map.checkpoints = [];
    if (opts.checkpoints) {
      var CP = K.checkpoints, ncp = r.int(CP.n), cside = r.chance(0.5) ? 1 : -1;
      for (var qc = 0; qc < ncp; qc++) {
        var fc = CP.along[0] + (CP.along[1] - CP.along[0]) * (qc + 0.5) / ncp + r.range([-0.04, 0.04]);
        var pc = along(along(start, jb, fc * D), jb + 90, cside * r.range(CP.side) * D);
        map.checkpoints.push({ x: pc.x, y: pc.y, r: CP.r * D, n: qc + 1 });
        cside = -cside;          // (side to side, zigzagging across the way)
      }
    }
    map.legs = [K.legs[0], K.legs[1] + map.checkpoints.length];     // (a leg more allowed for each checkpoint)
    // Room for an area: every lobe clear of the start, the jump zone and its approach lane, and a
    // lane (K.lane margins) from every lobe already placed, so there's always a way between them.
    var lobesNow = function () { return [].concat.apply([], map.rocks.concat(map.clusters, map.mines ? [map.mines] : []).map(function (o) { return o.lobes; })); };
    var clear = function (o) {
      var have = lobesNow(), lane = K.lane * K.margin * D;
      return o.lobes.every(function (l) {
        if (dist(l, start) < l.r + K.zone * D * 1.5 || dist(l, jump) < l.r + K.zone * D * 1.5) return false;
        if (segNear(along(app, jh + 180, K.margin * D), jump, l).d < l.r + 1.5 * K.margin * D) return false;
        if (map.checkpoints.some(function (c) { return dist(c, l) < c.r + l.r + K.margin * D; })) return false;
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
    // A mine scenario: first the big minefield, lobes scattered over the middle of the way to the
    // jump point (`along` of it) and `wide` either side, clear of the start and the jump zone.
    if (opts.mines) {
      var MF = K.minefield, mc = along(start, jb, (MF.along[0] + MF.along[1]) / 2 * D), n = r.int(MF.lobes), ml = [];
      for (var q = 0, tries = 0; ml.length < n && tries < 80; tries++, q++) {
        var lr = r.range(MF.r) * D, lc = along(along(start, jb, r.range(MF.along) * D), jb + 90, r.range([-MF.wide, MF.wide]) * D);
        if (dist(lc, start) > lr + K.zone * D * 1.5 && dist(lc, jump) > lr + K.zone * D * 1.5) ml.push({ x: lc.x, y: lc.y, r: lr });
      }
      if (ml.length) map.mines = { x: mc.x, y: mc.y, r: Math.max.apply(null, ml.map(function (l) { return dist(l, mc) + l.r; })), lobes: ml, kind: opts.mines };
    }
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
  BL.inMines = function (map, p) { return !!map.mines && map.mines.lobes.some(function (l) { return dist(l, p) < l.r; }); };
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
    var K = BL.COMMAND, LG = map.legs || K.legs, legs = [], eta = 0, rocks = false, clusters = false, mines = false, sharp = 0, pts = plot.pts, lobes = rockLobes(map), elobes = enemyLobes(map);
    for (var k = 0; k < pts.length - 1; k++) {
      var a = pts[k], b = pts[k + 1], L = dist(a, b), hdg = bearing(a, b), g = Math.max(0.1, gOf(plot.eng[k] || "cruise"));
      var turn = k ? norm(hdg - legs[k - 1].hdg) : norm(hdg - map.start.hdg);
      var rk = lobes.some(function (o) { return segNear(a, b, o).d < o.r; }), cl = elobes.some(function (o) { return segNear(a, b, o).d < o.r; });
      var mn = !!map.mines && map.mines.lobes.some(function (o) { return segNear(a, b, o).d < o.r; });
      rocks = rocks || rk; clusters = clusters || cl; mines = mines || mn;
      if (Math.abs(turn) > K.maxTurn) sharp++;
      eta += L / (g * K.scale);
      legs.push({ hdg: Math.round(hdg) % 360, len: L, turn: turn, eng: plot.eng[k] || "cruise", rocks: rk, clusters: cl, mines: mn, eta: eta });
    }
    // When she reaches the zone's edge (the last leg's last stretch is inside it): that's what's
    // timed against the window.
    var n = legs.length, last = legs[n - 1], zoneEta = n ? eta - Math.min(last.len, map.jump.r) / (Math.max(0.1, gOf(last.eng)) * K.scale) : eta;
    var late = zoneEta > map.window - K.early, lastHdg = n ? last.hdg : null;
    var offJump = lastHdg === null || Math.abs(norm(lastHdg - map.jumpHdg)) > K.jumpTol;
    // A scouting run: the checkpoints no leg passes through (a warning; each missed costs navigation).
    var cpMiss = (map.checkpoints || []).filter(function (c) {
      for (var j = 0; j < pts.length - 1; j++) if (segNear(pts[j], pts[j + 1], c).d < c.r) return false;
      return true;
    }).map(function (c) { return c.n; });
    return { legs: legs, eta: eta, zoneEta: zoneEta, late: late, rocks: rocks, clusters: clusters, mines: mines, sharp: sharp, count: n, offJump: offJump, lastHdg: lastHdg, cpMiss: cpMiss,
      minLegs: LG[0], maxLegs: LG[1], ok: n >= LG[0] && n <= LG[1] && !late && !clusters && !offJump, jumpHdg: map.jumpHdg };     // (through asteroids is allowed, with a warning)
  };
  // The navigator's plot: the shortest way round every obstacle (corners of an octagon drawn
  // round each one, so a leg between them stays clear) through each checkpoint in turn to the
  // approach point, then in along the jump heading; 1 to 8 legs (and one more per checkpoint),
  // engines set to arrive in time.
  BL.navPlot = function (map, gOf, lc) {
    var K = BL.COMMAND, LG = map.legs || K.legs, obs = obstacles(map), start = { x: map.start.x, y: map.start.y }, goal = { x: map.approach.x, y: map.approach.y }, jp = { x: map.jump.x, y: map.jump.y };
    var corners = [];
    obs.forEach(function (o) {
      var R = o.r * 1.04 / Math.cos(Math.PI / 8);
      for (var k = 0; k < 8; k++) {
        var p = along(o, k * 45 + 22.5, R);
        if (obs.every(function (q) { return q === o || dist(p, q) > q.r; })) corners.push(p);
      }
    });
    lc = lc || K.legCost; var legCost = lc * map.D;
    // Dijkstra from a to b over the clear legs between the corners: the points from a to b.
    function route(a, b) {
      var nodes = [a, b].concat(corners), n = nodes.length, best = nodes.map(function () { return Infinity; }), prev = nodes.map(function () { return -1; }), done = nodes.map(function () { return false; });
      best[0] = 0;
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
      var out = [];
      if (prev[1] < 0) return [a, b];                     // (no clear way: straight on, through it)
      for (var c = 1; c >= 0; c = prev[c]) out.unshift(c === 1 ? b : { x: nodes[c].x, y: nodes[c].y });
      return out;
    }
    var pts = [start], from = start;
    (map.checkpoints || []).map(function (c) { return { x: c.x, y: c.y, cp: true }; }).concat([goal]).forEach(function (g) { pts = pts.concat(route(from, g).slice(1)); from = g; });
    pts.push(jp);
    // A corner is dropped while the leg between its neighbours stays clear (no needless jogs); the
    // approach point only when the leg past it still runs along the jump heading; a checkpoint never.
    for (var k = 1; k < pts.length - 1;) {
      var lastOk = k < pts.length - 2 || Math.abs(norm(bearing(pts[k - 1], pts[k + 1]) - map.jumpHdg)) < 2;
      if (!pts[k].cp && pts.length - 1 > LG[0] && lastOk && !blocked(map, pts[k - 1], pts[k + 1], obs)) pts.splice(k, 1);
      else k++;
    }
    // At least K.legs[0] legs: split the longest leg with a small dogleg (whichever side is clear).
    for (var g2 = 0, side = 1; pts.length - 1 < LG[0] && g2 < 12; g2++, side = -side) {
      var li = 0, ll = 0;
      for (var j = 0; j < pts.length - 1; j++) { var L = dist(pts[j], pts[j + 1]); if (L > ll) { ll = L; li = j; } }
      var mid = { x: (pts[li].x + pts[li + 1].x) / 2, y: (pts[li].y + pts[li + 1].y) / 2 }, hb = bearing(pts[li], pts[li + 1]);
      var cand = [along(mid, hb + 90 * side, K.dogleg * map.D), along(mid, hb - 90 * side, K.dogleg * map.D)].filter(function (c) {
        return !blocked(map, pts[li], c, obs) && !blocked(map, c, pts[li + 1], obs);
      });
      pts.splice(li + 1, 0, cand[0] || mid);
    }
    // Too many legs: again, with each leg costing more.
    if (pts.length - 1 > LG[1] && lc < 0.6) return BL.navPlot(map, gOf, lc * 2.5);
    pts = pts.map(function (p) { return { x: p.x, y: p.y }; });
    var plot = { pts: pts, eng: pts.slice(1).map(function () { return "cruise"; }) };
    // Late at cruise: standard from the first leg on, then full, until it fits (on a scouting run
    // with `slack` s to spare for each checkpoint's turns).
    var slack = (map.checkpoints || []).length * K.checkpoints.slack;
    function late() { var inf = BL.plotInfo(map, plot, gOf); return inf.late || inf.zoneEta > map.window - K.early - slack; }
    ["standard", "full"].forEach(function (eng) {
      for (var k = 0; k < plot.eng.length && late(); k++) plot.eng[k] = eng;
    });
    return plot;
  };

  /* ------------------------------------------------------------- The captain */
  function Captain(m) {
    this.m = m;
    var h = m.helm, self = this;
    this.who = "Captain";
    this.maps = m.route.map(function (id, i) {
      var enc = BL.ENCOUNTERS[id] || {};
      return BL.makeNavMap(m.seed, i, { window: m.windowFor(i), cruiseG: h.gOf("cruise"), hasDrive: m.hasDrive, mines: enc.sweep ? "sweep" : enc.mines ? "minefield" : null,
        checkpoints: BL.COMMAND.checkpoints.classes.indexOf(m.data.classId) >= 0 });
    });
    this.plots = [];
    this.stance = BL.COMMAND.standing.stance; this.guns = BL.COMMAND.standing.guns;
    this.basePriority = m.priority.slice();
    this.stats = { rockHits: 0, calls: 0, breaks: 0, pilotBreaks: 0, breaksMade: 0, taken: 0, unanswered: 0, systems: [],
      wardTorps: 0, wardCalls: 0, covers: 0, covered: 0, wingStops: 0 };
    this.pilot = new CaptainPilot();
    // Escort (BL.COMMAND.escort): the ward's hull carries over from system to system.
    this.escort = m.escort ? this.makeEscort() : null;
    this.station = "ahead"; this.wcall = null;
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
    this.inRock = false; this.inMines = false; this.zoneAt = null; this.holding = false; this.call = null; this.drRate = null; this.drLast = null; this.swing = null;
    this.cur = { rockHits: 0, zoneAt: null, window: m.windowAt(), legs: info.count, onStation: 0, stationT: 0, cps: map.checkpoints.map(function () { return false; }) };
    this.stats.systems[m.jumpIndex] = this.cur;
    // Escort: the carrier sails the plotted course (the navigator's) from the start, reaching the
    // jump point at BL.COMMAND.escort.arrive of the time to the window.
    if (this.escort) {
      var L = 0; for (var k = 1; k < plot.pts.length; k++) L += dist(plot.pts[k - 1], plot.pts[k]);
      var w = this.escort; w.L = L; w.s = 0; w.v = L / Math.max(10, m.windowAt() * BL.COMMAND.escort.arrive); w.pos = { x: map.start.x, y: map.start.y };
      w.hdg = plot.pts.length > 1 ? bearing(plot.pts[0], plot.pts[1]) : map.start.hdg; this.wcall = null; this.placeWard();
      w.wing.forEach(function (g) { g.pos = null; });      // (each wingman starts the system on his station)
    }
    this.makeFields();
    this.applyStance(); this.applyGuns(true);
  };
  /* The battle view's scale (view units per map unit: the map streams past at rockField.flow view
     units/s at standard, slower on a slow-turning class) and every rock and mine in this system's
     fields, scattered evenly through their lobes at each field's thickness. */
  Captain.prototype.makeFields = function () {
    var m = this.m, h = m.helm, K = BL.COMMAND, F = K.rockField, map = this.map(), R = m.turret.R, enc = m.encounter() || {};
    var flow = F.flow / (1 + F.lagSlow * h.C.lag), k = this.kView = flow / Math.max(0.1, h.gOf("standard") * K.scale);
    var r = BL.rng(((m.seed ^ Math.imul(0x68e31da4, this.at + 7)) >>> 0) || 1), objs = this.fieldObjs = [];
    // Per map unit squared: one per `every` s at standard across the band (2 x spread x rx view units) she sweeps.
    function thick(every, spread, dense) { return (dense || 1) / ((every[0] + every[1]) / 2) / (2 * spread * R.rx * flow) * k * k; }
    function scatter(lobes, per, make) {
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      lobes.forEach(function (l) { x0 = Math.min(x0, l.x - l.r); x1 = Math.max(x1, l.x + l.r); y0 = Math.min(y0, l.y - l.r); y1 = Math.max(y1, l.y + l.r); });
      var n = Math.round(per * (x1 - x0) * (y1 - y0));
      for (var i = 0; i < n; i++) {
        var p = { x: x0 + r.next() * (x1 - x0), y: y0 + r.next() * (y1 - y0) };
        if (lobes.some(function (l) { return dist(l, p) < l.r; })) objs.push(make(p));
      }
    }
    map.rocks.forEach(function (o) {
      scatter(o.lobes, thick(F.every, F.spread), function (p) { return { x: p.x, y: p.y, rock: true, mj: Math.round(r.range(F.mj)), crewHit: F.crewHit, size: 0.8 + r.next() * 0.6, spin: r.next() * 6 }; });
    });
    if (map.mines) {
      var H = enc.sweep || (enc.mines && enc.mines.helm), mj = enc.sweep ? enc.sweep.mj : enc.mines ? enc.mines.gunner.mj.map(function (x) { return x * enc.mines.helm.mj; }) : [90, 90];
      if (H) scatter(map.mines.lobes, thick(H.every, H.spread, K.minefield.thick * (enc.sweep ? 1 : m.force("minefield"))), function (p) {
        return { x: p.x, y: p.y, rock: false, mj: Math.round(r.range(mj)), crewHit: H.crewHit || 1, size: 1, spin: r.next() * 6 };
      });
    }
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
    // Holding in the zone: slow up to the jump point, stopped once she's past it.
    var past = (this.pos.x - j.x) * Math.sin(hd) + (this.pos.y - j.y) * Math.cos(hd) > 0;
    var hold = past ? "stop" : "deadSlow";
    // Escort: the pilot keeps station on the carrier until she's at the jump point; then he brings
    // the gunboat into the recovery zone on its heading, as on any plot.
    if (this.escort && this.escort.s < this.escort.L) {
      var sv = this.stationView();
      return { hdg: this.hdgOrder !== null ? this.hdgOrder : sv.hdg, eng: this.engOrder || sv.eng, own: this.hdgOrder !== null || !!this.engOrder, nav: nv, holding: false, station: sv };
    }
    // MAIN GUN: the bow on the target until the crew fires (Captain.orderMain).
    var sw = this.swing && !this.holding ? this.m.helm.compass() + this.m.turret.bearingOf(this.swing.s.x, this.swing.s.y) : null;
    return { hdg: this.hdgOrder !== null ? this.hdgOrder : sw !== null ? Math.round(to360(sw)) % 360 : nv.steer, eng: this.engOrder || (this.holding ? hold : nv.eng), own: this.hdgOrder !== null || !!this.engOrder, nav: nv, holding: this.holding, main: sw !== null };
  };

  /* ------------------------------------------------------------- Escort
     A squadron screening its ward (BL.COMMAND.escort): a gunboat squadron the carrier, a destroyer
     escort squadron a convoy of merchants or a capital ship. The ward sails the plotted course;
     we keep a station on her (ahead, port, starboard or astern, `station` x the map's size off
     her), the pilot steering for it and matching her speed; the squadron's other ships (2 to 4 in
     all) hold other stations, and picking one a wingman holds swaps us with him. Enemy launchers
     send a `share` of their torpedoes at the ward: in the battle view she sits where she is from
     us, so the gun crew can shoot those down when she's close. A wingman guards his side: a
     torpedo at her from it he shoots down `wingStop` of the time (and `wingRisk` of those he
     takes a hit himself). COVER puts us in the way of a burst at her (only within `cover`
     battle-view units of her): her torpedoes hit our shields instead. Each one that reaches a
     ship of hers costs it mj x perMJ of its hull; at 0 it's lost, and with all of them the ward. */
  var WING_SIDES = ["port", "stbd", "astern", "ahead"];
  Captain.prototype.makeEscort = function () {
    var m = this.m, E = BL.COMMAND.escort, r = BL.rng((Math.imul(m.seed, 0x9e3779b1) ^ 0x51ed270b) >>> 0 || 1); r.next();
    var kind = !m.hasDrive ? "carrier" : r.chance(0.5) ? "convoy" : "capital", W = E.kinds[kind], n = r.int(W.ships), ships = [];
    // A convoy sails two abreast, `gap` x the map's size apart.
    // (a, c: rows ahead and places across, in Captain.placeWard's gaps)
    var rows = Math.ceil(n / 2);
    for (var i = 0; i < n; i++) {
      var row = Math.floor(i / 2), pair = row < rows - 1 || n % 2 === 0;
      ships.push({ hull: W.hull, hullMax: W.hull, a: (rows - 1) / 2 - row, c: pair ? i % 2 - 0.5 : 0, pos: null });
    }
    var wing = [];
    for (var k = r.int(E.squad) - 1; k > 0; k--) wing.push({ station: WING_SIDES[wing.length], hull: E.wingHull, hullMax: E.wingHull, stops: 0 });
    return { kind: kind, W: W, ships: ships, wing: wing, hull: n * W.hull, hullMax: n * W.hull, pos: null };
  };
  // Her ships' places round the course point she's at (her heading), and the hull left in all.
  // Sizes in the battle view follow our class's scale there: one of her ships is `size` x our
  // ship's length (wardLen); a convoy's rows are 1.3 lengths apart and its pair 0.6 across; a
  // station is far enough off that our shield clears her (at least `station` x the map's size).
  Captain.prototype.wardLen = function () { return this.m.turret.R.shipH * this.escort.W.size; };
  Captain.prototype.placeWard = function () {
    var w = this.escort, D = this.map().D, E = BL.COMMAND.escort, k = this.kView, L = this.wardLen(), R = this.m.turret.R;
    var ga = Math.max((w.W.gap || 0) * D, k ? L * 1.3 / k : 0), gc = Math.max((w.W.gap || 0) * D, k ? L * 0.6 / k : 0);
    var rows = Math.ceil(w.ships.length / 2), reach = L / 2 + (rows - 1) / 2 * L * 1.3;
    w.stD = Math.max((w.W.station || E.station) * D, k ? (Math.max(R.rx, R.ry) + reach + E.clear) / k : 0);
    w.ships.forEach(function (s) { s.pos = along(along(w.pos, w.hdg, s.a * ga), w.hdg + 90, s.c * gc); });
    w.hull = w.ships.reduce(function (a, s) { return a + s.hull; }, 0);
  };
  Captain.prototype.stationAt = function (id) {
    var w = this.escort; return along(w.pos, w.hdg + BL.COMMAND.escort.sides[id], w.stD || (w.W.station || BL.COMMAND.escort.station) * this.map().D);
  };
  // The wingman (still with the squadron) on a station, or null.
  Captain.prototype.wingOn = function (id) { var es = this.escort; return es && es.wing.filter(function (g) { return g.hull > 0 && g.station === id; })[0] || null; };
  // Where she is along her course (s map units from the start) and her heading there.
  Captain.prototype.wardAt = function (s) {
    var pts = this.plotFor(this.at).pts;
    for (var k = 1; k < pts.length; k++) {
      var L = dist(pts[k - 1], pts[k]);
      if (s <= L || k === pts.length - 1) { var u = L ? Math.min(1, s / L) : 1; return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * u, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * u, hdg: bearing(pts[k - 1], pts[k]) }; }
      s -= L;
    }
    return { x: pts[0].x, y: pts[0].y, hdg: 0 };
  };
  Captain.prototype.wardAlive = function () { return !!this.escort && this.escort.hull > 0 && !!this.escort.pos; };
  // A ship of hers to aim a torpedo at (one still afloat).
  Captain.prototype.wardPick = function (rng) {
    var live = []; this.escort.ships.forEach(function (s, i) { if (s.hull > 0) live.push(i); });
    return live[Math.floor(rng.next() * live.length)] || 0;
  };
  // The station: where it is, how far she is from it, and what the pilot steers and orders.
  Captain.prototype.stationView = function () {
    var E = BL.COMMAND.escort, w = this.escort, D = this.map().D, h = this.m.helm, K = BL.COMMAND;
    var st = this.stationAt(this.station), d = dist(this.pos, st), near = E.near * D;
    var moving = w.s < w.L, vw = moving ? w.v : 0;
    // Aim a few seconds ahead of the station (she's moving); close in, sail her heading.
    var aim = moving ? along(st, w.hdg, vw * E.lead) : st, hdg = d > near * 0.6 ? bearing(this.pos, aim) : w.hdg;
    // Speed: flat out to catch up from far off; near, her speed plus or minus as the station is ahead or behind.
    var ahead = (st.x - this.pos.x) * Math.sin(w.hdg * RAD) + (st.y - this.pos.y) * Math.cos(w.hdg * RAD);
    var want = d > 4 * near ? Infinity : Math.max(0, vw + clamp(ahead / near, -1, 1) * Math.max(vw, 2 * K.scale) * 0.6);
    var eng = "full", bestD = Infinity;
    if (want !== Infinity) ["stop", "deadSlow", "cruise", "standard", "full"].forEach(function (id) { var dd = Math.abs(h.gOf(id) * K.scale - want); if (dd < bestD) { bestD = dd; eng = id; } });
    return { pos: st, d: d, on: d <= near, hdg: Math.round(to360(hdg)) % 360, eng: eng };
  };
  // A new station; the wingman holding it (if any) swaps to ours.
  Captain.prototype.setStation = function (id) {
    if (!BL.COMMAND.escort.sides.hasOwnProperty(id) || id === this.station) return;
    var g = this.wingOn(id); if (g) g.station = this.station;
    this.station = id; this.m.cue("tick");
  };
  // A map point in the battle view (view units from us, the view's up = our heading).
  Captain.prototype.toView = function (p, hdg) {
    var R = this.m.turret.R, k = this.kView, b = (bearing(this.pos, p) - this.m.helm.compass()) * RAD, d = dist(this.pos, p) * k;
    return { x: R.cx + Math.sin(b) * d, y: R.cy - Math.cos(b) * d, d: d, rot: norm((hdg || 0) - this.m.helm.compass()) };
  };
  // Where she is in the battle view: ship i of hers (her middle if none).
  Captain.prototype.wardView = function (i) {
    var w = this.escort, s = i === undefined ? null : w.ships[i];
    return this.toView(s && s.pos ? s.pos : w.pos, w.hdg);
  };
  // Where wingman i is (on his station) in the battle view.
  Captain.prototype.wingView = function (i) { var g = this.escort.wing[i]; return g ? this.toView(g.pos || this.stationAt(g.station), g.pos ? g.hdg : this.escort.hdg) : null; };
  // She sails her course like a ship: steering for a point `wardLead` x the map's size ahead of
  // where the course has got to (w.s), turning on a circle of `wardRadius` x the map's size, faster
  // to catch up when she's behind it and slowing to a stop at its end. Corners are curves.
  Captain.prototype.moveWard = function (dt) {
    var E = BL.COMMAND.escort, w = this.escort, D = this.map().D, carrot = this.wardAt(Math.min(w.L, w.s + E.wardLead * D)), d = dist(w.pos, carrot);
    var rate = Math.min(45, w.v / (E.wardRadius * D) / RAD) * dt;      // degrees this tick
    if (d > 1e-6) w.hdg = to360(w.hdg + clamp(norm(bearing(w.pos, carrot) - w.hdg), -rate, rate));
    var spd = w.v * clamp(d / (E.wardLead * D), 0, 1.3);
    w.pos = along(w.pos, w.hdg, spd * dt);
  };
  // The wingmen fly to their stations (at our full speed, turning `wingTurn` degrees a second),
  // so one moved by a swap crosses over, and the enemy round him comes along.
  Captain.prototype.moveWing = function (dt) {
    var E = BL.COMMAND.escort, w = this.escort, vmax = this.m.helm.gOf("full") * BL.COMMAND.scale, near = E.near * this.map().D, self = this;
    w.wing.forEach(function (g) {
      var st = self.stationAt(g.station);
      if (!g.pos) { g.pos = { x: st.x, y: st.y }; g.hdg = w.hdg; return; }
      if (g.hull <= 0) return;
      var d = dist(g.pos, st), want = d > near ? bearing(g.pos, st) : w.hdg;
      g.hdg = to360(g.hdg + clamp(norm(want - g.hdg), -E.wingTurn * dt, E.wingTurn * dt));
      // Full ahead while he's off station (along his heading, so he swings round to it); on it, he holds it.
      if (d > near) g.pos = along(g.pos, g.hdg, Math.min(d, vmax * dt * Math.max(0.2, Math.cos(norm(want - g.hdg) * RAD))));
      else g.pos = along(g.pos, bearing(g.pos, st), Math.min(d, vmax * dt));
    });
  };
  // A torpedo launched at her (ring.js): a call for COVER, open until they land.
  Captain.prototype.wardLaunched = function (e, s) {
    var m = this.m;
    this.wingGuard(e, s);
    if (this.wcall && m.t - this.wcall.at < BL.HELM.evade.burst && !this.wcall.done) { this.wcall.fish.push(e); return; }
    this.wcall = { at: m.t, fish: [e], ship: s, done: false };
    this.stats.wardCalls++;
  };
  // A wingman on the side it comes from (seen from her, on her heading) may shoot it down on its way
  // (ring.js downs it at e.wingStop.at).
  Captain.prototype.wingGuard = function (e, s) {
    var E = BL.COMMAND.escort, m = this.m, wv = this.wardView(e.wardShip);
    var rel = norm(Math.atan2(s.x - wv.x, -(s.y - wv.y)) / RAD - wv.rot), side = Math.abs(rel) <= 45 ? "ahead" : Math.abs(rel) >= 135 ? "astern" : rel > 0 ? "stbd" : "port";
    var g = this.wingOn(side);
    this.rng = this.rng || BL.rng((m.seed ^ 0x3c6ef372) >>> 0);
    if (!g || !this.rng.chance(E.wingStop)) return;
    e.wingStop = { at: m.t + (e.at - m.t) * this.rng.range([0.35, 0.7]), w: this.escort.wing.indexOf(g) };
  };
  // A wingman shot one down (ring.js); now and then he takes a hit doing it, and with his hull gone he's lost.
  Captain.prototype.wingStopped = function (e) {
    var E = BL.COMMAND.escort, g = this.escort.wing[e.wingStop.w];
    this.stats.wingStops++; g.stops++;
    if (e.wing === undefined && this.rng.chance(E.wingRisk)) this.wingDamage(e.wingStop.w, e.mj * E.wingPerMJ);
  };
  /* Who an arriving enemy group goes after (ring.js addGroup): the ward `aimWard` of the time, else
     one of the squadron's ships still in it, us included, alike. "ward", a wingman's index, or null (us). */
  Captain.prototype.pickAim = function (rng) {
    var es = this.escort;
    if (this.wardAlive() && rng.chance(BL.COMMAND.escort.aimWard)) return "ward";
    var who = [null]; es.wing.forEach(function (g, i) { if (g.hull > 0) who.push(i); });
    return who[Math.floor(rng.next() * who.length)];
  };
  // Where a group's target is in the battle view: the ward's middle, or the wingman.
  Captain.prototype.aimView = function (aim) { return aim === "ward" ? this.wardView() : this.wingView(aim); };
  // A torpedo at a wingman: his own gun shoots it down `wingSelf` of the time (ring.js, as for a guard).
  Captain.prototype.wingLaunched = function (e) {
    var m = this.m; this.rng = this.rng || BL.rng((m.seed ^ 0x3c6ef372) >>> 0);
    if (this.rng.chance(BL.COMMAND.escort.wingSelf)) e.wingStop = { at: m.t + (e.at - m.t) * this.rng.range([0.35, 0.7]), w: e.wing };
  };
  Captain.prototype.wingHit = function (e) { e.outcome = "wing"; this.wingDamage(e.wing, e.mj * BL.COMMAND.escort.wingPerMJ); };
  // Enemy gunfire at the group's target: the ward (one of her ships) or a wingman.
  Captain.prototype.gunAt = function (aim, mj) {
    var E = BL.COMMAND.escort, es = this.escort;
    if (aim === "ward") { if (!this.wardAlive()) return; this.rng = this.rng || BL.rng((this.m.seed ^ 0x3c6ef372) >>> 0); this.wardHit({ mj: mj * E.gunWard, wardShip: this.wardPick(this.rng) }); }
    else this.wingDamage(aim, mj * E.gunWing * E.wingPerMJ);
  };
  // A wingman's hull; at 0 he's lost, and the groups after him turn on the ward.
  Captain.prototype.wingDamage = function (i, d) {
    var g = this.escort.wing[i], m = this.m;
    if (!g || g.hull <= 0) return;
    g.hull = Math.max(0, g.hull - d);
    if (g.hull > 0) return;
    m.cue("hullHit");
    m.waves.forEach(function (w) { if (w.aim === i) { w.aim = "ward"; (w.ships || []).forEach(function (s) { s.aim = "ward"; }); } });
  };
  Captain.prototype.wardCallView = function () {
    var m = this.m, c = this.wcall;
    if (!c || c.done || !this.wardAlive()) return null;
    var live = c.fish.filter(function (f) { return !f.done && f.ward && f.at > m.t; });
    if (!live.length) { c.done = true; return null; }
    var land = Math.min.apply(null, live.map(function (f) { return f.at; })), self = this;
    return { n: live.length, in: land - m.t, mj: live.reduce(function (a, f) { return a + f.mj; }, 0), canCover: live.some(function (f) { return self.wardView(f.wardShip).d <= BL.COMMAND.escort.cover; }) };
  };
  // COVER: the burst at her turns on us (the gunboat swings into its way); our shields take it.
  Captain.prototype.cover = function () {
    var m = this.m, tu = m.turret, cv = this.wardCallView(), self = this;
    if (!cv || !cv.canCover) return false;
    this.wcall.done = true; this.stats.covers++;
    this.wcall.fish.forEach(function (e) {
      if (e.done || !e.ward || !e.torp) return;
      var tp = e.torp, b = norm(Math.atan2(tp.x - tu.R.cx, -(tp.y - tu.R.cy)) / RAD), p = tu.rim(b);
      e.ward = false; e.covered = true; self.stats.covered++;
      tp.x0 = tp.x; tp.y0 = tp.y; tp.t0 = m.t; tp.x1 = p.x; tp.y1 = p.y; tp.hitB = b;
      m.helm.landBy(e, m.t + BL.COMMAND.escort.coverTime);
    });
    m.cue("tick");
    return true;
  };
  // A torpedo reached her.
  Captain.prototype.wardHit = function (e) {
    var m = this.m, w = this.escort, s = w.ships[e.wardShip || 0];
    if (!this.wardAlive() || !s || s.hull <= 0) return;
    s.hull = Math.max(0, s.hull - e.mj * w.W.perMJ);
    w.hull = w.ships.reduce(function (a, q) { return a + q.hull; }, 0);
    if (e.type) { e.outcome = "ward"; this.stats.wardTorps++; }
    if (e.type) m.cue("shieldHit");
    if (w.hull <= 0 && m.phase !== "done") m.finish("wardLost");
  };

  /* ------------------------------------------------------------- Orders */
  Captain.prototype.orderCourse = function (hdg) {
    this.hdgOrder = Math.round(to360(hdg)) % 360; this.swing = null;
    this.m.cue("tick");
  };
  Captain.prototype.orderEngines = function (id) { if (!this.m.helm.preset(id)) return; this.engOrder = id; this.m.cue("tick"); };
  // Back to the plot: the navigation computer steers for the next waypoint.
  Captain.prototype.resumePlot = function () { this.hdgOrder = null; this.engOrder = null; this.swing = null; this.m.cue("tick"); };
  /* MAIN GUN (light cruiser and up): with the gun charged, the pilot swings the bow onto the
     biggest ship out there and holds it on her until the crew fires (ring.js crewWeapons), then
     she comes back to the plot. The crew holds the main gun's fire until the captain orders it. */
  Captain.prototype.mainView = function () {
    var m = this.m, mg = m.sys("main"), tu = m.turret;
    if (!mg) return null;
    var ready = !mg.tripped && mg.mj >= mg.maxMJ - 0.5, tg = ready ? tu.bigTarget() : null;
    return { ready: ready, pct: Math.floor(mg.mj / mg.maxMJ * 100), target: tg, swinging: !!this.swing, can: ready && !!tg && !this.swing && !this.holding && !this.jumpOrdered };
  };
  Captain.prototype.orderMain = function () {
    var v = this.mainView();
    if (!v || !v.can) return false;
    this.swing = { s: v.target, until: this.m.t + BL.COMMAND.mainSwing.timeout, shots: this.m.stats.mainShots }; this.hdgOrder = null;
    this.m.cue("tick");
    return true;
  };
  // The swing ends once the gun has fired (or lost most of its charge), nothing is left to swing
  // onto (a target that's gone gives way to the next biggest), or it has taken too long.
  Captain.prototype.runSwing = function () {
    var sw = this.swing, m = this.m, mg = m.sys("main");
    if (!sw) return;
    if (sw.s.dead || sw.s.state === "leave" || m.turret.ships.indexOf(sw.s) < 0) sw.s = m.turret.bigTarget();
    if (!sw.s || !mg || m.stats.mainShots > sw.shots || mg.mj < mg.maxMJ * 0.8 || m.t >= sw.until || this.holding) this.swing = null;
  };
  /* LAUNCH / RECOVER (cruiser and up): the captain alone launches and recovers the gunboat
     squadron. The engineer keeps the hangar capacitor charging (the launchers while it's aboard,
     the arresters while it's out); once it's full the order goes at once (Mission.runCalls). The
     ship won't jump with the squadron out (unless her hull is nearly gone). */
  Captain.prototype.hangarView = function () {
    var m = this.m, hs = m.sys("hangar");
    if (!hs || !m.data.hangar) return null;
    var sq = m.squadron, full = hs.mj >= hs.maxMJ - 0.5;
    var can = !hs.call && full && (sq === "aboard" || sq === "out") && (m.phase === "engage" || m.phase === "countdown" && sq === "out");
    return { squadron: sq, pending: !!hs.call, call: hs.call ? hs.call.type : null, can: can, full: full, pct: Math.floor(hs.mj / hs.maxMJ * 100),
      order: sq === "out" ? "recover" : "launch" };
  };
  Captain.prototype.orderHangar = function () {
    var v = this.hangarView(), m = this.m;
    if (!v || !v.can) return false;
    m.sys("hangar").call = { until: m.t + 1, type: v.order };
    m.cue("tick");
    return true;
  };
  Captain.prototype.setStance = function (id) { if (!BL.COMMAND.stances[id]) return; this.stance = id; this.applyStance(); this.m.cue("tick"); };
  // The engineer's stance is his priority order: shields first, guns first, the drive first (after
  // life support; the AI engineer then charges it to be full by the window (its last percent flat out), not just with what's left:
  // AIEngineer.think), or as the ship comes.
  Captain.prototype.applyStance = function () {
    var m = this.m, base = this.basePriority.slice(), guns = base.filter(function (id) { var s = m.sys(id); return s && s.kind === "gun"; });
    m.driveFirst = this.stance === "drive" && !!m.sys("drive");
    m.mainFirst = this.stance === "main" && !!m.sys("main");       // (main gun first: after life support, charged flat out: AIEngineer.think)
    m.busterFirst = this.stance === "moab" && !!m.sys("buster");   // (MOAB: the planet buster likewise)
    var first = this.stance === "shields" ? ["shield"] : this.stance === "guns" ? guns : m.driveFirst ? ["life", "drive"] : m.mainFirst ? ["life", "main"] : m.busterFirst ? ["life", "buster"] : [];
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
  // No call from the captain and the burst about to land (BL.HELM.evade.lateMin s): the pilot
  // sometimes (BL.COMMAND.pilotOwn) breaks on his own if the shields can't take it, away from
  // asteroid fields; else it's taken.
  Captain.prototype.pilotCall = function () {
    var m = this.m, E = BL.HELM.evade, cv = this.callView();
    if (!cv || cv.in > E.lateMin || !cv.canBreak || m.sys("shield").mj >= cv.mj * E.cover) return;
    this.rng = this.rng || BL.rng((m.seed ^ 0x3c6ef372) >>> 0);
    if (this.call.own === undefined) this.call.own = this.rng.chance(BL.COMMAND.pilotOwn);
    if (!this.call.own) return;
    this.call.done = true; this.stats.pilotBreaks++;
    m.helm.orderBreak(this.openFish(), this.call.ship, this.awayFromRocks(cv.bearing < 0 ? 1 : -1), true);
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
    // (a dreadnought's final jump also waits for the planet buster: Mission.runJump)
    var bu = m.sys("buster");
    if (!drive && bu && m.jumpIndex === m.cfg.jumps - 1 && !m.busterFull()) drive = "Buster " + Math.floor(bu.mj / bu.maxMJ * 100) + "%";
    var steer = "Steer " + BL.hdgText(this.info.jumpHdg);
    // (the squadron must be aboard first, unless her hull is down to the point of leaving it: Mission.runJump)
    var out = m.squadron === "out" && m.ship.hull > m.ship.hullMax * 0.2 ? "Recover gunboats" : null;
    var why = drive || out || (m.t < m.windowAt() ? "Window in " + Math.ceil(m.windowAt() - m.t) + "s" : !this.inZone() ? "Outside the zone" : !h.inJumpCorridor() ? steer : null);
    var wait = !this.jumpOrdered ? null : drive || (out && out.toUpperCase()) || (!this.inZone(BL.COMMAND.zoneHold) ? "BACK TO THE ZONE" : !h.inJumpCorridor() ? steer.toUpperCase() : null);
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
      // (a waypoint on a checkpoint: she turns only once she's well inside it)
      var cpw = map.checkpoints.filter(function (c) { return dist(c, b) < c.r * 0.5; })[0];
      if (dist(this.pos, b) > (cpw ? cpw.r * 0.4 : K.capture * map.D) && n.u < 0.999) break;
      this.leg++;
    }
    // Checkpoints flown through.
    var cur = this.cur, pos = this.pos;
    map.checkpoints.forEach(function (c, i) { if (!cur.cps[i] && dist(pos, c) < c.r) { cur.cps[i] = true; m.cue("tick"); } });
    var zone = this.inZone();
    if (zone && this.cur.zoneAt === null) this.cur.zoneAt = m.t;
    // In the zone on the last leg, the pilot holds her there (slow, then stopped) for the jump.
    this.holding = zone && (this.leg >= pts.length - 2 || this.jumpOrdered);
    // Escort: the carrier sails on; time on station counts while the fight is on.
    if (this.escort && this.escort.pos) {
      var w = this.escort; w.s = Math.min(w.L, w.s + w.v * dt);
      this.moveWard(dt); this.placeWard(); this.moveWing(dt);
      if (m.phase === "engage" || m.phase === "countdown") { this.cur.stationT += dt; if (this.stationView().on) this.cur.onStation += dt; }
    }
    // Asteroids: inside a field the rocks stream through the battle view (RingTurret.dropRock).
    this.inRock = BL.inField(map, this.pos); this.inMines = BL.inMines(map, this.pos);
    this.runSwing();
    if (m.phase !== "done") this.pilot.think(m, this);
  };
  // A rock touched the shield (ring.js; it lands like a mine, shields first).
  Captain.prototype.rockStruck = function () { this.stats.rockHits++; if (this.cur) this.cur.rockHits++; };

  /* ------------------------------------------------------------- The NPC pilot
     Flies what the captain wants (Captain.helmView) on autopilot, with the engines it says, and
     breaks hard when the captain orders a break, then comes back to the course. His standing
     order is to take torpedoes on the shields; only when the captain makes no call and the
     shields can't take the burst does he sometimes break on his own at the last moment (Captain.pilotCall). */
  function CaptainPilot() { this.breaking = false; this.dodge = null; }
  BL.CaptainPilot = CaptainPilot;
  // In an asteroid field: the nearest rock on a collision course within BL.COMMAND.rockField.look s,
  // he swings `dodge` degrees away from its side and holds that until it's abeam. Degrees off the course.
  CaptainPilot.prototype.rockDodge = function (m) {
    var tu = m.turret, R = tu.R, F = BL.COMMAND.rockField, d = this.dodge;
    if (d && (d.tp.ev.done || d.tp.y > R.cy)) d = this.dodge = null;
    if (!d) {
      var near = null;
      tu.torps.forEach(function (tp) { if (tp.anchored && !tp.pass && !tp.ev.done && tp.t1 - m.t < F.look && (!near || tp.t1 < near.t1)) near = tp; });
      if (near) d = this.dodge = { tp: near, side: near.x < R.cx ? 1 : -1 };
    }
    return d ? d.side * F.dodge : 0;
  };
  CaptainPilot.prototype.think = function (m, c) {
    var h = m.helm;
    if (h.inTube && m.t >= 1) h.launch(c.helmView().eng);   // a gunboat: out of the carrier's tube at once, at the course's speed
    if (h.locked()) return;
    c.pilotCall();
    var ev = h.evadeView();
    if (ev && ev.left > 0) { h.setWheel(ev.off >= BL.HELM.dodge.turn * 1.4 ? 0 : ev.dir * Math.min(1, h.C.safe / h.topTurn() * 0.98)); this.breaking = true; return; }
    this.breaking = false;
    var hv = c.helmView(), hdg = to360(hv.hdg + this.rockDodge(m)) % 360;
    if (!h.auto || Math.abs(norm(h.autoHdg - hdg)) > 0.5) h.setAuto(true, hdg);
    if (h.port.ord !== hv.eng || h.stbd.ord !== hv.eng) h.setOrder("both", hv.eng);
  };

  /* ---------------------------------------------------------------- Score
     Four parts of 25: objective and ship condition as everywhere; navigation (in the jump zone by
     the window, no asteroid hits); command (how the crew did under him: the shields and guns
     against the torpedoes, the breaks he ordered made). */
  BL.scoreCaptain = function (m, outcome) {
    var r = BL.score(m, outcome), c = m.captain, st = c.stats, K = BL.COMMAND, tu = m.turret;
    var sys = st.systems.filter(Boolean), nav = 0;
    // (escort: navigation is the share of the fight spent on station)
    // (a scouting run: half the zone, half the share of its checkpoints flown through)
    sys.forEach(function (s) {
      var z = c.escort ? (s.stationT ? s.onStation / s.stationT : 0) : s.zoneAt !== null && s.zoneAt <= s.window + K.zoneGrace ? 1 : s.zoneAt !== null ? 0.5 : 0;
      if (s.cps && s.cps.length) z = 0.5 * z + 0.5 * s.cps.filter(Boolean).length / s.cps.length;
      nav += z * Math.max(0, 1 - 0.25 * s.rockHits);
    });
    nav = sys.length ? nav / sys.length : 0;
    // Escort: the objective is her: brought home, worth her hull left (a convoy: the merchants that get through).
    var es = c.escort, afloat = es ? es.ships.filter(function (s) { return s.hull > 0; }).length : 0;
    if (es) r.parts.objective = outcome === "wardLost" ? 0 : Math.round(r.parts.objective * (es.kind === "convoy" ? afloat / es.ships.length : es.hull / es.hullMax));
    var hs = m.helm.stats, stopped = m.stats.salvos ? (m.stats.salvosShielded + (tu.stats.downed || 0)) / (m.stats.salvos + (tu.stats.downed || 0)) : 1;
    var made = st.breaks + st.pilotBreaks ? hs.evasiveMet / (st.breaks + st.pilotBreaks) : 1;
    var command = clamp(0.6 * stopped + 0.4 * made, 0, 1);
    r.station = "captain";
    r.parts = { objective: r.parts.objective, condition: r.parts.condition, navigation: Math.round(25 * nav), command: Math.round(25 * command) };
    r.raw = r.parts.objective + r.parts.condition + r.parts.navigation + r.parts.command;
    r.score = Math.round(r.raw * Math.pow(1 - m.cfg.lookCostPct / 100, r.looks));
    r.captain = { rockHits: st.rockHits, calls: st.calls, breaks: st.breaks, pilotBreaks: st.pilotBreaks, breaksMade: hs.evasiveMet, taken: st.taken, unanswered: st.unanswered,
      systems: sys.map(function (s) { return { zoneAt: s.zoneAt === null ? null : Math.round(s.zoneAt), window: s.window, rockHits: s.rockHits, legs: s.legs, cps: s.cps.length, cpsHit: s.cps.filter(Boolean).length }; }),
      ships: tu.stats.ships, kills: tu.stats.kills, downed: tu.stats.downed,
      rocks: tu.stats.rocks || 0, rocksDown: tu.stats.rocksDown || 0, rockEnemy: tu.stats.rockEnemy || 0 };
    if (c.escort) {
      r.captain.escort = { kind: es.kind, name: es.W.name, hull: Math.round(100 * es.hull / es.hullMax), ships: es.ships.length, afloat: afloat, torps: st.wardTorps, calls: st.wardCalls, covers: st.covers, covered: st.covered,
        squad: es.wing.length + 1, wingLost: es.wing.filter(function (g) { return g.hull <= 0; }).length, wingStops: st.wingStops,
        onStation: sys.map(function (s) { return s.stationT ? Math.round(100 * s.onStation / s.stationT) : 0; }) };
    }
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
    // Escort: cover a burst at the carrier when our shields can take it.
    var wv = c.wardCallView();
    var sh = m.sys("shield"), ours = c.openFish().reduce(function (a, f) { return a + f.mj; }, 0);
    if (wv && wv.canCover && wv.in < BL.GUNNERY.torpedo.travel && sh.mj >= (wv.mj + ours) * E.cover && sh.mj >= sh.maxMJ * 0.5) c.cover();
    // Gunboats: launch as soon as the launchers are full; recover botRecover s before the window.
    var hv2 = c.hangarView();
    if (hv2 && hv2.can && (hv2.order === "launch" ? m.t < m.windowAt() - BL.COMMAND.hangarOrder.botRecover - 20 : m.t >= m.windowAt() - BL.COMMAND.hangarOrder.botRecover)) c.orderHangar();
    // Main gun: swing onto the big target once it's charged, if it's within botSwing degrees of the bow (a short swing), away from the jump zone.
    if (!this.noMain && !c.inZone() && !c.callView()) {
      var mv = c.mainView();
      if (mv && mv.can && Math.abs(norm(m.turret.bearingOf(mv.target.x, mv.target.y))) <= BL.COMMAND.mainSwing.botSwing) c.orderMain();
    }
    if (c.jumpView().ready && !c.jumpOrdered) c.orderJump();
  };
  BL.runCaptainHeadless = function (seed, classId, tl, idle, extra) {
    classId = classId || "destroyer";
    var rc = BL.GUNNERY.ring.classes[classId];
    var m = new BL.Mission(Object.assign({ seed: seed, quiet: true, classId: classId, tl: tl, helm: true, captain: true,
      gunner: { weapons: BL.GUNNERY.loadout[classId], ring: true, arcs: rc.arcs, arcNames: rc.arcNames, helm: true } }, extra));
    var eng = new BL.AIEngineer(0.5, 0.25, m.turret.engineer.skill), bot = new CaptainBot();
    if (extra && extra.noMain) bot.noMain = true;      // (tests: the main gun on standing orders only)
    if (extra && extra.stance) m.captain.stance = extra.stance;     // (tests: a standing stance other than balanced)
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
