/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert ship art, approved by TexasBont Oct 12, 2026. Every ship is an SVG drawn around (0, 0) in a 200 x 200
   box. Azurian ships point their noses down (toward you); human ships point up.
   Light comes from the upper left. Azurian engines burn violet; human engines blue-white. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var ART = BL.ART = root.BL_ART = {};
  var n = 0;

  var ARCH = { hullHi: "#7a7290", hullMid: "#3d3850", hullLo: "#17141f", under: "#2a2538", line: "#0c0a12", glow: "#c77dff" };
  var ACCENT = {
    raider: ["#ffb072", "#e0612a", "#7a2a10"],
    interceptor: ["#fff0a0", "#f2c230", "#7a5a00"],
    siege: ["#ff9aa6", "#e23552", "#6a0a1e"],
    hunter: ["#a6fff2", "#33cbbb", "#0a5a52"]
  };

  function defs(p, acc, glow) {
    return '<defs>' +
      '<linearGradient id="' + p + 'h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + ARCH.hullHi + '"/><stop offset=".45" stop-color="' + ARCH.hullMid + '"/><stop offset="1" stop-color="' + ARCH.hullLo + '"/></linearGradient>' +
      '<linearGradient id="' + p + 'u" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#565068"/><stop offset="1" stop-color="#121018"/></linearGradient>' +
      '<linearGradient id="' + p + 'a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + acc[0] + '"/><stop offset=".5" stop-color="' + acc[1] + '"/><stop offset="1" stop-color="' + acc[2] + '"/></linearGradient>' +
      '<radialGradient id="' + p + 'g"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="' + glow + '"/><stop offset="1" stop-color="' + glow + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'c" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="' + acc[0] + '"/><stop offset=".7" stop-color="' + acc[2] + '"/><stop offset="1" stop-color="#0a0810"/></radialGradient>' +
      '<linearGradient id="' + p + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>' +
      '</defs>';
  }
  function svg(vb, body) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + body + '</svg>'; }
  function mirror(d) { return '<g transform="scale(-1,1)">' + d + '</g>'; }
  function both(d) { return d + mirror(d); }
  function rivets(pts, p) { return pts.map(function (q) { return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="1.1" fill="#9a93ad" opacity=".55"/>'; }).join(""); }

  /* E1 Raider: a broad, heavy wedge with gun pods on the wingtips. Orange. */
  ART.raider = function () {
    var p = "r" + (n++), A = ACCENT.raider;
    var wing = '<path d="M-22 18 L-58 10 L-90 16 L-94 -10 L-72 -30 L-38 -38 L-26 -18 Z" fill="url(#' + p + 'u)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<path d="M-30 4 L-84 0 L-86 -8 L-32 -6 Z" fill="url(#' + p + 'a)"/>' +
      '<path d="M-40 -34 L-70 -27 L-90 -9" fill="none" stroke="#8a83a0" stroke-width="1" opacity=".5"/>' +
      '<path d="M-58 10 L-60 -24 M-44 12 L-46 -30" stroke="' + ARCH.line + '" stroke-width="1" opacity=".7"/>' +
      '<rect x="-100" y="-20" width="16" height="44" rx="4" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<rect x="-95.5" y="22" width="7" height="20" rx="1.5" fill="#1a1720" stroke="' + ARCH.line + '"/>' +
      '<rect x="-94.5" y="38" width="5" height="4" fill="' + A[1] + '"/>' +
      '<ellipse cx="-16" cy="-64" rx="13" ry="18" fill="url(#' + p + 'g)"/>' +
      '<rect x="-24" y="-66" width="15" height="12" rx="2" fill="#24202c" stroke="#5a5470"/>';
    var body = '<path d="M0 62 L22 24 L28 -18 L20 -56 L-20 -56 L-28 -18 L-22 24 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<path d="M0 62 L22 24 L28 -18 L0 -30 Z" fill="#000" opacity=".22"/>' +
      '<path d="M-20 -56 L-28 -18 L-22 24 L0 62" fill="none" stroke="url(#' + p + 's)" stroke-width="2"/>' +
      '<path d="M-22 -20 L22 -20 M-18 -40 L18 -40 M-24 4 L24 4" stroke="' + ARCH.line + '" stroke-width="1" opacity=".75"/>' +
      '<path d="M0 34 L10 14 L0 0 L-10 14 Z" fill="url(#' + p + 'c)" stroke="' + ARCH.line + '"/>' +
      '<path d="M-6 -46 L6 -46 L4 -26 L-4 -26 Z" fill="url(#' + p + 'a)" opacity=".9"/>' +
      rivets([[-14, -12], [14, -12], [-16, 10], [16, 10], [-12, -48], [12, -48]]);
    return svg("-104 -86 208 152", defs(p, A, ARCH.glow) + both(wing) + body);
  };

  /* E2 Interceptor: a small swept dart with one big engine. Yellow. */
  ART.interceptor = function () {
    var p = "i" + (n++), A = ACCENT.interceptor;
    var wing = '<path d="M-10 26 L-60 -28 L-62 -52 L-40 -46 L-14 -40 L-8 -30 Z" fill="url(#' + p + 'u)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<path d="M-10 26 L-60 -28 L-62 -40 L-12 10 Z" fill="url(#' + p + 'a)"/>' +
      '<path d="M-20 -6 L-50 -38 M-14 -20 L-40 -44" stroke="' + ARCH.line + '" stroke-width="1" opacity=".7"/>' +
      '<rect x="-21" y="-6" width="4" height="30" rx="1" fill="#1a1720" stroke="' + ARCH.line + '"/>';
    var body = '<ellipse cx="0" cy="-66" rx="15" ry="20" fill="url(#' + p + 'g)"/>' +
      '<path d="M0 66 L11 20 L14 -40 L8 -60 L-8 -60 L-14 -40 L-11 20 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<path d="M0 66 L11 20 L14 -40 L0 -46 Z" fill="#000" opacity=".22"/>' +
      '<path d="M-8 -60 L-14 -40 L-11 20 L0 66" fill="none" stroke="url(#' + p + 's)" stroke-width="2"/>' +
      '<ellipse cx="0" cy="14" rx="6" ry="16" fill="url(#' + p + 'c)" stroke="' + ARCH.line + '"/>' +
      '<rect x="-9" y="-66" width="18" height="10" rx="2" fill="#24202c" stroke="#5a5470"/>' +
      '<path d="M-12 -24 L12 -24 M-13 -44 L13 -44" stroke="' + ARCH.line + '" stroke-width="1" opacity=".75"/>' +
      rivets([[-8, -34], [8, -34], [-7, 30], [7, 30]]);
    return svg("-66 -90 132 160", defs(p, A, ARCH.glow) + both(wing) + body);
  };

  /* E3 Siege battery: a slab of armor with three long guns. Red. */
  ART.siege = function () {
    var p = "s" + (n++), A = ACCENT.siege;
    var engines = [-60, -20, 20, 60].map(function (x) {
      return '<ellipse cx="' + x + '" cy="-58" rx="11" ry="14" fill="url(#' + p + 'g)"/><rect x="' + (x - 8) + '" y="-60" width="16" height="10" rx="2" fill="#24202c" stroke="#5a5470"/>';
    }).join("");
    var guns = [-50, 0, 50].map(function (x) {
      return '<rect x="' + (x - 5) + '" y="16" width="10" height="58" rx="2" fill="url(#' + p + 'u)" stroke="' + ARCH.line + '" stroke-width="1.2"/>' +
        '<rect x="' + (x - 6.5) + '" y="44" width="13" height="5" fill="#2e2a38" stroke="' + ARCH.line + '"/>' +
        '<rect x="' + (x - 3.5) + '" y="70" width="7" height="5" fill="' + A[1] + '"/>' +
        '<circle cx="' + x + '" cy="12" r="15" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
        '<circle cx="' + x + '" cy="12" r="6" fill="url(#' + p + 'c)"/>';
    }).join("");
    var body = '<path d="M-82 -52 L82 -52 L96 -22 L96 26 L64 48 L-64 48 L-96 26 L-96 -22 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.8"/>' +
      '<path d="M96 -22 L96 26 L64 48 L0 48 L0 -10 Z" fill="#000" opacity=".2"/>' +
      '<path d="M-96 -22 L-82 -52 L82 -52" fill="none" stroke="url(#' + p + 's)" stroke-width="2.5"/>' +
      '<path d="M-90 -14 L90 -14 M-90 28 L90 28 M-30 -52 L-30 48 M30 -52 L30 48" stroke="' + ARCH.line + '" stroke-width="1.2" opacity=".75"/>' +
      '<path d="M-86 -32 L-40 -32 L-40 -26 L-86 -26 Z M86 -32 L40 -32 L40 -26 L86 -26 Z" fill="url(#' + p + 'a)"/>' +
      '<path d="M-12 -40 L12 -40 L8 -24 L-8 -24 Z" fill="url(#' + p + 'c)" stroke="' + ARCH.line + '"/>' +
      rivets([[-88, -6], [88, -6], [-88, 18], [88, 18], [-60, -44], [60, -44], [-60, 40], [60, 40]]);
    return svg("-102 -78 204 158", defs(p, A, ARCH.glow) + engines + body + guns);
  };

  /* E4 Drive hunter: a needle-nosed missile carrier. Teal. */
  ART.hunter = function () {
    var p = "h" + (n++), A = ACCENT.hunter;
    var side = '<path d="M-10 28 L-36 2 L-26 -48 L-12 -48 Z" fill="url(#' + p + 'u)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<g><rect x="-50" y="-30" width="9" height="42" rx="4.5" fill="#2a2636" stroke="' + ARCH.line + '"/><path d="M-50 12 L-45.5 22 L-41 12 Z" fill="' + A[1] + '"/></g>' +
      '<g><rect x="-62" y="-22" width="8" height="34" rx="4" fill="#2a2636" stroke="' + ARCH.line + '"/><path d="M-62 12 L-58 20 L-54 12 Z" fill="' + A[1] + '"/></g>' +
      '<path d="M-36 -10 L-62 -8 L-62 -2 L-36 -2 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '"/>' +
      '<ellipse cx="-17" cy="-58" rx="10" ry="14" fill="url(#' + p + 'g)"/><rect x="-23" y="-58" width="12" height="9" rx="2" fill="#24202c" stroke="#5a5470"/>';
    var body = '<path d="M0 78 L7 30 L16 -10 L12 -50 L-12 -50 L-16 -10 L-7 30 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<path d="M0 78 L7 30 L16 -10 L12 -50 L0 -50 Z" fill="#000" opacity=".22"/>' +
      '<path d="M0 78 L0 40" stroke="' + A[0] + '" stroke-width="1.5"/>' +
      '<path d="M-12 -50 L-16 -10 L-7 30 L0 78" fill="none" stroke="url(#' + p + 's)" stroke-width="2"/>' +
      '<path d="M0 28 L6 6 L0 -8 L-6 6 Z" fill="url(#' + p + 'c)" stroke="' + ARCH.line + '"/>' +
      '<path d="M-14 -24 L14 -24 M-15 -40 L15 -40" stroke="' + ARCH.line + '" stroke-width="1" opacity=".75"/>' +
      '<path d="M-10 -36 L10 -36 L9 -30 L-9 -30 Z" fill="url(#' + p + 'a)"/>' +
      rivets([[-10, -16], [10, -16], [-6, 16], [6, 16]]);
    return svg("-70 -78 140 160", defs(p, A, ARCH.glow) + both(side) + body);
  };

  /* T1 Azurian torpedo: a finned slug with a hot nose, heading down. */
  ART.torpedo = function () {
    var p = "t" + (n++);
    return svg("-30 -70 60 110", '<defs>' +
      '<radialGradient id="' + p + 'g"><stop offset="0" stop-color="#fff6d8"/><stop offset=".35" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ff3a1a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + p + 't" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c77dff" stop-opacity="0"/><stop offset="1" stop-color="#c77dff" stop-opacity=".7"/></linearGradient>' +
      '<linearGradient id="' + p + 'b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d6680"/><stop offset=".5" stop-color="#3d3850"/><stop offset="1" stop-color="#15121c"/></linearGradient></defs>' +
      '<path d="M-5 -66 L5 -66 L3 -20 L-3 -20 Z" fill="url(#' + p + 't)"/>' +
      '<path d="M-6 -22 L-14 -30 L-14 -18 L-6 -12 Z M6 -22 L14 -30 L14 -18 L6 -12 Z" fill="#3d3850" stroke="#0c0a12"/>' +
      '<rect x="-6" y="-24" width="12" height="36" rx="5" fill="url(#' + p + 'b)" stroke="#0c0a12"/>' +
      '<rect x="-6" y="-6" width="12" height="3" fill="#e0612a"/>' +
      '<circle cx="0" cy="16" r="16" fill="url(#' + p + 'g)"/><circle cx="0" cy="14" r="5" fill="#fff6d8"/>');
  };

  /* H1-S9 Our ships from above, nose up, from TexasBont's outlines (Oct 28, 2026): the gunboat a slim
     capsule; the picket, destroyer escort and destroyer finned rockets (the destroyer with forward
     prongs); the light cruiser up a round bow dome on a wide block, the cruiser adding a stern hangar
     block, the heavy cruiser two wing blocks, the battleship two reactor pods, the dreadnought four
     lobes round the planet buster. Every hull is drawn bow at y -100, stern at y 100.
     Each class lists its turrets in gun-number order: [x, y, kind, aft?] (aft = barrels start astern),
     and its CIWS mounts (pd), which the battle view lights up. */
  function ell(cx, cy, rx, ry) { return "M" + (cx - rx) + " " + cy + " A" + rx + " " + ry + " 0 1 0 " + (cx + rx) + " " + cy + " A" + rx + " " + ry + " 0 1 0 " + (cx - rx) + " " + cy + " Z"; }
  // A hull symmetric about x = 0 from its right half: segments from the bow (0, top) round to the
  // stern's center line; each is [x, y] (a line) or [x1, y1, x, y] (a curve) or [x1, y1, x2, y2, x, y].
  function sym(top, segs) {
    var pts = [[0, top]], d = "M0 " + top;
    segs.forEach(function (s) { d += (s.length === 2 ? " L" : s.length === 4 ? " Q" : " C") + s.join(" "); pts.push([s[s.length - 2], s[s.length - 1]]); });
    for (var i = segs.length - 1; i >= 0; i--) {
      var s = segs[i], to = pts[i];
      if (s.length === 2) d += " L" + (-to[0]) + " " + to[1];
      else if (s.length === 4) d += " Q" + (-s[0]) + " " + s[1] + " " + (-to[0]) + " " + to[1];
      else d += " C" + (-s[2]) + " " + s[3] + " " + (-s[0]) + " " + s[1] + " " + (-to[0]) + " " + to[1];
    }
    return d + " Z";
  }
  var DOME = [[16, -100, 28, -86, 28, -66]];   // the round bow of the light cruiser and up
  var OURS = {
    gunboat: { code: "PT", rel: 1.0, beam: 34,
      hull: [sym(-100, [[18, -100, 31, -60, 32, -20], [33, 20, 31, 70, 28, 100], [0, 100]])],
      guns: [[0, -24, "pulse"]], engines: [[0, 100, 16]], canopy: -64, tubes: true },
    picket: { code: "DL", rel: 1.4, beam: 52,
      hull: [sym(-100, [[17, -100, 28, -70, 28, -35], [28, 12], [42, 24, 50, 40, 49, 56], [48, 76, 42, 92, 38, 100], [30, 100], [30, 66, 18, 58], [18, 81], [0, 81]])],
      guns: [[0, -40, "rail"]], engines: [[-9, 81, 10], [9, 81, 10]], bridge: [-6, 20, 14], mast: 24, warp: [0, 46, 11] },
    destroyerEscort: { code: "DE", rel: 1.8, beam: 52,
      hull: [sym(-100, [[17, -100, 28, -68, 28, -30], [28, 19], [42, 32, 50, 48, 49, 62], [49, 78, 42, 92, 38, 100], [29, 100], [29, 70, 17, 63], [17, 81], [0, 81]])],
      guns: [[0, -42, "pulse"], [0, 44, "rail", true]], engines: [[-8, 81, 10], [8, 81, 10]], bridge: [-16, 22, 16], warp: [0, 18, 10],
      pd: [[-42, 62], [42, 62]] },
    destroyer: { code: "DD", rel: 2.2, beam: 56,
      hull: [sym(-100, [[16, -100, 26, -75, 27, -48], [28, -34], [30, -58, 32, -70], [40, -70], [48, -55, 53, -40, 53, -21], [52, 0, 42, 12, 31, 20],
        [42, 30, 49, 46, 48, 64], [47, 80, 42, 92, 37, 100], [29, 100], [29, 70, 18, 60], [15, 81], [0, 81]])],
      guns: [[0, -56, "rail"], [0, 2, "pulse"], [0, 43, "rail", true]], engines: [[-33, 100, 9], [0, 81, 12], [33, 100, 9]], bridge: [-36, 22, 14], warp: [0, 24, 10], chev: -79,
      pd: [[-36, -64], [36, -64]] },
    lightCruiser: { code: "CL", rel: 2.8, beam: 62, main: -30,
      hull: [sym(-100, DOME.concat([[28, -27], [57, 13], [61, 18, 61, 24], [61, 90], [61, 100, 51, 100], [0, 100]]))],
      guns: [[-40, 8, "rail"], [40, 8, "rail"], [-40, 64, "pulse"], [40, 64, "pulse"]], engines: [[-36, 100, 14], [0, 100, 14], [36, 100, 14]],
      bridge: [-12, 30, 18], warp: [0, 48, 12], pd: [[-56, 36], [56, 36]] },
    cruiser: { code: "C", rel: 3.3, beam: 62, main: -30, hangar: [83, 13],
      hull: [sym(-100, DOME.concat([[28, -27], [58, 13], [61, 17, 61, 23], [61, 72], [61, 81, 52, 81], [28, 81], [28, 92], [28, 100, 20, 100], [0, 100]]))],
      guns: [[-42, 6, "rail"], [42, 6, "rail"], [0, 28, "rail"], [-42, 58, "pulse"], [42, 58, "pulse"]],
      engines: [[-52, 81, 11], [-38, 81, 11], [38, 81, 11], [52, 81, 11]], bridge: [-14, 30, 16], warp: [0, 58, 12], pd: [[-56, 32], [56, 32]] },
    heavyCruiser: { code: "CA", rel: 3.8, beam: 62, main: -54, hangar: [85, 12],
      hull: [sym(-100, DOME.concat([[28, -50], [58, -33], [61, -31, 61, -26], [61, 0], [61, 7, 54, 7], [28, 7], [28, 25], [58, 42], [61, 44, 61, 49],
        [61, 76], [61, 83, 54, 83], [28, 83], [28, 93], [28, 100, 21, 100], [0, 100]]))],
      guns: [[-44, -13, "rail"], [44, -13, "rail"], [0, -36, "rail"], [0, 16, "ion", true], [-44, 63, "pulse"], [44, 63, "pulse"]],
      engines: [[-52, 83, 11], [-38, 83, 11], [38, 83, 11], [52, 83, 11]], bridge: [-16, 24, 12], warp: [0, 46, 11],
      pd: [[-56, -27], [56, -27], [-56, 78], [56, 78]] },
    battleship: { code: "BB", rel: 4.6, beam: 62, main: -56, hangar: [82, 14],
      hull: [sym(-100, DOME.concat([[28, 92], [28, 100, 20, 100], [0, 100]])), ell(-39, 12, 22, 65), ell(39, 12, 22, 65)],
      guns: [[-40, -24, "rail"], [40, -24, "rail"], [0, -44, "rail"], [0, 36, "rail", true], [0, 10, "ion"], [-40, 54, "pulse"], [40, 54, "pulse"]],
      engines: [[-14, 100, 11], [0, 100, 11], [14, 100, 11], [-39, 77, 12], [39, 77, 12]], bridge: [-24, 22, 14], warp: [0, 62, 8],
      reactors: [[-41, 16], [41, 16]], pd: [[-57, -18], [57, -18], [-60, 18], [60, 18], [-53, 54], [53, 54]] },
    dreadnought: { code: "DN", rel: 5.6, beam: 44, main: -68, hangar: [87, 11],
      hull: [sym(-100, [[18, -100, 28, -88, 28, -70], [28, 92], [28, 100, 20, 100], [0, 100]]), ell(-25, -34, 17, 39), ell(25, -34, 17, 39), ell(-25, 51, 17, 40), ell(25, 51, 17, 40)],
      guns: [[-28, -44, "rail"], [28, -44, "rail"], [0, -52, "rail"], [0, 50, "rail", true], [-28, 36, "ion"], [28, 36, "ion"], [-28, 70, "pulse"], [28, 70, "pulse"]],
      engines: [[-20, 100, 9], [-7, 100, 9], [7, 100, 9], [20, 100, 9], [-27, 90, 10], [27, 90, 10]], bridge: [-34, 20, 10], warp: [0, 72, 7],
      reactors: [[-22, -16], [22, -16], [0, -16]], buster: [0, 14], pd: [[-24, -86], [24, -86], [-40, -48], [40, -48], [-40, 30], [40, 30], [-38, 64], [38, 64]] }
  };
  var RXN = ["A", "B", "C"];
  function ourTurret(p, x, y, kind, aft, r) {
    var a = aft ? 180 : 0, out = '<g transform="translate(' + x + ' ' + y + ') rotate(' + a + ')">';
    if (kind === "rail") out += '<rect x="-1.7" y="' + (-r * 2.5) + '" width="3.4" height="' + (r * 2.3) + '" fill="#2a323a" stroke="#1d242b" stroke-width=".8"/>';
    else if (kind === "pulse") out += [-1, 1].map(function (sd) { return '<rect x="' + (sd * r * 0.38 - 1.4) + '" y="' + (-r * 1.75) + '" width="2.8" height="' + (r * 1.4) + '" fill="#2a323a" stroke="#1d242b" stroke-width=".8"/>'; }).join("");
    else out += '<rect x="-2.4" y="' + (-r * 2.1) + '" width="4.8" height="' + (r * 1.9) + '" fill="#2a323a" stroke="#1d242b" stroke-width=".8"/><rect x="-2.8" y="' + (-r * 2.1) + '" width="5.6" height="2.4" fill="#4cc3ee"/>';
    out += '<circle r="' + r + '" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.2"/>' +
      '<circle cx="' + (-r * 0.3) + '" cy="' + (-r * 0.3) + '" r="' + (r * 0.35) + '" fill="#ffffff" opacity=".25"/>';
    if (kind === "ion") out += '<circle r="' + (r * 0.32) + '" fill="#4cc3ee"/>';
    if (kind === "pulse") out += '<circle r="' + (r * 0.26) + '" fill="#f0b54a"/>';
    return out + '</g>';
  }
  function ourShip(id, hullNo) {
    var c = OURS[id], p = "k" + (n++), small = id === "gunboat";
    var r = small ? 13 : c.guns.length > 5 ? 8.5 : 9.5;
    var d = '<defs>' +
      '<linearGradient id="' + p + 'h" gradientUnits="userSpaceOnUse" x1="-60" y1="-100" x2="60" y2="100"><stop offset="0" stop-color="#c3ccd4"/><stop offset=".5" stop-color="#8794a0"/><stop offset="1" stop-color="#4a5560"/></linearGradient>' +
      '<linearGradient id="' + p + 'd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa6b2"/><stop offset="1" stop-color="#3e4852"/></linearGradient>' +
      '<radialGradient id="' + p + 'g"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#8fd3ff"/><stop offset="1" stop-color="#4cc3ee" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'c" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#7fd7ff"/><stop offset="1" stop-color="#0a2230"/></radialGradient>' +
      '<radialGradient id="' + p + 'r"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#4cc3ee"/><stop offset="1" stop-color="#1d4a5c"/></radialGradient>' +
      '<radialGradient id="' + p + 'x" cx=".4" cy=".35"><stop offset="0" stop-color="#ffd0c8"/><stop offset=".35" stop-color="#ff6b5a"/><stop offset="1" stop-color="#4a0d08"/></radialGradient>' +
      '<clipPath id="' + p + 'k">' + c.hull.map(function (h) { return '<path d="' + h + '"/>'; }).join("") + '</clipPath></defs>';
    var out = [];
    // engine glow behind the nozzles
    c.engines.forEach(function (e) { out.push('<ellipse cx="' + e[0] + '" cy="' + (e[1] + 9) + '" rx="' + (e[2] * 0.6 + 2) + '" ry="12" fill="url(#' + p + 'g)"/>'); });
    // hull: every piece outlined first, then filled, so the pieces read as one hull
    c.hull.forEach(function (h) { out.push('<path d="' + h + '" fill="#1d242b" stroke="#1d242b" stroke-width="3.6" stroke-linejoin="round"/>'); });
    c.hull.forEach(function (h) { out.push('<path d="' + h + '" fill="url(#' + p + 'h)"/>'); });
    // shade the starboard half (light from the upper left), plate seams, center line
    var seams = [];
    for (var y = -70; y < 100; y += 22) seams.push("M-70 " + y + " L70 " + y);
    out.push('<g clip-path="url(#' + p + 'k)"><rect x="0" y="-110" width="80" height="220" fill="#000" opacity=".15"/>' +
      '<path d="' + seams.join(" ") + '" stroke="#3a454f" stroke-width="1" opacity=".6"/><path d="M0 -94 L0 96" stroke="#3a454f" stroke-width=".8" opacity=".5"/></g>');
    c.engines.forEach(function (e) { out.push('<rect x="' + (e[0] - e[2] / 2) + '" y="' + (e[1] - 4) + '" width="' + e[2] + '" height="6" rx="2" fill="#2a323a" stroke="#6b7884"/>'); });
    if (c.tubes) [-1, 1].forEach(function (sd) {   // the gunboat's two torpedo tubes, warheads forward
      out.push('<rect x="' + (sd * 22 - 4.5) + '" y="-40" width="9" height="56" rx="4.5" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.2"/>' +
        '<rect x="' + (sd * 22 - 4.5) + '" y="-32" width="9" height="4" fill="#f0b54a"/><circle cx="' + (sd * 22) + '" cy="-38" r="3" fill="#ff6b5a"/>');
    });
    if (c.canopy) out.push('<path d="M0 ' + (c.canopy - 18) + ' L8 ' + c.canopy + ' L-8 ' + c.canopy + ' Z" fill="url(#' + p + 'c)" stroke="#1d242b"/>');
    // spinal main gun: a long barrel out through the bow dome, its breech on the deck behind
    if (c.main != null) {
      out.push('<rect x="-3.4" y="-104" width="6.8" height="' + (c.main + 104) + '" fill="#2a323a" stroke="#1d242b"/>');
      out.push('<rect x="-8" y="' + (c.main - 6) + '" width="16" height="12" rx="2" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.2"/>');
      [0.3, 0.55].forEach(function (f) { out.push('<rect x="-5" y="' + (-100 + (c.main + 100) * f) + '" width="10" height="4" fill="#b0763a" stroke="#1d242b"/>'); });
    }
    // amber chevrons on the bow
    var cy = c.chev || (small ? -46 : c.main != null ? -78 : -66);
    out.push('<path d="M-14 ' + (cy + 6) + ' L-7 ' + cy + ' L-14 ' + (cy - 6) + ' M14 ' + (cy + 6) + ' L7 ' + cy + ' L14 ' + (cy - 6) + '" stroke="#f0b54a" stroke-width="2.4" fill="none"/>');
    if (c.warp) out.push('<circle cx="' + c.warp[0] + '" cy="' + c.warp[1] + '" r="' + c.warp[2] + '" fill="#1a2630" stroke="#6aa8ff" stroke-width="3" opacity=".9"/><circle cx="' + c.warp[0] + '" cy="' + c.warp[1] + '" r="' + (c.warp[2] * 0.45) + '" fill="#6aa8ff" opacity=".5"/>');
    if (c.hangar) {   // the hangar in the stern block: a dark bay behind amber-striped doors
      var hy = c.hangar[0], hh = c.hangar[1];
      out.push('<rect x="-17" y="' + hy + '" width="34" height="' + hh + '" rx="2" fill="#141a20" stroke="#1d242b"/>');
      for (var sx = -15; sx < 15; sx += 6) out.push('<path d="M' + sx + ' ' + (hy + hh) + ' L' + (sx + 4) + ' ' + hy + '" stroke="#f0b54a" stroke-width="1.6"/>');
    }
    if (c.buster) {   // the planet buster amidships, ringed in amber
      var bx = c.buster[0], by = c.buster[1];
      out.push('<circle cx="' + bx + '" cy="' + by + '" r="23" fill="none" stroke="#f0b54a" stroke-width="2.6" stroke-dasharray="6 4"/>');
      out.push('<circle cx="' + bx + '" cy="' + by + '" r="18" fill="url(#' + p + 'x)" stroke="#1d242b" stroke-width="1.5"/>');
    }
    if (c.reactors) c.reactors.forEach(function (q, k) {
      out.push('<circle cx="' + q[0] + '" cy="' + q[1] + '" r="9" fill="url(#' + p + 'r)" stroke="#1d242b" stroke-width="1.2"/>');
      out.push('<text x="' + q[0] + '" y="' + (q[1] + 0.5) + '" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="#0b1016">' + RXN[k] + '</text>');
    });
    if (c.bridge) {   // bridge block with its window band; the picket's sensor mast on top
      var b = c.bridge, bw = b[1], bh = b[2];
      out.push('<rect x="' + (-bw / 2) + '" y="' + (b[0] - bh / 2) + '" width="' + bw + '" height="' + bh + '" rx="3" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.2"/>');
      out.push('<rect x="' + (-bw / 2 + 3) + '" y="' + (b[0] - bh / 2 + 2.5) + '" width="' + (bw - 6) + '" height="3.5" rx="1" fill="url(#' + p + 'c)"/>');
      if (c.mast) out.push('<path d="M-' + (c.mast / 2) + ' ' + (b[0] + 3) + ' L' + (c.mast / 2) + ' ' + (b[0] + 3) + '" stroke="#1d242b" stroke-width="2"/><circle cx="0" cy="' + (b[0] + 3) + '" r="4.5" fill="#d6dee5" stroke="#1d242b"/>');
    }
    c.guns.forEach(function (g) { out.push(ourTurret(p, g[0], g[1], g[2], g[3], r)); });
    if (c.pd) c.pd.forEach(function (q) { out.push('<circle cx="' + q[0] + '" cy="' + q[1] + '" r="3.6" fill="#d6dee5" stroke="#1d242b"/><circle cx="' + (q[0] - 1) + '" cy="' + (q[1] - 1) + '" r="1.2" fill="#fff"/>'); });
    // hull number near the stern (the gunboat's runs along its aft deck)
    if (small) out.push('<text x="0" y="62" transform="rotate(-90 0 62)" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#1d242b" letter-spacing="1">' + (hullNo || "PT-117") + '</text>');
    else { var ty = c.hangar ? c.hangar[0] - 3 : Math.min.apply(null, c.engines.map(function (e) { return e[1]; })) - 7; out.push('<text x="0" y="' + ty + '" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="8" fill="#1d242b" letter-spacing="1">' + (hullNo || c.code) + '</text>'); }
    var half = c.beam + 6;
    return svg((-half) + " -108 " + (half * 2) + " 234", d + out.join(""));
  }
  ART.OURS = OURS;
  ART.gunboat = function (hull) { return ourShip("gunboat", hull); };
  ART.warship = function (id, hullNo) { return ourShip(id, hullNo); };
  // CIWS mount positions as shares of the drawn ship's height, from its center (for the battle view).
  ART.ciwsMounts = function (id) {
    var c = OURS[id]; if (!c || !c.pd) return null;
    return c.pd.map(function (q) { return [q[0] / 234, (q[1] - 9) / 234]; });
  };

  /* A1-A5 Azurian capital ships. Same violet hull as the small types, with a pale lilac
     command trim and a glowing core; told apart by outline and size. Noses down. */
  var CAPITAL = ["#f4ecff", "#b79cff", "#4b2e85"];
  function dome(p, x, y, r) {
    return '<rect x="' + (x - r * 0.18) + '" y="' + y + '" width="' + (r * 0.36) + '" height="' + (r * 1.9) + '" fill="#1a1720" stroke="' + ARCH.line + '" stroke-width=".8"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.2"/>' +
      '<circle cx="' + (x - r * 0.3) + '" cy="' + (y - r * 0.3) + '" r="' + (r * 0.3) + '" fill="#ffffff" opacity=".18"/>';
  }
  function engine(p, x, y, w) {
    return '<ellipse cx="' + x + '" cy="' + (y - 6) + '" rx="' + (w * 0.8) + '" ry="' + (w * 1.1) + '" fill="url(#' + p + 'g)"/>' +
      '<rect x="' + (x - w / 2) + '" y="' + (y - 2) + '" width="' + w + '" height="' + (w * 0.7) + '" rx="2" fill="#24202c" stroke="#5a5470"/>';
  }
  function core(p, x, y, r) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 1.8) + '" fill="url(#' + p + 'g)" opacity=".55"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#' + p + 'c)" stroke="' + ARCH.line + '" stroke-width="1.2"/>';
  }
  function plates(lines) { return lines.map(function (l) { return '<path d="' + l + '" stroke="' + ARCH.line + '" stroke-width="1.1" opacity=".75" fill="none"/>'; }).join(""); }

  ART.frigate = function () {
    var p = "fa" + (n++);
    var side = '<path d="M-30 -36 L-44 -30 L-44 18 L-28 26 Z" fill="url(#' + p + 'u)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<path d="M-44 -22 L-44 10" stroke="' + CAPITAL[1] + '" stroke-width="2.5"/>' + engine(p, -12, -88, 12);
    var body = '<path d="M-14 94 L-24 50 L-30 -40 L-18 -86 L18 -86 L30 -40 L24 50 L14 94 L6 62 L-6 62 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.8"/>' +
      '<path d="M18 -86 L30 -40 L24 50 L14 94 L6 62 L0 62 L0 -86 Z" fill="#000" opacity=".22"/>' +
      '<path d="M-18 -86 L-30 -40 L-24 50 L-14 94" fill="none" stroke="url(#' + p + 's)" stroke-width="2"/>' +
      '<path d="M-20 60 L-14 90 M20 60 L14 90" stroke="' + CAPITAL[1] + '" stroke-width="2.5"/>' +
      plates(["M-28 -20 L28 -20", "M-26 20 L26 20", "M-22 -60 L22 -60"]) +
      '<path d="M-7 -70 L7 -70 L5 -52 L-5 -52 Z" fill="url(#' + p + 'c)" stroke="' + ARCH.line + '"/>' +
      dome(p, 0, -6, 9) + dome(p, 0, 34, 8) + rivets([[-20, -40], [20, -40], [-18, 4], [18, 4], [-16, 46], [16, 46]]);
    return svg("-52 -108 104 212", defs(p, CAPITAL, ARCH.glow) + both(side) + body);
  };

  ART.cruiserA = function () {
    var p = "ca" + (n++);
    var wing = '<path d="M-26 12 L-92 -46 L-88 -66 L-30 -44 Z" fill="url(#' + p + 'u)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<path d="M-28 4 L-90 -50 L-91 -56 L-28 -4 Z" fill="url(#' + p + 'a)"/>' + dome(p, -60, -46, 7) + engine(p, -16, -94, 12);
    var body = '<path d="M0 98 L22 40 L30 -60 L18 -94 L-18 -94 L-30 -60 L-22 40 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.8"/>' +
      '<path d="M0 98 L22 40 L30 -60 L18 -94 L0 -94 Z" fill="#000" opacity=".22"/>' +
      '<path d="M-18 -94 L-30 -60 L-22 40 L0 98" fill="none" stroke="url(#' + p + 's)" stroke-width="2"/>' +
      '<rect x="-3.5" y="30" width="7" height="72" fill="#1a1720" stroke="' + ARCH.line + '"/>' +
      '<circle cx="0" cy="102" r="6" fill="url(#' + p + 'g)"/>' +
      plates(["M-28 -40 L28 -40", "M-26 0 L26 0", "M-22 30 L22 30"]) +
      core(p, 0, -66, 8) + dome(p, -14, -18, 8) + dome(p, 14, -18, 8) + engine(p, 0, -96, 13) +
      rivets([[-20, -50], [20, -50], [-18, 14], [18, 14]]);
    return svg("-100 -118 200 230", defs(p, CAPITAL, ARCH.glow) + both(wing) + body);
  };

  ART.carrier = function () {
    var p = "cv" + (n++);
    var bays = [-30, 30].map(function (x) {
      return '<rect x="' + (x - 18) + '" y="30" width="36" height="52" rx="3" fill="#0a0810" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
        '<rect x="' + (x - 18) + '" y="30" width="36" height="52" rx="3" fill="none" stroke="' + CAPITAL[1] + '" stroke-width="2" stroke-dasharray="5 4"/>' +
        [40, 52, 64, 76].map(function (y) { return '<circle cx="' + (x - 12) + '" cy="' + y + '" r="1.6" fill="' + ACCENT.interceptor[1] + '"/><circle cx="' + (x + 12) + '" cy="' + y + '" r="1.6" fill="' + ACCENT.interceptor[1] + '"/>'; }).join("");
    }).join("");
    var engines = [-54, -18, 18, 54].map(function (x) { return engine(p, x, -96, 14); }).join("");
    var body = '<path d="M-72 86 L72 86 L88 44 L88 -70 L62 -94 L-62 -94 L-88 -70 L-88 44 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.8"/>' +
      '<path d="M72 86 L88 44 L88 -70 L62 -94 L0 -94 L0 86 Z" fill="#000" opacity=".2"/>' +
      '<path d="M-88 44 L-88 -70 L-62 -94 L62 -94" fill="none" stroke="url(#' + p + 's)" stroke-width="2.5"/>' +
      plates(["M-86 -40 L86 -40", "M-86 0 L86 0", "M-56 -94 L-56 86", "M56 -94 L56 86"]) +
      '<rect x="-14" y="-58" width="28" height="44" rx="4" fill="url(#' + p + 'u)" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      core(p, 0, -36, 7) + bays +
      dome(p, -74, -60, 7) + dome(p, 74, -60, 7) + dome(p, -74, 20, 7) + dome(p, 74, 20, 7) +
      rivets([[-70, -20], [70, -20], [-40, -76], [40, -76], [-70, 64], [70, 64]]);
    return svg("-96 -118 192 214", defs(p, CAPITAL, ARCH.glow) + engines + body);
  };

  ART.battleshipA = function () {
    var p = "ba" + (n++);
    var engines = [-60, -36, -12, 12, 36, 60].map(function (x) { return engine(p, x, -98, 13); }).join("");
    var body = '<path d="M0 104 L52 52 L86 -8 L86 -70 L54 -98 L-54 -98 L-86 -70 L-86 -8 L-52 52 Z" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="2"/>' +
      '<path d="M0 104 L52 52 L86 -8 L86 -70 L54 -98 L0 -98 Z" fill="#000" opacity=".22"/>' +
      '<path d="M-86 -8 L-86 -70 L-54 -98 L54 -98" fill="none" stroke="url(#' + p + 's)" stroke-width="2.5"/>' +
      '<path d="M0 82 L36 44 L60 -4 L60 -60 L38 -80 L-38 -80 L-60 -60 L-60 -4 L-36 44 Z" fill="url(#' + p + 'u)" stroke="' + ARCH.line + '" stroke-width="1.5" opacity=".9"/>' +
      '<path d="M-60 -30 L-86 -30 M60 -30 L86 -30 M-48 30 L-70 24 M48 30 L70 24" stroke="' + CAPITAL[1] + '" stroke-width="3"/>' +
      plates(["M-58 -40 L58 -40", "M-50 10 L50 10", "M0 -80 L0 82"]) +
      '<rect x="-12" y="60" width="5" height="40" fill="#1a1720" stroke="' + ARCH.line + '"/><rect x="7" y="60" width="5" height="40" fill="#1a1720" stroke="' + ARCH.line + '"/>' +
      core(p, 0, -22, 13) +
      dome(p, -32, 24, 9) + dome(p, 32, 24, 9) + dome(p, -46, -16, 9) + dome(p, 46, -16, 9) + dome(p, -30, -58, 8) + dome(p, 30, -58, 8) +
      rivets([[-74, -50], [74, -50], [-74, -16], [74, -16], [-40, 60], [40, 60]]);
    return svg("-94 -122 188 236", defs(p, CAPITAL, ARCH.glow) + engines + body);
  };

  ART.fortress = function () {
    var p = "fo" + (n++), R = 92, pts = [], i;
    for (i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
    var hex = "M" + pts.map(function (q) { return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(" L") + " Z";
    var spokes = pts.map(function (q) { return '<path d="M0 0 L' + (q[0] * 0.92).toFixed(1) + ' ' + (q[1] * 0.92).toFixed(1) + '" stroke="url(#' + p + 'u)" stroke-width="12"/><path d="M0 0 L' + (q[0] * 0.92).toFixed(1) + ' ' + (q[1] * 0.92).toFixed(1) + '" stroke="' + ARCH.line + '" stroke-width="1" opacity=".6"/>'; }).join("");
    var guns = pts.map(function (q) { return dome(p, +(q[0] * 0.86).toFixed(1), +(q[1] * 0.86).toFixed(1), 9); }).join("");
    var mids = pts.map(function (q, k) { var r2 = pts[(k + 1) % 6]; return dome(p, +((q[0] + r2[0]) / 2 * 0.93).toFixed(1), +((q[1] + r2[1]) / 2 * 0.93).toFixed(1), 6); }).join("");
    var body = '<path d="' + hex + '" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="2"/>' +
      '<circle cx="0" cy="0" r="66" fill="#0a0810" stroke="' + ARCH.line + '" stroke-width="1.5"/>' +
      '<circle cx="0" cy="0" r="66" fill="none" stroke="' + CAPITAL[1] + '" stroke-width="2.5" stroke-dasharray="10 6"/>' +
      spokes + '<circle cx="0" cy="0" r="34" fill="url(#' + p + 'h)" stroke="' + ARCH.line + '" stroke-width="1.8"/>' + core(p, 0, 0, 18) +
      guns + mids;
    return svg("-104 -104 208 208", defs(p, CAPITAL, ARCH.glow) + body);
  };

  /* T2 Our torpedo: navy grey with a yellow warhead band and a blue-white exhaust. Nose up. */
  ART.ptTorpedo = function () {
    var p = "pt" + (n++);
    return svg("-26 -60 52 120", '<defs><radialGradient id="' + p + 'g"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#8fd3ff"/><stop offset="1" stop-color="#4cc3ee" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + p + 'b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d6dee5"/><stop offset=".5" stop-color="#8a96a2"/><stop offset="1" stop-color="#3e4851"/></linearGradient>' +
      '<linearGradient id="' + p + 't" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4cc3ee" stop-opacity=".7"/><stop offset="1" stop-color="#4cc3ee" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M-4 30 L4 30 L2 58 L-2 58 Z" fill="url(#' + p + 't)"/><ellipse cx="0" cy="30" rx="8" ry="10" fill="url(#' + p + 'g)"/>' +
      '<path d="M-7 18 L-15 28 L-7 26 Z M7 18 L15 28 L7 26 Z" fill="#5a6570" stroke="#1d242b"/>' +
      '<rect x="-7" y="-40" width="14" height="66" rx="7" fill="url(#' + p + 'b)" stroke="#1d242b" stroke-width="1.2"/>' +
      '<rect x="-7" y="-26" width="14" height="6" fill="#f0b54a"/><circle cx="0" cy="-38" r="4" fill="#ff6b5a"/>');
  };

  /* W1-W3 Our turret as the gunner sees it, from behind and above. */
  function turret(kind) {
    var p = "w" + (n++);
    var d = '<defs>' +
      '<linearGradient id="' + p + 'm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6dee5"/><stop offset=".5" stop-color="#8a96a2"/><stop offset="1" stop-color="#3e4851"/></linearGradient>' +
      '<linearGradient id="' + p + 'b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa6b1"/><stop offset=".45" stop-color="#5a6570"/><stop offset="1" stop-color="#262d33"/></linearGradient>' +
      '<radialGradient id="' + p + 'e"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="' + (kind === "pulse" ? "#7bffb0" : kind === "rail" ? "#9fe8ff" : "#c49bff") + '"/><stop offset="1" stop-color="' + (kind === "pulse" ? "#7bffb0" : kind === "rail" ? "#9fe8ff" : "#c49bff") + '" stop-opacity="0"/></radialGradient></defs>';
    var base = '<path d="M-46 60 L-34 22 L34 22 L46 60 Z" fill="url(#' + p + 'm)" stroke="#1d242b" stroke-width="2"/>' +
      '<path d="M-40 52 L40 52" stroke="#f0b54a" stroke-width="3" stroke-dasharray="8 6"/>' +
      '<ellipse cx="0" cy="22" rx="30" ry="9" fill="#5a6570" stroke="#1d242b" stroke-width="1.5"/>';
    var gun;
    if (kind === "pulse") {
      gun = [-9, 9].map(function (x) {
        return '<rect x="' + (x - 4) + '" y="-34" width="8" height="54" rx="2" fill="url(#' + p + 'b)" stroke="#1d242b" stroke-width="1.2"/>' +
          '<rect x="' + (x - 5) + '" y="-6" width="10" height="5" fill="#3a444d"/>' +
          '<circle cx="' + x + '" cy="-36" r="7" fill="url(#' + p + 'e)"/>';
      }).join("") + '<rect x="-20" y="6" width="40" height="18" rx="5" fill="url(#' + p + 'm)" stroke="#1d242b" stroke-width="1.5"/>';
    } else if (kind === "rail") {
      gun = '<rect x="-11" y="-74" width="5" height="96" fill="url(#' + p + 'b)" stroke="#1d242b"/><rect x="6" y="-74" width="5" height="96" fill="url(#' + p + 'b)" stroke="#1d242b"/>' +
        [-58, -40, -22, -4].map(function (y) { return '<rect x="-14" y="' + y + '" width="28" height="6" rx="2" fill="#b0763a" stroke="#1d242b"/>'; }).join("") +
        '<rect x="-3" y="-72" width="6" height="90" fill="#0e1418"/><circle cx="0" cy="-76" r="8" fill="url(#' + p + 'e)"/>' +
        '<rect x="-22" y="4" width="44" height="22" rx="5" fill="url(#' + p + 'm)" stroke="#1d242b" stroke-width="1.5"/>';
    } else {
      gun = '<path d="M-16 -8 L-24 -34 L-18 -36 L-8 -12 Z M16 -8 L24 -34 L18 -36 L8 -12 Z" fill="url(#' + p + 'b)" stroke="#1d242b"/>' +
        '<rect x="-14" y="-14" width="28" height="36" rx="10" fill="url(#' + p + 'm)" stroke="#1d242b" stroke-width="1.5"/>' +
        '<circle cx="0" cy="-26" r="15" fill="url(#' + p + 'e)"/><circle cx="0" cy="-26" r="8" fill="#e9dcff" stroke="#6a4aa0" stroke-width="2"/>' +
        '<path d="M-6 6 L6 6 M-6 12 L6 12" stroke="#1d242b" stroke-width="1.5"/>';
    }
    return svg("-60 -90 120 154", d + base + gun);
  }
  ART.turretPulse = function () { return turret("pulse"); };
  ART.turretRail = function () { return turret("rail"); };
  ART.turretIon = function () { return turret("ion"); };
})(typeof window !== "undefined" ? window : globalThis);
