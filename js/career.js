/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert career record: qualifications, reputation, failures, rapid sign-offs,
   reputation profile, mission history, the current job offers and every ship's service record.
   Pure JavaScript (no screen code). Saved in browser storage; exported as
   BATTLELERT_<hero name>.json. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var KEY = BL.APP_TAG + "_career";
  var STATIONS = ["engineer", "gunner", "pilot"];
  var STATION_NAME = { engineer: "Engineer", gunner: "Gunner", pilot: "Pilot" };
  var PLAYABLE = { engineer: true, gunner: true }; // stations built so far
  var GUNNER_CLASSES = 5;                          // the gunner station is built up to this class
  // Is this class built for this station? (The engine room runs on every built class.)
  function built(station, n) {
    var cls = BL.classByN(n);
    if (!cls || !PLAYABLE[station]) return false;
    return station === "gunner" ? n <= GUNNER_CLASSES : !!cls.built;
  }
  function blankProfile() { return { missions: 0, wins: 0, losses: 0, aggression: 0, efficiency: 0, demands: 0, condition: 0 }; }

  var NAMES_VERSION = 2;                           // 2 = the historical ship roster (names.js)

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  function cleanName(name) { return String(name || "").replace(/\s+/g, " ").trim().slice(0, 24); }

  function create(name) {
    var c = {
      app: BL.APP_TAG, kind: "career", format: 1,
      name: cleanName(name) || "Recruit", created: today(),
      stations: {}, signoffsUsed: [],
      profiles: {},                     // one reputation profile per station
      history: [], offersBy: {}, stepUps: {}, offerSeed: BL.randomSeed(),
      ships: {}, namesVersion: NAMES_VERSION
    };
    STATIONS.forEach(function (s) { c.stations[s] = { qualified: 0, rep: 0, failures: {}, realUntil: 0 }; c.profiles[s] = blankProfile(); c.stepUps[s] = 0; });
    STATIONS.forEach(function (s) { if (PLAYABLE[s]) generateOffers(c, s); });
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
    var oldNames = c.namesVersion !== NAMES_VERSION;   // checked before the defaults below fill it in
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
      st.rep = isFinite(+st.rep) ? Math.max(0, +st.rep) : 0;
      st.failures = st.failures || {};
      st.realUntil = +st.realUntil || 0;
      var p = c.profiles[s] = c.profiles[s] || blankProfile();
      Object.keys(blankProfile()).forEach(function (k) { if (!isFinite(+p[k])) p[k] = 0; });
      if (!isFinite(+c.stepUps[s])) c.stepUps[s] = 0;
    });
    if (!Array.isArray(c.signoffsUsed)) c.signoffsUsed = [];
    c.name = cleanName(c.name) || "Recruit";
    if (!c.ships || typeof c.ships !== "object") c.ships = {};
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
    });
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
  // The best rank held, for the title screen: "Engineer-4", or "Engineer-4 · Gunner-1".
  function ranks(c) {
    var held = STATIONS.filter(function (s) { return qualified(c, s) > 0; }).map(function (s) { return rank(c, s); });
    return held.length ? held.join(" · ") : "Recruit";
  }
  function signoffsTotal(c) { return Math.max(0, highestClass(c) - 2); }
  function signoffsHeld(c) { return signoffsTotal(c) - c.signoffsUsed.length; }
  // The class a station is working toward: the one above its qualification (class 1 to start).
  function targetClass(c, station) { return Math.min(9, qualified(c, station) + 1); }

  /* ------------------------------------------------------------ Offers
     Generic postings for now: a ship class, a tech level and a ship name; one list per station.
     Always a tech-level-1 offer for the class you're on and, once you're qualified, one
     for the class above; more offers from the class above come as reputation grows.
     A gunner job names the engineer you'd serve with (the same one the mission will roll). */
  function makeJob(rng, station, n, tl, serious) {
    var cls = BL.classByN(n);
    var job = { id: "j" + Math.floor(rng.next() * 1e9).toString(36), station: station, classId: cls.id, n: n, tl: tl,
      ship: BL.shipName(rng, cls.id, tl), seed: 1 + Math.floor(rng.next() * 999999), serious: serious !== false };
    if (station === "gunner") { job.weapons = (BL.GUNNERY.loadout[cls.id] || ["pulse"]).slice(); if (BL.pickEngineer) job.engineer = BL.pickEngineer(job.seed, cls.id); }
    return job;
  }
  function offers(c, station) { return c.offersBy[station] || []; }
  function generateOffers(c, station) {
    station = station || "engineer";
    var rng = BL.rng(c.offerSeed = (c.offerSeed * 48271 + 11) % 2147483647 || 1);
    var q = qualified(c, station), offers = [];
    var current = Math.max(1, q);
    if (!built(station, current)) current = Math.min(current, station === "gunner" ? GUNNER_CLASSES : current);
    if (!built(station, current)) current = 1;
    offers.push(makeJob(rng, station, current, 1));
    var extra = rng.int([1, 2]);
    for (var i = 0; i < extra; i++) offers.push(makeJob(rng, station, current, rng.int([2, 6])));
    var next = BL.classByN(q + 1);
    if (q >= 1 && next && built(station, next.n)) {
      offers.push(makeJob(rng, station, next.n, 1));
      var rep = c.stations[station].rep;
      var chance = clamp(0.45 + rep / (3 * next.baseRep), 0.45, 0.95);
      if (rng.chance(chance) || c.stepUps[station] >= 2) {
        offers.push(makeJob(rng, station, next.n, rng.int([2, 6])));
        c.stepUps[station] = 0;
      } else c.stepUps[station] = (c.stepUps[station] || 0) + 1;
    }
    offers.sort(function (a, b) { return b.n - a.n || a.tl - b.tl; });
    c.offersBy[station] = offers;
    return offers;
  }
  // Careers saved before the step-up rule may lack the guaranteed tech-level-1 offer.
  function ensureStepUp(c, station) {
    var q = qualified(c, station), next = BL.classByN(q + 1), list = offers(c, station);
    if (q < 1 || !next || !built(station, next.n)) return;
    var has = list.some(function (o) { return o.n === next.n && o.tl === 1; });
    if (!has) {
      list.push(makeJob(BL.rng(c.offerSeed + 3), station, next.n, 1));
      list.sort(function (a, b) { return b.n - a.n || a.tl - b.tl; });
    }
  }

  // Jobs below your current class: always available, never serious offers.
  function lowerJobs(c, station) {
    var q = qualified(c, station), out = [];
    var rng = BL.rng(c.offerSeed + 7);
    for (var n = 1; n < q; n++) {
      if (!built(station, n)) continue;
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
    var p = c.profiles[job.station] = c.profiles[job.station] || blankProfile(), n = p.missions;
    report.profileBefore = profile(c, job.station);
    function avg(old, v) { return (old * n + v) / (n + 1); }
    var gun = job.station === "gunner";
    p.aggression = avg(p.aggression, r.aggression || 0);
    p.efficiency = avg(p.efficiency, gun ? (r.gunner ? r.gunner.accuracyPct : 0) / 100 : r.detail.efficiencyPct / 100);
    p.demands = avg(p.demands, (gun ? r.parts.threats : r.parts.demands) / 25);
    p.condition = avg(p.condition, r.parts.condition / 25);
    p.missions = n + 1;
    if (success) p.wins++; else p.losses++;
    report.profileAfter = profile(c, job.station);
    var entry = { date: today(), station: job.station, classId: job.classId, n: job.n, tl: job.tl, ship: job.ship,
      seed: job.seed, outcome: r.outcome, score: r.score, rep: report.rep, serious: job.serious };
    c.history.unshift(entry);
    if (c.history.length > 200) c.history.length = 200;
    logService(c, entry, r);
    generateOffers(c, job.station);
    return report;
  }

  /* ------------------------------------------------------ Rapid sign-offs
     Qualified on class N at any station, you hold N - 2 sign-offs in total. Each qualifies you
     at another station on its next class, as long as that class is no higher than N - 2 and
     built for that station. No reputation, and never to win back a class lost to failures. */
  function signoffOptions(c) {
    var top = highestClass(c), out = [];
    if (signoffsHeld(c) <= 0) return out;
    STATIONS.forEach(function (s) {
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
    generateOffers(c, station);
    return true;
  }

  /* Service records: one per ship, kept for the whole career (never trimmed). Each mission
     aboard adds an entry: who served, at which station, how it went and what the ship took. */
  function logService(c, h, r) {
    var rec = c.ships[h.ship];
    if (!rec) rec = c.ships[h.ship] = { name: h.ship, classId: h.classId, n: h.n, tl: h.tl, firstServed: h.date, missions: [] };
    var d = r.detail || {};
    rec.missions.push({ date: h.date, hero: c.name, station: h.station, seed: h.seed, outcome: h.outcome, score: h.score,
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
      condition: p.condition
    };
  }

  BL.career = {
    STATIONS: STATIONS, STATION_NAME: STATION_NAME, PLAYABLE: PLAYABLE, built: built,
    create: create, save: save, load: load, normalize: normalize,
    fileName: fileName, exportText: exportText, importText: importText,
    qualified: qualified, rank: rank, ranks: ranks, targetClass: targetClass,
    signoffsTotal: signoffsTotal, signoffsHeld: signoffsHeld, signoffOptions: signoffOptions, spendSignoff: spendSignoff,
    offers: offers, generateOffers: generateOffers, lowerJobs: lowerJobs, repFor: repFor,
    applyResult: applyResult, profile: profile, serviceRecord: serviceRecord
  };
})(typeof window !== "undefined" ? window : globalThis);
