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

  /* H1 Our gunboat, seen from above, nose up: naval grey, one dorsal turret, hull number. */
  ART.gunboat = function (hull) {
    var p = "g" + (n++);
    var d = '<defs>' +
      '<linearGradient id="' + p + 'h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3ccd4"/><stop offset=".5" stop-color="#8794a0"/><stop offset="1" stop-color="#4a5560"/></linearGradient>' +
      '<linearGradient id="' + p + 'd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c8895"/><stop offset="1" stop-color="#36404a"/></linearGradient>' +
      '<radialGradient id="' + p + 'g"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#8fd3ff"/><stop offset="1" stop-color="#4cc3ee" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'c" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#7fd7ff"/><stop offset="1" stop-color="#0a2230"/></radialGradient></defs>';
    var side = '<path d="M-14 40 L-40 62 L-44 84 L-16 74 Z" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.5"/>' +
      '<path d="M-36 66 L-42 80" stroke="#f0b54a" stroke-width="3"/>' +
      '<ellipse cx="-11" cy="96" rx="9" ry="14" fill="url(#' + p + 'g)"/><rect x="-17" y="80" width="12" height="10" rx="2" fill="#2a323a" stroke="#6b7884"/>' +
      // torpedo tube along each side, warhead showing at the front
      '<rect x="-27" y="-44" width="9" height="60" rx="4.5" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.2"/>' +
      '<rect x="-27" y="-36" width="9" height="4" fill="#f0b54a"/><circle cx="-22.5" cy="-42" r="3" fill="#ff6b5a"/>';
    var body = '<path d="M0 -96 L14 -50 L18 20 L16 84 L-16 84 L-18 20 L-14 -50 Z" fill="url(#' + p + 'h)" stroke="#1d242b" stroke-width="1.8"/>' +
      '<path d="M0 -96 L14 -50 L18 20 L16 84 L0 84 Z" fill="#000" opacity=".16"/>' +
      '<path d="M-16 -40 L16 -40 M-18 0 L18 0 M-18 40 L18 40 M-17 62 L17 62" stroke="#3a454f" stroke-width="1" opacity=".8"/>' +
      '<path d="M0 -80 L6 -62 L-6 -62 Z" fill="url(#' + p + 'c)" stroke="#1d242b"/>' +
      '<path d="M-12 -30 L-4 -24 L-12 -18 M12 -30 L4 -24 L12 -18" stroke="#f0b54a" stroke-width="2.5" fill="none"/>' +
      '<circle cx="0" cy="-2" r="11" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.5"/>' +
      '<rect x="-2.5" y="-34" width="5" height="30" rx="1" fill="#2a323a" stroke="#1d242b"/>' +
      '<circle cx="0" cy="-2" r="4" fill="#4cc3ee"/>' +
      '<text x="0" y="30" transform="rotate(-90 0 30)" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#1d242b" letter-spacing="1">' + (hull || "PT-117") + '</text>';
    return svg("-50 -102 100 216", d + both(side) + body);
  };

  /* S2-S9 Our warships from above, nose up. One hull recipe, so the classes read as one navy;
     each class shows what it actually carries: its guns (one turret per battery), the spinal
     main gun, the hangar, point-defense domes, its reactors and the planet buster.
     L = length, B = beam (viewBox units); rel = length relative to the gunboat. */
  var CLASSES = {
    picket:          { code: "DL", L: 150, B: 34, rel: 1.4, guns: [[0, -42]], gunR: 6, engines: 2, mast: true },
    destroyerEscort: { code: "DE", L: 160, B: 40, rel: 1.8, guns: [[0, -40], [0, 34]], gunR: 6.5, engines: 2, pd: 2 },
    destroyer:       { code: "DD", L: 172, B: 46, rel: 2.2, guns: [[0, -60], [0, 12], [0, 44]], gunR: 7, engines: 3, pd: 2 },
    lightCruiser:    { code: "CL", L: 180, B: 54, rel: 2.8, guns: [[-13, -16], [13, -16], [-13, 40], [13, 40]], gunR: 6.5, engines: 3, main: true, pd: 2 },
    cruiser:         { code: "C",  L: 186, B: 62, rel: 3.3, guns: [[-15, -18], [15, -18], [0, 22], [-10, 48], [10, 48]], gunR: 6.5, engines: 4, main: true, hangar: true, pd: 2 },
    heavyCruiser:    { code: "CA", L: 190, B: 70, rel: 3.8, guns: [[-17, -20], [17, -20], [-24, 18], [24, 18], [-11, 50], [11, 50]], gunR: 7, engines: 4, main: true, hangar: true, pd: 4 },
    battleship:      { code: "BB", L: 194, B: 80, rel: 4.6, guns: [[-20, -24], [20, -24], [-28, 12], [28, 12], [0, 34], [-16, 60], [16, 60]], gunR: 7.5, engines: 5, main: true, hangar: true, pd: 6, reactors: [[-16, 38], [16, 38]] },
    dreadnought:     { code: "DN", L: 196, B: 92, rel: 5.6, guns: [[-22, -28], [22, -28], [-34, 2], [34, 2], [-31, 28], [31, 28], [-22, 66], [22, 66]], gunR: 7.5, engines: 6, main: true, hangar: true, pd: 8, reactors: [[-15, 50], [0, 52], [15, 50]], buster: true }
  };
  ART.CLASSES = CLASSES;
  ART.warship = function (id, hullNo) {
    var c = CLASSES[id], p = "k" + (n++), L = c.L, B = c.B, h = L / 2, b = B / 2;
    var d = '<defs>' +
      '<linearGradient id="' + p + 'h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3ccd4"/><stop offset=".5" stop-color="#8794a0"/><stop offset="1" stop-color="#4a5560"/></linearGradient>' +
      '<linearGradient id="' + p + 'd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa6b2"/><stop offset="1" stop-color="#3e4852"/></linearGradient>' +
      '<radialGradient id="' + p + 'g"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#8fd3ff"/><stop offset="1" stop-color="#4cc3ee" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'c" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#7fd7ff"/><stop offset="1" stop-color="#0a2230"/></radialGradient>' +
      '<radialGradient id="' + p + 'r"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#4cc3ee"/><stop offset="1" stop-color="#1d4a5c"/></radialGradient>' +
      '<radialGradient id="' + p + 'x" cx=".4" cy=".35"><stop offset="0" stop-color="#ffd0c8"/><stop offset=".35" stop-color="#ff6b5a"/><stop offset="1" stop-color="#4a0d08"/></radialGradient></defs>';
    var out = [];
    // engine glow behind the stern
    var ne = c.engines, span = B * 0.62;
    for (var i = 0; i < ne; i++) {
      var ex = ne === 1 ? 0 : -span / 2 + span * i / (ne - 1);
      out.push('<ellipse cx="' + ex + '" cy="' + (h + 10) + '" rx="' + (B / ne * 0.32 + 3) + '" ry="12" fill="url(#' + p + 'g)"/>');
      out.push('<rect x="' + (ex - 4.5) + '" y="' + (h - 2) + '" width="9" height="8" rx="2" fill="#2a323a" stroke="#6b7884"/>');
    }
    // hull
    var bow = L * 0.3;
    var hull = "M0 " + (-h) + " L" + (b * 0.55) + " " + (-h + bow * 0.55) + " L" + b + " " + (-h + bow) + " L" + b + " " + (h - 16) + " L" + (b - 7) + " " + h +
      " L" + (-b + 7) + " " + h + " L" + (-b) + " " + (h - 16) + " L" + (-b) + " " + (-h + bow) + " L" + (-b * 0.55) + " " + (-h + bow * 0.55) + " Z";
    out.push('<path d="' + hull + '" fill="url(#' + p + 'h)" stroke="#1d242b" stroke-width="1.8"/>');
    out.push('<path d="M0 ' + (-h) + ' L' + (b * 0.55) + ' ' + (-h + bow * 0.55) + ' L' + b + ' ' + (-h + bow) + ' L' + b + ' ' + (h - 16) + ' L' + (b - 7) + ' ' + h + ' L0 ' + h + ' Z" fill="#000" opacity=".15"/>');
    for (var y = -h + bow; y < h - 10; y += 24) out.push('<path d="M' + (-b + 2) + ' ' + y + ' L' + (b - 2) + ' ' + y + '" stroke="#3a454f" stroke-width="1" opacity=".7"/>');
    out.push('<path d="M0 ' + (-h + 6) + ' L0 ' + (h - 4) + '" stroke="#3a454f" stroke-width=".8" opacity=".5"/>');
    // warp drive ring near the stern
    out.push('<circle cx="0" cy="' + (h - 22) + '" r="' + Math.min(14, b * 0.55) + '" fill="none" stroke="#6aa8ff" stroke-width="3" opacity=".85"/>');
    // hangar bays aft, both sides
    if (c.hangar) [-1, 1].forEach(function (sd) {
      var hx = sd * (b - 9), w = 10, hh = 34, hy = h - 60;
      out.push('<rect x="' + (hx - w / 2) + '" y="' + hy + '" width="' + w + '" height="' + hh + '" fill="#141a20" stroke="#1d242b"/>');
      out.push('<rect x="' + (hx - w / 2) + '" y="' + hy + '" width="' + w + '" height="4" fill="#f0b54a"/>');
    });
    // bridge superstructure
    var bw = Math.max(14, B * 0.32), by = -h + bow + 6;
    out.push('<rect x="' + (-bw / 2) + '" y="' + by + '" width="' + bw + '" height="' + (L * 0.12) + '" rx="3" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.2"/>');
    out.push('<rect x="' + (-bw / 2 + 3) + '" y="' + (by + 3) + '" width="' + (bw - 6) + '" height="3.5" rx="1" fill="url(#' + p + 'c)"/>');
    if (c.mast) out.push('<circle cx="0" cy="' + (by + L * 0.06 + 2) + '" r="6" fill="#d6dee5" stroke="#1d242b"/><path d="M-6 ' + (by + L * 0.06 + 2) + ' L6 ' + (by + L * 0.06 + 2) + '" stroke="#1d242b" stroke-width="1.5"/>');
    // spinal main gun: a long barrel from the bridge to the bow
    if (c.main) {
      out.push('<rect x="-3.2" y="' + (-h + 4) + '" width="6.4" height="' + (bow + 6) + '" fill="#2a323a" stroke="#1d242b"/>');
      out.push('<rect x="-5" y="' + (-h + bow * 0.5) + '" width="10" height="5" fill="#b0763a" stroke="#1d242b"/>');
      out.push('<rect x="-5" y="' + (-h + bow * 0.75) + '" width="10" height="5" fill="#b0763a" stroke="#1d242b"/>');
    }
    // reactors
    if (c.reactors) {
      var names = ["A", "B", "C"];
      for (var k = 0; k < c.reactors.length; k++) {
        var rx = c.reactors[k][0], ry = c.reactors[k][1];
        out.push('<circle cx="' + rx + '" cy="' + ry + '" r="6" fill="url(#' + p + 'r)" stroke="#1d242b"/>');
        out.push('<text x="' + rx + '" y="' + (ry + 0.5) + '" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="700" font-size="7" fill="#0b1016">' + names[k] + '</text>');
      }
    }
    // planet buster: a big ringed dome amidships
    if (c.buster) {
      out.push('<circle cx="0" cy="18" r="17" fill="url(#' + p + 'x)" stroke="#1d242b" stroke-width="1.5"/>');
      out.push('<circle cx="0" cy="18" r="21" fill="none" stroke="#f0b54a" stroke-width="2.5" stroke-dasharray="6 4"/>');
    }
    // gun turrets, barrels forward
    c.guns.forEach(function (g) {
      var r = c.gunR, gx = g[0], gy = g[1], twin = r >= 7;
      if (twin) { out.push('<rect x="' + (gx - 3.5) + '" y="' + (gy - r * 2.4) + '" width="2.6" height="' + (r * 2) + '" fill="#2a323a" stroke="#1d242b" stroke-width=".8"/>'); out.push('<rect x="' + (gx + 0.9) + '" y="' + (gy - r * 2.4) + '" width="2.6" height="' + (r * 2) + '" fill="#2a323a" stroke="#1d242b" stroke-width=".8"/>'); }
      else out.push('<rect x="' + (gx - 1.6) + '" y="' + (gy - r * 2.3) + '" width="3.2" height="' + (r * 2) + '" fill="#2a323a" stroke="#1d242b" stroke-width=".8"/>');
      out.push('<circle cx="' + gx + '" cy="' + gy + '" r="' + r + '" fill="url(#' + p + 'd)" stroke="#1d242b" stroke-width="1.2"/>');
      out.push('<circle cx="' + (gx - r * 0.3) + '" cy="' + (gy - r * 0.3) + '" r="' + (r * 0.35) + '" fill="#ffffff" opacity=".25"/>');
    });
    // point-defense domes along the edges
    if (c.pd) for (var q = 0; q < c.pd; q++) {
      var side = q % 2 ? 1 : -1, row = Math.floor(q / 2), rows = Math.ceil(c.pd / 2);
      var py = -h + bow + 10 + (L - bow - 40) * (row + 0.5) / rows, px = side * (b - 4);
      out.push('<circle cx="' + px + '" cy="' + py + '" r="3.2" fill="#d6dee5" stroke="#1d242b"/><rect x="' + (px - 0.6) + '" y="' + (py - 6) + '" width="1.2" height="4" fill="#1d242b"/>');
    }
    // deck chevrons and hull classification letters
    out.push('<path d="M' + (-b * 0.5) + ' ' + (-h + bow + 2) + ' L' + (-b * 0.25) + ' ' + (-h + bow - 4) + ' M' + (b * 0.5) + ' ' + (-h + bow + 2) + ' L' + (b * 0.25) + ' ' + (-h + bow - 4) + '" stroke="#f0b54a" stroke-width="2.2"/>');
    out.push('<text x="0" y="' + (h - 6) + '" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="8" fill="#1d242b" letter-spacing="1">' + (hullNo || c.code) + '</text>');
    var padX = 16, padTop = 8, padBottom = 26;
    return svg((-b - padX) + " " + (-h - padTop) + " " + (B + padX * 2) + " " + (L + padTop + padBottom), d + out.join(""));
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
