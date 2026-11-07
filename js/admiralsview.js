/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* The Admirals screen (stage 1): the hex map of the campaign (admirals.js, BL.Campaign), the
   fleet, the system tapped, and the last turn's report. Tap a force (or press its number) to
   select it, tap a system to send it there; SPLIT and JOIN reshape the forces; END TURN and
   every move happens at once. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function click() { if (BL.audio) BL.audio.play("click"); }
  var NS = "http://www.w3.org/2000/svg";
  var S = 30, RT3 = Math.sqrt(3), PAD = 8;            // hex size (centre to corner) and margin, in map units

  var c = null, opts = null, sel = [], focus = null, hintDefault = "", trail = null, ticking = null, cheered = false;
  // Markers slide to their new systems when a turn ends (TexasBont, Nov 7, 2026): where each force
  // was before (id -> hex), and whether a slide is playing.
  var slideFrom = null, sliding = false, SLIDE_MS = 650;
  // (where each marker is drawn: ours where they are, the Azurians where he knows them)
  var shown = {};
  function snap() { var m = {}; Object.keys(shown).forEach(function (id) { m[id] = shown[id]; }); return m; }
  var KIND = { home: "Our base", world: "Target world", empty: "" };

  function centre(h) { return { x: PAD + S + 1.5 * S * h.col, y: PAD + RT3 * S * (h.row + 0.5 * (h.col & 1) + 0.5) }; }   // flat-top, odd columns down
  function corners(p) {
    var out = []; for (var k = 0; k < 6; k++) { var a = Math.PI / 180 * 60 * k; out.push((p.x + S * Math.cos(a)).toFixed(1) + "," + (p.y + S * Math.sin(a)).toFixed(1)); }
    return out.join(" ");
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function pct(x) { return Math.round(100 * x) + "%"; }
  /* A system's mark (approved by TexasBont, Nov 7, 2026), in a 16 x 16 box centred on (x, y):
     a base an anchor, a shipyard crossed wrenches, a depot a cargo pod. */
  var MARK = {
    base: '<g fill="none" stroke-width="1.6" stroke-linecap="round"><circle cx="0" cy="-5.6" r="1.6"/>' +
      '<path d="M0,-4 V6.4 M-3.4,-2.2 H3.4 M-5.8,1.6 Q-5.4,6.4 0,6.6 Q5.4,6.4 5.8,1.6"/>' +
      '<path d="M-5.8,1.6 l-1.2,1.4 M-5.8,1.6 l1.4,0.8 M5.8,1.6 l1.2,1.4 M5.8,1.6 l-1.4,0.8" stroke-width="1.3"/></g>',
    shipyard: [-45, -135].map(function (r) {
      return '<g transform="rotate(' + r + ')" stroke="none" mask="url(#adm-jaw)"><rect x="-6" y="-0.95" width="12" height="1.9" rx="0.6"/><circle cx="6.4" cy="0" r="2.5"/><circle cx="-6.2" cy="0" r="2"/></g>';
    }).join(""),
    depot: '<path stroke="none" fill-rule="evenodd" d="M0,-7 L6.1,-3.5 L6.1,3.5 L0,7 L-6.1,3.5 L-6.1,-3.5 Z M0,-3.4 L-2.9,-1.7 L-2.9,1.7 L0,3.4 L2.9,1.7 L2.9,-1.7 Z"/><circle cx="0" cy="0" r="1.2" stroke="none"/>'
  };
  // (the wrench's open jaw and the hole in its box end)
  var DEFS = '<defs><mask id="adm-jaw" maskUnits="userSpaceOnUse" x="-10" y="-10" width="20" height="20"><rect x="-10" y="-10" width="20" height="20" fill="#fff"/>' +
    '<rect x="5.6" y="-1.1" width="4" height="2.2" fill="#000"/><circle cx="-6.2" cy="0" r="0.9" fill="#000"/></mask>' +
    // (the arrowhead on an Azurian force's last move)
    '<marker id="adm-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 Z" class="adm-arrowhead"/></marker></defs>';

  function start(o) {
    opts = o; c = new BL.Campaign({ seed: o.seed, level: o.level }); sel = []; focus = c.home; trail = null; cheered = false;
    if (ticking) { clearTimeout(ticking); ticking = null; }
    $("adm-modal").hidden = true;
    hintDefault = $("adm-hint").textContent = "1–9 select · A all · S split · J join · H hold · F fly the flag (first turn) · Enter end turn · Esc clear";
    draw();
  }

  /* --------------------------------------------------------------- Drawing */
  function draw() {
    $("adm-title").textContent = "Admirals · " + c.level + " " + BL.ADMIRALS.titles[c.level] + (c.convoyMode ? " · convoy escort" : "");
    $("adm-turn").textContent = "Turn " + Math.min(c.turn, c.turns) + " of " + c.turns;
    $("adm-seed").textContent = "seed " + c.seed;
    $("btn-adm-end").disabled = c.state !== "play";
    drawMap(); drawFleet(); drawSystem(); drawReport();
    // (the markers slide first, then the battle or the write-up comes up)
    if (slide()) { sliding = true; setTimeout(function () { sliding = false; modals(); }, SLIDE_MS + 50); } else modals();
  }
  function modals() {
    if (c.state === "battle") battleView(); else if (c.state === "flag") flagModal(); else if (c.state === "won" || c.state === "lost" || c.state === "over") endModal();
  }
  // Each marker from the system it was in to the one it's in now; a force new to the map fades in.
  function slide() {
    if (!slideFrom) return false;
    var from = slideFrom, moved = false; slideFrom = null;
    Array.prototype.forEach.call($("adm-svg").querySelectorAll("g.adm-chip[data-id]"), function (g) {
      var id = g.getAttribute("data-id"), was = from[id], now = shown[id];
      if (was === undefined) { g.style.opacity = "0"; g.getBoundingClientRect(); g.style.transition = "opacity " + SLIDE_MS + "ms"; g.style.opacity = ""; moved = true; return; }
      if (was === now) return;
      var a = centre(c.hexes[was]), b = centre(c.hexes[now]);
      g.style.transform = "translate(" + (a.x - b.x).toFixed(1) + "px," + (a.y - b.y).toFixed(1) + "px)";
      g.getBoundingClientRect();
      g.style.transition = "transform " + SLIDE_MS + "ms ease-in-out"; g.style.transform = "none";
      moved = true;
    });
    return moved;
  }
  function drawMap() {
    var svg = $("adm-svg"), w = PAD * 2 + S * (1.5 * c.cols + 0.5), h = PAD * 2 + RT3 * S * (c.rows + 0.5);
    svg.setAttribute("viewBox", "0 0 " + w.toFixed(0) + " " + h.toFixed(0));
    svg.innerHTML = DEFS;
    var gh = el("g", {}, svg), gp = el("g", {}, svg), gt = el("g", { id: "adm-trails" }, svg), gf = el("g", {}, svg);
    var vis = c.visibleSet();                         // (fog of war: the systems none of his ships can see are dimmed)
    c.hexes.forEach(function (x) {
      var p = centre(x), cls = "adm-hex" + (x.owner === "us" ? " us" : x.owner === "az" ? " az" : "") + (vis[x.i] ? "" : " fog");
      var poly = el("polygon", { points: corners(p), "class": cls }, gh);
      poly.addEventListener("click", function () { tapHex(x.i); });
      var t = el("text", { x: p.x, y: p.y - S * 0.55, "class": "adm-name" }, gh); t.textContent = x.name;
      var side = x.owner === "us" ? "us" : "az", k = "adm-mark " + side;
      if (x.kind === "home" || x.kind === "world") el("circle", { cx: p.x, cy: p.y - S * 0.18, r: x.kind === "world" ? 7 : 5, "class": k }, gh);
      else if (x.kinds.length) {
        // (two or three marks side by side, smaller to fit)
        var n = x.kinds.length, sc = [0.8, 0.62, 0.5][n - 1], gap = 16 * sc + 1.5;
        x.kinds.forEach(function (kd, j) {
          el("g", { transform: "translate(" + (p.x + (j - (n - 1) / 2) * gap).toFixed(1) + "," + (p.y - S * 0.2).toFixed(1) + ") scale(" + sc + ")", "class": k }, gh).innerHTML = MARK[kd];
        });
      }
      else el("circle", { cx: p.x, cy: p.y - S * 0.18, r: 1.6, "class": "adm-star" }, gh);
      Array.prototype.forEach.call(gh.querySelectorAll("text, circle, rect, path, g, polygon:not(.adm-hex)"), function (n) { n.style.pointerEvents = "none"; });
    });
    // The selected squadrons' way to where they're sent.
    sel.forEach(function (id) {
      var f = c.force(id); if (!f || f.lost || f.dest === f.at) return;
      var pts = [f.at].concat(c.path(f.at, f.dest)).map(function (i) { var p = centre(c.hexes[i]); return p.x.toFixed(1) + "," + p.y.toFixed(1); });
      el("polyline", { points: pts.join(" "), "class": "adm-path" }, gp);
      el("polygon", { points: corners(centre(c.hexes[f.dest])), "class": "adm-dest" }, gp);
    });
    var known = {}; c.known().forEach(function (k) { known[k.id] = k; });
    if (trail && known[trail]) drawTrail(known[trail], gt); else trail = null;
    // The forces: a chip each, ours first, two to a row under the system's mark. Ours are where
    // they are; the Azurians where he knows them (seen now: solid; reported: dashed and faded).
    var at = {}; shown = {};
    c.ours().forEach(function (f) { (at[f.at] = at[f.at] || []).push({ id: f.id, side: "us", f: f, label: c.chip(f) + (f.id === c.flag ? "★" : "") }); shown[f.id] = f.at; });
    Object.keys(known).forEach(function (id) {
      var k = known[id]; (at[k.at] = at[k.at] || []).push({ id: k.id, side: "az", k: k, label: k.label + (k.seen ? "" : "?") }); shown[id] = k.at;
    });
    Object.keys(at).forEach(function (i) {
      var p = centre(c.hexes[i]), list = at[i].sort(function (a, b) { return (a.side === "us" ? 0 : 1) - (b.side === "us" ? 0 : 1); });
      var ch = 9, per = 2, labels = list.map(function (x) { return x.label; });
      var cw = Math.max(15, 4 + 4.4 * Math.max.apply(null, labels.map(function (l) { return l.length; })));
      list.forEach(function (it, k) {
        var row = Math.floor(k / per), inRow = Math.min(per, list.length - row * per), col = k % per;
        var x = p.x + (col - (inRow - 1) / 2) * (cw + 1) - cw / 2, y = p.y + 1 + row * (ch + 1);
        var g = el("g", { "class": "adm-chip " + it.side + (it.side === "az" && !it.k.seen ? " stale" : "") + (sel.indexOf(it.id) >= 0 ? " sel" : ""), "data-id": it.id }, gf);
        el("rect", { x: x, y: y, width: cw, height: ch, rx: 2 }, g);
        var t = el("text", { x: x + cw / 2, y: y + ch / 2 + 0.5 }, g); t.textContent = labels[k];
        g.addEventListener("click", function (ev) { ev.stopPropagation(); if (it.side === "us") toggle(it.id); else { trail = trail === it.id ? null : it.id; tapHex(it.k.at); } });
        // (an Azurian force: the way it has come since the campaign began, while the pointer is on it)
        if (it.side === "az") {
          g.addEventListener("mouseenter", function () { var l = $("adm-trails"); l.innerHTML = ""; drawTrail(it.k, l); });
          g.addEventListener("mouseleave", function () { var l = $("adm-trails"); l.innerHTML = ""; if (trail && known[trail]) drawTrail(known[trail], l); });
        }
      });
    });
  }
  // An Azurian force's trail as he knows it: every system it was seen or reported in, from the
  // first (a ring) to the last, the arrowhead on its last move. A leg is solid if his ships saw it
  // get there (current), dotted if it comes from a report (stale).
  function drawTrail(k, layer) {
    if (!k || !k.trail || !k.trail.length) return;
    var tr = k.trail, ps = tr.map(function (x) { return centre(c.hexes[x.at]); }), n = ps.length;
    var p0 = ps[0]; el("circle", { cx: p0.x, cy: p0.y, r: 4, "class": "adm-trail-start" + (tr[0].seen ? "" : " stale") }, layer);
    if (n < 2) return;
    // (the arrow stops short of the centre, clear of the system's mark)
    var a = ps[n - 2], b = ps[n - 1], d = Math.hypot(b.x - a.x, b.y - a.y) || 1, q = Math.max(0, d - 9) / d;
    ps[n - 1] = { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q };
    for (var j = 1; j < n; j++) {
      el("line", { x1: ps[j - 1].x.toFixed(1), y1: ps[j - 1].y.toFixed(1), x2: ps[j].x.toFixed(1), y2: ps[j].y.toFixed(1),
        "class": "adm-trail" + (tr[j].seen ? "" : " stale"), "marker-end": j === n - 1 ? "url(#adm-arrow)" : "" }, layer);
      if (j < n - 1) el("circle", { cx: ps[j].x, cy: ps[j].y, r: 1.8, "class": "adm-trail-dot" }, layer);
    }
  }
  function line(f) {
    var alive = c.alive(f).length, ord = f.dest === f.at ? "Holding at " + c.hexes[f.at].name : "To " + c.hexes[f.dest].name + " · " + c.path(f.at, f.dest).length + " warps";
    return "<div class='adm-sq" + (sel.indexOf(f.id) >= 0 ? " sel" : "") + (f.lost ? " lost" : "") + "' data-id='" + f.id + "'>" +
      "<b>" + (fleetList().indexOf(f) + 1) + " · " + esc(c.desc(f).replace(/^./, function (s) { return s.toUpperCase(); })) + (f.id === c.flag ? " ★ flag" : "") + "</b>" +
      "<span>" + esc(f.cmd.name) + " · " + f.cmd.temper + " · skill " + Math.round(f.cmd.skill * 100) + "</span>" +
      (f.lost ? "<span class='bad'>Destroyed</span>" : "<span>" + alive + "/" + f.ships.length + " ships · " + pct(c.condition(f)) + "</span><span>" + esc(ord) + "</span>") + "</div>";
  }
  function fleetList() { return c.ours(); }
  function drawFleet() {
    $("adm-fleet").innerHTML = fleetList().map(line).join("");
    Array.prototype.forEach.call($("adm-fleet").querySelectorAll(".adm-sq"), function (d) {
      d.onclick = function () { var f = c.force(+d.getAttribute("data-id")); if (!f.lost) toggle(f.id); };
    });
    $("btn-adm-flag").hidden = !(c.turn === 1 && !c.flagSet && c.state === "play");
  }
  function drawSystem() {
    var h = c.hexes[focus], mine = c.ours().filter(function (f) { return f.at === focus; }), theirs = c.known().filter(function (k) { return k.at === focus; });
    var what = h.kinds.length ? "Azurian " + h.kinds.slice(0, -1).join(", ") + (h.kinds.length > 1 ? " and " : "") + h.kinds[h.kinds.length - 1]
      : h.yard ? (h.kind === "world" && c.convoyMode ? "Destination world" : KIND[h.kind]) + " (base, shipyard and depot)" : KIND[h.kind];
    var kind = what ? what + (h.kind !== "home" && h.owner === "us" ? " (taken)" : "") : "Empty system";
    $("adm-sys").innerHTML = "<div><b>" + esc(h.name) + "</b></div><div>" + esc(kind) + " · " + c.dist(c.home, focus) + " warps from our base</div>" +
      mine.map(function (f) {
        return "<div class='us'>" + esc(c.name(f).replace(/^./, function (s) { return s.toUpperCase(); })) + " · " + c.alive(f).length + "/" + f.ships.length + " · " + pct(c.condition(f)) + "</div>";
      }).join("") +
      theirs.map(function (k) {
        var cap1 = k.name.replace(/^./, function (s) { return s.toUpperCase(); });
        return k.seen && k.f ? "<div class='az'>" + esc(cap1) + " · " + c.alive(k.f).length + "/" + k.f.ships.length + " · " + pct(c.condition(k.f)) + " · seen now</div>"
          : "<div class='az stale'>" + esc(cap1) + " · " + (k.age > 0 ? "reported " + k.age + " turn" + (k.age === 1 ? "" : "s") + " ago" : "reported") + "</div>";
      }).join("") +
      (mine.length || theirs.length ? "" : "<div class='muted'>" + (c.visibleSet()[focus] ? "No forces here." : "Nothing reported here (out of sight).") + "</div>");
  }
  function drawReport() {
    var last = c.log.slice(-3).reverse();
    $("adm-report").innerHTML = last.length ? last.map(function (e) {
      return "<div class='adm-rep'><b>Turn " + e.turn + "</b>" + e.lines.map(function (l) { return "<div" + (/^ {4}/.test(l) ? " class='sub'" : "") + ">" + esc(l.trim()) + "</div>"; }).join("") + "</div>";
    }).join("") : "<div class='muted'>Send your forces, then END TURN. Every move happens at once.</div>";
  }

  /* ------------------------------------------------------------- Input */
  function toggle(id) {
    if (c.state !== "play") return;
    click();
    var k = sel.indexOf(id); if (k >= 0) sel.splice(k, 1); else sel.push(id);
    var f = c.force(id); if (f) focus = f.at;
    draw();
  }
  function tapHex(i) {
    if (c.state !== "play") return;
    click();
    if (sel.length) sel.forEach(function (id) { c.order(id, i); });
    focus = i;
    draw();
  }
  function all() { if (c.state !== "play") return; click(); var us = c.ours().map(function (f) { return f.id; }); sel = sel.length === us.length ? [] : us; draw(); }
  function hold() { if (c.state !== "play") return; click(); sel.forEach(function (id) { var f = c.force(id); if (f) c.order(id, f.at); }); draw(); }
  // Split each force selected into its top ship and her escorts' pyramids (the new forces selected too).
  function split() {
    if (c.state !== "play") return;
    if (!sel.length) { $("adm-hint").textContent = "Select a force to split."; return; }
    var made = []; sel.forEach(function (id) { made = made.concat(c.split(id).map(function (f) { return f.id; })); });
    if (!made.length) { $("adm-hint").textContent = "A picket squadron, or a ship on her own, can't be split."; return; }
    click(); sel = sel.filter(function (id) { var f = c.force(id); return f && !f.lost && !f.merged; }).concat(made); draw();
  }
  function join() {
    if (c.state !== "play") return;
    var lead = c.join(sel);
    if (!lead) { $("adm-hint").textContent = "Select two or more forces in the same system to join them."; return; }
    click(); sel = [lead.id]; draw();
  }
  function flagHere() {
    if (sel.length !== 1) { $("adm-hint").textContent = "Select one force to fly your flag with."; return; }
    if (c.setFlag(sel[0])) { click(); draw(); }
  }
  function endTurn() {
    if (c.state !== "play" || sliding) return;
    if (BL.audio) BL.audio.play("jump");
    slideFrom = snap();
    c.endTurn();
    after();
  }
  /* The fight your flag is in, round by round: every force on both sides with its ships, the
     totals and the account. It stops at your mark (25% damage, then the one you pick) for you to
     withdraw or fight on; you can withdraw any time. */
  var ROUND_MS = 700;
  function battleView() {
    renderBattle();
    if (!ticking && !c.tally().paused) ticking = setTimeout(tick, ROUND_MS);
  }
  function tick() {
    ticking = null;
    if (!c || c.state !== "battle") return;
    var was = snap(), r = c.battleStep();
    // (the fight is over: the panel shows how it ended until he closes it)
    if (r === "done") { slideFrom = was; renderBattle(c.tally(c.lastBattle)); return; }
    if (BL.audio) BL.audio.play("click");
    renderBattle();
    if (r === "go") ticking = setTimeout(tick, ROUND_MS);
  }
  function battleOver() { if (ticking) { clearTimeout(ticking); ticking = null; } $("adm-modal").hidden = true; after(); }
  function renderBattle(over) {
    var m = $("adm-modal"), t = over || c.tally(), pcx = function (x) { return Math.round(100 * x) + "%"; };
    function force(r, side) {
      // (a pip per ship, by her hull left; a big force just the bar)
      var pips = r.total <= 48 ? "<div class='adm-pips'>" + r.ships.map(function (h) {
        return "<i class='" + (h <= 0 ? "dead" : h < 0.34 ? "low" : h < 0.67 ? "mid" : "") + "'></i>"; }).join("") + "</div>" : "";
      return "<div class='adm-bf " + side + (r.gone ? " gone" : "") + "'><div class='nm'>" + esc(r.name) + (r.flag ? " ★" : "") + (r.gone ? " · broke off" : "") + "</div>" +
        "<div class='adm-bar'><b style='width:" + Math.round(100 * r.cond) + "%'></b></div>" +
        "<div class='st'>" + r.alive + "/" + r.total + " ships · " + pcx(r.cond) + "</div>" + pips + "</div>";
    }
    var asks = t.asks.filter(function (a) { return a > t.usDmg; });
    var standing = function (rs) { return rs.some(function (r) { return r.alive && !r.gone; }); };
    var ending = !over ? "" : !standing(t.us) && !standing(t.az) ? "Both sides are out of the fight."
      : !standing(t.us) ? (t.us.some(function (r) { return r.alive; }) ? "Our forces broke off." : "Our forces are destroyed.")
      : t.az.some(function (r) { return r.alive; }) ? "The Azurians broke off. We hold the field." : "The Azurians are destroyed. We hold the field.";
    var buttons = over ? "<button id='adm-bclose' class='primary'>Close</button>" : t.paused
      ? asks.map(function (a) { return "<button data-ask='" + a + "'>Fight on to " + pcx(a) + " damage</button>"; }).join("") +
        "<button data-ask='1'>Fight to the last ship</button><button id='adm-pull' class='primary'>Withdraw</button>"
      : "<button id='adm-pull'>Withdraw now</button>";
    m.innerHTML = "<div class='ov-card wide adm-battle'><h1>Battle at " + esc(t.at) + " · round " + t.round + "</h1>" +
      "<div class='adm-bsides'><div class='adm-btot us'><b>Ours</b> lost " + t.usLost + " ship" + (t.usLost === 1 ? "" : "s") + " · " + pcx(t.usDmg) + " damage</div>" +
      "<div class='adm-btot az'><b>Azurian</b> lost " + t.azLost + " ship" + (t.azLost === 1 ? "" : "s") + " · " + pcx(t.azDmg) + " damage</div></div>" +
      "<div class='adm-bsides'><div>" + t.us.map(function (r) { return force(r, "us"); }).join("") + "</div><div>" + t.az.map(function (r) { return force(r, "az"); }).join("") + "</div></div>" +
      (over ? "<p class='adm-bstop'>The fight is over. " + esc(ending) + "</p>" : "") +
      (t.paused ? "<p class='adm-bstop'>Your side has taken " + pcx(t.usDmg) + " damage. Your call: withdraw, or fight on.</p>" : "") +
      "<div class='adm-blog'>" + t.events.slice(-6).reverse().map(function (e) { return "<div>" + esc(e) + "</div>"; }).join("") + "</div>" +
      "<div class='menu'>" + buttons + "</div></div>";
    m.hidden = false;
    Array.prototype.forEach.call(m.querySelectorAll("button[data-ask]"), function (b) {
      b.onclick = function () { click(); c.battleChoice(+b.getAttribute("data-ask")); battleView(); };
    });
    if (over) { $("adm-bclose").onclick = function () { click(); battleOver(); }; return; }
    $("adm-pull").onclick = function () { click(); slideFrom = snap(); c.battleChoice("withdraw"); battleOver(); };
  }
  // (after the turn ends: drop the selected forces that are gone)
  function after() { sel = sel.filter(function (id) { var f = c.force(id); return f && !f.lost && !f.merged; }); draw(); }
  function flagModal() {
    var m = $("adm-modal"), us = c.ours().filter(function (f) { return f.role !== "convoy"; });
    m.innerHTML = "<div class='ov-card'><h1>The flagship is lost</h1><p>Shift your flag to another force and fight on (take the world and it's still a win), or withdraw: the campaign is lost.</p>" +
      "<div class='menu'>" + us.map(function (f) { return "<button data-id='" + f.id + "'>Shift the flag to the " + esc(c.desc(f)) + "</button>"; }).join("") +
      "<button id='adm-withdraw'>Withdraw</button></div></div>";
    m.hidden = false;
    Array.prototype.forEach.call(m.querySelectorAll("button[data-id]"), function (b) { b.onclick = function () { click(); c.setFlag(+b.getAttribute("data-id")); m.hidden = true; draw(); }; });
    $("adm-withdraw").onclick = function () { click(); c.withdraw(); m.hidden = true; draw(); };
  }
  // (F3, the convoy escort)
  function convoyWhy(u, st, left) {
    var cg = u.cargoIn + " of " + u.cargoTotal + " cargo ships";
    if (st === "won") return cg + " are in at " + u.world + " (turn " + u.wonTurn + "). Now hold the world to the end of turn " + u.turns + " (" + left + " turn" + (left === 1 ? "" : "s") + "): Azurian raiders are coming for it. Your ships repair at its shipyard: a whole turn there without a fight.";
    if (st === "over") return "The convoy got through: " + cg + " at " + u.world + ", and the world held to the end of turn " + u.turns + ".";
    return c.why === "convoy" ? "Fewer than half the cargo ships are left (" + u.cargoLeft + " of " + u.cargoTotal + "): the convoy has failed."
      : c.why === "late" ? "At the end of turn " + u.turns + " only " + cg + " were at " + u.world + "."
      : c.why === "retaken" ? "The Azurians hold " + u.world + " at the end of turn " + u.turns + "."
      : c.why === "losses" ? "The whole fleet is lost." : "The fleet withdrew after losing its flagship.";
  }
  // The write-up: the world taken (carry on with the turns left, or stop), the campaign over, or lost.
  function endModal() {
    var m = $("adm-modal"), u = c.summary(), st = c.state, pcx = function (x) { return Math.round(100 * x) + "%"; };
    var left = c.turns - c.turn + 1;
    var head = st === "won" ? (u.convoy ? "The convoy is in" : "The world is taken") : st === "over" ? "Campaign won" : "Campaign lost";
    var why = u.convoy ? convoyWhy(u, st, left) : st === "won" ? "The target world " + u.world + " is taken on turn " + u.wonTurn + " of " + u.turns + ". Now hold it to the end of turn " + u.turns +
        " (" + left + " turn" + (left === 1 ? "" : "s") + "): the Azurians will throw everything they have left at it, and more is coming. Your ships repair at its shipyard: a whole turn there without a fight and they're good as new."
      : st === "over" ? "The target world " + u.world + " was taken on turn " + u.wonTurn + " and held to the end of turn " + u.turns + "."
      : c.why === "time" ? "Fleet HQ's " + c.turns + " turns ran out before the world fell."
      : c.why === "retaken" ? "The Azurians hold " + u.world + " at the end of turn " + u.turns + ": it was taken but not held."
      : c.why === "losses" ? "The whole fleet is lost."
      : "The fleet withdrew after losing its flagship.";
    if (BL.audio && !(st !== "lost" && cheered)) BL.audio.play(st === "lost" ? "lose" : "win");
    if (st !== "lost") cheered = true;
    var bt = u.battles.map(function (b) {
      return "<div>Turn " + b.turn + " · " + esc(b.at) + (b.flag ? " ★" : "") + " · " + b.result + " · we lost " + b.usLost + " (" + pcx(b.usDmg) + "), they lost " + b.azLost + " (" + pcx(b.azDmg) + ")</div>";
    }).join("") || "<div class='muted'>None.</div>";
    var tk = u.taken.map(function (x) { return "<div>Turn " + x.turn + " · " + esc(x.name) + " · " + esc(x.what) + "</div>"; }).join("") || "<div class='muted'>None.</div>";
    m.innerHTML = "<div class='ov-card wide adm-write'><h1>" + head + "</h1><p>" + esc(why) + "</p>" +
      "<p>Ships lost: ours " + u.usLost + " of " + u.usTotal + "; Azurian " + u.azLost + " of " + u.azTotal + ".</p>" +
      "<h3>Systems taken</h3>" + tk + "<h3>Battles (★ your flag's)</h3>" + bt +
      (u.forces.length ? "<h3>The fleet now</h3>" + u.forces.map(function (x) { return "<div>" + esc(x) + "</div>"; }).join("") : "") +
      "<div class='menu'>" + (st === "won" && left > 0 && c.ours().length ? "<button id='adm-carry' class='primary'>" + (u.convoy ? "Hold " + esc(u.world) : "Hold the world") + " (" + left + " turn" + (left === 1 ? "" : "s") + " left)</button>" : "") +
      "<button id='adm-again'" + (st === "won" && left > 0 ? "" : " class='primary'") + ">New campaign</button><button id='adm-same'>Same seed again</button><button id='adm-quit'>Back to the title screen</button></div></div>";
    m.hidden = false;
    if ($("adm-carry")) $("adm-carry").onclick = function () { click(); c.carryOn(); m.hidden = true; draw(); };
    $("adm-again").onclick = function () { click(); start({ seed: BL.randomSeed(), level: c.level, onExit: opts.onExit }); };
    $("adm-same").onclick = function () { click(); start({ seed: c.seed, level: c.level, onExit: opts.onExit }); };
    $("adm-quit").onclick = function () { click(); m.hidden = true; opts.onExit(); };
  }

  function wire() {
    $("btn-adm-end").onclick = endTurn;
    $("btn-adm-all").onclick = all;
    $("btn-adm-hold").onclick = hold;
    $("btn-adm-flag").onclick = flagHere;
    $("btn-adm-split").onclick = split;
    $("btn-adm-join").onclick = join;
    $("btn-adm-how").onclick = function () { click(); $("ov-how").hidden = false; };
    $("btn-adm-quit").onclick = function () { click(); if (ticking) { clearTimeout(ticking); ticking = null; } opts.onExit(); };
    $("scr-admirals").addEventListener("mouseover", function (ev) {
      var t = ev.target.closest && ev.target.closest("[data-hint]");
      $("adm-hint").textContent = t ? t.getAttribute("data-hint") : hintDefault;
    });
    document.addEventListener("keydown", function (ev) {
      if (!c || $("scr-admirals").hidden || !$("ov-how").hidden || !$("ov-options").hidden || !$("adm-modal").hidden) return;
      var k = ev.key;
      if (k >= "1" && k <= "9") { var f = fleetList()[+k - 1]; if (f && !f.lost) toggle(f.id); }
      else if (k === "a" || k === "A") all();
      else if (k === "h" || k === "H") hold();
      else if (k === "f" || k === "F") flagHere();
      else if (k === "s" || k === "S") split();
      else if (k === "j" || k === "J") join();
      else if (k === "Enter") { ev.preventDefault(); endTurn(); }
      else if (k === "Escape") { sel = []; draw(); }
    });
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  }
  BL.admiralsView = { start: start };
})(typeof window !== "undefined" ? window : globalThis);
