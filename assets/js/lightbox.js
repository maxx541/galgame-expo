/* =============================================================================
 * lightbox.js — 燈箱
 * -----------------------------------------------------------------------------
 * 功能：
 *   - 鍵盤：← → 切換、Esc 關閉、Home/End 跳頭尾
 *   - 手機：左右滑動切換、上下滑動關閉
 *   - 預先載入前後各一張，切換時幾乎沒有等待
 *   - 網址 hash 同步（#e=<id>），可以把單一展品的連結分享給別人
 *   - 焦點鎖在燈箱內，關閉後焦點回到原本的卡片（無障礙）
 *
 * 版面上刻意讓圖片吃掉絕大部分畫面，說明文字壓在下面一條 ADV 對話框裡。
 * ========================================================================== */
(function () {
  'use strict';

  const { $, el, category, toast, CFG } = window.U;

  let root = null;
  let imgEl = null;
  let items = [];
  let index = 0;
  let lastFocus = null;
  let isOpen = false;
  let closeTimer = 0;
  // 要比 CSS 的 lb-out (0.24s) 稍長，讓動畫跑完才真的隱藏
  const CLOSE_MS = 260;
  const preloaded = new Map();

  /* ==========================================================================
   * 建立 DOM（只建一次）
   * ======================================================================== */
  function build() {
    if (root) return root;

    imgEl = el('img', {
      class: 'lb__img',
      alt: '',
      decoding: 'async',
      draggable: 'false',
    });

    const stage = el('div', { class: 'lb__stage' }, [
      el('div', { class: 'lb__counter' }, [
        el('b', { id: 'lb-cur' }, '1'),
        ' / ',
        el('span', { id: 'lb-total' }, '1'),
      ]),
      el('div', { class: 'lb__tools' }, [
        el(
          'button',
          {
            class: 'lb__nav btn--icon',
            id: 'lb-link',
            type: 'button',
            title: '複製這件展品的連結',
            'aria-label': '複製這件展品的連結',
            style: { position: 'static', transform: 'none' },
          },
          '🔗'
        ),
        el(
          'button',
          {
            class: 'lb__nav btn--icon',
            id: 'lb-close',
            type: 'button',
            title: '關閉 (Esc)',
            'aria-label': '關閉',
            style: { position: 'static', transform: 'none' },
          },
          '✕'
        ),
      ]),
      imgEl,
      el('div', { class: 'lb__loading', id: 'lb-loading' }, [
        el('div', { class: 'spinner' }),
      ]),
      el(
        'button',
        {
          class: 'lb__nav lb__nav--prev',
          id: 'lb-prev',
          type: 'button',
          'aria-label': '上一件',
        },
        '‹'
      ),
      el(
        'button',
        {
          class: 'lb__nav lb__nav--next',
          id: 'lb-next',
          type: 'button',
          'aria-label': '下一件',
        },
        '›'
      ),
      CFG.ux && CFG.ux.watermark
        ? el('div', { class: 'lb__watermark' }, CFG.ux.watermark)
        : null,
    ]);

    const info = el('div', { class: 'lb__info' }, [
      el('div', { class: 'advbox lb__advbox', id: 'lb-advbox' }, [
        el('span', { class: 'advbox__name', id: 'lb-cat' }, '分類'),
        el('h2', { class: 'lb__title', id: 'lb-title' }, ''),
        el('div', { class: 'lb__series', id: 'lb-series' }, ''),
        el('p', { class: 'lb__note', id: 'lb-note' }, ''),
        el('div', { class: 'lb__facts', id: 'lb-facts' }),
        el('span', { class: 'advbox__cursor' }, '▼'),
      ]),
    ]);

    root = el(
      'div',
      {
        class: 'lightbox',
        id: 'lightbox',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': '展品詳細資訊',
      },
      [stage, info]
    );

    document.body.append(root);
    wire();
    return root;
  }

  /* ==========================================================================
   * 事件
   * ======================================================================== */
  function wire() {
    $('#lb-close', root).addEventListener('click', close);
    $('#lb-prev', root).addEventListener('click', () => go(index - 1));
    $('#lb-next', root).addEventListener('click', () => go(index + 1));

    $('#lb-link', root).addEventListener('click', async () => {
      const it = items[index];
      if (!it) return;
      const url = `${location.origin}${location.pathname}#e=${encodeURIComponent(it.id)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast('已複製這件展品的連結', 'ok');
      } catch {
        // clipboard 在非 HTTPS 下會被擋，退而求其次顯示網址讓使用者自己複製
        toast(url, 'info', 6000);
      }
    });

    // 點背景（不是圖片本身）關閉
    root.addEventListener('click', (e) => {
      if (e.target === root || e.target.classList.contains('lb__stage')) close();
    });

    // 桌機點圖片放大
    imgEl.addEventListener('click', (e) => {
      if (window.matchMedia('(max-width: 760px)').matches) return;
      e.stopPropagation();
      imgEl.classList.toggle('is-zoomed');
    });

    // 手機：備註點一下展開
    $('#lb-note', root).addEventListener('click', function () {
      this.classList.toggle('is-expanded');
    });

    // 鍵盤
    document.addEventListener('keydown', onKey);

    // 手勢
    bindSwipe();

    // 網址 hash（上一頁 / 分享連結）
    window.addEventListener('hashchange', onHash);
  }

  function onKey(e) {
    if (!isOpen) return;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        go(index - 1);
        break;
      case 'ArrowRight':
      case ' ':
        e.preventDefault();
        go(index + 1);
        break;
      case 'Home':
        e.preventDefault();
        go(0);
        break;
      case 'End':
        e.preventDefault();
        go(items.length - 1);
        break;
      case 'Tab':
        trapFocus(e);
        break;
      default:
        break;
    }
  }

  /** 讓 Tab 在燈箱內循環，不會跑到背後的頁面 */
  function trapFocus(e) {
    const focusables = Array.from(
      root.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
    ).filter((n) => n.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function bindSwipe() {
    let sx = 0;
    let sy = 0;
    let t0 = 0;
    let tracking = false;

    root.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) {
          tracking = false; // 雙指 = 縮放，不要當成滑動
          return;
        }
        tracking = true;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        t0 = Date.now();
      },
      { passive: true }
    );

    root.addEventListener(
      'touchend',
      (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        const dt = Date.now() - t0;
        if (dt > 700) return; // 太慢就不算手勢

        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          go(dx < 0 ? index + 1 : index - 1);
        } else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) {
          close(); // 往下滑關閉
        }
      },
      { passive: true }
    );
  }

  function onHash() {
    const m = /#e=([^&]+)/.exec(location.hash);
    if (!m) {
      if (isOpen) close(true);
      return;
    }
    const id = decodeURIComponent(m[1]);
    const i = items.findIndex((x) => String(x.id) === id);
    if (i >= 0 && (!isOpen || i !== index)) go(i, true);
  }

  /* ==========================================================================
   * 渲染
   * ======================================================================== */
  function preload(i) {
    const it = items[i];
    if (!it || preloaded.has(it.id)) return;
    const im = new Image();
    im.decoding = 'async';
    im.src = window.CLOUD.full(it.imageUrl);
    preloaded.set(it.id, im);
    // 只留最近 12 張，避免長時間瀏覽後記憶體一直長大
    if (preloaded.size > 12) {
      preloaded.delete(preloaded.keys().next().value);
    }
  }

  function render() {
    const it = items[index];
    if (!it) return;

    const cat = category(it.category);
    const loading = $('#lb-loading', root);

    // 換圖：先淡出，載完再淡入
    imgEl.classList.remove('is-zoomed');
    imgEl.classList.add('is-swapping');
    loading.classList.add('is-on');

    const next = new Image();
    next.decoding = 'async';
    next.onload = () => {
      imgEl.src = next.src;
      imgEl.alt = `${it.title}${it.series ? ' — ' + it.series : ''}`;
      imgEl.classList.remove('is-swapping');
      loading.classList.remove('is-on');
    };
    next.onerror = () => {
      loading.classList.remove('is-on');
      imgEl.classList.remove('is-swapping');
      imgEl.alt = '這張圖片載入失敗';
      toast('圖片載入失敗，請檢查網路或圖片網址', 'err');
    };
    next.src = window.CLOUD.full(it.imageUrl);

    // 文字區
    const catEl = $('#lb-cat', root);
    catEl.textContent = `${cat.icon} ${cat.label}`;
    catEl.style.background = `linear-gradient(100deg, hsl(${cat.hue} 82% 72%), hsl(${(cat.hue + 45) % 360} 76% 68%))`;

    $('#lb-title', root).textContent = it.title;

    const series = $('#lb-series', root);
    // 社團放最前面（主要歸屬），再接作品、角色
    const seriesText = [it.circle, it.series, it.character].filter(Boolean).join('　/　');
    series.textContent = seriesText;
    series.style.display = seriesText ? '' : 'none';

    const note = $('#lb-note', root);
    note.textContent = it.note || '';
    note.style.display = it.note ? '' : 'none';
    note.classList.remove('is-expanded');

    const facts = $('#lb-facts', root);
    facts.textContent = '';
    const rows = [
      ['類型', cat.label + (cat.ja ? `（${cat.ja}）` : '')],
      it.owner ? ['擁有者', it.owner] : null,
    ].filter(Boolean);
    for (const [k, v] of rows) {
      facts.append(el('span', {}, [`${k}　`, el('b', {}, v)]));
    }

    // 計數與導航
    updateNav();
    preload(index + 1);
    preload(index - 1);
    maybeLoadMore();
  }

  function updateNav() {
    const more = Boolean(window.GALLERY && window.GALLERY.hasMore);
    $('#lb-cur', root).textContent = String(index + 1);
    // 還有沒載完的就在總數後面加個「+」，讓人知道不只這些
    $('#lb-total', root).textContent = items.length + (more ? '+' : '');
    $('#lb-prev', root).disabled = index <= 0;
    // 已經到最後一張、但展覽還有沒載完的，就不要把「下一張」鎖住
    $('#lb-next', root).disabled = index >= items.length - 1 && !more;
  }

  /**
   * 快翻到底時，主動請 gallery 再載一頁。
   * 沒有這段的話，使用者在燈箱裡按右鍵會卡在第 24 張，
   * 得先關掉燈箱、捲動觸發載入、再重新點開，體感很糟。
   */
  async function maybeLoadMore() {
    const G = window.GALLERY;
    if (!G || !G.hasMore) return;
    // 還離結尾很遠就先不動，免得一開燈箱就把整個展覽拉下來
    if (index < items.length - 4) return;

    await G.loadMore();
    if (!isOpen) return;

    items = G.items;
    updateNav();
    preload(index + 1);
  }

  /* ==========================================================================
   * 對外 API
   * ======================================================================== */
  function go(i, fromHash = false) {
    if (!items.length) return;

    // 想翻到「已載入範圍」之外，而展覽其實還有更多 → 先載再翻
    if (i > items.length - 1 && window.GALLERY && window.GALLERY.hasMore) {
      $('#lb-loading', root).classList.add('is-on');
      window.GALLERY.loadMore().then(() => {
        $('#lb-loading', root).classList.remove('is-on');
        if (!isOpen) return;
        items = window.GALLERY.items;
        if (i <= items.length - 1) go(i, fromHash);
        else updateNav(); // 真的沒有了
      });
      return;
    }

    index = Math.max(0, Math.min(items.length - 1, i));
    if (!isOpen) doOpen();
    render();
    if (!fromHash) {
      const id = items[index] && items[index].id;
      if (id != null) {
        history.replaceState(null, '', `#e=${encodeURIComponent(id)}`);
      }
    }
  }

  function doOpen() {
    // 關閉動畫還沒跑完就又打開：取消那個待執行的清除，否則它會把剛開的燈箱關掉
    clearTimeout(closeTimer);
    root.classList.remove('is-closing');
    isOpen = true;
    lastFocus = document.activeElement;
    root.classList.add('is-open');
    // 鎖住背景捲動，同時補上捲軸寬度避免版面橫向抖一下
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
    setTimeout(() => $('#lb-close', root) && $('#lb-close', root).focus(), 60);
  }

  /**
   * @param {Array} list  目前畫面上的展品陣列（已篩選／排序過）
   * @param {number} i    要開啟的索引
   */
  function open(list, i) {
    build();
    items = list || [];
    go(i);
  }

  function close(fromHash = false) {
    if (!isOpen) return;
    isOpen = false;

    clearTimeout(closeTimer);
    root.classList.add('is-closing');

    /* 這裡刻意用 setTimeout，不用 animationend。
     *
     * 原因（實際踩到過）：這個元素在「開」和「關」兩個狀態都有動畫。
     * 開啟時 .is-open 掛著 lb-in，關閉時再加上 .is-closing 只是把
     * animation-name 換成 lb-out —— 但瀏覽器沿用了同一個動畫物件，
     * 它的 currentTime 已經是開啟後經過的時間（實測到 48 秒），
     * 遠超過 0.24s 的長度，於是新動畫一建立就處於 finished 狀態，
     * animationend 根本不會派發。
     *
     * 結果就是 is-open 永遠拿不掉：燈箱維持 display:grid、opacity:0，
     * 蓋住整個畫面並攔截所有點擊 —— 關掉燈箱後整個網站就不能用了。
     *
     * 時間到就移除 class，沒有任何事件可以不發生。
     */
    closeTimer = setTimeout(() => {
      root.classList.remove('is-open', 'is-closing');
    }, CLOSE_MS);
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    imgEl.classList.remove('is-zoomed');
    if (!fromHash && location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /** 頁面資料載完後呼叫，處理「直接用 #e=xxx 連結進站」的情況 */
  function syncFromHash(list) {
    items = list || items;
    onHash();
  }

  window.LIGHTBOX = { open, close, go, syncFromHash, get isOpen() { return isOpen; } };
})();
