/* =============================================================================
 * quiz.js — Gal 知識小測驗（漢堡選單 → 互動 → Gal 知識小測驗）
 * -----------------------------------------------------------------------------
 * 題目與評級在 quiz-data.js。判斷全部在瀏覽器內建完成，不需要後端：
 *   作答 → 送出 → 顯示評級與分數 → 可以回顧錯題、重新作答。
 * 選擇題的選項順序每次作答都會重新打亂，避免只記位置不記內容。
 * 面板第一次打開才建立畫面（由 intro.js 送出 intro:open 事件）。
 * ========================================================================== */
(function () {
  'use strict';

  const dlg = document.getElementById('intro-quiz');
  const Q = window.QUIZ;
  const root = document.getElementById('quiz-root');
  if (!dlg || !Q || !root || !window.U) return;

  const { el } = window.U;
  const questions = Q.questions.filter((q) => !q.disabled);

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

  function isCorrect(q, answer) {
    if (q.type === 'pair') {
      if (!Array.isArray(answer)) return false;
      const [x, y] = answer.map(norm);
      const hit = (input, aliases) => input && aliases.some((a) => norm(a) === input);
      const [g1, g2] = q.groups;
      return (hit(x, g1) && hit(y, g2)) || (hit(x, g2) && hit(y, g1));
    }
    return answer === q.answer;
  }

  function tierOf(score, total) {
    const ratio = total ? score / total : 0;
    return Q.tiers.find((t) => ratio < t.below) || Q.tiers[Q.tiers.length - 1];
  }

  /* ---- 作答畫面 ----------------------------------------------------------- */
  let state = null; // { order: [{q, options}], answers: [] }

  function startQuiz() {
    state = {
      items: questions.map((q) => ({
        q,
        options: q.type === 'choice' ? shuffle(q.options) : null,
      })),
      answers: questions.map(() => null),
    };
    renderQuiz();
  }

  function renderQuiz() {
    root.textContent = '';
    root.dataset.view = 'quiz';

    const list = el('div', { class: 'quiz__list' });
    state.items.forEach((it, qi) => {
      const block = el('fieldset', { class: 'quiz__q' }, [
        el('legend', { class: 'quiz__legend' }, [
          el('span', { class: 'quiz__no' }, `第 ${qi + 1} 題`),
          it.q.q,
        ]),
      ]);
      if (it.q.image) {
        block.append(
          el('img', { class: 'quiz__img', src: it.q.image, alt: '題目圖片', loading: 'lazy', decoding: 'async' })
        );
      }

      if (it.q.type === 'choice') {
        const opts = el('div', { class: 'quiz__opts' });
        it.options.forEach((text, oi) => {
          const id = `quiz-${qi}-${oi}`;
          const input = el('input', {
            type: 'radio',
            name: `quiz-${qi}`,
            id,
            value: text,
            onchange: () => {
              state.answers[qi] = text;
              updateBar();
            },
          });
          opts.append(
            el('label', { class: 'quiz__opt', for: id }, [
              input,
              el('span', { class: 'quiz__key' }, String.fromCharCode(65 + oi)),
              el('span', { class: 'quiz__text' }, text),
            ])
          );
        });
        block.append(opts);
      } else {
        const row = el('div', { class: 'quiz__pair' });
        const inputs = it.q.fields.map((label, fi) => {
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
      }
      list.append(block);
    });
    root.append(list);

    const left = el('span', { class: 'quiz__left' });
    const submit = el(
      'button',
      { class: 'quiz__btn quiz__btn--main', type: 'button', onclick: submitQuiz },
      '送出答案'
    );
    root.append(el('div', { class: 'quiz__bar' }, [left, submit]));

    function updateBar() {
      const remain = state.answers.filter((a) => a == null).length;
      left.textContent = remain ? `還有 ${remain} 題未作答` : '全部作答完畢，可以送出了';
      submit.disabled = remain > 0;
    }
    updateBar();
  }

  /* ---- 結果與錯題回顧 ----------------------------------------------------- */
  function submitQuiz() {
    const results = state.items.map((it, i) => ({
      it,
      answer: state.answers[i],
      ok: isCorrect(it.q, state.answers[i]),
    }));
    const score = results.filter((r) => r.ok).length;
    renderResult(results, score);
  }

  function renderResult(results, score) {
    const total = results.length;
    const tier = tierOf(score, total);
    const wrong = results.filter((r) => !r.ok);

    root.textContent = '';
    root.dataset.view = 'result';

    root.append(
      el('section', { class: 'quiz__result', 'aria-live': 'polite' }, [
        el('p', { class: 'quiz__score' }, [
          '答對 ',
          el('strong', {}, `${score} / ${total}`),
          ' 題',
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
          el('p', { class: 'quiz__wrong-q' }, [el('span', { class: 'quiz__no' }, `第 ${no} 題`), r.it.q.q]),
        ]);
        if (r.it.q.image) {
          card.append(el('img', { class: 'quiz__img', src: r.it.q.image, alt: '題目圖片', loading: 'lazy' }));
        }
        card.append(
          el('p', { class: 'quiz__line quiz__line--bad' }, [
            el('span', {}, '你的答案'),
            r.answer == null ? '（未作答）' : Array.isArray(r.answer) ? r.answer.join('、') : r.answer,
          ]),
          el('p', { class: 'quiz__line quiz__line--good' }, [
            el('span', {}, '正確答案'),
            r.it.q.type === 'pair' ? r.it.q.show : r.it.q.answer,
          ])
        );
        if (r.it.q.explain) card.append(el('p', { class: 'quiz__explain' }, r.it.q.explain));
        review.append(card);
      });
    }
    root.append(review);

    root.append(
      el('div', { class: 'quiz__bar quiz__bar--result' }, [
        el(
          'button',
          { class: 'quiz__btn quiz__btn--main', type: 'button', onclick: () => { startQuiz(); scrollTop(); } },
          '重新作答'
        ),
      ])
    );
    scrollTop();
  }

  function scrollTop() {
    const body = dlg.querySelector('.intro__body');
    if (body) body.scrollTop = 0;
  }

  /* ---- 開啟面板時才建立；每次開啟若已經送出過，保留結果，不強制重來 ------------- */
  let built = false;
  dlg.addEventListener('intro:open', () => {
    if (!built) {
      built = true;
      startQuiz();
    }
  });
  if (dlg.open) dlg.dispatchEvent(new CustomEvent('intro:open'));
})();
