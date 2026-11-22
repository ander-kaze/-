'use strict';
/* =====================================================================
   音效：預設用 WebAudio 即時合成，不需要音檔。
   ★ 要換成自己的素材：把檔案放進 assets/audio/，在下面填路徑即可（沒填的仍用合成音）。
   可用名稱：jump orb chain attack skill hit pop boom fever win lose heal gacha dodge warn；bgm 為背景音樂（循環）
   ===================================================================== */
const AUDIO_FILES = {
  // jump: 'assets/audio/jump.mp3',
  // orb: 'assets/audio/orb.mp3',
  bgm: '',
};

const SFX = (() => {
  let ac = null, master = null, vol = 0.7, bgm = null;
  const ctx = () => {
    if (!ac) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (A) { ac = new A(); master = ac.createGain(); master.gain.value = vol; master.connect(ac.destination); }
    }
    return ac;
  };
  function tone(f, d, { type = 'sine', vol: v = 0.1, to = f, delay = 0 } = {}) {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + d);
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + d);
  }
  const seq = (freqs, d, o) => freqs.forEach((f, i) => tone(f, d, { ...o, delay: i * 0.09 }));
  const synth = {
    jump()   { tone(300, 0.15, { type: 'square', vol: 0.05, to: 600 }); },
    orb(n=0) { tone(660 + Math.min(n, 5) * 50, 0.08, { vol: 0.08 }); },
    chain()  { seq([880, 1320], 0.15, { vol: 0.1 }); },
    attack() { tone(260, 0.25, { type: 'sawtooth', vol: 0.09, to: 70 }); },
    skill()  { seq([200, 300, 450, 700], 0.35, { type: 'sawtooth', vol: 0.12, to: 50 }); },
    hit()    { tone(160, 0.25, { type: 'square', vol: 0.1, to: 40 }); },
    pop()    { tone(180, 0.1, { type: 'triangle', vol: 0.1, to: 420 }); },
    boom()   { tone(500, 0.3, { type: 'sawtooth', vol: 0.06, to: 90 }); },
    fever()  { seq([523, 659, 784, 1047], 0.22, { vol: 0.1 }); },
    win()    { seq([523, 659, 784, 1047, 1319], 0.3, { vol: 0.12 }); },
    heal()   { seq([660, 880], 0.12, { vol: 0.08 }); },
    gacha()  { seq([523, 659, 784, 1047, 1319], 0.18, { vol: 0.1 }); },
    dodge()  { tone(900, 0.2, { type: 'triangle', vol: 0.1, to: 1500 }); },
    warn()   { seq([300, 300], 0.2, { type: 'square', vol: 0.06 }); },
    lose()   { tone(400, 0.8, { type: 'triangle', vol: 0.12, to: 60 }); },
  };
  const api = {
    unlock() { const a = ctx(); if (a && a.state === 'suspended') a.resume(); },
    setVolume(v) { vol = v; if (master) master.gain.value = v; if (bgm) bgm.volume = v * 0.5; },
    playBgm() { if (!AUDIO_FILES.bgm) return; if (!bgm) { bgm = new Audio(AUDIO_FILES.bgm); bgm.loop = true; } bgm.volume = vol * 0.5; bgm.play().catch(() => {}); },
    stopBgm() { if (bgm) bgm.pause(); },
  };
  for (const name in synth) {
    api[name] = (...args) => {
      if (vol <= 0) return;
      const file = AUDIO_FILES[name];
      if (file) { const au = new Audio(file); au.volume = vol; au.play().catch(() => {}); }
      else synth[name](...args);
    };
  }
  return api;
})();
