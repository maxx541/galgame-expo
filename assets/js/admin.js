/* =============================================================================
 * admin.js — 後台（上傳者專用）
 * -----------------------------------------------------------------------------
 * 兩種登入模式，在 config.js 的 supabase.authMode 切換：
 *
 *   'password'  前端密碼閘門。輸入的密碼取 SHA-256 後跟 config 裡的雜湊比對。
 *               ⚠️ 這只擋得住「路過的一般人」。任何懂 F12 的人都能繞過，
 *                  因為判斷發生在瀏覽器裡。真正的防線是 Supabase 的 RLS。
 *
 *   'supabase'  用 Supabase Auth 的帳號密碼登入（推薦）。
 *               配合 schema.sql 裡「只有登入者能寫入」的 RLS 政策，
 *               才是真正擋得住的保護。
 *
 * 上傳流程：
 *   選檔 → 逐一上傳到 Cloudinary（有進度）→ 取回 CDN 網址 → 寫進 Supabase
 * ========================================================================== */
(function () {
  'use strict';

  const { $, $$, el, category, fmtBytes, fmtDate, toast, store, CFG, highlight } = window.U;

  const SESSION_KEY = 'expo.admin.session';
  const OWNER_KEY = 'expo.admin.owner';
  const AUTH_MODE = (CFG.supabase && CFG.supabase.authMode) || 'password';

  /** 待上傳佇列：{ id, file, previewUrl, title, state, progress, error } */
  let queue = [];
  let uploading = false;
  let manageItems = [];

  /** 社團／作品建議清單，loadSuggestions() 填好之後給 bindAutocomplete() 用 */
  let circleNames = [];
  let seriesNames = [];

  /* ==========================================================================
   * 啟動
   * ======================================================================== */
  function init() {
    window.U.initTheme();

    $('#gate-mark').src = window.PH.lockMark(64);
    $('#brand-logo').src = window.PH.logo(72);

    buildCategoryOptions();
    bindGate();
    bindTheme();
    bindMenuDrawer();

    if (isSignedIn()) enterAdmin();
  }

  function buildCategoryOptions() {
    for (const sel of $$('[data-category-select]')) {
      sel.textContent = '';
      for (const c of CFG.categories || []) {
        sel.append(el('option', { value: c.id }, `${c.label}${c.ja ? `（${c.ja}）` : ''}`));
      }
    }
  }

  function bindTheme() {
    const btn = $('#theme-toggle');
    if (!btn) return;
    // 圖示放在 .menu-drawer__icon 子元素裡，不能直接改 btn.textContent，
    // 不然會連「日 / 夜模式」這行文字一起洗掉（跟 gallery.js 同一個坑）。
    const icon = btn.querySelector('.menu-drawer__icon');
    const paint = () => {
      const t = document.documentElement.getAttribute('data-theme');
      const glyph = t === 'day' ? '☾' : '☀';
      if (icon) icon.textContent = glyph;
      else btn.textContent = glyph;
    };
    paint();
    btn.addEventListener('click', () => {
      window.U.toggleTheme();
      paint();
    });
  }

  /* ==========================================================================
   * 抽屜選單 —— 跟 gallery.js 的 bindMenuDrawer() 同一套邏輯（不用 transitionend，
   * 用 setTimeout 對齊 CSS transition 時間；開合各自加 rAF 確保動畫會跑）。
   * ======================================================================== */
  function bindMenuDrawer() {
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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          drawer.classList.add('is-open');
          scrim.classList.add('is-open');
        });
      });
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
    toggle.addEventListener('click', () => {
      drawer.classList.contains('is-open') ? close() : open();
    });
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
    });
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('.menu-drawer__item')) close();
    });
  }

  /* ==========================================================================
   * 登入閘門
   * ======================================================================== */
  function isSignedIn() {
    // 這兩種模式都是真正的 Supabase session（email 帳號 / 匿名登入），
    // 是否已登入要非同步問 Supabase，交給 checkSupabaseSession()。
    if (AUTH_MODE === 'supabase' || AUTH_MODE === 'shared') return false;
    const s = store.get(SESSION_KEY, null);
    if (!s || !s.until) return false;
    if (Date.now() > s.until) {
      store.del(SESSION_KEY);
      return false;
    }
    return true;
  }

  function bindGate() {
    const form = $('#gate-form');
    const card = $('#gate-card');
    const errBox = $('#gate-err');
    // gate-email-field 只有 authMode = 'supabase' 才會用到，目前的 HTML 已經不放這個
    // 欄位了（見 admin.html），所以這裡改用選填查詢，避免 authMode 被改成 'supabase'
    // 時因為找不到元素而整個 init() 掛掉。
    const emailField = $('#gate-email-field');

    if (AUTH_MODE === 'supabase') {
      if (emailField) emailField.style.display = '';
      $('#gate-sub').textContent = '請用 Supabase 帳號登入';
      // 可能上次登入還沒過期
      checkSupabaseSession();
    } else if (AUTH_MODE === 'shared') {
      $('#gate-sub').textContent = '請輸入團隊共用密碼';
      $('#gate-hint-shared').style.display = '';
      checkSupabaseSession();
    } else {
      $('#gate-sub').textContent = '請輸入上傳者密碼';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';
      const pw = $('#gate-password').value;
      const submitBtn = $('#gate-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = '驗證中…';

      try {
        if (AUTH_MODE === 'supabase') {
          await window.STORE.signIn($('#gate-email').value.trim(), pw);
        } else if (AUTH_MODE === 'shared') {
          // 密碼在資料庫裡比對，答對才拿到真正的匿名登入 session（見 store.js）
          await window.STORE.verifyAndSignInShared(pw);
        } else {
          const hash = await window.U.sha256(pw);
          if (hash !== CFG.adminPasswordHash) throw new Error('密碼不正確。');
          store.set(SESSION_KEY, {
            until: Date.now() + (CFG.adminSessionTTL || 8 * 3600 * 1000),
          });
        }
        enterAdmin();
      } catch (err) {
        errBox.textContent = err.message || '登入失敗';
        card.classList.add('is-shaking');
        setTimeout(() => card.classList.remove('is-shaking'), 450);
        $('#gate-password').select();
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '進入';
      }
    });

    $('#sign-out').addEventListener('click', async () => {
      store.del(SESSION_KEY);
      if (AUTH_MODE === 'supabase' || AUTH_MODE === 'shared') {
        try {
          await window.STORE.signOut();
        } catch {
          /* 忽略 */
        }
      }
      location.reload();
    });
  }

  async function checkSupabaseSession() {
    try {
      const user = await window.STORE.currentUser();
      if (user) enterAdmin();
    } catch {
      /* 尚未登入，維持閘門畫面 */
    }
  }

  function enterAdmin() {
    $('#gate').style.display = 'none';
    $('#admin').classList.add('is-on');
    $('#site-header').style.display = '';
    showEnvNotices();
    bindGuide();
    bindUploader();
    bindManage();
    bindOwnerBar();
    bindSeriesAutofill();
    loadManageList();
    loadSuggestions();
  }

  /**
   * 社團與作品的輸入建議清單。
   * 每次上傳成功後會重新載入一次，所以剛剛才新增的社團 / 作品，下一批就選得到。
   * 實際的下拉 UI 在 bindAutocomplete()，這裡只負責把名單抓回來存著。
   */
  async function loadSuggestions() {
    try {
      circleNames = await window.STORE.circleSuggestions();
    } catch {
      circleNames = []; // 建議載入失敗不影響上傳，使用者照樣可以自己打字
    }
    try {
      seriesNames = await window.STORE.seriesSuggestions();
    } catch {
      seriesNames = [];
    }
  }

  /**
   * 含字比對的輸入建議下拉 —— 取代原生 <datalist>。
   * 原生 datalist 大多數瀏覽器只比對「開頭」，中文輸入法下過濾也常常不穩，
   * 打「蒼」找不到「蒼」不在開頭的名字。這裡自己做，含字比對，行為才可控。
   *
   * 用法：input 本身要先包在 <div class="combo"> 裡（.combo 負責定位下拉清單），
   * getItems() 回傳目前完整的候選名單（不用先篩好，這裡自己篩）。
   */
  function bindAutocomplete(input, getItems) {
    if (!input) return;
    const wrap = input.parentElement;
    const list = el('div', { class: 'combo__list' });
    list.hidden = true;
    wrap.append(list);

    let activeIndex = -1;

    function choose(name) {
      input.value = name;
      close();
      // 只發 change，不發 input —— 發 input 會馬上被自己的 filter() 監聽到，
      // 拿選好的值重新比對一次（自己一定符合自己），下拉清單就會立刻又跳出來。
      // change 就夠讓「作品 → 自動帶入社團」那段既有邏輯照常觸發。
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.focus();
    }

    function close() {
      list.hidden = true;
      list.textContent = '';
      activeIndex = -1;
    }

    function render(matches, q) {
      list.textContent = '';
      activeIndex = -1;
      if (!matches.length) {
        list.hidden = true;
        return;
      }
      for (const name of matches) {
        list.append(
          el(
            'button',
            {
              type: 'button',
              class: 'combo__opt',
              onmousedown: (e) => {
                // 先 preventDefault 才不會讓 input 先 blur 把清單關掉
                e.preventDefault();
                choose(name);
              },
            },
            highlight(name, q)
          )
        );
      }
      list.hidden = false;
    }

    function filter() {
      const q = input.value.trim();
      if (!q) {
        close();
        return;
      }
      const items = getItems() || [];
      const lower = q.toLowerCase();
      const matches = items.filter((n) => n.toLowerCase().includes(lower)).slice(0, 8);
      render(matches, q);
    }

    input.addEventListener('input', filter);
    input.addEventListener('focus', filter);
    input.addEventListener('blur', () => {
      // 給 mousedown 的 choose() 一點時間跑完，不然會搶在點擊前把清單關掉
      setTimeout(close, 150);
    });
    input.addEventListener('keydown', (e) => {
      const opts = list.querySelectorAll('.combo__opt');
      if (list.hidden || !opts.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, opts.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (e.key === 'Enter') {
        if (activeIndex < 0) return;
        e.preventDefault();
        choose(opts[activeIndex].textContent);
        return;
      } else if (e.key === 'Escape') {
        close();
        return;
      } else {
        return;
      }
      opts.forEach((o, i) => o.classList.toggle('is-active', i === activeIndex));
      opts[activeIndex].scrollIntoView({ block: 'nearest' });
    });
  }

  /**
   * 作品 → 社團自動填入：在「作品名稱」填了已知作品、而「社團」還空著時，
   * 自動幫忙帶出社團（對應表在 config.js 的 seriesToCircle）。
   * 只在社團空著時才填，不覆蓋使用者已經手動填的社團。
   */
  function bindSeriesAutofill() {
    const map = CFG.seriesToCircle || {};
    const series = $('#f-series');
    const circle = $('#f-circle');
    if (!series || !circle) return;
    series.addEventListener('change', () => {
      const hit = map[series.value.trim()];
      if (hit && !circle.value.trim()) circle.value = hit;
    });
  }

  /* ==========================================================================
   * 擁有者（這台電腦現在是誰在上傳）
   * --------------------------------------------------------------------------
   * 不是帳號系統，不做驗證，純粹是「記住最後一次填的名字」的小工具，
   * 讓同一個人連續上傳很多批時不用每次重填。存在 localStorage，
   * 換一台電腦、清過瀏覽器資料、或按下「設定／更換」都可以改。
   * ======================================================================== */
  function currentOwner() {
    return (store.get(OWNER_KEY, '') || '').trim();
  }

  function setOwner(name) {
    const trimmed = String(name || '').trim();
    if (trimmed) store.set(OWNER_KEY, trimmed);
    else store.del(OWNER_KEY);
    paintOwnerBar();
    // 管理清單是依擁有者篩選的，換人就要重新載入，不然會看到上一個人的清單
    if ($('#manage-list')) loadManageList(currentSearch());
  }

  function paintOwnerBar() {
    const el2 = $('#owner-value');
    if (!el2) return;
    const owner = currentOwner();
    if (owner) {
      el2.textContent = owner;
      el2.removeAttribute('data-empty');
    } else {
      el2.textContent = '尚未設定，上傳前請先設定';
      el2.setAttribute('data-empty', 'true');
    }
  }

  function bindOwnerBar() {
    paintOwnerBar();
    $('#owner-change').addEventListener('click', () => promptOwner());
  }

  /**
   * 跳出一個小 modal 請使用者輸入擁有者名字。
   * 存好之後不會自動繼續上傳 —— 使用者自己再按一次「上傳到展覽」，
   * 這樣不用處理「使用者叉掉視窗」這種取消狀態，邏輯單純很多。
   */
  function promptOwner() {
    const input = el('input', {
      class: 'input',
      id: 'owner-input',
      placeholder: '例：阿橘、Rin、你的暱稱…',
      value: currentOwner(),
      maxlength: '60',
    });

    openModal({
      title: '設定擁有者',
      body: [
        el('p', { class: 'field__hint', style: { marginBottom: '4px' } }, [
          '這台電腦接下來上傳的展品，都會自動標記成這個擁有者。',
          el('br'),
          '之後要換人用，隨時可以在這裡重新設定。',
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'owner-input' }, '擁有者名稱'),
          input,
        ]),
      ],
      confirmLabel: '儲存',
      onConfirm: () => {
        const name = input.value.trim();
        if (!name) {
          toast('請輸入擁有者名稱', 'err');
          return false;
        }
        setOwner(name);
        toast(`擁有者已設為「${name}」，可以繼續上傳了`, 'ok');
        return true;
      },
    });
  }

  /* ---- 設定完整度提示 ------------------------------------------------------
   * 這裡只提醒「現在是什麼狀態、會有什麼後果」，不講怎麼改後台設定 ——
   * 這個畫面是給上傳展品的人看的，不是給架站的人看的操作說明書。 */
  function showEnvNotices() {
    const slot = $('#notice-slot');
    slot.textContent = '';

    if (!window.U.hasCloudinary()) {
      slot.append(
        notice([
          el('b', {}, '圖片上傳功能尚未啟用'),
          el('br'),
          '現在還不能真的把圖片存到雲端，請聯絡網站管理員完成設定。',
        ])
      );
    }

    if (window.STORE.mode === 'demo') {
      slot.append(
        notice([
          el('b', {}, '目前是展示模式（Demo）'),
          el('br'),
          '新增的展品只會存在這台瀏覽器裡，不會同步給其他人，重設瀏覽器資料就會消失。',
        ])
      );
    }
  }

  /* ---- 使用說明收合狀態記憶 ------------------------------------------------ */
  const GUIDE_KEY = 'expo.admin.guideOpen';
  function bindGuide() {
    const guide = $('#admin-guide');
    if (!guide) return;
    const saved = store.get(GUIDE_KEY, null);
    if (saved !== null) guide.open = saved;
    guide.addEventListener('toggle', () => store.set(GUIDE_KEY, guide.open));
  }

  function notice(children) {
    return el('div', { class: 'notice' }, [
      el('span', { class: 'notice__icon' }, '⚠'),
      el('div', {}, children),
    ]);
  }

  /* ==========================================================================
   * 上傳
   * ======================================================================== */
  function bindUploader() {
    const dz = $('#dropzone');
    const input = $('#file-input');

    bindAutocomplete($('#f-circle'), () => circleNames);
    bindAutocomplete($('#f-series'), () => seriesNames);

    input.addEventListener('change', () => {
      addFiles(input.files);
      input.value = ''; // 清空才能再選同一個檔案
    });

    ['dragenter', 'dragover'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add('is-over');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove('is-over');
      })
    );
    dz.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    // 直接貼上截圖也能用
    document.addEventListener('paste', (e) => {
      if (!e.clipboardData) return;
      const files = Array.from(e.clipboardData.files || []);
      if (files.length) addFiles(files);
    });

    $('#upload-form').addEventListener('submit', onSubmit);
    $('#queue-clear').addEventListener('click', clearQueue);
  }

  const MAX_MB = 10;

  /**
   * 一次只處理一張圖片 —— 每件展品的分類、社團、備註都是各自獨立的，
   * 不共用同一組欄位，所以不做「一批多張」那種批次上傳。
   * 選了新圖片就直接換掉清單裡還沒送出的那一張。
   */
  function addFiles(fileList) {
    const all = Array.from(fileList || []);
    const files = all.filter((f) => f.type.startsWith('image/'));
    if (all.length - files.length > 0) toast(`有 ${all.length - files.length} 個檔案不是圖片，已略過`, 'err');
    if (!files.length) return;

    if (uploading) {
      toast('正在上傳中，請等這張傳完再選下一張。', 'err');
      return;
    }

    if (files.length > 1) {
      toast('一次只能選一張圖片，已經取第一張。', 'err', 5000);
    }

    const f = files[0];
    if (f.size > MAX_MB * 1024 * 1024) {
      toast(`${f.name} 超過 ${MAX_MB} MB`, 'err', 5000);
      return;
    }

    clearQueue();
    queue.push({
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
      // 預設用檔名（去掉副檔名）當標題，通常比空白好改
      title: f.name.replace(/\.[^.]+$/, ''),
      state: 'ready',
      progress: 0,
      error: '',
    });
    renderQueue();
  }

  function renderQueue() {
    const box = $('#queue');
    box.textContent = '';

    $('#queue-meta').textContent = queue.length
      ? `${queue.length} 個檔案　${fmtBytes(queue.reduce((s, q) => s + q.file.size, 0))}`
      : '';
    $('#queue-clear').style.display = queue.length ? '' : 'none';
    $('#submit-btn').disabled = !queue.length || uploading;

    for (const q of queue) {
      const statusText = {
        ready: '待上傳',
        uploading: `${Math.round(q.progress * 100)}%`,
        done: '完成',
        error: '失敗',
      }[q.state];

      box.append(
        el('div', { class: 'queue__item', dataset: { state: q.state, id: q.id } }, [
          el('img', { class: 'queue__thumb', src: q.previewUrl, alt: '' }),
          el('div', { class: 'queue__body' }, [
            // 每個檔案可以有自己的標題
            el('input', {
              class: 'input queue__title-input',
              value: q.title,
              placeholder: '展品名稱',
              'aria-label': '展品名稱',
              disabled: uploading,
              style: { padding: '5px 9px', fontSize: '12.5px' },
              oninput: (e) => {
                q.title = e.target.value;
              },
            }),
            el('div', { class: 'queue__meta' }, [
              `${fmtBytes(q.file.size)}`,
              q.error ? `　${q.error}` : '',
            ]),
          ]),
          el('span', { class: 'queue__status' }, statusText),
          q.state === 'uploading' || q.state === 'done'
            ? null
            : el(
                'button',
                {
                  class: 'queue__del',
                  type: 'button',
                  'aria-label': '移除',
                  onclick: () => removeFromQueue(q.id),
                },
                '×'
              ),
          el('span', {
            class: 'queue__bar',
            style: { width: `${Math.round(q.progress * 100)}%` },
          }),
        ])
      );
    }
  }

  function removeFromQueue(id) {
    const i = queue.findIndex((q) => q.id === id);
    if (i < 0) return;
    URL.revokeObjectURL(queue[i].previewUrl);
    queue.splice(i, 1);
    renderQueue();
  }

  function clearQueue() {
    for (const q of queue) URL.revokeObjectURL(q.previewUrl);
    queue = [];
    renderQueue();
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (uploading || !queue.length) return;

    // 擁有者是必填，而且是第一件要檢查的事 —— 沒設定就不用檢查別的了
    const owner = currentOwner();
    if (!owner) {
      toast('請先設定擁有者，再上傳展品。', 'err');
      promptOwner();
      return;
    }

    const shared = {
      circle: $('#f-circle').value.trim(),
      series: $('#f-series').value.trim(),
      character: $('#f-character').value.trim(),
      category: $('#f-category').value,
      note: $('#f-note').value.trim(),
    };

    // 標題是必填；沒填的檔案直接擋下，避免傳一堆「未命名」上去
    const missing = queue.filter((q) => !q.title.trim());
    if (missing.length) {
      toast(`還有 ${missing.length} 個檔案沒有填名稱`, 'err');
      return;
    }

    if (window.STORE.mode === 'supabase' && !window.U.hasCloudinary()) {
      toast('尚未設定 Cloudinary，無法上傳圖片。', 'err', 6000);
      return;
    }

    uploading = true;
    $('#submit-btn').disabled = true;
    $('#submit-btn').textContent = '上傳中…';
    renderQueue();

    let ok = 0;
    let fail = 0;

    for (const q of queue) {
      if (q.state === 'done') continue;
      q.state = 'uploading';
      q.progress = 0;
      q.error = '';
      renderQueue();

      try {
        let imageUrl;
        let width = null;
        let height = null;
        let publicId = '';

        if (window.U.hasCloudinary()) {
          const res = await window.CLOUD.upload(q.file, {
            onProgress: (p) => {
              q.progress = p;
              updateQueueProgress(q);
            },
          });
          imageUrl = res.url;
          width = res.width;
          height = res.height;
          publicId = res.publicId;
        } else {
          // Demo 模式沒有圖床：把圖片轉成 data URI 暫存在本機
          imageUrl = await fileToDataUrl(q.file);
          const dim = await imageSize(imageUrl);
          width = dim.w;
          height = dim.h;
          q.progress = 1;
          updateQueueProgress(q);
        }

        await window.STORE.create({
          title: q.title.trim(),
          circle: shared.circle,
          series: shared.series,
          character: shared.character,
          owner,
          category: shared.category,
          note: shared.note,
          imageUrl,
          width,
          height,
          publicId,
        });

        q.state = 'done';
        q.progress = 1;
        ok++;
      } catch (err) {
        console.error(err);
        q.state = 'error';
        q.error = err.message || '上傳失敗';
        fail++;
      }
      renderQueue();
    }

    uploading = false;
    $('#submit-btn').textContent = '上傳到展覽';
    $('#submit-btn').disabled = false;

    if (ok) toast(`成功上傳 ${ok} 件展品`, 'ok');
    if (fail) toast(`有 ${fail} 件上傳失敗，詳情看清單上的訊息`, 'err', 7000);

    if (ok) {
      // 只清掉成功的，失敗的留著讓使用者重試
      for (const q of queue.filter((x) => x.state === 'done')) {
        URL.revokeObjectURL(q.previewUrl);
      }
      queue = queue.filter((q) => q.state !== 'done');
      renderQueue();
      loadManageList(currentSearch());
      // 這批如果填了新的作品名稱，重新載入建議清單，下一批就選得到
      loadSuggestions();
    }
  }

  /** 只更新進度條與百分比，不整個重畫（上傳中重畫會讓輸入框失去焦點） */
  function updateQueueProgress(q) {
    const row = $(`.queue__item[data-id="${q.id}"]`);
    if (!row) return;
    const bar = row.querySelector('.queue__bar');
    const status = row.querySelector('.queue__status');
    if (bar) bar.style.width = `${Math.round(q.progress * 100)}%`;
    if (status) status.textContent = `${Math.round(q.progress * 100)}%`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('讀取檔案失敗'));
      r.readAsDataURL(file);
    });
  }

  function imageSize(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => resolve({ w: null, h: null });
      im.src = src;
    });
  }

  /* ==========================================================================
   * 管理已上傳的展品
   * ======================================================================== */
  function bindManage() {
    const search = $('#manage-search');
    if (search) {
      search.addEventListener(
        'input',
        window.U.debounce(() => loadManageList(search.value.trim()), 300)
      );
    }
    $('#manage-reload').addEventListener('click', () => loadManageList(currentSearch()));
  }

  /** 目前管理清單的搜尋關鍵字 —— 重載時要保留，不然使用者的篩選會被清掉 */
  function currentSearch() {
    const el = $('#manage-search');
    return el ? el.value.trim() : '';
  }

  async function loadManageList(search = '') {
    const box = $('#manage-list');
    box.textContent = '';

    // 只列出目前擁有者自己上傳的展品，不要讓不同人互相看到、誤改到對方的東西
    const owner = currentOwner();
    if (!owner) {
      $('#manage-count').textContent = '';
      box.append(
        el('div', { class: 'field__hint', style: { padding: '12px' } }, '請先設定擁有者，才能看到你上傳過的展品。')
      );
      return;
    }

    box.append(el('div', { class: 'field__hint', style: { padding: '12px' } }, '載入中…'));

    try {
      const { items, total } = await window.STORE.list({
        category: 'all',
        owner,
        search,
        sort: 'new',
        from: 0,
        to: 99,
      });
      manageItems = items;
      $('#manage-count').textContent = `${total} 件`;

      box.textContent = '';
      if (!items.length) {
        box.append(
          el(
            'div',
            { class: 'field__hint', style: { padding: '12px' } },
            search ? '找不到符合的展品。' : '你還沒有上傳過任何展品。'
          )
        );
        return;
      }
      for (const it of items) box.append(buildManageRow(it));
    } catch (err) {
      box.textContent = '';
      box.append(
        el('div', { class: 'field__hint', style: { padding: '12px', color: 'var(--danger)' } }, err.message)
      );
    }
  }

  function buildManageRow(it) {
    const cat = category(it.category);
    const row = el('div', { class: 'admin-row', dataset: { id: it.id } }, [
      el('img', {
        class: 'admin-row__thumb',
        src: window.CLOUD.square(it.imageUrl, 120),
        alt: '',
        loading: 'lazy',
      }),
      el('div', { style: { minWidth: '0' } }, [
        el('div', { class: 'admin-row__title' }, it.title),
        el('div', { class: 'admin-row__meta' }, [
          el('span', { class: 'tag', style: { '--hue': cat.hue } }, cat.label),
          it.circle ? el('span', {}, it.circle) : null,
          it.owner ? el('span', {}, `擁有者：${it.owner}`) : null,
          el('span', {}, fmtDate(it.createdAt)),
          it.series ? el('span', {}, it.series) : null,
        ]),
      ]),
      el('div', { class: 'admin-row__acts' }, [
        el(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            title: '編輯',
            'aria-label': `編輯 ${it.title}`,
            onclick: () => openEdit(it),
          },
          '✎'
        ),
        el(
          'button',
          {
            class: 'icon-btn icon-btn--danger',
            type: 'button',
            title: '刪除',
            'aria-label': `刪除 ${it.title}`,
            onclick: () => confirmDelete(it, row),
          },
          '🗑'
        ),
      ]),
    ]);

    // tag 的 --hue 要用 setProperty
    const tag = row.querySelector('.tag');
    if (tag) tag.style.setProperty('--hue', String(cat.hue));
    return row;
  }

  /* ---- 編輯 -------------------------------------------------------------- */
  function openEdit(it) {
    const catSelect = el('select', { class: 'select', id: 'edit-category' });
    for (const c of CFG.categories || []) {
      catSelect.append(
        el('option', { value: c.id, selected: c.id === it.category ? true : null }, c.label)
      );
    }

    openModal({
      title: '編輯展品',
      body: [
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'edit-title' }, '展品名稱'),
          el('input', { class: 'input', id: 'edit-title', value: it.title }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'edit-circle' }, '社團 / 品牌'),
          el('div', { class: 'combo' }, [
            el('input', {
              class: 'input',
              id: 'edit-circle',
              autocomplete: 'off',
              value: it.circle || '',
            }),
          ]),
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'edit-series' }, '作品名稱'),
          // 跟上傳表單共用同一份建議名單，編輯時一樣有建議可選
          el('div', { class: 'combo' }, [
            el('input', {
              class: 'input',
              id: 'edit-series',
              autocomplete: 'off',
              value: it.series || '',
            }),
          ]),
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'edit-character' }, '角色'),
          el('input', { class: 'input', id: 'edit-character', value: it.character || '' }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'edit-owner' }, '擁有者'),
          el('input', { class: 'input', id: 'edit-owner', value: it.owner || '' }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'edit-category' }, '分類'),
          catSelect,
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'edit-note' }, '備註 / 收藏故事'),
          el('textarea', { class: 'textarea textarea--story', id: 'edit-note' }, it.note || ''),
        ]),
      ],
      confirmLabel: '儲存',
      onConfirm: async () => {
        const title = $('#edit-title').value.trim();
        if (!title) {
          toast('展品名稱不能空白', 'err');
          return false;
        }
        await window.STORE.update(it.id, {
          title,
          circle: $('#edit-circle').value.trim(),
          series: $('#edit-series').value.trim(),
          character: $('#edit-character').value.trim(),
          owner: $('#edit-owner').value.trim(),
          category: $('#edit-category').value,
          note: $('#edit-note').value.trim(),
          imageUrl: it.imageUrl,
          width: it.width,
          height: it.height,
          publicId: it.publicId,
        });
        toast('已更新', 'ok');
        loadManageList(currentSearch());
        return true;
      },
    });

    // openModal() 是同步把畫面插進 DOM 的，這裡才抓得到剛剛建的兩個輸入框
    bindAutocomplete($('#edit-circle'), () => circleNames);
    bindAutocomplete($('#edit-series'), () => seriesNames);
  }

  /* ---- 刪除 -------------------------------------------------------------- */
  function confirmDelete(it, row) {
    openModal({
      title: '確定要刪除嗎？',
      body: [
        el('p', { style: { fontSize: '13.5px', lineHeight: '1.8' } }, [
          '即將從展覽移除 ',
          el('b', {}, `「${it.title}」`),
          '。這個動作無法復原。',
        ]),
        el(
          'p',
          { class: 'field__hint', style: { marginTop: '10px' } },
          '注意：這個動作只會把它從展覽移除，圖片本身不會馬上從雲端空間清除。'
        ),
      ],
      confirmLabel: '刪除',
      danger: true,
      onConfirm: async () => {
        row.classList.add('is-removing');
        try {
          await window.STORE.remove(it.id);
          row.remove();
          toast('已刪除', 'ok');
          // 一定要重載，否則右上角的「N 件」會停在刪除前的數字
          loadManageList(currentSearch());
        } catch (err) {
          row.classList.remove('is-removing');
          toast(err.message, 'err', 6000);
          return false;
        }
        return true;
      },
    });
  }

  /* ==========================================================================
   * 小型 modal（不用 window.confirm，避免瀏覽器原生對話框卡住頁面）
   * ======================================================================== */
  function openModal({ title, body, confirmLabel = '確定', danger = false, onConfirm }) {
    const prevFocus = document.activeElement;

    const confirmBtn = el(
      'button',
      { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button' },
      confirmLabel
    );
    const cancelBtn = el('button', { class: 'btn btn--ghost', type: 'button' }, '取消');

    const box = el('div', { class: 'modal__box panel', role: 'dialog', 'aria-modal': 'true' }, [
      el('h3', { class: 'modal__title' }, title),
      el('div', { class: 'modal__body' }, body),
      el('div', { class: 'modal__foot' }, [cancelBtn, confirmBtn]),
    ]);

    const back = el('div', { class: 'modal' }, [box]);

    function close() {
      back.remove();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    cancelBtn.addEventListener('click', close);
    back.addEventListener('click', (e) => {
      if (e.target === back) close();
    });
    document.addEventListener('keydown', onKey);

    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '處理中…';
      try {
        const done = await onConfirm();
        if (done !== false) close();
      } catch (err) {
        toast(err.message || '操作失敗', 'err', 6000);
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmLabel;
      }
    });

    document.body.append(back);
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const firstInput = box.querySelector('input, textarea, select');
      (firstInput || confirmBtn).focus();
    }, 50);
  }

  /* ---- 走 ---------------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
