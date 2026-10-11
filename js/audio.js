/* Battlelert audio: every sound is synthesized from a recipe in BL.SOUNDS (bfxr-style).
   No sound files. Three volume channels: fx, alarm, chat. */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};
  var ctx = null, master = null, noiseBuf = null, hum = null;
  var vols = { fx: 0.8, alarm: 0.8, chat: 0.6 };
  var lastPlayed = {};
  var MIN_GAP = { shot: 0.09, tick: 0.05, chatter: 0.25, shieldHit: 0.08 };

  // iPad/iPhone: Safari mutes Web Audio in silent mode unless the page counts as media
  // playback. Newer Safari has navigator.audioSession; older ones switch over once an
  // <audio> element plays, so play a tiny silent clip on the first tap.
  var unlocked = false;
  function silentWavUrl() {
    var n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
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
    unlockMediaPlayback();
    if (BL.speech) BL.speech.unlock();
    if (ctx) { if (ctx.state !== "running" && ctx.state !== "closed") ctx.resume(); return; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (ctx.state !== "running") ctx.resume();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var ch = noiseBuf.getChannelData(0);
    for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }

  function noiseSource(t0, dur) {
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
    return src;
  }

  function voice(r, t0, vol) {
    var dur = r.a + r.s + r.d;
    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(vol, t0 + r.a);
    env.gain.setValueAtTime(vol, t0 + r.a + r.s);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    env.connect(master);
    var f1 = Math.max(20, r.f1);
    if (r.wave === "noise") {
      var flt = ctx.createBiquadFilter(); flt.type = "lowpass"; flt.Q.value = 1.5;
      flt.frequency.setValueAtTime(r.f0 * 4, t0);
      flt.frequency.exponentialRampToValueAtTime(f1 * 4, t0 + dur);
      noiseSource(t0, dur).connect(flt); flt.connect(env);
    } else {
      var osc = ctx.createOscillator(); osc.type = r.wave;
      osc.frequency.setValueAtTime(r.f0, t0);
      osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      if (r.vib) {
        var lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = r.vib.rate; depth.gain.value = r.f0 * r.vib.depth;
        lfo.connect(depth); depth.connect(osc.frequency);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      }
      osc.connect(env); osc.start(t0); osc.stop(t0 + dur + 0.05);
      if (r.noise) {
        var ng = ctx.createGain(); ng.gain.value = r.noise;
        noiseSource(t0, dur).connect(ng); ng.connect(env);
      }
    }
  }

  function play(name) {
    if (!ctx || ctx.state !== "running") return;
    var r = BL.SOUNDS[name]; if (!r) return;
    var vol = r.vol * (vols[r.ch] === undefined ? 1 : vols[r.ch]);
    if (vol <= 0.001) return;
    var now = ctx.currentTime;
    if (lastPlayed[name] && now - lastPlayed[name] < (MIN_GAP[name] || 0.03)) return;
    lastPlayed[name] = now;
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
    hum = { osc: osc, osc2: osc2, flt: flt, g: g };
  }
  function humSet(loadPct, on) {
    if (!hum) return;
    var t = ctx.currentTime, p = Math.min(loadPct, 160) / 100;
    hum.osc.frequency.setTargetAtTime(40 + 22 * p, t, 0.3);
    hum.osc2.frequency.setTargetAtTime(40.6 + 22 * p, t, 0.3);
    hum.flt.frequency.setTargetAtTime(160 + 380 * p, t, 0.3);
    hum.g.gain.setTargetAtTime(on ? 0.05 * vols.fx * (0.6 + 0.6 * p) : 0, t, 0.15);
  }

  ["pointerdown", "touchend", "keydown"].forEach(function (type) {
    document.addEventListener(type, function () { if (!ctx || ctx.state !== "running") init(); }, true);
  });

  BL.audio = {
    init: init,
    play: play,
    humStart: humStart,
    humSet: humSet,
    setVolume: function (ch, v) { vols[ch] = v; },
    volumes: vols
  };
})(typeof window !== "undefined" ? window : globalThis);
