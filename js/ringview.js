/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert gunner station, ring view: draws the ship in the center, its oval shield, the
   guns on the rim and the enemies coming in from every side. Reads the turret, changes nothing. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var stars = null;
  var BOLT = { pulse: "#7bffb0", rail: "#d8f4ff", ion: "#c49bff" };
  var SHIP_ART = { raiders: "raider", interceptors: "interceptor", siege: "siege", hunters: "hunter", frigate: "frigate" };
  var TURRET_ART = { pulse: "turretPulse", rail: "turretRail", ion: "turretIon" };

  BL.drawRing = function (c, S, m, tu, now) {
    var R = tu.R, t = m.totalT, sprite = BL.sprite;
    if (!stars) { stars = []; for (var i = 0; i < 160; i++) stars.push({ x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75 }); }
    c.save();
    c.fillStyle = "#03060b"; c.fillRect(0, 0, S, S);
    // Shake: a jolt for a shield hit, a hard shake for a hull hit.
    var lastHull = null, lastShield = null;
    tu.effects.forEach(function (f) {
      if (f.type === "hullHit" && (!lastHull || f.at > lastHull.at)) lastHull = f;
      if (f.type === "shieldHit" && (!lastShield || f.at > lastShield.at)) lastShield = f;
    });
    var shake = 0;
    if (lastHull) shake = Math.max(shake, Math.max(0, 0.55 - (t - lastHull.at)) * 46);
    if (lastShield) shake = Math.max(shake, Math.max(0, 0.3 - (t - lastShield.at)) * 34);
    if (shake > 0) c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    var live = tu.live();
    stars.forEach(function (st) {
      var y = (st.y + (live ? now * 0.00004 * st.z : 0)) % 1;
      c.fillStyle = "rgba(200,220,255," + (0.25 + st.z * 0.6).toFixed(2) + ")";
      c.fillRect(st.x * S, y * S, st.z * 1.8, st.z * 1.8 + (live ? st.z * 2 : 0));
    });
    c.scale(S, S);
    c.lineWidth = 1.5 / S;
    var sel = tu.bat();

    // The gun you hold: its track lit on the rim (only where it can go; all the way round for an
    // all-round gun), and how far its bolts reach.
    c.strokeStyle = "rgba(76,195,238,0.35)"; c.lineWidth = 6 / S;
    c.beginPath();
    var tl = Math.min(180, sel.arcH);
    for (var a = -tl; a <= tl; a += 5) { var p = tu.rim(sel.arcC + a); if (a === -tl) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); }
    if (tl >= 180) c.closePath();
    c.stroke(); c.lineWidth = 1.5 / S;
    var reach = tu.reach(sel);
    c.strokeStyle = "rgba(240,181,74,0.28)"; c.setLineDash([0.01, 0.012]);
    c.beginPath();
    var lo = sel.arcH >= 180 ? -180 : -sel.arcH, hi = sel.arcH >= 180 ? 180 : sel.arcH;
    for (var a2 = lo; a2 <= hi; a2 += 4) {
      var q = tu.rim(sel.arcC + a2), px = q.x + q.nx * reach, py = q.y + q.ny * reach;
      if (a2 === lo) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke(); c.setLineDash([]);

    // Enemy ships, noses toward us.
    tu.ships.forEach(function (s) {
      if (s.dead) return;
      var leaving = s.state === "leave", sp = sprite(SHIP_ART[s.type]);
      c.save(); c.translate(s.x, s.y); c.rotate(s.rot);
      c.globalAlpha = leaving ? 0.45 : 1;
      var flash = t - s.flashAt < 0.08;
      if (sp) {
        var dw = s.w * 1.06, dh = dw * sp.aspect;
        c.drawImage(sp.cv, -dw / 2, -dh / 2, dw, dh);
        if (flash) { c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.7; c.drawImage(sp.cv, -dw / 2, -dh / 2, dw, dh); c.globalCompositeOperation = "source-over"; }
      } else { c.fillStyle = flash ? "#fff" : "#ff7a45"; c.fillRect(-s.w / 2, -s.h / 2, s.w, s.h); }
      c.globalAlpha = 1;
      if (t < s.ionUntil) { c.strokeStyle = "rgba(196,155,255," + (0.5 + 0.5 * Math.random()).toFixed(2) + ")"; c.lineWidth = 3 / S; c.beginPath(); c.arc(0, 0, Math.max(s.w, s.h) * 0.6, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1.5 / S; }
      if (s.chargeAt > m.t && !leaving) {        // about to fire: red glow at the nose, closing ring
        var span = Math.max(0.5, s.chargeAt - s.chargeFrom), pr = Math.min(1, Math.max(0, 1 - (s.chargeAt - m.t) / span));
        var ny = s.h / 2, gr = 0.012 + 0.02 * pr + 0.004 * Math.sin(t * (10 + 20 * pr));
        var cg = c.createRadialGradient(0, ny, 0, 0, ny, gr * 2.2);
        cg.addColorStop(0, "rgba(255,240,220," + (0.6 + 0.4 * pr).toFixed(2) + ")"); cg.addColorStop(0.35, "rgba(255,70,50,0.85)"); cg.addColorStop(1, "rgba(255,40,30,0)");
        c.fillStyle = cg; c.beginPath(); c.arc(0, ny, gr * 2.2, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(255,90,70,0.9)"; c.lineWidth = 2 / S;
        c.beginPath(); c.arc(0, ny, 0.03, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (1 - pr)); c.stroke(); c.lineWidth = 1.5 / S;
      }
      c.restore();
      if (s.hp < s.hpMax - 0.01 && !leaving) {   // damage bar, kept level
        var bw = s.w * 0.9, fr = Math.max(0, s.hp / s.hpMax), by = s.y - Math.max(s.w, s.h) * 0.6;
        c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(s.x - bw / 2, by, bw, 0.008);
        c.fillStyle = fr > 0.5 ? "#63d48f" : fr > 0.25 ? "#f0b54a" : "#ff6b5a"; c.fillRect(s.x - bw / 2, by, bw * fr, 0.008);
      }
    });

    // Torpedoes heading for the shield.
    var tsp = sprite("torpedo");
    tu.torps.forEach(function (tp) {
      var dx = tp.x1 - tp.x0, dy = tp.y1 - tp.y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      c.strokeStyle = "rgba(255,90,70,0.25)"; c.setLineDash([0.006, 0.01]);
      c.beginPath(); c.moveTo(tp.x, tp.y); c.lineTo(tp.x1, tp.y1); c.stroke(); c.setLineDash([]);
      var r = tu.G.torpedo.size * (tp.weak ? 0.75 : 1);
      if (tsp) { var tw = r * 1.7, th = tw * tsp.aspect; c.save(); c.translate(tp.x, tp.y); c.rotate(Math.atan2(uy, ux) - Math.PI / 2); c.globalAlpha = tp.weak ? 0.7 : 1; c.drawImage(tsp.cv, -tw / 2, -th * 0.78, tw, th); c.restore(); }
      else { c.fillStyle = "#ff6a3d"; c.beginPath(); c.arc(tp.x, tp.y, r, 0, Math.PI * 2); c.fill(); }
      if (tp.t1 - m.t < 1.2) { c.strokeStyle = Math.floor(t * 8) % 2 ? "rgba(255,90,70,0.9)" : "rgba(255,90,70,0.3)"; c.beginPath(); c.arc(tp.x1, tp.y1, 0.02, 0, Math.PI * 2); c.stroke(); }
    });

    // Our torpedoes, and brackets on what each one is locked onto.
    var pts = sprite("ptTorpedo");
    tu.ptTorps.forEach(function (tp) {
      if (tp.target && !tp.target.dead) {
        var s = tp.target, bx = Math.max(s.w, s.h) * 0.55, k = 0.025;
        c.strokeStyle = Math.floor(t * 6) % 2 ? "rgba(255,107,90,0.95)" : "rgba(255,107,90,0.45)"; c.lineWidth = 2.5 / S;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
          var x = s.x + q[0] * bx, y = s.y + q[1] * bx;
          c.beginPath(); c.moveTo(x - q[0] * k, y); c.lineTo(x, y); c.lineTo(x, y - q[1] * k); c.stroke();
        });
        c.lineWidth = 1.5 / S;
      }
      c.save(); c.translate(tp.x, tp.y); c.rotate(tp.a + Math.PI / 2);
      if (pts) { var pw = 0.026, ph = pw * pts.aspect; c.drawImage(pts.cv, -pw / 2, -ph * 0.4, pw, ph); }
      else { c.fillStyle = "#d6dee5"; c.fillRect(-0.005, -0.016, 0.01, 0.032); }
      c.restore();
    });

    // Bolts; past their reach (pulse cannons) they fade as they weaken.
    tu.bolts.forEach(function (b) {
      var bw = b.weaponId, col = BOLT[bw] || "#fff", len = bw === "rail" ? 0.07 : 0.022, bt = tu.bats[b.bat], rch = tu.reach(bt);
      var fade = b.dist > rch && bt.w.long ? Math.max(0.2, 0.6 - 0.4 * (b.dist - rch) / bt.w.long.extra) : 1;
      c.strokeStyle = col; c.fillStyle = col; c.globalAlpha = (b.mine === false ? 0.7 : 1) * fade;
      if (bw === "ion") { c.beginPath(); c.arc(b.x, b.y, 0.008, 0, Math.PI * 2); c.fill(); }
      else { c.lineWidth = 3 / S; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - (b.vx || 0) * len, b.y - (b.vy || 0) * len); c.stroke(); c.lineWidth = 1.5 / S; }
      c.globalAlpha = 1;
    });

    // Effects.
    tu.effects.forEach(function (f) {
      var a = t - f.at;
      if (f.type === "boom") {
        var rr = (f.size || 0.08) * (0.4 + a * 2.2), al = Math.max(0, 1 - a / 0.9);
        var g2 = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        g2.addColorStop(0, "rgba(255,255,220," + al + ")"); g2.addColorStop(0.5, "rgba(255,150,60," + al * 0.8 + ")"); g2.addColorStop(1, "rgba(255,60,30,0)");
        c.fillStyle = g2; c.beginPath(); c.arc(f.x, f.y, rr, 0, Math.PI * 2); c.fill();
      } else if (f.type === "torpBoom" && a < 0.5) {
        c.strokeStyle = "rgba(255,220,150," + (1 - a / 0.5) + ")"; c.beginPath(); c.arc(f.x, f.y, 0.01 + a * 0.12, 0, Math.PI * 2); c.stroke();
      } else if (f.type === "spark" && a < 0.18) {
        c.fillStyle = BOLT[f.weapon] || "#fff"; c.globalAlpha = 1 - a / 0.18;
        c.beginPath(); c.arc(f.x, f.y, 0.008 + a * 0.06, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      } else if (f.type === "fizzle" && a < 0.25) {
        c.fillStyle = "rgba(240,181,74," + (0.6 - a * 2.4) + ")"; c.fillRect(f.x - 0.004, f.y - 0.004, 0.008, 0.008);
      }
    });

    // Our ship in the center.
    var ssp = sprite(m.data.classId === "gunboat" ? "gunboat" : "warship:" + m.data.classId);
    if (ssp) { var sh = R.shipH, sw = sh / ssp.aspect; c.drawImage(ssp.cv, R.cx - sw / 2, R.cy - sh / 2, sw, sh); }

    drawShield(c, S, m, tu, t, lastShield, lastHull);

    // Guns on the rim, barrels pointing out; yours bright.
    tu.bats.forEach(function (bt, i) {
      var own = i === tu.sel, bg = tu.gun(bt), ready = bg && bg.mj >= bt.w.shotMJ, sp2 = sprite(TURRET_ART[bt.weaponId]);
      c.save(); c.translate(bt.x, bt.y); c.rotate(Math.atan2(bt.nx, -bt.ny));
      if (sp2) {
        var ww = R.gunSize, wh = ww * sp2.aspect, baseFrac = (60 - sp2.vb[1]) / sp2.vb[3];
        c.globalAlpha = (ready ? 1 : 0.6) * (own ? 1 : 0.55);
        c.drawImage(sp2.cv, -ww / 2, 0.012 - wh * baseFrac, ww, wh);
        c.globalAlpha = 1;
      }
      c.restore();
      // label just outside the rim, in pixels
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); var dpr = c.canvas.width / S; c.scale(dpr, dpr);
      c.font = "700 " + Math.round(S * 0.02) + "px system-ui, sans-serif"; c.textAlign = "center";
      c.fillStyle = own ? "#4cc3ee" : "rgba(214,224,232,0.55)";
      var lx = bt.x + bt.nx * (R.gunSize + 0.02), ly = bt.y + bt.ny * (R.gunSize + 0.02) + 0.006;
      c.fillText((own ? "GUN " : "AI ") + bt.gunNo, lx * S, ly * S);
      c.restore();
    });

    // Your gun's line of fire, out to its reach.
    var ready2 = tu.gun().mj >= sel.w.shotMJ, ex = sel.x + sel.nx * reach, ey = sel.y + sel.ny * reach;
    c.strokeStyle = ready2 ? "rgba(123,224,166,0.8)" : "rgba(255,107,90,0.7)";
    c.setLineDash([0.004, 0.014]); c.beginPath(); c.moveTo(sel.x + sel.nx * 0.04, sel.y + sel.ny * 0.04); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(ex, ey, 0.016, 0, Math.PI * 2); c.stroke();
    // The target you clicked, bracketed until your gun is on it.
    if (sel.seek) {
      var sk = sel.seek, sr = sk.w ? Math.max(sk.w, sk.h) * 0.6 : 0.03;
      c.strokeStyle = "rgba(76,195,238,0.9)"; c.lineWidth = 2 / S;
      for (var q = 0; q < 4; q++) { c.beginPath(); c.arc(sk.x, sk.y, sr, q * Math.PI / 2 + 0.25, q * Math.PI / 2 + Math.PI / 2 - 0.25); c.stroke(); }
    }
    c.restore();
  };

  // The oval shield: brighter with more charge, flickering when low; flares, ripples and wobbles
  // where a torpedo strikes; cracks and floods the view red on a hull hit.
  function drawShield(c, S, m, tu, t, lastShield, lastHull) {
    var R = tu.R, sys = m.sys("shield"), frac = sys ? Math.max(0, Math.min(1, sys.mj / sys.maxMJ)) : 0;
    var ageS = lastShield ? t - lastShield.at : 9, ageH = lastHull ? t - lastHull.at : 9, age = Math.min(ageS, ageH);
    var wob = Math.max(0, 0.7 - age) / 0.7, ph = age * 38;
    var rx = R.rx * (1 + 0.04 * wob * Math.sin(ph + 1)), ry = R.ry * (1 + 0.04 * wob * Math.sin(ph));
    var flick = frac < 0.3 ? (Math.random() < 0.35 ? 0.25 : 1) : 1;
    function oval() { c.beginPath(); c.ellipse(R.cx, R.cy, rx, ry, 0, 0, Math.PI * 2); }
    var g = c.createRadialGradient(R.cx, R.cy, Math.min(rx, ry) * 0.4, R.cx, R.cy, ry);
    g.addColorStop(0, "rgba(76,195,238,0)");
    g.addColorStop(1, "rgba(120,220,255," + ((0.06 + 0.14 * frac) * flick).toFixed(3) + ")");
    c.fillStyle = g; oval(); c.fill();
    c.save(); oval(); c.clip();
    c.strokeStyle = "rgba(160,235,255," + (0.12 * frac * flick).toFixed(3) + ")"; c.lineWidth = 1 / S;
    for (var k = 0; k < 4; k++) { var off = ((t * 0.06 + k / 4) % 1); c.beginPath(); c.ellipse(R.cx, R.cy, rx * (0.5 + 0.5 * off), ry * (0.5 + 0.5 * off), 0, 0, Math.PI * 2); c.stroke(); }
    if (age < 0.6) {
      var f = ageS <= ageH ? lastShield : lastHull, hull = f === lastHull, a = 1 - age / 0.6, big = Math.min(1.6, 0.6 + (f.mj || 30) / 60);
      c.fillStyle = hull ? "rgba(255,80,60," + (0.4 * a).toFixed(3) + ")" : "rgba(200,245,255," + (0.3 * a * big).toFixed(3) + ")";
      c.fillRect(0, 0, 1, 1);
      for (var r = 0; r < 3; r++) {
        c.strokeStyle = hull ? "rgba(255,120,90," + (a * 0.9).toFixed(3) + ")" : "rgba(220,250,255," + (a * 0.9).toFixed(3) + ")";
        c.lineWidth = (4 - r) / S; c.beginPath(); c.arc(f.x, f.y, 0.02 + (age + r * 0.06) * 0.5, 0, Math.PI * 2); c.stroke();
      }
    }
    c.restore();
    var rimA = (0.4 + 0.5 * frac) * flick + (age < 0.5 ? (1 - age / 0.5) * 0.8 : 0);
    c.strokeStyle = ageH < 0.5 ? "rgba(255,110,90," + Math.min(1, rimA).toFixed(3) + ")" : "rgba(130,225,255," + Math.min(1, rimA).toFixed(3) + ")";
    // The shield's bright edge shows only along the arc of the gun you hold.
    var sel = tu.bat(), tl = Math.min(180, sel.arcH);
    c.lineWidth = (2.5 + (age < 0.5 ? 3 * (1 - age / 0.5) : 0)) / S;
    if (tl >= 180) { oval(); c.stroke(); }
    else {
      c.beginPath();
      for (var e = -tl; e <= tl; e += 3) {
        var ph2 = (sel.arcC + e) * Math.PI / 180, ex = R.cx + rx * Math.sin(ph2), ey = R.cy - ry * Math.cos(ph2);
        if (e === -tl) c.moveTo(ex, ey); else c.lineTo(ex, ey);
      }
      c.stroke();
    }
    c.lineWidth = 1.5 / S;
    if (ageH < 1.2) {
      var ah = 1 - ageH / 1.2, seed = Math.floor(lastHull.at * 1000), cx0 = lastHull.x, cy0 = lastHull.y;
      var inward = Math.atan2(R.cy - cy0, R.cx - cx0);
      c.strokeStyle = "rgba(255,230,220," + ah.toFixed(3) + ")"; c.lineWidth = 2 / S;
      for (var q = 0; q < 6; q++) {
        var ang = inward + (q - 2.5) * 0.45 + ((seed * (q + 3)) % 7 - 3) * 0.04, x = cx0, y = cy0;
        c.beginPath(); c.moveTo(x, y);
        for (var st = 0; st < 4; st++) { x += Math.cos(ang) * 0.025 + (((seed >> st) % 5) - 2) * 0.003; y += Math.sin(ang) * 0.025; c.lineTo(x, y); }
        c.stroke();
      }
      c.lineWidth = 1.5 / S;
      var vg = c.createRadialGradient(0.5, 0.5, 0.25, 0.5, 0.5, 0.75);
      vg.addColorStop(0, "rgba(255,0,0,0)"); vg.addColorStop(1, "rgba(255,20,10," + (0.55 * ah).toFixed(3) + ")");
      c.fillStyle = vg; c.fillRect(0, 0, 1, 1);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
