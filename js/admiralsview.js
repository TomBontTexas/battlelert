/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* The Admirals screen (stage 1): the hex map of the campaign (admirals.js, BL.Campaign), the
   fleet, the system tapped, and the last turn's report. Tap a squadron (or press its number) to
   select it, tap a system to send it there; END TURN and every move happens at once. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function click() { if (BL.audio) BL.audio.play("click"); }
  var NS = "http://www.w3.org/2000/svg";
  var S = 30, RT3 = Math.sqrt(3), PAD = 8;            // hex size (centre to corner) and margin, in map units

  var c = null, opts = null, sel = [], focus = null, hintDefault = "";
  var KIND = { home: "Our base", world: "Target world", base: "Azurian base", depot: "Azurian depot", shipyard: "Azurian shipyard", empty: "" };

  function centre(h) { return { x: PAD + RT3 * S * (h.col + 0.5 * (h.row & 1) + 0.5), y: PAD + S + 1.5 * S * h.row }; }
  function corners(p) {
    var out = []; for (var k = 0; k < 6; k++) { var a = Math.PI / 180 * (60 * k - 30); out.push((p.x + S * Math.cos(a)).toFixed(1) + "," + (p.y + S * Math.sin(a)).toFixed(1)); }
    return out.join(" ");
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function pct(x) { return Math.round(100 * x) + "%"; }

  function start(o) {
    opts = o; c = new BL.Campaign({ seed: o.seed, level: o.level }); sel = []; focus = c.home;
    $("adm-modal").hidden = true;
    hintDefault = $("adm-hint").textContent = "1–" + c.size + " select · A all · H hold · F fly the flag (first turn) · Enter end turn · Esc clear";
    draw();
  }

  /* --------------------------------------------------------------- Drawing */
  function draw() {
    $("adm-title").textContent = "Admirals · " + c.level;
    $("adm-turn").textContent = "Turn " + Math.min(c.turn, c.turns) + " of " + c.turns;
    $("adm-seed").textContent = "seed " + c.seed;
    $("btn-adm-end").disabled = c.state !== "play";
    drawMap(); drawFleet(); drawSystem(); drawReport();
    if (c.state === "flag") flagModal(); else if (c.state === "won" || c.state === "lost") endModal();
  }
  function drawMap() {
    var svg = $("adm-svg"), w = PAD * 2 + RT3 * S * (c.cols + 0.5), h = PAD * 2 + S * (1.5 * c.rows + 0.5);
    svg.setAttribute("viewBox", "0 0 " + w.toFixed(0) + " " + h.toFixed(0));
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var gh = el("g", {}, svg), gp = el("g", {}, svg), gf = el("g", {}, svg);
    c.hexes.forEach(function (x) {
      var p = centre(x), cls = "adm-hex" + (x.owner === "us" ? " us" : x.owner === "az" ? " az" : "") + (focus === x.i ? " focus" : "");
      var poly = el("polygon", { points: corners(p), "class": cls }, gh);
      poly.addEventListener("click", function () { tapHex(x.i); });
      var t = el("text", { x: p.x, y: p.y - S * 0.55, "class": "adm-name" }, gh); t.textContent = x.name;
      var side = x.owner === "us" ? "us" : "az", k = "adm-mark " + side;
      if (x.kind === "home" || x.kind === "world") el("circle", { cx: p.x, cy: p.y - S * 0.18, r: x.kind === "world" ? 7 : 5, "class": k }, gh);
      else if (x.kind === "base") el("rect", { x: p.x - 5, y: p.y - S * 0.18 - 5, width: 10, height: 10, "class": k }, gh);
      else if (x.kind === "depot") el("polygon", { points: [p.x, p.y - S * 0.18 - 6, p.x + 6, p.y - S * 0.18, p.x, p.y - S * 0.18 + 6, p.x - 6, p.y - S * 0.18].join(" "), "class": k }, gh);
      else if (x.kind === "shipyard") el("polygon", { points: [p.x, p.y - S * 0.18 - 6, p.x + 6, p.y - S * 0.18 + 5, p.x - 6, p.y - S * 0.18 + 5].join(" "), "class": k }, gh);
      else el("circle", { cx: p.x, cy: p.y - S * 0.18, r: 1.6, "class": "adm-star" }, gh);
      Array.prototype.forEach.call(gh.querySelectorAll("text, circle, rect, polygon:not(.adm-hex)"), function (n) { n.style.pointerEvents = "none"; });
    });
    // The selected squadrons' way to where they're sent.
    sel.forEach(function (id) {
      var f = c.force(id); if (!f || f.lost || f.dest === f.at) return;
      var pts = [f.at].concat(c.path(f.at, f.dest)).map(function (i) { var p = centre(c.hexes[i]); return p.x.toFixed(1) + "," + p.y.toFixed(1); });
      el("polyline", { points: pts.join(" "), "class": "adm-path" }, gp);
      el("polygon", { points: corners(centre(c.hexes[f.dest])), "class": "adm-dest" }, gp);
    });
    // The squadrons: a chip each, ours first, three to a row under the system's mark.
    var at = {};
    c.forces.forEach(function (f) { if (!f.lost) (at[f.at] = at[f.at] || []).push(f); });
    Object.keys(at).forEach(function (i) {
      var p = centre(c.hexes[i]), list = at[i].sort(function (a, b) { return (a.side === "us" ? 0 : 1) - (b.side === "us" ? 0 : 1); });
      var cw = 15, ch = 9, per = 3;
      list.forEach(function (f, k) {
        var row = Math.floor(k / per), inRow = Math.min(per, list.length - row * per), col = k % per;
        var x = p.x + (col - (inRow - 1) / 2) * (cw + 1) - cw / 2, y = p.y + 1 + row * (ch + 1);
        var g = el("g", { "class": "adm-chip " + (f.side === "us" ? "us" : "az") + (sel.indexOf(f.id) >= 0 ? " sel" : "") }, gf);
        el("rect", { x: x, y: y, width: cw, height: ch, rx: 2 }, g);
        var t = el("text", { x: x + cw / 2, y: y + ch / 2 + 0.5 }, g); t.textContent = BL.ADMIRALS.abbr[f.cls] + (f.id === c.flag ? "★" : "");
        g.addEventListener("click", function (ev) { ev.stopPropagation(); if (f.side === "us") toggle(f.id); else tapHex(f.at); });
      });
    });
  }
  function line(f) {
    var A = BL.ADMIRALS, alive = c.alive(f).length, ord = f.dest === f.at ? "Holding at " + c.hexes[f.at].name : "To " + c.hexes[f.dest].name + " · " + c.path(f.at, f.dest).length + " warps";
    return "<div class='adm-sq" + (sel.indexOf(f.id) >= 0 ? " sel" : "") + (f.lost ? " lost" : "") + "' data-id='" + f.id + "'>" +
      "<b>" + (fleetList().indexOf(f) + 1) + " · " + esc(A.plural[f.cls].replace(/^./, function (s) { return s.toUpperCase(); })) + (f.id === c.flag ? " ★ flag" : "") + "</b>" +
      "<span>" + esc(f.cmd.name) + " · " + f.cmd.temper + " · skill " + Math.round(f.cmd.skill * 100) + "</span>" +
      (f.lost ? "<span class='bad'>Destroyed</span>" : "<span>" + alive + "/" + f.ships.length + " ships · " + pct(c.condition(f)) + "</span><span>" + esc(ord) + "</span>") + "</div>";
  }
  function fleetList() { var us = c.forces.filter(function (f) { return f.side === "us"; }); return us; }
  function drawFleet() {
    $("adm-fleet").innerHTML = fleetList().map(line).join("");
    Array.prototype.forEach.call($("adm-fleet").querySelectorAll(".adm-sq"), function (d) {
      d.onclick = function () { var f = c.force(+d.getAttribute("data-id")); if (!f.lost) toggle(f.id); };
    });
    $("btn-adm-flag").hidden = !(c.turn === 1 && !c.flagSet && c.state === "play");
  }
  function drawSystem() {
    var h = c.hexes[focus], here = c.forces.filter(function (f) { return !f.lost && f.at === focus; });
    var kind = KIND[h.kind] ? KIND[h.kind] + (h.kind !== "home" && h.owner === "us" ? " (taken)" : "") : "Empty system";
    $("adm-sys").innerHTML = "<div><b>" + esc(h.name) + "</b></div><div>" + esc(kind) + " · " + c.dist(c.home, focus) + " warps from our base</div>" +
      (here.length ? here.map(function (f) {
        return "<div class='" + (f.side === "us" ? "us" : "az") + "'>" + esc(c.name(f).replace(/^./, function (s) { return s.toUpperCase(); })) + " · " + c.alive(f).length + "/" + f.ships.length + " · " + pct(c.condition(f)) + "</div>";
      }).join("") : "<div class='muted'>No squadrons here.</div>");
  }
  function drawReport() {
    var last = c.log.slice(-3).reverse();
    $("adm-report").innerHTML = last.length ? last.map(function (e) {
      return "<div class='adm-rep'><b>Turn " + e.turn + "</b>" + e.lines.map(function (l) { return "<div" + (/^ {4}/.test(l) ? " class='sub'" : "") + ">" + esc(l.trim()) + "</div>"; }).join("") + "</div>";
    }).join("") : "<div class='muted'>Send your squadrons, then END TURN. Every move happens at once.</div>";
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
  function flagHere() {
    if (sel.length !== 1) { $("adm-hint").textContent = "Select one squadron to fly your flag with."; return; }
    if (c.setFlag(sel[0])) { click(); draw(); }
  }
  function endTurn() {
    if (c.state !== "play") return;
    if (BL.audio) BL.audio.play("jump");
    c.endTurn();
    sel = sel.filter(function (id) { var f = c.force(id); return f && !f.lost; });
    draw();
  }
  function flagModal() {
    var m = $("adm-modal"), us = c.ours();
    m.innerHTML = "<div class='ov-card'><h1>The flag squadron is gone</h1><p>Shift your flag to another squadron and fight on (take the world and it's still a win), or withdraw: the campaign is lost.</p>" +
      "<div class='menu'>" + us.map(function (f) { return "<button data-id='" + f.id + "'>Shift the flag to the " + esc(BL.ADMIRALS.plural[f.cls]) + "</button>"; }).join("") +
      "<button id='adm-withdraw'>Withdraw</button></div></div>";
    m.hidden = false;
    Array.prototype.forEach.call(m.querySelectorAll("button[data-id]"), function (b) { b.onclick = function () { click(); c.setFlag(+b.getAttribute("data-id")); m.hidden = true; draw(); }; });
    $("adm-withdraw").onclick = function () { click(); c.withdraw(); m.hidden = true; draw(); };
  }
  function endModal() {
    var m = $("adm-modal"), lost = c.forces.filter(function (f) { return f.side === "us" && f.lost; }).length, won = c.state === "won";
    var why = won ? "The target world " + c.hexes[c.world].name + " is taken on turn " + (c.turn - 1) + " of " + c.turns + "."
      : c.why === "time" ? "Fleet HQ's " + c.turns + " turns ran out before the world fell."
      : c.why === "losses" ? "Half the fleet is lost: Fleet HQ calls off the campaign."
      : "The fleet withdrew after losing its flag squadron.";
    if (BL.audio) BL.audio.play(won ? "win" : "lose");
    m.innerHTML = "<div class='ov-card'><h1>" + (won ? "Campaign won" : "Campaign lost") + "</h1><p>" + esc(why) + "</p><p class='muted'>Squadrons lost: " + lost + " of " + c.size + ".</p>" +
      "<div class='menu'><button id='adm-again' class='primary'>New campaign</button><button id='adm-same'>Same seed again</button><button id='adm-quit'>Back to the title screen</button></div></div>";
    m.hidden = false;
    $("adm-again").onclick = function () { click(); start({ seed: BL.randomSeed(), level: c.level, onExit: opts.onExit }); };
    $("adm-same").onclick = function () { click(); start({ seed: c.seed, level: c.level, onExit: opts.onExit }); };
    $("adm-quit").onclick = function () { click(); m.hidden = true; opts.onExit(); };
  }

  function wire() {
    $("btn-adm-end").onclick = endTurn;
    $("btn-adm-all").onclick = all;
    $("btn-adm-hold").onclick = hold;
    $("btn-adm-flag").onclick = flagHere;
    $("btn-adm-how").onclick = function () { click(); $("ov-how").hidden = false; };
    $("btn-adm-quit").onclick = function () { click(); opts.onExit(); };
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
      else if (k === "Enter") { ev.preventDefault(); endTurn(); }
      else if (k === "Escape") { sel = []; draw(); }
    });
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  }
  BL.admiralsView = { start: start };
})(typeof window !== "undefined" ? window : globalThis);
