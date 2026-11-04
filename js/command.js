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
  BL.navBearing = bearing; BL.alongMap = along;
  // A fixed siege line's fire at point p (BL.COMMAND.siegeLine): 1 within `full` of it, easing
  // off smoothly to 0 at `none`; 1 on a map with no siege line.
  BL.siegeFire = function (map, p) {
    var S = BL.COMMAND.siegeLine, s = map && map.siege;
    if (!s) return 1;
    var t = clamp((dist(p, s) / map.D - S.full) / (S.none - S.full), 0, 1);
    return 1 - t * t * (3 - 2 * t);
  };
  // Whether the bridge knows of a siege line here (what the plot, the navigator and the battle
  // view show): the pickets' report until the first wave shows it (known, Mission.spawnWave).
  // Its guns fire only if it's real (Captain.siegeOn).
  BL.siegeSeen = function (map) { var s = map && map.siege; return !!s && (s.known ? s.real : s.rep); };

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
    var map = { D: D, start: start, jump: { x: jump.x, y: jump.y, r: K.zone * D }, jumpHdg: jh, approach: app, rocks: [], clusters: [], window: opts.window, recovery: opts.hasDrive === false, drop: !!opts.drop };     // (recovery: a gunboat's carrier pickup)
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
    // A fixed siege line (opts.siege, BL.COMMAND.siegeLine): near the straight way, across it, or
    // anywhere; clear of the start and the jump zone. Every area keeps clear of it.
    if (opts.siege) {
      var SL = K.siegeLine, roll = r.next(), hb0 = bearing(start, app), sp = null, kind = roll < SL.place.near ? "near" : roll < SL.place.near + SL.place.across ? "across" : "any";
      for (var ts = 0; ts < 40 && !sp; ts++) {
        var c0 = kind === "near" ? along(along(start, jb, r.range(SL.along) * D), jb + 90, r.range(SL.off) * D * (r.chance(0.5) ? 1 : -1))
          : kind === "across" ? along(along(start, hb0, r.range(SL.along) * dist(start, app)), hb0 + 90, r.range([-SL.acrossOff, SL.acrossOff]) * D)
          : along(along(start, jb, r.range(K.along) * D), jb + 90, r.range([-SL.anyOff, SL.anyOff]) * D);
        if (dist(c0, start) > (SL.full + K.zone) * D && dist(c0, jump) > (SL.full + K.zone * 1.5) * D) sp = c0;
      }
      if (sp) map.siege = { x: sp.x, y: sp.y, r: SL.r * D, kind: kind, lobes: [{ x: sp.x, y: sp.y, r: SL.r * D }] };
    }
    // Room for an area: every lobe clear of the start, the jump zone and its approach lane, and a
    // lane (K.lane margins) from every lobe already placed, so there's always a way between them.
    var lobesNow = function () { return [].concat.apply([], map.rocks.concat(map.clusters, map.mines ? [map.mines] : [], map.siege ? [map.siege] : []).map(function (o) { return o.lobes; })); };
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
  // (the navigator's plot also keeps navR off a siege line, unless that ring holds the start,
  // the jump zone or its approach lane: siege)
  function obstacles(map, siege) {
    var K = BL.COMMAND, m = K.margin * map.D, out = rockLobes(map).concat(enemyLobes(map)).map(function (o) { return { x: o.x, y: o.y, r: o.r + m }; });
    var s = BL.siegeSeen(map) && map.siege, R = s && K.siegeLine.navR * map.D;
    if (siege && s && dist(s, map.start) > R * 1.1 && dist(s, map.jump) > R + map.jump.r && segNear(map.approach, map.jump, s).d > R * 1.05) out.push({ x: s.x, y: s.y, r: R });
    return out;
  }
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
    var offJump = !map.drop && (lastHdg === null || Math.abs(norm(lastHdg - map.jumpHdg)) > K.jumpTol);     // (the drop has no heading)
    // A scouting run: the checkpoints no leg passes through (a warning; each missed costs navigation).
    var cpMiss = (map.checkpoints || []).filter(function (c) {
      for (var j = 0; j < pts.length - 1; j++) if (segNear(pts[j], pts[j + 1], c).d < c.r) return false;
      return true;
    }).map(function (c) { return c.n; });
    // A siege line: the most of its fire the course passes under (BL.siegeFire at its closest point).
    var siegeFire = 0;
    if (BL.siegeSeen(map)) for (var q2 = 0; q2 < pts.length - 1; q2++) siegeFire = Math.max(siegeFire, BL.siegeFire(map, segNear(pts[q2], pts[q2 + 1], map.siege).p));
    return { legs: legs, eta: eta, zoneEta: zoneEta, late: late, rocks: rocks, clusters: clusters, mines: mines, sharp: sharp, count: n, offJump: offJump, lastHdg: lastHdg, cpMiss: cpMiss, siegeFire: siegeFire,
      minLegs: LG[0], maxLegs: LG[1], ok: n >= LG[0] && n <= LG[1] && !late && !clusters && !offJump, jumpHdg: map.jumpHdg };     // (through asteroids is allowed, with a warning)
  };
  // The navigator's plot: the shortest way round every obstacle (corners of an octagon drawn
  // round each one, so a leg between them stays clear) through each checkpoint in turn to the
  // approach point, then in along the jump heading; 1 to 8 legs (and one more per checkpoint),
  // engines set to arrive in time.
  BL.navPlot = function (map, gOf, lc, noSiege) {
    var K = BL.COMMAND, LG = map.legs || K.legs, obs = obstacles(map, !noSiege), start = { x: map.start.x, y: map.start.y }, goal = { x: map.approach.x, y: map.approach.y }, jp = { x: map.jump.x, y: map.jump.y };
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
    if (pts.length - 1 > LG[1] && lc < 0.6) return BL.navPlot(map, gOf, lc * 2.5, noSiege);
    pts = pts.map(function (p) { return { x: p.x, y: p.y }; });
    var plot = { pts: pts, eng: pts.slice(1).map(function () { return "cruise"; }) };
    // Late at cruise: standard from the first leg on, then full, until it fits (on a scouting run
    // with `slack` s to spare for each checkpoint's turns).
    var slack = (map.checkpoints || []).length * K.checkpoints.slack;
    function late() { var inf = BL.plotInfo(map, plot, gOf); return inf.late || inf.zoneEta > map.window - K.early - slack; }
    ["standard", "full"].forEach(function (eng) {
      for (var k = 0; k < plot.eng.length && late(); k++) plot.eng[k] = eng;
    });
    if (BL.siegeSeen(map) && !noSiege && late()) return BL.navPlot(map, gOf, undefined, true);     // (no time to keep clear of a siege line: past it)
    return plot;
  };

  /* ------------------------------------------------------------- The captain */
  function Captain(m) {
    this.m = m;
    var h = m.helm, self = this;
    this.who = "Captain";
    // (a siege line goes on the map if it's real or the pickets report one: real, rep, BL.siegeSeen)
    this.maps = m.route.map(function (id, i) {
      var enc = BL.ENCOUNTERS[id] || {}, rep = m.reported(i), map;
      map = BL.makeNavMap(m.seed, i, { window: m.windowFor(i), cruiseG: h.gOf("cruise"), hasDrive: m.hasDrive, drop: !!m.sys("buster") && i === m.route.length - 1, mines: enc.sweep ? "sweep" : enc.mines ? "minefield" : null,
        checkpoints: BL.COMMAND.checkpoints.classes.indexOf(m.data.classId) >= 0,
        siege: (id === "siege" || rep === "siege") && !m.escort && !m.flag });
      if (m.flag) map.clusters = [];     // (a squadron's enemies are its map's targets: Captain.makeTargets)
      if (map.siege) { map.siege.real = id === "siege"; map.siege.rep = rep === "siege"; }
      return map;
    });
    this.plots = [];
    this.stance = BL.COMMAND.standing.stance; this.guns = BL.COMMAND.standing.guns; this.breaks = BL.COMMAND.standing.pilot;
    // (stance, guns: what he ordered; stanceOn, gunsOn: what the crew are doing, BL.COMMAND.orderLag s later)
    this.stanceOn = this.stance; this.gunsOn = this.guns; this.breaksOn = this.breaks; this.lag = {};
    this.basePriority = m.priority.slice();
    this.stats = { rockHits: 0, calls: 0, breaks: 0, pilotBreaks: 0, breaksMade: 0, taken: 0, unanswered: 0, systems: [],
      wardTorps: 0, wardCalls: 0, covers: 0, covered: 0, wingStops: 0, swarms: 0, attacks: 0, guards: 0, sqKills: 0, flagBridge: false, targetsDown: 0, objectivesDown: 0 };
    this.pilot = new CaptainPilot();
    this.pilotCrew = (m.crewSet && m.crewSet.pilot) || BL.pickPilot(m.seed, m.data.classId);     // (his name and skill: how fast he takes an order)
    // Escort (BL.COMMAND.escort): the ward's hull carries over from system to system.
    // A squadron (m.flag, BL.COMMAND.squad) works the same way with no ward: the flagship is its middle.
    this.escort = m.escort ? this.makeEscort() : m.flag ? this.makeSquad() : null;
    this.station = "ahead"; this.wcall = null;
    // Dropping down: where he is off the bridge (null, "engine", "helm", "gun"), whether he has
    // been this mission, and the men he took a station from.
    this.away = null; this.dropped = false; this.replacedMen = []; this.aside = null;
  }
  BL.Captain = Captain;
  // The system she's in (set on arrival: after a jump the display still shows the last one until the next arrival).
  Captain.prototype.map = function () { return this.maps[this.at === undefined ? this.m.jumpIndex : this.at]; };
  Captain.prototype.gOf = function (id) { return this.m.helm.gOf(id); };
  // A fixed siege line in this system (BL.COMMAND.siegeLine): there is one; its fire at her now
  // (BL.siegeFire); its bearing from her bow, as the battle view shows it.
  Captain.prototype.siegeOn = function () { return !!this.pos && !!this.map().siege && this.map().siege.real; };
  Captain.prototype.siegeK = function () { return this.siegeOn() ? BL.siegeFire(this.map(), this.pos) * (BL.COMMAND.siegeLine.punch[this.m.data.classId] || 1) : 1; };
  Captain.prototype.siegeBearing = function () { return norm(bearing(this.pos, this.map().siege) - this.m.helm.compass()); };
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
    this.inRock = false; this.inMines = false; this.inCluster = -1; this.swarm = []; this.zoneAt = null; this.holding = false; this.call = null; this.drRate = null; this.drLast = null; this.swing = null;
    this.cur = { rockHits: 0, zoneAt: null, window: m.windowAt(), legs: info.count, onStation: 0, stationT: 0, cps: map.checkpoints.map(function () { return false; }) };
    this.stats.systems[m.jumpIndex] = this.cur;
    // Escort: the carrier sails the plotted course (the navigator's) from the start, reaching the
    // jump point at BL.COMMAND.escort.arrive of the time to the window.
    if (this.escort && !this.escort.flag) {
      var L = 0; for (var k = 1; k < plot.pts.length; k++) L += dist(plot.pts[k - 1], plot.pts[k]);
      var w = this.escort; w.L = L; w.s = 0; w.v = L / Math.max(10, m.windowAt() * BL.COMMAND.escort.arrive); w.pos = { x: map.start.x, y: map.start.y };
      w.hdg = plot.pts.length > 1 ? bearing(plot.pts[0], plot.pts[1]) : map.start.hdg; this.wcall = null; this.placeWard();
      w.wing.forEach(function (g) { g.pos = null; });      // (each wingman starts the system on his station)
    }
    this.makeFields();
    if (this.escort && this.escort.flag) this.resetSquad();
    this.applyStance(); this.applyGuns();
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
    // (the drop: the MOAB instead of the drive)
    if (m.isDrop()) {
      var bu = m.sys("buster"), bt = bu.mj >= bu.maxMJ - 0.5 ? 0 : this.buRate > 0.05 ? (bu.maxMJ - bu.mj) / this.buRate : null;
      return { at: bt === null ? null : Math.max(win, bt), by: bt === null || bt > win ? "moab" : "window", win: win, drive: bt };
    }
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
    // Escort: the pilot keeps station on the ward until she's at the jump point; then he brings
    // the destroyer escort into the warp zone on its heading, as on any plot. A gunboat keeps
    // station on the carrier to the end: she recovers it only from ASTERN (Captain.asternOk).
    if (this.escort && !this.escort.flag && (this.escort.s < this.escort.L || this.carrierRecovery())) {
      var sv = this.stationView();
      return { hdg: this.hdgOrder !== null ? this.hdgOrder : sv.hdg, eng: this.engOrder || sv.eng, own: this.hdgOrder !== null || !!this.engOrder, nav: nv, holding: false, station: sv };
    }
    // A squadron's flagship sent to a target or a spot (Captain.flagTo): she goes there like the
    // others, at standard, then holds it on her beam (or her place) at slow, till RESUME.
    var fg = this.flagGo && this.hdgOrder === null && !this.holding ? this.goalOf(null, this.pos) : null;
    if (fg) {
      var fd = dist(this.pos, fg), fn = BL.COMMAND.escort.near * this.map().D;
      return { hdg: Math.round(fd > fn ? bearing(this.pos, fg) : fg.hdg) % 360, eng: this.engOrder || (fd > fn * 4 ? "standard" : fd > fn ? "cruise" : "deadSlow"), own: !!this.engOrder, nav: nv, holding: false, sent: true };
    } else if (this.flagGo && this.flagGo.kind === "target" && (!this.sqTargets[this.flagGo.id] || this.sqTargets[this.flagGo.id].dead)) this.flagGo = null;
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
    var kind = !m.hasDrive ? "carrier" : r.chance(0.5) ? "convoy" : "capital", W, n, ships = [];
    if (m.hasDrive && (m.escortKind === "convoy" || m.escortKind === "capital")) kind = m.escortKind;     // (a story mission's own)
    W = E.kinds[kind]; n = r.int(W.ships);
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
    // (she's stopped, waiting to recover the gunboat: closing on it at all, from wherever it is)
    var ahead = moving ? (st.x - this.pos.x) * Math.sin(w.hdg * RAD) + (st.y - this.pos.y) * Math.cos(w.hdg * RAD) : d;
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
  // A map point in the battle view (view units from us, the view's up = our heading); k: its scale
  // (default kView).
  Captain.prototype.toView = function (p, hdg, k) {
    var R = this.m.turret.R; k = k || this.kView; var b = (bearing(this.pos, p) - this.m.helm.compass()) * RAD, d = dist(this.pos, p) * k;
    return { x: R.cx + Math.sin(b) * d, y: R.cy - Math.cos(b) * d, d: d, rot: norm((hdg || 0) - this.m.helm.compass()) };
  };
  // Where she is in the battle view: ship i of hers (her middle if none).
  Captain.prototype.wardView = function (i) {
    var w = this.escort, s = i === undefined ? null : w.ships[i];
    return this.toView(s && s.pos ? s.pos : w.pos, w.hdg);
  };
  // Where wingman i is (on his station) in the battle view.
  Captain.prototype.wingView = function (i) { var g = this.escort.wing[i]; return g ? this.toView(this.wingPos(g), g.pos ? g.hdg : this.escort.hdg, this.kWing()) : null; };
  // The battle view's scale for the escort's ships (a squadron's: BL.COMMAND.squad.view x kView).
  Captain.prototype.kWing = function () { return this.kView * (this.escort && this.escort.flag ? BL.COMMAND.squad.view : 1); };
  // Where a wingman is on the map (his station or slot until he has moved).
  Captain.prototype.wingPos = function (g) { return g.pos || (this.escort.flag ? this.slotAt(g, g.form) : this.stationAt(g.station)); };
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
    if (e.wing === undefined && !this.escort.flag && this.rng.chance(E.wingRisk)) this.wingDamage(e.wingStop.w, e.mj * E.wingPerMJ);
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
    var m = this.m, es = this.escort, g = es.wing[e.wing]; this.rng = this.rng || BL.rng((m.seed ^ 0x3c6ef372) >>> 0);
    // (a squadron's ship: her own guns, BL.COMMAND.squad.selfDown, by her captain's skill)
    var k = es.flag ? BL.COMMAND.squad.selfDown * this.capK(g) : BL.COMMAND.escort.wingSelf;
    if (this.rng.chance(k)) e.wingStop = { at: m.t + (e.at - m.t) * this.rng.range([0.35, 0.7]), w: e.wing };
  };
  Captain.prototype.wingHit = function (e) { e.outcome = "wing"; if (this.escort.flag) this.sqHit(e.wing, e.mj); else this.wingDamage(e.wing, e.mj * BL.COMMAND.escort.wingPerMJ); };
  // Enemy gunfire at the group's target: the ward (one of her ships) or a wingman.
  Captain.prototype.gunAt = function (aim, mj) {
    var E = BL.COMMAND.escort, es = this.escort;
    if (aim === "ward") { if (!this.wardAlive()) return; this.rng = this.rng || BL.rng((this.m.seed ^ 0x3c6ef372) >>> 0); this.wardHit({ mj: mj * E.gunWard, wardShip: this.wardPick(this.rng) }); }
    else if (es.flag) this.sqHit(aim, mj);
    else this.wingDamage(aim, mj * E.gunWing * E.wingPerMJ);
  };
  // A wingman's hull; at 0 he's lost, and the groups after him turn on the ward (a squadron's:
  // on another of the squadron's ships).
  Captain.prototype.wingDamage = function (i, d) {
    var g = this.escort.wing[i], m = this.m, self = this;
    if (!g || g.hull <= 0) return;
    g.hull = Math.max(0, g.hull - d);
    if (g.hull > 0) return;
    m.cue("hullHit");
    if (this.escort.flag) this.sqSay("sqLost", null, { name: g.name }, "bad", true);
    this.rng = this.rng || BL.rng((m.seed ^ 0x3c6ef372) >>> 0);
    m.waves.forEach(function (w) {
      if (w.aim !== i) return;
      var to = self.escort.flag ? self.pickAim(self.rng) : "ward";
      w.aim = to; (w.ships || []).forEach(function (s) { s.aim = to; });
    });
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

  /* ------------------------------------------------------------- Squadron
     (Approved Nov 2, 2026; the map model, revised the same day from TexasBont's four sample
     screens.) The squadron commander fights on the map. Each system has enemy targets with places,
     headings, gun arcs and ranges (BL.COMMAND.squad.map); our ships see them within sensor range,
     else he has the pickets' report (off by a little) or an unknown contact. He sends ships to a
     target or a spot, singly or together; the rest keep formation on the flagship. Fire is decided
     by the guns that bear and range, both ways, so crossing the T and an L-shaped ambush work. The
     flagship (us) is flown on the plot or sent like the others; a target that fires on her comes
     into the battle view as its own wave, and what her crew does to that wave is done to it.
     Every order reaches a captain BL.COMMAND.squad.lag s / his skill later. Distances are seconds
     at our cruise speed (Captain.cs). */
  Captain.prototype.makeSquad = function () {
    var m = this.m, Q = BL.COMMAND.squad, E = BL.GUNNERY.engineer, r = BL.rng((Math.imul(m.seed, 0x85ebca6b) ^ 0x1b873593) >>> 0 || 1); r.next();
    var n = Q.size[m.data.classId] || 4, sh = m.sys("shield"), taken = { first: {}, last: {} }, wing = [], self = this;
    // (each captain's first and last names differ from every other captain's)
    function pick(list, used) { var free = list.filter(function (x) { return !used[x]; }), x = r.pick(free.length ? free : list); used[x] = true; return x; }
    function captain() {
      var s = Math.round(r.range(Q.hire) * 100) / 100, first = pick(E.first, taken.first), last = pick(E.last, taken.last);
      var rank = Q.ranks[s >= 0.85 ? 2 : s >= 0.65 ? 1 : 0];
      return { name: rank + " " + first + " " + last, who: first + " " + last, last: last, skill: s, temper: r.pick(["cautious", "steady", "aggressive"]),
        label: s >= 0.85 ? "sharp" : s >= 0.7 ? "steady" : s >= 0.5 ? "green" : "sloppy" };
    }
    this.flagCaptain = captain();
    for (var k = 1; k < n; k++) wing.push({ no: k + 1, slot: k - 1, spacing: 1, drift: 0, dressAt: -999, hull: m.data.hull, hullMax: m.data.hull, sh: sh.maxMJ, shMax: sh.maxMJ, stops: 0, kills: 0, cap: captain(),
      form: Q.start, order: { kind: "form" }, hold: false, pend: [], fireAt: 0, left: false, task: "form", attackUntil: 0 });
    // Every ship's name (Nov 3, 2026, TexasBont: "use the actual ship name"): the flagship's is the
    // job's (a test picks one), the others' from the same class and tech level's names (BL.shipName),
    // no two alike. Each ship keeps her own radio voice (BL.speech.alias).
    var nr = BL.rng(((m.seed ^ 0x5bd1e995) >>> 0) || 1), used = {}, P = BL.SHIP_PREFIX;
    function short(nm) { return String(nm).replace(P, ""); }
    var pickName = BL.shipName || function (rr, c, tl, u) { return "Ship " + (1 + Object.keys(u).length); };     // (no names.js: headless tests)
    var fn = m.shipName || pickName(nr, m.data.classId, m.data.tl, used); used[fn] = true; this.flagName = short(fn);
    wing.forEach(function (g) {
      var nm = pickName(nr, m.data.classId, m.data.tl, used); used[nm] = true; g.name = short(nm);
      if (BL.speech && BL.speech.alias) BL.speech.alias(g.name, "Ship " + g.no);
    });
    // Every system's targets, made now from the seed (the plotting screen shows them).
    this.sqMaps = this.maps.map(function (map, i) { return self.makeTargets(map, i); });
    this.preOrders = this.maps.map(function () { return {}; });       // (orders given on the plotting screen: ship number -> target id)
    return { flag: true, kind: "squadron", W: { name: "squadron", label: "SQUADRON" }, ships: [], wing: wing, spacing: 1, hull: 0, hullMax: 0, pos: null, hdg: 0,
      form: Q.start, target: null, attackReady: 0, attackUntil: 0, n: n, alert: null, fx: [] };
  };
  // The targets' [strength, gunfire] for our class (BL.COMMAND.squad.map.classK).
  Captain.prototype.sqK = function () { var M = BL.COMMAND.squad.map, k = M.classK[this.m.data.classId] || [1, 1]; return [k[0] * M.lethal[0], k[1] * M.lethal[1]]; };
  // Seconds at our cruise speed, in map units.
  Captain.prototype.cs = function () { return this.m.helm.gOf("cruise") * BL.COMMAND.scale; };
  /* A system's targets: the objective (the depot) somewhere off the straight way, then `targets`
     others spread over the map, clear of the start, each other and the asteroid fields; `unknown`
     of them aren't in the pickets' report. Moving ones start heading roughly toward the start. */
  Captain.prototype.makeTargets = function (map, i) {
    var M = BL.COMMAND.squad.map, r = BL.rng(((this.m.seed ^ Math.imul(0x7feb352d, i + 3)) >>> 0) || 1), D = map.D, cs = this.cs(), out = [];
    var hk = this.sqK()[0];
    var hb = bearing(map.start, map.jump), x0 = Math.min(map.start.x, map.jump.x) - 0.25 * D, x1 = Math.max(map.start.x, map.jump.x) + 0.25 * D,
      y0 = Math.min(map.start.y, map.jump.y) - 0.25 * D, y1 = Math.max(map.start.y, map.jump.y) + 0.25 * D;
    function ok(p, gap) {
      if (dist(p, map.start) < M.sensor * cs * 0.9 || dist(p, map.jump) < map.jump.r * 2) return false;
      if (BL.inField(map, p)) return false;
      return out.every(function (t) { return dist(t.pos, p) > gap * D; });
    }
    function add(kind, p) {
      var K = M.kinds[kind], hp = Math.round(K.hp * hk * BL.enemyTlFactor(r.pick([5, 6])));
      var hdg = K.speed ? to360(bearing(p, map.start) + r.range([-60, 60])) : 0, off = r.range([0, M.reportOff]) * cs;
      out.push({ id: out.length, letter: M.letters[out.length], kind: kind, K: K, pos: { x: p.x, y: p.y }, hdg: hdg, hp: hp, hpMax: hp,
        rep: along(p, r.next() * 360, off), unknown: false, seen: false, last: null, dead: false, victim: null, hunt: null, wave: null, reserve: 0, waves: 0, by: null });
    }
    // (a planet buster mission has no depot: it only has to get through, and the drop zone is guarded)
    var B = this.m.sys("buster") ? M.buster : null;
    if (!B) for (var t = 0; t < 60 && !out.length; t++) { var p0 = along(along(map.start, hb, r.range([0.4, 0.7]) * D), hb + 90, r.range([0.1, 0.25]) * D * (r.chance(0.5) ? 1 : -1)); if (ok(p0, 0.15)) add("depot", p0); }
    if (B && map.drop) {
      var bin = bearing(map.jump, map.start), fo = M.kinds.fortress.range * cs * B.off;
      for (var f = 0; f < B.fortresses; f++) add("fortress", along(map.jump, bin + (B.fortresses > 1 ? -B.spread + 2 * B.spread * f / (B.fortresses - 1) : 0), fo));
    }
    // (more of them the bigger the squadron: `more` a ship past the flagship, the odd share by chance)
    var more = M.more * ((BL.COMMAND.squad.size[this.m.data.classId] || 4) - 1);
    var n = r.int(B && map.drop ? B.targets : M.targets) + Math.floor(more) + (r.next() < more % 1 ? 1 : 0);
    for (var q = 0, tries = 0; q < n && tries < 300; tries++) {
      var p = { x: x0 + r.next() * (x1 - x0), y: y0 + r.next() * (y1 - y0) };
      if (!ok(p, 0.16)) continue;
      add(r.pick(M.pick), p); q++;
    }
    // (some aren't in the pickets' report: unknown contacts until our ships see them)
    var others = out.filter(function (x) { return !x.K.objective && x.kind !== "fortress"; });
    for (var u = r.int(M.unknown); u > 0 && others.length; u--) { var x = others.splice(Math.floor(r.next() * others.length), 1)[0]; x.unknown = true; }
    return out;
  };
  // A new system: the flagship at the map's start, every ship on her slot; orders given on the
  // plotting screen go out at once.
  Captain.prototype.resetSquad = function () {
    var es = this.escort, Q = BL.COMMAND.squad, R = this.m.turret.R, map = this.map(), self = this;
    // A ship left behind at the last warp (Captain.mayJump) is gone from the squadron.
    (this.sqLeave || []).forEach(function (g) { if (g.hull > 0) { g.left = true; g.hull = 0; } });
    this.sqLeave = null;
    es.pos = { x: this.pos.x, y: this.pos.y }; es.hdg = map.start.hdg;
    // (a station gap keeps two ships' shields `clear` apart in the battle view)
    es.stD = Math.max(Q.gap * map.D, this.kView ? (2 * Math.max(R.rx, R.ry) + Q.clear) / this.kWing() : 0);
    // (the flagship's track for LINE AHEAD: it starts as a straight line astern of her)
    es.trail = [{ x: this.pos.x, y: this.pos.y }, along(this.pos, es.hdg + 180, 8 * es.stD)];
    es.alert = null; es.fx = []; es.sel = null; this.flagGo = null;
    this.sqTargets = this.sqMaps[this.at];
    var pre = this.preOrders[this.at] || {};
    es.wing.forEach(function (g) {
      g.pos = null; g.pend = []; g.form = es.form; g.hold = false; g.attackUntil = 0;
      g.order = pre[g.no] !== undefined && g.hull > 0 ? { kind: "target", id: pre[g.no] } : { kind: "form" };
      g.task = g.order.kind === "form" ? "form" : "detach";
    });
    this.sqDps = null;
  };
  // A captain's skill as a factor (0.6 at 0 to 1 at 1) and his temper's [distance, fire, risk].
  Captain.prototype.capK = function (g) { return 0.6 + 0.4 * (g && g.cap ? g.cap.skill : 1); };
  Captain.prototype.capT = function (g) { return BL.COMMAND.squad.temper[g.cap.temper] || [1, 1, 1]; };
  // Her slot in formation `form` round the flagship (a cautious captain keeps farther off). In LINE
  // AHEAD (a trail formation) it's that far back along the flagship's own track, on the heading she
  // had there, so the column follows her round every corner.
  Captain.prototype.slotAt = function (g, form) {
    var es = this.escort, F = BL.COMMAND.squad.formations[form || es.form] || BL.COMMAND.squad.formations.ahead, sl = F.slots[g.slot % F.slots.length];
    var far = sl[1] * this.stationGap(g.spacing) * this.offStation(g);
    if (F.trail && es.trail && es.trail.length > 1) return this.trailAt(far);
    var p = along(es.pos || this.pos, es.hdg + sl[0], far); p.hdg = es.hdg; return p;
  };
  // The gap between stations at spacing s (CLOSE UP / OPEN OUT), never so close the shields touch.
  Captain.prototype.stationGap = function (s) {
    var es = this.escort, Q = BL.COMMAND.squad, R = this.m.turret.R, base = es.stD || Q.gap * this.map().D;
    var touch = this.kView ? 2 * Math.max(R.rx, R.ry) / this.kWing() * Q.station.touch : 0;
    return Math.max(touch, base * (s || 1));
  };
  // How far off her station a captain keeps (x her slot's distance): his temper, easing back in
  // over `dress` s after DRESS THE LINE, and the way he's wandered since.
  Captain.prototype.offStation = function (g) {
    var S = BL.COMMAND.squad.station, k = clamp((this.m.totalT - g.dressAt) / S.dress, 0, 1);
    return (1 + (this.capT(g)[0] - 1) * k) * (1 + (g.drift || 0));
  };
  // The point `far` map units back along the flagship's track, with the heading she had there.
  Captain.prototype.trailAt = function (far) {
    var tr = this.escort.trail, a = this.pos, left = far, lastH;
    for (var i = 0; i < tr.length; i++) {
      var b = tr[i], L = dist(a, b);
      if (L >= left && L > 1e-9) { var u = left / L, p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; p.hdg = bearing(b, a); return p; }
      left -= L; if (L > 1e-9) lastH = bearing(b, a); a = b;
    }
    var h = lastH === undefined ? this.escort.hdg : lastH, q = along(a, h + 180, left); q.hdg = h;
    return q;
  };
  // Lay the flagship's track (newest first): a point every tenth of a station gap, as long as the longest column.
  Captain.prototype.layTrail = function () {
    var es = this.escort, step = es.stD * 0.1, tr = es.trail;
    if (!tr) return;
    if (dist(this.pos, tr[0]) >= step) tr.unshift({ x: this.pos.x, y: this.pos.y });
    var keep = 8 * es.stD * Math.max(1, es.spacing || 1), tot = 0;
    for (var i = 1; i < tr.length; i++) { tot += dist(tr[i - 1], tr[i]); if (tot > keep) { tr.length = i + 1; break; } }
  };
  Captain.prototype.sqLive = function () { return this.escort.wing.filter(function (g) { return g.hull > 0; }); };
  Captain.prototype.shipNo = function (no) { return this.escort.wing.filter(function (g) { return g.no === no && g.hull > 0; })[0] || null; };
  // An order to a captain: it reaches him lag / his skill s from now.
  Captain.prototype.sqOrder = function (g, what, v) {
    var t = this.m.totalT + BL.COMMAND.squad.lag / Math.max(0.25, g.cap.skill);
    g.pend = g.pend.filter(function (p) { return p.what !== what; }); g.pend.push({ what: what, v: v, at: t, t0: this.m.totalT });
  };
  // How far an order is on its way to him (0 to 1; null: none).
  Captain.prototype.sqProgress = function (g) {
    var t = this.m.totalT, p = g.pend[0]; return p ? Math.min(1, (t - p.t0) / Math.max(0.01, p.at - p.t0)) : null;
  };
  // What she's been told to do, counting an order still on its way.
  Captain.prototype.orderOf = function (g) { var p = g.pend.filter(function (x) { return x.what === "order"; })[0]; return p ? p.v : g.order; };
  Captain.prototype.setFormation = function (id) {
    var Q = BL.COMMAND.squad, self = this;
    if (!Q.formations[id] || !this.escort.flag) return;
    this.escort.form = id;
    this.sqLive().forEach(function (g) { if (g.form !== id || g.pend.some(function (p) { return p.what === "form"; })) self.sqOrder(g, "form", id); });
    this.m.cue("tick");
  };
  // CLOSE UP (-1) and OPEN OUT (+1): every ship's station gap a step closer or farther.
  Captain.prototype.setSpacing = function (dir) {
    var S = BL.COMMAND.squad.station, es = this.escort, self = this;
    if (!es.flag) return;
    var v = Math.round(clamp(es.spacing + (dir < 0 ? -S.step[0] : S.step[1]), S.min, S.max) * 100) / 100;
    // (closing up stops where the shields would touch)
    if (dir < 0 && this.stationGap(v) >= this.stationGap(es.spacing) - 1e-9) return;
    es.spacing = v;
    this.sqLive().forEach(function (g) { self.sqOrder(g, "spacing", v); });
    this.m.cue("tick");
  };
  // DRESS THE LINE: every ship back on her exact station.
  Captain.prototype.dressLine = function () {
    var self = this;
    if (!this.escort.flag) return;
    this.sqLive().forEach(function (g) { self.sqOrder(g, "dress", true); });
    this.m.cue("tick");
  };
  /* Orders to ships (numbers): to a target (its id), to a spot on the map (they line up there,
     in the formation's way, facing the nearest enemy), or back to formation. Ships sent to the same
     spot together share it. */
  Captain.prototype.sendTo = function (nos, targetId) {
    var self = this, T = this.sqTargets[targetId];
    if (!T || T.dead) return false;
    nos.forEach(function (no) { var g = self.shipNo(no); if (g) self.sqOrder(g, "order", { kind: "target", id: targetId }); });
    this.m.cue("tick"); return true;
  };
  Captain.prototype.sendSpot = function (nos, p) {
    var self = this, grp = { x: p.x, y: p.y, n: 0 };
    nos.forEach(function (no) { var g = self.shipNo(no); if (g) self.sqOrder(g, "order", { kind: "spot", spot: grp, k: grp.n++ }); });
    this.m.cue("tick"); return grp;     // (the spot: the flagship can join them there, Captain.flagTo)
  };
  Captain.prototype.recall = function (nos) {
    var self = this;
    nos.forEach(function (no) { var g = self.shipNo(no); if (g) self.sqOrder(g, "order", { kind: "form" }); });
    this.m.cue("tick");
  };
  // HOLD FIRE (on or off) for ships `nos`: hidden till an enemy is close, then they open up.
  Captain.prototype.setHold = function (nos, on) {
    var self = this;
    nos.forEach(function (no) { var g = self.shipNo(no); if (g) self.sqOrder(g, "hold", !!on); });
    this.m.cue("tick");
  };
  // The flagship: sent to a target or a spot like the others (RESUME, or a course of your own, ends it).
  Captain.prototype.flagTo = function (o) { this.flagGo = o; this.hdgOrder = null; this.engOrder = null; this.m.cue("tick"); };
  // The targets still in this system.
  Captain.prototype.sqGroups = function () { return (this.sqTargets || []).filter(function (t) { return !t.dead; }); };
  // Where a target shows on the map: where it is if we see it (or have seen it), else the report.
  Captain.prototype.shownAt = function (T) { return T.seen ? T.pos : T.last || T.rep; };
  // The guns of a ship of ours (her class's arcs) that bear on point p from her place and heading.
  Captain.prototype.gunsBear = function (from, hdg, p) {
    var arcs = (BL.GUNNERY.ring.classes[this.m.data.classId] || {}).arcs || [[0, 180]], rel = norm(bearing(from, p) - hdg);
    return arcs.filter(function (a) { return a[1] >= 180 || Math.abs(norm(rel - a[0])) <= a[1]; }).length;
  };
  // A target's guns that bear on point p ("lead" guns: only toward its bow; the rest as their arcs say).
  Captain.prototype.enemyGunsOn = function (T, p) {
    var rel = norm(bearing(T.pos, p) - T.hdg);
    return T.K.guns.reduce(function (a, gn) { return a + (gn[1] >= 180 || Math.abs(norm(rel - gn[0])) <= gn[1] ? gn[2] : 0); }, 0);
  };
  // Our ships for the enemy to see and shoot at: the flagship (null) and every ship still with us.
  Captain.prototype.ourShips = function () {
    var out = [{ g: null, pos: this.pos, hdg: this.m.helm.compass() }];
    this.escort.wing.forEach(function (g, i) { if (g.hull > 0 && g.pos) out.push({ g: g, i: i, pos: g.pos, hdg: g.hdg }); });
    return out;
  };
  // Where a ship of ours is going: her slot, the spot she was sent to (lined up there), or a
  // place at `close` of her range from her target, keeping it on her beam.
  Captain.prototype.goalOf = function (g, from) {
    var M = BL.COMMAND.squad.map, cs = this.cs(), o = g ? g.order : this.flagGo, es = this.escort;
    if (!o || o.kind === "form") return g ? this.slotAt(g, g.form) : null;
    if (o.kind === "target") {
      var T = this.sqTargets[o.id];
      if (!T || T.dead) return g ? this.slotAt(g, g.form) : null;
      var at = this.shownAt(T), R = M.range * cs * M.close * (g ? this.capT(g)[0] : 1), b = bearing(at, from);
      var p = dist(from, at) > R ? along(at, b, R) : { x: from.x, y: from.y };
      var tb = bearing(p, at), h1 = to360(tb + 90), h2 = to360(tb - 90), cur = g ? (g.hdg || 0) : this.m.helm.compass();
      p.hdg = Math.abs(norm(h1 - cur)) <= Math.abs(norm(h2 - cur)) ? h1 : h2;
      return p;
    }
    // A spot: facing the nearest enemy we know of (in line ahead broadsides on, in line abreast
    // bows on), the ships sent together in a line there.
    var sp = o.spot, near = null, nd = Infinity, self = this;
    this.sqGroups().forEach(function (T) { if (T.unknown && !T.seen) return; var d = dist(self.shownAt(T), sp); if (d < nd) { nd = d; near = T; } });
    var face = near ? bearing(sp, this.shownAt(near)) : es.hdg, line = es.form === "abreast";
    var hd = line ? face : to360(face + 90), k = o.k || 0, n = Math.max(1, o.spot.n || 1), gap = this.stationGap(es.spacing);
    var q = line ? along(sp, hd + 90, (k - (n - 1) / 2) * gap) : along(sp, hd + 180, k * gap);
    q.hdg = hd; return q;
  };
  // Each tick: orders reach the captains; ships and targets move; who sees whom; fire both ways.
  Captain.prototype.runSquad = function (dt) {
    var m = this.m, es = this.escort, Q = BL.COMMAND.squad, M = Q.map, t = m.totalT, tu = m.turret, self = this, cs = this.cs();
    es.pos = { x: this.pos.x, y: this.pos.y }; es.hdg = m.helm.compass(); this.layTrail();
    var rate = M.shield * m.sys("shield").maxMW, fight = m.phase === "engage" || m.phase === "countdown";
    if (this.sqDps === null) {
      var dps = 0; tu.bats.forEach(function (b) { dps += b.w.damage / b.w.interval; });
      this.sqGun = dps / Math.max(1, tu.bats.length) * M.gunDps;       // (one gun's damage a second)
    }
    var vf = m.helm.speed * BL.COMMAND.scale;          // (the flagship's speed: a ship in formation keeps it)
    // Our ships: orders reach them, shields recharge, they move to their goals.
    es.wing.forEach(function (g) {
      if (g.hull <= 0) return;
      g.pend = g.pend.filter(function (p) {
        if (t < p.at) return true;
        if (p.what === "form") g.form = p.v;
        else if (p.what === "order") {
          g.order = p.v; g.task = p.v.kind === "form" ? "form" : "detach";
          var oT = p.v.kind === "target" ? self.sqTargets[p.v.id] : null;
          if (oT) self.sqSay("sqAck", g, { L: oT.letter, the: self.sqThe(oT) }); else self.sqSay(p.v.kind === "spot" ? "sqAckSpot" : "sqAckForm", g);
        }
        else if (p.what === "hold") { g.hold = p.v; if (p.v) self.sqSay("sqAckHold", g); }
        else if (p.what === "spacing") { self.sqSay(p.v < g.spacing ? "sqAckClose" : "sqAckOpen", g); g.spacing = p.v; }
        else if (p.what === "dress") { g.drift = 0; g.dressAt = t; self.sqSay("sqAckDress", g); }
        return false;
      });
      g.sh = Math.min(g.shMax, g.sh + rate * dt);
      if (g.shDown && g.sh > 0.5 * g.shMax) g.shDown = false;
      // (he wanders off his station, the less skilled the farther; none while he's dressing)
      var ST = Q.station, wmax = ST.wander * (1 - g.cap.skill);
      if (t - g.dressAt > ST.dress && wmax > 0) {
        self.sqDrift = self.sqDrift || BL.rng(((m.seed ^ 0x68e31da4) >>> 0) || 1);
        if (t >= (g.driftAt || 0)) { g.driftTo = (self.sqDrift.next() * 2 - 1) * wmax; g.driftAt = t + self.sqDrift.range(ST.every); }
        g.drift += clamp((g.driftTo || 0) - g.drift, -ST.drift * dt, ST.drift * dt);
      }
      if (!g.pos) { var s0 = self.slotAt(g, g.form); g.pos = { x: s0.x, y: s0.y }; g.hdg = es.hdg; g.v = vf; g.om = 0; }
      self.sqSteer(g, self.goalOf(g, g.pos), g.order.kind === "form", vf, dt);
    });
    var ours = this.ourShips();
    // The targets: who sees whom, then each moves (hunters after the nearest of ours they see,
    // a patrol turning its broadside to a ship in range) and picks a ship to fire on.
    this.sqGroups().forEach(function (T) {
      var seenNow = ours.some(function (o) { return dist(o.pos, T.pos) <= M.sensor * cs; });
      if (seenNow) { T.seen = true; T.last = { x: T.pos.x, y: T.pos.y }; } else if (T.seen) T.seen = false;
      if (seenNow && !T.spotted) {
        T.spotted = true;
        var sp0 = ours.reduce(function (a, o) { return !a || dist(o.pos, T.pos) < dist(a.pos, T.pos) ? o : a; }, null), wv = { L: T.letter, what: self.sqWhat(T) };
        if (sp0.g) self.sqSay(T.unknown ? "sqUnknown" : "sqContact", sp0.g, wv); else self.sqSay(T.unknown ? "sqUnknownT" : "sqContactT", null, wv);
      }
      // (a ship holding fire is hidden from it until it's within `ambush` of its range)
      var vis = ours.filter(function (o) { return !(o.g && o.g.hold) || dist(o.pos, T.pos) <= M.ambush * T.K.range * cs; });
      var inR = vis.filter(function (o) { return dist(o.pos, T.pos) <= T.K.range * cs; });
      // The ship it fires on: the one it was firing on while she's still in range; else the
      // flagship if she's in range and its guns bear on her; else the one most of its guns bear on, nearest first.
      var victim = null, vb = -1, was = T.victim;
      // (it keeps her till she's 1.3 x its range off, so a fight at the edge of range doesn't flicker in and out)
      vis.forEach(function (o) { if ((o.g ? o.g.no : 0) === was && dist(o.pos, T.pos) <= 1.3 * T.K.range * cs) victim = o; });
      if (!victim) inR.forEach(function (o) { var gb = self.enemyGunsOn(T, o.pos) * 10 - dist(o.pos, T.pos) / cs + (o.g ? 0 : self.enemyGunsOn(T, o.pos) ? 1000 : 0); if (gb > vb) { vb = gb; victim = o; } });
      T.victim = victim ? (victim.g ? victim.g.no : 0) : null;
      if (T.K.speed) {
        var sp = T.K.speed * cs, want = T.hdg;
        if (T.K.hunt) {
          var prey = null, pd = Infinity;
          vis.forEach(function (o) { var dd = dist(o.pos, T.pos); if (dd < M.sensor * 1.2 * cs && dd < pd) { pd = dd; prey = o; } });
          var pno = prey ? (prey.g ? prey.g.no : 0) : null;
          // (warn the commander when a pack turns on one of his ships out on her own)
          if (pno && pno !== T.hunt && !ours.some(function (o) { return o !== prey && dist(o.pos, prey.pos) < M.range * cs; })) { es.alert = { at: t, text: T.letter + " · " + T.K.name + " turning on " + prey.g.name }; self.sqSay("sqHunted", prey.g, { L: T.letter, what: self.sqWhat(T) }, "warn"); }
          T.hunt = pno;
          if (prey) { want = bearing(T.pos, prey.pos); if (pd < T.K.standOff * T.K.range * cs) sp = 0; }
        } else if (T.K.guard) {
          // (a guard: between its post and the nearest of ours it sees, never far from its post)
          var post = T.post || (T.post = { x: T.pos.x, y: T.pos.y }), foe = null, fd = Infinity;
          vis.forEach(function (o) { var dd = dist(o.pos, post); if (dd < M.sensor * cs && dd < fd) { fd = dd; foe = o; } });
          var spot = foe ? along(post, bearing(post, foe.pos), Math.min(T.K.guard * T.K.range * cs, Math.max(0, fd - 0.5 * T.K.range * cs))) : post;
          var gd = dist(T.pos, spot);
          if (gd < sp * 2) { sp = gd / 2; want = foe ? bearing(T.pos, foe.pos) : T.hdg; } else want = bearing(T.pos, spot);
        } else if (T.K.patrol && victim) {
          var tb = bearing(T.pos, victim.pos), a1 = to360(tb + 90), a2 = to360(tb - 90);
          want = Math.abs(norm(a1 - T.hdg)) <= Math.abs(norm(a2 - T.hdg)) ? a1 : a2;
        }
        // (back toward the middle of the map from its edge)
        var mid = { x: (self.map().start.x + self.map().jump.x) / 2, y: (self.map().start.y + self.map().jump.y) / 2 };
        if (dist(T.pos, mid) > self.map().D * 0.85) want = bearing(T.pos, mid);
        T.hdg = to360(T.hdg + clamp(norm(want - T.hdg), -40 * dt, 40 * dt));
        T.pos = along(T.pos, T.hdg, sp * dt);
      }
      // Firing on the flagship: its own wave in the battle view; on another ship: on the map.
      if (fight && victim && !victim.g) self.engageFlag(T); else self.disengage(T);
      // Its guns: on the map at another ship; at the flagship as gunfire on her shields (Mission.gunHit),
      // on top of its wave's torpedoes in the battle view.
      if (fight && victim && t >= (T.fireAt || 0)) {
        T.fireAt = t + Q.tick;
        var ng = self.enemyGunsOn(T, victim.pos), mj = ng * M.enemyDps * self.sqK()[1] * Q.tick * Math.sqrt(Math.max(0, T.hp / T.hpMax));
        if (ng) {
          if (victim.g) {
            if (t - (victim.g.hitAt === undefined ? -99 : victim.g.hitAt) > Q.radio.fresh) self.sqSay("sqUnderFire", victim.g, { L: T.letter, what: self.sqWhat(T) });
            victim.g.hitAt = t; self.sqHit(victim.i, mj);
          } else m.gunHit(mj);
          es.fx.push({ at: t, a: { x: T.pos.x, y: T.pos.y }, b: { x: victim.pos.x, y: victim.pos.y }, foe: true });
        }
      }
      if (T.wave) { T.hp = T.reserve + Math.max(0, T.wave.hp); self.steerWave(T); }
    });
    // Our ships' guns: on her own target if it's in range and her guns bear, else the one firing
    // on her, else the nearest that's in range. A ship holding fire waits for an enemy inside `ambush`.
    // The flagship's crew fight what's in the battle view; a target in her range that isn't firing
    // on her (so isn't there) she fires on like the others.
    if (fight && t >= (this.flagFireAt || 0)) {
      this.flagFireAt = t + Q.tick;
      var fh = m.helm.compass(), fb = null, fs = -Infinity;
      this.sqGroups().forEach(function (T) {
        if (T.wave || dist(self.pos, T.pos) > M.range * cs) return;
        var ng = self.gunsBear(self.pos, fh, T.pos); if (ng && ng * 10 - dist(self.pos, T.pos) / cs > fs) { fs = ng * 10 - dist(self.pos, T.pos) / cs; fb = T; }
      });
      if (fb) { es.fx.push({ at: t, a: { x: this.pos.x, y: this.pos.y }, b: { x: fb.pos.x, y: fb.pos.y } }); if (this.hitTarget(fb, this.gunsBear(this.pos, fh, fb.pos) * this.sqGun * Q.tick)) { fb.by = 1; this.sqSay("sqKillT", null, { L: fb.letter }, "good", true); } }
    }
    es.wing.forEach(function (g) {
      if (g.hull <= 0 || !fight || t < g.fireAt) return;
      g.fireAt = t + Q.tick;
      var best = null, score = -Infinity, R = M.range * cs;
      self.sqGroups().forEach(function (T) {
        var d = dist(g.pos, T.pos); if (d > R) return;
        var ng = self.gunsBear(g.pos, g.hdg, T.pos); if (!ng) return;
        var sc = ng * 10 - d / cs + (g.order.kind === "target" && g.order.id === T.id ? 100 : 0) + (T.victim === g.no ? 30 : 0);
        if (sc > score) { score = sc; best = T; }
      });
      if (!best) return;
      if (g.hold) { if (dist(g.pos, best.pos) > M.ambush * R) return; g.hold = false; self.sqSay("sqAmbush", g, { L: best.letter }); }
      else if (g.firingOn !== best.id) self.sqSay("sqEngage", g, { L: best.letter, the: self.sqThe(best) });
      g.firingOn = best.id;
      var dmg = self.gunsBear(g.pos, g.hdg, best.pos) * self.sqGun * Q.tick * self.capK(g) * self.capT(g)[1];
      es.fx.push({ at: t, a: { x: g.pos.x, y: g.pos.y }, b: { x: best.pos.x, y: best.pos.y } });
      if (self.hitTarget(best, dmg)) { g.kills++; self.stats.sqKills++; best.by = g.no; self.sqSay("sqKill", g, { L: best.letter, name: best.K.name.toLowerCase() }, "good", true); }
    });
    // How hot the fight is (targets firing on us, and ships of ours below half hull under fire now);
    // a hot one, the captains talk to each other.
    this.sqHot = this.sqGroups().filter(function (T) { return fight && T.victim !== null; }).length +
      this.sqLive().filter(function (g) { return g.hull < 0.5 * g.hullMax && t - (g.hitAt === undefined ? -99 : g.hitAt) < 3; }).length;
    var RQ = Q.radio;
    if (fight && !m.quiet && this.sqHot >= RQ.cross[0] && t >= (this.sqCrossAt || 0)) {
      this.sqRng = this.sqRng || BL.rng(((m.seed ^ 0x2545f491) >>> 0) || 1);
      this.sqCrossAt = t + this.sqRng.range(RQ.cross[1]);
      var hurt = es.wing.filter(function (g) { return g.hull > 0 && t - (g.hitAt === undefined ? -99 : g.hitAt) < 3; }), live = this.sqLive();
      if (hurt.length && live.length > 1) {
        var who = hurt[Math.floor(this.sqRng.next() * hurt.length)], by = live.filter(function (g) { return g !== who; });
        this.sqSay("sqCross", by[Math.floor(this.sqRng.next() * by.length)], { other: who.name });
      } else if (live.length) this.sqSay("sqBusy", live[Math.floor(this.sqRng.next() * live.length)]);
    }
    es.fx = es.fx.filter(function (f) { return t - f.at < 0.4; });
    if (es.alert && t - es.alert.at > 10) es.alert = null;
  };
  /* A ship of the squadron under way (Nov 3, 2026, TexasBont: "the squadron ships all have the same
     performance characteristics as the flagship"): the flagship's class's top speed (full; flank
     only to catch up with her formation), her engines' spool and the ship's ease to speed, her top
     turn rate and how fast a turn builds. She steers smoothly: in formation, for a point a little
     ahead of her station at the flagship's speed plus what closes the gap along it; sent to a
     target or a spot, she slows as she gets there and turns to the heading wanted. */
  Captain.prototype.sqSteer = function (g, goal, inForm, vf, dt) {
    var m = this.m, h = m.helm, H = BL.HELM, C = h.C, K = BL.COMMAND, S = BL.COMMAND.squad.station;
    var vFull = h.gOf("full") * K.scale, vFlank = h.gOf("flank") * K.scale, top = C.top, build = C.build;
    var d = dist(g.pos, goal), gh = goal.hdg !== undefined ? goal.hdg : this.escort.hdg, want, cmd;
    var cap = vf > vFull * 0.99 ? vFlank : vFull, tau = H.engineTau + H.engineLagTau * C.lag + H.speedTau;
    g.v = g.v === undefined ? 0 : g.v;
    // (she judges the gap by where she'll be once her engines have answered, `tau` s on: a big ship
    // slowing late no longer runs past her station and has to drop back)
    var brg = bearing(g.pos, goal), closing = g.v * Math.cos(norm(g.hdg - brg) * RAD);
    if (inForm && d > S.far * (this.escort.stD || 1)) {
      // (well off her station: straight for it, easing off as she nears it)
      closing -= vf * Math.cos(norm(gh - brg) * RAD);
      want = brg; cmd = clamp(vf + S.close * (d - closing * tau), 0, cap);
    } else if (inForm) {
      // (along: how far her station is ahead of her on its heading; the aim point leads it)
      var dx = goal.x - g.pos.x, dy = goal.y - g.pos.y, al = dx * Math.sin(gh * RAD) + dy * Math.cos(gh * RAD), lat = Math.abs(dx * Math.cos(gh * RAD) - dy * Math.sin(gh * RAD));
      var lead = Math.max(this.escort.stD || 1, vf * S.lead), aim = along(goal, gh, lead);
      al -= (g.v * Math.cos(norm(g.hdg - gh) * RAD) - vf) * tau;
      want = bearing(g.pos, aim);
      cmd = clamp(vf + S.close * (al + 0.3 * lat), 0, cap);
    } else {
      var near = BL.COMMAND.escort.near * this.map().D * 0.3;
      want = d > near ? brg : gh;
      cmd = d > near ? clamp(S.close * (d - closing * tau) + vFull * 0.05, 0, vFull) : 0;
    }
    // (she slows to turn when her bow is well off where she wants to go: no circling a station
    // inside her turning circle)
    cmd *= clamp(Math.cos(norm(want - g.hdg) * RAD), 0.1, 1);
    // (her engines spool and the ship eases to speed as the flagship's do)
    g.v += (cmd - g.v) * (1 - Math.exp(-dt / tau));
    // (the turn: toward the heading wanted, no faster than her top rate, building at her class's rate.
    // Nov 3, 2026, TexasBont: "the really big ships tend to overcorrect": she eases off the turn on
    // a square-root curve, as the flagship's autopilot does, so it dies away just as she comes on
    // the heading; a big ship's slow build no longer swings her past it and back.)
    var err = norm(want - g.hdg);
    var omWant = (err < 0 ? -1 : 1) * Math.min(top, Math.abs(err) * S.turnGain, Math.sqrt(2 * build * S.ease * Math.abs(err)));
    g.om = (g.om || 0) + clamp(omWant - (g.om || 0), -build * dt, build * dt);
    g.hdg = to360(g.hdg + g.om * dt);
    g.pos = along(g.pos, g.hdg, g.v * dt);
  };
  // Damage to a target from one of our other ships; true if that sank it. Fighting the flagship,
  // it lands on its wave's ships in the battle view.
  Captain.prototype.hitTarget = function (T, dmg) {
    var tu = this.m.turret;
    if (T.wave && !T.wave.dead && T.wave.ships) { tu.byWing = true; tu.hitWave(T.wave, dmg); tu.byWing = false; T.hp = T.reserve + Math.max(0, T.wave.hp); }
    else T.hp -= dmg;
    if (T.hp <= 0.5 && !T.dead && !(T.wave && !T.wave.dead && T.reserve > 0)) { this.sinkTarget(T); return true; }
    return false;
  };
  Captain.prototype.sinkTarget = function (T) {
    T.dead = true; T.hp = 0; this.disengage(T);
    this.stats.targetsDown++; if (T.K.objective) { this.stats.objectivesDown++; this.sqSay("sqObjective", null, null, "good", true); }
    this.m.cue("kill");
  };
  // A target firing on the flagship comes into the battle view as its wave (its encounter's ships,
  // the whole target's strength), on its true bearing from her; when that wave's torpedoes are
  // spent and the target fights on, the next comes in quietly.
  Captain.prototype.engageFlag = function (T) {
    var m = this.m, w = T.wave;
    if (w && (w.dead || m.waves.indexOf(w) < 0)) {
      T.hp = T.reserve + (w.dead ? 0 : Math.max(0, w.hp)); T.wave = null;
      if (T.hp <= 0.5) { this.sinkTarget(T); return; }
    }
    if (T.wave || T.dead) return;
    var enc = BL.ENCOUNTERS[T.K.enc]; if (!enc || !enc.wave) return;
    var n0 = m.waves.length;
    m.spawnWave(enc, T.K.enc, T.waves || T.K.quiet ? "quietWave" : null);
    if (m.waves.length === n0) return;
    w = m.waves[m.waves.length - 1];
    // (the whole target, its ships that much tougher; its torpedoes as its encounter fires them,
    // a new wave of them when those are spent and it fights on)
    var amt = T.hp;
    T.reserve = 0; w.hp = w.hpMax = amt; w.aim = null; w.quiet = true; w.name = T.K.name; w.target = T.id;
    w.bearing = norm(bearing(this.pos, T.pos) - m.helm.compass());
    T.wave = w; T.waves++;
  };
  // Its wave's ships keep to its true bearing from her as she and it move.
  Captain.prototype.steerWave = function (T) {
    var w = T.wave; if (!w || !w.ships) return;
    var b = norm(bearing(this.pos, T.pos) - this.m.helm.compass());
    w.ships.forEach(function (s) { if (s.homeOff === undefined) s.homeOff = norm(s.home - (w.bearing || 0)); s.home = b + s.homeOff; });
  };
  // No longer firing on the flagship: its wave leaves the battle view (what's left goes back to it).
  Captain.prototype.disengage = function (T) {
    var m = this.m, w = T.wave;
    if (!w) return;
    T.wave = null;
    if (w.dead || m.waves.indexOf(w) < 0) { T.hp = T.dead ? 0 : T.reserve + (w.dead ? 0 : Math.max(0, w.hp)); return; }
    if (!T.dead) T.hp = T.reserve + Math.max(0, w.hp);
    m.waves = m.waves.filter(function (x) { return x !== w; });
    m.events = m.events.filter(function (e) { return e.wave !== w.id || e.done; });
    (w.ships || []).forEach(function (s) { s.state = "leave"; });
  };
  // The systems flown whose objective is still standing (a squadron's mission fails with any).
  Captain.prototype.sqMissed = function () {
    var n = this.m.stats.jumps.length;
    return (this.sqMaps || []).slice(0, Math.max(1, n)).filter(function (list) { return list.some(function (T) { return T.K.objective && !T.dead; }); }).length;
  };
  // Every ship still with the squadron formed up on her slot (the warp waits for it).
  Captain.prototype.sqFormed = function () {
    var self = this, near = BL.COMMAND.escort.near * this.map().D * 3;
    return this.sqLive().every(function (g) { return g.order.kind === "form" && !g.pend.some(function (p) { return p.what === "order"; }) && (!g.pos || dist(g.pos, self.slotAt(g, g.form)) <= near); });
  };
  // (SCREEN is gone from the map model; nothing guards the flagship from a burst on its way.)
  Captain.prototype.flagGuard = function () {};
  // A torpedo or gunfire (mj) at ship i of the squadron: her shields first, the rest on her hull
  // at our hullPerMJ (by her captain's temper).
  Captain.prototype.sqHit = function (i, mj) {
    var g = this.escort.wing[i];
    if (!g || g.hull <= 0) return;
    mj *= this.capT(g)[2];
    var took = Math.min(g.sh, mj); g.sh -= took;
    if (g.sh < 1 && !g.shDown) { g.shDown = true; this.sqSay("sqShieldsDown", g, null, "warn"); }
    if (mj > took) this.wingDamage(i, (mj - took) * this.m.data.hullPerMJ);
    if (g.hull > 0 && g.hull <= 0.25 * g.hullMax && !g.saidLow) { g.saidLow = g.saidHalf = true; this.sqSay("sqHullLow", g, null, "warn", true); }
    else if (g.hull > 0 && g.hull <= 0.5 * g.hullMax && !g.saidHalf) { g.saidHalf = true; this.sqSay("sqHullHalf", g, null, "warn"); }
  };
  /* Squadron radio (Nov 2, 2026): the captains' calls (BL.CHATTER sq...; {ship} is her name),
     the more of them the hotter the fight. A routine call waits a gap after the last one (shorter
     the more targets are firing on us and ships are hurt: BL.COMMAND.squad.radio) and the ship's
     own gap; a `must` call (a hull failing, a ship lost, the objective down) always goes out. */
  Captain.prototype.sqSay = function (key, g, vars, kind, must) {
    var m = this.m, t = m.totalT, R = BL.COMMAND.squad.radio, lines = BL.CHATTER[key];
    if (m.quiet || !lines || !lines.length) return;
    if (!must) {
      var h = this.sqHot || 0, gap = h >= 3 ? R.gap[2] : h >= 1 ? R.gap[1] : R.gap[0];
      if (t - (this.sqSaidAt === undefined ? -99 : this.sqSaidAt) < gap) return;
      if (g && t - (g.saidAt === undefined ? -99 : g.saidAt) < R.shipGap) return;
    }
    this.sqRng = this.sqRng || BL.rng(((m.seed ^ 0x2545f491) >>> 0) || 1);
    var v = Object.assign({ ship: g ? g.name : "" }, vars || {});
    this.sqLines = this.sqLines || {};
    var pick = this.sqRng.pick(lines);
    if (pick === this.sqLines[key] && lines.length > 1) pick = lines[(lines.indexOf(pick) + 1) % lines.length];     // (not the same line twice running)
    this.sqLines[key] = pick;
    var line = pick.replace(/\{(\w+)\}/g, function (x, k) { return v[k] !== undefined ? v[k] : x; });
    this.sqSaidAt = t; if (g) g.saidAt = t;
    m.say(line, kind || "info"); m.cue("chatter");
  };
  // A target in a call: "a raider pack", "drive hunters"; "the raider pack".
  Captain.prototype.sqWhat = function (T) { var n = T.K.name.toLowerCase(); return /s$/.test(n) ? n : (/^[aeiou]/.test(n) ? "an " : "a ") + n; };
  Captain.prototype.sqThe = function (T) { return "the " + T.K.name.toLowerCase(); };
  // A battle-view point on the map (the inverse of Captain.toView).
  Captain.prototype.fromView = function (x, y) {
    var R = this.m.turret.R, k = this.kView || 1, dx = x - R.cx, dy = R.cy - y;
    return along(this.pos, this.m.helm.compass() + Math.atan2(dx, dy) / RAD, Math.hypot(dx, dy) / k);
  };
  // What the screens show of a target: letter, name, strength, guns, range, what it's doing, and
  // the guns that bear each way between it and the ships near it.
  Captain.prototype.targetView = function (T) {
    var M = BL.COMMAND.squad.map, cs = this.cs(), self = this, ours = 0, theirs = 0;
    this.ourShips().forEach(function (o) {
      var d = dist(o.pos, T.pos);
      if (d <= M.range * cs) ours += self.gunsBear(o.pos, o.hdg, T.pos);
      if (d <= T.K.range * cs) theirs = Math.max(theirs, self.enemyGunsOn(T, o.pos));
    });
    var sent = this.escort.wing.filter(function (g) { var o = self.orderOf(g); return g.hull > 0 && o.kind === "target" && o.id === T.id; }).map(function (g) { return g.name; });
    if (this.flagGo && this.flagGo.kind === "target" && this.flagGo.id === T.id) sent.unshift(this.flagName);
    return { letter: T.letter, name: T.unknown && !T.seen && !T.last ? "Unknown contact" : T.K.name, known: !T.unknown || T.seen || !!T.last, seen: T.seen,
      pct: Math.round(100 * T.hp / T.hpMax), dead: T.dead, objective: !!T.K.objective, moves: !!T.K.speed, guns: T.K.guns.reduce(function (a, g) { return a + g[2]; }, 0),
      range: T.K.range, on: T.victim === null ? null : T.victim === 0 ? this.flagName + " (the flagship)" : (this.escort.wing.filter(function (g) { return g.no === T.victim; })[0] || {}).name, sent: sent, ours: ours, theirs: theirs };
  };
  // The squadron's ships for the screens: number, captain, hull, shields and what she's doing.
  Captain.prototype.squadView = function () {
    var es = this.escort, t = this.m.totalT, self = this;
    if (!es || !es.flag) return null;
    var S = BL.COMMAND.squad.station;
    return { form: es.form, spacing: es.spacing, canClose: this.stationGap(Math.max(S.min, es.spacing - S.step[0])) < this.stationGap(es.spacing) - 1e-9, canOpen: es.spacing < S.max - 1e-9,
      alert: es.alert ? es.alert.text : null, flag: this.flagCaptain, flagName: this.flagName, flagGo: this.flagGo,
      ships: es.wing.map(function (g) {
        var o = self.orderOf(g), T = o.kind === "target" ? self.sqTargets && self.sqTargets[o.id] : null;
        var doing = g.left ? "left behind" : g.hull <= 0 ? "lost" : o.kind === "target" ? (T && !T.dead ? "→ " + T.letter + " " + T.K.name.toLowerCase() : "target gone") : o.kind === "spot" ? "→ a spot" : "in formation";
        if (g.hull > 0 && o.kind === "form" && g.pos && dist(g.pos, self.slotAt(g, g.form)) > BL.COMMAND.escort.near * self.map().D * 3) doing = "forming up";
        if (g.hull > 0 && g.hold) doing += " · holding fire";
        return { no: g.no, name: g.name, cap: g.cap, hull: g.hull / g.hullMax, sh: g.sh / g.shMax, doing: doing, live: g.hull > 0, order: o.kind, pend: g.pend.some(function (q) { return q.what === "order" || q.what === "hold" || q.what === "form"; }), stPend: g.pend.some(function (q) { return q.what === "spacing" || q.what === "dress"; }), progress: self.sqProgress(g), kills: g.kills, hold: g.hold };
      }) };
  };

  /* ------------------------------------------------------------- Orders */
  Captain.prototype.orderCourse = function (hdg) {
    this.hdgOrder = Math.round(to360(hdg)) % 360; this.swing = null; this.flagGo = null;
    this.m.cue("tick");
  };
  Captain.prototype.orderEngines = function (id) { if (!this.m.helm.preset(id)) return; this.engOrder = id; this.m.cue("tick"); };
  // Back to the plot: the navigation computer steers for the next waypoint.
  Captain.prototype.resumePlot = function () { this.hdgOrder = null; this.engOrder = null; this.swing = null; this.flagGo = null; this.m.cue("tick"); };
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
    var can = !hs.call && full && !m.hangarGone() && (sq === "aboard" || sq === "out") && (m.phase === "engage" || m.phase === "countdown" && sq === "out");
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
  Captain.prototype.setStance = function (id) { if (!BL.COMMAND.stances[id]) return; this.stance = id; this.order("stance"); };
  // An order takes BL.COMMAND.orderLag[tech level] s / the crewman's skill to reach him: the
  // engineer for a stance, each gun crew for a gun order (none if it's what they're doing already).
  function lagFor(m, skill) { return (BL.COMMAND.orderLag[m.data.tl] || 2) / Math.max(0.2, skill || 1); }
  // (lag[what]: { t0: given, at: carried out }; for the guns, when the last gun has it)
  Captain.prototype.order = function (what) {
    var m = this.m, t = m.totalT, id = this[what], L = this.lag;
    if (what !== "guns") {
      if (id === this[what + "On"]) delete L[what];
      else L[what] = { t0: t, at: t + lagFor(m, what === "stance" ? m.turret && m.turret.engineer.skill : this.pilotCrew.skill) };
    } else if (m.turret) {
      var at = t;
      m.turret.bats.forEach(function (b) {
        if (b.order === id) { b.orderTo = null; return; }
        b.orderTo = id; b.orderAt = t + lagFor(m, b.crew && b.crew.skill); at = Math.max(at, b.orderAt);
      });
      if (at > t) L.guns = { t0: t, at: at }; else delete L.guns;
    }
    m.cue("tick");
  };
  // How far an order is on its way to the crew, 0 to 1 (null: none on its way).
  Captain.prototype.orderProgress = function (what) {
    var o = this.lag[what]; if (!o) return null;
    return Math.min(1, (this.m.totalT - o.t0) / Math.max(0.01, o.at - o.t0));
  };
  // The orders that have reached the crew by now (the gunners answer once every gun has it).
  Captain.prototype.carryOut = function () {
    var L = this.lag, m = this.m, t = m.totalT, tu = m.turret;
    if (L.stance && t >= L.stance.at) { delete L.stance; this.stanceOn = this.stance; this.applyStance(); }
    if (L.breaks && t >= L.breaks.at) { delete L.breaks; this.breaksOn = this.breaks; }
    if (!tu || this.gunsOn === this.guns && !tu.bats.some(function (b) { return b.orderTo; })) return;
    tu.bats.forEach(function (b) { if (b.orderTo && t >= b.orderAt) { b.order = b.orderTo; b.orderTo = null; } });
    var id = this.guns;
    if (tu.bats.every(function (b) { return b.order === id; })) { delete L.guns; if (this.gunsOn !== id) { this.gunsOn = id; m.say("Gunners: " + BL.GUNNERY.orders[id].ack, "good"); } }
  };
  // The engineer's stance is his priority order: shields first, guns first, the drive first (after
  // life support; the AI engineer then charges it to be full by the window (its last percent flat out), not just with what's left:
  // AIEngineer.think), or as the ship comes.
  Captain.prototype.applyStance = function () {
    var m = this.m, base = this.basePriority.slice(), guns = base.filter(function (id) { var s = m.sys(id); return s && s.kind === "gun"; });
    var on = this.stanceOn;
    m.driveFirst = on === "drive" && !!m.sys("drive");
    m.mainFirst = on === "main" && !!m.sys("main");       // (main gun first: after life support, charged flat out: AIEngineer.think)
    m.busterFirst = on === "moab" && !!m.sys("buster");   // (MOAB: the planet buster likewise)
    var first = on === "shields" ? ["shield"] : on === "guns" ? guns : m.driveFirst ? ["life", "drive"] : m.mainFirst ? ["life", "main"] : m.busterFirst ? ["life", "buster"] : [];
    m.setPriority(first.concat(base.filter(function (id) { return first.indexOf(id) < 0; })));
  };
  // The pilot's standing break policy (BL.COMMAND.pilots): EVADE, HOLD or STEADY.
  Captain.prototype.setPilot = function (id) { if (!BL.COMMAND.pilots[id]) return; this.breaks = id; this.order("breaks"); };
  Captain.prototype.setGuns = function (id) { if (!BL.GUNNERY.orders[id]) return; this.guns = id; this.order("guns"); };
  Captain.prototype.applyGuns = function () {
    var tu = this.m.turret, id = this.gunsOn;
    if (!tu) return;
    tu.bats.forEach(function (b) { if (!b.orderTo) b.order = id; });     // (an order on its way still gets there)
  };
  // Torpedoes at us that no break covers and that haven't landed.
  Captain.prototype.openFish = function () { var h = this.m.helm; return h.fishInAir().filter(function (f) { return f.hold; }); };
  // The helm told us torpedoes are away (Helm.torpedoLaunched): the captain's call is open
  // until they land. The standing order is "take it".
  Captain.prototype.torpedoLaunched = function (e, s) {
    var m = this.m;
    e.hold = true;
    if (this.call && m.t - this.call.at < BL.HELM.evade.burst && !this.call.done) { this.call.fish.push(e); return; }
    if (this.call && !this.call.done) this.closeCall();
    this.call = { at: m.t, fish: [e], ship: s, done: false, could: false };
    this.stats.calls++;
  };
  Captain.prototype.callView = function () {
    var m = this.m, c = this.call, h = m.helm;
    if (!c || c.done) return null;
    var live = c.fish.filter(function (f) { return !f.done && f.hold && f.at > m.t; });
    if (!live.length) { this.closeCall(); return null; }
    var land = Math.min.apply(null, live.map(function (f) { return f.at; })), can = h.canBreak(BL.GUNNERY.torpedo.travel) && !(h.evade && m.t < h.evade.until);
    if (can && !this.away) c.could = true;      // (off the bridge he can't call it: not unanswered)
    return { n: live.length, in: land - m.t, mj: live.reduce(function (a, f) { return a + f.mj; }, 0), canBreak: can,
      bearing: c.ship ? norm(c.ship.bearing) : 0 };
  };
  // A burst landed or was overtaken with no call: unanswered only if a break was ever possible
  // (a ship that can't break, like the light cruiser, has nothing to call: taken on the shields).
  Captain.prototype.closeCall = function () { this.call.done = true; if (this.call.could) this.stats.unanswered++; else this.stats.taken++; };
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
  // breaks on his own by the captain's standing policy, away from asteroid fields: EVADE for any
  // burst, HOLD only when the shields can't take it, STEADY never; else it's taken.
  Captain.prototype.pilotCall = function () {
    var m = this.m, E = BL.HELM.evade, cv = this.callView();
    if (!cv || cv.in > E.lateMin || !cv.canBreak || this.breaksOn === "steady") return;
    // (his temperament, BL.ROSTER.temper: an aggressive pilot breaks sooner under HOLD, a cautious
    // one later, and under EVADE a cautious one lets a burst the shields easily take come in)
    var tk = this.pilotCrew.temperK === undefined ? 0.5 : this.pilotCrew.temperK, sh = m.sys("shield").mj;
    if (this.breaksOn === "hold" && sh >= cv.mj * E.cover * (0.5 + tk)) return;
    if (this.breaksOn === "evade" && tk < 0.5 && sh >= cv.mj * E.cover * 2) return;
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
    if (m.isDrop()) {                  // the drop: the MOAB full, the window open, in the zone (no heading, no drive)
      var bu = m.sys("buster"), moab = !m.busterFull() ? "MOAB " + Math.floor(bu.mj / bu.maxMJ * 100) + "%" : null;
      var dwhy = moab || (m.t < m.windowAt() ? "Window in " + Math.ceil(m.windowAt() - m.t) + "s" : !this.inZone() ? "Outside the zone" : null);
      var dwait = !this.jumpOrdered ? null : moab || (!this.inZone(BL.COMMAND.zoneHold) ? "BACK TO THE ZONE" : m.t < m.windowAt() ? "WAITING" : null);
      return { ready: !moab && this.inZone(), why: dwhy, ordered: this.jumpOrdered, wait: dwait, drop: true };
    }
    var drive = !d ? null : d.mj < d.maxMJ - 0.5 ? "Drive " + Math.floor(d.mj / d.maxMJ * 100) + "%" : null;
    // (a dreadnought's final jump also waits for the planet buster: Mission.runJump)
    var bu = m.sys("buster");
    if (!drive && bu && m.jumpIndex === m.cfg.jumps - 1 && !m.busterFull()) drive = "Buster " + Math.floor(bu.mj / bu.maxMJ * 100) + "%";
    var steer = "Steer " + BL.hdgText(this.info.jumpHdg);
    // (the squadron must be aboard first, unless her hull is down to the point of leaving it: Mission.runJump)
    var out = m.squadron === "out" && m.ship.hull > m.ship.hullMax * 0.2 ? "Recover gunboats" : null;
    var astern = this.carrierRecovery() && !this.asternOk() ? "Station ASTERN" : null;
    var why = drive || out || (m.t < m.windowAt() ? "Window in " + Math.ceil(m.windowAt() - m.t) + "s" : astern || !this.inZone() ? "Outside the zone" : !h.inJumpCorridor() ? steer : null);
    var form = this.escort && this.escort.flag && !this.sqFormed() && m.ship.hull > m.ship.hullMax * 0.2 ? "SQUADRON FORMING UP" : null;
    var wait = !this.jumpOrdered ? null : drive || (out && out.toUpperCase()) || (astern && "ASTERN OF THE CARRIER") || (!this.inZone(BL.COMMAND.zoneHold) ? "BACK TO THE ZONE" : !h.inJumpCorridor() ? steer.toUpperCase() : form);
    return { ready: !why, why: why, ordered: this.jumpOrdered, wait: wait };
  };
  Captain.prototype.orderJump = function () {
    if (!this.jumpView().ready || this.jumpOrdered) return false;
    this.jumpOrdered = true; this.m.cue("tick");
    // (a squadron: every detached ship is called back to form up for the warp)
    var self = this;
    if (this.escort && this.escort.flag) { this.flagGo = null; this.sqLive().forEach(function (g) { if (self.orderOf(g).kind !== "form") self.sqOrder(g, "order", { kind: "form" }); }); }
    return true;
  };
  // An enemy area (BL.COMMAND.swarm): into one, a swarm comes out of it; out again, half of what's
  // left of the swarm goes back, the rest stays on her.
  Captain.prototype.enemyArea = function () {
    var m = this.m, pos = this.pos, K = BL.COMMAND.swarm, k = -1;
    this.map().clusters.forEach(function (c, i) { if (k < 0 && (c.lobes || [c]).some(function (o) { return dist(pos, o) < o.r; })) k = i; });
    if (k === this.inCluster) return;
    var was = this.inCluster; this.inCluster = k;
    if (k >= 0 && was < 0) {
      var enc = m.encounter(), id = m.route[m.jumpIndex];
      if (!enc.wave || this.siegeOn()) { id = "raiders"; enc = BL.ENCOUNTERS.raiders; }     // (a siege line doesn't move: raiders swarm out instead)
      var n = Math.max(K.min, Math.round(K.mult * m.force(id))), before = m.nextId, q0 = m.spawnQueue.slice();
      m.queueWaves(n, enc, id, "straggler");
      // (the first comes at once; the rest are queued, and join the swarm as they spawn: Mission.schedule)
      this.swarm = m.waves.filter(function (w) { return w.id >= before; }).map(function (w) { return w.id; });
      m.spawnQueue.forEach(function (q) { if (q0.indexOf(q) < 0) q.swarm = true; });
      this.stats.swarms++;
      m.cue("tick");
    } else if (k < 0 && was >= 0) {
      // Out again: every other one of the swarm goes back (one still to come never comes).
      var ids = this.swarm, all = m.waves.filter(function (w) { return !w.dead && ids.indexOf(w.id) >= 0; }).concat(m.spawnQueue.filter(function (q) { return q.swarm; }));
      all.forEach(function (x, i) {
        if (i % 2) return;
        if (x.enc) m.spawnQueue.splice(m.spawnQueue.indexOf(x), 1); else m.withdrawWave(x);
      });
      m.spawnQueue.forEach(function (q) { q.swarm = false; });
      this.swarm = [];
    }
  };
  // Mission.runJump asks: may the countdown run?
  // (a squadron warps together: it waits for every ship to form up, unless the flagship's hull is
  // down to 20%; then the ones still out are left behind)
  Captain.prototype.mayJump = function () {
    if (!(this.jumpOrdered && this.inZone(BL.COMMAND.zoneHold) && (!this.carrierRecovery() || this.asternOk()))) return false;
    if (!this.escort || !this.escort.flag || this.sqFormed()) return true;
    if (this.m.ship.hull > this.m.ship.hullMax * 0.2) return false;
    var self = this, near = BL.COMMAND.escort.near * this.map().D * 3;
    this.sqLeave = this.sqLive().filter(function (g) { return g.order.kind !== "form" || (g.pos && dist(g.pos, self.slotAt(g, g.form)) > near); });
    return true;
  };
  // A gunboat escort mission: the carrier recovers the gunboat only from astern of her, on that
  // station (the pilot keeps it once the station is ordered).
  // (a gunboat squadron has no carrier: it warps out from the zone like any other)
  Captain.prototype.carrierRecovery = function () { return !!this.escort && !this.escort.flag && !this.m.hasDrive; };
  Captain.prototype.asternOk = function () { return this.station === "astern" && dist(this.pos, this.stationAt("astern")) <= BL.COMMAND.escort.near * this.map().D * 1.5; };

  /* ------------------------------------------------------------- Dropping down
     (Approved Nov 2, 2026.) The captain leaves the bridge to run one station himself: the engine
     room, the helm or a gun. The man there stands aside till he's back. Meanwhile the bridge gives
     no new orders (the crew keep his standing ones: the pilot flies the plot, the engineer his
     stance, the guns their order) and only the captain warps. The cost, once a mission: -1
     command reputation (BL.career) and -1 morale to each man he replaced (BL.roster). */
  Captain.prototype.canDrop = function () { var p = this.m.phase; return !this.away && !!this.pos && (p === "arrival" || p === "engage" || p === "countdown"); };
  Captain.prototype.dropTo = function (where, gun) {
    var m = this.m, tu = m.turret;
    if (!this.canDrop()) return false;
    if (where === "gun") {
      var b = tu.bats[gun]; if (!b) return false;
      this.replaced(b.crew); this.aside = b.crew; b.crew = null;
      tu.crewAll = false; tu.sel = gun; b.firing = false; b.dir = 0; b.aimRel = b.rel;
      tu.bats.forEach(function (x) { x.seek = null; });
    } else if (where === "helm") this.replaced(this.pilotCrew);
    else if (where === "engine") this.replaced(tu.engineer);
    else return false;
    this.away = where; this.dropped = true;
    m.cue("toggle");
    return true;
  };
  // At the guns he can trade to another gun (RingTurret.select): its man is replaced too.
  Captain.prototype.takeGun = function (i) {
    var tu = this.m.turret, b = tu.bats[i], man = b && b.crew;
    if (this.away !== "gun" || !b || !tu.select(i)) return false;
    this.replaced(man);
    return true;
  };
  Captain.prototype.replaced = function (man) {
    if (!man || this.replacedMen.some(function (x) { return x === man || (man.id !== undefined && x.id === man.id); })) return;
    this.replacedMen.push(man);
  };
  // Back to the bridge: the man who stood aside takes his station again.
  Captain.prototype.toBridge = function () {
    var m = this.m, tu = m.turret, self = this;
    if (!this.away) return false;
    if (this.away === "gun") {
      tu.bats.forEach(function (b) { b.firing = false; b.dir = 0; b.seek = null; if (!b.crew) { b.crew = self.aside; b.aiNext = m.totalT + 0.5; b.aiTarget = null; } });
      tu.crewAll = true; tu.sel = 0; this.aside = null;
    }
    this.away = null;
    m.cue("toggle");
    return true;
  };

  /* ------------------------------------------------------------- The tick */
  Captain.prototype.step = function (dt) {
    var m = this.m, h = m.helm, K = BL.COMMAND, map = this.map();
    this.carryOut();
    if (!this.pos) return;
    // The ship moves on the map at her speed, on her compass heading.
    var hdg = h.compass(), v = h.speed * K.scale;
    this.pos.x += Math.sin(hdg * RAD) * v * dt; this.pos.y += Math.cos(hdg * RAD) * v * dt;
    // The drive's charge rate, MJ/s, averaged over the last few seconds (and the MOAB's, for the drop).
    var bu = m.sys("buster");
    if (bu && dt > 0) {
      if (this.buLast !== null && this.buLast !== undefined) { var br = (bu.mj - this.buLast) / dt, ba = Math.min(1, dt / K.driveTau); this.buRate = this.buRate === null || this.buRate === undefined ? br : this.buRate + (br - this.buRate) * ba; }
      this.buLast = bu.mj;
    }
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
    this.enemyArea();
    // A fixed siege line: its batteries keep to its true bearing, farther out the farther it is.
    if (this.siegeOn() && m.turret) {
      var sb = this.siegeBearing(), back = K.siegeLine.back * (1 - BL.siegeFire(map, this.pos));
      m.turret.ships.forEach(function (s) { if (s.fixed && s.state !== "leave") { s.home = sb + s.slot; s.hold = s.hold0 + back; } });
    }
    // A gunboat escort: a carrier down to 20% (as a ship leaves her squadron, Mission.runJump) has lost
    // her hangar bay; with the gunboat out (not still in her tube) she warps without it.
    var es = this.escort;
    if (this.carrierRecovery() && !m.helm.inTube && es.hull > 0 && es.hull <= es.hullMax * 0.2 && m.phase !== "done") { m.chat("leftBehind", null, "bad"); m.finish("leftBehind"); return; }
    // Checkpoints flown through.
    var cur = this.cur, pos = this.pos;
    map.checkpoints.forEach(function (c, i) { if (!cur.cps[i] && dist(pos, c) < c.r) { cur.cps[i] = true; m.cue("tick"); } });
    var zone = this.inZone();
    if (zone && this.cur.zoneAt === null) this.cur.zoneAt = m.t;
    // In the zone on the last leg, the pilot holds her there (slow, then stopped) for the jump.
    this.holding = zone && (this.leg >= pts.length - 2 || this.jumpOrdered);
    // Escort: the carrier sails on; time on station counts while the fight is on.
    if (this.escort && this.escort.flag && this.escort.pos) this.runSquad(dt);
    else if (this.escort && this.escort.pos) {
      var w = this.escort; w.s = Math.min(w.L, w.s + w.v * dt);
      this.moveWard(dt); this.placeWard(); this.moveWing(dt);
      if (m.phase === "engage" || m.phase === "countdown") { this.cur.stationT += dt; if (this.stationView().on) this.cur.onStation += dt; }
    }
    // Asteroids: inside a field the rocks stream through the battle view (RingTurret.dropRock).
    this.inRock = BL.inField(map, this.pos); this.inMines = BL.inMines(map, this.pos);
    this.runSwing();
    if (m.phase !== "done" && this.away !== "helm") this.pilot.think(m, this);     // (at the helm the captain flies her)
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
      var z = c.escort && !c.escort.flag ? (s.stationT ? s.onStation / s.stationT : 0) : s.zoneAt !== null && s.zoneAt <= s.window + K.zoneGrace ? 1 : s.zoneAt !== null ? 0.5 : 0;
      if (s.cps && s.cps.length) z = 0.5 * z + 0.5 * s.cps.filter(Boolean).length / s.cps.length;
      nav += z * Math.max(0, 1 - 0.25 * s.rockHits);
    });
    nav = sys.length ? nav / sys.length : 0;
    // Escort: the objective is her: brought home, worth her hull left (a convoy: the merchants that get through).
    var es = c.escort, afloat = es ? es.ships.filter(function (s) { return s.hull > 0; }).length : 0;
    // (a squadron: the objective is half the share of each system's objective destroyed, half the
    // share of the squadron's ships brought home, the flagship one of them)
    var sqHome = es && es.flag ? (outcome === "destroyed" ? 0 : 1) + es.wing.filter(function (g) { return g.hull > 0; }).length : 0;
    var sqAll = es && es.flag ? [].concat.apply([], c.sqMaps.slice(0, sys.length)) : [];
    var sqObj = sqAll.filter(function (T) { return T.K.objective; }), sqObjDown = sqObj.filter(function (T) { return T.dead; }).length, sqDownAll = sqAll.filter(function (T) { return T.dead; }).length;
    if (es && es.flag) r.parts.objective = Math.round(r.parts.objective * (0.5 * (sqObj.length ? sqObjDown / sqObj.length : 1) + 0.5 * sqHome / es.n));
    else if (es) r.parts.objective = outcome === "wardLost" || outcome === "leftBehind" ? 0 : Math.round(r.parts.objective * (es.kind === "convoy" ? afloat / es.ships.length : es.hull / es.hullMax));
    var hs = m.helm.stats, stopped = m.stats.salvos ? (m.stats.salvosShielded + (tu.stats.downed || 0)) / (m.stats.salvos + (tu.stats.downed || 0)) : 1;
    var made = st.breaks + st.pilotBreaks ? hs.evasiveMet / (st.breaks + st.pilotBreaks) : 1;
    var command = clamp(0.6 * stopped + 0.4 * made, 0, 1);
    // (a squadron: half of it is the share of the systems' targets destroyed)
    if (es && es.flag) command = clamp(0.5 * command + 0.5 * (sqAll.length ? sqDownAll / sqAll.length : 1), 0, 1);
    r.station = "captain";
    var cond = outcome === "destroyed" ? 0 : Math.max(0, 1 - K.hullCost * (1 - m.ship.hull / m.ship.hullMax));     // (BL.COMMAND.hullCost)
    r.parts = { objective: r.parts.objective, condition: Math.round(25 * cond), navigation: Math.round(25 * nav), command: Math.round(25 * command) };
    r.raw = r.parts.objective + r.parts.condition + r.parts.navigation + r.parts.command;
    r.score = Math.round(r.raw * Math.pow(1 - m.cfg.lookCostPct / 100, r.looks));
    r.captain = { rockHits: st.rockHits, swarms: st.swarms, calls: st.calls, breaks: st.breaks, pilotBreaks: st.pilotBreaks, breaksMade: hs.evasiveMet, taken: st.taken, unanswered: st.unanswered,
      systems: sys.map(function (s) { return { zoneAt: s.zoneAt === null ? null : Math.round(s.zoneAt), window: s.window, rockHits: s.rockHits, legs: s.legs, cps: s.cps.length, cpsHit: s.cps.filter(Boolean).length }; }),
      ships: tu.stats.ships, kills: tu.stats.kills, downed: tu.stats.downed,
      rocks: tu.stats.rocks || 0, rocksDown: tu.stats.rocksDown || 0, rockEnemy: tu.stats.rockEnemy || 0,
      // (dropping down: whether he did, and the men he replaced: roster ids for their morale, names for the debrief)
      dropped: c.dropped, replaced: c.replacedMen.map(function (x) { return x.id; }).filter(function (id) { return id !== undefined; }),
      replacedNames: c.replacedMen.map(function (x) { return x.name; }) };
    if (es && es.flag) {
      r.captain.squad = { n: es.n, home: sqHome, lost: es.wing.filter(function (g) { return g.hull <= 0 && !g.left; }).length, left: es.wing.filter(function (g) { return g.left; }).length,
        kills: st.sqKills, targets: sqAll.length, targetsDown: sqDownAll, objectives: sqObj.length, objectivesDown: sqObjDown, flagWaves: sqAll.reduce(function (a, T) { return a + T.waves; }, 0), flagBridge: st.flagBridge, flag: c.flagCaptain.name,
        flagName: c.flagName, ships: es.wing.map(function (g) { return { no: g.no, ship: g.name, name: g.cap.name, hull: Math.round(100 * g.hull / g.hullMax), kills: g.kills, left: g.left }; }) };
    } else if (c.escort) {
      r.captain.escort = { kind: es.kind, name: es.W.name, hull: Math.round(100 * es.hull / es.hullMax), ships: es.ships.length, afloat: afloat, torps: st.wardTorps, calls: st.wardCalls, covers: st.covers, covered: st.covered,
        squad: es.wing.length + 1, wingLost: es.wing.filter(function (g) { return g.hull <= 0; }).length, wingStops: st.wingStops,
        onStation: sys.map(function (s) { return s.stationT ? Math.round(100 * s.onStation / s.stationT) : 0; }) };
    }
    return r;
  };

  /* -------------------------------------------------------------- Test bot
     Plays the way an attentive captain does: takes the navigator's plot, leaves the breaks to the
     pilot's standing policy, holds SHIELDS while there are enemy ships about, puts the guns on
     HUNT, and orders the warp as soon as it's ready. (Pacing the engines to the window did no
     better than the plot's.) (opts: the old bot's habits, for comparison: answer, every burst as
     the AI captain at the helm does; suggest, the gun order the guns would suggest.) */
  function CaptainBot(opts) { this.rng = null; this.o = opts || {}; }
  BL.CaptainBot = CaptainBot;
  CaptainBot.prototype.think = function (m) {
    var c = m.captain, E = BL.HELM.evade; if (!c) return;
    this.rng = this.rng || BL.rng((m.seed ^ 0x7f4a7c15) >>> 0);
    var cv = c.callView(), o = this.o;
    if (o.answer && cv && cv.in < BL.GUNNERY.torpedo.travel + 0.5) {
      if (cv.canBreak && (m.sys("shield").mj < cv.mj * E.cover || this.rng.chance(E.chance))) c.answer(c.awayFromRocks(cv.bearing < 0 ? 1 : -1));
      else c.answer(0);
    }
    // Escort: cover a burst at the carrier when our shields can take it.
    var wv = c.wardCallView();
    var sh = m.sys("shield"), ours = c.openFish().reduce(function (a, f) { return a + f.mj; }, 0);
    if (wv && wv.canCover && wv.in < BL.GUNNERY.torpedo.travel && sh.mj >= (wv.mj + ours) * E.cover && sh.mj >= sh.maxMJ * 0.5) c.cover();
    // The crew act on orders: SHIELDS while there are enemy ships about (else BALANCE), and HUNT
    // (o.suggest: the gun order most of the guns would suggest for this fight, every few seconds).
    // (SHIELDS costs the guns, so only for the torpedoes: a burst in the air, or the shields below
    // botShields of full; o.holdShields: all fight)
    if (!this.fixedStance) {
      var up = m.waves && m.waves.some(function (w) { return !w.dead; }), shd = m.sys("shield");
      var need = o.holdShields || c.openFish().length > 0 || shd.mj < shd.maxMJ * BL.COMMAND.botShields, want = up && need ? "shields" : "balanced";
      if (c.stance !== want && c.stance !== "drive" && c.stance !== "moab") c.setStance(want);
    }
    if (m.turret && !o.suggest && c.guns !== "hunt") c.setGuns("hunt");
    if (m.turret && o.suggest && m.totalT >= (this.gunAt || 0)) {
      this.gunAt = m.totalT + 4;
      var votes = {}; m.turret.bats.forEach(function (b) { var o = m.turret.suggestOrder(b).order; votes[o] = (votes[o] || 0) + 1; });
      var best = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; })[0];
      if (best && c.guns !== best) c.setGuns(best);
    }
    // Gunboats: launch as soon as the launchers are full; recover botRecover s before the window.
    var hv2 = c.hangarView();
    if (hv2 && hv2.can && (hv2.order === "launch" ? m.t < m.windowAt() - BL.COMMAND.hangarOrder.botRecover - 20 : m.t >= m.windowAt() - BL.COMMAND.hangarOrder.botRecover)) c.orderHangar();
    // The drop (a hard deadline): flank speed when she'd reach the zone too late, the plot's engines
    // again once she's in it, and no main-gun swings in the last minute.
    // (judged only over the last 90 s: early in the system her speed says little)
    var drop = m.isDrop(), eta = drop ? c.zoneEta() : null, late = drop && !c.inZone() && m.windowIn() < 90 && eta !== null && eta > m.windowIn() - 5;
    if (late && c.engOrder !== "flank") c.orderEngines("flank");
    else if (!late && drop && c.engOrder === "flank") c.engOrder = null;
    // Main gun: swing onto the big target once it's charged, if it's within botSwing degrees of the bow (a short swing), away from the warp zone.
    if (!this.noMain && !c.inZone() && !c.callView() && !(drop && m.windowIn() < 60)) {
      var mv = c.mainView();
      if (mv && mv.can && Math.abs(norm(m.turret.bearingOf(mv.target.x, mv.target.y))) <= BL.COMMAND.mainSwing.botSwing) c.orderMain();
    }
    // A gunboat escort: to ASTERN for the carrier's recovery, botAstern s before the window.
    if (c.carrierRecovery() && c.station !== "astern" && m.windowIn() < BL.COMMAND.escort.botAstern) c.setStation("astern");
    if (!o.noJump && c.jumpView().ready && !c.jumpOrdered) c.orderJump();     // (o.noJump: a flag captain; the squadron commander orders the warp)
  };

  /* The squadron test's commander bot: the navigator's plot, LINE AHEAD, and every other ship sent
     to the system's objective (once it's known), then the nearest target to the flagship (a planet
     buster mission: only one that comes near her); a ship
     down below `retire` of her hull comes back to formation. The warp as soon as it's ready. Its
     flag captain is the captain test bot (noJump). (opts.form: a formation to hold; opts.idle:
     no orders, every ship in formation, for comparison; opts.retire.) */
  function SquadBot(opts) { this.o = opts || {}; this.flag = new CaptainBot({ noJump: true }); }
  BL.SquadBot = SquadBot;
  SquadBot.prototype.think = function (m) {
    var c = m.captain, o = this.o; if (!c || !c.escort || !c.escort.flag || !c.pos) return;
    this.flag.think(m);
    if (o.form && c.escort.form !== o.form) c.setFormation(o.form);
    if (!o.idle && m.totalT >= (this.tAt || 0) && (m.phase === "engage" || m.phase === "arrival")) {
      this.tAt = m.totalT + 2;
      var gs = c.sqGroups().filter(function (T) { return !T.unknown || T.seen; }), obj = gs.filter(function (T) { return T.K.objective; })[0], near = null, nd = Infinity;
      gs.forEach(function (T) { var d = dist(c.shownAt(T), c.pos); if (d < nd) { nd = d; near = T; } });
      // (a planet buster mission only has to get through: it fights only what comes within `threat` x
      // our guns' range of the flagship)
      var busterRun = !!m.sys("buster"), reach = BL.COMMAND.squad.map.range * c.cs() * BL.COMMAND.squad.map.buster.threat;
      if (busterRun && nd > reach) near = null;
      var aim = obj || near, retire = o.retire === undefined ? 0.35 : o.retire;
      c.sqLive().forEach(function (g) {
        var ord = c.orderOf(g);
        if (g.hull / g.hullMax < retire) { if (ord.kind !== "form") c.recall([g.no]); return; }
        if (busterRun && !aim && ord.kind === "target") { c.recall([g.no]); return; }
        if (aim && (ord.kind !== "target" || ord.id !== aim.id) && !c.jumpOrdered) c.sendTo([g.no], aim.id);
      });
    }
    // (the warp waits for the objective, as a commander would, unless the flagship is badly hurt,
    // or for 90 s after it could go)
    var standing = c.sqGroups().some(function (T) { return T.K.objective; }), ready = c.jumpView().ready;
    if (!ready) this.readyAt = null; else if (this.readyAt == null) this.readyAt = m.totalT;
    if (ready && !c.jumpOrdered && (o.idle || !standing || m.ship.hull < 0.3 * m.ship.hullMax || m.isDrop() || m.totalT - this.readyAt > 90)) c.orderJump();
  };
  BL.runCaptainHeadless = function (seed, classId, tl, idle, extra) {
    classId = classId || "destroyer";
    var rc = BL.GUNNERY.ring.classes[classId];
    var m = new BL.Mission(Object.assign({ seed: seed, quiet: true, classId: classId, tl: tl, helm: true, captain: true,
      gunner: { weapons: BL.GUNNERY.loadout[classId], ring: true, arcs: rc.arcs, arcNames: rc.arcNames, helm: true } }, extra));
    var en = m.turret.engineer, eng = new BL.AIEngineer(en.temperK === undefined ? 0.5 : en.temperK, 0.25, en.skill), bot = m.flag ? new SquadBot(extra && extra.bot) : new CaptainBot(extra && extra.bot);
    if (extra && extra.noMain) (bot.flag || bot).noMain = true;      // (tests: the main gun on standing orders only)
    if (extra && extra.stance) { m.captain.stance = m.captain.stanceOn = extra.stance; (bot.flag || bot).fixedStance = true; }     // (tests: a standing stance other than balanced, held all mission)
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
