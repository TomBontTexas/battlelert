/* Single source of truth for this app's version (TexasBont standard).
   Format P.FF.BB = product . feature . bug fix (e.g. 0.01.00):
     product (major) up -> feature and bug fix reset to 00
     feature up         -> bug fix resets to 00
     bug fix up         -> just that number
   Bump with:  python ~/.claude/tools/bump_version.py product|feature|bugfix|set X.YY.ZZ
   `var`, not `const`: update-banner.js re-loads this file to detect new deploys. */
var LATEST_APP_VERSION = "0.01.00";
