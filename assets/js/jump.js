/* =============================================================================
 * jump.js — 跳轉轉場：開面板、進入展覽、換頁時，蓋上一張帶 Q 版角色的轉場畫面
 * -----------------------------------------------------------------------------
 * 概念參考 JIEJOE 的「頁面跳轉動畫」教學：先用一張全螢幕的畫面蓋住 →
 * 在被蓋住的時候偷偷切換內容 → 再把畫面滑開。這裡的畫面是從下面滑上來、
 * 中間有一隻隨機的 Q 版角色跳動、切換完成後往上滑走。
 *
 * 用法：
 *   JUMP.run(() => { 要切換的事 });          // 同一頁內（開面板、關彈窗）
 *   JUMP.go('admin.html');                    // 換頁：蓋住 → 跳轉；新頁面載入後再滑開
 *
 * 轉場畫面是 popover（最上層），比 <dialog> 後出現就會蓋在上面；切換內容之後
 * 會把它重新提到最上層，所以面板不會擋住滑開的動畫。
 * 不支援 popover、或使用者設定了「減少動態」時，直接執行切換，不播動畫。
 * ========================================================================== */
(function () {
  'use strict';

  const COUNT = 17; // assets/img/chibi/jump-01 ~ jump-17
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supported = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
  const FLAG = 'expo.jump';

  const IN_MS = 420; // 蓋上
  const HOLD_MS = 420; // 蓋住後停留（切換內容、讓角色露臉）
  const OUT_MS = 520; // 滑開

  let root = null;
  let img = null;
  let busy = false;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // 背景分頁不會觸發 requestAnimationFrame，所以加一個逾時保險，免得轉場卡住、畫面一直被蓋著
  const frame = () =>
    new Promise((r) => {
      const t = setTimeout(r, 80);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          clearTimeout(t);
          r();
        })
      );
    });
  const src = (i) => `assets/img/chibi/jump-${String(i).padStart(2, '0')}.webp`;
  const pick = () => 1 + Math.floor(Math.random() * COUNT);

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'jump';
    root.setAttribute('popover', 'manual');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
      '<div class="jump__inner"><img class="jump__chibi" alt="" decoding="async" />' +
      '<p class="jump__text">Now Loading<span>.</span><span>.</span><span>.</span></p></div>';
    document.body.append(root);
    img = root.querySelector('img');
  }

  function show() {
    // 重新 show 會把 popover 放回最上層
    try {
      root.hidePopover();
    } catch (_) {}
    root.showPopover();
  }

  async function run(fn) {
    if (busy || reduceMotion || !supported) {
      fn();
      return;
    }
    busy = true;
    build();
    img.src = src(pick());

    root.classList.remove('is-cover', 'is-out');
    root.classList.add('is-below');
    show();
    await frame();
    root.classList.remove('is-below');
    root.classList.add('is-cover'); // 從下面滑上來
    await wait(IN_MS);

    try {
      fn();
    } catch (err) {
      console.error(err);
    }
    await wait(HOLD_MS);

    // 內容切換完成：把轉場畫面提回最上層，再往上滑走
    root.classList.add('is-static');
    show();
    await frame();
    root.classList.remove('is-static');
    root.classList.add('is-out');
    await wait(OUT_MS);

    try {
      root.hidePopover();
    } catch (_) {}
    root.classList.remove('is-cover', 'is-out');
    busy = false;
  }

  // 換頁：先蓋住再跳轉，新頁面一載入就接著播「滑開」
  function go(url) {
    if (reduceMotion || !supported) {
      location.href = url;
      return;
    }
    try {
      sessionStorage.setItem(FLAG, '1');
    } catch (_) {}
    run(() => {
      location.href = url;
    });
  }

  // 剛跳轉過來：畫面一開始就是蓋住的，等頁面準備好再滑開
  function arrive() {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(FLAG) === '1';
      sessionStorage.removeItem(FLAG);
    } catch (_) {}
    if (!flagged || reduceMotion || !supported) return;

    build();
    img.src = src(pick());
    root.classList.add('is-cover', 'is-static');
    root.showPopover();
    busy = true;
    const done = async () => {
      await wait(HOLD_MS);
      await frame();
      root.classList.remove('is-static');
      root.classList.add('is-out');
      await wait(OUT_MS);
      try {
        root.hidePopover();
      } catch (_) {}
      root.classList.remove('is-cover', 'is-out');
      busy = false;
    };
    if (document.readyState === 'complete') done();
    else window.addEventListener('load', done, { once: true });
  }

  // 閒置時先把角色圖抓下來，第一次轉場才不會閃一下空白
  function preload() {
    for (let i = 1; i <= COUNT; i++) {
      const im = new Image();
      im.decoding = 'async';
      im.src = src(i);
    }
  }
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2500));
  window.addEventListener('load', () => idle(preload));

  // <a data-jump href="..."> 會自動套上換頁轉場（按住 Ctrl／⌘、中鍵、新分頁則維持原本行為）
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-jump]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    e.preventDefault();
    go(a.href);
  });

  window.JUMP = { run, go };
  arrive();
})();
