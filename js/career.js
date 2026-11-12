/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert career record: qualifications, reputation, failures, rapid sign-offs,
   reputation profile, mission history, the current job offers and every ship's service record.
   Pure JavaScript (no screen code). Saved in browser storage; exported as
   BATTLELERT_<hero name>.json. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var KEY = BL.APP_TAG + "_career";
  // The three crew stations, then command (the bridge: coxswain of a gunboat, captain above), then
  // squadron command (Squadrons, approved Nov 2, 2026: a class's squadron opens after
  // BL.CAPTAINS.opens successful command missions on it).
  var STATIONS = ["engineer", "gunner", "pilot", "captain", "squadron"];
  var CREW = ["engineer", "gunner", "pilot"];
  var STATION_NAME = { engineer: "Engineer", gunner: "Gunner", pilot: "Pilot", captain: "Command", squadron: "Squadron", admiral: "Admiral" };
  var PLAYABLE = { engineer: true, gunner: true, pilot: true, captain: true, squadron: true }; // stations built so far
  // Command jobs on the gunboat and destroyer escort: this share are escort missions.
  // (escort jobs: one of the class's mission types, makeJob)
  var GUNNER_CLASSES = 9;                          // the gunner station is built up to this class
  // Is this class built for this station? (The engine room runs on every built class; the helm
  // flies every class in BL.HELM.classes.)
  function built(station, n) {
    var cls = BL.classByN(n);
    if (!cls || !PLAYABLE[station]) return false;
    if (station === "pilot" || station === "captain") return !!(BL.HELM && BL.HELM.classes[cls.id]);
    if (station === "squadron") return !!(BL.HELM && BL.HELM.classes[cls.id]) && !!BL.COMMAND.squad.size[cls.id];
    return station === "gunner" ? n <= GUNNER_CLASSES : !!cls.built;
  }
  // guns: the pilot's "guns on target" slot (unused at the other stations).
  function blankProfile() { return { missions: 0, wins: 0, losses: 0, aggression: 0, efficiency: 0, demands: 0, condition: 0, guns: 0 }; }

  var NAMES_VERSION = 2;                           // 2 = the historical ship roster (names.js)
  var TL_VERSION = 2;                              // 2 = tech levels 4 to 7 and INS ship names
  var STORY_VERSION = 2;                           // 1 = story missions as job offers (story.js); 2 = the Captain storyline
  var REP_VERSION = 3;                             // 2 = reputation that goes up and down, from 50 (REP); 3 = a success +1

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  // (the hour and minute too, for the reports' stardates: TexasBont, Nov 8, 2026)
  function now() { var d = new Date(); return ("0" + d.getHours()).slice(-2) + "." + ("0" + d.getMinutes()).slice(-2); }

  function cleanName(name) { return String(name || "").replace(/\s+/g, " ").trim().slice(0, 24); }

  function create(name) {
    var c = {
      app: BL.APP_TAG, kind: "career", format: 1,
      name: cleanName(name) || "Recruit", created: today(),
      stations: {}, signoffsUsed: [],
      profiles: {},                     // one reputation profile per station
      history: [], offersBy: {}, stepUps: {}, offerSeed: BL.randomSeed(),
      ships: {}, namesVersion: NAMES_VERSION, tlVersion: TL_VERSION,
      hulls: {}, nextHull: {},          // hull numbers of ships that replace ones lost in action
      storyDone: {}, storyVersion: STORY_VERSION,     // story missions completed: id -> date
      repVersion: REP_VERSION,
      admiral: blankAdmiral()
    };
    STATIONS.forEach(function (s) { c.stations[s] = { qualified: 0, rep: REP.start, failures: {}, realUntil: 0 }; c.profiles[s] = blankProfile(); c.stepUps[s] = 0; });
    STATIONS.forEach(function (s) { if (PLAYABLE[s]) generateOffers(c, s); });
    return c;
  }

  /* The admiral path (TexasBont, Nov 7, 2026): fleet campaigns F3 (Fleet Commodore) to F8, then G9.
     at: the level he's at (0 until F3 opens); pts: points banked at each level on the way up (all
     count toward G9: banked); closed: levels he has stepped up from (a campaign there after a
     bust-down is a requal: rq, reputation only); failures: campaigns with no points at each level
     (two send him back two levels); won / warLost: G9's one strike. */
  function blankAdmiral() { return { at: 0, rep: REP.start, pts: {}, rq: {}, closed: {}, failures: {}, banked: 0, campaigns: 0, won: false, warLost: false }; }
  function save(c) {
    try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; }
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); return raw ? normalize(JSON.parse(raw)) : null; } catch (e) { return null; }
  }

  // Fill in anything an older or hand-edited file is missing, so it never breaks the game.
  function normalize(c) {
    if (!c || c.kind !== "career") throw new Error("This file isn't a Battlelert career.");
    var oldNames = c.namesVersion !== NAMES_VERSION;   // checked before the defaults below fill it in
    var oldTL = c.tlVersion !== TL_VERSION, oldStory = c.storyVersion !== STORY_VERSION, oldRep = c.repVersion !== REP_VERSION;
    // Careers from before the gunner station: one engineer offer list and one profile.
    if (!c.offersBy) c.offersBy = { engineer: Array.isArray(c.offers) ? c.offers : [] };
    if (!c.profiles) c.profiles = { engineer: c.profile || blankProfile() };
    if (!c.stepUps) c.stepUps = { engineer: +c.offersSinceStepUp || 0 };
    delete c.offers; delete c.profile; delete c.offersSinceStepUp;
    var fresh = create(c.name);
    Object.keys(fresh).forEach(function (k) { if (c[k] === undefined) c[k] = fresh[k]; });
    STATIONS.forEach(function (s) {
      var st = c.stations[s] = c.stations[s] || {};
      st.qualified = clamp(+st.qualified || 0, 0, 9);
      st.rep = st.rep === undefined ? REP.start : isFinite(+st.rep) ? Math.max(0, +st.rep) : 0;     // (a path new since the career began starts at 50)
      st.failures = st.failures || {};
      st.realUntil = +st.realUntil || 0;
      var p = c.profiles[s] = c.profiles[s] || blankProfile();
      Object.keys(blankProfile()).forEach(function (k) { if (!isFinite(+p[k])) p[k] = 0; });
      if (!isFinite(+c.stepUps[s])) c.stepUps[s] = 0;
    });
    // Successful missions by class on the command and squadron paths (squadron command of a class
    // opens after BL.CAPTAINS.opens on its command); careers from before count their history.
    ["captain", "squadron"].forEach(function (s) {
      var st = c.stations[s];
      if (st.wins && typeof st.wins === "object") return;
      st.wins = {};
      c.history.forEach(function (h) { if (h.station === s && h.outcome === "success") st.wins[h.n] = (st.wins[h.n] || 0) + 1; });
    });
    if (!Array.isArray(c.signoffsUsed)) c.signoffsUsed = [];
    // When each qualification was first earned (TexasBont, Nov 8, 2026); careers from before take
    // it from their history (first success on that path and class) and their rapid sign-offs.
    if (!c.qualDates || typeof c.qualDates !== "object") {
      c.qualDates = {};
      c.history.slice().reverse().forEach(function (h) {
        if (h.outcome === "success" && h.station && h.station !== "admiral") markQual(c, h.station, h.n || BL.classById(h.classId).n, h);
      });
      c.signoffsUsed.forEach(function (o) { markQual(c, o.station, o.n, { date: o.date, signoff: true }); });
      var A0 = c.admiral || {};
      for (var L = 3; L <= 9; L++) {
        if (L < 9 ? !(A0.closed && A0.closed[L] && A0.at > L) : !A0.won) continue;
        var h = c.history.filter(function (x) { return x.station === "admiral" && x.n === L && (L < 9 ? x.score > 0 : x.outcome === "success"); })[0];
        if (h) markQual(c, "admiral", L, h);
      }
    }
    var ad = c.admiral = c.admiral && typeof c.admiral === "object" ? c.admiral : blankAdmiral(), ba = blankAdmiral();
    Object.keys(ba).forEach(function (k) { if (ad[k] === undefined || ad[k] === null) ad[k] = ba[k]; });
    c.name = cleanName(c.name) || "Recruit";
    if (!c.ships || typeof c.ships !== "object") c.ships = {};
    if (!c.hulls || typeof c.hulls !== "object") c.hulls = {};
    if (!c.nextHull || typeof c.nextHull !== "object") c.nextHull = {};
    repairLost(c);
    // Careers from before tech levels 4 to 7: old levels 1-2 become 5, 3-4 become 6, 5-6 become 7
    // (a gunboat is always 4), TFS ships become INS, and the offers are drawn again.
    if (oldTL && !oldNames) {
      var newTL = function (classId, tl) { return classId === "gunboat" ? 4 : Math.min(7, 5 + Math.floor((Math.max(1, +tl || 1) - 1) / 2)); };
      var ins = function (name) { return String(name || "").replace(/^TFS /, BL.SHIP_PREFIX); };
      c.history.forEach(function (h) { h.tl = newTL(h.classId, h.tl); h.ship = ins(h.ship); });
      var ships = {};
      Object.keys(c.ships).forEach(function (k) { var r = c.ships[k]; r.tl = newTL(r.classId, r.tl); r.name = ins(r.name); ships[ins(k)] = r; });
      c.ships = ships;
      c.offersBy = {};
    }
    c.tlVersion = TL_VERSION;
    if (!c.storyDone || typeof c.storyDone !== "object") c.storyDone = {};
    if (oldStory) {      // offers become story missions (version 2: only the command offers change)
      if ((c.storyVersion || 0) < 1) c.offersBy = {}; else delete c.offersBy.captain;
      c.storyVersion = STORY_VERSION;
    }
    // Careers from before reputation went up and down: each path from 50, recalculated from the
    // mission history it holds (outcome and tech level; nothing replayed), oldest first.
    if (oldRep) {
      STATIONS.forEach(function (s) { c.stations[s].rep = REP.start; });
      c.history.slice().reverse().forEach(function (h) {
        var st = c.stations[h.station || "engineer"]; if (!st) return;
        var was = st.rep;
        st.rep = Math.max(0, st.rep + repParts(h.station || "engineer", h.outcome, h.tl, 0, 0).reduce(function (a, p) { return a + p[1]; }, 0));
        h.rep = st.rep - was;
      });
      c.repVersion = REP_VERSION;
    }
    // Careers from before the ship roster: start the service records from the mission history,
    // and replace offers that still carry the old generic names.
    if (oldNames) {
      c.history.slice().reverse().forEach(function (h) { logService(c, h, {}); });
      c.offersBy = {};
      c.namesVersion = NAMES_VERSION;
    }
    STATIONS.forEach(function (s) {
      if (!PLAYABLE[s]) return;
      if (!Array.isArray(c.offersBy[s]) || !c.offersBy[s].length) generateOffers(c, s);
      ensureStepUp(c, s);
      uniqueShips(c.offersBy[s], BL.rng(c.offerSeed + 11), c);    // (offers saved before names were kept unique)
    });
    refreshCommand(c);
    return c;
  }

  function fileName(c) {
    var safe = cleanName(c.name).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "career";
    return BL.APP_TAG + "_" + safe + ".json";
  }
  function exportText(c) { return JSON.stringify(c, null, 2); }
  function importText(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error("That file isn't readable JSON."); }
    return normalize(data);
  }

  /* ------------------------------------------------------------ Ranks */
  function qualified(c, station) { return c.stations[station].qualified; }
  // (the first time only: a requalification keeps the original date)
  function markQual(c, station, n, h) {
    var k = station + ":" + n;
    c.qualDates = c.qualDates || {};
    if (c.qualDates[k]) return;
    c.qualDates[k] = { date: h.date || today(), time: h.time || null, how: h.signoff ? "signoff" : "mission", title: h.title || null };
  }
  function rank(c, station) {
    var q = qualified(c, station);
    if (station === "squadron") { var k = squadronClasses(c).length; return k ? "Squadron commander, " + k + (k === 1 ? " class" : " classes") : "Squadron: none yet"; }
    return q ? STATION_NAME[station] + "-" + q : "Recruit";
  }
  function highestClass(c) { return Math.max.apply(null, CREW.map(function (s) { return c.stations[s].qualified; })); }
  // Command of class n: engineer, gunner and pilot all qualified on it, and command of the class
  // below (the gunboat first, as coxswain).
  function canCommand(c, n) {
    return n >= 1 && n <= 9 && built("captain", n) && CREW.every(function (s) { return c.stations[s].qualified >= n; }) && c.stations.captain.qualified >= n - 1;
  }
  // What command of class n still needs, as short phrases ("gunner on destroyers"), or [].
  function commandNeeds(c, n) {
    var cls = BL.classByN(n), out = CREW.filter(function (s) { return c.stations[s].qualified < n; }).map(function (s) { return STATION_NAME[s].toLowerCase(); });
    if (!cls) return out;
    var nd = out.length ? [out.join(", ").replace(/, ([^,]*)$/, " and $1") + " qualified on the " + cls.name.toLowerCase()] : [];
    if (c.stations.captain.qualified < n - 1) nd.push("command of the " + BL.classByN(n - 1).name.toLowerCase());
    return nd;
  }
  // The best rank held, short, for the title screen's button: "E4", or "E4 · G1" (Engineer-4,
  // Gunner-1; C for Command).
  function ranks(c) {
    var held = STATIONS.filter(function (s) { return qualified(c, s) > 0 && s !== "squadron"; }).map(function (s) { return STATION_NAME[s].charAt(0) + qualified(c, s); });
    if (squadronClasses(c).length) held.push("S×" + squadronClasses(c).length);
    return held.length ? held.join(" · ") : "Recruit";
  }
  function signoffsTotal(c) { return Math.max(0, highestClass(c) - 2); }
  function signoffsHeld(c) { return signoffsTotal(c) - c.signoffsUsed.length; }
  // The class a station is working toward: the one above its qualification (class 1 to start).
  function targetClass(c, station) { return Math.min(9, qualified(c, station) + 1); }
  // Squadron command, class by class: open once you've had BL.CAPTAINS.opens successful command
  // missions on the class; held once you've had a successful squadron mission on it.
  function commandWins(c, n) { return (c.stations.captain.wins || {})[n] || 0; }
  // (a ladder too: above the gunboat, BL.CAPTAINS.opens successful squadron missions on the class
  // below as well (TexasBont, Nov 7, 2026); a class already commanded stays open)
  // (command's part done: its BL.CAPTAINS.opens command successes, which once alone opened the squadron)
  function commandDone(c, n) { return built("squadron", n) && commandWins(c, n) >= BL.CAPTAINS.opens; }
  function squadronOpen(c, n) {
    return built("squadron", n) && commandWins(c, n) >= BL.CAPTAINS.opens &&
      (n === 1 || squadronWins(c, n - 1) >= BL.CAPTAINS.opens || squadronWins(c, n) > 0);
  }
  function squadronWins(c, n) { return ((c.stations.squadron || {}).wins || {})[n] || 0; }
  function squadronClasses(c) { return BL.CLASSES.filter(function (k) { return squadronWins(c, k.n) > 0; }).map(function (k) { return k.n; }); }

  /* ------------------------------------------------------------ Offers
     Generic postings for now: a ship class, a tech level and a ship name; one list per station.
     Always a lowest-tech offer (tech level 4 on a gunboat, 5 above) for the class you're on and, once you're qualified, one
     for the class above; more offers from the class above come as reputation grows.
     A gunner job names the engineer you'd serve with (the same one the mission will roll); a
     pilot job the engineer and the gun crew.
     Crew hooks: a job names each crewmate it knows as job.engineer, job.gunner or job.pilot
     ({ name, who, label, skill }); the listing shows whichever are there. To come: engineer
     jobs name the gunner and pilot, gunner jobs the pilot, pilot jobs the engineer and gunner,
     each picked from the job seed so the mission gets the same people. */
  function makeJob(rng, station, n, tl, serious, story, other) {
    var cls = BL.classByN(n);
    var job = { id: "j" + Math.floor(rng.next() * 1e9).toString(36), station: station, classId: cls.id, n: n, tl: tl,
      ship: BL.shipName(rng, cls.id, tl), seed: 1 + Math.floor(rng.next() * 999999), serious: serious !== false };
    job.hull = BL.hullNumber(cls.id, job.ship);
    if (station === "gunner") { job.weapons = (BL.GUNNERY.loadout[cls.id] || ["pulse"]).slice(); if (BL.pickEngineer) job.engineer = BL.pickEngineer(job.seed, cls.id); }
    if (station === "pilot") { job.helm = true; if (BL.pickEngineer) job.engineer = BL.pickEngineer(job.seed, cls.id); }
    // A command job: the bridge (the crew are the ones the mission rolls from its seed). Its
    // mission is one of the class's types (BL.COMMAND.opsBy.captain), any one alike: the usual
    // one, an escort (gunboat, destroyer escort) or a Starforce Academy type (Nov 12, 2026,
    // TexasBont: "integrate all these into the captain career path"). op: null for the usual one.
    if (station === "captain") {
      job.helm = true; job.captain = true;
      // (other: one of the types besides the usual one)
      var ops = (BL.COMMAND.opsBy.captain[cls.id] || ["standard"]), pool = other && ops.length > 1 ? ops.slice(1) : ops, op = pool[Math.floor(rng.next() * pool.length)];
      job.escort = op === "escort"; job.op = op === ops[0] ? null : op;
      if (BL.pickEngineer) job.engineer = BL.pickEngineer(job.seed, cls.id);
      if (BL.pickPilot) job.pilot = BL.pickPilot(job.seed, cls.id);
    }
    // A squadron job: the flagship (as a command job) and her squadron's other ships, every name
    // different (BL.shipName); the fleet admiral who offers it is added by squadronOffers.
    if (station === "squadron") {
      job.helm = true; job.captain = true; job.flag = true;
      if (BL.pickEngineer) job.engineer = BL.pickEngineer(job.seed, cls.id);
      if (BL.pickPilot) job.pilot = BL.pickPilot(job.seed, cls.id);
      var used = {}; used[job.ship] = true; job.wingShips = [];
      for (var k = 1; k < (BL.COMMAND.squad.size[cls.id] || 4); k++) { var nm = BL.shipName(rng, cls.id, tl, used); used[nm] = true; job.wingShips.push(nm); }
    }
    if (story) {
      job.story = story.id; job.title = story.title; job.chapter = story.chapter;
      // (a Captain story mission says whether it's an escort, and of what: carrier, convoy or capital ship)
      if (station === "captain") { job.escort = !!story.escort; job.escortKind = story.escort || null; job.op = null; }
    }
    return job;
  }

  /* Story missions (story.js): each station's storyline has three missions per class, in any
     order. Offers are the ones not yet completed, on the class you're on and the class above;
     a failed one stays on offer. Winning any dreadnought mission completes the storyline. When
     a class you still need has none left (after being sent back), plain jobs fill in. */
  function hasStory(station) { return !!(BL.STORY && BL.STORY[station]); }
  function storyComplete(c, station) {
    return hasStory(station) && BL.STORY[station].some(function (m) { return m.n === 9 && c.storyDone[m.id]; });
  }
  function storyLeft(c, station, n) {
    if (!hasStory(station) || (n === 9 && storyComplete(c, station))) return [];
    return BL.STORY[station].filter(function (m) { return m.n === n && !c.storyDone[m.id]; });
  }
  function storyOffers(c, station, rng) {
    var q = qualified(c, station), out = [], cmd = station === "captain";
    var classes = q >= 1 ? [q, q + 1] : [1];
    classes.forEach(function (n) {
      if (!BL.classByN(n) || !built(station, n)) return;
      if (cmd && n > q && !canCommand(c, n)) return;      // (command of a class: the command ladder, canCommand)
      // (a class whose squadron is open: the rest of its story moves to the requalifying jobs; TexasBont, Nov 6, 2026)
      if (cmd && commandDone(c, n)) return;
      var left = storyLeft(c, station, n);
      left.forEach(function (m, i) { out.push(makeJob(rng, station, n, i === 0 ? lowTL(n) : anyTL(rng, n), true, m)); });
      if (!left.length && n > q && !storyComplete(c, station)) {
        out.push(makeJob(rng, station, n, lowTL(n)));
        out.push(makeJob(rng, station, n, anyTL(rng, n)));
      }
    });
    // Command: the class you command has no story left and the next isn't open yet: plain jobs on it
    // (not once its squadron is open: then it's Squadron jobs and requalifying; TexasBont, Nov 6, 2026).
    if (cmd && q >= 1 && !commandDone(c, q) && !out.some(function (j) { return j.n === q; }) && !out.some(function (j) { return j.n > q; })) {
      out.push(makeJob(rng, station, q, lowTL(q)));
      for (var i = rng.int([1, 2]); i > 0; i--) out.push(makeJob(rng, station, q, anyTL(rng, q)));
    }
    // Command: beside the story, one job on the class you command flying one of its other mission
    // types (an escort or a Starforce Academy type; Nov 12, 2026, TexasBont), unless its squadron is open.
    if (cmd && q >= 1 && built(station, q) && !commandDone(c, q) && !out.some(function (j) { return j.n === q && !j.story; }))
      out.push(makeJob(rng, station, q, anyTL(rng, q), true, null, true));
    if (cmd) squadronWork(c, rng, out);
    return out;
  }
  /* Command: on every class below the one you command whose squadron isn't open yet (fewer than
     BL.CAPTAINS.opens command successes), one job stays on offer, a requalifying job at half
     reputation: a story mission you haven't flown there, else a plain one (TexasBont, Nov 4, 2026). */
  function squadronWork(c, rng, out) {
    for (var n = 1; n < qualified(c, "captain"); n++) {
      if (!built("captain", n) || !built("squadron", n) || commandDone(c, n)) continue;
      var m = storyLeft(c, "captain", n)[0];
      out.push(m ? makeJob(rng, "captain", n, anyTL(rng, n), false, m) : makeJob(rng, "captain", n, lowTL(n), false));
    }
  }
  function needsSquadronWork(c, n) { return n < qualified(c, "captain") && built("captain", n) && built("squadron", n) && !commandDone(c, n); }
  function offers(c, station) { return c.offersBy[station] || []; }
  // Every ship in a list of jobs is a different ship: a repeat gets a new name of its class and tech level.
  // A lost gunboat's PT number is never drawn again; a named ship lost in action comes back as a new
  // ship of the same name and tech level under a new hull number (see retireShip).
  function uniqueShips(list, rng, c) {
    var used = {};
    if (c) Object.keys(c.ships).forEach(function (k) { if (c.ships[k].lost && c.ships[k].classId === "gunboat") used[k] = true; });
    list.forEach(function (j) {
      if (used[j.ship]) j.ship = BL.shipName(rng, j.classId, j.tl, used);
      j.hull = hullOf(c, j);
      used[j.ship] = true;
    });
    return list;
  }
  /* His own ships (TexasBont, Nov 8, 2026): any ship he has served on, still in service, can be his
     ship or flagship again on any path, on a job of her class; she brings her Tech Level. */
  function pastShips(c, classId) {
    return Object.keys(c.ships).map(function (k) { return c.ships[k]; }).filter(function (s) { return s.classId === classId && !s.lost && s.missions && s.missions.length; })
      .map(function (s) { return { ship: s.name, hull: s.hull || BL.hullNumber(classId, s.name), tl: s.tl }; })
      .sort(function (a, b) { return a.tl - b.tl || (a.ship < b.ship ? -1 : 1); });
  }
  // (k: an index into pastShips, or -1 for the ship the job offered; a squadron's ship already in
  // the line trades places with the old flagship)
  function setJobShip(c, j, k) {
    if (!j.offered) j.offered = { ship: j.ship, hull: j.hull, tl: j.tl };
    var p = k < 0 ? j.offered : pastShips(c, j.classId)[k]; if (!p) return false;
    if (j.wingShips) { var w = j.wingShips.indexOf(p.ship); if (w >= 0) j.wingShips[w] = j.ship; }
    j.ship = p.ship; j.hull = p.hull; j.tl = p.tl;
    return true;
  }
  function hullOf(c, j) { return (c && c.hulls && c.hulls[j.ship]) || BL.hullNumber(j.classId, j.ship); }
  // A ship destroyed or abandoned is gone: its service record is marked lost, and the next ship of
  // that name gets the class's next new hull number (137 up, past the 36 on the name lists).
  /* Ships lost before lost ships were closed (Oct 28, 2026) still read as in service, and later
     missions under her name went on her record (TexasBont, Nov 8, 2026: a light cruiser destroyed
     with him at the helm came back as his flagship). Close her record at the loss; the missions
     after it go to the new ship of her name under a new hull number, as retireShip does now. */
  function repairLost(c) {
    var todo = Object.keys(c.ships);
    while (todo.length) {
      var key = todo.shift(), r = c.ships[key];
      if (!r || r.lost || !r.missions) continue;
      var i = -1; r.missions.some(function (m, k) { if (m.outcome === "destroyed" || m.outcome === "abandoned") { i = k; return true; } });
      if (i < 0) continue;
      var later = r.missions.splice(i + 1);
      r.lost = r.missions[i].date; r.lastServed = r.missions[i].date;
      if (r.classId === "gunboat") { r.missions = r.missions.concat(later); continue; }
      if (c.hulls[r.name] && c.hulls[r.name] !== r.hull) { if (later.length) r.missions = r.missions.concat(later); continue; }
      var n = c.nextHull[r.classId] || 137; c.nextHull[r.classId] = n + 1;
      var hull = c.hulls[r.name] = BL.HULL_CODES[r.classId] + "-" + n;
      if (!later.length) continue;
      var nk = r.name + " " + hull;
      c.ships[nk] = { name: r.name, hull: hull, classId: r.classId, n: r.n, tl: r.tl, firstServed: later[0].date, lastServed: later[later.length - 1].date, missions: later };
      todo.push(nk);
    }
  }
  function retireShip(c, entry) {
    var rec = c.ships[recKey(entry)];
    if (rec) rec.lost = entry.date;
    if (entry.classId === "gunboat") return;
    var k = c.nextHull[entry.classId] || 137;
    c.nextHull[entry.classId] = k + 1;
    c.hulls[entry.ship] = BL.HULL_CODES[entry.classId] + "-" + k;
    Object.keys(c.offersBy).forEach(function (s) { (c.offersBy[s] || []).forEach(function (j) { j.hull = hullOf(c, j); }); });
  }
  function generateOffers(c, station) {
    station = station || "engineer";
    var rng = BL.rng(c.offerSeed = (c.offerSeed * 48271 + 11) % 2147483647 || 1);
    var q = qualified(c, station), offers = [];
    if (hasStory(station)) {
      offers = storyOffers(c, station, rng);
      offers.sort(function (a, b) { return b.n - a.n || (a.story || "").localeCompare(b.story || "") || a.tl - b.tl; });
      c.offersBy[station] = uniqueShips(offers, rng, c);
      if (station === "captain") offeredBy(c, offers, rng);
      return offers;
    }
    if (station === "captain") return commandOffers(c, rng);
    if (station === "squadron") return squadronOffers(c, rng);
    var current = Math.max(1, q);
    if (!built(station, current)) current = Math.min(current, station === "gunner" ? GUNNER_CLASSES : current);
    if (!built(station, current)) current = 1;
    offers.push(makeJob(rng, station, current, lowTL(current)));
    var extra = rng.int([1, 2]);
    for (var i = 0; i < extra; i++) offers.push(makeJob(rng, station, current, anyTL(rng, current)));
    var next = BL.classByN(q + 1);
    if (q >= 1 && next && built(station, next.n)) {
      offers.push(makeJob(rng, station, next.n, lowTL(next.n)));
      var rep = c.stations[station].rep;
      var chance = clamp(0.45 + rep / (3 * next.baseRep), 0.45, 0.95);
      if (rng.chance(chance) || c.stepUps[station] >= 2) {
        offers.push(makeJob(rng, station, next.n, anyTL(rng, next.n)));
        c.stepUps[station] = 0;
      } else c.stepUps[station] = (c.stepUps[station] || 0) + 1;
    }
    offers.sort(function (a, b) { return b.n - a.n || a.tl - b.tl; });
    c.offersBy[station] = uniqueShips(offers, rng, c);
    return offers;
  }
  // Command: postings on the class you command and, once you may, the class above (canCommand);
  // none until you may command a gunboat.
  function commandOffers(c, rng) {
    var q = qualified(c, "captain"), offers = [];
    [q, q + 1].forEach(function (n) {
      if (n < 1 || (n > q && !canCommand(c, n)) || !built("captain", n)) return;
      offers.push(makeJob(rng, "captain", n, lowTL(n)));
      for (var i = rng.int([1, 2]); i > 0; i--) offers.push(makeJob(rng, "captain", n, anyTL(rng, n)));
    });
    squadronWork(c, rng, offers);
    offers.sort(function (a, b) { return b.n - a.n || a.tl - b.tl; });
    c.offersBy.captain = uniqueShips(offers, rng, c);
    offeredBy(c, offers, rng);
    return offers;
  }
  /* Squadron jobs, offered by the named fleet admirals (BL.BRASS): on every class whose squadron
     command is open and that doesn't yet have the BL.CAPTAINS.opens successful squadron missions
     the admiral path asks of it (TexasBont, Nov 7, 2026; the rest are requals: lowerJobs), a
     lowest-tech job from the admiral who rates you best, and one more at any tech level from an
     admiral whose bar you pass. */
  function squadronDone(c, n) { return squadronWins(c, n) >= BL.CAPTAINS.opens; }
  function squadronOffers(c, rng) {
    var offers = [], B = brass(c);
    BL.CLASSES.forEach(function (k) {
      if (!squadronOpen(c, k.n) || squadronDone(c, k.n)) return;
      var rated = B.admirals.map(function (a) { return { a: a, v: weigh(c, a, "squadron") }; }).sort(function (x, y) { return y.v - x.v; });
      offers.push(byWhom(makeJob(rng, "squadron", k.n, lowTL(k.n)), rated[0].a));
      var pass = rated.filter(function (x) { return x.v >= x.a.bar; });
      if (pass.length) offers.push(byWhom(makeJob(rng, "squadron", k.n, anyTL(rng, k.n)), rng.pick(pass).a));
    });
    offers.sort(function (a, b) { return b.n - a.n || a.tl - b.tl; });
    c.offersBy.squadron = uniqueShips(offers, rng, c);
    return offers;
  }
  /* Named commanders (BL.BRASS): 3 commodores per class, who offer command jobs, and 4 fleet
     admirals, who offer squadron jobs; made once per career, no two sharing a first or last name.
     Each has a taste (what he weighs in the profile) and a bar. */
  function brass(c) {
    if (c.brass && c.brass.admirals) return c.brass;
    var R = BL.BRASS, E = BL.GUNNERY.engineer, rng = BL.rng(((c.offerSeed || 1) ^ 0x6a09e667) >>> 0 || 1), tf = {}, tl = {}, id = 1, tastes = Object.keys(R.tastes);
    function one(level) {
      var fs = E.first.filter(function (n) { return !tf[n]; }), ls = E.last.filter(function (n) { return !tl[n]; });
      var p = { id: id++, level: level, first: rng.pick(fs), last: rng.pick(ls), taste: rng.pick(tastes), bar: Math.round(rng.range(R.bar) * 100) / 100 };
      tf[p.first] = true; tl[p.last] = true;
      return p;
    }
    var b = { commodores: {}, admirals: [] };
    BL.CLASSES.forEach(function (k) { var list = b.commodores[k.id] = []; for (var i = 0; i < R.perClass; i++) list.push(one("commodore")); });
    for (var i = 0; i < R.admirals; i++) b.admirals.push(one("admiral"));
    return (c.brass = b);
  }
  function brassName(p) { return BL.BRASS.ranks[p.level] + " " + p.first + " " + p.last; }
  // The profile weighed his way, 0..1 (a weight below 0 counts the factor's opposite). Squadron
  // jobs weigh the squadron profile once it has missions, else the command one; with no command
  // missions yet, everyone rates you even.
  function weigh(c, p, station) {
    var w = BL.BRASS.tastes[p.taste].w, sqd = station === "squadron" && c.profiles.squadron.missions, pr = profile(c, sqd ? "squadron" : "captain"), sum = 0, tot = 0;
    if (!sqd && !c.profiles.captain.missions) return 0.5;
    Object.keys(w).forEach(function (k) { var v = clamp(+pr[k] || 0, 0, 1); sum += Math.abs(w[k]) * (w[k] < 0 ? 1 - v : v); tot += Math.abs(w[k]); });
    return tot ? sum / tot : 0.5;
  }
  function byWhom(job, p) { job.by = { name: brassName(p), says: BL.BRASS.tastes[p.taste].says }; return job; }
  // Each command job is offered by one of its class's commodores: one whose bar you pass, else the
  // one who rates you best.
  function offeredBy(c, list, rng) {
    var B = brass(c);
    list.forEach(function (j) {
      var rated = B.commodores[j.classId].map(function (p) { return { p: p, v: weigh(c, p, "captain") }; }).sort(function (x, y) { return y.v - x.v; });
      var pass = rated.filter(function (x) { return x.v >= x.p.bar; });
      byWhom(j, (pass.length ? rng.pick(pass) : rated[0]).p);
    });
  }
  // A station qualification can open command of the next class: then the command offers are drawn again.
  function refreshCommand(c) {
    var q = qualified(c, "captain"), list = offers(c, "captain");
    if (canCommand(c, q + 1) && !list.some(function (o) { return o.n === q + 1; })) generateOffers(c, "captain");
    // (a class below yours still short of its squadron, with no job on it: drawn again)
    else if (BL.CLASSES.some(function (k) { return needsSquadronWork(c, k.n) && !list.some(function (o) { return o.n === k.n; }); })) generateOffers(c, "captain");
    // (a squadron command newly open: the squadron offers are drawn again; command offers saved
    // before the named commodores get theirs)
    var sq = offers(c, "squadron");
    if (BL.CLASSES.some(function (k) { return squadronOpen(c, k.n) && !squadronDone(c, k.n) && !sq.some(function (o) { return o.n === k.n; }); })) generateOffers(c, "squadron");
    // (a job on a class whose squadron is now open: drawn again without it)
    if (offers(c, "captain").some(function (o) { return o.serious && commandDone(c, o.n); })) generateOffers(c, "captain");
    if (offers(c, "captain").some(function (o) { return !o.by; })) offeredBy(c, offers(c, "captain"), BL.rng(c.offerSeed + 13));
  }
  // Tech levels for a class (BL.TECH.levels): the lowest, and any one at random.
  function lowTL(n) { return BL.TECH.levels(BL.classByN(n).id)[0]; }
  function anyTL(rng, n) { var L = BL.TECH.levels(BL.classByN(n).id); return L[rng.int([0, L.length - 1])]; }
  // Careers saved before the step-up rule may lack the guaranteed lowest-tech offer.
  function ensureStepUp(c, station) {
    var q = qualified(c, station), next = BL.classByN(q + 1), list = offers(c, station);
    if (q < 1 || !next || !built(station, next.n) || hasStory(station) || station === "captain" || station === "squadron") return;
    var has = list.some(function (o) { return o.n === next.n && o.tl === lowTL(next.n); });
    if (!has) {
      list.push(makeJob(BL.rng(c.offerSeed + 3), station, next.n, lowTL(next.n)));
      list.sort(function (a, b) { return b.n - a.n || a.tl - b.tl; });
      uniqueShips(list, BL.rng(c.offerSeed + 5), c);
    }
  }

  // Requalifying: jobs below your current class, always available. You've already qualified on
  // them, so they're practice or requalification, and earn half that class's reputation. With a
  // storyline, they're the story missions you skipped on those classes (at command, your own class's
  // too once its squadron is open: storyOffers no longer offers them).
  function lowerJobs(c, station) {
    var q = qualified(c, station), out = [];
    var rng = BL.rng(c.offerSeed + 7);
    // (squadron: the classes with their squadron missions done, a job each from the admiral who rates you best)
    if (station === "squadron") {
      var B = brass(c);
      BL.CLASSES.forEach(function (k) {
        if (!squadronOpen(c, k.n) || !squadronDone(c, k.n)) return;
        var best = B.admirals.map(function (a) { return { a: a, v: weigh(c, a, "squadron") }; }).sort(function (x, y) { return y.v - x.v; })[0];
        out.push(byWhom(makeJob(rng, "squadron", k.n, anyTL(rng, k.n), false), best.a));
      });
      out.sort(function (a, b) { return b.n - a.n; });
      return uniqueShips(out, rng, c);
    }
    for (var n = 1; n <= q; n++) {
      if (n === q && !(station === "captain" && hasStory(station) && commandDone(c, n))) continue;
      if (!built(station, n)) continue;
      if (hasStory(station)) { storyLeft(c, station, n).forEach(function (m) { out.push(makeJob(rng, station, n, anyTL(rng, n), false, m)); }); continue; }
      BL.TECH.levels(BL.classByN(n).id).forEach(function (tl) { out.push(makeJob(rng, station, n, tl, false)); });
    }
    return uniqueShips(out, rng, c);
  }
  /* Reputation: a man's standing on each path (Reputation and crew refusals, Nov 2, 2026). It
     starts at 50, never goes below 0 and has no top. A mission's outcome counts once (a success
     gains more at TL5 and TL6: an old beater's success gets talked about; a requalifying job's
     the same); at command, a squadron left behind, each crewman killed and dropping down to a
     station (once a mission) come on top. */
  var REP = { start: 50, success: 1, tlBonus: { 5: 2, 6: 1 }, failure: -1, destroyed: -2, abandoned: -1,
    wardLost: -1, dropMissed: -3, squadronLost: -3, killed: -1, droppedDown: -1, shipLost: -1, flagBridge: -1 };
  function repFor(job) { return REP.success + (REP.tlBonus[job.tl] || 0); }      // what a success earns
  // The mission's reputation, part by part: [[what, points], ...].
  // (squadron command, sq: each ship lost, left behind included, and taking the flagship's bridge,
  // once a mission; dropping down from there to a station counts on top, as at command)
  function repParts(station, outcome, tl, squadrons, killed, dropped, sq) {
    var cmd = station === "captain" || station === "squadron", out = [];
    if (outcome === "success") { out.push(["success", REP.success]); if (REP.tlBonus[tl]) out.push(["Tech Level " + tl, REP.tlBonus[tl]]); }
    else if (outcome === "destroyed") out.push(["ship destroyed", REP.destroyed]);
    else if (outcome === "abandoned") out.push(["abandoned ship", REP.abandoned]);
    else if (cmd && outcome === "wardLost") out.push(["escorted ship lost", REP.wardLost]);
    else if (cmd && outcome === "dropMissed") out.push(["planet buster drop missed", REP.dropMissed]);
    else out.push(["failed mission", REP.failure]);
    if (cmd && squadrons) out.push(["squadron left behind", REP.squadronLost * squadrons]);
    if (cmd && killed) out.push([killed + " crew killed", REP.killed * killed]);
    if (cmd && dropped) out.push(["dropped down to a station", REP.droppedDown]);
    if (sq && sq.shipsLost) out.push([sq.shipsLost + (sq.shipsLost === 1 ? " ship" : " ships") + " lost", REP.shipLost * sq.shipsLost]);
    if (sq && sq.flagBridge) out.push(["took the flagship's bridge", REP.flagBridge]);
    return out;
  }

  /* ------------------------------------------------------- Mission result
     Every mission moves reputation on that path (repParts); success qualifies you on the class.
     Any two failures at a post (station + class) send you back one class, where you
     requalify with a real mission. Failures on jobs below your class don't count. */
  function applyResult(c, job, r) {
    var st = c.stations[job.station], post = job.n, before = st.qualified;
    var report = { rep: 0, qualifiedBefore: before, qualifiedAfter: before, promoted: false, demoted: false, failuresAtPost: 0,
      profileBefore: profile(c) };
    var success = r.outcome === "success", squad = job.station === "squadron";
    if (success && (job.station === "captain" || squad)) st.wins[post] = (st.wins[post] || 0) + 1;
    if (success) {
      if (job.story) { c.storyDone[job.story] = today(); report.storyDone = job.story; }
      st.failures[post] = 0;
      if (post > st.qualified) { st.qualified = post; report.promoted = true; }
    } else if (post >= st.qualified && !squad) {     // (squadron command isn't a ladder: no sending back)
      st.failures[post] = (st.failures[post] || 0) + 1;
      report.failuresAtPost = st.failures[post];
      if (st.failures[post] >= 2) {
        st.failures[post] = 0;
        var back = Math.max(0, Math.min(st.qualified, post - 2));
        // Classes lost this way must be requalified with real missions, not rapid sign-offs.
        st.realUntil = Math.max(st.realUntil || 0, st.qualified);
        if (back < st.qualified) { st.qualified = back; report.demoted = true; }
        report.sentBack = true;
      }
    }
    report.qualifiedAfter = st.qualified;
    // Rapid sign-offs held can't exceed what the new top class allows.
    while (c.signoffsUsed.length > signoffsTotal(c)) c.signoffsUsed.pop();
    // Reputation profile, one per station: running averages over every mission at that station.
    // At the gun, accuracy fills the efficiency slot and threats stopped the demands-met slot.
    // At the helm: orders followed (efficiency slot), dodging (the breaks the captain ordered and
    // you made; demands slot) and guns on target (the share of enemy ships the gun crew destroyed).
    var p = c.profiles[job.station] = c.profiles[job.station] || blankProfile(), n = p.missions;
    report.profileBefore = profile(c, job.station);
    function avg(old, v) { return (old * n + v) / (n + 1); }
    var gun = job.station === "gunner", hm = job.station === "pilot" && r.helm, cp = (job.station === "captain" || squad) && r.captain;
    p.aggression = avg(p.aggression, r.aggression || 0);
    // Command: navigation (efficiency slot), command (demands slot) and guns on target.
    if (cp) {
      p.efficiency = avg(p.efficiency, (r.parts.navigation || 0) / 25);
      p.demands = avg(p.demands, (r.parts.command || 0) / 25);
      p.guns = avg(p.guns || 0, cp.ships ? cp.kills / cp.ships : 0);
      p.delegation = avg(p.delegation === undefined ? 1 : p.delegation, cp.dropped ? 0 : 1);     // (the share of missions he stayed on the bridge)
    } else if (hm) {
      var asked = hm.orders + hm.requests + hm.evasive + hm.disobeyed;
      p.efficiency = avg(p.efficiency, asked ? (hm.ordersMet + hm.requestsMet + hm.evasiveMet) / asked : 1);
      p.demands = avg(p.demands, hm.evasive ? hm.evasiveMet / hm.evasive : 1);
      p.guns = avg(p.guns || 0, hm.ships ? hm.kills / hm.ships : 0);
    } else {
      p.efficiency = avg(p.efficiency, gun ? (r.gunner ? r.gunner.accuracyPct : 0) / 100 : r.detail.efficiencyPct / 100);
      p.demands = avg(p.demands, (gun ? r.parts.threats : r.parts.demands) / 25);
    }
    p.condition = avg(p.condition, r.parts.condition / 25);
    p.missions = n + 1;
    if (success) p.wins++; else p.losses++;
    report.profileAfter = profile(c, job.station);
    // Command: the roster crew's losses, growth and morale (BL.roster.afterMission); then reputation.
    if (cp && BL.roster) report.crew = BL.roster.afterMission(c, job, r, { date: today(), time: now() });
    // Squadron command: the captains' losses, growth and morale (BL.captains.afterMission).
    if (squad && BL.captains) report.captains = BL.captains.afterMission(c, job, r, { date: today(), time: now() });
    var sqRep = squad && cp && cp.squad ? { shipsLost: cp.squad.lost + cp.squad.left, flagBridge: !!cp.squad.flagBridge } : null;
    report.repParts = repParts(job.station, r.outcome, job.tl, cp && r.detail ? r.detail.squadronsLost || 0 : 0, report.crew ? report.crew.lost.length : 0, cp && cp.dropped, sqRep);
    var repWas = st.rep;
    st.rep = Math.max(0, st.rep + report.repParts.reduce(function (a, p) { return a + p[1]; }, 0));
    report.rep = st.rep - repWas;
    var entry = { date: today(), time: now(), station: job.station, classId: job.classId, n: job.n, tl: job.tl, ship: job.ship, hull: job.hull || hullOf(c, job),
      seed: job.seed, outcome: r.outcome, score: r.score, rep: report.rep, serious: job.serious, story: job.story, title: job.title };
    if (success) markQual(c, job.station, post, entry);
    c.history.unshift(entry);
    if (c.history.length > 1000) c.history.length = 1000;
    logService(c, entry, r);
    if (r.outcome === "destroyed" || r.outcome === "abandoned") { retireShip(c, entry); report.shipLost = true; }
    // (a squadron's other ships: each gets her own service record; one lost or left behind is retired)
    if (squad && cp && cp.squad) cp.squad.ships.forEach(function (s, i) {
      var nm = s.fullName || (job.wingShips || [])[i]; if (!nm) return;
      var e = { date: entry.date, time: entry.time, station: "squadron", classId: job.classId, n: job.n, tl: job.tl, ship: nm, hull: hullOf(c, { ship: nm, classId: job.classId }),
        seed: job.seed, outcome: s.left ? "leftBehind" : s.hull <= 0 ? "destroyed" : r.outcome, score: null, rep: 0, serious: job.serious };
      logService(c, e, { detail: { kills: s.kills, hullLost: s.hullLost } });
      if (s.left || s.hull <= 0) retireShip(c, e);
    });
    generateOffers(c, job.station);
    refreshCommand(c);
    return report;
  }

  /* ------------------------------------------------------- The admiral path
     Level L (3 to 9, F3 to F8 and G9) has the class of the same number at the top of its fleet
     (destroyer escort 3 ... dreadnought 9). It opens with BL.CAPTAINS.opens successful squadron
     missions on that class and, above F3, the level below stepped up from; the offer stays open
     however many more squadron missions he flies first. */
  function admiralNeeds(c, L) {
    var A = c.admiral, out = [], cls = BL.classByN(L);
    if (squadronWins(c, L) < BL.CAPTAINS.opens) out.push(BL.CAPTAINS.opens + " successful " + cls.name.toLowerCase() + " squadron missions (" + squadronWins(c, L) + " so far)");
    if (L > 3 && !A.closed[L - 1]) out.push("a successful command of the " + admiralTitle(L - 1).fleet);
    return out;
  }
  // (fleet: what the player sees, no level codes: Commodore, Third Fleet; Admiral, Fourth Fleet to
  // Eighth Fleet; Grand Admiral, Grand Fleet: TexasBont, Nov 8, 2026)
  var FLEET_NO = { 3: "Third", 4: "Fourth", 5: "Fifth", 6: "Sixth", 7: "Seventh", 8: "Eighth" };
  function fleetName(L) { return L >= 9 ? "Grand Fleet" : FLEET_NO[L] + " Fleet"; }
  function admiralTitle(L) {
    var who = L === 9 ? "Grand Admiral" : L === 3 ? "Commodore" : "Admiral";
    return { short: (L === 9 ? "G" : "F") + L, name: L === 9 ? "Grand Admiral" : L === 3 ? "Fleet Commodore" : "Fleet Admiral", who: who, fleet: fleetName(L), full: who + ", " + fleetName(L) };
  }
  // The level he's at now (F3 once it opens), or 0.
  function admiralLevel(c) {
    var A = c.admiral;
    if (!A.at && !admiralNeeds(c, 3).length) A.at = 3;
    return A.at;
  }
  // His next campaign: { level, open, needs, requal, have, need, banked } (level 0: none yet; done:
  // G9 is over).
  function admiralOffer(c) {
    var A = c.admiral, L = admiralLevel(c) || 3, needs = admiralNeeds(c, L), requal = !!A.closed[L] && L < 9;
    return { level: L, title: admiralTitle(L), open: !needs.length && !A.won && !A.warLost, needs: needs, requal: requal,
      have: requal ? A.rq[L] || 0 : A.pts[L] || 0, need: L, banked: A.banked, done: A.won || A.warLost, won: A.won };
  }
  function admiralRank(c) {
    var A = c.admiral;
    if (A.won) return "Grand Admiral (the war is won)";
    return admiralLevel(c) ? admiralTitle(A.at).full : "Admiral: none yet";
  }
  /* His fleet (TexasBont, Nov 7, 2026): for each ship, a veteran first (a ship of that class from
     his earlier missions, on any path, still in service), else a new ship, her tech level by the
     odds his squadron reputation sets (ADM_TL); new ships take the class's names while the name
     lists last, then numbered hulls. Returns pick(classId) -> { name, hull, tl, vet }. */
  var ADM_TL = [{ upTo: 39, odds: [0.6, 0.3, 0.1] }, { upTo: 70, odds: [0.3, 0.45, 0.25] }, { upTo: Infinity, odds: [0.1, 0.4, 0.5] }];
  // (flag: one of his own ships of the fleet's top class, chosen on the orders, to fly his flag)
  function admiralPicker(c, seed, flag) {
    var rng = BL.rng(seed || 1), vets = {}, used = {}, numbered = {}, rep = c.stations.squadron.rep;
    Object.keys(c.ships).forEach(function (k) {
      var s = c.ships[k]; if (s.lost || s.classId === "gunboat") return;
      (vets[s.classId] = vets[s.classId] || []).push(s);
      used[s.name] = true;
    });
    Object.keys(vets).forEach(function (k) { vets[k].sort(function () { return rng.next() - 0.5; }); });
    Object.keys(c.ships).forEach(function (k) { if (c.ships[k].lost) used[c.ships[k].name] = used[c.ships[k].name] || false; });
    var odds = ADM_TL.filter(function (b) { return rep <= b.upTo; })[0].odds;
    if (flag && vets[flag.classId]) vets[flag.classId] = vets[flag.classId].filter(function (s) { return s.name !== flag.ship; });
    return function (classId) {
      if (flag && classId === flag.classId) { var f = flag; flag = null; return { name: f.ship, hull: f.hull, tl: f.tl, vet: true }; }
      var v = (vets[classId] || []).shift();
      if (v) return { name: v.name, hull: v.hull || BL.hullNumber(classId, v.name), tl: v.tl, vet: true };
      var x = rng.next(), tl = x < odds[0] ? 5 : x < odds[0] + odds[1] ? 6 : 7;
      var free = {}; Object.keys(used).forEach(function (n) { if (used[n]) free[n] = true; });
      var nm = BL.shipName(rng, classId, tl, free);
      if (!free[nm]) { used[nm] = true; return { name: nm, hull: (c.hulls && c.hulls[nm]) || BL.hullNumber(classId, nm), tl: tl }; }
      var k = numbered[classId] = (numbered[classId] || 1000) + 1;
      return { name: null, hull: BL.HULL_CODES[classId] + "-" + k, tl: tl };
    };
  }
  /* A campaign's result (admirals.js Campaign.result): points banked (or a requal's), reputation,
     stepping up at the level's number of points, two campaigns with no points at a level sending
     him back two levels; G9 is one strike. Every named ship gets her service record; one lost is
     retired. */
  var ADM_REP = { success: 1, objective: 1, failure: -1, annihilated: -2 };
  function applyAdmiral(c, r) {
    var A = c.admiral, L = r.level, requal = !!A.closed[L] && L < 9, success = r.points > 0, report = { level: L, points: r.points, requal: requal };
    var parts = [];
    if (success) { parts.push(["campaign scored", ADM_REP.success]); if (r.objective) parts.push(["objective taken", ADM_REP.objective]); }
    else parts.push(r.annihilated ? ["fleet lost", ADM_REP.annihilated] : ["no points", ADM_REP.failure]);
    var was = A.rep; A.rep = Math.max(0, A.rep + parts.reduce(function (a, p) { return a + p[1]; }, 0));
    report.rep = A.rep - was; report.repParts = parts;
    A.campaigns++;
    if (L === 9) {
      if (r.objective) A.won = true; else A.warLost = true;      // (never said to him: TexasBont, Nov 7, 2026)
    } else if (requal) {
      A.rq[L] = (A.rq[L] || 0) + r.points; report.have = A.rq[L];
      if (A.rq[L] >= L) { A.rq[L] = 0; A.at = L + 1; report.promoted = L + 1; }
    } else {
      A.pts[L] = (A.pts[L] || 0) + r.points; A.banked += r.points; report.have = A.pts[L];
      if (A.pts[L] >= L) { A.closed[L] = true; A.at = L + 1; report.promoted = L + 1; }
    }
    if (success) A.failures[L] = 0;
    else if (L < 9) {
      A.failures[L] = (A.failures[L] || 0) + 1; report.failures = A.failures[L];
      if (A.failures[L] >= 2) {
        A.failures[L] = 0;
        var back = Math.max(3, L - 2);
        if (back < L) { for (var k = back; k <= L; k++) A.rq[k] = 0; A.at = back; report.demoted = back; }
      }
    }
    report.banked = A.banked;
    var entry = { date: today(), time: now(), station: "admiral", classId: BL.classByN(L).id, n: L, tl: null, ship: admiralTitle(L).short + " campaign", hull: "",
      seed: r.seed, outcome: r.objective ? "success" : success ? "partial" : r.annihilated ? "destroyed" : "failure", score: r.points, rep: report.rep, serious: !requal };
    // (an admiral's level is earned when its fleet is closed and he moves up; G9 when the war is won)
    if (A.closed[L] && report.promoted === L + 1 && !requal) markQual(c, "admiral", L, entry);
    if (L === 9 && A.won) markQual(c, "admiral", 9, entry);
    c.history.unshift(entry);
    if (c.history.length > 1000) c.history.length = 1000;
    (r.ships || []).forEach(function (s) {
      var e = { date: entry.date, time: entry.time, station: "admiral", classId: s.classId, n: BL.classById(s.classId).n, tl: s.tl, ship: s.name, hull: s.hull, seed: r.seed,
        outcome: s.lost ? "destroyed" : entry.outcome, score: null, rep: 0, serious: !requal };
      logService(c, e, {});
      if (s.lost) retireShip(c, e);
    });
    return report;
  }

  /* ------------------------------------------------------ Rapid sign-offs
     Qualified on class N at any station, you hold N - 2 sign-offs in total. Each qualifies you
     at another station on its next class, as long as that class is no higher than N - 2 and
     built for that station. No reputation, and never to win back a class lost to failures. */
  function signoffOptions(c) {
    var top = highestClass(c), out = [];
    if (signoffsHeld(c) <= 0) return out;
    CREW.forEach(function (s) {
      var st = c.stations[s], n = st.qualified + 1;
      if (!PLAYABLE[s] || n > top - 2 || !built(s, n) || n <= (st.realUntil || 0)) return;
      out.push({ station: s, n: n });
    });
    return out;
  }
  function spendSignoff(c, station, n) {
    var ok = signoffOptions(c).some(function (o) { return o.station === station && o.n === n; });
    if (!ok) return false;
    c.stations[station].qualified = n;
    c.signoffsUsed.push({ station: station, n: n, date: today() });
    markQual(c, station, n, { date: today(), time: now(), signoff: true });
    generateOffers(c, station);
    refreshCommand(c);
    return true;
  }

  /* Service records: one per ship, kept for the whole career (never trimmed). Each mission
     aboard adds an entry: who served, at which station, how it went and what the ship took. */
  // Keyed by name; a later ship of the same name (new hull number) adds its hull number to the key.
  function recKey(h) { return h.ship + (h.hull && h.hull !== BL.hullNumber(h.classId, h.ship) ? " " + h.hull : ""); }
  function logService(c, h, r) {
    var key = recKey(h), rec = c.ships[key];
    if (!rec) rec = c.ships[key] = { name: h.ship, hull: h.hull || "", classId: h.classId, n: h.n, tl: h.tl, firstServed: h.date, missions: [] };
    var d = r.detail || {};
    rec.missions.push({ date: h.date, time: h.time, hero: c.name, station: h.station, seed: h.seed, outcome: h.outcome, score: h.score,
      rep: h.rep, serious: h.serious, kills: d.kills, hullLost: d.hullLost, jumpsOnTime: d.jumpsOnTime,
      encounters: (r.jumps || []).map(function (j) { return j.encounter; }), damageReports: (r.damage || []).length });
    rec.lastServed = h.date;
  }
  function serviceRecord(c, ship) { return c.ships[ship] || null; }

  // Reputation profile factors for one station, 0..1 each, shown as slider bars.
  function profile(c, station) {
    var p = c.profiles[station || "engineer"] || blankProfile(), flown = p.wins + p.losses;
    return {
      aggression: p.aggression,
      winloss: flown ? p.wins / flown : 0,
      efficiency: p.efficiency,
      demands: p.demands,
      condition: p.condition,
      guns: p.guns || 0,
      delegation: p.delegation === undefined ? 1 : p.delegation
    };
  }

  BL.career = {
    STATIONS: STATIONS, CREW: CREW, STATION_NAME: STATION_NAME, PLAYABLE: PLAYABLE, built: built, canCommand: canCommand, commandNeeds: commandNeeds,
    create: create, save: save, load: load, normalize: normalize,
    fileName: fileName, exportText: exportText, importText: importText,
    qualified: qualified, rank: rank, ranks: ranks, targetClass: targetClass,
    signoffsTotal: signoffsTotal, signoffsHeld: signoffsHeld, signoffOptions: signoffOptions, spendSignoff: spendSignoff,
    offers: offers, generateOffers: generateOffers, lowerJobs: lowerJobs, repFor: repFor, REP: REP,
    applyResult: applyResult, profile: profile, serviceRecord: serviceRecord,
    squadronOpen: squadronOpen, squadronWins: squadronWins, squadronClasses: squadronClasses, commandWins: commandWins, commandDone: commandDone, brass: brass, brassName: brassName,
    storyComplete: storyComplete, storyLeft: storyLeft,
    admiralOffer: admiralOffer, admiralRank: admiralRank, admiralNeeds: admiralNeeds, admiralTitle: admiralTitle, admiralPicker: admiralPicker, pastShips: pastShips, setJobShip: setJobShip, applyAdmiral: applyAdmiral, ADM_TL: ADM_TL
  };
})(typeof window !== "undefined" ? window : globalThis);
