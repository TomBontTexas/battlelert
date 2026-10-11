/* Battlelert spoken chatter: comms lines read aloud with the browser's built-in voices.
   Each speaker (the part of a line before the colon) gets its own voice, pitch and pace.
   The browser speaks one line at a time, so this keeps a short queue of its own: warnings
   jump ahead, and lines that have gone stale are dropped instead of lagging the fight. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var synth = root.speechSynthesis;
  var voices = [], assigned = {}, queue = [], speaking = false, enabled = true, volume = 0.8, unlocked = false;
  var MAX_AGE = 5000;            // ms: a line older than this is no longer worth saying
  var MAX_QUEUE = 3;

  // Pitch and rate per speaker; voice picked from the available English voices.
  var PROFILE = {
    "Tactical":       { pitch: 1.0,  rate: 1.2,  slot: 0 },
    "Helm":           { pitch: 1.15, rate: 1.15, slot: 1 },
    "Bridge":         { pitch: 0.85, rate: 1.05, slot: 2 },
    "Captain":        { pitch: 0.8,  rate: 1.0,  slot: 2 },
    "Navigation":     { pitch: 1.05, rate: 1.1,  slot: 3 },
    "Damage control": { pitch: 0.9,  rate: 1.25, slot: 4 },
    "Medical":        { pitch: 1.2,  rate: 1.1,  slot: 5 },
    "Reactor room":   { pitch: 0.75, rate: 1.2,  slot: 6 },
    "Failsafe":       { pitch: 0.5,  rate: 1.1,  slot: 7 },
    "Gunner 1":       { pitch: 1.25, rate: 1.3,  slot: 8 },
    "Gunner 2":       { pitch: 0.95, rate: 1.3,  slot: 9 },
    "Gunner 3":       { pitch: 1.1,  rate: 1.3,  slot: 10 },
    "Coxswain":       { pitch: 0.9,  rate: 1.15, slot: 2 },
    "Carrier":        { pitch: 1.05, rate: 1.0,  slot: 3 },
    "Crew":           { pitch: 1.0,  rate: 1.2,  slot: 11 }
  };

  function loadVoices() {
    if (!synth) return;
    var all = synth.getVoices() || [];
    var en = all.filter(function (v) { return /^en/i.test(v.lang); });
    voices = en.length ? en : all;
    assigned = {};
  }
  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }

  function voiceFor(speaker) {
    if (assigned[speaker] !== undefined) return assigned[speaker];
    var p = PROFILE[speaker] || PROFILE.Crew;
    assigned[speaker] = voices.length ? voices[p.slot % voices.length] : null;
    return assigned[speaker];
  }

  // "Tactical: enemy salvo in 6 s." -> speaker "Tactical", words to say.
  function split(text) {
    var m = /^([^:]{2,20}):\s*(.*)$/.exec(text);
    var speaker = m && PROFILE[m[1]] ? m[1] : "Crew";
    var words = m && PROFILE[m[1]] ? m[2] : text;
    if (/^Gunner/.test(speaker)) words = speaker + ", " + words;   // which gun matters
    words = words.replace(/(\d+(?:\.\d+)?) s\b/g, "$1 seconds")
                 .replace(/(\d+(?:\.\d+)?) MW\b/g, "$1 megawatts")
                 .replace(/(\d+(?:\.\d+)?) MJ\b/g, "$1 megajoules")
                 .replace(/(\d+) G\b/g, "$1 G");
    return { speaker: speaker, words: words };
  }

  function next() {
    if (!synth || speaking) return;
    var now = Date.now();
    while (queue.length && now - queue[0].at > MAX_AGE) queue.shift();
    var item = queue.shift();
    if (!item) return;
    var p = PROFILE[item.speaker] || PROFILE.Crew;
    var u = new SpeechSynthesisUtterance(item.words);
    var v = voiceFor(item.speaker);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.pitch = p.pitch; u.rate = p.rate; u.volume = volume;
    u.onend = u.onerror = function () { speaking = false; next(); };
    speaking = true;
    synth.speak(u);
  }

  BL.speech = {
    supported: !!synth,
    // Call from a tap: iPad Safari only allows speech once a gesture has started it.
    unlock: function () {
      if (!synth || unlocked) return;
      unlocked = true;
      var u = new SpeechSynthesisUtterance(" "); u.volume = 0;
      synth.speak(u);
      if (!voices.length) loadVoices();
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
    stop: function () { queue = []; if (synth) synth.cancel(); speaking = false; },
    setEnabled: function (on) { enabled = !!on; if (!enabled) this.stop(); },
    setVolume: function (v) { volume = v; }
  };
})(typeof window !== "undefined" ? window : globalThis);
