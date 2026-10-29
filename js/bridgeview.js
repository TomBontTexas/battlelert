/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* The captain's system map (command.js), drawn on a canvas: north up, the arrival point, the
   jump zone, asteroid fields (grey) and enemy clusters (red), the plotted legs with their
   waypoints, and the ship. Used by the plotting screen in warp space and the bridge's map panel. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var RAD = Math.PI / 180;

  // The map's frame on a w x h canvas: { s, toPx(p), toMap(x, y) }. view (zoom and pan, the
  // bridge map): { z: times the whole-map scale, dx, dy: its centre moved, in map units }.
  BL.navFrame = function (map, plot, w, h, pad, view) {
    pad = pad === undefined ? 18 : pad;
    var xs = [map.start.x, map.jump.x - map.jump.r, map.jump.x + map.jump.r], ys = [map.start.y, map.jump.y - map.jump.r, map.jump.y + map.jump.r];
    map.rocks.concat(map.clusters).forEach(function (o) { xs.push(o.x - o.r, o.x + o.r); ys.push(o.y - o.r, o.y + o.r); });
    (plot ? plot.pts : []).forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var span = Math.max(x1 - x0, y1 - y0, 1) * 1.08, s = Math.min(w - 2 * pad, h - 2 * pad) / span;
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (view) { s *= view.z; cx += view.dx; cy += view.dy; }
    return {
      s: s,
      toPx: function (p) { return { x: w / 2 + (p.x - cx) * s, y: h / 2 - (p.y - cy) * s }; },
      toMap: function (x, y) { return { x: cx + (x - w / 2) / s, y: cy - (y - h / 2) / s }; }
    };
  };

  // opts: { pos, hdg (the ship), leg (the leg she's on), info (BL.plotInfo), small (the bridge
  // panel), steer (the heading the helm is steering), frame (reuse) }.
  BL.drawNavMap = function (ctx, w, h, map, plot, opts) {
    opts = opts || {};
    var f = opts.frame || BL.navFrame(map, plot, w, h, opts.small ? 10 : 18), P = f.toPx, s = f.s, small = !!opts.small;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#05080c"; ctx.fillRect(0, 0, w, h);
    // A faint grid, a tenth of the way to the jump point apart.
    var step = map.D / 10, o0 = f.toMap(0, h), o1 = f.toMap(w, 0);
    ctx.strokeStyle = "rgba(127,184,255,.07)"; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = Math.floor(o0.x / step) * step; gx <= o1.x; gx += step) { var px = P({ x: gx, y: 0 }).x; ctx.moveTo(px, 0); ctx.lineTo(px, h); }
    for (var gy = Math.floor(o0.y / step) * step; gy <= o1.y; gy += step) { var py = P({ x: 0, y: gy }).y; ctx.moveTo(0, py); ctx.lineTo(w, py); }
    ctx.stroke();
    // North.
    ctx.fillStyle = "rgba(200,215,230,.55)"; ctx.font = (small ? 10 : 12) + "px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText("N ↑", w - 6, 5);
    // Enemy clusters and asteroid fields.
    map.clusters.forEach(function (o) {
      var c = P(o);
      ctx.fillStyle = "rgba(255,77,77,.13)"; ctx.strokeStyle = "rgba(255,77,77,.7)"; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(c.x, c.y, o.r * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      if (!small) { ctx.fillStyle = "rgba(255,120,120,.9)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("ENEMY", c.x, c.y); }
    });
    // Each field is overlapping lobes: its outline is the lobes a little larger in the edge colour,
    // then the lobes on top in the (solid) fill colour, so only the outer edge shows.
    map.rocks.forEach(function (o, i) {
      var lobes = o.lobes || [o];
      [[1.2, "#747577"], [0, "#25272a"]].forEach(function (ring) {
        ctx.fillStyle = ring[1]; ctx.beginPath();
        lobes.forEach(function (l) { var c = P(l); ctx.moveTo(c.x + l.r * s + ring[0], c.y); ctx.arc(c.x, c.y, l.r * s + ring[0], 0, Math.PI * 2); });
        ctx.fill();
      });
      // a few rocks inside each lobe, the same each time
      ctx.fillStyle = "rgba(200,200,200,.55)";
      lobes.forEach(function (l, j) {
        var c = P(l), r = l.r * s;
        for (var k = 0; k < 5; k++) {
          var a = (i * 2.4 + j * 1.3 + k * 2.1) % (Math.PI * 2), d = r * (0.15 + ((k * 37 + i * 11 + j * 23) % 65) / 100);
          ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, Math.max(1, r * 0.1 + (k % 3) * 0.6), 0, Math.PI * 2); ctx.fill();
        }
      });
    });
    // The jump zone.
    var jc = P(map.jump);
    ctx.strokeStyle = "rgba(61,255,122,.85)"; ctx.fillStyle = "rgba(61,255,122,.12)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(jc.x, jc.y, map.jump.r * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (!small) { ctx.fillStyle = "rgba(61,255,122,.95)"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("JUMP ZONE", jc.x, jc.y + map.jump.r * s + 3); }
    // The plotted legs: done ones dim, the rest bright; red through a field, amber through a cluster.
    var pts = plot ? plot.pts : [], info = opts.info;
    for (var k2 = 0; k2 < pts.length - 1; k2++) {
      var a2 = P(pts[k2]), b2 = P(pts[k2 + 1]), lg = info && info.legs[k2];
      ctx.strokeStyle = lg && lg.rocks ? "#ff4d4d" : lg && lg.clusters ? "#f0b54a" : opts.leg !== undefined && k2 < opts.leg ? "rgba(127,184,255,.35)" : "#7fb8ff";
      ctx.lineWidth = small ? 1.5 : 2; ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      if (!small && lg) {     // the leg's heading beside its middle
        var mx = (a2.x + b2.x) / 2, my = (a2.y + b2.y) / 2, nx = -(b2.y - a2.y), ny = b2.x - a2.x, nl = Math.hypot(nx, ny) || 1;
        ctx.fillStyle = "rgba(200,225,255,.95)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText((k2 + 1) + ": " + BL.hdgText(lg.hdg), mx + nx / nl * 16, my + ny / nl * 16);
      }
    }
    pts.forEach(function (p, i) {
      if (!i || i === pts.length - 1) return;
      var c = P(p);
      ctx.fillStyle = opts.leg !== undefined && i <= opts.leg ? "rgba(127,184,255,.4)" : "#cfe3ff";
      ctx.beginPath(); ctx.arc(c.x, c.y, small ? 2.5 : 5, 0, Math.PI * 2); ctx.fill();
    });
    // Where she comes out of warp space, and her heading then.
    var sc = P(map.start);
    ctx.strokeStyle = "#cfe3ff"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sc.x, sc.y, small ? 3 : 6, 0, Math.PI * 2); ctx.stroke();
    if (!opts.pos) drawShip(ctx, sc, map.start.hdg, small ? 6 : 10, "rgba(207,227,255,.6)");
    // The ship and the heading the helm is steering.
    if (opts.pos) {
      var sp = P(opts.pos);
      if (opts.steer !== undefined && opts.steer !== null) {
        ctx.strokeStyle = "rgba(255,214,102,.7)"; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp.x + Math.sin(opts.steer * RAD) * 26, sp.y - Math.cos(opts.steer * RAD) * 26); ctx.stroke(); ctx.setLineDash([]);
      }
      drawShip(ctx, sp, opts.hdg || 0, small ? 7 : 11, "#ffd666");
    }
  };
  function drawShip(ctx, c, hdg, len, color) {
    var a = hdg * RAD, sx = Math.sin(a), cy = -Math.cos(a), px = -cy, py = sx;
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(c.x + sx * len, c.y + cy * len);
    ctx.lineTo(c.x - sx * len * 0.6 + px * len * 0.5, c.y - cy * len * 0.6 + py * len * 0.5);
    ctx.lineTo(c.x - sx * len * 0.3, c.y - cy * len * 0.3);
    ctx.lineTo(c.x - sx * len * 0.6 - px * len * 0.5, c.y - cy * len * 0.6 - py * len * 0.5);
    ctx.closePath(); ctx.fill();
  }
})(typeof window !== "undefined" ? window : globalThis);
