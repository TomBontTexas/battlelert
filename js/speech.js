/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert spoken chatter: comms lines read aloud with the browser's built-in voices.
   Each speaker (the part of a line before the colon) gets its own voice, pitch and pace.
   The browser speaks one line at a time, so this keeps a short queue of its own: warnings
   jump ahead, and lines that have gone stale are dropped instead of lagging the fight. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var synth = root.speechSynthesis;
  var voices = [], assigned = {}, queue = [], speaking = false, enabled = true, volume = 0.8, unlocked = false, primedAt = 0, primer = null;
  // The line being spoken. Holding it keeps Safari from discarding it, which would lose its
  // "finished" event and leave every later line waiting forever (silence, beeps still playing).
  var current = null, startedAt = 0, expectMs = 0;
  // What the browser actually did, shown on the pause and Options screens so a silent iPad can
  // be diagnosed without a debugger.
  var stats = { asked: 0, started: 0, finished: 0, errors: 0, rescued: 0, lastError: "" };
  var MAX_AGE = 5000;            // ms: a line older than this is no longer worth saying
  var MAX_QUEUE = 3;

  // Each speaker gets its own real voice where the device has enough; pitch and pace only
  // nudge it (strong shifts make a voice sound broken). order = who gets the best voices first.
  var PROFILE = {
    "Tactical":       { pitch: 1.0,  rate: 1.15, order: 0 },
    "Helm":           { pitch: 1.05, rate: 1.1,  order: 1 },
    "Gunner 1":       { pitch: 1.05, rate: 1.2,  order: 2 },
    "Damage control": { pitch: 0.95, rate: 1.15, order: 3 },
    "Bridge":         { pitch: 0.95, rate: 1.0,  order: 4 },
    "Gunner 2":       { pitch: 0.97, rate: 1.2,  order: 5 },
    "Medical":        { pitch: 1.05, rate: 1.05, order: 6 },
    "Gunner 3":       { pitch: 1.0,  rate: 1.2,  order: 7 },
    "Navigation":     { pitch: 1.0,  rate: 1.05, order: 8 },
    "Reactor room":   { pitch: 0.92, rate: 1.1,  order: 9 },
    "Coxswain":       { pitch: 0.95, rate: 1.05, order: 10 },
    "Carrier":        { pitch: 1.0,  rate: 1.0,  order: 11 },
    "Captain":        { pitch: 0.92, rate: 1.0,  order: 12 },
    "Failsafe":       { pitch: 0.85, rate: 1.0,  order: 13 },
    "Gunnery":        { pitch: 0.9,  rate: 1.05, order: 14 },
    "Flight deck":    { pitch: 1.05, rate: 1.1,  order: 15 },
    "Gunner 4":       { pitch: 1.02, rate: 1.2,  order: 16 },
    "Gunner 5":       { pitch: 0.98, rate: 1.2,  order: 17 },
    "Squadron":       { pitch: 1.08, rate: 1.2,  order: 18 },
    "CIWS":           { pitch: 1.1,  rate: 1.2,  order: 19 },
    "Weapons":        { pitch: 0.9,  rate: 1.0,  order: 20 },
    "Gunner 6":       { pitch: 1.03, rate: 1.2,  order: 21 },
    "Gunner 7":       { pitch: 0.96, rate: 1.2,  order: 22 },
    "Gunner 8":       { pitch: 1.01, rate: 1.2,  order: 23 },
    "Engineering":    { pitch: 0.97, rate: 1.15, order: 24 },
    "Crew":           { pitch: 1.0,  rate: 1.1,  order: 25 }
  };
  var SPEAKERS = Object.keys(PROFILE).sort(function (a, b) { return PROFILE[a].order - PROFILE[b].order; });

  // Apple's joke and robot voices (Wobble, Cellos, Zarvox...) and the old Eloquence voices.
  var NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Princess|Fred|Junior|Kathy|Ralph|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)/i;
  function quality(v) {
    var id = (v.voiceURI || "") + " " + v.name;
    if (/premium/i.test(id)) return 3;
    if (/enhanced|neural|natural/i.test(id)) return 2;
    return 1;
  }
  function usable(v) {
    var id = v.voiceURI || "";
    return /^en/i.test(v.lang) && !NOVELTY.test(v.name) && !/speech\.synthesis\.voice|eloquence|novelty/i.test(id);
  }

  function loadVoices() {
    if (!synth) return;
    var all = synth.getVoices() || [];
    var good = all.filter(usable);
    if (!good.length) good = all.filter(function (v) { return /^en/i.test(v.lang) && !NOVELTY.test(v.name); });
    // Best quality first; among equals, spread the accents so neighbours sound different.
    good.sort(function (a, b) { return quality(b) - quality(a) || (b.localService ? 1 : 0) - (a.localService ? 1 : 0); });
    var byLang = {}, spread = [];
    good.forEach(function (v) { (byLang[v.lang] = byLang[v.lang] || []).push(v); });
    var langs = Object.keys(byLang).sort(function (a, b) { return quality(byLang[b][0]) - quality(byLang[a][0]); });
    for (var i = 0; spread.length < good.length; i++) {
      langs.forEach(function (l) { if (byLang[l][i]) spread.push(byLang[l][i]); });
    }
    voices = spread;
    assigned = {};
  }
  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }

  // Speakers in order get distinct voices; once they run out, voices are reused with a small
  // pitch offset so two speakers sharing a voice still sound a little different.
  function voiceFor(speaker) {
    if (assigned[speaker]) return assigned[speaker];
    var k = SPEAKERS.indexOf(speaker); if (k < 0) k = SPEAKERS.length - 1;
    var n = voices.length;
    assigned[speaker] = { voice: n ? voices[k % n] : null, shift: n ? [0, -0.06, 0.06][Math.floor(k / n) % 3] : 0 };
    return assigned[speaker];
  }

  // "Tactical: enemy salvo in 6 s." -> speaker "Tactical", words to say.
  function split(text) {
    var m = /^([^:]{2,20}):\s*(.*)$/.exec(text);
    var speaker = m && PROFILE[m[1]] ? m[1] : "Crew";
    var words = m && PROFILE[m[1]] ? m[2] : text;
    if (/^Gunner \d/.test(speaker)) words = speaker + ", " + words;   // which gun matters
    words = words.replace(/(\d+(?:\.\d+)?) s\b/g, "$1 seconds")
                 .replace(/(\d+(?:\.\d+)?) MW\b/g, "$1 megawatts")
                 .replace(/(\d+(?:\.\d+)?) MJ\b/g, "$1 megajoules")
                 .replace(/(\d+) G\b/g, "$1 G")
                 .replace(/\bCIWS\b/g, "sea-whiz");
    return { speaker: speaker, words: words };
  }

  // Watchdog: if the browser never reports the line finished, let the queue move on anyway.
  function unstick() {
    if (!speaking) return;
    var elapsed = Date.now() - startedAt;
    var idle = !synth.speaking && !synth.pending && elapsed > 1500;
    if (idle || elapsed > expectMs) {
      speaking = false; current = null; stats.rescued++;
      // Safari drops a line spoken right after cancel(), so the next line waits for the timer.
      if (synth.speaking || synth.pending) { synth.cancel(); return true; }
    }
    return false;
  }

  function next() {
    if (!synth) return;
    if (unstick() || speaking) return;
    if (synth.paused) synth.resume();
    var now = Date.now();
    while (queue.length && now - queue[0].at > MAX_AGE) queue.shift();
    var item = queue.shift();
    if (!item) return;
    var p = PROFILE[item.speaker] || PROFILE.Crew;
    var u = new SpeechSynthesisUtterance(item.words);
    var a = voiceFor(item.speaker);
    if (a.voice) { u.voice = a.voice; u.lang = a.voice.lang; }
    u.pitch = p.pitch + a.shift; u.rate = p.rate; u.volume = volume;
    u.onstart = function () { if (current === u) stats.started++; };
    u.onend = function () { if (current !== u) return; stats.finished++; speaking = false; current = null; next(); };
    u.onerror = function (ev) {
      var code = (ev && ev.error) || "error";
      if (code !== "interrupted" && code !== "canceled") { stats.errors++; stats.lastError = code; }
      if (current !== u) return; speaking = false; current = null;
    };
    current = u; speaking = true; startedAt = Date.now(); stats.asked++;
    expectMs = 3000 + item.words.length * 110 / Math.max(0.5, u.rate);
    synth.speak(u);
  }

  if (synth) setInterval(function () { if (queue.length || speaking) next(); }, 1000);

  BL.speech = {
    supported: !!synth,
    // Call from a tap: iPad Safari only allows speech once a gesture has started it, and can
    // lose that permission again (after a cancel, a pause or the screen locking). Every tap
    // re-primes it with a silent line while nothing is being said.
    unlock: function () {
      if (!synth) return;
      if (!voices.length) loadVoices();
      if (speaking || synth.speaking || synth.pending) return;
      if (unlocked && Date.now() - primedAt < 3000) return;
      unlocked = true; primedAt = Date.now();
      if (synth.paused) synth.resume();
      var u = new SpeechSynthesisUtterance(" "); u.volume = 0;
      primer = u;                  // held, like the real lines
      synth.speak(u);
    },
    enabled: function () { return enabled && volume > 0.01; },
    status: function () {
      if (!synth) return "This browser can't speak.";
      if (!enabled) return "Spoken messages are turned off in Options.";
      if (volume <= 0.01) return "The Voices volume is at zero.";
      var t = "Voices this session: " + stats.asked + " lines sent, " + stats.started + " started, " + stats.finished + " finished";
      if (stats.errors) t += ", " + stats.errors + " errors (last: " + stats.lastError + ")";
      if (stats.rescued) t += ", " + stats.rescued + " restarted";
      return t + ". " + voices.length + " voices.";
    },
    say: function (text, kind) {
      if (!synth || !enabled || volume <= 0.01) return;
      var item = split(text);
      item.at = Date.now();
      item.urgent = kind === "warn" || kind === "bad";
      if (item.urgent) {
        // Warnings go first; routine lines waiting behind them are dropped.
        queue = queue.filter(function (q) { return q.urgent; });
        queue.push(item);
      } else {
        if (queue.length >= MAX_QUEUE) return;
        queue.push(item);
      }
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      next();
    },
    // Who speaks with which voice, for the Options screen.
    crew: function () {
      if (!voices.length) loadVoices();
      return SPEAKERS.filter(function (sp) { return sp !== "Crew"; }).map(function (sp) {
        var a = voiceFor(sp);
        return { speaker: sp, voice: a.voice ? a.voice.name + " (" + a.voice.lang + ")" : "default voice", quality: a.voice ? quality(a.voice) : 0 };
      });
    },
    voiceCount: function () { if (!voices.length) loadVoices(); return voices.length; },
    // Each crew member says one line, in turn.
    test: function () {
      var self = this; this.stop();
      var lines = { "Tactical": "Enemy salvo in 6 seconds.", "Helm": "Evasive burn in 4 seconds.", "Gunner 1": "Gonna need that capacitor!",
        "Damage control": "Shields held.", "Bridge": "Jump window opens in 40 seconds.", "Gunner 2": "Target locked.",
        "Medical": "Air's getting thin.", "Gunner 3": "Splash one raider!", "Navigation": "Course plotted.",
        "Reactor room": "Heat is climbing!", "Coxswain": "Launch! We're clear of the carrier.", "Carrier": "Recovery in 30 seconds.",
        "Captain": "All hands, stand by.", "Failsafe": "Gun 3 tripped offline.", "Gunnery": "Main gun away! Keep it coming.",
        "Flight deck": "Squadron away!", "Gunner 4": "Need full power!", "Gunner 5": "Capacitor empty!", "Squadron": "We caught that salvo!" };
      Object.keys(lines).forEach(function (sp) { queue.push({ speaker: sp, words: (/^Gunner \d/.test(sp) ? sp + ", " : "") + lines[sp], at: Date.now() + 60000, urgent: false }); });
      next();
    },
    stop: function () { queue = []; current = null; if (synth) synth.cancel(); speaking = false; },
    setEnabled: function (on) { enabled = !!on; if (!enabled) this.stop(); },
    setVolume: function (v) { volume = v; }
  };
})(typeof window !== "undefined" ? window : globalThis);
