"""Build js/story.js from the storyline files (Battlelert_<Path>_Storyline.txt) in the folder above web/.

Run from web/:  python tools/build_story.py [folder]
Each mission block (PATH, CLASS, MISSION, TITLE, BRIEFING, SYSTEMS, AFTER, IF LOST, CHATTER) becomes
one story mission. Only report lines (Tactical, Navigation, Engineering, Damage control, Bridge)
are kept for the game to play, one as the ship arrives in each system; orders come from the game
itself, and lines about the jump, warp space or the planet buster are left to the game's own calls.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(WEB)
PATHS = {"engineer": "Engineer", "gunner": "Gunner", "pilot": "Pilot"}
OWN = {"engineer": "Engineering", "gunner": "Gunnery", "pilot": "Helm"}
ENC = {"raiders": "raiders", "interceptors": "interceptors", "siege line": "siege", "drive hunters": "hunters",
       "minefield": "minefield", "mine lane": "sweep", "frigate group": "frigate", "cruiser group": "cruiserA",
       "battleship group": "battleshipA", "homeworld fortress": "fortress"}
REPORTERS = ("Tactical", "Navigation", "Engineering", "Damage control", "Bridge")

def parse(station, text):
    chapters, missions = {}, []
    for m in re.finditer(r"^CLASS (\d): .*\n(?:\w+-\d) \| Chapter: ([^|\n]+)", text, re.M):
        chapters[int(m.group(1))] = m.group(2).strip()
    for blk in re.split(r"\n(?=PATH: )", text)[1:]:
        f = {}
        cur = None
        for line in blk.split("\n"):
            if line.startswith("==="): break
            m = re.match(r"^(PATH|CLASS|MISSION|TITLE|BRIEFING|SYSTEMS|AFTER|IF LOST|CHATTER):\s*(.*)$", line)
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
        reports = []
        for line in f.get("CHATTER", []):
            who = line.split(":")[0]
            if who in REPORTERS and who != OWN[station] and not re.search(r"jump|warp|planet-buster", line, re.I):
                reports.append(line)
        missions.append({"id": "%s-%d-%d" % (station, n, k), "n": n, "k": k, "title": f["TITLE"][0],
                         "chapter": chapters.get(n, ""), "briefing": " ".join(f["BRIEFING"]), "systems": systems,
                         "after": " ".join(f.get("AFTER", [])), "lost": " ".join(f.get("IF LOST", [])), "reports": reports})
    return missions

out = {}
for station, name in PATHS.items():
    p = os.path.join(SRC, "Battlelert_%s_Storyline.txt" % name)
    out[station] = parse(station, io.open(p, encoding="utf-8").read())
    assert len(out[station]) == 27, (station, len(out[station]))

js = ("/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */\n"
      "/* Story missions, built by tools/build_story.py from the storyline files (don't edit by hand).\n"
      "   BL.STORY[station] = 27 missions, three per ship class: id, n (class), k (1-3), title, chapter,\n"
      "   briefing, systems (three encounter ids), after (success), lost (failure), reports (lines the\n"
      "   game plays, one as the ship arrives in each system). {hero} and {ship} are filled in by the game. */\n"
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
