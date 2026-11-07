/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Admirals (approved Nov 6, 2026; stage 1 of 5): the Fleet Admiral's campaign on the hex map.
   Pure JavaScript, no screen code (admiralsview.js draws it). Each hex is one star system, one
   warp from the next; one turn is one warp. His fleet is escort pyramids (each ship with two
   escorts of the class below, each destroyer escort with a picket squadron); each pyramid is one
   force on the map, and he can split a force into its top ship and her escorts' pyramids, or
   join forces in one system. He sends each force to a system, the Azurians plot their own
   moves, then every move happens at once. Forces that come out in the same system fight there,
   decided off screen; he reads the report after the turn. He wins when a force holds the target
   world at the end of a turn; he fails if Fleet HQ's turns run out or his whole fleet is lost.
   If his flagship is destroyed he shifts the flag (fight on) or withdraws (a loss). Once the
   world is taken (state "won") he must hold it to the end of the last turn (then "over", won)
   against the Azurians' counterattack. A force that spends a whole turn, unfought, in a system
   with a shipyard we hold (the worlds are bases, shipyards and depots) is fully repaired. Tuning:
   BL.ADMIRALS (data.js).
   Stage 2 (TexasBont, Nov 7, 2026): fog of war (he sees what his ships see, a detached picket
   squadron further; Fleet HQ reports the rest, late and sometimes wrong: intel), Azurian
   raiders that go for whatever he leaves bare, ambushes (a force that warps blind into an enemy
   fights at a disadvantage), and F3's campaign: a convoy escort between two Imperial worlds.
   Later stages: detachments and fog of war (2), supply, repair and the enemy planner (3), the
   career (4), the Grand Admiral's three fleet admirals (5). */
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
    this.top = A.tops[this.level];                    // F3: 2 destroyer escorts at the top ... G9: 4 dreadnoughts
    this.size = A.top[this.level];
    this.rng = BL.rng(this.seed);
    this.irng = BL.rng((this.seed * 7919 + 17) >>> 0);  // (Fleet HQ's reports: their own dice, so the fog never changes the fighting)
    this.convoyMode = A.convoy.levels.indexOf(this.level) >= 0;   // F3: escort a convoy between two Imperial worlds
    this.intel = {};                                  // what he knows of each Azurian force: { at, turn, seen, label, name, trail: [{ at, seen }] }
    this.turn = 1;
    this.turns = A.turns.base + A.turns.perLevel * A.levels.indexOf(this.level);
    this.state = "play";                              // play | flag (the flagship is lost: shift or withdraw) | won | lost
    this.why = null;
    this.log = [];                                    // [{ turn, lines }]
    this.battles = [];                                // every fight: { turn, at, flag, usLost, azLost, usDmg, azDmg, result }
    this.taken = [];                                  // systems taken: { turn, name, what }
    this.won = false;                                 // (the world taken once: now he must hold it to the last turn)
    this.forces = [];
    this.nextId = 1;
    this.makeMap();
    this.makeFleet();
    this.makeEnemy();
    this.flagShip = this.ours()[0].top.ships[0];      // (the flag flies in the first top ship to start)
    this.flagSet = false;                             // (he may move it until the first turn ends)
    this.syncFlag();
    this.briefing();
  }
  BL.Campaign = Campaign;

  /* ------------------------------------------------------------- The map */
  Campaign.prototype.makeMap = function () {
    var M = this.A.map, r = this.rng, used = {}, self = this;
    this.cols = M.cols; this.rows = M.rows;
    this.hexes = [];
    for (var row = 0; row < M.rows; row++) for (var col = 0; col < M.cols; col++)
      this.hexes.push({ i: row * M.cols + col, col: col, row: row, kind: "empty", kinds: [], owner: null, name: "" });
    function name() {
      for (var t = 0; t < 50; t++) { var n = cap(r.pick(SYL) + r.pick(SYL)); if (n.length > 3 && !used[n]) { used[n] = true; return n; } }
      return "System " + (Object.keys(used).length + 1);
    }
    this.hexes.forEach(function (h) { h.name = name(); });
    var mid = Math.floor(M.rows / 2);
    this.home = this.at(0, r.int([mid - 1, mid + 1]));
    this.world = this.at(M.cols - 1, r.int([1, M.rows - 2]));
    this.hexes[this.home].kind = "home"; this.hexes[this.home].owner = "us";
    this.hexes[this.world].kind = "world"; this.hexes[this.world].owner = this.convoyMode ? "us" : "az";
    // (every world is a base, a shipyard and a depot too: TexasBont, Nov 7, 2026)
    [this.home, this.world].forEach(function (i) { self.hexes[i].yard = ["base", "shipyard", "depot"]; });
    // The Azurian bases, shipyards and depots: between the two, never next to each other. Some
    // systems hold two or all three (the big money systems: TexasBont, Nov 7, 2026), each with
    // its own garrison. h.kind is the first of h.kinds.
    var E = this.A.enemy, nb = r.int(E.bases), kinds = E.kinds;
    for (var k = 0, tries = 0; k < nb && tries < 200; tries++) {
      var h = this.hexes[this.at(r.int([3, M.cols - 2]), r.int([0, M.rows - 1]))];
      if (h.kind !== "empty" || this.neighbors(h.i).some(function (j) { return self.hexes[j].kind !== "empty"; })) continue;
      var x = r.next(), n = x < E.combo[1] ? 3 : x < E.combo[0] + E.combo[1] ? 2 : 1, first = kinds[k % kinds.length];
      h.kinds = [first];
      while (h.kinds.length < n) { var more = r.pick(kinds); if (h.kinds.indexOf(more) < 0) h.kinds.push(more); }
      h.kinds.sort(function (a, b) { return kinds.indexOf(a) - kinds.indexOf(b); });
      h.kind = h.kinds[0]; h.owner = "az"; k++;
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

  /* ------------------------------------------------------------ The forces
     A pyramid is a tree of nodes, { cls, ships, kids, cmd }: one ship and her escorts' pyramids,
     or a picket squadron (no kids). A force is one pyramid on the map: f.top is its node, and
     f.ships (every ship in it), f.cls and f.cmd come from it (refresh). */
  var STATS = {};
  // A ship: hp (hull + shields x shieldK) and fire (her guns' MW).
  Campaign.prototype.ship = function (cls) {
    if (!STATS[cls]) {
      var d = BL.shipFor(cls, BL.TECH.base(cls)), sh = d.systems.filter(function (s) { return s.id === "shield"; })[0];
      STATS[cls] = { hp: Math.round(d.hull + (sh ? sh.maxMJ : 0) * this.A.ship.shieldK), fire: d.systems.filter(function (s) { return s.kind === "gun" || s.id === "main"; }).reduce(function (a, s) { return a + s.maxMW; }, 0) };
    }
    return { cls: cls, hp: STATS[cls].hp, hpMax: STATS[cls].hp, fire: STATS[cls].fire };
  };
  Campaign.prototype.pyramid = function (cls) {
    var P = this.A.pyramid, k, n = { cls: cls, ships: [], kids: [], cmd: null };
    if (cls === "picket") { for (k = 0; k < P.pickets; k++) n.ships.push(this.ship(cls)); return n; }
    n.ships.push(this.ship(cls));
    if (cls === "destroyerEscort") n.kids.push(this.pyramid("picket"));
    else for (k = 0; k < P.escorts; k++) n.kids.push(this.pyramid(this.A.classes[this.A.classes.indexOf(cls) - 1]));
    return n;
  };
  function flatten(n) { return n.kids.reduce(function (a, k) { return a.concat(flatten(k)); }, n.ships.slice()); }
  Campaign.prototype.group = function (side, node, at, role) {
    if (!node.cmd) node.cmd = side === "us" ? this.commander("Commodore", this.A.skill) : this.commander("Azurian", this.A.enemy.skill);
    var f = { id: this.nextId++, side: side, top: node, at: at, prev: at, dest: at, role: role || null, base: at, lost: false, trail: [at] };
    this.refresh(f);
    this.forces.push(f);
    return f;
  };
  Campaign.prototype.refresh = function (f) { f.cls = f.top.cls; f.ships = flatten(f.top); f.cmd = f.top.cmd; };
  Campaign.prototype.commander = function (rank, skill) {
    var E = BL.GUNNERY.engineer, r = this.rng, first = r.pick(E.first), last = r.pick(E.last);
    return { name: rank + " " + first + " " + last, last: last, skill: Math.round(r.range(skill) * 100) / 100, temper: r.pick(["cautious", "steady", "aggressive"]) };
  };
  Campaign.prototype.makeFleet = function () {
    for (var k = 0; k < this.size; k++) this.group("us", this.pyramid(this.top), this.home);
    // F3: the convoy, its cargo ships unarmed, a cautious convoy master in charge.
    if (this.convoyMode) {
      var C = this.A.convoy, hp = Math.round(this.ship("destroyerEscort").hp * C.hp), cargo = [];
      for (var k2 = 0; k2 < C.cargo; k2++) cargo.push({ cls: "cargo", hp: hp, hpMax: hp, fire: 0 });
      var cm = this.commander("Convoy master", this.A.skill); cm.temper = "cautious";
      this.group("us", { cls: "cargo", ships: cargo, kids: [], cmd: cm }, this.home, "convoy");
      this.cargoTotal = C.cargo;
    }
    this.shipsTotal = this.ourShips().length;
  };
  Campaign.prototype.convoy = function () { return this.forces.filter(function (f) { return f.role === "convoy" && !f.lost; })[0] || null; };
  // Cargo ships still afloat, and those at the destination world.
  Campaign.prototype.cargoLeft = function () { var v = this.convoy(); return v ? this.alive(v).length : 0; };
  Campaign.prototype.cargoIn = function () { var v = this.convoy(); return v && v.at === this.world ? this.alive(v).length : 0; };
  Campaign.prototype.makeEnemy = function () {
    var E = this.A.enemy, A = this.A, r = this.rng, self = this;
    var below = A.classes[Math.max(0, A.classes.indexOf(this.top) - E.below)];
    function az(at, role, cls) { return self.group("az", self.pyramid(cls), at, role); }
    this.hexes.forEach(function (h) { h.kinds.forEach(function () { az(h.i, "garrison", below); }); });
    var bases = this.hexes.filter(function (h) { return h.owner === "az" && h.kind !== "world"; });
    for (var q = r.int(E.raiders); q > 0 && bases.length; q--) az(r.pick(bases).i, "raid", below);
    if (this.convoyMode) {
      // (F3: no target world to guard; the main fleet hunts the convoy)
      for (var p2 = r.int(E.patrols); p2 > 0 && bases.length; p2--) az(r.pick(bases).i, "patrol", below);
      var mid = this.at(Math.floor(this.cols / 2) + 1, r.int([1, this.rows - 2]));
      for (var m2 = 0; m2 < Math.round(this.size * E.main); m2++) az(mid, "hunt", this.top);
      return;
    }
    for (var g = Math.round(this.size * E.worldGarrison); g > 0; g--) az(this.world, "garrison", below);
    // The world's defences: one fixed force, as strong as a share of our whole fleet.
    var hp = 0, fire = 0; this.ourShips().forEach(function (s) { if (s.cls !== "cargo") { hp += s.hpMax; fire += s.fire; } });
    var dk = E.defences.level[this.level] || 1, dhp = Math.round(hp * E.defences.hp * dk);
    var d = { cls: "defences", hp: dhp, hpMax: dhp, fire: Math.round(fire * E.defences.fire * dk) };
    this.group("az", { cls: "defences", ships: [d], kids: [], cmd: { name: "World defences", last: "defences", skill: 0.7, temper: "steady" } }, this.world, "defences");
    for (var p = r.int(E.patrols); p > 0 && bases.length; p--) az(r.pick(bases).i, "patrol", below);
    var nb = this.neighbors(this.world);
    for (var m = 0; m < Math.round(this.size * E.main); m++) az(nb[m % nb.length], "main", this.top);
  };
  // Every ship of ours (the losses count them all).
  Campaign.prototype.ourShips = function () {
    return this.forces.filter(function (f) { return f.side === "us" && !f.merged; }).reduce(function (a, f) { return a.concat(f.ships); }, []);
  };
  Campaign.prototype.shipsLost = function () { return this.shipsTotal - this.ourShips().filter(function (s) { return s.hp > 0; }).length; };
  Campaign.prototype.ours = function () { return this.forces.filter(function (f) { return f.side === "us" && !f.lost && !f.merged; }); };
  Campaign.prototype.theirs = function () { return this.forces.filter(function (f) { return f.side === "az" && !f.lost; }); };
  Campaign.prototype.force = function (id) { return this.forces.filter(function (f) { return f.id === id; })[0]; };
  Campaign.prototype.alive = function (f) { return f.ships.filter(function (s) { return s.hp > 0; }); };
  // A force's condition: the share of its ships' strength left.
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
  // What's in a force: "destroyer with 2 destroyer escorts and 8 pickets", "4 pickets".
  Campaign.prototype.desc = function (f) {
    var A = this.A, n = {};
    if (f.cls === "defences") return "the world's defences";
    if (f.role === "convoy") { var nc = this.alive(f).length; return "convoy of " + nc + " cargo ship" + (nc === 1 ? "" : "s"); }
    this.alive(f).forEach(function (s) { n[s.cls] = (n[s.cls] || 0) + 1; });
    var cl = A.classes.slice().reverse().filter(function (c) { return n[c]; });
    function one(c) { return n[c] === 1 ? BL.classById(c).name.toLowerCase() : n[c] + " " + A.plural[c]; }
    if (!cl.length) return "no ships";
    if (n[cl[0]] === 1 && cl.length > 1) return one(cl[0]) + " with " + list(cl.slice(1).map(one));
    return list(cl.map(one));
  };
  // Its chip on the map: the biggest class and how many escorts ("DD+10", "DE+4", "DL4").
  Campaign.prototype.chip = function (f) {
    var A = this.A, al = this.alive(f);
    if (f.cls === "defences") return A.abbr.defences;
    if (f.role === "convoy") return A.abbr.cargo + al.length;
    var big = A.classes.slice().reverse().filter(function (c) { return al.some(function (s) { return s.cls === c; }); })[0];
    var nb = al.filter(function (s) { return s.cls === big; }).length, rest = al.length - nb;
    return A.abbr[big] + (nb > 1 ? nb : "") + (rest ? "+" + rest : "");
  };
  Campaign.prototype.fireK = function (f) {
    var A = this.A; return (1 - A.skillK + f.cmd.skill * A.skillK) * (A.temper[f.cmd.temper] || [1, 1])[0];
  };
  Campaign.prototype.name = function (f) {
    var A = this.A;
    if (f.cls === "defences") return "the world's defences";
    return f.side === "us" ? cap(this.desc(f)) + " (" + f.cmd.name + ")" : "an Azurian force (" + this.desc(f) + ")";
  };

  /* ------------------------------------------------------------- Orders */
  // Send our force to a system (it warps one system a turn, the shortest way); to where it is: hold.
  Campaign.prototype.order = function (id, dest) {
    var f = this.force(id); if (!f || f.side !== "us" || f.lost || this.state !== "play") return;
    f.dest = dest;
  };
  // Split a force: its top ship stays, and each escort's pyramid becomes a force of its own in
  // the same system, holding there. Returns the new forces.
  Campaign.prototype.split = function (id) {
    var f = this.force(id), self = this, out = [];
    if (!f || f.side !== "us" || f.lost || f.merged || this.state !== "play" || !f.top.kids.length || f.role === "convoy") return out;
    f.top.kids.forEach(function (k) {
      if (!flatten(k).some(function (s) { return s.hp > 0; })) return;
      out.push(self.group("us", k, f.at));
    });
    f.top.kids = []; this.refresh(f);
    if (!this.alive(f).length) f.merged = true;           // (its top ship already lost: nothing left to command)
    this.forces = this.forces.filter(function (x) { return !x.merged; });
    this.syncFlag();
    return out;
  };
  // Join forces in one system: the one with the biggest top ship leads, the others become her escorts.
  Campaign.prototype.join = function (ids) {
    var A = this.A, self = this;
    var fs = ids.map(function (id) { return self.force(id); }).filter(function (f) { return f && f.side === "us" && !f.lost && !f.merged && f.role !== "convoy"; });
    if (fs.length < 2 || this.state !== "play" || fs.some(function (f) { return f.at !== fs[0].at; })) return null;
    var lead = fs.slice().sort(function (a, b) { return A.classes.indexOf(b.cls) - A.classes.indexOf(a.cls); })[0];
    fs.forEach(function (f) { if (f === lead) return; lead.top.kids.push(f.top); f.merged = true; });
    // (a force joined into another is gone from the map: its ships are the lead's now)
    this.forces = this.forces.filter(function (x) { return !x.merged; });
    this.refresh(lead); this.syncFlag();
    return lead;
  };
  // The force the flagship is in.
  Campaign.prototype.syncFlag = function () {
    var s = this.flagShip, f = this.ours().filter(function (x) { return x.ships.indexOf(s) >= 0; })[0];
    this.flag = f ? f.id : null;
  };
  Campaign.prototype.setFlag = function (id) {
    var f = this.force(id); if (!f || f.side !== "us" || f.lost || f.merged || f.role === "convoy") return false;
    var ship = f.top.ships.filter(function (s) { return s.hp > 0; })[0] || this.alive(f)[0];
    if (this.state === "flag") { this.flagShip = ship; this.syncFlag(); this.state = "play"; this.note("The flag shifts to the " + this.desc(f) + "."); this.check(); return true; }
    if (this.flagSet || this.turn > 1) return false;
    this.flagShip = ship; this.syncFlag(); return true;
  };
  // With the flagship lost: give up the campaign (after the world is taken: it's over, and won).
  Campaign.prototype.withdraw = function () {
    if (this.state !== "flag") return;
    this.state = "lost"; this.why = "withdrew"; this.note("The fleet withdraws. The campaign is lost.");
  };
  // After the world is taken: hold it through the turns left.
  Campaign.prototype.carryOn = function () { if (this.state === "won" && this.turn <= this.turns && this.ours().length) this.state = "play"; };
  // A line for the report: during a turn, that turn's; between turns, the last one's.
  Campaign.prototype.note = function (line) {
    if (this.turnLines && this.state !== "flag") { this.turnLines.push(line); return; }
    var last = this.log[this.log.length - 1];
    if (last && last.turn === this.turn - 1) last.lines.push(line); else this.log.push({ turn: this.turn - 1, lines: [line] });
  };

  /* ------------------------------------------------------------ The enemy */
  // Each Azurian force picks its move from where our squadrons are at the start of the turn.
  Campaign.prototype.enemyMoves = function () {
    var E = this.A.enemy, r = this.rng, self = this, ours = this.ours();
    // Once the world is taken: the counterattack. Their main fleet regroups where
    // they are (a turn's grace for him to repair), then go for it with the fresh forces that come
    // in at the far edge every `counter.every` turns (reinforce).
    if (this.won) this.theirs().forEach(function (f) { if (f.role === "main") f.role = "regroup"; });
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
      } else if (f.role === "hunt") {
        // (F3's main fleet: the convoy if it's within reach, else it waits near the destination)
        var v = self.convoy();
        if (v && self.dist(v.at, f.at) <= E.chase) next = self.stepToward(f.at, v.at);
        else next = self.dist(f.at, self.world) > 2 ? self.stepToward(f.at, self.world) : f.at;
      } else if (f.role === "raid") {
        // A raider goes for what he's left bare: a system he took with nobody in it (to retake
        // it), the convoy, or a force of ours no stronger than the raider, the nearest first.
        var marks = [];
        // (never a world: the counterattack and F3's raids see to those)
        self.hexes.forEach(function (h) { if (h.owner === "us" && h.kind !== "home" && h.kind !== "world" && !ours.some(function (o) { return o.at === h.i; })) marks.push(h.i); });
        ours.forEach(function (o) { if (o.role === "convoy" || self.power([o]) <= self.power([f])) marks.push(o.at); });
        marks.sort(function (a, b) { return self.dist(f.at, a) - self.dist(f.at, b); });
        next = marks.length ? self.stepToward(f.at, marks[0]) : r.pick(self.neighbors(f.at).concat([f.at]));
      } else if (f.role === "regroup") {
        next = f.at;
      } else if (f.role === "retake") {
        next = f.at === self.world ? f.at : self.stepToward(f.at, self.world);
      } else if (f.role === "main") {
        var near = ours.map(function (o) { return { o: o, d: self.dist(o.at, f.at) }; }).filter(function (x) { return x.d <= E.chase; })
          .sort(function (a, b) { return a.d - b.d; })[0];
        next = near ? self.stepToward(f.at, near.o.at) : self.dist(f.at, self.world) > 1 ? self.stepToward(f.at, self.world) : f.at;
      }
      f.next = next;
    });
  };

  // The counterattack's fresh forces: after the moves, every `counter.every` turns from the turn
  // after the world fell, at the far edge nearest the world (they move in from the next turn).
  Campaign.prototype.reinforce = function () {
    var E = this.A.enemy, self = this;
    if (this.convoyMode) return this.raidWorld();
    if (!this.won || (this.turn - this.wonTurn) % E.counter.every !== 1 % E.counter.every) return;
    var edge = this.hexes.filter(function (h) { return h.col === self.cols - 1 && h.i !== self.world && h.owner !== "us"; })
      .sort(function (a, b) { return self.dist(a.i, self.world) - self.dist(b.i, self.world); });
    var n = Math.max(1, Math.round(this.size * E.counter.size));
    this.theirs().forEach(function (f) { if (f.role === "regroup") f.role = "retake"; });
    for (var k = 0; k < n && edge.length; k++) {
      var g = this.group("az", this.pyramid(this.A.classes[Math.max(0, this.A.classes.indexOf(this.top) - E.below)]), edge[k % Math.min(3, edge.length)].i, "retake");
      this.report(g, "Azurian reinforcements arrive at " + this.hexes[g.at].name + ".");
    }
  };
  // F3: from turn `convoy.raid.start`, every `every` turns, Azurian raiders come in at the map's
  // edge near the destination world and go for it.
  Campaign.prototype.raidWorld = function () {
    var R = this.A.convoy.raid, self = this;
    if (this.turn < R.start || (this.turn - R.start) % R.every) return;
    var edge = this.hexes.filter(function (h) {
      var d = self.dist(h.i, self.world); return d >= 2 && d <= 3 && h.owner !== "us" && (h.row === 0 || h.row === self.rows - 1 || h.col === self.cols - 1);
    }).sort(function (a, b) { return self.dist(a.i, self.world) - self.dist(b.i, self.world); });
    var cls = this.A.classes[Math.max(0, this.A.classes.indexOf(this.top) - this.A.enemy.below)];
    for (var k = 0, n = Math.max(1, Math.round(this.size * R.size)); k < n && edge.length; k++) {
      var g = this.group("az", this.pyramid(cls), this.rng.pick(edge.slice(0, 4)).i, "retake");
      this.report(g, "Fleet HQ: Azurian raiders reported near " + this.hexes[g.at].name + ", heading for " + this.hexes[this.world].name + ".");
    }
  };

  /* -------------------------------------------------------- Fog of war
     He sees what his ships see: `fog.sight` warps around each force (a force whose biggest ship
     is a picket ship, a detached DL squadron: `fog.scout`), and `fog.held` around the systems he
     holds. Everything else is Fleet HQ's reports: each turn a force out of sight may be reported
     (`fog.report`), where it was `fog.lag` turns ago, and now and then (`fog.off`) a system off. */
  Campaign.prototype.sight = function (f) {
    var A = this.A, big = A.classes.slice().reverse().filter(function (c) { return f.ships.some(function (s) { return s.hp > 0 && s.cls === c; }); })[0];
    return big === "picket" ? A.fog.scout : A.fog.sight;
  };
  Campaign.prototype.visibleSet = function () {
    var self = this, vis = {}, F = this.A.fog;
    function around(at, r) { self.hexes.forEach(function (h) { if (self.dist(at, h.i) <= r) vis[h.i] = true; }); }
    this.ours().forEach(function (f) { around(f.at, self.sight(f)); });
    this.hexes.forEach(function (h) { if (h.owner === "us") around(h.i, F.held); });
    return vis;
  };
  // What he knows, after a turn (and at the start): forces in sight are seen where they are; a
  // report he finds empty is struck; the rest may be reported, late.
  Campaign.prototype.updateIntel = function (turn) {
    var self = this, F = this.A.fog, r = this.irng, vis = this.visibleSet();
    Object.keys(this.intel).forEach(function (id) {
      var k = self.intel[id], f = self.force(+id);
      if (vis[k.at] && (!f || f.lost || f.at !== k.at)) delete self.intel[id];
    });
    this.theirs().forEach(function (f) {
      if (vis[f.at]) { self.know(f, f.at, turn, true); return; }
      if (!r.chance(F.report)) return;
      var lag = r.int(F.lag), at = f.trail[Math.max(0, f.trail.length - 1 - lag)];
      if (r.chance(F.off)) at = r.pick(self.neighbors(at));
      if (vis[at]) return;                              // (no report of a place he can see is empty)
      self.know(f, at, turn - lag, false);
    });
  };
  Campaign.prototype.know = function (f, at, turn, seen) {
    var k = this.intel[f.id] || (this.intel[f.id] = { trail: [] });
    if (k.turn !== undefined && turn < k.turn) return;
    if (!k.trail.length || k.trail[k.trail.length - 1].at !== at) k.trail.push({ at: at, seen: seen });
    else if (seen) k.trail[k.trail.length - 1].seen = true;
    k.at = at; k.turn = turn; k.seen = seen; k.label = this.chip(f); k.name = this.name(f);
  };
  // A force Fleet HQ reports (reinforcements, raiders): known at once, not seen.
  Campaign.prototype.report = function (f, line) {
    this.know(f, f.at, this.turn, false);
    this.note(line);
  };
  // The start: Fleet HQ's briefing (every base's and the world's garrison, a guess at the rest).
  Campaign.prototype.briefing = function () {
    var self = this, r = this.irng;
    this.theirs().forEach(function (f) { if (f.role === "garrison" || f.role === "defences" || r.chance(this.A.fog.report)) self.know(f, f.at, 0, false); }, this);
    this.updateIntel(0);
  };
  // The Azurian forces as he knows them, for the map: { f, at, label, name, seen, age, trail }.
  Campaign.prototype.known = function () {
    var self = this, now = this.turn - 1;
    return Object.keys(this.intel).map(function (id) {
      var k = self.intel[id], f = self.force(+id);
      return { id: +id, f: f, at: k.at, label: k.label, name: k.name, seen: k.seen && k.turn === now, age: now - k.turn, trail: k.trail };
    });
  };

  /* --------------------------------------------------------------- A turn
     Every move at once, then the fights. The fight his flag is in comes last, and he watches it
     (state "battle"): battleStep fights one round at a time, and it stops for him each time our
     side's damage reaches the mark he set (first fight.ask); he withdraws or fights on
     (battleChoice) and the turn ends once it's decided. */
  Campaign.prototype.endTurn = function () {
    if (this.state !== "play") return null;
    var self = this, lines = [], flagFight = null;
    this.flagSet = true;
    this.turnLines = lines;
    this.visBefore = this.visibleSet();               // (warping into a system he couldn't see: an ambush, if they're there)
    this.enemyMoves();
    this.forces.forEach(function (f) {
      if (f.lost) return;
      f.prev = f.at;
      if (f.side === "us") f.at = f.dest === f.at ? f.at : self.stepToward(f.at, f.dest);
      else f.at = f.next;
      if (f.at !== f.prev) f.trail.push(f.at);
    });
    this.reinforce();
    // Fights: every system with both sides in it.
    var hexes = {}, flag = this.force(this.flag);
    this.fought = {};
    this.forces.forEach(function (f) { if (!f.lost) (hexes[f.at] = hexes[f.at] || []).push(f); });
    Object.keys(hexes).forEach(function (k) {
      var here = hexes[k], us = here.filter(function (f) { return f.side === "us"; }), az = here.filter(function (f) { return f.side === "az"; });
      if (!us.length || !az.length) return;
      self.fought[k] = true;
      if (flag && us.indexOf(flag) >= 0) { flagFight = [+k, us, az]; return; }
      var b = self.battleStart(+k, us, az, false);
      while (self.round(b)) { /* to the finish */ }
      self.battleEnd(b, lines);
    });
    if (!flagFight) return this.finishTurn();
    this.battle = this.battleStart(flagFight[0], flagFight[1], flagFight[2], true);
    this.state = "battle";
    return null;
  };
  // One round of the flag's fight: "go" (more to come), "paused" (at his mark: battleChoice),
  // or "done" (the fight is over and the turn ended).
  Campaign.prototype.battleStep = function () {
    var b = this.battle; if (this.state !== "battle" || !b) return "done";
    if (b.paused) return "paused";
    if (!this.round(b)) return this.closeBattle();
    if (this.damage(b, "us") >= b.ask) { b.paused = true; return "paused"; }
    return "go";
  };
  // His answer when the flag's fight stops (or any time while it's on): "withdraw", or the next
  // mark (0.5, 0.75; 1 = to the finish).
  Campaign.prototype.battleChoice = function (x) {
    var b = this.battle; if (this.state !== "battle" || !b) return "done";
    if (x === "withdraw") { b.us.forEach(function (f) { b.gone[f.id] = true; }); return this.closeBattle(); }
    b.ask = x; b.paused = false;
    return "go";
  };
  Campaign.prototype.closeBattle = function () {
    this.battleEnd(this.battle, this.turnLines); this.lastBattle = this.battle; this.battle = null;    // (the panel shows how it ended until he closes it)
    this.finishTurn();
    return "done";
  };
  // Where the flag's fight stands (or, given it, how a fight ended), for the battle panel: every
  // force and its ships, the totals, and the round by round account.
  Campaign.prototype.tally = function (fight) {
    var b = fight || this.battle, self = this; if (!b) return null;
    function row(f) {
      return { f: f, name: f.side === "us" ? cap(self.alive(f).length ? self.desc(f) : b.names[f.id]) + " (" + f.cmd.name + ")" : cap(b.names[f.id]), alive: self.alive(f).length, total: f.ships.length,
        cond: self.condition(f), gone: !!b.gone[f.id], ships: f.ships.map(function (s) { return Math.max(0, s.hp) / s.hpMax; }), flag: f.ships.indexOf(self.flagShip) >= 0 };
    }
    return { at: this.hexes[b.at].name, round: b.round, paused: b.paused, ambush: b.ambush, ask: b.ask, us: b.us.map(row), az: b.az.map(row), usDmg: this.damage(b, "us"), azDmg: this.damage(b, "az"),
      usLost: this.lostIn(b, b.us), azLost: this.lostIn(b, b.az), asks: this.A.fight.asks, events: b.events };
  };
  Campaign.prototype.finishTurn = function () {
    var self = this, lines = this.turnLines;
    this.state = "play";
    this.syncFlag();
    // Repairs: a force that spent the whole turn, unfought, where we hold a shipyard.
    var fixed = {};
    this.ours().forEach(function (f) {
      var h = self.hexes[f.at];
      if (f.prev !== f.at || self.fought[f.at] || h.owner !== "us" || (h.yard || h.kinds).indexOf("shipyard") < 0) return;
      var hurt = f.ships.filter(function (s) { return s.hp > 0 && s.hp < s.hpMax; });
      if (!hurt.length) return;
      hurt.forEach(function (s) { s.hp = s.hpMax; });
      (fixed[h.name] = fixed[h.name] || []).push(self.desc(f));
    });
    Object.keys(fixed).forEach(function (n) { lines.push("Repaired at " + n + "'s shipyard: our " + list(fixed[n]) + "."); });
    // Systems retaken: the Azurians alone in a system of theirs we took (never our base).
    this.hexes.forEach(function (h) {
      if (h.owner !== "us" || h.kind === "home") return;
      var ours = self.ours().filter(function (f) { return f.at === h.i; }), theirs = self.theirs().filter(function (f) { return f.at === h.i; });
      if (ours.length || !theirs.length) return;
      h.owner = "az";
      lines.push((h.kind === "world" ? (self.convoyMode ? "The Azurians take the destination world " : "The Azurians retake the target world ") : "The Azurians retake ") + h.name + ".");
    });
    this.updateIntel(this.turn);
    // Systems taken: ours alone in an Azurian system at the end of the turn.
    this.hexes.forEach(function (h) {
      if (h.owner !== "az") return;
      var ours = self.ours().filter(function (f) { return f.at === h.i; }), theirs = self.theirs().filter(function (f) { return f.at === h.i; });
      if (!ours.length || theirs.length) return;
      h.owner = "us";
      var what = h.kind === "world" ? "the target world" : list(h.kinds);
      self.taken.push({ turn: self.turn, name: h.name, what: what });
      lines.push(h.kind === "world" ? "The target world " + h.name + " is taken." : h.name + "'s " + what + (h.kinds.length > 1 ? " are" : " is") + " taken.");
    });
    if (!lines.length) lines.push("No contact.");
    var last = this.log[this.log.length - 1];        // (notes already made this turn come first)
    if (last && last.turn === this.turn) { last.lines = last.lines.concat(lines); } else this.log.push({ turn: this.turn, lines: lines });
    this.turnLines = null;
    this.turn++;
    this.check();
    return lines;
  };
  // Won, lost, or the flagship gone (he decides: BL.Campaign.setFlag or withdraw).
  Campaign.prototype.check = function () {
    var held = this.hexes[this.world].owner === "us";
    if (this.convoyMode) {
      // F3: at least half the cargo ships at the destination world, and the world held, at the
      // end of the last turn.
      var left = this.cargoLeft(), inn = this.cargoIn(), half = this.cargoTotal / 2;
      if (left < half) { this.state = "lost"; this.why = "convoy"; return; }
      if (this.turn > this.turns) {
        if (held && inn >= half) { this.state = "over"; return; }
        this.state = "lost"; this.why = !held ? "retaken" : "late"; return;
      }
      if (!this.won && held && inn >= half) { this.won = true; this.wonTurn = this.turn - 1; this.state = "won"; this.why = "arrived"; return; }
      if (!this.ours().length) { this.state = "lost"; this.why = "losses"; return; }
      if (this.flagShip.hp <= 0 && this.ours().some(function (f) { return f.role !== "convoy"; })) { this.state = "flag"; return; }
      return;
    }
    // The last turn over: won if the world is ours.
    if (this.turn > this.turns) {
      if (held) { if (!this.won) { this.won = true; this.wonTurn = this.turn - 1; } this.state = "over"; return; }
      this.state = "lost"; this.why = this.won ? "retaken" : "time"; return;
    }
    // The world taken (the first time): now hold it.
    if (!this.won && held) { this.won = true; this.wonTurn = this.turn - 1; this.state = "won"; this.why = "world"; return; }
    // (no losses rule: he decides when to pull out of his flag's fights; TexasBont, Nov 7, 2026)
    if (!this.ours().length) { this.state = "lost"; this.why = "losses"; return; }
    if (this.flagShip.hp <= 0 && this.ours().length) { this.state = "flag"; return; }
  };

  /* ---------------------------------------------------------- The fight
     Decided off screen, rounds of fire both ways, each side's fire spread over the other's ships
     that are left, until one side is destroyed or breaks off (at most `rounds`). A commander
     breaks off when his side is outmatched, by his temper (the more aggressive, the longer he
     stays), back to the system he came from; a garrison and the world's defences fight to the
     end. In the fight his flag is in, our side breaks off only when he says (battleChoice). */
  Campaign.prototype.battleStart = function (at, us, az, flag) {
    var self = this, b = { at: at, us: us, az: az, flag: flag, ask: flag ? this.A.fight.ask : 1, round: 0, paused: false, gone: {}, names: {}, before: {}, events: [] };
    // (an ambush: he warped in blind, a system none of his ships could see at the turn's start)
    b.ambush = !!this.visBefore && !this.visBefore[at] && us.some(function (f) { return f.prev !== at; });
    if (b.ambush) b.events.push("Ambush! We warped in blind: our fire is down for the first " + this.A.ambush.rounds + " rounds.");
    us.concat(az).forEach(function (f) { b.names[f.id] = f.side === "us" ? self.desc(f) : self.name(f); b.before[f.id] = self.alive(f).length; });
    b.hpUs = this.hpOf(us); b.hpAz = this.hpOf(az);
    b.flagAlive = this.flagShip.hp > 0 && us.some(function (f) { return f.ships.indexOf(self.flagShip) >= 0; });
    return b;
  };
  Campaign.prototype.hpOf = function (fs) { return fs.reduce(function (a, f) { return a + f.ships.reduce(function (c, s) { return c + Math.max(0, s.hp); }, 0); }, 0); };
  // The share of a side's strength (ships lost and hull damage) this fight has taken.
  Campaign.prototype.damage = function (b, side) { return side === "us" ? 1 - this.hpOf(b.us) / Math.max(1, b.hpUs) : 1 - this.hpOf(b.az) / Math.max(1, b.hpAz); };
  Campaign.prototype.lostIn = function (b, fs) { var self = this; return fs.reduce(function (n, f) { return n + b.before[f.id] - self.alive(f).length; }, 0); };
  // One round of a fight; false once it's over (a side gone or broken off, or `rounds` fought).
  Campaign.prototype.round = function (b) {
    var F = this.A.fight, A = this.A, r = this.rng, self = this;
    function side(fs) { return fs.filter(function (f) { return !b.gone[f.id] && self.alive(f).length; }); }
    function volley(from, to, mult) {
      var dmg = 0;
      from.forEach(function (f) { self.alive(f).forEach(function (s) { dmg += s.fire * self.fireK(f) * F.k * mult * r.range(F.spread); }); });
      // (the fire spread over the ships left, each target's share by its size; a defending
      // temper takes a little less)
      var targets = []; to.forEach(function (f) { self.alive(f).forEach(function (s) { targets.push({ s: s, f: f }); }); });
      var tot = targets.reduce(function (a, t) { return a + t.s.hpMax; }, 0);
      targets.forEach(function (t) { t.s.hp -= dmg * (t.s.hpMax / tot) * (A.temper[t.f.cmd.temper] || [1, 1])[1] * r.range([0.6, 1.4]); });
    }
    // (the ships each side loses this round, by class, for the account)
    function count(fs) { var n = {}; fs.forEach(function (f) { self.alive(f).forEach(function (s) { n[s.cls] = (n[s.cls] || 0) + 1; }); }); return n; }
    function sunk(was, now) {
      return ["cargo"].concat(A.classes, ["defences"]).slice().reverse().filter(function (c) { return (was[c] || 0) > (now[c] || 0); }).map(function (c) {
        var k = was[c] - (now[c] || 0);
        return c === "defences" ? "the world's defences" : c === "cargo" ? (k === 1 ? "a cargo ship" : k + " cargo ships") : k === 1 ? "a " + BL.classById(c).name.toLowerCase() : k + " " + A.plural[c];
      });
    }
    var a = side(b.us), z = side(b.az);
    if (!a.length || !z.length || b.round >= F.rounds) return false;
    var wasUs = count(b.us), wasAz = count(b.az);
    volley(a, z, b.ambush && b.round < A.ambush.rounds ? A.ambush.k : 1); volley(z, a, 1); b.round++;
    var ev = [], lu = sunk(wasUs, count(b.us)), la = sunk(wasAz, count(b.az));
    if (lu.length) ev.push("we lost " + list(lu));
    if (la.length) ev.push("they lost " + list(la));
    // Who breaks off: a side well outmatched, by its commanders' tempers.
    [[side(b.us), side(b.az)], [side(b.az), side(b.us)]].forEach(function (pair) {
      var mine = pair[0], foe = pair[1]; if (!mine.length || !foe.length) return;
      var ratio = Math.sqrt(self.power(mine) / Math.max(1, self.power(foe)));
      mine.forEach(function (f) {
        if (f.role === "garrison" || f.role === "defences" || (b.flag && f.side === "us")) return;
        if (ratio < F.breakAt[f.cmd.temper]) { b.gone[f.id] = true; ev.push((f.side === "us" ? "our " + self.desc(f) : "an Azurian force (" + self.desc(f) + ")") + " broke off"); }
      });
    });
    b.events.push("Round " + b.round + ": " + (ev.length ? ev.join("; ") : "no ships lost") + ".");
    return side(b.us).length > 0 && side(b.az).length > 0 && b.round < F.rounds;
  };
  // The result: one line per side, then each force destroyed or broken off.
  Campaign.prototype.battleEnd = function (b, lines) {
    var self = this, h = this.hexes[b.at], us = b.us, az = b.az;
    us.concat(az).forEach(function (f) { f.ships.forEach(function (s) { if (s.hp < 0) s.hp = 0; }); });
    var wl = this.lostIn(b, us), el = this.lostIn(b, az), pc = function (x) { return Math.round(100 * x) + "%"; };
    lines.push("At " + h.name + ": our " + list(us.map(function (f) { return b.names[f.id]; })) + " met " + list(az.map(function (f) { return b.names[f.id]; })) + "." + (b.ambush ? " An ambush: we warped in blind." : ""));
    lines.push("    We lost " + wl + " ship" + (wl === 1 ? "" : "s") + " (" + pc(this.damage(b, "us")) + " damage); they lost " + el + " (" + pc(this.damage(b, "az")) + " damage).");
    us.concat(az).forEach(function (f) {
      if (!self.alive(f).length) {
        f.lost = true;
        lines.push("    " + (f.side === "us" ? f.cmd.name + "'s force" : cap(b.names[f.id])) + " is destroyed.");
      } else if (b.gone[f.id]) {
        // (back where it came from; one that didn't move falls back toward its own side)
        var back = f.prev !== b.at ? f.prev : self.stepToward(b.at, f.side === "us" ? self.home : self.world);
        f.at = back; f.trail.push(back); if (f.side === "us") f.dest = back;
        lines.push("    " + cap(self.name(f)) + (f.side === "us" && b.flag ? " withdrew to " : " broke off to ") + self.hexes[back].name + ".");
      }
    });
    if (b.flagAlive && this.flagShip.hp <= 0) lines.push("    Our flagship is lost.");
    // (for the write-up)
    var held = us.some(function (f) { return !f.lost && f.at === b.at; }), theirs = az.some(function (f) { return !f.lost && f.at === b.at; });
    this.battles.push({ turn: this.turn, at: h.name, flag: b.flag, usLost: wl, azLost: el, usDmg: this.damage(b, "us"), azDmg: this.damage(b, "az"),
      result: held && !theirs ? "won" : !held && theirs ? "lost" : "drawn" });
  };
  // The campaign so far, for the write-up.
  Campaign.prototype.summary = function () {
    var self = this, az = this.forces.filter(function (f) { return f.side === "az"; }), azShips = 0, azLost = 0;
    az.forEach(function (f) { azShips += f.ships.length; azLost += f.ships.filter(function (s) { return s.hp <= 0; }).length; });
    return { convoy: this.convoyMode, cargoLeft: this.convoyMode ? this.cargoLeft() : 0, cargoIn: this.convoyMode ? this.cargoIn() : 0, cargoTotal: this.cargoTotal,
      won: this.won, wonTurn: this.wonTurn, turn: Math.min(this.turn - 1, this.turns), turns: this.turns, world: this.hexes[this.world].name,
      usLost: this.shipsLost(), usTotal: this.shipsTotal, azLost: azLost, azTotal: azShips, battles: this.battles, taken: this.taken,
      forces: this.ours().map(function (f) { return cap(self.desc(f)) + " (" + f.cmd.name + ") · " + self.alive(f).length + "/" + f.ships.length + " ships · " + Math.round(100 * self.condition(f)) + "%"; }) };
  };

  /* --------------------------------------------- Headless runs (dev-tools)
     A simple test admiral: every force together, the shortest way to the target world. */
  BL.runAdmiralsHeadless = function (seed, level) {
    var c = new Campaign({ seed: seed, level: level }), guard = 0;
    while (c.state !== "over" && c.state !== "lost" && guard++ < 5000) {
      if (c.state === "won") { c.carryOn(); continue; }
      if (c.state === "flag") { var o = c.ours().filter(function (f) { return f.role !== "convoy"; }); if (o.length) c.setFlag(o[o.length - 1].id); else c.withdraw(); continue; }
      if (c.state === "battle") { if (c.battleStep() === "paused") c.battleChoice(1); continue; }
      var lead = c.ours()[0].at;      // (and once it's taken: everyone to the world, and hold it)
      c.ours().forEach(function (f) { c.order(f.id, f.at === lead ? c.world : lead); });
      c.endTurn();
    }
    return { state: c.state, why: c.why, turn: c.turn - 1, turns: c.turns, lost: c.shipsLost(), of: c.shipsTotal };
  };
})(typeof window !== "undefined" ? window : globalThis);
