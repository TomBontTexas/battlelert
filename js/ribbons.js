/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Rank ribbons (TexasBont, Nov 6, 2026): a service ribbon's shape (1 3/8 x 3/8 in, 11:3), one per
   rank, drawn as SVG. Engineer: maroon; E1 plain, E2 one bronze wrench, E3 two crossed in bronze,
   E4 in silver, E5 in gold; E6 to E8 add a bronze, silver or gold star where they cross; E9 a gold
   star there and one on either side. The other paths' ribbons are still to come.
   BL.ribbonSvg(station, rank, width) -> an SVG string, or "" for a path without ribbons yet. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var METAL = {
    bronze: ["#b77a42", "#7c4719", "#3f2008"],
    silver: ["#ffffff", "#c3c9d2", "#7d8591"],
    gold:   ["#fff0a0", "#e0b030", "#8a6410"]
  };
  var COLOR = { engineer: "#6e1426" };
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
  function engineerDevices(id, rank) {
    var dev = "", cx = 55, cy = 15, wm = rank <= 3 ? "bronze" : rank === 4 ? "silver" : "gold";
    if (rank === 2) dev += wrench(id, id + wm, "translate(" + cx + "," + cy + ")");
    else if (rank >= 3) {
      dev += wrench(id, id + wm, "translate(" + cx + "," + cy + ") rotate(-38)");
      dev += wrench(id, id + wm, "translate(" + cx + "," + cy + ") rotate(218)");
    }
    var sm = { 6: "bronze", 7: "silver", 8: "gold", 9: "gold" }[rank];
    if (sm) dev += '<polygon points="' + star(cx, cy, 6.2) + '" fill="url(#' + id + sm + ')" stroke="#3a2a08" stroke-width=".35" filter="url(#' + id + 'sh)"/>';
    if (rank === 9) [cx - 26, cx + 26].forEach(function (x) { dev += '<polygon points="' + star(x, cy, 5) + '" fill="url(#' + id + 'gold)" stroke="#3a2a08" stroke-width=".3" filter="url(#' + id + 'sh)"/>'; });
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
      '<rect width="110" height="30" fill="url(#' + id + 'sheen)"/><rect x=".4" y=".4" width="109.2" height="29.2" fill="none" stroke="#000" stroke-opacity=".45" stroke-width=".8"/>';
    return '<svg class="ribbon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 30" width="' + w + '" height="' + (w * 3 / 11).toFixed(1) + '" role="img" aria-label="' + station + " " + rank + ' ribbon">' +
      defs + body + engineerDevices(id, rank) + "</svg>";
  };
})(typeof window !== "undefined" ? window : globalThis);
