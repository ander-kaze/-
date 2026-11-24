'use strict';
/* =====================================================================
   陣躍出擊 — script.js
   1. 可調整數值   2. 內容資料（角色／副本／敵人／商店）   3. 存檔與工具
   4. 選單畫面（角色庫、詳情、商店、編成、設定）   5. 跑酷關卡（地圖、戰鬥、繪製）
   ★ 新增內容只需要改第 2 節。圖片欄位留空就用程式畫的預設圖。
   素材建議：assets/characters/（頭像 icon、立繪 portrait）  assets/enemies/  assets/dungeons/  assets/audio/
   ===================================================================== */

/* ===== 1. 可調整數值 ===== */
const CFG = {
  ORB_ENERGY: 10, ENERGY_MAX: 100,   // 每顆能量球的能量／角色能量條上限（滿了該角色攻擊一次）
  CHAIN_BONUS: 2,                    // 每 chain 增加的傷害百分比（2 = 每 1 chain +2%，chain 50 = +100%）
  FEVER_AT: 10, FEVER_LEN: 1600,     // 每幾 chain 進 fever／fever 地圖長度(px)
  CHAIN_LOSS: 0.5,                   // 掉入虛空／撞到陷阱時損失的 chain 比例（0.5 = 扣一半，無條件捨去）
  AIR_JUMPS: 1, AIR_JUMP_POWER: 0.8,  // 二段跳：空中可再跳幾次（0 = 關閉；走出缺口／往下掉而沒跳過時同樣有這一次）／空中跳的力道（1 = 與第一跳相同）。二段跳的頂點另有上限＝最上層地面（見 AIR_CEIL）
  LONG_AT: 30, LONG_MIN: 7, LONG_MAX: 15,   // 長串能量球段：chain 達 LONG_AT 後才會出現；一整段有 LONG_MIN~LONG_MAX 顆，全部吃完才 chain+1
  START_PAD: 60,                     // 開場安全區：第一段地圖從畫面右緣外多遠(px)才開始生成
  ARROW_SPEED: 520, ARROW_COUNT: [2, 3],   // 箭矢：飛行速度(px/秒，士兵是 160)／每個箭矢區段的支數範圍
  ICE_W: 110,                        // 浮冰跳台的冰面寬度(px)；玩家腳下碰到冰面（含身體半寬）就會彈起
  SPEED_EVERY: 10, SPEED_STEP: 15, SPEED_STAGE_MAX: 8,   // 每幾 chain 提升一階跑速／每階增加的跑速(px/秒)／最高階數（總跑速 = 關卡 map.speed + 階數×每階增量）
  FEVER_SPEED: 320,                  // Fever 中固定跑速(px/秒)，不受 chain 影響；Fever 結束後依目前 chain 重新計算
  PARTY_SIZE: 6,
  TRAP_DMG: 200, HEAL_ORB: 50,       // 陷阱傷害／恢復球回復量
  ENEMY_ATK_EVERY: 15, WAVE_GAP: 3,  // 敵人預設攻擊冷卻(秒；單一攻擊可用 cd 覆寫)／波次過場秒數
  VOMIT_GAP: [.25, .45],             // 「嘔吐瀑布」特殊地圖：每顆火球掉落的間隔範圍(秒)
  SKILL_LV_MAX: 5, SKILL_LV_NEED: [2, 3, 5, 8, 13, 21, 34, 55, 89],   // 預設技能等級上限／各等級升級所需「同技能角色」份數（Lv0→1 需 2，依序…；個別技能可用 lvMax 覆寫上限）
  CHAR_DROP: 0.5,                    // 副本角色掉落：首次通關必得，之後的掉落機率
  SKILL_PARTIAL: true,               // true：素材不足也可投入並累積進度（個別技能可設 partial: false 關閉）
  SHARD_COST: 5, SHARD_DROP: 0.5, SHARD_DROP_N: 1,   // 升星：神性碎片×5；通關 50% 機率掉落
  START_COINS: 1000, START_TICKETS: 2, WIN_COINS: 100, // ★暫定：商店貨幣（金幣）的初始量與通關獎勵，之後依你的設計調整
};

/* ===== 2. 內容資料 ===== */
// 五行相剋：金剋木、木剋土、土剋水、水剋火、火剋金。克制 ×1.5，被克制 ×0.8。orb = 能量球顏色
const ELEMENTS = {
  金: { color: '#d4a017', orb: '#ffe600', beats: '木' }, 木: { color: '#43a047', orb: '#3ddc4f', beats: '土' },
  水: { color: '#1e88e5', orb: '#2f8cff', beats: '火' }, 火: { color: '#e53935', orb: '#ff3b30', beats: '金' },
  土: { color: '#8d6e63', orb: '#9aa0a6', beats: '水' },
};
const EL5 = Object.keys(ELEMENTS);

// 角色欄位：id／fam(技能等級共用的家族，升星前後同一 fam)／name／short(預設圖上的字)／star(稀有度)／element／hp／atk／
//   icon(頭像)／portrait(立繪)／upTo(可升星成的角色 id)／skill／leader(隊長技，pos=需放的號位，fx=效果)
// skill.type 對應下方 SKILL_EFFECTS；leader.fx 的 t 對應「5-b 戰鬥」中的 leaderFx 查詢
const mk = o => ({ fam: o.id, icon: '', portrait: '', leader: null, upTo: null, ...o });
const PYN = { 金: 'jin', 木: 'mu', 水: 'shui', 火: 'huo', 土: 'tu' };
const CHARACTERS = [];
EL5.forEach(e => CHARACTERS.push(   // 三星免費角色：士兵／軍師／傳令兵／醫療兵／將軍（HP、攻擊為暫定值，請自行調整）
  mk({ id: 'sol_' + PYN[e], name: e + '士兵', short: e + '兵', star: 3, element: e, hp: 1000, atk: 100,
       skill: { name: '屬性衝擊', type: 'damage', power: 500, cd: 10, desc: '對敵人造成自身屬性的 500 點傷害' } }),
  mk({ id: 'adv_' + PYN[e], name: e + '軍師', short: e + '軍', star: 3, element: e, hp: 1200, atk: 80,
       skill: { name: '料敵機先', type: 'convert', dur: 7, cd: 8, desc: '將場上的能量球變為對應屬性的能量球，持續 7 秒' } }),
  mk({ id: 'her_' + PYN[e], name: e + '傳令兵', short: e + '傳', star: 3, element: e, hp: 1000, atk: 90,
       skill: { name: '千里奔馳', type: 'fly', dur: 10, cd: 12, desc: '立刻進行一次快速飛行，飛行期間吸取所有能量球且無視地形，持續 10 秒' } }),
  mk({ id: 'med_' + PYN[e], name: e + '醫療兵', short: e + '醫', star: 3, element: e, hp: 1100, atk: 60,
       skill: { name: '緊急治療', type: 'heal', power: 500, cd: 12, desc: '立刻恢復 500 點 HP' } }),
  mk({ id: 'gen_' + PYN[e], name: e + '將軍', short: e + '將', star: 3, element: e, hp: 1200, atk: 120,
       skill: { name: '全軍突擊', type: 'dmgUp', mul: 1.5, dur: 10, cd: 14, desc: `使全隊造成的${e}屬性傷害乘以 1.5 倍，持續 10 秒` } }),
));
const LEAD_SHUANG = { name: '雜魚~雜魚', pos: [1, 6], desc: '位於 1 號位或 6 號位時，敵方對自身傷害提高 10%', fx: [{ t: 'selfDmg', v: 1.1 }] };
const SK_SHUANG = { name: '外鄉人戰術', type: 'dodge', cd: 10 };
const SK_LING = { name: '出其不意', type: 'space', dur: 15, cd: 10 };
const SK_CAO4 = { name: '德魯伊的秘術', type: 'druid', atkMul: 3, poison: 100, dur: 15, cd: 12, desc: '對敵人造成自身攻擊三倍的傷害，隨後對敵人賦予每秒 100 的「毒蝕」效果，持續 15 秒' };
const SK_CAO5 = { ...SK_CAO4, atkMul: 5, poison: 500, desc: '對敵人造成自身攻擊五倍的傷害，隨後對敵人賦予每秒 500 的「毒蝕」效果，持續 15 秒' };
const LEAD_CAO = { name: '森林之主', pos: [1], desc: '位於 1 號位時，拾取木屬性能量球會以 10hp/一顆來恢復 hp', fx: [{ t: 'woodHeal', v: 10 }] };
CHARACTERS.push(
  mk({ id: 'shuang4', fam: 'shuang', upTo: 'shuang5', name: '初心褪色者 浣熊阿霜', short: '阿霜', star: 4, element: '金', icon: 'assets/characters/shuang4_icon.png',
portrait: 'assets/characters/shuang4.png',hp: 1500, atk: 320,
       skill: { ...SK_SHUANG, atkMul: 0, desc: '使下一次敵方對我方攻擊時，閃避該傷害使其為 0' }, leader: LEAD_SHUANG }),
  mk({ id: 'shuang5', fam: 'shuang', name: '資深魂系冒險者 浣熊阿霜', short: '阿霜', star: 5, element: '金', icon: 'assets/characters/shuang5_icon.png',
portrait: 'assets/characters/shuang5.png',hp: 2300, atk: 450,
       skill: { ...SK_SHUANG, atkMul: 4, desc: '使下一次敵方對我方攻擊時，閃避該傷害使其為 0，對敵人造成自身基礎攻擊 4 倍的傷害' }, leader: LEAD_SHUANG }),
  mk({ id: 'ling4', fam: 'ling', upTo: 'ling5', name: '置身喧囂外 凌風', short: '凌風', star: 4, element: '水', icon: 'assets/characters/ling4_icon.png',
portrait: 'assets/characters/ling4.png',hp: 1300, atk: 470,
       skill: { ...SK_LING, atkMul: 0, desc: '對敵方施加「空間陣」持續 15 秒，空間陣持續狀態下，我方任意攻擊無視敵方的減傷效果' } }),
  mk({ id: 'ling5', fam: 'ling', name: '徘迴於塵世間 凌風', short: '凌風', star: 5, element: '水', icon: 'assets/characters/ling5_icon.png',
portrait: 'assets/characters/ling5.png',hp: 2000, atk: 580,
       skill: { ...SK_LING, atkMul: 5, desc: '對敵人施加「空間陣」持續 15 秒，空間陣持續狀態下，我方任意攻擊無視敵方的減傷效果，立刻對敵人造成自身基礎攻擊五倍的傷害' } }),
  mk({ id: 'nan4', fam: 'nan', upTo: 'nan5', name: '祝你順心 楠雪', short: '楠雪', star: 4, element: '火', icon: 'assets/characters/nan4_icon.png',
portrait: 'assets/characters/nan4.png',hp: 1600, atk: 230,
       skill: { name: '乾卦！', type: 'qian', cdMinus: 1, chain: 7, cd: 9, desc: '全隊技能 cd-1，chain 數 +7' },
       leader: { name: '布偶神的庇護', pos: [6], desc: '放在 6 號位時，收集恢復球也能替隊伍收集能量，但能量收集效果為原先的一半', fx: [{ t: 'healOrbEnergy', v: 0.5 }] } }),
  mk({ id: 'nan5', fam: 'nan', name: '一筆定乾坤 楠雪', short: '楠雪', star: 5, element: '火', icon: 'assets/characters/nan5_icon.png', portrait: 'assets/characters/nan5.png', hp: 2400, atk: 390,
       skill: { name: '乾卦！', type: 'qian', cdMinus: 1, chain: 7, fever: 1, magnet: 12, cd: 9, desc: '全隊技能 cd-1，chain 數 +7，並額外贈送一次 Fever，12 秒內持續吸引場地上所有能量球' },
       leader: { name: '布偶神的庇護', pos: [6], desc: '放在 6 號位時，收集恢復球也能替隊伍收集能量，但能量收集效果為原先的一半。隊伍每造成一次傷害（包含毒蝕造成的傷害），使自身能量 +20',
                 fx: [{ t: 'healOrbEnergy', v: 0.5 }, { t: 'hitEnergy', v: 20 }] } }),
  mk({ id: 'cao4', fam: 'cao', upTo: 'cao5', name: '動物之友 草野', short: '草野', star: 4, element: '木', icon: 'assets/characters/cao4_icon.png',
portrait: 'assets/characters/cao4.png',hp: 1800, atk: 280,
       skill: SK_CAO4, leader: LEAD_CAO }),
  mk({ id: 'cao5', fam: 'cao', name: '萬物之靈的使者 草野', short: '草野', star: 5, element: '木', icon: 'assets/characters/cao5_icon.png',
portrait: 'assets/characters/cao5.png',hp: 2600, atk: 400,
       skill: SK_CAO5,
       leader: { name: '森林之主', pos: [1], desc: '位於 1 號位時，拾取木屬性能量球會以 10hp/一顆來恢復 hp。隊伍所有木屬性傷害為 1.5 倍，「毒蝕」造成傷害 2 倍',
                 fx: [{ t: 'woodHeal', v: 10 }, { t: 'elemDmg', el: '木', v: 1.5 }, { t: 'poisonMul', v: 2 }] } }),
);
// 帕魯魂：放在指定號位，當前 HP 為總 HP 的 50% 以下時全隊攻擊傷害 ×2（多個帕魯魂不疊乘）；5★ 版本在「另一個帕魯魂也生效」時總 HP ×1.5
const LEAD_PARU = (pos, five) => ({ name: '帕魯魂', pos: [pos],
  desc: `放在 ${pos} 號位時，當前 HP 為總 HP 的 50% 以下時，全隊攻擊傷害 2 倍` + (five ? '。當其他隊長技是「帕魯魂」且生效時，總 HP 提升為原總 HP 的 1.5 倍' : ''),
  fx: [{ t: 'lowHpDmg', thr: .5, v: 2 }, ...(five ? [{ t: 'paruHp', v: 1.5 }] : [])] });
const LEAD_ROME = five => ({ name: '羅馬精神', pos: [2],
  desc: '位於 2 號位時，隊伍所有火屬性傷害為 1.5 倍' + (five ? '，使「毒蝕」效果變為可疊加（同一角色多次施放的毒蝕可同時存在於敵人身上）' : ''),
  fx: [{ t: 'elemDmg', el: '火', v: 1.5 }, ...(five ? [{ t: 'poisonStack' }] : [])] });
const SK_YING = { name: '無償勞動', type: 'hpBlast', cost: .2, mul: 1.5, cd: 13, desc: '失去當前 HP 的 20%，造成已損失 HP 1.5 倍的傷害' };
const SK_ABS = { name: '絕對不存在', type: 'guard', cost: .15, n: 2, cd: 10, desc: '失去當前 HP 的 15%，接下來的兩次攻擊會擋下並使其為 0' };
const SK_MOKA4 = { name: '消失吧必勝客！', type: 'druid', atkMul: 3, poison: 100, dur: 15, cd: 12, desc: '對敵人造成自身攻擊三倍的傷害，隨後對敵人賦予每秒 100 的「毒蝕」效果，持續 15 秒' };
const SK_MOKA5 = { ...SK_MOKA4, atkMul: 5, poison: 500, desc: '對敵人造成自身攻擊五倍的傷害，隨後對敵人賦予每秒 500 的「毒蝕」效果，持續 15 秒' };
const SK_TITI = { name: '魔法要開始囉！', type: 'rainbow', dur: 12, cd: 13, desc: '將場上的能量球變為彩色球，持續 12 秒' };
// 圖片路徑沿用慣例：頭像 assets/characters/<id>_icon.png、立繪 assets/characters/<id>.png（檔案不存在時自動顯示預設圖）
const IMGS = id => ({ icon: `assets/characters/${id}_icon.png`, portrait: `assets/characters/${id}.png` });
CHARACTERS.push(
  mk({ id: 'ying4', fam: 'ying', upTo: 'ying5', name: '臨時油漆工 瓔雪楓', short: '雪楓', star: 4, element: '水', ...IMGS('ying4'), hp: 1600, atk: 270, skill: SK_YING, leader: LEAD_PARU(1, false) }),
  mk({ id: 'ying5', fam: 'ying', name: '大罷工 瓔雪楓', short: '雪楓', star: 5, element: '水', ...IMGS('ying5'), hp: 2700, atk: 460, skill: SK_YING, leader: LEAD_PARU(1, true) }),
  mk({ id: 'abs4', fam: 'abs', upTo: 'abs5', name: '萬年坦克位 絕對存在', short: '絕對', star: 4, element: '土', ...IMGS('abs4'), hp: 1900, atk: 215, skill: SK_ABS, leader: LEAD_PARU(6, false) }),
  mk({ id: 'abs5', fam: 'abs', name: '絕對的神 絕對存在', short: '絕對', star: 5, element: '土', ...IMGS('abs5'), hp: 2700, atk: 370, skill: SK_ABS, leader: LEAD_PARU(6, true) }),
  mk({ id: 'moka4', fam: 'moka', upTo: 'moka5', name: '原始教義派 末卡', short: '末卡', star: 4, element: '火', ...IMGS('moka4'), hp: 1500, atk: 310, skill: SK_MOKA4, leader: LEAD_ROME(false) }),
  mk({ id: 'moka5', fam: 'moka', name: '是烤餅不是披薩 末卡', short: '末卡', star: 5, element: '火', ...IMGS('moka5'), hp: 2200, atk: 460, skill: SK_MOKA5, leader: LEAD_ROME(true) }),
  mk({ id: 'titi4', fam: 'titi', upTo: 'titi5', name: '魔法少女 緹緹子', short: '緹緹', star: 4, element: '火', ...IMGS('titi4'), hp: 1600, atk: 260, skill: SK_TITI }),
  mk({ id: 'titi5', fam: 'titi', name: '可愛無敵兼具 緹緹子', short: '緹緹', star: 5, element: '火', ...IMGS('titi5'), hp: 2200, atk: 370,
       skill: { ...SK_TITI, fly: 12, desc: '將場上的能量球變為彩色球，立刻進行一次快速飛行，飛行期間吸取所有能量球且無視地形，持續 12 秒' } }),
);
// 
const LEAD_BEAT = { name: '節拍大師', pos: [1], desc: '位於 1 號位時，隊伍每造成一次固定傷害，當下立刻使全隊技能 CD -1', fx: [{ t: 'fixedCd' }] };
const LEAD_LUCK = { name: '氣運之子', pos: [6], desc: '位於 6 號位時，隊伍每造成一次固定傷害，立刻追加一次等同於本次固定傷害的追加傷害，本次追加傷害不再觸發「氣運之子」', fx: [{ t: 'fixedEcho' }] };
const SK_MOJI = { name: '請好好看著我~', type: 'heal', power: 5000, cd: 12, desc: '立刻恢復 5000 HP' };
const SK_NAILONG = { name: '奶龍衝撞', type: 'rush', cost: .2, fixed: 500, cd: 13, desc: '扣除總 HP 的 20%，對敵方造成固定 500 的固定傷害（固定傷害不受任何增傷、減傷影響，可以被閃避）' };
const SK_TADO = { name: '昏睡雷普', type: 'fixed', power: 114514, cd: 19, lvMax: 9,   // 田所浩二：技能等級上限 Lv.9（所需份數與其他技能相同）
  desc: '對敵方造成固定 114514 的固定傷害' };
const SK_IKEZE = { name: '舞舞舞！', type: 'fixed', power: 555, cd: 14, lvMax: 9, desc: '造成固定 555 的固定傷害' };
const SK_SHIORI = { name: '999', type: 'fixed', power: 999, cdMinus: 1, cd: 10, desc: '造成固定 999 的固定傷害，並使全隊技能 CD -1' };
CHARACTERS.push(
  mk({ id: 'moji4', fam: 'moji', upTo: 'moji5', name: '清純少女 Moji', short: 'Moji', star: 4, element: '水', ...IMGS('moji4'), hp: 1700, atk: 235, skill: SK_MOJI }),
  mk({ id: 'moji5', fam: 'moji', name: '網路小天使 Moji', short: 'Moji', star: 5, element: '水', ...IMGS('moji5'), hp: 2600, atk: 350,
       skill: { ...SK_MOJI, feverReset: true, desc: '立刻恢復 5000 HP，並依照當前 chain 數重置 Fever' } }),
  mk({ id: 'nailong4', fam: 'nailong', upTo: 'nailong5', dropStage: 'meme1', name: '普通的奶龍', short: '奶龍', star: 4, element: '土', ...IMGS('nailong4'), hp: 2000, atk: 200, skill: SK_NAILONG }),
  mk({ id: 'nailong5', fam: 'nailong', name: '超極霸奶龍', short: '奶龍', star: 5, element: '土', ...IMGS('nailong5'), hp: 4000, atk: 290,
       skill: { ...SK_NAILONG, shield: 12, desc: SK_NAILONG.desc + '。立刻展開一個防護罩（持續 12 秒），防護罩展開期間，跑酷角色處於無敵狀態，不會掉入虛空，也不受陷阱影響' } }),
  mk({ id: 'tado4', fam: 'tado', upTo: 'tado5', dropStage: 'meme2', name: '野獸先輩 田所浩二', short: '田所', star: 4, element: '金', ...IMGS('tado4'), hp: 1800, atk: 260, skill: SK_TADO }),
  mk({ id: 'tado5', fam: 'tado', name: '淫夢王 田所浩二', short: '田所', star: 5, element: '金', ...IMGS('tado5'), hp: 2600, atk: 340, skill: SK_TADO }),
  mk({ id: 'ikeze4', fam: 'ikeze', upTo: 'ikeze5', dropStage: 'meme3', name: '街舞專家 池澤', short: '池澤', star: 4, element: '金', ...IMGS('ikeze4'), hp: 1500, atk: 230, skill: SK_IKEZE, leader: LEAD_BEAT }),
  mk({ id: 'ikeze5', fam: 'ikeze', name: '榮譽街舞大師 池澤', short: '池澤', star: 5, element: '金', ...IMGS('ikeze5'), hp: 2000, atk: 300, skill: SK_IKEZE, leader: LEAD_BEAT }),
  mk({ id: 'shiori4', fam: 'shiori', upTo: 'shiori5', name: '一擲千金 詩織', short: '詩織', star: 4, element: '金', ...IMGS('shiori4'), hp: 1800, atk: 300, skill: SK_SHIORI }),
  mk({ id: 'shiori5', fam: 'shiori', name: '賭場女王 詩織', short: '詩織', star: 5, element: '金', ...IMGS('shiori5'), hp: 2400, atk: 420, skill: SK_SHIORI, leader: LEAD_LUCK }),
);
//
const SK_MOYU = { name: '隨機應變', type: 'chainUp', chain: 5, cd: 13, desc: 'chain 數 +5' };
const SK_MOCHI = { name: '輪椅服務於人性', type: 'chainUp', chain: 5, fever: 1, cd: 9, desc: 'chain 數 +5，並額外贈送一次 Fever' };
CHARACTERS.push(
  mk({ id: 'moyu4', fam: 'moyu', upTo: 'moyu5', name: '半調子間諜 墨宇', short: '墨宇', star: 4, element: '木', ...IMGS('moyu4'), hp: 1800, atk: 270, skill: SK_MOYU }),
  mk({ id: 'moyu5', fam: 'moyu', name: '任務專注模式 墨宇', short: '墨宇', star: 5, element: '木', ...IMGS('moyu5'), hp: 2300, atk: 350,
       skill: { ...SK_MOYU, chain: 7, cdRandom: 3, desc: 'chain 數 +7，並使隊伍中隨機角色技能 CD -3' } }),
  mk({ id: 'mochi4', fam: 'mochi', upTo: 'mochi5', name: '？？？輪椅？？？', short: '輪椅', star: 4, element: '水', ...IMGS('mochi4'), hp: 1600, atk: 240, skill: SK_MOCHI }),
  mk({ id: 'mochi5', fam: 'mochi', name: '社區技術專員 Mochi', short: 'Mochi', star: 5, element: '水', ...IMGS('mochi5'), hp: 2200, atk: 370,
       skill: { ...SK_MOCHI, chain: 7, shield: 12, desc: 'chain 數 +7，並額外贈送一次 Fever。立刻展開一個防護罩（持續 12 秒），防護罩展開期間，跑酷角色處於無敵狀態，不會掉入虛空，也不受陷阱影響' } }),
);
const DEFAULT_PARTY = ['sol_jin', 'sol_mu', 'sol_shui', 'sol_huo', 'sol_tu', null];   // 預設編隊

// 商店：rates 是各星級的機率權重，每張券抽 count 次，每次獨立計算
const SHOP = [{ id: 'normal', name: '普通抽獎券', price: 100, count: 5, rates: { 3: 75, 4: 25 } }];

// 副本資訊（DEFAULT_MAP、DUNGEONS）已移到 dungeons.js

/* ===== 3. 存檔與工具 ===== */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const r = (a, b) => a + Math.random() * (b - a), R20 = v => Math.round(v / 20) * 20, pick = a => a[Math.floor(Math.random() * a.length)];
const hitR = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
const charById = id => CHARACTERS.find(c => c.id === id);
const fmt = s => [Math.floor(s / 60), Math.floor(s % 60), Math.floor(s % 1 * 100)].map(v => String(v).padStart(2, '0')).join(':');
const keyLabel = k => k.length === 1 && k !== ' ' ? k.toUpperCase() : ({ arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', ' ': 'Space' }[k] || k);
const IMG = {};
function getImg(src) {   // 圖片尚未載入或失敗時回傳 null，由呼叫端畫預設圖
  if (!src) return null;
  let e = IMG[src]; if (!e) { e = IMG[src] = { i: new Image(), ok: false }; e.i.onload = () => e.ok = true; e.i.src = src; }
  return e.ok ? e.i : null;
}
const SAVE_KEY = 'qunyou-game-v2';
const save = { settings: { volume: .7, keys: { up: 'w', down: 's' }, touch: 'ud' }, party: [...DEFAULT_PARTY], bests: {},
  owned: {}, skillLv: {}, skillProg: {}, shards: 0, coins: CFG.START_COINS, tickets: { normal: CFG.START_TICKETS } };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); save.settings.keys = { up: 'w', down: 's', ...save.settings.keys }; } catch (e) {}
save.settings.touch = save.settings.touch === 'lr' ? 'lr' : 'ud';   // 手機操作：ud＝上下分割（上跳下掉）、lr＝左右分割（右跳左掉）；舊存檔沒有這項時用 ud
CHARACTERS.forEach(c => { if (c.star === 3 && !save.owned[c.id]) save.owned[c.id] = 1; });   // 三星角色免費
save.party = (save.party || []).slice(0, CFG.PARTY_SIZE).map(id => charById(id) && save.owned[id] > 0 ? id : null);
while (save.party.length < CFG.PARTY_SIZE) save.party.push(null);
if (!save.party.some(Boolean)) save.party = [...DEFAULT_PARTY];
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
save.skillProg = save.skillProg || {};
for (const k of ['skillLv', 'skillProg']) if (save[k].nan4 != null && save[k].nan == null) { save[k].nan = save[k].nan4; delete save[k].nan4; }   // 楠雪加入 5★ 後改用共用欄位 nan（保留舊存檔的技能等級）
const famLv = ch => save.skillLv[ch.fam] || 0;
const lvMaxOf = ch => ch.skill.lvMax || CFG.SKILL_LV_MAX;                                  // 技能等級上限（可在技能上設 lvMax）
const lvNeedOf = ch => ch.skill.lvNeed || CFG.SKILL_LV_NEED;                               // 各等級升級所需份數（可在技能上設 lvNeed）
const partialOf = ch => ch.skill.partial != null ? ch.skill.partial : CFG.SKILL_PARTIAL;   // 素材不足時是否可投入並累積進度
const progOf = ch => partialOf(ch) ? save.skillProg[ch.fam] || 0 : 0;                      // 目前這一級已投入的份數
const cdOf = ch => Math.max(1, ch.skill.cd - famLv(ch));   // 技能 CD：基礎 CD 每升 1 級 -1（最低 1）
const stars = n => '★'.repeat(n);

/* ===== 4. 選單畫面 ===== */
let screenId = 'loading', pending = null, selSlot = 0, bindingFor = null, toastT, curDetail = null;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
function show(id) { screenId = id; $$('.screen').forEach(e => e.classList.toggle('active', e.id === id)); }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1500); }
const badgeEl = e => { const b = el('span', 'badge', e); b.style.background = ELEMENTS[e].color; return b; };
function iconEl(ch, big) {   // 圓形頭像（沒有 icon 時用立繪裁切，再沒有就用預設色塊）
  const d = el('div', 'icon' + (big ? ' big' : '')), ph = el('span', 'ph', ch.short || ch.name[0]);
  d.style.background = ELEMENTS[ch.element].color; d.append(ph);
  const src = ch.icon || ch.portrait; if (src) { const i = new Image(); i.onload = () => { ph.remove(); d.prepend(i); }; i.src = src; }
  d.append(badgeEl(ch.element)); return d;
}
function portraitEl(ch) {   // 立繪；沒有圖時顯示預設板
  const d = el('div', 'portrait'); d.style.background = `linear-gradient(160deg,${ELEMENTS[ch.element].color},#1b1626)`;
  const ph = el('div', 'ph', ch.name); d.append(ph);
  if (ch.portrait) { const i = new Image(); i.onload = () => { ph.remove(); d.append(i); }; i.src = ch.portrait; }
  return d;
}
const closeSheet = sel => $(sel).classList.remove('open');
function openDlg(title, html, okText, onOk) {
  $('#dlg-title').textContent = title; const body = $('#dlg-body');
  if (typeof html === 'string') body.innerHTML = html; else { body.innerHTML = ''; body.append(html); }
  const ok = $('#dlg-ok'); ok.hidden = !onOk; ok.disabled = false; ok.textContent = okText || '確定'; ok.onclick = () => onOk && onOk();
  $('#dlg-bg').classList.add('open');
}
/* --- 篩選／排序：角色庫與編成替換共用（新增篩選項只需在 FILTERS 加一列） --- */
// multi 列：可複選，選了就只留下「符合任一選項」的角色；單選列（排序）v 為排序欄位
const FILTERS = [
  { k: 'el', name: '屬性', multi: true, opts: EL5.map(e => ({ v: e, label: e, color: ELEMENTS[e].color, test: c => c.element === e })) },
  { k: 'star', name: '星級', multi: true, opts: [5, 4, 3].map(n => ({ v: n, label: n + '★', test: c => c.star === n })) },
  { k: 'lead', name: '隊長技', multi: true, opts: [1, 2, 3, 4, 5, 6].map(n => ({ v: n, label: n + '號位', test: c => c.leader && c.leader.pos.includes(n) })) },
  { k: 'sort', name: '排序', opts: [['star', '星級'], ['hp', 'HP'], ['atk', '攻擊']].map(([v, label]) => ({ v, label })) },
];
const newFilter = () => Object.fromEntries(FILTERS.map(r => [r.k, r.multi ? new Set() : r.opts[0].v]));
const filterOn = f => FILTERS.some(r => r.multi && f[r.k].size);
const applyFilter = (list, f) => list.filter(c => FILTERS.every(r => !r.multi || !f[r.k].size || r.opts.some(o => f[r.k].has(o.v) && o.test(c))))
  .sort((a, b) => (b[f.sort] - a[f.sort]) || a.id.localeCompare(b.id));
const ownedChars = () => CHARACTERS.filter(c => save.owned[c.id] > 0);
function openFilter(f, onChange) {
  const pool = ownedChars(), wrap = el('div');
  const draw = () => {
    wrap.innerHTML = '';
    FILTERS.forEach(r => {
      const row = el('div', 'frow', `<span class="flabel">${r.name}</span>`), chips = el('div', 'fchips');
      r.opts.forEach(o => {
        const on = r.multi ? f[r.k].has(o.v) : f[r.k] === o.v;
        const b = el('button', 'fchip' + (on ? ' on' : ''), (o.color ? `<i class="fdot" style="background:${o.color}"></i>` : '') + o.label + (r.multi ? `<small>${pool.filter(o.test).length}</small>` : ''));
        b.onclick = () => { if (!r.multi) f[r.k] = o.v; else if (!f[r.k].delete(o.v)) f[r.k].add(o.v); onChange(); draw(); };
        chips.append(b);
      });
      row.append(chips); wrap.append(row);
    });
    const clr = el('button', 'flink', '清除篩選'); clr.onclick = () => { FILTERS.forEach(r => r.multi && f[r.k].clear()); onChange(); draw(); }; wrap.append(clr);
  };
  draw(); openDlg('篩選', wrap, '完成', () => closeSheet('#dlg-bg'));
}
const bindFilter = (btn, f, onChange) => {   // 篩選按鈕：有條件時顯示「●」
  const mark = () => btn.textContent = '篩選' + (filterOn(f) ? ' ●' : '');
  mark(); btn.onclick = () => openFilter(f, () => { mark(); onChange(); });
};
const rosterF = newFilter();

// 返回上一頁時，依最新存檔重建該畫面（角色庫／編成／商店／副本／角色資訊），避免升星、抽獎後顯示舊資料（重建是即時的，不需要讀取條）
function goBack(to) {
  if (to === 'roster') renderRoster();
  else if (to === 'party') renderParty();
  else if (to === 'shop') renderShop();
  else if (to === 'dungeons') renderDungeons();
  else if (to === 'detail' && curDetail && save.owned[curDetail] > 0) renderDetail(curDetail);
  show(to);
}
$$('.back').forEach(b => b.onclick = () => { if (b.dataset.to) goBack(b.dataset.to); });
$$('.sheet-bg').forEach(b => b.onclick = e => { if (e.target === b) b.classList.remove('open'); });
$$('.x').forEach(x => x.onclick = () => x.closest('.sheet-bg').classList.remove('open'));
$$('[data-act]').forEach(b => b.onclick = () => {
  const a = b.dataset.act; SFX.unlock();
  if (a === 'soon') return toast('敬請期待');
  if (a === 'dungeons') renderDungeons();
  if (a === 'party') { pending = null; selSlot = 0; return openParty(); }
  if (a === 'roster') renderRoster();
  if (a === 'shop') renderShop();
  if (a === 'settings') renderSettings();
  show(a);
});

/* --- 副本選擇 --- */
function renderDungeons() {
  const g = $('#dungeon-grid'); g.innerHTML = '';
  DUNGEONS.forEach(d => {
    const b = el('button', 'card', `<div class="card-img">${d.image ? `<img src="${d.image}" alt="">` : '副本圖片'}</div><div class="card-name">${d.name}</div>`);
    b.onclick = () => openStages(d); g.append(b);
  });
}
function enemyIconEl(w) {   // 敵人頭像（沒圖時用屬性色塊）
  const d = el('div', 'icon'), ph = el('span', 'ph', w.name.slice(0, 2));
  d.style.background = w.element ? ELEMENTS[w.element].color : '#555'; d.append(ph);
  const src = w.image || w.portrait; if (src) { const i = new Image(); i.onload = () => { ph.remove(); d.prepend(i); }; i.src = src; }
  if (w.element) d.append(badgeEl(w.element)); return d;
}
const atkGapText = w => {   // 攻擊間隔：該敵人所有攻擊（含各階段）冷卻的範圍
  const all = w.phases ? w.phases.flatMap(p => p.attacks || []) : (w.attacks || []);
  if (!all.length) return '無攻擊';
  const cds = all.map(a => a.cd ?? CFG.ENEMY_ATK_EVERY), lo = Math.min(...cds), hi = Math.max(...cds);
  return '攻擊間隔 ' + (lo === hi ? lo : lo + '~' + hi) + ' 秒';
};
function stageInfo(d, s) {
  const box = el('div', 'stage-body'), cleared = save.bests[s.id] != null;
  if (s.note) box.append(el('small', null, s.note));
  const waves = el('div', 'waves'); waves.style.setProperty('--n', s.waves.length);   // 波次平均等分寬度，字體大小依等分數調整
  s.waves.forEach((w, i) => {
    const c = el('div', 'wave-cell'); c.append(el('div', 'wave-no', '波次 ' + (i + 1)), enemyIconEl(w), el('b', null, w.name), el('div', null, 'HP ' + w.hp), el('div', null, atkGapText(w)));
    if (w.phases && w.phases.length > 1) c.append(el('div', 'phase-tip', '⚠ 轉階段' + w.phases.slice(1).map(p => p.at != null ? '（HP ≤ ' + Math.round(p.at * 100) + '%）' : '').join('')));
    waves.append(c);
  });
  box.append(waves);
  const rec = [...new Set(s.waves.map(w => w.element).filter(Boolean).map(e => EL5.find(k => ELEMENTS[k].beats === e)))];   // 推薦屬性 = 克制敵人屬性
  const rs = el('div', 'stage-sec', '<b>推薦屬性</b>'), rr = el('div');
  rec.forEach(e => { const chip = el('span', 'elem-chip', e); chip.style.background = ELEMENTS[e].color; rr.append(chip); });
  if (!rec.length) rr.append(el('small', null, '無')); rs.append(rr); box.append(rs);
  const rw = el('div', 'stage-sec', '<b>獎勵</b>'), row = (h, first) => rw.append(el('div', 'rw' + (first && cleared ? ' done' : ''), h));
  if (s.coins) { row(`金幣 ×${s.coins.first}<span class="tag">首通</span>`, true); row(`金幣 ×${s.coins.repeat}`); } else row(`金幣 ×${CFG.WIN_COINS}`);
  row(`神性碎片 ×${CFG.SHARD_DROP_N}　${Math.round(CFG.SHARD_DROP * 100)}%`);
  (s.drops || []).forEach(id => { const c = charById(id); if (!c) return; row(`角色「${c.name}」${stars(c.star)}<span class="tag">首通</span>　100%`, true); row(`角色「${c.name}」${stars(c.star)}　${Math.round(CFG.CHAR_DROP * 100)}%`); });
  box.append(rw);
  const go = el('button', 'primary', '出發'); go.onclick = () => { pending = { d, s }; selSlot = 0; closeSheet('#sheet-bg'); openParty(); };
  box.append(go); return box;
}
function openStages(d) {   // 由下往上彈出的關卡視窗：關卡可展開／收合，展開後顯示副本資訊與「出發」
  $('#sheet-title').textContent = d.name; const list = $('#stage-list'); let openId = null;
  const draw = () => {
    list.innerHTML = '';
    d.stages.forEach(s => {
      const open = openId === s.id, item = el('div', 'stage-item');
      const head = el('button', 'stage-btn stage-head', `<span>${s.name}<small>　${s.waves.length} 名敵人${cleared(s) ? '｜最佳 ' + fmt(save.bests[s.id]) : ''}</small></span><span class="chev">${open ? '✕' : '▽'}</span>`);
      head.onclick = () => { openId = open ? null : s.id; draw(); };
      item.append(head); if (open) item.append(stageInfo(d, s)); list.append(item);
    });
  };
  const cleared = s => save.bests[s.id] != null;
  draw(); $('#sheet-bg').classList.add('open');
}

/* --- 編成（1~6 號位；隊長技要放對號位才會生效） --- */
function activeLeaders(ids) {
  const out = [];
  ids.forEach((id, i) => { const c = charById(id); if (c && c.leader && c.leader.pos.includes(i + 1)) out.push({ c, slot: i + 1 }); });
  return out;
}
function hpMult(ids) {   // 帕魯魂（5★）：另一個「帕魯魂」也生效時，總 HP ×1.5（只算一次）
  const act = activeLeaders(ids);
  for (const a of act) for (const f of a.c.leader.fx) if (f.t === 'paruHp' && act.some(b => b.slot !== a.slot && b.c.leader.name === '帕魯魂')) return f.v;
  return 1;
}
// 依持有數整理隊伍：同一角色在隊上的格數不可超過持有數。超出的格子 = 被消耗掉的那一份，
// 升星時換成升星後的角色（up = { from, to }），其他情況（例如被當技能素材）則清空；隊上若仍有其他份就不動
function syncParty(up) {
  const used = {};
  save.party = save.party.map(id => { if (!id) return null; used[id] = (used[id] || 0) + 1; return used[id] <= (save.owned[id] || 0) ? id : (up && up.from === id ? up.to : null); });
  if (!save.party.some(Boolean)) save.party = [...DEFAULT_PARTY];
}
function openParty() { $('#go').hidden = !pending; $('#party-back').dataset.to = pending ? 'dungeons' : 'title'; renderParty(); show('party'); }
function renderParty() {
  const box = $('#slots'); box.innerHTML = '';
  for (let i = 0; i < CFG.PARTY_SIZE; i++) {
    const ch = charById(save.party[i]), b = el('button', 'slot' + (i === selSlot ? ' sel' : ''));
    b.append(el('span', 'slot-no', (i + 1) + ' 號'), ch ? iconEl(ch) : el('div', 'icon empty', '+'));
    b.onclick = () => { selSlot = i; renderParty(); openPicker(i); }; box.append(b);
  }
  const ch = charById(save.party[selSlot]), hpSum = Math.floor(save.party.reduce((a, id) => a + (charById(id) ? charById(id).hp : 0), 0) * hpMult(save.party));
  $('#party-info').innerHTML = (pending ? `<b>${pending.d.name} › ${pending.s.name}</b>　隊伍總 HP ${hpSum}<hr>` : `隊伍總 HP ${hpSum}<hr>`) +
    (ch ? `<b>${selSlot + 1} 號位：${ch.name}</b> ${stars(ch.star)}（${ch.element}）HP ${ch.hp}／攻擊 ${ch.atk}<br>技能「${ch.skill.name}」Lv.${famLv(ch)}｜CD ${cdOf(ch)}<br>${ch.skill.desc}` : `${selSlot + 1} 號位：空`);
  const act = activeLeaders(save.party);
  $('#leader-info').innerHTML = '<b>目前生效的隊長技</b><hr>' + (act.length ? act.map(a => `<div>【${a.slot} 號位 ${a.c.name}】<b>${a.c.leader.name}</b><br><small>${a.c.leader.desc}</small></div>`).join('') : '<small>沒有生效的隊長技（需把角色放在隊長技指定的號位）</small>');
}
function cmpPanel(title, ch, slot, emptyTxt, note) {   // 替換視窗的資訊面板：號位、HP、攻擊、主動技、隊長技
  const p = el('div', 'cmp-panel'); p.append(el('div', 'cmp-title', `${title}　<b>${slot + 1} 號位</b>`));
  if (!ch) { p.append(el('div', 'cmp-empty', emptyTxt)); return p; }
  const top = el('div', 'cmp-top'), av = el('div', 'cmp-av'), L = ch.leader, on = L && L.pos.includes(slot + 1);
  av.append(iconEl(ch, true), el('div', 'rdesc', ch.short || ch.name));
  top.append(av, el('div', null, `<b>${ch.name}</b><br><span class="stars">${stars(ch.star)}</span> ${ch.element}<br>HP <b>${ch.hp}</b>　攻擊 <b>${ch.atk}</b>`));
  p.append(top, el('div', 'box', `<b>主動技「${ch.skill.name}」</b> Lv.${famLv(ch)}｜CD ${cdOf(ch)}<br>${ch.skill.desc}`),
    el('div', 'box', L ? `<b>隊長技「${L.name}」</b><br>${L.desc}<br><small>需放 ${L.pos.join(' 或 ')} 號位，${on ? '放在此號位會生效' : '放在此號位不會生效'}</small>` : '<small>無隊長技</small>'));
  if (note) p.append(el('small', null, note)); return p;
}
function openPicker(i) {   // 點選角色先在上方比較「原角色／替換角色」，按「確認替換」才真正替換
  const g = $('#roster-grid'), panels = el('div', 'cmp'), ok = el('button', 'primary', '確認替換'), pf = newFilter();
  let sel, cards = [];   // sel：undefined = 尚未選擇；null = 清空欄位；其餘為角色 id
  const refresh = () => {
    const old = charById(save.party[i]); let right;
    if (sel === undefined) right = cmpPanel('替換', null, i, '請從下方選擇要替換的角色');
    else if (sel === null) right = cmpPanel('替換', null, i, '清空此欄位');
    else { const j = save.party.indexOf(sel); right = cmpPanel('替換', charById(sel), i, '', j >= 0 && j !== i ? `目前在 ${j + 1} 號位，確認後會與此號位互換` : ''); }
    panels.replaceChildren(cmpPanel('原', old, i, '目前這裡空空如也'), right); ok.disabled = sel === undefined;
    cards.forEach(c => c.b.classList.toggle('picked', c.id === sel));
  };
  const drawGrid = () => {
    g.innerHTML = ''; cards = [];
    const add = (b, id) => { b.onclick = () => { sel = id; refresh(); }; cards.push({ b, id }); g.append(b); };
    applyFilter(ownedChars(), pf).forEach(ch => { const b = el('button', 'rcard'); b.append(iconEl(ch), el('div', 'rname', ch.short || ch.name), el('div', 'rdesc', stars(ch.star))); add(b, ch.id); });
    add(el('button', 'rcard', '<div class="icon empty">✕</div><div class="rname">清空欄位</div>'), null); refresh();
  };
  ok.onclick = () => { if (sel === undefined) return; setSlot(i, sel); closeSheet('#pick-bg'); };
  bindFilter($('#pick-filter'), pf, drawGrid);
  $('#pick-cmp').replaceChildren(panels); $('#pick-bar').replaceChildren(ok); drawGrid(); $('#pick-bg').classList.add('open');
}
function setSlot(i, id) {
  const p = save.party, old = p[i];
  if (id) { const j = p.indexOf(id); if (j >= 0) p[j] = old; }   // 已在別格就互換
  p[i] = id;
  if (!p.some(Boolean)) { p[i] = old; toast('隊伍至少要有一名角色'); }
  persist(); renderParty();
}
$('#go').onclick = () => startStage();
$('#guide-btn').onclick = () => { SFX.unlock(); $('#guide-bg').classList.add('open'); };   // 標題右下角：遊玩前導

/* --- 角色庫：持有角色一覽（可排序／篩選） --- */
function renderRoster() {
  const g = $('#own-grid'); g.innerHTML = '';
  $('#own-info').textContent = `神性碎片 ${save.shards}｜金幣 ${save.coins}`;
  applyFilter(ownedChars(), rosterF).forEach(ch => {
    const b = el('button', 'cell'); b.append(iconEl(ch, true), el('div', 'stars', stars(ch.star)), el('div', 'rdesc', (ch.short || ch.name) + ' ×' + save.owned[ch.id]));
    b.onclick = () => { curDetail = ch.id; renderDetail(ch.id); show('detail'); }; g.append(b);
  });
}
bindFilter($('#filter-btn'), rosterF, renderRoster);

/* --- 角色詳情：HP、攻擊、稀有度、技能、隊長技；左下角「技能升級」「角色升星」 --- */
function renderDetail(id) {
  const ch = charById(id), L = ch.leader, lv = famLv(ch);
  $('#d-portrait').replaceChildren(portraitEl(ch));
  $('#d-info').innerHTML = `<h3>${ch.name}</h3><div class="stars">${stars(ch.star)}　屬性 ${ch.element}　持有 ×${save.owned[id]}</div>
    <div class="stat-row"><span>基礎 HP <b>${ch.hp}</b></span><span>基礎攻擊 <b>${ch.atk}</b></span><span>稀有度 <b>${ch.star}★</b></span></div>
    <div class="box"><b>主動技能「${ch.skill.name}」</b> Lv.${lv}/${lvMaxOf(ch)}${lv < lvMaxOf(ch) && progOf(ch) > 0 ? `　<b>進度 ${progOf(ch)}/${lvNeedOf(ch)[lv]}</b>` : ''}　CD ${cdOf(ch)}<small>（基礎 ${ch.skill.cd}，每升 1 級 -1）</small><br>${ch.skill.desc}</div>
    <div class="box"><b>隊伍技${L ? `「${L.name}」` : ''}</b><br>${L ? `${L.desc}<br><small>需放在 ${L.pos.join(' 或 ')} 號位</small>` : '無'}</div>`;
  $('#btn-star').hidden = !ch.upTo;
  $('#btn-skill').onclick = () => openSkillUp(ch); $('#btn-star').onclick = () => openStarUp(ch);
}
// 技能升級：同「技能名稱」的角色（不必同一人）每份可當素材；目標本身與免費三星角色至少保留 1 份
const spare = (c, t) => Math.max(0, (save.owned[c.id] || 0) - (c.id === t.id || c.star === 3 ? 1 : 0));
const sameSkill = ch => CHARACTERS.filter(c => c.skill.name === ch.skill.name);
function openSkillUp(ch) {   // 列出所有「技能同名」的持有角色（每份持有一格），由玩家選擇要消耗哪些；可累積進度的技能允許投入不足的份數
  const lv = famLv(ch);
  if (lv >= lvMaxOf(ch)) return openDlg('技能升級', `「${ch.skill.name}」已是最高等級 Lv.${lv}`);
  const need = lvNeedOf(ch)[lv], part = partialOf(ch), p0 = progOf(ch), cap = need - p0, tiles = [], sel = new Set();
  sameSkill(ch).forEach(c => { for (let i = 0; i < spare(c, ch); i++) tiles.push(c); });
  const wrap = el('div'), info = el('div'), grid = el('div', 'mat-grid');
  const refresh = () => {
    const n = sel.size, lead = `「${ch.skill.name}」 Lv.${lv} → Lv.${lv + 1}（CD ${cdOf(ch)} → ${Math.max(1, ch.skill.cd - lv - 1)}）<br>`;
    info.innerHTML = part
      ? `${lead}目前進度 <b>${p0}/${need}</b>，還差 <b>${cap}</b> 名。素材不足也可以投入，進度會保留。<br>已選 <b>${n}</b> 名（投入後進度 <b>${p0 + n}/${need}</b>）`
      : `${lead}請選擇 <b>${need}</b> 名技能同名的角色當素材，已選 <b>${n}/${need}</b>`;
    $('#dlg-ok').disabled = part ? n < 1 : n !== need;
    $('#dlg-ok').textContent = p0 + n >= need ? '確認升級' : '投入素材';
  };
  tiles.forEach((c, i) => {
    const b = el('button', 'rcard'); b.append(iconEl(c), el('div', 'rname', c.short || c.name), el('div', 'rdesc', stars(c.star)));
    b.onclick = () => { if (sel.has(i)) sel.delete(i); else if (sel.size < cap) sel.add(i); b.classList.toggle('picked', sel.has(i)); refresh(); }; grid.append(b);
  });
  wrap.append(info, grid);
  if (!tiles.length) wrap.append(el('small', null, '目前沒有可用的素材角色（目標角色與免費三星角色各至少保留 1 份）。可到商店抽獎或通關副本取得更多。'));
  openDlg('技能升級', wrap, '確認升級', () => {
    const n = sel.size; if (part ? n < 1 : n !== need) return toast(part ? '請至少選 1 名素材' : `請選滿 ${need} 名`);
    [...sel].forEach(i => save.owned[tiles[i].id]--);   // 消耗玩家選中的對象
    syncParty();
    if (p0 + n >= need) { save.skillLv[ch.fam] = lv + 1; save.skillProg[ch.fam] = 0; toast(`技能升到 Lv.${lv + 1}，CD -1！`); }
    else { save.skillProg[ch.fam] = p0 + n; toast(`進度 ${p0 + n}/${need}`); }
    persist(); closeSheet('#dlg-bg'); renderDetail(ch.id);
  });
  refresh();
}
function openStarUp(ch) {
  const to = charById(ch.upTo);
  openDlg('角色升星', `${ch.name} ${stars(ch.star)} → ${stars(to.star)}<br>需要「神性碎片」<b>${CFG.SHARD_COST}</b> 個（目前 <b>${save.shards}</b> 個）<br><small>升星不會重置技能等級；關卡通關有 50% 機率掉落神性碎片</small>`, '確認升星', () => {
    if (save.shards < CFG.SHARD_COST) return toast('神性碎片不足');
    save.shards -= CFG.SHARD_COST; save.owned[ch.id]--; save.owned[to.id] = (save.owned[to.id] || 0) + 1;
    syncParty({ from: ch.id, to: to.id });
    persist(); closeSheet('#dlg-bg'); curDetail = to.id; renderDetail(to.id); toast('升星成功！');
  });
}

/* --- 商店：購買抽獎券、使用抽獎券、獎池資訊 --- */
function renderShop() {
  const b = $('#shop-body'); b.innerHTML = `<div class="infobox">金幣 <b>${save.coins}</b>　神性碎片 <b>${save.shards}</b></div>`;
  SHOP.forEach(s => {
    const c = el('div', 'infobox ticket', `<b>${s.name}</b>　持有 ${save.tickets[s.id] || 0} 張<br>每張抽 ${s.count} 名角色（每次獨立計算）<br>`);
    const info = el('button', 'info-btn', 'i'); info.title = '獎池資訊'; info.onclick = () => openPool(s);
    const buy = el('button', 'primary', `購買（${s.price} 金幣）`), use = el('button', 'primary', '使用 1 張');
    buy.onclick = () => { if (save.coins < s.price) return toast('金幣不足'); save.coins -= s.price; save.tickets[s.id] = (save.tickets[s.id] || 0) + 1; persist(); renderShop(); };
    use.onclick = () => useTicket(s); c.append(info, buy, ' ', use); b.append(c);
  });
}
function openPool(s) {   // 獎池資訊：各星級機率與獎池內所有角色（尚未持有的以灰色顯示）
  const ks = Object.keys(s.rates).map(Number).sort((a, b) => b - a), tot = ks.reduce((a, k) => a + s.rates[k], 0), wrap = el('div');
  ks.forEach(k => {
    const list = CHARACTERS.filter(c => c.star === k && !c.dropStage);
    wrap.append(el('div', 'gline', `<span class="stars">${stars(k)}</span>　${+(s.rates[k] / tot * 100).toFixed(2)}%　<small>（${list.length} 名）</small>`));
    const g = el('div', 'pool-grid');
    list.forEach(c => { const d = el('div', 'rcard' + (save.owned[c.id] > 0 ? '' : ' unowned')); d.append(iconEl(c), el('div', 'rdesc', c.short || c.name)); g.append(d); });
    wrap.append(g);
  });
  wrap.append(el('small', null, '灰色 = 尚未持有；副本掉落角色不在獎池內。'));
  openDlg(s.name + '　獎池資訊', wrap);
}
/* --- 抽到四星（含以上）的抽獎動畫：蓄力 → 爆閃 → 立繪登場；多隻四星依序登場，點一下換下一隻，「略過」直接看結果；結束後才呼叫 done（顯示抽獎結果） --- */
function playGachaFx(list, done) {   // list：[{ c: 角色, isNew }…]
  const fx = $('#gacha-fx'), reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let i = 0, phase = '', tm = [], canNext = false, ended = false;
  const later = (f, ms) => tm.push(setTimeout(f, ms)), clear = () => { tm.forEach(clearTimeout); tm = []; };
  const setPhase = p => { phase = p; fx.dataset.phase = ''; void fx.offsetWidth; fx.dataset.phase = p; };   // 先清掉再設，動畫才會重新播
  const sparks = (n, col) => {   // 迸出光點
    const box = $('#gfx-sparks');
    for (let k = 0; k < n; k++) {
      const s = el('i'), a = Math.random() * 6.283, d = 70 + Math.random() * 280, c = Math.random() < .5 ? '#fff3c4' : (Math.random() < .5 ? '#ffd166' : col);
      s.style.cssText = `--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px;--s:${(3 + Math.random() * 7).toFixed(1)}px;--t:${(.7 + Math.random() * .8).toFixed(2)}s;background:${c};color:${c}`;
      box.append(s); setTimeout(() => s.remove(), 1700);
    }
  };
  const charge = () => {
    clear(); canNext = false; fx.style.setProperty('--c', ELEMENTS[list[i].c.element].color);
    $('#gfx-hint').className = ''; $('#gfx-hint').textContent = ''; fx.hidden = false; setPhase('charge'); SFX.gacha();
    later(burst, reduce ? 500 : 1500);
  };
  const burst = () => {
    if (phase !== 'charge') return; clear(); setPhase('burst'); sparks(24, ELEMENTS[list[i].c.element].color); SFX.boom();
    later(reveal, reduce ? 0 : 380);
  };
  const reveal = () => {
    clear(); const { c, isNew } = list[i], col = ELEMENTS[c.element].color;
    $('#gfx-art').replaceChildren(portraitEl(c));
    $('#gfx-stars').innerHTML = Array.from({ length: c.star }, (_, k) => `<span style="animation-delay:${(.3 + k * .16).toFixed(2)}s">★</span>`).join('');
    $('#gfx-name').textContent = c.name;
    $('#gfx-sub').innerHTML = `<span class="gfx-el" style="background:${col}">${c.element}</span>` + (isNew ? '<span class="gfx-new">NEW</span>' : '');
    setPhase('reveal'); sparks(44, col); SFX.win();
    later(() => { canNext = true; const h = $('#gfx-hint'); h.textContent = list.length > 1 ? `點一下繼續（${i + 1}/${list.length}）` : '點一下繼續'; h.className = 'on'; }, reduce ? 200 : 1000);
  };
  const finish = () => { if (ended) return; ended = true; clear(); fx.hidden = true; fx.dataset.phase = ''; fx.onclick = null; $('#gfx-skip').onclick = null; done(); };
  fx.onclick = () => { if (phase === 'charge') burst(); else if (phase === 'reveal' && canNext) { if (++i < list.length) charge(); else finish(); } };
  $('#gfx-skip').onclick = e => { e.stopPropagation(); finish(); };
  charge();
}
function useTicket(s) {
  if (!(save.tickets[s.id] > 0)) return toast('沒有抽獎券了');
  save.tickets[s.id]--;
  const ks = Object.keys(s.rates).map(Number), tot = ks.reduce((a, k) => a + s.rates[k], 0), res = [];
  for (let i = 0; i < s.count; i++) {
    let x = r(0, tot), star = ks[0]; for (const k of ks) { x -= s.rates[k]; if (x < 0) { star = k; break; } }
    const c = pick(CHARACTERS.filter(c => c.star === star && !c.dropStage)); res.push({ c, isNew: !(save.owned[c.id] > 0) }); save.owned[c.id] = (save.owned[c.id] || 0) + 1;   // 副本掉落角色不進抽獎池
  }
  persist(); renderShop();
  const showResult = () => {
    openDlg('抽獎結果', '<div id="gacha-grid"></div>');
    res.forEach(({ c, isNew }) => { const d = el('div', 'rcard'); d.append(iconEl(c), el('div', 'rname', c.short || c.name), el('div', 'rdesc', stars(c.star) + (isNew ? ' NEW' : ''))); $('#gacha-grid').append(d); });
  };
  const hi = res.filter(x => x.c.star >= 4);   // 抽到四星（含以上）才播動畫，其餘直接看結果
  if (hi.length) playGachaFx(hi, showResult); else { SFX.gacha(); showResult(); }
}

// 設定
function renderSettings() {
  $('#vol').value = Math.round(save.settings.volume * 100); $('#vol-v').textContent = $('#vol').value;
  ['up', 'down'].forEach(k => $('#key-' + k).textContent = keyLabel(save.settings.keys[k]));
  $$('#touch-seg button').forEach(b => b.classList.toggle('on', b.dataset.touch === save.settings.touch));
  $('#touch-hint').textContent = TOUCH_HINT[save.settings.touch];
}
const TOUCH_HINT = { ud: '上半螢幕＝跳躍（空中再點＝二段跳）、下半螢幕＝往下掉', lr: '右半螢幕＝跳躍（空中再點＝二段跳）、左半螢幕＝往下掉（可雙手同時操作）' };
$$('#touch-seg button').forEach(b => b.onclick = () => { save.settings.touch = b.dataset.touch; persist(); renderSettings(); });
$('#vol').oninput = e => { save.settings.volume = e.target.value / 100; SFX.setVolume(save.settings.volume); $('#vol-v').textContent = e.target.value; persist(); };
$('#vol').onchange = () => SFX.orb(3);
['up', 'down'].forEach(k => $('#key-' + k).onclick = () => { bindingFor = k; $('#key-' + k).textContent = '請按下按鍵…'; });
function finishBind(key) {
  const k = bindingFor, other = k === 'up' ? 'down' : 'up';
  if (key === 'escape') { /* 取消 */ }
  else if (/^[1-6]$/.test(key) || key === save.settings.keys[other]) toast('此按鍵已被使用');
  else if (key.length > 1 && !['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) toast('不支援此按鍵');
  else save.settings.keys[k] = key;
  bindingFor = null; persist(); renderSettings();
}


/* ===== 5-b. 關卡本體 ===== */
const cv = $('#c'), ctx = cv.getContext('2d');
let S = 320, speedMul = 1;   // 跑速／飛行加速
// 畫布尺寸、物理常數、二段跳軌跡（W／H／LY／airPlan…）已移到 mapgen.js
// ===== 版面：全部由 W／H／PANEL_Y／LY 推算（比例 ＝ 設計稿位置 ÷ 畫布寬或高），改畫布尺寸或地面高度時會跟著走 =====
const fx = f => Math.round(W * f), fy = f => Math.round(H * f);   // 依畫布寬／高的比例取座標
const inR = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const UI = (() => {
  const m = fx(.0146), pad = fx(.0125);   // 外距、面板內距
  const tim = { x: m, y: m, w: fx(.177), h: fy(.083) };                       // 計時
  const hpb = { x: m, y: tim.y + tim.h + fy(.0125), w: fx(.281), h: tim.h };  // 我方 HP
  const boss = { y: m, w: fx(.3125), h: fy(.1) }; boss.x = W - m - boss.w;    // 敵人 HP
  const pause = { y: m, w: boss.h, h: boss.h }; pause.x = boss.x - pad - pause.w;   // 暫停鈕（敵人 HP 左邊的方鈕）
  const chips = { step: fx(.0417), plX: m + fx(.0167), plY: hpb.y + hpb.h + fy(.046), enX: W - m - fx(.0167), enY: boss.y + boss.h + fy(.0417) };   // 狀態圖示列
  const card = { w: fx(.3), h: fy(.46) }; card.x = (W - card.w) / 2; card.y = (PANEL_Y - card.h) / 2;   // 暫停視窗（置中於遊玩區）
  const bw = card.w * .8, bh = fy(.1), bx = card.x + (card.w - bw) / 2;
  const resume = { x: bx, y: card.y + card.h * .42, w: bw, h: bh }, quitB = { x: bx, y: resume.y + bh + fy(.03), w: bw, h: bh };
  return { m, pad, tim, hpb, boss, pause, chips, card, resume, quitB };
})();
const SLOT_W = W / 6, slotL = sl => sl * SLOT_W, slotX = sl => slotL(sl) + SLOT_W / 2;   // 隊伍列 1~6 號位：每格寬 W/6；slotL＝格子左緣、slotX＝格子中心
// 立繪擺放（cx = 水平中心、bottom = 底邊、w/h = 最大寬高，依比例縮放不裁切）；我方(atk)與敵人(enemy)的 bottom／w／h 保持一致才會齊高
const PB = { bottom: LY[1] + Math.round(LANE_GAP * .55), w: fx(.219), h: fy(.396) };   // 我方／敵人立繪的共同尺寸與底邊（落在第二、三層地面之間）
const PT = { enemy: { cx: W - fx(.13), ...PB }, atk: { cx: fx(.13), ...PB }, cut: { cx: W / 2, bottom: PANEL_Y - fy(.0104), w: fx(.344), h: fy(.625) } };
const EN = { x: PT.enemy.cx, y: PT.enemy.bottom - PT.enemy.h / 2 }, enY = f => Math.round(EN.y + PT.enemy.h * f);   // 敵人立繪中心；enY(f)＝中心往下 f 倍立繪高   // 敵人立繪中心：傷害數字、台詞、特效的出現位置
const ENEMY_FRONT = false;   // true：敵人立繪畫在地面之上（不會被三層地面蓋住）；false：維持原本畫在地面後面
function drawFit(im, cx, bottom, maxW, maxH) {   // 水平置中、保持比例縮放，回傳實際範圍
  const s = Math.min(maxW / im.width, maxH / im.height), w = im.width * s, h = im.height * s;
  ctx.drawImage(im, cx - w / 2, bottom - h, w, h); return { x: cx - w / 2, y: bottom - h, w, h };
}   // 三層地面高度、下方隊伍列起點、掉落判定
// 三層地面判定、跑速、buildMap／MAP 已移到 mapgen.js

let paused = false;   // 暫停中（只有 state === 'play' 時能暫停；暫停時不呼叫 update，畫面仍照畫）
let state = 'idle', t = 0, scroll = 0, elapsed = 0, py, vy, grounded, lane, dropLane, coyote, jumpBuf, airLeft = 0, dropReq = false, keyS = false, invul;
let pBar = { g: 0, last: 0, hold: 0 }, eBar = { g: 0, last: 0, hold: 0 };   // 扣血動畫：g = 白色殘影條目前的血量（會慢慢縮到現有血量）
let hp, maxHp, chain, maxChain, fever, feverEnd, feverPending, feverBonus = 0, feverUsed = new Set(), feverPendMs = [], orbsGot, shake = 0, hitFlash = 0, flashT = 0, winDelay = 0, loseT = 0, loseReason = '';
let particles, floaters, counterEl = null;   // 地圖狀態（gaps／orbs／cur／L…）在 mapgen.js
let team = [], leaderFx = [], waves = [], waveIdx = 0, enemy = null, ehp = 0, status = {}, fly = 0, atkAnim = null, cut = null, skillQ = [];
let atkPtr = 0, enemyT = 0, atkIdx = 0, ph = 'fight', special = null, trans = null, banner = null, last = performance.now();

function reset() {
  scroll = elapsed = 0; py = LY[2]; vy = 0; grounded = true; lane = 2; dropLane = -1; coyote = jumpBuf = invul = airLeft = 0;
  chain = maxChain = 0; feverUsed = new Set(); feverPendMs = []; feverBonus = 0; fever = false; feverEnd = 0; feverPending = false; orbsGot = 0; shake = hitFlash = flashT = 0;
  // 開場就是完整三層地面（沒有缺口、沒有任何球）
  gaps = [[], [], []]; laneOn = [true, true, true]; orbs = []; moles = []; fires = []; arrows = []; ices = []; particles = []; floaters = [];
  cur = genFrom = W + CFG.START_PAD; L = 2; first = true; status = { dodge: false, convert: null, dmgUp: {}, block: 0, shield: null, magnet: null, taken: [] }; fly = 0; speedMul = 1; soloLane = -1;
  atkAnim = null; atkPtr = 0; cut = null; skillQ = []; genPause = false; special = null; trans = null; banner = null; hp = maxHp;
  pBar = { g: hp, last: hp, hold: 0 };
}
function loadWave(i) {   // 換下一位敵人：重置該敵人的狀態與攻擊進度
  waveIdx = i; const w = waves[i];
  enemy = { ...w, attacks: w.attacks || [], st: { space: 0, poisons: [] }, dead: false, deadT: 0, gone: false, appear: 0, phase: 0, openQ: [] }; ehp = w.hp; eBar = { g: ehp, last: ehp, hold: 0 };
  enemyT = 0; atkIdx = 0; ph = 'fight'; segIdx = 0; team.forEach(m => m.pend = 0); if (w.phases) setPhase(0);
  counterEl = w.element ? EL5.find(k => ELEMENTS[k].beats === w.element) : null;   // 相剋屬性：每波保底出現兩段
  banner = { txt: `波次 ${i + 1}/${waves.length}`, t: 0 };
}
function setPhase(i) {   // 階段制敵人：換階段 = 換攻擊列表，並排入該階段的開場先制攻擊（不需等冷卻）
  const p = enemy.phases[i]; enemy.phase = i; enemy.attacks = p.attacks || []; enemy.openQ = [...(p.open || [])]; atkIdx = 0;
}
function startStage() {
  const ids = save.party.map(id => charById(id) && save.owned[id] > 0 ? id : null);
  team = []; ids.forEach((id, slot) => { if (id) { const ch = charById(id); team.push({ ch, slot, cdMax: cdOf(ch), cd: cdOf(ch), en: 0, pend: 0, queued: false }); } });
  if (!team.length) return toast('請先編隊');
  leaderFx = []; activeLeaders(ids).forEach(a => a.c.leader.fx.forEach(f => leaderFx.push({ ...f, src: a.c.id })));   // 隊長技：放對號位才生效
  MAP = buildMap(pending.s.map); S = baseSpeed();
  waves = pending.s.waves; maxHp = Math.floor(team.reduce((a, m) => a + m.ch.hp, 0) * hpMult(ids));
  $('#result').hidden = true; paused = false; reset(); loadWave(0); state = 'ready'; show('game'); last = performance.now();   // 預備畫面不生成地圖：只有空的三層安全地面，按下開始後才進入地圖生成
}
function quit() { paused = false; state = 'idle'; openParty(); }

/* ----- 地圖生成（gen／startFever／windDown／exitSafe／placeOnGround）已移到 mapgen.js ----- */

/* ----- 傷害計算：屬性相剋 × chain × 隊長技（整數運算、無條件捨去） ----- */
const elemMult = (a, d) => !a || !d ? 1 : ELEMENTS[a].beats === d ? 1.5 : ELEMENTS[d].beats === a ? .8 : 1;
const lfx = tp => leaderFx.filter(f => f.t === tp);
function calcDmg(ch, base) {
  const du = (status.dmgUp || {})[ch.element]; let m = du ? du.v : 1; const lh = lfx('lowHpDmg')[0]; if (lh && hp <= maxHp * lh.thr) m *= lh.v;   // 帕魯魂：HP 50% 以下全隊 ×2（不疊乘）
  for (const f of leaderFx) { if (f.t === 'selfDmg' && f.src === ch.id) m *= f.v; else if (f.t === 'elemDmg' && f.el === ch.element) m *= f.v; }
  let d = Math.floor(base * Math.round(elemMult(ch.element, enemy.element) * 10) * (100 + chain * CFG.CHAIN_BONUS) / 1000 * m + 1e-6);
  const rd = enemy.st.reduce ?? enemy.reduce; if (rd && !(enemy.st.space > 0)) d = Math.floor(d * (1 - rd));   // 敵人減傷（空間陣期間無視）；來源：敵人資料 reduce 或攻擊的 shield.reduce
  return d;
}
const hitEnemy = (ch, base, isSkill) => damageEnemy(calcDmg(ch, base), { ch, isSkill });
// 固定傷害：不受任何增傷（屬性、chain、隊長技、buff）與減傷影響；敵人有 dodge（0～1 的閃避機率）時可被閃避。回傳是否造成傷害
function fixedHit(n, o = {}) {
  if (enemy.dead || enemy.gone || n <= 0) return false;
  if (enemy.dodge && Math.random() < enemy.dodge) { floaters.push({ x: EN.x + r(-30, 30), y: EN.y, txt: '閃避', c: '#9ad1ff', big: true, l: 1 }); return false; }
  damageEnemy(n, { isSkill: true, fixed: true });
  if (lfx('fixedCd').length) team.forEach(m => { m.cd = Math.max(0, m.cd - 1); });                  // 節拍大師：每次固定傷害，全隊技能 CD -1
  if (!o.extra && lfx('fixedEcho').length && !enemy.dead) fixedHit(n, { extra: true });            // 氣運之子：追加同值傷害（追加傷害不再觸發氣運之子）
  return true;
}
function damageEnemy(d, o = {}) {
  if (enemy.dead || enemy.gone || d <= 0) return;
  const st = enemy.st;
  if (!o.fixed && st.vuln > 0) d = Math.floor(d * st.vulnV);   // 敵人受傷增加（固定傷害不受影響）
  if (st.floor != null && !o.poison && d <= st.floor) { floaters.push({ x: EN.x + r(-30, 30), y: EN.y, txt: '護盾 0', c: '#9ad1ff', big: !!o.isSkill, l: 1 }); return; }   // 護盾：單次傷害 ≤ floor 歸零（毒蝕不受影響）
  if (st.cap != null && d > st.cap) d = st.cap;                                                                                                                  // 上限盾：超過 cap 的固定為 cap（不改變 o.fixed）
  ehp = Math.max(0, ehp - d); const m = o.ch ? elemMult(o.ch.element, enemy.element) : 1;
  for (const f of lfx('hitEnergy')) { const t = team.find(x => x.ch.id === f.src); if (t) { t.en += f.v; while (t.en >= CFG.ENERGY_MAX) { t.en -= CFG.ENERGY_MAX; t.pend++; } } }   // 布偶神的庇護(5★)：隊伍每造成一次傷害（含毒蝕每秒的傷害）使自身能量 +20
  if (o.poison) floaters.push({ x: EN.x + 20 + r(-20, 20), y: enY(.16), txt: '-' + d, c: '#c77dff', l: .8 });
  else {
    hitFlash = .15; shake = Math.max(shake, o.isSkill ? 16 : 6); boom(EN.x + 20, enY(.21), o.isSkill ? '#ff9f1c' : '#ffd166', o.isSkill ? 40 : 16);
    floaters.push({ x: EN.x + r(-30, 30), y: EN.y, txt: '-' + d + (m > 1 ? ' 克制!' : m < 1 ? ' 被剋' : ''), c: o.fixed ? '#ffe066' : m > 1 ? '#7dff9a' : m < 1 ? '#ff8a8a' : '#fff', big: !!o.isSkill, l: 1.1 });
  }
  if (ehp <= 0) { enemy.dead = true; enemy.deadT = 0; team.forEach(m => m.pend = 0); atkAnim = null; skillQ.forEach(m => m.queued = false); skillQ = []; SFX.boom(); }   // 敵人倒下：停止攻擊，發光後淡出
}
function hurtPlayer(n, fromEnemy) {
  n = Math.floor(n * status.taken.reduce((a, x) => a * x.v, 1) + 1e-6);   // 玩家受傷增加（可多來源相乘）
  hp = Math.max(0, hp - n); if (!fromEnemy) { invul = 1.3; loseChain(); } shake = 12; boom(PX, py - 30, '#ef476f', 14); SFX.hit();
  floaters.push({ x: PX, y: py - 70, txt: '-' + n, c: '#ff6b6b', l: 1 }); if (hp <= 0) lose('HP 歸零');
}
function voidFall() {   // 掉入虛空：扣現有 HP 一半並重置位置（時間照常計算）
  const loss = Math.floor(hp / 2); hp -= loss; shake = 14; SFX.hit(); loseChain();
  floaters.push({ x: PX, y: LY[2] - 40, txt: '-' + loss + ' 掉入虛空', c: '#ef476f', l: 1.3 });
  if (hp <= 0) { hp = 0; lose('HP 歸零'); return false; }
  placeOnGround(); invul = 1.5; return true;
}
function payHp(rate) {   // 技能代價：失去當前 HP 的一定比例（至少保留 1 點，不會因此死亡）
  const loss = Math.floor(hp * rate); if (loss > 0) { hp -= loss; floaters.push({ x: PX, y: py - 70, txt: '-' + loss, c: '#ff6b6b', l: 1 }); } return loss;
}
function healPlayer(n) { const b = hp; hp = Math.min(maxHp, hp + n); if (hp > b) { floaters.push({ x: PX, y: py - 70, txt: '+' + (hp - b), c: '#ff9ecb', l: .9 }); SFX.heal(); } }
function addChain(n) {
  const b = chain; chain += n; maxChain = Math.max(maxChain, chain); floaters.push({ x: PX, y: py - 90, txt: 'CHAIN ' + chain, c: '#7df9ff', l: .9 });
  // Fever 區段：第 m 區段 = chain 到達 m × FEVER_AT（10、20、30…）。每個區段只能開一次，扣 chain 後再次經過已用過的區段不會開
  const ms = []; for (let m = Math.floor(b / CFG.FEVER_AT) + 1; m <= Math.floor(chain / CFG.FEVER_AT); m++) ms.push(m);
  if (ms.some(m => !feverUsed.has(m))) { feverPending = true; feverPendMs = ms; }
}
// 2. 掉入虛空／撞到陷阱：chain 扣一半（敵人攻擊不扣）
function loseChain() {
  if (chain <= 0) return;
  chain = Math.floor(chain * (1 - CFG.CHAIN_LOSS) + 1e-9);
  floaters.push({ x: PX, y: LY[2] - 70, txt: 'CHAIN ' + chain, c: '#ff9ecb', l: 1 });
}
// 4. Fever 重置（預留給未來角色技能）：只重置「大於目前 chain」的已使用區段，使其可再開一次
function resetFever() {
  let n = 0; for (const m of [...feverUsed]) if (m * CFG.FEVER_AT > chain) { feverUsed.delete(m); n++; }
  if (n) floaters.push({ x: PX, y: py - 110, txt: 'FEVER 重置', c: '#ffd166', l: 1.2 });
  return n;
}
function breakIce(ic) { ic.dead = true; boom(ic.x - scroll, ic.y, '#bfefff', 22); boom(ic.x - scroll, ic.y + 10, '#ffffff', 10); SFX.pop(); }
function boom(x, y, c, n) { for (let i = 0; i < n; i++) particles.push({ x, y, vx: r(-160, 160), vy: r(-200, 60), l: r(.3, .7), c }); }
function lose(why) { state = 'lose'; loseReason = why; vy = 0; loseT = .9; SFX.lose(); }

/* ----- 能量球：屬性球只填同屬性角色的能量條；彩虹球填全員；恢復球回血（楠雪隊長技另給隊伍一半能量） ----- */
function addEnergy(elem, n) {
  team.forEach(m => { if (elem == null || m.ch.element === elem) { m.en += n; while (m.en >= CFG.ENERGY_MAX) { m.en -= CFG.ENERGY_MAX; m.pend++; } } });
}
function applyOrb(o) {
  let k = o.k; if (k !== 'heal' && k !== 'rainbow' && status.convert) k = status.convert.el;   // 軍師技能：場上能量球視為指定屬性
  if (k === 'heal') { healPlayer(CFG.HEAL_ORB); const f = lfx('healOrbEnergy')[0]; if (f) addEnergy(null, CFG.ORB_ENERGY * f.v); }
  else if (k === 'rainbow') addEnergy(null, CFG.ORB_ENERGY);
  else { addEnergy(k, CFG.ORB_ENERGY); const f = lfx('woodHeal')[0]; if (f && k === '木') healPlayer(f.v); }
}
function collectOrbs(pc) {
  const bx = pc - 14, by = py - PH;
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i], cx = Math.max(bx, Math.min(o.x, bx + 28)), cy = Math.max(by, Math.min(o.y, by + PH));
    if (Math.hypot(o.x - cx, o.y - cy) >= 18) continue;
    orbs.splice(i, 1); orbsGot++; boom(o.x - scroll, o.y, '#fff', 6); SFX.orb(o.g ? o.g.got : 0); applyOrb(o);
    if (o.g && ++o.g.got === o.g.n) { addChain(1); SFX.chain(); }   // 吃完一整段（5 顆）→ chain+1
  }
}

/* ----- 角色技能（type 對應角色資料的 skill.type；新增技能種類在這裡加一項） ----- */
const SKILL_EFFECTS = {
  damage: (sk, ch) => hitEnemy(ch, sk.power, true),
  convert: (sk, ch) => { status.convert = { el: ch.element, t: sk.dur }; },
  fly: sk => { fly = sk.dur; },
  dmgUp: (sk, ch) => { status.dmgUp[ch.element] = { v: sk.mul, t: sk.dur }; },   // 將軍：持續期間全隊「該將軍屬性」的傷害 ×mul；同屬性再次施放只刷新時間（不疊乘），不同屬性互不影響
  heal: sk => { healPlayer(sk.power); if (sk.feverReset) resetFever(); },   // 5★ Moji：回復後依當前 chain 重置 Fever
  fixed: sk => { fixedHit(sk.power); if (sk.cdMinus) team.forEach(m => { m.cd = Math.max(0, m.cd - sk.cdMinus); }); },   // 固定傷害（詩織另加全隊 CD -1）
  rush: sk => {   // 奶龍衝撞：扣總 HP 一定比例（至少保留 1 點）→ 固定傷害；5★ 另外展開防護罩
    const loss = Math.min(hp - 1, Math.floor(maxHp * sk.cost)); if (loss > 0) { hp -= loss; floaters.push({ x: PX, y: py - 70, txt: '-' + loss, c: '#ff6b6b', l: 1 }); }
    fixedHit(sk.fixed); if (sk.shield) status.shield = { t: sk.shield };
  },
  hpBlast: (sk, ch) => { payHp(sk.cost); hitEnemy(ch, (maxHp - hp) * sk.mul, true); },   // 瓔雪楓：先付出 HP，再依「已損失 HP」造成傷害
  guard: sk => { payHp(sk.cost); status.block = sk.n; },                                   // 絕對存在：接下來 n 次敵方攻擊擋下（再次施放重設為 n，不累加）
  rainbow: sk => { status.convert = { el: 'rainbow', t: sk.dur }; if (sk.fly) fly = sk.fly; },   // 緹緹子：能量球變彩色球；5★ 另外立刻飛行   // 立刻恢復 HP（上限為最大 HP）
  dodge: (sk, ch) => { status.dodge = true; if (sk.atkMul) hitEnemy(ch, ch.atk * sk.atkMul, true); },
  space: (sk, ch) => { enemy.st.space = sk.dur; if (sk.atkMul) hitEnemy(ch, ch.atk * sk.atkMul, true); },
  chainUp: sk => {   // chain 增加（墨宇／Mochi）：可附帶 隨機角色 CD 減少、額外 Fever、防護罩
    if (sk.cdRandom) { const m = pick(team); m.cd = Math.max(0, m.cd - sk.cdRandom); floaters.push({ x: PX, y: py - 100, txt: m.ch.short + ' CD -' + sk.cdRandom, c: '#9ad1ff', l: 1.2 }); }
    if (sk.shield) status.shield = { t: sk.shield };
    if (sk.fever) feverBonus += sk.fever;
    addChain(sk.chain);   // 最後才加 chain：若剛好跨過 Fever 區段，先開一般 Fever，額外 Fever 排在後面
  },
  qian: (sk, ch) => {   // 楠雪：全隊（其他角色）技能 CD 減少、chain 增加；5★ 另外贈送額外 Fever，並在一段時間內吸引場上所有能量球
    team.forEach(m => { if (m.ch !== ch) m.cd = Math.max(0, m.cd - sk.cdMinus); });
    if (sk.magnet) status.magnet = { t: sk.magnet };
    if (sk.fever) feverBonus += sk.fever;
    addChain(sk.chain);
  },
  feverReset: () => { resetFever(); },   // 預留：Fever 重置技能（目前沒有角色使用；角色資料寫 skill: { type: 'feverReset', name, cd, desc } 即可）
  druid: (sk, ch) => { hitEnemy(ch, ch.atk * sk.atkMul, true); const pm = lfx('poisonMul')[0]; if (!enemy.dead) {
    const np = { src: ch.id, dps: sk.poison * (pm ? pm.v : 1), t: sk.dur, acc: 0 }, ps = enemy.st.poisons;   // 無羅馬精神時，再次施放＝取代舊毒蝕
    enemy.st.poisons = lfx('poisonStack').length ? [...ps, np] : [np];          // 羅馬精神生效：毒蝕全部並存（含同一角色重複施放）；否則新的取代舊的
  } },
};
function useSkill(slot) {
  const m = team.find(m => m.slot === slot);
  if (state !== 'play' || !m || m.cd > 0 || m.queued || enemy.dead || enemy.gone) return;
  if (cut) { m.queued = true; skillQ.push(m); return; }   // 敵人攻擊動畫中按技能：動畫結束後才放
  startSkillCut(m);
}
function startSkillCut(m) { m.queued = false; m.cd = m.cdMax; cut = { k: 'skill', m, t: 0, dur: 1.4, done: false }; SFX.skill(); }

/* ----- 敵人攻擊：每 15 秒一次。先進安全地圖，等玩家普攻放完，再播放台詞與攻擊動畫（動畫期間暫停計時） ----- */
function checkPhase() {
  if (!enemy.phases || enemy.dead || enemy.gone) return;
  let k = 0; enemy.phases.forEach((p, i) => { if (p.at != null && ehp <= enemy.hp * p.at) k = i; });
  if (k > enemy.phase) setPhase(k);
}
const enemyPreDue = () => enemy.openQ.length > 0 && !enemy.dead && !enemy.gone && ph !== 'trans';
function barTrail(b, cur, max, dt) {   // 扣血動畫：先停一下，再把白色殘影條縮到現有血量
  if (cur < b.last) b.hold = .35; b.last = cur;
  if (cur >= b.g) { b.g = cur; return; }
  if (b.hold > 0) { b.hold -= dt; return; }
  b.g = Math.max(cur, b.g - max * .5 * dt);
}
function startEnemyAttack() { const pre = enemy.openQ.length > 0, atk = pre ? enemy.openQ.shift() : enemy.attacks[atkIdx++ % enemy.attacks.length]; cut = { k: 'enemy', atk, t: 0, dur: 2.6, done: false, pre: pre }; SFX.warn(); }
function enemyFx(a) {   // 效果類攻擊：護盾／解除護盾／玩家回血／雙方受傷增加
  const st = enemy.st, say = (txt, c) => floaters.push({ x: EN.x, y: enY(-.26), txt, c, big: true, l: 1.6 });
  if (a.shield) {
    const s = a.shield;
    if (s.floor != null) { st.floor = s.floor; say('🛡 +' + s.floor + ' 護盾', '#ffd166'); }
    if (s.cap != null) { st.cap = s.cap; say('🔰 傷害上限 ' + s.cap, '#ffd166'); }
    if (s.reduce != null) { st.reduce = s.reduce; say('🧱 減傷 ' + Math.round(s.reduce * 100) + '%', '#ffd166'); }
  }
  if (a.unshield) { delete st[a.unshield]; say('護盾解除', '#9ad1ff'); }
  if (a.heal) healPlayer(a.heal);
  if (a.selfVuln) { st.vuln = a.selfVuln.t; st.vulnV = a.selfVuln.v; say('敵方受到傷害 +' + Math.round((a.selfVuln.v - 1) * 100) + '%', '#7dff9a'); }
  if (a.playerVuln) { status.taken = status.taken.filter(x => x.k !== a.say); status.taken.push({ k: a.say, v: a.playerVuln.v, t: a.playerVuln.t }); say('我方受到傷害 +' + Math.round((a.playerVuln.v - 1) * 100) + '%', '#ff8a8a'); }
}
function resolveEnemyAttack(atk) {
  enemyFx(atk);
  if (!atk.dmg) return;
  if (status.dodge) { status.dodge = false; SFX.dodge(); floaters.push({ x: PX, y: py - 90, txt: '閃避！', c: '#7df9ff', big: true, l: 1.2 }); return; }
  if (status.block > 0) { status.block--; SFX.dodge(); floaters.push({ x: PX, y: py - 90, txt: '擋下！', c: '#c9b28a', big: true, l: 1.2 }); return; }
  hurtPlayer(atk.dmg, true);
}
function afterEnemyAttack(atk, pre) {
  if (atk.special) {   // 特殊地圖（種類見 DUNGEONS 上方說明）；moles 為單層地面，其餘保留三層地面
    const warn = atk.warn || 0, every = atk.every || 5;
    ph = 'special'; special = { type: atk.special, t: 0, warn, atkDuring: !!atk.atkDuring, dur: warn + (atk.dur || 20), next: atk.special === 'arrowrow' ? every : .5, every, ox: scroll + W + 20 };
    soloLane = atk.special === 'moles' ? 2 : -1; moles = []; if (soloLane >= 0) placeOnGround(); else { openLane(1, scroll + W + 20); openLane(0, scroll + W + 20); } enemyT = 0;   // 地鼠：只用最下層；其餘特殊地圖的第二層、最上層從畫面右側外出現
  } else if (pre) { if (ph === 'fight') enemyT = 0; }   // 先制攻擊：不動地圖與狀態（prep／special 中被打斷的流程照原樣繼續）
  else if (ph === 'special') enemyT = 0;   // 特殊地圖中發動的攻擊：播完後地圖繼續
  else exitSafe();
}
function updateCut(dt) {
  const c = cut; c.t += dt;
  if (c.k === 'skill') { if (!c.done && c.t >= .8) { c.done = true; SKILL_EFFECTS[c.m.ch.skill.type](c.m.ch.skill, c.m.ch); } if (c.t >= c.dur) cut = null; }
  else { if (!c.done && c.t >= 1.6) { c.done = true; resolveEnemyAttack(c.atk); } if (c.t >= c.dur) { cut = null; if (state === 'play') afterEnemyAttack(c.atk, c.pre); } }
}
function combat(dt, pc) {
  // 玩家攻擊：能量條滿的角色從 1 號位依序出手；每次出手全隊技能 cd-1
  if (atkAnim) { atkAnim.t += dt; if (!atkAnim.hit && atkAnim.t >= .4) { atkAnim.hit = true; hitEnemy(atkAnim.m.ch, atkAnim.m.ch.atk, false); } if (atkAnim && atkAnim.t >= .6) atkAnim = null; }
  else if (!enemy.dead && !enemy.gone) {
    // 從 1 號位依序輪流：輪到的角色能量條沒滿就跳過；輪到出手的角色才減自己的技能 CD
    let k = -1; for (let j = 0; j < team.length; j++) { const i = (atkPtr + j) % team.length; if (team[i].pend > 0) { k = i; break; } }
    if (k >= 0) { const m = team[k]; m.pend--; atkPtr = (k + 1) % team.length; m.cd = Math.max(0, m.cd - 1); atkAnim = { m, t: 0, hit: false }; SFX.attack(); }
    else atkPtr = 0;
  }
  if (ph === 'trans') { trans.t += dt; if (trans.t >= CFG.WAVE_GAP) { loadWave(waveIdx + 1); exitSafe(); } return; }
  if (enemy.dead) { enemy.deadT += dt; if (enemy.deadT >= 1.5) { if (waveIdx >= waves.length - 1) { state = 'finish'; winDelay = .5; SFX.win(); } else { enemy.gone = true; special = null; soloLane = -1; windDown(); ph = 'trans'; trans = { t: 0 }; } } return; }
  if (ph === 'fight') {
    const nx = enemy.attacks.length && enemy.attacks[atkIdx % enemy.attacks.length];
    if (!fever && nx && enemyT >= (nx.cd ?? CFG.ENEMY_ATK_EVERY)) { ph = 'prep'; windDown(); } else enemyT += dt;   // 先制攻擊已在 update 立刻處理；這裡只看「下一次攻擊」自己的 cd
  }
  else if (ph === 'prep') { if (!atkAnim && !team.some(m => m.pend > 0) && pc >= windX + 220) startEnemyAttack(); }   // 已走完生成好的地圖、上層收掉並掉回最下層後才開始攻擊（+220 = 留給掉落的距離）
  else if (ph === 'special') {
    const sp = special; sp.t += dt;
    if (sp.type === 'moles') { if ((sp.next -= dt) <= 0) { moles.push({ x: pc + 520, l: 2, s: 0, t: 0 }); sp.next = r(.55, .95); } }
    else if (sp.type === 'vomit') { if ((sp.next -= dt) <= 0) { const fx = pc + r(260, 760), ls = [0, 1, 2].filter(l => solid(l, fx)); fires.push({ x: fx, l: pick(ls.length ? ls : [2]), s: 1, y: -30, t: 0 }); sp.next = r(CFG.VOMIT_GAP[0], CFG.VOMIT_GAP[1]); } }   // 火球直接從天上落下
    else if (sp.type === 'arrowrow') {
      while (sp.ox < scroll + W + 20) { orbs.push({ x: sp.ox, y: LY[1] - 28, k: '火' }); sp.ox += 30; }                                 // 第二層：整排火能量球（不算 chain）
      if ((sp.next -= dt) <= 0 && sp.t < sp.dur) {   // 隨機層射出；有時同時兩層（不同層）
        const ls = [0, 1, 2].sort(() => Math.random() - .5).slice(0, Math.random() < .35 ? 2 : 1);
        ls.forEach((l, i) => arrows.push({ a: pc, x: scroll + W + 800 + i * 140, l, on: true, y: LY[l] - 26 })); SFX.warn(); sp.next += sp.every;
      }   // 第二層射出箭矢（右緣先有預警標記）
    }
    if (sp.t < sp.dur && sp.atkDuring) {   // 特殊地圖中敵人仍會依冷卻發動（非特殊地圖的）攻擊
      const nx = enemy.attacks[atkIdx % enemy.attacks.length];
      if (nx && !nx.special && (enemyT += dt) >= (nx.cd ?? CFG.ENEMY_ATK_EVERY) && !atkAnim && !team.some(m => m.pend > 0)) startEnemyAttack();
    }
    if (sp.t >= sp.dur) { special = null; closeUpper(Math.max(cur, scroll + W + 20)); exitSafe(); }   // 特殊地圖結束：上層在畫面右側外收掉，自然走回最下層
  }
}

/* ----- 玩家移動（跳／下掉／飛行／掉入虛空） ----- */
function updatePlayer(dt, pc) {
  const prev = py;
  if (fly > 0) { grounded = false; vy = 0; py += (LY[0] - py) * Math.min(1, dt * 6); return true; }   // 飛行：無視地形
  if (grounded) { coyote = .08; airLeft = 0; if (!solid(lane, pc)) { grounded = false; airLeft = CFG.AIR_JUMPS; } }   // 沒跳、直接走出缺口掉下去：空中同樣保有一次二段跳（可在虛空中補救）
  if (dropReq && grounded) { dropLane = lane; grounded = false; vy = 150; airLeft = CFG.AIR_JUMPS; }
  dropReq = false;
  if (jumpBuf > 0 && (grounded || coyote > 0)) { vy = -V0; grounded = false; coyote = jumpBuf = 0; airLeft = CFG.AIR_JUMPS; SFX.jump(); }
  else if (jumpBuf > 0 && !grounded && airLeft > 0) {   // 二段跳：起跳後、或走出邊緣／往下掉之後，空中再按一次。頂點最高只到最上層地面；沒有比現在更強的上升力時不消耗（按鍵緩衝仍保留）
    const up = airUp(py);
    if (up > -vy + 30) { vy = -up; airLeft--; jumpBuf = 0; SFX.jump(); boom(PX, py - 6, '#fff', 10); }
  }
  if (!grounded) {
    vy += GR * dt * (keyS ? 1.6 : 1); py += vy * dt;
    if (vy >= 0) {
      const ic = ices.find(i => !i.dead && prev <= i.y + .5 && py >= i.y && Math.abs(pc - i.x) <= i.w / 2 + 14);   // 落下時腳碰到冰面
      if (ic) { breakIce(ic); py = ic.y; vy = -V0; airLeft = CFG.AIR_JUMPS; SFX.jump(); }                                                    // 在冰面上再跳一次，冰塊碎掉
      else for (let l = 0; l < 3; l++) if (l !== dropLane && prev <= LY[l] + .5 && py >= LY[l] && solid(l, pc)) { py = LY[l]; vy = 0; grounded = true; lane = l; break; }
    }
    if (dropLane >= 0 && py > LY[dropLane] + 10) dropLane = -1;
    if (py > LOSE_Y) return voidFall();
  }
  return true;
}

/* ----- 輸入（上／下鍵可在設定中更換；技能固定 1~6 對應 1~6 號位） ----- */
function setPause(v) {   // 暫停／繼續：暫停時放開所有按住的往下掉操作；繼續時重設計時基準
  if (paused === v || (v && state !== 'play')) return;
  paused = v; if (v) { keyS = false; dropReq = false; dropPtrs.clear(); } else last = performance.now();
}
function press() { SFX.unlock(); if (paused) return; if (state === 'ready') { state = 'play'; cur = genFrom = scroll + W + CFG.START_PAD; L = 2; first = true; }  else if (state === 'play') jumpBuf = .12; }
addEventListener('keydown', e => {
  SFX.unlock(); const k = e.key.toLowerCase();
  if (bindingFor) { e.preventDefault(); return finishBind(k); }
  if (screenId !== 'game') return;
  const K = save.settings.keys;
  if (k === 'p' && k !== K.up && k !== K.down) { e.preventDefault(); if (!e.repeat) setPause(!paused); return; }   // P：暫停／繼續
  if (paused) { if (k === 'escape') setPause(false); return; }   // 暫停中：Esc＝繼續，其餘按鍵不作用
  if (k === K.up) { e.preventDefault(); if (!e.repeat) press(); }
  else if (k === K.down) { e.preventDefault(); if (!e.repeat) dropReq = true; keyS = true; }
  else if (/^[1-6]$/.test(k) && !e.repeat) useSkill(+k - 1);
  else if (k === 'escape') quit();
});
addEventListener('keyup', e => { if (e.key.toLowerCase() === save.settings.keys.down) keyS = false; });
cv.addEventListener('pointerdown', e => {
  SFX.unlock();
  const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
  if (paused) { if (inR(UI.resume, x, y)) setPause(false); else if (inR(UI.quitB, x, y)) quit(); return; }   // 暫停視窗：繼續／離開關卡
  if (state === 'play' && inR(UI.pause, x, y)) { setPause(true); return; }   // 暫停鈕
  if (y >= PANEL_Y) { team.forEach(m => { if (x >= slotL(m.slot) && x < slotL(m.slot) + SLOT_W) useSkill(m.slot); }); return; }   // 點隊伍列的角色格＝發動技能
  // 手機操作模式（設定裡可選）：ud＝上半跳、下半往下掉；lr＝右半跳、左半往下掉。還沒開始（準備畫面）時，點哪裡都是開始
  const drop = state === 'play' && (save.settings.touch === 'lr' ? x < W / 2 : y >= (LY[0] + LY[1]) / 2);
  if (!drop) press(); else { dropReq = true; keyS = true; dropPtrs.add(e.pointerId); }
});
// 以 pointerId 記錄「正在按著往下掉」的手指：左右分割時右手放開跳躍，不會誤把左手還按著的往下掉取消
const dropPtrs = new Set();
const endPtr = e => { if (dropPtrs.delete(e.pointerId)) keyS = dropPtrs.size > 0; };
addEventListener('pointerup', endPtr); addEventListener('pointercancel', endPtr);

/* ----- 結算 ----- */
function showResult(win) {
  const id = pending.s.id; let note = '', reward = '';
  if (win) {
    const first = save.bests[id] == null;   // 首次通關（尚無紀錄）
    (pending.s.drops || []).forEach(cid => {   // 副本掉落角色：首次必得，之後依機率
      const c = charById(cid); if (!c || !(first || Math.random() < CFG.CHAR_DROP)) return;
      const isNew = !(save.owned[cid] > 0); save.owned[cid] = (save.owned[cid] || 0) + 1;
      reward += `<br>獲得角色 <b>${c.name}</b> ${stars(c.star)}${isNew ? ' NEW' : ''}${first ? '（首次通關）' : ''}`;
    });
    const b = save.bests[id]; if (b == null || elapsed < b) { save.bests[id] = elapsed; note = '　🎉 新紀錄'; }
    const cn = pending.s.coins ? (first ? pending.s.coins.first : pending.s.coins.repeat) : CFG.WIN_COINS;
    save.coins += cn; reward = `<br>獲得 金幣 ×${cn}${pending.s.coins && first ? '（首次通關）' : ''}` + reward;
    if (Math.random() < CFG.SHARD_DROP) { save.shards += CFG.SHARD_DROP_N; reward += `、<b>神性碎片 ×${CFG.SHARD_DROP_N}</b> ✨`; }
    persist();
  }
  $('#res-title').textContent = win ? `🏰 ${pending.s.name} 通關！` : `💀 ${loseReason}！挑戰失敗`;
  $('#res-body').innerHTML = win ? `用時 <b>${fmt(elapsed)}</b>${note}<br>最佳 ${fmt(save.bests[id])}　最高 chain ${maxChain}　能量球 ${orbsGot}${reward}`
    : `撐了 ${fmt(elapsed)}　第 ${waveIdx + 1}/${waves.length} 波　敵人剩餘 HP ${ehp}/${enemy.hp}<br>最高 chain ${maxChain}`;
  $('#result').hidden = false;
}
$('#res-again').onclick = startStage; $('#res-party').onclick = quit;

/* ----- 更新 ----- */
function update(dt) {
  t += dt; barTrail(pBar, hp, maxHp, dt); if (enemy) barTrail(eBar, ehp, enemy.hp, dt);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.l -= dt; }
  particles = particles.filter(p => p.l > 0);
  for (const f of floaters) { f.y -= 50 * dt; f.l -= dt; }
  floaters = floaters.filter(f => f.l > 0);
  shake = Math.max(0, shake - 40 * dt); hitFlash -= dt; flashT -= dt;
  if (state === 'finish') { if ((winDelay -= dt) <= 0) { state = 'win'; showResult(true); } return; }
  if (state === 'lose') { vy += GR * dt; py += vy * dt; if (loseT > 0 && (loseT -= dt) <= 0) showResult(false); return; }
  if (state !== 'play') { scroll += 60 * dt; enemy && (enemy.appear = Math.min(1, enemy.appear + dt)); return; }
  if (cut) { updateCut(dt); return; }   // 技能／敵人攻擊動畫期間：場景與計時暫停
  checkPhase();   // HP 達標立刻轉階段（只會往後）
  if (enemyPreDue()) { startEnemyAttack(); return; }   // 先制攻擊（開場／轉階段）：優先於我方 Fever、攻擊與技能，立刻發動；動畫期間地圖、攻擊、技能全部暫停
  if (skillQ.length) { const m = skillQ.shift(); m.queued = false; if (!enemy.dead && !enemy.gone) startSkillCut(m); return; }

  const stg = speedStage(chain);   // 跑速：每 10 chain 一階；Fever 中固定，結束後依 chain 重算
  S = fever ? CFG.FEVER_SPEED : baseSpeed() + stg * CFG.SPEED_STEP;
  speedMul = fly > 0 ? 2 : 1; elapsed += dt; scroll += S * speedMul * dt; jumpBuf -= dt; invul -= dt; coyote -= dt;
  const pc = scroll + PX;
  if (banner && (banner.t += dt) > 2.2) banner = null;
  enemy.appear = Math.min(1, enemy.appear + dt * 1.5);
  if (status.convert && (status.convert.t -= dt) <= 0) status.convert = null;
  for (const el in status.dmgUp) if ((status.dmgUp[el].t -= dt) <= 0) delete status.dmgUp[el];
  if (status.magnet && (status.magnet.t -= dt) <= 0) status.magnet = null;
  if (status.shield && (status.shield.t -= dt) <= 0) { status.shield = null; if (grounded && !solid(lane, scroll + PX)) placeOnGround(); invul = Math.max(invul, .8); }   // 結束時若站在缺口上，移到有地面的位置
  if (fly > 0 && (fly -= dt) <= 0) { fly = 0; speedMul = 1; placeOnGround(); invul = Math.max(invul, .6); }   // 飛行結束後短暫無敵，避免剛落地就撞上陷阱
  const st = enemy.st; if (st.space > 0) st.space -= dt; if (st.vuln > 0) st.vuln -= dt; status.taken = status.taken.filter(x => (x.t -= dt) > 0);
  if (st.poisons.length) { for (const p of st.poisons) { p.t -= dt; p.acc += dt; while (p.acc >= 1 && !enemy.dead) { p.acc -= 1; damageEnemy(p.dps, { poison: true }); } } st.poisons = st.poisons.filter(p => p.t > 0); }

  if (!updatePlayer(dt, pc)) return;
  if (updateEnemies(dt, pc) && invul <= 0 && fly <= 0 && !status.shield) { hurtPlayer(CFG.TRAP_DMG); if (state !== 'play') return; }   // 飛行中不受陷阱影響（虛空本來就不判定）
  if (fly > 0 || status.magnet) for (const o of orbs) if (o.x > scroll - 40 && o.x < scroll + W) { o.x += (pc - o.x) * Math.min(1, dt * 9); o.y += (py - 30 - o.y) * Math.min(1, dt * 9); }   // 傳令兵：吸取所有能量球
  collectOrbs(pc);
  if (feverPending) {   // chain 達 10／20／30… 的 Fever：不能因為剛好遇到敵人準備攻擊（prep）或特殊地圖就被丟掉
    if (enemy.dead || fever) feverPending = false;
    else {
      if (ph === 'prep' && !enemy.openQ.length) { genPause = false; ph = 'fight'; }   // 敵人等著發動時，Fever 優先（Fever 結束後敵人才繼續；與額外 Fever 相同）
      if (ph === 'fight') { feverPending = false; startFever(); }                    // 特殊地圖（special）／波次過場（trans）中則保留到回到 fight 再開
    }
  }
  if (fever && pc >= feverEnd) fever = false;
  if (feverBonus > 0 && ph === 'prep' && !fever && !enemy.dead && !enemy.openQ.length) { genPause = false; ph = 'fight'; }   // 敵人已冷卻完、等待發動時，我方額外 Fever 優先（Fever 結束後敵人才繼續）
  if (feverBonus > 0 && ph === 'fight' && !fever && !enemy.dead) { feverBonus--; feverPendMs = []; startFever(); }   // 技能贈送的額外 Fever：不占用 10／20／30… 區段，目前 Fever 結束後（或安全地圖結束後）接著開
  combat(dt, pc);
  if (state !== 'play') return;
  const lim = scroll - 120;
  orbs = orbs.filter(o => o.x > lim); moles = moles.filter(m => m.x > lim); ices = ices.filter(i => i.x > lim && !i.dead);
  fires = fires.filter(f => f.x > lim && f.s < 3); arrows = arrows.filter(s => !s.on || s.x > lim);
  for (let l = 0; l < 3; l++) gaps[l] = gaps[l].filter(g => g.x1 > lim);
  gen();
}

/* ----- 繪製 ----- */
const panel = (x, y, w, h) => { ctx.fillStyle = 'rgba(20,16,30,.72)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); };
const txt = (s, x, y, sz, c, w = 400, al = 'left') => { ctx.font = `${w} ${sz}px "Noto Sans TC",sans-serif`; ctx.textAlign = al; ctx.fillStyle = c; ctx.fillText(s, x, y); };
function badge(x, y, e, rad = 14) {
  ctx.fillStyle = ELEMENTS[e].color; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  txt(e, x, y + rad * .35, rad, '#111', 700, 'center');
}
function chip(x, y, ic, sec, lab) {   // 狀態圖示
  ctx.fillStyle = 'rgba(20,16,30,.85)'; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill(); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke();
  txt(ic, x, y + 6, 16, '#fff', 400, 'center'); if (sec != null) txt(Math.ceil(sec) + 's', x, y + 30, 11, '#fff', 600, 'center'); if (lab != null) txt(lab, x, y + 30, 11, '#fff', 600, 'center');
}
function bubble(s) {   // 敵人頭上的對話框
  const fs = fy(.035), bh = fy(.0875); ctx.font = `700 ${fs}px "Noto Sans TC",sans-serif`; const w = Math.min(fx(.417), ctx.measureText(s).width + fx(.033)), ex = PT.enemy.cx, x = Math.min(W - UI.m - w, ex - w / 2 + fx(.042)), y = LY[0] - fy(.154);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x, y, w, bh, bh * .24); ctx.fill();
  ctx.beginPath(); ctx.moveTo(ex - bh * .19, y + bh); ctx.lineTo(ex + bh * .05, y + bh * 1.38); ctx.lineTo(ex + bh * .29, y + bh); ctx.fill(); txt(s, x + w / 2, y + bh * .64, fs, '#222', 700, 'center');
}
function drawEnemy() {   // 右側敵人：立繪 > 圖示 > 內建城堡 > 預設色塊；倒下時發光後淡出
  const e = enemy; if (!e || e.gone) return;
  const a = e.dead ? Math.max(0, 1 - Math.max(0, e.deadT - .5) / .9) : Math.min(1, e.appear);
  const lunge = cut && cut.k === 'enemy' && cut.t > 1.5 && cut.t < 2.1 ? -Math.sin((cut.t - 1.5) / .6 * Math.PI) * 80 : 0;
  ctx.save(); ctx.translate(lunge, 0); ctx.globalAlpha = a;
  const im = getImg(e.portrait || e.image); let rc = { x: EN.x - PT.enemy.w * .357, y: PT.enemy.bottom - PT.enemy.h * .92, w: PT.enemy.w * .714, h: PT.enemy.h * .92 }, bd = { x: rc.x + UI.m, y: rc.y + fy(.0375) };
  if (im) { rc = drawFit(im, PT.enemy.cx, PT.enemy.bottom, PT.enemy.w, PT.enemy.h); bd = { x: rc.x + 14, y: rc.y + 18 }; }
  else if (e.art === 'castle') { const s = PT.enemy.h / 380; ctx.save(); ctx.translate(EN.x - 850 * s, PT.enemy.bottom + fy(.0104) - 430 * s); ctx.scale(s, s); drawCastle(); ctx.restore(); }
  else { rc = { x: EN.x - PT.enemy.w * .286, y: PT.enemy.bottom - PT.enemy.h * .79, w: PT.enemy.w * .571, h: PT.enemy.h * .79 }; ctx.fillStyle = e.element ? ELEMENTS[e.element].color : '#555'; ctx.beginPath(); ctx.roundRect(rc.x, rc.y, rc.w, rc.h, 16); ctx.fill(); txt(e.name, EN.x, rc.y + rc.h / 2 + fy(.0125), fy(.033), '#fff', 700, 'center'); }
  if (e.dead) { const gx = rc.x + rc.w / 2, gy = rc.y + rc.h / 2, gr = Math.max(rc.w, rc.h) * .7, g = ctx.createRadialGradient(gx, gy, 10, gx, gy, gr); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.globalAlpha = Math.min(1, e.deadT / .5) * a; ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2); }
  ctx.restore();
  if (e.element && !e.dead) badge(bd.x, bd.y, e.element, 16);
  if (cut && cut.k === 'enemy' && cut.atk.say) bubble(cut.atk.say);
}
function star(x, y, R, c) { ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 + t * 8, rr = i % 2 ? R * .45 : R; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill(); }
function drawAtkAnim() {   // 玩家攻擊：閃現立繪（畫在地面後面，跑酷地圖優先在上）
  if (!atkAnim || (cut && cut.pre)) return; const ch = atkAnim.m.ch, tt = atkAnim.t, al = Math.max(0, Math.min(1, tt / .12, (.6 - tt) / .12));
  ctx.save(); ctx.globalAlpha = al; const im = getImg(ch.portrait);
  const P = PT.atk;
  if (im) drawFit(im, P.cx, P.bottom, P.w, P.h);
  else { ctx.fillStyle = ELEMENTS[ch.element].color; ctx.beginPath(); ctx.roundRect(P.cx - P.w * .4, P.bottom - P.h * .85, P.w * .8, P.h * .85, 14); ctx.fill(); txt(ch.short || ch.name, P.cx, P.bottom - P.h * .4, 40, '#fff', 700, 'center'); }
  ctx.restore();
}
function drawAtkStar() {   // 攻擊特效（飛向敵人的星星）畫在最上層
  if (!atkAnim || (cut && cut.pre)) return; const ch = atkAnim.m.ch, tt = atkAnim.t;
  if (tt >= .15 && tt <= .45) { const p = (tt - .15) / .3; star(PT.atk.cx + PT.atk.w * .4 + (PT.enemy.cx - PT.atk.cx - PT.atk.w * .4) * p, PT.atk.bottom - PT.atk.h * .5 + 20 * p, 26, ELEMENTS[ch.element].orb); }
}
function drawTeam() {   // 下方隊伍列（PANEL_Y~H，每格寬 W/6）：號位、頭像（含屬性徽章）、名稱、技能 CD（就緒＝⚡）、底部能量條；尺寸都是隊伍列高度 bh 的比例
  const bh = H - PANEL_Y, pad = SLOT_W * .0625;
  ctx.fillStyle = '#1b1626'; ctx.fillRect(0, PANEL_Y, W, bh); ctx.fillStyle = '#3d3550'; ctx.fillRect(0, PANEL_Y, W, 2);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 1; i < 6; i++) ctx.fillRect(i * SLOT_W - 1, PANEL_Y + bh * .13, 1, bh * .74);   // 格線
  team.forEach(m => {
    const ch = m.ch, x0 = slotL(m.slot), R = bh * .283, cx = x0 + SLOT_W * .175, cy = PANEL_Y + bh * .45, ready = m.cd <= 0;
    if (ready) { ctx.fillStyle = `rgba(255,209,102,${.10 + .08 * Math.sin(t * 8)})`; ctx.fillRect(x0 + 2, PANEL_Y + bh * .05, SLOT_W - 4, bh * .95); }
    txt(String(m.slot + 1), x0 + SLOT_W * .05, PANEL_Y + bh * .23, bh * .167, '#8f87a3', 600);
    ctx.fillStyle = ELEMENTS[ch.element].color; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    const im = getImg(ch.icon || ch.portrait);
    if (im) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip(); const k = Math.max(R * 2 / im.width, R * 2 / im.height), iw = im.width * k, ih = im.height * k; ctx.drawImage(im, cx - iw / 2, cy - ih / 2, iw, ih); ctx.restore(); } else txt(ch.short || ch.name[0], cx, cy + bh * .083, bh * .217, '#fff', 700, 'center');
    ctx.strokeStyle = ready ? '#ffd166' : 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    badge(cx - R * .82, cy + R * .76, ch.element, bh * .117);
    const nm = ch.short || ch.name; txt(nm.length > 5 ? nm.slice(0, 5) : nm, x0 + SLOT_W * .3375, cy + bh * .067, bh * .217, '#fff', 600);
    txt(ready ? '⚡' : String(m.cd), x0 + SLOT_W - pad, cy + bh * .133, bh * .367, ready ? '#ffd166' : '#fff', 700, 'right');
    ctx.fillStyle = '#2b2140'; ctx.fillRect(x0 + pad, H - bh * .117, SLOT_W - pad * 2, bh * .067); ctx.fillStyle = ELEMENTS[ch.element].orb; ctx.fillRect(x0 + pad, H - bh * .117, (SLOT_W - pad * 2) * m.en / CFG.ENERGY_MAX, bh * .067);
  });
}
function hud() {   // 版面位置全部來自 UI
  const { tim, hpb, boss, pause: pb, chips, pad } = UI, mid = W / 2;
  panel(tim.x, tim.y, tim.w, tim.h); txt('⏱ ' + fmt(elapsed), tim.x + pad, tim.y + tim.h * .7, tim.h * .55, '#fff', 700);
  panel(hpb.x, hpb.y, hpb.w, hpb.h); txt(`HP ${hp}/${maxHp}`, hpb.x + pad, hpb.y + hpb.h * .4, hpb.h * .325, '#fff', 600);
  const hx = hpb.x + pad, hy = hpb.y + hpb.h * .575, hw = hpb.w - pad * 2, hh = hpb.h * .25;
  ctx.fillStyle = '#3d3550'; ctx.fillRect(hx, hy, hw, hh); ctx.fillStyle = '#fff'; ctx.fillRect(hx, hy, hw * Math.max(pBar.g, hp) / maxHp, hh); ctx.fillStyle = hp / maxHp > .3 ? '#4ade80' : '#ef476f'; ctx.fillRect(hx, hy, hw * hp / maxHp, hh);
  let i = 0, cx = () => chips.plX + i++ * chips.step, py0 = chips.plY;   // 玩家狀態圖示
  if (status.dodge) chip(cx(), py0, '🛡'); if (status.block > 0) chip(cx(), py0, '🧱', null, '×' + status.block); if (status.shield) chip(cx(), py0, '🔰', status.shield.t); if (status.convert) chip(cx(), py0, '🌈', status.convert.t); for (const el in status.dmgUp) chip(cx(), py0, '⚔' + el, status.dmgUp[el].t); if (status.magnet) chip(cx(), py0, '🧲', status.magnet.t); if (fly > 0) chip(cx(), py0, '🪽', fly); for (const x of status.taken) chip(cx(), py0, '💔', x.t);
  txt(String(chain), mid, fy(.104), fy(.0875), '#ffd166', 700, 'center'); txt('chain', mid, fy(.146), fy(.031), '#fff', 600, 'center');
  const cw = fx(.104), cby = fy(.1625), cbh = fy(.0104);
  ctx.fillStyle = '#2b2140'; ctx.fillRect(mid - cw / 2, cby, cw, cbh); ctx.fillStyle = '#ffd166'; ctx.fillRect(mid - cw / 2, cby, cw * (chain % CFG.FEVER_AT) / CFG.FEVER_AT, cbh);
  if (state === 'play' || paused) {   // 暫停鈕：暫停中顯示「繼續」三角形
    panel(pb.x, pb.y, pb.w, pb.h); ctx.fillStyle = '#fff';
    if (paused) { ctx.beginPath(); ctx.moveTo(pb.x + pb.w * .36, pb.y + pb.h * .28); ctx.lineTo(pb.x + pb.w * .72, pb.y + pb.h * .5); ctx.lineTo(pb.x + pb.w * .36, pb.y + pb.h * .72); ctx.fill(); }
    else { const bw = pb.w * .13, bh2 = pb.h * .42; ctx.fillRect(pb.x + pb.w * .5 - bw * 1.4, pb.y + (pb.h - bh2) / 2, bw, bh2); ctx.fillRect(pb.x + pb.w * .5 + bw * .4, pb.y + (pb.h - bh2) / 2, bw, bh2); }
  }
  if (enemy) {
    const bx = boss.x + pad, bw = boss.w - pad * 2, by = boss.y + boss.h * .54, bh3 = boss.h * .25;
    panel(boss.x, boss.y, boss.w, boss.h); txt(`${enemy.name}　${ehp}/${enemy.hp}`, bx, boss.y + boss.h * .396, boss.h * .29, '#fff', 600);
    ctx.fillStyle = '#3d3550'; ctx.fillRect(bx, by, bw, bh3); ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw * Math.max(eBar.g, ehp) / enemy.hp, bh3); ctx.fillStyle = '#ef476f'; ctx.fillRect(bx, by, bw * ehp / enemy.hp, bh3);
    let j = 0; const ex = () => chips.enX - j++ * chips.step, ey = chips.enY;   // 敵人狀態圖示
    const es = enemy.st; if (es.floor != null) chip(ex(), ey, '🛡', null, '≤' + es.floor); if (es.cap != null) chip(ex(), ey, '🔰', null, '上限' + es.cap / 1000 + 'k'); if (es.reduce) chip(ex(), ey, '🧱', null, '-' + Math.round(es.reduce * 100) + '%'); if (es.vuln > 0) chip(ex(), ey, '💢', es.vuln);
    if (enemy.st.space > 0) chip(ex(), ey, '🌀', enemy.st.space); if (enemy.st.poisons.length) { const ps = enemy.st.poisons, mx = Math.max(...ps.map(p => p.t)); ps.length > 1 ? chip(ex(), ey, '☠', null, Math.ceil(mx) + 's×' + ps.length) : chip(ex(), ey, '☠', mx); }
  }
  if (fever) { const fw = fx(.229), fh = fy(.075), fyy = fy(.192); panel(mid - fw / 2, fyy, fw, fh); txt('🔥 FEVER 🔥', mid, fyy + fh * .72, fh * .556, '#ffd166', 700, 'center'); }
}
function drawPause() {   // 暫停視窗：繼續／離開關卡
  if (!paused) return;
  const { card, resume, quitB } = UI;
  ctx.fillStyle = 'rgba(10,8,20,.7)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#241d36'; ctx.beginPath(); ctx.roundRect(card.x, card.y, card.w, card.h, fx(.0125)); ctx.fill(); ctx.strokeStyle = '#4a55c9'; ctx.lineWidth = 2; ctx.stroke();
  txt('暫停', W / 2, card.y + card.h * .27, fy(.075), '#fff', 700, 'center');
  for (const [b, lb, main] of [[resume, '繼續', true], [quitB, '離開關卡', false]]) {
    ctx.fillStyle = main ? '#ffd166' : '#3d3550'; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, b.h * .25); ctx.fill();
    txt(lb, b.x + b.w / 2, b.y + b.h * .66, b.h * .42, main ? '#1b1626' : '#fff', 700, 'center');
  }
  txt('按 P 或 Esc 繼續', W / 2, card.y + card.h * .94, fy(.029), '#cfc8dd', 400, 'center');
}
function drawCut() {   // 技能過場（立繪跳出＋技能名稱）／敵人攻擊時稍微壓暗
  if (!cut) return;
  if (cut.k === 'enemy') { ctx.fillStyle = 'rgba(10,8,20,.25)'; ctx.fillRect(0, 0, W, PANEL_Y); return; }
  const ch = cut.m.ch, p = Math.min(1, cut.t / .25), ox = -(1 - p) * W, fade = Math.max(0, Math.min(1, (cut.dur - cut.t) / .2));
  ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = 'rgba(10,8,20,.75)'; ctx.fillRect(0, 0, W, PANEL_Y);
  ctx.fillStyle = ELEMENTS[ch.element].color; ctx.fillRect(ox, PANEL_Y * .25, W * .72, fy(.104)); txt(ch.skill.name, ox + fx(.029), PANEL_Y * .333, fy(.0625), '#fff', 700);
  const im = getImg(ch.portrait);
  const P = PT.cut;
  if (im) drawFit(im, P.cx + ox, P.bottom, P.w, P.h);
  else { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.strokeStyle = ELEMENTS[ch.element].color; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(P.cx - P.w * .364 + ox, PANEL_Y * .405, P.w * .727, PANEL_Y * .452, 14); ctx.fill(); ctx.stroke(); txt(ch.name, P.cx + ox, PANEL_Y * .655, fy(.046), '#fff', 700, 'center'); }
  ctx.restore();
}
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, PANEL_Y); g.addColorStop(0, fever ? '#7b2cbf' : MAP.sky[0]); g.addColorStop(1, fever ? '#ffd166' : MAP.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (shake > 0) ctx.translate(r(-shake, shake) / 3, r(-shake, shake) / 3);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 6; i++) { const x = ((i * 260 - scroll * .15) % 1560 + 1560) % 1560 - 150; ctx.beginPath(); ctx.ellipse(x, LY[0] - fy(.1667) + (i % 3) * 30, 48, 16, 0, 0, 7); ctx.ellipse(x + 30, LY[0] - fy(.1833) + (i % 3) * 30, 34, 14, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = MAP.mountain;
  for (let i = 0; i < 6; i++) { const x = ((i * 300 - scroll * .35) % 1800 + 1800) % 1800 - 200; ctx.beginPath(); ctx.moveTo(x, LY[2] + GROUND_H); ctx.lineTo(x + 120, LY[2] - 100); ctx.lineTo(x + 240, LY[2] + GROUND_H); ctx.fill(); }
  const front = ENEMY_FRONT && enemy && (enemy.portrait || enemy.image);
  if (!front) { drawEnemy(); drawAtkAnim(); }   // 敵人與我方立繪都在地面後面
  const vg = ctx.createLinearGradient(0, LY[2] + GROUND_H, 0, PANEL_Y); vg.addColorStop(0, '#2b2140'); vg.addColorStop(1, '#0b0814');
  ctx.fillStyle = vg; ctx.fillRect(0, LY[2] + GROUND_H, W, PANEL_Y - LY[2] - GROUND_H);
  for (let l = 0; l < 3; l++) {   // 三層地面（20px 方塊，缺口留空）
    const i0 = Math.floor(scroll / 20) - 1;
    for (let i = i0; i < i0 + Math.ceil(W / 20) + 3; i++) {
      const x = i * 20, sx = x - scroll; if (!solid(l, x + 10)) continue;
      ctx.fillStyle = MAP.ground[0]; ctx.fillRect(sx, LY[l], 20, GROUND_H); ctx.fillStyle = MAP.ground[1]; ctx.fillRect(sx, LY[l], 20, 6); ctx.fillStyle = '#6b523a'; ctx.fillRect(sx, LY[l] + GROUND_H - 8, 20, 8);
    }
  }
  if (front) drawEnemy();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); drawTeam(); ctx.restore();   // 隊伍列先畫（不跟著震動）：最下層的虛空只剩一小條，潛水時玩家與能量球會畫在隊伍列上方
  drawIces(); drawEnemies(); drawSpecial(); drawOrbs(); drawArrows(); drawAtkStar(); drawPlayer();   // 攻擊立繪在地圖之上、跑酷角色之下
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.l * 2); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 5, 5); }
  ctx.globalAlpha = 1;
  for (const f of floaters) { ctx.globalAlpha = Math.min(1, f.l * 2); txt(f.txt, f.x, f.y, f.big ? 38 : 22, f.c, 700, 'center'); }
  ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  hud(); drawCut();
  if (banner) { const a = Math.max(0, Math.min(1, banner.t / .3, (2.2 - banner.t) / .4)); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, PANEL_Y * .405, W, fy(.133)); txt(banner.txt, W / 2, PANEL_Y * .514, fy(.092), '#fff', 700, 'center'); ctx.globalAlpha = 1; }
  if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT * 1.6})`; ctx.fillRect(0, 0, W, H); }
  drawPause();
  if (state === 'ready') {
    ctx.fillStyle = 'rgba(15,12,25,.65)'; ctx.fillRect(0, 0, W, PANEL_Y);
    txt('準備好了嗎？', W / 2, PANEL_Y * .357, fy(.071), '#fff', 700, 'center'); txt(`按 ${keyLabel(save.settings.keys.up)} 或點擊畫面開始`, W / 2, PANEL_Y * .457, fy(.042), '#ffd166', 700, 'center');
    txt('吃同屬性能量球填滿角色能量條　技能：按 1~6 或點下方角色', W / 2, PANEL_Y * .543, fy(.031), '#cfc8dd', 400, 'center');
    txt('手機操作：' + TOUCH_HINT[save.settings.touch] + '（可在「設定」更改）', W / 2, PANEL_Y * .61, fy(.031), '#cfc8dd', 400, 'center');
  }
}

/* ----- 主迴圈 ----- */
requestAnimationFrame(function loop(n) {
  const dt = Math.min(.033, (n - last) / 1000); last = n;
  if (screenId === 'game') { if (!paused) update(dt); draw(); }
  requestAnimationFrame(loop);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && screenId === 'game') setPause(true); });   // 切到別的分頁／視窗自動暫停
SFX.setVolume(save.settings.volume);
// 開場畫面（#loading）由 loader.js 預載圖片後切到 title

/* ----- 沿用：陷阱（地鼠／火球／箭矢）判定與繪製、玩家與城堡繪製 ----- */
/* ===== 障礙、角色繪製（沿用） ===== */
function updateEnemies(dt, pc) {   // 回傳是否被擊中
  const bx = pc - 14, by = py - PH; let hit = false;
  for (const m of moles) {
    if (!m.s && pc >= m.x - 230) { m.s = 1; boom(m.x - scroll, LY[m.l], '#8d6e63', 10); SFX.pop(); }
    if (m.s) { m.t += dt; const h = Math.min(1, m.t / .15) * 46; if (hitR(bx, by, 28, PH, m.x - 18, LY[m.l] - h, 36, h)) hit = true; }
  }
  for (const f of fires) {
    if (f.s === 0 && pc >= f.x - 480) f.s = 1;
    if (f.s === 1) {
      f.y += 750 * dt; if (hitR(bx, by, 28, PH, f.x - 16, f.y - 16, 32, 32)) hit = true;
      if (f.y >= LY[f.l]) { f.s = 2; f.t = 0; f.y = LY[f.l]; shake = Math.max(shake, 5); boom(f.x - scroll, f.y, '#ff9f1c', 14); SFX.boom(); }
    } else if (f.s === 2) {
      if ((f.t += dt) > 1) f.s = 3; else if (hitR(bx, by, 28, PH, f.x - 22, LY[f.l] - 60, 44, 60)) hit = true;
    }
  }
  for (const s of arrows) {
    if (!s.on && pc >= s.a) { s.on = true; s.x = s.a + ARROW_SP; SFX.warn(); }
    if (!s.on) continue;
    s.x -= CFG.ARROW_SPEED * dt;
    if (hitR(bx, by, 28, PH, s.x - 30, s.y - 5, 56, 10)) hit = true;
  }
  if (special && special.type === 'laser' && special.t >= special.warn && hitR(bx, by, 28, PH, scroll, LY[1] - 60, W, 60)) hit = true;   // 激光：覆蓋第二層整排
  return hit;
}

function drawCastle() {
  const f = hitFlash > 0; ctx.save(); ctx.translate(0, 12); if (f) ctx.translate(r(-3, 3), r(-3, 3));
  ctx.fillStyle = '#7a8aa6'; ctx.beginPath(); ctx.ellipse(850, 426, 150, 34, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = f ? '#fff' : '#5c4b7d'; ctx.fillRect(770, 170, 160, 260); ctx.fillRect(748, 120, 46, 310); ctx.fillRect(906, 120, 46, 310);
  ctx.fillStyle = f ? '#ffe' : '#483a66';
  for (let x = 770; x < 930; x += 32) ctx.fillRect(x, 150, 18, 22);
  for (const x of [748, 906]) for (const d of [-4, 16, 36]) ctx.fillRect(x + d, 100, 12, 22);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(790, 230, 20, 34); ctx.fillRect(890, 230, 20, 34);
  ctx.fillStyle = '#2b2140'; ctx.beginPath(); ctx.moveTo(822, 430); ctx.lineTo(822, 330); ctx.arc(850, 330, 28, Math.PI, 0); ctx.lineTo(878, 430); ctx.fill();
  ctx.fillStyle = '#ef476f'; ctx.fillRect(849, 78, 3, 24); ctx.beginPath(); ctx.moveTo(852, 78); ctx.lineTo(876, 86); ctx.lineTo(852, 94); ctx.fill();
  ctx.restore();
}
function drawPlayer() {
  drawPlayerBody();
  const sh = status.shield; if (!sh || (sh.t < 1.5 && Math.floor(sh.t * 8) % 2)) return;   // 最後 1.5 秒閃爍
  const x = PX, y = py - PH / 2, R = 46, g = ctx.createRadialGradient(x, y, 10, x, y, R); g.addColorStop(0, 'rgba(125,249,255,.04)'); g.addColorStop(1, 'rgba(125,249,255,.38)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(190,250,255,.9)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R - 8, 3.7, 4.6); ctx.stroke();
}
function drawPlayerBody() {
  const x = PX, y = py - PH; if (invul > 0 && Math.floor(invul * 14) % 2) return;
  if (y + PH < 0) { ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x - 10, 22); ctx.lineTo(x + 10, 22); ctx.fill(); return; }   // 完全飛出上緣時顯示箭頭
  ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.roundRect(x - 14, y, 28, PH, 9); ctx.fill();
  ctx.fillStyle = '#ef476f'; ctx.fillRect(x - 22, y + 14, 28, 6); ctx.fillRect(x - 30 - Math.sin(t * 20) * 3, y + 18, 12, 5);
  ctx.fillStyle = '#222'; ctx.fillRect(x + 4, y + 12, 6, 8);
  if (grounded) { const a = Math.sin(t * 20) * 8; ctx.fillStyle = '#d98e00'; ctx.fillRect(x - 12 + a, py - 6, 10, 6); ctx.fillRect(x + 2 - a, py - 6, 10, 6); }
}
function drawIces() {   // 浮冰跳台：上面一條白色冰面是落腳處，下方逐漸收窄的冰塊懸浮在斷路上
  for (const ic of ices) {
    const x = ic.x - scroll; if (ic.dead || x < -80 || x > W + 80) continue;
    const y = ic.y, hw = ic.w / 2, g = ctx.createLinearGradient(0, y, 0, y + 32); g.addColorStop(0, '#e9fbff'); g.addColorStop(1, '#5fb8e8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x + hw, y); ctx.lineTo(x + hw - 14, y + 24); ctx.lineTo(x + 8, y + 33); ctx.lineTo(x - hw + 12, y + 25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - hw, y, ic.w, 4);
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10, y + 6); ctx.lineTo(x - 2, y + 16); ctx.lineTo(x - 12, y + 24); ctx.moveTo(x + 14, y + 8); ctx.lineTo(x + 8, y + 18); ctx.stroke();
    const a = .5 + .5 * Math.sin(t * 5 + ic.x); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x + hw - 22, y + 9, 3, 9); ctx.fillRect(x + hw - 25, y + 12, 9, 3);
  }
}
function drawSpecial() {   // 激光：先在前方（右側）出現提示，之後第二層被激光覆蓋
  const sp = special; if (!sp || sp.type !== 'laser') return;
  const y0 = LY[1] - 60, h = 60;
  if (sp.t < sp.warn) {
    const a = .5 + .5 * Math.sin(t * 14);
    ctx.save(); ctx.setLineDash([16, 10]); ctx.lineWidth = 3; ctx.strokeStyle = `rgba(239,71,111,${.35 + a * .4})`; ctx.strokeRect(2, y0, W - 4, h); ctx.restore();
    ctx.fillStyle = `rgba(239,71,111,${.08 + a * .1})`; ctx.fillRect(0, y0, W, h);
    ctx.fillStyle = `rgba(239,71,111,${.6 + a * .4})`; ctx.beginPath(); ctx.moveTo(W - 6, y0 + 8); ctx.lineTo(W - 6, y0 + h - 8); ctx.lineTo(W - 40, y0 + h / 2); ctx.fill();
    txt('⚠ 激光 ' + Math.ceil(sp.warn - sp.t), W - 150, y0 - 10, 22, '#ff6b6b', 800, 'center');
  } else {
    const f = .85 + Math.random() * .15, g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, 'rgba(255,60,120,0)'); g.addColorStop(.25, `rgba(255,70,130,${.8 * f})`); g.addColorStop(.5, `rgba(255,255,255,${f})`); g.addColorStop(.75, `rgba(255,70,130,${.8 * f})`); g.addColorStop(1, 'rgba(255,60,120,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y0 - 8, W, h + 16);
    ctx.fillStyle = `rgba(255,255,255,${.7 * f})`; ctx.fillRect(0, LY[1] - 36, W, 12);
  }
}
function drawEnemies() {
  for (const m of moles) {
    const x = m.x - scroll, y = LY[m.l]; if (x > W + 50) continue;
    ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.ellipse(x, y, 26, 8, 0, Math.PI, 0); ctx.fill();
    if (!m.s) continue;
    const h = Math.min(1, m.t / .15) * 46;
    ctx.fillStyle = '#8d6e63'; ctx.beginPath(); ctx.roundRect(x - 17, y - h, 34, h, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 10, y - h + 10, 7, 7); ctx.fillRect(x + 3, y - h + 10, 7, 7);
    ctx.fillStyle = '#111'; ctx.fillRect(x - 7, y - h + 12, 3, 4); ctx.fillRect(x + 6, y - h + 12, 3, 4);
    ctx.fillStyle = '#f4978e'; ctx.beginPath(); ctx.arc(x, y - h + 24, 5, 0, 7); ctx.fill();
  }
  for (const f of fires) {
    const x = f.x - scroll, y = LY[f.l]; if (x > W + 50) continue;
    if (f.s === 0) {
      ctx.fillStyle = `rgba(239,71,111,${.4 + (.5 + .5 * Math.sin(t * 10)) * .5})`;
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x - 14, y - 30); ctx.lineTo(x + 14, y - 30); ctx.fill();
      ctx.font = '700 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('!', x, y - 33);
    } else if (f.s === 1) {
      ctx.fillStyle = 'rgba(255,159,28,.35)'; ctx.fillRect(x - 8, 0, 16, f.y);
      ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.arc(x, f.y, 17, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(x, f.y, 9, 0, 7); ctx.fill();
    } else {
      const h = 60 * (1 - f.t * .5);
      ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.quadraticCurveTo(x - 10, y - h, x, y - h - 8); ctx.quadraticCurveTo(x + 10, y - h, x + 22, y); ctx.fill();
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.quadraticCurveTo(x, y - h * .7, x + 11, y); ctx.fill();
    }
  }
}
function drawArrows() {   // 箭矢畫在能量球之上，不會被球擋住
  for (const s of arrows) {   // 箭矢：飛進畫面前，右緣先閃紅色預警；箭頭朝左
    if (!s.on) continue; const x = s.x - scroll, y = s.y;
    if (x > W) { ctx.fillStyle = `rgba(239,71,111,${.6 + .4 * Math.sin(t * 20)})`; ctx.beginPath(); ctx.moveTo(W - 6, y - 13); ctx.lineTo(W - 6, y + 13); ctx.lineTo(W - 30, y); ctx.fill(); txt('!', W - 16, y + 5, 14, '#fff', 800, 'center'); continue; }
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x + 26, y - 1, 46, 2);                                   // 速度線
    ctx.fillStyle = '#d7c49e'; ctx.fillRect(x - 24, y - 1.5, 50, 3);                                              // 箭身
    ctx.fillStyle = '#cfd8dc'; ctx.beginPath(); ctx.moveTo(x - 36, y); ctx.lineTo(x - 22, y - 6); ctx.lineTo(x - 22, y + 6); ctx.fill();   // 箭頭
    ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.moveTo(x + 26, y); ctx.lineTo(x + 14, y - 7); ctx.lineTo(x + 10, y); ctx.lineTo(x + 14, y + 7); ctx.fill();   // 尾羽
  }
}


function drawOrbs() {   // 屬性球（金亮黃／木綠／水藍／火紅／土灰）、恢復球（粉）、彩虹球（彩虹彈珠）
  for (const o of orbs) {
    const x = o.x - scroll; if (x > W + 30 || x < -30) continue; let k = o.k;
    if (status.convert && k !== 'heal' && k !== 'rainbow') k = status.convert.el;
    const col = k === 'heal' ? '#ff7eb6' : k === 'rainbow' ? '#ffffff' : ELEMENTS[k].orb, p = 1 + Math.sin(t * 6 + o.x * .05) * .12;
    ctx.globalAlpha = .45; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, o.y, 20 * p, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    if (k === 'rainbow' && ctx.createConicGradient) { const g = ctx.createConicGradient(t * 3, x, o.y); ['#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#f00'].forEach((c, i) => g.addColorStop(i / 6, c)); ctx.fillStyle = g; } else ctx.fillStyle = col;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, o.y, 10 * p, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.beginPath(); ctx.arc(x - 3, o.y - 3, 3, 0, 7); ctx.fill();
  }
}
