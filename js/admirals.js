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
   If his flagship is destroyed he shifts the flag (fight on) or withdraws (a loss). Tuning:
   BL.ADMIRALS (data.js).
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
    this.turn = 1;
    this.turns = A.turns.base + A.turns.perLevel * A.levels.indexOf(this.level);
    this.state = "play";                              // play | flag (the flagship is lost: shift or withdraw) | won | lost
    this.why = null;
    this.log = [];                                    // [{ turn, lines }]
    this.forces = [];
    this.nextId = 1;
    this.makeMap();
    this.makeFleet();
    this.makeEnemy();
    this.flagShip = this.ours()[0].top.ships[0];      // (the flag flies in the first top ship to start)
    this.flagSet = false;                             // (he may move it until the first turn ends)
    this.syncFlag();
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
    this.hexes[this.world].kind = "world"; this.hexes[this.world].owner = "az";
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
    var f = { id: this.nextId++, side: side, top: node, at: at, prev: at, dest: at, role: role || null, base: at, lost: false };
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
    this.shipsTotal = this.ourShips().length;
  };
  Campaign.prototype.makeEnemy = function () {
    var E = this.A.enemy, A = this.A, r = this.rng, self = this;
    var below = A.classes[Math.max(0, A.classes.indexOf(this.top) - E.below)];
    function az(at, role, cls) { return self.group("az", self.pyramid(cls), at, role); }
    this.hexes.forEach(function (h) { h.kinds.forEach(function () { az(h.i, "garrison", below); }); });
    for (var g = Math.round(this.size * E.worldGarrison); g > 0; g--) az(this.world, "garrison", below);
    // The world's defences: one fixed force, as strong as a share of our whole fleet.
    var hp = 0, fire = 0; this.ourShips().forEach(function (s) { hp += s.hpMax; fire += s.fire; });
    var dk = E.defences.level[this.level] || 1, dhp = Math.round(hp * E.defences.hp * dk);
    var d = { cls: "defences", hp: dhp, hpMax: dhp, fire: Math.round(fire * E.defences.fire * dk) };
    this.group("az", { cls: "defences", ships: [d], kids: [], cmd: { name: "World defences", last: "defences", skill: 0.7, temper: "steady" } }, this.world, "defences");
    var bases = this.hexes.filter(function (h) { return h.owner === "az" && h.kind !== "world"; });
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
    this.alive(f).forEach(function (s) { n[s.cls] = (n[s.cls] || 0) + 1; });
    var cl = A.classes.slice().reverse().filter(function (c) { return n[c]; });
    function one(c) { return n[c] === 1 ? BL.classById(c).name.toLowerCase() : n[c] + " " + A.plural[c]; }
    if (!cl.length) return "no ships";
    if (n[cl[0]] === 1 && cl.length > 1) return one(cl[0]) + " with " + list(cl.slice(1).map(one));
    return list(cl.map(one));
  };
  // Its chip on the map: the biggest class and how many escorts ("DD+10", "DE+4", "PK4").
  Campaign.prototype.chip = function (f) {
    var A = this.A, al = this.alive(f);
    if (f.cls === "defences") return A.abbr.defences;
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
    if (!f || f.side !== "us" || f.lost || f.merged || this.state !== "play" || !f.top.kids.length) return out;
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
    var fs = ids.map(function (id) { return self.force(id); }).filter(function (f) { return f && f.side === "us" && !f.lost && !f.merged; });
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
    var f = this.force(id); if (!f || f.side !== "us" || f.lost || f.merged) return false;
    var ship = f.top.ships.filter(function (s) { return s.hp > 0; })[0] || this.alive(f)[0];
    if (this.state === "flag") { this.flagShip = ship; this.syncFlag(); this.state = "play"; this.note("The flag shifts to the " + this.desc(f) + "."); this.check(); return true; }
    if (this.flagSet || this.turn > 1) return false;
    this.flagShip = ship; this.syncFlag(); return true;
  };
  // With the flagship lost: give up the campaign.
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

  /* --------------------------------------------------------------- A turn
     Every move at once, then the fights. The fight his flag is in comes last, and it stops for
     him (state "battle") each time our side's damage reaches the mark he set (first
     fight.ask): he withdraws or fights on (battleChoice); the turn ends once it's decided. */
  Campaign.prototype.endTurn = function () {
    if (this.state !== "play") return null;
    var self = this, lines = [], flagFight = null;
    this.flagSet = true;
    this.enemyMoves();
    this.forces.forEach(function (f) {
      if (f.lost) return;
      f.prev = f.at;
      if (f.side === "us") f.at = f.dest === f.at ? f.at : self.stepToward(f.at, f.dest);
      else f.at = f.next;
    });
    // Fights: every system with both sides in it.
    var hexes = {}, flag = this.force(this.flag);
    this.forces.forEach(function (f) { if (!f.lost) (hexes[f.at] = hexes[f.at] || []).push(f); });
    Object.keys(hexes).forEach(function (k) {
      var here = hexes[k], us = here.filter(function (f) { return f.side === "us"; }), az = here.filter(function (f) { return f.side === "az"; });
      if (!us.length || !az.length) return;
      if (flag && us.indexOf(flag) >= 0) { flagFight = [+k, us, az]; return; }
      var b = self.battleStart(+k, us, az, false); self.rounds(b); self.battleEnd(b, lines);
    });
    this.turnLines = lines;
    if (!flagFight) return this.finishTurn();
    this.battle = this.battleStart(flagFight[0], flagFight[1], flagFight[2], true);
    return this.resume();
  };
  // Go on with the flag's fight: it stops again at his next mark, or ends the turn.
  Campaign.prototype.resume = function () {
    var b = this.battle;
    this.rounds(b);
    if (b.paused) { this.state = "battle"; return null; }
    this.battleEnd(b, this.turnLines); this.battle = null;
    return this.finishTurn();
  };
  // His answer when the flag's fight stops: "withdraw", or the next mark (0.5, 0.75; 1 = to the finish).
  Campaign.prototype.battleChoice = function (x) {
    var b = this.battle; if (this.state !== "battle" || !b) return null;
    this.state = "play";
    if (x === "withdraw") { b.us.forEach(function (f) { b.gone[f.id] = true; }); b.paused = false; this.battleEnd(b, this.turnLines); this.battle = null; return this.finishTurn(); }
    b.ask = x;
    return this.resume();
  };
  // Where the flag's fight stands (the pop-up's tally).
  Campaign.prototype.tally = function () {
    var b = this.battle, self = this; if (!b) return null;
    function row(f) { return { f: f, name: f.side === "us" ? cap(self.desc(f)) + " (" + f.cmd.name + ")" : cap(b.names[f.id]), alive: self.alive(f).length, total: f.ships.length, cond: self.condition(f), gone: !!b.gone[f.id] }; }
    return { at: this.hexes[b.at].name, round: b.round, us: b.us.map(row), az: b.az.map(row), usDmg: this.damage(b, "us"), azDmg: this.damage(b, "az"),
      usLost: this.lostIn(b, b.us), azLost: this.lostIn(b, b.az), asks: this.A.fight.asks };
  };
  Campaign.prototype.finishTurn = function () {
    var self = this, lines = this.turnLines;
    this.state = "play";
    this.syncFlag();
    // Systems taken: ours alone in an Azurian system at the end of the turn.
    this.hexes.forEach(function (h) {
      if (h.owner !== "az") return;
      var ours = self.ours().filter(function (f) { return f.at === h.i; }), theirs = self.theirs().filter(function (f) { return f.at === h.i; });
      if (ours.length && !theirs.length) { h.owner = "us"; lines.push(h.kind === "world" ? "The target world " + h.name + " is taken." : h.name + "'s " + list(h.kinds) + (h.kinds.length > 1 ? " are" : " is") + " taken."); }
    });
    if (!lines.length) lines.push("No contact.");
    this.log.push({ turn: this.turn, lines: lines });
    this.turn++;
    this.check();
    return lines;
  };
  // Won, lost, or the flagship gone (he decides: BL.Campaign.setFlag or withdraw).
  Campaign.prototype.check = function () {
    if (this.hexes[this.world].owner === "us") { this.state = "won"; this.why = "world"; return; }
    // (no losses rule: he decides when to pull out of his flag's fights; TexasBont, Nov 7, 2026)
    if (!this.ours().length) { this.state = "lost"; this.why = "losses"; return; }
    if (this.flagShip.hp <= 0) { this.state = "flag"; return; }
    if (this.turn > this.turns) { this.state = "lost"; this.why = "time"; return; }
  };

  /* ---------------------------------------------------------- The fight
     Decided off screen, rounds of fire both ways, each side's fire spread over the other's ships
     that are left, until one side is destroyed or breaks off (at most `rounds`). A commander
     breaks off when his side is outmatched, by his temper (the more aggressive, the longer he
     stays), back to the system he came from; a garrison and the world's defences fight to the
     end. In the fight his flag is in, our side breaks off only when he says (battleChoice). */
  Campaign.prototype.battleStart = function (at, us, az, flag) {
    var self = this, b = { at: at, us: us, az: az, flag: flag, ask: flag ? this.A.fight.ask : 1, round: 0, paused: false, gone: {}, names: {}, before: {} };
    us.concat(az).forEach(function (f) { b.names[f.id] = f.side === "us" ? self.desc(f) : self.name(f); b.before[f.id] = self.alive(f).length; });
    b.hpUs = this.hpOf(us); b.hpAz = this.hpOf(az);
    b.flagAlive = this.flagShip.hp > 0 && us.some(function (f) { return f.ships.indexOf(self.flagShip) >= 0; });
    return b;
  };
  Campaign.prototype.hpOf = function (fs) { return fs.reduce(function (a, f) { return a + f.ships.reduce(function (c, s) { return c + Math.max(0, s.hp); }, 0); }, 0); };
  // The share of a side's strength (ships lost and hull damage) this fight has taken.
  Campaign.prototype.damage = function (b, side) { return side === "us" ? 1 - this.hpOf(b.us) / Math.max(1, b.hpUs) : 1 - this.hpOf(b.az) / Math.max(1, b.hpAz); };
  Campaign.prototype.lostIn = function (b, fs) { var self = this; return fs.reduce(function (n, f) { return n + b.before[f.id] - self.alive(f).length; }, 0); };
  Campaign.prototype.rounds = function (b) {
    var F = this.A.fight, A = this.A, r = this.rng, self = this;
    function side(fs) { return fs.filter(function (f) { return !b.gone[f.id] && self.alive(f).length; }); }
    function volley(from, to) {
      var dmg = 0;
      from.forEach(function (f) { self.alive(f).forEach(function (s) { dmg += s.fire * self.fireK(f) * F.k * r.range(F.spread); }); });
      // (the fire spread over the ships left, each target's share by its size; a defending
      // temper takes a little less)
      var targets = []; to.forEach(function (f) { self.alive(f).forEach(function (s) { targets.push({ s: s, f: f }); }); });
      var tot = targets.reduce(function (a, t) { return a + t.s.hpMax; }, 0);
      targets.forEach(function (t) { t.s.hp -= dmg * (t.s.hpMax / tot) * (A.temper[t.f.cmd.temper] || [1, 1])[1] * r.range([0.6, 1.4]); });
    }
    b.paused = false;
    while (b.round < F.rounds) {
      var a = side(b.us), z = side(b.az);
      if (!a.length || !z.length) break;
      volley(a, z); volley(z, a); b.round++;
      // Who breaks off: a side well outmatched, by its commanders' tempers.
      [[side(b.us), side(b.az)], [side(b.az), side(b.us)]].forEach(function (pair) {
        var mine = pair[0], foe = pair[1]; if (!mine.length || !foe.length) return;
        var ratio = Math.sqrt(self.power(mine) / Math.max(1, self.power(foe)));
        mine.forEach(function (f) {
          if (f.role === "garrison" || f.role === "defences" || (b.flag && f.side === "us")) return;
          if (ratio < F.breakAt[f.cmd.temper]) b.gone[f.id] = true;
        });
      });
      // The flag's fight: stop for him at his mark (if the fight isn't over).
      if (b.flag && side(b.us).length && side(b.az).length && this.damage(b, "us") >= b.ask) { b.paused = true; return; }
    }
  };
  // The result: one line per side, then each force destroyed or broken off.
  Campaign.prototype.battleEnd = function (b, lines) {
    var self = this, h = this.hexes[b.at], us = b.us, az = b.az;
    us.concat(az).forEach(function (f) { f.ships.forEach(function (s) { if (s.hp < 0) s.hp = 0; }); });
    var wl = this.lostIn(b, us), el = this.lostIn(b, az), pc = function (x) { return Math.round(100 * x) + "%"; };
    lines.push("At " + h.name + ": our " + list(us.map(function (f) { return b.names[f.id]; })) + " met " + list(az.map(function (f) { return b.names[f.id]; })) + ".");
    lines.push("    We lost " + wl + " ship" + (wl === 1 ? "" : "s") + " (" + pc(this.damage(b, "us")) + " damage); they lost " + el + " (" + pc(this.damage(b, "az")) + " damage).");
    us.concat(az).forEach(function (f) {
      if (!self.alive(f).length) {
        f.lost = true;
        lines.push("    " + (f.side === "us" ? f.cmd.name + "'s force" : cap(b.names[f.id])) + " is destroyed.");
      } else if (b.gone[f.id]) {
        // (back where it came from; one that didn't move falls back toward its own side)
        var back = f.prev !== b.at ? f.prev : self.stepToward(b.at, f.side === "us" ? self.home : self.world);
        f.at = back; if (f.side === "us") f.dest = back;
        lines.push("    " + cap(self.name(f)) + (f.side === "us" && b.flag ? " withdrew to " : " broke off to ") + self.hexes[back].name + ".");
      }
    });
    if (b.flagAlive && this.flagShip.hp <= 0) lines.push("    Our flagship is lost.");
  };

  /* --------------------------------------------- Headless runs (dev-tools)
     A simple test admiral: every force together, the shortest way to the target world. */
  BL.runAdmiralsHeadless = function (seed, level) {
    var c = new Campaign({ seed: seed, level: level }), guard = 0;
    while (c.state !== "won" && c.state !== "lost" && guard++ < 100) {
      if (c.state === "flag") { var o = c.ours(); if (o.length) c.setFlag(o[o.length - 1].id); else c.withdraw(); continue; }
      if (c.state === "battle") { c.battleChoice(1); continue; }
      var lead = c.ours()[0].at;
      c.ours().forEach(function (f) { c.order(f.id, f.at === lead ? c.world : lead); });
      c.endTurn();
    }
    return { state: c.state, why: c.why, turn: c.turn - 1, turns: c.turns, lost: c.shipsLost(), of: c.shipsTotal };
  };
})(typeof window !== "undefined" ? window : globalThis);
