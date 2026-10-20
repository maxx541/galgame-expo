/* =============================================================================
 * quiz-data.js — Gal 知識小測驗的題目與評級
 * -----------------------------------------------------------------------------
 * 要改題目只動這支檔案：
 *   type 'choice'：選擇題。options 是選項，answer 是正確選項的「文字」（作答時選項順序會打亂）。
 *   type 'pair'  ：兩格填空題。groups 是兩個「正確答案」，每組裡的字串是這個答案可接受的寫法
 *                  （比對時會忽略大小寫、空白、標點與星號，兩格順序不拘）。
 *   image        ：題目附圖（選填），放在 assets/img/quiz/。
 *   disabled     ：true 的題目暫時不出（例如圖片還沒放好）。
 *   explain      ：答完之後顯示的補充說明（選填）。
 * 評級：ratio 是答對比例的「上限（不含）」，由低到高；最後一級放 Infinity。
 * ========================================================================== */
window.QUIZ = {
  title: 'Gal 知識小測驗',
  tiers: [
    { below: 0.34, name: '剛入坑的萌新', note: '歡迎來到 Galgame 的世界，接下來有很多好作品等著你。' },
    { below: 0.6, name: 'Gal 新人', note: '已經有基本認識了，再多玩幾部就能更上一層樓。' },
    { below: 0.9, name: 'Gal 老手', note: '相當熟悉這個圈子了，只差一點點就是老資歷。' },
    { below: Infinity, name: 'Gal 老資歷', note: '全對！你對 Galgame 的了解令人佩服。' },
  ],
  questions: [
    {
      type: 'choice',
      q: '以下哪部遊戲是柚子社（YUZU SOFT）的作品？',
      options: ['魔女的夜宴', '夏日口袋', '9nine', '白日夢的構想圖'],
      answer: '魔女的夜宴',
    },
    {
      type: 'choice',
      q: '以下哪部遊戲相對來說，是劇情作？',
      options: ['白日夢的構想圖', '天色幻想島', 'Nekopara', '黑獸'],
      answer: '白日夢的構想圖',
    },
    {
      type: 'choice',
      q: '哪一位作者的社團，最喜歡寫妹妹的悲劇？',
      options: ['RKR（ウグイスカグラ）', '麻枝准（KEY）', '虛淵玄（Nitro+）', '天宮 Ritsu（YUZU SOFT）'],
      answer: 'RKR（ウグイスカグラ）',
    },
    {
      type: 'choice',
      q: 'CRYSTALiA 新作《ディメンション凸ラバース！！》的正式官方中文名稱是？',
      options: ['次元錯位戀人', '越界戀人', '常軌脫離凸', '我的戀人'],
      answer: '越界戀人',
    },
    {
      type: 'choice',
      q: '以下哪部 Gal 目前動畫還沒有播出？',
      options: ['拔作島', '千戀萬花', '夏日口袋', '9NINE'],
      answer: '千戀萬花',
    },
    {
      // 題目附圖取自展品牆的「魔女的夜宴漫畫」
      type: 'choice',
      image: 'assets/img/quiz/q7.jpg',
      q: '這本漫畫的遊戲名稱叫？',
      options: [
        '魔女的夜宴（サノバウィッチ）',
        '千戀萬花（千恋＊万花）',
        '天使☆囂囂 RE-BOOT!（天使☆騒々 RE-BOOT!）',
        '星光咖啡館與死神之蝶（喫茶ステラと死神の蝶）',
      ],
      answer: '魔女的夜宴（サノバウィッチ）',
    },
    {
      type: 'pair',
      q: '本次展覽的兩個主辦單位分別是？（兩格順序不拘）',
      fields: ['主辦單位一', '主辦單位二'],
      groups: [
        ['台灣Galgame同好會', 'Galgame同好會'],
        ['Eden*創小壇', 'Eden創小壇', 'Eden'],
      ],
      show: '台灣 Galgame 同好會（Galgame 同好會）、Eden* 創小壇（Eden 創小壇、Eden）',
    },
  ],
};
