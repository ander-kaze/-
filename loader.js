'use strict';
/* =====================================================================
   陣躍出擊 — loader.js（首次載入：預載圖片，讀完才進入主選單）
   - 圖片清單由 CHARACTERS（頭像／立繪）與 DUNGEONS（副本圖／敵人圖）自動蒐集，新增內容不必改這裡
   - 畫面會顯示進度條、百分比，以及目前正在載入的項目（例如「正在載入：祝你順心 楠雪（敵人立繪）」）
   - 載入結果寫進 script.js 的圖片快取 IMG：遊戲畫面（Canvas）之後取圖是即時的，不會再出現「圖還沒到」的預設圖
   - 檔案不存在（還沒放素材）或載入失敗只會略過，不會卡住；單張圖 20 秒沒回應也直接放行
   - 網路很慢時，8 秒後會出現「略過」按鈕，沒載完的圖會繼續在背景載
   ★ 載入順序：必須在 script.js 之後（要用到 CHARACTERS、DUNGEONS、IMG、show）
   ===================================================================== */
(() => {
  const CONCURRENCY = 6;      // 同時下載張數
  const IMG_TIMEOUT = 20000;  // 單張圖等多久就放行(ms)
  const SKIP_AFTER = 8000;    // 多久後顯示「略過」(ms)

  const fill = $('#load-fill'), text = $('#load-text'), item = $('#load-item'), bar = $('#load-bar'), skip = $('#load-skip');
  let entered = false;
  const enter = () => { if (entered) return; entered = true; show('title'); };

  // 蒐集所有要預載的圖（去重），回傳 [[路徑, 顯示名稱], …]；同一張圖以先出現的名稱為準
  function collect() {
    const map = new Map([['assets/title.png', '標題圖']]);   // 主選單標題圖
    const add = (src, label) => { if (src && !map.has(src)) map.set(src, label); };
    CHARACTERS.forEach(c => { add(c.icon, `${c.name}（頭像）`); add(c.portrait, `${c.name}（立繪）`); });
    DUNGEONS.forEach(d => {
      add(d.image, `${d.name}（副本圖）`);
      d.stages.forEach(s => (s.waves || []).forEach(w => { add(w.image, `${w.name}（敵人圖示）`); add(w.portrait, `${w.name}（敵人立繪）`); }));
    });
    return [...map];
  }

  // 載入單張並放進 IMG 快取；不論成功、失敗、逾時都會 resolve（不阻擋流程）
  function loadOne(src) {
    return new Promise(resolve => {
      const old = IMG[src];
      if (old && old.ok) return resolve();
      const e = IMG[src] = { i: new Image(), ok: false };
      let settled = false;
      const finish = () => { if (settled) return; settled = true; clearTimeout(tm); resolve(); };
      const tm = setTimeout(finish, IMG_TIMEOUT);   // 逾時只放行；若圖之後才到，onload 仍會把 ok 設為 true
      e.i.onload = () => {
        e.ok = true;
        // 先解碼再放行，進遊戲第一次繪製時才不會卡頓；不支援 decode 的瀏覽器直接放行
        (e.i.decode ? e.i.decode() : Promise.resolve()).catch(() => {}).then(finish);
      };
      e.i.onerror = finish;
      e.i.src = src;
    });
  }

  function setProgress(done, total) {
    const pct = total ? Math.floor(done / total * 100) : 100;
    fill.style.width = pct + '%';
    text.textContent = `載入中… ${pct}%（${done}/${total}）`;
    bar.setAttribute('aria-valuenow', pct);
  }

  async function run() {
    const list = collect(), total = list.length;
    let done = 0, next = 0;
    setProgress(0, total);
    const tmSkip = setTimeout(() => { skip.hidden = false; }, SKIP_AFTER);
    skip.onclick = enter;
    const worker = async () => {
      while (next < list.length) {   // 按了「略過」之後也會繼續載完，只是不再擋住畫面
        const [src, label] = list[next++];
        item.textContent = `正在載入：${label}`;   // 同時有多張在下載時，顯示最新開始的那一張
        await loadOne(src);
        setProgress(++done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    clearTimeout(tmSkip);
    text.textContent = '載入完成'; item.textContent = '準備進入遊戲…';
    setTimeout(enter, 200);   // 讓「100%」停一下再切畫面
  }

  run().catch(err => { console.error('預載失敗，直接進入遊戲', err); enter(); });
})();
