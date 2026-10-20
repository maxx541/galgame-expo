/* =============================================================================
 * quiz.js — 攤位勇者任務 Gal 知識小測驗（漢堡選單 → 互動）
 * -----------------------------------------------------------------------------
 * 兩種模式，判斷全部在瀏覽器內建完成，不需要後端：
 *   入門      quiz-data.js 的 7 題（選擇題 + 一題兩格填空）
 *   婆羅門級  quiz-hard-data.js 的題庫（由 tools/build_quiz_hard.py 產生），
 *             每次隨機抽 25 題；單選、多選（要全對才算對）、是非；不限時
 * 作答 → 送出 → 評級與分數 → 回顧錯題（婆羅門級會附解析）→ 重新作答。
 * 選項順序每次作答都會重新打亂（是非題固定「對、錯」）。
 * 面板第一次打開才建立畫面（由 intro.js 送出 intro:open 事件）。
 * ========================================================================== */
(function () {
  'use strict';

  const dlg = document.getElementById('intro-quiz');
  const root = document.getElementById('quiz-root');
  if (!dlg || !root || !window.U) return;

  const { el } = window.U;
  const EASY = window.QUIZ;
  const HARD = window.QUIZ_HARD;

  /* ---- 小工具 ------------------------------------------------------------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 比對用：全形轉半形、轉小寫，去掉空白、標點與星號
  const norm = (s) =>
    String(s || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s、，,.。*＊·・\-_()（）「」『』!！?？:：;；'"]/g, '');

  function scrollTop() {
    const body = dlg.querySelector('.intro__body');
    if (body) body.scrollTop = 0;
  }

  /* ---- 把兩種題庫轉成同一種題目格式 ----------------------------------------- */
  // kind：choice（單選）｜judge（是非）｜multi（多選，要全對）｜pair（兩格填空）
  function easyQuestions() {
    return EASY.questions.filter((q) => !q.disabled);
  }

  function buildEasyItems() {
    return easyQuestions().map((q) => {
      if (q.type === 'pair') {
        return { kind: 'pair', q: q.q, fields: q.fields, groups: q.groups, show: q.show, points: 1 };
      }
      const opts = q.options.map((text, idx) => ({ text, idx }));
      return {
        kind: 'choice',
        q: q.q,
        image: q.image,
        explain: q.explain,
        opts: shuffle(opts),
        correct: [q.options.indexOf(q.answer)],
        points: 1,
      };
    });
  }

  function buildHardItems() {
    return shuffle(HARD.questions)
      .slice(0, HARD.pick)
      .map((q) => {
        const opts = q.o.map((text, idx) => ({ text, idx }));
        return {
          kind: q.t === 'm' ? 'multi' : q.t === 'j' ? 'judge' : 'choice',
          q: q.q,
          source: q.s,
          explain: q.e,
          opts: q.t === 'j' ? opts : shuffle(opts),
          correct: q.a,
          points: HARD.points,
        };
      });
  }

  /* ---- 判分與顯示用文字 ------------------------------------------------------ */
  function isCorrect(it, ans) {
    if (it.kind === 'pair') {
      if (!Array.isArray(ans)) return false;
      const [x, y] = ans.map(norm);
      // 寬鬆比對：只要輸入裡包含任一種可接受的寫法就算（例如「我們是 Eden 小壇」也算）
      const hit = (input, aliases) => input && aliases.some((a) => input.includes(norm(a)));
      const [g1, g2] = it.groups;
      return (hit(x, g1) && hit(y, g2)) || (hit(x, g2) && hit(y, g1));
    }
    if (it.kind === 'multi') {
      if (!ans || !ans.size) return false;
      return ans.size === it.correct.length && it.correct.every((i) => ans.has(i));
    }
    return ans === it.correct[0];
  }

  const optText = (it, idx) => it.opts.find((o) => o.idx === idx).text;

  function userText(it, ans) {
    if (ans == null) return '（未作答）';
    if (it.kind === 'pair') return ans.join('、');
    if (it.kind === 'multi') {
      return ans.size ? it.opts.filter((o) => ans.has(o.idx)).map((o) => o.text).join('、') : '（未作答）';
    }
    return optText(it, ans);
  }

  function correctText(it) {
    if (it.kind === 'pair') return it.show;
    return it.opts.filter((o) => it.correct.includes(o.idx)).map((o) => o.text).join('、');
  }

  // 評級對應的 Q 版插圖（assets/img/chibi/）
  const TIER_CHIBI = {
    剛入坑的萌新: 'tier-newbie',
    'Gal 新人': 'tier-new',
    'Gal 老手': 'tier-vet',
    'Gal 老資歷': 'tier-senior',
    婆羅門: 'tier-brahmin',
  };
  const chibi = (name, cls) =>
    el('img', { class: `chibi ${cls}`, src: `assets/img/chibi/${name}.webp`, alt: '', 'aria-hidden': 'true', decoding: 'async' });

  const tierOf = (tiers, ratio) => tiers.find((t) => ratio < t.below) || tiers[tiers.length - 1];

  /* ---- 狀態 ----------------------------------------------------------------- */
  let state = null; // { mode, items, answers }

  /* ---- 選擇模式畫面 --------------------------------------------------------- */
  function modeCard(mode, title, count, text) {
    return el('button', { class: 'quiz__mode', type: 'button', onclick: () => startQuiz(mode) }, [
      chibi(`mode-${mode}`, 'chibi--mode'),
      el('span', { class: 'quiz__mode-count' }, count),
      el('strong', {}, title),
      el('span', { class: 'quiz__mode-text' }, text),
      el('span', { class: 'quiz__mode-go' }, '開始作答 →'),
    ]);
  }

  function renderStart() {
    state = null;
    root.textContent = '';
    root.dataset.view = 'start';

    root.append(
      el('div', { class: 'quiz__modes' }, [
        modeCard('easy', '入門', `${easyQuestions().length} 題`, '用幾題輕鬆的題目熱身，看看自己是哪一級的 Gal 玩家。'),
        HARD
          ? modeCard(
              'hard',
              '婆羅門級',
              `${HARD.pick} 題`,
              `從 ${HARD.questions.length} 題題庫中隨機抽題，包含單選、多選與是非，冷門細節很多。多選題要全部選對才算對，不限時間。`
            )
          : null,
      ])
    );
    scrollTop();
  }

  /* ---- 作答畫面 ------------------------------------------------------------- */
  function startQuiz(mode) {
    const items = mode === 'hard' ? buildHardItems() : buildEasyItems();
    state = { mode, items, answers: items.map(() => null) };
    renderQuiz();
    scrollTop();
  }

  const isAnswered = (it, a) => a != null && (it.kind === 'multi' ? a.size > 0 : true);

  function renderQuiz() {
    root.textContent = '';
    root.dataset.view = 'quiz';

    const list = el('div', { class: 'quiz__list' });
    state.items.forEach((it, qi) => {
      const legend = el('legend', { class: 'quiz__legend' }, [
        el('span', { class: 'quiz__no' }, [
          `第 ${qi + 1} 題`,
          it.kind === 'multi' ? el('em', { class: 'quiz__badge' }, '多選，全部選對才算對') : null,
          it.kind === 'judge' ? el('em', { class: 'quiz__badge' }, '是非題') : null,
        ]),
        it.q,
      ]);
      const block = el('fieldset', { class: 'quiz__q' }, [legend]);

      if (it.image) {
        block.append(
          el('img', { class: 'quiz__img', src: it.image, alt: '題目圖片', loading: 'lazy', decoding: 'async' })
        );
      }

      if (it.kind === 'pair') {
        const row = el('div', { class: 'quiz__pair' });
        const inputs = it.fields.map((label) => {
          const input = el('input', {
            class: 'quiz__field',
            type: 'text',
            maxlength: '60',
            placeholder: label,
            autocomplete: 'off',
            'aria-label': `第 ${qi + 1} 題：${label}`,
            oninput: () => {
              const v = inputs.map((x) => x.value.trim());
              state.answers[qi] = v.every(Boolean) ? v : null;
              updateBar();
            },
          });
          row.append(input);
          return input;
        });
        block.append(row);
      } else {
        const multi = it.kind === 'multi';
        const opts = el('div', { class: `quiz__opts${it.kind === 'judge' ? ' quiz__opts--judge' : ''}` });
        it.opts.forEach((o, oi) => {
          const id = `quiz-${qi}-${oi}`;
          const input = el('input', {
            type: multi ? 'checkbox' : 'radio',
            name: `quiz-${qi}`,
            id,
            onchange: (e) => {
              if (multi) {
                const set = state.answers[qi] || new Set();
                if (e.target.checked) set.add(o.idx);
                else set.delete(o.idx);
                state.answers[qi] = set;
              } else {
                state.answers[qi] = o.idx;
              }
              updateBar();
            },
          });
          opts.append(
            el('label', { class: 'quiz__opt', for: id }, [
              input,
              el('span', { class: `quiz__key${multi ? ' quiz__key--box' : ''}` }, String.fromCharCode(65 + oi)),
              el('span', { class: 'quiz__text' }, o.text),
            ])
          );
        });
        block.append(opts);
      }

      if (it.source) block.append(el('p', { class: 'quiz__source' }, `題目出處：${it.source}`));
      list.append(block);
    });
    root.append(list);

    const left = el('span', { class: 'quiz__left' });
    const submit = el('button', { class: 'quiz__btn quiz__btn--main', type: 'button', onclick: submitQuiz }, '送出答案');
    root.append(
      el('div', { class: 'quiz__bar' }, [
        el('button', { class: 'quiz__btn quiz__btn--ghost', type: 'button', onclick: renderStart }, '換模式'),
        left,
        submit,
      ])
    );

    function updateBar() {
      const remain = state.items.filter((it, i) => !isAnswered(it, state.answers[i])).length;
      left.textContent = remain ? `還有 ${remain} 題未作答` : '全部作答完畢，可以送出了';
      submit.disabled = remain > 0;
    }
    updateBar();
  }

  /* ---- 結果與錯題回顧 ------------------------------------------------------- */
  function submitQuiz() {
    const results = state.items.map((it, i) => ({
      it,
      answer: state.answers[i],
      ok: isCorrect(it, state.answers[i]),
    }));
    renderResult(results);
  }

  function renderResult(results) {
    const hard = state.mode === 'hard';
    const total = results.length;
    const right = results.filter((r) => r.ok).length;
    const points = results.reduce((s, r) => s + (r.ok ? r.it.points : 0), 0);
    const maxPoints = results.reduce((s, r) => s + r.it.points, 0);
    const tier = tierOf(hard ? HARD.tiers : EASY.tiers, total ? right / total : 0);
    const wrong = results.filter((r) => !r.ok);

    root.textContent = '';
    root.dataset.view = 'result';

    root.append(
      el('section', { class: 'quiz__result', 'aria-live': 'polite' }, [
        TIER_CHIBI[tier.name] ? chibi(TIER_CHIBI[tier.name], 'chibi--tier') : null,
        hard ? el('p', { class: 'quiz__level' }, '婆羅門級') : null,
        el('p', { class: 'quiz__score' }, [
          '答對 ',
          el('strong', {}, `${right} / ${total}`),
          ' 題',
          hard ? `　得分 ${points} / ${maxPoints}` : '',
        ]),
        el('h3', { class: 'quiz__tier' }, tier.name),
        el('p', { class: 'quiz__note' }, tier.note),
      ])
    );

    const review = el('div', { class: 'quiz__review' });
    if (!wrong.length) {
      review.append(el('p', { class: 'quiz__allright' }, '全部答對，沒有錯題需要回顧。'));
    } else {
      review.append(el('h3', { class: 'quiz__review-title' }, `回顧錯題（${wrong.length} 題）`));
      wrong.forEach((r) => {
        const no = state.items.indexOf(r.it) + 1;
        const card = el('article', { class: 'quiz__wrong' }, [
          el('p', { class: 'quiz__wrong-q' }, [el('span', { class: 'quiz__no' }, `第 ${no} 題`), r.it.q]),
        ]);
        if (r.it.image) {
          card.append(el('img', { class: 'quiz__img', src: r.it.image, alt: '題目圖片', loading: 'lazy' }));
        }
        card.append(
          el('p', { class: 'quiz__line quiz__line--bad' }, [el('span', {}, '你的答案'), userText(r.it, r.answer)]),
          el('p', { class: 'quiz__line quiz__line--good' }, [el('span', {}, '正確答案'), correctText(r.it)])
        );
        if (r.it.explain) card.append(el('p', { class: 'quiz__explain' }, `解析：${r.it.explain}`));
        review.append(card);
      });
    }
    root.append(review);

    const mode = state.mode;
    root.append(
      el('div', { class: 'quiz__bar quiz__bar--result' }, [
        el('button', { class: 'quiz__btn quiz__btn--ghost', type: 'button', onclick: renderStart }, '換模式'),
        el('button', { class: 'quiz__btn quiz__btn--main', type: 'button', onclick: () => startQuiz(mode) }, '重新作答'),
      ])
    );
    scrollTop();
  }

  /* ---- 開啟面板時才建立 ------------------------------------------------------ */
  let built = false;
  dlg.addEventListener('intro:open', () => {
    if (!built) {
      built = true;
      renderStart();
    }
  });
  if (dlg.open) dlg.dispatchEvent(new CustomEvent('intro:open'));
})();
