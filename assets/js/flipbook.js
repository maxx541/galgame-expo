/* =============================================================================
 * flipbook.js — 會刊翻頁閱讀器
 * -----------------------------------------------------------------------------
 * 翻頁動畫（拖曳頁角、點擊翻頁、頁面捲曲與陰影）用 StPageFlip（MIT，放在 vendor/）。
 * 這裡負責閱讀器外框：頁碼滑桿、縮圖、放大平移、自動翻頁、翻頁聲音、全螢幕，
 * 以及分享用的 QR code（qrcode-generator，MIT，放在 vendor/）。
 * 頁面清單在 zine-data.js（tools/build_zine.py 產生）。
 * ========================================================================== */
(function () {
  'use strict';

  const Z = window.ZINE;
  const St = window.St;
  const { $, el } = window.U;
  const root = $('#flipbook');
  const bookEl = $('#fb-book');
  if (!Z || !St || !root || !bookEl) return;

  const pages = Z.pages;
  const N = pages.length;
  const LAST = N - 1; // 最後一張是封底
  const RATIO = Z.w / Z.h; // 單頁 寬 / 高
  root.style.setProperty('--fb-ratio', String(RATIO));
  const MAX_PAGE_W = Z.w;
  const AUTO_MS = 3200;
  const ZOOMS = [1, 1.5, 2, 3];

  const stage = $('#fb-stage');
  const shift = $('#fb-shift');
  const range = $('#fb-range');
  const prevBtn = $('#fb-prev');
  const nextBtn = $('#fb-next');

  const state = { zoom: 1, soundOn: true, playing: false, timer: 0, thumbsBuilt: false };

  try {
    state.soundOn = localStorage.getItem('expo.zine.sound') !== '0';
  } catch (_) {}

  /* ---- 起始頁（支援從 QR code 的連結直接開到某一頁） ---------------------- */
  let startPage = 0;
  const m = /#zine-p(\d+)/.exec(location.hash);
  if (m) {
    startPage = Math.max(0, Math.min(LAST, Number(m[1]) - 1));
  }

  /* ---- 翻頁引擎 ------------------------------------------------------------ */
  const flip = new St.PageFlip(bookEl, {
    width: Z.w,
    height: Z.h,
    size: 'stretch',
    minWidth: 300,
    maxWidth: MAX_PAGE_W,
    minHeight: 300,
    maxHeight: Math.round(Z.h * 1.2),
    showCover: true,
    maxShadowOpacity: 0.55,
    flippingTime: 850,
    usePortrait: true,
    startPage,
    mobileScrollSupport: true,
    swipeDistance: 28,
    showPageCorners: true,
    startZIndex: 0,
  });
  flip.loadFromImages(pages);

  /* ---- 幾何：目前一頁有多寬（用來置中封面、算放大尺寸） ------------------- */
  const portrait = () => flip.getOrientation() === 'portrait';

  function pageSize() {
    const aw = stage.clientWidth;
    const ah = stage.clientHeight;
    const pw = Math.min(portrait() ? aw : aw / 2, MAX_PAGE_W, ah * RATIO);
    return { pw, ph: pw / RATIO };
  }

  /* ---- 目前看到哪幾頁 ------------------------------------------------------ */
  function spreadOf(idx) {
    if (portrait()) return [idx];
    if (idx <= 0) return [0];
    if (idx >= LAST) return [LAST];
    const l = idx % 2 === 1 ? idx : idx - 1;
    return l + 1 <= LAST - 1 ? [l, l + 1] : [l];
  }

  const visible = () => spreadOf(flip.getCurrentPageIndex());

  function nextTarget(idx) {
    if (portrait()) return Math.min(LAST, idx + 1);
    const v = spreadOf(idx);
    const end = v[v.length - 1];
    if (end >= LAST) return v[0];
    return end + 1;
  }

  function prevTarget(idx) {
    if (portrait()) return Math.max(0, idx - 1);
    const v = spreadOf(idx);
    return v[0] <= 0 ? 0 : spreadOf(v[0] - 1)[0];
  }

  function labelOf(v) {
    if (v[0] === 0) return '封面';
    if (v[0] === LAST) return '封底';
    return v.length === 2 ? `${v[0] + 1}–${v[1] + 1}` : `${v[0] + 1}`;
  }

  /* ---- 封面／封底置中（書合起來時只有一頁，不要偏在一邊） ------------------ */
  function applyShift(targetIdx) {
    let x = 0;
    if (!portrait() && state.zoom === 1) {
      const { pw } = pageSize();
      const v = spreadOf(targetIdx);
      if (v.length === 1 && v[0] === 0) x = -pw / 2;
      else if (v.length === 1 && v[0] === LAST) x = pw / 2;
    }
    shift.style.transform = x ? `translateX(${x}px)` : '';
  }

  /* ---- 介面同步 ------------------------------------------------------------ */
  function sync() {
    const v = visible();
    range.value = String(v[0]);
    $('#fb-page').textContent = `${labelOf(v)}　/　${N}`;
    prevBtn.disabled = v[0] === 0;
    nextBtn.disabled = v[v.length - 1] === LAST;
    $('#fb-first').disabled = v[0] === 0;
    $('#fb-last').disabled = v[v.length - 1] === LAST;
    if (state.thumbsBuilt) markThumbs(v);
    applyShift(v[0]);
    if (state.zoom > 1) renderZoom();
  }

  flip.on('init', () => {
    $('#fb-loading').hidden = true;
    sync();
    // 從 QR code 連結進來時，等版面穩定後再捲到會刊區
    if (m) setTimeout(() => document.getElementById('zine').scrollIntoView(), 250);
  });
  flip.on('flip', sync);
  flip.on('changeOrientation', () => {
    sync();
    if (state.zoom > 1) setZoom(1);
  });
  flip.on('changeState', (e) => {
    if (e.data !== 'flipping') return;
    swish();
    // 翻頁一開始就讓書滑向置中位置，和頁面轉動同步
    try {
      const fp = flip.getFlipController().flippingPage;
      const idx = flip.getCurrentPageIndex();
      const dir = fp && typeof fp.getDirection === 'function' ? fp.getDirection() : 0;
      applyShift(dir === 0 ? nextTarget(idx) : prevTarget(idx));
    } catch (_) {}
  });

  /* ---- 導覽 ---------------------------------------------------------------- */
  function jump(target, animated) {
    target = Math.max(0, Math.min(LAST, target));
    if (state.zoom > 1 || !animated) {
      flip.turnToPage(target);
      sync();
    } else {
      flip.flip(target);
    }
  }

  function next() {
    const idx = flip.getCurrentPageIndex();
    if (state.zoom > 1) jump(nextTarget(idx), false);
    else flip.flipNext();
  }

  function prev() {
    const idx = flip.getCurrentPageIndex();
    if (state.zoom > 1) jump(prevTarget(idx), false);
    else flip.flipPrev();
  }

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  $('#fb-first').addEventListener('click', () => jump(0, true));
  $('#fb-last').addEventListener('click', () => jump(LAST, true));
  range.addEventListener('input', () => jump(Number(range.value), false));

  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === '+' || e.key === '=') {
      stepZoom(1);
    } else if (e.key === '-') {
      stepZoom(-1);
    } else if (e.key === 'Escape') {
      if (!$('#fb-share').hidden) closeShare();
      else if (!$('#fb-thumbs').hidden) toggleThumbs(false);
      else if (state.zoom > 1) setZoom(1);
    }
  });

  /* ---- 縮圖 ---------------------------------------------------------------- */
  const thumbs = $('#fb-thumbs');

  function markThumbs(v) {
    Array.from($('#fb-thumbs-grid').children).forEach((b, i) => {
      b.classList.toggle('is-current', v.includes(i));
    });
  }

  function toggleThumbs(open) {
    const show = open === undefined ? thumbs.hidden : open;
    thumbs.hidden = !show;
    $('#fb-btn-thumbs').classList.toggle('is-active', show);
    if (show && !state.thumbsBuilt) {
      const grid = $('#fb-thumbs-grid');
      pages.forEach((src, i) => {
        grid.append(
          el(
            'button',
            {
              class: 'fb__thumb',
              type: 'button',
              'aria-label': i === 0 ? '封面' : i === LAST ? '封底' : `第 ${i + 1} 頁`,
              onclick: () => {
                if (stage.clientWidth < 700) toggleThumbs(false);
                jump(i, true);
              },
            },
            [
              el('img', { src, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }),
              el('span', {}, [i === 0 ? '封面' : i === LAST ? '封底' : String(i + 1)]),
            ]
          )
        );
      });
      state.thumbsBuilt = true;
      markThumbs(visible());
    }
  }

  $('#fb-btn-thumbs').addEventListener('click', () => toggleThumbs());
  $('#fb-thumbs-close').addEventListener('click', () => toggleThumbs(false));

  /* ---- 放大：用原圖解析度顯示目前這頁／跨頁，可拖曳平移 ------------------- */
  const zoomLayer = $('#fb-zoomlayer');
  const zoomCanvas = $('#fb-zoomcanvas');
  const pan = { x: 0, y: 0, drag: null };

  function clampPan() {
    const cw = zoomCanvas.offsetWidth;
    const ch = zoomCanvas.offsetHeight;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    pan.x = cw <= sw ? (sw - cw) / 2 : Math.max(sw - cw, Math.min(0, pan.x));
    pan.y = ch <= sh ? (sh - ch) / 2 : Math.max(sh - ch, Math.min(0, pan.y));
  }

  function paintPan() {
    clampPan();
    zoomCanvas.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
  }

  function renderZoom() {
    const v = visible();
    const { pw, ph } = pageSize();
    zoomCanvas.textContent = '';
    zoomCanvas.style.height = `${ph * state.zoom}px`;
    v.forEach((i) => zoomCanvas.append(el('img', { src: pages[i], alt: labelOf([i]), draggable: 'false' })));
    // 沒載入完之前先用預期寬度撐開，平移範圍才算得準
    zoomCanvas.style.width = `${pw * state.zoom * v.length}px`;
    Array.from(zoomCanvas.children).forEach((img) => (img.style.width = `${pw * state.zoom}px`));
    pan.x = (stage.clientWidth - pw * state.zoom * v.length) / 2;
    pan.y = (stage.clientHeight - ph * state.zoom) / 2;
    paintPan();
  }

  function setZoom(z) {
    state.zoom = z;
    $('#fb-zoomval').textContent = `${Math.round(z * 100)}%`;
    $('#fb-zout').disabled = z <= ZOOMS[0];
    $('#fb-zin').disabled = z >= ZOOMS[ZOOMS.length - 1];
    zoomLayer.hidden = z === 1;
    shift.style.visibility = z === 1 ? '' : 'hidden';
    if (z > 1) {
      stopAuto();
      renderZoom();
    } else {
      applyShift(visible()[0]);
    }
  }

  function stepZoom(dir) {
    const i = ZOOMS.indexOf(state.zoom);
    const j = Math.max(0, Math.min(ZOOMS.length - 1, i + dir));
    if (j !== i) setZoom(ZOOMS[j]);
  }

  $('#fb-zin').addEventListener('click', () => stepZoom(1));
  $('#fb-zout').addEventListener('click', () => stepZoom(-1));

  zoomLayer.addEventListener('pointerdown', (e) => {
    pan.drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    zoomLayer.classList.add('is-panning');
    zoomLayer.setPointerCapture(e.pointerId);
  });
  zoomLayer.addEventListener('pointermove', (e) => {
    if (!pan.drag) return;
    pan.x = pan.drag.px + (e.clientX - pan.drag.x);
    pan.y = pan.drag.py + (e.clientY - pan.drag.y);
    paintPan();
  });
  const endPan = () => {
    pan.drag = null;
    zoomLayer.classList.remove('is-panning');
  };
  zoomLayer.addEventListener('pointerup', endPan);
  zoomLayer.addEventListener('pointercancel', endPan);
  zoomLayer.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1);
    },
    { passive: false }
  );
  zoomLayer.addEventListener('dblclick', () => setZoom(1));

  /* ---- 自動翻頁 ------------------------------------------------------------ */
  const playBtn = $('#fb-play');

  function stopAuto() {
    clearInterval(state.timer);
    state.timer = 0;
    state.playing = false;
    playBtn.setAttribute('aria-pressed', 'false');
  }

  function startAuto() {
    if (state.zoom > 1) setZoom(1);
    state.playing = true;
    playBtn.setAttribute('aria-pressed', 'true');
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (document.hidden) return;
      const v = visible();
      if (v[v.length - 1] >= LAST) {
        stopAuto();
        return;
      }
      flip.flipNext();
    }, AUTO_MS);
    // 按下去就立刻翻一頁，比較有回應
    const v = visible();
    if (v[v.length - 1] < LAST) flip.flipNext();
  }

  playBtn.addEventListener('click', () => (state.playing ? stopAuto() : startAuto()));

  /* ---- 翻頁聲音（用 Web Audio 合成，不需要音檔） --------------------------- */
  const soundBtn = $('#fb-sound');
  let actx = null;

  function paintSound() {
    soundBtn.setAttribute('aria-pressed', String(state.soundOn));
  }

  soundBtn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    try {
      localStorage.setItem('expo.zine.sound', state.soundOn ? '1' : '0');
    } catch (_) {}
    paintSound();
  });
  paintSound();

  function swish() {
    if (!state.soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const dur = 0.3;
      const sr = actx.sampleRate;
      const buf = actx.createBuffer(1, Math.floor(sr * dur), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.8) * Math.min(1, t * 14);
      }
      const src = actx.createBufferSource();
      src.buffer = buf;
      const f = actx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.7;
      const now = actx.currentTime;
      f.frequency.setValueAtTime(900, now);
      f.frequency.exponentialRampToValueAtTime(3400, now + dur);
      const g = actx.createGain();
      g.gain.value = 0.2;
      src.connect(f);
      f.connect(g);
      g.connect(actx.destination);
      src.start();
    } catch (_) {}
  }

  /* ---- 全螢幕 -------------------------------------------------------------- */
  const fullBtn = $('#fb-full');
  if (!document.fullscreenEnabled) {
    fullBtn.hidden = true;
  } else {
    fullBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else root.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      // 全螢幕切換後舞台尺寸變了，讓翻頁引擎重算
      setTimeout(() => {
        try {
          flip.update();
        } catch (_) {}
        if (state.zoom > 1) setZoom(1);
        sync();
      }, 120);
    });
  }

  /* ---- 分享／QR code ------------------------------------------------------- */
  const share = $('#fb-share');

  function shareUrl() {
    const base = ((window.EXPO_CONFIG && window.EXPO_CONFIG.site && window.EXPO_CONFIG.site.url) || '')
      .replace(/#.*$/, '')
      || location.href.replace(/[#?].*$/, '');
    return `${base}#zine-p${visible()[0] + 1}`;
  }

  function openShare() {
    const url = shareUrl();
    $('#fb-share-url').value = url;
    const box = $('#fb-qr');
    box.textContent = '';
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (_) {
      box.textContent = '無法產生 QR code';
    }
    const local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === 'file:';
    $('#fb-share-warn').hidden = !local;
    share.hidden = false;
    $('#fb-share-close').focus();
  }

  function closeShare() {
    share.hidden = true;
    $('#fb-btn-share').focus();
  }

  $('#fb-btn-share').addEventListener('click', openShare);
  $('#fb-share-close').addEventListener('click', closeShare);
  share.addEventListener('click', (e) => {
    if (e.target === share) closeShare();
  });
  $('#fb-copy').addEventListener('click', async () => {
    const input = $('#fb-share-url');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (_) {
      input.select();
      document.execCommand('copy');
    }
    const b = $('#fb-copy');
    b.textContent = '已複製';
    setTimeout(() => (b.textContent = '複製連結'), 1600);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !share.hidden) closeShare();
  });

  /* ---- 尺寸改變 ------------------------------------------------------------ */
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyShift(visible()[0]);
      if (state.zoom > 1) renderZoom();
    }, 150);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.playing) stopAuto();
  });

  setZoom(1);
})();
