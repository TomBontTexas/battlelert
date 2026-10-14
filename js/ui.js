/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert display layer: screens, the engine-room console, input and sound cues.
   It reads the simulation and sends it the player's inputs; no game rules live here. */
(function () {
  "use strict";
  var BL = window.BL;
  var $ = function (id) { return document.getElementById(id); };
  var DISPLAY = [];                       // capacitor column order for this ship; keys 1..n
  var KIND_ORDER = { gun: 0, main: 1, pd: 2, shield: 3, life: 4, hangar: 5, buster: 6, drive: 7 };
  var LANE = { salvo: "salvo", strike: "salvo", burn: "burn", request: "request", launch: "request", recover: "request" };
  var rxEls = [];
  var SETTINGS_KEY = BL.APP_TAG + "_settings";
  var DEFAULT_HINT = $("hint-bar").textContent;   // rewritten per ship (key range)

  var settings = loadSettings();
  var sim = null, running = false, paused = false, looking = false;
  var selected = 0, capEls = {}, fcEls = {}, lastLogKey = "", lastDamageLen = -1, lastSpoken = 0;
  var gravShown = false, doneShown = false, lastAlarm = 0, lastTs = 0, acc = 0;
  var career = BL.career.load(), job = null, report = null, offersMode = "offers";
  var aiEngineer = null;                  // runs the power while the player is at a gun

  /* ------------------------------------------------------------ Settings */
  function loadSettings() {
    var s = { fx: 80, alarm: 80, chat: 60, voice: true, voiceVol: 80, contrast: false, hints: false, gunPick: "pulse", gunOrders: {} };
    try { var raw = localStorage.getItem(SETTINGS_KEY); if (raw) Object.assign(s, JSON.parse(raw)); } catch (e) {}
    return s;
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }
  function saveCareer() { if (career) BL.career.save(career); }
  window.saveBeforeRefresh = function () { saveSettings(); saveCareer(); };

  function applySettings() {
    BL.audio.setVolume("fx", settings.fx / 100);
    BL.audio.setVolume("alarm", settings.alarm / 100);
    BL.audio.setVolume("chat", settings.chat / 100);
    BL.speech.setEnabled(settings.voice);
    BL.speech.setVolume(settings.voiceVol / 100);
    document.body.dataset.theme = settings.contrast ? "contrast" : "";
    document.body.classList.toggle("hints", !!settings.hints);
    $("btn-hints").classList.toggle("on", !!settings.hints);
    if (!settings.hints) $("hint-bar").textContent = DEFAULT_HINT;
  }

  /* ------------------------------------------------------------- Screens */
  var SCREENS = ["scr-title", "scr-enlist", "scr-hub", "scr-offers", "scr-record", "scr-briefing", "scr-console", "scr-turret", "scr-debrief"];
  function show(id) { SCREENS.forEach(function (s) { $(s).hidden = s !== id; }); }
  function overlay(id, on) { $(id).hidden = !on; }
  function inConsole() { return !$("scr-console").hidden; }
  function inTurret() { return !$("scr-turret").hidden; }
  function inMission() { return inConsole() || inTurret(); }
  function click() { BL.audio.play("click"); }

  /* --------------------------------------------------------------- Title */
  function newSeedInput() { $("seed-input").value = BL.randomSeed(); }
  $("btn-seed-new").onclick = function () { BL.audio.init(); click(); newSeedInput(); };
  $("btn-start").onclick = function () {
    BL.audio.init(); click();
    var seed = parseInt($("seed-input").value, 10);
    startBriefing(testJob(seed > 0 ? seed : BL.randomSeed()));
  };
  function testJob(seed) { return { test: true, station: "engineer", classId: "destroyer", n: 4, tl: 4, ship: "Destroyer", seed: seed }; }
  // The gunner turret test: a gunboat, you at Gun 1 with the gun picked on the title screen.
  // The ring test: a destroyer's three guns on the rim of its shield, enemies from every side.
  function ringJob(seed) { return { test: true, station: "gunner", classId: "destroyer", n: 4, tl: 4, ship: "Destroyer", seed: seed, ring: true }; }
  $("btn-ring").onclick = function () {
    BL.audio.init(); click();
    var seed = parseInt($("seed-input").value, 10);
    startBriefing(ringJob(seed > 0 ? seed : BL.randomSeed()));
  };
  // The pilot helm test: a gunboat, you at the helm, a gunner on the gun.
  function helmJob(seed) { return { test: true, station: "pilot", classId: "gunboat", n: 1, tl: 4, ship: "Gunboat", seed: seed, helm: true }; }
  $("btn-helm").onclick = function () {
    BL.audio.init(); click();
    var seed = parseInt($("seed-input").value, 10);
    startBriefing(helmJob(seed > 0 ? seed : BL.randomSeed()));
  };
  function gunnerJob(seed) { return { test: true, station: "gunner", classId: "gunboat", n: 1, tl: 4, ship: "Gunboat", seed: seed, weapon: settings.gunPick || "pulse" }; }
  $("gun-pick").value = BL.WEAPONS[settings.gunPick] ? settings.gunPick : "pulse";
  $("gun-pick").onchange = function () { settings.gunPick = this.value; saveSettings(); };
  $("btn-gunner").onclick = function () {
    BL.audio.init(); click();
    var seed = parseInt($("seed-input").value, 10);
    startBriefing(gunnerJob(seed > 0 ? seed : BL.randomSeed()));
  };
  $("btn-how").onclick = function () { BL.audio.init(); click(); overlay("ov-how", true); };
  $("btn-how-close").onclick = function () { click(); overlay("ov-how", false); };

  /* ------------------------------------------------------------ Briefing */
  function startBriefing(j) {
    job = j;
    // The turret test fires the gun picked on the title screen; a real gunner job, the ship's own guns.
    var guns = j.helm ? { weapons: BL.GUNNERY.loadout[j.classId] || ["pulse"], helm: true } : j.station !== "gunner" ? null : j.weapons ? { weapons: j.weapons } : j.weapon && j.test ? { weapon: j.weapon } : { weapons: BL.GUNNERY.loadout[j.classId] || ["pulse"] };
    // Standing orders for the AI gunners, remembered per gun number between missions.
    if (guns) guns.orders = [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return (settings.gunOrders || {})[n] || "auto"; });
    var rc = BL.GUNNERY.ring.classes[j.classId];
    // Every class with a ring layout fights in the ring view (the turret test: its one gun is the one picked).
    if (guns && rc) { guns.ring = true; guns.arcs = rc.arcs; guns.arcNames = rc.arcNames; if (!guns.weapons) guns.weapons = [guns.weapon]; delete guns.weapon; }
    sim = new BL.Mission({ seed: j.seed, classId: j.classId, tl: j.tl, gunner: guns, helm: !!j.helm });
    if (j.test) $("seed-input").value = j.seed;
    var d = sim.data, cls = BL.classById(j.classId);
    $("brief-seed").textContent = "· seed " + j.seed;
    $("brief-lede").textContent = sim.hasDrive
      ? "Escort the planet buster's route through " + sim.cfg.jumps + " Archonian-held systems. In each one the GravSpace drive starts empty: keep the ship alive, charge the drive, and the captain jumps once the jump window opens."
      : "Gunboats have no GravSpace drive. In each of the carrier's " + sim.cfg.jumps + " systems it launches you into the fight and recovers you when the sortie timer runs out, then carries you through GravSpace to the next one. Keep the gunboat alive through every sortie.";
    $("brief-route").innerHTML = sim.route.map(function (id, i) {
      var e = BL.ENCOUNTERS[id];
      // At the gun: each enemy described the first time it comes up, then just which gun has the edge.
      if (sim.turret) { var first = sim.route.indexOf(id) === i;
        return "<li>" + (sim.hasDrive ? "System " : "Sortie ") + (i + 1) + ": <b>" + e.name + "</b>. " + gunnerTip(id, !first) +
          (sim.hasDrive ? " Jump window " + sim.windowFor(i) + " s." : " Recovered after " + sim.windowFor(i) + " s.") + "</li>"; }
      return "<li>" + (sim.hasDrive ? "System " : "Sortie ") + (i + 1) + ": <b>" + e.name + "</b>. " + e.what + ". Tests: " + e.tests.toLowerCase() +
        (sim.hasDrive ? ". Jump window opens " + sim.windowFor(i) + " s after arrival." : ". The carrier recovers you " + sim.windowFor(i) + " s after launch.") + "</li>";
    }).join("") + (sim.hasDrive ? "<li>The Archonian world: drop the planet buster.</li>" : "");
    $("brief-ship-title").textContent = "Your ship: " + (j.test ? cls.name : BL.shipLabel(j.classId, j.ship) + ", " + cls.name) + ", tech level " + j.tl;
    var html = [
      d.reactors.length > 1 ? "<div><span>Reactors</span> " + d.reactors.map(function (x) { return x.name + " " + x.mw + " MW"; }).join(", ") + "</div>"
        : "<div><span>Reactor safe output</span> " + d.reactorMW + " MW</div>",
      "<div><span>Hull</span> " + d.hull + "</div>",
      "<div><span>" + (d.reactors.length > 1 ? "Aux banks" : "Aux bank") + "</span> " + (d.aux.capacity ? d.aux.capacity + " MJ, " + d.aux.rateMW + " MW" + (d.reactors.length > 1 ? " each, one per reactor" : "") : "none (destroyers and up)") + "</div>",
      "<div><span>Engines</span> " + d.engineMWperG + " MW per G, cruise " + d.cruiseG + " G, top " + d.maxG + " G</div>"
    ];
    d.systems.forEach(function (s) {
      html.push("<div><span>" + s.name + "</span> " + s.maxMJ + " MJ, up to " + s.maxMW + " MW</div>");
    });
    if (!j.test) html.push("<div><span>Reputation if perfect</span> up to " + BL.career.repFor(j, 100) + "</div>");
    $("brief-ship").innerHTML = html.join("");
    // The approved art: the gunboat carries its hull number, bigger classes their hull letters.
    $("brief-art").innerHTML = BL.ART ? (j.classId === "gunboat" ? BL.ART.gunboat(/^PT-/.test(j.ship) ? j.ship : "PT") : BL.ART.warship(j.classId, j.test ? "" : BL.hullNumber(j.classId, j.ship))) : "";
    if (BL.preloadArt) BL.preloadArt();
    $("brief-main").hidden = !sim.sys("main");
    $("brief-hangar").hidden = !sim.sys("hangar");
    $("brief-mines").hidden = sim.route.indexOf("minefield") < 0;
    $("brief-pd").hidden = !sim.sys("pd");
    $("brief-rx").hidden = d.reactors.length < 2;
    $("brief-buster").hidden = !sim.sys("buster");
    var gunner = !!sim.turret;
    $("brief-eng").hidden = gunner; $("brief-gun").hidden = !gunner;
    $("brief-station").textContent = sim.helm ? "Your station: the helm (the " + sim.helm.who.toLowerCase() + " gives the orders; the engineer runs the power)" :
      gunner ? "Your station: Gun 1 (the engineer runs the power)" : "Your station: Main Engineering";
    $("brief-helm").hidden = !sim.helm;
    if (gunner) {
      var en = sim.turret.engineer;
      $("brief-pt").hidden = !sim.data.torpedoes || !!sim.helm;
      $("brief-gmain").hidden = !sim.turret.firesMain || !!sim.helm;
      $("brief-gmines").hidden = sim.route.indexOf("minefield") < 0;
      $("brief-gwing").hidden = !sim.sys("hangar");
      $("brief-gciws").hidden = !sim.sys("pd");
      var bats = sim.turret.bats;
      // The guns and their arcs; how they work is in How to play.
      $("brief-guns").innerHTML = "<b>" + (bats.length > 1 ? "Guns" : "Gun") + ":</b> " + bats.map(function (b) {
        return "Gun " + b.gunNo + " " + b.w.name.toLowerCase() + (b.arcName ? " " + b.arcName : "") + (b.arcH === undefined ? "" : " (" + (b.arcH >= 180 ? "all round" : (b.arcH * 2) + "°") + ")");
      }).join(" · ") + (sim.helm ? ". Your gun crew works " + (bats.length > 1 ? "them." : "it.") : bats.length > 1 ? ". You aim one; your gun crew works the rest." : ".");
      $("brief-crew").hidden = bats.length < 2 && !sim.helm;
      $("brief-crew").innerHTML = "<b>Gun crew:</b> " + bats.filter(function (b) { return b.crew; }).map(function (b) {
        return "Gun " + b.gunNo + " " + esc(b.crew.name) + ", " + b.crew.label + " (" + Math.round(b.crew.skill * 100) + ")";
      }).join(" · ") + (sim.helm ? "." : ". Take a gun and you trade places with its gunner.");
      $("brief-orders").hidden = bats.length < 2 || !!sim.helm;
      $("brief-orders").innerHTML = "<b>Orders:</b> the letter on each gun card is its gunner's order (P point defense, L stop launches, H hunt, F free fire; green = this fight's suggestion). Take a gun and press O to change it.";
      $("brief-engineer").innerHTML = "Your engineer: <b>" + esc(en.name) + "</b>, " + en.label + " (skill " + Math.round(en.skill * 100) + "). " + ENGINEER_NOTE[en.label];
    }
    show("scr-briefing");
  }
  $("btn-brief-back").onclick = function () { click(); if (job.test) show("scr-title"); else showOffers(offersMode); };
  $("btn-brief-go").onclick = function () { click(); startMission(); };
  $("btn-brief-how").onclick = function () { click(); overlay("ov-how", true); };

  /* ------------------------------------------------------------- Mission */
  function startMission() {
    BL.audio.init(); BL.audio.humStart();
    BL.speech.unlock();
    aiEngineer = sim.turret ? new BL.AIEngineer(0.5, 0.25, sim.turret.engineer.skill) : null;
    lastTuDamage = -1;
    if (sim.turret) { buildTurret(); show("scr-turret"); sizeTurret(); }
    else { buildConsole(); show("scr-console"); }
    gravShown = false; doneShown = false; paused = false; looking = false;
    lastLogKey = ""; lastDamageLen = -1; lastSpoken = 0; selected = 0; acc = 0;
    sim.beginJump();
    running = true;
    speakNew();     // say the first line inside this tap: iPad Safari only wakes its voices for a real line spoken from a tap
  }

  function pause() {
    if (!running || !sim || sim.phase === "done" || paused) return;
    paused = true; looking = false;
    BL.speech.stop();
    if (sim.turret) releaseTurret();
    $("btn-look").hidden = !!sim.turret;
    $("btn-resume").textContent = sim.turret ? "Resume (P)" : "Resume (Space)";
    overlay("ov-pause", true); $("planning-banner").hidden = true;
    $("pause-voice").textContent = BL.speech.status();
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
  // Any tap on the console keeps iPad Safari's permission to speak alive.
  $("scr-console").addEventListener("pointerdown", function () { BL.speech.unlock(); }, true);
  $("scr-turret").addEventListener("pointerdown", function () { BL.speech.unlock(); }, true);
  document.addEventListener("visibilitychange", function () { if (document.hidden && inMission()) pause(); });

  function openOptions() {
    if (inMission()) pause();
    $("vol-fx").value = settings.fx; $("vol-alarm").value = settings.alarm; $("vol-chat").value = settings.chat;
    $("opt-voice").checked = !!settings.voice; $("vol-voice").value = settings.voiceVol;
    $("opt-voice").disabled = $("vol-voice").disabled = !BL.speech.supported;
    $("opt-contrast").checked = !!settings.contrast; $("opt-hints").checked = !!settings.hints;
    renderVoiceTable();
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
  $("opt-voice").onchange = function () { settings.voice = this.checked; applySettings(); saveSettings(); if (settings.voice) BL.speech.say("Bridge: voices on.", "info"); };
  $("vol-voice").oninput = function () { settings.voiceVol = +this.value; applySettings(); saveSettings(); };
  $("btn-voice-test").onclick = function () { BL.audio.init(); BL.speech.test(); renderVoiceTable(); $("voice-details").open = true; };
  function renderVoiceTable() {
    var q = ["", "", "Enhanced", "Premium"];
    $("voice-status").textContent = BL.speech.status();
    $("voice-count").textContent = BL.speech.supported ? "This device offers " + BL.speech.voiceCount() + " usable English voices (joke and robot voices are skipped)." : "This browser can't speak.";
    $("voice-table").innerHTML = BL.speech.crew().map(function (c) {
      return "<tr><td>" + c.speaker + "</td><td>" + esc(c.voice) + (q[c.quality] ? " · " + q[c.quality] : "") + "</td></tr>";
    }).join("");
  }
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
    DISPLAY = sim.ship.systems.slice().sort(function (a, b) { return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id); })
      .map(function (s) { return s.id; });
    // More than ten columns: stack them in two rows.
    var stacked = DISPLAY.length > 10, perRow = stacked ? Math.ceil(DISPLAY.length / 2) : DISPLAY.length;
    caps.style.gridTemplateColumns = "repeat(" + perRow + ", minmax(0, 1fr))";
    caps.classList.toggle("stacked", stacked);
    buildReactors();
    caps.classList.toggle("dense", DISPLAY.length >= 8);
    $("trip-order").classList.toggle("trip-two", DISPLAY.length >= 8);
    $("hd-station").textContent = "Main Engineering · " + (job.test ? sim.data.className : BL.shipLabel(job.classId, job.ship) + " (" + sim.data.className + ")") + " · tech level " + sim.data.tl;
    $("jump-label").textContent = sim.hasDrive ? "JUMP" : "RECOVERY";
    $("auxbank").hidden = !sim.hasAux() || multiRx();
    document.body.classList.toggle("no-aux", !sim.hasAux());
    $("hint-bar").textContent = DEFAULT_HINT = "1–" + Math.min(9, DISPLAY.length) + " select · ↑↓ charge rate (Shift: ×5) · ←→ next system" + (sim.hasAux() ? " · A aux" : "") + (multiRx() ? " · R reactor" : "") + " · [ ] priority · 0 zero · M max · Space pause · H hints";
    DISPLAY.forEach(function (id, i) {
      var s = sim.sys(id);
      var el = document.createElement("div");
      el.className = "cap"; el.dataset.id = id;
      el.innerHTML =
        '<div class="cap-head"><span class="cap-key">' + (i < 9 ? i + 1 : "") + '</span><span class="cap-name"><span class="nm-long">' + s.name + '</span><span class="nm-short">' + s.short + '</span></span>' +
        '<span class="prio" data-hint="Priority badge: P1 trips last, the highest number trips first. Drag it onto another capacitor to swap places, or press [ and ].">P</span>' +
        (multiRx() ? '<button class="rx-btn" data-hint="The reactor this capacitor draws from. Tap (or press R) to move it to the next reactor; it draws nothing for 2 s while it switches.">A</button>' : "") + '</div>' +
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
        nmLong: el.querySelector(".nm-long"), nmShort: el.querySelector(".nm-short"),
        mj: el.querySelector(".r-mj"), rset: el.querySelector(".r-set"), rnow: el.querySelector(".r-now"),
        auxBtn: el.querySelector(".aux-btn"), rxBtn: el.querySelector(".rx-btn")
      };
      capEls[id] = refs;
      el.addEventListener("pointerdown", function () { selected = i; });
      wireSlider(id, refs.slider);
      wirePrio(id, refs.prio);
      refs.auxBtn.onclick = function () { selected = i; toggleAux(id); };
      if (refs.rxBtn) refs.rxBtn.onclick = function (ev) { ev.stopPropagation(); selected = i; moveRx(id); };
    });
    $("route").innerHTML = sim.route.map(function (r, i) { return '<li data-i="' + i + '">' + (i + 1) + ". " + BL.ENCOUNTERS[r].name + "</li>"; }).join("") +
      (sim.hasDrive ? '<li data-i="' + sim.route.length + '">Archonian world</li>' : '<li data-i="' + sim.route.length + '">Carrier: final recovery</li>');
    $("comms-log").innerHTML = "";
    $("damage-list").innerHTML = '<li class="muted">None</li>';
    Object.keys(fcEls).forEach(function (k) { fcEls[k].remove(); }); fcEls = {};
    // Static part of the gauge: the overload zone from 100% to 150%.
    $("g-over").setAttribute("d", arc(100, 150));
    var a = angle(100), c = Math.cos(a), s2 = Math.sin(a);
    $("g-100").setAttribute("x1", 100 + 66 * c); $("g-100").setAttribute("y1", 105 - 66 * s2);
    $("g-100").setAttribute("x2", 100 + 94 * c); $("g-100").setAttribute("y2", 105 - 94 * s2);
  }
  function multiRx() { return sim.ship.reactors.length > 1; }
  function moveRx(id) { if (canControl() && sim.moveReactor(id)) BL.audio.play("toggle"); }
  // Battleship and up: one small panel per reactor (load, heat, aux bank) instead of the gauge.
  function buildReactors() {
    var multi = multiRx(), box = $("rx-multi");
    box.hidden = !multi; $("reactor-title").textContent = multi ? "REACTORS" : "REACTOR";
    document.querySelector(".gauge-wrap").hidden = $("heat-box").hidden = multi;
    $("auxbank").hidden = multi || !sim.hasAux();
    box.innerHTML = ""; rxEls = [];
    if (!multi) return;
    sim.ship.reactors.forEach(function (rx, k) {
      var el = document.createElement("div");
      el.className = "rx-box"; el.dataset.rx = k;
      el.setAttribute("data-hint", "Reactor " + rx.name + ": its own load (over 100% builds heat), heat and failsafe, and its own aux bank, which feeds only capacitors on this reactor.");
      el.innerHTML = '<div class="row-label"><span>REACTOR ' + rx.name + '</span><span class="rx-load"></span></div>' +
        '<div class="hbar"><div class="hbar-fill rx-load-fill"></div><i class="hbar-mark" style="left:66.67%"></i></div>' +
        '<div class="row-label"><span>heat</span><span class="rx-heat"></span></div>' +
        '<div class="hbar"><div class="hbar-fill heat-fill"></div><i class="hbar-mark" style="left:80%"></i></div>' +
        (rx.aux.cap ? '<div class="row-label"><span>aux ' + rx.name + '</span><span class="rx-aux"></span></div><div class="hbar"><div class="hbar-fill aux-fill"></div></div>' : "");
      box.appendChild(el);
      rxEls.push({ root: el, load: el.querySelector(".rx-load"), loadFill: el.querySelector(".rx-load-fill"), heat: el.querySelector(".rx-heat"),
        heatFill: el.querySelector(".heat-fill"), aux: el.querySelector(".rx-aux"), auxFill: el.querySelector(".aux-fill") });
    });
  }
  function renderReactors() {
    sim.ship.reactors.forEach(function (rx, k) {
      var r = rxEls[k]; if (!r) return;
      setText(r.load, Math.round(rx.loadPct) + "% · " + Math.round(rx.load) + "/" + rx.max + " MW");
      r.loadFill.style.width = pct(rx.loadPct / 150);
      setCls(r.loadFill, "hbar-fill rx-load-fill" + (rx.loadPct > 100 ? " over" : ""));
      setText(r.heat, Math.round(rx.heat) + " / 100");
      r.heatFill.style.width = pct(rx.heat / 100);
      r.root.classList.toggle("hot", rx.heat >= BL.PHYSICS.alarmHeat);
      if (r.aux) { setText(r.aux, Math.round(rx.aux.mj) + " / " + rx.aux.cap + " MJ" + (rx.aux.out > 0.1 ? " · " + Math.round(rx.aux.out) + " MW" : "")); r.auxFill.style.width = pct(rx.aux.mj / rx.aux.cap); }
    });
  }
  function capHint(s) {
    return s.kind === "gun" ? "Each shot uses " + sim.data.gun.shotMJ + " MJ." :
      s.kind === "shield" ? "Salvos drain it; what it can't stop hits the hull." :
      s.kind === "life" ? "Drains " + s.drainMW + " MW all the time. Empty = crippled crew." :
      s.kind === "main" ? "Fires by itself the moment it is full and a target is up: the whole charge in one heavy shot. Keep feeding it to keep it firing." :
      s.kind === "pd" ? "CIWS (close-in weapon system): each drive strike it stops costs a chunk of charge. Shields don't stop drive strikes." :
      s.kind === "buster" ? "The planet buster: charges from the start, keeps its charge, can't charge in GravSpace. Must be full for the final jump." :
      s.kind === "hangar" ? "Launchers while the squadron is aboard: full when the bridge calls the launch, to kick the gunboats out. Arresters while it is out: full when the bridge calls the recovery. No jump until the gunboats are aboard." :
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
    if (inTurret() && sim && ev.target.tagName !== "INPUT" && ev.target.tagName !== "SELECT") { if (sim.helm) helmKey(ev); else turretKey(ev, true); return; }
    if (!inConsole() || !sim || ev.target.tagName === "INPUT") return;
    if (!$("ov-grav").hidden) { if (ev.key === "Enter") $("btn-grav-go").click(); return; }
    var k = ev.key;
    if (k === " " || k === "Spacebar") { ev.preventDefault(); if (paused) resume(); else pause(); return; }
    if (k === "Escape" && paused && looking) { resume(); return; }
    if (k === "h" || k === "H") { toggleHints(); return; }
    if (!canControl()) return;
    var id = DISPLAY[selected], s = sim.sys(id), step = ev.shiftKey ? 10 : 2;
    if (k.length === 1 && k >= "1" && k <= "9" && +k <= DISPLAY.length) { selected = +k - 1; BL.audio.play("tick"); }
    else if (k === "ArrowUp") { sim.setSetpoint(id, s.set + step); BL.audio.play("tick"); }
    else if (k === "ArrowDown") { sim.setSetpoint(id, s.set - step); BL.audio.play("tick"); }
    else if (k === "ArrowLeft") { selected = (selected + DISPLAY.length - 1) % DISPLAY.length; }
    else if (k === "ArrowRight") { selected = (selected + 1) % DISPLAY.length; }
    else if (k === "0") { sim.setSetpoint(id, 0); BL.audio.play("tick"); }
    else if (k === "m" || k === "M") { sim.setSetpoint(id, s.baseMW); BL.audio.play("tick"); }
    else if (k === "a" || k === "A") toggleAux(id);
    else if ((k === "r" || k === "R") && multiRx()) moveRx(id);
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
      while (acc >= sim.dt && n < 10) { if (aiEngineer) aiEngineer.think(sim); sim.step(); acc -= sim.dt; n++; }
      if (n >= 10) acc = 0;
    }
    if (sim && inConsole()) { render(); sounds(ts); phaseCheck(); }
    else if (sim && inTurret()) { renderTurret(ts); sounds(ts); phaseCheck(); }
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
      report = null;
      if (!job.test && career) { report = BL.career.applyResult(career, job, sim.result); saveCareer(); }
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
    $("hd-jump").innerHTML = (sim.hasDrive ? "Jump" : "Sortie") + " <b>" + (sim.jumpIndex + 1) + "</b> of " + sim.cfg.jumps + " · <b>" + (enc.name || "") + "</b>";
    var ph = sim.phase === "arrival" ? "Engagement in " + Math.ceil(sim.cfg.arrivalSeconds - sim.t) + " s" :
      sim.phase === "countdown" ? "JUMPING IN " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) :
      sim.phase === "engage" ? "T+" + mmss(sim.t) : "";
    setText($("hd-phase"), ph);

    renderForecast();
    renderComms();

    // Reactor
    if (multiRx()) renderReactors();
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
    setText($("eng-val"), (ship.starved ? "⚠ STARVED · " : "") + ship.g.toFixed(1) + " of " + ship.maxG + " G · " + Math.round(ship.engineMW) + " MW");
    $("eng-fill").parentNode.parentNode.classList.toggle("hot", !!ship.starved);
    $("eng-fill").style.width = pct(ship.g / sim.data.maxG);
    setText($("aux-val"), Math.round(ship.aux.mj) + " / " + ship.aux.cap + " MJ");
    $("aux-fill").style.width = pct(ship.aux.cap ? ship.aux.mj / ship.aux.cap : 0);
    var feeding = ship.systems.filter(function (s) { return s.aux; }).map(function (s) { return s.short; });
    setText($("aux-out"), feeding.length ? "Switched to " + feeding.join(", ") + (ship.aux.out > 0.1 ? " · " + Math.round(ship.aux.out) + " MW" : "") : "Not switched on");
    var trip = sim.priority.slice().reverse().map(function (id) {
      var s = sim.sys(id); return '<li class="' + (s.tripped ? "tripped" : "") + '">' + (multiRx() ? s.short + " (" + ship.reactors[s.reactor].name + ")" : s.name) + (s.tripped ? " ✖" : "") + "</li>";
    }).join("");
    if ($("trip-order").innerHTML !== trip) $("trip-order").innerHTML = trip;

    // Capacitors
    DISPLAY.forEach(function (id, i) {
      var s = sim.sys(id), r = capEls[id];
      setCls(r.root, "cap" + (i === selected ? " sel" : "") + (s.tripped ? " tripped" : ""));
      setText(r.nmLong, s.name); setText(r.nmShort, s.short);
      if (r.rxBtn) { setText(r.rxBtn, ship.reactors[s.reactor].name); if (r.root.dataset.rx !== String(s.reactor)) r.root.dataset.rx = s.reactor; }
      setText(r.prio, "P" + (sim.priority.indexOf(id) + 1));
      var st = "", stc = "cap-state";
      var full = s.mj >= s.maxMJ - 0.5;
      if (s.tripped) { st = "✖ TRIPPED " + Math.ceil(s.tripUntil - sim.t) + " s"; stc += " tripped"; }
      else if (sim.t < s.switchUntil) { st = "⇄ TO " + ship.reactors[s.reactor].name; stc += " request"; }
      else if (s.request) { st = "◆ RAPID FIRE"; stc += " request"; }
      else if (s.call) { st = s.call.late ? "⤓ RECOVER NOW" : (s.call.type === "recover" ? "⤓ RECOVERY " : "✈ LAUNCH ") + Math.max(0, Math.ceil(s.call.until - sim.t)) + " s"; stc += " request"; }
      else if (s.kind === "hangar" && sim.squadron === "out") { st = "✈ SQUADRON OUT"; stc += " full"; }
      else if (s.kind === "hangar" && sim.squadron === "lost") { st = "SQUADRON LOST"; stc += " low"; }
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
      setText(r.mj, Math.round(s.mj) + (DISPLAY.length >= 8 ? "/" : " / ") + s.maxMJ);
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
    var drive = sim.sys("drive"), wi = sim.windowIn(), js, jc = "jump-status";
    if (!drive) {
      var sp = clampN(sim.t / sim.windowAt(), 0, 1);
      setText($("jump-drive"), Math.max(0, Math.ceil(wi)) + " s");
      $("jump-fill").style.width = pct(sp);
      setText($("jump-status"), sim.phase === "arrival" ? "Launching from the carrier" : "Carrier recovers you in " + Math.max(0, Math.ceil(wi)) + " s");
      setCls($("jump-status"), "jump-status");
    }
    var dp = drive ? drive.mj / drive.maxMJ : 0;
    if (drive) {
    setText($("jump-drive"), "drive " + Math.floor(dp * 100) + "%");
    $("jump-fill").style.width = pct(dp);
    if (sim.phase === "countdown") { js = "✔ Drive full. Jumping in " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) + " s"; jc += " go"; }
    else if (sim.squadron === "out" && wi <= 0) { js = "⚠ Window OPEN: holding the jump until the squadron is aboard"; jc += " late"; }
    else if (sim.jumpIndex === sim.cfg.jumps - 1 && !sim.busterFull() && wi <= 0) { js = "⚠ Window OPEN: the planet buster isn't full · " + Math.floor(sim.sys("buster").mj / sim.sys("buster").maxMJ * 100) + "%"; jc += " late"; }
    else if (wi > 0) {
      var need = (drive.maxMJ - drive.mj) / Math.max(1, wi);
      js = "Window opens in " + Math.ceil(wi) + " s" + (dp < 1 ? " · drive needs ~" + Math.ceil(need) + " MW from now" : " · drive ready");
      var bst = sim.sys("buster");
      if (bst) js += " · buster " + Math.floor(bst.mj / bst.maxMJ * 100) + "%";
      if (need > drive.maxMW * 0.8) jc += " late";
    } else { js = "⚠ Window OPEN: the bridge is waiting on the drive"; jc += " late"; }
    setText($("jump-status"), js); setCls($("jump-status"), jc);
    }
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
    var shieldLeft = sim.sys("shield").mj;   // salvos land in order; each eats what's left
    var pdLeft = sim.sys("pd") ? sim.sys("pd").mj : 0;
    items.sort(function (a, b) { return a.in - b.in; });
    items.forEach(function (e) {
      seen[e.id] = true;
      var el = fcEls[e.id];
      if (!el) { el = document.createElement("div"); el.className = "fc-ev " + e.type; tracks[LANE[e.type]].appendChild(el); fcEls[e.id] = el; }
      var start = Math.max(0, e.in), end = e.in + e.dur;
      el.style.left = pct(start / span);
      if (e.dur) el.style.width = pct(Math.max(0.4, end - start) / span);
      var secs = e.in > 0 ? " · " + Math.ceil(e.in) + " s" : "";
      var label;
      if (e.type === "salvo") {
        shieldLeft -= e.mj;
        label = "⚡ SALVO " + e.mj + " MJ" + secs + (shieldLeft >= 0 ? " · ✔ covered" : " · short " + Math.ceil(Math.min(e.mj, -shieldLeft)) + " MJ");
        el.classList.toggle("short", shieldLeft < 0);
      } else if (e.type === "strike") {
        pdLeft -= e.mj;
        label = "✈ DRIVE STRIKE · CIWS " + e.mj + " MJ" + secs + (pdLeft >= 0 ? " · ✔ covered" : " · CIWS short");
        el.classList.toggle("short", pdLeft < 0);
      } else if (e.type === "burn") {
        label = sim.encounter().mines ? "▲ WEAVE " + e.g + " G · engines need " + Math.round(e.g * sim.perG()) + " MW free for " + e.dur + " s" + secs
          : "▲ BURN " + e.g + " G · +" + Math.round((e.g - sim.data.cruiseG) * sim.perG()) + " MW for " + e.dur + " s" + secs;
      } else if (e.type === "launch" || e.type === "recover") {
        var cs = sim.sys("hangar"), pc = Math.floor(cs.mj / cs.maxMJ * 100);
        var what = e.type === "launch" ? "✈ LAUNCH · launchers" : "⤓ RECOVERY · arresters";
        label = what + (e.late ? " OVERDUE · must be full · " + pc + "% · no jump until aboard" : e.open ? " NOW · must be full · " + pc + "% · " + Math.ceil(e.dur) + " s left" : " · must be full · " + pc + "% now" + secs);
        el.classList.toggle("short", pc < 100 && e.in < (cs.maxMJ - cs.mj) / Math.max(1, cs.maxMW));
      } else {
        label = "◆ GUN " + e.gun + " RAPID FIRE · " + Math.round(sim.data.gun.shotMJ / sim.data.gun.fullInterval) + " MW for " + e.dur + " s" + secs;
      }
      setText(el, label);
      el.classList.toggle("now", e.in <= 1);
      el.style.zIndex = String(100 - Math.round(Math.max(0, e.in) * 4));
    });
    // Pack each lane into two rows so close-together demands don't hide each other.
    Object.keys(tracks).forEach(function (lane) {
      var els = items.filter(function (e) { return LANE[e.type] === lane; }).sort(function (a, b) { return a.in - b.in; })
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
    if (!sim.hasDrive) { setText(fj, wi <= sim.cfg.jumpWindowNotice ? "Recovery in " + Math.max(0, Math.ceil(wi)) + " s ▶" : ""); setCls(fj, "fc-jump"); }
    else if (sim.phase === "countdown") { setText(fj, "JUMPING"); setCls(fj, "fc-jump"); }
    else if (wi > 0) { setText(fj, wi <= sim.cfg.jumpWindowNotice ? "Jump window in " + Math.ceil(wi) + " s ▶" : ""); setCls(fj, "fc-jump"); }
    else { setText(fj, "JUMP WINDOW OPEN · drive " + Math.floor(sim.sys("drive").mj / sim.sys("drive").maxMJ * 100) + "%"); setCls(fj, "fc-jump open"); }
  }

  function speakNew() {
    var live = running && !paused && sim.phase !== "done";
    sim.log.forEach(function (l) {
      if (l.seq <= lastSpoken) return;
      lastSpoken = l.seq;
      if (live) BL.speech.say(l.text, l.kind, l.now);
    });
  }

  function renderComms() {
    var box = sim.turret ? $("tu-comms") : $("comms-log"), lines = sim.turret ? 6 : 9;
    speakNew();
    var log = sim.log, last = log[log.length - 1];
    var key = log.length + ":" + (last ? last.t + last.text : "");
    if (key === lastLogKey) return;
    lastLogKey = key;
    var icon = { warn: "⚠ ", bad: "✖ ", good: "✔ ", info: "" };
    box.innerHTML = log.slice(-lines).map(function (l) {
      return '<div class="' + l.kind + '"><span class="t">' + mmss(l.t) + "</span>" + icon[l.kind] + esc(l.text) + "</div>";
    }).join("");
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* ------------------------------------------------------- Gunner turret */
  var keysHeld = {}, tuCtx = null, tuSize = 0, tuW = 0, tuH = 0, lastTuDamage = -1;
  /* Wide view (W, ring view only): the side panels give way to an overlay and the battle fills
     the screen, turned a quarter turn so the bow points right. Standard view is the default;
     the choice is remembered. */
  function wideOn() { return !!(settings.wideView && sim && sim.turret && sim.turret.ring && !sim.helm); }
  function applyView() {
    var wide = wideOn();
    $("scr-turret").classList.toggle("wide", wide);
    $("tu-hud").hidden = !wide;
    $("btn-tu-view").hidden = !(sim && sim.turret && sim.turret.ring) || !!(sim && sim.helm);
    $("btn-tu-view").textContent = wide ? "Standard view (W)" : "Wide view (W)";
    tuSize = 0; sizeTurret();
  }
  function toggleWide() { settings.wideView = !settings.wideView; saveSettings(); applyView(); click(); }
  function buildTurret() {
    var tu = sim.turret, w = tu.w;
    $("tu-station").textContent = "Gunnery · " + (job.test ? sim.data.className : BL.shipLabel(job.classId, job.ship) + " (" + sim.data.className + ")") + " · tech level " + sim.data.tl;
    $("tu-rec-label").textContent = sim.hasDrive ? "JUMP" : "RECOVERY";
    lastJolt = 0;
    $("tu-keys").textContent = (tu.ring ? "→ clockwise · ← counterclockwise" : "← → slide") + " · Space fire (hold) · " + (tu.ring ? "W wide view · " : "") + (tu.firesMain ? "M main gun · " : "") + (tu.bats.length > 1 ? "1–" + tu.bats.length + " switch guns · O orders · " : sim.data.torpedoes ? "1 2 torpedoes · " : "") +
      "C call for power · P pause · " + (tu.ring ? "Mouse or trackpad: the gun follows the pointer; click a target to swing to it; hold button to fire · Touch: touch the view to point, hold FIRE" : "Mouse: move to aim, hold button to fire · Touch: drag to aim, hold FIRE");
    // Battery buttons (two or more guns): tap to take that gun; you trade places with its gunner.
    $("tu-bats").hidden = tu.bats.length < 2;
    $("tu-bats").innerHTML = tu.bats.map(function (b, i) {
      return '<button class="tu-bat" data-i="' + i + '"><span class="bat-top"><span>GUN ' + b.gunNo + " · " + b.w.short + " <small>(" + (i + 1) + ')</small></span><span class="ord" data-ord="' + i + '"></span></span><span class="mini"><i></i></span><span class="acc"></span></button>';
    }).join("");
    shownSel = -1; showBattery();
    showToggles();
    $("hud-guns").innerHTML = tu.bats.length > 1 ? tu.bats.map(function (b, i) { return '<button data-i="' + i + '">' + b.gunNo + " " + b.w.short + "</button>"; }).join("") : "";
    applyView();
    $("tu-comms").innerHTML = "";
    keysHeld = {}; setFireBtn(false);
    // The helm: its panel and wheel replace the gun panel; the gun buttons go.
    var helm = !!sim.helm;
    $("tu-gunside").hidden = helm; $("tu-helm").hidden = !helm; $("hm-wheel").hidden = !helm;
    $("btn-tu-call").hidden = $("btn-tu-fire").hidden = helm;
    $("hm-launch").hidden = true;
    if (helm) {
      $("tu-tubes").hidden = true; $("btn-tu-main").hidden = true;
      $("tu-station").textContent = "Helm · " + (job.test ? sim.data.className : BL.shipLabel(job.classId, job.ship) + " (" + sim.data.className + ")") + " · tech level " + sim.data.tl;
      $("tu-keys").textContent = "← → wheel · 0 midships · ↑ ↓ both engines · Q A port · P L starboard · + − 1 G · T autopilot · E warn engineering · Space launch · Esc pause · Drag the wheel · Tap the telegraph · Tap or dial the compass for autopilot";
      buildHelm();
    }
  }
  /* On-screen switches: clicking a gun on the view takes it (off by default, so a stray click
     doesn't move you off your gun), and clicking a target swings your gun to it (ring view). */
  function showToggles() {
    var tu = sim.turret;
    $("tg-gunpick").hidden = tu.bats.length < 2;
    $("tg-clickaim").hidden = !tu.ring;
    $("tg-gunpick").innerHTML = "Click a gun to take it: <b>" + (settings.tapGuns ? "ON" : "OFF") + "</b>";
    $("tg-clickaim").innerHTML = "Click a target to aim: <b>" + (settings.clickAim !== false ? "ON" : "OFF") + "</b>";
    $("tg-gunpick").classList.toggle("on", !!settings.tapGuns);
    $("tg-clickaim").classList.toggle("on", settings.clickAim !== false);
  }
  $("tg-gunpick").onclick = function () { settings.tapGuns = !settings.tapGuns; saveSettings(); showToggles(); this.blur(); };
  $("tg-clickaim").onclick = function () { settings.clickAim = settings.clickAim === false; saveSettings(); showToggles(); this.blur(); };
  // The left panel follows the battery you're aiming.
  var shownSel = -1;
  function showBattery() {
    var tu = sim.turret, w = tu.w;
    if (shownSel === tu.sel) return;
    shownSel = tu.sel;
    $("tu-weapon").textContent = "GUN " + tu.gunNo + " · " + w.name.toUpperCase();
    $("tu-weapon-what").textContent = w.what;
    var gun = tu.gun(), n = Math.floor(gun.maxMJ / w.shotMJ), ticks = "";
    for (var i = 1; i <= n && n <= 30; i++) ticks += '<i style="bottom:' + (i * w.shotMJ / gun.baseMJ * 100).toFixed(2) + '%"></i>';
    $("tu-ticks").innerHTML = ticks;
    Array.prototype.forEach.call($("tu-bats").children, function (el, i) { el.classList.toggle("on", i === tu.sel); });
  }
  function selectBattery(i) {
    var tu = sim.turret, held = tu.firing;
    if (!tu.select(i)) return;
    if (held || keysHeld.fire) tu.trigger(true);      // keep firing with the new gun if FIRE is held
    tu.setDir(keyDir());
    showBattery();
  }
  $("tu-bats").addEventListener("click", function (ev) {
    // Tapping the letter of the gun you hold changes its order; any other tap takes that gun.
    var o = ev.target.closest("[data-ord]");
    if (o && turretActive() && +o.dataset.ord === sim.turret.sel) { cycleOrder(sim.turret.sel); return; }
    var b = ev.target.closest("button[data-i]"); if (b && turretActive()) selectBattery(+b.dataset.i);
  });
  function sizeTurret() {
    var box = $("tu-field"), cv = $("tu-canvas"), dpr = window.devicePixelRatio || 1;
    var side = Math.floor(Math.max(120, Math.min(box.clientWidth, box.clientHeight)));
    var w = wideOn() ? Math.floor(Math.max(120, box.clientWidth)) : side, h = wideOn() ? side : side;
    if (side === tuSize && w === tuW && h === tuH && tuCtx) return;
    tuSize = side; tuW = w; tuH = h;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    tuCtx = cv.getContext("2d");
    tuCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", function () { if (inTurret()) { tuSize = 0; sizeTurret(); } });

  var lastJolt = 0;
  function renderTurret(ts) {
    if (sim.helm) { renderHelm(ts); return; }
    var tu = sim.turret, ship = sim.ship, gun = tu.gun(), w = tu.w, enc = sim.encounter() || {};
    // A hull hit shakes the whole station, not just the view.
    tu.effects.forEach(function (f) {
      if (f.type === "hullHit" && f.at > lastJolt) {
        lastJolt = f.at; var el = $("scr-turret");
        el.classList.remove("jolt"); void el.offsetWidth; el.classList.add("jolt");
        if (navigator.vibrate) try { navigator.vibrate([60, 40, 90]); } catch (e) {}
      }
    });
    sizeTurret();
    if (tu.ring) BL.drawRing(tuCtx, { w: tuW, h: tuH, wide: wideOn() }, sim, tu, ts);
    else BL.drawTurret(tuCtx, tuSize, sim, tu, ts);
    showBattery();
    if (wideOn()) renderHud(tu);
    $("tu-jump").innerHTML = (sim.hasDrive ? "Jump" : "Sortie") + " <b>" + (sim.jumpIndex + 1) + "</b> of " + sim.cfg.jumps + " · <b>" + (enc.name || "") + "</b>";
    setText($("tu-phase"), sim.phase === "arrival" ? (sim.hasDrive ? "Engagement in " : "Launching in ") + Math.ceil(sim.cfg.arrivalSeconds - sim.t) + " s" :
      sim.phase === "countdown" ? "JUMPING IN " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) : sim.phase === "engage" ? "T+" + mmss(sim.t) : "");
    Array.prototype.forEach.call($("tu-bats").children, function (el, i) {
      var g = tu.gun(tu.bats[i]); el.querySelector(".mini i").style.width = pct(g.mj / g.baseMJ);
    });
    renderComms();
    // Gun
    $("tu-charge").style.height = pct(gun.mj / gun.baseMJ);
    setCls($("tu-charge"), "tu-lvl" + (gun.mj < w.shotMJ ? " low" : ""));
    setText($("tu-mj"), Math.floor(gun.mj) + " / " + gun.maxMJ + " MJ");
    var nShots = Math.floor(gun.mj / w.shotMJ);
    setText($("tu-shots"), nShots + (nShots === 1 ? " shot · " : " shots · ") + w.shotMJ + " MJ each");
    // Hit rate on this gun this mission: yours, and its crew's when they've had the gun.
    var bt = tu.bat(), accHtml = '<div>you <b>' + rate(bt.hits, bt.shots) + "</b> " + frac(bt.hits, bt.shots) + "</div>" +
      (tu.bats.length > 1 ? '<div class="ai">crew ' + rate(bt.aiHits, bt.aiShots) + " " + frac(bt.aiHits, bt.aiShots) + "</div>" : "");
    if ($("tu-acc").innerHTML !== accHtml) $("tu-acc").innerHTML = accHtml;
    Array.prototype.forEach.call($("tu-bats").children, function (el, i) {
      var b = tu.bats[i], o = tu.orderFor(b);
      // Who's on it: you, or its gunner and their skill (the hit rate is in the tooltip).
      var acc = el.querySelector(".acc");
      setText(acc, b.crew ? b.crew.last + " · " + Math.round(b.crew.skill * 100) : "You");
      acc.title = (b.crew ? b.crew.name + ", " + b.crew.label + " (skill " + Math.round(b.crew.skill * 100) + "). " : "You're on this gun. ") +
        "Hit rate on this gun this mission: you " + rate(b.hits, b.shots) + ", crew " + rate(b.aiHits, b.aiShots) + ".";
      var ord = el.querySelector(".ord");
      setText(ord, BL.GUNNERY.orders[o.order].key);
      setCls(ord, "ord" + (o.auto ? " sug" : ""));
      ord.title = BL.GUNNERY.orders[o.order].name + (o.auto ? " (suggested: " + o.why + ")" : "") + ". Take this gun, then press O or tap here to change it.";
    });
    setText($("tu-feed"), Math.round(gun.rate) + " MW" + (gun.tripped ? " · TRIPPED" : gun.maxMW < gun.baseMW ? " · max " + gun.maxMW + " (damaged)" : ""));
    var td = ["slide", "rate", "reach"].filter(function (k) { return gun.tdmg[k] > 0.005; });
    var tdHtml = td.length ? td.map(function (k) { return '<div class="hurt">⚠ ' + BL.turretWords(k, gun.tdmg[k]).replace(/^now /, "") + "</div>"; }).join("") : '<div class="ok">✔ No damage</div>';
    if ($("tu-tdmg").innerHTML !== tdHtml) $("tu-tdmg").innerHTML = tdHtml;
    var dl = sim.stats.damageReports;
    if (dl.length !== lastTuDamage) {
      lastTuDamage = dl.length;
      $("tu-damage").innerHTML = dl.length ? dl.slice(-4).reverse().map(function (d) { return "<li>" + esc(d.what) + "</li>"; }).join("") : '<li class="muted">None</li>';
    }
    var cs = tu.callState(), st, stc = "tu-state";
    if (gun.tripped) { st = "✖ GUN TRIPPED " + Math.ceil(gun.tripUntil - sim.t) + " s"; stc += " dry"; }
    else if (gun.mj < w.shotMJ) { st = "DRY: release FIRE to recharge"; stc += " dry"; }
    else if (cs.state === "on") { st = "◆ POWER CALLED " + Math.ceil(cs.left) + " s"; stc += " call"; }
    else { st = "READY"; stc += " ready"; }
    setText($("tu-state"), st); setCls($("tu-state"), stc);
    $("tu-tubes").hidden = !tu.pt.length;
    [0, 1].forEach(function (i) {
      var b = $("btn-pt-" + (i + 1)), loaded = !!tu.pt[i];
      b.disabled = !loaded || !tu.live();
      b.firstChild.nodeValue = loaded ? "LAUNCH " + (i + 1) + " " : "TUBE " + (i + 1) + " EMPTY ";
    });
    var ms = tu.mainState && tu.mainState(), mb = $("btn-tu-main");
    mb.hidden = !ms;
    if (ms) {
      mb.disabled = !ms.ready;
      setCls(mb, "tu-main" + (ms.ready ? " ready" : ""));
      mb.firstChild.nodeValue = ms.tripped ? "MAIN GUN TRIPPED " : ms.ready ? "FIRE MAIN GUN " : "MAIN GUN " + Math.floor(100 * ms.mj / ms.max) + "% ";
      $("tu-main-fill").style.width = pct(ms.mj / ms.max);
    }
    var cb = $("btn-tu-call");
    cb.disabled = cs.state === "wait" || !tu.live();
    setCls(cb, "tu-call" + (cs.state === "on" ? " on" : ""));
    cb.firstChild.nodeValue = cs.state === "on" ? "POWER COMING " + Math.ceil(cs.left) + " s " : cs.state === "wait" ? "CALL AGAIN IN " + Math.ceil(cs.left) + " s " : "CALL FOR POWER ";
    // Ship
    setText($("tu-hull-val"), Math.max(0, Math.round(ship.hull)) + " / " + ship.hullMax);
    $("tu-hull").style.width = pct(ship.hull / ship.hullMax);
    $("tu-hull").classList.toggle("low", ship.hull < ship.hullMax * 0.35);
    var sh = sim.sys("shield");
    setText($("tu-shield-val"), Math.round(sh.mj) + " / " + sh.maxMJ + " MJ");
    $("tu-shield").style.width = pct(sh.mj / sh.maxMJ);
    var wi = sim.windowIn();
    var drive = sim.sys("drive");
    if (drive) {
      setText($("tu-rec-val"), (wi > 0 ? "window in " + Math.ceil(wi) + " s · " : "window open · ") + "drive " + Math.floor(drive.mj / drive.maxMJ * 100) + "%");
      $("tu-rec").style.width = pct(drive.mj / drive.maxMJ);
    } else {
      setText($("tu-rec-val"), Math.max(0, Math.ceil(wi)) + " s");
      $("tu-rec").style.width = pct(sim.t / sim.windowAt());
    }
    var g = tu.cur || {};
    $("tu-tally").innerHTML = (g.mines ? "<span>Mines shot down</span><b>" + (g.minesDowned || 0) + " / " + g.mines + "</b>"
      : "<span>Ships destroyed</span><b>" + (g.kills || 0) + " / " + (g.ships || 0) + "</b><span>Torpedoes shot down</span><b>" + (g.downed || 0) + " / " + (g.torps || 0) + "</b>") +
      (g.mainShots ? "<span>Main gun hits</span><b>" + g.mainHits + " / " + g.mainShots + "</b>" : "") +
      (g.strikes ? "<span>Drive strikes stopped</span><b>" + (g.strikesCiws + g.strikesShot) + " / " + g.strikes + "</b>" : "") +
      "<span>Hits</span><b>" + (g.hits || 0) + " / " + (g.shots || 0) + "</b>" + (ship.crippled ? '<span class="bad">✖ Crew crippled: slow fire</span><b></b>' : "");
  }

  // The wide view's overlay: the gun you hold, hull, shields, jump or recovery, the tally, the
  // latest comms, and buttons for touch.
  function renderHud(tu) {
    var gun = tu.gun(), w = tu.w, cs = tu.callState(), ship = sim.ship, sh = sim.sys("shield"), drive = sim.sys("drive");
    var st = gun.tripped ? ['<span class="dry">TRIPPED</span>'] : gun.mj < w.shotMJ ? ['<span class="dry">DRY</span>'] : cs.state === "on" ? ['<span class="call">POWER CALLED</span>'] : ['<span class="ready">READY</span>'];
    setHtml($("hud-gun"), "GUN " + tu.bat().gunNo + " · " + w.short + ' <i class="hud-bar"><i style="width:' + pct(gun.mj / gun.baseMJ) + ';background:var(--charge)"></i></i> <b>' + Math.floor(gun.mj) + "/" + gun.maxMJ + " MJ</b> " + st[0]);
    $("hud-hull").style.width = pct(ship.hull / ship.hullMax); setText($("hud-hull-val"), Math.max(0, Math.round(ship.hull)) + "/" + ship.hullMax);
    $("hud-shield").style.width = pct(sh.mj / sh.maxMJ); setText($("hud-shield-val"), Math.round(sh.mj) + "/" + sh.maxMJ);
    var wi = sim.windowIn();
    setHtml($("hud-rec"), drive ? "JUMP <b>" + (wi > 0 ? Math.ceil(wi) + " s" : "open") + "</b> · drive <b>" + Math.floor(drive.mj / drive.maxMJ * 100) + "%</b>" : "RECOVERY <b>" + Math.max(0, Math.ceil(wi)) + " s</b>");
    var g = tu.cur || {};
    setHtml($("hud-tally"), g.mines ? "Mines <b>" + (g.minesDowned || 0) + "/" + g.mines + "</b>" : "Ships <b>" + (g.kills || 0) + "/" + (g.ships || 0) + "</b> · Torpedoes <b>" + (g.downed || 0) + "/" + (g.torps || 0) + "</b>");
    Array.prototype.forEach.call($("hud-guns").children, function (b, i) { b.classList.toggle("on", i === tu.sel); });
    var log = sim.log, icon = { warn: "⚠ ", bad: "✖ ", good: "✔ ", info: "" };
    setHtml($("hud-comms"), log.slice(-2).map(function (l) { return '<div class="' + l.kind + '">' + icon[l.kind] + esc(l.text) + "</div>"; }).join(""));
    var ms = tu.mainState && tu.mainState(), mb = $("hud-main");
    mb.hidden = !ms;
    if (ms) { mb.disabled = !ms.ready; mb.classList.toggle("ready", ms.ready); setText(mb, ms.tripped ? "MAIN GUN TRIPPED" : ms.ready ? "FIRE MAIN GUN (M)" : "MAIN GUN " + Math.floor(100 * ms.mj / ms.max) + "%"); }
    $("hud-tubes").hidden = !tu.pt.length;
    [0, 1].forEach(function (i) { var b = $("hud-pt-" + (i + 1)); b.disabled = !tu.pt[i] || !tu.live(); setText(b, tu.pt[i] ? "LAUNCH " + (i + 1) : "TUBE " + (i + 1) + " EMPTY"); });
    var cb = $("hud-call");
    cb.disabled = cs.state === "wait" || !tu.live(); cb.classList.toggle("on", cs.state === "on");
    setText(cb, cs.state === "on" ? "POWER COMING " + Math.ceil(cs.left) + " s" : cs.state === "wait" ? "CALL AGAIN IN " + Math.ceil(cs.left) + " s" : "CALL FOR POWER (C)");
  }
  function setHtml(el, h) { if (el.innerHTML !== h) el.innerHTML = h; }
  function rate(h, s) { return s ? Math.round(100 * h / s) + "%" : "–"; }
  function frac(h, s) { return s ? "(" + h + "/" + s + ")" : ""; }
  function turretActive() { return running && sim && sim.turret && !paused && sim.phase !== "done" && $("ov-grav").hidden; }
  function setFireBtn(on) { $("btn-tu-fire").classList.toggle("on", !!on); $("hud-fire").classList.toggle("on", !!on); }
  function releaseTurret() { sim.turret.trigger(false); sim.turret.setDir(0); keysHeld = {}; setFireBtn(false); $("tu-aimpad").classList.remove("on"); }
  function keyDir() { return (keysHeld.right ? 1 : 0) - (keysHeld.left ? 1 : 0); }
  // Keys: ← → (A D) slide, Space or ↑ fire while held, C calls for power, P or Esc pauses.
  function turretKey(ev, down) {
    if (!$("ov-grav").hidden) { if (down && ev.key === "Enter") $("btn-grav-go").click(); return; }
    var k = ev.key, kl = k.length === 1 ? k.toLowerCase() : k, tu = sim.turret;
    if (down && (kl === "p" || k === "Escape")) { ev.preventDefault(); if (paused) resume(); else pause(); return; }
    if (down && kl === "w" && !ev.repeat && tu.ring) { ev.preventDefault(); toggleWide(); return; }
    if (paused) { if (down && k === " ") { ev.preventDefault(); resume(); } return; }
    var name = k === "ArrowLeft" || kl === "a" ? "left" : k === "ArrowRight" || kl === "d" ? "right" : k === " " || k === "Spacebar" || k === "ArrowUp" ? "fire" : null;
    if (name) {
      ev.preventDefault();
      if (!down || turretActive()) keysHeld[name] = down;
      if (name === "fire") { tu.trigger(down && turretActive()); setFireBtn(down && turretActive()); }
      else tu.setDir(turretActive() ? keyDir() : 0);
      return;
    }
    if (down && kl === "c" && turretActive()) { ev.preventDefault(); tu.callPower(); }
    if (down && kl === "m" && turretActive() && tu.firesMain) { ev.preventDefault(); tu.fireMain(); }
    // O: change the standing order of the gun the AI gunner has (the first one you aren't aiming).
    // O: cycle the standing order of the gun you hold (the AI follows it once you switch away).
    if (down && kl === "o" && turretActive() && tu.bats.length > 1) { ev.preventDefault(); cycleOrder(tu.sel); }
    // Number keys: with several batteries they pick a gun; on a gunboat, 1 and 2 fire torpedoes.
    if (down && k.length === 1 && k >= "1" && k <= "9" && turretActive()) {
      if (tu.bats.length > 1) { if (+k <= tu.bats.length) { ev.preventDefault(); selectBattery(+k - 1); } }
      else if (k === "1" || k === "2") { ev.preventDefault(); tu.launchPT(+k - 1); }
    }
  }
  document.addEventListener("keyup", function (ev) { if (inTurret() && sim && !sim.helm) turretKey(ev, false); });
  window.addEventListener("blur", function () { if (sim && sim.turret && inTurret()) releaseTurret(); });

  // Mouse on the view: the turret follows the pointer; hold the button to fire.
  // Touch on the view or the aim pad: drag to slide (relative, so the finger never hides
  // the target); hold the FIRE button to fire.
  /* Ring view: your gun follows the pointer. Wherever the mouse (or a finger on the view) is
     around the ship, the gun turns along the rim toward that side, staying inside its arc and
     never faster than its drive, firing or not. On the aim pad a finger nudges it instead. */
  var RING_DEG = 300;                     // aim pad: degrees the gun turns for a drag the width of the view
  // The pointer in battle units (the view may be zoomed out, and turned in wide view).
  function ringPoint(ev) { var r = $("tu-canvas").getBoundingClientRect(); return BL.ringToWorld(ev.clientX - r.left, ev.clientY - r.top); }
  function pointRing(ev) { var p = ringPoint(ev); sim.turret.pointAt(p.x, p.y); }
  function fieldX(ev) { var r = $("tu-canvas").getBoundingClientRect(); return (ev.clientX - r.left) / r.width; }
  (function wireTurretPointer() {
    var cv = $("tu-canvas"), drags = {}, compassDrag = null;
    function startDrag(el, ev) {
      if (!turretActive()) return;
      drags[ev.pointerId] = { x: ev.clientX, aim: sim.turret.x, width: $("tu-canvas").getBoundingClientRect().width };
      drags[ev.pointerId].lastX = ev.clientX;
      if (sim.turret.ring && el === cv) pointRing(ev);
      el.setPointerCapture(ev.pointerId); ev.preventDefault();
    }
    function moveDrag(ev) {
      var d = drags[ev.pointerId]; if (!d || !turretActive()) return;
      // Ring view: a finger moving right turns the gun clockwise, left counterclockwise.
      if (sim.turret.ring) {
        if (d.pad) { sim.turret.nudge((ev.clientX - d.lastX) / Math.max(100, d.width) * RING_DEG); d.lastX = ev.clientX; }
        else pointRing(ev);
        return;
      }
      sim.turret.aimAt(d.aim + (ev.clientX - d.x) / Math.max(100, d.width) * 1.1);
    }
    function endDrag(ev) { delete drags[ev.pointerId]; }
    // A tap or click on another battery's turret takes that gun.
    function turretAt(ev) {
      var r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height, tu = sim.turret;
      if (tu.bats.length < 2) return -1;
      if (tu.ring) {
        var wp = ringPoint(ev);
        for (var k = 0; k < tu.bats.length; k++) if (k !== tu.sel && Math.hypot(tu.bats[k].x - wp.x, tu.bats[k].y - wp.y) < 0.05) return k;
        return -1;
      }
      if (y < BL.GUNNERY.turretY - 0.08) return -1;
      for (var i = 0; i < tu.bats.length; i++) if (i !== tu.sel && Math.abs(tu.bats[i].x - x) < 0.05) return i;
      return -1;
    }
    cv.addEventListener("pointerdown", function (ev) {
      // At the helm: tap the compass to steer to the heading tapped, on autopilot; or drag it
      // like a dial: the tape centers on the course being set while the finger is down, and
      // sliding it brings the course you want under the center pointer.
      if (sim && sim.helm) {
        if (turretActive()) {
          var cr = cv.getBoundingClientRect(), hd = BL.compassAt(ev.clientX - cr.left, ev.clientY - cr.top), hm = sim.helm;
          if (hd !== null) {
            compassDrag = { id: ev.pointerId, x: ev.clientX, tap: Math.round(hd), base: hm.auto ? hm.autoHdg : Math.round(hm.compass()), moved: false };
            try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
          }
        }
        ev.preventDefault(); return;
      }
      if (turretActive() && settings.tapGuns) { var hitBat = turretAt(ev); if (hitBat >= 0) { selectBattery(hitBat); ev.preventDefault(); return; } }
      // Ring view: a click or tap on a ship or torpedo swings your gun to it (a held mouse
      // button fires once it's on).
      var tu = sim.turret;
      if (turretActive() && tu.ring && settings.clickAim !== false && (ev.pointerType !== "mouse" || ev.button === 0)) {
        var sp = ringPoint(ev);
        if (tu.seekAt(sp.x, sp.y)) {
          if (ev.pointerType === "mouse") { tu.trigger(true); setFireBtn(true); cv.setPointerCapture(ev.pointerId); }
          ev.preventDefault(); return;
        }
      }
      if (ev.pointerType === "mouse") {
        if (!turretActive() || ev.button !== 0) return;
        if (!sim.turret.ring) sim.turret.aimAt(fieldX(ev));
        sim.turret.trigger(true); setFireBtn(true);
        cv.setPointerCapture(ev.pointerId); ev.preventDefault();
      } else startDrag(cv, ev);
    });
    cv.addEventListener("pointermove", function (ev) {
      if (sim && sim.helm) {
        var cd = compassDrag, dx = cd ? ev.clientX - cd.x : 0;
        if (!cd || cd.id !== ev.pointerId || !turretActive() || (!cd.moved && Math.abs(dx) < 6)) return;
        cd.moved = true;
        var set = (Math.round(cd.base - dx / BL.compassScale()) % 360 + 360) % 360;   // tape moves with the finger
        sim.helm.dial = set; sim.helm.setAuto(true, set);
        return;
      }
      if (ev.pointerType === "mouse") {
        if (!turretActive()) return;
        if (sim.turret.ring) pointRing(ev); else sim.turret.aimAt(fieldX(ev));
      }
      else moveDrag(ev);
    });
    function mouseUp(ev) {
      if (compassDrag && compassDrag.id === ev.pointerId) {
        if (!compassDrag.moved && sim && sim.helm && turretActive()) sim.helm.setAuto(true, compassDrag.tap);
        if (sim && sim.helm) sim.helm.dial = null;
        compassDrag = null;
      }
      if (ev.pointerType === "mouse") { if (sim && sim.turret && !keysHeld.fire) { sim.turret.trigger(false); setFireBtn(false); } } else endDrag(ev);
    }
    cv.addEventListener("pointerup", mouseUp); cv.addEventListener("pointercancel", mouseUp);
    cv.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    var pad = $("tu-aimpad");
    pad.addEventListener("pointerdown", function (ev) { startDrag(pad, ev); if (drags[ev.pointerId]) { drags[ev.pointerId].pad = true; pad.classList.add("on"); } });
    pad.addEventListener("pointermove", moveDrag);
    function padEnd(ev) { endDrag(ev); pad.classList.remove("on"); }
    pad.addEventListener("pointerup", padEnd); pad.addEventListener("pointercancel", padEnd);
    function fireEnd() { if (sim && sim.turret && !keysHeld.fire) { sim.turret.trigger(false); setFireBtn(false); } }
    [$("btn-tu-fire"), $("hud-fire")].forEach(function (fire) {
      fire.addEventListener("pointerdown", function (ev) {
        if (!turretActive()) return;
        sim.turret.trigger(true); setFireBtn(true); fire.setPointerCapture(ev.pointerId); ev.preventDefault();
      });
      fire.addEventListener("pointerup", fireEnd); fire.addEventListener("pointercancel", fireEnd);
      fire.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    });
    $("btn-tu-call").addEventListener("click", function () { if (turretActive()) sim.turret.callPower(); });
    $("hud-call").addEventListener("click", function () { if (turretActive()) sim.turret.callPower(); this.blur(); });
    $("hud-main").addEventListener("click", function () { if (turretActive() && sim.turret.firesMain) sim.turret.fireMain(); this.blur(); });
    [1, 2].forEach(function (i) { $("hud-pt-" + i).addEventListener("click", function () { if (turretActive()) sim.turret.launchPT(i - 1); this.blur(); }); });
    $("hud-guns").addEventListener("click", function (ev) { var b = ev.target.closest("button[data-i]"); if (b && turretActive()) selectBattery(+b.dataset.i); b && b.blur(); });
    $("btn-tu-view").addEventListener("click", function () { toggleWide(); this.blur(); });
    [1, 2].forEach(function (i) { $("btn-pt-" + i).addEventListener("click", function () { if (turretActive()) sim.turret.launchPT(i - 1); }); });
    $("btn-tu-main").addEventListener("click", function () { if (turretActive() && sim.turret.firesMain) sim.turret.fireMain(); this.blur(); });
    $("btn-tu-pause").onclick = pause;
    $("btn-tu-options").onclick = openOptions;
  })();

  /* ------------------------------------------------------------- The helm
     The pilot station: the ring view with the compass and bearing marks (ringview.js), the HELM
     panel (orders, engine telegraph, thrust, reactor, turn, hull stress, autopilot, warn
     engineering), the wheel over the view, and LAUNCH while a gunboat waits in the tube. */
  function buildHelm() {
    var rows = BL.HELM.orders.slice().reverse(), h = sim.helm;
    $("hm-tele").innerHTML = '<span class="h">PORT</span><span class="h">BOTH</span><span class="h">STBD</span>' + rows.map(function (o) {
      var cls = o.f < 0 ? " astern" : "";
      return '<button class="side' + cls + '" data-side="port" data-ord="' + o.id + '" title="Port engine: ' + o.name.toLowerCase() + '">' + h.gOf(o.id) + '</button>' +
        '<button class="mid' + cls + '" data-side="both" data-ord="' + o.id + '" title="Both engines: ' + o.name.toLowerCase() + '">' + o.name + "</button>" +
        '<button class="side' + cls + '" data-side="stbd" data-ord="' + o.id + '" title="Starboard engine: ' + o.name.toLowerCase() + '">' + h.gOf(o.id) + "</button>";
    }).join("");
  }
  function renderHelm(ts) {
    var tu = sim.turret, h = sim.helm, ship = sim.ship, enc = sim.encounter() || {};
    tu.effects.forEach(function (f) {
      if (f.type === "hullHit" && f.at > lastJolt) {
        lastJolt = f.at; var el = $("scr-turret");
        el.classList.remove("jolt"); void el.offsetWidth; el.classList.add("jolt");
        if (navigator.vibrate) try { navigator.vibrate([60, 40, 90]); } catch (e) {}
      }
    });
    sizeTurret();
    BL.drawRing(tuCtx, { w: tuW, h: tuH, wide: false }, sim, tu, ts);
    $("tu-jump").innerHTML = (sim.hasDrive ? "Jump" : "Sortie") + " <b>" + (sim.jumpIndex + 1) + "</b> of " + sim.cfg.jumps + " · <b>" + (enc.name || "") + "</b>";
    setText($("tu-phase"), h.inTube ? "IN THE TUBE: LAUNCH WHEN READY" : sim.phase === "arrival" ? "Engagement in " + Math.ceil(sim.cfg.arrivalSeconds - sim.t) + " s" :
      sim.phase === "countdown" ? "JUMPING IN " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) : sim.phase === "engage" ? "T+" + mmss(sim.t) : "");
    renderComms();
    // The captain's order
    var o = h.orderView(), ob = $("hm-order"), oh;
    if (o) {
      var ok = h.onOrder({ hdg: o.hdg, eng: o.eng });
      oh = (o.active ? "<b>NOW</b> " : "<b>In " + Math.ceil(o.in) + " s</b> ") + "come " + (o.turn > 0 ? "right" : "left") + " to <b>" + BL.hdgText(o.hdg) + "</b>, all ahead " +
        BL.HELM.orders.filter(function (x) { return x.id === o.eng; })[0].name.toLowerCase() + (o.active ? " · hold " + Math.ceil(o.left) + " s" : "") +
        '<div class="muted">' + (ok ? "✔ On the order." : "Tap to fly the heading on autopilot.") + "</div>";
      setCls(ob, "hm-order" + (o.active ? " active" : "") + (ok ? " ok" : ""));
    } else {
      oh = h.inTube ? "In the carrier's launch tube. Launch when ready (Space)." : "Free helm: no orders. Fight the " + (sim.hasDrive ? "ship." : "boat.");
      setCls(ob, "hm-order");
    }
    setHtml(ob, oh);
    // Alerts: the captain's break order (or "take it"), a gunner's call, the jump heading (tap
    // a call or the jump heading to fly it on autopilot)
    var al = [], D = BL.HELM.dodge, ev = h.evadeView(), inbound = tu.torps.filter(function (tp) { return tp.ev && tp.ev.type === "salvo" && !tp.ev.done && !tp.mine; });
    if (ev && ev.left > 0) al.push('<div class="torp">⚠ BREAK ' + (ev.dir > 0 ? "RIGHT" : "LEFT") + " NOW: " + ev.left.toFixed(1) + " s · " + Math.round(ev.off) + "° of " + D.turn + "°</div>");
    else if (inbound.length) al.push('<div class="hold">' + inbound.length + (inbound.length === 1 ? " torpedo" : " torpedoes") + " inbound. " + h.who + ": hold your course, the shields take " + (inbound.length === 1 ? "it" : "them") + ". (Dodging anyway is disobeying.)</div>");
    if (h.req) al.push('<div class="req" data-hdg="' + h.req.hdg + '">Gun ' + h.req.gun + ": come " + (h.req.turn > 0 ? "right" : "left") + " to <b>" + BL.hdgText(h.req.hdg) + "</b> · " + Math.max(0, Math.ceil(h.req.until - sim.t)) + " s</div>");
    var jv = h.jumpView();
    if (jv) al.push('<div class="jump' + (jv.on ? "" : jv.in < 30 ? " off" : "") + '" data-hdg="' + jv.hdg + '">Jump heading <b>' + BL.hdgText(jv.hdg) + "</b> · " + (jv.in > 0 ? "window in " + Math.ceil(jv.in) + " s" : "window open") + (jv.on ? " ✔" : "") + "</div>");
    setHtml($("hm-alerts"), al.join(""));
    // Telegraph and thrust
    Array.prototype.forEach.call($("hm-tele").querySelectorAll("button"), function (b) {
      var id = b.dataset.ord, side = b.dataset.side;
      b.classList.toggle("on", side === "both" ? h.port.ord === id && h.stbd.ord === id : h[side].ord === id);
      if (side !== "both") setText(b, String(h.gOf(id)));
    });
    setText($("hm-tele-txt"), h.telegraph());
    setText($("hm-gval"), "ordered " + fmtG(h.port.g) + " / " + fmtG(h.stbd.g) + " G");
    setText($("hm-thrust"), fmtG(ship.g) + " G · " + Math.round(ship.engineMW) + " MW" + (ship.starved ? " · STARVED" : ""));
    $("hm-thrust-fill").style.width = pct(ship.g / (h.full() * 1.1));
    setText($("hm-rx"), "load " + Math.round(ship.loadPct) + "% · heat " + Math.round(ship.heat));
    $("hm-heat").style.width = pct(ship.heat / 100);
    // Turn: the safe band, what the rudder asks for, what the ship is doing
    var top = Math.max(1, h.topTurn() * 1.6), half = function (v) { var w = Math.min(50, Math.abs(v) / top * 50); return v >= 0 ? [50, w] : [50 - w, w]; };
    var sf = Math.min(50, h.C.safe / top * 50), wq = half(h.want), nq = half(h.omega);
    $("hm-turn-safe").style.left = (50 - sf) + "%"; $("hm-turn-safe").style.width = (2 * sf) + "%";
    $("hm-turn-want").style.left = wq[0] + "%"; $("hm-turn-want").style.width = wq[1] + "%";
    $("hm-turn-now").style.left = nq[0] + "%"; $("hm-turn-now").style.width = nq[1] + "%";
    $("hm-turn-now").classList.toggle("over", Math.abs(h.omega) > h.C.safe);
    setText($("hm-turn"), Math.round(Math.abs(h.omega)) + "°/s " + (h.omega > 0.5 ? "stbd" : h.omega < -0.5 ? "port" : "") + " · safe " + h.C.safe);
    setText($("hm-stress-val"), Math.round(h.stress * 100) + "%");
    $("hm-stress").style.width = pct(h.stress);
    $("hm-stress").classList.toggle("high", h.stress >= BL.HELM.stress.warnAt);
    var ab = $("hm-auto");
    ab.classList.toggle("on", h.auto);
    ab.firstChild.nodeValue = h.auto ? "AUTOPILOT ON " + BL.hdgText(h.autoHdg) + " " : "AUTOPILOT ";
    $("hm-warn").disabled = sim.totalT < h.warnReadyAt || !turretActive();
    // The wheel
    $("hm-wheel-g").setAttribute("transform", "rotate(" + (h.wheel * 225).toFixed(1) + ")");
    setText($("hm-wheel-txt"), Math.abs(h.wheel) < 0.005 ? "AMIDSHIPS" : "RUDDER " + Math.round(Math.abs(h.wheel) * 100) + "% " + (h.wheel > 0 ? "STBD" : "PORT"));
    var lb = $("hm-launch"); lb.hidden = !h.inTube; lb.classList.toggle("ready", h.inTube);
    // Ship
    setText($("tu-hull-val"), Math.max(0, Math.round(ship.hull)) + " / " + ship.hullMax);
    $("tu-hull").style.width = pct(ship.hull / ship.hullMax);
    $("tu-hull").classList.toggle("low", ship.hull < ship.hullMax * 0.35);
    var sh = sim.sys("shield");
    setText($("tu-shield-val"), Math.round(sh.mj) + " / " + sh.maxMJ + " MJ");
    $("tu-shield").style.width = pct(sh.mj / sh.maxMJ);
    var wi = sim.windowIn(), drive = sim.sys("drive");
    if (drive) { setText($("tu-rec-val"), (wi > 0 ? "window in " + Math.ceil(wi) + " s · " : "window open · ") + "drive " + Math.floor(drive.mj / drive.maxMJ * 100) + "%"); $("tu-rec").style.width = pct(drive.mj / drive.maxMJ); }
    else { setText($("tu-rec-val"), Math.max(0, Math.ceil(wi)) + " s"); $("tu-rec").style.width = pct(sim.t / sim.windowAt()); }
    var dl = sim.stats.damageReports;
    if (dl.length !== lastTuDamage) {
      lastTuDamage = dl.length;
      $("tu-damage").innerHTML = dl.length ? dl.slice(-4).reverse().map(function (d) { return "<li>" + esc(d.what) + "</li>"; }).join("") : '<li class="muted">None</li>';
    }
    var g = tu.cur || {}, c = h.cur || {};
    setHtml($("tu-tally"), "<span>Orders met</span><b>" + (c.ordersMet || 0) + " / " + (c.orders || 0) + "</b>" +
      (c.requests ? "<span>Gunners' calls answered</span><b>" + c.requestsMet + " / " + c.requests + "</b>" : "") +
      "<span>Breaks made</span><b>" + (c.evasiveMet || 0) + " / " + (c.evasive || 0) + "</b>" +
      (c.disobeyed ? '<span class="bad">Disobeyed the ' + h.who.toLowerCase() + "</span><b>" + c.disobeyed + "</b>" : "") +
      "<span>Torpedoes dodged</span><b>" + (c.dodged || 0) + " / " + (c.torps || 0) + "</b>" +
      "<span>Ships destroyed</span><b>" + (g.kills || 0) + " / " + (g.ships || 0) + "</b><span>Torpedoes shot down</span><b>" + (g.downed || 0) + " / " + (g.torps || 0) + "</b>" +
      (tu.pt.length ? "<span>Our torpedoes</span><b>" + (g.ptHits || 0) + " hit / " + (g.ptFired || 0) + "</b>" : "") +
      (c.stressHits ? '<span class="bad">Structural hits</span><b>' + c.stressHits + "</b>" : "") + (ship.crippled ? '<span class="bad">✖ Crew crippled</span><b></b>' : ""));
  }
  function fmtG(v) { var r = Math.round(v * 10) / 10; return r % 1 ? r.toFixed(1) : String(r); }
  // Keys at the helm: ← → wheel, 0 midships, ↑ ↓ both engines, Q A port, P L starboard,
  // + − one G, T autopilot, E warn engineering, Space launch, Esc pause.
  function helmKey(ev) {
    if (!$("ov-grav").hidden) { if (ev.key === "Enter") $("btn-grav-go").click(); return; }
    var k = ev.key, kl = k.length === 1 ? k.toLowerCase() : k, h = sim.helm;
    if (k === "Escape") { ev.preventDefault(); if (paused) resume(); else pause(); return; }
    if (paused) { if (k === " ") { ev.preventDefault(); resume(); } return; }
    if (!turretActive()) return;
    if (k === "ArrowLeft") h.nudgeWheel(-0.1);
    else if (k === "ArrowRight") h.nudgeWheel(0.1);
    else if (k === "0") h.midships();
    else if (k === "ArrowUp") h.stepOrder("both", 1);
    else if (k === "ArrowDown") h.stepOrder("both", -1);
    else if (kl === "q") h.stepOrder("port", 1);
    else if (kl === "a") h.stepOrder("port", -1);
    else if (kl === "p") h.stepOrder("stbd", 1);
    else if (kl === "l") h.stepOrder("stbd", -1);
    else if (k === "+" || k === "=") h.nudgeG(1);
    else if (k === "-" || k === "_") h.nudgeG(-1);
    else if (kl === "t" && !ev.repeat) h.setAuto(!h.auto);
    else if (kl === "e" && !ev.repeat) h.warn();
    else if (k === " ") { if (!ev.repeat) h.launch(); }
    else if (kl === "h") { toggleHints(); }
    else return;
    ev.preventDefault();
  }
  (function wireHelm() {
    var wh = $("hm-wheel"), drag = null;
    wh.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest("button") || !sim || !sim.helm || !turretActive()) return;
      drag = { x: ev.clientX, w: sim.helm.wheel }; wh.setPointerCapture(ev.pointerId); wh.classList.add("drag"); ev.preventDefault();
    });
    wh.addEventListener("pointermove", function (ev) { if (drag && turretActive()) sim.helm.setWheel(drag.w + (ev.clientX - drag.x) / 160); });
    function end() { drag = null; wh.classList.remove("drag"); }
    wh.addEventListener("pointerup", end); wh.addEventListener("pointercancel", end);
    $("hm-mid").addEventListener("click", function () { if (turretActive()) sim.helm.midships(); this.blur(); });
    $("hm-tele").addEventListener("click", function (ev) { var b = ev.target.closest("button[data-ord]"); if (b && turretActive()) sim.helm.setOrder(b.dataset.side, b.dataset.ord); if (b) b.blur(); });
    $("hm-gup").addEventListener("click", function () { if (turretActive()) sim.helm.nudgeG(1); this.blur(); });
    $("hm-gdown").addEventListener("click", function () { if (turretActive()) sim.helm.nudgeG(-1); this.blur(); });
    $("hm-auto").addEventListener("click", function () { if (turretActive()) sim.helm.setAuto(!sim.helm.auto); this.blur(); });
    $("hm-warn").addEventListener("click", function () { if (turretActive()) sim.helm.warn(); this.blur(); });
    $("hm-launch").addEventListener("click", function () { if (turretActive()) sim.helm.launch(); this.blur(); });
    $("hm-order").addEventListener("click", function () { var o = turretActive() && sim.helm.orderView(); if (o) sim.helm.setAuto(true, o.hdg); });
    $("hm-alerts").addEventListener("click", function (ev) { var d = ev.target.closest("[data-hdg]"); if (d && turretActive()) sim.helm.setAuto(true, +d.dataset.hdg); });
  })();
  function gravHelm(js, dmg, next) {
    var c = sim.helm.jumps[sim.jumpIndex - 1] || {}, g = sim.turret.jumps[sim.jumpIndex - 1] || {};
    return "<p>Fighting has stopped. " + (sim.hasDrive ? "The ship is in GravSpace." : "The carrier has you on deck and is carrying you through GravSpace.") + "</p><ul class='grav-list'>" +
      "<li>Orders met: " + c.ordersMet + " of " + c.orders + "</li>" +
      (c.requests ? "<li>Gunners' calls answered: " + c.requestsMet + " of " + c.requests + "</li>" : "") +
      (c.evasive ? "<li>Breaks the " + sim.helm.who.toLowerCase() + " ordered: " + c.evasiveMet + " made of " + c.evasive + "</li>" : "") +
      (c.disobeyed ? "<li>Dodged when told to hold course: " + c.disobeyed + " (each costs " + Math.round(BL.HELM.evade.disobeyCost * 100) + "% of the mission's score)</li>" : "") +
      "<li>Torpedoes dodged: " + (c.dodged || 0) + " of " + (c.torps || 0) + "</li>" +
      (sim.hasDrive ? "" : "<li>Launch: " + (c.launchWait ? c.launchWait + " s after the call" : "right away") + "</li>") +
      (c.stressHits ? "<li>Structural hits from hard turns: " + c.stressHits + "</li>" : "") +
      "<li>Enemy ships destroyed by your crew: " + g.kills + " of " + g.ships + "</li>" +
      "<li>Torpedoes shot down: " + g.downed + " of " + g.torps + "</li>" +
      (g.ptFired ? "<li>Our torpedoes: " + g.ptHits + " hits of " + g.ptFired + " launched. Both tubes are reloaded.</li>" : "") +
      "<li>Torpedoes stopped by shields: " + js.shielded + " of " + js.salvos + "</li>" +
      "<li>Hull damage taken: " + js.hullLost + "</li>" +
      (dmg.length ? "<li>Damage: " + dmg.map(function (d) { return d.what; }).join("; ") + "</li>" : "") +
      (sim.lastRepairs && sim.lastRepairs.length ? "<li>Damage control repaired half of it: " + sim.lastRepairs.join("; ") + "</li>" : "") +
      "</ul><h2>Next: " + next.name + "</h2><p>" + gunnerTip(sim.route[sim.jumpIndex]) + (sim.hasDrive ? "" : " You'll be back in the launch tube.") + "</p>" +
      "<p class='muted'>Take a breath; the clock is stopped.</p>";
  }
  function debriefHelm(r) {
    var hm = r.helm, d = r.detail;
    $("db-jumps").innerHTML = "<tr><th>" + (r.hasDrive ? "Jump" : "Sortie") + "</th><th>Encounter</th><th>Orders met</th><th>Dodged</th><th>Structural hits</th>" + (r.hasDrive ? "<th>On time</th>" : "<th>Launch wait</th>") + "<th>Shielded</th><th>Hull lost</th><th>Seconds</th></tr>" +
      r.jumps.map(function (j, i) {
        var t = hm.jumps[i] || {};
        return "<tr><td>" + (i + 1) + "</td><td>" + BL.ENCOUNTERS[j.encounter].name + "</td><td>" + t.ordersMet + " / " + t.orders + "</td><td>" + (t.dodged || 0) + " / " + (t.torps || 0) + "</td><td>" + t.stressHits + "</td>" +
          (r.hasDrive ? "<td>" + (j.onTime ? "yes" : "no") + "</td>" : "<td>" + (t.launchWait || 0) + " s</td>") + "<td>" + j.shielded + " / " + j.salvos + "</td><td>" + j.hullLost + "</td><td>" + j.seconds + "</td></tr>";
      }).join("");
    var rows = [
      ["Engineer", esc(r.engineer.name) + ", " + r.engineer.label + " (skill " + Math.round(r.engineer.skill * 100) + ")"],
      ["Gun crew", r.crew.map(function (c) { return esc(c.name) + ", " + c.label + " (" + Math.round(c.skill * 100) + ")"; }).join(" · ")],
      ["Orders met", hm.ordersMet + " / " + hm.orders]].concat(hm.requests ? [["Gunners' calls answered", hm.requestsMet + " / " + hm.requests]] : [], [
      ["Breaks ordered and made", hm.evasiveMet + " / " + hm.evasive],
      ["Disobeyed (dodged when told to hold course)", hm.disobeyed ? hm.disobeyed + " (−" + Math.round(BL.HELM.evade.disobeyCost * 100) + "% of the score each)" : "never"],
      ["Torpedoes dodged", hm.dodged + " / " + hm.torpsAtUs],
      ["Steering", hm.autoPct ? hm.autoPct + "% on autopilot (earns " + Math.round(BL.HELM.autopilotRep * 100) + "% for that time)" : "all by hand"],
      ["Structural hits from hard turns", hm.stressHits],
      ["Thrusters burned out at flank", hm.flankHits],
      ["Enemy ships destroyed by your crew", hm.kills + " / " + hm.ships],
      ["Torpedoes shot down", hm.downed + " / " + hm.torps],
      ["Hull lost", d.hullLost],
      ["Failsafe trips (the engineer's reactor)", d.trips],
      ["Damage reports", r.damage.length]
    ]);
    if (r.classId === "gunboat") rows.push(["Our torpedoes", hm.ptFired ? hm.ptHits + " hits of " + hm.ptFired + " launched" : "none launched"]);
    $("db-detail").innerHTML = rows.map(function (x) { return "<div><span>" + x[0] + ":</span> " + x[1] + "</div>"; }).join("");
    $("db-career").hidden = !report;
    if (report) renderCareerReport(r);
    $("btn-db-hub").hidden = !!job.test;
    $("btn-db-again").hidden = $("btn-db-new").hidden = $("btn-db-title").hidden = !job.test;
  }
  function wentWellHelm(r) {
    var hm = r.helm, notes = [];
    if (r.outcome === "success") notes.push(r.hasDrive ? "The planet buster got through." : "The gunboat made it back aboard.");
    if (hm.orders && hm.ordersMet === hm.orders) notes.push("Every order met.");
    else if (hm.orders && hm.ordersMet / hm.orders >= 0.75) notes.push(hm.ordersMet + " of " + hm.orders + " orders met.");
    if (!hm.stressHits && !hm.flankHits) notes.push("No structural damage from your flying.");
    if (!hm.autoPct) notes.push("You flew it all by hand.");
    if (!notes.length) notes.push("You kept the ship in the fight.");
    return notes.join(" ");
  }
  function worstHelm(r) {
    var hm = r.helm;
    if (hm.disobeyed) return "You dodged " + hm.disobeyed + (hm.disobeyed === 1 ? " time" : " times") + " when the " + (r.hasDrive ? "captain" : "coxswain") + " said to hold course. Each one went in the report: −" + Math.round(BL.HELM.evade.disobeyCost * 100) + "% of the score.";
    if (hm.stressHits >= 2) return hm.stressHits + " structural hits from turning past the safe rate. Ease off before the stress bar fills.";
    if (hm.orders && hm.ordersMet / hm.orders < 0.6) return "Only " + hm.ordersMet + " of " + hm.orders + " orders met. Start the turn early (watch the white stop tick) and set the engine order too.";
    if (hm.flankHits) return "Flank held too long burned out a thruster.";
    var late = Math.max.apply(null, hm.launches.concat([0]));
    if (late >= 5) return "A launch came " + late + " s after the call; that's fight time lost.";
    return "Nothing stands out. Clean run.";
  }

  /* ----------------------------------------------------------- GravSpace */
  function showGrav() {
    var js = sim.stats.jumps[sim.stats.jumps.length - 1], next = sim.encounter();
    var dmg = sim.stats.damageReports.filter(function (d) { return d.jump === sim.jumpIndex; });
    $("grav-title").textContent = sim.hasDrive ? "In GravSpace: jump " + sim.jumpIndex + " of " + sim.cfg.jumps + " complete"
      : "Aboard the carrier: sortie " + sim.jumpIndex + " of " + sim.cfg.jumps + " complete";
    if (sim.turret) { $("grav-body").innerHTML = sim.helm ? gravHelm(js, dmg, next) : gravGunner(js, dmg, next); $("btn-grav-go").textContent = sim.hasDrive ? "Drop out of GravSpace" : "Launch"; overlay("ov-grav", true); return; }
    $("grav-body").innerHTML =
      "<p>Fighting has stopped." + (sim.hasDrive ? "" : " The carrier has you on deck and is carrying you through GravSpace.") + (sim.hasAux() ? " The aux bank is refilled." : "") + "</p>" +
      "<ul class='grav-list'>" +
      "<li>Salvos stopped by shields: " + js.shielded + " of " + js.salvos + "</li>" +
      "<li>Hull damage taken: " + js.hullLost + "</li>" +
      "<li>Failsafe trips: " + js.trips + "</li>" +
      "<li>Enemies destroyed: " + js.kills + "</li>" +
      (sim.hasDrive ? "<li>Jump " + (js.onTime ? "on time" : "late: the drive wasn't full when the window opened") + "</li>" : "") +
      (dmg.length ? "<li>Damage: " + dmg.map(function (d) { return d.what; }).join("; ") + "</li>" : "") +
      (sim.lastRepairs && sim.lastRepairs.length ? "<li>Damage control repaired half of it: " + sim.lastRepairs.join("; ") + "</li>" : "") +
      "</ul>" +
      "<h2>Next: " + next.name + "</h2><p>" + next.what + ". Tests: " + next.tests.toLowerCase() + (sim.hasDrive ? ". The drive will be empty again on arrival." : ". The carrier launches you again on arrival.") + "</p>" +
      "<p class='muted'>Take a breath; the clock is stopped. You can adjust the priority order once you're back on the console.</p>";
    $("btn-grav-go").textContent = sim.hasDrive ? "Drop out of GravSpace" : "Launch";
    overlay("ov-grav", true);
  }
  function gravGunner(js, dmg, next) {
    var g = sim.turret.jumps[sim.jumpIndex - 1] || {};
    return "<p>Fighting has stopped. " + (sim.hasDrive ? "The ship is in GravSpace." : "The carrier has you on deck and is carrying you through GravSpace.") + "</p><ul class='grav-list'>" +
      "<li>Enemy ships destroyed: " + g.kills + " of " + g.ships + "</li>" +
      "<li>Torpedoes shot down: " + g.downed + " of " + g.torps + "</li>" +
      (g.mines ? "<li>Mines shot down: " + g.minesDowned + " of " + g.mines + "</li>" : "") +
      (g.mainShots ? "<li>Main gun: " + g.mainHits + " hits of " + g.mainShots + " shots</li>" : "") +
      (g.strikes ? "<li>Drive strikes: " + g.strikes + "; the CIWS stopped " + g.strikesCiws + ", guns shot down " + g.strikesShot + ", " + g.strikesHit + " hit the drive</li>" : "") +
      (g.ptFired ? "<li>Our torpedoes: " + g.ptHits + " hits of " + g.ptFired + " launched. Both tubes are reloaded.</li>" : "") +
      "<li>Hits: " + g.hits + " of " + g.shots + " shots" + (g.shots ? " (" + Math.round(100 * g.hits / g.shots) + "%)" : "") + "</li>" +
      "<li>Torpedoes stopped by shields: " + js.shielded + " of " + js.salvos + "</li>" +
      "<li>Hull damage taken: " + js.hullLost + "</li>" +
      (dmg.length ? "<li>Damage: " + dmg.map(function (d) { return d.what; }).join("; ") + "</li>" : "") +
      (sim.lastRepairs && sim.lastRepairs.length ? "<li>Damage control repaired half of it: " + sim.lastRepairs.join("; ") + "</li>" : "") +
      "</ul><h2>Next: " + next.name + "</h2><p>" + gunnerTip(sim.route[sim.jumpIndex]) + (sim.hasDrive ? "" : " The carrier launches you again on arrival.") + "</p>" +
      "<p class='muted'>Take a breath; the clock is stopped.</p>";
  }
  var ENGINEER_NOTE = {
    sharp: "Keeps the shields full and answers a call for power fast.",
    steady: "Reliable, now and then a beat slow.",
    green: "New to the job: the shields may be short when a torpedo lands, and your calls take a moment.",
    sloppy: "Expect torpedoes to get through. Shoot them down yourself."
  };
  /* Standing orders, one letter per gun: P point defense, L stop launches, H hunt, F free fire.
     Take a gun, then press O (or tap its letter) to cycle its order; when you switch away, the
     AI gunner works it under that order. Until you pick, it follows the suggestion for each
     fight (the letter shows green). */
  function cycleOrder(i) {
    var tu = sim.turret, b = tu.bats[i], list = BL.GUNNERY.orderList;
    var cur = tu.orderFor(b).order, next = list[(list.indexOf(cur) + 1) % list.length];
    tu.setOrder(b, next);
    settings.gunOrders = settings.gunOrders || {}; settings.gunOrders[b.gunNo] = b.order; saveSettings();
  }
  function an(x) { return (/^[aeiou]/.test(x) ? "an " : "a ") + x; }
  // What the gunner should expect from an encounter, and which of their guns has the edge.
  // brief = leave out what the enemy is like (already said).
  function gunnerTip(encId, brief) {
    var look = BL.GUNNERY.looks[encId] || {}, bats = sim.turret.bats;
    if (encId === "minefield") return brief ? "Shoot the mines." : "Mines drift in toward the ship: shoot them before they reach the shield. One hit from any gun kills a mine.";
    var good = bats.filter(function (b) { return b.w.best.indexOf(encId) >= 0; }).map(function (b) { return b.w.name.toLowerCase(); })
      .filter(function (n, i, a) { return a.indexOf(n) === i; });
    var gun = bats.length === 1 ? "Your " + bats[0].w.name.toLowerCase() : "None of your guns";
    return (look.ship && !brief ? "Expect " + (look.only ? "the " + look.ship : BL.plural(look.ship)) + ": " + look.what + ". " : "") +
      (good.length ? "Your " + good.join(" and ") + " does extra damage to them." : gun + (bats.length === 1 ? " gets" : " get") + " no bonus against them.");
  }
  $("btn-grav-go").onclick = function () { click(); overlay("ov-grav", false); BL.speech.unlock(); sim.beginJump(); speakNew(); };

  /* ---------------------------------------------------------- Debriefing */
  function showDebrief() {
    var r = sim.result, d = r.detail;
    show("scr-debrief");
    $("db-title").textContent = r.outcome === "success" ? (r.hasDrive ? "Mission complete: planet buster delivered" : "Sortie complete: recovered by the carrier") :
      r.outcome === "destroyed" ? "Ship destroyed" : "Abandoned ship";
    $("db-lede").textContent = (job.test ? "" : BL.shipLabel(job.classId, job.ship) + ", " + r.className + ", tech level " + r.tl + " · ") + "Seed " + r.seed + " · " +
      r.jumpsDone + " of " + sim.cfg.jumps + (r.hasDrive ? " jumps · " : " sorties · ") + d.minutes + " minutes · hull " + r.hull + " / " + r.hullMax +
      (r.looks ? " · looked at the paused console " + r.looks + (r.looks === 1 ? " time" : " times") + " (−" + (100 - Math.round(100 * r.score / Math.max(1, r.raw))) + "%)" : "");
    $("db-score").textContent = r.score;
    $("db-jumps-title").textContent = r.hasDrive ? "Jump by jump" : "Sortie by sortie";
    var names = r.station === "pilot" ? { objective: "Objective", condition: "Ship condition", orders: "Orders met", handling: "Ship handling" }
      : r.station === "gunner" ? { objective: "Objective", condition: "Ship condition", accuracy: "Accuracy", threats: "Threats stopped" }
      : { objective: "Objective", condition: "Ship condition", efficiency: "Efficiency", demands: "Demands met" };
    $("db-parts").innerHTML = Object.keys(names).map(function (k) {
      return '<div class="part"><span>' + names[k] + '</span><div class="hbar"><div class="hbar-fill" style="width:' + (r.parts[k] * 4) + '%"></div></div><b>' + r.parts[k] + " / 25</b></div>";
    }).join("");
    $("db-good").textContent = r.station === "pilot" ? wentWellHelm(r) : r.station === "gunner" ? wentWellGunner(r) : wentWell(r);
    $("db-worst").textContent = r.station === "pilot" ? worstHelm(r) : r.station === "gunner" ? worstGunner(r) : worstMoment(r);
    if (r.station === "pilot") { debriefHelm(r); return; }
    if (r.station === "gunner") { debriefGunner(r); return; }
    $("db-jumps").innerHTML = "<tr><th>" + (r.hasDrive ? "Jump" : "Sortie") + "</th><th>Encounter</th><th>Salvos shielded</th><th>Hull lost</th><th>Trips</th><th>Kills</th><th>On time</th><th>Seconds</th></tr>" +
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
    ].concat(d.mainShots ? [["Main-gun shots", d.mainShots + " (" + d.mainDamage + " damage)"]] : [],
      [["Charge lost to bleed", d.bleedMJ + " MJ"]],
      d.launchCalls ? [["Squadron launches on time", d.launchFilled + " / " + d.launchCalls], ["Recoveries on time", d.recoverFilled + " / " + d.recoverCalls],
        ["Salvos the squadron shot down", d.intercepts]].concat(d.squadronsLost ? [["Squadron left behind", "yes"]] : []) : [],
      d.burns ? [["Minefield burns fully powered", d.burnsMet + " / " + d.burns], ["Mine strikes", d.mineStrikes]] : [],
      d.strikes ? [["Drive strikes stopped", d.strikesStopped + " / " + d.strikes], ["Drive charge lost to strikes", d.driveDrainedMJ + " MJ"]] : []);
    $("db-detail").innerHTML = rows.map(function (x) { return "<div><span>" + x[0] + ":</span> " + x[1] + "</div>"; }).join("");
    $("db-career").hidden = !report;
    if (report) renderCareerReport(r);
    $("btn-db-hub").hidden = !!job.test;
    $("btn-db-again").hidden = $("btn-db-new").hidden = $("btn-db-title").hidden = !job.test;
  }

  function renderCareerReport(r) {
    var st = career.stations[job.station], rows = [];
    if (r.outcome === "success") {
      rows.push('<p class="big-line">Reputation earned: <b>+' + report.rep + "</b> (" + BL.career.STATION_NAME[job.station].toLowerCase() + " path, now " + st.rep + ")</p>");
      rows.push('<p class="muted">' + BL.classByN(job.n).baseRep + " base for a " + r.className.toLowerCase() + " × score " + r.score + "% × " + BL.TECH.repMult(job.tl).toFixed(1) + " for tech level " + job.tl +
        (job.serious === false ? " × " + BL.career.REQUAL_REP + " requalifying" : "") + "</p>");
    } else rows.push('<p class="big-line">No reputation and no promotion for a failed mission.</p>');
    if (report.promoted) rows.push('<p class="big-line promo">Qualified: ' + BL.career.rank(career, job.station) + " (" + r.className + ")</p>");
    if (report.failuresAtPost === 1) rows.push('<p class="big-line">Failure 1 of 2 at this post. A second failure here sends you back a class.</p>');
    if (report.sentBack) rows.push('<p class="big-line demo">Second failure at this post: sent back to ' + (report.qualifiedAfter ? BL.career.rank(career, job.station) : "the gunboat, unqualified") +
      ". Requalify with a real mission.</p>");
    rows.push("<h2>" + BL.career.STATION_NAME[job.station] + " reputation profile</h2>" + profileHtml(report.profileAfter, report.profileBefore, job.station));
    $("db-career").innerHTML = "<h2>Career: " + esc(career.name) + "</h2>" + rows.join("");
  }
  $("btn-db-hub").onclick = function () { click(); showHub(); };

  function debriefGunner(r) {
    var g = r.gunner, d = r.detail;
    $("db-jumps").innerHTML = "<tr><th>Sortie</th><th>Encounter</th><th>Ships destroyed</th><th>Torpedoes shot down</th><th>Hits</th><th>Shielded</th><th>Hull lost</th><th>Seconds</th></tr>" +
      r.jumps.map(function (j, i) {
        var t = g.jumps[i] || {};
        return "<tr><td>" + (i + 1) + "</td><td>" + BL.ENCOUNTERS[j.encounter].name + "</td><td>" + t.kills + " / " + t.ships + "</td><td>" + t.downed + " / " + t.torps +
          "</td><td>" + t.hits + " / " + t.shots + "</td><td>" + j.shielded + " / " + j.salvos + "</td><td>" + j.hullLost + "</td><td>" + j.seconds + "</td></tr>";
      }).join("");
    var rows = [
      [(r.weapons || [r.weapon]).length > 1 ? "Guns" : "Gun", (r.weapons || [r.weapon]).map(function (id) { return BL.WEAPONS[id].name; }).join(" and ")],
      ["Engineer", esc(r.engineer.name) + ", " + r.engineer.label + " (skill " + Math.round(r.engineer.skill * 100) + ")"]].concat(r.crew && r.crew.length ? [
      ["Gun crew", r.crew.map(function (c) { return esc(c.name) + ", " + c.label + " (" + Math.round(c.skill * 100) + ")"; }).join(" · ")]] : [], [
      ["Accuracy", g.hits + " hits of " + g.shots + " shots (" + g.accuracyPct + "%)"]]).concat((g.guns || []).map(function (x) {
        return ["Gun " + x.gun + " (" + BL.WEAPONS[x.weapon].name.toLowerCase() + ")", "you " + rate(x.hits, x.shots) + " " + frac(x.hits, x.shots) +
          (r.weapons && r.weapons.length > 1 ? " · crew " + rate(x.aiHits, x.aiShots) + " " + frac(x.aiHits, x.aiShots) : "")];
      }), [
      ["Enemy ships destroyed", g.kills + " / " + g.ships],
      ["Torpedoes shot down", g.downed + " / " + g.torps],
      ["Torpedoes that hit the hull", g.hullTorps],
      ["Damage dealt", g.damage],
      ["Time holding FIRE with a dry gun", g.dryTime + " s"],
      ["Calls for power", g.calls],
      ["Hull lost", d.hullLost],
      ["Damage reports", r.damage.length]
    ]);
    if (g.mines) rows.push(["Mines shot down", g.minesDowned + " / " + g.mines]);
    if (g.mainShots) rows.push(["Main gun", g.mainHits + " hits of " + g.mainShots + " shots"]);
    if (g.strikes) rows.push(["Drive strikes", g.strikes + ": CIWS stopped " + g.strikesCiws + ", guns shot down " + g.strikesShot + ", " + g.strikesHit + " hit the drive"]);
    if (r.classId === "gunboat") rows.push(["Torpedoes", g.ptFired ? g.ptHits + " hits of " + g.ptFired + " launched (" + g.ptDowned + " shot down, " + g.ptMissed + " missed)" : "none launched"]);
    $("db-detail").innerHTML = rows.map(function (x) { return "<div><span>" + x[0] + ":</span> " + x[1] + "</div>"; }).join("");
    $("db-career").hidden = !report;
    if (report) renderCareerReport(r);
    $("btn-db-hub").hidden = !!job.test;
    $("btn-db-again").hidden = $("btn-db-new").hidden = $("btn-db-title").hidden = !job.test;
  }
  function wentWellGunner(r) {
    var g = r.gunner, notes = [];
    if (r.outcome === "success") notes.push("The gunboat made it back aboard.");
    if (g.accuracyPct >= 70) notes.push("Sharp shooting: " + g.accuracyPct + "% of shots hit.");
    if (g.ships && g.kills / g.ships >= 0.5) notes.push("You destroyed " + g.kills + " of " + g.ships + " enemy ships.");
    if (g.torps && g.downed / g.torps >= 0.3) notes.push("You shot down " + g.downed + " of " + g.torps + " torpedoes.");
    if (!g.hullTorps && g.torps) notes.push("No torpedo got through to the hull.");
    if (!notes.length) notes.push(g.kills ? "You destroyed " + g.kills + " enemy ship" + (g.kills === 1 ? "" : "s") + "." : "You kept the gun in the fight.");
    return notes.join(" ");
  }
  function worstGunner(r) {
    var g = r.gunner;
    if (g.dryTime >= 8) return "You held FIRE on a dry gun for " + g.dryTime + " s. Let it recharge, or call for power before it runs out.";
    if (g.hullTorps) return g.hullTorps + " torpedo" + (g.hullTorps === 1 ? "" : "es") + " got past the shields and hit the hull.";
    if (g.shots && g.accuracyPct < 40) return "Only " + g.accuracyPct + "% of shots hit. Lead the fast ones, and wait until a target is inside your range line.";
    return "Nothing stands out. Clean run.";
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
    return "Gunner " + q.gun + " in jump " + q.jump + " (T+" + mmss(q.t) + "): called for rapid fire and missed " + q.missed + " of " + q.wanted + " shots for lack of charge.";
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
  $("btn-db-again").onclick = function () { click(); startBriefing(Object.assign({}, job, { seed: sim.seed })); };
  $("btn-db-new").onclick = function () { click(); startBriefing(Object.assign({}, job, { seed: BL.randomSeed() })); };
  $("btn-db-save").onclick = function () { click(); saveDebrief(); };
  $("btn-db-title").onclick = function () { click(); newSeedInput(); refreshTitle(); show("scr-title"); };

  /* -------------------------------------------------------------- Career */
  var PROFILE_ROWS = {
    engineer: [
      ["aggression", "Aggression", "conservative", "aggressive"],
      ["winloss", "Win/loss", "losses", "wins"],
      ["efficiency", "Efficiency", "wasteful", "efficient"],
      ["demands", "Demands met", "few", "all"],
      ["condition", "Ship condition", "wrecked", "untouched"]
    ],
    gunner: [
      ["aggression", "Aggression", "holds fire", "trigger-happy"],
      ["winloss", "Win/loss", "losses", "wins"],
      ["efficiency", "Accuracy", "wild", "sharp"],
      ["demands", "Threats stopped", "few", "all"],
      ["condition", "Ship condition", "wrecked", "untouched"]
    ]
  };
  function profileHtml(p, before, station) {
    return PROFILE_ROWS[station || "engineer"].map(function (row) {
      var v = clampN(p[row[0]], 0, 1) * 100;
      var b = before ? '<i class="pf-mark before" style="left:' + clampN(before[row[0]], 0, 1) * 100 + '%"></i>' : "";
      return '<div class="pf"><span>' + row[1] + '</span><div class="pf-track"><div class="pf-fill" style="width:' + v + '%"></div>' + b +
        '<i class="pf-mark" style="left:' + v + '%"></i></div><div class="pf-ends"><span>' + row[2] + "</span><span>" + row[3] + "</span></div></div>";
    }).join("") + (before ? '<p class="muted small-text">Grey mark: before this mission.</p>' : "");
  }
  function gridHtml(c) {
    var head = "<tr><th></th>" + BL.CLASSES.map(function (k) { return "<th>" + k.n + ". " + k.name + "</th>"; }).join("") + "</tr>";
    var later = { gunner: "Phase 3", pilot: "Phase 4" };
    var rows = BL.career.STATIONS.map(function (st) {
      var q = BL.career.qualified(c, st), target = BL.career.targetClass(c, st);
      return "<tr><td>" + BL.career.STATION_NAME[st] + "</td>" + BL.CLASSES.map(function (k) {
        if (!BL.career.PLAYABLE[st]) return k.n === 1 ? '<td class="later" colspan="9">' + later[st] + "</td>" : "";
        var ready = BL.career.built(st, k.n);
        if (k.n <= q) return '<td class="q" title="Qualified">✔</td>';
        if (k.n === target && ready) return '<td class="next" title="Working toward">▶</td>';
        return '<td class="off">' + (ready ? "" : "·") + "</td>";
      }).join("") + "</tr>";
    }).join("");
    rows += '<tr><td>Command</td><td class="later" colspan="9">Phase 5: needs all three stations on a class</td></tr>';
    return '<table class="cgrid">' + head + rows + "</table><p class=\"muted small-text\">✔ qualified · ▶ working toward · dot = not built yet</p>";
  }
  function summaryHtml(c) {
    return BL.career.STATIONS.filter(function (s) { return BL.career.PLAYABLE[s]; }).map(function (s) {
      return "<span>" + BL.career.STATION_NAME[s] + " <b>" + BL.career.rank(c, s) + "</b> · reputation <b>" + c.stations[s].rep + "</b></span>";
    }).join("") +
      "<span>Rapid sign-offs <b>" + BL.career.signoffsHeld(c) + "</b></span>" +
      "<span>Missions <b>" + sumProfiles(c, "missions") + "</b> (" + sumProfiles(c, "wins") + " won)</span>";
  }
  function sumProfiles(c, k) {
    return Object.keys(c.profiles).reduce(function (a, s) { return a + (+c.profiles[s][k] || 0); }, 0);
  }

  function refreshTitle() {
    var b = $("btn-continue");
    b.hidden = !career;
    if (career) b.textContent = "Continue as " + career.name + " (" + BL.career.ranks(career) + ")";
  }
  $("btn-continue").onclick = function () { BL.audio.init(); click(); showHub(); };
  $("btn-enlist").onclick = function () {
    BL.audio.init(); click();
    $("hero-name").value = "";
    $("enlist-warn").hidden = !career;
    if (career) $("enlist-warn").textContent = "This replaces " + career.name + "'s career on this device. Export it first from the career hub if you want to keep it.";
    show("scr-enlist");
    setTimeout(function () { $("hero-name").focus(); }, 50);
  };
  $("btn-enlist-back").onclick = function () { click(); show("scr-title"); };
  function enlist() {
    var name = $("hero-name").value.trim();
    if (!name) { $("hero-name").focus(); $("enlist-warn").hidden = false; $("enlist-warn").textContent = "Your crew needs a name to call you."; return; }
    career = BL.career.create(name); saveCareer(); click();
    showHub();
  }
  $("btn-enlist-go").onclick = enlist;
  $("hero-name").addEventListener("keydown", function (ev) { if (ev.key === "Enter") enlist(); });

  $("btn-import").onclick = function () { BL.audio.init(); click(); $("import-file").value = ""; $("import-file").click(); };
  $("import-file").onchange = function () {
    var f = this.files && this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var c = BL.career.importText(String(rd.result));
        if (career && !confirm("Replace " + career.name + "'s career on this device with " + c.name + "'s?")) return;
        career = c; saveCareer(); showHub();
      } catch (e) { alert(e.message); }
    };
    rd.readAsText(f);
  };

  function showHub() {
    $("hub-name").textContent = career.name;
    $("hub-summary").innerHTML = summaryHtml(career);
    $("hub-grid").innerHTML = gridHtml(career);
    var last = career.history[0];
    $("hub-last").textContent = last ? "Last mission: " + BL.career.STATION_NAME[last.station || "engineer"].toLowerCase() + " aboard " + last.ship + " (" + BL.classById(last.classId).name + ", tech level " + last.tl + "), " +
      (last.outcome === "success" ? "success, +" + last.rep + " reputation" : last.outcome) + "." : "No missions yet. Your first job offers are waiting.";
    $("btn-hub-eng").textContent = "Engineer jobs (" + BL.career.offers(career, "engineer").length + ")";
    $("btn-hub-gun").textContent = "Gunner jobs (" + BL.career.offers(career, "gunner").length + ")";
    show("scr-hub");
  }
  $("btn-hub-eng").onclick = function () { click(); showOffers("offers", "engineer"); };
  $("btn-hub-gun").onclick = function () { click(); showOffers("offers", "gunner"); };
  $("btn-offers-lower").onclick = function () { click(); showOffers(offersMode === "lower" ? "offers" : "lower", offersStation); };
  $("btn-hub-record").onclick = function () { click(); showRecord(); };
  $("btn-hub-options").onclick = function () { click(); openOptions(); };
  $("btn-hub-title").onclick = function () { click(); refreshTitle(); show("scr-title"); };
  $("btn-hub-export").onclick = function () {
    click();
    var blob = new Blob([BL.career.exportText(career)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = BL.career.fileName(career);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  $("btn-hub-signoffs").onclick = function () {
    click();
    var held = BL.career.signoffsHeld(career), total = BL.career.signoffsTotal(career);
    renderSignoffs();
    overlay("ov-signoffs", true);
  };
  function renderSignoffs() {
    var held = BL.career.signoffsHeld(career), total = BL.career.signoffsTotal(career), opts = BL.career.signoffOptions(career);
    $("signoffs-body").innerHTML = "<p>You hold <b>" + held + "</b> rapid sign-off" + (held === 1 ? "" : "s") + ".</p>" +
      "<p>Once you're qualified at a station on ship class N, you hold N − 2 sign-offs in total (" + total + " now). Each qualifies you at another station on its next class, no higher than N − 2, without flying a mission. They earn no reputation and can't be used to requalify after being sent back.</p>" +
      (opts.length ? '<div class="menu">' + opts.map(function (o) {
        return '<button class="primary" data-st="' + o.station + '" data-n="' + o.n + '">Sign off as ' + BL.career.STATION_NAME[o.station] + "-" + o.n + " (" + BL.classByN(o.n).name.toLowerCase() + ")</button>";
      }).join("") + "</div>" :
      '<p class="muted">' + (held ? "Nothing to spend one on right now: the next class at your other stations is either higher than N − 2 or not built yet (the pilot station isn't built yet)." : "Unused sign-offs stay available.") + "</p>");
  }
  $("signoffs-body").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-st]"); if (!b) return;
    if (BL.career.spendSignoff(career, b.dataset.st, +b.dataset.n)) { saveCareer(); click(); renderSignoffs(); showHub(); overlay("ov-signoffs", true); }
  });
  $("btn-signoffs-close").onclick = function () { click(); overlay("ov-signoffs", false); };

  function offerHtml(j, i) {
    var cls = BL.classByN(j.n), q = BL.career.qualified(career, j.station), up = j.n > q, rankName = BL.career.STATION_NAME[j.station];
    var tag = up ? '<span class="tag up">' + (q ? "STEP UP" : "FIRST QUALIFICATION") + "</span>" : !j.serious ? '<span class="tag low">REQUALIFYING</span>' : "";
    // Ship and hull number with the tech level; reputation; then who you'd serve with and the guns.
    // Crew: everyone at the other stations the job names (j.engineer, j.gunner, j.pilot, each
    // { name, who, label, skill }). Gunner jobs name the engineer today; engineer jobs will add
    // the gunner and pilot, gunner jobs the pilot, and pilot jobs the engineer and gunner.
    var crew = BL.career.STATIONS.filter(function (st) { return st !== j.station && j[st]; }).map(function (st) {
      var p = j[st];
      return BL.career.STATION_NAME[st] + "-" + j.n + " " + esc(p.who || p.name.split(" ").slice(-2).join(" ")) + ", " + p.label + " (skill " + Math.round(p.skill * 100) + ")";
    });
    // A gunner job also names the gun crew (the same people the mission will roll).
    if (j.station === "gunner" && BL.pickGunCrew) BL.pickGunCrew(j.seed, j.classId).forEach(function (c, k) {
      if (c) crew.push("Gun " + (k + 1) + " " + esc(c.name) + ", " + c.label + " (skill " + Math.round(c.skill * 100) + ")");
    });
    var arms = j.station === "gunner" ? (j.weapons || ["pulse"]).map(function (id, k) { return "Gun " + (k + 1) + " " + BL.WEAPONS[id].name.toLowerCase(); })
      .concat(BL.classById(j.classId).mainGun ? ["Main gun"] : [], j.classId === "gunboat" ? ["Two torpedoes"] : []) : [];
    function sec(title, rows) { return rows.length ? '<div class="offer-sec"><div class="offer-sec-h">' + title + "</div>" + rows.map(function (x) { return "<div>" + x + "</div>"; }).join("") + "</div>" : ""; }
    return '<div class="offer' + (up ? " stepup" : "") + '"><h3>' + esc(BL.shipLabel(j.classId, j.ship)) + " (TL" + j.tl + ")" + tag + "</h3>" +
      '<button class="primary" data-i="' + i + '">Accept</button>' +
      '<div class="meta">Reputation ×' + (BL.TECH.repMult(j.tl) * (j.serious === false ? BL.career.REQUAL_REP : 1)).toFixed(j.serious === false ? 2 : 1) + (j.serious === false ? " (half: requalifying)" : "") + ", max " + BL.career.repFor(j, 100) +
      (up ? " · success qualifies you as " + rankName + "-" + j.n : "") + "</div>" +
      sec("Crew", crew) + sec("Armament", arms) + "</div>";
  }
  var shownJobs = [], offersStation = "engineer";
  function showOffers(mode, station) {
    offersMode = mode; offersStation = station = station || offersStation;
    var q = BL.career.qualified(career, station), who = BL.career.STATION_NAME[station];
    $("btn-offers-lower").textContent = mode === "lower" ? who + " job offers" : "Requalifying jobs";
    if (mode === "offers") {
      shownJobs = BL.career.offers(career, station);
      $("offers-title").textContent = who + " jobs";
      $("offers-lede").textContent = (station === "gunner"
        ? "Postings for gunners at your level. Each lists the ship's guns and names the engineer who'll run your power and the gun crew."
        : "Postings for engineers at your level. Lower tech levels are harder (smaller reactor and capacitors, weaker guns) and earn more reputation.") +
        (q && BL.career.built(station, q + 1) ? " There's always a tech-level-1 posting for your class and for the class above it." : " There's always a tech-level-1 posting.");
    } else {
      shownJobs = BL.career.lowerJobs(career, station);
      $("offers-title").textContent = who + ": requalifying";
      $("offers-lede").textContent = shownJobs.length ? "Classes you've already qualified on: requalify or get some practice. You're welcome aboard, but they earn half that class's reputation, and failures here don't count against you." :
        "Nothing below your current class yet. Qualify on a bigger ship and the smaller ones show up here.";
    }
    $("offers-list").innerHTML = shownJobs.map(offerHtml).join("");
    show("scr-offers");
  }
  $("offers-list").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-i]"); if (!b) return;
    click(); startBriefing(shownJobs[+b.dataset.i]);
  });
  $("btn-offers-back").onclick = function () { click(); showHub(); };

  function showRecord() {
    var c = career;
    $("rec-title").textContent = "Service record: " + c.name;
    $("rec-summary").innerHTML = "<span>Enlisted <b>" + c.created + "</b></span>" + summaryHtml(c);
    $("rec-profile").innerHTML = BL.career.STATIONS.filter(function (s) { return BL.career.PLAYABLE[s]; }).map(function (s) {
      return "<h2>" + BL.career.STATION_NAME[s] + " reputation profile</h2>" + profileHtml(BL.career.profile(c, s), null, s);
    }).join("");
    $("rec-grid").innerHTML = gridHtml(c);
    $("rec-history").innerHTML = "<tr><th>Date</th><th>Station</th><th>Ship</th><th>Class</th><th>Tech</th><th>Outcome</th><th>Score</th><th>Reputation</th></tr>" +
      (c.history.length ? c.history.map(function (h) {
        return "<tr><td>" + h.date + "</td><td>" + BL.career.STATION_NAME[h.station || "engineer"] + "</td><td>" + esc(h.ship) + "</td><td>" + BL.classById(h.classId).name + "</td><td>" + h.tl + "</td><td>" + h.outcome +
          "</td><td>" + h.score + "</td><td>" + (h.rep ? "+" + h.rep : "0") + "</td></tr>";
      }).join("") : '<tr><td colspan="8" class="muted">No missions yet.</td></tr>');
    show("scr-record");
  }
  $("btn-record-back").onclick = function () { click(); showHub(); };

  /* ---------------------------------------------------------------- Boot */
  document.querySelectorAll(".app-version").forEach(function (el) { el.textContent = window.APP_VERSION || ""; });
  applySettings();
  newSeedInput();
  refreshTitle();
  show("scr-title");
  requestAnimationFrame(frame);
  window.__bl = { get sim() { return sim; } };   // for automated tests
})();
