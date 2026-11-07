/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Admirals (approved Nov 6, 2026; stage 1 of 5): the Fleet Admiral's campaign on the hex map.
   Pure JavaScript, no screen code (admiralsview.js draws it). Each hex is one star system, one
   warp from the next; one turn is one warp. He sends each squadron to a system, the Azurians
   plot their own moves, then every move happens at once. Squadrons that come out in the same
   system fight there, decided off screen; he reads the report after the turn. He wins when a
   squadron holds the target world at the end of a turn; he fails if Fleet HQ's turns run out or
   he loses half his squadrons. If his flag squadron is destroyed he shifts the flag (fight on)
   or withdraws (a loss). Tuning: BL.ADMIRALS (data.js).
   Later stages: detachments and fog of war (2), supply, repair and the enemy planner (3), the
   career (4), the Grand Admiral's four fleet admirals (5). */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  // Hexes: flat-top, odd columns shifted half a hex down ("odd-q"); index = row * cols + col.
  var NB = [[[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]], [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]]];
  function cube(col, row) { var z = row - (col - (col & 1)) / 2; return [col, -col - z, z]; }

  var SYL = ["ka", "vor", "esh", "tal", "mir", "zan", "oth", "rel", "quin", "sar", "dul", "nex", "ivo", "bra", "cyr", "lun", "teg", "or", "pha", "ul", "ken", "dra", "vel", "im"];
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  // "a, b and c"
  function list(xs) { return xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]; }

  function Campaign(opts) {
    var A = BL.ADMIRALS, self = this;
    this.A = A;
    this.seed = opts.seed || BL.randomSeed();
    this.level = A.levels.indexOf(opts.level) >= 0 ? opts.level : "F3";
    this.size = +this.level.slice(1);                 // F3 = 3 squadrons ... G9 = 9
    this.fleet = A.classes.slice(0, this.size);
    this.rng = BL.rng(this.seed);
    this.turn = 1;
    this.turns = A.turns.base + A.turns.perLevel * (this.size - 3);
    this.state = "play";                              // play | flag (the flag squadron is lost: shift or withdraw) | won | lost
    this.why = null;
    this.log = [];                                    // [{ turn, lines }]
    this.forces = [];
    this.nextId = 1;
    this.makeMap();
    this.makeFleet();
    this.makeEnemy();
    this.flag = this.ours().slice(-1)[0].id;          // (the flag flies with the biggest squadron to start)
    this.flagSet = false;                             // (he may move it until the first turn ends)
  }
  BL.Campaign = Campaign;

  /* ------------------------------------------------------------- The map */
  Campaign.prototype.makeMap = function () {
    var M = this.A.map, r = this.rng, used = {}, self = this;
    this.cols = M.cols; this.rows = M.rows;
    this.hexes = [];
    for (var row = 0; row < M.rows; row++) for (var col = 0; col < M.cols; col++)
      this.hexes.push({ i: row * M.cols + col, col: col, row: row, kind: "empty", owner: null, name: "" });
    function name() {
      for (var t = 0; t < 50; t++) { var n = cap(r.pick(SYL) + r.pick(SYL)); if (n.length > 3 && !used[n]) { used[n] = true; return n; } }
      return "System " + (Object.keys(used).length + 1);
    }
    this.hexes.forEach(function (h) { h.name = name(); });
    var mid = Math.floor(M.rows / 2);
    this.home = this.at(0, r.int([mid - 1, mid + 1]));
    this.world = this.at(M.cols - 1, r.int([1, M.rows - 2]));
    this.hexes[this.home].kind = "home"; this.hexes[this.home].owner = "us";
    this.hexes[this.world].kind = "world"; this.hexes[this.world].owner = "az";
    // The Azurian bases, depots and shipyards: between the two, never next to each other.
    var nb = r.int(this.A.enemy.bases), kinds = this.A.enemy.kinds;
    for (var k = 0, tries = 0; k < nb && tries < 200; tries++) {
      var h = this.hexes[this.at(r.int([3, M.cols - 2]), r.int([0, M.rows - 1]))];
      if (h.kind !== "empty" || this.neighbors(h.i).some(function (j) { return self.hexes[j].kind !== "empty"; })) continue;
      h.kind = kinds[k % kinds.length]; h.owner = "az"; k++;
    }
  };
  Campaign.prototype.at = function (col, row) { return row * this.cols + col; };
  Campaign.prototype.neighbors = function (i) {
    var h = this.hexes[i], out = [], self = this;
    NB[h.col & 1].forEach(function (d) {
      var c = h.col + d[0], rr = h.row + d[1];
      if (c >= 0 && c < self.cols && rr >= 0 && rr < self.rows) out.push(self.at(c, rr));
    });
    return out;
  };
  // Warps between two systems.
  Campaign.prototype.dist = function (a, b) {
    var p = cube(this.hexes[a].col, this.hexes[a].row), q = cube(this.hexes[b].col, this.hexes[b].row);
    return Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
  };
  // The shortest way from a to b (the systems after a, b last).
  Campaign.prototype.path = function (a, b) {
    if (a === b) return [];
    var prev = {}, q = [a], self = this; prev[a] = -1;
    while (q.length) {
      var x = q.shift(); if (x === b) break;
      this.neighbors(x).forEach(function (y) { if (prev[y] === undefined) { prev[y] = x; q.push(y); } });
    }
    var out = []; for (var y = b; y !== a; y = prev[y]) out.unshift(y);
    return out;
  };
  // One warp from a toward b.
  Campaign.prototype.stepToward = function (a, b) { var p = this.path(a, b); return p.length ? p[0] : a; };

  /* ------------------------------------------------------------ The forces */
  // A squadron of a class: its ships' strength (BL.ADMIRALS.ship) and its commander.
  Campaign.prototype.squadron = function (side, cls, at, cmd, role) {
    var d = BL.shipFor(cls, BL.TECH.base(cls)), sh = d.systems.filter(function (s) { return s.id === "shield"; })[0];
    var fire = d.systems.filter(function (s) { return s.kind === "gun" || s.id === "main"; }).reduce(function (a, s) { return a + s.maxMW; }, 0);
    var hp = Math.round(d.hull + (sh ? sh.maxMJ : 0) * this.A.ship.shieldK), n = BL.COMMAND.squad.size[cls] || 4, ships = [];
    for (var k = 0; k < n; k++) ships.push({ hp: hp, hpMax: hp, fire: fire });
    var f = { id: this.nextId++, side: side, cls: cls, ships: ships, cmd: cmd, at: at, prev: at, dest: at, role: role || null, base: at, lost: false };
    this.forces.push(f);
    return f;
  };
  Campaign.prototype.commander = function (rank, skill) {
    var E = BL.GUNNERY.engineer, r = this.rng, first = r.pick(E.first), last = r.pick(E.last);
    return { name: rank + " " + first + " " + last, last: last, skill: Math.round(r.range(skill) * 100) / 100, temper: r.pick(["cautious", "steady", "aggressive"]) };
  };
  Campaign.prototype.makeFleet = function () {
    var self = this;
    this.fleet.forEach(function (cls) { self.squadron("us", cls, self.home, self.commander("Commodore", self.A.skill)); });
  };
  Campaign.prototype.makeEnemy = function () {
    var E = this.A.enemy, r = this.rng, self = this, fleet = this.fleet;
    function az(at, role) { return self.squadron("az", r.pick(fleet), at, self.commander("Azurian", E.skill), role); }
    this.hexes.forEach(function (h) { if (h.owner === "az" && h.kind !== "world") az(h.i, "garrison"); });
    for (var g = Math.round(this.size * E.worldGarrison); g > 0; g--) az(this.world, "garrison");
    // The world's defences: one fixed force, as strong as a share of our whole fleet.
    var hp = 0, fire = 0; this.ours().forEach(function (f) { f.ships.forEach(function (s) { hp += s.hpMax; fire += s.fire; }); });
    var big = this.squadron("az", fleet[fleet.length - 1], this.world, { name: "World defences", last: "defences", skill: 0.7, temper: "steady" }, "defences");
    big.cls = "defences"; big.ships = [{ hp: Math.round(hp * E.defences.hp), hpMax: Math.round(hp * E.defences.hp), fire: Math.round(fire * E.defences.fire) }];
    var bases = this.hexes.filter(function (h) { return h.owner === "az" && h.kind !== "world"; });
    for (var p = r.int(E.patrols); p > 0 && bases.length; p--) az(r.pick(bases).i, "patrol");
    var nm = Math.max(1, Math.round(this.size * E.main));
    for (var m = 0; m < nm; m++) az(this.neighbors(this.world)[m % this.neighbors(this.world).length], "main");
  };
  Campaign.prototype.ours = function () { return this.forces.filter(function (f) { return f.side === "us" && !f.lost; }); };
  Campaign.prototype.theirs = function () { return this.forces.filter(function (f) { return f.side === "az" && !f.lost; }); };
  Campaign.prototype.force = function (id) { return this.forces.filter(function (f) { return f.id === id; })[0]; };
  Campaign.prototype.alive = function (f) { return f.ships.filter(function (s) { return s.hp > 0; }); };
  // A squadron's condition: the share of its ships' strength left.
  Campaign.prototype.condition = function (f) {
    var a = 0, b = 0; f.ships.forEach(function (s) { a += Math.max(0, s.hp); b += s.hpMax; });
    return b ? a / b : 0;
  };
  // Fighting strength: hit points times firepower (a damaged squadron is worse on both).
  Campaign.prototype.power = function (fs) {
    var hp = 0, fire = 0, self = this;
    fs.forEach(function (f) { self.alive(f).forEach(function (s) { hp += s.hp; fire += s.fire * self.fireK(f); }); });
    return hp * fire;
  };
  Campaign.prototype.fireK = function (f) {
    var A = this.A; return (1 - A.skillK + f.cmd.skill * A.skillK) * (A.temper[f.cmd.temper] || [1, 1])[0];
  };
  Campaign.prototype.name = function (f) {
    var A = this.A;
    if (f.cls === "defences") return "the world's defences";
    return f.side === "us" ? cap(A.plural[f.cls]) + " (" + f.cmd.name + ")" : "an Azurian " + BL.classById(f.cls).name.toLowerCase() + " squadron";
  };

  /* ------------------------------------------------------------- Orders */
  // Send our squadron to a system (it warps one system a turn, the shortest way); to where it is: hold.
  Campaign.prototype.order = function (id, dest) {
    var f = this.force(id); if (!f || f.side !== "us" || f.lost || this.state !== "play") return;
    f.dest = dest;
  };
  Campaign.prototype.setFlag = function (id) {
    var f = this.force(id); if (!f || f.side !== "us" || f.lost) return false;
    if (this.state === "flag") { this.flag = id; this.state = "play"; this.note("The flag shifts to the " + this.A.plural[f.cls] + "."); this.check(); return true; }
    if (this.flagSet || this.turn > 1) return false;
    this.flag = id; return true;
  };
  // With the flag squadron lost: give up the campaign.
  Campaign.prototype.withdraw = function () {
    if (this.state !== "flag") return;
    this.state = "lost"; this.why = "withdrew"; this.note("The fleet withdraws. The campaign is lost.");
  };
  Campaign.prototype.note = function (line) {
    var last = this.log[this.log.length - 1];
    if (last && last.turn === this.turn - 1) last.lines.push(line); else this.log.push({ turn: this.turn - 1, lines: [line] });
  };

  /* ------------------------------------------------------------ The enemy */
  // Each Azurian force picks its move from where our squadrons are at the start of the turn.
  Campaign.prototype.enemyMoves = function () {
    var E = this.A.enemy, r = this.rng, self = this, ours = this.ours();
    this.theirs().forEach(function (f) {
      var next = f.at;
      if (f.role === "patrol") {
        // A lone squadron of ours next to it, no stronger than the patrol: jump it.
        var prey = ours.filter(function (o) {
          return self.dist(o.at, f.at) === 1 && self.ours().filter(function (x) { return x.at === o.at; }).length === 1 && self.power([o]) <= self.power([f]);
        })[0];
        if (prey) next = prey.at;
        else {
          var opts = self.neighbors(f.at).concat([f.at]).filter(function (j) { return self.dist(j, f.base) <= E.roam; });
          next = r.pick(opts);
        }
      } else if (f.role === "main") {
        var near = ours.map(function (o) { return { o: o, d: self.dist(o.at, f.at) }; }).filter(function (x) { return x.d <= E.chase; })
          .sort(function (a, b) { return a.d - b.d; })[0];
        next = near ? self.stepToward(f.at, near.o.at) : self.dist(f.at, self.world) > 1 ? self.stepToward(f.at, self.world) : f.at;
      }
      f.next = next;
    });
  };

  /* --------------------------------------------------------------- A turn */
  Campaign.prototype.endTurn = function () {
    if (this.state !== "play") return null;
    var self = this, lines = [];
    this.flagSet = true;
    this.enemyMoves();
    // Every move at once.
    this.forces.forEach(function (f) {
      if (f.lost) return;
      f.prev = f.at;
      if (f.side === "us") f.at = f.dest === f.at ? f.at : self.stepToward(f.at, f.dest);
      else f.at = f.next;
    });
    // Fights: every system with both sides in it.
    var hexes = {};
    this.forces.forEach(function (f) { if (!f.lost) (hexes[f.at] = hexes[f.at] || []).push(f); });
    Object.keys(hexes).forEach(function (k) {
      var here = hexes[k], us = here.filter(function (f) { return f.side === "us"; }), az = here.filter(function (f) { return f.side === "az"; });
      if (us.length && az.length) self.fight(+k, us, az, lines);
    });
    // Systems taken: ours alone in an Azurian system at the end of the turn.
    this.hexes.forEach(function (h) {
      if (h.owner !== "az") return;
      var ours = self.ours().filter(function (f) { return f.at === h.i; }), theirs = self.theirs().filter(function (f) { return f.at === h.i; });
      if (ours.length && !theirs.length) { h.owner = "us"; lines.push((h.kind === "world" ? "The target world " : cap(h.kind) + " ") + h.name + " is taken."); }
    });
    if (!lines.length) lines.push("No contact.");
    this.log.push({ turn: this.turn, lines: lines });
    this.turn++;
    this.check();
    return lines;
  };
  // Won, lost, or the flag squadron gone (he decides: BL.Campaign.setFlag or withdraw).
  Campaign.prototype.check = function () {
    var all = this.forces.filter(function (f) { return f.side === "us"; }), lost = all.filter(function (f) { return f.lost; }).length;
    if (this.hexes[this.world].owner === "us") { this.state = "won"; this.why = "world"; return; }
    if (lost >= all.length * this.A.lose) { this.state = "lost"; this.why = "losses"; return; }
    var flag = this.force(this.flag);
    if (flag.lost) { this.state = "flag"; return; }
    if (this.turn > this.turns) { this.state = "lost"; this.why = "time"; return; }
  };

  /* ---------------------------------------------------------- The fight
     Decided off screen: rounds of fire both ways, each side's fire spread over the other's ships
     that are left; a commander breaks off when his side is outmatched (by his temper), back to
     the system he came from. A garrison and the world's defences fight to the end. */
  Campaign.prototype.fight = function (at, us, az, lines) {
    var F = this.A.fight, A = this.A, r = this.rng, self = this, h = this.hexes[at];
    var before = us.concat(az).map(function (f) { return self.alive(f).length; });
    var gone = {};
    function side(fs) { return fs.filter(function (f) { return !gone[f.id] && self.alive(f).length; }); }
    function volley(from, to) {
      var dmg = 0;
      from.forEach(function (f) { self.alive(f).forEach(function (s) { dmg += s.fire * self.fireK(f) * F.k * r.range(F.spread); }); });
      // (the fire spread over the ships left, each target's share by its size; a defending
      // temper takes a little less)
      var targets = []; to.forEach(function (f) { self.alive(f).forEach(function (s) { targets.push({ s: s, f: f }); }); });
      var tot = targets.reduce(function (a, t) { return a + t.s.hpMax; }, 0);
      targets.forEach(function (t) { t.s.hp -= dmg * (t.s.hpMax / tot) * (A.temper[t.f.cmd.temper] || [1, 1])[1] * r.range([0.6, 1.4]); });
    }
    for (var round = 0; round < F.rounds; round++) {
      var a = side(us), b = side(az);
      if (!a.length || !b.length) break;
      volley(a, b); volley(b, a);
      // Who breaks off: a side well outmatched, by its commanders' tempers (the boldest decides).
      [[side(us), side(az)], [side(az), side(us)]].forEach(function (pair) {
        var mine = pair[0], foe = pair[1]; if (!mine.length || !foe.length) return;
        var ratio = Math.sqrt(self.power(mine) / Math.max(1, self.power(foe)));
        mine.forEach(function (f) {
          if (f.role === "garrison" || f.role === "defences") return;
          if (ratio < F.breakAt[f.cmd.temper]) gone[f.id] = true;
        });
      });
    }
    // The result, one line per side.
    var shipsLost = function (fs) { return fs.reduce(function (n, f) { return n + before[us.concat(az).indexOf(f)] - self.alive(f).length; }, 0); };
    var wl = shipsLost(us), el = shipsLost(az);
    var who = list(us.map(function (f) { return A.plural[f.cls]; }));
    lines.push("At " + h.name + ": our " + who + " met " + list(az.map(function (f) { return self.name(f); })) + ".");
    lines.push("    We lost " + wl + " ship" + (wl === 1 ? "" : "s") + "; they lost " + el + ".");
    us.concat(az).forEach(function (f) {
      f.ships.forEach(function (s) { if (s.hp < 0) s.hp = 0; });
      if (!self.alive(f).length) {
        f.lost = true;
        lines.push("    " + cap(self.name(f)) + (f.side === "us" ? " is destroyed." + (f.id === self.flag ? " The flag squadron is gone." : "") : " is destroyed."));
      } else if (gone[f.id]) {
        // (back where it came from; one that didn't move falls back toward its own side)
        var back = f.prev !== at ? f.prev : self.stepToward(at, f.side === "us" ? self.home : self.world);
        f.at = back; if (f.side === "us") f.dest = back;
        lines.push("    " + cap(self.name(f)) + " broke off to " + self.hexes[back].name + ".");
      }
    });
  };

  /* --------------------------------------------- Headless runs (dev-tools)
     A simple test admiral: every squadron together, the shortest way to the target world. */
  BL.runAdmiralsHeadless = function (seed, level) {
    var c = new Campaign({ seed: seed, level: level }), guard = 0;
    while (c.state !== "won" && c.state !== "lost" && guard++ < 100) {
      if (c.state === "flag") { var o = c.ours(); if (o.length) c.setFlag(o[o.length - 1].id); else c.withdraw(); continue; }
      var lead = c.ours()[0].at;
      c.ours().forEach(function (f) { c.order(f.id, f.at === lead ? c.world : lead); });
      c.endTurn();
    }
    return { state: c.state, why: c.why, turn: c.turn - 1, turns: c.turns, lost: c.forces.filter(function (f) { return f.side === "us" && f.lost; }).length, of: c.size };
  };
})(typeof window !== "undefined" ? window : globalThis);
