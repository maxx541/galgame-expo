/* =============================================================================
 * intro.js — 漢堡選單「介紹」那一組的彈出面板
 * -----------------------------------------------------------------------------
 * 選單項目用 data-intro="<dialog 的 id>" 指定要開哪一個面板，面板本身是
 * index.html 底部的 <dialog class="intro">，內容直接寫在 HTML 裡。
 *
 * 行為：
 *   - 點選單項目 → showModal()（抽屜選單會由 gallery.js 自己收起來）
 *   - 右上 × / 點面板外的暗色區 / Esc → 關閉
 *   - 面板裡的 <iframe data-src> 第一次打開才載入，不拖慢首頁
 *   - 網址帶 #intro-club 這種 hash 進站會直接打開對應面板，方便分享
 * ========================================================================== */
(function () {
  'use strict';

  const dialogs = document.querySelectorAll('dialog.intro');
  if (!dialogs.length || typeof HTMLDialogElement !== 'function') return;

  function open(id) {
    const dlg = document.getElementById(id);
    if (!dlg || !dlg.classList.contains('intro') || dlg.open) return;

    dlg.querySelectorAll('iframe[data-src]').forEach((frame) => {
      frame.src = frame.dataset.src;
      frame.removeAttribute('data-src');
    });

    dlg.showModal();
    dlg.querySelector('.intro__body').scrollTop = 0;
    document.body.classList.add('intro-is-open');
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-intro]');
    if (trigger) open(trigger.dataset.intro);
  });

  dialogs.forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      // 面板內容把 dialog 整個填滿，所以點到 dialog 本身＝點到外面的 backdrop
      if (e.target === dlg || e.target.closest('[data-intro-close]')) dlg.close();
    });

    dlg.addEventListener('close', () => {
      document.body.classList.remove('intro-is-open');
      if (location.hash === '#' + dlg.id) {
        history.replaceState(null, '', location.pathname + location.search);
      }
      // 觸發的選單項目已經跟著抽屜收起來了，焦點還給漢堡鈕
      const toggle = document.getElementById('menu-toggle');
      if (toggle) toggle.focus({ preventScroll: true });
    });
  });

  if (location.hash) open(location.hash.slice(1));
})();
