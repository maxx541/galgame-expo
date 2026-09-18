/* =============================================================================
 * cloudinary.js — 圖床：上傳 + CDN 轉檔網址
 * -----------------------------------------------------------------------------
 * 重點是「網址轉換」：同一張原圖，靠改網址就能拿到不同尺寸／格式，
 * 由 Cloudinary 在 CDN 邊緣即時產生並快取。
 *   縮圖  → w_600,f_auto,q_auto  （卡片用，通常 30–80 KB）
 *   大圖  → w_1800,f_auto,q_auto （燈箱用）
 * 這是整站「不卡頓」的關鍵：列表頁永遠不會去載 5 MB 的原圖。
 * ========================================================================== */
(function () {
  'use strict';

  const CFG = (window.EXPO_CONFIG && window.EXPO_CONFIG.cloudinary) || {};

  const isCloudinaryUrl = (url) =>
    typeof url === 'string' && /res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url);

  /**
   * 把 Cloudinary 網址插入轉檔參數。
   * 非 Cloudinary 的網址（例如你手動貼的外部連結、demo 的 data URI）原樣回傳。
   *
   * @param {string} url
   * @param {string} transform 例：'w_600,f_auto,q_auto'
   */
  function tx(url, transform) {
    if (!isCloudinaryUrl(url)) return url;
    // .../image/upload/<既有參數?>/v1234/folder/name.jpg
    return url.replace(/\/image\/upload\//, `/image/upload/${transform}/`);
  }

  /** 卡片縮圖：預設寬 600，2x 螢幕另有 srcset */
  const thumb = (url, w = 600) => tx(url, `w_${w},c_limit,f_auto,q_auto:good,dpr_auto`);

  /** 燈箱大圖 */
  const full = (url, w = 1800) => tx(url, `w_${w},c_limit,f_auto,q_auto:good`);

  /** 後台列表的小方圖 */
  const square = (url, s = 160) => tx(url, `w_${s},h_${s},c_fill,g_auto,f_auto,q_auto`);

  /** 極小的模糊預覽圖（LQIP），可當 background 先墊著 */
  const blurUp = (url) => tx(url, 'w_24,e_blur:400,f_auto,q_auto:low');

  /** 給 <img srcset> 用 */
  function srcset(url, widths = [400, 600, 900, 1200]) {
    if (!isCloudinaryUrl(url)) return null;
    return widths.map((w) => `${thumb(url, w)} ${w}w`).join(', ');
  }

  /* ==========================================================================
   * 上傳（unsigned）
   * ========================================================================
   * 用 XHR 而不是 fetch，因為只有 XHR 拿得到上傳進度（fetch 沒有 upload 事件）。
   */
  function upload(file, { folder, onProgress, signal } = {}) {
    return new Promise((resolve, reject) => {
      if (!CFG.cloudName || !CFG.uploadPreset) {
        reject(new Error('圖片上傳功能尚未啟用，請聯絡網站管理員。'));
        return;
      }

      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', CFG.uploadPreset);
      const dir = folder ?? CFG.folder;
      if (dir) form.append('folder', dir);

      const xhr = new XMLHttpRequest();
      xhr.open(
        'POST',
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(CFG.cloudName)}/image/upload`
      );

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      });

      xhr.addEventListener('load', () => {
        let data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error('Cloudinary 回傳格式無法解析。'));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            url: data.secure_url,
            publicId: data.public_id,
            width: data.width,
            height: data.height,
            bytes: data.bytes,
            format: data.format,
          });
        } else {
          const msg = (data && data.error && data.error.message) || `HTTP ${xhr.status}`;
          reject(new Error(`Cloudinary 上傳失敗：${msg}`));
        }
      });

      xhr.addEventListener('error', () =>
        reject(new Error('Cloudinary 上傳失敗：網路錯誤。'))
      );
      xhr.addEventListener('abort', () => reject(new DOMException('已取消', 'AbortError')));

      if (signal) {
        if (signal.aborted) {
          xhr.abort();
          return;
        }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }

      xhr.send(form);
    });
  }

  window.CLOUD = { tx, thumb, full, square, blurUp, srcset, upload, isCloudinaryUrl };
})();
