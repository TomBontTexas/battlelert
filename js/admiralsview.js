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
    '<rect x="5.6" y="-1.1" width="4" height="2.2" fill="#000"/><circle cx="-6.2" cy="0" r="0.9" fill="#000"/></mask></defs>';

  function start(o) {
    opts = o; c = new BL.Campaign({ seed: o.seed, level: o.level }); sel = []; focus = c.home; trail = null; cheered = false;
    if (ticking) { clearTimeout(ticking); ticking = null; }
    $("adm-modal").hidden = true;
    hintDefault = $("adm-hint").textContent = "1–9 select · A all · S split · J join · H hold · F fly the flag (first turn) · Enter end turn · Esc clear";
    draw();
  }

  /* --------------------------------------------------------------- Drawing */
  function draw() {
    $("adm-title").textContent = "Admirals · " + c.level + " " + BL.ADMIRALS.titles[c.level];
    $("adm-turn").textContent = "Turn " + Math.min(c.turn, c.turns) + " of " + c.turns;
    $("adm-seed").textContent = "seed " + c.seed;
    $("btn-adm-end").disabled = c.state !== "play";
    drawMap(); drawFleet(); drawSystem(); drawReport();
    if (c.state === "battle") battleView(); else if (c.state === "flag") flagModal(); else if (c.state === "won" || c.state === "lost" || c.state === "over") endModal();
  }
  function drawMap() {
    var svg = $("adm-svg"), w = PAD * 2 + S * (1.5 * c.cols + 0.5), h = PAD * 2 + RT3 * S * (c.rows + 0.5);
    svg.setAttribute("viewBox", "0 0 " + w.toFixed(0) + " " + h.toFixed(0));
    svg.innerHTML = DEFS;
    var gh = el("g", {}, svg), gp = el("g", {}, svg), gt = el("g", { id: "adm-trails" }, svg), gf = el("g", {}, svg);
    c.hexes.forEach(function (x) {
      var p = centre(x), cls = "adm-hex" + (x.owner === "us" ? " us" : x.owner === "az" ? " az" : "");
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
    if (trail) drawTrail(c.force(trail), gt);
    // The forces: a chip each, ours first, two to a row under the system's mark.
    var at = {};
    c.forces.forEach(function (f) { if (!f.lost) (at[f.at] = at[f.at] || []).push(f); });
    Object.keys(at).forEach(function (i) {
      var p = centre(c.hexes[i]), list = at[i].sort(function (a, b) { return (a.side === "us" ? 0 : 1) - (b.side === "us" ? 0 : 1); });
      var ch = 9, per = 2, labels = list.map(function (f) { return c.chip(f) + (f.id === c.flag ? "★" : ""); });
      var cw = Math.max(15, 4 + 4.4 * Math.max.apply(null, labels.map(function (l) { return l.length; })));
      list.forEach(function (f, k) {
        var row = Math.floor(k / per), inRow = Math.min(per, list.length - row * per), col = k % per;
        var x = p.x + (col - (inRow - 1) / 2) * (cw + 1) - cw / 2, y = p.y + 1 + row * (ch + 1);
        var g = el("g", { "class": "adm-chip " + (f.side === "us" ? "us" : "az") + (sel.indexOf(f.id) >= 0 ? " sel" : "") }, gf);
        el("rect", { x: x, y: y, width: cw, height: ch, rx: 2 }, g);
        var t = el("text", { x: x + cw / 2, y: y + ch / 2 + 0.5 }, g); t.textContent = labels[k];
        g.addEventListener("click", function (ev) { ev.stopPropagation(); if (f.side === "us") toggle(f.id); else { trail = trail === f.id ? null : f.id; tapHex(f.at); } });
        // (an Azurian force: the way it has come since the campaign began, while the pointer is on it)
        if (f.side === "az") {
          g.addEventListener("mouseenter", function () { var l = $("adm-trails"); l.innerHTML = ""; drawTrail(f, l); });
          g.addEventListener("mouseleave", function () { var l = $("adm-trails"); l.innerHTML = ""; if (trail) drawTrail(c.force(trail), l); });
        }
      });
    });
  }
  // An Azurian force's trail: every system it has been in, from where it began (a ring) to now.
  function drawTrail(f, layer) {
    if (!f || !f.trail || f.trail.length < 2) return;
    var pts = f.trail.map(function (i) { var p = centre(c.hexes[i]); return p.x.toFixed(1) + "," + p.y.toFixed(1); });
    el("polyline", { points: pts.join(" "), "class": "adm-trail" }, layer);
    var p0 = centre(c.hexes[f.trail[0]]); el("circle", { cx: p0.x, cy: p0.y, r: 4, "class": "adm-trail-start" }, layer);
    f.trail.slice(1, -1).forEach(function (i) { var p = centre(c.hexes[i]); el("circle", { cx: p.x, cy: p.y, r: 1.8, "class": "adm-trail-dot" }, layer); });
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
    var h = c.hexes[focus], here = c.forces.filter(function (f) { return !f.lost && f.at === focus; });
    var what = h.kinds.length ? "Azurian " + h.kinds.slice(0, -1).join(", ") + (h.kinds.length > 1 ? " and " : "") + h.kinds[h.kinds.length - 1]
      : h.yard ? KIND[h.kind] + " (base, shipyard and depot)" : KIND[h.kind];
    var kind = what ? what + (h.kind !== "home" && h.owner === "us" ? " (taken)" : "") : "Empty system";
    $("adm-sys").innerHTML = "<div><b>" + esc(h.name) + "</b></div><div>" + esc(kind) + " · " + c.dist(c.home, focus) + " warps from our base</div>" +
      (here.length ? here.map(function (f) {
        return "<div class='" + (f.side === "us" ? "us" : "az") + "'>" + esc(c.name(f).replace(/^./, function (s) { return s.toUpperCase(); })) + " · " + c.alive(f).length + "/" + f.ships.length + " · " + pct(c.condition(f)) + "</div>";
      }).join("") : "<div class='muted'>No forces here.</div>");
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
    if (c.state !== "play") return;
    if (BL.audio) BL.audio.play("jump");
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
    var r = c.battleStep();
    if (r === "done") { battleOver(); return; }
    if (BL.audio) BL.audio.play("click");
    renderBattle();
    if (r === "go") ticking = setTimeout(tick, ROUND_MS);
  }
  function battleOver() { if (ticking) { clearTimeout(ticking); ticking = null; } $("adm-modal").hidden = true; after(); }
  function renderBattle() {
    var m = $("adm-modal"), t = c.tally(), pcx = function (x) { return Math.round(100 * x) + "%"; };
    function force(r, side) {
      // (a pip per ship, by her hull left; a big force just the bar)
      var pips = r.total <= 48 ? "<div class='adm-pips'>" + r.ships.map(function (h) {
        return "<i class='" + (h <= 0 ? "dead" : h < 0.34 ? "low" : h < 0.67 ? "mid" : "") + "'></i>"; }).join("") + "</div>" : "";
      return "<div class='adm-bf " + side + (r.gone ? " gone" : "") + "'><div class='nm'>" + esc(r.name) + (r.flag ? " ★" : "") + (r.gone ? " · broke off" : "") + "</div>" +
        "<div class='adm-bar'><b style='width:" + Math.round(100 * r.cond) + "%'></b></div>" +
        "<div class='st'>" + r.alive + "/" + r.total + " ships · " + pcx(r.cond) + "</div>" + pips + "</div>";
    }
    var asks = t.asks.filter(function (a) { return a > t.usDmg; });
    var buttons = t.paused
      ? asks.map(function (a) { return "<button data-ask='" + a + "'>Fight on to " + pcx(a) + " damage</button>"; }).join("") +
        "<button data-ask='1'>Fight to the last ship</button><button id='adm-pull' class='primary'>Withdraw</button>"
      : "<button id='adm-pull'>Withdraw now</button>";
    m.innerHTML = "<div class='ov-card wide adm-battle'><h1>Battle at " + esc(t.at) + " · round " + t.round + "</h1>" +
      "<div class='adm-bsides'><div class='adm-btot us'><b>Ours</b> lost " + t.usLost + " ship" + (t.usLost === 1 ? "" : "s") + " · " + pcx(t.usDmg) + " damage</div>" +
      "<div class='adm-btot az'><b>Azurian</b> lost " + t.azLost + " ship" + (t.azLost === 1 ? "" : "s") + " · " + pcx(t.azDmg) + " damage</div></div>" +
      "<div class='adm-bsides'><div>" + t.us.map(function (r) { return force(r, "us"); }).join("") + "</div><div>" + t.az.map(function (r) { return force(r, "az"); }).join("") + "</div></div>" +
      (t.paused ? "<p class='adm-bstop'>Your side has taken " + pcx(t.usDmg) + " damage. Your call: withdraw, or fight on.</p>" : "") +
      "<div class='adm-blog'>" + t.events.slice(-6).reverse().map(function (e) { return "<div>" + esc(e) + "</div>"; }).join("") + "</div>" +
      "<div class='menu'>" + buttons + "</div></div>";
    m.hidden = false;
    Array.prototype.forEach.call(m.querySelectorAll("button[data-ask]"), function (b) {
      b.onclick = function () { click(); c.battleChoice(+b.getAttribute("data-ask")); battleView(); };
    });
    $("adm-pull").onclick = function () { click(); c.battleChoice("withdraw"); battleOver(); };
  }
  // (after the turn ends: drop the selected forces that are gone)
  function after() { sel = sel.filter(function (id) { var f = c.force(id); return f && !f.lost && !f.merged; }); draw(); }
  function flagModal() {
    var m = $("adm-modal"), us = c.ours();
    m.innerHTML = "<div class='ov-card'><h1>The flagship is lost</h1><p>Shift your flag to another force and fight on (take the world and it's still a win), or withdraw: the campaign is lost.</p>" +
      "<div class='menu'>" + us.map(function (f) { return "<button data-id='" + f.id + "'>Shift the flag to the " + esc(c.desc(f)) + "</button>"; }).join("") +
      "<button id='adm-withdraw'>Withdraw</button></div></div>";
    m.hidden = false;
    Array.prototype.forEach.call(m.querySelectorAll("button[data-id]"), function (b) { b.onclick = function () { click(); c.setFlag(+b.getAttribute("data-id")); m.hidden = true; draw(); }; });
    $("adm-withdraw").onclick = function () { click(); c.withdraw(); m.hidden = true; draw(); };
  }
  // The write-up: the world taken (carry on with the turns left, or stop), the campaign over, or lost.
  function endModal() {
    var m = $("adm-modal"), u = c.summary(), st = c.state, pcx = function (x) { return Math.round(100 * x) + "%"; };
    var left = c.turns - c.turn + 1;
    var head = st === "won" ? "The world is taken" : st === "over" ? "Campaign won" : "Campaign lost";
    var why = st === "won" ? "The target world " + u.world + " is taken on turn " + u.wonTurn + " of " + u.turns + ". Now hold it to the end of turn " + u.turns +
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
      "<div class='menu'>" + (st === "won" && left > 0 && c.ours().length ? "<button id='adm-carry' class='primary'>Hold the world (" + left + " turn" + (left === 1 ? "" : "s") + " left)</button>" : "") +
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
