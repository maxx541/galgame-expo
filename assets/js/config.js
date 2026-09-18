/* =============================================================================
 * config.js — 全站設定（唯一需要你手動修改的檔案）
 * -----------------------------------------------------------------------------
 * 部署前請把下面的 SUPABASE / CLOUDINARY 欄位填上你自己的值。
 * 詳細申請步驟請看 docs/SETUP.md。
 *
 * ⚠️ 這個檔案會被瀏覽器下載，裡面的值等於「公開」。
 *    只能放 anon public key / unsigned upload preset，
 *    絕對不要放 service_role key 或 Cloudinary API Secret。
 * ========================================================================== */

window.EXPO_CONFIG = {
  /* ---------------------------------------------------------------------------
   * 1) 展覽基本資訊
   * ------------------------------------------------------------------------ */
  site: {
    title: '口袋中的夏末號',
    subtitle: '線上週邊展示牆',
    description:
      '遊戲實體、設定集、掛軸、立牌與各式週邊，歡迎慢慢看。',
    // 分享用網址（給 OG meta 用；沒有就留空）
    url: '',
  },

  /* ---------------------------------------------------------------------------
   * 2) Supabase（資料庫）
   *    Supabase Dashboard → Project Settings → API
   *    - url    = Project URL
   *    - anonKey= Project API keys → anon / public
   *    兩個都留空 → 自動進入「展示模式（Demo）」：
   *    由 assets/js/store.js 即時產生 108 件佔位展品，讓你先看完整個版面。
   * ------------------------------------------------------------------------ */
  supabase: {
    url: 'https://otoengoysjwpipqhehoi.supabase.co',        // 例：'https://abcdefghijk.supabase.co'
    anonKey: 'sb_publishable_Ps9UiCcmOfZ8O9EEH_V-8w_7OoLAIbg',    // 例：'eyJhbGciOiJIUzI1NiIsInR5cCI6...'
    table: 'exhibits',
    // 上傳者登入方式：團隊共用一組密碼，驗證放在雲端。
    // 密碼設定 / 更換方式：到 Supabase 的 SQL Editor 執行
    // supabase/schema.sql 最下面「設定／更換密碼」那段 SQL。
    authMode: 'shared',
  },

  /* ---------------------------------------------------------------------------
   * 3) Cloudinary（圖床 + CDN）
   *    Cloudinary Dashboard → Settings → Upload → Upload presets
   *    建立一個 Signing Mode = Unsigned 的 preset，把名字填到 uploadPreset。
   * ------------------------------------------------------------------------ */
  cloudinary: {
    cloudName: 'zymfvyzu',            // 例：'dxxxxxxxx'
    uploadPreset: 'galgame_expo_host',         // 例：'galgame_expo_unsigned'
    folder: 'galgame-expo',   // 上傳後歸檔的資料夾
  },

  /* ---------------------------------------------------------------------------
   * 4) 社團 / 品牌候選清單（展覽頁的主要篩選維度）
   *    上傳時「社團」欄位打第一個字就會跳建議，點一下自動填入。
   *    清單裡沒有的直接打新的，或選「其他社團」。
   *    冷門、只有一兩件的社團建議就歸「其他社團」，不用每個都列。
   * ------------------------------------------------------------------------ */
  circlePresets: [
    'Key',
    'ゆずソフト（柚子社）',
    'オーガスト（august）',
    'SAGA PLANETS',
    'ういんどみる（窗社）',
    'CRYSTALiA（水晶社）',
    'SMEE',
    'アクアプラス / Leaf',
    'sprite',
    'ニトロプラス（Nitroplus）',
    'Innocent Grey',
    'Purple software',
    'あかべぇそふとつぅ（AKABEiSOFT2）',
    '07th Expansion',
    'TYPE-MOON',
    'ケロQ（KeroQ）',
    'Laplacian',
    'Whirlpool',
    'âge（アージュ）',
    'ぱれっと（Palette）',
    'CLOCKUP',
    'ALcot',
    'ねこねこソフト',
    'アリスソフト（AliceSoft）',
    'Lose',
    '其他社團',
  ],

  /* ---------------------------------------------------------------------------
   * 5) 作品 → 社團 自動對應
   *    上傳時如果「作品名稱」填的是下面列到的作品，「社團」欄位會自動幫你填。
   *    只列了我有把握的對應，沒把握的作品沒列進來（社團欄位會留空讓你自己填）。
   *    key 用「作品名稱」，value 用「社團」（要跟上面 circlePresets 對得起來）。
   * ------------------------------------------------------------------------ */
  seriesToCircle: {
    '白色相簿2': 'アクアプラス / Leaf',
    '雫': 'アクアプラス / Leaf',
    '蒼之彼方的四重奏': 'sprite',
    '戀愛與選舉與巧克力': 'sprite',
    '穢翼的尤斯蒂婭': 'オーガスト（august）',
    'G弦上的魔王': 'あかべぇそふとつぅ（AKABEiSOFT2）',
    '寒蟬鳴泣之時': '07th Expansion',
    '裝甲惡鬼村正': 'ニトロプラス（Nitroplus）',
    '機神飛翔デモンベイン': 'ニトロプラス（Nitroplus）',
    '殼之少女': 'Innocent Grey',
    '虛之少女': 'Innocent Grey',
    '幸福惡夢 HapyMaher': 'Purple software',
    '黃昏的禁忌之藥': 'Purple software',
    '金色戀曲': 'SAGA PLANETS',
    '天神亂漫': 'ゆずソフト（柚子社）',
    'Summer Pockets': 'Key',
    'Muv-Luv': 'âge（アージュ）',
    '9-nine-': 'ぱれっと（Palette）',
    'euphoria': 'CLOCKUP',
    "CLOVER DAY'S": 'ALcot',
    "CLOVER HEART'S": 'ねこねこソフト',
    'Fate/hollow ataraxia': 'TYPE-MOON',
    '素晴らしき日々～不連続存在～': 'ケロQ（KeroQ）',
    '白昼夢の青写真': 'Laplacian',
    'できない私が、くり返す。': 'Whirlpool',
    'ランス（Rance）': 'アリスソフト（AliceSoft）',
    '愛上火車': 'Lose',
    '煌花絢爛': 'CRYSTALiA（水晶社）',
  },

  /* ---------------------------------------------------------------------------
   * 6) 作品名稱候選清單
   *    「作品名稱」是社團底下更細一層的選填資訊。打字一樣會跳建議。
   *    命名原則：有官方中文譯名就用中文，沒有就用日文原名。
   * ------------------------------------------------------------------------ */
  seriesPresets: [
    // ---- 有官方中文譯名 ----
    '白色相簿2',
    '蒼之彼方的四重奏',
    '穢翼的尤斯蒂婭',
    '戀愛與選舉與巧克力',
    '命運石之門',
    'G弦上的魔王',
    '寒蟬鳴泣之時',
    '裝甲惡鬼村正',
    '殼之少女',
    '虛之少女',
    '幸福惡夢 HapyMaher',
    '黃昏的禁忌之藥',
    '金色戀曲',
    '天神亂漫',
    '變態監獄',
    '水仙',
    '明日方舟',
    '愛上火車',

    // ---- 原文即通用名稱（無另譯或直接沿用原文） ----
    'Summer Pockets',
    'Muv-Luv',
    '9-nine-',
    'euphoria',
    "CLOVER DAY'S",
    "CLOVER HEART'S",
    'Fate/hollow ataraxia',
    '素晴らしき日々～不連続存在～',
    '白昼夢の青写真',
    'できない私が、くり返す。',
    '星空鉄道とシロの旅',
    '機神飛翔デモンベイン',
    '雫',
    'ランス（Rance）',

    // ---- 以下是我無法確認正式名稱的，先沿用你的寫法，請自行修正 ----
    '甜蜜女友',
    '純白',
    '生命的備件',
    '煌花絢爛',
    '八卦戀愛FD',
    '檸檬果醬',
    'puturika',
    '實妹相伴的大泉君',
    '星奏',
    'dreamer her',
    '次元錯位戀人',
    '魔法少女的魔女裁判',
    '小白之旅',
  ],

  /* ---------------------------------------------------------------------------
   * 7) 週邊分類
   *    id 會存進資料庫，請不要隨意更動已使用中的 id。
   *    label = 中文顯示名 / ja = 日文小字 / hue = 色相 (0-360，決定標籤顏色)
   * ------------------------------------------------------------------------ */
  categories: [
    // 依實際藏品清單設計，相似的類型已經合併：
    //   設定集 / 畫集 / 小冊子            → 全部歸「設定集・畫集」
    //   娃娃 / 絨毛 / PVC 公仔            → 全部歸「娃娃・公仔」
    //   立牌 / 壓克力磚 / 壓克力板        → 全部歸「立牌・壓克力」
    //   掛軸・掛畫 / 木製藝術版           → 全部歸「掛軸・木製畫版」
    { id: 'game',       label: '遊戲實體',    ja: 'ゲーム',           hue: 210, icon: '❏' },
    { id: 'artbook',    label: '設定集・畫集', ja: '設定資料集・画集', hue: 158, icon: '▦' },
    { id: 'doujinshi',  label: '同好會刊物',  ja: '同人誌',           hue: 45,  icon: '▧' },
    { id: 'tapestry',   label: '掛軸・木製畫版', ja: 'タペストリー・木製アートボード', hue: 268, icon: '▤' },
    { id: 'acrylic',    label: '立牌・壓克力', ja: 'アクリルスタンド', hue: 330, icon: '◈' },
    { id: 'figure',     label: '娃娃・公仔',  ja: 'ぬいぐるみ・フィギュア', hue: 348, icon: '✿' },
    { id: 'soundtrack', label: '原聲帶',      ja: 'サウンドトラック', hue: 188, icon: '♪' },
    { id: 'other',      label: '其他週邊',    ja: 'その他グッズ',     hue: 292, icon: '✧' },
  ],

  /* ---------------------------------------------------------------------------
   * 8) 體驗選項
   * ------------------------------------------------------------------------ */
  ux: {
    pageSize: 24,          // 一次載入幾張（捲到底自動再載）
    // 櫻花飄落特效，預設開。觀眾可以自己在選單裡關掉。
    petals: true,
    defaultTheme: 'day',   // 'night' | 'day' | 'auto'

    // 【v2】每次進站隨機換一張模糊背景 + 玻璃遮罩
    //   'exhibits' = 從你已上傳的展品照片裡隨機挑（不用另外準備圖）
    //   'library'  = 用下面 backgroundLibrary 陣列裡指定的圖
    //   'off'      = 關閉
    // 手機一律不啟用（backdrop-filter 在中低階 Android 上會讓捲動變頓），
    // 開了系統「減少動態」的使用者也不會看到。
    // ⚠️ 預設關閉。這個效果只在『圖片存在 Cloudinary』時才會啟用 ——
    //    因為它需要伺服器端先把圖模糊好。用瀏覽器的 CSS blur 做全螢幕模糊
    //    實測會讓分頁卡死十幾秒，所以那條路已經被擋掉了。
    //    等你接好 Cloudinary、傳了真實照片之後，把這行改成 'exhibits' 就會生效。
    randomBackground: 'off',

    // randomBackground = 'library' 時才會用到。放圖片網址，例如：
    //   ['assets/img/bg/01.webp', 'https://res.cloudinary.com/.../bg02.jpg']
    backgroundLibrary: [],
    watermark: '',         // 燈箱右下角浮水印文字，不要就留空
    // 右鍵另存的防呆（只是降低誤觸，無法真正防盜圖）
    protectImages: false,
  },
};
