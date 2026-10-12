/* Battlelert gunner station: draws the turret's view on a canvas. Reads the turret and the
   mission, changes nothing. Placeholder art, all drawn with canvas paths. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  var stars = null;
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

  // size: canvas side in CSS pixels (the field is square). shake: seconds of screen shake left.
  BL.drawTurret = function (c, size, m, tu, now) {
    if (!stars) makeStars();
    var S = size, t = m.totalT, G = tu.G, w = tu.w;
    c.save();
    c.fillStyle = "#03060b"; c.fillRect(0, 0, S, S);
    // Screen shake after a hull hit.
    var lastHull = 0;
    tu.effects.forEach(function (f) { if (f.type === "hullHit") lastHull = Math.max(lastHull, f.at); });
    var sh = Math.max(0, 0.35 - (t - lastHull));
    if (lastHull && sh > 0) c.translate((Math.random() - 0.5) * sh * 18, (Math.random() - 0.5) * sh * 18);

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
      // engine glow at the back (top)
      c.fillStyle = "rgba(120,180,255," + (0.35 + 0.25 * Math.sin(t * 20 + s.id)).toFixed(2) + ")";
      c.beginPath(); c.ellipse(0, -s.h * 0.55, s.w * 0.18, s.h * 0.18, 0, 0, Math.PI * 2); c.fill();
      shipPath(c, s.type, s.w, s.h);
      var flash = t - s.flashAt < 0.08;
      c.fillStyle = flash ? "#ffffff" : col; c.globalAlpha *= flash ? 1 : 0.85; c.fill();
      c.globalAlpha = leaving ? 0.45 : 1;
      c.strokeStyle = "rgba(0,0,0,0.6)"; c.stroke();
      if (t < s.ionUntil) {                     // ionized: crackling purple outline
        c.strokeStyle = "rgba(196,155,255," + (0.5 + 0.5 * Math.random()).toFixed(2) + ")"; c.lineWidth = 3 / S;
        shipPath(c, s.type, s.w * 1.25, s.h * 1.25); c.stroke(); c.lineWidth = 1.5 / S;
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
      var r = G.torpedo.size * (tp.weak ? 0.75 : 1);
      var g = c.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r * 1.6);
      g.addColorStop(0, "#fff4d0"); g.addColorStop(0.4, tp.weak ? "#c49bff" : "#ff6a3d"); g.addColorStop(1, "rgba(255,60,40,0)");
      c.fillStyle = g; c.beginPath(); c.arc(tp.x, tp.y, r * 1.6, 0, Math.PI * 2); c.fill();
      if (left < 1.2) {                          // landing soon: blink the impact marker
        c.strokeStyle = Math.floor(t * 8) % 2 ? "rgba(255,90,70,0.9)" : "rgba(255,90,70,0.3)";
        c.beginPath(); c.arc(tp.x1, tp.y1, 0.02, 0, Math.PI * 2); c.stroke();
      }
    });

    // Bolts.
    var bc = BOLT[tu.weaponId];
    tu.bolts.forEach(function (b) {
      c.strokeStyle = bc; c.fillStyle = bc;
      if (tu.weaponId === "rail") { c.lineWidth = 3 / S; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x, Math.min(b.y0, b.y + 0.12)); c.stroke(); c.lineWidth = 1.5 / S; }
      else if (tu.weaponId === "ion") { c.beginPath(); c.arc(b.x, b.y, 0.009, 0, Math.PI * 2); c.fill(); }
      else { c.lineWidth = 3 / S; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x, b.y + 0.025); c.stroke(); c.lineWidth = 1.5 / S; }
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
      } else if ((f.type === "shieldHit" || f.type === "hullHit") && a < 0.7) {
        var hull = f.type === "hullHit", al2 = 1 - a / 0.7;
        c.strokeStyle = hull ? "rgba(255,80,60," + al2 + ")" : "rgba(76,195,238," + al2 + ")"; c.lineWidth = 4 / S;
        c.beginPath(); c.ellipse(0.5, 1.02, 0.62, 0.11 + a * 0.05, 0, Math.PI, 2 * Math.PI); c.stroke(); c.lineWidth = 1.5 / S;
        if (hull) { c.fillStyle = "rgba(255,60,40," + al2 * 0.25 + ")"; c.fillRect(0, 0.85, 1, 0.15); }
      }
    });

    // Our ship's bow along the bottom, the turret rail, and the turret.
    var gy = G.turretY;
    c.fillStyle = "#16222e"; c.beginPath(); c.moveTo(0, 1); c.lineTo(0, gy + 0.035); c.quadraticCurveTo(0.5, gy - 0.005, 1, gy + 0.035); c.lineTo(1, 1); c.fill();
    c.strokeStyle = "#2a3644"; c.beginPath(); c.moveTo(0.03, gy + 0.012); c.lineTo(0.97, gy + 0.012); c.stroke();
    if (Math.abs(tu.aimX - tu.x) > 0.01) {        // where the turret is heading
      c.strokeStyle = "rgba(76,195,238,0.35)"; c.beginPath(); c.moveTo(tu.aimX, gy - 0.01); c.lineTo(tu.aimX, gy + 0.03); c.stroke();
    }
    var gun = tu.gun(), ready = gun && gun.mj >= w.shotMJ;
    c.save(); c.translate(tu.x, gy);
    c.fillStyle = "#4cc3ee"; c.beginPath(); c.moveTo(-0.03, 0.022); c.lineTo(-0.018, -0.008); c.lineTo(0.018, -0.008); c.lineTo(0.03, 0.022); c.closePath(); c.fill();
    c.fillStyle = ready ? "#d6e0e8" : "#5b6b7a"; c.fillRect(-0.0045, -0.045, 0.009, 0.04);
    c.restore();
    // Reticle: straight up from the turret, at the end of the gun's reach.
    var ry = Math.max(0.04, top);
    c.strokeStyle = ready ? "rgba(123,224,166,0.8)" : "rgba(255,107,90,0.7)";
    c.setLineDash([0.004, 0.014]); c.beginPath(); c.moveTo(tu.x, gy - 0.05); c.lineTo(tu.x, ry); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(tu.x, ry, 0.018, 0, Math.PI * 2); c.moveTo(tu.x - 0.03, ry); c.lineTo(tu.x - 0.008, ry); c.moveTo(tu.x + 0.008, ry); c.lineTo(tu.x + 0.03, ry); c.stroke();
    c.restore();
  };
})(typeof window !== "undefined" ? window : globalThis);
