/* =============================================================================
 * placeholder.js — 佔位圖產生器
 * -----------------------------------------------------------------------------
 * 在你還沒接上 Cloudinary / 還沒放自己的圖之前，
 * 這支程式會即時畫出「像那麼一回事」的 SVG 佔位圖，確保：
 *   1. 版面一開就是完整的，不會滿頁破圖
 *   2. 完全離線可用（不依賴 picsum / placeholder.com 等外部服務）
 *   3. 每張圖依 seed 產生固定的顏色與構圖，重新整理不會亂跳
 *
 * ⚠️ 全部都是暫時素材。要換成正式圖片時請看 docs/ASSETS.md。
 * ========================================================================== */
(function () {
  'use strict';

  /* ---- 小型確定性亂數（同一個 seed 永遠得到同一張圖） -------------------- */
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    let s = hashSeed(String(seed)) || 1;
    return function () {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }

  const svgUri = (svg) =>
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.trim());

  /* ==========================================================================
   * 1) 展品佔位圖
   *    用漸層背景 + 幾何色塊 + 分類文字，模擬一張「有內容」的週邊照片。
   * ======================================================================== */
  function exhibit({ seed = 'x', w = 800, h = 1000, hue = 330, label = '', sub = '' } = {}) {
    const r = rng(seed);
    const h1 = (hue + r() * 40 - 20 + 360) % 360;
    const h2 = (h1 + 40 + r() * 60) % 360;
    const dark = 14 + r() * 8;

    // 隨機幾個半透明幾何形，模擬立繪／印刷構圖
    let shapes = '';
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const cx = 12 + r() * 76;
      const cy = 14 + r() * 72;
      const rad = 10 + r() * 26;
      const hh = (h1 + r() * 90) % 360;
      const op = (0.14 + r() * 0.22).toFixed(2);
      shapes +=
        r() > 0.45
          ? `<circle cx="${cx}%" cy="${cy}%" r="${rad}%" fill="hsl(${hh} 82% 68%)" opacity="${op}"/>`
          : `<rect x="${cx - rad / 2}%" y="${cy - rad / 2}%" width="${rad}%" height="${rad * 1.3}%" rx="${rad / 5}%" fill="hsl(${hh} 78% 64%)" opacity="${op}" transform="rotate(${(r() * 30 - 15).toFixed(1)} ${w / 2} ${h / 2})"/>`;
    }

    // 一個簡化的「人物剪影」，讓它看起來像 galgame 週邊而不是純色塊
    const fx = 50 + (r() * 16 - 8);
    const silhouette = `
      <g opacity="0.34" transform="translate(${(fx / 100) * w} ${h * 0.62})">
        <ellipse cx="0" cy="${-h * 0.2}" rx="${w * 0.1}" ry="${w * 0.115}" fill="hsl(${h2} 60% 88%)"/>
        <path d="M ${-w * 0.16} ${h * 0.3} Q ${-w * 0.15} ${-h * 0.06} 0 ${-h * 0.08}
                 Q ${w * 0.15} ${-h * 0.06} ${w * 0.16} ${h * 0.3} Z"
              fill="hsl(${h2} 62% 84%)"/>
        <path d="M ${-w * 0.135} ${-h * 0.17} Q 0 ${-h * 0.31} ${w * 0.135} ${-h * 0.17}
                 Q ${w * 0.1} ${-h * 0.24} 0 ${-h * 0.235}
                 Q ${-w * 0.1} ${-h * 0.24} ${-w * 0.135} ${-h * 0.17} Z"
              fill="hsl(${h1} 66% 72%)"/>
      </g>`;

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)} 佔位圖">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${h1} 46% ${dark + 10}%)"/>
      <stop offset="52%" stop-color="hsl(${h2} 40% ${dark}%)"/>
      <stop offset="100%" stop-color="hsl(${(h2 + 30) % 360} 52% ${dark + 16}%)"/>
    </linearGradient>
    <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="hsl(${h1} 30% 6%)" stop-opacity="0"/>
      <stop offset="100%" stop-color="hsl(${h1} 30% 5%)" stop-opacity="0.82"/>
    </linearGradient>
    <pattern id="p" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <line x1="0" y1="0" x2="0" y2="26" stroke="hsl(${h1} 90% 88%)" stroke-opacity="0.05" stroke-width="7"/>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${shapes}
  ${silhouette}
  <rect width="${w}" height="${h}" fill="url(#p)"/>
  <rect width="${w}" height="${h}" fill="url(#v)"/>
  <g font-family="'Shippori Mincho','Noto Serif TC',serif" text-anchor="middle">
    <text x="50%" y="${h * 0.47}" font-size="${Math.round(w * 0.075)}" fill="hsl(${h1} 88% 90%)" opacity="0.5" letter-spacing="${w * 0.02}">${esc(label)}</text>
    <text x="50%" y="${h * 0.53}" font-size="${Math.round(w * 0.028)}" fill="hsl(${h1} 70% 88%)" opacity="0.4" letter-spacing="${w * 0.012}">${esc(sub)}</text>
    <text x="50%" y="${h - w * 0.045}" font-size="${Math.round(w * 0.024)}" fill="#fff" opacity="0.28" letter-spacing="${w * 0.01}">PLACEHOLDER</text>
  </g>
</svg>`;
    return svgUri(svg);
  }

  /* ==========================================================================
   * 2) Logo（站徽）—— 櫻花 + 展覽框
   * ======================================================================== */
  function logo(size = 64) {
    const petal = (deg) =>
      `<path d="M32 12 C 27 19, 27 26, 32 31 C 37 26, 37 19, 32 12 Z"
             fill="url(#lg)" transform="rotate(${deg} 32 32)"/>`;
    return svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Logo">
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffc9de"/>
      <stop offset="55%" stop-color="#ff9ec4"/>
      <stop offset="100%" stop-color="#a98bff"/>
    </linearGradient>
  </defs>
  <rect x="3" y="3" width="58" height="58" rx="15" fill="none" stroke="url(#lg)" stroke-width="1.4" opacity="0.55"/>
  ${[0, 72, 144, 216, 288].map(petal).join('')}
  <circle cx="32" cy="32" r="3.4" fill="#fff" opacity="0.92"/>
</svg>`);
  }

  /* ==========================================================================
   * 3) 立繪佔位（ADV 風格的招牌角色）
   *    只是剪影，不是正式立繪 —— 早上換成你自己的 PNG 就好。
   * ======================================================================== */
  function figure(w = 520, h = 900) {
    return svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 520 900" role="img" aria-label="立繪佔位圖">
  <defs>
    <linearGradient id="fg" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#ffd4e6" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="#ff9ec4" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#a98bff" stop-opacity="0.55"/>
    </linearGradient>
    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffb9d6"/>
      <stop offset="100%" stop-color="#c79bff" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0.55" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="m"><rect width="520" height="900" fill="url(#fade)"/></mask>
  </defs>
  <g mask="url(#m)">
    <!-- 身體 -->
    <path d="M150 900 Q 140 470 260 440 Q 380 470 370 900 Z" fill="url(#fg)"/>
    <!-- 衣領 -->
    <path d="M225 452 L260 505 L295 452 Q 260 468 225 452 Z" fill="#fff" opacity="0.62"/>
    <path d="M251 500 L269 500 L266 560 L254 560 Z" fill="#ff8fb8" opacity="0.8"/>
    <!-- 頭 -->
    <ellipse cx="260" cy="330" rx="86" ry="96" fill="#ffe4ef"/>
    <!-- 頭髮 -->
    <path d="M168 336 Q 160 200 260 196 Q 360 200 352 336
             Q 344 268 316 250 Q 288 286 260 272 Q 226 292 204 250
             Q 176 270 168 336 Z" fill="url(#hg)"/>
    <path d="M176 330 Q 168 430 196 486 L 214 470 Q 190 410 194 336 Z" fill="url(#hg)" opacity="0.88"/>
    <path d="M344 330 Q 352 430 324 486 L 306 470 Q 330 410 326 336 Z" fill="url(#hg)" opacity="0.88"/>
    <!-- 眼 -->
    <ellipse cx="228" cy="344" rx="11" ry="15" fill="#6b4a86" opacity="0.72"/>
    <ellipse cx="292" cy="344" rx="11" ry="15" fill="#6b4a86" opacity="0.72"/>
    <circle cx="231" cy="339" r="4" fill="#fff" opacity="0.9"/>
    <circle cx="295" cy="339" r="4" fill="#fff" opacity="0.9"/>
    <!-- 腮紅 -->
    <ellipse cx="206" cy="368" rx="16" ry="8" fill="#ff8fb8" opacity="0.4"/>
    <ellipse cx="314" cy="368" rx="16" ry="8" fill="#ff8fb8" opacity="0.4"/>
    <!-- 嘴 -->
    <path d="M252 378 Q 260 386 268 378" stroke="#a3628a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <!-- 髮飾 -->
    <circle cx="336" cy="252" r="17" fill="#fff" opacity="0.66"/>
    <circle cx="336" cy="252" r="8" fill="#ff9ec4"/>
  </g>
</svg>`);
  }

  /* ==========================================================================
   * 4) Q 版分類圖示（每個分類一顆小圓章）
   * ======================================================================== */
  function chibi(hue = 330, glyph = '✦', size = 96) {
    return svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96" role="img" aria-label="分類圖示">
  <defs>
    <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 90% 78%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 46) % 360} 76% 62%)"/>
    </linearGradient>
  </defs>
  <circle cx="48" cy="48" r="42" fill="url(#cg)" opacity="0.2"/>
  <circle cx="48" cy="48" r="42" fill="none" stroke="url(#cg)" stroke-width="1.6" stroke-dasharray="4 5" opacity="0.75"/>
  <text x="48" y="60" font-size="34" text-anchor="middle" fill="hsl(${hue} 88% 76%)" font-family="serif">${esc(glyph)}</text>
</svg>`);
  }

  /* ==========================================================================
   * 5) 空狀態的小圖（找不到東西時）
   * ======================================================================== */
  function emptyMark(size = 96) {
    return svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96" role="img" aria-label="">
  <defs>
    <linearGradient id="eg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff9ec4"/><stop offset="100%" stop-color="#a98bff"/>
    </linearGradient>
  </defs>
  <circle cx="42" cy="42" r="26" fill="none" stroke="url(#eg)" stroke-width="3" opacity="0.7"/>
  <line x1="61" y1="61" x2="80" y2="80" stroke="url(#eg)" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
  <path d="M33 38 q 4 -6 8 0" stroke="url(#eg)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M43 38 q 4 -6 8 0" stroke="url(#eg)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M36 52 q 6 -5 12 0" stroke="url(#eg)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
</svg>`);
  }

  /* ==========================================================================
   * 6) 鎖頭（後台登入用）
   * ======================================================================== */
  function lockMark(size = 64) {
    return svgUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="">
  <path d="M20 28 v-7 a12 12 0 0 1 24 0 v7" fill="none" stroke="#ff9ec4" stroke-width="3.4" stroke-linecap="round"/>
  <rect x="13" y="28" width="38" height="28" rx="8" fill="none" stroke="#ff9ec4" stroke-width="3.4"/>
  <circle cx="32" cy="41" r="3.6" fill="#ff9ec4"/>
  <line x1="32" y1="43" x2="32" y2="49" stroke="#ff9ec4" stroke-width="3.4" stroke-linecap="round"/>
</svg>`);
  }

  function esc(s) {
    return String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  window.PH = { exhibit, logo, figure, chibi, emptyMark, lockMark };
})();
