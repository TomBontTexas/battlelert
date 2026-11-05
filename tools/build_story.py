"""Build js/story.js from the storyline files (Battlelert_<Path>_Storyline.txt) in the folder above web/.

Run from web/:  python tools/build_story.py [folder]
Each mission block (PATH, CLASS, MISSION, TITLE, BRIEFING, ESCORT, SYSTEMS, AFTER, IF LOST, CHATTER)
becomes one story mission. ESCORT (Captain path only): Carrier on the gunboat, Convoy or Capital ship on
the destroyer escort; an escort mission screens that ship. Only report lines (Tactical, Navigation, Engineering, Damage control, Bridge)
are kept for the game to play, one as the ship arrives in each system; orders come from the game
itself, and lines about the jump, warp space or the planet buster are left to the game's own calls.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(WEB)
PATHS = {"engineer": "Engineer", "gunner": "Gunner", "pilot": "Pilot", "captain": "Captain"}
OWN = {"engineer": "Engineering", "gunner": "Gunnery", "pilot": "Helm", "captain": None}
ESCORT = {"carrier": ("carrier", 1), "convoy": ("convoy", 3), "capital ship": ("capital", 3)}
ENC = {"raiders": "raiders", "interceptors": "interceptors", "siege line": "siege", "drive hunters": "hunters",
       "minefield": "minefield", "mine lane": "sweep", "frigate group": "frigate", "cruiser group": "cruiserA",
       "battleship group": "battleshipA", "homeworld fortress": "fortress"}
REPORTERS = ("Tactical", "Navigation", "Engineering", "Damage control", "Bridge")

# A report that names an enemy plays in the system that enemy is in (a mission's chatter is not
# always in system order: "Interceptors approaching from astern" listed first on a mission whose
# first system is a siege line); one naming an enemy the mission doesn't have is left out. The
# other lines fill the systems left, in order. "" = no report in that system.
NAMES = [("cruiserA", r"\bcruiser group|azurian cruiser"), ("battleshipA", r"\bbattleship group|azurian battleship"),
         ("frigate", r"\bfrigate"), ("interceptors", r"\binterceptor"), ("raiders", r"\braider"), ("siege", r"\bsiege"),
         ("hunters", r"\bdrive hunter|\bhunters?\b"), ("minefield", r"\bmine"), ("fortress", r"\bfortress")]
def place(lines, systems):
    out, rest = [""] * len(systems), []
    for line in lines:
        named = [k for k, rx in NAMES if re.search(rx, line, re.I)]
        if not named: rest.append(line); continue
        at = [i for i, s in enumerate(systems) if s in named or (s == "sweep" and "minefield" in named)]
        free = [i for i in at if not out[i]]
        if free: out[free[0]] = line
    for line in rest:
        free = [i for i in range(len(out)) if not out[i]]
        if free: out[free[0]] = line
    return out

def parse(station, text):
    chapters, missions = {}, []
    for m in re.finditer(r"^CLASS (\d): .*\n(?:\w+-\d) \| Chapter: ([^|\n]+)", text, re.M):
        chapters[int(m.group(1))] = m.group(2).strip()
    for blk in re.split(r"\n(?=PATH: )", text)[1:]:
        f = {}
        cur = None
        for line in blk.split("\n"):
            if line.startswith("==="): break
            m = re.match(r"^(PATH|CLASS|MISSION|TITLE|BRIEFING|ESCORT|SYSTEMS|AFTER|IF LOST|CHATTER):\s*(.*)$", line)
            if m: cur = m.group(1); f[cur] = [m.group(2)] if m.group(2) else []; continue
            if line.startswith("[DEVELOPER"): continue
            if cur and line.strip(): f[cur].append(line.strip())
        n = int(f["CLASS"][0].split()[0]); k = int(f["MISSION"][0].split()[0])
        systems = []
        for s in f["SYSTEMS"]:
            name = re.sub(r"^\d+\.\s*", "", s).strip().lower()
            assert name in ENC, (station, n, k, s)
            systems.append(ENC[name])
        assert len(systems) == 3, (station, n, k, systems)
        lines = []
        for line in f.get("CHATTER", []):
            who = line.split(":")[0]
            if who in REPORTERS and who != OWN[station] and not re.search(r"jump|warp|planet-buster", line, re.I):
                lines.append(line)
        reports = place(lines, systems)
        mission = {"id": "%s-%d-%d" % (station, n, k), "n": n, "k": k, "title": f["TITLE"][0],
                   "chapter": chapters.get(n, ""), "briefing": " ".join(f["BRIEFING"]), "systems": systems,
                   "after": " ".join(f.get("AFTER", [])), "lost": " ".join(f.get("IF LOST", [])), "reports": reports}
        assert station != "captain" or len(mission["briefing"].split()) <= 70, (station, n, k, len(mission["briefing"].split()))     # (the Captain file: 70 words or fewer)
        if f.get("ESCORT"):
            kind, cls = ESCORT[" ".join(f["ESCORT"]).strip().lower()]
            assert station == "captain" and cls == n, (station, n, k, f["ESCORT"])
            mission["escort"] = kind
        missions.append(mission)
    return missions

# Player-facing text says warp, never jump (TexasBont): the storyline files may still say jump.
def warp(t):
    for x, y in (("jumps", "warps"), ("jump", "warp"), ("Jumps", "Warps"), ("Jump", "Warp")): t = re.sub(r"\b%s\b" % x, y, t)
    return t
def warped(m):
    return {k: (warp(v) if isinstance(v, str) else [warp(x) for x in v] if isinstance(v, list) and k == "reports" else v) for k, v in m.items()}

out = {}
for station, name in PATHS.items():
    p = os.path.join(SRC, "Battlelert_%s_Storyline.txt" % name)
    out[station] = [warped(m) for m in parse(station, io.open(p, encoding="utf-8").read())]
    assert len(out[station]) == 27, (station, len(out[station]))

js = ("/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */\n"
      "/* Story missions, built by tools/build_story.py from the storyline files (don't edit by hand).\n"
      "   BL.STORY[station] = 27 missions, three per ship class: id, n (class), k (1-3), title, chapter,\n"
      "   briefing, systems (three encounter ids), after (success), lost (failure), reports (lines the\n"
      "   game plays, one as the ship arrives in each system), escort (Captain path: carrier, convoy or\n"
      "   capital). {hero} and {ship} are filled in by the game. */\n"
      "(function (root) {\n  \"use strict\";\n  var BL = root.BL = root.BL || {};\n"
      "  BL.STORY = " + json.dumps(out, indent=1, ensure_ascii=False) + ";\n"
      "  // One story mission by id (\"engineer-1-2\"), or null.\n"
      "  BL.storyMission = function (id) {\n"
      "    var st = String(id || \"\").split(\"-\")[0], list = BL.STORY[st] || [];\n"
      "    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];\n"
      "    return null;\n  };\n"
      "})(typeof window !== \"undefined\" ? window : globalThis);\n")
io.open(os.path.join(WEB, "js", "story.js"), "w", encoding="utf-8", newline="\n").write(js)
print("story.js:", {k: len(v) for k, v in out.items()}, "missions")
