'use strict';
/* =====================================================================
   陣躍出擊 — mapgen.js（地圖生成）
   內容：畫布／物理常數、二段跳軌跡規劃、三層地面判定、跑速、隨機區段生成 gen()、Fever 地圖、敵人預備時的收尾（windDown／exitSafe）
   依賴（呼叫時才會用到，載入時不會）：script.js 的 CFG、r／R20／pick、EL5、status、scroll、chain、enemy、team 等；dungeons.js 的 DEFAULT_MAP
   地圖狀態（gaps／orbs／moles／fires／arrows／ices／cur／L…）宣告在本檔，由 script.js 的 reset()／update() 讀寫
   ===================================================================== */

/* ----- 地圖狀態 ----- */
let soloLane = -1;   // 單層地圖時只保留的那一層（-1 = 三層都在）
let laneOn = [false, false, true], windX = 0, genFrom = -1, gaps, orbs, moles, fires, arrows, ices, cur, L, first, segIdx = 0, genPause = false;

/* ----- 畫布尺寸與物理常數、二段跳軌跡 ----- */
const W = 960, H = 480,                    // 畫布邏輯尺寸（2:1）；CSS 只負責等比放大，邏輯座標固定
   PX = Math.round(W * .177),              // 玩家的水平位置（畫布寬的 17.7%）
   TEAM_H = Math.round(H * .125),          // 下方隊伍列高度（畫布高的 12.5%）
   GR = 2400, V0 = 900, PH = 56, T = 2 * V0 / GR;   // 物理（世界單位，不跟畫布比例走）：重力、起跳速度、角色高度
// 版面由下往上推算：隊伍列在最底；最下層地面貼在隊伍列上方（只留一小條虛空），其上每層相隔 LANE_GAP（跳躍物理要用，是世界單位）
const PANEL_Y = H - TEAM_H, GROUND_H = 22, VOID_GAP = Math.round(H * .0167), LANE_GAP = 100;
const LY = [0, 1, 2].map(l => PANEL_Y - VOID_GAP - GROUND_H - (2 - l) * LANE_GAP);   // 三層地面的高度（畫布 480 高時＝190／290／390）
const LOSE_Y = LY[2] + 90;   // 掉到這裡算掉入虛空（潛水時玩家會畫在隊伍列上方，見 draw()）

const AIR_CEIL = LY[0] - 10;   // 二段跳的頂點上限＝最上層地面（從最下層起跳、再二段跳，頂點剛好碰到第三層平面；多留 10px 抵銷逐格積分的誤差，確保一定踩得到）
// 二段跳向上的速度：基本力道，但不會高過「剛好頂到上限」所需的速度。在虛空裡（低於最下層）按下就是完整力道，可以補救
const airUp = y => Math.min(V0 * CFG.AIR_JUMP_POWER, Math.sqrt(2 * GR * Math.max(0, y - AIR_CEIL)));
// 規劃一條「從地面 Y 起跳、tp 秒時二段跳」的軌跡（規則與 updatePlayer 完全一致），用來放能量球與計算缺口寬度。h(t)：離地高度；tl：落回 Y 的總時間
function airPlan(Y, tp) {
  const h1 = V0 * tp - .5 * GR * tp * tp, vy1 = V0 - GR * tp, up = airUp(Y - h1);
  if (CFG.AIR_JUMPS < 1 || up <= vy1 + 30) return null;
  return { tp, tl: tp + (up + Math.sqrt(up * up + 2 * GR * h1)) / GR, h: t => t <= tp ? V0 * t - .5 * GR * t * t : h1 + up * (t - tp) - .5 * GR * (t - tp) ** 2 };
}
const airBest = Y => { let b = null; for (let tp = .05; tp < T; tp += .01) { const p = airPlan(Y, tp); if (p && (!b || p.tl > b.tl)) b = p; } return b; };   // 滯空最久（跳最遠）的按法
// 規劃「走出最下層缺口、沒跳、掉進虛空 tp 秒後二段跳補救」的軌跡：dep(t)＝腳比地面低多少；tL＝回到地面高度的時間（掉到 90px 就算掉入虛空，所以 tp 要小於 0.27）
function divePlan(tp) {
  const u = V0 * CFG.AIR_JUMP_POWER, d1 = .5 * GR * tp * tp, tL = tp + (u + Math.sqrt(Math.max(0, u * u - 2 * GR * d1))) / GR;
  return { tp, tL, dep: t => t <= tp ? .5 * GR * t * t : d1 - u * (t - tp) + .5 * GR * (t - tp) ** 2 };
}

const ARROW_SP = W + 240;   // 箭矢出現點：觸發位置右側 1200px（畫面外，右緣會先出現預警標記）

// 地面判定：gaps 裡的 off 缺口代表「該層根本還沒出現／已收掉」；一般缺口（陷阱）在防護罩期間會被忽略（不會掉入虛空），但 off 缺口不會
const solid = (l, x) => soloLane >= 0 ? l === soloLane : !gaps[l].some(g => x > g.x0 && x < g.x1 && (!status.shield || g.off));
const offGap = () => ({ x0: -1e9, x1: Infinity, off: true });
const openLane = (l, a) => { if (laneOn[l]) return; const g = gaps[l].find(g => g.off && g.x1 === Infinity); if (g) g.x1 = R20(a); laneOn[l] = true; };   // 第 l 層從 a 開始出現
function closeUpper(F) {   // 第二層與最上層在 F 之後消失（走到那裡自然掉回最下層）；最下層收尾處不留缺口
  F = R20(F); for (const l of [0, 1]) if (laneOn[l]) { gaps[l].push({ x0: F, x1: Infinity, off: true }); laneOn[l] = false; }
  gaps[2] = gaps[2].filter(g => g.x1 <= F - 120);
}
const addGap = (l, a, b) => gaps[l].push({ x0: R20(a), x1: R20(b) });
const buildMap = m => { const w = { ...DEFAULT_MAP.weights, ...(m || {}).weights }; if ((m || {}).weights && m.weights.soldier != null) { w.arrow = m.weights.soldier; delete w.soldier; }   // 舊的 soldier 比重自動視為 arrow
  return { ...DEFAULT_MAP, ...m, weights: w, orbs: { ...DEFAULT_MAP.orbs, ...(m || {}).orbs } }; };
let MAP = buildMap({});
const baseSpeed = () => Math.max(240, Math.min(400, MAP.speed));              // 關卡基礎跑速（chain 0 時）
const speedStage = c => Math.min(CFG.SPEED_STAGE_MAX, Math.floor(c / CFG.SPEED_EVERY));   // 目前 chain 對應的速度階數
const speedAt = c => baseSpeed() + speedStage(c) * CFG.SPEED_STEP;            // 該 chain 的跑速（不含 Fever）
function weighted(w) { const ks = Object.keys(w); let x = r(0, ks.reduce((a, k) => a + Math.max(0, w[k]), 0)); for (const k of ks) { x -= Math.max(0, w[k]); if (x < 0) return k; } return ks[0]; }

const GEN_AHEAD = 400;   // 地圖往畫面右側外預先生成的距離(px)；敵人預備攻擊時要把已生成的地圖走完，越小等待越短

/* ----- 地圖生成：每段 5 顆能量球，沿安全路線排列 ----- */
function groupKind() {
  segIdx++; if (counterEl && (segIdx === 2 || segIdx === 5)) return counterEl;   // 保底：每波第 2、5 段是克制屬性
  const k = weighted(MAP.orbs); return k === 'elem' ? pick(EL5) : k;
}
// 難度 0~1：依目前 chain（被打到掉 chain 就會變簡單）。寬斷層（二段跳）與多連島嶼要累積 chain 後才大量出現
function difWeights(d) {
  const w = { ...MAP.weights }, ramp = (a, b) => Math.max(0, Math.min(1, (d - a) / (b - a)));
  if (w.gap2 != null) w.gap2 *= ramp(.15, .5);
  if (w.island != null) w.island *= .4 + .6 * ramp(0, .6);
  if (w.dive != null) w.dive *= .5 + .5 * ramp(0, .4);
  if (w.diveIce != null) w.diveIce *= ramp(.05, .45);
  if (w.iceChain != null) w.iceChain *= ramp(.1, .5);
  if (w.long != null) w.long = chain >= CFG.LONG_AT ? w.long : 0;   // 長串能量球：chain 進入 30 之後才出現
  return w;
}
function gen() {
  if (genPause) return;
  const S = speedAt(chain), D0 = S * T, dif = Math.min(1, chain / 60);   // S：生成用跑速（不受 Fever 固定速度影響）；D0：一次完整跳躍的水平距離
  while (cur < scroll + W + GEN_AHEAD) {
    const fst = first; let kind = first ? 'flat' : weighted(difWeights(dif));
    let upFrom = null;   // 往上換層時，上一層從這裡開始有地面
    let ap = null;   // 二段跳類區段：改用實際物理規劃軌跡；做不到（關掉二段跳、最上層沒空間、跳不夠遠）就改成一般斷層
    if (['gap2', 'ice', 'iceChain'].includes(kind)) { ap = airPlan(LY[L], T * .8) || airBest(LY[L]); if (!ap || ap.tl * S < D0 * 1.25 + 40) kind = 'gap'; }
    if ((kind === 'dive' || kind === 'diveIce') && (L !== 2 || CFG.AIR_JUMPS < 1)) kind = 'gap';   // 虛空只有最下層才會真的掉死，其他層掉下去只是換層
    const Y = LY[L]; let end, newL = L, M; first = false;
    const gk = groupKind(), mkg = () => ({ n: 5, got: 0 });
    // lead：沒有 g 的能量球只補能量（不算 chain），拿來當引導與緩衝；有 g 的 5 顆吃滿才 chain+1
    const lead = (x0, n, st, y = Y - 28, g, k) => { for (let i = 0; i < n; i++) orbs.push({ x: x0 + i * st, y, g, k: k || pick(EL5) }); };
    const arc = (m, tts = [1, 2, 3, 4, 5].map(k => T * k / 6), g = mkg()) => { for (const tt of tts) orbs.push({ x: m - S * T / 2 + S * tt, y: Y - 28 - (V0 * tt - .5 * GR * tt * tt), g, k: gk }); };
    const TT = { 1: [T / 2], 2: [T * .35, T * .65], 3: [T * .25, T * .5, T * .75] };
    const apArc = (x0, p, g = mkg()) => { for (let k = 1; k <= 5; k++) { const t = p.tl * k / 6; orbs.push({ x: x0 + S * t, y: Y - 28 - p.h(t), g, k: gk }); } };   // 沿二段跳軌跡放 5 顆（x0 ＝起跳點）
    if (kind === 'flat') { M = cur + 300; lead(cur + 60, 3, 50); arc(M); end = M + D0 / 2 + 180; }   // 小跳：地上只有零星補給，chain 的 5 顆要跳起來沿弧線吃
    else if (kind === 'mole' || kind === 'fire') {   // 地鼠／火球：球沿跳過陷阱的弧線排列；難度高時機率連續兩個，落地後立刻要再起跳
      M = cur + 260; lead(cur + 60, 2, 40); end = M + 240;
      for (let i = 0, n = 1 + (Math.random() < .12 + dif * .5 ? 1 : 0); i < n; i++) {
        if (kind === 'mole') moles.push({ x: M, l: L, s: 0, t: 0 }); else fires.push({ x: M, l: L, s: 0, y: -30, t: 0 });
        arc(M); end = M + 240; M += R20(D0 * r(1.15, 1.5));
      }
    }
    else if (kind === 'arrow') {   // 箭矢：從右側高速水平射來，一個區段連續 2～3 支（相隔 1.3～1.8 倍跳躍距離，落地後可再跳）
      const n = Math.round(r(CFG.ARROW_COUNT[0], CFG.ARROW_COUNT[1])), D = D0; M = cur + 420; lead(cur + 60, 3, 50);
      for (let i = 0; i < n; i++) { arrows.push({ a: M - S * ARROW_SP / (S + CFG.ARROW_SPEED), x: 0, l: L, on: false, y: Y - 26 }); arc(M); end = M + 300; M += R20(D * r(1.3, 1.8)); }
    }
    else if (kind === 'gap') {   // 斷層：單跳可過的缺口。球沿起跳弧線排列，指出「在哪裡起跳、會落在哪」；最下層踩空會掉進虛空
      const g0 = R20(cur + 260), gw = R20(D0 * r(.5, .75));
      lead(g0 - 130, 3, 45);                  // 引導到缺口邊緣
      arc(g0 + D0 / 2);                       // 從邊緣起跳的弧線：太早或太晚起跳就吃不全
      addGap(L, g0, g0 + gw); end = g0 + gw + 220;
    }
    else if (kind === 'gap2') {   // 寬斷層：單跳（含 coyote）過不去，要二段跳。球沿「實際二段跳軌跡」排列；二段跳頂點有上限，所以可以精準引導
      const g0 = R20(cur + 260), hi = ap.tl * S * .88, lo = D0 * 1.22, gw = R20(lo + (hi - lo) * r(.25, 1)), g = mkg();
      lead(g0 - 130, 3, 45); apArc(g0, ap, g); addGap(L, g0, g0 + gw); end = g0 + gw + 240;
    }
    else if (kind === 'island') {   // 島嶼：連續小缺口＋短平台，要有節奏地連跳。5 顆球分散在每次跳躍的弧線上；平台長度保證「從邊緣起跳一定落得到下一座島」
      const n = 2 + (dif > .35 ? 1 : 0) + (dif > .7 ? 1 : 0), cnt = [[3, 2], [2, 2, 1], [2, 1, 1, 1]][n - 2], g = mkg();
      let x = R20(cur + 260); lead(x - 130, 3, 45);
      for (let i = 0; i < n; i++) {
        const f = r(.5, .62), gw = R20(D0 * f), len = R20(D0 * (1 - f) + r(40, 90));   // len：落地後再跑 40~90px 就要起跳下一次
        arc(x + D0 / 2, TT[cnt[i]], g); addGap(L, x, x + gw); x += gw + len;
      }
      end = x + 120;
    }
    else if (kind === 'ice') {   // 浮冰跳台：寬斷路，冰塊放在「要二段跳才碰得到」的位置。二段跳上冰→彈起（可再二段跳）→落到對岸；冰塊碎掉消失
      const g0 = R20(cur + 220), xi = R20(g0 + S * ap.tl), g1 = R20(xi + D0 - 120);
      lead(cur + 60, 3, 50);
      apArc(g0, ap);                                     // 第一跳（二段跳到冰面）：這 5 顆算 1 chain
      ices.push({ x: xi, y: Y, w: CFG.ICE_W, dead: false });
      arc(xi + D0 / 2);                                  // 第二跳（從冰面彈起到對岸）：這 5 顆也算 1 chain
      addGap(L, g0, g1); end = g1 + 240;
    }
    else if (kind === 'iceChain') {   // 連續浮冰：2~3 塊冰，每一跳隨機是「單跳」或「二段跳」（冰上彈起後會重置二段跳），每一跳各 5 顆＝1 chain
      const n = 2 + (dif > .4 ? 1 : 0), g0 = R20(cur + 220); let x = g0; lead(cur + 60, 3, 50);
      for (let i = 0; i < n; i++) {
        let xi;
        if (Math.random() < .5) { xi = R20(x + D0); arc(x + D0 / 2); } else { xi = R20(x + S * ap.tl); apArc(x, ap); }
        ices.push({ x: xi, y: Y, w: CFG.ICE_W, dead: false }); x = xi;
      }
      arc(x + D0 / 2); const g1 = R20(x + D0 - 120); addGap(L, g0, g1); end = g1 + 240;
    }
    else if (kind === 'dive' || kind === 'diveIce') {   // 虛空潛水（只在最下層）：走出缺口「不要跳」，掉進虛空吃球，快掉到底前按跳（空中那一次二段跳）補救回岸上
      const dp = divePlan(r(.2, .25)), g0 = R20(cur + 260);
      lead(g0 - 130, 3, 45);
      const g = mkg(), pts = [dp.tp * .4, dp.tp * .75, dp.tp, dp.tp + (dp.tL - dp.tp) * .3, dp.tp + (dp.tL - dp.tp) * .6];
      for (const t of pts) orbs.push({ x: g0 + S * t, y: Y - 28 + dp.dep(t), g, k: gk });   // 前 3 顆在虛空裡（越來越深），後 2 顆在補救的弧線上
      if (kind === 'dive') { const gw = R20(S * dp.tL * .8); addGap(L, g0, g0 + gw); end = g0 + gw + 220; }
      else {   // 補救後剛好落在冰面上，冰面再把你彈到對岸；（一般單跳也碰得到這塊冰，只是吃不到虛空裡的球）
        const xi = R20(g0 + S * dp.tL), g1 = R20(xi + D0 - 120);
        ices.push({ x: xi, y: Y, w: CFG.ICE_W, dead: false }); arc(xi + D0 / 2); addGap(L, g0, g1); end = g1 + 240;
      }
    }
    else if (kind === 'long') {   // 長串能量球（chain ≥ LONG_AT）：一口氣 LONG_MIN~LONG_MAX 顆，沿著地面與多次跳躍（地鼠／火球／小缺口）連續排列，全部吃完才 chain+1
      const n = Math.floor(r(CFG.LONG_MIN, CFG.LONG_MAX + 1)), g = { n, got: 0 }, lk = gk === 'heal' ? pick(EL5) : gk;   // 長串不用恢復球（避免一次回太多）
      let left = n, x = R20(cur + 220); lead(cur + 60, 3, 50);
      while (left > 0) {
        if (Math.random() < .3 || (left <= 2 && Math.random() < .6)) {   // 地面連續球
          const c = Math.min(left, Math.floor(r(2, 5)));
          for (let i = 0; i < c; i++) orbs.push({ x: x + i * 50, y: Y - 28, g, k: lk });
          x += c * 50 + 70; left -= c;
        } else {   // 一次跳躍：球沿弧線排列，弧線下方是地鼠／火球／小缺口
          const c = Math.min(left, pick([3, 4, 5])), M = x + D0 / 2, tr = pick(['mole', 'fire', 'gap']);
          for (let i = 1; i <= c; i++) { const tt = T * i / (c + 1); orbs.push({ x: x + S * tt, y: Y - 28 - (V0 * tt - .5 * GR * tt * tt), g, k: lk }); }
          if (tr === 'mole') moles.push({ x: M, l: L, s: 0, t: 0 }); else if (tr === 'fire') fires.push({ x: M, l: L, s: 0, y: -30, t: 0 }); else addGap(L, x, x + R20(D0 * r(.5, .7)));
          x = R20(x + D0 + r(60, 110)); left -= c;
        }
      }
      end = x + 120;
    }
    else {
      const ds = []; if (L > 0) ds.push(-1); if (L < 2) ds.push(1);
      const d = pick(ds); newL = L + d; const YB = LY[newL];
      if (d < 0) {   // 往上一層：沿跳躍軌跡
        const js = cur + 220; upFrom = js + 20; openLane(newL, js + 20); lead(cur + 70, 3, 50); arc(js + S * T / 2, [.17, .27, .37, .47, .57]);   // 上一層從這裡開始出現
        lead(js + 230, 3, 50, YB - 28); addGap(L, js + 40, js + 360); end = js + 420;
      } else {       // 往下一層：走出缺口自然掉落，5 顆球沿著掉落軌跡與落地後排列
        const E = R20(cur + 260), g = mkg(); openLane(newL, cur); lead(cur + 60, 3, 45);
        for (const tt of [.08, .16, .24]) orbs.push({ x: E + S * tt, y: Y - 28 + .5 * GR * tt * tt, g, k: gk });
        lead(E + 170, 2, 50, YB - 28, g, gk); lead(E + 280, 2, 50, YB - 28);
        addGap(L, E, E + 300); end = E + 360;
      }
    }
    // 三層地面常駐時，跳起來的玩家會「落到頭上那一層」而偏離這段地圖的路線（球、陷阱都排在目前這層）→ 在這段路線正上方那一層挖洞；
    // 往上換層的區段，上一層從 upFrom 才開始有地面（洞只挖到那裡），再上面一層照樣挖洞
    const holeA = cur - 80, holeB = end + 40;
    if (L >= 1 && laneOn[L - 1]) addGap(L - 1, holeA, upFrom != null ? upFrom : holeB);
    if (upFrom != null && L >= 2 && laneOn[L - 2]) addGap(L - 2, holeA, holeB);
    const others = [0, 1, 2].filter(x => x !== L && x !== newL && laneOn[x]);   // 沒走的那層隨機斷裂（誘餌）
    if (!fst && Math.random() < MAP.decoy && others.length) { const a = cur + r(100, Math.max(120, end - cur - 260)); addGap(pick(others), a, a + r(160, 240)); }
    L = newL; cur = end;
  }
}
function startFever() {   // Fever：無陷阱；上、下兩排是恢復球，中間一排是彩虹球
  feverPendMs.forEach(m => feverUsed.add(m)); feverPendMs = [];   // 這次越過的區段記為「已使用」
  const pc = scroll + PX, x0 = pc + 100;
  gaps = [[], [], []]; laneOn = [true, true, true]; orbs = []; moles = []; fires = []; arrows = []; ices = [];
  py = LY[1]; vy = 0; grounded = true; lane = 1; dropLane = -1; invul = 0;
  for (let l = 0; l < 3; l++) for (let x = x0; x < x0 + CFG.FEVER_LEN; x += 30) orbs.push({ x, y: LY[l] - 28, k: l === 1 ? 'rainbow' : 'heal' });
  feverEnd = x0 + CFG.FEVER_LEN; fever = true; flashT = .5; cur = feverEnd + 300; L = 1; first = true; gen(); SFX.fever();
}
// 敵人預備／波次過場：不清地圖。停止隨機生成，把已生成的部分走完；其後第二層與最上層結束（自然掉回最下層）。
// 玩家回到最下層、跑過收尾點之後，才開始播放敵人攻擊。
function windDown() {
  genPause = true; const fresh = cur <= genFrom + 1;   // fresh：重新生成後還沒產生任何地圖（例如波次剛開始），不必等待
  windX = fresh ? scroll - 220 : Math.max(cur, scroll + W + 20); closeUpper(fresh ? scroll + W + 20 : windX);
}
function exitSafe() {   // 恢復生成：從最下層重新開始，第二層與最上層再依隨機出現
  genPause = false; soloLane = -1; cur = genFrom = Math.max(cur, scroll + W + 60); L = 2; first = true; ph = 'fight'; enemyT = 0;
  openLane(0, cur); openLane(1, cur);   // 新生成的地圖一開始就是完整三層地面
}
function placeOnGround() {
  const pc = scroll + PX; let l = [0, 1, 2].find(l => solid(l, pc));
  if (l === undefined) { l = 2; gaps[2] = gaps[2].filter(g => !(g.x0 < pc + 80 && g.x1 > pc - 80)); }
  lane = l; py = LY[l]; vy = 0; grounded = true; dropLane = -1;
}
