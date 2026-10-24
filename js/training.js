/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Pilot training (Oct 24, 2026, TexasBont): an endless buoy course on any ship the pilot is
   qualified on. No enemies, no captain's orders, no reputation, nothing saved: just the helm.
   Red buoys are kept to port (on your left), green to starboard. The ship flies over a map
   (battle units, x east, y north); the buoys sit on it, and the ring view draws them around the ship. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var RAD = Math.PI / 180;

  function Trainer(m) {
    var T = BL.TRAINING, C = m.helm.C, R = m.turret.R;
    this.m = m; this.rng = BL.rng((m.seed ^ 0x7a1b3c) >>> 0);
    this.x = 0; this.y = 0;
    // Spacing: seconds at cruise between buoys, longer for ships that turn slowly; never under a few ship lengths.
    this.gap = Math.max(T.lengths * R.ry * 2, T.vStd * 0.5 * Math.min(T.gapMax, Math.max(T.gapMin, T.gapBase + T.gapPerSafe / C.safe)));
    this.off = R.rx + T.clear;                   // a buoy sits this far beside the course line
    this.buoys = []; this.done = [];
    this.stats = { passed: 0, wrong: 0, hit: 0, missed: 0, streak: 0, best: 0 };
    this.lay(m.helm.compass());
  }
  BL.Trainer = Trainer;

  // A fresh course ahead of the ship (at the start, and after the pilot wanders off it).
  Trainer.prototype.lay = function (hdg) {
    this.buoys = [];
    this.px = this.x + Math.sin(hdg * RAD) * this.gap * 0.6; this.py = this.y + Math.cos(hdg * RAD) * this.gap * 0.6;
    this.ph = hdg; this.side = this.rng.chance(0.5) ? 1 : -1;
    while (this.buoys.length < BL.TRAINING.ahead) this.addBuoy();
  };
  Trainer.prototype.addBuoy = function () {
    var T = BL.TRAINING, r = this.rng;
    if (this.buoys.length || this.done.length) {
      // The course bends a little each buoy, mostly the other way from the last bend.
      if (r.chance(0.7)) this.side = -this.side;
      this.ph = (this.ph + this.side * r.range(T.bend) + 360) % 360;
      this.px += Math.sin(this.ph * RAD) * this.gap; this.py += Math.cos(this.ph * RAD) * this.gap;
    }
    var red = r.chance(0.5), k = red ? -1 : 1;      // red: on the pilot's left as he passes; green: on his right
    var rx = Math.cos(this.ph * RAD), ry = -Math.sin(this.ph * RAD);    // the course's right-hand side
    this.buoys.push({ x: this.px + k * this.off * rx, y: this.py + k * this.off * ry, dir: this.ph, red: red, hit: false, prev: null, far: 0 });
  };
  Trainer.prototype.next = function () { return this.buoys[0] || null; };

  Trainer.prototype.step = function (dt) {
    var m = this.m, h = m.helm, T = BL.TRAINING;
    if (h.inTube) return;
    var hdg = h.compass(), v = h.speed / Math.max(0.1, h.gOf("standard")) * T.vStd;
    this.x += Math.sin(hdg * RAD) * v * dt; this.y += Math.cos(hdg * RAD) * v * dt;
    var b = this.next(); if (!b) return;
    var dx = this.x - b.x, dy = this.y - b.y, fx = Math.sin(b.dir * RAD), fy = Math.cos(b.dir * RAD);
    var along = dx * fx + dy * fy, lat = dx * fy - dy * fx;          // lat > 0: the ship is right of the buoy
    // Hit: the buoy inside the hull's oval.
    var R = m.turret.R, bx = -dx, by = -dy, s = Math.sin(hdg * RAD), c = Math.cos(hdg * RAD);
    var side = bx * c - by * s, fwd = bx * s + by * c;
    if (!b.hit && Math.pow(side / R.rx, 2) + Math.pow(fwd / R.ry, 2) <= 1) { b.hit = true; m.cue("hullHit"); }
    // Through the gate line (square to the course at the buoy): which side was it passed on?
    if (b.prev !== null && b.prev < 0 && along >= 0) {
      var right = b.red ? lat > 0 : lat < 0, wide = Math.abs(lat) > this.off * T.wide + R.rx;
      this.score(b, b.hit ? "hit" : wide ? "missed" : right ? "passed" : "wrong");
      return;
    }
    b.prev = along;
    // Wandered off: well past the buoy's distance and still opening: the course starts again ahead.
    var dist = Math.hypot(dx, dy);
    b.far = dist > this.gap * T.lost && dist > (b.lastDist || 0) ? b.far + dt : 0;
    b.lastDist = dist;
    if (b.far > 3) { this.score(b, "missed"); this.lay(hdg); }
  };
  Trainer.prototype.score = function (b, how) {
    var s = this.stats;
    s[how]++;
    if (how === "passed") { s.streak++; s.best = Math.max(s.best, s.streak); this.m.cue("tick"); }
    else { s.streak = 0; this.m.cue("warn"); }
    this.done.push({ x: b.x, y: b.y, red: b.red, how: how });
    if (this.done.length > 12) this.done.shift();
    this.buoys.shift();
    while (this.buoys.length < BL.TRAINING.ahead) this.addBuoy();
  };
  Trainer.prototype.total = function () { var s = this.stats; return s.passed + s.wrong + s.hit + s.missed; };
  // The rating: the share of buoys passed on the right side without touching them.
  Trainer.prototype.rating = function () {
    var n = this.total(), p = n ? this.stats.passed / n : 0, bands = BL.TRAINING.ratings;
    for (var i = 0; i < bands.length; i++) if (p >= bands[i][0]) return { pct: Math.round(p * 100), name: n ? bands[i][1] : "—" };
    return { pct: 0, name: "—" };
  };
  // The next buoy as the pilot sees it: bearing from the bow (degrees), seconds away at this speed.
  Trainer.prototype.nextView = function () {
    var b = this.next(), h = this.m.helm; if (!b) return null;
    var dx = b.x - this.x, dy = b.y - this.y, brg = Math.atan2(dx, dy) / RAD;
    var v = Math.max(0.005, h.speed / Math.max(0.1, h.gOf("standard")) * BL.TRAINING.vStd);
    return { red: b.red, rel: ((brg - h.compass()) % 360 + 540) % 360 - 180, secs: Math.hypot(dx, dy) / v };
  };
  // Map to the ring view (battle units around the ship, bow up).
  Trainer.prototype.toView = function (x, y) {
    var R = this.m.turret.R, hdg = this.m.helm.compass() * RAD, dx = x - this.x, dy = y - this.y;
    return { x: R.cx + dx * Math.cos(hdg) - dy * Math.sin(hdg), y: R.cy - (dx * Math.sin(hdg) + dy * Math.cos(hdg)) };
  };
})(typeof window !== "undefined" ? window : globalThis);
