/* =============================================================================
 * club.js — 「關於 Galgame 同好會」彈出面板：活動相簿輪播、Facebook 粉專
 * -----------------------------------------------------------------------------
 * 面板本身是 index.html 底部的 <dialog id="intro-club">，由 intro.js 開關。
 * 面板第一次打開時才初始化（那時候版面才量得到寬度），之後每次打開／關閉
 * 只負責讓自動播放跟著暫停或繼續。
 * 相簿資料在 events-data.js（由 tools/build_photos.py 產生）。
 * 輪播用原生的 scroll-snap，所以手機的滑動、觸控板的橫向捲動都是瀏覽器自己
 * 處理的；這裡只補上：箭頭／鍵盤／滑鼠拖曳、自動播放、同步計數與圓點。
 * ========================================================================== */
(function () {
  'use strict';

  const dlg = document.getElementById('intro-club');
  if (!dlg || !window.U) return;

  const { $, el, rafThrottle } = window.U;
  const AUTO_MS = 5000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 相簿輪播 ----------------------------------------------------------- */
  function bindAlbum() {
    const albums = window.EVENT_ALBUMS || [];
    const root = $('#carousel');
    const track = $('#carousel-track');
    const tabsBox = $('#album-tabs');
    if (!albums.length || !root || !track || !tabsBox) return;

    const dotsBox = $('#car-dots');
    const playBtn = $('#car-play');
    const playText = playBtn.querySelector('.carousel__play-text');

    const state = {
      album: 0,
      index: 0,
      userPaused: reduceMotion, // 使用者按了暫停（或系統要求減少動態）就不再自動播
      hovering: false,
      resizing: false,
      visible: true,
      timer: 0,
    };

    const cur = () => albums[state.album];
    const slideCount = () => cur().photos.length;

    /* 分頁籤 */
    albums.forEach((a, i) => {
      const btn = el(
        'button',
        {
          class: 'album-tab',
          type: 'button',
          role: 'tab',
          'aria-selected': 'false',
          dataset: { i },
          onclick: () => {
            loadAlbum(i);
            restartTimer();
          },
        },
        [a.title, el('small', {}, [`${a.photos.length}`])]
      );
      tabsBox.append(btn);
    });

    /* 換相簿：重建投影片與圓點 */
    function loadAlbum(ai) {
      state.album = ai;
      state.index = 0;
      const a = cur();

      track.textContent = '';
      a.photos.forEach((p, i) => {
        track.append(
          el('div', { class: 'carousel__slide', role: 'group', 'aria-roledescription': '投影片',
                      'aria-label': `${a.title}，第 ${i + 1} 張，共 ${a.photos.length} 張` }, [
            el('img', {
              src: p.src,
              width: p.w,
              height: p.h,
              alt: `${a.title}　照片 ${i + 1}`,
              draggable: 'false',
              loading: i < 2 ? 'eager' : 'lazy',
              decoding: 'async',
            }),
          ])
        );
      });
      track.scrollLeft = 0;

      dotsBox.textContent = '';
      a.photos.forEach((_, i) => {
        dotsBox.append(
          el('button', {
            class: 'carousel__dot',
            type: 'button',
            'aria-label': `跳到第 ${i + 1} 張`,
            onclick: () => {
              go(i);
              restartTimer();
            },
          })
        );
      });

      Array.from(tabsBox.children).forEach((b, i) => {
        const on = i === ai;
        b.setAttribute('aria-selected', String(on));
        if (on) {
          // 只捲動分頁籤那一條，不要把整個頁面也拉著跑
          const box = tabsBox.getBoundingClientRect();
          const r = b.getBoundingClientRect();
          tabsBox.scrollTo({
            left: tabsBox.scrollLeft + (r.left - box.left) - (box.width - r.width) / 2,
            behavior: reduceMotion ? 'auto' : 'smooth',
          });
        }
      });

      paint();
    }

    /* 更新說明、計數、圓點 */
    function paint() {
      const a = cur();
      $('#car-title').textContent = a.title;
      $('#car-date').textContent = a.date || '';
      $('#car-count').textContent = `${state.index + 1} / ${a.photos.length}`;
      Array.from(dotsBox.children).forEach((d, i) => {
        if (i === state.index) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
    }

    function go(i, smooth = true) {
      const w = track.clientWidth;
      track.scrollTo({ left: i * w, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    }

    // 手動：在同一本相簿內循環
    function step(dir) {
      const n = slideCount();
      go((state.index + dir + n) % n);
    }

    // 自動：播到最後一張就換下一本相簿，整個播完回到第一本
    function autoAdvance() {
      if (state.index < slideCount() - 1) {
        go(state.index + 1);
      } else {
        loadAlbum((state.album + 1) % albums.length);
      }
    }

    /* 捲動時同步目前是第幾張 */
    track.addEventListener(
      'scroll',
      rafThrottle(() => {
        if (state.resizing) return;
        const w = track.clientWidth || 1;
        const i = Math.max(0, Math.min(slideCount() - 1, Math.round(track.scrollLeft / w)));
        if (i !== state.index) {
          state.index = i;
          paint();
          restartTimer(); // 不論是自動還是使用者滑的，都讓下一次切換從頭計時
        }
      }),
      { passive: true }
    );

    $('#car-prev').addEventListener('click', () => {
      step(-1);
      restartTimer();
    });
    $('#car-next').addEventListener('click', () => {
      step(1);
      restartTimer();
    });

    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      }
    });

    /* 滑鼠拖曳（觸控與觸控板用原生捲動，不需要處理） */
    let drag = null;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: track.scrollLeft, moved: false };
      track.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      track.scrollLeft = drag.left - dx;
    });
    const endDrag = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const w = track.clientWidth || 1;
      const base = Math.round(drag.left / w);
      // 拖超過 15% 寬度就換張，否則回彈
      let target = base;
      if (dx < -w * 0.15) target = base + 1;
      else if (dx > w * 0.15) target = base - 1;
      target = Math.max(0, Math.min(slideCount() - 1, target));
      drag = null;
      track.classList.remove('is-dragging');
      go(target);
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    // 尺寸改變的瞬間 scrollLeft 還是舊寬度的值，等穩定後再對齊，期間不更新目前張數
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      state.resizing = true;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        state.resizing = false;
        go(state.index, false);
      }, 150);
    });

    /* 自動播放 ---------------------------------------------------------------- */
    function shouldRun() {
      return !state.userPaused && !state.hovering && state.visible && !document.hidden && dlg.open;
    }

    function restartTimer() {
      clearInterval(state.timer);
      state.timer = 0;
      if (shouldRun()) state.timer = setInterval(autoAdvance, AUTO_MS);
    }

    function paintPlay() {
      const playing = !state.userPaused;
      playBtn.setAttribute('aria-pressed', String(playing));
      playText.textContent = playing ? '暫停' : '自動播放';
      playBtn.title = playing ? '暫停自動播放' : '開始自動播放';
    }

    playBtn.addEventListener('click', () => {
      state.userPaused = !state.userPaused;
      paintPlay();
      restartTimer();
    });

    // 滑鼠停在輪播上、或鍵盤焦點在裡面時先停，不要在使用者看圖時換掉
    root.addEventListener('mouseenter', () => {
      state.hovering = true;
      restartTimer();
    });
    root.addEventListener('mouseleave', () => {
      state.hovering = false;
      restartTimer();
    });
    root.addEventListener('focusin', () => {
      state.hovering = true;
      restartTimer();
    });
    root.addEventListener('focusout', () => {
      state.hovering = false;
      restartTimer();
    });
    document.addEventListener('visibilitychange', restartTimer);

    // 捲到看不見時不要在背景一直切
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => {
          state.visible = entries[0].isIntersecting;
          restartTimer();
        },
        { threshold: 0.25 }
      ).observe(root);
    }

    paintPlay();
    loadAlbum(0);
    restartTimer();

    return {
      pause() {
        clearInterval(state.timer);
        state.timer = 0;
      },
      resume() {
        go(state.index, false);
        restartTimer();
      },
    };
  }

  /* ---- Facebook 粉專（官方 Page plugin） --------------------------------------
   * 外掛只在載入時決定寬度（180–500），所以這裡量過容器再帶進網址。
   * 用 iframe 版本，不載入 Facebook 的 JS SDK；離開畫面很遠時才載入。 */
  function bindFacebook() {
    const box = $('#fb-embed');
    if (!box) return;
    let done = false;

    function load() {
      if (done) return;
      done = true;
      const width = Math.max(180, Math.min(500, Math.floor(box.clientWidth) || 340));
      // Facebook 官方 Page plugin：只放粉專名片（封面、追蹤、分享）。
      // 貼文分頁對未登入的訪客常常是一大片空白，所以不放，高度收到名片剛好。
      const FB_TABS = '';
      const FB_HEIGHT = 210;
      const height = FB_HEIGHT;
      const q = new URLSearchParams({
        href: box.dataset.href,
        tabs: FB_TABS,
        width: String(width),
        height: String(height),
        small_header: 'false',
        adapt_container_width: 'true',
        hide_cover: 'false',
        show_facepile: 'true',
        locale: 'zh_TW',
      });
      const frame = el('iframe', {
        src: `https://www.facebook.com/plugins/page.php?${q}`,
        title: 'Galgame 同好會 Facebook 粉專',
        width: String(width),
        height: String(height),
        scrolling: 'no',
        frameborder: '0',
        allowfullscreen: 'true',
        allow: 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share',
        loading: 'lazy',
        // 第三方內容：可以跑自己的程式、開新視窗（追蹤、分享），但不能把整個網站導走
        sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms',
        referrerpolicy: 'strict-origin-when-cross-origin',
      });
      frame.style.height = `${height}px`;
      box.textContent = '';
      box.append(frame);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries, obs) => {
          if (entries[0].isIntersecting) {
            obs.disconnect();
            load();
          }
        },
        { rootMargin: '400px 0px' }
      ).observe(box);
    } else {
      load();
    }
  }

  let album = null;
  let started = false;

  dlg.addEventListener('intro:open', () => {
    if (!started) {
      started = true;
      // 等面板的版面算完（拿得到寬度）再初始化
      requestAnimationFrame(() => {
        album = bindAlbum();
        bindFacebook();
      });
    } else if (album) {
      album.resume();
    }
  });

  dlg.addEventListener('close', () => {
    if (album) album.pause();
  });

  // 網址帶 #intro-club 進站時，intro.js 在這支腳本載入前就已經把面板打開了
  if (dlg.open) dlg.dispatchEvent(new CustomEvent('intro:open'));
})();
