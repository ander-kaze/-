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
  let ac = null, master = null, vol = 0.7, bgmVol = 0.7, bgm = null;   // vol＝遊戲音效音量；bgmVol＝BGM 音量（兩者分開調整）
  const ctx = () => {
    if (!ac) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (A) {
        ac = new A(); master = ac.createGain(); master.gain.value = vol;
        const sh = ac.createWaveShaper(), cv = new Float32Array(2048); for (let k = 0; k < cv.length; k++) cv[k] = Math.tanh((k / (cv.length - 1) * 2 - 1) * 1.6) / Math.tanh(1.6) * .92;   // 柔性限幅（tanh）：音效放大後疊在一起也不會破音，又不像壓縮器那樣把短促的音壓小
        sh.curve = cv; sh.oversample = '2x'; master.connect(sh); sh.connect(ac.destination);
      }
    }
    return ac;
  };
  // ----- 音色零件：全部用正弦泛音（鐘、木琴、豎琴）與濾波雜訊（揮砍、風聲、鈸）、正弦下滑（鼓），沒有方波／鋸齒波，不會有電子音 -----
  let noiseBuf = null;
  const now = () => ctx().currentTime;
  function part(f, d, v, t, a = .004, to = f) {   // 一個正弦泛音：a 秒淡入後指數衰減 d 秒；to ≠ f 時音高滑動
    const a_ = ctx(), o = a_.createOscillator(), g = a_.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); if (to !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + a + d);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
    o.connect(g).connect(master); o.start(t); o.stop(t + a + d + .05);
  }
  function noise(d, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, v = .2, delay = 0, a = .004, swell = false } = {}) {   // 濾波雜訊：頻率由 f0 掃到 f1；swell＝慢慢變大（鈸、風）
    const A = ctx(); if (!A) return;
    if (!noiseBuf) { noiseBuf = A.createBuffer(1, A.sampleRate * 2, A.sampleRate); const ch = noiseBuf.getChannelData(0); for (let k = 0; k < ch.length; k++) ch[k] = Math.random() * 2 - 1; }
    const t = A.currentTime + delay, src = A.createBufferSource(), fl = A.createBiquadFilter(), g = A.createGain();
    src.buffer = noiseBuf; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(.0001, t);
    if (swell) { g.gain.linearRampToValueAtTime(v, t + d * .8); g.gain.exponentialRampToValueAtTime(.0001, t + d); }
    else { g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
    src.connect(fl).connect(g).connect(master); src.start(t, Math.random() * 1.2); src.stop(t + d + a + .05);
  }
  function tone(f, d, { type = 'sine', vol: v = 0.1, to = f, delay = 0 } = {}) {   // 原本的振盪器音（攻擊、警告沿用原音效）
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
  const bell = (f, d, v = .2, delay = 0) => { const t = now() + delay; part(f, d, v, t); part(f * 2.76, d * .5, v * .35, t); part(f * 5.4, d * .22, v * .15, t); };   // 鐘琴／風鈴：非整數倍泛音，亮而且餘韻長
  const marimba = (f, d, v = .3, delay = 0) => { const t = now() + delay; part(f, d, v, t, .002); part(f * 4, d * .18, v * .3, t, .002); };   // 木琴：短促圓潤
  const harp = (f, d, v = .2, delay = 0) => { const t = now() + delay; part(f, d, v, t, .003); part(f * 2, d * .55, v * .4, t); part(f * 3, d * .3, v * .2, t); };   // 豎琴：撥弦、柔和
  const thump = (f0, f1, d, v = .5, delay = 0) => part(f0, d, v, now() + delay, .002, f1);   // 大鼓：低音正弦快速下滑
  // ----- BGM 曲目清單 -----
  // 瀏覽器讀不到資料夾內容，所以依序嘗試：① AUDIO_FILES.bgm 指定單曲 ② 資料夾內的 list.json 或 list.js（雙擊開檔 file:// 只能用 list.js）（["a.mp3","b.mp3"]；用 make-bgm-list.js 一鍵產生） ③ 伺服器的資料夾索引頁 ④ BGM_FALLBACK
  const BGM_DIRS = ['assets/bgm/', 'asset/bgm/'], BGM_FALLBACK = [], BGM_EXT = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i;
  let bgmToken = 0, bgmCache = null;
  const stopCurrent = () => { if (bgm) { bgm.pause(); bgm.src = ''; bgm = null; } };
  const warn = m => { console.warn('[BGM] ' + m); if (typeof toast === 'function') toast(m); };
  const loadListJs = dir => new Promise(res => {   // list.js 內容：window.BGM_LIST = ["a.mp3", "b.mp3"];
    if (typeof document === 'undefined') return res([]);
    const sc = document.createElement('script'); sc.src = dir + 'list.js?' + Date.now();
    sc.onload = () => { sc.remove(); const l = window.BGM_LIST; window.BGM_LIST = null; res(Array.isArray(l) ? l.filter(n => typeof n === 'string') : []); };
    sc.onerror = () => { sc.remove(); res([]); };
    document.head.append(sc);
  });
  async function scanDir(dir) {
    let names = [];
    try { const r = await fetch(dir + 'list.json', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); names = (Array.isArray(j) ? j : j.files || []).filter(n => typeof n === 'string'); } } catch (e) {}
    if (!names.length) try { const r = await fetch(dir, { cache: 'no-cache' }); if (r.ok && /text\/html/.test(r.headers.get('content-type') || '')) names = [...(await r.text()).matchAll(/href="([^"?#]+)"/gi)].map(m => { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }); } catch (e) {}
    if (!names.length) names = await loadListJs(dir);   // 直接雙擊 index.html（file://）時 fetch 會被瀏覽器擋，改用 <script> 載入 list.js
    return [...new Set(names.map(n => n.split('/').pop()).filter(n => BGM_EXT.test(n)))].map(n => dir + encodeURIComponent(n));
  }
  async function bgmWhy(src, e) {   // 判斷失敗原因：檔案不存在（路徑／檔名／大小寫不符）還是格式不支援
    const name = decodeURIComponent(src.split('/').pop());
    try { const r = await fetch(src, { method: 'HEAD' }); if (!r.ok) return `${name} 找不到（HTTP ${r.status}），請檢查檔名與大小寫`; } catch (x) { return `${name} 讀取失敗，請檢查檔名／路徑（副檔名要和實際檔案一致）`; }
    return `${name} 格式瀏覽器不支援或檔案損壞（${e && e.name || '未知錯誤'}）`;
  }
  async function bgmScan() {
    if (AUDIO_FILES.bgm) return [AUDIO_FILES.bgm];
    if (bgmCache) return bgmCache;
    for (const d of BGM_DIRS) { const l = await scanDir(d); if (l.length) return (bgmCache = l); }
    if (BGM_FALLBACK.length) return (bgmCache = BGM_FALLBACK.map(n => BGM_DIRS[0] + encodeURIComponent(n)));
    warn('找不到 BGM：請在 assets/bgm/ 放 list.js 或 list.json');
    return [];
  }
  // 每個音效的設計（用音色、音高走向、長度做出區別，閉上眼睛也分得出來）：
  //  orb 吃球＝木琴「滴」（音高隨連吃往上）　chain 連擊＋1＝鐘琴雙音「叮鈴」　attack 角色出手＝原音效（鋸齒波下滑）　skill 技能＝鼓＋風聲上升＋鐘琴和弦＋鈸
  //  fever＝大鼓＋鈸漸強＋鐘琴快速上行＋收尾和弦　win 通關＝木琴旋律＋鐘＋鼓　lose 失敗＝木琴下行＋低鼓　hit 被打＝悶鼓「咚」　boom 落地爆炸＝低鼓＋轟隆
  //  pop 地鼠／冰碎＝「啵」　jump 跳躍＝輕風「呼」　dodge 閃避＝風聲＋小鈴「咻叮」　warn 警告＝原音效（兩聲方波嗶）　heal 回復＝豎琴上行　gacha 抽獎＝鐘琴上行＋風鈴沙沙
  const ATK_VOL = .6, WARN_VOL = .32;   // 攻擊／警告的音量（想再大或小只改這兩個數字）
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  const synth = {
    jump()   { noise(.16, { f0: 500, f1: 1500, q: .8, v: .3, a: .035 }); part(280, .14, .2, now(), .025, 430); },
    orb(n=0) { const f = PENTA[Math.min(n, 5)]; marimba(f, .3, .5); bell(f * 2, .35, .1); },
    chain()  { bell(1046.5, .7, .5); bell(1568, .9, .5, .09); bell(2093, .5, .2, .18); },
    attack() { tone(260, 0.25, { type: 'sawtooth', vol: ATK_VOL, to: 70 }); },   // 還原為原本的音效；ATK_VOL 是音量（原本 0.09，調到和其他音效、音樂相稱）
    skill()  { thump(110, 40, .5, .7); noise(.55, { type: 'lowpass', f0: 300, f1: 4500, v: .4, swell: true }); thump(160, 55, .35, .55, .52); noise(.6, { type: 'highpass', f0: 5000, v: .22, delay: .52 }); [523.25, 783.99, 1046.5].forEach((f, k) => bell(f, 1, .26, .52 + k * .03)); },
    hit()    { thump(150, 45, .32, .9); noise(.2, { type: 'lowpass', f0: 900, f1: 180, v: .8, a: .002 }); },
    pop()    { part(240, .1, .8, now(), .002, 520); noise(.04, { f0: 2600, q: 2, v: .5, a: .001 }); },
    boom()   { thump(90, 30, .7, 1); noise(.65, { type: 'lowpass', f0: 1200, f1: 120, v: .9, a: .01 }); },
    fever()  { thump(70, 40, .7, .7); noise(.9, { type: 'highpass', f0: 800, f1: 6500, v: .32, swell: true }); [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, k) => bell(f, .9, .28, .08 + k * .11)); thump(95, 45, .5, .6, .72); noise(.8, { type: 'highpass', f0: 6000, v: .26, delay: .72 }); [1046.5, 1318.5, 1568].forEach(f => bell(f, 1.3, .24, .72)); },
    win()    { [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => marimba(f, .5, .38, k * .16)); [523.25, 659.25, 783.99, 1046.5].forEach(f => bell(f, 1.5, .22, .64)); thump(98, 55, .5, .55, .64); },
    lose()   { [392, 329.6, 261.6].forEach((f, k) => marimba(f, .7, .38, k * .3)); thump(80, 32, 1, .6, .65); },
    heal()   { harp(659.25, .9, .24); harp(783.99, .9, .24, .07); harp(1046.5, 1.1, .24, .14); },
    gacha()  { PENTA.concat([1174.7, 1318.5]).forEach((f, k) => bell(f, .55, .16 + k * .02, k * .1)); noise(1, { type: 'highpass', f0: 2500, f1: 9000, v: .14, swell: true }); },
    dodge()  { noise(.24, { f0: 700, f1: 3600, q: 1.5, v: .9, a: .03 }); bell(1760, .3, .25, .1); },
    warn()   { seq([300, 300], 0.2, { type: 'square', vol: WARN_VOL }); },   // 還原為原本的音效；WARN_VOL 原本 0.06
  };
  const api = {
    unlock() { const a = ctx(); if (a && a.state === 'suspended') a.resume(); },
    setVolume(v) { vol = v; if (master) master.gain.value = v; },   // 遊戲音效音量（0~1）
    setBgmVolume(v) { bgmVol = v; if (bgm) bgm.volume = v * 0.5; },   // BGM 音量（0~1）；實際播放音量再 ×0.5
    // 關卡 BGM：按「出發」時呼叫。從 BGM_DIR 隨機挑一首，單曲循環到 stopBgm()（離開關卡）為止
    async playBgm() {
      const my = ++bgmToken; stopCurrent();
      let list = await bgmScan(); if (my !== bgmToken) return;   // 掃描期間若已離開關卡就不播
      const fails = [];
      while (list.length) {
        const src = list[Math.floor(Math.random() * list.length)], au = new Audio(src);
        au.loop = true; au.volume = bgmVol * 0.5; bgm = au;
        try { await au.play(); return; }
        catch (e) {
          if (my !== bgmToken) return;
          if (e && e.name === 'NotAllowedError') { const go = () => { if (my === bgmToken && bgm === au) au.play().catch(() => {}); }; addEventListener('pointerdown', go, { once: true }); addEventListener('keydown', go, { once: true }); return; }   // 瀏覽器擋自動播放：下一次點擊／按鍵再播
          const why = await bgmWhy(src, e); fails.push(why); console.warn('[BGM] 播放失敗：' + why);
          list = list.filter(s => s !== src); bgmCache = list.length ? list : null;   // 這首讀不到或壞檔：換一首
        }
      }
      bgm = null; if (fails.length && my === bgmToken) warn('BGM 無法播放：' + fails[0] + (fails.length > 1 ? `（共 ${fails.length} 首失敗）` : ''));
    },
    stopBgm() { bgmToken++; stopCurrent(); },
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
