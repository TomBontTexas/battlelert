/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Rank ribbons (TexasBont, Nov 6, 2026): a service ribbon's shape (1 3/8 x 3/8 in, 11:3), one per
   rank, drawn as SVG. Engineer: maroon; E1 plain, E2 one bronze wrench, E3 two crossed in bronze,
   E4 in silver, E5 in gold; E6 to E8 add a bronze, silver or gold star where they cross; E9 a gold
   star there and one on either side. Gunner: green, the same with sabers for wrenches (blades up).
   Pilot: sky blue with aviator's wings: P2 one wing, P3 to P5 a spread pair, stars as before.
   Command: royal purple with a gold stripe near each end, with anchors (crossed, rings up).
   Squadron: navy with twin gold stripes near each end, with spyglasses (crossed, lenses up).
   BL.ribbonSvg(station, rank, width) -> an SVG string, or "" for a path without ribbons yet. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var METAL = {
    bronze: ["#b77a42", "#7c4719", "#3f2008"],
    silver: ["#ffffff", "#c3c9d2", "#7d8591"],
    gold:   ["#fff0a0", "#e0b030", "#8a6410"]
  };
  var COLOR = { engineer: "#6e1426", gunner: "#1f8a3e", pilot: "#2f72b8", captain: "#55287f", squadron: "#1b2a5c" };
  var EDGE = { captain: "#d8ab3c", squadron: "#d8ab3c" };      // (a gold stripe near each end)
  var TWIN = { squadron: true };                                // (two, side by side)
  var uid = 0;      // (each ribbon's gradients and masks get their own ids)

  function star(cx, cy, R) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? R * 0.42 : R, a = -Math.PI / 2 + i * Math.PI / 5;
      p.push((cx + r * Math.cos(a)).toFixed(2) + "," + (cy + r * Math.sin(a)).toFixed(2));
    }
    return p.join(" ");
  }
  function grad(id, m) {
    var c = METAL[m];
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset=".45" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></linearGradient>';
  }
  // A wrench along the x axis, centred on 0: open jaw at +x, box end (a ring) at -x.
  function wrench(id, fill, tf) {
    return '<g transform="' + tf + '" filter="url(#' + id + 'sh)"><g mask="url(#' + id + 'wm)" fill="url(#' + fill + ')">' +
      '<rect x="-10.5" y="-1.45" width="21" height="2.9" rx="1"/>' +
      '<circle cx="11.2" cy="0" r="3.9"/><circle cx="-11.4" cy="0" r="3.3"/></g></g>';
  }
  // A cavalry saber along the x axis: the curved blade's point at +x, the hilt (guard, grip,
  // pommel) at -x.
  function saber(id, fill, tf) {
    return '<g transform="' + tf + '" filter="url(#' + id + 'sh)" fill="url(#' + fill + ')">' +
      '<path d="M-5.4,-1.7 Q5,-3.6 16.5,-1.6 L15.6,-0.4 Q5,-0.6 -5.4,1.7 Z"/>' +
      '<path d="M-3.8,-0.9 Q5,-2.4 13.5,-1.3" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".45"/>' +
      '<rect x="-7" y="-3.6" width="2.2" height="7.2" rx=".9"/>' +
      '<path d="M-6,3.1 Q-10.5,4.6 -12.6,1.2" fill="none" stroke="url(#' + fill + ')" stroke-width="1.1"/>' +
      '<rect x="-12.4" y="-1.4" width="6" height="2.8" rx="1.1"/>' +
      '<circle cx="-13" cy="0" r="1.8"/></g>';
  }
  // An aviator's wing: from the centre (x 0) out to the tip at +x, feathers along its trailing edge.
  function wing(id, fill, tf) {
    return '<g transform="' + tf + ' scale(1,1.3)" filter="url(#' + id + 'sh)"><path fill="url(#' + fill + ')" d="M0.6,-2.2 C5,-5.6 12,-6.6 20.5,-6 ' +
      'L18.6,-4.2 L20,-3.8 L17,-2.2 L18.2,-1.7 L15,-0.2 L15.8,0.4 L12.2,1.6 L12.6,2.2 Q6,3.4 0.6,2.4 Z"/>' +
      '<path d="M3,-1.6 C7,-3.6 12,-4.4 17,-4.4 M3.5,0.4 C7,-1 10.5,-1.6 14,-1.6" fill="none" stroke="#000" stroke-opacity=".28" stroke-width=".4"/></g>';
  }
  // An anchor along the x axis: the ring and stock at +x, the crown and its two curved arms at -x.
  function anchor(id, fill, tf) {
    var f = "url(#" + fill + ")";
    return '<g transform="' + tf + '" filter="url(#' + id + 'sh)" fill="' + f + '">' +
      '<rect x="-10.6" y="-0.85" width="19.6" height="1.7" rx=".8"/>' +
      '<rect x="6.6" y="-3.4" width="1.4" height="6.8" rx=".6"/>' +
      '<circle cx="10.8" cy="0" r="1.5" fill="none" stroke="' + f + '" stroke-width="1"/>' +
      '<path d="M-7.6,-4.2 Q-11.2,-3.6 -11.2,0 Q-11.2,3.6 -7.6,4.2" fill="none" stroke="' + f + '" stroke-width="1.5" stroke-linecap="round"/></g>';
  }
  // A spyglass along the x axis: the eyepiece at -x, the tubes stepping wider to the lens at +x.
  function spyglass(id, fill, tf) {
    var f = "url(#" + fill + ")";
    return '<g transform="' + tf + '" filter="url(#' + id + 'sh)" fill="' + f + '">' +
      '<rect x="-12.5" y="-1" width="5" height="2" rx=".5"/><rect x="-7.8" y="-1.35" width="6.4" height="2.7" rx=".4"/>' +
      '<rect x="-1.6" y="-1.7" width="8" height="3.4" rx=".4"/><rect x="6.2" y="-2.15" width="6.6" height="4.3" rx=".5"/>' +
      '<path d="M-7.8,-1.35 V1.35 M-1.6,-1.7 V1.7 M6.2,-2.15 V2.15 M10.6,-2.15 V2.15" stroke="#000" stroke-opacity=".35" stroke-width=".45"/></g>';
  }
  // The rank's devices: one (rank 2) or two crossed (3 up; wings: a spread pair), bronze to gold,
  // then the stars.
  function devices(id, rank, draw) {
    var dev = "", cx = 55, cy = 15, wm = rank <= 3 ? "bronze" : rank === 4 ? "silver" : "gold", wings = draw === wing;
    if (rank === 2) dev += draw(id, id + wm, "translate(" + (wings ? cx - 10 : cx) + "," + cy + ")");
    else if (rank >= 3 && wings) {
      dev += draw(id, id + wm, "translate(" + cx + "," + cy + ")") + draw(id, id + wm, "translate(" + cx + "," + cy + ") scale(-1,1)");
      if (rank < 6) dev += '<circle cx="' + cx + '" cy="' + cy + '" r="2.6" fill="url(#' + id + wm + ')" filter="url(#' + id + 'sh)"/>';     // (where the wings meet)
    } else if (rank >= 3) {
      dev += draw(id, id + wm, "translate(" + cx + "," + cy + ") rotate(-38)");
      dev += draw(id, id + wm, "translate(" + cx + "," + cy + ") rotate(218)");
    }
    var sm = { 6: "bronze", 7: "silver", 8: "gold", 9: "gold" }[rank];
    if (sm) dev += '<polygon points="' + star(cx, cy, 6.2) + '" fill="url(#' + id + sm + ')" stroke="#3a2a08" stroke-width=".35" filter="url(#' + id + 'sh)"/>';
    var sx = wings ? 31 : 26;
    if (rank === 9) [cx - sx, cx + sx].forEach(function (x) { dev += '<polygon points="' + star(x, cy, 5) + '" fill="url(#' + id + 'gold)" stroke="#3a2a08" stroke-width=".3" filter="url(#' + id + 'sh)"/>'; });
    return dev;
  }

  BL.ribbonSvg = function (station, rank, w) {
    if (!COLOR[station] || !(rank >= 1 && rank <= 9)) return "";
    var id = "rb" + (++uid), base = COLOR[station];
    w = w || 66;
    var defs = '<defs><pattern id="' + id + 'tx" width="1.4" height="30" patternUnits="userSpaceOnUse"><rect width=".7" height="30" fill="#000" opacity=".10"/></pattern>' +
      '<linearGradient id="' + id + 'sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>' +
      // (the jaw's gap and the box end's hole)
      '<mask id="' + id + 'wm" maskUnits="userSpaceOnUse" x="-20" y="-10" width="40" height="20"><rect x="-20" y="-10" width="40" height="20" fill="#fff"/>' +
      '<rect x="11.4" y="-1.7" width="5" height="3.4" fill="#000"/><circle cx="-11.4" cy="0" r="1.5" fill="#000"/></mask>' +
      '<filter id="' + id + 'sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx=".35" dy=".55" stdDeviation=".35" flood-color="#000" flood-opacity=".65"/></filter>' +
      grad(id + "bronze", "bronze") + grad(id + "silver", "silver") + grad(id + "gold", "gold") + "</defs>";
    var body = '<rect width="110" height="30" fill="' + base + '"/><rect width="110" height="30" fill="url(#' + id + 'tx)"/>' +
      (EDGE[station] ? (TWIN[station] ? [3.2, 7, 101.2, 105] : [4, 103.4]).map(function (x) { return '<rect x="' + x + '" width="' + (TWIN[station] ? 1.8 : 2.6) + '" height="30" fill="' + EDGE[station] + '"/>'; }).join("") : "") +
      '<rect width="110" height="30" fill="url(#' + id + 'sheen)"/><rect x=".4" y=".4" width="109.2" height="29.2" fill="none" stroke="#000" stroke-opacity=".45" stroke-width=".8"/>';
    return '<svg class="ribbon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 30" width="' + w + '" height="' + (w * 3 / 11).toFixed(1) + '" role="img" aria-label="' + station + " " + rank + ' ribbon">' +
      defs + body + devices(id, rank, station === "gunner" ? saber : station === "pilot" ? wing : station === "captain" ? anchor : station === "squadron" ? spyglass : wrench) + "</svg>";
  };
})(typeof window !== "undefined" ? window : globalThis);
