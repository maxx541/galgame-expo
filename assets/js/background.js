/* =============================================================================
 * background.js — v2：每次進站隨機換一張背景圖 + 玻璃遮罩
 * -----------------------------------------------------------------------------
 * 目前實作的是 docs/ROADMAP-v2.md 的「方案 1」：
 *   直接從展品照片裡隨機挑一張，不需要另外上傳、不需要改資料庫。
 *
 * 想換成專屬的背景圖庫（方案 2），把 config.js 的 ux.randomBackground
 * 改成 'library'，並把圖片網址列在 ux.backgroundLibrary 陣列裡即可，
 * 下面的 pickFromLibrary() 已經寫好了。
 *
 * 三個刻意的設計決定：
 *   1. 手機直接不啟用 —— backdrop-filter 在中低階 Android 上會讓捲動變頓，
 *      而手機螢幕小、背景本來就幾乎被內容蓋住，關掉幾乎沒有視覺損失。
 *   2. 模糊交給 Cloudinary 在伺服器端做（e_blur），不是瀏覽器的 CSS filter。
 *      對一張全螢幕的圖來說，這個差別在低階機上非常有感。
 *   3. 等展品的第一批圖載完才開始載背景。背景是裝飾，不能跟主角搶頻寬。
 * ========================================================================== */
(function () {
  'use strict';

  const CFG = (window.U && window.U.CFG) || {};
  const UX = CFG.ux || {};
  const MODE = UX.randomBackground || 'off'; // 'exhibits' | 'library' | 'off'

  if (MODE === 'off') return;

  // 使用者開了系統的「減少動態」→ 不做這種純裝飾的效果
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // 手機不啟用（理由見檔案開頭）
  if (window.matchMedia('(max-width: 760px)').matches) return;

  const slot = document.getElementById('bg-photo');
  if (!slot) return;

  /* ---- 挑一張圖 ---------------------------------------------------------- */

  async function pickFromExhibits() {
    await window.STORE.ready();
    // 只看最新的 60 件就夠了，不需要把整個展覽拉下來
    const { items } = await window.STORE.list({
      category: 'all',
      search: '',
      sort: 'new',
      from: 0,
      to: 59,
    });
    if (!items.length) return null;
    return items[Math.floor(Math.random() * items.length)].imageUrl;
  }

  function pickFromLibrary() {
    const lib = UX.backgroundLibrary || [];
    if (!lib.length) return null;
    return lib[Math.floor(Math.random() * lib.length)];
  }

  /* ---- 轉成適合當背景的網址 ----------------------------------------------
   * 反正要模糊，解析度給 900 就綽綽有餘，還能省下大量流量。
   * e_blur:800 讓 Cloudinary 在伺服器端就把圖模糊好，送過來的已經是成品。
   *
   * ⚠️ 只接受「已經模糊好」的圖，這是實測後的硬性規定：
   *    對一張全螢幕的圖套用 CSS blur(20px)，再疊上 .bg-glass 的 backdrop-filter，
   *    瀏覽器每次重繪都要重新光柵化並模糊整個畫面。實測會讓分頁直接卡死十幾秒。
   *    背景只是裝飾，絕對不值得用「整站卡頓」去換。
   *    所以拿不到 Cloudinary 網址時（例如 demo 的 SVG、或你手貼的外部連結），
   *    就乾脆不顯示背景。
   * -------------------------------------------------------------------- */
  function toBackgroundUrl(url) {
    const out = window.CLOUD.tx(url, 'w_900,e_blur:800,f_auto,q_auto:eco');
    if (out === url) return null; // 不是 Cloudinary 的圖 → 放棄
    return { url: out, preBlurred: true };
  }

  /* ---- 套用 -------------------------------------------------------------- */
  function apply(src, preBlurred) {
    const img = new Image();
    img.decoding = 'async';

    img.onload = () => {
      slot.style.backgroundImage = `url("${src}")`;
      // 用 class 而不是 inline style：
      // 這樣日 / 夜兩套主題各自的處理方式都還能在 CSS 裡覆寫。
      // 寫成 inline 的話會蓋掉主題樣式，日間模式就會變成一塊灰泥。
      slot.classList.toggle('is-preblurred', preBlurred);
      document.body.classList.add('has-bg-photo');
    };

    // 背景載不出來就當作沒這回事，絕對不要影響展覽本身
    img.onerror = () => {};

    img.src = src;
  }

  /* ---- 啟動 --------------------------------------------------------------
   * 等 load 事件：這時第一批展品圖已經載完，頻寬讓出來了才輪到背景。
   * -------------------------------------------------------------------- */
  function start() {
    // 再退一步，等瀏覽器空閒
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));

    idle(async () => {
      try {
        const raw = MODE === 'library' ? pickFromLibrary() : await pickFromExhibits();
        if (!raw) return;
        const bg = toBackgroundUrl(raw);
        if (!bg) return; // 不是可以在伺服器端模糊的圖，直接放棄（理由見上）
        apply(bg.url, bg.preBlurred);
      } catch {
        // 背景是純裝飾，失敗就安靜略過
      }
    });
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
