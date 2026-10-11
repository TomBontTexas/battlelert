/* Battlelert career record: qualifications, reputation, failures, rapid sign-offs,
   reputation profile, mission history and the current job offers.
   Pure JavaScript (no screen code). Saved in browser storage; exported as
   BATTLELERT_<hero name>.json. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var KEY = BL.APP_TAG + "_career";
  var STATIONS = ["engineer", "gunner", "pilot"];
  var STATION_NAME = { engineer: "Engineer", gunner: "Gunner", pilot: "Pilot" };
  var PLAYABLE = { engineer: true };               // stations built so far
  var SHIP_NAMES = ["Resolute", "Valiant", "Tenacity", "Harrier", "Vigilant", "Defiance", "Endeavour", "Swift", "Intrepid",
    "Bulwark", "Corsair", "Sentinel", "Audacious", "Kestrel", "Warden", "Relentless", "Lancer", "Indomitable", "Petrel",
    "Stalwart", "Fearless", "Merlin", "Paladin", "Gallant", "Steadfast", "Osprey", "Talon", "Courageous", "Ranger", "Archer"];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  function cleanName(name) { return String(name || "").replace(/\s+/g, " ").trim().slice(0, 24); }

  function create(name) {
    var c = {
      app: BL.APP_TAG, kind: "career", format: 1,
      name: cleanName(name) || "Recruit", created: today(),
      stations: {}, signoffsUsed: [],
      profile: { missions: 0, wins: 0, losses: 0, aggression: 0, efficiency: 0, demands: 0, condition: 0 },
      history: [], offers: [], offerSeed: BL.randomSeed(), offersSinceStepUp: 0
    };
    STATIONS.forEach(function (s) { c.stations[s] = { qualified: 0, rep: 0, failures: {} }; });
    generateOffers(c);
    return c;
  }

  function save(c) {
    try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; }
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); return raw ? normalize(JSON.parse(raw)) : null; } catch (e) { return null; }
  }

  // Fill in anything an older or hand-edited file is missing, so it never breaks the game.
  function normalize(c) {
    if (!c || c.kind !== "career") throw new Error("This file isn't a Battlelert career.");
    var fresh = create(c.name);
    fresh.offers = [];
    Object.keys(fresh).forEach(function (k) { if (c[k] === undefined) c[k] = fresh[k]; });
    STATIONS.forEach(function (s) {
      var st = c.stations[s] = c.stations[s] || {};
      st.qualified = clamp(+st.qualified || 0, 0, 9);
      st.rep = isFinite(+st.rep) ? Math.max(0, +st.rep) : 0;
      st.failures = st.failures || {};
    });
    ["missions", "wins", "losses", "aggression", "efficiency", "demands", "condition"].forEach(function (k) {
      if (!isFinite(+c.profile[k])) c.profile[k] = 0;
    });
    c.name = cleanName(c.name) || "Recruit";
    if (!Array.isArray(c.offers) || !c.offers.length) generateOffers(c);
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
  function rank(c, station) {
    var q = qualified(c, station);
    return q ? STATION_NAME[station] + "-" + q : "Recruit";
  }
  function highestClass(c) { return Math.max.apply(null, STATIONS.map(function (s) { return c.stations[s].qualified; })); }
  function signoffsTotal(c) { return Math.max(0, highestClass(c) - 2); }
  function signoffsHeld(c) { return signoffsTotal(c) - c.signoffsUsed.length; }
  // The class a station is working toward: the one above its qualification (class 1 to start).
  function targetClass(c, station) { return Math.min(9, qualified(c, station) + 1); }

  /* ------------------------------------------------------------ Offers
     Generic postings for now (Phase 2): a ship class, a tech level and a ship name.
     Always at least one tech-level-1 offer for your current class; offers from the class
     above appear once you're qualified, more often as your reputation grows. */
  function makeJob(rng, station, n, tl, serious) {
    var cls = BL.classByN(n);
    return { id: "j" + Math.floor(rng.next() * 1e9).toString(36), station: station, classId: cls.id, n: n, tl: tl,
      ship: "TFS " + rng.pick(SHIP_NAMES), seed: 1 + Math.floor(rng.next() * 999999), serious: serious !== false };
  }
  function generateOffers(c) {
    var rng = BL.rng(c.offerSeed = (c.offerSeed * 48271 + 11) % 2147483647 || 1);
    var station = "engineer", q = qualified(c, station), offers = [];
    var current = Math.max(1, q);
    if (!BL.classByN(current).built) current = 1;
    offers.push(makeJob(rng, station, current, 1));
    var extra = rng.int([1, 2]);
    for (var i = 0; i < extra; i++) offers.push(makeJob(rng, station, current, rng.int([2, 6])));
    var next = BL.classByN(q + 1);
    if (q >= 1 && next && next.built) {
      var rep = c.stations[station].rep;
      var chance = clamp(0.45 + rep / (3 * next.baseRep), 0.45, 0.95);
      if (rng.chance(chance) || c.offersSinceStepUp >= 2) {
        var k = rng.int([1, 2]);
        for (var j = 0; j < k; j++) offers.push(makeJob(rng, station, next.n, rng.int([1, 6])));
        c.offersSinceStepUp = 0;
      } else c.offersSinceStepUp++;
    }
    offers.sort(function (a, b) { return b.n - a.n || a.tl - b.tl; });
    c.offers = offers;
    return offers;
  }
  // Jobs below your current class: always available, never serious offers.
  function lowerJobs(c, station) {
    var q = qualified(c, station), out = [];
    var rng = BL.rng(c.offerSeed + 7);
    for (var n = 1; n < q; n++) {
      if (!BL.classByN(n).built) continue;
      for (var tl = 1; tl <= 6; tl++) out.push(makeJob(rng, station, n, tl, false));
    }
    return out;
  }
  function repFor(job, scorePct) {
    return Math.round(BL.classByN(job.n).baseRep * (scorePct / 100) * BL.TECH.repMult(job.tl));
  }

  /* ------------------------------------------------------- Mission result
     Success earns reputation on that path and qualifies you on the class.
     Any two failures at a post (station + class) send you back one class, where you
     requalify with a real mission. Failures on jobs below your class don't count. */
  function applyResult(c, job, r) {
    var st = c.stations[job.station], post = job.n, before = st.qualified;
    var report = { rep: 0, qualifiedBefore: before, qualifiedAfter: before, promoted: false, demoted: false, failuresAtPost: 0,
      profileBefore: profile(c) };
    var success = r.outcome === "success";
    if (success) {
      report.rep = repFor(job, r.score);
      st.rep += report.rep;
      st.failures[post] = 0;
      if (post > st.qualified) { st.qualified = post; report.promoted = true; }
    } else if (post >= st.qualified) {
      st.failures[post] = (st.failures[post] || 0) + 1;
      report.failuresAtPost = st.failures[post];
      if (st.failures[post] >= 2) {
        st.failures[post] = 0;
        var back = Math.max(0, Math.min(st.qualified, post - 2));
        if (back < st.qualified) { st.qualified = back; report.demoted = true; }
        report.sentBack = true;
      }
    }
    report.qualifiedAfter = st.qualified;
    // Rapid sign-offs held can't exceed what the new top class allows.
    while (c.signoffsUsed.length > signoffsTotal(c)) c.signoffsUsed.pop();
    // Reputation profile: running averages over every mission flown.
    var p = c.profile, n = p.missions;
    function avg(old, v) { return (old * n + v) / (n + 1); }
    p.aggression = avg(p.aggression, r.aggression || 0);
    p.efficiency = avg(p.efficiency, r.detail.efficiencyPct / 100);
    p.demands = avg(p.demands, r.parts.demands / 25);
    p.condition = avg(p.condition, r.parts.condition / 25);
    p.missions = n + 1;
    if (success) p.wins++; else p.losses++;
    report.profileAfter = profile(c);
    c.history.unshift({ date: today(), station: job.station, classId: job.classId, n: job.n, tl: job.tl, ship: job.ship,
      seed: job.seed, outcome: r.outcome, score: r.score, rep: report.rep, serious: job.serious });
    if (c.history.length > 200) c.history.length = 200;
    generateOffers(c);
    return report;
  }

  // Reputation profile factors, 0..1 each, shown as slider bars.
  function profile(c) {
    var p = c.profile, flown = p.wins + p.losses;
    return {
      aggression: p.aggression,
      winloss: flown ? p.wins / flown : 0,
      efficiency: p.efficiency,
      demands: p.demands,
      condition: p.condition
    };
  }

  BL.career = {
    STATIONS: STATIONS, STATION_NAME: STATION_NAME, PLAYABLE: PLAYABLE,
    create: create, save: save, load: load, normalize: normalize,
    fileName: fileName, exportText: exportText, importText: importText,
    qualified: qualified, rank: rank, targetClass: targetClass,
    signoffsTotal: signoffsTotal, signoffsHeld: signoffsHeld,
    generateOffers: generateOffers, lowerJobs: lowerJobs, repFor: repFor,
    applyResult: applyResult, profile: profile
  };
})(typeof window !== "undefined" ? window : globalThis);
