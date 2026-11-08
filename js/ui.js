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
  var flagBot = null, cmdView = false;    // a squadron: the flag captain, and whether you're commanding (not on the flagship's bridge)
  // Dropping down (the captain): the station he's at off the bridge (null on the bridge, "engine",
  // "helm" or "gun"), and the bridge's list of stations open.
  var cpAt = null, dropPick = false;
  // The helm's screen (the pilot station, or the bridge built on it), not the gun's.
  function helmUi() { return !!(sim && sim.helm) && cpAt !== "gun"; }

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
  var SCREENS = ["scr-title", "scr-enlist", "scr-hub", "scr-offers", "scr-crew", "scr-record", "scr-reports", "scr-memoriam", "scr-registry", "scr-shipcard", "scr-briefing", "scr-console", "scr-turret", "scr-debrief", "scr-admirals"];
  function show(id) { SCREENS.forEach(function (s) { $(s).hidden = s !== id; }); }
  function overlay(id, on) { $(id).hidden = !on; }
  function inConsole() { return !$("scr-console").hidden; }
  function inTurret() { return !$("scr-turret").hidden; }
  function inMission() { return inConsole() || inTurret(); }
  function click() { BL.audio.play("click"); }

  /* --------------------------------------------------------------- Title */
  /* The route number: a mission's seed shown as XXX.XX.XX, padded to seven digits (seed 1234567 is
     Route 123.45.67; seed 259029 is Route 025.90.29). Typed back in, the dots are optional. */
  function routeNo(seed) { var s = ("0000000" + seed).slice(-7); return s.slice(0, 3) + "." + s.slice(3, 5) + "." + s.slice(5); }
  BL.routeNo = routeNo;
  function readRoute() { return parseInt(String($("seed-input").value).replace(/\D/g, ""), 10); }
  // Each system on a route gets a name from the seed, made like the admirals' map names (two syllables).
  function systemNames(seed, n) {
    var r = BL.rng((seed ^ 0x2545f491) >>> 0), syl = BL.SYSTEM_SYL || ["ka", "vor", "esh", "tal", "mir", "zan"], used = {}, out = [];
    for (var t = 0; out.length < n && t < 200; t++) { var x = r.pick(syl) + r.pick(syl); x = x.charAt(0).toUpperCase() + x.slice(1); if (x.length > 3 && !used[x]) { used[x] = true; out.push(x); } }
    while (out.length < n) out.push("System " + (out.length + 1));
    return out;
  }
  function newSeedInput() { $("seed-input").value = routeNo(BL.randomSeed()); }
  $("btn-seed-new").onclick = function () { BL.audio.init(); click(); newSeedInput(); };
  $("btn-start").onclick = function () {
    BL.audio.init(); click();
    var seed = readRoute();
    startBriefing(testJob(seed > 0 ? seed : BL.randomSeed()));
  };
  function testJob(seed) { return { test: true, station: "engineer", classId: "destroyer", n: 4, tl: BL.TECH.base("destroyer"), ship: "Destroyer", seed: seed }; }
  // The gunner turret test: a gunboat, you at Gun 1 with the gun picked on the title screen.
  // The ring test: a destroyer's three guns on the rim of its shield, enemies from every side.
  function ringJob(seed) { return { test: true, station: "gunner", classId: "destroyer", n: 4, tl: BL.TECH.base("destroyer"), ship: "Destroyer", seed: seed, ring: true }; }
  $("btn-ring").onclick = function () {
    BL.audio.init(); click();
    var seed = readRoute();
    startBriefing(ringJob(seed > 0 ? seed : BL.randomSeed()));
  };
  // The pilot helm test: the ship picked on the title screen (gunboat to dreadnought), you at the
  // helm, a gun crew on the guns. A gunboat flies three sorties from the carrier; a ship with a
  // drive makes three jumps.
  Object.keys(BL.HELM.classes).forEach(function (id) {
    var o = document.createElement("option"); o.value = id; o.textContent = BL.classById(id).name; $("ship-pick").appendChild(o);
  });
  $("ship-pick").value = BL.HELM.classes[settings.helmPick] ? settings.helmPick : "gunboat";
  $("ship-pick").onchange = function () { settings.helmPick = this.value; saveSettings(); };
  function helmJob(seed) {
    var id = $("ship-pick").value;
    return { test: true, station: "pilot", classId: id, n: 1, tl: BL.TECH.base(id), ship: BL.classById(id).name, seed: seed, helm: true };
  }
  $("btn-helm").onclick = function () {
    BL.audio.init(); click();
    var seed = readRoute();
    startBriefing(helmJob(seed > 0 ? seed : BL.randomSeed()));
  };
  // The captain bridge test: the ship picked on the title screen (gunboat, picket, destroyer escort
  // or destroyer); you on the bridge, plotting each system's course in warp space and giving the
  // orders; an NPC crew (pilot, gun crew, engineer) carries them out. On a gunboat you're the
  // coxswain: three sorties from the carrier, each ending at its recovery point.
  // (…Escort: an escort mission, the squadron screening a carrier, convoy or capital ship; command.js Escort.
  // A picket flies a scouting run through checkpoints.)
  var CAPTAIN_SHIPS = ["gunboat", "gunboatEscort", "picket", "destroyerEscort", "destroyerEscortEscort", "destroyer", "lightCruiser", "cruiser", "heavyCruiser", "battleship", "dreadnought"];
  var CAPTAIN_ESCORT = { gunboatEscort: "gunboat", destroyerEscortEscort: "destroyerEscort" };     // escort mission picks: their class
  CAPTAIN_SHIPS.forEach(function (id) {
    var esc = CAPTAIN_ESCORT[id], o = document.createElement("option"); o.value = id; o.textContent = BL.classById(esc || id).name + (esc ? " (escort mission)" : ""); $("cap-pick").appendChild(o);
  });
  $("cap-pick").value = CAPTAIN_SHIPS.indexOf(settings.capPick) >= 0 ? settings.capPick : "destroyer";
  $("cap-pick").onchange = function () { settings.capPick = this.value; saveSettings(); };
  function captainJob(seed) {
    var pick = $("cap-pick").value, escort = !!CAPTAIN_ESCORT[pick], id = CAPTAIN_ESCORT[pick] || pick, c = BL.classById(id);
    return { test: true, station: "captain", classId: id, n: c.n, tl: BL.TECH.base(id), ship: c.name, seed: seed, helm: true, captain: true, escort: escort };
  }
  $("btn-captain").onclick = function () {
    BL.audio.init(); click();
    var seed = readRoute();
    startBriefing(captainJob(seed > 0 ? seed : BL.randomSeed()));
  };
  // The Squadron test (approved Nov 2, 2026; stage 1): a squadron of any class (BL.COMMAND.squad.test,
  // its size by class). You command it: plot its course and give the squadron orders; your flag
  // captain runs the flagship (command.js Squadron).
  BL.COMMAND.squad.test.forEach(function (id) { var o = document.createElement("option"); o.value = id; o.textContent = BL.classById(id).name; $("sq-pick").appendChild(o); });
  $("sq-pick").value = BL.COMMAND.squad.test.indexOf(settings.sqPick) >= 0 ? settings.sqPick : "destroyer";
  function sqCount() { $("sq-n").textContent = (BL.COMMAND.squad.size[$("sq-pick").value] || 4) + " ships"; }
  sqCount();
  $("sq-pick").onchange = function () { settings.sqPick = this.value; saveSettings(); sqCount(); };
  function squadronJob(seed) {
    var id = $("sq-pick").value, c = BL.classById(id);
    return { test: true, station: "squadron", classId: id, n: c.n, tl: BL.TECH.base(id), ship: c.name, seed: seed, helm: true, captain: true, flag: true };
  }
  $("btn-squadron").onclick = function () {
    BL.audio.init(); click();
    var seed = readRoute();
    startBriefing(squadronJob(seed > 0 ? seed : BL.randomSeed()));
  };
  // The Admirals test (approved Nov 6, 2026; stage 1): a Fleet Admiral's campaign on the hex map
  // with the fleet picked, F3 to F8 or G9 (admirals.js, admiralsview.js).
  BL.ADMIRALS.levels.forEach(function (lv) { var o = document.createElement("option"); o.value = lv; o.textContent = lv + " · " + BL.ADMIRALS.titles[lv]; $("adm-pick").appendChild(o); });
  $("adm-pick").value = BL.ADMIRALS.levels.indexOf(settings.admPick) >= 0 ? settings.admPick : "F3";
  // The ships in a level's fleet: its top ships, each with her escort pyramid (admirals.js).
  function admCount() {
    var A = BL.ADMIRALS, lv = $("adm-pick").value, P = A.pyramid;
    function n(cls) { var i = A.classes.indexOf(cls); return cls === "picket" ? P.pickets : 1 + (cls === "destroyerEscort" ? P.pickets : P.escorts * n(A.classes[i - 1])); }
    $("adm-n").textContent = (A.top[lv] * n(A.tops[lv])).toLocaleString("en-US") + " ships";
  }
  admCount();
  $("adm-pick").onchange = function () { settings.admPick = this.value; saveSettings(); admCount(); };
  $("btn-admirals").onclick = function () {
    BL.audio.init(); click();
    var seed = readRoute();
    if (!(seed > 0)) seed = BL.randomSeed();
    $("seed-input").value = routeNo(seed);
    overlay("ov-tests", false); show("scr-admirals");
    BL.admiralsView.start({ seed: seed, level: $("adm-pick").value, onExit: function () { home(); } });
  };
  // Another mission of the same test (the captain's or the squadron's).
  function bridgeTestJob(seed) { return job && job.flag ? squadronJob(seed) : captainJob(seed); }
  function gunnerJob(seed) { return { test: true, station: "gunner", classId: "gunboat", n: 1, tl: 4, ship: "Gunboat", seed: seed, weapon: settings.gunPick || "pulse" }; }
  $("gun-pick").value = BL.WEAPONS[settings.gunPick] ? settings.gunPick : "pulse";
  $("gun-pick").onchange = function () { settings.gunPick = this.value; saveSettings(); };
  $("btn-gunner").onclick = function () {
    BL.audio.init(); click();
    var seed = readRoute();
    startBriefing(gunnerJob(seed > 0 ? seed : BL.randomSeed()));
  };
  // The Tests pop-up (title screen): every station's test, the ship or gun to use, and the seed.
  $("btn-tests").onclick = function () { BL.audio.init(); click(); overlay("ov-tests", true); };
  $("btn-tests-close").onclick = function () { click(); overlay("ov-tests", false); };
  // How to play: each enemy the briefing's Intel can name, and what it's like.
  $("how-enemies").innerHTML = ["raiders", "interceptors", "siege", "hunters", "frigate", "cruiserA", "battleshipA", "fortress"].filter(function (id) { return BL.ENCOUNTERS[id]; }).map(function (id) {
    var e = BL.ENCOUNTERS[id], look = BL.GUNNERY.looks[id];
    return "<li><b>" + e.name + "</b>: " + (look && look.what ? look.what : e.what.charAt(0).toLowerCase() + e.what.slice(1)) + ".</li>";
  }).join("");
  $("btn-how").onclick = function () { BL.audio.init(); click(); overlay("ov-how", true); };
  $("btn-how-close").onclick = function () { click(); overlay("ov-how", false); };

  // What a squadron's skippers are called: captains, or a gunboat squadron's coxswains
  // (BL.COMMAND.squad.skipper). cap(classId, "Flag captain") -> "Flag coxswain".
  function cap(classId, text) {
    var k = BL.COMMAND.squad.skipper[classId];
    return k ? text.replace(/captain/g, k[0]).replace(/Captain/g, k[1]) : text;
  }
  /* Titles as titles (TexasBont, Nov 8, 2026): every major word capitalized ("Plot the Course"),
     small words (a, the, of, in ...) lower case unless first, last or after a colon. */
  var MINOR = /^(a|an|the|and|but|or|nor|of|in|on|at|by|to|for|with|from|as|per|vs)$/;
  function tc(s) {
    var ws = []; String(s).replace(/[A-Za-z][A-Za-z']*/g, function (w, i) { ws.push([w, i]); return w; });
    var out = String(s);
    for (var k = ws.length - 1; k >= 0; k--) {
      var w = ws[k][0], i = ws[k][1], pre = out.slice(0, i).replace(/\s+$/, "");
      var force = k === 0 || k === ws.length - 1 || /[:·(—?!]$/.test(pre);
      if ((force || !MINOR.test(w)) && /^[a-z]/.test(w)) out = out.slice(0, i) + w.charAt(0).toUpperCase() + w.slice(1) + out.slice(i + w.length);
    }
    return out;
  }
  BL.titleCase = tc;
  // (after "flag coxswain" his rank isn't said again)
  function noCox(classId, name) { var k = BL.COMMAND.squad.skipper[classId]; return k ? String(name).replace(new RegExp("^" + k[1] + " "), "") : name; }
  /* ------------------------------------------------------------ Briefing */
  function startBriefing(j) {
    job = j; overlay("ov-tests", false);
    // The turret test fires the gun picked on the title screen; a real gunner job, the ship's own guns.
    var guns = j.helm ? { weapons: BL.GUNNERY.loadout[j.classId] || ["pulse"], helm: true } : j.station !== "gunner" ? null : j.weapons ? { weapons: j.weapons } : j.weapon && j.test ? { weapon: j.weapon } : { weapons: BL.GUNNERY.loadout[j.classId] || ["pulse"] };
    // Standing orders for the AI gunners, remembered per gun number between missions.
    if (guns) guns.orders = [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return (settings.gunOrders || {})[n] || "auto"; });
    var rc = BL.GUNNERY.ring.classes[j.classId];
    // Every class with a ring layout fights in the ring view (the turret test: its one gun is the one picked).
    if (guns && rc) { guns.ring = true; guns.arcs = rc.arcs; guns.arcNames = rc.arcNames; if (!guns.weapons) guns.weapons = [guns.weapon]; delete guns.weapon; }
    var story = j.story && BL.storyMission(j.story);
    // A Command job: the crew from the roster (the crew screen's picks, else the suggestion).
    var rcrew = null;
    if (j.captain && !j.test && career && BL.roster) { j.crewUsed = BL.roster.crewOf(career, j, true); rcrew = BL.roster.forMission(career, j.crewUsed); }
    // A squadron job: its captains from the captains pool (the Captains screen's picks, else the suggestion).
    var rsquad = null;
    if (j.flag && !j.test && career && BL.captains) { j.capsUsed = BL.captains.captainsOf(career, j, true); rsquad = BL.captains.forMission(career, j, j.capsUsed); }
    sim = new BL.Mission({ seed: j.seed, crew: rcrew, squad: rsquad, classId: j.classId, tl: j.tl, shipName: j.test ? null : j.ship, gunner: guns, helm: !!j.helm, captain: !!j.captain, flag: !!j.flag, escort: !!j.escort, escortKind: j.escortKind || null, test: !!j.test, sweep: j.test && j.classId === "gunboat" && !!guns && !j.escort,
      route: story ? story.systems : null, reports: story ? story.reports.map(storyText) : null,
      world: story ? ((story.briefing || "").match(/(industrial|military|transportation|reclamation) world/) || [])[1] : null });
    if (j.test) $("seed-input").value = routeNo(j.seed);
    var d = sim.data, cls = BL.classById(j.classId);
    $("brief-route-title").textContent = "Route " + routeNo(j.seed);
    $("btn-brief-new").hidden = !(j.test && j.captain);     // (the captain test: roll another mission till you find the one to try)
    $("brief-story").hidden = !story;
    if (story) $("brief-story").innerHTML = "<b>" + esc(story.title) + "</b> · " + BL.classByN(j.n).name + " chapter: " + esc(story.chapter) + " · story mission " + story.k + " of 3";
    $("brief-lede").textContent = story ? storyText(story.briefing) : sim.hasDrive
      ? "Escort the planet buster's route through " + sim.cfg.jumps + " Azurian-held systems. In each one the warp drive starts empty: keep the ship alive, charge the drive, and the captain warps once the warp window opens."
      : "Gunboats have no warp drive. In each of the carrier's " + sim.cfg.jumps + " systems it launches you into the fight and recovers you when the sortie timer runs out, then carries you through warp space to the next one. Keep the gunboat alive through every sortie.";
    var reps = sim.route.map(function (x, i) { return sim.reported(i); });     // (the bridge: the pickets' reports, Mission.reported)
    /* The route as a table (TexasBont, Nov 8, 2026): each system's name, its warp window, the pickets'
       intel and, at the guns, which of yours does extra damage (the engine room: what it tests).
       What each enemy is like is in How to play. */
    var names = systemNames(j.seed, reps.length), guns0 = sim.turret ? sim.turret.bats : null;
    function edge(id) {
      if (id === "minefield" || id === "sweep") return "Any gun (one hit)";
      var good = guns0.filter(function (b) { return b.w.best.indexOf(id) >= 0; }).map(function (b) { return b.w.name; }).filter(function (n, i, a) { return a.indexOf(n) === i; });
      return good.length ? good.join(", ") : "None";
    }
    $("brief-route").innerHTML = "<tr><th>#</th><th>System</th><th>" + (sim.hasDrive ? "Warp window" : "Recovered after") + "</th><th>Intel</th><th>" + (guns0 ? "Extra damage" : "Tests") + "</th></tr>" +
      reps.map(function (id, i) {
        var e = BL.ENCOUNTERS[id], drop = sim.sys("buster") && i === sim.cfg.jumps - 1;
        return "<tr><td>" + (i + 1) + "</td><td>" + names[i] + "</td><td>" + (drop ? "Drop at " : "") + sim.windowFor(i) + " s</td><td><b>" + e.name + "</b></td><td>" + (guns0 ? edge(id) : e.tests) + "</td></tr>";
      }).join("");
    $("brief-route-note").hidden = !sim.sys("buster");
    if (sim.sys("buster")) $("brief-route-note").textContent = "The drop: no warp out of " + names[sim.cfg.jumps - 1] + ". Launch the planet buster from the drop zone within " + sim.cfg.dropLate +
      " s of the window opening, or the mission fails. The target: an Azurian " + sim.world + " world.";
    $("brief-ship-title").textContent = (j.flag ? "Your Flagship: " : "Your Ship: ") + (j.test ? cls.name : BL.shipLabel(j.classId, j.ship, j.hull)) + " (TL" + j.tl + ")";
    // The ship as on her ship card: her stats, then her guns (TexasBont, Nov 8, 2026).
    $("brief-ship").innerHTML = shipStatRows(d, j.classId).map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("");
    $("brief-guns").innerHTML = gunRows(d, j.classId, sim.turret ? sim.turret.bats : null);
    // The approved art: the gunboat carries its hull number, bigger classes their hull letters.
    $("brief-art").innerHTML = BL.ART ? (j.classId === "gunboat" ? BL.ART.gunboat(/^PT-/.test(j.ship) ? j.ship : "PT") : BL.ART.warship(j.classId, j.test ? "" : j.hull || BL.hullNumber(j.classId, j.ship))) : "";
    if (BL.preloadArt) BL.preloadArt();
    $("brief-main").hidden = !sim.sys("main");
    $("brief-hangar").hidden = !sim.sys("hangar");
    $("brief-mines").hidden = sim.route.indexOf("minefield") < 0;
    $("brief-rx").hidden = d.reactors.length < 2;
    $("brief-buster").hidden = !sim.sys("buster");
    var gunner = !!sim.turret;
    $("brief-eng").hidden = gunner; $("brief-gun").hidden = !gunner;
    var post = sim.flag ? ["Your Post: Squadron Commander", cap(j.classId, "You plot the squadron's course and give its orders; your flag captain runs the flagship.")]
      : sim.captain ? ["Your Post: The Bridge", "You plot the course and give the orders; your crew carry them out."]
      : sim.helm ? ["Your Station: The Helm", "The " + sim.helm.who.toLowerCase() + " gives the orders; the engineer runs the power."]
      : gunner ? ["Your Station: Gun 1", "The engineer runs the power" + (sim.turret.bats.length > 1 ? "; your gun crew works the other guns." : ".")]
      : ["Your Station: Main Engineering", "You run the power."];
    $("brief-station").textContent = post[0];
    $("brief-post").textContent = post[1] + (j.test ? "" : " Reputation for a success: +" + BL.career.repFor(j) + ".");
    // A squadron: its ships and captains in a table; how orders reach them is in How to play.
    var sqv = sim.flag && sim.captain.squadView();
    $("brief-squad").hidden = !sqv;
    if (sqv) $("brief-squad").innerHTML = '<p>' + (sqv.ships.length + 1) + " " + cls.name.toLowerCase() + "s in " + BL.COMMAND.squad.formations[sqv.form].name.toLowerCase() + ". " +
      (sim.sys("buster") ? "Get through to the drop zone at the end of system " + sim.cfg.jumps + " and drop the planet buster; fight only what gets in the way. Fortress ships guard the drop zone." :
      "Each system's map shows the enemy's targets: destroy its objective, the supply depot, before the squadron warps on, or the mission fails.") + "</p><h3>Squadron</h3>" +
      peopleTable(["Ship", "Captain", "Skill", "Temper"], [[1 + " " + esc(sqv.flagName) + " ★", esc(noCox(j.classId, sqv.flag.name)), sqv.flag.label + " " + Math.round(sqv.flag.skill * 100), sqv.flag.temper]]
        .concat(sqv.ships.map(function (x) { return [x.no + " " + esc(x.name), esc(x.cap.name), x.cap.label + " " + Math.round(x.cap.skill * 100), x.cap.temper]; }))) +
      '<p class="muted">' + cap(j.classId, "★ the flagship; her flag captain runs her.") + "</p>";
    // The crew in a table: the post, the man, his skill and, from a crew pool, his temper and morale.
    var crew = [];
    if (gunner) {
      var en = sim.turret.engineer, pc = sim.captain && sim.captain.pilotCrew;
      var man = function (postName, p) { return [postName, esc(p.name), p.label + " " + Math.round(p.skill * 100), p.temper || "", p.temper ? p.morale : ""]; };
      crew.push(man("Engineering", en));
      if (pc) crew.push(man("Helm", pc));
      sim.turret.bats.forEach(function (b) { if (b.crew) crew.push(man("Gun " + b.gunNo, b.crew)); });
    }
    var tm = crew.some(function (r) { return r[3]; });
    $("brief-crew").hidden = !crew.length;
    $("brief-crew").innerHTML = crew.length ? "<h3>" + (sim.flag ? "Flagship Crew" : "Crew") + "</h3>" + peopleTable(tm ? ["Post", "Name", "Skill", "Temper", "Morale"] : ["Post", "Name", "Skill"], crew.map(function (r) { return tm ? r : r.slice(0, 3); })) +
      (sim.captain ? "" : '<p class="muted">Your engineer: ' + ENGINEER_NOTE[en.label] + "</p>") : "";
    // The mission's own notes (the torpedoes, main gun, gunboats, mines); the rules are in How to play.
    $("brief-sweep").hidden = sim.route.indexOf("sweep") < 0;
    if (gunner) {
      $("brief-pt").hidden = !sim.data.torpedoes || !!sim.helm;
      $("brief-gmain").hidden = !sim.turret.firesMain || !!sim.helm;
      $("brief-gmines").hidden = sim.route.indexOf("minefield") < 0 || !!sim.helm;
      $("brief-hmines").hidden = sim.route.indexOf("minefield") < 0 || !sim.helm;
      $("brief-gwing").hidden = !sim.sys("hangar");
    }
    $("brief-gun").hidden = !gunner || $("brief-gun").querySelectorAll("li:not([hidden])").length === 0;
    $("brief-eng").hidden = gunner || $("brief-eng").querySelectorAll("li:not([hidden])").length === 0;
    show("scr-briefing");
  }
  $("btn-brief-back").onclick = function () { click(); if (job.test) home(); else if (job.captain && BL.roster) showCrew(job); else showOffers(offersMode); };
  $("btn-brief-go").onclick = function () { click(); startMission(); };
  // The captain test: another mission on the same ship, at random (the briefing, or the first plot).
  $("btn-brief-new").onclick = function () { click(); startBriefing(bridgeTestJob(BL.randomSeed())); };
  $("btn-brief-how").onclick = function () { click(); overlay("ov-how", true); };

  /* ------------------------------------------------------------- Mission */
  function startMission() {
    BL.audio.init(); BL.audio.humStart();
    BL.speech.unlock();
    var en0 = sim.turret && sim.turret.engineer;     // (a roster engineer's temperament: BL.ROSTER.temper)
    // A squadron: you start as its commander; the flag captain (the captain test bot) runs the flagship.
    cmdView = !!sim.flag; flagBot = sim.flag ? new BL.CaptainBot({ noJump: true }) : null; sqSel = []; sqTgt = null;
    aiEngineer = en0 ? new BL.AIEngineer(en0.temperK === undefined ? 0.5 : en0.temperK, 0.25, en0.skill) : null;
    lastTuDamage = -1;
    if (sim.turret) { buildTurret(); show("scr-turret"); sizeTurret(); }
    else { buildConsole(); show("scr-console"); }
    gravShown = false; doneShown = false; paused = false; looking = false;
    lastLogKey = ""; lastDamageLen = -1; lastSpoken = 0; selected = 0; acc = 0;
    cpAt = null; dropPick = false;
    if (sim.captain) { openPlot(); return; }     // the bridge: plot the first system's course, then drop out of warp space
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
    $("btn-abandon").hidden = !!sim.training;
    $("btn-resume").textContent = sim.turret ? "Resume (P)" : "Resume (Space)";
    overlay("ov-pause", true); $("planning-banner").hidden = true;
    $("pause-voice").textContent = BL.speech.status() + " Sound effects: " + BL.audio.status() + ".";
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
  // Testing: win the mission now at 75% (BL.Mission.testWin), to move up the career quickly.
  function testWin() { if (!sim || sim.phase === "done" || !running) return; click(); sim.testWin(75); }
  $("btn-testwin").onclick = testWin;
  $("btn-tu-testwin").onclick = testWin;
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
    $("voice-status").textContent = BL.speech.status() + " Sound effects: " + BL.audio.status() + ".";
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
    $("hd-station").textContent = "Main Engineering · " + (job.test ? sim.data.className : BL.shipLabel(job.classId, job.ship, job.hull)) + " (TL" + sim.data.tl + ")";
    $("btn-bridge").hidden = cpAt !== "engine";
    $("jump-label").textContent = sim.hasDrive ? "WARP" : "RECOVERY";
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
    $("route").innerHTML = sim.route.map(function (r, i) { return '<li data-i="' + i + '">' + (i + 1) + ". " + BL.ENCOUNTERS[sim.reported(i)].name + "</li>"; }).join("") +
      (sim.hasDrive ? '<li data-i="' + sim.route.length + '">Azurian world</li>' : '<li data-i="' + sim.route.length + '">Carrier: final recovery</li>');
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
  // The reactor letter on a capacitor ("A+B" for the shields, which draw from them all).
  function rxName(s) { var R = sim.ship.reactors; return s.split ? R.map(function (r) { return r.name; }).join("+") : R[s.reactor].name; }
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
      s.kind === "buster" ? "The planet buster: charges from the start, keeps its charge, can't charge in warp space. Must be full for the final warp." :
      s.kind === "hangar" ? "Launchers while the squadron is aboard: full when the bridge calls the launch, to kick the gunboats out. Arresters while it is out: full when the bridge calls the recovery. No warp until the gunboats are aboard." :
      "Must be full for the captain to warp.";
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
    if (!$("ov-tests").hidden) { if (ev.key === "Escape") overlay("ov-tests", false); return; }
    if (!$("ov-plot").hidden) { plotKey(ev); return; }
    // B at a station the captain dropped down to: back to the bridge.
    if (cpAt && sim && (ev.key === "b" || ev.key === "B") && !ev.repeat && inMission() && $("ov-grav").hidden && !paused) { ev.preventDefault(); backToBridge(); return; }
    if (inTurret() && sim && ev.target.tagName !== "INPUT" && ev.target.tagName !== "SELECT") { if (sim.captain && !cpAt) bridgeKey(ev); else if (helmUi()) helmKey(ev); else turretKey(ev, true); return; }
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
      while (acc >= sim.dt && n < 10) { if (aiEngineer && cpAt !== "engine") aiEngineer.think(sim); if (flagBot && cmdView && sim.captain) flagBot.think(sim); sim.step(); acc -= sim.dt; n++; }
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
    if (cpAt && (sim.phase === "gravspace" || sim.phase === "done")) backToBridge();     // (warp space and the end find the captain on the bridge)
    if (sim.phase === "gravspace" && !gravShown) {
      gravShown = true;
      flashJump();
      setTimeout(function () { showGrav(false); }, 1000);
    } else if (sim.phase !== "gravspace") gravShown = false;
    if (sim.phase === "done" && !doneShown) {
      doneShown = true; running = false;
      report = null;
      if (!job.test && career) { report = BL.career.applyResult(career, job, sim.result); saveCareer(); }
      // A finished mission gets the last jump's report too (as every jump before it did), then the debriefing.
      if (sim.result.testWin) setTimeout(showDebrief, 300);
      else if (sim.result.outcome === "success") { flashJump(); setTimeout(function () { showGrav(true); }, 1600); }
      else setTimeout(showDebrief, sim.result.outcome === "abandoned" ? 400 : 1600);
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
  // An order on its way to the crew (Captain.orderProgress): the button blinks, a bar filling along its bottom.
  function orderBar(b, mine, p) {
    var on = mine && p !== null, i = b.querySelector(".cp-prog");
    b.classList.toggle("pend", on);
    if (!on) { if (i) i.remove(); return; }
    if (!i) { i = document.createElement("i"); i.className = "cp-prog"; b.appendChild(i); }
    i.style.width = pct(p);
  }
  function angle(p) { return Math.PI * (1 - clampN(p, 0, 150) / 150); }
  function arc(p0, p1) {
    var a0 = angle(p0), a1 = angle(p1);
    return "M" + (100 + 80 * Math.cos(a0)).toFixed(2) + " " + (105 - 80 * Math.sin(a0)).toFixed(2) +
      " A80 80 0 0 1 " + (100 + 80 * Math.cos(a1)).toFixed(2) + " " + (105 - 80 * Math.sin(a1)).toFixed(2);
  }
  function setText(el, txt) {
    if (el.textContent === txt) return;
    el.textContent = txt;
    if (el.parentNode && el.parentNode.classList && el.parentNode.classList.contains("row-label")) fitRow(el);
  }
  // A row label's value never wraps: if it doesn't fit beside the label, its font shrinks.
  function fitRow(el) {
    var row = el.parentNode; el.style.fontSize = "";
    if (!row.offsetParent) return;
    var size = parseFloat(getComputedStyle(el).fontSize);
    while (row.scrollWidth > row.clientWidth + 0.5 && size > 8) { size -= 0.5; el.style.fontSize = size + "px"; }
  }
  function setCls(el, cls) { if (el.className !== cls) el.className = cls; }
  function mmss(t) { var s = Math.floor(t); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  function render() {
    var ship = sim.ship, enc = sim.encounter() || {};
    // Header
    $("hd-jump").innerHTML = (sim.hasDrive ? "Warp" : "Sortie") + " <b>" + (sim.jumpIndex + 1) + "</b> of " + sim.cfg.jumps + " · <b>" + (enc.name || "") + "</b>";
    var ph = sim.phase === "arrival" ? "Engagement in " + Math.ceil(sim.cfg.arrivalSeconds - sim.t) + " s" :
      sim.phase === "countdown" ? "WARPING IN " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) :
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
      var s = sim.sys(id); return '<li class="' + (s.tripped ? "tripped" : "") + '">' + (multiRx() ? s.short + " (" + rxName(s) + ")" : s.name) + (s.tripped ? " ✖" : "") + "</li>";
    }).join("");
    if ($("trip-order").innerHTML !== trip) $("trip-order").innerHTML = trip;

    // Capacitors
    DISPLAY.forEach(function (id, i) {
      var s = sim.sys(id), r = capEls[id];
      setCls(r.root, "cap" + (i === selected ? " sel" : "") + (s.tripped ? " tripped" : ""));
      setText(r.nmLong, s.name); setText(r.nmShort, s.short);
      if (r.rxBtn) { setText(r.rxBtn, rxName(s)); var rk = s.split ? "all" : String(s.reactor); if (r.root.dataset.rx !== rk) r.root.dataset.rx = rk; }
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
    setText($("jump-label"), sim.isDrop() ? "DROP" : drive ? "WARP" : "RECOVERY");
    if (drive && sim.isDrop()) {          // the drop: the planet buster, not the drive
      var bz = sim.sys("buster"), bp = bz.mj / bz.maxMJ, ci = sim.dropClosesIn();
      setText($("jump-drive"), "buster " + Math.floor(bp * 100) + "%");
      $("jump-fill").style.width = pct(bp);
      if (wi > 0) { var bneed = (bz.maxMJ - bz.mj) / Math.max(1, wi); js = "Drop window opens in " + Math.ceil(wi) + " s" + (bp < 1 ? " · buster needs ~" + Math.ceil(bneed) + " MW from now" : " · buster ready"); if (bneed > bz.maxMW * 0.8) jc += " late"; }
      else { js = "⚠ DROP WINDOW OPEN: closes in " + Math.max(0, Math.ceil(ci)) + " s" + (bp < 1 ? " · buster " + Math.floor(bp * 100) + "%" : ""); jc += " late"; }
      setText($("jump-status"), js); setCls($("jump-status"), jc);
    } else if (drive) {
    setText($("jump-drive"), "drive " + Math.floor(dp * 100) + "%");
    $("jump-fill").style.width = pct(dp);
    if (sim.phase === "countdown") { js = "✔ Drive full. Warping in " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) + " s"; jc += " go"; }
    else if (sim.squadron === "out" && wi <= 0) { js = "⚠ Window OPEN: holding the warp until the squadron is aboard"; jc += " late"; }
    else if (sim.jumpIndex === sim.cfg.jumps - 1 && !sim.busterFull() && wi <= 0) { js = "⚠ Window OPEN: the planet buster isn't full · " + Math.floor(sim.sys("buster").mj / sim.sys("buster").maxMJ * 100) + "%"; jc += " late"; }
    else if (wi > 0) {
      var need = (drive.maxMJ - drive.mj) / Math.max(1, wi);
      js = "Window opens in " + Math.ceil(wi) + " s" + (dp < 1 ? " · drive needs ~" + Math.ceil(need) + " MW from now" : " · drive ready");
      var bst = sim.sys("buster");
      if (bst) js += " · buster " + Math.floor(bst.mj / bst.maxMJ * 100) + "%";
      if (need > drive.maxMW * 0.8) jc += " late";
    } else if (drive.mj >= drive.maxMJ - 0.5 && sim.captain) { var jv = sim.captain.jumpView(); js = "⚠ Window OPEN · drive ready" + (jv.why ? " · " + jv.why : ""); jc += " late"; }
    else { js = "⚠ Window OPEN: the bridge is waiting on the drive"; jc += " late"; }
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
        label = what + (e.late ? " OVERDUE · must be full · " + pc + "% · no warp until aboard" : e.open ? " NOW · must be full · " + pc + "% · " + Math.ceil(e.dur) + " s left" : " · must be full · " + pc + "% now" + secs);
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
    else if (sim.isDrop()) { setText(fj, wi > 0 ? (wi <= sim.cfg.jumpWindowNotice ? "Drop window in " + Math.ceil(wi) + " s ▶" : "") : "DROP WINDOW OPEN · closes in " + Math.max(0, Math.ceil(sim.dropClosesIn())) + " s · buster " + Math.floor(sim.sys("buster").mj / sim.sys("buster").maxMJ * 100) + "%"); setCls(fj, wi > 0 ? "fc-jump" : "fc-jump open"); }
    else if (sim.phase === "countdown") { setText(fj, "WARPING"); setCls(fj, "fc-jump"); }
    else if (wi > 0) { setText(fj, wi <= sim.cfg.jumpWindowNotice ? "Warp window in " + Math.ceil(wi) + " s ▶" : ""); setCls(fj, "fc-jump"); }
    else { setText(fj, "WARP WINDOW OPEN · drive " + Math.floor(sim.sys("drive").mj / sim.sys("drive").maxMJ * 100) + "%"); setCls(fj, "fc-jump open"); }
  }

  function speakNew() {
    var live = running && !paused && sim.phase !== "done";
    sim.log.forEach(function (l) {
      if (l.seq <= lastSpoken) return;
      lastSpoken = l.seq;
      if (live) BL.speech.say(l.text, l.kind, l.now);
    });
  }

  var lastLogBox = null;
  function renderComms() {
    var con = inConsole(), box = con ? $("comms-log") : $("tu-comms"), lines = con ? 9 : 6;
    if (box !== lastLogBox) { lastLogBox = box; lastLogKey = ""; }     // (the captain changing screens: fill the new one)
    speakNew();
    var log = sim.log, last = log[log.length - 1];
    var key = log.length + ":" + (last ? last.t + last.text : "");
    if (key === lastLogKey) return;
    lastLogKey = key;
    var icon = { warn: "⚠ ", bad: "✖ ", good: "✔ ", info: "" };
    box.innerHTML = log.slice(-lines).map(function (l) {
      return '<div class="' + l.kind + '"><span class="t">' + mmss(l.t) + "</span>" + icon[l.kind] + esc(l.text) + "</div>";
    }).join("");
    // (the oldest lines that don't fit are dropped whole, never shown cut in half)
    var hs = Array.prototype.map.call(box.children, function (d) { return d.offsetHeight; }), sum = hs.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; i < hs.length - 1 && sum > box.clientHeight; i++) { sum -= hs[i]; box.children[0].remove(); }
  }
  // A ship's name and hull number as HTML; the hull number never breaks, so a long name wraps it whole.
  function shipHtml(classId, ship, hull) { var h = hull || BL.hullNumber(classId, ship); return esc(ship) + (h ? ' <span class="nw">' + h + "</span>" : ""); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* ------------------------------------------------------- Gunner turret */
  var keysHeld = {}, tuCtx = null, tuSize = 0, tuW = 0, tuH = 0, lastTuDamage = -1;
  /* Wide view (W, ring view only): the side panels give way to an overlay and the battle fills
     the screen, turned a quarter turn so the bow points right. Standard view is the default;
     the choice is remembered. */
  function wideOn() { return !!(settings.wideView && sim && sim.turret && sim.turret.ring && !helmUi()); }
  function applyView() {
    var wide = wideOn();
    $("scr-turret").classList.toggle("wide", wide);
    $("tu-hud").hidden = !wide;
    $("btn-tu-view").hidden = !(sim && sim.turret && sim.turret.ring) || helmUi();
    $("btn-tu-view").textContent = wide ? "Standard view (W)" : "Wide view (W)";
    tuSize = 0; sizeTurret();
  }
  function toggleWide() { settings.wideView = !settings.wideView; saveSettings(); applyView(); click(); }
  function buildTurret() {
    var tu = sim.turret, w = tu.w;
    $("tu-station").textContent = "Gunnery · " + (job.test ? sim.data.className : BL.shipLabel(job.classId, job.ship, job.hull)) + " (TL" + sim.data.tl + ")";
    $("tu-rec-label").textContent = sim.hasDrive ? "WARP" : "RECOVERY";
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
    $("tu-comms").innerHTML = ""; lastLogKey = "";
    keysHeld = {}; setFireBtn(false);
    // The helm: its panel and wheel replace the gun panel; the gun buttons go.
    var helm = helmUi();
    // The helm's ship panel: the main gun's charge (the gunner sees it on the MAIN GUN button).
    $("tu-mainrow").hidden = !(helm && sim.turret.firesMain);
    $("tu-gunside").hidden = helm; $("tu-helm").hidden = !helm; $("hm-wheel").hidden = !helm; $("hm-strip").hidden = !helm;
    $("scr-turret").classList.toggle("helm", helm);
    bridgeSwap(false);
    $("cp-side").hidden = $("cp-mapbox").hidden = $("cp-orders").hidden = true; $("scr-turret").classList.remove("captain", "squad");
    $("btn-tu-call").hidden = $("btn-tu-fire").hidden = helm;
    $("hm-launch").hidden = true;
    $("btn-tu-bridge").hidden = !cpAt;
    if (cpAt === "gun") $("tu-keys").textContent = "B back to the bridge · " + $("tu-keys").textContent.replace(" · O orders", "");
    if (helm) {
      $("tu-tubes").hidden = true; $("btn-tu-main").hidden = true;
      $("tu-station").textContent = (sim.training ? "Pilot training · " : "Helm · ") + (job.test ? sim.data.className : BL.shipLabel(job.classId, job.ship, job.hull)) + " (TL" + sim.data.tl + ")";
      $("tu-keys").textContent = "← → wheel · 0 midships · ↑ ↓ both engines · Q A port · P L starboard · + − 1 G · T autopilot · [ ] course 1° · E warn engineering · Space launch · Esc pause · Drag the wheel · Tap the telegraph · Tap the compass for autopilot · Right strip: course on autopilot, wheel by hand";
      if (cpAt) $("tu-keys").textContent = "B back to the bridge · " + $("tu-keys").textContent;
      buildHelm();
      if (sim.captain && !cpAt) buildBridge();
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
    if (!(sim.captain ? sim.captain.takeGun(i) : tu.select(i))) return;     // (the captain at the guns: the man there is replaced)
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
    var cv = $("tu-canvas"), box = cv.parentNode, dpr = window.devicePixelRatio || 1;      // (the field, or the bridge's map box when swapped)
    var side = Math.floor(Math.max(120, Math.min(box.clientWidth, box.clientHeight)));
    var w = wideOn() ? Math.floor(Math.max(120, box.clientWidth)) : side, h = wideOn() ? side : side;
    // At the helm the view fills its whole column, top to bottom (the battle stays centered).
    if (sim && helmUi()) { w = Math.floor(Math.max(120, box.clientWidth - 2)); h = Math.floor(Math.max(120, box.clientHeight - 2)); }
    if (side === tuSize && w === tuW && h === tuH && tuCtx) return;
    tuSize = side; tuW = w; tuH = h;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    tuCtx = cv.getContext("2d");
    tuCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", function () { if (inTurret()) { tuSize = 0; sizeTurret(); } });

  // The compass strip at the far right (helm): sized to its box, drawn each frame.
  var stripCtx = null, stripW = 0, stripH = 0;
  function drawStrip() {
    var box = $("hm-strip-box"), cv = $("hm-strip-cv"), dpr = window.devicePixelRatio || 1, w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    if (w !== stripW || h !== stripH || !stripCtx) {
      stripW = w; stripH = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      stripCtx = cv.getContext("2d"); stripCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    BL.drawCompassStrip(stripCtx, w, h, sim.helm);
  }

  var lastJolt = 0;
  function renderTurret(ts) {
    if (sim.captain && !cpAt) { renderBridge(ts); return; }
    if (helmUi()) { renderHelm(ts); return; }
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
    $("tu-jump").innerHTML = (sim.hasDrive ? "Warp" : "Sortie") + " <b>" + (sim.jumpIndex + 1) + "</b> of " + sim.cfg.jumps + " · <b>" + (enc.name || "") + "</b>";
    setText($("tu-phase"), sim.phase === "arrival" ? (sim.hasDrive ? "Engagement in " : "Launching in ") + Math.ceil(sim.cfg.arrivalSeconds - sim.t) + " s" :
      sim.phase === "countdown" ? "WARPING IN " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) : sim.phase === "engage" ? "T+" + mmss(sim.t) : "");
    Array.prototype.forEach.call($("tu-bats").children, function (el, i) {
      var g = tu.gun(tu.bats[i]); el.querySelector(".mini i").style.width = pct(g.mj / g.baseMJ);
    });
    renderComms();
    // Gun
    $("tu-charge").style.height = pct(gun.mj / gun.baseMJ);
    setCls($("tu-charge"), "tu-lvl" + (gun.mj < w.shotMJ ? " low" : ""));
    setText($("tu-mj"), Math.floor(gun.mj) + " / " + gun.maxMJ + " MJ");
    var nShots = Math.floor(gun.mj / w.shotMJ);
    setText($("tu-shots"), nShots + (nShots === 1 ? " shot · " : " shots · ") + fmt(w.shotMJ) + " MJ each");
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
      setText($("tu-rec-val"), (wi > 0 ? "in " + Math.ceil(wi) + " s · " : "open · ") + Math.floor(drive.mj / drive.maxMJ * 100) + "%");
      $("tu-rec").style.width = pct(drive.mj / drive.maxMJ);
    } else {
      setText($("tu-rec-val"), Math.max(0, Math.ceil(wi)) + " s");
      $("tu-rec").style.width = pct(sim.t / sim.windowAt());
    }
    moabRow();
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
    setHtml($("hud-rec"), drive ? "WARP <b>" + (wi > 0 ? Math.ceil(wi) + " s" : "open") + "</b> · drive <b>" + Math.floor(drive.mj / drive.maxMJ * 100) + "%</b>" : "RECOVERY <b>" + Math.max(0, Math.ceil(wi)) + " s</b>");
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
  // Each line of a panel (.ln) on one line: shrink its font until it fits the box.
  function fitLines(box) {
    Array.prototype.forEach.call(box.querySelectorAll(".ln"), function (el) {
      el.style.fontSize = "";
      var size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 0.5 && size > 9) { size -= 1; el.style.fontSize = size + "px"; }
    });
  }
  // A panel's button labels never cut off (Nov 3, 2026, TexasBont: ABREAST was, on the iPad, whose
  // font is wider): a label that doesn't fit its button shrinks till it does. Measured again when the
  // window's size changes (fitKey).
  var fitKey = "";
  function fitButtons(box) {
    var key = innerWidth + "x" + innerHeight + ":" + box.offsetWidth + ":" + Array.prototype.filter.call(box.querySelectorAll(".cp-row button"), function (b) { return b.offsetParent; }).length;
    if (key === fitKey || !box.offsetWidth) return; fitKey = key;
    Array.prototype.forEach.call(box.querySelectorAll(".cp-row button"), function (b) {
      b.style.fontSize = ""; if (!b.offsetParent) return;
      var size = parseFloat(getComputedStyle(b).fontSize);
      while (b.scrollWidth > b.clientWidth + 0.5 && size > 7) { size -= 0.5; b.style.fontSize = size + "px"; }
    });
  }
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
  document.addEventListener("keyup", function (ev) { if (inTurret() && sim && !helmUi()) turretKey(ev, false); });
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
      // At the helm: tap the compass tape to steer to the heading tapped, on autopilot. (The
      // tape only shows the ship's heading: the course is set on the strip at the right.)
      if (sim && helmUi()) {
        if (turretActive()) {
          var cr = cv.getBoundingClientRect(), hd = BL.compassAt(ev.clientX - cr.left, ev.clientY - cr.top), hm = sim.helm;
          if (hd !== null) {
            compassDrag = { id: ev.pointerId, x: ev.clientX, tap: Math.round(hd), moved: false };
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
      if (sim && helmUi()) {
        var cd = compassDrag;
        if (cd && cd.id === ev.pointerId && Math.abs(ev.clientX - cd.x) >= 6) cd.moved = true;   // a slide isn't a tap
        return;
      }
      if (ev.pointerType === "mouse") {
        if (!turretActive()) return;
        if (sim.turret.ring) pointRing(ev); else sim.turret.aimAt(fieldX(ev));
      }
      else moveDrag(ev);
    });
    // The strip at the far right. On autopilot it's the heading set point, the whole 360 degrees
    // from bottom to top: drag it (headings rise upward; it moves with the finger) and the autopilot turns her onto the course; or tap a
    // heading. A finger resting on the screen wanders a pixel or two, so the course moves only
    // once the finger has moved `SET_DEAD` degrees. By hand it's a wheel sliding up and down:
    // the farther from where the finger came down, the more rudder (down for starboard).
    var SET_DEAD = 1, strip = $("hm-strip-cv"), stripDrag = null;
    strip.addEventListener("pointerdown", function (ev) {
      if (!sim || !sim.helm || !turretActive()) return;
      var r = strip.getBoundingClientRect(), hm = sim.helm, hd = BL.stripAt(ev.clientY - r.top);
      stripDrag = hm.auto ? { id: ev.pointerId, y: ev.clientY, set: true, tap: hd === null ? null : Math.round(hd), base: hm.autoHdg, raw: null, moved: false }
                          : { id: ev.pointerId, y: ev.clientY, set: false, base: hm.wheel, moved: false };
      try { strip.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    });
    strip.addEventListener("pointermove", function (ev) {
      var sd = stripDrag, dy = sd ? ev.clientY - sd.y : 0, hm = sim && sim.helm;
      if (!sd || sd.id !== ev.pointerId || !hm || !turretActive() || (!sd.moved && Math.abs(dy) < (sd.set ? 6 : 3))) return;
      sd.moved = true;
      if (!sd.set) { hm.setWheel(sd.base + dy / (strip.clientHeight * BL.STRIP_WHEEL)); return; }
      var raw = sd.base + dy / BL.stripScale();
      if (sd.raw !== null && Math.abs(raw - sd.raw) < SET_DEAD) return;
      sd.raw = raw;
      var set = (Math.round(raw) % 360 + 360) % 360;
      if (set !== hm.autoHdg) hm.setAuto(true, set);
    });
    function stripUp(ev) {
      var sd = stripDrag;
      if (!sd || sd.id !== ev.pointerId) return;
      if (sd.set && !sd.moved && sd.tap !== null && sim && sim.helm && turretActive()) sim.helm.setAuto(true, sd.tap);
      stripDrag = null;
    }
    strip.addEventListener("pointerup", stripUp); strip.addEventListener("pointercancel", stripUp);
    // The nudge buttons at the ends of the strip: the course one degree to starboard (▲) or port (▼).
    $("hm-nudge-up").addEventListener("click", function () { if (sim && sim.helm && turretActive()) { sim.helm.nudgeCourse(1); click(); } });
    $("hm-nudge-dn").addEventListener("click", function () { if (sim && sim.helm && turretActive()) { sim.helm.nudgeCourse(-1); click(); } });
    function mouseUp(ev) {
      if (compassDrag && compassDrag.id === ev.pointerId) {
        if (!compassDrag.moved && sim && sim.helm && turretActive()) { if (sim.captain && !cpAt) sim.captain.orderCourse(compassDrag.tap); else sim.helm.setAuto(true, compassDrag.tap); }
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
    var rows = BL.HELM.orders.slice().reverse(), h = sim.helm, R = sim.ship.reactors;
    // One bar per reactor, side by side: RX1, RX2, RX3.
    $("hm-rx-title").textContent = R.length > 1 ? "REACTORS" : "REACTOR";
    $("hm-rxs").innerHTML = R.map(function (rx, i) {
      return '<div class="rx"><div class="rxbar"><i class="ld"></i><i class="ht"></i><i class="mid"></i><i class="mk"></i></div><span>RX' + (i + 1) + "</span></div>";
    }).join("");
    $("hm-tele").innerHTML = '<span class="h">PORT</span><span class="h">BOTH</span><span class="h">STBD</span>' + rows.map(function (o) {
      var cls = o.f < 0 ? " astern" : "";
      return '<button class="side' + cls + '" data-side="port" data-ord="' + o.id + '" title="Port engine: ' + o.name.toLowerCase() + '">' + h.gOf(o.id) + '</button>' +
        '<button class="mid' + cls + '" data-side="both" data-ord="' + o.id + '" title="Both engines: ' + o.name.toLowerCase() + '">' + o.name + "</button>" +
        '<button class="side' + cls + '" data-side="stbd" data-ord="' + o.id + '" title="Starboard engine: ' + o.name.toLowerCase() + '">' + h.gOf(o.id) + "</button>";
    }).join("");
  }
  function renderHelm(ts) {
    var tu = sim.turret, h = sim.helm, ship = sim.ship, enc = sim.encounter() || {};
    $("btn-tu-exit").hidden = !sim.training; $("btn-tu-testwin").hidden = !!sim.training;
    tu.effects.forEach(function (f) {
      if (f.type === "hullHit" && f.at > lastJolt) {
        lastJolt = f.at; var el = $("scr-turret");
        el.classList.remove("jolt"); void el.offsetWidth; el.classList.add("jolt");
        if (navigator.vibrate) try { navigator.vibrate([60, 40, 90]); } catch (e) {}
      }
    });
    sizeTurret();
    BL.drawRing(tuCtx, { w: tuW, h: tuH, wide: false }, sim, tu, ts);
    drawStrip();
    $("tu-jump").innerHTML = sim.training ? "<b>Training course</b>" : (sim.hasDrive ? "Warp" : "Sortie") + " <b>" + (sim.jumpIndex + 1) + "</b> of " + sim.cfg.jumps + " · <b>" + (enc.name || "") + "</b>";
    setText($("tu-phase"), h.inTube ? "IN THE TUBE: LAUNCH WHEN READY" : sim.phase === "arrival" ? "Engagement in " + Math.ceil(sim.cfg.arrivalSeconds - sim.t) + " s" :
      sim.phase === "countdown" ? "WARPING IN " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) : sim.phase === "engage" ? "T+" + mmss(sim.t) : "");
    renderComms();
    // The captain's order
    var o = h.orderView(), ob = $("hm-order"), oh;
    if (o) {
      var ok = h.onOrder({ hdg: o.hdg, eng: o.eng });
      // Three short lines, readable at a glance: when, heading, engines, each part ticked once
      // it's right (crossed while the order is under way and it isn't). Tap to fly it on autopilot.
      var oe = { hdg: o.hdg, eng: o.eng };
      function tick(on) { return on ? ' <span class="ok">✔</span>' : o.active ? ' <span class="no">✗</span>' : ""; }
      oh = '<div class="ln">' + (o.active ? "NOW · hold " + Math.ceil(o.left) + "s" : "In " + Math.ceil(o.in) + "s") + "</div>" +
        '<div class="ln"><b>' + (o.turn > 0 ? "Right " : "Left ") + BL.hdgText(o.hdg) + "</b>" + tick(h.onHeading(oe)) + "</div>" +
        '<div class="ln">All ahead ' + h.preset(o.eng).name + tick(h.onEngines(oe)) + "</div>";
      setCls(ob, "hm-order" + (o.active ? " active" : "") + (ok ? " ok" : ""));
    } else if (h.engOrder) {
      oh = '<div class="ln">NOW · ' + Math.max(0, Math.ceil(h.engOrder.until - sim.t)) + "s</div>" +
        '<div class="ln"><b>All ahead ' + h.preset(h.engOrder.eng).name + "</b></div>";
      setCls(ob, "hm-order active");
    } else {
      // No order: the last order's verdict for a few seconds, then the course that stands: STEADY
      // (lined up for the jump, 5° either side) or COURSE (the corridor, 30° either side).
      var vd = h.verdict && sim.t < h.verdict.until ? h.verdict : null, sv = h.steadyView(), cv = h.corridorView();
      oh = vd ? '<div class="ln">' + vd.text + (vd.met ? ' <span class="ok">✔</span>' : ' <span class="no">✗</span>') + "</div>" : "";
      if (h.inTube) oh += '<div class="ln">IN THE TUBE</div><div class="ln">Launch when ready</div>';
      else if (cv) {
        var inC = h.inCorridor() ? ' <span class="ok">✔</span>' : ' <span class="no">✗</span>';
        oh += '<div class="ln">' + (sv ? "STEADY" : "COURSE") + '</div><div class="ln"><b>' + BL.hdgText(cv.hdg) + " ±" + cv.width + "°</b>" + inC + "</div>";
      } else oh += '<div class="ln">FREE HELM</div><div class="ln">Fight the ' + (sim.hasDrive ? "ship" : "boat") + "</div>";
      setCls(ob, "hm-order" + (sv && !h.inTube ? " active" : ""));
    }
    // Training: the next buoy instead of an order.
    var tr = sim.trainer, nv = tr && tr.nextView();
    if (tr) {
      oh = '<div class="ln">TRAINING · T+' + mmss(sim.t) + "</div>" + (nv ? '<div class="ln"><b style="color:' + (nv.red ? "#ff4d4d" : "#3dff7a") + '">' + (nv.red ? "RED: keep it to port" : "GREEN: keep it to starboard") + "</b></div>" +
        '<div class="ln">' + (Math.abs(nv.rel) < 3 ? "Dead ahead" : Math.round(Math.abs(nv.rel)) + "° " + (nv.rel > 0 ? "right" : "left")) + " · " + (nv.secs < 99 ? Math.ceil(nv.secs) + " s" : "far") + "</div>" : "");
      setCls(ob, "hm-order");
    }
    if (ob.innerHTML !== oh) { ob.innerHTML = oh; fitLines(ob); }
    // Alerts: the captain's break order (or "Steady"), the jump heading (tap it to fly it on autopilot)
    var al = [], D = BL.HELM.dodge, ev = h.evadeView(), inbound = tu.torps.filter(function (tp) { return tp.ev && tp.ev.type === "salvo" && !tp.ev.done && !tp.mine; });
    // Slot 1: torpedoes. Slot 2 (ships with a drive): the jump heading. Empty slots keep their space.
    // Each slot: one or two short lines (<span>), centered top to bottom.
    var slot1 = '<div class="empty"></div>';
    if (ev && ev.left > 0) slot1 = '<div class="torp"><span>⚠ BREAK ' + (ev.dir > 0 ? "RIGHT" : "LEFT") + " NOW: " + ev.left.toFixed(1) + " s</span><span>" + Math.round(ev.off) + "° of " + D.turn + "°</span></div>";
    else if (inbound.length)
      slot1 = '<div class="hold"><span>' + inbound.length + (inbound.length === 1 ? " torpedo" : " torpedoes") + " inbound.</span>" + (h.corridorView() ? "<span>Dodge inside the corridor.</span>" : "") + "</div>";
    al.push(slot1);
    var jv = h.jumpView();
    if (h.jumpHdg !== null) al.push(!jv ? '<div class="empty"></div>' : '<div class="jump' + (jv.on ? "" : jv.in < 30 ? " off" : "") + '" data-hdg="' + jv.hdg + '"><span>Warp heading <b>' + BL.hdgText(jv.hdg) + "</b>" + (jv.on ? " ✔" : "") + "</span><span>" +
      (jv.in > 0 ? "Window in " + Math.ceil(jv.in) + " s" : "Window open") + "</span></div>");
    if (tr) {
      var ts2 = tr.stats, rt = tr.rating();
      al = ['<div class="hold"><span>✔ ' + ts2.passed + " · wrong side " + ts2.wrong + " · hit " + ts2.hit + " · missed " + ts2.missed + "</span><span>Streak " + ts2.streak + " · " + rt.name + (tr.total() ? " " + rt.pct + "%" : "") + "</span></div>"];
    }
    setHtml($("hm-alerts"), al.join(""));
    // Telegraph and thrust
    Array.prototype.forEach.call($("hm-tele").querySelectorAll("button"), function (b) {
      var id = b.dataset.ord, side = b.dataset.side;
      b.classList.toggle("on", side === "both" ? h.port.ord === id && h.stbd.ord === id : h[side].ord === id);
      if (side !== "both") setText(b, String(h.gOf(id)));
    });
    setText($("hm-tele-txt"), h.telegraph());
    setText($("hm-gval"), "ordered " + fmtG(h.port.g) + " / " + fmtG(h.stbd.g) + " G");
    var th = ship.thrust, dmg = [];
    if (th.port < 0.995) dmg.push("Port " + Math.round(th.port * 100) + "%");
    if (th.stbd < 0.995) dmg.push("Stbd " + Math.round(th.stbd * 100) + "%");
    $("hm-engdmg").hidden = !dmg.length;
    setText($("hm-engdmg"), "⚠ Engine damage: " + dmg.join(" · ") + " · giving " + fmtG(h.out.port) + " / " + fmtG(h.out.stbd) + " G");
    setText($("hm-thrust"), fmtG(ship.g) + " G · " + Math.round(ship.engineMW) + " MW" + (ship.starved ? " · STARVED" : ""));
    $("hm-thrust-fill").style.width = pct(ship.g / (h.full() * 1.1));
    var rxEls = $("hm-rxs").children;
    ship.reactors.forEach(function (rx, i) {
      var el = rxEls[i]; if (!el) return;
      var ld = el.querySelector(".ld"), ht = el.querySelector(".ht");
      ld.style.width = pct(Math.min(1, rx.loadPct / 100)); ld.classList.toggle("over", rx.loadPct > 100);
      ht.style.width = pct(Math.min(1, rx.heat / 100)); ht.classList.toggle("hot", rx.heat >= BL.PHYSICS.alarmHeat);
    });
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
    if (drive) { setText($("tu-rec-val"), (wi > 0 ? "in " + Math.ceil(wi) + " s · " : "open · ") + Math.floor(drive.mj / drive.maxMJ * 100) + "%"); $("tu-rec").style.width = pct(drive.mj / drive.maxMJ); }
    else { setText($("tu-rec-val"), Math.max(0, Math.ceil(wi)) + " s"); $("tu-rec").style.width = pct(sim.t / sim.windowAt()); }
    moabRow();
    var ms = tu.mainState();
    if (ms) {
      setText($("tu-main-val"), ms.tripped ? "tripped" : ms.ready ? "READY · " + Math.round(ms.mj) + " MJ" : Math.round(ms.mj) + " / " + Math.round(ms.max) + " MJ");
      $("tu-main-bar").style.width = pct(ms.mj / ms.max);
    }
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
    // Training: no jump, no fight; the buoy tally instead.
    $("tu-rec-label").parentNode.hidden = $("tu-rec").parentNode.hidden = !!sim.training;
    if (sim.trainer) {
      var trs = sim.trainer.stats, trr = sim.trainer.rating();
      setHtml($("tu-tally"), "<span>Buoys passed</span><b>" + trs.passed + " / " + sim.trainer.total() + "</b><span>Wrong side</span><b>" + trs.wrong + "</b><span>Hit</span><b>" + trs.hit + "</b>" +
        "<span>Missed</span><b>" + trs.missed + "</b><span>Best streak</span><b>" + trs.best + "</b>" + '<span class="' + (h.stats.stressHits ? "bad" : "") + '">Structural hits</span><b>' + h.stats.stressHits + "</b>" +
        "<span>Rating</span><b>" + trr.name + (sim.trainer.total() ? " " + trr.pct + "%" : "") + "</b>");
    }
  }
  /* ------------------------------------------------------------ The bridge
     The captain (command.js): the ring view as at the helm, to watch (tap its compass to order
     a course); the BRIDGE panel at the left, three short lines per station; the map over the
     SHIP panel at the right (tap it to steer for a point, drag to pan, + - FIT to zoom; SWAP
     puts the map in the middle and the battle view in its box); the orders along the bottom.
     Before each system, in warp space with the clock stopped, the plotting screen. */
  var BRIDGE_ENG = ["stop", "deadSlow", "cruise", "standard", "full", "flank"];
  // The engineer's stances this ship has (MAIN GUN on a ship with a main gun, DRIVE on one with a warp drive).
  function bridgeStances() { return BL.COMMAND.stanceList.filter(function (id) { return (id !== "drive" || sim.hasDrive) && (id !== "main" || !!sim.sys("main")) && (id !== "moab" || !!sim.sys("buster")); }); }
  function buildBridge() {
    var h = sim.helm, G = BL.GUNNERY, K = BL.COMMAND;
    $("tu-helm").hidden = $("hm-wheel").hidden = $("hm-strip").hidden = true;
    $("scr-turret").classList.remove("helm"); $("scr-turret").classList.add("captain"); $("scr-turret").classList.toggle("squad", !!sim.flag);     // (a squadron: a wider BRIDGE column for its ships)
    $("cp-side").hidden = $("cp-mapbox").hidden = false; $("cp-orders").hidden = true;      // (every order is in the BRIDGE column)
    $("tu-station").textContent = "Bridge · " + (job.test ? sim.data.className : BL.shipLabel(job.classId, job.ship, job.hull)) + " (TL" + sim.data.tl + ")";
    var hasMain = !!sim.sys("main"), hasHangar = !!(sim.sys("hangar") && sim.data.hangar);
    $("tu-keys").textContent = "← → course 10° (Shift 1°) · R resume plot · ↑ ↓ engines · Z break port · X take it · C break starboard · " + (hasMain ? "M main gun · " : "") + (hasHangar ? "L launch / recover · " : "") + (sim.helm.canBreak(BL.GUNNERY.torpedo.travel) ? "B pilot · " : "") + "G gunners · S engineer · E warn engineering · J warp · V swap map · + − F zoom · Esc pause · Tap the compass or the map to steer";
    // Light cruiser and up: MAIN GUN; cruiser and up: LAUNCH / RECOVER the squadron.
    $("cp-main").hidden = !hasMain; $("cp-hangar").hidden = !hasHangar; $("cp-ship-grp").hidden = !hasMain && !hasHangar;
    $("cp-tele").innerHTML = BRIDGE_ENG.slice().reverse().map(function (id) { var p = h.preset(id); return '<button data-eng="' + id + '" title="All ' + p.name.toLowerCase() + '">' + p.short + "</button>"; }).join("");
    $("cp-gunord").innerHTML = G.orderList.map(function (id) { var o = G.orders[id]; return '<button data-gun="' + id + '" title="' + o.name + '">' + K.gunShort[id] + "</button>"; }).join("");
    $("cp-stance").innerHTML = bridgeStances().map(function (id) { return '<button data-stance="' + id + '" title="' + K.stances[id].name + '">' + K.stances[id].short + "</button>"; }).join("");
    $("tu-mainrow").hidden = true;
    lastBridgeBox = {};
    bridgeSwap(true);               // the map in the middle, the battle in the box at the right (SWAP for the other way)
    // Escort (a gunboat screening the carrier): the station buttons and COVER.
    // A ship that can't swing far enough before a torpedo lands (light cruiser and up) never
    // breaks: no break buttons; her shields take every burst.
    canBreakEver = sim.helm.canBreak(BL.GUNNERY.torpedo.travel);
    $("cp-brk-row").hidden = $("cp-pilot-row").hidden = !canBreakEver;
    $("cp-pilot-row").innerHTML = K.pilotList.map(function (id) { return '<button data-pilot="' + id + '" title="Pilot: ' + K.pilots[id].name + ' (B)">' + K.pilots[id].short + "</button>"; }).join("");
    var esc = !!sim.captain.escort && !sim.captain.escort.flag;     // (an escort mission; a squadron has no ward to keep station on)
    $("cp-station-grp").hidden = $("cp-cover").hidden = !esc;
    $("cp-station").innerHTML = esc ? STATION_LIST.map(function (id, k) { return '<button data-station="' + id + '" title="Keep station ' + STATION_NAME[id] + " (" + (k + 1) + ')">' + STATION_SHORT[id] + "</button>"; }).join("") : "";
    // STATIONS (D): drop down to the engine room, the helm or a gun (E, H, the gun's number).
    dropPick = false;
    $("cp-drop-pick").innerHTML = '<button data-drop="engine" title="Run the engine room yourself (E)">ENGINE <small>(E)</small></button><button data-drop="helm" title="Take the helm yourself (H)">HELM <small>(H)</small></button>' +
      sim.turret.bats.map(function (b, i) { return '<button data-drop="gun" data-gun="' + i + '" title="Take Gun ' + b.gunNo + " yourself (" + b.gunNo + ')">GUN ' + b.gunNo + " <small>(" + b.gunNo + ")</small></button>"; }).join("");
    setHtml($("cp-resume"), "RESUME <small>(R)</small>");
    $("cp-resume").title = esc ? "Back to your station (R)" : "Back to the plotted course (R)";
    // A squadron: the formation buttons; then the commander's view or the flagship's bridge.
    // (SPEED: the squadron's engine order, flank at the top left down to stop)
    var spd = BRIDGE_ENG.slice().reverse().map(function (id) { var p = h.preset(id); return '<button data-eng="' + id + '" title="Squadron speed: all ' + p.name.toLowerCase() + ' (↑ ↓)">' + p.short + "</button>"; });
    $("cp-sq-speed1").innerHTML = sim.flag ? spd.slice(0, 4).join("") : ""; $("cp-sq-speed2").innerHTML = sim.flag ? spd.slice(4).join("") : "";     // (four, then two beside FLAG BRIDGE)
    $("cp-sq-form").innerHTML = sim.flag ? K.squad.formationList.map(function (id) { return '<button data-form="' + id + '" title="' + K.squad.formations[id].name + ' (O)">' + K.squad.formations[id].btn + "</button>"; }).join("") : "";
    bridgeKeys = $("tu-keys").textContent; shipGrp = !$("cp-ship-grp").hidden;
    applyCmd();
  }
  // Commanding the squadron or on the flagship's bridge: in command the flag captain's own orders
  // (torpedoes, main gun, hangar, engineering, stations) are his, so their buttons go; the
  // telegraphs stay to show what his ship is doing (the engines are the squadron's speed).
  var bridgeKeys = "", shipGrp = false;
  function applyCmd() {
    var sq = !!sim.flag, cmd = sq && cmdView;
    $("cp-sq").hidden = !cmd; $("cp-sq-back-row").hidden = !sq || cmd;
    $("cp-sec-torp").hidden = cmd; $("cp-teles").hidden = cmd; $("cp-warn").hidden = cmd; $("cp-drop").hidden = cmd; $("cp-ship-grp").hidden = cmd || !shipGrp;
    if (cmd) dropPick = false;
    $("tu-station").textContent = (cmd ? "Squadron · " : sq ? "Flag bridge · " : "Bridge · ") + (job.test ? sim.data.className : BL.shipLabel(job.classId, job.ship, job.hull)) + " (TL" + sim.data.tl + ")";
    $("tu-keys").textContent = cmd ? "← → course 10° (Shift 1°) · R resume plot · ↑ ↓ engines · 1 to " + sim.captain.escort.n + " select a ship · A all · then tap a target or a spot on the map · Z recall · X hold fire · C clear · O formation · [ ] close up, open out · L dress the line · J warp · D flag bridge · V swap map · + − F zoom · Esc pause"
      : bridgeKeys + (sq ? " · Q back to the squadron" : "");
    lastBridgeBox = {};
  }
  // FLAG BRIDGE (D): drop down to captain the flagship (once a mission it costs, Captain.stats.flagBridge); SQUADRON (Q) back.
  function toFlagBridge() {
    var c = sim.captain;
    if (!sim.flag || !cmdView || !turretActive() || !c.canDrop()) return;
    cmdView = false; c.stats.flagBridge = true; click(); applyCmd();
  }
  function toSquadron() {
    if (!sim.flag || cmdView || cpAt) return;
    cmdView = true; click(); applyCmd();
  }
  // The squadron's box: the formation, a warning, the flagship's line and each ship's (tap to
  // select; then tap a target or a spot on the map to send them), RECALL / HOLD FIRE / CLEAR for
  // the ships selected, the card of a target tapped with none selected, SPEED, FLAG BRIDGE.
  // (sqSel: ship numbers selected, 1 the flagship; sqTgt: the target whose card is up)
  var sqSel = [], sqTgt = null;
  function renderSquad(live) {
    var c = sim.captain, v = c.squadView(), Q = BL.COMMAND.squad;
    if (!v || !cmdView) return;
    var home = 1 + v.ships.filter(function (x) { return x.live; }).length;
    sqSel = sqSel.filter(function (n) { return n === 1 || v.ships.some(function (x) { return x.no === n && x.live; }); });
    setText($("cp-sq-hd"), "SQUADRON · " + home + " of " + (v.ships.length + 1));
    var left = c.sqGroups().length, obj = c.sqGroups().filter(function (T) { return T.K.objective; }).length;
    cpLine("cp-sq-ln", "<b>" + Q.formations[v.form].short + "</b> · spacing " + Math.round(v.spacing * 100) + "% · " + left + " target" + (left === 1 ? "" : "s") + " left" + (sim.sys("buster") ? "" : obj ? " · objective standing" : " · <span style='color:#3dff7a'>objective down</span>"));
    cpLine("cp-sq-ln2", v.alert ? "⚠ " + esc(v.alert) : ""); $("cp-sq-ln2").hidden = !v.alert;     // (no blank line when there's no alert)
    var pendForm = v.ships.some(function (x) { return x.pend; });
    Array.prototype.forEach.call($("cp-sq-form").children, function (b) { b.classList.toggle("on", b.dataset.form === v.form); b.classList.toggle("pend", b.dataset.form === v.form && pendForm); b.disabled = !live; });
    var stPend = v.ships.some(function (x) { return x.stPend; });
    $("cp-sq-close").disabled = !live || !v.canClose; $("cp-sq-open").disabled = !live || !v.canOpen; $("cp-sq-dress").disabled = !live;
    ["cp-sq-close", "cp-sq-open", "cp-sq-dress"].forEach(function (id) { $(id).classList.toggle("pend", stPend); });
    fitButtons($("cp-sq-form").closest(".cp-side"));
    // (the flagship's line: her flag captain, hull and shields, what she's doing)
    var sh = sim.sys("shield"), fh = Math.round(100 * sim.ship.hull / sim.ship.hullMax), fg = c.flagGo, fT = fg && fg.kind === "target" ? c.sqTargets[fg.id] : null;
    var fdo = fT ? "→ " + fT.letter + " " + fT.K.name.toLowerCase() : fg ? "→ a spot" : "flagship · on " + (c.helmView().own ? "your course" : "the plot");
    var flagLn = '<button data-sel="1" class="flagrow' + (sqSel.indexOf(1) >= 0 ? " sel" : "") + '" title="The flagship: ' + esc(v.flag.name) + ", your " + cap(sim.data.classId, "flag captain") + '. Tap to select her (1)"' + (live ? "" : " disabled") + "><b>1</b> " + esc(v.flagName) + " " + fh + "% · sh " + Math.round(100 * sh.mj / sh.maxMJ) + "% <span>· " + fdo + "</span>" +
      '<i class="' + (fh < 35 ? "low" : "") + '" style="width:' + fh + '%"></i></button>';
    cpHtml("cp-sq-ships", flagLn + v.ships.map(function (x) {
      var h = Math.round(x.hull * 100), sel = sqSel.indexOf(x.no) >= 0;
      return '<button data-sel="' + x.no + '" class="' + (x.live ? "" : "lost") + (sel ? " sel" : "") + (x.pend ? " pend" : "") + '" title="' + esc(x.cap.name) + ", " + x.cap.label + " (skill " + Math.round(x.cap.skill * 100) + "), " + x.cap.temper + " temper" +
        (x.live ? ". Tap to select her (" + x.no + ")" : "") + '"' + (x.live && live ? "" : " disabled") + "><b>" + x.no + "</b> " + esc(x.name) + (x.live ? " " + h + "%" : "") + "<br><span>" + esc(x.doing) + "</span>" +
        (x.live ? '<i class="' + (h < 35 ? "low" : "") + '" style="width:' + h + '%"></i>' : "") + "</button>";
    }).join(""));
    var any = sqSel.length > 0;
    $("cp-sq-all").disabled = !live;
    $("cp-sq-selrow").hidden = !any;
    ["cp-sq-recall", "cp-sq-hold", "cp-sq-clear"].forEach(function (id) { $(id).disabled = !live; });
    var holding = sqSel.length && sqSel.every(function (n) { var x = v.ships.filter(function (s) { return s.no === n; })[0]; return x && x.hold; });
    setHtml($("cp-sq-hold"), holding ? "OPEN FIRE" : "HOLD FIRE");
    // The target card: what it is, how strong, what it's firing on, who's sent, and the guns that bear each way.
    var T = !any && sqTgt !== null ? c.sqTargets[sqTgt] : null;
    $("cp-sq-card").hidden = !T; $("cp-sq-allrow").hidden = any || !!T;     // (ALL SHIPS with none selected; the card, or the selected ships' orders, in its place)
    if (T) {
      var tv = c.targetView(T);
      cpHtml("cp-sq-card", "<b>" + tv.letter + " · " + esc(tv.name) + "</b>" + (tv.objective ? " · objective" : "") + "<br>" +
        // (its facts run on, " · " between, so the card takes few lines in the column)
        (tv.dead ? "Destroyed" : (tv.seen ? "Seen" : tv.known ? "Pickets' report" : "Not in the report") + " · " + (tv.known ? tv.pct + "% strength" : "strength unknown") + " · " +
        (tv.known ? (tv.moves ? "Moves" : "Fixed") + " · " + tv.guns + " guns · range " + tv.range + " · " : "") +
        (tv.on ? "Firing on " + tv.on + " · " : "") + "Sent: " + (tv.sent.length ? tv.sent.map(esc).join(", ") : "none") +
        (tv.seen ? '<br>Guns bearing: <span class="num ours">' + tv.ours + '</span> vs <span class="num theirs">' + tv.theirs + "</span>" : "")));
    }
    var eng = c.helmView().eng;
    ["cp-sq-speed1", "cp-sq-speed2"].forEach(function (id) { Array.prototype.forEach.call($(id).children, function (b) { b.classList.toggle("on", b.dataset.eng === eng); b.disabled = !live; }); });
    $("cp-sq-bridge").disabled = !live || !c.canDrop();
  }
  // Selecting ships (1 the flagship) and sending them.
  function sqToggle(no) { var i = sqSel.indexOf(no); if (i >= 0) sqSel.splice(i, 1); else sqSel.push(no); sqTgt = null; click(); }
  function sqAll() { var c = sim.captain; sqSel = [1].concat(c.sqLive().map(function (g) { return g.no; })); click(); }
  function sqSend(T) {
    var c = sim.captain, nos = sqSel.filter(function (n) { return n !== 1; });
    if (nos.length) c.sendTo(nos, T.id);
    if (sqSel.indexOf(1) >= 0) c.flagTo({ kind: "target", id: T.id });
    sqSel = []; sqTgt = T.id;
  }
  function sqSpot(p) {
    var c = sim.captain, nos = sqSel.filter(function (n) { return n !== 1; }), grp = c.sendSpot(nos, p);
    if (sqSel.indexOf(1) >= 0) c.flagTo({ kind: "spot", spot: grp, k: grp.n++ });
    sqSel = [];
  }
  function sqRecall() { var c = sim.captain; c.recall(sqSel.filter(function (n) { return n !== 1; })); if (sqSel.indexOf(1) >= 0) c.resumePlot(); sqSel = []; }
  function sqHold() {
    var c = sim.captain, nos = sqSel.filter(function (n) { return n !== 1; }), v = c.squadView();
    var all = nos.length && nos.every(function (n) { var x = v.ships.filter(function (s) { return s.no === n; })[0]; return x && x.hold; });
    c.setHold(nos, !all);
  }
  // The targets on a map (frame fr): a glyph for each kind where it shows (solid when our ships
  // see it, dashed from the report or where it was last seen, "?" an unknown contact), its letter
  // (and name and strength in the big map), and for one we see or have picked, its gun range and
  // the arcs its guns bear through, and its heading. plan: the plotting screen (the report only).
  // occ: the boxes of what's already written on the map (BL.drawNavMap's labels); each label goes
  // in the first clear place round its target (right, left, above, below), on a dark backing, so no
  // text lands on other text.
  function drawTargets(ctx, fr, list, big, c, plan, occ) {
    var cs = c.cs(), mono = "ui-monospace, Menlo, Consolas, monospace";
    occ = occ || [];
    list.forEach(function (T) { var q = fr.toPx(plan ? T.rep : c.shownAt(T)), r = (big ? 7 : 5) + 5; occ.push({ x0: q.x - r, y0: q.y - r, x1: q.x + r, y1: q.y + r }); });
    function place(lines, p, r) {
      ctx.font = "600 " + (big ? 11 : 10) + "px " + mono; ctx.textAlign = "left"; ctx.textBaseline = "top";
      var lh = big ? 13 : 12, wd = Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l[0]).width; })), ht = lines.length * lh;
      var cands = [[p.x + r + 6, p.y - ht / 2], [p.x - r - 6 - wd, p.y - ht / 2], [p.x - wd / 2, p.y - r - 6 - ht], [p.x - wd / 2, p.y + r + 6],
        [p.x + r + 6, p.y - r - ht], [p.x + r + 6, p.y + r], [p.x - r - 6 - wd, p.y - r - ht], [p.x - r - 6 - wd, p.y + r]];
      // (a label past the map's edge would be cut off: what's outside counts heavily against it)
      var k = ctx.getTransform().a || 1, cw = ctx.canvas.width / k, ch = ctx.canvas.height / k;
      function over(b) {
        var out = (b.x1 - b.x0) * (b.y1 - b.y0) - Math.max(0, Math.min(b.x1, cw) - Math.max(b.x0, 0)) * Math.max(0, Math.min(b.y1, ch) - Math.max(b.y0, 0));
        return 100 * out + occ.reduce(function (a, o) { return a + Math.max(0, Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0)) * Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0)); }, 0);
      }
      var best = null, bo = Infinity;
      cands.forEach(function (cd) { var b = { x0: cd[0] - 3, y0: cd[1] - 2, x1: cd[0] + wd + 3, y1: cd[1] + ht + 2 }, o = over(b); if (o < bo) { bo = o; best = b; } });
      ctx.fillStyle = "rgba(5,8,12,.78)"; ctx.fillRect(best.x0, best.y0, best.x1 - best.x0, best.y1 - best.y0);
      lines.forEach(function (l, i) { ctx.fillStyle = l[1]; ctx.fillText(l[0], best.x0 + 3, best.y0 + 2 + i * lh); });
      occ.push(best);
    }
    list.forEach(function (T) {
      var at = plan ? T.rep : c.shownAt(T), p = fr.toPx(at), sel = !plan && sqTgt === T.id, s = big ? 7 : 5;
      ctx.font = "600 " + (big ? 11 : 10) + "px " + mono; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      if (T.dead) {
        ctx.strokeStyle = "rgba(255,107,107,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s); ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); ctx.stroke();
        place([[T.letter, "rgba(255,179,168,.5)"]], p, s); return;
      }
      var known = !T.unknown || (!plan && (T.seen || T.last));
      if (!known) {
        ctx.strokeStyle = "#9aa6b2"; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p.x, p.y, s + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#9aa6b2"; ctx.textAlign = "center"; ctx.fillText("?", p.x, p.y + 1);
        if (sel) { ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, s + 9, 0, Math.PI * 2); ctx.stroke(); }
        return;
      }
      var solid = !plan && T.seen, R = T.K.range * cs;
      if (solid || sel) {
        ctx.strokeStyle = "rgba(255,107,107,.35)"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(p.x, p.y, R * fr.s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        T.K.guns.forEach(function (g) {
          if (g[1] >= 180) return;
          ctx.fillStyle = "rgba(255,90,70,.10)"; ctx.strokeStyle = "rgba(255,107,107,.4)"; ctx.beginPath(); ctx.moveTo(p.x, p.y);
          for (var k = 0; k <= 10; k++) { var q = fr.toPx(BL.alongMap(at, T.hdg + g[0] - g[1] + 2 * g[1] * k / 10, R)); ctx.lineTo(q.x, q.y); }
          ctx.closePath(); ctx.fill(); ctx.stroke();
        });
      }
      ctx.strokeStyle = "#ff6b6b"; ctx.fillStyle = "#ff6b6b"; ctx.lineWidth = 1.5; if (!solid) ctx.setLineDash([3, 2]);
      var kind = T.kind;
      function tri(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); solid ? ctx.fill() : ctx.stroke(); }
      if (kind === "depot") { ctx.beginPath(); ctx.moveTo(p.x, p.y - s - 2); ctx.lineTo(p.x + s + 2, p.y); ctx.lineTo(p.x, p.y + s + 2); ctx.lineTo(p.x - s - 2, p.y); ctx.closePath(); solid ? ctx.fill() : ctx.stroke(); }
      else if (kind === "siege") [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { var x = p.x + q[0] * s * 0.6 - s * 0.45, y = p.y + q[1] * s * 0.6 - s * 0.45; solid ? ctx.fillRect(x, y, s * 0.9, s * 0.9) : ctx.strokeRect(x, y, s * 0.9, s * 0.9); });
      else if (kind === "raiders") { tri(p.x - s, p.y + 2, s * 0.6); tri(p.x + s, p.y + 2, s * 0.6); tri(p.x, p.y - s * 0.6, s * 0.6); }
      else if (kind === "interceptors") { tri(p.x - s * 0.6, p.y, s * 0.5); tri(p.x + s * 0.6, p.y, s * 0.5); }
      else if (kind === "frigate") { for (var f = -1; f <= 1; f++) { var fp = fr.toPx(BL.alongMap(at, T.hdg, f * 0.02 * c.map().D)); ctx.beginPath(); ctx.arc(fp.x, fp.y, f === 1 ? s * 0.75 : s * 0.55, 0, Math.PI * 2); solid ? ctx.fill() : ctx.stroke(); } }
      else { [[-1, 0], [1, 0], [0, -1]].forEach(function (q) { ctx.beginPath(); ctx.arc(p.x + q[0] * s * 0.8, p.y + q[1] * s * 0.8, s * 0.4, 0, Math.PI * 2); solid ? ctx.fill() : ctx.stroke(); }); }
      ctx.setLineDash([]);
      if (solid && T.K.speed) { var hp2 = fr.toPx(BL.alongMap(at, T.hdg, 0.05 * c.map().D)); ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(hp2.x, hp2.y); ctx.stroke(); }
      if (sel) { ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, s + 9, 0, Math.PI * 2); ctx.stroke(); }
      var lines = [[T.letter + (big ? " · " + T.K.name.toUpperCase() + (plan ? "" : " " + Math.round(100 * T.hp / T.hpMax) + "%") + (T.K.objective ? " · OBJECTIVE" : "") : ""), T.K.objective ? "#ffd666" : "#ffb3a8"]];
      if (big && !solid && !plan) lines.push([T.last ? "last seen" : "reported", "#8899a8"]);
      place(lines, p, s + 4);
    });
  }
  // The squadron on the bridge map: our sensor range round the flagship, the targets, the fire
  // (ours teal, theirs red), each ship with her number and her order's line, the ones selected ringed.
  function drawSquadMap(ctx, fr, big, occ) {
    var c = sim.captain, es = c.escort, M = BL.COMMAND.squad.map, cs = c.cs(), fp = fr.toPx(c.pos), mono = "ui-monospace, Menlo, Consolas, monospace";
    ctx.strokeStyle = "rgba(76,195,238,.35)"; ctx.lineWidth = 1; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.arc(fp.x, fp.y, M.sensor * cs * fr.s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    occ = occ || [];
    var shipPx = [fp].concat(es.wing.filter(function (g) { return g.hull > 0; }).map(function (g) { return fr.toPx(c.wingPos(g)); }));
    shipPx.forEach(function (q) { occ.push({ x0: q.x - 12, y0: q.y - 16, x1: q.x + 20, y1: q.y + 12, ship: true }); });
    drawTargets(ctx, fr, c.sqTargets || [], big, c, false, occ);
    es.fx.forEach(function (f) { var a = fr.toPx(f.a), b = fr.toPx(f.b); ctx.strokeStyle = f.foe ? "rgba(255,107,107,.75)" : "rgba(127,216,200,.8)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); });
    function orderLine(from, goal) { var q = fr.toPx(goal); ctx.strokeStyle = "rgba(127,216,200,.6)"; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]); }
    if (c.flagGo) { var fgoal = c.goalOf(null, c.pos); if (fgoal) orderLine(fp, fgoal); }
    ctx.font = "600 " + (big ? 11 : 10) + "px " + mono; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    es.wing.forEach(function (g) {
      if (g.hull <= 0) return;
      var at = c.wingPos(g), gp = fr.toPx(at), o = c.orderOf(g);
      if (o.kind !== "form") orderLine(gp, c.goalOf(g, at));
      BL.drawMapShip(ctx, gp, g.pos ? g.hdg : es.hdg, big ? 9 : 6, g.hold ? "#9aa6b2" : "#7fd8c8");
      if (sqSel.indexOf(g.no) >= 0) { ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(gp.x, gp.y, big ? 13 : 10, 0, Math.PI * 2); ctx.stroke(); }
      shipNo("" + g.no, gp, "rgba(207,227,255,.95)");
    });
    if (sqSel.indexOf(1) >= 0) { ctx.strokeStyle = "#ffd666"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fp.x, fp.y, big ? 14 : 11, 0, Math.PI * 2); ctx.stroke(); }
    shipNo("1", fp, "#ffd666");
    // A ship's number in the first clear place round her (no text on other text, and off the
    // other ships' markers as far as it can be).
    function shipNo(s, q, col) {
      var w = ctx.measureText(s).width, h = big ? 11 : 10, best = null, bo = Infinity;
      [[9, -8], [9, 8], [-9 - w, -8], [-9 - w, 8], [-w / 2, -16], [-w / 2, 16], [14, 0], [-14 - w, 0]].forEach(function (d) {
        var b = { x0: q.x + d[0] - 1, y0: q.y + d[1] - h / 2, x1: q.x + d[0] + w + 1, y1: q.y + d[1] + h / 2 };
        var o = occ.reduce(function (a, z) { return z.ship ? a : a + 100 * Math.max(0, Math.min(b.x1, z.x1) - Math.max(b.x0, z.x0)) * Math.max(0, Math.min(b.y1, z.y1) - Math.max(b.y0, z.y0)); }, 0);
        o += shipPx.reduce(function (a, z) { return a + Math.max(0, Math.min(b.x1, z.x + 7) - Math.max(b.x0, z.x - 7)) * Math.max(0, Math.min(b.y1, z.y + 7) - Math.max(b.y0, z.y - 7)); }, 0);
        if (o < bo) { bo = o; best = b; }
      });
      ctx.fillStyle = col; ctx.fillText(s, best.x0 + 1, (best.y0 + best.y1) / 2);
      occ.push({ x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1 });
    }
  }
  var lastBridgeBox = {}, canBreakEver = true;
  var STATION_LIST = ["ahead", "port", "stbd", "astern"], STATION_SHORT = { ahead: "AHEAD", port: "PORT", stbd: "STBD", astern: "ASTERN" },
    STATION_NAME = { ahead: "ahead of the carrier", port: "off her port beam", stbd: "off her starboard beam", astern: "astern of her" };
  // A line or block of the BRIDGE column, rewritten only when it changes.
  function cpHtml(id, html) { if (lastBridgeBox[id] !== html) { lastBridgeBox[id] = html; $(id).innerHTML = html; } }
  function cpLine(id, html) { cpHtml(id, html || "&nbsp;"); }
  // A small upright meter (f: 0 to 1) with its label under it.
  function meter(lbl, f, cls) { return '<div class="cp-m' + (cls ? " " + cls : "") + '"><i><b style="height:' + Math.round(clampN(f, 0, 1) * 100) + '%"></b></i><span>' + lbl + "</span></div>"; }
  var cpMapCtx = null, cpMapW = 0, cpMapH = 0, cpSwapped = false, cpView = { i: -1, z: 1, dx: 0, dy: 0 };
  // SWAP: the map (with its zoom buttons) in the middle and the battle view in the map's box, or back.
  function bridgeSwap(on) {
    if (on === cpSwapped) return;
    cpSwapped = on;
    var wrap = $("cp-mapwrap"), ring = $("tu-canvas");
    if (on) { $("tu-field").insertBefore(wrap, $("tu-field").firstChild); $("cp-mapbox").insertBefore(ring, $("cp-swap")); }
    else { $("tu-field").insertBefore(ring, $("tu-field").firstChild); $("cp-mapbox").insertBefore(wrap, $("cp-swap")); }
    tuSize = 0; cpMapW = 0;
  }
  // The bridge map's zoom and pan (back to the whole map in each new system).
  function mapView() { var i = sim.captain.at === undefined ? sim.jumpIndex : sim.captain.at; if (cpView.i !== i) cpView = { i: i, z: 1, dx: 0, dy: 0 }; return cpView; }
  function mapFrame(w, h) { return BL.navFrame(sim.captain.map(), null, w, h, cpSwapped ? 18 : 10, mapView()); }
  // Zoom by f about the point (px, py) on the map (its middle if none): that point stays put.
  function mapZoom(f, px, py) {
    var cv = $("cp-map"), w = cv.clientWidth, h = cv.clientHeight, v = mapView();
    if (!w || !h) return;
    if (px === undefined) { px = w / 2; py = h / 2; }
    var z = clampN(v.z * f, 1, 8); if (z === v.z) return;
    var p = mapFrame(w, h).toMap(px, py);
    v.z = z; var q = mapFrame(w, h).toMap(px, py);
    v.dx += p.x - q.x; v.dy += p.y - q.y;
    if (z === 1) v.dx = v.dy = 0;
  }
  function mapFit() { var v = mapView(); v.z = 1; v.dx = v.dy = 0; }
  function drawBridgeMap(hv) {
    var cv = $("cp-map"), box = cv.parentNode, dpr = window.devicePixelRatio || 1, w = box.clientWidth, hh = box.clientHeight, c = sim.captain, big = cpSwapped;
    if (!w || !hh) return;
    if (w !== cpMapW || hh !== cpMapH || !cpMapCtx) { cpMapW = w; cpMapH = hh; cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); cpMapCtx = cv.getContext("2d"); cpMapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    var map = c.map(), plot = c.plots[c.at === undefined ? sim.jumpIndex : c.at] || null, ctx = cpMapCtx;      // (only a course that has been plotted)
    var fr = mapFrame(w, hh);
    // (labels: what the map writes, and the corner readout, so a squadron's target labels keep clear of it)
    var labels = [{ x0: 0, y0: 0, x1: big ? 380 : 270, y1: big ? 60 : 46 }];
    BL.drawNavMap(ctx, w, hh, map, plot, { small: !big, frame: fr, pos: c.pos, hdg: sim.helm.compass(), leg: c.leg, info: c.info, steer: hv ? hv.hdg : null, cpHit: c.cur ? c.cur.cps : null, labels: labels });
    if (!c.pos) return;
    // Escort: her ships (blue hulls on her heading: a carrier or capital ship long, merchants short,
    // a lost one dim), the wingmen on their stations, and our station (a ring).
    if (c.escort && c.escort.flag && c.pos) drawSquadMap(ctx, fr, big, labels);
    else if (c.escort && c.escort.pos) {
      var es = c.escort, a = es.hdg * Math.PI / 180, conv = es.kind === "convoy";
      es.ships.forEach(function (s) {
        var sp2 = fr.toPx(s.pos), L = (big ? 16 : 11) * (conv ? 0.55 : es.kind === "capital" ? 1.1 : 1);
        ctx.save(); ctx.translate(sp2.x, sp2.y); ctx.rotate(a); ctx.globalAlpha = s.hull > 0 ? 1 : 0.3;
        ctx.fillStyle = "#4c8fd6"; ctx.strokeStyle = "#cfe3ff"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(L * 0.32, -L * 0.45); ctx.lineTo(L * 0.32, L * 0.8); ctx.lineTo(-L * 0.32, L * 0.8); ctx.lineTo(-L * 0.32, -L * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      });
      es.wing.forEach(function (g) {
        if (g.hull <= 0) return;
        var gp = fr.toPx(c.wingPos(g));
        BL.drawMapShip(ctx, gp, g.pos ? g.hdg : es.hdg, big ? 8 : 6, g.task === "detach" ? "#ffd666" : "#7fd8c8");
        if (es.flag && big) { ctx.fillStyle = "rgba(207,227,255,.9)"; ctx.font = "600 10px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("" + g.no, gp.x + 9, gp.y - 7); }
      });
      var cp = fr.toPx(es.pos);
      if (big && !es.flag) { ctx.fillStyle = "rgba(207,227,255,.9)"; ctx.font = "600 11px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(es.W.label + " " + Math.round(100 * es.hull / es.hullMax) + "%", cp.x + (big ? 30 : 20), cp.y); }
      if (hv && hv.station) { var sp = fr.toPx(hv.station.pos); ctx.strokeStyle = hv.station.on ? "rgba(61,255,122,.9)" : "rgba(255,214,102,.9)"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(sp.x, sp.y, Math.max(4, BL.COMMAND.escort.near * map.D * fr.s), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    }
    // When she reaches the jump zone at her speed now, against when the jump can go (the window
    // open and the drive full at the rate it's charging now, whichever is later): EARLY (slow
    // down, or she waits there), LATE (more speed), else on time.
    var eta = c.zoneEta(), rd = c.readyEta(), fs = big ? 15 : 12;
    var l1 = eta === 0 ? "IN THE ZONE" : eta === null ? "ZONE ARRIVAL IN –" : "ZONE ARRIVAL IN " + mmss(Math.ceil(eta));
    var l2 = rd.at === 0 ? "CAN WARP NOW" : rd.at === null ? "DRIVE NOT CHARGING" : "CAN WARP IN " + mmss(Math.ceil(rd.at)) + " · " + rd.by.toUpperCase();
    // (the drop: when it can go, then once the window's open, when it closes)
    if (sim.isDrop()) l2 = sim.windowIn() <= 0 ? "DROP WINDOW CLOSES IN " + mmss(Math.max(0, Math.ceil(sim.dropClosesIn()))) : rd.at === null ? "MOAB NOT CHARGING" : "CAN DROP IN " + mmss(Math.ceil(rd.at)) + " · " + rd.by.toUpperCase();
    var tag = eta === null || eta === 0 || rd.at === null ? "" : eta < rd.at - 10 ? " · EARLY" : eta > rd.at + BL.COMMAND.zoneGrace ? " · LATE" : " · ON TIME";
    var col = tag === " · EARLY" ? "#ffd666" : tag === " · LATE" ? "#ff6b6b" : "#3dff7a";
    ctx.font = "600 " + fs + "px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    // (the dreadnought: when the planet buster will be full)
    var mo = moabEta(), l3 = !mo ? "" : mo.eta === 0 ? "MOAB FULL" : mo.eta === null ? "MOAB NOT CHARGING · " + mo.pct + "%" : "MOAB FULL IN " + mmss(Math.ceil(mo.eta));
    var tw = Math.max(ctx.measureText(l1 + tag).width, ctx.measureText(l2).width, ctx.measureText(l3).width);
    ctx.fillStyle = "rgba(5,8,12,.8)"; ctx.fillRect(3, 3, tw + 10, fs * (l3 ? 3 : 2) + (l3 ? 12 : 10));
    ctx.fillStyle = col; ctx.fillText(l1 + tag, 8, 6);
    ctx.fillStyle = sim.isDrop() && sim.windowIn() <= 0 ? "#ff6b6b" : "rgba(200,215,230,.85)"; ctx.fillText(l2, 8, 8 + fs);
    if (l3) { ctx.fillStyle = mo.eta === 0 ? "#3dff7a" : "#e7a0ff"; ctx.fillText(l3, 8, 10 + fs * 2); }
  }
  function hdg3(v) { return BL.hdgText(v); }
  // The dreadnought's planet buster (MOAB): its charge and when it'll be full at the rate it's
  // charging now (averaged over BL.COMMAND.driveTau s, like the drive's). eta: s, 0 full, null not charging.
  var moabT = { last: null, at: 0, rate: null };
  function moabEta() {
    var bu = sim && sim.sys("buster");
    if (!bu) return null;
    var t = sim.totalT, full = bu.mj >= bu.maxMJ - 0.5;
    if (moabT.last === null || t < moabT.at) moabT = { last: bu.mj, at: t, rate: null };
    else if (t - moabT.at >= 0.25) {
      var r = (bu.mj - moabT.last) / (t - moabT.at), a = Math.min(1, (t - moabT.at) / BL.COMMAND.driveTau);
      moabT.rate = moabT.rate === null ? r : moabT.rate + (r - moabT.rate) * a; moabT.last = bu.mj; moabT.at = t;
    }
    return { pct: Math.floor(bu.mj / bu.maxMJ * 100), f: bu.mj / bu.maxMJ, eta: full ? 0 : moabT.rate > 0.05 ? (bu.maxMJ - bu.mj) / moabT.rate : null };
  }
  function moabRow() {
    if (sim.isDrop()) {
      var dwi = sim.windowIn();
      setText($("tu-rec-label"), "DROP");
      setText($("tu-rec-val"), dwi > 0 ? "in " + Math.ceil(dwi) + " s" : "closes in " + Math.max(0, Math.ceil(sim.dropClosesIn())) + " s");
      $("tu-rec").style.width = pct(Math.min(1, sim.t / Math.max(1, sim.windowAt())));
    } else setText($("tu-rec-label"), sim.hasDrive ? "WARP" : "RECOVERY");
    var mo = moabEta();
    $("tu-moabrow").hidden = !mo;
    if (!mo) return;
    setText($("tu-moab-val"), mo.eta === 0 ? "full" : mo.pct + "% · " + (mo.eta === null ? "not charging" : "full in " + mmss(Math.ceil(mo.eta))));
    $("tu-moab").style.width = pct(mo.f);
  }
  function renderBridge(ts) {
    var tu = sim.turret, h = sim.helm, c = sim.captain, ship = sim.ship, enc = sim.encounter() || {}, K = BL.COMMAND;
    $("btn-tu-exit").hidden = true;
    tu.effects.forEach(function (f) {
      if (f.type === "hullHit" && f.at > lastJolt) {
        lastJolt = f.at; var el = $("scr-turret");
        el.classList.remove("jolt"); void el.offsetWidth; el.classList.add("jolt");
        if (navigator.vibrate) try { navigator.vibrate([60, 40, 90]); } catch (e) {}
      }
    });
    sizeTurret();
    BL.drawRing(tuCtx, { w: tuW, h: tuH, wide: false }, sim, tu, ts);
    $("tu-jump").innerHTML = (sim.hasDrive ? "Warp" : "Sortie") + " <b>" + (sim.jumpIndex + 1) + "</b> of " + sim.cfg.jumps + " · <b>" + (BL.ENCOUNTERS[sim.shown(sim.jumpIndex)] || enc).name + "</b>";     // (the report until it's found wrong)
    setText($("tu-phase"), sim.phase === "arrival" ? "Engagement in " + Math.ceil(sim.cfg.arrivalSeconds - sim.t) + " s" :
      sim.phase === "countdown" ? "WARPING IN " + Math.max(1, Math.ceil(sim.jumpAt - sim.t)) : sim.phase === "engage" ? "T+" + mmss(sim.t) : "IN WARP SPACE");
    renderComms();
    if (!c.pos) { drawBridgeMap(null); return; }
    var hv = c.helmView(), nv = hv.nav, jv = c.jumpView(), cv = c.callView(), ev = h.evadeView(), spd = Math.max(0.05, h.speed) * K.scale;
    drawBridgeMap(hv);
    // HELM: what she's steering (the captain's own course, the main gun, the station or the plot), her heading and speed.
    // (four short lines, so nothing runs off the narrow column)
    cpLine("cp-helm-ln", "Steer <b>" + hdg3(hv.hdg) + "</b> " + (hv.own ? "yours" : hv.sent ? "sent" : hv.main ? "main gun" : hv.station ? "station" : "plot"));
    cpLine("cp-hdg-ln", "Hdg " + hdg3(h.compass()) + " · " + fmtG(h.speed) + " G");
    // NAVIGATION: asteroids or a minefield first; the escort's station and ward; in the zone; else the leg and the next turn. Then the window (and a scouting run's checkpoints).
    var wi = sim.windowIn(), win = wi > 0 ? "Window " + mmss(wi) : "Window open";
    var es = c.escort, sv = hv.station, nav;
    var afloat = es ? es.ships.filter(function (s) { return s.hull > 0; }).length : 0;
    var cps = c.cur && c.cur.cps.length ? " · CP " + c.cur.cps.filter(Boolean).length + "/" + c.cur.cps.length : "";     // a scouting run's checkpoints
    if (c.inRock || c.inMines) nav = "⚠ <b>" + (c.inRock ? "ASTEROIDS" : "MINEFIELD") + "</b>";
    else if (es && !es.flag) nav = (sv ? "<b>" + STATION_SHORT[c.station] + "</b> " + (sv.on ? "on" : "<b>off</b>") : "To the zone") + " · " + (es.kind === "convoy" ? "Convoy " + afloat + "/" + es.ships.length + " " : es.kind === "capital" ? "Capital " : "Carrier ") + "<b>" + Math.round(100 * es.hull / es.hullMax) + "%</b>";
    else if (hv.holding) nav = "<b>IN THE ZONE</b> · " + hdg3(c.info.jumpHdg);
    else nav = "Leg <b>" + nv.leg + "</b>/" + nv.legs + " · " + (nv.next ? "<b>" + hdg3(nv.next.hdg) + "</b> in " + Math.ceil(nv.next.in) + "s" : "zone " + (h.speed > 0.2 ? Math.ceil(nv.toZone / spd) + "s" : "–"));
    cpLine("cp-nav-ln", nav);
    cpLine("cp-win-ln", win + cps);
    setCls($("cp-sec-helm"), "cp-sec" + (c.inRock || c.inMines || (es && es.hull < es.hullMax * 0.3) ? " alert" : hv.own || hv.holding || (sv && sv.on) ? " on" : ""));
    // TORPEDOES: the burst waiting for the captain's call, or the break under way.
    var wv = c.wardCallView ? c.wardCallView() : null;
    // (the heading counts the seconds; the line says what's coming, plainly)
    cpLine("cp-torp-ln", ev && ev.left > 0 ? "<b>Breaking " + (ev.dir > 0 ? "starboard" : "port") + "</b>"
      : cv ? "<b>" + cv.n + " inbound</b>" + (!canBreakEver ? " · shields take it" : cv.canBreak ? "" : " · too late to break")
      : wv ? "<b>" + wv.n + "</b> at the " + es.W.name + (wv.canCover ? "" : " · too far")
      : "None inbound");
    setCls($("cp-sec-torp"), "cp-sec cp-torps" + (ev && ev.left > 0 ? " on" : cv || wv ? " alert live" : ""));
    // The telegraphs' meters: speed; the guns' charge (all together), the main gun, the CIWS and the hangar; each
    // the reactors' output, the shields and the drive (and the planet buster); a readout under each.
    var g = tu.cur || {}, mv = c.mainView(), hgv = c.hangarView(), sh = sim.sys("shield"), dr = sim.sys("drive"), heat = 0;
    function full(x) { return x.mj >= x.maxMJ - 0.5 ? "full" : ""; }
    cpHtml("cp-m-eng", meter("SPD", h.speed / Math.max(0.1, h.gOf("flank")), "spd"));
    var gm = "";
    var gmj = 0, gmax = 0;
    ship.systems.forEach(function (x) { if (x.kind === "gun") { gmj += x.mj; gmax += x.maxMJ; } });
    if (gmax) gm += meter("GUN", gmj / gmax, gmj >= gmax - 0.5 ? "full" : "");
    ["main", "pd"].forEach(function (id) { var x = sim.sys(id); if (x) gm += meter(id === "main" ? "M" : "C", x.mj / x.maxMJ, full(x)); });
    cpHtml("cp-m-gun", gm);
    var em = "";
    // RX: the reactors' output (the hardest-worked one, against its rating; orange when overloaded); their heat is the red bar under the meters.
    var load = 0;
    ship.reactors.forEach(function (rx) { heat = Math.max(heat, rx.heat); load = Math.max(load, rx.loadPct); });
    em += meter("RX", load / 150, "rx" + (load > 100 ? " heat" : ""));       // (0 to 150%, as at the engineer station; the tick is 100%)
    em += meter("SH", sh.mj / sh.maxMJ, full(sh));
    if (dr) em += meter("DR", dr.mj / dr.maxMJ, full(dr));
    var bu = sim.sys("buster"); if (bu) em += meter("PB", bu.mj / bu.maxMJ, full(bu));
    // (the hangar: LN the launchers while the squadron is aboard, AR the arresters while it's out)
    var hx = hgv && hgv.squadron !== "lost" ? sim.sys("hangar") : null; if (hx) em += meter(hgv.order === "recover" ? "AR" : "LN", hx.mj / hx.maxMJ, full(hx));
    cpHtml("cp-m-engr", em);
    cpLine("cp-v-eng", fmtG(h.speed) + " G");
    // (the main gun's charge is on the M meter and the MAIN GUN button; the heat, the hottest reactor's, is a bar)
    cpLine("cp-v-gun", ship.crippled ? "✖ crippled" : "Kills " + ((tu.cur || {}).kills || 0));
    cpLine("cp-v-engr", '<span class="cp-hbar"><b style="width:' + Math.round(clampN(heat, 0, 100)) + '%"></b></span>');
    $("cp-v-engr").title = "Reactor heat " + Math.round(heat) + "%";
    // The order bar (a squadron's commander: the flag captain's buttons show what he's ordered, and are his)
    var live = turretActive(), mine = live && !(sim.flag && cmdView);
    if (sim.flag) renderSquad(live);
    Array.prototype.forEach.call($("cp-tele").children, function (b) { b.classList.toggle("on", b.dataset.eng === hv.eng); b.disabled = !live; });
    Array.prototype.forEach.call($("cp-gunord").children, function (b) { b.classList.toggle("on", b.dataset.gun === c.guns); orderBar(b, b.dataset.gun === c.guns, c.orderProgress("guns")); b.disabled = !mine; });
    Array.prototype.forEach.call($("cp-pilot-row").children, function (b) { b.classList.toggle("on", b.dataset.pilot === c.breaks); orderBar(b, b.dataset.pilot === c.breaks, c.orderProgress("breaks")); b.disabled = !live; });
    Array.prototype.forEach.call($("cp-stance").children, function (b) { b.classList.toggle("on", b.dataset.stance === c.stance); orderBar(b, b.dataset.stance === c.stance, c.orderProgress("stance")); b.disabled = !mine; b.hidden = b.dataset.stance === "drive" && sim.isDrop(); });
    $("cp-resume").disabled = !live || !hv.own;
    var tg = $("cp-sec-torp");
    setText($("cp-torp-lbl"), cv ? "TORPEDOES · " + cv.in.toFixed(1) + " s" : wv ? "TORPEDOES · " + wv.in.toFixed(1) + " s" : "TORPEDOES");
    Array.prototype.forEach.call(tg.querySelectorAll("button[data-brk]"), function (b) { b.disabled = !live || !cv || (+b.dataset.brk !== 0 && !cv.canBreak); });
    if (es) {
      $("cp-cover").disabled = !live || !wv || !wv.canCover; $("cp-cover").classList.toggle("ready", !!(wv && wv.canCover));
      Array.prototype.forEach.call($("cp-station").children, function (b) {
        var wg = c.wingOn(b.dataset.station);
        b.classList.toggle("on", b.dataset.station === c.station); b.classList.toggle("wing", !!wg); b.disabled = !live;
        b.title = "Keep station " + STATION_NAME[b.dataset.station] + (wg ? " (a wingman holds it: you swap)" : "") + " (" + (STATION_LIST.indexOf(b.dataset.station) + 1) + ")";
      });
    }
    if (mv) {
      var mb = $("cp-main"); mb.disabled = !live || !mv.can; mb.classList.toggle("ready", !!mv.can);
      setHtml(mb, mv.swinging ? "SWINGING" : mv.ready && !mv.target ? "MAIN · NONE AHEAD" : mv.ready ? "MAIN GUN <small>(M)</small>" : "MAIN " + mv.pct + "%");
    }
    if (hgv) {
      var hb = $("cp-hangar"); hb.disabled = !live || !hgv.can; hb.classList.toggle("ready", !!hgv.can);
      setHtml(hb, hgv.squadron === "lost" ? "SQUADRON LOST" : hgv.pending ? (hgv.order === "recover" ? "RECOVERING" : "LAUNCHING")
        : (hgv.order === "recover" ? "RECOVER" : "LAUNCH") + (hgv.full ? " <small>(L)</small>" : " " + hgv.pct + "%"));
    }
    $("cp-warn").disabled = !live || sim.totalT < h.warnReadyAt;
    $("cp-drop").disabled = !live || !c.canDrop(); $("cp-drop").classList.toggle("on", dropPick);
    $("cp-drop-pick").hidden = !dropPick || !live;
    var jb = $("cp-jump");
    jb.disabled = !live || !jv.ready || jv.ordered || sim.phase === "countdown";
    jb.classList.toggle("ready", jv.ready && !jv.ordered);
    var jw = sim.isDrop() ? "DROP MOAB" : sim.hasDrive ? "WARP" : "RECOVER";        // a gunboat: the carrier's recovery; the dreadnought's last system: the drop
    setHtml(jb, sim.phase === "countdown" ? "WARPING" : jv.ordered ? esc(jv.wait || (sim.isDrop() ? "DROPPING" : sim.hasDrive ? "WARPING" : "RECOVERING")) : jv.ready ? jw + " <small>(J)</small>" : esc(jv.why || jw));
    // SHIP
    setText($("tu-hull-val"), Math.max(0, Math.round(ship.hull)) + " / " + ship.hullMax);
    $("tu-hull").style.width = pct(ship.hull / ship.hullMax);
    $("tu-hull").classList.toggle("low", ship.hull < ship.hullMax * 0.35);
    setText($("tu-shield-val"), Math.round(sh.mj) + " / " + sh.maxMJ + " MJ");
    $("tu-shield").style.width = pct(sh.mj / sh.maxMJ);
    if (dr) { setText($("tu-rec-val"), (wi > 0 ? "in " + Math.ceil(wi) + " s · " : "open · ") + Math.floor(dr.mj / dr.maxMJ * 100) + "%"); $("tu-rec").style.width = pct(dr.mj / dr.maxMJ); }
    else { setText($("tu-rec-val"), wi > 0 ? "in " + Math.ceil(wi) + " s" : "open"); $("tu-rec").style.width = pct(Math.min(1, sim.t / Math.max(1, sim.windowAt()))); }     // a gunboat: the sortie timer to the recovery
    moabRow();
    var dl = sim.stats.damageReports;
    if (dl.length !== lastTuDamage) {
      lastTuDamage = dl.length;
      $("tu-damage").innerHTML = dl.length ? dl.slice(-4).reverse().map(function (d) { return "<li>" + esc(d.what) + "</li>"; }).join("") : '<li class="muted">None</li>';
    }
    var hc = h.cur || {}, cs = c.cur || {};
    setHtml($("tu-tally"), "<span>Breaks made</span><b>" + (hc.evasiveMet || 0) + " / " + (hc.evasive || 0) + "</b>" +
      "<span>Ships destroyed</span><b>" + (g.kills || 0) + " / " + (g.ships || 0) + "</b><span>Torpedoes shot down</span><b>" + (g.downed || 0) + " / " + (g.torps || 0) + "</b>" +
      (cs.rockHits ? '<span class="bad">Asteroid hits</span><b>' + cs.rockHits + "</b>" : ""));
  }
  /* Dropping down: the captain leaves the bridge for a station's own screen (the engine room's
     console, the helm, or the gun he takes); BRIDGE (B) brings him back. Captain.dropTo. */
  function dropTo(where, gun) {
    var c = sim.captain;
    dropPick = false;
    if (!c || cpAt || !turretActive() || !c.dropTo(where, gun)) return;
    cpAt = where; click();
    if (where === "engine") { buildConsole(); $("btn-bridge").hidden = false; show("scr-console"); }
    else { buildTurret(); show("scr-turret"); tuSize = 0; sizeTurret(); }
  }
  function backToBridge() {
    var c = sim && sim.captain;
    if (!c || !cpAt) return;
    if (cpAt === "gun") releaseTurret();
    c.toBridge(); cpAt = null; $("btn-bridge").hidden = true;
    buildTurret(); show("scr-turret"); tuSize = 0; sizeTurret();
    if (running) click();
  }
  $("btn-bridge").onclick = function () { backToBridge(); this.blur(); };
  $("btn-tu-bridge").onclick = function () { backToBridge(); this.blur(); };
  // The captain's course, `d` degrees from the course he has ordered (or the heading she's on).
  function courseBy(d) { var c = sim.captain; c.orderCourse((c.hdgOrder !== null ? c.hdgOrder : Math.round(sim.helm.compass())) + d); }
  function engineStep(dir) {
    var c = sim.captain, i = BRIDGE_ENG.indexOf(c.helmView().eng);
    i = clampN((i < 0 ? 2 : i) + dir, 0, BRIDGE_ENG.length - 1);
    c.orderEngines(BRIDGE_ENG[i]);
  }
  function cycle(list, cur, dir) { return list[(list.indexOf(cur) + dir + list.length) % list.length]; }
  // Keys on the bridge: ← → course 10° (Shift 1°), R resume plot, ↑ ↓ engines, Z X C break port /
  // take it / break starboard, G gunners' order, S engineer's stance, E warn engineering, J jump,
  // V swap the map and the battle view, + - zoom the map, F the whole map, Esc pause.
  function bridgeKey(ev) {
    if (!$("ov-grav").hidden) { if (ev.key === "Enter") $("btn-grav-go").click(); return; }
    var k = ev.key, kl = k.length === 1 ? k.toLowerCase() : k, c = sim.captain;
    if (k === "Escape" && dropPick && !paused) { ev.preventDefault(); dropPick = false; return; }
    if (k === "Escape") { ev.preventDefault(); if (paused) resume(); else pause(); return; }
    if (paused) { if (k === " ") { ev.preventDefault(); resume(); } return; }
    if (!turretActive() || !c.pos) return;
    // The STATIONS list open: E the engine room, H the helm, a number that gun.
    if (dropPick && !ev.repeat && (kl === "e" || kl === "h" || (k >= "1" && k <= "9" && +k <= sim.turret.bats.length))) {
      ev.preventDefault(); dropTo(kl === "e" ? "engine" : kl === "h" ? "helm" : "gun", +k - 1); return;
    }
    // A squadron's commander: his own keys; the flag captain's (breaks, gunners, engineer, main gun, hangar, warn, stations) are his.
    if (sim.flag && cmdView) {
      var sqn = c.escort.n;
      if (kl === "d" && !ev.repeat) toFlagBridge();
      else if (kl === "o" && !ev.repeat) c.setFormation(cycle(BL.COMMAND.squad.formationList, c.escort.form, 1));
      else if (k === "[" && !ev.repeat) c.setSpacing(-1);
      else if (k === "]" && !ev.repeat) c.setSpacing(1);
      else if (kl === "l" && !ev.repeat) c.dressLine();
      else if (k >= "1" && k <= "9" && +k <= sqn && !ev.repeat) sqToggle(+k);
      else if (kl === "a" && !ev.repeat) sqAll();
      else if (kl === "z" && !ev.repeat && sqSel.length) { sqRecall(); click(); }
      else if (kl === "x" && !ev.repeat && sqSel.length) { sqHold(); click(); }
      else if (kl === "c" && !ev.repeat) { sqSel = []; sqTgt = null; click(); }
      else if (k === "ArrowLeft") courseBy(ev.shiftKey ? -1 : -10);
      else if (k === "ArrowRight") courseBy(ev.shiftKey ? 1 : 10);
      else if (kl === "r") c.resumePlot();
      else if (k === "ArrowUp") engineStep(1);
      else if (k === "ArrowDown") engineStep(-1);
      else if (kl === "j" && !ev.repeat) c.orderJump();
      else if (kl === "v" && !ev.repeat) bridgeSwap(!cpSwapped);
      else if (k === "+" || k === "=") mapZoom(1.5);
      else if (k === "-" || k === "_") mapZoom(1 / 1.5);
      else if (kl === "f" && !ev.repeat) mapFit();
      else if (kl === "h") { toggleHints(); }
      else return;
      ev.preventDefault(); return;
    }
    if (kl === "q" && !ev.repeat && sim.flag) { ev.preventDefault(); toSquadron(); return; }
    if (kl === "d" && !ev.repeat) { ev.preventDefault(); dropPick = !dropPick && c.canDrop(); return; }
    if (k === "ArrowLeft") courseBy(ev.shiftKey ? -1 : -10);
    else if (k === "ArrowRight") courseBy(ev.shiftKey ? 1 : 10);
    else if (kl === "r") c.resumePlot();
    else if (k === "ArrowUp") engineStep(1);
    else if (k === "ArrowDown") engineStep(-1);
    else if (kl === "z" && !ev.repeat) c.answer(-1);
    else if (kl === "x" && !ev.repeat) c.answer(0);
    else if (kl === "c" && !ev.repeat) c.answer(1);
    else if (kl === "g" && !ev.repeat) c.setGuns(cycle(BL.GUNNERY.orderList, c.guns, 1));
    else if (kl === "b" && !ev.repeat && canBreakEver) c.setPilot(cycle(BL.COMMAND.pilotList, c.breaks, 1));
    else if (kl === "s" && !ev.repeat) c.setStance(cycle(bridgeStances(), c.stance, 1));
    else if (kl === "q" && !ev.repeat && c.escort) c.cover();
    else if (k >= "1" && k <= "4" && !ev.repeat && c.escort) c.setStation(STATION_LIST[+k - 1]);
    else if (kl === "e" && !ev.repeat) c.warn();
    else if (kl === "m" && !ev.repeat && c.mainView()) c.orderMain();
    else if (kl === "l" && !ev.repeat && c.hangarView()) c.orderHangar();
    else if (kl === "j" && !ev.repeat) c.orderJump();
    else if (kl === "v" && !ev.repeat) bridgeSwap(!cpSwapped);
    else if (k === "+" || k === "=") mapZoom(1.5);
    else if (k === "-" || k === "_") mapZoom(1 / 1.5);
    else if (kl === "f" && !ev.repeat) mapFit();
    else if (kl === "h") { toggleHints(); }
    else return;
    ev.preventDefault();
  }
  (function wireBridge() {
    function bridgeClick(ev) {
      var b = ev.target.closest("button"), c = sim && sim.captain;
      if (!b) return;
      b.blur();
      if (!c || !c.pos || !turretActive()) return;
      if (b.dataset.drop) { dropTo(b.dataset.drop, +b.dataset.gun); return; }     // (before data-gun: the STATIONS gun buttons carry it too)
      // A squadron: the commander's orders; the flag captain's buttons are his while you command.
      if (b.dataset.form) { c.setFormation(b.dataset.form); return; }
      if (b.dataset.sel) { sqToggle(+b.dataset.sel); return; }
      if (b.id === "cp-sq-recall") { sqRecall(); click(); return; }
      if (b.id === "cp-sq-close") { c.setSpacing(-1); return; }
      if (b.id === "cp-sq-open") { c.setSpacing(1); return; }
      if (b.id === "cp-sq-dress") { c.dressLine(); return; }
      if (b.id === "cp-sq-hold") { sqHold(); click(); return; }
      if (b.id === "cp-sq-clear") { sqSel = []; click(); return; }
      if (b.id === "cp-sq-all") { sqAll(); return; }
      if (b.id === "cp-sq-bridge") { toFlagBridge(); return; }
      if (b.id === "cp-sq-back") { toSquadron(); return; }
      if (sim.flag && cmdView && (b.dataset.gun || b.dataset.stance || b.dataset.pilot || b.dataset.brk !== undefined)) return;
      if (b.dataset.turn) courseBy(+b.dataset.turn);
      else if (b.id === "cp-resume") c.resumePlot();
      else if (b.dataset.eng) c.orderEngines(b.dataset.eng);
      else if (b.dataset.brk !== undefined) c.answer(+b.dataset.brk);
      else if (b.dataset.gun) c.setGuns(b.dataset.gun);
      else if (b.dataset.stance) c.setStance(b.dataset.stance);
      else if (b.dataset.pilot) c.setPilot(b.dataset.pilot);
      else if (b.dataset.station) c.setStation(b.dataset.station);
      else if (b.id === "cp-cover") c.cover();
      else if (b.id === "cp-warn") c.warn();
      else if (b.id === "cp-main") c.orderMain();
      else if (b.id === "cp-hangar") c.orderHangar();
      else if (b.id === "cp-jump") c.orderJump();
      else if (b.id === "cp-drop") dropPick = !dropPick && c.canDrop();
    }
    $("cp-side").addEventListener("click", bridgeClick);
    // The map: a tap steers for that point (a course of the captain's own); a drag pans it, two
    // fingers pinch to zoom, the mouse wheel zooms.
    var mv = $("cp-map"), ptrs = {}, pinch = null;
    function mapXY(ev) { var r = mv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    mv.addEventListener("pointerdown", function (ev) {
      if (!sim || !sim.captain) return;
      ptrs[ev.pointerId] = { at: mapXY(ev), last: mapXY(ev), moved: false };
      try { mv.setPointerCapture(ev.pointerId); } catch (e) {}
      var ids = Object.keys(ptrs);
      if (ids.length === 2) { var a = ptrs[ids[0]].last, b = ptrs[ids[1]].last; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; ptrs[ids[0]].moved = ptrs[ids[1]].moved = true; }
      ev.preventDefault();
    });
    mv.addEventListener("pointermove", function (ev) {
      var p = ptrs[ev.pointerId]; if (!p || !sim || !sim.captain) return;
      var q = mapXY(ev), ids = Object.keys(ptrs);
      if (!p.moved && Math.hypot(q.x - p.at.x, q.y - p.at.y) > 6) p.moved = true;
      if (pinch && ids.length === 2) {
        p.last = q; var a = ptrs[ids[0]].last, b = ptrs[ids[1]].last, d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        mapZoom(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d;
      } else if (p.moved) {
        var f = mapFrame(mv.clientWidth, mv.clientHeight), v = mapView();
        if (v.z > 1) { v.dx -= (q.x - p.last.x) / f.s; v.dy += (q.y - p.last.y) / f.s; }
        p.last = q;
      }
    });
    function mapUp(ev) {
      var p = ptrs[ev.pointerId]; delete ptrs[ev.pointerId];
      if (Object.keys(ptrs).length < 2) pinch = null;
      var c = sim && sim.captain;
      if (!p || p.moved || ev.type !== "pointerup" || !c || !c.pos || !turretActive()) return;
      var fr0 = mapFrame(mv.clientWidth, mv.clientHeight), t = fr0.toMap(p.at.x, p.at.y);
      // A squadron's commander: a tap on a target sends the ships selected to it (with none
      // selected, it opens the target's card); on open space it sends them there; with none
      // selected and no target there, it steers the flagship as on the bridge.
      if (sim.flag && cmdView) {
        var hit = null, hd = 22, ship = null, sd = 20;
        c.sqGroups().forEach(function (T) { var q = fr0.toPx(c.shownAt(T)); var d = Math.hypot(q.x - p.at.x, q.y - p.at.y); if (d < hd) { hd = d; hit = T; } });
        // (one of our ships under the tap, nearer than any target: select her, or drop her, as her line does)
        [{ no: 1, at: c.pos }].concat(c.sqLive().map(function (g) { return { no: g.no, at: c.wingPos(g) }; })).forEach(function (o) {
          var q = fr0.toPx(o.at), d = Math.hypot(q.x - p.at.x, q.y - p.at.y); if (d < sd) { sd = d; ship = o.no; }
        });
        if (ship !== null && (!hit || sd <= hd)) { sqToggle(ship); return; }
        if (hit && sqSel.length) { sqSend(hit); click(); return; }
        if (hit) { sqTgt = sqTgt === hit.id ? null : hit.id; click(); return; }
        if (sqSel.length) { sqSpot(t); click(); return; }
        sqTgt = null;
      }
      c.orderCourse(BL.navBearing(c.pos, t));
    }
    mv.addEventListener("pointerup", mapUp); mv.addEventListener("pointercancel", mapUp);
    mv.addEventListener("wheel", function (ev) { if (!sim || !sim.captain) return; var q = mapXY(ev); mapZoom(ev.deltaY < 0 ? 1.25 : 0.8, q.x, q.y); ev.preventDefault(); }, { passive: false });
    $("cp-mapwrap").querySelector(".cp-zoom").addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b || !sim || !sim.captain) return;
      b.blur(); var z = +b.dataset.zoom;
      if (z > 0) mapZoom(1.5); else if (z < 0) mapZoom(1 / 1.5); else mapFit();
    });
    $("cp-swap").addEventListener("click", function () { this.blur(); if (sim && sim.captain) bridgeSwap(!cpSwapped); });
  })();

  /* ------------------------------------------------------ The plotting screen
     In warp space before each system, the clock stopped: the system's map; tap to lay waypoints
     (1 to 8 legs to the jump zone), tap one to remove it; each leg's engine order; when it
     arrives against the jump window; what's wrong with it. Navigator's plot fills in a safe one. */
  var plotEd = null, plCtx = null, plW = 0, plH = 0;
  function openPlot() {
    var c = sim.captain, i = sim.jumpIndex, map = c.maps[i], old = c.plots[i];
    // Escort: the course is the carrier's (the navigator's plot); the gunboat keeps station on her.
    if (c.escort && !c.escort.flag) { c.setPlot(i, BL.navPlot(map, plotGOf)); BL.speech.unlock(); sim.beginJump(); running = true; speakNew(); return; }
    plotEd = { i: i, map: map, plot: old ? { pts: old.pts.map(function (p) { return { x: p.x, y: p.y }; }), eng: old.eng.slice() }
      : blankPlot(map) };
    $("pl-title").textContent = tc(sim.flag ? "Plan the attack · system " + (i + 1) + " of " + sim.cfg.jumps : "Plot the course · system " + (i + 1) + " of " + sim.cfg.jumps + " · " + BL.ENCOUNTERS[sim.reported(i)].name);
    $("pl-squad").hidden = !sim.flag;
    $("pl-new").hidden = !(job && job.test && i === 0);
    overlay("ov-plot", true);
    plW = 0; drawPlot();
  }
  function plotGOf(id) { return sim.helm.gOf(id); }
  // The plotting screen's squadron list: each ship and her order for this system.
  function drawPlotSquad() {
    var c = sim.captain, pre = c.preOrders[plotEd.i], ts = c.sqMaps[plotEd.i];
    $("pl-squad").innerHTML = '<div class="ps-hd">YOUR SHIPS · tap to send one to a target</div>' + c.sqLive().map(function (g) {
      var T = pre[g.no] !== undefined ? ts[pre[g.no]] : null;
      return '<button data-pre="' + g.no + '"><b>' + g.no + "</b> " + esc(g.name) + " → " + (T ? T.letter + " " + T.K.name.toLowerCase() : "in formation") + "</button>";
    }).join("") + '<div class="muted small-text">' + (sim.sys("buster") ? "No objective: get through and make the drop. Fortress ships guard the drop zone." : "The objective is the depot (gold).") + ' The flagship flies your course. "?" are contacts the pickets missed.</div>';
  }
  // A new plot: straight to the approach point, then in along the jump heading.
  function blankPlot(m) { return { pts: [{ x: m.start.x, y: m.start.y }, { x: m.approach.x, y: m.approach.y }, { x: m.jump.x, y: m.jump.y }], eng: ["cruise", "cruise"] }; }
  function drawPlot() {
    if (!plotEd) return;
    var box = $("pl-mapbox"), cv = $("pl-map"), dpr = window.devicePixelRatio || 1, w = box.clientWidth, hh = box.clientHeight, e = plotEd, K = BL.COMMAND;
    if (w && hh && (w !== plW || hh !== plH || !plCtx)) { plW = w; plH = hh; cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); plCtx = cv.getContext("2d"); plCtx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    var info = BL.plotInfo(e.map, e.plot, plotGOf);
    var pfr = BL.navFrame(e.map, null, plW, plH, 18);
    var plabels = [];
    if (plCtx) BL.drawNavMap(plCtx, plW, plH, e.map, e.plot, { frame: pfr, info: info, labels: plabels });
    if (plCtx && sim.flag) { drawTargets(plCtx, pfr, sim.captain.sqMaps[e.i], true, sim.captain, true, plabels); drawPlotSquad(); }
    // The legs: heading, time, engine order (tap to change).
    $("pl-legs").innerHTML = info.legs.map(function (l, k) {
      var t = l.len / Math.max(0.1, plotGOf(l.eng) * K.scale);
      return '<div class="plot-leg' + (l.clusters || (k === info.legs.length - 1 && info.offJump) ? " bad" : l.rocks || l.mines || Math.abs(l.turn) > K.maxTurn ? " warn" : "") + '"><span>Leg ' + (k + 1) + " · <b>" + hdg3(l.hdg) + "</b> · " + mmss(t) + "</span>" +
        '<button data-leg="' + k + '">' + sim.helm.preset(l.eng).name + "</button></div>";
    }).join("");
    // When it arrives, against the window.
    var span = e.map.window * 1.3;
    $("pl-time").innerHTML = "In the zone " + mmss(info.zoneEta) + " · window " + mmss(e.map.window) + (info.late ? ' <span style="color:var(--bad)">LATE</span>' : " ✔") +
      '<div class="bar"><i class="' + (info.late ? "late" : "") + '" style="width:' + pct(info.zoneEta / span) + '"></i><em style="left:' + pct(e.map.window / span) + '"></em></div>';
    var warn = [];
    if (info.count < info.minLegs) warn.push(["bad", "Needs " + info.minLegs + " to " + info.maxLegs + " legs (" + info.count + " now)"]);
    if (info.cpMiss.length) warn.push(["", "Misses checkpoint" + (info.cpMiss.length > 1 ? "s " : " ") + info.cpMiss.join(", ") + ": each one missed costs navigation"]);
    if (info.offJump) warn.push(["bad", "Last leg must be " + hdg3(e.map.jumpHdg) + " ±" + K.jumpTol + "° (now " + hdg3(info.lastHdg) + ")"]);
    if (info.rocks) warn.push(["", "Through asteroids: rocks to dodge and shoot"]);
    if (info.mines) warn.push(["", "Through the minefield: mines to dodge and shoot"]);
    if (info.late) warn.push(["bad", "Arrives after the window: more speed or fewer legs"]);
    if (info.clusters) warn.push(["bad", "Crosses an enemy area"]);
    if (BL.siegeSeen(e.map)) warn.push([info.siegeFire > 0.5 ? "" : "ok", info.siegeFire > 0.02 ? "Passes the siege line: " + Math.round(info.siegeFire * 100) + "% of its fire at the closest" : "Clear of the siege line's guns"]);
    if (info.sharp) warn.push(["", "Turn of more than " + K.maxTurn + "° at a waypoint"]);
    if (!warn.some(function (x) { return x[0] !== "ok"; })) warn.unshift(["ok", "✔ Clear course, on time"]);
    $("pl-warn").innerHTML = warn.map(function (x) { return '<div class="' + x[0] + '">' + x[1] + "</div>"; }).join("");
    $("pl-go").disabled = info.count < info.minLegs || info.count > info.maxLegs || info.offJump || info.clusters;
    setHtml($("pl-go"), info.count < info.minLegs ? "Needs " + info.minLegs + "+ legs (" + info.count + " now)" : info.offJump ? "Last leg " + hdg3(e.map.jumpHdg) + " ±" + K.jumpTol + "°"
      : info.clusters ? "Crosses enemies" : "Accept <small>(Enter)</small>");
    $("pl-undo").disabled = e.plot.pts.length <= 2;
  }
  function plotAdd(p) {
    var pl = plotEd.plot, n = pl.pts.length;
    if (n - 1 >= (plotEd.map.legs || BL.COMMAND.legs)[1]) { click(); return; }
    // (before the approach point while the plot still has it, so the last leg stays on the jump heading)
    var ap = plotEd.map.approach, at = n > 2 && Math.hypot(pl.pts[n - 2].x - ap.x, pl.pts[n - 2].y - ap.y) < 1e-6 ? n - 2 : n - 1;
    pl.pts.splice(at, 0, p); pl.eng.splice(at - 1, 0, pl.eng[at - 1] || "cruise");
    BL.audio.play("tick"); drawPlot();
  }
  function plotRemove(k) { var pl = plotEd.plot; pl.pts.splice(k, 1); pl.eng.splice(k, 1); BL.audio.play("tick"); drawPlot(); }
  function plotUndo() { var pl = plotEd.plot; if (pl.pts.length > 2) plotRemove(pl.pts.length - 2); }
  function plotNav() { var p = BL.navPlot(plotEd.map, plotGOf); plotEd.plot = { pts: p.pts, eng: p.eng }; click(); drawPlot(); }
  function plotClear() { plotEd.plot = blankPlot(plotEd.map); click(); drawPlot(); }
  function plotAccept() {
    if (!plotEd || $("pl-go").disabled) return;
    sim.captain.setPlot(plotEd.i, plotEd.plot); plotEd = null;
    overlay("ov-plot", false); click();
    BL.speech.unlock(); sim.beginJump(); running = true; speakNew();
  }
  function plotKey(ev) {
    var kl = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (kl === "n") plotNav(); else if (kl === "u" || kl === "Backspace") plotUndo(); else if (kl === "Enter") plotAccept(); else return;
    ev.preventDefault();
  }
  (function wirePlot() {
    $("pl-map").addEventListener("pointerdown", function (ev) {
      if (!plotEd) return;
      var r = this.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, f = BL.navFrame(plotEd.map, null, r.width, r.height, 18), pts = plotEd.plot.pts;
      for (var k = 1; k < pts.length - 1; k++) { var q = f.toPx(pts[k]); if (Math.hypot(q.x - x, q.y - y) < 16) { plotRemove(k); ev.preventDefault(); return; } }
      plotAdd(f.toMap(x, y)); ev.preventDefault();
    });
    // A squadron: each ship's order for this system (tap to send her to the next target in the report).
    $("pl-squad").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-pre]"); if (!b || !plotEd || !sim.flag) return;
      var c = sim.captain, pre = c.preOrders[plotEd.i], no = +b.dataset.pre, known = c.sqMaps[plotEd.i].filter(function (T) { return !T.unknown; });
      var k = pre[no] === undefined ? -1 : known.map(function (T) { return T.id; }).indexOf(pre[no]);
      if (k + 1 < known.length) pre[no] = known[k + 1].id; else delete pre[no];
      BL.audio.play("tick"); drawPlot();
    });
    $("pl-legs").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-leg]"); if (!b || !plotEd) return;
      var k = +b.dataset.leg; plotEd.plot.eng[k] = cycle(["cruise", "standard", "full"], plotEd.plot.eng[k], 1); BL.audio.play("tick"); drawPlot();
    });
    $("pl-nav").onclick = function () { if (plotEd) plotNav(); this.blur(); };
    $("pl-undo").onclick = function () { if (plotEd) plotUndo(); this.blur(); };
    $("pl-clear").onclick = function () { if (plotEd) plotClear(); this.blur(); };
    $("pl-new").onclick = function () { this.blur(); overlay("ov-plot", false); plotEd = null; click(); startBriefing(bridgeTestJob(BL.randomSeed())); startMission(); };
    $("pl-go").onclick = function () { plotAccept(); };
    window.addEventListener("resize", function () { if (plotEd) { plW = 0; drawPlot(); } });
  })();
  // The warp space report on the bridge.
  function gravCaptain(js, dmg, next, n) {
    var cs = sim.captain.stats.systems[n - 1] || {}, hc = sim.helm.jumps[n - 1] || {}, g = sim.turret.jumps[n - 1] || {}, K = BL.COMMAND;
    var zone = cs.zoneAt === null || cs.zoneAt === undefined ? "never reached" : "reached at " + mmss(cs.zoneAt) + (cs.zoneAt <= cs.window + K.zoneGrace ? " (on time)" : " (late; window " + mmss(cs.window) + ")");
    return "<p>Fighting has stopped." + (next ? " The ship is in warp space." : "") + "</p><ul class='grav-list'>" +
      "<li>Warp zone: " + zone + "</li>" +
      (cs.rockHits ? "<li>Asteroid hits: " + cs.rockHits + "</li>" : "") +
      "<li>Breaks you ordered: " + (hc.evasiveMet || 0) + " made of " + (hc.evasive || 0) + "</li>" + squadLine() +
      "<li>Enemy ships destroyed by your crew: " + g.kills + " of " + g.ships + "</li>" +
      "<li>Torpedoes shot down: " + g.downed + " of " + g.torps + "</li>" +
      "<li>Torpedoes stopped by shields: " + js.shielded + " of " + js.salvos + "</li>" +
      "<li>Hull damage taken: " + js.hullLost + "</li>" +
      (dmg.length ? "<li>Damage: " + dmg.map(function (d) { return d.what; }).join("; ") + "</li>" : "") + "</ul>" +
      (next ? "<h2>Next: " + tc(next.name) + "</h2><p>" + next.what + ". The drive will be empty again on arrival. Plot its course next; the clock is stopped.</p>" : "");
  }
  // The warp space report's squadron line: each ship's hull (a squadron only).
  function squadLine() {
    var v = sim.flag && sim.captain.squadView();
    if (!v) return "";
    var ts = sim.captain.sqTargets || [], down = ts.filter(function (T) { return T.dead; }).length, obj = ts.filter(function (T) { return T.K.objective; })[0];
    return "<li>Squadron: " + v.ships.map(function (x) { return esc(x.name) + " " + (x.live ? Math.round(x.hull * 100) + "%" : x.doing); }).join(", ") + "</li>" +
      "<li>Targets destroyed: " + down + " of " + ts.length + (obj ? " · the objective (" + obj.letter + ") " + (obj.dead ? "destroyed" : "still standing") : "") + "</li>";
  }
  function debriefCaptain(r) {
    var cp = r.captain, d = r.detail, K = BL.COMMAND, good = [];
    if (r.outcome === "success") good.push(sim.sys("buster") ? "The planet buster was dropped on the " + sim.world + " world." : sim.hasDrive ? "The ship made all its warps." : "The carrier recovered her after every sortie.");
    if (!cp.rockHits) good.push("No asteroid hits.");
    if (cp.squad && cp.squad.home === cp.squad.n) good.push("Every ship of the squadron came home.");
    var onTime = cp.systems.filter(function (s) { return s.zoneAt !== null && s.zoneAt <= s.window + K.zoneGrace; }).length;
    if (onTime === cp.systems.length && cp.systems.length) good.push(sim.hasDrive ? "In the warp zone on time every time." : "In the recovery zone on time every time.");
    if (cp.breaks + cp.pilotBreaks && cp.breaksMade === cp.breaks + cp.pilotBreaks) good.push("Every break was made.");
    if (!good.length) good.push("You kept the ship in the fight.");
    var cpN = 0, cpHit = 0; cp.systems.forEach(function (s) { cpN += s.cps || 0; cpHit += s.cpsHit || 0; });
    if (cpN && cpHit === cpN) good.push("Every checkpoint scouted.");
    $("db-good").textContent = good.join(" ");
    var sqLost = cp.squad ? cp.squad.lost + cp.squad.left : 0;
    $("db-worst").textContent = r.outcome === "destroyed" ? "The ship was destroyed." : r.outcome === "objectiveMissed" ? "The squadron warped on leaving the objective standing in " + sim.captain.sqMissed() + (sim.captain.sqMissed() === 1 ? " system." : " systems.") : sqLost ? "The squadron lost " + sqLost + " of its " + cp.squad.n + " ships." : r.outcome === "dropMissed" ? "The drop window closed before the planet buster was launched." : r.outcome === "wardLost" ? "The " + cp.escort.name + " was lost." : r.outcome === "leftBehind" ? "The carrier's hangar bay was destroyed: she warped without you." :
      cpHit < cpN ? "Missed " + (cpN - cpHit) + " of " + cpN + " checkpoints." : cp.rockHits ? "The ship hit asteroids " + cp.rockHits + (cp.rockHits === 1 ? " time." : " times.") :
      onTime < cp.systems.length ? "The ship reached the " + (sim.hasDrive ? "warp" : "recovery") + " zone late in " + (cp.systems.length - onTime) + " of " + cp.systems.length + (sim.hasDrive ? " systems." : " sorties.") :
      cp.unanswered && !(cp.squad && !cp.squad.flagBridge) ? cp.unanswered + " torpedo bursts came and went with no call from you (taken on the shields)." : "Nothing went badly wrong.";     // (a squadron: the break calls were the flag captain's)
    $("db-jumps").innerHTML = "<tr><th>" + (sim.hasDrive ? "Warp" : "Sortie") + "</th><th>Encounter</th><th>Legs</th><th>In the zone</th><th>Asteroid hits</th><th>Breaks made</th><th>Shielded</th><th>Hull lost</th><th>Seconds</th></tr>" +
      r.jumps.map(function (j, i) {
        var s = cp.systems[i] || {}, t = sim.helm.jumps[i] || {};
        var rp = sim.reported(i), enc = BL.ENCOUNTERS[j.encounter].name + (rp !== j.encounter ? " <small>(reported " + BL.ENCOUNTERS[rp].name + ")</small>" : "");
        return "<tr><td>" + (i + 1) + "</td><td>" + enc + "</td><td>" + (s.legs || "") + "</td><td>" + (s.zoneAt === null || s.zoneAt === undefined ? "never" : mmss(s.zoneAt) + " / " + mmss(s.window)) + "</td><td>" + (s.rockHits || 0) +
          "</td><td>" + (t.evasiveMet || 0) + " / " + (t.evasive || 0) + "</td><td>" + j.shielded + " / " + j.salvos + "</td><td>" + j.hullLost + "</td><td>" + j.seconds + "</td></tr>";
      }).join("");
    var en = sim.turret.engineer, crew = sim.turret.bats.map(function (b) { return b.crew; }).filter(Boolean);
    var pc = sim.captain.pilotCrew, rows = [
      ["Engineer", esc(en.name) + ", " + en.label + " (skill " + Math.round(en.skill * 100) + ")"],
      ["Gun crew", crew.map(function (c) { return esc(c.name) + ", " + c.label + " (" + Math.round(c.skill * 100) + ")"; }).join(" · ")],
      ["Pilot", esc(pc.name) + ", " + pc.label + " (skill " + Math.round(pc.skill * 100) + ")"],
      ["Torpedo bursts", cp.calls + ": " + cp.breaks + " breaks ordered, " + cp.pilotBreaks + " by the pilot on his own (" + cp.breaksMade + " made), " + cp.taken + " taken on the shields, " + cp.unanswered + " with no call"],
      ["Asteroid hits", cp.rockHits], ["Enemy areas flown into", cp.swarms || 0]].concat(cp.dropped ? [
      ["Dropped down", "you took a station yourself; stood aside: " + (cp.replacedNames.map(esc).join(", ") || "nobody") + " (once a mission: −1 command reputation, −1 morale to each man replaced)"]] : []).concat(cpN ? [
      ["Checkpoints", cp.systems.map(function (s) { return s.cpsHit + "/" + s.cps; }).join(" · ") + " (system by system)"]] : []).concat(cp.escort ? [
      [cp.escort.kind === "convoy" ? "Convoy at the end" : (cp.escort.kind === "capital" ? "Capital ship" : "Carrier") + " hull at the end",
        (cp.escort.kind === "convoy" ? cp.escort.afloat + " of " + cp.escort.ships + " merchants through, hull " : "") + cp.escort.hull + "%"],
      ["Squadron", cp.escort.squad + " ships: wingmen shot down " + cp.escort.wingStops + " torpedoes" + (cp.escort.wingLost ? ", " + cp.escort.wingLost + " lost" : "")],
      ["On station", cp.escort.onStation.map(function (p) { return p + "%"; }).join(" · ") + (sim.hasDrive ? " (system by system)" : " (sortie by sortie)")],
      ["Torpedoes at the " + cp.escort.name, cp.escort.calls + " bursts: " + cp.escort.covers + " covered (" + cp.escort.covered + " torpedoes taken on our shields), " + cp.escort.torps + " hit her"]] : []).concat(cp.squad ? [
      ["Squadron", cp.squad.home + " of " + cp.squad.n + " ships home" + (cp.squad.lost ? ", " + cp.squad.lost + " lost" : "") + (cp.squad.left ? ", " + cp.squad.left + " left behind" : "")],
      [cap(sim.data.classId, "Flag captain"), esc(cp.squad.flag) + (cp.squad.flagBridge ? " (you took his bridge: once a mission −1 squadron reputation, −1 morale to him)" : "")],
      [cap(sim.data.classId, "Captains"), cp.squad.ships.map(function (x) { return esc(x.ship) + " (" + esc(x.name) + "): " + (x.left ? "left behind" : x.hull > 0 ? "hull " + x.hull + "%" : "lost") + ", " + x.kills + " kills"; }).join(" · ")],
      ["Targets destroyed", cp.squad.targetsDown + " of " + cp.squad.targets + (cp.squad.objectives ? " (objectives " + cp.squad.objectivesDown + " of " + cp.squad.objectives + ")" : "") + "; " + cp.squad.kills + " finished off by the other ships"]] : []).concat([
      ["Enemy ships destroyed by your crew", cp.kills + " / " + cp.ships],
      ["Torpedoes shot down", cp.downed],
      ["Hull lost", d.hullLost],
      ["Failsafe trips (the engineer's reactor)", d.trips],
      ["Damage reports", r.damage.length]
    ]);
    $("db-detail").innerHTML = rows.map(function (x) { return "<div><span>" + x[0] + ":</span> " + x[1] + "</div>"; }).join("");
    $("db-career").hidden = !report;
    if (report) renderCareerReport(r);
    $("btn-db-hub").hidden = !!job.test;
    $("btn-db-again").hidden = $("btn-db-new").hidden = $("btn-db-title").hidden = !job.test;
  }
  function fmtG(v) { var r = Math.round(v * 10) / 10; return r % 1 ? r.toFixed(1) : String(r); }
  // Keys at the helm: ← → wheel, 0 midships, ↑ ↓ both engines, Q A port, P L starboard, W S / O K trim port / starboard,
  // + − one G, T autopilot, [ ] course 1° (autopilot), E warn engineering, Space launch, Esc pause.
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
    else if (kl === "w") h.trimEngine("port", 1);
    else if (kl === "s") h.trimEngine("port", -1);
    else if (kl === "o") h.trimEngine("stbd", 1);
    else if (kl === "k") h.trimEngine("stbd", -1);
    else if (k === "+" || k === "=") h.nudgeG(1);
    else if (k === "-" || k === "_") h.nudgeG(-1);
    else if (kl === "t" && !ev.repeat) h.setAuto(!h.auto);
    else if (k === "]") h.nudgeCourse(1);
    else if (k === "[") h.nudgeCourse(-1);
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
    $("hm-trim").addEventListener("click", function (ev) { var b = ev.target.closest("button[data-trim]"); if (b && turretActive()) sim.helm.trimEngine(b.dataset.trim, +b.dataset.dir); if (b) b.blur(); });
    $("hm-gdown").addEventListener("click", function () { if (turretActive()) sim.helm.nudgeG(-1); this.blur(); });
    $("hm-auto").addEventListener("click", function () { if (turretActive()) sim.helm.setAuto(!sim.helm.auto); this.blur(); });
    $("hm-warn").addEventListener("click", function () { if (turretActive()) sim.helm.warn(); this.blur(); });
    $("hm-launch").addEventListener("click", function () { if (turretActive()) sim.helm.launch(); this.blur(); });
    $("hm-order").addEventListener("click", function () {
      var h = turretActive() && sim.helm, o = h && h.orderView();
      if (o) h.setAuto(true, o.hdg); else if (h && h.engOrder) h.setOrder("both", h.engOrder.eng);
    });
    $("hm-alerts").addEventListener("click", function (ev) { var d = ev.target.closest("[data-hdg]"); if (d && turretActive()) sim.helm.setAuto(true, +d.dataset.hdg); });
  })();
  function gravHelm(js, dmg, next, n) {
    var c = sim.helm.jumps[n - 1] || {}, g = sim.turret.jumps[n - 1] || {};
    return "<p>Fighting has stopped." + (next ? (sim.hasDrive ? " The ship is in warp space." : " The carrier has you on deck and is carrying you through warp space.") : "") + "</p><ul class='grav-list'>" + laneLine(g, n) +
      (g.mines && sim.route[n - 1] !== "sweep" ? "<li>Mines shot down: " + g.minesDowned + " of " + g.mines + "</li>" : "") +
      "<li>Orders met: " + c.ordersMet + " of " + c.orders + "</li>" +
      (c.requests ? "<li>Gunners' calls answered: " + c.requestsMet + " of " + c.requests + "</li>" : "") +
      (c.evasive ? "<li>Breaks the " + sim.helm.who.toLowerCase() + " ordered: " + c.evasiveMet + " made of " + c.evasive + "</li>" : "") +
      (c.disobeyed ? "<li>Out of the corridor: " + c.disobeyed + " (each costs " + Math.round(BL.HELM.evade.disobeyCost * 100) + "% of the mission's score)</li>" : "") +
      "<li>Torpedoes dodged: " + (c.dodged || 0) + " of " + (c.torps || 0) + "</li>" +
      (sim.hasDrive ? "" : "<li>Launch: " + (c.launchWait ? c.launchWait + " s after the call" : "right away") + "</li>") +
      (c.stressHits ? "<li>Structural hits from hard turns: " + c.stressHits + "</li>" : "") +
      "<li>Enemy ships destroyed by your crew: " + g.kills + " of " + g.ships + "</li>" +
      "<li>Torpedoes shot down: " + g.downed + " of " + g.torps + "</li>" +
      (g.ptFired ? "<li>Our torpedoes: " + g.ptHits + " hits of " + g.ptFired + " launched. Both tubes are reloaded.</li>" : "") +
      "<li>Torpedoes stopped by shields: " + js.shielded + " of " + js.salvos + "</li>" +
      "<li>Hull damage taken: " + js.hullLost + "</li>" +
      (dmg.length ? "<li>Damage: " + dmg.map(function (d) { return d.what; }).join("; ") + "</li>" : "") +
      (next && sim.lastRepairs && sim.lastRepairs.length ? "<li>Damage control repaired half of it: " + sim.lastRepairs.join("; ") + "</li>" : "") +
      "</ul>" + (next ? "<h2>Next: " + tc(next.name) + "</h2><p>" + gunnerTip(sim.route[sim.jumpIndex]) + (sim.hasDrive ? "" : " You'll be back in the launch tube.") + "</p>" +
      "<p class='muted'>Take a breath; the clock is stopped.</p>" : "");
  }
  function debriefHelm(r) {
    var hm = r.helm, d = r.detail;
    $("db-jumps").innerHTML = "<tr><th>" + (r.hasDrive ? "Warp" : "Sortie") + "</th><th>Encounter</th><th>Orders met</th><th>Dodged</th><th>Structural hits</th>" + (r.hasDrive ? "<th>On time</th>" : "<th>Launch wait</th>") + "<th>Shielded</th><th>Hull lost</th><th>Seconds</th></tr>" +
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
      ["Disobeyed (out of the corridor)", hm.disobeyed ? hm.disobeyed + " (−" + Math.round(BL.HELM.evade.disobeyCost * 100) + "% of the score each)" : "never"],
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
    if (r.outcome === "success") notes.push(sim.sys("buster") ? "The planet buster got through." : r.hasDrive ? "The ship made all its warps." : "The gunboat made it back aboard.");
    if (hm.orders && hm.ordersMet === hm.orders) notes.push("Every order met.");
    else if (hm.orders && hm.ordersMet / hm.orders >= 0.75) notes.push(hm.ordersMet + " of " + hm.orders + " orders met.");
    if (!hm.stressHits && !hm.flankHits) notes.push("No structural damage from your flying.");
    if (!hm.autoPct) notes.push("You flew it all by hand.");
    if (!notes.length) notes.push("You kept the ship in the fight.");
    return notes.join(" ");
  }
  function worstHelm(r) {
    var hm = r.helm;
    if (hm.disobeyed) return "You left the corridor " + hm.disobeyed + (hm.disobeyed === 1 ? " time" : " times") + " when the " + (r.hasDrive ? "captain's" : "coxswain's") + " course stood. Each one went in the report: −" + Math.round(BL.HELM.evade.disobeyCost * 100) + "% of the score.";
    if (hm.stressHits >= 2) return hm.stressHits + " structural hits from turning past the safe rate. Ease off before the stress bar fills.";
    if (hm.orders && hm.ordersMet / hm.orders < 0.6) return "Only " + hm.ordersMet + " of " + hm.orders + " orders met. Start the turn early (watch the white stop tick) and set the engine order too.";
    if (hm.flankHits) return "Flank held too long burned out a thruster.";
    var late = Math.max.apply(null, hm.launches.concat([0]));
    if (late >= 5) return "A launch came " + late + " s after the call; that's fight time lost.";
    return "Nothing stands out. Clean run.";
  }

  /* ----------------------------------------------------------- warp space */
  // The report after each jump (sortie); final: after the mission's last one, on the way to the debriefing.
  var gravFinal = false;
  function showGrav(final) {
    gravFinal = !!final;
    var n = sim.stats.jumps.length, js = sim.stats.jumps[n - 1], next = final ? null : BL.ENCOUNTERS[sim.shown(sim.jumpIndex)];
    var dmg = sim.stats.damageReports.filter(function (d) { return d.jump === n; });
    $("grav-title").textContent = tc(final ? (sim.sys("buster") ? "The drop: planet buster away on the " + sim.world + " world" : sim.hasDrive ? "Warp " + n + " of " + sim.cfg.jumps + " complete" : "Sortie " + n + " of " + sim.cfg.jumps + " complete: back aboard the carrier")
      : sim.hasDrive ? "In warp space: warp " + n + " of " + sim.cfg.jumps + " complete" : "Aboard the carrier: sortie " + n + " of " + sim.cfg.jumps + " complete");
    $("btn-grav-go").textContent = final ? "Mission debriefing" : sim.captain ? "Plot the next course" : sim.hasDrive ? "Drop out of warp space" : "Launch";
    if (sim.turret) { $("grav-body").innerHTML = sim.captain ? gravCaptain(js, dmg, next, n) : sim.helm ? gravHelm(js, dmg, next, n) : gravGunner(js, dmg, next, n); overlay("ov-grav", true); return; }
    $("grav-body").innerHTML =
      "<p>Fighting has stopped." + (final ? "" : (sim.hasDrive ? "" : " The carrier has you on deck and is carrying you through warp space.") + (sim.hasAux() ? " The aux bank is refilled." : "")) + "</p>" +
      "<ul class='grav-list'>" +
      "<li>Salvos stopped by shields: " + js.shielded + " of " + js.salvos + "</li>" +
      "<li>Hull damage taken: " + js.hullLost + "</li>" +
      "<li>Failsafe trips: " + js.trips + "</li>" +
      "<li>Enemies destroyed: " + js.kills + "</li>" +
      (sim.hasDrive ? "<li>Warp " + (js.onTime ? "on time" : "late: the drive wasn't full when the window opened") + "</li>" : "") +
      (dmg.length ? "<li>Damage: " + dmg.map(function (d) { return d.what; }).join("; ") + "</li>" : "") +
      (!final && sim.lastRepairs && sim.lastRepairs.length ? "<li>Damage control repaired half of it: " + sim.lastRepairs.join("; ") + "</li>" : "") +
      "</ul>" +
      (final ? "" : "<h2>Next: " + tc(next.name) + "</h2><p>" + next.what + ". Tests: " + next.tests.toLowerCase() + (sim.hasDrive ? ". The drive will be empty again on arrival." : ". The carrier launches you again on arrival.") + "</p>" +
      "<p class='muted'>Take a breath; the clock is stopped. You can adjust the priority order once you're back on the console.</p>");
    overlay("ov-grav", true);
  }
  // A mine lane: the share of its mines destroyed, and what that means for the fleet behind.
  function laneLine(g, n) {
    if (sim.route[n - 1] !== "sweep" || !g.mines) return "";
    var pct = Math.round(100 * g.minesDowned / g.mines);
    return "<li><b>Lane cleared: " + pct + "%</b> (" + g.minesDowned + " of " + g.mines + " mines). " +
      (pct >= 80 ? "The fleet gets through clean." : pct >= 50 ? "The fleet gets through with some damage." : "The fleet takes a beating in the lane.") + "</li>";
  }
  function gravGunner(js, dmg, next, n) {
    var g = sim.turret.jumps[n - 1] || {};
    return "<p>Fighting has stopped." + (next ? (sim.hasDrive ? " The ship is in warp space." : " The carrier has you on deck and is carrying you through warp space.") : "") + "</p><ul class='grav-list'>" + laneLine(g, n) +
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
      (next && sim.lastRepairs && sim.lastRepairs.length ? "<li>Damage control repaired half of it: " + sim.lastRepairs.join("; ") + "</li>" : "") +
      "</ul>" + (next ? "<h2>Next: " + tc(next.name) + "</h2><p>" + gunnerTip(sim.route[sim.jumpIndex]) + (sim.hasDrive ? "" : " The carrier launches you again on arrival.") + "</p>" +
      "<p class='muted'>Take a breath; the clock is stopped.</p>" : "");
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
    if (sim.captain) return;           // (the guns' order is given from the bridge)
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
    if (encId === "minefield") return brief ? "Shoot the mines." : "The mines sit still and stream past from ahead as the ship moves through them: shoot the ones on a collision course before they reach the shield. One hit from any gun kills a mine.";
    var good = bats.filter(function (b) { return b.w.best.indexOf(encId) >= 0; }).map(function (b) { return b.w.name.toLowerCase(); })
      .filter(function (n, i, a) { return a.indexOf(n) === i; });
    var gun = bats.length === 1 ? "Your " + bats[0].w.name.toLowerCase() : "None of your guns";
    return (look.ship && !brief ? "Expect " + (look.only ? "the " + look.ship : BL.plural(look.ship)) + ": " + look.what + ". " : "") +
      (good.length ? "Your " + good.join(" and ") + " does extra damage to them." : gun + (bats.length === 1 ? " gets" : " get") + " no bonus against them.");
  }
  $("btn-grav-go").onclick = function () {
    click(); overlay("ov-grav", false);
    if (gravFinal) { gravFinal = false; showDebrief(); return; }
    if (sim.captain) { openPlot(); return; }     // the bridge: plot the next system first
    BL.speech.unlock(); sim.beginJump(); speakNew();
  };

  // A story line with the hero's name and the ship's filled in.
  function storyText(t) {
    return String(t || "").replace(/\{hero\}/g, career ? career.name : "Recruit").replace(/\{ship\}/g, job ? BL.shipLabel(job.classId, job.ship, job.hull) : "the ship");
  }

  /* ---------------------------------------------------------- Debriefing */
  function showDebrief() {
    var r = sim.result, d = r.detail;
    show("scr-debrief");
    $("db-title").textContent = r.outcome === "success" ? (r.hasDrive ? (sim.sys("buster") ? "Mission complete: planet buster delivered" : "Mission complete") : "Sortie complete: recovered by the carrier") :
      r.outcome === "destroyed" ? "Ship destroyed" : r.outcome === "dropMissed" ? "Drop window missed: the planet buster never launched" : r.outcome === "wardLost" ? (r.captain && r.captain.escort ? r.captain.escort.name.replace(/^./, function (x) { return x.toUpperCase(); }) : "Carrier") + " lost" : r.outcome === "leftBehind" ? "Left behind: the carrier's hangar bay was destroyed" : r.outcome === "objectiveMissed" ? "Objective missed: the squadron warped on with it still standing" : "Abandoned ship";
    $("db-title").textContent = tc($("db-title").textContent);
    if (r.testWin) $("db-title").textContent += " (test win)";
    $("db-lede").textContent = (job.test ? "" : BL.shipLabel(job.classId, job.ship, job.hull) + " (TL" + r.tl + ") · ") + "Route " + routeNo(r.seed) + " · " +
      r.jumpsDone + " of " + sim.cfg.jumps + (r.hasDrive ? " warps · " : " sorties · ") + d.minutes + " minutes · hull " + r.hull + " / " + r.hullMax +
      (r.looks ? " · looked at the paused console " + r.looks + (r.looks === 1 ? " time" : " times") + " (−" + (100 - Math.round(100 * r.score / Math.max(1, r.raw))) + "%)" : "");
    $("db-score").textContent = r.score;
    $("db-jumps-title").textContent = r.hasDrive ? "Warp by Warp" : "Sortie by Sortie";
    var names = r.station === "captain" ? { objective: "Objective", condition: "Ship condition", navigation: "Navigation", command: "Command" }
      : r.station === "pilot" ? { objective: "Objective", condition: "Ship condition", orders: "Orders met", handling: "Ship handling" }
      : r.station === "gunner" ? { objective: "Objective", condition: "Ship condition", accuracy: "Accuracy", threats: "Threats stopped" }
      : { objective: "Objective", condition: "Ship condition", efficiency: "Efficiency", demands: "Demands met" };
    $("db-parts").innerHTML = Object.keys(names).map(function (k) {
      return '<div class="part"><span>' + names[k] + '</span><div class="hbar"><div class="hbar-fill" style="width:' + (r.parts[k] * 4) + '%"></div></div><b>' + r.parts[k] + " / 25</b></div>";
    }).join("");
    if (r.station === "captain") { debriefCaptain(r); return; }
    $("db-good").textContent = r.station === "pilot" ? wentWellHelm(r) : r.station === "gunner" ? wentWellGunner(r) : wentWell(r);
    $("db-worst").textContent = r.station === "pilot" ? worstHelm(r) : r.station === "gunner" ? worstGunner(r) : worstMoment(r);
    if (r.station === "pilot") { debriefHelm(r); return; }
    if (r.station === "gunner") { debriefGunner(r); return; }
    $("db-jumps").innerHTML = "<tr><th>" + (r.hasDrive ? "Warp" : "Sortie") + "</th><th>Encounter</th><th>Salvos shielded</th><th>Hull lost</th><th>Trips</th><th>Kills</th><th>On time</th><th>Seconds</th></tr>" +
      r.jumps.map(function (j, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + BL.ENCOUNTERS[j.encounter].name + "</td><td>" + j.shielded + " / " + j.salvos + "</td><td>" + j.hullLost +
          "</td><td>" + j.trips + "</td><td>" + j.kills + "</td><td>" + (j.onTime ? "yes" : "no") + "</td><td>" + j.seconds + "</td></tr>";
      }).join("");
    var rows = [
      ["Announced salvos shielded", d.salvosShielded + " / " + d.salvosAnnounced],
      ["Surprise salvos", d.surprises],
      ["Gun requests filled", d.requestsFilled + " / " + d.requests],
      ["Torpedoes the gun crew shot down", d.crewDowned || 0],
      ["Warps on time", d.jumpsOnTime + " / " + r.jumpsDone],
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

  // A story mission lost in a system the pickets got wrong: its own ending would name the enemy
  // that wasn't there (TexasBont, Nov 4, 2026).
  function intelLost(w) {
    function en(id) { var e = BL.plural(BL.ENCOUNTERS[id].enemy); return /^Azurian/.test(e) ? e : e.charAt(0).toLowerCase() + e.slice(1); }
    return "The intelligence was wrong: the pickets reported " + en(w.reported) + ", but " + en(w.found) + " were waiting. They held, and " + storyText("{ship}") + " could not get through.";
  }
  function signed(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n); }
  function renderCareerReport(r) {
    var st = career.stations[job.station], rows = [], story = job.story && BL.storyMission(job.story);
    if (story) rows.push('<p class="story-line"><b>' + esc(story.title) + ".</b> " + esc(r.intelWrong ? intelLost(r.intelWrong) : storyText(r.outcome === "success" ? story.after : story.lost)) + "</p>");
    if (story && r.outcome === "success" && story.n === 9) rows.push('<p class="big-line promo">' + BL.career.STATION_NAME[job.station] + " storyline complete.</p>");
    rows.push('<p class="big-line">Reputation: <b>' + signed(report.rep) + "</b> (" + BL.career.STATION_NAME[job.station].toLowerCase() + " path, now " + st.rep + ")</p>");
    rows.push('<p class="muted">' + report.repParts.map(function (p) { return p[0] + " " + signed(p[1]); }).join(", ") + (st.rep === 0 && report.rep > report.repParts.reduce(function (a, p) { return a + p[1]; }, 0) ? " (reputation never goes below 0)" : "") + "</p>");
    if (r.outcome !== "success") rows.push('<p class="big-line">No promotion for a failed mission.</p>');
    if (report.promoted && job.station === "squadron") rows.push('<p class="big-line promo">Squadron command: ' + r.className.toLowerCase() + "s</p>");
    else if (report.promoted) rows.push('<p class="big-line promo">Qualified: ' + BL.career.rank(career, job.station) + " (" + r.className + ")</p>");
    if (report.failuresAtPost === 1) rows.push('<p class="big-line">Failure 1 of 2 at this post. A second failure here sends you back a class.</p>');
    if (report.sentBack) rows.push('<p class="big-line demo">Second failure at this post: sent back to ' + (report.qualifiedAfter ? BL.career.rank(career, job.station) : "the gunboat, unqualified") +
      ". Requalify with a real mission.</p>");
    // Command: the men lost with the ship (js/roster.js) and the green hires who took their places.
    if (report.crew && r.outcome === "destroyed") rows.push('<p class="big-line' + (report.crew.lost.length ? " demo" : "") + '">' + (report.crew.lost.length ? "Lost with the ship: " + report.crew.lost.map(function (x) { return esc(x.name) + " (" + x.at + ")"; }).join(", ") + "." +
      (report.crew.hired ? " " + report.crew.hired + " new hire" + (report.crew.hired === 1 ? "" : "s") + " joined your crew pool." : "") : "All hands survived.") + "</p>");
    // Squadron command: the captains whose ships were lost (js/captains.js): killed, or waiting for a new ship.
    var rc = report.captains;
    if (rc && (rc.lost.length || rc.out.length)) rows.push('<p class="big-line' + (rc.lost.length ? " demo" : "") + '">' +
      (rc.lost.length ? "Killed with their ships: " + rc.lost.map(function (x) { return esc(x.name) + " (" + esc(x.ship) + ")"; }).join(", ") + ". " : "") +
      (rc.out.length ? "Survived the loss of their ships, awaiting new ones (they sit out the next squadron mission): " + rc.out.map(function (x) { return esc(x.name) + " (" + esc(x.ship) + ")"; }).join(", ") + ". " : "") +
      (rc.hired ? cap(job.classId, rc.hired + " new captain" + (rc.hired === 1 ? "" : "s") + " joined your captains pool.") : "") + "</p>");
    rows.push("<h2>" + BL.career.STATION_NAME[job.station] + " Reputation Profile</h2>" + profileHtml(report.profileAfter, report.profileBefore, job.station));
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
    if (r.outcome === "success") notes.push(sim.sys("buster") ? "The planet buster got through." : "The ship made all its warps.");
    if (d.salvosAnnounced && d.salvosShielded === d.salvosAnnounced) notes.push("Every announced salvo hit full shields.");
    else if (d.salvosAnnounced && d.salvosShielded / d.salvosAnnounced >= 0.75) notes.push("Shields stopped " + d.salvosShielded + " of " + d.salvosAnnounced + " announced salvos.");
    if (r.jumpsDone && d.jumpsOnTime === r.jumpsDone) notes.push("Every warp was on time.");
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
    if (oSev >= qSev) return "The longest overload: " + o.dur + " s above 100% load in warp " + o.jump + ", starting at T+" + mmss(o.t) + ".";
    return "Gunner " + q.gun + " in warp " + q.jump + " (T+" + mmss(q.t) + "): called for rapid fire and missed " + q.missed + " of " + q.wanted + " shots for lack of charge.";
  }

  function saveDebrief() {
    var r = sim.result, now = new Date();
    var today = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
    var data = { app: BL.APP_TAG, kind: "debriefing", version: window.APP_VERSION, savedAt: new Date().toISOString(), result: r };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = BL.APP_TAG + "_debrief_route" + routeNo(r.seed).replace(/\./g, "-") + "_" + today + ".json";
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
    ],
    pilot: [
      ["aggression", "Aggression", "gentle", "hard turns, flank"],
      ["winloss", "Win/loss", "losses", "wins"],
      ["efficiency", "Following orders", "freelancer", "by the book"],
      ["demands", "Dodging", "late", "sharp"],
      ["guns", "Guns on target", "rarely", "always"],
      ["condition", "Ship condition", "wrecked", "untouched"]
    ],
    captain: [
      ["winloss", "Win/loss", "losses", "wins"],
      ["efficiency", "Navigation", "lost", "on time"],
      ["demands", "Command", "loose", "tight"],
      ["guns", "Guns on target", "rarely", "always"],
      ["condition", "Ship condition", "wrecked", "untouched"],
      ["delegation", "Delegation", "hands-on", "delegates"]
    ]
  };
  PROFILE_ROWS.squadron = PROFILE_ROWS.captain;
  function profileHtml(p, before, station) {
    return PROFILE_ROWS[station || "engineer"].map(function (row) {
      var v = clampN(p[row[0]], 0, 1) * 100;
      var b = before ? '<i class="pf-mark before" style="left:' + clampN(before[row[0]], 0, 1) * 100 + '%"></i>' : "";
      return '<div class="pf"><span>' + row[1] + '</span><div class="pf-track"><div class="pf-fill" style="width:' + v + '%"></div>' + b +
        '<i class="pf-mark" style="left:' + v + '%"></i></div><div class="pf-ends"><span>' + row[2] + "</span><span>" + row[3] + "</span></div></div>";
    }).join("") + (before ? '<p class="muted small-text">Grey mark: before this mission.</p>' : "");
  }
  // jobs: each row's name is a button to that path's job offers (the career hub; TexasBont, Nov 6, 2026).
  function gridHtml(c, jobs, dates) {
    /* (the service record's chart: the date and time each qualification was first earned in place
       of its ribbon; TexasBont, Nov 8, 2026) */
    var R = dates ? function (st, n) { return qualDate(c, st, n); } : BL.ribbonSvg;
    // (every class column the same width; the numbers in one row, the names centred in the row under them)
    var head = "<colgroup><col class=\"cg-first\">" + BL.CLASSES.map(function () { return "<col>"; }).join("") + "</colgroup>" +
      '<thead><tr class="cg-nums"><th rowspan="2"></th>' + BL.CLASSES.map(function (k) { return '<th><span class="cg-n">' + k.n + "</span></th>"; }).join("") + "</tr>" +
      '<tr class="cg-names">' + BL.CLASSES.map(function (k) { return "<th>" + k.name + "</th>"; }).join("") + "</tr></thead>";
    var later = { gunner: "Phase 3", pilot: "Phase 4" };
    var rows = BL.career.STATIONS.map(function (st) {
      var q = BL.career.qualified(c, st), target = BL.career.targetClass(c, st);
      var name = jobs && BL.career.PLAYABLE[st] ? '<button class="cg-jobs" data-jobs="' + st + '" title="' + BL.career.STATION_NAME[st] + ' job offers">' + BL.career.STATION_NAME[st] + " ›</button>" : BL.career.STATION_NAME[st];
      return "<tr><td>" + name + "</td>" + BL.CLASSES.map(function (k) {
        if (!BL.career.PLAYABLE[st]) return k.n === 1 ? '<td class="later" colspan="9">' + later[st] + "</td>" : "";
        // (squadron command: class by class, open after 3 successful command missions on it)
        var sqRib = st === "squadron" && BL.career.squadronWins(c, k.n) && BL.ribbonSvg ? R(st, k.n, 80) : "";
        // (squadron: the count of squadron successes beside the ribbon until 3/3, as on the Command row)
        var sw = st === "squadron" ? BL.career.squadronWins(c, k.n) : 0, need = BL.CAPTAINS.opens;
        if (sqRib && sw < need) return '<td class="qpart rib" data-rep="' + st + ":" + k.n + '" title="Squadron commanded; ' + sw + " of " + need + ' successes (the next class\u2019s squadron opens at ' + need + ')">' + R(st, k.n, 58) + '<span class="cg-cnt">' + sw + "/" + need + "</span></td>";
        if (sqRib) return '<td class="q rib" data-rep="' + st + ":" + k.n + '" title="Squadron commanded: S' + k.n + ' ribbon: tap for its mission reports">' + sqRib + "</td>";
        if (st === "squadron") return sw ? '<td class="q" title="Squadron commanded">✔</td>' : BL.career.squadronOpen(c, k.n) ? '<td class="next" title="Open to you: 0 of ' + need + ' successes">▶ 0/' + need + "</td>" :
          '<td class="off">' + (BL.career.built(st, k.n) ? "" : "·") + "</td>";
        var ready = BL.career.built(st, k.n);
        // (command: the square shows the command successes and turns green at 3/3, when that
        // class's squadron opens: TexasBont, Nov 4, 2026)
        if (k.n <= q && st === "captain" && BL.career.built("squadron", k.n) && !BL.career.commandDone(c, k.n))
          return '<td class="qpart' + (BL.ribbonSvg ? " rib" : "") + '" data-rep="' + st + ":" + k.n + '" title="Qualified; ' + BL.career.commandWins(c, k.n) + " of " + BL.CAPTAINS.opens + ' command successes toward this class’s squadron">' +
            (BL.ribbonSvg ? R(st, k.n, 58) + '<span class="cg-cnt">' : "✔ ") + BL.career.commandWins(c, k.n) + "/" + BL.CAPTAINS.opens + (BL.ribbonSvg ? "</span>" : "") + "</td>";     // (the ribbon, and the count beside it)
        // (a path with ribbons shows each rank's ribbon in place of the tick: BL.ribbonSvg)
        var rib = k.n <= q && BL.ribbonSvg ? R(st, k.n, 80) : "";
        if (rib) return '<td class="q rib" data-rep="' + st + ":" + k.n + '" title="' + BL.career.STATION_NAME[st] + "-" + k.n + ' ribbon: tap for its mission reports">' + rib + "</td>";
        if (k.n <= q) return '<td class="q" title="Qualified">✔</td>';
        if (k.n === target && ready && (st !== "captain" || BL.career.canCommand(c, k.n))) return '<td class="next" title="Working toward">▶</td>';
        return '<td class="off">' + (ready ? "" : "·") + "</td>";
      }).join("") + "</tr>";
    }).join("") + admiralRow(c, jobs, R);
    // (dates: the 1/3 count goes on the time's line, inside the square)
    if (dates) rows = rows.replace(/<span class="cg-date">((?:(?!<\/span>).)*)<\/span><span class="cg-cnt">([^<]*)<\/span>/g, function (m, d, n) {
      return '<span class="cg-date">' + d + (d.indexOf("<br>") < 0 ? "<br>" : " ") + '<span class="cg-cnt">' + n + "</span></span>";
    });
    return '<table class="cgrid' + (jobs ? " jobs" : "") + '">' + head + "<tbody>" + rows + "</tbody></table>" + (dates ? "" : "<p class=\"muted small-text\">" + (jobs ? "Tap a row's name for its job offers, a ribbon for its mission reports · " : "Tap a ribbon for its mission reports · ") + "✔ qualified (each path shows the rank's ribbon) · " + "▶ working toward · dot = not built yet · Command: 1/3 beside a ribbon counts command successes; at 3/3 that class's squadron opens · Squadron: 1/3 beside a ribbon counts squadron successes; a class's squadron opens with 3/3 on its command and 3/3 on the squadron class below; ▶ open" + "</p>");
  }
  // The admiral path's row (TexasBont, Nov 7, 2026): F3 to F8 and G9 under the class at the top of
  // each level's fleet (destroyer escort 3 ... dreadnought 9): ✔ stepped up from, ▶ the level he's at.
  // (a qualification's first date and time, 3026.11.01.14.05, for the service record's chart)
  function qualDate(c, st, n) {
    var d = (c.qualDates || {})[st + ":" + n];
    return '<span class="cg-date">' + (d ? starDate({ date: d.date }) + (d.time ? "<br>" + d.time : "") : "—") + "</span>";
  }
  function admiralRow(c, jobs, R) {
    var o = BL.career.admiralOffer(c), A = c.admiral;
    var name = jobs ? '<button class="cg-jobs" data-jobs="admiral" title="Admiral: your next fleet campaign">Admiral ›</button>' : "Admiral";
    return "<tr><td>" + name + "</td>" + BL.CLASSES.map(function (k) {
      var L = k.n, T = BL.career.admiralTitle(L).short;
      if (L < 3) return '<td class="off"></td>';
      // (the level's ribbon once stepped up from; tap for its campaign reports)
      if ((L < 9 && A.closed[L] && A.at > L) || (L === 9 && A.won))
        return BL.ribbonSvg ? '<td class="q rib" data-rep="admiral:' + L + '" title="' + T + ' ribbon: tap for its campaign reports">' + R("admiral", L, 80) + "</td>" : '<td class="q" title="' + T + ': stepped up">' + T + " ✔</td>";
      if (L === o.level && o.open) return '<td class="next" title="' + T + ': your next campaign">' + T + " ▶</td>";
      return '<td class="off" title="' + T + '">' + T + "</td>";
    }).join("") + "</tr>";
  }
  // (no ranks here: the career chart shows them, the ribbon rack the best of each: TexasBont, Nov 7, 2026)
  function summaryHtml(c) {
    // (one Reputation line, path by path: TexasBont, Nov 7, 2026)
    return '<div class="hub-rep"><h3>Reputation</h3>' + BL.career.STATIONS.filter(function (s) { return BL.career.PLAYABLE[s]; }).map(function (s) {
      return "<span>" + BL.career.STATION_NAME[s] + " <b>" + c.stations[s].rep + "</b></span>";
    }).join("") +
      "<span>Admiral <b>" + c.admiral.rep + "</b></span></div>" +
      "<span>Rapid sign-offs <b>" + BL.career.signoffsHeld(c) + "</b></span>" +
      "<span>Missions <b>" + sumProfiles(c, "missions") + "</b> (" + sumProfiles(c, "wins") + " won)</span>";
  }
  /* His ribbon rack (TexasBont, Nov 7, 2026): the ribbon of the best rank on each path, in order of
     precedence (admiral, squadron, command, pilot, gunner, engineer), worn as real racks are:
     rows of three, a short row on top and centred, the highest top left; each path's reputation
     under it. */
  var RACK = ["admiral", "squadron", "captain", "pilot", "gunner", "engineer"];
  function rackTop(c, p) {
    if (p === "admiral") { var A = c.admiral, top = A.won ? 9 : 0; for (var L = 3; L <= 8; L++) if (A.closed[L] && A.at > L) top = Math.max(top, L); return top; }
    if (p === "squadron") { var k = BL.career.squadronClasses(c); return k.length ? Math.max.apply(null, k) : 0; }
    return BL.career.qualified(c, p);
  }
  /* The title screen's poster (TexasBont, Nov 7, 2026; a stand-in until there's art): a Starforce
     recruiting poster (no subtitle: TexasBont, Nov 8, 2026), 2:3, an officer in his cap against the stars, a ship passing, his name on the
     banner ("Your name here" before he enlists). */
  function posterSvg(name) {
    var stars = "", x = 11;
    for (var i = 0; i < 70; i++) {
      x = (x * 9301 + 49297) % 233280; var sx = (x / 233280) * 200;
      x = (x * 9301 + 49297) % 233280; var sy = (x / 233280) * 190;
      x = (x * 9301 + 49297) % 233280; var r = x / 233280 > 0.85 ? 0.9 : 0.45;
      stars += '<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="' + r + '" fill="#fff" opacity="' + (r > 0.5 ? 0.9 : 0.5) + '"/>';
    }
    var nm = esc((name || "Your name here").toUpperCase());
    return '<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Starforce poster">' +
      '<defs><linearGradient id="pg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050913"/><stop offset=".6" stop-color="#0c1d3a"/><stop offset="1" stop-color="#16345c"/></linearGradient>' +
      '<radialGradient id="pg-planet" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#3f86c4"/><stop offset=".7" stop-color="#173f6b"/><stop offset="1" stop-color="#081a30"/></radialGradient>' +
      '<linearGradient id="pg-coat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2740"/><stop offset="1" stop-color="#0b1020"/></linearGradient>' +
      '<linearGradient id="pg-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".5" stop-color="#e0b030"/><stop offset="1" stop-color="#8a6410"/></linearGradient></defs>' +
      '<rect width="200" height="300" fill="url(#pg-sky)"/>' + stars +
      '<circle cx="168" cy="250" r="95" fill="url(#pg-planet)" opacity=".9"/>' +
      // (a ship passing, its drive glowing)
      '<g transform="translate(140,58) rotate(-24)"><path d="M-30,0 L14,-4 L26,0 L14,4 Z" fill="#9fb3c8"/><path d="M-30,-2.5 L-38,0 L-30,2.5 Z" fill="#4cc3ee"/><circle cx="-39" cy="0" r="3" fill="#4cc3ee" opacity=".5"/></g>' +
      '<text x="100" y="30" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="22" letter-spacing="3" fill="#4cc3ee">STARFORCE</text>' +
      // (the officer: shoulders, collar, head, peaked cap)
      '<path d="M38,300 C40,236 62,220 100,214 C138,220 160,236 162,300 Z" fill="url(#pg-coat)" stroke="#4cc3ee" stroke-opacity=".35"/>' +
      '<path d="M48,236 L76,226 L74,232 L50,242 Z M152,236 L124,226 L126,232 L150,242 Z" fill="url(#pg-gold)"/>' +
      '<path d="M88,214 L100,236 L112,214 Z" fill="#e8eef4"/><path d="M96,218 L100,238 L104,218 Z" fill="#8a1d2e"/>' +
      '<rect x="91" y="196" width="18" height="20" rx="6" fill="#c9a07a"/>' +
      '<ellipse cx="100" cy="176" rx="21" ry="26" fill="#d9b08a"/>' +
      '<path d="M84,170 Q100,178 116,170" fill="none" stroke="#7a5236" stroke-width="1.2" opacity=".6"/>' +
      '<ellipse cx="100" cy="153" rx="31" ry="10" fill="#e9edf2"/><path d="M73,155 Q100,124 127,155 Z" fill="#f2f5f8"/>' +
      '<path d="M76,156 Q100,166 124,156 L122,160 Q100,170 78,160 Z" fill="#0b1020"/>' +
      '<path d="M84,156 Q100,152 116,156" fill="none" stroke="url(#pg-gold)" stroke-width="2"/>' +
      '<path d="M100,138 L104,147 L100,145 L96,147 Z" fill="url(#pg-gold)"/>' +
      '<g transform="translate(66,262)"><rect x="-4" y="-4" width="22" height="8" fill="#55287f"/><rect x="-4" y="5" width="22" height="8" fill="#2f72b8"/></g>' +
      // (his name on the banner)
      '<rect x="0" y="270" width="200" height="30" fill="#0b1020" opacity=".88"/><rect x="0" y="270" width="200" height="1.5" fill="url(#pg-gold)"/>' +
      '<text x="100" y="290" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="' + (nm.length > 16 ? 11 : 14) + '" letter-spacing="1.5" fill="#fff">' + nm + "</text></svg>";
  }
  // (noReps: the title screen shows the ribbons only; TexasBont, Nov 7, 2026)
  function rackHtml(c, w, noReps) {
    if (!BL.ribbonSvg) return "";
    var list = RACK.filter(function (p) { return rackTop(c, p) > 0; }), rows = [], r = list.slice();
    if (r.length) { rows.push(r.splice(0, r.length % 3 || 3)); while (r.length) rows.push(r.splice(0, 3)); }
    var reps = RACK.filter(function (p) { return rackTop(c, p) > 0 || BL.career.CREW.indexOf(p) >= 0; }).map(function (p) {
      return "<span>" + BL.career.STATION_NAME[p] + " <b>" + (p === "admiral" ? c.admiral.rep : c.stations[p].rep) + "</b></span>";
    });
    return '<div class="rack-side">' + (rows.length ? '<div class="rack">' + rows.map(function (row) {
      return '<div class="rk-row">' + row.map(function (p) { return BL.ribbonSvg(p, rackTop(c, p), w || 120); }).join("") + "</div>";
    }).join("") + "</div>" : "") + (noReps ? "" : '<div class="rack-reps">' + reps.join("") + "</div>") + "</div>";
  }
  function sumProfiles(c, k) {
    return Object.keys(c.profiles).reduce(function (a, s) { return a + (+c.profiles[s][k] || 0); }, 0);
  }

  function refreshTitle() {
    var b = $("btn-continue");
    b.hidden = !career;
    if (career) b.textContent = "Continue as " + career.name;
    $("title-rack").innerHTML = career ? rackHtml(career, 120, true) : "";
    $("title-rack").hidden = !career;
    $("title-poster").innerHTML = posterSvg(career ? career.name : "");
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
    $("hub-grid").innerHTML = gridHtml(career, true);
    var last = career.history[0];
    if (last && last.station === "admiral") $("hub-last").textContent = "Last operation: " + BL.career.admiralTitle(last.n).fleet + ", " + (OUTCOME_NAME[last.outcome] || last.outcome).toLowerCase() + ", " + signed(last.rep || 0) + " admiral reputation.";
    else $("hub-last").textContent = last ? "Last mission: " + BL.career.STATION_NAME[last.station || "engineer"].toLowerCase() + " aboard " + BL.shipLabel(last.classId, last.ship, last.hull) + " (TL" + last.tl + "), " +
      last.outcome + ", " + signed(last.rep || 0) + " reputation." : "No missions yet. Your first job offers are waiting.";
    show("scr-hub");
  }
  $("hub-grid").onclick = function (ev) {
    var b = ev.target.closest("button[data-jobs]");
    if (b && b.dataset.jobs === "admiral") { click(); showAdmiralOffer(); return; }
    if (b) { click(); showOffers("offers", b.dataset.jobs); return; }
    var r = ev.target.closest("td[data-rep]"); if (r) { click(); showReports(r.dataset.rep, "hub"); }
  };
  /* The admiral path: the next fleet campaign (BL.career.admiralOffer), its fleet drawn from the
     career (veterans first, BL.career.admiralPicker), the result back to the career. */
  /* The orders (TexasBont, Nov 8, 2026): official, no level codes or points; the target world named
     (the campaign's seed is picked here, so Go builds the same map); banked points read as the
     Azurian homeworld's readiness; HQ says whether there's more to do before the next fleet. */
  var offerSeed = 0, admFlagOpts = [];
  function showAdmiralOffer() {
    var o = BL.career.admiralOffer(career), T = o.title, A = career.admiral, body;
    offerSeed = BL.randomSeed();
    if (o.done) body = "<p>" + (o.won ? "The planet buster fell on the Azurian homeworld under your command. The war is won." : "There are no more fleet campaigns for you.") + "</p>";
    else if (!o.open) body = "<p><b>" + T.full + "</b> opens with " + o.needs.join(" and ") + ".</p><p class='muted'>Each fleet is built around its class: the Third Fleet destroyer escorts, the Fourth destroyers ... the Eighth battleships, the Grand Fleet dreadnoughts. The offer stays open: you can fly as many squadron missions as you like first.</p>";
    else {
      var cmp = new BL.Campaign({ seed: offerSeed, level: (o.level === 9 ? "G" : "F") + o.level, banked: A.banked }), world = esc(cmp.hexes[cmp.world].name);
      var ready = o.level === 9 ? Math.max(33, o.banked) : o.banked, next = BL.career.admiralTitle(o.level + 1).fleet;
      var row = function (k, v) { return "<p><b>" + k + ":</b> " + v + "</p>"; };
      body = "<p class='orders-head'>ORDERS</p>" + row("To", T.who + " " + esc(career.name) + ", " + T.fleet) +
        row("Primary objective", o.level === 9 ? "Lead the Grand Fleet to the Azurian homeworld, <b>" + world + "</b>, and deliver the planet buster."
          : o.level === 3 ? "Escort the convoy through Azurian space to <b>" + world + "</b>."
          : "Lead your fleet into Azurian space and capture <b>" + world + "</b>. Hold the world until reinforcements arrive.") +
        (o.level === 9 ? "" : row("Secondary objective", "Seize as many Azurian facilities as you can.")) +
        row("Intelligence", ready ? "Your earlier operations have cut Azurian homeworld readiness by <b>" + ready + "%</b>." : "The Azurian homeworld stands at full readiness.") +
        (o.level === 9 ? "" : row("Command", o.requal ? "HQ wants to see you hold this command again before they return you to the " + next + "."
          : o.have ? "HQ notes your progress, Admiral, but there is more work to do before they will give you the " + next + "."
          : "There is more work to do before HQ will give you the " + next + ".")) +
        row("Fleet", "Your fleet is made up of ships you have served on or commanded before. Their crews know you. New ships fill out any places they can't.");
      // (his flag in one of his own ships of the fleet's top class, if he likes; TexasBont, Nov 8, 2026)
      var topCls = cmp.flagShip.cls, mine = BL.career.pastShips(career, topCls);
      admFlagOpts = mine.map(function (s) { s.classId = topCls; return s; });
      if (mine.length) body += "<p><b>Flagship:</b> <select id='adm-flag'><option value='-1'>HQ's choice</option>" + mine.map(function (s, k) {
        return "<option value='" + k + "'>" + esc(s.ship) + (s.hull && s.ship.indexOf(s.hull) < 0 ? " " + s.hull : "") + " (TL" + s.tl + ")</option>"; }).join("") + "</select></p>";
    }
    $("adm-offer-body").innerHTML = body;
    $("btn-adm-offer-go").hidden = !o.open;
    overlay("ov-adm-offer", true);
  }
  $("btn-adm-offer-go").onclick = function () {
    click(); overlay("ov-adm-offer", false);
    var o = BL.career.admiralOffer(career); if (!o.open) return;
    var seed = offerSeed || BL.randomSeed();
    show("scr-admirals");
    BL.admiralsView.start({ seed: seed, level: (o.level === 9 ? "G" : "F") + o.level, onExit: function () { showHub(); },
      career: { c: career, name: career.name, banked: career.admiral.banked, pick: BL.career.admiralPicker(career, seed, $("adm-flag") ? admFlagOpts[+$("adm-flag").value] || null : null), done: function (r) { var rp = BL.career.applyAdmiral(career, r); saveCareer(); return rp; } } });
  };
  $("btn-adm-offer-close").onclick = function () { click(); overlay("ov-adm-offer", false); };
  /* Pilot training (training.js): any class the pilot is qualified on (a new pilot: the gunboat). */
  var trainClass = null;
  // (the Starforce Academy, from the career hub: back there after; TexasBont, Nov 7, 2026)
  function home() { if (career) showHub(); else show("scr-title"); }
  $("btn-hub-train").onclick = function () {
    click(); overlay("ov-tests", false);
    var q = Math.max(1, BL.career.qualified(career, "pilot"));
    $("train-ships").innerHTML = BL.CLASSES.filter(function (c) { return c.n <= q && c.built && BL.GUNNERY.ring.classes[c.id]; }).map(function (c) {
      return '<button class="primary" data-cls="' + c.id + '">' + c.name + "</button>";
    }).join("");
    overlay("ov-train", true);
  };
  $("train-ships").addEventListener("click", function (ev) { var b = ev.target.closest("button[data-cls]"); if (b) { click(); overlay("ov-train", false); startTraining(b.dataset.cls); } });
  $("btn-train-close").onclick = function () { click(); overlay("ov-train", false); };
  function startTraining(classId) {
    var tl = BL.TECH.base(classId), rc = BL.GUNNERY.ring.classes[classId];
    trainClass = classId;
    job = { test: true, training: true, station: "pilot", helm: true, classId: classId, tl: tl, seed: BL.randomSeed(), n: BL.classById(classId).n };
    var guns = { weapons: BL.GUNNERY.loadout[classId] || ["pulse"], helm: true, ring: true, arcs: rc.arcs, arcNames: rc.arcNames,
      orders: [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return (settings.gunOrders || {})[n] || "auto"; }) };
    sim = new BL.Mission({ seed: job.seed, classId: classId, tl: tl, gunner: guns, helm: true, training: true });
    startMission();
  }
  $("btn-tu-exit").onclick = function () {
    if (!sim || !sim.training) return;
    click(); running = false; paused = false; overlay("ov-pause", false);
    var tr = sim.trainer, s = tr ? tr.stats : {}, rt = tr ? tr.rating() : { pct: 0, name: "—" };
    $("train-summary").innerHTML = "<p><b>" + sim.data.className + "</b> · " + mmss(sim.t) + " flown</p><ul>" +
      "<li>Buoys passed on the right side: <b>" + (s.passed || 0) + "</b> of " + (tr ? tr.total() : 0) + "</li>" +
      "<li>Wrong side " + (s.wrong || 0) + " · hit " + (s.hit || 0) + " · missed " + (s.missed || 0) + "</li>" +
      "<li>Best streak " + (s.best || 0) + " · stress hits " + sim.helm.stats.stressHits + "</li>" +
      "<li>Rating: <b>" + rt.name + "</b>" + (tr && tr.total() ? " (" + rt.pct + "%)" : "") + "</li></ul>";
    overlay("ov-train-done", true);
  };
  $("btn-train-again").onclick = function () { click(); overlay("ov-train-done", false); startTraining(trainClass); };
  $("btn-train-done").onclick = function () { click(); overlay("ov-train-done", false); BL.audio.humSet(0, false); sim = null; if (career) showHub(); else show("scr-title"); };
  $("btn-offers-lower").onclick = $("btn-offers-lower-top").onclick = function () { click(); showOffers(offersMode === "lower" ? "offers" : "lower", offersStation); };
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
      '<p class="muted">' + (held ? "Nothing to spend one on right now: the next class at your other stations is either higher than N − 2 or not built yet." : "Unused sign-offs stay available.") + "</p>");
  }
  $("signoffs-body").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-st]"); if (!b) return;
    if (BL.career.spendSignoff(career, b.dataset.st, +b.dataset.n)) { saveCareer(); click(); renderSignoffs(); showHub(); overlay("ov-signoffs", true); }
  });
  $("btn-signoffs-close").onclick = function () { click(); overlay("ov-signoffs", false); };

  function offerHtml(j, i) {
    var cls = BL.classByN(j.n), q = BL.career.qualified(career, j.station), up = j.n > q, rankName = BL.career.STATION_NAME[j.station];
    var tag = up ? '<span class="tag up">' + (q ? "STEP UP" : "FIRST QUALIFICATION") + "</span>" : !j.serious ? '<span class="tag low">REQUALIFYING</span>' : "";
    // (a lower class's command job still short of its squadron: how far along)
    if (j.station === "captain" && !up && career && j.n < q && !BL.career.commandDone(career, j.n))
      tag += '<span class="tag">SQUADRON ' + BL.career.commandWins(career, j.n) + "/" + BL.CAPTAINS.opens + "</span>";
    if (j.escort) tag += '<span class="tag">ESCORT MISSION</span>';
    // Ship and hull number with the tech level; reputation; then who you'd serve with and the guns.
    // Crew: everyone at the other stations the job names (j.engineer, j.gunner, j.pilot, each
    // { name, who, label, skill }). Gunner jobs name the engineer today; engineer jobs will add
    // the gunner and pilot, gunner jobs the pilot, and pilot jobs the engineer and gunner.
    if (j.station === "squadron" && career) return offerCard(j, i, !BL.career.squadronWins(career, j.n), BL.career.squadronWins(career, j.n) ? "" : '<span class="tag up">FIRST SQUADRON</span>', rankName, cls, rosterCrew(j), squadLines(j));
    if (j.station === "captain" && BL.roster && career) return offerCard(j, i, up, tag, rankName, cls, rosterCrew(j));
    var POSTN = { engineer: "Engineering", pilot: "Helm", gunner: "Gunnery", captain: "Bridge" };
    var crew = { rows: BL.career.STATIONS.filter(function (st) { return st !== j.station && j[st]; }).map(function (st) {
      var p = j[st];
      return [POSTN[st] || BL.career.STATION_NAME[st], esc(p.name), p.label + " " + Math.round(p.skill * 100)];
    }) };
    // A gunner or pilot job also names the gun crew (the same people the mission will roll; at
    // the helm, every gun is crewed).
    var pilot = j.station === "pilot" || j.station === "captain";
    if ((j.station === "gunner" || pilot) && BL.pickGunCrew) BL.pickGunCrew(j.seed, j.classId, pilot).forEach(function (c, k) {
      if (c) crew.rows.push(["Gun " + (k + 1), esc(c.name), c.label + " " + Math.round(c.skill * 100)]);
    });
    return offerCard(j, i, up, tag, rankName, cls, crew);
  }
  // A Command job's crew: the roster's suggestion (BL.roster.crewOf), each man by post.
  function rosterCrew(j) {
    var ids = BL.roster.crewOf(career, j), R = BL.roster;
    function line(post, id) { var m = R.man(career, id); if (!m) return null; var v = R.view(m); return [post, esc(v.name), v.label + " " + Math.round(v.skill * 100), v.temper, v.morale]; }
    return { rows: [line("Engineering", ids.engineer), line("Helm", ids.pilot)].concat(ids.guns.map(function (id, k) { return line("Gun " + (k + 1), id); })).filter(Boolean),
      note: "Suggested from your crew pool; you can change any post before the briefing." };
  }
  // A squadron job's ships and the captains it suggests (BL.captains.captainsOf), flagship first.
  function squadLines(j) {
    var ids = BL.captains.captainsOf(career, j), C = BL.captains;
    function line(ship, id, flag) { var m = C.captain(career, id); if (!m) return null; var v = C.view(m); return [esc(String(ship).replace(BL.SHIP_PREFIX, "")) + (flag ? " ★" : ""), esc(flag ? noCox(j.classId, v.name) : v.name), v.label + " " + Math.round(v.skill * 100), v.temper, v.morale]; }
    return { rows: [line(j.ship, ids.flag, true)].concat((j.wingShips || []).map(function (s, k) { return line(s, ids.wing[k]); })).filter(Boolean),
      note: cap(j.classId, "★ flagship, flag captain. Suggested from your captains pool; you can change any of them before the briefing.") };
  }
  function offerCard(j, i, up, tag, rankName, cls, crew, squad) {
    var pilot = j.station === "pilot" || j.station === "captain" || j.station === "squadron";
    var arms = j.station === "gunner" || pilot ? (j.weapons || BL.GUNNERY.loadout[j.classId] || ["pulse"]).map(function (id, k) { return ["Gun " + (k + 1), BL.WEAPONS[id].name + " Mk" + j.n]; })
      .concat(BL.classById(j.classId).mainGun ? [["Main gun", "Main gun, points forward"]] : [], j.classId === "gunboat" ? [["Torpedoes", "Two torpedoes"]] : []) : [];
    /* One column, the people and guns in tables (TexasBont, Nov 8, 2026): a section's rows are
       [first, name, skill, temper, morale]; temper and morale only where the pool knows them. */
    function sec(title, heads, t) {
      if (!t || !t.rows || !t.rows.length) return "";
      var w = t.rows[0].length, lowM = function (v) { return typeof v === "number" && v < 40; };
      var th = heads.slice(0, w).map(function (h, k) { return "<th" + (h === "Temper" ? ' class="hide-s"' : h === "Morale" ? ' class="n"' : "") + ">" + h + "</th>"; }).join("");
      return '<div class="offer-sec"><div class="offer-sec-h">' + title + '</div><table class="offer-t"><tr>' + th + "</tr>" + t.rows.map(function (r) {
        return "<tr>" + r.map(function (x, k) { var h = heads[k]; return "<td" + (h === "Temper" ? ' class="hide-s"' : h === "Morale" ? ' class="n' + (lowM(x) ? " low" : "") + '"' : "") + ">" + x + "</td>"; }).join("") + "</tr>";
      }).join("") + "</table>" + (t.note ? '<div class="offer-note">' + t.note + "</div>" : "") + "</div>";
    }
    // (his own ships of this class: pick one instead of the offered ship; TexasBont, Nov 8, 2026)
    var mine = career ? BL.career.pastShips(career, j.classId) : [], off = j.offered || { ship: j.ship, hull: j.hull, tl: j.tl };
    var lbl = function (s) { return esc(s.ship) + (s.hull && s.ship.indexOf(s.hull) < 0 ? " " + s.hull : "") + " (TL" + s.tl + ")"; };
    var pick = mine.filter(function (s) { return s.ship !== off.ship || s.hull !== off.hull; }).length ? '<div class="offer-ship"><label>' + (j.flag ? "Flagship" : "Ship") + ' <select data-ship="' + i + '">' +
      '<option value="-1"' + (j.ship === off.ship && j.hull === off.hull ? " selected" : "") + ">" + lbl(off) + " · offered</option>" +
      mine.map(function (s, k) { return s.ship === off.ship && s.hull === off.hull ? "" : '<option value="' + k + '"' + (j.ship === s.ship && j.hull === s.hull ? " selected" : "") + ">" + lbl(s) + " · served aboard</option>"; }).join("") +
      "</select></label></div>" : "";
    return '<div class="offer' + (up ? " stepup" : "") + '"><div class="offer-head"><h3>' + shipHtml(j.classId, j.ship, j.hull) + " (TL" + j.tl + ")" + tag + "</h3>" +
      '<button class="primary" data-i="' + i + '">Accept</button></div>' + pick +
      (j.escort ? '<div class="offer-story">Escort mission: your ' + cls.name.toLowerCase() + " is one of a squadron screening " + (j.classId === "gunboat" ? "the carrier" : j.escortKind === "convoy" ? "a convoy" : j.escortKind === "capital" ? "a capital ship" : "a convoy or a capital ship") + ".</div>" : "") +
      (j.story ? '<div class="offer-story"><b>' + esc(j.title) + "</b> · " + cls.name + " chapter: " + esc(j.chapter) + "</div>" : "") +
      (j.flag ? '<div class="offer-story">Squadron of ' + (1 + (j.wingShips || []).length) + " " + cls.name.toLowerCase() + cap(j.classId, "s: you command it from the flagship; your flag captain runs her.") + "</div>" : "") +
      (j.by ? '<div class="offer-story">Offered by ' + esc(j.by.name) + ", who values " + j.by.says + ".</div>" : "") +
      '<div class="meta">Reputation +' + BL.career.repFor(j) + " on success" +
      (j.flag ? (up ? " · your first squadron of " + cls.name.toLowerCase() + "s" : "") : up ? " · success qualifies you as " + rankName + "-" + j.n : "") + "</div>" +
      sec("Squadron", ["Ship", "Captain", "Skill", "Temper", "Morale"], squad) + sec(j.flag ? "Flagship crew" : "Crew", ["Post", "Name", "Skill", "Temper", "Morale"], crew) +
      sec("Armament", ["Mount", "Weapon"], { rows: arms }) + "</div>";
  }
  var shownJobs = [], offersStation = "engineer", lowerPick = {};
  function showOffers(mode, station) {
    offersMode = mode; offersStation = station = station || offersStation;
    var q = BL.career.qualified(career, station), who = BL.career.STATION_NAME[station];
    // (the buttons at the top as well as the bottom: TexasBont, Nov 8, 2026)
    $("btn-offers-lower").textContent = $("btn-offers-lower-top").textContent = mode === "lower" ? who + " job offers" : "Requalifying jobs";
    $("btn-offers-lower").hidden = $("btn-offers-lower-top").hidden = false;
    if (mode === "offers") {
      shownJobs = BL.career.offers(career, station);
      $("offers-title").textContent = tc(who + " jobs");
      var cq = BL.career.qualified(career, "captain"), needs = BL.career.commandNeeds(career, cq + 1);
      var open = BL.CLASSES.filter(function (k) { return BL.career.squadronOpen(career, k.n); }).length;
      $("offers-lede").textContent = station === "squadron" ? "Squadron postings, offered by the fleet admirals: you command a squadron of like ships from the flagship, plotting its course and giving its orders; your flag captain runs the flagship and a captain runs every other ship. Each job suggests captains from your captains pool and the flagship's crew from your crew pool; you can change any of them before the briefing. " +
        (open ? "Squadron command is open on " + open + " class" + (open === 1 ? "" : "es") + ". " : "None yet: ") + "A class's squadron opens after " + BL.CAPTAINS.opens + " successful command missions on it and, above the gunboat, " + BL.CAPTAINS.opens + " successful squadron missions on the class below; once you have " + BL.CAPTAINS.opens + " successful squadron missions on a class (what the admiral path asks), its jobs move to Requalifying jobs. Each ship lost costs a point of squadron reputation, and so does taking the flagship's bridge." : station === "captain" ? (
        "Command postings: you're on the bridge, plotting each system's course and giving the orders; your crew carry them out. Each job suggests a crew from your crew pool, and you can change any post before the briefing. A gunboat's commander is its coxswain. On the gunboat and destroyer escort some are escort missions." +
        (!shownJobs.length && BL.career.commandDone(career, cq) ? " No command jobs now: your " + BL.classByN(cq).name.toLowerCase() + " command successes are done, so take Squadron jobs; story missions you skipped are under Requalifying jobs." : "") +
        (cq >= 9 ? "" : needs.length ? " Command of the " + BL.classByN(cq + 1).name.toLowerCase() + " needs " + needs.join(" and ") + "." : " Command of the " + BL.classByN(cq + 1).name.toLowerCase() + " is open to you.")) : (station === "gunner"
        ? "Postings for gunners at your level. Each lists the ship's guns and names the engineer who'll run your power and the gun crew."
        : station === "pilot"
        ? "Postings for pilots at your level. Each names the engineer who'll run the power and the gun crew who'll work the guns while you fly. Bigger ships turn slower and answer the helm later."
        : "Postings for engineers at your level. Lower Tech Levels are harder (smaller reactor and capacitors, weaker guns) and earn more reputation.") +
        (BL.STORY && BL.STORY[station]
          ? (BL.career.storyComplete(career, station) ? " Your " + who.toLowerCase() + " storyline is complete." : " Each is a story mission, offered until you complete it, on your class and the class above.")
          : q && BL.career.built(station, q + 1) ? " There's always a lowest-tech posting for your class and for the class above it." : " There's always a lowest-tech posting.");
    } else {
      shownJobs = BL.career.lowerJobs(career, station);
      // (these are drawn afresh each time: his ship choices are kept here)
      shownJobs.forEach(function (j) { if (lowerPick[j.id] != null) BL.career.setJobShip(career, j, lowerPick[j.id]); });
      $("offers-title").textContent = tc(who + ": requalifying");
      $("offers-lede").textContent = shownJobs.length ? "Story missions you skipped on classes you've already qualified on. You're welcome aboard, but they earn half that class's reputation, and failures here don't count against you." :
        "Nothing below your current class: no skipped story missions there.";
    }
    $("offers-list").innerHTML = shownJobs.map(offerHtml).join("");
    show("scr-offers");
  }
  $("offers-list").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-i]"); if (!b) return;
    click();
    var j = shownJobs[+b.dataset.i];
    if (j.captain && BL.roster) showCrew(j); else startBriefing(j);
  });
  $("offers-list").addEventListener("change", function (ev) {
    var s = ev.target.closest("select[data-ship]"); if (!s) return;
    click();
    var y = window.scrollY;
    var j = shownJobs[+s.dataset.ship]; if (offersMode === "lower") lowerPick[j.id] = +s.value;
    if (BL.career.setJobShip(career, j, +s.value)) { saveCareer(); showOffers(offersMode); window.scrollTo(0, y); }
  });
  $("btn-offers-back").onclick = $("btn-offers-back-top").onclick = function () { click(); showHub(); };

  /* ------------------------------------------------------- Crew (Command jobs)
     The job's crew from the roster (js/roster.js), one line per post; tap a post to see every man
     who can take it and swap one in. A man already on another gun trades places. */
  var crewJob = null, crewOpen = -1;
  // (a squadron job's posts come from two pools: captains, BL.captains, and the flagship's crew, BL.roster)
  function poolOf(p) { return p && p.cap ? BL.captains : BL.roster; }
  function manOf(p, id) { return p && p.cap ? BL.captains.captain(career, id) : BL.roster.man(career, id); }
  function manLine(v) {
    return esc(v.name) + ' <span class="tag">' + v.label + " (skill " + Math.round(v.skill * 100) + ") · " + v.temper + " temper · morale " + v.morale + " · " +
      (v.missions ? v.missions + " mission" + (v.missions === 1 ? "" : "s") + ", " + v.wins + " success" + (v.wins === 1 ? "" : "es") + " · " + v.ships.length + " ship" + (v.ships.length === 1 ? "" : "s") : "no missions yet") + "</span>";
  }
  // A man's answer for this job: signed on, refused, or not asked yet (BL.roster.rollOf).
  function rollTag(j, id, cap) {
    var a = ((cap ? j.capAsked : j.asked) || {})[id], r = (cap ? BL.captains : BL.roster).rollOf(career, j, id);
    if (cap) { var cm = BL.captains.captain(career, id); if (cm && cm.out) return '<span class="tag refused">awaiting a new ship (sits out this one)</span>'; }
    if (!r) return '<span class="tag">not asked yet</span>';
    if (r.stay) return '<span class="tag signed">stayed on from your last mission (no roll)</span>';
    if (r.hire) return '<span class="tag signed">new hire, signed on (no roll)</span>';
    return a ? '<span class="tag signed">signed on</span>' : '<span class="tag refused">refused this job</span>';
  }
  function crewPosts() {
    var ids = crewJob.crewIds, cp = crewJob.capIds, out = [];
    if (cp) out = [{ cap: true, post: "flag", name: cap(crewJob.classId, "Flag captain, ") + esc(BL.shipLabel(crewJob.classId, crewJob.ship, crewJob.hull)), id: cp.flag }].concat(cp.wing.map(function (id, k) {
      return { cap: true, post: "wing", k: k, name: cap(crewJob.classId, "Captain, ") + esc(String((crewJob.wingShips || [])[k] || "ship " + (k + 2))), id: id };
    }));
    return out.concat([{ post: "engineer", name: "Engineer", id: ids.engineer }, { post: "pilot", name: "Pilot", id: ids.pilot }].concat(ids.guns.map(function (id, k) { return { post: "gun", name: "Gun " + (k + 1), id: id, k: k }; })));
  }
  function showCrew(j) {
    crewJob = j; j.crewIds = BL.roster.crewOf(career, j, true); crewOpen = -1;     // (the suggestion asks each man: BL.roster.willSign)
    if (j.flag && BL.captains) j.capIds = BL.captains.captainsOf(career, j, true);
    renderCrew(); show("scr-crew");
  }
  function renderCrew() {
    var j = crewJob, posts = crewPosts();
    $("crew-title").textContent = j.flag ? cap(j.classId, "Your Captains and Crew") : "Your Crew";
    $("crew-lede").textContent = j.flag
      ? cap(j.classId, "A squadron of " + (1 + j.wingShips.length) + " " + BL.classById(j.classId).name.toLowerCase() + "s (TL" + j.tl + "). The job suggests a captain for every ship from your captains pool, the flag captain first, and the flagship's crew from your crew pool. Tap a post to choose someone else. Anyone you ask may refuse (the better he is, the likelier; squadron reputation helps with captains, command reputation with the crew); the job asks the best first and stops at the first who agrees. Each captain gains a point of skill for every successful mission. When a ship is lost, her captain's chance of surviving is his skill, and a survivor sits out the next squadron mission while he waits for a new ship.")
      : BL.shipLabel(j.classId, j.ship, j.hull) + " (TL" + j.tl + "). The job suggests this crew from your crew pool. Tap a post to choose another man for it; a man you ask may refuse to sign on with you (the better he is, the likelier, and your command reputation helps). The job asks the best men first and stops at the first who signs on, so the men below him haven't been asked yet. A man gains a point of skill for every successful mission; morale rises with successes and falls with failures and shipmates lost; if the ship is destroyed, each man's chance of surviving is his skill.";
    $("crew-posts").innerHTML = posts.map(function (p, i) {
      // (while its list is open, the post row doesn't repeat the man highlighted in the list)
      var P = poolOf(p), m = manOf(p, p.id), html = '<button class="crew-post' + (crewOpen === i ? " on" : "") + '" data-p="' + i + '"><b>' + p.name + "</b>" +
        (crewOpen === i ? '<span class="tag">tap ' + (p.cap ? cap(j.classId, "a captain") : "a man") + ' below, or tap here to close</span>' : m ? "<span>" + manLine(P.view(m)) + '</span><span class="crew-tags">' + rollTag(j, m.id, p.cap) + "</span>" : "<span>(nobody)</span>") + "</button>";
      var list = p.cap ? BL.captains.available(career, j.classId) : BL.roster.available(career, p.post);
      if (crewOpen === i) html += '<div class="crew-pick">' + list.map(function (v) {
        var where = posts.filter(function (q) { return !!q.cap === !!p.cap && q.id === v.id; })[0], no = ((p.cap ? j.capAsked : j.asked) || {})[v.id] === false || (p.cap && v.out);
        return '<button class="crew-man' + (v.id === p.id ? " on" : "") + (no ? " no" : "") + '" data-p="' + i + '" data-id="' + v.id + '"><span>' + manLine(v) + '</span><span class="crew-tags">' +
          (where && where !== p ? '<span class="tag">now on ' + where.name + "</span>" : "") + (where && where !== p ? "" : rollTag(j, v.id, p.cap)) + (p.cap || BL.roster.fits(BL.roster.man(career, v.id), j.classId) ? "" : '<span class="tag">below the gunboat standard</span>') + "</span></button>";
      }).join("") + "</div>";
      return html;
    }).join("");
  }
  $("crew-posts").addEventListener("click", function (ev) {
    var b = ev.target.closest("button"); if (!b) return;
    click();
    var i = +b.dataset.p, posts = crewPosts(), ids = crewJob.crewIds, cps = crewJob.capIds;
    function put(q, v) { if (q.cap) { if (q.post === "wing") cps.wing[q.k] = v; else cps.flag = v; } else if (q.post === "gun") ids.guns[q.k] = v; else ids[q.post] = v; }
    if (b.dataset.id) {
      var id = +b.dataset.id, p = posts[i], other = posts.filter(function (q) { return !!q.cap === !!p.cap && q.id === id && q !== p; })[0];
      // (a man already on another gun, or a captain on another ship, trades places; anyone else is asked: willSign)
      if (!other && id !== p.id && !poolOf(p).willSign(career, crewJob, manOf(p, id))) { renderCrew(); return; }
      if (other) put(other, p.id);
      put(p, id); crewOpen = -1;
    } else crewOpen = crewOpen === i ? -1 : i;
    renderCrew();
  });
  $("btn-crew-done").onclick = function () { click(); startBriefing(crewJob); };
  $("btn-crew-back").onclick = function () { click(); showOffers(offersMode); };

  function showRecord() {
    var c = career;
    // (his name, "Service Record" under it; then one line of facts and a reputation table: TexasBont, Nov 8, 2026)
    $("rec-title").innerHTML = "<span>" + esc(c.name) + "</span><span class='rp-t2'>Service Record</span>";
    var REPCOL = [["engineer", "Eng"], ["gunner", "Gun"], ["pilot", "Helm"], ["captain", "Cmd"], ["squadron", "Squad"], ["admiral", "Fleet"]];
    $("rec-reps").innerHTML = "<tr><th></th>" + REPCOL.map(function (x) { return "<th>" + x[1] + "</th>"; }).join("") + "</tr><tr><th>Reputation</th>" +
      REPCOL.map(function (x) { return "<td>" + (x[0] === "admiral" ? c.admiral.rep : c.stations[x[0]].rep) + "</td>"; }).join("") + "</tr>";
    $("rec-summary").innerHTML = "<span>Enlisted <b>" + starDate({ date: c.created }) + "</b></span>" + "<span>Rapid sign-offs <b>" + BL.career.signoffsHeld(c) + "</b></span>" +
      "<span>Missions <b>" + sumProfiles(c, "missions") + "</b> (" + sumProfiles(c, "wins") + " won)</span>";
    $("rec-profile").innerHTML = BL.career.STATIONS.filter(function (s) { return BL.career.PLAYABLE[s]; }).map(function (s) {
      return "<h2>" + BL.career.STATION_NAME[s] + " Reputation Profile</h2>" + profileHtml(BL.career.profile(c, s), null, s);
    }).join("");
    $("rec-grid").innerHTML = gridHtml(c, false, true);
    /* Mission history dressed like the reports (TexasBont, Nov 8, 2026): stardate, mission, his post,
       ship and class, the outcome in its colour; a row opens that path's reports. (The killed in
       action are on the In Memoriam page now.) */
    $("rec-history").innerHTML = '<tr><th>Date</th><th>Mission</th><th class="hide-s">Your post</th><th>Ship</th><th>Outcome</th><th class="n">Score</th><th class="n">Reputation</th></tr>' +
      (c.history.length ? c.history.map(function (h) {
        var st = h.station || "engineer", n = h.n || BL.classById(h.classId).n, fleetOp = st === "admiral" && h.tl == null;
        var tone = h.outcome === "success" ? "h-ok" : h.outcome === "partial" ? "h-part" : "h-bad", rep = h.rep || 0;
        return '<tr class="' + tone + '" data-rep="' + st + ":" + n + '"><td class="d">' + starDate(h) + "</td><td><b>" + esc(missionName(h)) + "</b></td><td class=\"hide-s\">" + POST[st] + "</td><td>" +
          (fleetOp ? BL.career.admiralTitle(n).fleet : shipHtml(h.classId, h.ship, h.hull) + '<span class="hist-sub">' + BL.classById(h.classId).name + (h.tl != null ? " · TL" + h.tl : "") + "</span>") +
          '</td><td><span class="hist-out">' + (OUTCOME_NAME[h.outcome] || h.outcome) + '</span></td><td class="n">' + (h.score != null ? (fleetOp ? "+" : "") + h.score : "–") +
          '</td><td class="n ' + (rep > 0 ? "up" : rep < 0 ? "down" : "") + '">' + signed(rep) + "</td></tr>";
      }).join("") : '<tr><td colspan="7" class="muted">No missions yet.</td></tr>');
    show("scr-record");
  }
  $("btn-record-back").onclick = $("btn-record-top").onclick = function () { click(); showHub(); };
  $("rec-grid").onclick = $("rec-history").onclick = function (ev) { var r = ev.target.closest("[data-rep]"); if (r) { click(); showReports(r.dataset.rep, "record"); } };

  /* ------------------------------------------------------ Mission reports
     A ribbon tapped on the career chart (TexasBont, Nov 6, 2026): every mission on record at that
     station on that class, newest first, each with its ship, systems, outcome and score, and a story
     mission's after-action line. (The career keeps the last 1000 missions.) */
  var rpFrom = "hub";
  /* In Memoriam (TexasBont, Nov 8, 2026): every man killed in action on his ships, crew and
     squadron captains, newest first: name and his qualification (the path's letter and the class
     he served on: E-3 an engineer on destroyer escorts, G-4 a gunner on destroyers, P pilot,
     C a ship's captain), his post and ship, and when. */
  function memClass(k) {
    if (k.classId) return BL.classById(k.classId).n;
    var code = (/(?:^| )([A-Z]+)-\d+$/.exec(k.ship || "") || [])[1], id = code && Object.keys(BL.HULL_CODES).filter(function (c) { return BL.HULL_CODES[c] === code; })[0];
    return id ? BL.classById(id).n : code === "PT" ? 1 : 0;
  }
  function showMemoriam() {
    var c = career, all = [];
    ((c.crew || {}).kia || []).forEach(function (k, i) {
      var gun = /^gun /.test(k.at || ""), pil = k.at === "pilot" || k.post === "pilot";
      all.push({ k: k, i: i, q: gun ? "G" : pil ? "P" : "E", post: gun ? "Gun " + k.at.slice(4) : pil ? "Helm" : "Engineering" });
    });
    ((c.captains || {}).kia || []).forEach(function (k, i) { all.push({ k: k, i: i + 0.5, q: "C", post: "Commanding officer" }); });
    all.sort(function (a, b) { var x = (b.k.date || "") + (b.k.time || ""), y = (a.k.date || "") + (a.k.time || ""); return x < y ? -1 : x > y ? 1 : a.i - b.i; });
    $("mem-sum").textContent = all.length ? all.length + " killed in action under your command." : "No one has been lost under your command.";
    $("mem-list").innerHTML = all.map(function (x) {
      var k = x.k, n = memClass(k), g = n ? x.q + "-" + n : "";
      // (crew by their one title: older records carry the old Petty Officer and Chief)
      var nm = x.q === "C" ? k.name : { G: "Gunner's Mate", E: "Engineer's Mate", P: "Helmsman" }[x.q] + " " + k.name.replace(/^(Gunner's Mate|Engineer's Mate|Pilot's Mate|Helmsman|Petty Officer|Chief) /, "");
      return '<div class="rp-card mem"><div class="rp-top"><b>' + esc(nm) + (g ? ", " + g : "") + "</b></div>" +
        '<div class="rp-facts"><div>' + x.post + "</div><div>" + esc(k.ship) + (k.tl != null ? " (TL" + k.tl + ")" : "") + "</div><div>Killed in action " + starDate(k) + "</div></div></div>";
    }).join("");
    show("scr-memoriam"); window.scrollTo(0, 0);
  }
  $("btn-hub-memoriam").onclick = function () { click(); showMemoriam(); };
  $("btn-mem-back").onclick = $("btn-mem-top").onclick = function () { click(); showHub(); };
  /* Report dates a thousand years on, to the minute: 3026.11.08.21.56 (TexasBont, Nov 8, 2026;
     older records have no time). */
  function starDate(x) {
    var d = String(x.date || "").split("-");
    return d.length === 3 ? (+d[0] + 1000) + "." + d[1] + "." + d[2] + (x.time ? "." + x.time : "") : x.date || "";
  }
  /* His squadron's designation (TexasBont, Nov 8, 2026): one number for each set of ships, so the
     same ships are the same squadron and different ships a different one (Destroyer Squadron 12,
     then 13 ...). Kept in the career (c.sqIds; each ship by her name, a numbered hull by her number), numbered from a start set by his name and class. */
  function squadronName(c, classId, ships) {
    var k = 0, t = c.name + "|" + classId;
    for (var i = 0; i < t.length; i++) k = (k * 31 + t.charCodeAt(i)) >>> 0;
    delete c.sqNums;      // (v0.246.00's, keyed loosely: numbered afresh)
    var all = c.sqIds = c.sqIds || {}, mine = all[classId] = all[classId] || {}, key = ships.slice().sort().join("|");
    if (!mine[key]) { mine[key] = 10 + k % 60 + Object.keys(mine).length; saveCareer(); }
    return ronName(classId) + " " + mine[key];
  }
  /* The reports in the game's own words (TexasBont, Nov 8, 2026): the mission's name (a story
     mission's title, else a patrol; the admiral's a fleet operation), his post aboard, enemy ships
     destroyed and hull damage as a share of the ship's hull; scores as before (TexasBont: fine on every path). */
  var POST = { engineer: "Main Engineering", gunner: "Gunnery", pilot: "Helm", captain: "Bridge", squadron: "Flag bridge", admiral: "Fleet Command" };
  function missionName(h, m) { return (m || h || {}).station === "admiral" ? "Fleet operation" : h && h.title ? h.title : "Patrol"; }
  // (enemy groups as the navy writes them: TexasBont, Nov 8, 2026)
  var RON = { frigate: "DesRon", cruiserA: "CruRon", battleshipA: "BatRon", dreadnought: "Heavy BatRon" };
  // (and ours, by class: Picket DesRon 21 ... Heavy BatRon 40; TexasBont, Nov 8, 2026)
  var OUR_RON = { picket: "Picket DesRon", destroyerEscort: "Escort DesRon", destroyer: "Strike DesRon", lightCruiser: "Light CruRon", cruiser: "Strike CruRon",
    heavyCruiser: "Heavy CruRon", battleship: "BatRon", dreadnought: "Heavy BatRon" };
  function ronName(classId) { return OUR_RON[classId] || BL.classById(classId).name + " Squadron"; }
  function engaged(ids) { return (ids || []).map(function (id) { return RON[id] || (BL.ENCOUNTERS[id] || { name: id }).name; }).join(", "); }
  function hullPct(classId, tl, lost) {
    if (lost == null) return null;
    var d = tl != null ? BL.shipFor(classId, tl) : null;
    return d && d.hull ? Math.min(100, Math.round(100 * lost / d.hull)) + "%" : null;
  }
  function showReports(key, from) {
    var c = career, st = key.split(":")[0], n = +key.split(":")[1], cls = BL.classByN(n), who = BL.career.STATION_NAME[st];
    rpFrom = from || "hub";
    var list = c.history.filter(function (h) { return (h.station || "engineer") === st && (h.n || BL.classById(h.classId).n) === n; });
    var won = list.filter(function (h) { return h.outcome === "success"; }).length;
    $("rp-ribbon").innerHTML = BL.ribbonSvg ? BL.ribbonSvg(st, n, 165) : "";
    var ops = st === "admiral", wd = ops ? "operation" : "mission";      // (the admiral path: his fleet's operations)
    // (titles as "Gunboat Engineer Mission Reports": class, path, in capitals; squadrons by their
    // type, the admiral's by his fleet: TexasBont, Nov 8, 2026)
    // (two lines: what, then "Mission Reports"; TexasBont, Nov 8, 2026)
    $("rp-title").innerHTML = "<span>" + esc(ops ? BL.career.admiralTitle(n).fleet : st === "squadron" ? ronName(cls.id) : cls.name + " " + who) + "</span><span class='rp-t2'>" + (ops ? "Operation Reports" : "Mission Reports") + "</span>";
    $("rp-sum").textContent = list.length ? list.length + " " + wd + (list.length === 1 ? "" : "s") + " on record, " + won + " won." : "No " + wd + "s on record here.";
    $("rp-list").innerHTML = list.map(function (h) {
      // (the ship's service record holds the systems flown, ships destroyed and hull lost)
      var m = null;
      Object.keys(c.ships).some(function (k) { return c.ships[k].missions.some(function (x) { if (x.seed === h.seed && x.date === h.date && x.station === h.station) { m = x; return true; } }); });
      var sm = h.story && BL.storyMission ? BL.storyMission(h.story) : null, ok = h.outcome === "success";
      var line = sm ? String(ok ? sm.after : sm.lost).replace(/\{hero\}/g, c.name).replace(/\{ship\}/g, BL.shipLabel(h.classId, h.ship, h.hull)) : "";
      var sys = m ? engaged(m.encounters) : "";
      // (a fleet campaign has no one ship or tech level: its fleet instead, and no score shown)
      var fleetOp = h.station === "admiral" && h.tl == null;
      var facts = [fleetOp ? BL.career.admiralTitle(h.n).fleet : shipHtml(h.classId, h.ship, h.hull) + (h.tl != null ? " (TL" + h.tl + ")" : "") + (h.station === "squadron" ? " ★" : "")];
      // (a squadron: the other ships under his flag that mission, each marked if lost)
      var crew = [h.ship || h.hull];
      if (h.station === "squadron") Object.keys(c.ships).forEach(function (k) {
        // (the flagship is listed first, starred: skip her here; a named ship by her name, a numbered hull by her number)
        var r = c.ships[k]; if (r.name === h.ship && (r.name || (r.hull || "") === (h.hull || ""))) return;
        r.missions.forEach(function (x) {
          if (x.seed === h.seed && x.date === h.date && x.station === "squadron") crew.push(r.name || r.hull);
          if (x.seed === h.seed && x.date === h.date && x.station === "squadron")
            facts.push(shipHtml(r.classId, r.name, r.hull) + (r.tl != null ? " (TL" + r.tl + ")" : "") + (x.outcome === "destroyed" ? " · lost" : x.outcome === "leftBehind" ? " · left behind" : ""));
        });
      });
      // (one fact a line; no post: the page is the path's)
      if (sys) facts.push("Enemy Forces Engaged: " + esc(sys));
      if (m && m.kills != null) facts.push(m.kills + " enemy ship" + (m.kills === 1 ? "" : "s") + " destroyed");
      var hp = m ? hullPct(h.classId, h.tl, m.hullLost) : null; if (hp) facts.push("Hull Damage " + hp);
      return '<div class="rp-card ' + (ok ? "ok" : h.outcome === "partial" ? "part" : "bad") + '"><div class="rp-top"><b>' + esc(missionName(h)) + "</b><span>" + starDate(h) + "</span></div>" +
        (h.station === "squadron" ? '<div class="rp-unit">' + esc(squadronName(c, h.classId, crew)) + "</div>" : "") +
        '<div class="rp-out"><b>' + (OUTCOME_NAME[h.outcome] || h.outcome) + "</b> · score " + (h.score != null ? (fleetOp ? "+" : "") + h.score : "–") + " · reputation " + signed(h.rep || 0) + "</div>" +
        '<div class="rp-facts">' + facts.map(function (f) { return "<div>" + f + "</div>"; }).join("") + "</div>" + (line ? '<p class="rp-story">' + esc(line) + "</p>" : "") + "</div>";
    }).join("");
    // (the way back at the top as well as the bottom: TexasBont, Nov 8, 2026)
    $("btn-rp-back").textContent = $("btn-rp-top").textContent = rpFrom === "record" ? "Service record" : "Career hub";
    show("scr-reports"); window.scrollTo(0, 0);
  }
  $("btn-rp-back").onclick = $("btn-rp-top").onclick = function () { click(); if (rpFrom === "record") showRecord(); else showHub(); };

  /* ------------------------------------------------------ Naval Registry
     Every named ship by class and tech level (each name's past ships, lost in action, then the one
     in service now under its current hull number), and the gunboats you've served on. Each opens
     a card: the ship's picture, its statistics at its tech level and its service career. */
  var regOpen = {}, regShown = [];
  function regShips(c, cls) {
    var out = [];
    if (cls.id === "gunboat") {
      Object.keys(c.ships).filter(function (k) { return c.ships[k].classId === "gunboat"; }).sort().forEach(function (k) {
        out.push({ classId: "gunboat", tl: c.ships[k].tl || 4, ship: k, hull: "", rec: c.ships[k] });
      });
      return out;
    }
    var list = BL.SHIP_NAMES[cls.id];
    BL.TECH.levels(cls.id).forEach(function (tl) {
      var k = 2 * (tl - 5);
      list[k].concat(list[k + 1]).forEach(function (n) {
        var ship = BL.SHIP_PREFIX + n, base = BL.hullNumber(cls.id, ship), now = (c.hulls && c.hulls[ship]) || base;
        // the lost ships of this name (records keyed name + hull number; the first by the name alone)
        Object.keys(c.ships).forEach(function (key) {
          var r = c.ships[key];
          if (r.name !== ship || r.classId !== cls.id || !r.lost) return;
          var h = r.hull || (key === ship ? base : key.slice(ship.length + 1));
          if (h !== now) out.push({ classId: cls.id, tl: tl, ship: ship, hull: h, rec: r });
        });
        out.push({ classId: cls.id, tl: tl, ship: ship, hull: now, rec: c.ships[ship + (now !== base ? " " + now : "")] || null });
      });
    });
    return out;
  }
  /* Ship awards (TexasBont, Nov 8, 2026): after every mission a ship serves (his own, his squadron's,
     his fleet's) she takes the award he holds on that path then, from the dates he first earned
     each (c.qualDates); she shows the highest on each path, in rack order. */
  var AW_CODE = { engineer: "E", gunner: "G", pilot: "P", captain: "C", squadron: "S", admiral: "F" };
  function awardCode(p, n) { return p === "admiral" && n === 9 ? "G-9" : AW_CODE[p] + "-" + n; }
  // (only a successful mission earns her one; where a record has no time, a qualification from the
  // same day counts only if this mission earned it, her own class: TexasBont, Nov 8, 2026)
  function awardAt(c, m, cn) {
    if (m.outcome !== "success") return 0;
    var p = m.station || "engineer", best = 0, q = c.qualDates || {};
    for (var n = 1; n <= 9; n++) {
      var d = q[p + ":" + n]; if (!d) continue;
      var ok = d.time && m.time ? d.date + "." + d.time <= m.date + "." + m.time : d.date < m.date || (d.date === m.date && n === cn);
      if (ok) best = n;
    }
    return best;
  }
  function shipAwards(c, rec) {
    var top = {};
    var cn = rec ? rec.n || BL.classById(rec.classId).n : 0;
    (rec && rec.missions || []).forEach(function (m) { var p = m.station || "engineer", n = awardAt(c, m, cn); if (n > (top[p] || 0)) top[p] = n; });
    return RACK.filter(function (p) { return top[p]; }).map(function (p) { return { p: p, n: top[p] }; });
  }
  function regTag(e) {
    if (e.rec && e.rec.lost) return '<span class="tag lost">Lost ' + e.rec.lost + "</span>";
    if (e.rec) return '<span class="tag served">' + e.rec.missions.length + " mission" + (e.rec.missions.length === 1 ? "" : "s") + "</span>";
    return '<span class="tag">Not served</span>';
  }
  function showRegistry() {
    var c = career, only = $("reg-served").checked;
    regShown = [];
    $("reg-list").innerHTML = BL.CLASSES.map(function (cls) {
      var all = regShips(c, cls), ships = only ? all.filter(function (e) { return e.rec; }) : all;
      var served = all.filter(function (e) { return e.rec; }).length, body = "";
      if (cls.id === "gunboat") body += '<p class="muted reg-tl">Gunboats carry numbers, not names: PT-101 to PT-199, a fresh one for every job. Only the ones you\'ve served on are listed.</p>';
      BL.TECH.levels(cls.id).forEach(function (tl) {
        var here = ships.filter(function (e) { return e.tl === tl; });
        if (!here.length) return;
        body += '<div class="reg-tl"><h3>Tech Level ' + tl + '</h3><div class="reg-ships">' + here.map(function (e) {
          regShown.push(e);
          var aw = shipAwards(c, e.rec);
          return '<button class="reg-ship" data-i="' + (regShown.length - 1) + '"><span>' + shipHtml(e.classId, e.ship, e.hull) + "</span>" +
            (aw.length && BL.ribbonSvg ? '<span class="reg-aw">' + aw.map(function (a) { return BL.ribbonSvg(a.p, a.n, 34); }).join("") + "</span>" : "") + regTag(e) + "</button>";
        }).join("") + "</div></div>";
      });
      if (!ships.length) body += '<p class="muted reg-tl">' + (cls.id === "gunboat" ? "No gunboats yet." : "None yet.") + "</p>";
      return '<details class="reg-class" data-cls="' + cls.id + '"' + (regOpen[cls.id] ? " open" : "") + "><summary>" + cls.n + ". " + cls.name +
        ' <span class="muted">· ' + (cls.id === "gunboat" ? served + " served on" : all.length + " ships, " + served + " served on") + "</span></summary>" + body + "</details>";
    }).join("");
    show("scr-registry");
  }
  $("btn-hub-registry").onclick = function () { click(); showRegistry(); };
  $("reg-served").onchange = function () { showRegistry(); };
  $("reg-list").addEventListener("toggle", function (ev) { var d = ev.target; if (d.dataset && d.dataset.cls) regOpen[d.dataset.cls] = d.open; }, true);
  $("reg-list").addEventListener("click", function (ev) { var b = ev.target.closest("button[data-i]"); if (b) { click(); showShipCard(regShown[+b.dataset.i]); } });
  $("btn-registry-back").onclick = $("btn-registry-top").onclick = function () { click(); showHub(); };
  $("btn-card-back").onclick = function () { click(); showRegistry(); };

  var OUTCOME_NAME = { success: "Success", destroyed: "Destroyed", abandoned: "Abandoned ship", timeout: "Out of time", wardLost: "Escorted ship lost", leftBehind: "Left behind", dropMissed: "Drop window missed", objectiveMissed: "Objective missed", partial: "Partial success", failure: "Failed" };
  // Column notes on the ship card's guns table: a small i by the heading; tap it to show the note
  // under the table (tap again to hide).
  var GUN_INFO = {
    shots: "<b>Shots:</b> how many shots a full capacitor holds before the gun must wait to recharge.",
    draw: "<b>Draw:</b> energy per second the gun uses firing as fast as it can; more than its charge rate and it runs dry." };
  function infoI(k) { return ' <button class="info-i" data-info="' + k + '" aria-label="What this means" title="' + GUN_INFO[k].replace(/<[^>]+>/g, "") + '">i</button>'; }
  $("card-guns").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-info]"), n = $("card-gun-note");
    if (!b) return;
    click();
    var k = b.dataset.info, open = !n.hidden && n.dataset.k === k;
    n.hidden = open; n.dataset.k = k; n.innerHTML = GUN_INFO[k];
  });
  /* A ship's stats, as on her ship card and in the briefing: each capacitor with what it holds and
     the fastest it charges. */
  function shipStatRows(d, classId) {
    var sysOf = function (kind) { return d.systems.filter(function (s) { return s.kind === kind; }); }, one = function (k) { return sysOf(k)[0]; };
    var cap = function (s) { return s.maxMJ + " MJ, charge " + s.maxMW + " MJ/s"; };
    var rows = [], rx = d.reactors, helm = BL.HELM.classes[classId];
    rows.push(["Hull", d.hull]);
    rows.push(["Reactor", rx.length > 1 ? rx.length + " reactors (" + rx.map(function (r) { return r.name; }).join(", ") + "), " + rx[0].mw + " MJ/s each, " + d.reactorMW + " MJ/s in all" : d.reactorMW + " MJ/s"]);
    if (rx[0].aux.capacity) rows.push(["Aux bank", rx.length > 1 ? rx.length + " banks of " + rx[0].aux.capacity + " MJ, feed " + rx[0].aux.rateMW + " MJ/s each" : rx[0].aux.capacity + " MJ, feed " + rx[0].aux.rateMW + " MJ/s"]);
    var sh = one("shield"); if (sh) rows.push(["Shields", cap(sh)]);
    rows.push(["Engines", "cruise " + d.cruiseG + " G, full " + d.maxG + " G"]);
    if (helm) rows.push(["Turn", "up to " + helm.top + "°/s, safe to " + helm.safe + "°/s"]);
    var ls = one("life"); if (ls) rows.push(["Life support", cap(ls)]);
    var pd = one("pd"); if (pd) rows.push(["CIWS", cap(pd) + " · " + ((BL.ART.OURS[classId] || {}).pd || []).length + " mounts in the stern"]);
    var hg = one("hangar"); if (hg) rows.push(["Hangar", cap(hg) + " · a gunboat squadron"]);
    if (d.torpedoes) rows.push(["Torpedoes", d.torpedoes + ", reloaded by the carrier every sortie"]);
    var dr = one("drive"); rows.push(["Warp drive", dr ? cap(dr) : "none (launched from a carrier)"]);
    var bu = one("buster"); if (bu) rows.push(["Planet buster", cap(bu)]);
    return rows;
  }
  // The briefing's guns: each mount, its arc and its capacitor (the mission's own guns when it has them).
  function gunRows(d, classId, bats) {
    var cap = function (s) { return s.maxMJ + " MJ, charge " + s.maxMW + " MJ/s"; }, guns = d.systems.filter(function (s) { return s.kind === "gun"; });
    var ring = BL.GUNNERY.ring.classes[classId] || { arcs: [], arcNames: [] }, load = BL.GUNNERY.loadout[classId] || [];
    var list = bats ? bats.map(function (b) { return { no: b.gunNo, w: b.w.name + " Mk " + (b.w.mk || d.mk), mount: b.arcName || "", arc: b.arcH === undefined ? "" : b.arcH >= 180 ? "all round" : b.arcH * 2 + "°", s: d.systems.filter(function (s) { return s.id === b.gunId; })[0] || guns[b.gunNo - 1] }; })
      : guns.map(function (g, i) { var a = ring.arcs[i] || [0, 180, 0], W = BL.WEAPONS[load[i]]; return { no: i + 1, w: W ? W.name + " Mk " + d.mk : g.name, mount: ring.arcNames[i] || "", arc: a[1] >= 180 ? "all round" : 2 * a[1] + "°", s: g }; });
    var mg = d.systems.filter(function (s) { return s.kind === "main"; })[0];
    if (!list.length && !mg) return "";
    return "<tr><th>#</th><th>Gun</th><th>Mount</th><th>Arc</th><th>Capacitor</th></tr>" +
      (mg ? "<tr><td>M</td><td>Main gun</td><td>centerline</td><td>points forward</td><td>" + cap(mg) + "</td></tr>" : "") +
      list.map(function (g) { return "<tr><td>" + g.no + "</td><td>" + g.w + "</td><td>" + g.mount + "</td><td>" + g.arc + "</td><td>" + (g.s ? cap(g.s) : "") + "</td></tr>"; }).join("");
  }
  // A table of people (crew or captains); a morale under 40 shows red.
  function peopleTable(heads, rows) {
    var cls = function (h, v) { return h === "Temper" ? ' class="hide-s"' : h === "Morale" ? ' class="n' + (typeof v === "number" && v < 40 ? " low" : "") + '"' : ""; };
    return '<table class="db-table brief-t"><tr>' + heads.map(function (h) { return "<th" + cls(h) + ">" + h + "</th>"; }).join("") + "</tr>" +
      rows.map(function (r) { return "<tr>" + r.map(function (x, k) { return "<td" + cls(heads[k], x) + ">" + x + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>";
  }
  function showShipCard(e) {
    var c = career, d = BL.shipFor(e.classId, e.tl), cls = BL.classById(e.classId), rec = e.rec;
    var sysOf = function (kind) { return d.systems.filter(function (s) { return s.kind === kind; }); }, one = function (k) { return sysOf(k)[0]; };
    $("card-title").innerHTML = shipHtml(e.classId, e.ship, e.hull) + " (TL" + e.tl + ")";
    $("card-lede").innerHTML = cls.name + " · " +
      (rec && rec.lost ? '<span class="lost-note">Lost in action ' + rec.lost + "</span>" : rec ? "In service" : "In service; you haven't served aboard her");
    $("card-art").innerHTML = e.classId === "gunboat" ? BL.ART.gunboat(e.ship) : BL.ART.warship(e.classId, e.hull);
    var rows = shipStatRows(d, e.classId), mg = d.systems.filter(function (s) { return s.kind === "main"; })[0];
    var cap = function (s) { return s.maxMJ + " MJ, charge " + s.maxMW + " MJ/s"; };
    $("card-stats").innerHTML = rows.map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("");
    var ring = BL.GUNNERY.ring.classes[e.classId], load = BL.GUNNERY.loadout[e.classId] || [];
    // Each gun with its ratings at this mark: what a shot costs, how fast it fires, how many shots a
    // full capacitor holds and what it draws firing nonstop. The guns share one capacitor size, given
    // in a line underneath (a column only if they ever differ). The main gun leads: each shot spends
    // its whole capacitor, and it fires again once that's full, so its rate is set by the charge.
    var guns = sysOf("gun"), same = guns.every(function (g) { return g.maxMJ === guns[0].maxMJ && g.maxMW === guns[0].maxMW; });
    var mainRow = !mg ? "" : "<tr><td>M</td><td>Main gun</td><td>on the centerline</td><td>points forward</td><td>" + mg.maxMJ + " MJ</td><td>every " +
      (Math.round(mg.maxMJ / mg.maxMW * 10) / 10) + " s</td><td>1</td><td>" + mg.maxMW + " MJ/s</td>" + (same ? "" : "<td>" + cap(mg) + "</td>") + "</tr>";
    $("card-gun-note").hidden = true;
    $("card-guns").innerHTML = "<tr><th>#</th><th>Type</th><th>Mount</th><th>Arc</th><th>Per shot</th><th>Rate</th><th>Shots" + infoI("shots") + "</th><th>Draw" + infoI("draw") + "</th>" + (same ? "" : "<th>Capacitor</th>") + "</tr>" + mainRow + guns.map(function (g, i) {
      var a = ring.arcs[i] || [0, 180, 0], W = BL.WEAPONS[load[i]] || { name: "", shotMJ: 0, interval: 1 }, shot = W.shotMJ * (d.mkCharge || 1), per = 1 / W.interval;
      return "<tr><td>" + (i + 1) + "</td><td>" + W.name + " Mk " + d.mk + "</td><td>" + (ring.arcNames[i] || "") + "</td><td>" + (a[1] >= 180 ? "all round" : 2 * a[1] + "°") + "</td><td>" +
        Math.round(shot) + " MJ</td><td>" + per + "/s</td><td>" + (shot ? Math.floor(g.maxMJ / shot) : "–") + "</td><td>" + Math.round(shot * per) + " MJ/s</td>" + (same ? "" : "<td>" + cap(g) + "</td>") + "</tr>";
    }).join("");
    // Short pieces that never break inside, so a line only wraps between them.
    var nw = function (t) { return '<span class="nw">' + t + "</span>"; };
    $("card-gun-cap").innerHTML = same && guns.length ? "<div>" + nw((guns.length > 1 ? "Each gun: " : "Gun: ") + cap(guns[0])) + (mg ? " · " + nw("Main gun: " + cap(mg)) : "") + "</div>" : "";
    var ms = rec ? rec.missions.slice().reverse() : [];
    var aw = shipAwards(c, rec);
    $("card-awards").hidden = !aw.length || !BL.ribbonSvg;
    $("card-awards").innerHTML = '<h2>Awards</h2><div class="ship-aw">' + aw.map(function (a) {
      return '<div class="ship-aw-one">' + (BL.ribbonSvg ? BL.ribbonSvg(a.p, a.n, 90) : "") + "<div><b>" + awardCode(a.p, a.n) + "</b> " + BL.career.STATION_NAME[a.p] + "</div></div>";
    }).join("") + '</div><p class="muted">The highest award on each path earned aboard her: after each successful mission she served, the award you held then.</p>';
    $("card-service").innerHTML = "<tr><th>Date</th><th>Mission</th><th>Your post</th><th>Enemy forces engaged</th><th>Outcome</th><th>Score</th><th>Enemy ships destroyed</th><th>Hull damage</th><th>Award</th></tr>" +
      (ms.length ? ms.map(function (m) {
        var h = c.history.filter(function (x) { return x.seed === m.seed && x.ship === e.ship; })[0];
        var sys = engaged(m.encounters);
        // (his post: where he served; a squadron's other ships and a fleet's: under his flag)
        var post = m.station === "admiral" ? "Fleet Command" : m.station === "squadron" && h && h.station !== "squadron" ? "Flag bridge" : h ? POST[h.station || "engineer"] : m.station === "squadron" ? "Flag bridge" : POST[m.station || "engineer"];
        return "<tr><td>" + starDate(m) + "</td><td>" + esc(missionName(h, m)) + "</td><td>" + (post || "–") + "</td><td>" + (sys || "–") + "</td><td>" + (OUTCOME_NAME[m.outcome] || m.outcome) +
          "</td><td>" + (m.score != null ? m.score : "–") + "</td><td>" + (m.kills != null ? m.kills : "–") + "</td><td>" + (hullPct(e.classId, e.tl, m.hullLost) || "–") + "</td><td>" +
          (function (n) { return n ? '<span class="svc-aw">' + (BL.ribbonSvg ? BL.ribbonSvg(m.station || "engineer", n, 40) + " " : "") + awardCode(m.station || "engineer", n) + "</span>" : "–"; })(awardAt(c, m, rec.n || cls.n)) + "</td></tr>";
      }).join("") : '<tr><td colspan="9" class="muted">No missions on record.</td></tr>');
    show("scr-shipcard"); window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------------- Boot */
  document.querySelectorAll(".app-version").forEach(function (el) { el.textContent = window.APP_VERSION || ""; });
  applySettings();
  newSeedInput();
  refreshTitle();
  show("scr-title");
  requestAnimationFrame(frame);
  window.__bl = { get sim() { return sim; }, train: startTraining };   // for automated tests
})();
