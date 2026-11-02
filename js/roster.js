/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* The captain's crew roster (Captain path, stage 2): one pool of named men per career, made at
   its first Command job, that the captain hires from for every mission. Each man has a skill,
   a temperament, a morale and a service record; skill grows with service; when the ship is
   destroyed each man survives with a chance equal to his skill. Tuning in BL.ROSTER (data.js).
   Pure JavaScript (no screen code); saved in the career file as c.crew. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var POSTS = ["engineer", "pilot", "gun"];
  var POST_NAME = { engineer: "Engineer", pilot: "Pilot", gun: "Gun crew" };
  var TEMPERS = ["cautious", "steady", "aggressive"];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function r2(v) { return Math.round(v * 100) / 100; }
  // Rank and label from skill, as the stations' crews (BL.pickEngineer, BL.pickGunCrew, BL.pickPilot).
  function rankOf(post, s) {
    var G = BL.GUNNERY;
    if (post === "gun") return G.crew.ranks[s >= 0.7 ? 2 : s >= 0.5 ? 1 : 0];
    return (post === "pilot" ? G.pilot : G.engineer).ranks[s >= 0.85 ? 2 : s >= 0.7 ? 1 : 0];
  }
  function labelOf(post, s) {
    if (post === "gun") return s >= 0.7 ? "sharp" : s >= 0.5 ? "steady" : s >= 0.35 ? "green" : "raw";
    return s >= 0.85 ? "sharp" : s >= 0.7 ? "steady" : s >= 0.5 ? "green" : "sloppy";
  }
  function skillRange(post) { return post === "gun" ? BL.GUNNERY.crew.skill : BL.GUNNERY.engineer.skill.other; }

  // A new man for the pool; his first and last names never both match a man already in it.
  function newMan(cr, rng, post, skill) {
    var E = BL.GUNNERY.engineer, taken = {}, first, last, k = 0;
    cr.men.forEach(function (m) { taken[m.first + " " + m.last] = true; });
    do { first = rng.pick(E.first); last = rng.pick(E.last); } while (taken[first + " " + last] && k++ < 200);
    var man = { id: cr.nextId++, post: post, first: first, last: last, skill: r2(skill), temper: rng.pick(TEMPERS),
      morale: BL.ROSTER.morale.start, missions: 0, wins: 0, ships: [], record: [], joined: today() };
    cr.men.push(man);
    return man;
  }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  // Green new hires until every post is back to its pool size.
  function fill(cr, rng) {
    var R = BL.ROSTER, n = 0;
    POSTS.forEach(function (p) {
      while (cr.men.filter(function (m) { return m.post === p; }).length < R.pool[p]) { newMan(cr, rng, p, rng.range(R.hire)); n++; }
    });
    return n;
  }
  // The career's pool, made the first time a Command job needs it (careers from before stage 2 too).
  function ensure(c) {
    if (c.crew && c.crew.men) return c.crew;
    var R = BL.ROSTER, rng = BL.rng(((c.offerSeed || 1) ^ 0x3c6ef372) >>> 0 || 1);
    var cr = c.crew = { men: [], nextId: 1, kia: [], last: null };
    POSTS.forEach(function (p) { for (var i = 0; i < R.pool[p]; i++) newMan(cr, rng, p, rng.range(skillRange(p))); });
    return cr;
  }
  function man(c, id) { var cr = ensure(c); for (var i = 0; i < cr.men.length; i++) if (cr.men[i].id === id) return cr.men[i]; return null; }
  function name(m) { return rankOf(m.post, m.skill) + " " + m.first + " " + m.last; }
  // What the screens show of a man.
  function view(m) {
    return { id: m.id, post: m.post, name: name(m), who: m.first + " " + m.last, last: m.last, skill: m.skill, label: labelOf(m.post, m.skill),
      temper: m.temper, morale: m.morale, missions: m.missions, wins: m.wins, ships: m.ships.slice() };
  }
  // The man as he works in battle: his skill moved by morale (BL.ROSTER.morale.eff), his temperament as a number.
  function inBattle(m) {
    var R = BL.ROSTER, e = R.morale.eff, s = r2(clamp(m.skill * (e[0] + (e[1] - e[0]) * m.morale / 100), 0, 1));
    return { id: m.id, name: name(m), who: m.first + " " + m.last, last: m.last, skill: s, label: labelOf(m.post, s), temperK: R.temper[m.temper], temper: m.temper, morale: m.morale };
  }
  function gunCount(classId) { return (BL.GUNNERY.loadout[classId] || []).length; }
  // Gunboat engineers and pilots come from the better end (GUNNERY.engineer.skill.gunboat), as today.
  function fits(m, classId) { return m.post === "gun" || classId !== "gunboat" || m.skill >= BL.GUNNERY.engineer.skill.gunboat[0]; }

  /* The crew a job suggests: the men who served with the captain last time first, then the best
     available whose skill fits the class (then anyone left). { engineer: id, pilot: id, guns: [id, ...] } */
  function suggest(c, job) {
    var cr = ensure(c), used = {}, last = cr.last || {};
    function pick(post, lastId) {
      var lm = lastId && man(c, lastId);
      if (lm && lm.post === post && !used[lm.id] && fits(lm, job.classId)) { used[lm.id] = true; return lm.id; }
      var pool = cr.men.filter(function (m) { return m.post === post && !used[m.id]; }).sort(function (a, b) { return b.skill - a.skill || a.id - b.id; });
      var best = pool.filter(function (m) { return fits(m, job.classId); })[0] || pool[0];
      if (best) used[best.id] = true;
      return best ? best.id : null;
    }
    var out = { engineer: pick("engineer", last.engineer), pilot: pick("pilot", last.pilot), guns: [] };
    for (var i = 0; i < gunCount(job.classId); i++) out.guns.push(pick("gun", (last.guns || [])[i]));
    return out;
  }
  // The job's crew: what the captain picked on the crew screen (job.crewIds), else the suggestion;
  // any man since lost is replaced by the suggestion's.
  function crewOf(c, job) {
    var s = suggest(c, job), p = job.crewIds;
    if (!p) return s;
    var out = { engineer: man(c, p.engineer) ? p.engineer : s.engineer, pilot: man(c, p.pilot) ? p.pilot : s.pilot, guns: [] };
    for (var i = 0; i < s.guns.length; i++) out.guns.push(p.guns && man(c, p.guns[i]) ? p.guns[i] : s.guns[i]);
    return out;
  }
  // The men for BL.Mission (opts.crew): the engine room, the helm and every gun.
  function forMission(c, ids) {
    function b(id) { var m = man(c, id); return m ? inBattle(m) : null; }
    return { engineer: b(ids.engineer), pilot: b(ids.pilot), guns: ids.guns.map(b) };
  }
  // Men a post can take on the crew screen: everyone at that post, best first.
  function available(c, post) {
    return ensure(c).men.filter(function (m) { return m.post === post; }).sort(function (a, b) { return b.skill - a.skill || a.id - b.id; }).map(view);
  }

  /* After a Command mission: the ship destroyed, each man survives with a chance equal to his
     skill; the dead leave the pool (Killed in action) and green hires take their places. The
     survivors gain skill and morale (or lose morale), and their records grow.
     Returns { lost: [{ name, post }], hired: n }. */
  function afterMission(c, job, r, entry) {
    var cr = ensure(c), R = BL.ROSTER, ids = job.crewUsed;
    if (!ids) return null;
    var rng = BL.rng((job.seed ^ 0x6d2b79f5) >>> 0 || 1), success = r.outcome === "success", sunk = r.outcome === "destroyed";
    var aboard = [["engineer", ids.engineer], ["pilot", ids.pilot]].concat(ids.guns.map(function (id, i) { return ["gun " + (i + 1), id]; }))
      .map(function (x) { return { at: x[0], m: man(c, x[1]) }; }).filter(function (x) { return x.m; });
    var lost = [];
    aboard.forEach(function (x) { x.dead = sunk && !rng.chance(x.m.skill); if (x.dead) lost.push(x); });
    var ship = BL.shipLabel(job.classId, job.ship, job.hull);
    aboard.forEach(function (x) {
      var m = x.m;
      m.record.unshift({ date: entry.date, ship: ship, classId: job.classId, tl: job.tl, at: x.at, outcome: x.dead ? "killed" : r.outcome });
      if (m.record.length > R.record) m.record.length = R.record;
      if (x.dead) return;
      m.missions++; if (success) m.wins++;
      if (m.ships.indexOf(ship) < 0) m.ships.push(ship);
      m.skill = r2(Math.min(R.grow.cap, Math.max(m.skill, m.skill + R.grow.served + (success ? R.grow.success : 0))));
      m.morale = Math.round(clamp(m.morale + (success ? R.morale.success : R.morale.failure) + R.morale.killed * lost.length, 0, 100));
    });
    lost.forEach(function (x) {
      cr.kia.unshift({ name: name(x.m), post: x.m.post, at: x.at, ship: ship, date: entry.date });
      cr.men.splice(cr.men.indexOf(x.m), 1);
    });
    cr.last = { engineer: ids.engineer, pilot: ids.pilot, guns: ids.guns.slice() };
    var hired = fill(cr, rng);
    return { lost: lost.map(function (x) { return { name: name(x.m), at: x.at }; }), hired: hired };
  }

  BL.roster = { POSTS: POSTS, POST_NAME: POST_NAME, ensure: ensure, man: man, view: view, suggest: suggest, crewOf: crewOf,
    forMission: forMission, available: available, afterMission: afterMission, gunCount: gunCount, fits: fits };
})(typeof window !== "undefined" ? window : globalThis);
