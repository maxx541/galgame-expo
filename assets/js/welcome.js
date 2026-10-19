/* =============================================================================
 * welcome.js — 進站歡迎彈窗
 * 每個分頁階段只顯示一次（sessionStorage）。網址帶 #intro-xxx（分享連結直接開某個
 * 介紹面板）時不顯示，免得擋住使用者要看的內容。
 * ========================================================================== */
(function () {
  'use strict';

  const dlg = document.getElementById('welcome');
  if (!dlg || typeof HTMLDialogElement !== 'function') return;

  const KEY = 'expo.welcome.seen';
  let seen = false;
  try {
    seen = sessionStorage.getItem(KEY) === '1';
  } catch (_) {}

  function close() {
    if (dlg.open) dlg.close();
  }

  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-welcome-close]')) {
      close();
    } else if (e.target.closest('[data-welcome-more]')) {
      close();
      // 交給 intro.js 的點擊代理打開「攤位活動介紹」
      const t = document.createElement('button');
      t.dataset.intro = 'intro-booth';
      t.hidden = true;
      document.body.append(t);
      t.click();
      t.remove();
    }
  });

  dlg.addEventListener('close', () => {
    document.body.classList.remove('welcome-is-open');
    try {
      sessionStorage.setItem(KEY, '1');
    } catch (_) {}
  });

  if (!seen && !/^#intro-/.test(location.hash)) {
    dlg.showModal();
    document.body.classList.add('welcome-is-open');
  }
})();
