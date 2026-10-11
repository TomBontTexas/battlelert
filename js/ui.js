/* Battlelert display layer: screens, the engine-room console, input and sound cues.
   It reads the simulation and sends it the player's inputs; no game rules live here. */
(function () {
  "use strict";
  var BL = window.BL;
  var $ = function (id) { return document.getElementById(id); };
  var DISPLAY = ["gun1", "gun2", "gun3", "shield", "life", "drive"];   // column order; keys 1-6
  var SETTINGS_KEY = BL.APP_TAG + "_settings";
  var DEFAULT_HINT = $("hint-bar").textContent;

  var settings = loadSettings();
  var sim = null, running = false, paused = false, looking = false;
  var selected = 0, capEls = {}, fcEls = {}, lastLogKey = "", lastDamageLen = -1;
  var gravShown = false, doneShown = false, lastAlarm = 0, lastTs = 0, acc = 0;

  /* ------------------------------------------------------------ Settings */
  function loadSettings() {
    var s = { fx: 80, alarm: 80, chat: 60, contrast: false, hints: false };
    try { var raw = localStorage.getItem(SETTINGS_KEY); if (raw) Object.assign(s, JSON.parse(raw)); } catch (e) {}
    return s;
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }
  window.saveBeforeRefresh = saveSettings;

  function applySettings() {
    BL.audio.setVolume("fx", settings.fx / 100);
    BL.audio.setVolume("alarm", settings.alarm / 100);
    BL.audio.setVolume("chat", settings.chat / 100);
    document.body.dataset.theme = settings.contrast ? "contrast" : "";
    document.body.classList.toggle("hints", !!settings.hints);
    $("btn-hints").classList.toggle("on", !!settings.hints);
    if (!settings.hints) $("hint-bar").textContent = DEFAULT_HINT;
  }

  /* ------------------------------------------------------------- Screens */
  var SCREENS = ["scr-title", "scr-briefing", "scr-console", "scr-debrief"];
  function show(id) { SCREENS.forEach(function (s) { $(s).hidden = s !== id; }); }
  function overlay(id, on) { $(id).hidden = !on; }
  function inConsole() { return !$("scr-console").hidden; }
  function click() { BL.audio.play("click"); }

  /* --------------------------------------------------------------- Title */
  function newSeedInput() { $("seed-input").value = BL.randomSeed(); }
  $("btn-seed-new").onclick = function () { BL.audio.init(); click(); newSeedInput(); };
  $("btn-start").onclick = function () {
    BL.audio.init(); click();
    var seed = parseInt($("seed-input").value, 10);
    startBriefing(seed > 0 ? seed : BL.randomSeed());
  };
  $("btn-how").onclick = function () { BL.audio.init(); click(); overlay("ov-how", true); };
  $("btn-how-close").onclick = function () { click(); overlay("ov-how", false); };

  /* ------------------------------------------------------------ Briefing */
  function startBriefing(seed) {
    sim = new BL.Mission({ seed: seed });
    $("seed-input").value = seed;
    $("brief-seed").textContent = "· seed " + seed;
    $("brief-route").innerHTML = sim.route.map(function (id, i) {
      var e = BL.ENCOUNTERS[id];
      return "<li>System " + (i + 1) + ": <b>" + e.name + "</b>. " + e.what + ". Tests: " + e.tests.toLowerCase() +
        ". Jump window opens " + BL.MISSION.jumpWindowAt[i] + " s after arrival.</li>";
    }).join("") + "<li>The Archonian world: drop the planet buster.</li>";
    var d = sim.data, html = [
      "<div><span>Reactor safe output</span> " + d.reactorMW + " MW</div>",
      "<div><span>Hull</span> " + d.hull + "</div>",
      "<div><span>Aux bank</span> " + d.aux.capacity + " MJ, " + d.aux.rateMW + " MW</div>",
      "<div><span>Engines</span> " + d.engineMWperG + " MW per G, cruise " + d.cruiseG + " G</div>"
    ];
    d.systems.forEach(function (s) {
      html.push("<div><span>" + s.name + "</span> " + s.maxMJ + " MJ, up to " + s.maxMW + " MW</div>");
    });
    $("brief-ship").innerHTML = html.join("");
    show("scr-briefing");
  }
  $("btn-brief-back").onclick = function () { click(); show("scr-title"); };
  $("btn-brief-go").onclick = function () { click(); startMission(); };

  /* ------------------------------------------------------------- Mission */
  function startMission() {
    BL.audio.init(); BL.audio.humStart();
    buildConsole();
    show("scr-console");
    gravShown = false; doneShown = false; paused = false; looking = false;
    lastLogKey = ""; lastDamageLen = -1; selected = 0; acc = 0;
    sim.beginJump();
    running = true;
  }

  function pause() {
    if (!running || !sim || sim.phase === "done" || paused) return;
    paused = true; looking = false;
    overlay("ov-pause", true); $("planning-banner").hidden = true;
    click();
  }
  function resume() {
    if (!paused) return;
    paused = false; looking = false;
    overlay("ov-pause", false); $("planning-banner").hidden = true;
    click();
  }
  function look() {
    sim.recordLook(); looking = true;
    overlay("ov-pause", false); $("planning-banner").hidden = false;
    click();
  }
  $("btn-pause").onclick = pause;
  $("btn-resume").onclick = resume;
  $("btn-look").onclick = look;
  $("btn-abandon").onclick = function () {
    if (!confirm("Abandon ship? The mission ends as a failure.")) return;
    paused = false; overlay("ov-pause", false);
    sim.abandon();
  };
  document.addEventListener("visibilitychange", function () { if (document.hidden && inConsole()) pause(); });

  function openOptions() {
    if (inConsole()) pause();
    $("vol-fx").value = settings.fx; $("vol-alarm").value = settings.alarm; $("vol-chat").value = settings.chat;
    $("opt-contrast").checked = !!settings.contrast; $("opt-hints").checked = !!settings.hints;
    overlay("ov-options", true);
  }
  $("btn-options").onclick = openOptions;
  $("btn-options-title").onclick = function () { BL.audio.init(); click(); openOptions(); };
  $("btn-options-pause").onclick = openOptions;
  $("btn-options-close").onclick = function () { click(); overlay("ov-options", false); };
  ["fx", "alarm", "chat"].forEach(function (ch) {
    $("vol-" + ch).oninput = function () {
      settings[ch] = +this.value; applySettings(); saveSettings();
      BL.audio.play(ch === "fx" ? "click" : ch === "alarm" ? "warn" : "chatter");
    };
  });
  $("opt-contrast").onchange = function () { settings.contrast = this.checked; applySettings(); saveSettings(); };
  $("opt-hints").onchange = function () { settings.hints = this.checked; applySettings(); saveSettings(); };
  function toggleHints() { settings.hints = !settings.hints; applySettings(); saveSettings(); click(); }
  $("btn-hints").onclick = toggleHints;

  document.addEventListener("mouseover", function (ev) {
    if (!settings.hints) return;
    var el = ev.target.closest && ev.target.closest("[data-hint]");
    $("hint-bar").textContent = el ? el.getAttribute("data-hint") : DEFAULT_HINT;
  });

  /* ------------------------------------------------------- Build console */
  function buildConsole() {
    var caps = $("caps"); caps.innerHTML = ""; capEls = {};
    DISPLAY.forEach(function (id, i) {
      var s = sim.sys(id);
      var el = document.createElement("div");
      el.className = "cap"; el.dataset.id = id;
      el.innerHTML =
        '<div class="cap-head"><span class="cap-key">' + (i + 1) + '</span><span class="cap-name"><span class="nm-long">' + s.name + '</span><span class="nm-short">' + s.short + '</span></span>' +
        '<span class="prio" data-hint="Priority badge: P1 trips last, P6 trips first. Drag it onto another capacitor to swap places, or press [ and ].">P</span></div>' +
        '<div class="cap-state"></div>' +
        '<div class="cap-bars">' +
          '<div class="bar-col" data-hint="Stored charge. ' + capHint(s) + ' Hatched = capacity lost to damage."><div class="bar-cap">CHARGE MJ</div>' +
            '<div class="vbar charge"><div class="lost"></div><div class="lvl"></div></div></div>' +
          '<div class="bar-col" data-hint="Charge rate. Drag to set it (yellow marker). Green = what the controller is actually drawing; it ramps toward your setting and falls to a trickle when the capacitor is full. Purple = aux bank feed."><div class="bar-cap">RATE MW</div>' +
            '<div class="vbar slider"><div class="lost"></div><div class="rate"></div><div class="aux"></div><div class="set"></div></div></div>' +
        '</div>' +
        '<div class="cap-read"><span class="r-mj" style="grid-column:1/3"></span><span class="r-set"></span><span class="r-now"></span></div>' +
        '<button class="aux-btn" data-hint="Switch the aux bank onto this capacitor. It charges it without loading the reactor. Key: A.">AUX</button>';
      caps.appendChild(el);
      var refs = {
        root: el, prio: el.querySelector(".prio"), state: el.querySelector(".cap-state"),
        lvl: el.querySelector(".charge .lvl"), lostC: el.querySelector(".charge .lost"),
        slider: el.querySelector(".slider"), rate: el.querySelector(".slider .rate"), aux: el.querySelector(".slider .aux"),
        set: el.querySelector(".slider .set"), lostR: el.querySelector(".slider .lost"),
        mj: el.querySelector(".r-mj"), rset: el.querySelector(".r-set"), rnow: el.querySelector(".r-now"),
        auxBtn: el.querySelector(".aux-btn")
      };
      capEls[id] = refs;
      el.addEventListener("pointerdown", function () { selected = i; });
      wireSlider(id, refs.slider);
      wirePrio(id, refs.prio);
      refs.auxBtn.onclick = function () { selected = i; toggleAux(id); };
    });
    $("route").innerHTML = sim.route.map(function (r, i) { return '<li data-i="' + i + '">' + (i + 1) + ". " + BL.ENCOUNTERS[r].name + "</li>"; }).join("") +
      '<li data-i="' + sim.route.length + '">Archonian world</li>';
    $("comms-log").innerHTML = "";
    $("damage-list").innerHTML = '<li class="muted">None</li>';
    Object.keys(fcEls).forEach(function (k) { fcEls[k].remove(); }); fcEls = {};
    // Static part of the gauge: the overload zone from 100% to 150%.
    $("g-over").setAttribute("d", arc(100, 150));
    var a = angle(100), c = Math.cos(a), s2 = Math.sin(a);
    $("g-100").setAttribute("x1", 100 + 66 * c); $("g-100").setAttribute("y1", 105 - 66 * s2);
    $("g-100").setAttribute("x2", 100 + 94 * c); $("g-100").setAttribute("y2", 105 - 94 * s2);
  }
  function capHint(s) {
    return s.kind === "gun" ? "Each shot uses " + sim.data.gun.shotMJ + " MJ." :
      s.kind === "shield" ? "Salvos drain it; what it can't stop hits the hull." :
      s.kind === "life" ? "Drains " + s.drainMW + " MW all the time. Empty = crippled crew." :
      "Must be full for the captain to jump.";
  }

  function canControl() { return running && sim && (!paused || looking) && sim.phase !== "done"; }

  function wireSlider(id, el) {
    var dragging = false, lastVal = null;
    function setFromY(y) {
      var r = el.getBoundingClientRect(), s = sim.sys(id);
      var v = Math.round(clampN((r.bottom - y) / r.height, 0, 1) * s.baseMW);
      if (v !== lastVal) { sim.setSetpoint(id, v); lastVal = v; BL.audio.play("tick"); }
    }
    el.addEventListener("pointerdown", function (ev) {
      if (!canControl()) return;
      dragging = true; el.setPointerCapture(ev.pointerId); el.classList.add("dragging"); setFromY(ev.clientY); ev.preventDefault();
    });
    el.addEventListener("pointermove", function (ev) { if (dragging && canControl()) setFromY(ev.clientY); });
    function end() { dragging = false; el.classList.remove("dragging"); lastVal = null; }
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  }

  function wirePrio(id, badge) {
    var dragging = false, over = null;
    function capAt(x, y) { var e = document.elementFromPoint(x, y); return e && e.closest ? e.closest(".cap") : null; }
    badge.addEventListener("pointerdown", function (ev) {
      if (!canControl()) return;
      dragging = true; badge.setPointerCapture(ev.pointerId); badge.classList.add("dragging"); ev.preventDefault(); ev.stopPropagation();
    });
    badge.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      var c = capAt(ev.clientX, ev.clientY);
      if (over && over !== c) over.classList.remove("drop-target");
      over = c && c.dataset.id !== id ? c : null;
      if (over) over.classList.add("drop-target");
    });
    function end() {
      if (!dragging) return;
      dragging = false; badge.classList.remove("dragging");
      if (over) {
        over.classList.remove("drop-target");
        var pr = sim.priority.slice(), to = pr.indexOf(over.dataset.id);
        pr.splice(pr.indexOf(id), 1); pr.splice(to, 0, id);
        sim.setPriority(pr); click();
      }
      over = null;
    }
    badge.addEventListener("pointerup", end); badge.addEventListener("pointercancel", end);
  }

  function toggleAux(id) {
    if (!canControl()) return;
    sim.toggleAux(id); BL.audio.play("toggle");
  }

  /* ------------------------------------------------------------ Keyboard */
  document.addEventListener("keydown", function (ev) {
    if (!$("ov-options").hidden || !$("ov-how").hidden) {
      if (ev.key === "Escape") { overlay("ov-options", false); overlay("ov-how", false); }
      return;
    }
    if (!inConsole() || !sim || ev.target.tagName === "INPUT") return;
    if (!$("ov-grav").hidden) { if (ev.key === "Enter") $("btn-grav-go").click(); return; }
    var k = ev.key;
    if (k === " " || k === "Spacebar") { ev.preventDefault(); if (paused) resume(); else pause(); return; }
    if (k === "Escape" && paused && looking) { resume(); return; }
    if (k === "h" || k === "H") { toggleHints(); return; }
    if (!canControl()) return;
    var id = DISPLAY[selected], s = sim.sys(id), step = ev.shiftKey ? 10 : 2;
    if (k >= "1" && k <= "6") { selected = +k - 1; BL.audio.play("tick"); }
    else if (k === "ArrowUp") { sim.setSetpoint(id, s.set + step); BL.audio.play("tick"); }
    else if (k === "ArrowDown") { sim.setSetpoint(id, s.set - step); BL.audio.play("tick"); }
    else if (k === "ArrowLeft") { selected = (selected + DISPLAY.length - 1) % DISPLAY.length; }
    else if (k === "ArrowRight") { selected = (selected + 1) % DISPLAY.length; }
    else if (k === "0") { sim.setSetpoint(id, 0); BL.audio.play("tick"); }
    else if (k === "m" || k === "M") { sim.setSetpoint(id, s.baseMW); BL.audio.play("tick"); }
    else if (k === "a" || k === "A") toggleAux(id);
    else if (k === "[") { sim.movePriority(id, -1); click(); }
    else if (k === "]") { sim.movePriority(id, 1); click(); }
    else return;
    ev.preventDefault();
  });

  /* ---------------------------------------------------------- Main loop */
  function frame(ts) {
    var dt = lastTs ? Math.min(0.25, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (sim && running && !paused && $("ov-grav").hidden) {
      acc += dt;
      var n = 0;
      while (acc >= sim.dt && n < 10) { sim.step(); acc -= sim.dt; n++; }
      if (n >= 10) acc = 0;
    }
    if (sim && inConsole()) { render(); sounds(ts); phaseCheck(); }
    requestAnimationFrame(frame);
  }

  function sounds(ts) {
    sim.fx.forEach(function (name) { BL.audio.play(name); });
    sim.fx.length = 0;
    var live = running && !paused && (sim.phase === "arrival" || sim.phase === "engage" || sim.phase === "countdown");
    BL.audio.humSet(sim.ship.loadPct, live);
    if (live && sim.ship.heat >= BL.PHYSICS.alarmHeat && ts - lastAlarm > 700) { lastAlarm = ts; BL.audio.play("alarm"); }
  }

  function phaseCheck() {
    if (sim.phase === "gravspace" && !gravShown) {
      gravShown = true;
      flashJump();
      setTimeout(showGrav, 1000);
    } else if (sim.phase !== "gravspace") gravShown = false;
    if (sim.phase === "done" && !doneShown) {
      doneShown = true; running = false;
      if (sim.result.outcome === "success") flashJump();
      setTimeout(showDebrief, sim.result.outcome === "abandoned" ? 400 : 1600);
    }
  }
  function flashJump() {
    var f = $("jump-flash"); f.hidden = false;
    f.style.animation = "none"; void f.offsetWidth; f.style.animation = "";
    setTimeout(function () { f.hidden = true; }, 1200);
  }

  /* -------------------------------------------------------------- Render */
  function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function pct(v) { return (clampN(v, 0, 1) * 100).toFixed(2) + "%"; }
  function angle(p) { return Math.PI * (1 - clampN(p, 0, 150) / 150); }
  function arc(p0, p1) {
    var a0 = angle(p0), a1 = angle(p1);
    return "M" + (100 + 80 * Math.cos(a0)).toFixed(2) + " " + (105 - 80 * Math.sin(a0)).toFixed(2) +
      " A80 80 0 0 1 " + (100 + 80 * Math.cos(a1)).toFixed(2) + " " + (105 - 80 * Math.sin(a1)).toFixed(2);
  }
  function setText(el, txt) { if (el.textContent !== txt) el.textContent = txt; }
  function setCls(el, cls) { if (el.className !== cls) el.className = cls; }
  function mmss(t) { var s = Math.floor(t); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  function render() {
    var ship = sim.ship, enc = sim.encounter() || {};
    // Header
    $("hd-jump").innerHTML = "Jump <b>" + (sim.jumpIndex + 1) + "</b> of " + sim.cfg.jumps + " · <b>" + (enc.name || "") + "</b>";
    var ph = sim.phase === "arrival" ? "Engagement in " + Math.ceil(sim.cfg.arrivalSeconds - sim.t) + " s" :
      sim.phase === "countdown" ? "JUMPING IN " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) :
      sim.phase === "engage" ? "T+" + mmss(sim.t) : "";
    setText($("hd-phase"), ph);

    renderForecast();
    renderComms();

    // Reactor
    var lp = ship.loadPct;
    $("g-val").setAttribute("d", lp > 0.2 ? arc(0, lp) : "");
    $("g-val").setAttribute("class", "g-val" + (lp > 100 ? " over" : ""));
    $("g-pct").textContent = Math.round(lp) + "%" + (lp > 100 ? " ⚠" : "");
    $("g-pct").setAttribute("class", "g-pct" + (lp > 100 ? " over" : ""));
    setText($("load-detail"), Math.round(ship.load) + " / " + ship.reactorMax + " MW · engines " + Math.round(ship.engineMW) + " · charging " + Math.round(ship.load - ship.engineMW));
    $("heat-fill").style.width = pct(ship.heat / 100);
    setText($("heat-val"), Math.round(ship.heat) + " / 100");
    var hot = ship.heat >= BL.PHYSICS.alarmHeat;
    $("heat-fill").parentNode.parentNode.classList.toggle("hot", hot);
    $("heat-warn").hidden = !hot;
    setText($("eng-val"), ship.g.toFixed(1) + " G · " + Math.round(ship.engineMW) + " MW");
    $("eng-fill").style.width = pct(ship.g / 10);
    setText($("aux-val"), Math.round(ship.aux.mj) + " / " + ship.aux.cap + " MJ");
    $("aux-fill").style.width = pct(ship.aux.mj / ship.aux.cap);
    var feeding = ship.systems.filter(function (s) { return s.aux; }).map(function (s) { return s.short; });
    setText($("aux-out"), feeding.length ? "Switched to " + feeding.join(", ") + (ship.aux.out > 0.1 ? " · " + Math.round(ship.aux.out) + " MW" : "") : "Not switched on");
    var trip = sim.priority.slice().reverse().map(function (id) {
      var s = sim.sys(id); return '<li class="' + (s.tripped ? "tripped" : "") + '">' + s.name + (s.tripped ? " ✖" : "") + "</li>";
    }).join("");
    if ($("trip-order").innerHTML !== trip) $("trip-order").innerHTML = trip;

    // Capacitors
    DISPLAY.forEach(function (id, i) {
      var s = sim.sys(id), r = capEls[id];
      setCls(r.root, "cap" + (i === selected ? " sel" : "") + (s.tripped ? " tripped" : ""));
      setText(r.prio, "P" + (sim.priority.indexOf(id) + 1));
      var st = "", stc = "cap-state";
      var full = s.mj >= s.maxMJ - 0.5;
      if (s.tripped) { st = "✖ TRIPPED " + Math.ceil(s.tripUntil - sim.t) + " s"; stc += " tripped"; }
      else if (s.request) { st = "◆ FULL BATTERY"; stc += " request"; }
      else if (s.kind === "gun" && s.mj < sim.data.gun.shotMJ) { st = "DRY"; stc += " dry"; }
      else if (full) { st = "FULL"; stc += " full"; }
      else if (s.mj < s.maxMJ * 0.25) { st = "⚠ LOW"; stc += " low"; }
      setText(r.state, st); setCls(r.state, stc);
      r.lvl.style.height = pct(s.mj / s.baseMJ);
      setCls(r.lvl, "lvl" + (s.mj < s.maxMJ * 0.25 ? " low" : ""));
      r.lostC.style.height = pct(1 - s.maxMJ / s.baseMJ);
      r.lostR.style.height = pct(1 - s.maxMW / s.baseMW);
      r.rate.style.height = pct(s.rate / s.baseMW);
      r.aux.style.bottom = pct(s.rate / s.baseMW);
      r.aux.style.height = pct(s.auxRate / s.baseMW);
      r.set.style.bottom = pct(s.set / s.baseMW);
      setText(r.mj, Math.round(s.mj) + " / " + s.maxMJ);
      setText(r.rset, "set " + fmt(s.set));
      var ramp = s.rate < Math.min(s.set, s.maxMW) - 1 && !full && !s.tripped ? " ▲" : s.rate > Math.min(s.set, s.maxMW) + 1 ? " ▼" : "";
      setText(r.rnow, "now " + fmt(s.rate) + ramp);
      setCls(r.auxBtn, "aux-btn" + (s.aux ? " on" : ""));
      setText(r.auxBtn, s.aux ? "AUX ON" + (s.auxRate > 0.1 ? " +" + Math.round(s.auxRate) : "") : "AUX");
    });

    // Ship
    setText($("hull-val"), Math.max(0, Math.round(ship.hull)) + " / " + ship.hullMax);
    $("hull-fill").style.width = pct(ship.hull / ship.hullMax);
    $("hull-fill").classList.toggle("low", ship.hull < ship.hullMax * 0.35);
    var life = sim.sys("life");
    var crew = ship.crippled ? ["✖ CREW CRIPPLED: life support out", "crew-status bad"] :
      life.mj < life.maxMJ * 0.3 ? ["⚠ Air running low", "crew-status bad"] : ["✔ Crew OK", "crew-status"];
    setText($("crew-status"), crew[0]); setCls($("crew-status"), crew[1]);
    var drive = sim.sys("drive"), dp = drive.mj / drive.maxMJ;
    setText($("jump-drive"), "drive " + Math.floor(dp * 100) + "%");
    $("jump-fill").style.width = pct(dp);
    var wi = sim.windowIn(), js, jc = "jump-status";
    if (sim.phase === "countdown") { js = "✔ Drive full. Jumping in " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) + " s"; jc += " go"; }
    else if (wi > 0) {
      var need = (drive.maxMJ - drive.mj) / Math.max(1, wi);
      js = "Window opens in " + Math.ceil(wi) + " s" + (dp < 1 ? " · drive needs ~" + Math.ceil(need) + " MW from now" : " · drive ready");
      if (need > drive.maxMW * 0.8) jc += " late";
    } else { js = "⚠ Window OPEN: the bridge is waiting on the drive"; jc += " late"; }
    setText($("jump-status"), js); setCls($("jump-status"), jc);
    Array.prototype.forEach.call($("route").children, function (li, i) {
      setCls(li, i < sim.jumpIndex ? "done" : i === sim.jumpIndex ? "here" : "");
    });
    var dmg = sim.stats.damageReports;
    if (dmg.length !== lastDamageLen) {
      lastDamageLen = dmg.length;
      $("damage-list").innerHTML = dmg.length ? dmg.slice(-6).reverse().map(function (d) { return "<li>" + d.what + "</li>"; }).join("") : '<li class="muted">None</li>';
    }
  }
  function fmt(v) { return String(v < 10 && v % 1 ? v.toFixed(1) : Math.round(v)); }

  function renderForecast() {
    var items = sim.forecast(), span = sim.cfg.forecastSpan, seen = {};
    var tracks = {};
    document.querySelectorAll(".fc-lane").forEach(function (l) { tracks[l.dataset.lane] = l.querySelector(".fc-track"); });
    items.forEach(function (e) {
      seen[e.id] = true;
      var el = fcEls[e.id];
      if (!el) { el = document.createElement("div"); el.className = "fc-ev " + e.type; tracks[e.type].appendChild(el); fcEls[e.id] = el; }
      var start = Math.max(0, e.in), end = e.in + e.dur;
      el.style.left = pct(start / span);
      if (e.dur) el.style.width = pct(Math.max(0.4, end - start) / span);
      var secs = e.in > 0 ? " · " + Math.ceil(e.in) + " s" : "";
      var label = e.type === "salvo" ? "⚡ SALVO " + e.mj + " MJ" + secs :
        e.type === "burn" ? "▲ BURN " + e.g + " G for " + e.dur + " s" + secs :
        "◆ GUN " + e.gun + " FULL BATTERY" + secs;
      setText(el, label);
      el.classList.toggle("now", e.in <= 1);
      el.style.zIndex = String(100 - Math.round(Math.max(0, e.in) * 4));
    });
    // Pack each lane into two rows so close-together demands don't hide each other.
    Object.keys(tracks).forEach(function (lane) {
      var els = items.filter(function (e) { return e.type === lane; }).sort(function (a, b) { return a.in - b.in; })
        .map(function (e) { return fcEls[e.id]; });
      var ends = [-1, -1], placed = [];
      els.forEach(function (el) {
        var x = el.offsetLeft, row = ends[0] <= x ? 0 : ends[1] <= x ? 1 : (ends[0] <= ends[1] ? 0 : 1);
        ends[row] = x + el.offsetWidth + 4; placed.push([el, row]);
      });
      var solo = ends[1] < 0;
      placed.forEach(function (p) { p[0].classList.toggle("row1", p[1] === 1); p[0].classList.toggle("solo", solo); });
    });
    Object.keys(fcEls).forEach(function (id) { if (!seen[id]) { fcEls[id].remove(); delete fcEls[id]; } });
    var wi = sim.windowIn(), fj = $("fc-jump");
    if (sim.phase === "countdown") { setText(fj, "JUMPING"); setCls(fj, "fc-jump"); }
    else if (wi > 0) { setText(fj, wi <= sim.cfg.jumpWindowNotice ? "Jump window in " + Math.ceil(wi) + " s ▶" : ""); setCls(fj, "fc-jump"); }
    else { setText(fj, "JUMP WINDOW OPEN · drive " + Math.floor(sim.sys("drive").mj / sim.sys("drive").maxMJ * 100) + "%"); setCls(fj, "fc-jump open"); }
  }

  function renderComms() {
    var log = sim.log, last = log[log.length - 1];
    var key = log.length + ":" + (last ? last.t + last.text : "");
    if (key === lastLogKey) return;
    lastLogKey = key;
    var icon = { warn: "⚠ ", bad: "✖ ", good: "✔ ", info: "" };
    $("comms-log").innerHTML = log.slice(-9).map(function (l) {
      return '<div class="' + l.kind + '"><span class="t">' + mmss(l.t) + "</span>" + icon[l.kind] + esc(l.text) + "</div>";
    }).join("");
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* ----------------------------------------------------------- GravSpace */
  function showGrav() {
    var js = sim.stats.jumps[sim.stats.jumps.length - 1], next = sim.encounter();
    var dmg = sim.stats.damageReports.filter(function (d) { return d.jump === sim.jumpIndex; });
    $("grav-title").textContent = "In GravSpace: jump " + sim.jumpIndex + " of " + sim.cfg.jumps + " complete";
    $("grav-body").innerHTML =
      "<p>Fighting has stopped. The aux bank is refilled.</p>" +
      "<ul class='grav-list'>" +
      "<li>Salvos stopped by shields: " + js.shielded + " of " + js.salvos + "</li>" +
      "<li>Hull damage taken: " + js.hullLost + " (hull now " + Math.round(sim.ship.hull) + " / " + sim.ship.hullMax + ")</li>" +
      "<li>Failsafe trips: " + js.trips + "</li>" +
      "<li>Enemies destroyed: " + js.kills + "</li>" +
      "<li>Jump " + (js.onTime ? "on time" : "late: the drive wasn't full when the window opened") + "</li>" +
      (dmg.length ? "<li>Damage: " + dmg.map(function (d) { return d.what; }).join("; ") + "</li>" : "") +
      "</ul>" +
      "<h2>Next: " + next.name + "</h2><p>" + next.what + ". Tests: " + next.tests.toLowerCase() + ". The drive will be empty again on arrival.</p>" +
      "<p class='muted'>Take a breath; the clock is stopped. You can adjust the priority order once you're back on the console.</p>";
    overlay("ov-grav", true);
  }
  $("btn-grav-go").onclick = function () { click(); overlay("ov-grav", false); sim.beginJump(); };

  /* ---------------------------------------------------------- Debriefing */
  function showDebrief() {
    var r = sim.result, d = r.detail;
    show("scr-debrief");
    $("db-title").textContent = r.outcome === "success" ? "Mission complete: planet buster delivered" :
      r.outcome === "destroyed" ? "Ship destroyed" : "Abandoned ship";
    $("db-lede").textContent = "Seed " + r.seed + " · " + r.jumpsDone + " of " + sim.cfg.jumps + " jumps · " + d.minutes + " minutes · hull " + r.hull + " / " + r.hullMax +
      (r.looks ? " · looked at the paused console " + r.looks + (r.looks === 1 ? " time" : " times") + " (−" + (100 - Math.round(100 * r.score / Math.max(1, r.raw))) + "%)" : "");
    $("db-score").textContent = r.score;
    var names = { objective: "Objective", condition: "Ship condition", efficiency: "Efficiency", demands: "Demands met" };
    $("db-parts").innerHTML = Object.keys(names).map(function (k) {
      return '<div class="part"><span>' + names[k] + '</span><div class="hbar"><div class="hbar-fill" style="width:' + (r.parts[k] * 4) + '%"></div></div><b>' + r.parts[k] + " / 25</b></div>";
    }).join("");
    $("db-good").textContent = wentWell(r);
    $("db-worst").textContent = worstMoment(r);
    $("db-jumps").innerHTML = "<tr><th>Jump</th><th>Encounter</th><th>Salvos shielded</th><th>Hull lost</th><th>Trips</th><th>Kills</th><th>On time</th><th>Seconds</th></tr>" +
      r.jumps.map(function (j, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + BL.ENCOUNTERS[j.encounter].name + "</td><td>" + j.shielded + " / " + j.salvos + "</td><td>" + j.hullLost +
          "</td><td>" + j.trips + "</td><td>" + j.kills + "</td><td>" + (j.onTime ? "yes" : "no") + "</td><td>" + j.seconds + "</td></tr>";
      }).join("");
    var rows = [
      ["Announced salvos shielded", d.salvosShielded + " / " + d.salvosAnnounced],
      ["Surprise salvos", d.surprises],
      ["Gun requests filled", d.requestsFilled + " / " + d.requests],
      ["Jumps on time", d.jumpsOnTime + " / " + r.jumpsDone],
      ["Failsafe trips", d.trips],
      ["Enemies destroyed", d.kills],
      ["Energy delivered", d.deliveredMJ + " MJ"],
      ["Energy wasted as heat", d.wastedMJ + " MJ"],
      ["Crew crippled", d.crippledTime + " s"],
      ["Damage reports", r.damage.length]
    ];
    $("db-detail").innerHTML = rows.map(function (x) { return "<div><span>" + x[0] + ":</span> " + x[1] + "</div>"; }).join("");
  }

  function wentWell(r) {
    var d = r.detail, notes = [];
    if (r.outcome === "success") notes.push("The planet buster got through.");
    if (d.salvosAnnounced && d.salvosShielded === d.salvosAnnounced) notes.push("Every announced salvo hit full shields.");
    else if (d.salvosAnnounced && d.salvosShielded / d.salvosAnnounced >= 0.75) notes.push("Shields stopped " + d.salvosShielded + " of " + d.salvosAnnounced + " announced salvos.");
    if (r.jumpsDone && d.jumpsOnTime === r.jumpsDone) notes.push("Every jump was on time.");
    if (d.trips === 0 && r.jumpsDone) notes.push("The failsafe never tripped.");
    if (d.requests && d.requestsFilled / d.requests >= 0.8) notes.push("Gunners got power for " + d.requestsFilled + " of " + d.requests + " requests.");
    if (d.efficiencyPct >= 95) notes.push("Very little energy wasted as heat (" + d.efficiencyPct + "% efficient).");
    if (!notes.length) {
      var best = Object.keys(r.parts).reduce(function (a, k) { return r.parts[k] > r.parts[a] ? k : a; }, "condition");
      notes.push({ objective: "You made progress along the route.", condition: "The hull held up best.", efficiency: "You kept the reactor efficient.", demands: "You met more demands than anything else." }[best]);
    }
    return notes.join(" ");
  }

  function worstMoment(r) {
    var o = r.longestOverload, q = r.worstRequest;
    var oSev = o.dur / 8, qSev = q ? q.missed / 6 : 0;
    if (o.dur < 1 && (!q || q.missed === 0)) return "Nothing stands out. Clean run.";
    if (oSev >= qSev) return "The longest overload: " + o.dur + " s above 100% load in jump " + o.jump + ", starting at T+" + mmss(o.t) + ".";
    return "Gunner " + q.gun + " in jump " + q.jump + " (T+" + mmss(q.t) + "): asked for full battery and missed " + q.missed + " of " + q.wanted + " shots for lack of charge.";
  }

  function saveDebrief() {
    var r = sim.result, now = new Date();
    var today = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
    var data = { app: BL.APP_TAG, kind: "debriefing", version: window.APP_VERSION, savedAt: new Date().toISOString(), result: r };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = BL.APP_TAG + "_debrief_seed" + r.seed + "_" + today + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  $("btn-db-again").onclick = function () { click(); startBriefing(sim.seed); };
  $("btn-db-new").onclick = function () { click(); startBriefing(BL.randomSeed()); };
  $("btn-db-save").onclick = function () { click(); saveDebrief(); };
  $("btn-db-title").onclick = function () { click(); newSeedInput(); show("scr-title"); };

  /* ---------------------------------------------------------------- Boot */
  document.querySelectorAll(".app-version").forEach(function (el) { el.textContent = window.APP_VERSION || ""; });
  applySettings();
  newSeedInput();
  show("scr-title");
  requestAnimationFrame(frame);
  window.__bl = { get sim() { return sim; } };   // for automated tests
})();
