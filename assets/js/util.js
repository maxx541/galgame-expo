/* =============================================================================
 * util.js — 全站共用小工具
 * 沒有任何相依，必須最先載入。
 * ========================================================================== */
(function () {
  'use strict';

  const CFG = window.EXPO_CONFIG || {};

  /* ---- DOM 捷徑 ---------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** 建立元素：el('div', { class:'x', dataset:{a:1} }, [child, 'text']) */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function')
        node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  /* ---- 文字處理 ---------------------------------------------------------- */

  /** 正規化搜尋字串：全轉小寫、全形轉半形、去掉空白與常見標點 */
  function normalize(s) {
    return String(s ?? '')
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[\s　·・、,，.。/\-_—「」『』()（）]/g, '');
  }

  /** 把 text 中符合 query 的片段包成 <mark> */
  function highlight(text, query) {
    const t = String(text ?? '');
    if (!query) return document.createTextNode(t);
    const frag = document.createDocumentFragment();
    const idx = t.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return document.createTextNode(t);
    frag.append(t.slice(0, idx));
    frag.append(el('mark', {}, t.slice(idx, idx + query.length)));
    frag.append(t.slice(idx + query.length));
    return frag;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  /** 1536 → '1.5 MB' */
  function fmtBytes(n) {
    if (!n && n !== 0) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
  }

  /** ISO 字串 → '2026.09.18' */
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  /* ---- 節流 / 防抖 ------------------------------------------------------- */
  function debounce(fn, ms = 200) {
    let t;
    return function (...a) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, a), ms);
    };
  }

  function rafThrottle(fn) {
    let queued = false;
    return function (...a) {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn.apply(this, a);
      });
    };
  }

  /* ---- 分類 -------------------------------------------------------------- */
  const CATS = CFG.categories || [];
  const CAT_MAP = new Map(CATS.map((c) => [c.id, c]));

  function category(id) {
    return (
      CAT_MAP.get(id) || { id: id || 'other', label: id || '未分類', ja: '', hue: 300, icon: '✧' }
    );
  }

  /* ---- 密碼雜湊 ---------------------------------------------------------- */
  /** SHA-256 → hex。需要 HTTPS 或 localhost（crypto.subtle 的限制）。 */
  async function sha256(text) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error(
        '此瀏覽器環境沒有 crypto.subtle：請用 https:// 或 http://localhost 開啟本頁。'
      );
    }
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // 方便你在 Console 產生新密碼的雜湊：await expoHashPassword('新密碼')
  window.expoHashPassword = sha256;

  /* ---- localStorage 安全包裝（無痕模式可能會丟例外） ---------------------- */
  const store = {
    get(k, fallback = null) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch {
        return false;
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };

  /* ---- Toast ------------------------------------------------------------- */
  const ICONS = { ok: '✓', err: '✕', info: '✦' };

  function toast(message, kind = 'info', ms = 3600) {
    let stack = $('#toast-stack');
    if (!stack) {
      stack = el('div', { id: 'toast-stack' });
      document.body.append(stack);
    }
    const node = el('div', { class: 'toast', dataset: { kind }, role: 'status' }, [
      el('span', { class: 'toast__icon' }, ICONS[kind] || ICONS.info),
      el('span', {}, message),
    ]);
    stack.append(node);
    const kill = () => {
      node.classList.add('is-out');
      node.addEventListener('animationend', () => node.remove(), { once: true });
    };
    setTimeout(kill, ms);
    node.addEventListener('click', kill);
    return node;
  }

  /* ---- 主題（晝 / 夜） ---------------------------------------------------- */
  const THEME_KEY = 'expo.theme';

  function resolveTheme(pref) {
    if (pref === 'auto') {
      return window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'day'
        : 'night';
    }
    return pref === 'day' ? 'day' : 'night';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    store.set(THEME_KEY, theme);
    document.dispatchEvent(new CustomEvent('expo:theme', { detail: { theme } }));
  }

  function initTheme() {
    const saved = store.get(THEME_KEY, null);
    applyTheme(saved || resolveTheme((CFG.ux && CFG.ux.defaultTheme) || 'night'));
  }

  function toggleTheme() {
    const now = document.documentElement.getAttribute('data-theme');
    applyTheme(now === 'day' ? 'night' : 'day');
    return document.documentElement.getAttribute('data-theme');
  }

  /* ---- 設定完整度檢查 ---------------------------------------------------- */
  function hasSupabase() {
    const s = CFG.supabase || {};
    return Boolean(s.url && s.anonKey);
  }

  function hasCloudinary() {
    const c = CFG.cloudinary || {};
    return Boolean(c.cloudName && c.uploadPreset);
  }

  /* ---- 匯出 -------------------------------------------------------------- */
  window.U = {
    $, $$, el,
    normalize, highlight, escapeHtml, fmtBytes, fmtDate,
    debounce, rafThrottle,
    category, CATS,
    sha256, store, toast,
    initTheme, applyTheme, toggleTheme,
    hasSupabase, hasCloudinary,
    CFG,
  };
})();
