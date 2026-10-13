/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert gunner station: draws the turret's view on a canvas. Reads the turret and the
   mission, changes nothing. Placeholder art, all drawn with canvas paths. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  var stars = null;
  // Approved art (art.js), rasterized once into small canvases so drawing stays cheap.
  var sprites = {};
  var SHIP_ART = { raiders: "raider", interceptors: "interceptor", siege: "siege", hunters: "hunter", frigate: "frigate" };
  var TURRET_ART = { pulse: "turretPulse", rail: "turretRail", ion: "turretIon" };
  function sprite(name) {
    var s = sprites[name];
    if (s) return s.ready ? s : null;
    var parts = name.split(":"), fn = parts[0];
    if (!BL.ART || !BL.ART[fn]) return null;
    var text = BL.ART[fn](parts[1]), m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(text);
    var vw = +m[3], vh = +m[4], W = 320, H = Math.round(W * vh / vw);
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    s = sprites[name] = { ready: false, cv: cv, aspect: vh / vw, vb: [+m[1], +m[2], vw, vh] };
    var img = new Image();
    img.onload = function () { cv.getContext("2d").drawImage(img, 0, 0, W, H); s.ready = true; };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
    return null;
  }
  BL.sprite = sprite;
  BL.preloadArt = function () {
    Object.keys(SHIP_ART).forEach(function (k) { sprite(SHIP_ART[k]); });
    Object.keys(TURRET_ART).forEach(function (k) { sprite(TURRET_ART[k]); });
    sprite("torpedo"); sprite("ptTorpedo");
  };
  var BOLT = { pulse: "#7bffb0", rail: "#d8f4ff", ion: "#c49bff" };
  var HULL = { raiders: "#ff7a45", interceptors: "#ffd84a", siege: "#ff5a6e", hunters: "#5ee0d0" };

  function makeStars() {
    stars = [];
    for (var i = 0; i < 140; i++) stars.push({ x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75 });
  }

  // Each enemy type has its own outline so the gunner knows it at a glance. Drawn in field
  // units around (0, 0), nose pointing down (toward you).
  function shipPath(c, type, w, h) {
    var x = w / 2, y = h / 2;
    c.beginPath();
    if (type === "interceptors") {               // small swept dart
      c.moveTo(0, y); c.lineTo(x * 0.35, -y * 0.1); c.lineTo(x, -y); c.lineTo(x * 0.2, -y * 0.55);
      c.lineTo(-x * 0.2, -y * 0.55); c.lineTo(-x, -y); c.lineTo(-x * 0.35, -y * 0.1);
    } else if (type === "siege") {               // heavy block with gun ports
      c.moveTo(-x, -y); c.lineTo(x, -y); c.lineTo(x, y * 0.4); c.lineTo(x * 0.4, y); c.lineTo(-x * 0.4, y); c.lineTo(-x, y * 0.4);
    } else if (type === "hunters") {             // diamond with long nose
      c.moveTo(0, y); c.lineTo(x * 0.55, 0); c.lineTo(x * 0.25, -y); c.lineTo(-x * 0.25, -y); c.lineTo(-x * 0.55, 0);
    } else {                                     // raider: broad wedge with wing pods
      c.moveTo(0, y); c.lineTo(x * 0.45, y * 0.1); c.lineTo(x, y * 0.25); c.lineTo(x, -y * 0.5); c.lineTo(x * 0.5, -y);
      c.lineTo(-x * 0.5, -y); c.lineTo(-x, -y * 0.5); c.lineTo(-x, y * 0.25); c.lineTo(-x * 0.45, y * 0.1);
    }
    c.closePath();
  }

  /* The shield dome over our bow. Brighter the more charge it holds, flickering when low.
     A hit flares the dome, sends a ripple across it and makes it wobble; a hull hit cracks
     it and floods the view red. */
  function drawShield(c, S, m, tu, t, lastShield, lastHull) {
    var SH = tu.G.shield, sys = m.sys("shield"), frac = sys ? Math.max(0, Math.min(1, sys.mj / sys.maxMJ)) : 0;
    var ageS = lastShield ? t - lastShield.at : 9, ageH = lastHull ? t - lastHull.at : 9, age = Math.min(ageS, ageH);
    var wob = Math.max(0, 0.7 - age) / 0.7, ph = age * 38;
    var rx = SH.rx * (1 - 0.025 * wob * Math.sin(ph + 1)), ry = SH.ry * (1 + 0.12 * wob * Math.sin(ph));
    var flick = frac < 0.3 ? (Math.random() < 0.35 ? 0.25 : 1) : 1;
    function dome() { c.beginPath(); c.ellipse(SH.cx, SH.cy, rx, ry, 0, Math.PI, 2 * Math.PI); c.closePath(); }
    // body
    var g = c.createLinearGradient(0, SH.cy - ry, 0, SH.cy);
    g.addColorStop(0, "rgba(120,220,255," + ((0.08 + 0.16 * frac) * flick).toFixed(3) + ")");
    g.addColorStop(1, "rgba(76,195,238," + ((0.02 + 0.05 * frac) * flick).toFixed(3) + ")");
    c.fillStyle = g; dome(); c.fill();
    // shimmer bands
    c.save(); dome(); c.clip();
    c.strokeStyle = "rgba(160,235,255," + (0.12 * frac * flick).toFixed(3) + ")"; c.lineWidth = 1 / S;
    for (var k = 0; k < 5; k++) {
      var off = ((t * 0.06 + k / 5) % 1);
      c.beginPath(); c.ellipse(SH.cx, SH.cy, rx * (0.35 + 0.65 * off), ry * (0.35 + 0.65 * off), 0, Math.PI, 2 * Math.PI); c.stroke();
    }
    // hit: flare and ripple from the impact point
    if (age < 0.6) {
      var f = ageS <= ageH ? lastShield : lastHull, hull = f === lastHull;
      var a = 1 - age / 0.6, big = Math.min(1.6, 0.6 + (f.mj || 30) / 60);
      c.fillStyle = hull ? "rgba(255,80,60," + (0.45 * a).toFixed(3) + ")" : "rgba(200,245,255," + (0.35 * a * big).toFixed(3) + ")";
      c.fillRect(0, 0, 1, 1);
      for (var r = 0; r < 3; r++) {
        var rr = 0.02 + (age + r * 0.06) * 0.7;
        c.strokeStyle = hull ? "rgba(255,120,90," + (a * 0.9).toFixed(3) + ")" : "rgba(220,250,255," + (a * 0.9).toFixed(3) + ")";
        c.lineWidth = (4 - r) / S;
        c.beginPath(); c.arc(f.x, f.y, rr, 0, Math.PI * 2); c.stroke();
      }
    }
    c.restore();
    // rim
    var rimA = (0.4 + 0.5 * frac) * flick + (age < 0.5 ? (1 - age / 0.5) * 0.8 : 0);
    c.strokeStyle = ageH < 0.5 ? "rgba(255,110,90," + Math.min(1, rimA).toFixed(3) + ")" : "rgba(130,225,255," + Math.min(1, rimA).toFixed(3) + ")";
    c.lineWidth = (2.5 + (age < 0.5 ? 3 * (1 - age / 0.5) : 0)) / S;
    c.beginPath(); c.ellipse(SH.cx, SH.cy, rx, ry, 0, Math.PI, 2 * Math.PI); c.stroke();
    c.lineWidth = 1.5 / S;
    // hull hit: cracks through the dome, red vignette over everything
    if (ageH < 1.2) {
      var ah = 1 - ageH / 1.2, seed = Math.floor(lastHull.at * 1000);
      c.strokeStyle = "rgba(255,230,220," + ah.toFixed(3) + ")"; c.lineWidth = 2 / S;
      for (var q = 0; q < 6; q++) {
        var ang = Math.PI + (q + 0.5) * Math.PI / 6 + ((seed * (q + 3)) % 7 - 3) * 0.04, x = lastHull.x, y = lastHull.y;
        c.beginPath(); c.moveTo(x, y);
        for (var st = 0; st < 4; st++) { x += Math.cos(ang) * 0.03 + (((seed >> st) % 5) - 2) * 0.004; y += Math.sin(ang) * 0.03; c.lineTo(x, y); }
        c.stroke();
      }
      c.lineWidth = 1.5 / S;
      var vg = c.createRadialGradient(0.5, 0.5, 0.25, 0.5, 0.5, 0.75);
      vg.addColorStop(0, "rgba(255,0,0,0)"); vg.addColorStop(1, "rgba(255,20,10," + (0.55 * ah).toFixed(3) + ")");
      c.fillStyle = vg; c.fillRect(0, 0, 1, 1);
    }
  }

  // size: canvas side in CSS pixels (the field is square).
  BL.drawTurret = function (c, size, m, tu, now) {
    if (!stars) makeStars();
    var S = size, t = m.totalT, G = tu.G, w = tu.w;
    c.save();
    c.fillStyle = "#03060b"; c.fillRect(0, 0, S, S);
    // Screen shake: a jolt when the shield takes a hit, a hard shake when the hull does.
    var lastHull = null, lastShield = null;
    tu.effects.forEach(function (f) {
      if (f.type === "hullHit" && (!lastHull || f.at > lastHull.at)) lastHull = f;
      if (f.type === "shieldHit" && (!lastShield || f.at > lastShield.at)) lastShield = f;
    });
    var shake = 0;
    if (lastHull) shake = Math.max(shake, Math.max(0, 0.55 - (t - lastHull.at)) * 46);
    if (lastShield) shake = Math.max(shake, Math.max(0, 0.3 - (t - lastShield.at)) * 34);
    if (shake > 0) c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // Stars stream down: the ship is moving up the screen.
    var live = tu.live();
    stars.forEach(function (st) {
      var y = (st.y + (live ? now * 0.00006 * st.z : 0)) % 1;
      c.fillStyle = "rgba(200,220,255," + (0.25 + st.z * 0.6).toFixed(2) + ")";
      c.fillRect(st.x * S, y * S, st.z * 1.8, st.z * 1.8 + (live ? st.z * 3 : 0));
    });

    // Reach: how far this gun's bolts fly (label in pixels: tiny scaled fonts don't render).
    var top = G.turretY - tu.reach();
    if (top > 0.01) {
      c.fillStyle = "rgba(240,181,74,0.55)"; c.font = Math.round(S * 0.022) + "px system-ui, sans-serif";
      c.fillText(w.short + " RANGE", S * 0.012, S * (top - 0.008));
    }
    c.scale(S, S);
    c.lineWidth = 1.5 / S;
    if (top > 0.01) {
      c.strokeStyle = "rgba(240,181,74,0.28)"; c.setLineDash([0.012, 0.012]);
      c.beginPath(); c.moveTo(0, top); c.lineTo(1, top); c.stroke(); c.setLineDash([]);
    }

    // Enemy ships.
    tu.ships.forEach(function (s) {
      if (s.dead) return;
      c.save(); c.translate(s.x, s.y);
      var col = HULL[s.type] || "#ff7a45", leaving = s.state === "leave";
      c.globalAlpha = leaving ? 0.45 : 1;
      // engine flicker at the back (top)
      c.fillStyle = "rgba(199,125,255," + (0.18 + 0.18 * Math.sin(t * 20 + s.id)).toFixed(2) + ")";
      c.beginPath(); c.ellipse(0, -s.h * 0.62, s.w * 0.22, s.h * 0.22, 0, 0, Math.PI * 2); c.fill();
      var flash = t - s.flashAt < 0.08, sp = sprite(SHIP_ART[s.type]);
      if (sp) {
        var dw = s.w * 1.06, dh = dw * sp.aspect;
        c.drawImage(sp.cv, -dw / 2, -dh / 2, dw, dh);
        if (flash) { c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.7; c.drawImage(sp.cv, -dw / 2, -dh / 2, dw, dh); c.globalCompositeOperation = "source-over"; c.globalAlpha = leaving ? 0.45 : 1; }
      } else {
        shipPath(c, s.type, s.w, s.h);
        c.fillStyle = flash ? "#ffffff" : col; c.globalAlpha *= flash ? 1 : 0.85; c.fill();
        c.globalAlpha = leaving ? 0.45 : 1;
        c.strokeStyle = "rgba(0,0,0,0.6)"; c.stroke();
      }
      if (t < s.ionUntil) {                     // ionized: crackling purple outline
        c.strokeStyle = "rgba(196,155,255," + (0.5 + 0.5 * Math.random()).toFixed(2) + ")"; c.lineWidth = 3 / S;
        shipPath(c, s.type, s.w * 1.25, s.h * 1.25); c.stroke(); c.lineWidth = 1.5 / S;
      }
      if (s.chargeAt > m.t && !leaving) {        // about to fire: a red glow at the nose and a closing ring
        var span = Math.max(0.5, s.chargeAt - s.chargeFrom), p = Math.min(1, Math.max(0, 1 - (s.chargeAt - m.t) / span));
        var ny = s.h / 2, gr = 0.012 + 0.02 * p + 0.004 * Math.sin(t * (10 + 20 * p));
        var cg = c.createRadialGradient(0, ny, 0, 0, ny, gr * 2.2);
        cg.addColorStop(0, "rgba(255,240,220," + (0.6 + 0.4 * p).toFixed(2) + ")"); cg.addColorStop(0.35, "rgba(255,70,50,0.85)"); cg.addColorStop(1, "rgba(255,40,30,0)");
        c.fillStyle = cg; c.beginPath(); c.arc(0, ny, gr * 2.2, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(255,90,70,0.9)"; c.lineWidth = 2 / S;
        c.beginPath(); c.arc(0, ny, 0.03, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (1 - p)); c.stroke(); c.lineWidth = 1.5 / S;
      }
      if (s.hp < s.hpMax - 0.01 && !leaving) {   // damage bar
        var bw = s.w * 0.9, f = Math.max(0, s.hp / s.hpMax);
        c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(-bw / 2, -s.h / 2 - 0.016, bw, 0.008);
        c.fillStyle = f > 0.5 ? "#63d48f" : f > 0.25 ? "#f0b54a" : "#ff6b5a"; c.fillRect(-bw / 2, -s.h / 2 - 0.016, bw * f, 0.008);
      }
      c.restore();
    });

    // Torpedoes: glowing slugs heading for the ship, with a marker where they'll land.
    tu.torps.forEach(function (tp) {
      var dx = tp.x1 - tp.x0, dy = tp.y1 - tp.y0, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
      var left = Math.max(0, tp.t1 - m.t);
      c.strokeStyle = "rgba(255,90,70,0.25)"; c.setLineDash([0.006, 0.01]);
      c.beginPath(); c.moveTo(tp.x, tp.y); c.lineTo(tp.x1, tp.y1); c.stroke(); c.setLineDash([]);
      c.strokeStyle = "rgba(255,120,60,0.5)"; c.lineWidth = 4 / S;
      c.beginPath(); c.moveTo(tp.x - ux * 0.05, tp.y - uy * 0.05); c.lineTo(tp.x, tp.y); c.stroke(); c.lineWidth = 1.5 / S;
      var r = G.torpedo.size * (tp.weak ? 0.75 : 1), tsp = sprite("torpedo");
      if (tsp) {
        // The art's nose glow sits 78% of the way down its box; put that on the torpedo's spot.
        var tw = r * 1.7, th = tw * tsp.aspect;
        c.save(); c.translate(tp.x, tp.y); c.rotate(Math.atan2(uy, ux) - Math.PI / 2);
        c.globalAlpha = tp.weak ? 0.7 : 1;
        c.drawImage(tsp.cv, -tw / 2, -th * 0.78, tw, th);
        c.restore();
      } else {
        var g = c.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r * 1.6);
        g.addColorStop(0, "#fff4d0"); g.addColorStop(0.4, tp.weak ? "#c49bff" : "#ff6a3d"); g.addColorStop(1, "rgba(255,60,40,0)");
        c.fillStyle = g; c.beginPath(); c.arc(tp.x, tp.y, r * 1.6, 0, Math.PI * 2); c.fill();
      }
      if (left < 1.2) {                          // landing soon: blink the impact marker
        c.strokeStyle = Math.floor(t * 8) % 2 ? "rgba(255,90,70,0.9)" : "rgba(255,90,70,0.3)";
        c.beginPath(); c.arc(tp.x1, tp.y1, 0.02, 0, Math.PI * 2); c.stroke();
      }
    });

    // Our torpedoes, and brackets on what each one is locked onto.
    var pts = sprite("ptTorpedo");
    tu.ptTorps.forEach(function (tp) {
      if (tp.target && !tp.target.dead) {
        var s = tp.target, bx = s.w / 2 + 0.012, by = s.h / 2 + 0.012, k = 0.025;
        c.strokeStyle = Math.floor(t * 6) % 2 ? "rgba(255,107,90,0.95)" : "rgba(255,107,90,0.45)"; c.lineWidth = 2.5 / S;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
          var x = s.x + q[0] * bx, y = s.y + q[1] * by;
          c.beginPath(); c.moveTo(x - q[0] * k, y); c.lineTo(x, y); c.lineTo(x, y - q[1] * k); c.stroke();
        });
        c.lineWidth = 1.5 / S;
      }
      c.save(); c.translate(tp.x, tp.y); c.rotate(tp.a + Math.PI / 2);
      if (pts) { var pw = 0.032, ph = pw * pts.aspect; c.drawImage(pts.cv, -pw / 2, -ph * 0.4, pw, ph); }
      else { c.fillStyle = "#d6dee5"; c.fillRect(-0.006, -0.02, 0.012, 0.04); }
      c.restore();
    });

    // Bolts.
    tu.bolts.forEach(function (b) {
      var bw = b.weaponId || tu.weaponId, bc = BOLT[bw];
      c.strokeStyle = bc; c.fillStyle = bc; c.globalAlpha = b.mine === false ? 0.7 : 1;
      if (bw === "rail") { c.lineWidth = 3 / S; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x, Math.min(b.y0, b.y + 0.12)); c.stroke(); c.lineWidth = 1.5 / S; }
      else if (bw === "ion") { c.beginPath(); c.arc(b.x, b.y, 0.009, 0, Math.PI * 2); c.fill(); }
      else { c.lineWidth = 3 / S; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x, b.y + 0.025); c.stroke(); c.lineWidth = 1.5 / S; }
      c.globalAlpha = 1;
    });

    // Effects: explosions, sparks, shield flashes.
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

    // Our ship's bow along the bottom, the turret rail, and the turret.
    var gy = G.turretY;
    c.fillStyle = "#16222e"; c.beginPath(); c.moveTo(0, 1); c.lineTo(0, gy + 0.035); c.quadraticCurveTo(0.5, gy - 0.005, 1, gy + 0.035); c.lineTo(1, 1); c.fill();
    c.strokeStyle = "#2a3644"; c.beginPath(); c.moveTo(0.03, gy + 0.012); c.lineTo(0.97, gy + 0.012); c.stroke();
    if (Math.abs(tu.aimX - tu.x) > 0.01) {        // where the turret is heading
      c.strokeStyle = "rgba(76,195,238,0.35)"; c.beginPath(); c.moveTo(tu.aimX, gy - 0.01); c.lineTo(tu.aimX, gy + 0.03); c.stroke();
    }
    var gun = tu.gun(), ready = gun && gun.mj >= w.shotMJ, multi = tu.bats.length > 1;
    // Every battery's turret on the rail: yours bright, the AI gunner's dimmed and tagged.
    tu.bats.forEach(function (bt, i) {
      var own = i === tu.sel, bg = tu.gun(bt), bready = bg && bg.mj >= bt.w.shotMJ;
      c.save(); c.translate(bt.x, gy);
      var tsp2 = sprite(TURRET_ART[bt.weaponId]);
      if (tsp2) {
        // The art's base sits at y 60 of its box: stand it on the rail.
        var ww = 0.085, wh = ww * tsp2.aspect, baseFrac = (60 - tsp2.vb[1]) / tsp2.vb[3];
        c.globalAlpha = (bready ? 1 : 0.6) * (own ? 1 : 0.55);
        c.drawImage(tsp2.cv, -ww / 2, 0.03 - wh * baseFrac, ww, wh);
        c.globalAlpha = 1;
      } else {
        c.fillStyle = "#4cc3ee"; c.beginPath(); c.moveTo(-0.03, 0.022); c.lineTo(-0.018, -0.008); c.lineTo(0.018, -0.008); c.lineTo(0.03, 0.022); c.closePath(); c.fill();
        c.fillStyle = bready ? "#d6e0e8" : "#5b6b7a"; c.fillRect(-0.0045, -0.045, 0.009, 0.04);
      }
      c.restore();
      if (multi) {                                   // gun number under each turret, in pixels
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
        var dpr = c.canvas.width / S;
        c.scale(dpr, dpr);
        c.font = "700 " + Math.round(S * 0.022) + "px system-ui, sans-serif"; c.textAlign = "center";
        c.fillStyle = own ? "#4cc3ee" : "rgba(214,224,232,0.55)";
        c.fillText((own ? "GUN " : "AI · GUN ") + bt.gunNo, Math.min(0.93, Math.max(0.07, bt.x)) * S, (gy + 0.06) * S);
        c.restore();
      }
    });
    drawShield(c, S, m, tu, t, lastShield, lastHull);
    // Reticle: straight up from the turret, at the end of the gun's reach.
    var ry = Math.max(0.04, top);
    c.strokeStyle = ready ? "rgba(123,224,166,0.8)" : "rgba(255,107,90,0.7)";
    c.setLineDash([0.004, 0.014]); c.beginPath(); c.moveTo(tu.x, gy - 0.05); c.lineTo(tu.x, ry); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(tu.x, ry, 0.018, 0, Math.PI * 2); c.moveTo(tu.x - 0.03, ry); c.lineTo(tu.x - 0.008, ry); c.moveTo(tu.x + 0.008, ry); c.lineTo(tu.x + 0.03, ry); c.stroke();
    c.restore();
  };
})(typeof window !== "undefined" ? window : globalThis);
