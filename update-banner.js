/* Drop-in "new version available" banner (TexasBont standard).
 *
 * Setup — put both files next to the app's HTML page, and load them in this order:
 *     <script src="version.js"></script>        <!-- var LATEST_APP_VERSION = "0.01.00"; -->
 *     <script src="update-banner.js"></script>
 * Optional, before update-banner.js runs or any time later:
 *     window.saveBeforeRefresh = () => { ...flush unsaved state... };   // called before reloading
 *
 * The version this page loaded with is captured at load time. The banner then re-loads
 * version.js through a fresh <script> tag with a cache-busting query (works on GitHub Pages
 * and on local file:// copies, where fetch() would be blocked) 5 s after load, every
 * 5 minutes, and whenever the tab becomes visible again. If the number differs, a sticky
 * banner appears with a "Refresh Now" button. Hidden when printing.
 *
 * Exposes: window.APP_VERSION (the running version) and window.checkForUpdate().
 */
(function () {
  "use strict";
  var running = (typeof LATEST_APP_VERSION !== "undefined") ? String(LATEST_APP_VERSION) : "dev";
  window.APP_VERSION = running;
  var me = document.currentScript;
  var versionSrc = (me && me.getAttribute("data-version-src")) || "version.js";

  var css = [
    ".tb-update-banner[hidden]{display:none}",
    ".tb-update-banner{position:sticky;top:0;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;",
    "padding:9px 16px;background:#e0a24a;color:#1f1400;font:600 14px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.18)}",
    ".tb-update-banner button{background:#1f1400;color:#f3c177;border:1px solid #1f1400;padding:6px 14px;border-radius:7px;cursor:pointer;font:600 13px system-ui,-apple-system,'Segoe UI',sans-serif}",
    ".tb-update-banner button:hover{background:#000}",
    "@media print{.tb-update-banner{display:none!important}}"
  ].join("\n");

  var banner, text, timer;
  function build() {
    if (banner) return;
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    banner = document.createElement("div");
    banner.className = "tb-update-banner"; banner.hidden = true; banner.setAttribute("role", "status");
    text = document.createElement("span");
    var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Refresh Now";
    btn.addEventListener("click", function () {
      try { if (typeof window.saveBeforeRefresh === "function") window.saveBeforeRefresh(); } catch (e) {}
      location.reload();
    });
    banner.appendChild(text); banner.appendChild(btn);
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function show(latest) {
    build();
    text.textContent = "A new version (v" + latest + ") is available — this tab is still running v" + running + ".";
    banner.hidden = false;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  }

  function checkForUpdate() {
    var s = document.createElement("script");
    s.src = versionSrc + (versionSrc.indexOf("?") < 0 ? "?" : "&") + Date.now();
    s.onload = function () {
      s.remove();
      if (running !== "dev" && typeof LATEST_APP_VERSION !== "undefined" && String(LATEST_APP_VERSION) !== running) show(LATEST_APP_VERSION);
    };
    s.onerror = function () { s.remove(); };          // offline or blocked: try again next time
    document.head.appendChild(s);
  }
  function onVisible() { if (!document.hidden) checkForUpdate(); }

  window.checkForUpdate = checkForUpdate;
  function start() {
    timer = setInterval(checkForUpdate, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    setTimeout(checkForUpdate, 5000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
