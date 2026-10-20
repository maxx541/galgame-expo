/* =============================================================================
 * jump.js — 進入展覽的轉場：按下歡迎彈窗的「進入展覽」時，蓋上一張帶 Q 版角色的轉場畫面
 * -----------------------------------------------------------------------------
 * 概念參考 JIEJOE 的「頁面跳轉動畫」教學：先用一張全螢幕的畫面蓋住 →
 * 在被蓋住的時候偷偷切換內容 → 再把畫面滑開。這裡的畫面是從下面滑上來、
 * 中間有一隻隨機的 Q 版角色跳動、切換完成後往上滑走。
 *
 * 用法：
 *   JUMP.run(() => { 要切換的事 });          // 蓋住 → 執行 → 滑開
 *
 * 轉場畫面是 popover（最上層），所以會蓋在 <dialog> 上面。
 * 不支援 popover、或使用者設定了「減少動態」時，直接執行切換，不播動畫。
 * ========================================================================== */
(function () {
  'use strict';

  const COUNT = 17; // assets/img/chibi/jump-01 ~ jump-17
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supported = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

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

    // 內容切換完成，往上滑走
    root.classList.add('is-out');
    await wait(OUT_MS);

    try {
      root.hidePopover();
    } catch (_) {}
    root.classList.remove('is-cover', 'is-out');
    busy = false;
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

  window.JUMP = { run };
})();
