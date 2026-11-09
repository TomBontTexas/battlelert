/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert audio: every sound is synthesized from a recipe in BL.SOUNDS (bfxr-style).
   No sound files. Three volume channels: fx, alarm, chat. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var ctx = null, master = null, noiseBuf = null, hum = null;
  var vols = { fx: 0.8, alarm: 0.8, chat: 0.6 };
  var lastPlayed = {};
  // When Safari pauses the engine (the voices, another app's sound, the screen locking), the
  // next tap wakes it. wakeAt: when that was asked; a woken engine that is still not running
  // after REBUILD_MS is replaced by a new one (iPad can leave one stuck "interrupted").
  var wakeAt = 0, REBUILD_MS = 800, rebuilt = 0;
  // stale: the engine may say "running" yet be silent (iPad, after the screen locks, another app
  // or the page goes to the background; closing the tab was the only cure): the next tap replaces
  // it with a new one. Set when the page comes back into view, or when the watchdog finds a
  // "running" engine whose clock has stopped.
  // A rebuild waits REBUILD_GAP ms after the last one, and the watchdog needs two stopped checks
  // in a row: replacing engines quickly can crash Safari on the iPad.
  var stale = false, dogT = 0, dogWall = 0, dogMiss = 0, lastRebuild = 0, REBUILD_GAP = 3000;
  // Sounds playing at once (each a few audio nodes); past MAX_LIVE new effects are skipped (alarms
  // still play), so a heavy fight can't overload the iPad's audio.
  var live = 0, MAX_LIVE = 16;
  var MIN_GAP = { shot: 0.09, tick: 0.05, chatter: 0.25, shieldHit: 0.08, pulse: 0.06, shipHit: 0.05, torpLaunch: 0.12 };

  // iPad/iPhone: Safari mutes Web Audio in silent mode unless the page counts as media
  // playback. Newer Safari has navigator.audioSession; older ones switch over once an
  // <audio> element plays, so play a tiny silent clip on the first tap.
  var unlocked = false, silentUrl = null;
  function silentWavUrl() {
    if (silentUrl) return silentUrl;
    var n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    return (silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
  }
  function unlockMediaPlayback() {
    if (unlocked) return;
    unlocked = true;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    try {
      var el = document.createElement("audio");
      el.setAttribute("playsinline", ""); el.src = silentWavUrl(); el.volume = 0.01;
      var p = el.play(); if (p && p.catch) p.catch(function () { unlocked = false; });
    } catch (e) { unlocked = false; }
  }

  // Safe to call from any tap or keypress: creates the audio engine the first time and
  // wakes it again after Safari suspends or interrupts it (backgrounding, screen lock).
  function init() {
    if (ctx && Date.now() - lastRebuild > REBUILD_GAP && (stale || ctx.state !== "running" && wakeAt && Date.now() - wakeAt > REBUILD_MS)) drop();
    unlockMediaPlayback();
    if (ctx) { if (ctx.state !== "running") { wake(); speechUnlock(); } return; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // (the iPad suspends the engine around speech: try to wake it at once, not only on a tap)
    ctx.onstatechange = function () { if (!ctx) return; if (ctx.state === "running") wakeAt = 0; else if (ctx.state !== "closed") setTimeout(nudge, 300); };
    wakeAt = 0;
    if (ctx.state !== "running") wake();
    speechUnlock();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var ch = noiseBuf.getChannelData(0);
    for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }

  // Throw the engine away (the next init builds a new one, and plays the silent clip again).
  function drop() {
    try { ctx.close(); } catch (e) {}
    ctx = null; hum = null; humLast = null; rebuilt++; stale = false; unlocked = false; dogT = 0; dogWall = 0; dogMiss = 0;
    live = 0; lastRebuild = Date.now();
  }
  // Wake a suspended engine without a tap (after a voice line ends, or when it is suspended): the
  // iPad allows it for an engine a tap has started before, once speech has let go. Never while a
  // voice is speaking: waking the engine then cut the line off with a squawk (Nov 9, 2026); it
  // is tried again when the line ends.
  function nudge() {
    if (!ctx || ctx.state === "running" || ctx.state === "closed" || document.visibilityState !== "visible") return;
    var syn = root.speechSynthesis;
    if (syn && (syn.speaking || syn.pending)) return;
    try { var r = ctx.resume(); if (r && r.catch) r.catch(function () {}); } catch (e) {}
  }
  function wake() {
    if (!wakeAt) wakeAt = Date.now();
    try { var r = ctx.resume(); if (r && r.catch) r.catch(function () {}); } catch (e) {}
  }
  // (the voices are woken after the sound engine, and only when it is running: on iPad the
  // voices' silent wake-up line can pause the engine if it comes first)
  function speechUnlock() {
    if (!BL.speech) return;
    if (!ctx || ctx.state === "running") BL.speech.unlock();
    else setTimeout(function () { BL.speech.unlock(); }, 150);
  }

  function noiseSource(t0, dur) {
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
    return src;
  }

  // One sound: its nodes are all disconnected when it ends (Safari keeps connected nodes alive,
  // and they pile up over a long fight).
  function voice(r, t0, vol) {
    var dur = r.a + r.s + r.d, nodes = [], owner = ctx, over = false;
    live++;
    // (once only: from the sound's "ended" or, as Safari doesn't always send that, a timer)
    function done() {
      if (over) return; over = true;
      nodes.forEach(function (n) { try { n.disconnect(); } catch (e) {} });
      nodes.length = 0;
      if (ctx === owner && live > 0) live--;
    }
    setTimeout(done, 1000 * (Math.max(0, t0 - ctx.currentTime) + dur + 0.3));
    try { make(); } catch (e) { done(); }
    function make() {
    var env = ctx.createGain(); nodes.push(env);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(vol, t0 + r.a);
    env.gain.setValueAtTime(vol, t0 + r.a + r.s);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    env.connect(master);
    var f1 = Math.max(20, r.f1);
    if (r.wave === "noise") {
      var flt = ctx.createBiquadFilter(); flt.type = "lowpass"; flt.Q.value = 1.5; nodes.push(flt);
      flt.frequency.setValueAtTime(r.f0 * 4, t0);
      flt.frequency.exponentialRampToValueAtTime(f1 * 4, t0 + dur);
      var ns = noiseSource(t0, dur); nodes.push(ns); ns.onended = done;
      ns.connect(flt); flt.connect(env);
    } else {
      var osc = ctx.createOscillator(); osc.type = r.wave; nodes.push(osc);
      osc.frequency.setValueAtTime(r.f0, t0);
      osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      if (r.vib) {
        var lfo = ctx.createOscillator(), depth = ctx.createGain(); nodes.push(lfo, depth);
        lfo.frequency.value = r.vib.rate; depth.gain.value = r.f0 * r.vib.depth;
        lfo.connect(depth); depth.connect(osc.frequency);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      }
      osc.connect(env); osc.onended = done; osc.start(t0); osc.stop(t0 + dur + 0.05);
      if (r.noise) {
        var ng = ctx.createGain(); ng.gain.value = r.noise; nodes.push(ng);
        var ns2 = noiseSource(t0, dur); nodes.push(ns2);
        ns2.connect(ng); ng.connect(env);
      }
    }
    }
  }

  function play(name) {
    if (!ctx || ctx.state === "closed") return;
    // A paused engine still takes the sound (it plays the moment it wakes), but only just after
    // a tap has asked it to wake: sounds piled up over a long pause would all play at once.
    if (ctx.state !== "running" && !(wakeAt && Date.now() - wakeAt < REBUILD_MS)) return;
    var r = BL.SOUNDS[name]; if (!r) return;
    var vol = r.vol * (vols[r.ch] === undefined ? 1 : vols[r.ch]);
    if (vol <= 0.001) return;
    var now = ctx.currentTime;
    if (lastPlayed[name] && now - lastPlayed[name] < (MIN_GAP[name] || 0.03)) return;
    lastPlayed[name] = now;
    if (live >= MAX_LIVE && r.ch !== "alarm") return;
    var reps = r.repeat || 1, step = r.a + r.s + r.d + (r.gap || 0);
    for (var i = 0; i < reps; i++) voice(r, now + 0.005 + i * step, vol);
  }

  // Reactor hum: a low drone whose pitch and grit follow the load.
  function humStart() {
    if (!ctx || hum) return;
    var osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = "sawtooth"; osc2.type = "square"; osc.frequency.value = 48; osc2.frequency.value = 48.7;
    flt.type = "lowpass"; flt.frequency.value = 220; g.gain.value = 0;
    osc.connect(flt); osc2.connect(flt); flt.connect(g); g.connect(master);
    osc.start(); osc2.start();
    hum = { osc: osc, osc2: osc2, flt: flt, g: g }; humLast = null;
  }
  // Called every frame, but the hum is retuned at most every HUM_MS and only when the load, the
  // volume or on/off has changed: retuning it 60-120 times a second filled the iPad's audio with
  // scheduled changes until the hum, then every sound, went silent (Nov 9, 2026).
  var humLast = null, HUM_MS = 250;
  // humTest: the Sound test's hum load (% or null): while set, the game's own calls are ignored.
  var humTest = null;
  function humSet(loadPct, on, test) {
    if (humTest !== null && !test) return;
    if (!hum) { if (!ctx || !on) return; humStart(); if (!hum) return; }     // (a rebuilt engine starts its hum again)
    var p = Math.min(loadPct, 160) / 100, now = Date.now(), L = humLast;
    if (L && L.on === on && L.fx === vols.fx && (now - L.at < HUM_MS || Math.abs(p - L.p) < 0.03)) return;
    humLast = { p: p, on: on, fx: vols.fx, at: now };
    var t = ctx.currentTime;
    [[hum.osc.frequency, 40 + 22 * p, 0.3], [hum.osc2.frequency, 40.6 + 22 * p, 0.3], [hum.flt.frequency, 160 + 380 * p, 0.3],
     [hum.g.gain, on ? 0.05 * vols.fx * (0.6 + 0.6 * p) : 0, 0.15]].forEach(function (a) {
      // (start the new change from where it has got to)
      var v = a[0].value; a[0].cancelScheduledValues(t); a[0].setValueAtTime(v, t);
      a[0].setTargetAtTime(a[1], t, a[2]);
    });
  }

  // (touchend, click and keys only: Safari on the iPad doesn't count a finger going down as
  // leave to start sound, and an engine built then can say "running" yet stay silent)
  ["touchend", "click", "keydown"].forEach(function (type) {
    document.addEventListener(type, function () { if (!ctx || stale || ctx.state !== "running") init(); }, true);
  });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && ctx) stale = true; });
  root.addEventListener("pageshow", function (ev) { if (ev.persisted && ctx) stale = true; });
  setInterval(function () {
    if (!ctx || ctx.state !== "running" || document.visibilityState !== "visible") { dogT = 0; dogWall = 0; return; }
    var now = Date.now(), t = ctx.currentTime;
    dogMiss = dogWall && now - dogWall > 1500 && t - dogT < 0.5 ? dogMiss + 1 : 0;
    if (dogMiss >= 2) stale = true;
    dogT = t; dogWall = now;
  }, 2000);

  BL.audio = {
    init: init,
    nudge: nudge,
    // The "Restart sound" button (pause, Options): a new engine now (it runs in the tap).
    restart: function () { if (ctx && Date.now() - lastRebuild > REBUILD_GAP) drop(); init(); },
    play: play,
    humStart: humStart,
    humSet: humSet,
    // For the Options screen: what state the sound engine is in.
    // The Sound test: one sound (skipping the repeat gap), the hum at a load (null: back to the game).
    test: function (name) { lastPlayed[name] = 0; play(name); },
    humTest: function (pct) {
      humTest = pct; humLast = null;
      if (pct === null) { humSet(0, false, true); return; }
      humSet(pct, true, true);
    },
    // For the Sound test: the engine's state, its clock and how many sounds are playing.
    info: function () {
      return !ctx ? "Sound engine: not started." : "Sound engine: " + ctx.state + (rebuilt ? " (restarted " + rebuilt + "×)" : "") + " · clock " + ctx.currentTime.toFixed(1) + " s · " + live + " of " + MAX_LIVE + " sounds playing · hum " + (hum ? (humLast && humLast.on ? "on" : "off") : "not started") + ".";
    },
    status: function () { return !ctx ? "not started" : ctx.state + (rebuilt ? " (restarted " + rebuilt + "×)" : "") + ", " + live + " sounds playing"; },
    setVolume: function (ch, v) { vols[ch] = v; },
    volumes: vols
  };
})(typeof window !== "undefined" ? window : globalThis);
