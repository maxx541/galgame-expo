/* =============================================================================
 * gallery.js — 展覽頁主程式
 * -----------------------------------------------------------------------------
 * 負責：分類篩選、搜尋、排序、版面切換、無限捲動、卡片渲染、燈箱串接。
 *
 * 效能上的幾個關鍵決定：
 *   1. 卡片用 Cloudinary 的縮圖網址（w_600），不是原圖 → 流量差 50 倍以上
 *   2. 圖片全部 loading="lazy" + decoding="async"
 *   3. 卡片先用 aspect-ratio 佔好位置 → 捲動時版面不會跳（CLS = 0）
 *   4. 一次只載 24 筆，捲到底才續載
 *   5. 所有卡片一次組進 DocumentFragment 再插入 DOM，只觸發一次 reflow
 * ========================================================================== */
(function () {
  'use strict';

  const { $, $$, el, category, debounce, toast, store, CFG } = window.U;
  const PAGE = (CFG.ux && CFG.ux.pageSize) || 24;

  /* ---- 目前的檢視狀態 ---------------------------------------------------- */
  const state = {
    category: 'all',
    circle: 'all',   // 社團篩選；'all' 代表不篩選（展覽頁的主要篩選維度）
    search: '',
    sort: 'new',
    loaded: [],      // 目前畫面上所有展品（燈箱用同一份）
    total: 0,
    loading: false,
    done: false,
  };

  let wall = null;
  let observer = null;

  /* ==========================================================================
   * 啟動
   * ======================================================================== */
  async function init() {
    window.U.initTheme();
    window.PETALS.init();

    wall = $('#wall');

    fillSiteText();
    buildFilters();
    bindFiltersHint();
    bindFiltersWheel();
    bindControls();
    bindChrome();
    bindMenuDrawer();
    restoreWallMode();

    if (window.STORE.mode === 'demo') showDemoNotice();

    // 先把展品列表載出來再問統計數字跟社團清單 —— 這幾支查詢如果同時發出去，
    // 這個 Supabase 免費方案的連線數扛不住，會有一部分默默回 503（見 store.js
    // counts() 的註解）。循序執行，慢個半拍換穩定值得。
    await refresh({ reset: true });
    await loadCounts();
    await loadCircleOptions();
  }

  /* ---- 把 config 裡的文案填進頁面 ----------------------------------------- */
  function fillSiteText() {
    const s = CFG.site || {};
    const set = (sel, text) => {
      const n = $(sel);
      if (n && text) n.textContent = text;
    };
    set('#site-title', s.title);
    set('#brand-name', s.title);
    set('#brand-sub', s.subtitle);
    set('#site-subtitle', s.subtitle);
    // hero 底下放的是簡短副標（例如「線上週邊展示牆」），不是完整介紹文案。
    // description 留給 <meta name="description"> 用，這裡不渲染。
    set('#site-desc', s.subtitle);
    if (s.title) document.title = `${s.title}｜${s.subtitle || ''}`.replace(/｜$/, '');

    // 佔位圖：站徽（之後換成自己的檔案，見 docs/ASSETS.md）
    const logo = $('#brand-logo');
    if (logo) logo.src = window.PH.logo(72);
  }

  /* ---- 分類篩選鈕（Galgame 的「選択肢」） --------------------------------- */
  function buildFilters() {
    const box = $('#filters');
    if (!box) return;
    box.textContent = '';

    const mk = (id, label, ja) =>
      el(
        'button',
        {
          class: 'choice',
          type: 'button',
          // 不用 role="radio"：那個角色要求搭配 aria-checked 與方向鍵導覽。
          // 這裡是一排「切換鈕」，aria-pressed 才是正確且完整的語意。
          title: ja ? `${label}（${ja}）` : label,
          'aria-pressed': String(state.category === id),
          dataset: { cat: id },
          onclick: () => setCategory(id),
        },
        [
          el('span', {}, label),
          el('span', { class: 'choice__count', dataset: { count: id } }, ''),
        ]
      );

    box.append(mk('all', '全部', 'すべて'));
    for (const c of CFG.categories || []) {
      box.append(mk(c.id, c.label, c.ja));
    }
  }

  /* ---- 分類 chips 的「還能往右滑」提醒箭頭 ---------------------------------
   * 只有 chips 塞不下（有橫向捲動空間）才顯示；捲過一次或已經看過就記住，
   * 之後不再顯示。 */
  function bindFiltersHint() {
    const filters = $('#filters');
    const hint = $('#filters-hint');
    if (!filters || !hint) return;

    const SEEN_KEY = 'expo.filtersHintSeen';
    if (store.get(SEEN_KEY, false)) {
      hint.remove();
      return;
    }

    const checkOverflow = () => {
      const overflow = filters.scrollWidth > filters.clientWidth + 4;
      hint.classList.toggle('is-hidden', !overflow);
    };
    checkOverflow();
    window.addEventListener('resize', window.U.rafThrottle(checkOverflow), { passive: true });

    filters.addEventListener(
      'scroll',
      () => {
        store.set(SEEN_KEY, true);
        hint.classList.add('is-hidden');
      },
      { once: true, passive: true }
    );
  }

  /* ---- 桌機滑鼠滾輪也能橫向捲動分類 chips ----------------------------------
   * 只有真的塞不下（有橫向空間可捲）、而且這次滾動主要是垂直方向時才接手，
   * 不然會吃掉使用者想滾整個頁面的滾輪事件。 */
  function bindFiltersWheel() {
    const filters = $('#filters');
    if (!filters) return;
    filters.addEventListener(
      'wheel',
      (e) => {
        if (filters.scrollWidth <= filters.clientWidth) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        filters.scrollLeft += e.deltaY;
      },
      { passive: false }
    );
  }

  async function loadCounts() {
    try {
      const counts = await window.STORE.counts();
      for (const node of $$('[data-count]')) {
        const n = counts[node.dataset.count];
        node.textContent = n ? String(n) : '';
      }
      // Hero 的統計數字
      const total = $('#hero-count');
      if (total) total.textContent = String(counts.all || 0);
    } catch {
      // 統計失敗不影響瀏覽，安靜略過
    }
  }

  function setCategory(id) {
    if (state.category === id) return;
    state.category = id;
    for (const b of $$('#filters .choice')) {
      b.setAttribute('aria-pressed', String(b.dataset.cat === id));
    }
    refresh({ reset: true });
  }

  /* ---- 社團篩選（下拉選單） ------------------------------------------------
   * 展覽頁的主要篩選維度。跟分類（一排 chips）不同，社團數量會愈來愈多，
   * 做成 chips 手機上會捲得很長，用 <select> 比較合適。
   * 分類跟社團是 AND 關係，兩個一起套用（例如「立牌」+「Key」）。
   * ------------------------------------------------------------------------- */
  async function loadCircleOptions() {
    const sel = $('#circle-select');
    if (!sel) return;
    try {
      const list = await window.STORE.circleList();
      if (!list.length) {
        // 沒有任何社團資料（demo 剛啟動前、或 Supabase 還沒跑新版 schema）
        // 就把下拉選單藏起來，不要顯示一個永遠只有「全部」的空選單
        sel.closest('.field-inline')?.classList.add('is-hidden');
        return;
      }
      sel.closest('.field-inline')?.classList.remove('is-hidden');
      for (const name of list) {
        sel.append(el('option', { value: name }, name));
      }
    } catch {
      // 社團篩選載入失敗就安靜維持只有「全部社團」
    }
  }

  /* ---- 搜尋 / 排序 / 版面 ------------------------------------------------- */
  function bindControls() {
    const search = $('#search-input');
    const searchBox = $('#search');
    if (search) {
      const run = debounce(() => {
        state.search = search.value.trim();
        searchBox.classList.toggle('has-value', Boolean(search.value));
        refresh({ reset: true });
      }, 280);
      search.addEventListener('input', run);
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          search.value = '';
          run();
        }
      });
    }

    const clear = $('#search-clear');
    if (clear) {
      clear.addEventListener('click', () => {
        search.value = '';
        state.search = '';
        searchBox.classList.remove('has-value');
        search.focus();
        refresh({ reset: true });
      });
    }

    const sort = $('#sort-select');
    if (sort) {
      sort.addEventListener('change', () => {
        state.sort = sort.value;
        refresh({ reset: true });
      });
    }

    const circleSel = $('#circle-select');
    if (circleSel) {
      circleSel.addEventListener('change', () => {
        state.circle = circleSel.value;
        refresh({ reset: true });
      });
    }

    const modeBtn = $('#wall-mode');
    if (modeBtn) modeBtn.addEventListener('click', toggleWallMode);

    const randomBtn = $('#random-pick');
    if (randomBtn) randomBtn.addEventListener('click', showRandom);
  }

  /* ---- 隨機看一件 --------------------------------------------------------
   * 逛展最有趣的是「不知道下一件是什麼」。100 多件照順序看很容易疲乏。
   *
   * 關鍵：要在「目前篩選結果的全部」裡隨機，不是在「已經載入的」裡隨機。
   * 初次進站只載了 24 件，只在已載入的裡面抽，就永遠只會抽到最新的 24 件。
   * 所以抽中的序號如果還沒載到，要先把資料補上去。
   * ---------------------------------------------------------------------- */
  let picking = false;

  async function showRandom() {
    if (picking || !state.total) return;

    const btn = $('#random-pick');
    const target = Math.floor(Math.random() * state.total);

    picking = true;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-busy');
    }

    try {
      // 補到抽中的那一筆為止。guard 是保險絲：
      // 萬一後端回傳的 total 跟實際筆數對不起來，也不會無限迴圈。
      let guard = 0;
      while (state.loaded.length <= target && !state.done && guard < 200) {
        guard++;
        await loadMore();
      }

      const i = Math.min(target, state.loaded.length - 1);
      if (i >= 0) window.LIGHTBOX.open(state.loaded, i);
    } catch (err) {
      toast(err.message || '抽選失敗', 'err');
    } finally {
      picking = false;
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('is-busy');
      }
    }
  }

  /* 單欄 / 多欄切換：手機上想看大圖時很有用 */
  // 抽屜選單的項目是「圖示 + 文字標籤」，不能用 textContent 整個蓋掉
  // （那樣會連文字標籤一起清空），只更新圖示 span 跟 title 提示。
  function paintWallModeBtn(single) {
    const btn = $('#wall-mode');
    if (!btn) return;
    const icon = btn.querySelector('.menu-drawer__icon');
    if (icon) icon.textContent = single ? '▦' : '▤';
    btn.title = single ? '切換為多欄' : '切換為單欄大圖';
  }

  function toggleWallMode() {
    const single = wall.classList.toggle('is-single');
    store.set('expo.wallMode', single ? 'single' : 'grid');
    paintWallModeBtn(single);
  }

  function restoreWallMode() {
    const single = store.get('expo.wallMode', 'grid') === 'single';
    if (single) wall.classList.add('is-single');
    paintWallModeBtn(single);
  }

  /* ---- 頁面外框：sticky 陰影、回到頂部、主題、櫻花 ------------------------ */
  function bindChrome() {
    const header = $('#site-header');
    const toTop = $('#to-top');

    // .controls（篩選列）不再 sticky，跟著頁面正常捲動，所以不需要幫它算
    // 「有沒有被捲到頂上」了 —— 只有 header 是真的釘在頂端，才需要那條分隔線。
    const onScroll = window.U.rafThrottle(() => {
      const y = window.scrollY;
      if (header) header.classList.toggle('is-stuck', y > 8);
      if (toTop) toTop.classList.toggle('is-on', y > 900);
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (toTop) {
      toTop.addEventListener('click', () =>
        window.scrollTo({ top: 0, behavior: 'smooth' })
      );
    }

    const themeBtn = $('#theme-toggle');
    if (themeBtn) {
      const icon = themeBtn.querySelector('.menu-drawer__icon');
      const paint = () => {
        const t = document.documentElement.getAttribute('data-theme');
        const glyph = t === 'day' ? '☾' : '☀';
        if (icon) icon.textContent = glyph;
        else themeBtn.textContent = glyph;
        themeBtn.title = t === 'day' ? '切換到夜間模式' : '切換到日間模式';
      };
      paint();
      themeBtn.addEventListener('click', () => {
        window.U.toggleTheme();
        paint();
      });
    }

    const petalBtn = $('#petal-toggle');
    if (petalBtn) {
      if (!window.PETALS.supported) {
        petalBtn.style.display = 'none';
      } else {
        const paint = () => {
          const on = window.PETALS.enabled();
          petalBtn.style.opacity = on ? '1' : '0.45';
          petalBtn.title = on ? '關閉櫻花特效' : '開啟櫻花特效';
          petalBtn.setAttribute('aria-pressed', String(on));
        };
        paint();
        petalBtn.addEventListener('click', () => {
          window.PETALS.toggle();
          paint();
        });
      }
    }

    // 鍵盤捷徑：/ 跳到搜尋框（沿用一般網站的習慣）、r 隨機看一件
    document.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '/') {
        if (window.LIGHTBOX.isOpen) return;
        e.preventDefault();
        const s = $('#search-input');
        if (s) s.focus();
      } else if (e.key === 'r' || e.key === 'R') {
        // 燈箱開著時也能按，直接跳到另一件
        e.preventDefault();
        showRandom();
      }
    });

    if (CFG.ux && CFG.ux.protectImages) {
      document.body.classList.add('protect-images');
      document.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'IMG') e.preventDefault();
      });
    }
  }

  /* ---- 抽屜選單（漢堡鈕） --------------------------------------------------
   * header 現在只留 logo + 漢堡鈕，日夜切換／櫻花／單欄多欄／隨機看一件／
   * 上傳者入口全部收在這個從右邊滑出的抽屜裡，元素本身還是同一批（同樣的
   * id），只是換了位置，所以 bindChrome() 裡原本那些綁定完全不用動。
   * ------------------------------------------------------------------------- */
  function bindMenuDrawer() {
    const toggle = $('#menu-toggle');
    const drawer = $('#menu-drawer');
    const scrim = $('#menu-scrim');
    if (!toggle || !drawer || !scrim) return;

    let closeTimer = 0;

    function open() {
      clearTimeout(closeTimer);
      toggle.setAttribute('aria-expanded', 'true');
      drawer.hidden = false;
      scrim.hidden = false;
      // 拿掉 hidden 跟加上 .is-open 要分兩幀，不然瀏覽器會把這次當成
      // 「一開始就是 is-open」，直接跳過 transform 的轉場動畫。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          drawer.classList.add('is-open');
          scrim.classList.add('is-open');
        });
      });
      document.body.classList.add('menu-is-open');
    }

    function close() {
      toggle.setAttribute('aria-expanded', 'false');
      drawer.classList.remove('is-open');
      scrim.classList.remove('is-open');
      document.body.classList.remove('menu-is-open');
      // 跟 lightbox.js 關閉燈箱同樣的理由：不依賴 transitionend，
      // 同一元素快速連續觸發轉場時可能收不到那個事件，時間到了就直接收掉。
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        drawer.hidden = true;
        scrim.hidden = true;
      }, 320);
    }

    toggle.addEventListener('click', () => {
      if (drawer.classList.contains('is-open')) close();
      else open();
    });

    scrim.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
    });

    // 選單裡點了任何一個項目就收起選單 —— 點完「切換主題」還讓選單開著擋畫面沒道理
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('.menu-drawer__item')) close();
    });
  }

  /* ==========================================================================
   * 資料載入與渲染
   * ======================================================================== */

  async function refresh({ reset = false } = {}) {
    if (reset) {
      state.loaded = [];
      state.done = false;
      wall.textContent = '';
      showSkeletons();
      hideEmpty();
      disconnectObserver();
    }
    await loadMore();
  }

  function showSkeletons(n = 8) {
    const frag = document.createDocumentFragment();
    const ratios = [1.4, 1.25, 1.0, 1.5, 1.18, 0.75, 1.35, 1.1];
    for (let i = 0; i < n; i++) {
      frag.append(
        el('div', {
          class: 'skeleton-card',
          dataset: { skeleton: '1' },
          style: { aspectRatio: `1 / ${ratios[i % ratios.length]}` },
        })
      );
    }
    wall.append(frag);
  }

  function clearSkeletons() {
    for (const n of $$('[data-skeleton]', wall)) n.remove();
  }

  // 目前正在進行的載入。燈箱要「等這批載完」時會用到它，
  // 否則同時觸發兩次載入會拿到 undefined 而不是可以 await 的東西。
  let inflight = null;

  function loadMore() {
    if (state.loading) return inflight || Promise.resolve();
    if (state.done) return Promise.resolve();
    inflight = doLoadMore().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function doLoadMore() {
    state.loading = true;
    setLoadingUI(true);

    const from = state.loaded.length;
    const to = from + PAGE - 1;

    try {
      const { items, total } = await window.STORE.list({
        category: state.category,
        circle: state.circle,
        search: state.search,
        sort: state.sort,
        from,
        to,
      });

      clearSkeletons();
      state.total = total;
      state.loaded.push(...items);

      if (items.length) renderCards(items);

      // 拿到的比要求的少，或已經拿滿 total → 沒有下一頁了
      if (items.length < PAGE || state.loaded.length >= total) {
        state.done = true;
      }

      updateResultBar();

      if (!state.loaded.length) {
        showEmpty();
      } else if (!state.done) {
        armObserver();
      } else {
        showEndMark();
      }

      // 讓燈箱知道最新的清單（分享連結進站時要用）
      window.LIGHTBOX.syncFromHash(state.loaded);
    } catch (err) {
      clearSkeletons();
      console.error(err);
      toast(err.message || '載入失敗', 'err', 6000);
      showError(err.message);
      state.done = true;
    } finally {
      state.loading = false;
      setLoadingUI(false);
    }
  }

  /* ---- 卡片 -------------------------------------------------------------- */
  function renderCards(items) {
    const frag = document.createDocumentFragment();
    const baseIndex = state.loaded.length - items.length;

    items.forEach((it, i) => {
      frag.append(buildCard(it, baseIndex + i));
    });

    wall.append(frag);

    // 下一格畫面才加 .is-in，讓淡入動畫確實跑起來
    requestAnimationFrame(() => {
      for (const c of $$('.card:not(.is-in)', wall)) c.classList.add('is-in');
    });
  }

  function buildCard(it, idx) {
    const cat = category(it.category);
    const thumbSrc = window.CLOUD.thumb(it.imageUrl, 600);
    const srcset = window.CLOUD.srcset(it.imageUrl);

    const img = el('img', {
      class: 'card__img',
      src: thumbSrc,
      srcset: srcset || null,
      sizes: '(max-width: 760px) 50vw, (max-width: 1280px) 33vw, 25vw',
      alt: `${it.title}${it.series ? '　' + it.series : ''}`,
      loading: 'lazy',
      decoding: 'async',
      draggable: 'false',
    });

    const media = el(
      'div',
      {
        class: 'card__media is-loading',
        // 先用已知比例佔位，圖片載入時版面不會跳動
        style: it.width && it.height ? { aspectRatio: `${it.width} / ${it.height}` } : {},
      },
      // 圖片上不疊任何東西。分類改放到下面的文字區（見 card__body）。
      [img]
    );

    img.addEventListener(
      'load',
      () => {
        img.classList.add('is-loaded');
        media.classList.remove('is-loading');
        // 資料庫沒存尺寸時，用實際載入的尺寸補上比例
        if (!it.width || !it.height) {
          it.width = img.naturalWidth;
          it.height = img.naturalHeight;
          media.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        }
      },
      { once: true }
    );

    img.addEventListener(
      'error',
      () => {
        media.classList.remove('is-loading');
        media.style.aspectRatio = '4 / 3';
        media.append(
          el(
            'div',
            {
              style: {
                position: 'absolute',
                inset: '0',
                display: 'grid',
                placeItems: 'center',
                fontSize: '12px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '12px',
              },
            },
            '圖片載入失敗'
          )
        );
      },
      { once: true }
    );

    const subText = [it.series, it.character].filter(Boolean).join('　/　');

    const card = el(
      'button',
      {
        class: 'card',
        type: 'button',
        style: { '--hue': cat.hue },
        'aria-label': `檢視 ${it.title}`,
        onclick: () => {
          const i = state.loaded.findIndex((x) => x.id === it.id);
          window.LIGHTBOX.open(state.loaded, i < 0 ? idx : i);
        },
      },
      [
        media,
        el('div', { class: 'card__body' }, [
          el('div', { class: 'card__title' }, [window.U.highlight(it.title, state.search)]),
          subText
            ? el('div', { class: 'card__sub' }, [window.U.highlight(subText, state.search)])
            : null,
        ]),
      ]
    );

    // --hue 要用 setProperty 才吃得到自訂屬性
    card.style.setProperty('--hue', String(cat.hue));
    return card;
  }

  /* ---- 無限捲動 ---------------------------------------------------------- */
  function armObserver() {
    disconnectObserver();
    const sentinel = $('#sentinel');
    if (!sentinel) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      // 提前 800px 就開始載，使用者捲到底時通常已經載好了
      { rootMargin: '800px 0px' }
    );
    observer.observe(sentinel);
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /* ---- 各種狀態顯示 ------------------------------------------------------ */
  function setLoadingUI(on) {
    const box = $('#loadmore');
    if (box) box.style.display = on && state.loaded.length ? 'flex' : 'none';
  }

  function updateResultBar() {
    const bar = $('#result-count');
    if (!bar) return;
    const catLabel =
      state.category === 'all' ? '全部展品' : category(state.category).label;
    bar.textContent = '';
    bar.append(
      catLabel,
      '　',
      el('b', {}, String(state.total)),
      ' 件',
      state.circle !== 'all' ? `　社團「${state.circle}」` : '',
      state.search ? `　關鍵字「${state.search}」` : ''
    );
  }

  function showEndMark() {
    if ($('#end-mark')) return;
    if (!state.loaded.length) return;
    const host = $('#gallery-foot');
    if (host) {
      host.append(el('div', { class: 'end-mark', id: 'end-mark' }, '以上為全部展品'));
    }
  }

  function showEmpty() {
    hideEmpty();
    const host = $('#gallery-foot');
    if (!host) return;
    host.append(
      el('div', { class: 'empty', id: 'empty-state' }, [
        el('img', { class: 'empty__mark', src: window.PH.emptyMark(), alt: '' }),
        el('div', { class: 'empty__title' }, 'なにも見つからなかった…'),
        el(
          'div',
          { class: 'empty__text' },
          state.search
            ? `找不到符合「${state.search}」的展品。換個關鍵字，或把分類切回「全部」試試。`
            : state.circle !== 'all'
              ? `「${state.circle}」在這個分類裡還沒有展品，試試把分類切回「全部」。`
              : '這個分類還沒有展品。'
        ),
      ])
    );
  }

  function hideEmpty() {
    const n = $('#empty-state');
    if (n) n.remove();
    const e = $('#end-mark');
    if (e) e.remove();
    const err = $('#error-state');
    if (err) err.remove();
  }

  function showError(msg) {
    const host = $('#gallery-foot');
    if (!host) return;
    host.append(
      el('div', { class: 'empty', id: 'error-state' }, [
        el('div', { class: 'empty__title' }, '載入時出了點問題'),
        el('div', { class: 'empty__text' }, msg || '請稍後再試一次。'),
      ])
    );
  }

  /* ---- Demo 模式提示 -----------------------------------------------------
   * 這裡只說明「現在看到的是什麼」，不講怎麼改設定 —— 網站是給直接使用的人看，
   * 不是給架站的人看的操作說明書。 */
  function showDemoNotice() {
    const host = $('#notice-slot');
    if (!host) return;
    host.append(
      el('div', { class: 'notice' }, [
        el('span', { class: 'notice__icon' }, '✦'),
        el('div', {}, [
          el('b', {}, '目前是展示模式（Demo）'),
          el('br'),
          '你看到的展品與圖片都是自動產生的佔位內容，用來預覽版面。',
        ]),
      ])
    );
  }

  /* ==========================================================================
   * 對外接口
   * --------------------------------------------------------------------------
   * 給 lightbox.js 用：使用者在燈箱裡一直按右鍵翻到底時，
   * 燈箱需要能主動要求「再載下一頁」，否則會卡在第 24 張翻不動。
   * ======================================================================== */
  window.GALLERY = {
    get items() {
      return state.loaded;
    },
    get hasMore() {
      return !state.done;
    },
    loadMore,
  };

  /* ---- 走 ---------------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
