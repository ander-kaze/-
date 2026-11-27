'use strict';
/* =====================================================================
   BGM：進入遊玩畫面（按「出發」）時，從 assets/bgm/ 隨機挑一首，單曲循環；離開遊玩畫面（離開關卡／回編成）就停止。
   「再挑戰」不會換歌。完全獨立：不需要改 script.js，也不依賴 audio.js 內的 BGM 程式。
   ★ 載入位置：index.html 裡 script.js 之後、loader.js 之前：<script src="bgm.js"></script>
   ★ 曲目清單（瀏覽器讀不到資料夾內容，所以要寫清單）：assets/bgm/list.js
       window.BGM_LIST = ["a.mp3", "b.ogg"];
     也支援 list.json（["a.mp3","b.ogg"]，只有透過網站伺服器開啟時可用）。檔名要和實際檔案完全一致（含大小寫與副檔名）。
   ===================================================================== */
(() => {
  const DIRS = ['assets/bgm/', 'asset/bgm/'], EXT = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i, GAIN = 0.5;   // GAIN：BGM 音量 = 設定音量 × 0.5
  let vol = 0.7, cur = null, token = 0, cache = null, busy = false, inGame = false;
  const volume = () => Math.max(0, Math.min(1, (typeof save !== 'undefined' && save.settings && save.settings.volume != null ? save.settings.volume : vol) * GAIN));
  const warn = m => { console.warn('[BGM] ' + m); if (typeof toast === 'function') toast(m); };
  const prevSet = SFX.setVolume;
  SFX.setVolume = v => { vol = v; if (cur) cur.volume = volume(); return prevSet && prevSet.call(SFX, v); };

  const loadJs = dir => new Promise(res => {   // 雙擊 index.html（file://）時 fetch 會被擋，用 <script> 載入 list.js
    const sc = document.createElement('script'); sc.src = dir + 'list.js?' + Date.now();
    sc.onload = () => { sc.remove(); const l = window.BGM_LIST; window.BGM_LIST = null; res(Array.isArray(l) ? l : []); };
    sc.onerror = () => { sc.remove(); res([]); };
    document.head.append(sc);
  });
  async function scan(dir) {
    let names = await loadJs(dir);
    if (!names.length) try { const r = await fetch(dir + 'list.json', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); names = Array.isArray(j) ? j : j.files || []; } } catch (e) {}
    return [...new Set(names.filter(n => typeof n === 'string').map(n => n.split('/').pop()).filter(n => EXT.test(n)))].map(n => dir + encodeURIComponent(n));
  }
  async function tracks() {
    if (cache) return cache;
    for (const d of DIRS) { const l = await scan(d); if (l.length) return (cache = l); }
    warn('找不到 BGM：請在 assets/bgm/ 放 list.js（內容：window.BGM_LIST = ["a.mp3"];）');
    return [];
  }
  const halt = () => { if (cur) { cur.pause(); cur.src = ''; cur = null; } };
  async function why(src, e) {
    const name = decodeURIComponent(src.split('/').pop());
    if (location.protocol !== 'file:') try { const r = await fetch(src, { method: 'HEAD' }); if (!r.ok) return `${name} 找不到（HTTP ${r.status}），請檢查檔名與大小寫`; } catch (x) {}
    return `${name} 無法播放（${e && e.name || '未知錯誤'}）：檔名／副檔名要和實際檔案一致，格式需為瀏覽器支援`;
  }
  async function start() {
    const my = ++token; halt(); busy = true;
    try {
      let list = await tracks(); if (my !== token) return;
      const fails = [];
      while (list.length) {
        const src = list[Math.floor(Math.random() * list.length)], au = new Audio(src);
        au.loop = true; au.volume = volume(); cur = au;
        try { await au.play(); return; }
        catch (e) {
          if (my !== token) return;
          if (e && e.name === 'NotAllowedError') { const go = () => { if (my === token && cur === au) au.play().catch(() => {}); }; addEventListener('pointerdown', go, { once: true }); addEventListener('keydown', go, { once: true }); return; }   // 瀏覽器擋自動播放：下一次點擊／按鍵再播
          const m = await why(src, e); fails.push(m); console.warn('[BGM] ' + m);
          list = list.filter(s => s !== src);
        }
      }
      cur = null;
      if (fails.length && my === token) warn('BGM 無法播放：' + fails[0] + (fails.length > 1 ? `（共 ${fails.length} 首失敗）` : ''));
    } finally { if (my === token) busy = false; }
  }
  const stop = () => { token++; busy = false; halt(); };
  SFX.playBgm = () => { if (!busy && !cur) start(); };   // 已在播放（或正在挑歌）就不重複觸發
  SFX.stopBgm = stop;

  // 依畫面切換自動控制：進入 game 畫面 → 播；切到任何其他畫面 → 停
  if (typeof show === 'function') {
    const prevShow = show;
    window.show = function (id) {
      const r = prevShow.apply(this, arguments);
      if (id === 'game') { if (!inGame) { inGame = true; SFX.playBgm(); } }
      else if (inGame) { inGame = false; stop(); }
      return r;
    };
  } else console.warn('[BGM] 找不到 show()：請確認 bgm.js 放在 script.js 之後');
})();
