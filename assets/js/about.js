/* =============================================================================
 * about.js — 「關於同好會」頁：選單、日夜切換、活動相簿輪播
 * -----------------------------------------------------------------------------
 * 相簿資料在 events-data.js（由 tools/build_photos.py 產生）。
 * 輪播用原生的 scroll-snap，所以手機的滑動、觸控板的橫向捲動都是瀏覽器自己
 * 處理的；這裡只補上：箭頭／鍵盤／滑鼠拖曳、自動播放、同步計數與圓點。
 * ========================================================================== */
(function () {
  'use strict';

  const { $, el, rafThrottle } = window.U;
  const AUTO_MS = 5000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 頁面外框：主題、選單 ---------------------------------------------- */
  function bindChrome() {
    const header = $('#site-header');
    const onScroll = rafThrottle(() => {
      if (header) header.classList.toggle('is-stuck', window.scrollY > 8);
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const themeBtn = $('#theme-toggle');
    if (themeBtn) {
      const paint = () => {
        const t = document.documentElement.getAttribute('data-theme');
        themeBtn.textContent = t === 'day' ? '☾' : '☀';
        themeBtn.title = t === 'day' ? '切換到夜間模式' : '切換到日間模式';
      };
      paint();
      themeBtn.addEventListener('click', () => {
        window.U.toggleTheme();
        paint();
      });
    }

    const toggle = $('#menu-toggle');
    const drawer = $('#menu-drawer');
    const scrim = $('#menu-scrim');
    if (!toggle || !drawer || !scrim) return;
    let closeTimer = 0;

    function open() {
      clearTimeout(closeTimer);
      toggle.setAttribute('aria-expanded', 'true');
      drawer.hidden = false;
      scrim.hidden = false;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          drawer.classList.add('is-open');
          scrim.classList.add('is-open');
        })
      );
      document.body.classList.add('menu-is-open');
    }

    function close() {
      toggle.setAttribute('aria-expanded', 'false');
      drawer.classList.remove('is-open');
      scrim.classList.remove('is-open');
      document.body.classList.remove('menu-is-open');
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        drawer.hidden = true;
        scrim.hidden = true;
      }, 320);
    }

    toggle.addEventListener('click', () =>
      drawer.classList.contains('is-open') ? close() : open()
    );
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
    });
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('.menu-drawer__item')) close();
    });
  }

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
      return !state.userPaused && !state.hovering && state.visible && !document.hidden;
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
  }

  window.U.initTheme();
  bindChrome();
  bindAlbum();
})();
