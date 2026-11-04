/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* The squadron commander's captains pool (Squadrons, approved Nov 2, 2026): the crew roster
   (roster.js) one level up. One pool per career, by class, made at that class's first squadron
   job: the squadron's size plus BL.CAPTAINS.extra captains. Each captain has a rank (by skill,
   BL.COMMAND.squad.ranks), a skill, a temper, a morale and a service record; skill grows with
   successes; when his ship is lost his chance of surviving is his skill, and a survivor sits out
   the next squadron mission of his class ("awaiting a new ship"). Names come from the
   Dallas–Fort Worth lists, never repeating a first or last name in the pool.
   Pure JavaScript (no screen code); saved in the career file as c.captains. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var TEMPERS = ["cautious", "steady", "aggressive"];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function size(classId) { return BL.COMMAND.squad.size[classId] || 4; }
  function rankOf(s) { var R = BL.COMMAND.squad.ranks; return R[s >= 0.85 ? 2 : s >= 0.65 ? 1 : 0]; }
  function labelOf(s) { return s >= 0.85 ? "sharp" : s >= 0.7 ? "steady" : s >= 0.5 ? "green" : "sloppy"; }

  function all(c) { var P = c.captains, out = []; Object.keys(P.byClass).forEach(function (k) { out = out.concat(P.byClass[k]); }); return out; }
  // A first and a last name no captain in the whole pool has.
  function newName(c, rng) {
    var E = BL.GUNNERY.engineer, tf = {}, tl = {};
    all(c).forEach(function (m) { tf[m.first] = true; tl[m.last] = true; });
    var fs = E.first.filter(function (n) { return !tf[n]; }), ls = E.last.filter(function (n) { return !tl[n]; });
    return { first: rng.pick(fs.length ? fs : E.first), last: rng.pick(ls.length ? ls : E.last) };
  }
  function newCaptain(c, rng, classId, skill) {
    var P = c.captains, n = newName(c, rng);
    var m = { id: P.nextId++, classId: classId, first: n.first, last: n.last, skill: r2(skill), temper: rng.pick(TEMPERS),
      morale: BL.CAPTAINS.morale.start, missions: 0, wins: 0, out: 0, ships: [], record: [], joined: today() };
    (P.byClass[classId] = P.byClass[classId] || []).push(m);
    return m;
  }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function poolSize(classId) { return size(classId) + BL.CAPTAINS.extra; }

  // The career's captains (the class's pool is made at its first squadron job).
  function ensure(c, classId) {
    var P = c.captains = c.captains && c.captains.byClass ? c.captains : { byClass: {}, nextId: 1, kia: [], last: {} };
    if (classId && !P.byClass[classId]) {
      var rng = BL.rng(((c.offerSeed || 1) ^ Math.imul(0x2c1b3c6d, BL.classById(classId).n + 1)) >>> 0 || 1);
      P.byClass[classId] = [];
      for (var i = 0; i < poolSize(classId); i++) newCaptain(c, rng, classId, rng.range(BL.CAPTAINS.skill));
    }
    return P;
  }
  function pool(c, classId) { return ensure(c, classId).byClass[classId]; }
  function captain(c, id) { ensure(c); var a = all(c); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function name(m) { return rankOf(m.skill) + " " + m.first + " " + m.last; }
  function view(m) {
    return { id: m.id, name: name(m), who: m.first + " " + m.last, last: m.last, skill: m.skill, label: labelOf(m.skill), temper: m.temper,
      morale: m.morale, missions: m.missions, wins: m.wins, out: m.out || 0, ships: m.ships.slice() };
  }
  // The captain as he works in battle: his skill moved by morale (BL.CAPTAINS.morale.eff).
  function inBattle(m) {
    var e = BL.CAPTAINS.morale.eff, s = r2(clamp(m.skill * (e[0] + (e[1] - e[0]) * m.morale / 100), 0, 1));
    return { id: m.id, name: rankOf(s) + " " + m.first + " " + m.last, who: m.first + " " + m.last, last: m.last, skill: s, label: labelOf(s), temper: m.temper, morale: m.morale };
  }

  /* Will he serve under this commander for this job? As the crew's refusals (roster.js): asked
     once per job; a captain who served in his last squadron of this class stays on unless his
     morale is below BL.CAPTAINS.sign.stay; anyone else rolls the commander's d100 + squadron
     reputation against his d100 + skill - (morale - 50) / 5. */
  function aboardLast(c, m) { var l = ensure(c).last[m.classId]; return !!l && (l.flag === m.id || (l.wing || []).indexOf(m.id) >= 0); }
  function roll(c, job, m) {
    var S = BL.CAPTAINS.sign;
    if (aboardLast(c, m) && m.morale >= S.stay) return { stay: true, ok: true };
    var rng = BL.rng(((job.seed * 37 + m.id * 6271) ^ 0x1f83d9ab) >>> 0 || 1);
    var r = { capRoll: rng.int([1, 100]), rep: c.stations.squadron.rep || 0, hisRoll: rng.int([1, 100]), skill: Math.round(m.skill * 100), mor: Math.round((m.morale - 50) / S.morale * 10) / 10 };
    r.cap = r.capRoll + r.rep; r.him = Math.round((r.hisRoll + m.skill * 100 - (m.morale - 50) / S.morale) * 10) / 10;
    r.ok = r.cap > r.him;
    return r;
  }
  function willSign(c, job, m) {
    var asked = job.capAsked = job.capAsked || {}, rolls = job.capRolls = job.capRolls || {};
    if (m.out) return false;
    if (asked[m.id] !== undefined) return asked[m.id];
    var r = rolls[m.id] = roll(c, job, m);
    return (asked[m.id] = r.ok);
  }
  function rollOf(c, job, id) {
    var a = (job.capAsked || {})[id];
    if (a === undefined) return null;
    return (job.capRolls || {})[id] || { hire: true };
  }
  /* The captains a job suggests: last time's flag captain and captains first, then the best
     available (never one awaiting a new ship). sign: only captains who agree (willSign); if
     nobody's left, a green new captain joins the pool and signs on. { flag: id, wing: [id, ...] } */
  function suggest(c, job, sign) {
    var list = pool(c, job.classId), last = ensure(c).last[job.classId] || {}, used = {}, hireRng = null;
    function pick(lastId) {
      var lm = lastId && captain(c, lastId), avail = list.filter(function (m) { return !used[m.id] && !m.out; }).sort(function (a, b) { return b.skill - a.skill || a.id - b.id; });
      var order = (lm && !used[lm.id] && !lm.out && lm.classId === job.classId ? [lm] : []).concat(avail.filter(function (m) { return m !== lm; }));
      for (var i = 0; i < order.length; i++) if (!sign || willSign(c, job, order[i])) { used[order[i].id] = true; return order[i].id; }
      if (!sign) return null;
      hireRng = hireRng || BL.rng((job.seed ^ 0x4b9a1e27) >>> 0 || 1);
      var g = newCaptain(c, hireRng, job.classId, hireRng.range(BL.CAPTAINS.hire));
      (job.capAsked = job.capAsked || {})[g.id] = true; (job.capRolls = job.capRolls || {})[g.id] = { hire: true }; used[g.id] = true;
      return g.id;
    }
    var out = { flag: pick(last.flag), wing: [] };
    for (var i = 0; i < size(job.classId) - 1; i++) out.wing.push(pick((last.wing || [])[i]));
    return out;
  }
  // The job's captains: the commander's picks (job.capIds), else the suggestion; anyone since
  // lost or awaiting a ship is replaced by the suggestion's.
  function captainsOf(c, job, sign) {
    var s = suggest(c, job, sign), p = job.capIds;
    if (!p) return s;
    function ok(id) { var m = captain(c, id); return m && !m.out && m.classId === job.classId; }
    var out = { flag: ok(p.flag) ? p.flag : s.flag, wing: [] };
    for (var i = 0; i < s.wing.length; i++) out.wing.push(p.wing && ok(p.wing[i]) ? p.wing[i] : s.wing[i]);
    return out;
  }
  // For BL.Mission (opts.squad): the flag captain, the other captains and their ships' names.
  function forMission(c, job, ids) {
    function b(id) { var m = captain(c, id); return m ? inBattle(m) : null; }
    return { flag: b(ids.flag), wing: ids.wing.map(b), ships: (job.wingShips || []).slice() };
  }
  // Everyone in the class's pool, best first.
  function available(c, classId) { return pool(c, classId).slice().sort(function (a, b) { return b.skill - a.skill || a.id - b.id; }).map(view); }

  /* After a squadron mission: each ship lost (destroyed or left behind), her captain survives with
     a chance equal to his skill; the dead leave the pool (killed in action) and green captains take
     their places; a survivor sits out the next squadron mission of his class. Every captain who
     served gains skill on a success and morale moves (BL.CAPTAINS.morale; less for each ship lost;
     the flag captain one more if the commander took his bridge). Returns
     { lost: [{ name, ship }], out: [{ name, ship }], hired: n }. */
  function afterMission(c, job, r, entry) {
    var P = ensure(c, job.classId), C = BL.CAPTAINS, ids = job.capsUsed, sq = r.captain && r.captain.squad;
    if (!ids || !sq) return null;
    var rng = BL.rng((job.seed ^ 0x2f6b9d1e) >>> 0 || 1), success = r.outcome === "success";
    var flagShip = BL.shipLabel(job.classId, job.ship, job.hull);
    var aboard = [{ m: captain(c, ids.flag), ship: flagShip, gone: r.outcome === "destroyed", flag: true }].concat(sq.ships.map(function (s, i) {
      return { m: captain(c, ids.wing[i]), ship: s.fullName || s.ship, gone: s.left || s.hull <= 0, left: s.left };
    })).filter(function (x) { return x.m; });
    var shipsLost = aboard.filter(function (x) { return x.gone; }).length;
    // (the rest of the class's pool sat this one out: one mission nearer a new ship)
    pool(c, job.classId).forEach(function (m) { if (m.out && !aboard.some(function (x) { return x.m === m; })) m.out--; });
    var lost = [], out = [];
    aboard.forEach(function (x) {
      var m = x.m;
      x.dead = x.gone && !rng.chance(m.skill);
      m.record.unshift({ date: entry.date, ship: x.ship, flag: !!x.flag, tl: job.tl, outcome: x.dead ? "killed" : x.gone ? (x.left ? "left behind" : "ship lost") : r.outcome });
      if (m.record.length > C.record) m.record.length = C.record;
      if (x.dead) { lost.push(x); return; }
      m.missions++; if (success) m.wins++;
      if (m.ships.indexOf(x.ship) < 0) m.ships.push(x.ship);
      if (success) m.skill = r2(Math.min(C.grow.cap, Math.max(m.skill, m.skill + C.grow.success)));
      var dm = (success ? C.morale.success : C.morale.failure) + C.morale.shipLost * shipsLost;
      if (x.flag && sq.flagBridge) dm += C.morale.flagBridge;
      m.morale = Math.round(clamp(m.morale + dm, 0, 100));
      if (x.gone) { m.out = C.out; out.push({ name: name(m), ship: x.ship }); }
    });
    lost.forEach(function (x) {
      P.kia.unshift({ name: name(x.m), ship: x.ship, classId: job.classId, date: entry.date });
      var list = P.byClass[job.classId]; list.splice(list.indexOf(x.m), 1);
    });
    P.last[job.classId] = { flag: ids.flag, wing: ids.wing.slice() };
    var hired = 0;
    while (pool(c, job.classId).length < poolSize(job.classId)) { newCaptain(c, rng, job.classId, rng.range(C.hire)); hired++; }
    return { lost: lost.map(function (x) { return { name: name(x.m), ship: x.ship }; }), out: out, hired: hired, shipsLost: shipsLost };
  }

  BL.captains = { ensure: ensure, pool: pool, captain: captain, view: view, name: name, suggest: suggest, captainsOf: captainsOf,
    forMission: forMission, available: available, willSign: willSign, rollOf: rollOf, afterMission: afterMission, size: size };
})(typeof window !== "undefined" ? window : globalThis);
