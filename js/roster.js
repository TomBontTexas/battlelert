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

  // A first and a last name (BL.GUNNERY.engineer, Dallas–Fort Worth names) that no man in men has.
  function newName(men, rng) {
    var E = BL.GUNNERY.engineer, tf = {}, tl = {};
    men.forEach(function (m) { tf[m.first] = true; tl[m.last] = true; });
    var fs = E.first.filter(function (n) { return !tf[n]; }), ls = E.last.filter(function (n) { return !tl[n]; });
    return { first: rng.pick(fs.length ? fs : E.first), last: rng.pick(ls.length ? ls : E.last) };
  }
  // A new man for the pool; no man already in it shares his first name or his last name.
  function newMan(cr, rng, post, skill) {
    var n = newName(cr.men, rng);
    var man = { id: cr.nextId++, post: post, first: n.first, last: n.last, skill: r2(skill), temper: rng.pick(TEMPERS),
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
  // (names: 2 = the Dallas–Fort Worth names; older pools are renamed once, every man unique.)
  function ensure(c) {
    if (c.crew && c.crew.men) {
      if (c.crew.names !== 2) {
        var nr = BL.rng(((c.offerSeed || 1) ^ 0x7f4a7c15) >>> 0 || 1), done = [];
        c.crew.men.forEach(function (m) { var n = newName(done, nr); m.first = n.first; m.last = n.last; done.push(m); });
        c.crew.names = 2;
      }
      return c.crew;
    }
    var R = BL.ROSTER, rng = BL.rng(((c.offerSeed || 1) ^ 0x3c6ef372) >>> 0 || 1);
    var cr = c.crew = { men: [], nextId: 1, kia: [], last: null, names: 2 };
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

  /* Will he sign on with this captain for this job? (Crew refusals, Nov 2, 2026.) Asked once per
     job (job.asked); the same job asks the same dice. A man who served with him last time stays
     on, unless his morale is below BL.ROSTER.sign.stay; anyone else rolls: the captain's d100 +
     his command reputation against the man's d100 + skill - (morale - 50) / 5; the captain must
     roll higher. The dice and their parts are kept in job.rolls for the crew screen. */
  function aboardLast(c, id) { var l = ensure(c).last || {}; return l.engineer === id || l.pilot === id || (l.guns || []).indexOf(id) >= 0; }
  function roll(c, job, m) {
    var S = BL.ROSTER.sign;
    if (aboardLast(c, m.id) && m.morale >= S.stay) return { stay: true, ok: true };
    var rng = BL.rng(((job.seed * 31 + m.id * 7919) ^ 0x2545f491) >>> 0 || 1);
    var r = { capRoll: rng.int([1, 100]), rep: c.stations.captain.rep || 0, hisRoll: rng.int([1, 100]), skill: Math.round(m.skill * 100), mor: Math.round((m.morale - 50) / S.morale * 10) / 10 };
    r.cap = r.capRoll + r.rep; r.him = Math.round((r.hisRoll + m.skill * 100 - (m.morale - 50) / S.morale) * 10) / 10;
    r.ok = r.cap > r.him;
    return r;
  }
  function willSign(c, job, m) {
    var asked = job.asked = job.asked || {}, rolls = job.rolls = job.rolls || {};
    if (asked[m.id] !== undefined) return asked[m.id];
    var r = rolls[m.id] = roll(c, job, m);
    return (asked[m.id] = r.ok);
  }
  // A man's roll for the crew screen: as kept, or (jobs asked before the rolls were kept) the same
  // dice again from the job's seed. A yes the dice don't give was a green hire. null: not asked yet.
  function rollOf(c, job, id) {
    var a = (job.asked || {})[id], m = man(c, id);
    if (a === undefined || !m) return null;
    var r = (job.rolls || {})[id];
    if (r) return r;
    r = roll(c, job, m);
    return r.ok === a ? r : a ? { hire: true } : r;
  }
  /* The crew a job suggests: the men who served with the captain last time first, then the best
     available whose skill fits the class (then anyone left). sign: only men who sign on (willSign);
     if every man at a post refuses, a green new hire joins the pool and signs on.
     { engineer: id, pilot: id, guns: [id, ...] } */
  function suggest(c, job, sign) {
    var cr = ensure(c), used = {}, last = cr.last || {}, hireRng = null;
    function pick(post, lastId) {
      var lm = lastId && man(c, lastId), pool = cr.men.filter(function (m) { return m.post === post && !used[m.id]; }).sort(function (a, b) { return b.skill - a.skill || a.id - b.id; });
      var order = (lm && lm.post === post && !used[lm.id] && fits(lm, job.classId) ? [lm] : [])
        .concat(pool.filter(function (m) { return m !== lm && fits(m, job.classId); }), pool.filter(function (m) { return m !== lm && !fits(m, job.classId); }));
      for (var i = 0; i < order.length; i++) if (!sign || willSign(c, job, order[i])) { used[order[i].id] = true; return order[i].id; }
      if (!sign) return null;
      hireRng = hireRng || BL.rng((job.seed ^ 0x51633e2d) >>> 0 || 1);
      var g = newMan(cr, hireRng, post, hireRng.range(BL.ROSTER.hire));
      (job.asked = job.asked || {})[g.id] = true; (job.rolls = job.rolls || {})[g.id] = { hire: true }; used[g.id] = true;
      return g.id;
    }
    var out = { engineer: pick("engineer", last.engineer), pilot: pick("pilot", last.pilot), guns: [] };
    for (var i = 0; i < gunCount(job.classId); i++) out.guns.push(pick("gun", (last.guns || [])[i]));
    return out;
  }
  // The job's crew: what the captain picked on the crew screen (job.crewIds), else the suggestion;
  // any man since lost is replaced by the suggestion's. sign: as suggest.
  function crewOf(c, job, sign) {
    var s = suggest(c, job, sign), p = job.crewIds;
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
     survivors gain skill and morale (or lose morale; a man whose station the captain took loses
     one more), and their records grow.
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
      // (dropping down: the captain took his station, once a mission)
      if (r.captain && (r.captain.replaced || []).indexOf(m.id) >= 0) m.morale = Math.round(clamp(m.morale + R.morale.replaced, 0, 100));
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
    forMission: forMission, available: available, willSign: willSign, rollOf: rollOf,afterMission: afterMission, gunCount: gunCount, fits: fits };
})(typeof window !== "undefined" ? window : globalThis);
