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
    // 關卡 BGM：按「出發」時呼叫。從 BGM_DIR 隨機挑一首，單曲循環到 stopBgm()（離開關卡）為止
    async playBgm() {
      const my = ++bgmToken; stopCurrent();
      let list = await bgmScan(); if (my !== bgmToken) return;   // 掃描期間若已離開關卡就不播
      const fails = [];
      while (list.length) {
        const src = list[Math.floor(Math.random() * list.length)], au = new Audio(src);
        au.loop = true; au.volume = vol * 0.5; bgm = au;
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
