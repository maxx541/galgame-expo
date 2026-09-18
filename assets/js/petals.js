/* =============================================================================
 * petals.js — 櫻花飄落（可完全關閉）
 * -----------------------------------------------------------------------------
 * 預設是關的。這是展覽網站，主角是商品照片，特效只是給想要氣氛的人加的選項。
 *
 * 效能上的自我約束：
 *   - 花瓣數量依螢幕寬度縮放，手機只畫 14 片
 *   - 分頁切到背景 (visibilitychange) 就停止繪製，不浪費電池
 *   - 尊重系統的「減少動態」設定，開了就完全不啟動
 *   - 只用 requestAnimationFrame，不開 timer
 * ========================================================================== */
(function () {
  'use strict';

  const KEY = 'expo.petals';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas = null;
  let ctx = null;
  let petals = [];
  let raf = 0;
  let running = false;
  let w = 0;
  let h = 0;
  let dpr = 1;

  function makePetal(seeded) {
    return {
      x: Math.random() * w,
      // 初始化時散佈在整個畫面；之後產生的都從上方進場
      y: seeded ? Math.random() * h : -20 - Math.random() * 60,
      size: 6 + Math.random() * 8,
      speed: 0.28 + Math.random() * 0.62,
      drift: (Math.random() - 0.5) * 0.5,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.015,
      sway: 0.4 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.28 + Math.random() * 0.38,
      hue: 336 + Math.random() * 22,
    };
  }

  function count() {
    if (window.innerWidth < 700) return 14;
    if (window.innerWidth < 1200) return 22;
    return 30;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 依新寬度補齊 / 裁掉花瓣
    const n = count();
    while (petals.length < n) petals.push(makePetal(true));
    petals.length = n;
  }

  /** 畫一片花瓣：兩段貝茲曲線組成的水滴形，比圓點有質感一點 */
  function drawPetal(p) {
    const s = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // 讓花瓣隨旋轉角度「翻面」，看起來有厚度
    ctx.scale(1, Math.max(0.35, Math.abs(Math.cos(p.angle * 0.7))));
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = `hsl(${p.hue} 82% 78%)`;
    ctx.beginPath();
    ctx.moveTo(0, -s / 2);
    ctx.bezierCurveTo(s * 0.5, -s * 0.36, s * 0.42, s * 0.34, 0, s / 2);
    ctx.bezierCurveTo(-s * 0.42, s * 0.34, -s * 0.5, -s * 0.36, 0, -s / 2);
    ctx.fill();
    ctx.restore();
  }

  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);

    for (const p of petals) {
      p.phase += 0.014;
      p.y += p.speed;
      p.x += p.drift + Math.sin(p.phase) * p.sway * 0.4;
      p.angle += p.spin;

      // 飄出畫面就從頂端重新進場
      if (p.y > h + 24) Object.assign(p, makePetal(false));
      if (p.x < -30) p.x = w + 20;
      else if (p.x > w + 30) p.x = -20;

      drawPetal(p);
    }

    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (reduceMotion || running) return;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'petal-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d', { alpha: true });
      document.body.append(canvas);
      window.addEventListener('resize', window.U.debounce(resize, 200));
    }
    canvas.style.display = '';
    resize();
    running = true;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (canvas) {
      ctx.clearRect(0, 0, w, h);
      canvas.style.display = 'none';
    }
  }

  /** 讀取使用者偏好；沒設定過就用 config 的預設值 */
  function enabled() {
    const saved = window.U.store.get(KEY, null);
    if (saved === null) return Boolean(window.U.CFG.ux && window.U.CFG.ux.petals);
    return Boolean(saved);
  }

  function set(on) {
    window.U.store.set(KEY, Boolean(on));
    if (on) start();
    else stop();
    return Boolean(on);
  }

  function toggle() {
    return set(!enabled());
  }

  function init() {
    if (enabled()) start();
    // 切到其他分頁就暫停，回來再續播
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      } else if (enabled() && canvas && canvas.style.display !== 'none' && !running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    });
  }

  window.PETALS = { init, start, stop, toggle, set, enabled, supported: !reduceMotion };
})();
