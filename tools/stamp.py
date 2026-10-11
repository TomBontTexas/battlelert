"""Cache-busting fingerprints for Battlelert's scripts and stylesheet.

Rewrites every local <script src> and <link href> in battlelert.html to carry ?b=<hash of
that file>, so a browser can never pair a new page with an old cached script (GitHub Pages
lets browsers cache files for 10 minutes). Run before each commit:

    python tools/stamp.py
"""
import hashlib, pathlib, re

WEB = pathlib.Path(__file__).resolve().parent.parent
PAGE = WEB / "battlelert.html"
REF = re.compile(r'((?:src|href)=")((?:js/|css/)?[\w.-]+\.(?:js|css))(?:\?b=[0-9a-f]+)?(")')

def stamp(match):
    path = WEB / match.group(2)
    if not path.is_file():
        return match.group(0)
    digest = hashlib.sha1(path.read_bytes()).hexdigest()[:8]
    return f"{match.group(1)}{match.group(2)}?b={digest}{match.group(3)}"

html = PAGE.read_text(encoding="utf-8")
new = REF.sub(stamp, html)
if new != html:
    PAGE.write_text(new, encoding="utf-8")
print("\n".join(m.group(0) for m in REF.finditer(new)))
