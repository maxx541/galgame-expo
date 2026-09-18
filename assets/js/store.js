/* =============================================================================
 * store.js — 資料存取層
 * -----------------------------------------------------------------------------
 * 對外只暴露一組 API，上層（gallery.js / admin.js）不需要知道資料來自哪裡：
 *
 *   STORE.mode            'supabase' | 'demo'
 *   STORE.ready()         → Promise，等待初始化完成
 *   STORE.list(opts)      → { items, total }
 *   STORE.create(payload) → item
 *   STORE.update(id, p)   → item
 *   STORE.remove(id)      → true
 *   STORE.signIn/out/user 僅 authMode='supabase' 時有意義
 *
 * 沒填 Supabase 設定 → 自動進入 demo 模式（假資料 + 本機 localStorage 暫存），
 * 讓你可以先把整個網站看完、玩過一輪，再回頭接真正的後端。
 * ========================================================================== */
(function () {
  'use strict';

  const CFG = window.EXPO_CONFIG || {};
  const SB_CFG = CFG.supabase || {};
  const TABLE = SB_CFG.table || 'exhibits';
  const DEMO_KEY = 'expo.demo.items';        // 舊格式，只用來清掉
  const DEMO_STATE_KEY = 'expo.demo.state';  // 目前格式：{ custom, hiddenDemoIds }
  const DEMO_COUNT = 108;                    // 展示模式要產生幾件佔位展品

  const mode = window.U.hasSupabase() ? 'supabase' : 'demo';

  let sb = null;           // supabase client
  let readyPromise = null;
  let demoItems = null;

  /* ==========================================================================
   * 欄位正規化：資料庫欄位 → 前端統一格式
   * ======================================================================== */
  function normalizeItem(row) {
    return {
      id: row.id,
      title: row.title || '未命名展品',
      circle: row.circle || '',        // 社團 / 品牌（主要篩選維度）
      series: row.series || '',        // 作品名稱
      character: row.character || '',  // 角色
      owner: row.owner || '',          // 擁有者（這件是誰的收藏）
      category: row.category || 'other',
      imageUrl: row.image_url || row.imageUrl || '',
      note: row.note || '',
      width: row.width || null,
      height: row.height || null,
      publicId: row.public_id || row.publicId || '',
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    };
  }

  const FIELD_TO_COLUMN = {
    title: 'title',
    circle: 'circle',
    series: 'series',
    character: 'character',
    owner: 'owner',
    category: 'category',
    imageUrl: 'image_url',
    note: 'note',
    width: 'width',
    height: 'height',
    publicId: 'public_id',
  };

  /**
   * 前端格式 → 資料庫欄位（snake_case）。
   *
   * partial = true 時只轉換 item 裡「真的有出現」的欄位，沒出現的完全不碰。
   * update() 一定要用這個模式 —— 否則傳一個只含 title 的 patch，
   * 會把 series / character / note 全部清成 null。
   */
  function toRow(item, partial = false) {
    const row = {};
    for (const [key, col] of Object.entries(FIELD_TO_COLUMN)) {
      if (partial && !(key in item)) continue;
      const v = item[key];
      // 空字串在資料庫裡一律存成 null，查詢時就不用同時判斷 '' 和 null
      row[col] = v === undefined || v === '' ? null : v;
    }
    return row;
  }

  /* ==========================================================================
   * Demo 資料
   * ======================================================================== */

  // 全部是虛構的作品／角色名，純粹當版面示意用。
  const DEMO_SERIES = [
    ['櫻色協奏曲', 'サクライロ・コンチェルト', ['月見坂 雫', '天野 こはる', '白瀬 あかり']],
    ['星屑のプロローグ', '星屑序章', ['七海 すばる', '橘 みなも', '如月 ゆかり']],
    ['夏空アステリズム', '夏空星座', ['夏目 ひなた', '藤宮 さやか', '小鳥遊 のぞみ']],
    ['雨上がりのイリス', '雨後的鳶尾', ['伊吹 あやめ', '鷺沢 しおり']],
    ['ルミナス・エチュード', '流光練習曲', ['神楽坂 るな', '御影 まひろ', '佐伯 ことり']],
    ['終末カーテンコール', '終末謝幕', ['久遠 つむぎ', '柊 りんね']],
    ['青のノスタルジア', '藍色鄉愁', ['蒼井 みずき', '海棠 なぎさ']],
    ['きみと歩く放課後', '與你同行的放學後', ['桐谷 あおい', '西園寺 ひかり', '相馬 すずな']],
  ];

  const DEMO_NOTES = [
    '2019 年冬 Comiket 會場限定販售，附贈同款小卡一枚。外盒有輕微壓痕，本體保存良好。',
    '首刷特典。印刷採用燙金工藝，實物在光線下會有細緻的反光層次。',
    '官方通販限定，含簽名印刷。當時只開放三天預購，數量相當稀少。',
    '週邊店舖聯名企劃，全 8 種隨機出貨，這是其中最難抽到的一款。',
    '十週年紀念版。附錄收錄了未採用的初期設定稿，個人最喜歡的一本。',
    '活動現場排了兩小時才買到。角色的表情比官網宣傳圖更細膩。',
    '狀態近全新，僅拆封確認過一次。原包裝、防塵套皆完整保留。',
    '繪師親筆簽名版。當年在展場請畫師簽的，是這批收藏裡最有回憶的一件。',
    '海外版特典，與日版的印刷配色略有差異，並排擺放很有意思。',
    '',
  ];

  const SIZE_POOL = [
    [800, 1120], [800, 1000], [900, 900], [800, 1200],
    [1000, 750], [860, 1080], [900, 640], [800, 940],
  ];

  // 團隊展示用的假擁有者名單，純粹讓展示模式能示範「擁有者」欄位長什麼樣子
  const OWNER_POOL = ['阿橘', 'Rin', '小夜', '海棠'];

  // 展示模式用的假社團名單，讓社團篩選有東西可以示範
  const CIRCLE_POOL = ['Key', 'ゆずソフト（柚子社）', 'オーガスト（august）', 'Innocent Grey', '其他社團'];

  function buildDemoItems(count = DEMO_COUNT) {
    const cats = (CFG.categories || []).map((c) => c.id);
    const items = [];
    const base = Date.now();

    for (let i = 0; i < count; i++) {
      const [ja, zh, chars] = DEMO_SERIES[i % DEMO_SERIES.length];
      const cat = cats[i % cats.length] || 'other';
      const meta = window.U.category(cat);
      const character = chars[i % chars.length];
      const [w, h] = SIZE_POOL[i % SIZE_POOL.length];
      const no = String(i + 1).padStart(3, '0');

      items.push(
        normalizeItem({
          id: `demo-${no}`,
          title: `${character} ${meta.label}`,
          circle: CIRCLE_POOL[i % CIRCLE_POOL.length],
          series: `${zh} / ${ja}`,
          character,
          owner: OWNER_POOL[i % OWNER_POOL.length],
          category: cat,
          image_url: window.PH.exhibit({
            seed: `demo-${no}`,
            w,
            h,
            hue: meta.hue,
            label: meta.label,
            sub: character,
          }),
          note: DEMO_NOTES[i % DEMO_NOTES.length],
          width: w,
          height: h,
          // 讓時間序看起來像陸續收藏的：每件間隔約一天多
          created_at: new Date(base - i * 31 * 3600 * 1000).toISOString(),
        })
      );
    }
    return items;
  }

  /** 佔位展品的 id 是固定的（demo-001…demo-108），不用真的把圖產生出來就能列舉 */
  function demoIdList(count = DEMO_COUNT) {
    const ids = [];
    for (let i = 0; i < count; i++) ids.push(`demo-${String(i + 1).padStart(3, '0')}`);
    return ids;
  }

  const isDemoId = (id) => String(id).startsWith('demo-');

  /**
   * localStorage 裡「只」存兩件事：
   *   custom        你自己新增的展品
   *   hiddenDemoIds 你刪掉的佔位展品 id
   *
   * 佔位展品本身每次都重新產生，絕對不寫進 localStorage ——
   * 108 張 SVG data URI 大約是 1–2 MB，而 localStorage 全部才 5 MB，
   * 存進去等於自己把空間塞爆。
   */
  function loadDemo() {
    if (demoItems) return demoItems;

    const base = buildDemoItems();
    const state = window.U.store.get(DEMO_STATE_KEY, null);

    if (state && typeof state === 'object' && !Array.isArray(state)) {
      const hidden = new Set(state.hiddenDemoIds || []);
      const custom = (state.custom || [])
        .map(normalizeItem)
        // blob: 網址重開瀏覽器後就失效了，濾掉免得整牆破圖
        .filter((it) => it.imageUrl && !String(it.imageUrl).startsWith('blob:'));
      demoItems = [...custom, ...base.filter((it) => !hidden.has(it.id))];
    } else {
      demoItems = base;
      // 清掉舊版格式留下的資料（舊版會把佔位圖也存進去）
      window.U.store.del(DEMO_KEY);
    }

    return demoItems;
  }

  function saveDemo() {
    const custom = demoItems.filter((it) => !isDemoId(it.id));
    const present = new Set(demoItems.filter((it) => isDemoId(it.id)).map((it) => it.id));
    const hiddenDemoIds = demoIdList().filter((id) => !present.has(id));

    if (!custom.length && !hiddenDemoIds.length) {
      window.U.store.del(DEMO_STATE_KEY);
      return true;
    }

    const ok = window.U.store.set(DEMO_STATE_KEY, { custom, hiddenDemoIds });
    if (!ok) {
      // 寫入失敗幾乎都是配額爆掉（未設定 Cloudinary 時圖片是以 data URI 存的）。
      // 這時候一定要講出來，不然使用者會以為有存到，關掉瀏覽器就全沒了。
      window.U.toast(
        '瀏覽器儲存空間已滿，這筆沒有存下來。展示模式的圖片是存在本機的，' +
          '請接上 Cloudinary 與 Supabase 再繼續上傳。',
        'err',
        9000
      );
    }
    return ok;
  }

  /* ==========================================================================
   * 初始化
   * ======================================================================== */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () =>
        reject(
          new Error(
            'Supabase 用戶端函式庫載入失敗。請確認網路正常，' +
              '或是有沒有被廣告阻擋器 / 公司網路擋掉 cdn.jsdelivr.net。'
          )
        );
      document.head.append(s);
    });
  }

  async function init() {
    if (mode === 'demo') {
      loadDemo();
      return;
    }
    if (!window.supabase) {
      await loadScript(
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
      );
    }
    sb = window.supabase.createClient(SB_CFG.url, SB_CFG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  function ready() {
    if (!readyPromise) readyPromise = init();
    return readyPromise;
  }

  /* ==========================================================================
   * 查詢
   * ======================================================================== */

  /**
   * @param {object} opts
   *   category  分類 id，'all' 或空值代表全部
   *   series    作品名稱（精確比對），'all' 或空值代表全部
   *   search    關鍵字
   *   sort      'new' | 'old' | 'title'
   *   from,to   分頁範圍（含），例如 0, 23
   */
  async function list(opts = {}) {
    await ready();
    const {
      category = 'all',
      circle = 'all',
      series = 'all',
      search = '',
      sort = 'new',
      from = 0,
      to = 23,
    } = opts;

    if (mode === 'demo') {
      let rows = loadDemo().slice();

      if (category && category !== 'all') {
        rows = rows.filter((r) => r.category === category);
      }

      if (circle && circle !== 'all') {
        rows = rows.filter((r) => r.circle === circle);
      }

      if (series && series !== 'all') {
        rows = rows.filter((r) => r.series === series);
      }

      const q = window.U.normalize(search);
      if (q) {
        rows = rows.filter((r) =>
          window.U.normalize(
            `${r.title} ${r.circle} ${r.series} ${r.character} ${r.owner} ${r.note} ${window.U.category(r.category).label}`
          ).includes(q)
        );
      }

      rows.sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title, 'zh-Hant');
        const d = new Date(a.createdAt) - new Date(b.createdAt);
        return sort === 'old' ? d : -d;
      });

      // 假裝有點網路延遲，免得骨架畫面一閃而過
      await new Promise((r) => setTimeout(r, 120));
      return { items: rows.slice(from, to + 1), total: rows.length };
    }

    // ---- Supabase ----------------------------------------------------------
    let q = sb.from(TABLE).select('*', { count: 'exact' });

    if (category && category !== 'all') q = q.eq('category', category);
    if (circle && circle !== 'all') q = q.eq('circle', circle);
    if (series && series !== 'all') q = q.eq('series', series);

    if (search && search.trim()) {
      // 跨欄位模糊搜尋。前後的 * 是 PostgREST 的萬用字元。
      //
      // 這串是直接拼進 URL 查詢參數的，所以要先把會改變語意的字元拿掉：
      //   , ( )  會被當成 or(...) 清單的結構符號
      //   *      會被當成額外的萬用字元
      //   % _    是 SQL LIKE 自己的萬用字元
      //   " \    可能破壞 PostgREST 的值解析
      // 這些字元幾乎不會出現在作品名或角色名裡，直接濾掉最單純。
      const kw = search.trim().replace(/[%_,()*"\\]/g, '').trim();

      if (kw) {
        q = q.or(
          `title.ilike.*${kw}*,circle.ilike.*${kw}*,series.ilike.*${kw}*,character.ilike.*${kw}*,owner.ilike.*${kw}*,note.ilike.*${kw}*`
        );
      }
    }

    if (sort === 'title') q = q.order('title', { ascending: true });
    else q = q.order('created_at', { ascending: sort === 'old' });

    const { data, error, count } = await q.range(from, to);
    if (error) throw new Error(`讀取失敗：${error.message}`);

    return { items: (data || []).map(normalizeItem), total: count ?? (data || []).length };
  }

  /** 取得各分類的數量，用來顯示篩選鈕上的計數 */
  async function counts() {
    await ready();
    const result = { all: 0 };

    if (mode === 'demo') {
      for (const it of loadDemo()) {
        result.all++;
        result[it.category] = (result[it.category] || 0) + 1;
      }
      return result;
    }

    // 用 head + count 各問一次，不把資料拉下來。
    // 不這樣做的話得整表撈 category 欄位，但 Supabase 的 REST 預設最多回 1000 列，
    // 展品一旦超過就會默默少算 —— 統計數字錯了比沒有更糟。
    const cats = (CFG.categories || []).map((c) => c.id);

    // 不要平行打出去 —— 實測就算單支循序送，緊接著連續送出好幾支 count 查詢，
    // 這個 Supabase 免費方案的連線池還是會有一部分回 503（間隔一小段時間、
    // 失敗重試一次就穩很多，猜是免費方案的連線數／喚醒速度比較緊繃）。
    // 這裡只影響統計數字何時填上去，不擋主要的展品列表載入，慢一點點換穩定值得。
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function queryWithRetry(build) {
      const first = await build();
      if (!first.error) return first;
      await sleep(500);
      return build();
    }

    const builders = [
      () => sb.from(TABLE).select('id', { count: 'exact', head: true }),
      ...cats.map(
        (id) => () => sb.from(TABLE).select('id', { count: 'exact', head: true }).eq('category', id)
      ),
    ];
    const res = [];
    for (const build of builders) {
      if (res.length > 0) await sleep(120);
      res.push(await queryWithRetry(build));
    }

    const first = res[0];
    // 單一批次失敗就當 0，不要讓整個統計連帶掛掉
    result.all = first && !first.error ? first.count || 0 : 0;

    cats.forEach((id, i) => {
      const r = res[i + 1];
      result[id] = r && !r.error ? r.count || 0 : 0;
    });

    return result;
  }

  /**
   * 取得目前所有出現過的作品名稱（去重、排序），給篩選列的「作品」下拉選單用。
   * Supabase 模式查的是 exhibit_series 這個 view（見 schema.sql），
   * 不會受 PostgREST 預設 1000 列上限影響 —— 因為去重的動作是在資料庫做的，
   * view 本身回來的列數就是「有幾部作品」，不是「有幾件展品」。
   */
  async function seriesList() {
    await ready();

    if (mode === 'demo') {
      const set = new Set(loadDemo().map((it) => it.series).filter(Boolean));
      return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    const { data, error } = await sb.from('exhibit_series').select('series');
    if (error) {
      // 這張 view 是新加的，還沒跑過新版 schema.sql 的話會查不到，
      // 作品篩選對使用者來說是加分項目，查不到就安靜退回空清單，不要讓整頁掛掉
      console.warn('讀取作品清單失敗（可能還沒執行新版 supabase/schema.sql）：', error.message);
      return [];
    }
    return (data || []).map((r) => r.series).filter(Boolean);
  }

  /**
   * 上傳時「作品名稱」欄位的建議清單。
   *
   * 跟 seriesList() 刻意分開：
   *   seriesList()        = 資料庫裡「真的有展品」的作品 → 給展覽頁的篩選下拉用。
   *                         如果把還沒有展品的作品也列進去，使用者選了會看到 0 件。
   *   seriesSuggestions() = 上面那些 + config.js 的 seriesPresets → 給後台輸入建議用。
   *                         這裡反而要包含還沒有人上傳過的作品，不然第一個人沒得選。
   */
  async function seriesSuggestions() {
    const presets = (CFG.seriesPresets || []).filter(Boolean);
    let existing = [];
    try {
      existing = await seriesList();
    } catch {
      // 讀不到資料庫就只用預設清單，不要讓建議功能整個失效
    }
    const set = new Set([...presets, ...existing]);
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }

  /**
   * 取得目前真的有展品的社團清單（去重、排序），給展覽頁的篩選下拉用。
   * 跟 seriesList() 同樣的道理：只列「真的有展品」的社團，選了才不會是 0 件。
   */
  async function circleList() {
    await ready();

    if (mode === 'demo') {
      const set = new Set(loadDemo().map((it) => it.circle).filter(Boolean));
      return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    const { data, error } = await sb.from('exhibit_circles').select('circle');
    if (error) {
      console.warn('讀取社團清單失敗（可能還沒執行新版 supabase/schema.sql）：', error.message);
      return [];
    }
    return (data || []).map((r) => r.circle).filter(Boolean);
  }

  /** 上傳時「社團」欄位的建議清單：config 的 circlePresets + 資料庫已有的社團。 */
  async function circleSuggestions() {
    const presets = (CFG.circlePresets || []).filter(Boolean);
    let existing = [];
    try {
      existing = await circleList();
    } catch {
      /* 讀不到就只用預設 */
    }
    const set = new Set([...presets, ...existing]);
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }

  /* ==========================================================================
   * 新增 / 修改 / 刪除
   * ======================================================================== */
  async function create(payload) {
    await ready();

    if (mode === 'demo') {
      const item = normalizeItem({
        ...toRow(payload),
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        created_at: new Date().toISOString(),
      });
      loadDemo().unshift(item);
      saveDemo();
      return item;
    }

    const { data, error } = await sb.from(TABLE).insert(toRow(payload)).select().single();
    if (error) throw new Error(explainWriteError(error));
    return normalizeItem(data);
  }

  async function update(id, patch) {
    await ready();

    if (mode === 'demo') {
      const rows = loadDemo();
      const i = rows.findIndex((r) => String(r.id) === String(id));
      if (i < 0) throw new Error('找不到這筆資料。');
      rows[i] = normalizeItem({ ...toRow({ ...rows[i], ...patch }), id: rows[i].id, created_at: rows[i].createdAt });
      saveDemo();
      return rows[i];
    }

    // partial = true：只更新 patch 裡真的有帶的欄位
    const row = toRow(patch, true);
    if (!Object.keys(row).length) throw new Error('沒有任何要更新的欄位。');

    const { data, error } = await sb.from(TABLE).update(row).eq('id', id).select().single();
    if (error) throw new Error(explainWriteError(error));
    return normalizeItem(data);
  }

  async function remove(id) {
    await ready();

    if (mode === 'demo') {
      demoItems = loadDemo().filter((r) => String(r.id) !== String(id));
      saveDemo();
      return true;
    }

    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) throw new Error(explainWriteError(error));
    return true;
  }

  /** 把 Supabase 的技術性錯誤翻成看得懂的話（不指示怎麼改後台設定，
   *  那些只在開發時看 console/log 就好，畫面上只給使用者看得懂、做得到的話）。 */
  function explainWriteError(error) {
    const msg = error.message || String(error);
    if (/row-level security|violates row-level/i.test(msg)) {
      return '寫入被系統擋下了，請確認你已經登入，或聯絡網站管理員。';
    }
    if (/relation .* does not exist/i.test(msg)) {
      return '系統暫時無法使用，請聯絡網站管理員。';
    }
    if (/JWT|Invalid API key/i.test(msg)) {
      return '連線設定有誤，請聯絡網站管理員。';
    }
    return '寫入失敗，請稍後再試或聯絡網站管理員。';
  }

  /* ==========================================================================
   * Supabase Auth（authMode = 'supabase' 時使用）
   * ======================================================================== */
  async function signIn(email, password) {
    await ready();
    if (mode === 'demo') throw new Error('Demo 模式沒有帳號系統。');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(
        /invalid login/i.test(error.message)
          ? '帳號或密碼不正確。'
          : `登入失敗：${error.message}`
      );
    }
    return data.user;
  }

  async function signOut() {
    await ready();
    if (sb) await sb.auth.signOut();
  }

  /**
   * 方案 C：團隊共用密碼（authMode = 'shared'）。
   *
   * 密碼答對之後，再跟 Supabase 要一個「匿名但真實」的登入 session —— 不是
   * signIn()，是 signInAnonymously()：不需要 email，但拿到的是真的 JWT，
   * 角色是 authenticated，套用的就是 supabase/schema.sql 方案 A 那組
   * 「登入者可寫」的 RLS 政策，完全不用另外設定。
   *
   * 密碼本身的比對發生在資料庫的 verify_upload_password() 函式裡（security
   * definer，繞過 RLS 直接查表），瀏覽器只知道結果是 true/false，看不到雜湊、
   * 看不到判斷邏輯 —— 這是它跟純前端密碼（authMode = 'password'）的差別。
   */
  async function verifyAndSignInShared(password) {
    await ready();
    if (mode === 'demo') {
      throw new Error('目前尚未開放登入，請稍後再試或聯絡網站管理員。');
    }

    const { data: ok, error: rpcError } = await sb.rpc('verify_upload_password', {
      pw: password,
    });
    if (rpcError) {
      throw new Error(
        /function .* does not exist/i.test(rpcError.message)
          ? '系統尚未設定完成，請聯絡網站管理員。'
          : '驗證失敗，請稍後再試。'
      );
    }
    if (!ok) throw new Error('密碼不正確。');

    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      throw new Error(
        /anonymous sign-ins are disabled/i.test(error.message)
          ? '系統設定尚未完成，請聯絡網站管理員。'
          : '登入失敗，請稍後再試。'
      );
    }
    return data.user;
  }

  async function currentUser() {
    await ready();
    if (mode === 'demo' || !sb) return null;
    const { data } = await sb.auth.getUser();
    return data ? data.user : null;
  }

  /* ---- 匯出 -------------------------------------------------------------- */
  window.STORE = {
    mode,
    ready,
    list,
    counts,
    circleList,
    circleSuggestions,
    seriesList,
    seriesSuggestions,
    create,
    update,
    remove,
    signIn,
    signOut,
    currentUser,
    verifyAndSignInShared,
    get client() {
      return sb;
    },
  };
})();
