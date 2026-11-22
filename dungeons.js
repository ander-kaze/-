'use strict';
/* =====================================================================
   陣躍出擊 — dungeons.js（副本資訊）
   內容：DEFAULT_MAP（地圖預設值）、DUNGEONS（副本 → 關卡 → 波次／敵人／攻擊腳本）
   ★ 新增副本、關卡、敵人只需要改這個檔案。載入順序：audio.js → dungeons.js → mapgen.js → script.js → loader.js
   ===================================================================== */

// 地圖設定：每個關卡可在 stage.map 覆寫任何項目
const DEFAULT_MAP = {
  speed: 320,   // 跑速（建議 240~400）
  weights: { flat: 6, mole: 14, fire: 14, arrow: 14, switch: 22, ice: 12, gap: 22, island: 14, gap2: 14, dive: 12, diveIce: 8, iceChain: 8, long: 26 },   // 各區段比重：小跳(flat)／地鼠／火球／箭矢／換層／浮冰跳台／斷層(gap，單跳可過)／島嶼(island，連續小缺口節奏跳)／寬斷層（gap2，要二段跳）／虛空潛水（dive，主動掉進虛空吃球再二段跳補救）／潛水接浮冰（diveIce）／連續浮冰（iceChain）／長串能量球（long，chain 達 LONG_AT 後才出現）（0 = 不出現）；island 與 gap2 會依難度(chain)逐漸增加
  orbs: { elem: 80, heal: 8, rainbow: 12 },                             // 每段 5 顆能量球的種類比重：屬性球／恢復球／彩虹球
  decoy: 0.5,   // 沒走的那層出現「誘餌缺口」的機率 0~1
  sky: ['#5fa8d3', '#cdeaf7'], ground: ['#8d6e4f', '#6a994e'], mountain: '#8fb3cf',
};
// 副本 → 關卡 → 波次(敵人)。敵人：name／hp／element／image(圖示)／portrait(立繪，攻擊時顯示)／art:'castle'(內建城堡圖)
// attacks 依序循環執行：{ say:台詞, dmg:傷害, cd:該次攻擊前的冷卻秒數（省略 = CFG.ENEMY_ATK_EVERY） }
// 效果類攻擊（可與 dmg 並存，不會被閃避／擋傷抵銷）：heal:回復玩家HP／shield:{floor|cap|reduce}／unshield:'floor'|'cap'|'reduce'／selfVuln:{v,t}（敵人受傷×v，t 秒）／playerVuln:{v,t}（玩家受傷×v，t 秒）
//   shield.floor：單次傷害 ≤ floor 時歸零（毒蝕不受影響）；shield.cap：單次傷害超過 cap 時固定為 cap（不改變是否為固定傷害）；shield.reduce：敵人減傷比例（固定傷害不受影響）
// 階段制波次：wave.phases = [{ open:[開場先制攻擊…], attacks:[…] }, { at:0.8, open, attacks }]，HP ≤ at（比例）時立刻轉階段並先執行該階段的 open，之後才進入該階段的 attacks 循環
// 特殊地圖：{ say, special:種類, dur:秒, cd, atkDuring:true（特殊地圖中敵人仍會依冷卻發動攻擊，地圖不中斷） }，種類：
//   'moles'    單層地面＋不斷冒出地鼠
//   'vomit'    三層地面，天上持續掉落火球（嘔吐瀑布）
//   'laser'    三層地面，前方提示 warn 秒後，第二層出現激光，持續 dur 秒（總長 = warn + dur）
//   'arrowrow' 三層地面，第二層一整排火能量球，每 every 秒從隨機層射出箭矢（約 35% 機率同時兩層），持續 dur 秒
const A = (say, dmg, cd) => ({ say, dmg, cd });
const withCd = (list, f) => list.map((a, i) => ({ ...a, cd: f(i + 1) }));   // 依「第幾次攻擊」設定冷卻
const MEME_HP = 140000;   // 「迷因之王」三名敵人的默認血量
const DUNGEONS = [
  { id: 'castle', name: '試玩關卡-城堡突擊隊', image: '', stages: [{
      id: 'test', name: '測試關卡', note: '', map: {},
      waves: [{ name: '城堡', hp: 5000, element: '土', art: 'castle', image: '', portrait: '', attacks: [] }] }] },
  { id: 'komica', name: 'komica森林大作戰', image: '', stages: [{
      id: 'forest1', name: '森林之主【初級】', note: '共三名敵人', map: {},
      waves: [
        { name: '祝你順心 楠雪', hp: 6000, element: '火', image: 'assets/characters/nan4_icon.png', portrait: 'assets/characters/nan4.png', attacks: [
          A('啊！是愛情', 400), A('看別人發糖是幸福的事', 400), A('甚麼你不懂呢！', 900), A('哪怕我推的cp最後沒有在一起...', 300), A('但是他們曾經愛過啊！', 1500)] },
        { name: '初心褪色者 浣熊阿霜', hp: 7000, element: '金', image: 'assets/characters/shuang4_icon.png', portrait: 'assets/characters/shuang4.png', attacks: [
          A('出現了！是雜魚怪物！', 300), A('看本阿霜把你打得落花流水！', 300), A('不要碰我的霜馬尾！', 1000), A('誰允許你這麼囂張！', 1000),
          A('明明就是雜魚怪物...', 500), A('只能用那招了...', 300), A('盾戳戰法！！！', 1800)] },
        { name: '動物之友 草野', hp: 15000, element: '木', image: 'assets/characters/cao4_icon.png', portrait: 'assets/characters/cao4.png', attacks: [
          A('歡迎來到komica森林', 1000), A('我們這裡有巫女小姐', 300), A('有奇異果做的鵝', 300), A('有會裝可愛的布偶', 900), A('有會翻滾的浣熊', 300),
          A('會喵喵叫的魚', 300), A('請不要隨意破壞森林中的東西', 1000), A('否則...', 1000), { say: '我 要 生 氣 了', special: 'moles', dur: 20 }] },
      ] },
    { id: 'forest2', name: '義大利人的憤怒【困難】', note: '共三名敵人（部分敵人有階段變化）', map: {}, coins: { first: 2000, repeat: 300 },   // coins：此關自訂金幣獎勵（首次通關／之後每次）；沒寫就用 CFG.WIN_COINS
     
      waves: [
        { name: '魔法少女 緹緹子', hp: 50000, element: '火', image: 'assets/characters/titi4_icon.png', portrait: 'assets/characters/titi4.png',
          attacks: withCd([A('誰在賣萌？', 600), A('我才不會賣萌', 1000), A('賣萌的前提是有萌可賣', 800), A('賣萌可恥', 1500), A('你那是什麼眼神？', 1000),
            A('不要誤會，我只是從這裡路過而已', 700), A('才不是在等你呢', 2500)], () => 20) },
        { name: '萬年坦克位 絕對存在', hp: 150000, element: '土', image: 'assets/characters/abs4_icon.png', portrait: 'assets/characters/abs4.png', phases: [
          { open: [{ say: '全體目光向我看齊！', shield: { floor: 9999 } }],   // 階段一（HP 100%~81%）：+9999 護盾，單次傷害 ≤ 9999 歸零
            attacks: withCd([A('彈反', 400), A('吃我飛盾！', 700), A('吃我一劍！', 1000)], () => 14) },
          { at: .8, open: [{ say: '看來不能來硬的...', unshield: 'floor' }, { say: '我們絕不投降！', shield: { reduce: .25 } }],   // 階段二（HP ≤ 80%）
            attacks: withCd([A('彈反', 800), A('吃我飛盾！', 1400), { say: '接下這招吧！', playerVuln: { v: 1.2, t: 30 } }, A('流 星 斬 岩 ！', 2000)], () => 14) },
        ] },
        { name: '原始教義派 末卡', hp: 250000, element: '火', image: 'assets/characters/moka4_icon.png', portrait: 'assets/characters/moka4.png', phases: [
          { open: [{ say: '美食要慢慢品嚐', shield: { cap: 20000 } }],   // 階段一（HP 100%~51%）：傷害上限盾
            attacks: withCd([A('這是末卡牌千層麵', 600), { say: '請享用', heal: 2500 }, A('這是一點濃湯', 900), A('趁熱時喝味道最好', 1300),
              A('這個紅醬吃起來是酸的...', 750), A('看來下次要再重新斟酌食材呢.', 1500)], () => 17) },
          { at: .5, open: [{ say: '你手上的金莎...', unshield: 'cap' }, A('不是用來配濃湯的！', 6000)],   // 階段二（HP ≤ 50%）
            attacks: withCd([{ say: '是可忍孰不可忍', selfVuln: { v: 1.15, t: 60 }, playerVuln: { v: 1.25, t: 60 } }, A('燒毀！', 1000), A('整鍋湯已經不乾淨了！', 1200),
              A('什麼叫你想做巧克力黑暗火鍋啊！', 900), A('你在侮辱我嗎！', 1500), A('我要把不懂美食的人消失在此', 800), A('(膨脹', 800), A('(爆炸', 3000)], () => 14) },
        ] },
      ] }] },
  // 迷因之王：關卡的 drops = 該關掉落的角色（首次通關必得、之後依 CFG.CHAR_DROP 機率）；三個關卡各一個波次、一名敵人；血量 MEME_HP；攻擊腳本依序循環
  { id: 'meme', name: '迷因之王', image: '', stages: [
    { id: 'meme1', name: '奶龍降臨', note: '', map: {}, drops: ['nailong4'], waves: [{ name: '超極霸奶龍', hp: MEME_HP, element: '土', image: 'assets/characters/nailong5_icon.png', portrait: 'assets/characters/nailong5.png', attacks: [
      A('呼哼———', 400, 20), A('哼哈哈哈哈哈哈！', 700, 20), A('哇哈哈哈哈哈哈哈哈哈哈！', 1000, 20), A('哈嗯！...', 800, 20),
      { say: '嗚噁噁噁噁噁噁噁噁噁噁！', special: 'vomit', dur: 12, cd: 20 }] }] },
    { id: 'meme2', name: '淫夢之王', note: '', map: {}, drops: ['tado4'], waves: [{ name: '淫夢王 田所浩二', hp: MEME_HP, element: '金', image: 'assets/characters/tado5_icon.png', portrait: 'assets/characters/tado5.png',
      attacks: withCd([   // 奇數次攻擊冷卻 20 秒、偶數次 15 秒
        A('好時代...', 114), A('來臨力！(喜', 514), A('好時代是甚麼...', 777),
        { say: '有甚麼雷普的必要嗎？', special: 'laser', warn: 3, dur: 7 },
        A('お前は ...', 11), A('やりますね ！！！', 4514), A('歡淫來到會員制餐廳，我們甚麼都會提供（震聲 ', 1919), A('這事紅茶，請', 810),
        A('你拒絕加入淫夢？（驚愕 ', 114), A('十分甚至九分不願意？！', 514), A('意義逝...', 810), A('吾亦逝...', 19),
      ], n => n % 2 ? 20 : 15) }] },
    { id: 'meme3', name: '街舞大賽', note: '', map: {}, drops: ['ikeze4'], waves: [{ name: '榮譽街舞大師 池澤', hp: MEME_HP, element: '金', image: 'assets/characters/ikeze5_icon.png', portrait: 'assets/characters/ikeze5.png',
      attacks: withCd([
        A('跟上我的節奏！', 500), A('跟我一起這樣做！', 500),
        { say: '閃 身 步', special: 'arrowrow', dur: 40, every: 1.6, atkDuring: true },   // 特殊地圖中，池澤仍會依冷卻發動後續攻擊
        A('左 閃 ←', 700), A('右 閃→', 700), A('閃電五連鞭！！！', 2000), A('狗熊哆嗦毛！！！', 2000), A('我要成為殃歌star！', 2500),
        A('要認真了，這是絕技...', 300), A('反崴十字步！！！', 3000),
      ], () => 20) }] },
  ] },
];
