/* =========================================================================
 * 인공지능 기초 웹교과서 — 공통 엔진 (core.js)
 *
 *  AI.page(cfg)            페이지 크롬(헤더·히어로·이동·푸터·학습도구) 생성
 *  AI.blanks               빈칸 채우기 모드 (본문 .blank 요소)
 *  AI.cloze(sel, cfg)      낱말 은행 빈칸 채우기 활동
 *  AI.quiz(sel, cfg)       확인 문제 (객관식·복수·OX·단답·순서·짝맞추기)
 *  AI.note(sel, cfg)       활동 기록(활동지) — 자동 저장
 *  AI.rubric(sel, cfg)     성취기준 자가평가
 *  AI.ui                   버튼·슬라이더·세그먼트·통계·로그 등 UI 도우미
 *  AI.sim                  시뮬레이터 패널·애니메이션 루프·난수
 *  AI.progress             학습 진도 저장 (localStorage)
 *  AI.renderHome() / AI.renderAreaIndex(no)   목차 페이지 자동 생성
 * ========================================================================= */
(function (global) {
  'use strict';

  const D = global.AIDATA;
  const STORE_KEY = 'aibasics.v1';

  /* =====================================================================
   * 0. 저수준 도우미
   * =================================================================== */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(3)) {
      if (kid === null || kid === undefined || kid === false) continue;
      e.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  /** HTML 문자열 → 요소 */
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }

  function $(sel, root) {
    if (sel instanceof Element) return sel;
    return (root || document).querySelector(sel);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** 정답 비교용 정규화: 공백·대소문자·괄호·마침표 무시 */
  function norm(s) {
    return String(s)
      .trim().toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[()[\]{}"'`.,·⋅;:!?~\-_/\\]/g, '');
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);

  /** 결정론적 난수 (mulberry32) */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    const a = arr.slice(), r = rand || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* =====================================================================
   * 1. 진도 저장
   * =================================================================== */
  const progress = (function () {
    let data = null;

    function load() {
      if (data) return data;
      try {
        data = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      } catch (_) { data = {}; }
      if (!data.pages) data.pages = {};
      if (!data.notes) data.notes = {};
      if (!data.rubric) data.rubric = {};
      return data;
    }

    function save() {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(load())); } catch (_) { /* 저장 불가 환경 무시 */ }
    }

    const EMPTY = Object.freeze({});

    /** 읽기 전용 조회 — 없는 키를 만들지 않는다 */
    function page(key) {
      return load().pages[key] || EMPTY;
    }

    /** 쓰기용 조회 — 없으면 만든다 */
    function ensure(key) {
      const d = load();
      if (!d.pages[key]) d.pages[key] = {};
      return d.pages[key];
    }

    /** 로컬 시간대 기준 오늘 날짜 (YYYY-MM-DD) */
    function today() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    return {
      all: load,
      page,
      visit(key) { const p = ensure(key); p.visited = true; p.at = today(); save(); },
      setQuiz(key, c, t) { const p = ensure(key); p.quiz = { c, t }; save(); },
      setBlank(key, c, t) { const p = ensure(key); p.blank = { c, t }; save(); },
      setCloze(key, id, c, t) { const p = ensure(key); (p.cloze || (p.cloze = {}))[id] = { c, t }; save(); },
      note(id, v) {
        const d = load();
        if (v === undefined) return d.notes[id] || '';
        d.notes[id] = v; save(); return v;
      },
      rubric(id, v) {
        const d = load();
        if (v === undefined) return d.rubric[id] || '';
        d.rubric[id] = v; save(); return v;
      },
      /** 활동 기록·자가평가의 이름표를 저장해 포트폴리오에서 사람이 읽을 수 있게 한다 */
      meta(kind, id, info) {
        const d = load();
        if (!d.meta) d.meta = {};
        if (!d.meta[kind]) d.meta[kind] = {};
        if (info === undefined) return d.meta[kind][id] || null;
        d.meta[kind][id] = info; save(); return info;
      },
      /** 영역 진도율(%) — 방문한 차시 비율 */
      areaPct(no) {
        const a = D.area(no); if (!a) return 0;
        const total = a.lessons.length + 1; // 차시 + 마무리
        let done = 0;
        a.lessons.forEach(l => { if (page(D.lessonKey(no, l.n)).visited) done++; });
        if (page(D.lessonKey(no, 'closing')).visited) done++;
        return Math.round(done / total * 100);
      },
      totalPct() {
        const s = D.AREAS.reduce((acc, a) => acc + progress.areaPct(a.no), 0);
        return Math.round(s / D.AREAS.length);
      },
      reset() { data = { pages: {}, notes: {}, rubric: {} }; save(); }
    };
  })();

  /* =====================================================================
   * 2. 토스트 · 테마
   * =================================================================== */
  let toastEl = null;
  function toast(msg, ms = 1900) {
    if (!toastEl) { toastEl = h('div', { class: 'toast' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  const theme = {
    get() { return localStorage.getItem('aibasics.theme') || 'auto'; },
    set(v) {
      if (v === 'auto') { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('aibasics.theme'); }
      else { document.documentElement.setAttribute('data-theme', v); localStorage.setItem('aibasics.theme', v); }
    },
    apply() { const v = this.get(); if (v !== 'auto') document.documentElement.setAttribute('data-theme', v); },
    isDark() {
      const v = this.get();
      if (v === 'dark') return true;
      if (v === 'light') return false;
      return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
    },
    toggle() { this.set(this.isDark() ? 'light' : 'dark'); global.dispatchEvent(new Event('ai:theme')); }
  };
  theme.apply();

  /* =====================================================================
   * 3. 빈칸 채우기 (본문 .blank)
   * =================================================================== */
  const blanks = (function () {
    let items = [];
    let on = false;
    let bar = null;
    let pageKey = '';

    function collect() {
      items = [...document.querySelectorAll('.blank')].map(node => {
        const raw = node.dataset.a || node.textContent;
        return {
          node,
          orig: node.innerHTML,
          answers: raw.split('|').map(s => s.trim()).filter(Boolean),
          hint: node.dataset.hint || '',
          input: null,
          state: ''
        };
      });
      return items;
    }

    function toBlank(it) {
      const len = Math.max(...it.answers.map(a => a.length));
      const w = clamp(len * 1.05 + 1.2, 3.4, 16);
      const inp = h('input', {
        type: 'text', class: 'blank-input', 'aria-label': '빈칸',
        placeholder: '?'.repeat(Math.min(len, 6)),
        autocomplete: 'off', spellcheck: 'false',
        style: { width: w + 'em' }
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); check(it); focusNext(it); }
      });
      inp.addEventListener('blur', () => { if (inp.value.trim()) check(it); });
      inp.addEventListener('input', () => {
        if (it.state) { it.state = ''; inp.classList.remove('ok', 'no'); clearMark(it); score(); }
      });
      it.input = inp;
      it.node.textContent = '';
      it.node.appendChild(inp);
      if (it.hint) {
        it.node.appendChild(h('button', {
          class: 'blank-hintbtn', type: 'button', title: '힌트 보기', 'aria-label': '힌트 보기',
          onclick: e => {
            e.preventDefault();
            const b = e.currentTarget;
            if (b.nextElementSibling && b.nextElementSibling.classList.contains('blank-hint')) return;
            b.after(h('span', { class: 'blank-hint', text: '💡 ' + it.hint }));
          }
        }, '?'));
      }
    }

    function clearMark(it) {
      const m = it.node.querySelector('.blank-mark');
      if (m) m.remove();
    }

    function check(it) {
      if (!it.input) return false;
      const v = it.input.value.trim();
      if (!v) return false;
      const ok = it.answers.some(a => norm(a) === norm(v));
      it.state = ok ? 'ok' : 'no';
      it.input.classList.toggle('ok', ok);
      it.input.classList.toggle('no', !ok);
      clearMark(it);
      it.input.after(h('span', { class: 'blank-mark ' + (ok ? 'ok' : 'no'), text: ok ? '✓' : '✗' }));
      score();
      return ok;
    }

    function focusNext(it) {
      const i = items.indexOf(it);
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].input && items[j].state !== 'ok') { items[j].input.focus(); return; }
      }
    }

    function score() {
      const c = items.filter(i => i.state === 'ok').length;
      const t = items.length;
      if (bar) {
        bar.querySelector('.bb-score').textContent = c + ' / ' + t;
      }
      if (pageKey) progress.setBlank(pageKey, c, t);
      return { c, t };
    }

    function enable() {
      on = true;
      document.body.classList.add('blank-mode');
      items.forEach(it => { it.state = ''; toBlank(it); });
      if (bar) {
        bar.querySelector('.bb-toggle').setAttribute('aria-pressed', 'true');
        bar.querySelector('.bb-toggle').textContent = '📖 읽기 모드로';
        bar.querySelector('.bb-acts').style.display = '';
      }
      score();
    }

    function disable() {
      on = false;
      document.body.classList.remove('blank-mode');
      items.forEach(it => { it.node.innerHTML = it.orig; it.input = null; it.state = ''; });
      if (bar) {
        bar.querySelector('.bb-toggle').setAttribute('aria-pressed', 'false');
        bar.querySelector('.bb-toggle').textContent = '✏️ 빈칸 채우기 모드';
        bar.querySelector('.bb-acts').style.display = 'none';
        bar.querySelector('.bb-score').textContent = '– / ' + items.length;
      }
    }

    function toggle() { on ? disable() : enable(); }

    function checkAll() {
      if (!on) enable();
      let blank = 0;
      items.forEach(it => { if (it.input && it.input.value.trim()) check(it); else blank++; });
      const { c, t } = score();
      toast(blank ? `${c}/${t} 정답 · 빈칸 ${blank}개가 비어 있어요` : `${c}/${t} 정답!`);
    }

    function revealAll() {
      if (!on) enable();
      items.forEach(it => {
        if (!it.input) return;
        it.input.value = it.answers[0];
        it.input.classList.remove('no');
        it.input.classList.add('ok');
        clearMark(it);
        it.input.after(h('span', { class: 'blank-mark ok', text: '✓' }));
      });
      toast('정답을 모두 표시했어요');
    }

    function mountBar(target) {
      if (!items.length) return null;
      bar = h('div', { class: 'blank-bar' },
        h('span', { class: 'bb-title', text: '핵심 용어 ' + items.length + '개' }),
        h('span', { class: 'bb-score', text: '– / ' + items.length }),
        h('span', { class: 'spacer' }),
        h('span', { class: 'bb-acts', style: { display: 'none' } },
          h('button', { class: 'btn small', type: 'button', onclick: checkAll }, '채점'),
          ' ',
          h('button', { class: 'btn small ghost', type: 'button', onclick: revealAll }, '정답 보기')
        ),
        h('button', { class: 'hbtn bb-toggle', type: 'button', 'aria-pressed': 'false', onclick: toggle }, '✏️ 빈칸 채우기 모드')
      );
      target.appendChild(bar);
      return bar;
    }

    return {
      init(key, barTarget) {
        pageKey = key || '';
        collect();
        if (barTarget) mountBar(barTarget);
        return items.length;
      },
      get count() { return items.length; },
      get on() { return on; },
      enable, disable, toggle, checkAll, revealAll, score
    };
  })();

  /* =====================================================================
   * 4. 낱말 은행 빈칸 채우기 활동  AI.cloze(sel, cfg)
   *    cfg = { id, title, sub, bank:[..], sents:[{text:'... {0} ...', answers:['a']}] }
   *    문장 안 {0} 자리가 빈칸이 되고, 은행에서 낱말을 골라 채운다.
   * =================================================================== */
  function cloze(sel, cfg) {
    const root = $(sel);
    if (!root) return null;
    const id = cfg.id || 'cloze';
    const slots = [];
    let armed = null; // 선택된 낱말 pill

    const box = h('div', { class: 'cloze' });
    box.appendChild(h('div', { class: 'cloze-head' },
      h('span', { class: 'q-icon', text: '🧩' }),
      h('span', { text: cfg.title || '낱말 채우기' })
    ));
    box.appendChild(h('p', { class: 'cloze-sub', text: cfg.sub || '아래 낱말을 골라 빈칸을 채워 보세요. 낱말을 누른 뒤 빈칸을 누르면 채워집니다.' }));

    const bank = h('div', { class: 'cloze-bank' }, h('span', { class: 'bank-label', text: '낱말 은행' }));
    const pills = shuffle(cfg.bank, rng(cfg.seed || 7)).map(w => {
      const p = h('button', { class: 'word-pill', type: 'button', 'aria-pressed': 'false' }, w);
      p.addEventListener('click', () => {
        if (p.classList.contains('used')) return;
        if (armed === p) { armed = null; p.setAttribute('aria-pressed', 'false'); unarmSlots(); return; }
        pills.forEach(q => q.setAttribute('aria-pressed', 'false'));
        armed = p; p.setAttribute('aria-pressed', 'true');
        slots.forEach(s => { if (!s.word) s.node.classList.add('armed'); });
      });
      bank.appendChild(p);
      return p;
    });
    box.appendChild(bank);

    function unarmSlots() { slots.forEach(s => s.node.classList.remove('armed')); }

    (cfg.sents || []).forEach((sent, si) => {
      const line = h('p', { class: 'cloze-sent' }, h('span', { class: 'n', text: (si + 1) + '.' }));
      const parts = String(sent.text).split(/(\{\d+\})/g);
      parts.forEach(part => {
        const m = part.match(/^\{(\d+)\}$/);
        if (!m) { line.appendChild(document.createTextNode(part)); return; }
        const ansIdx = Number(m[1]);
        const answers = [].concat(sent.answers ? sent.answers[ansIdx] : []).filter(Boolean);
        const node = h('span', { class: 'slot', role: 'button', tabindex: '0', text: '　　　' });
        const s = { node, word: null, answers, pill: null };
        function place() {
          if (s.word) { // 비우기
            s.pill.classList.remove('used');
            s.word = null; s.pill = null;
            node.textContent = '　　　';
            node.classList.remove('filled', 'ok', 'no');
            return;
          }
          if (!armed) return;
          s.word = armed.textContent;
          s.pill = armed;
          armed.classList.add('used');
          armed.setAttribute('aria-pressed', 'false');
          armed = null;
          node.textContent = s.word;
          node.classList.add('filled');
          node.classList.remove('ok', 'no');
          unarmSlots();
        }
        node.addEventListener('click', place);
        node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(); } });
        slots.push(s);
        line.appendChild(node);
      });
      box.appendChild(line);
    });

    const fb = h('div', { class: 'q-feedback' });
    const acts = h('div', { class: 'q-actions' },
      h('button', {
        class: 'btn primary', type: 'button', onclick: () => {
          let c = 0;
          slots.forEach(s => {
            const ok = s.word && s.answers.some(a => norm(a) === norm(s.word));
            s.node.classList.toggle('ok', !!ok);
            s.node.classList.toggle('no', !ok);
            if (ok) c++;
          });
          fb.className = 'q-feedback show ' + (c === slots.length ? 'ok' : 'no');
          fb.innerHTML = `<b>${c} / ${slots.length} 정답</b>` +
            (c === slots.length ? ' — 완벽해요! 🎉' : ' — 빨간 칸을 다시 확인해 보세요.');
          progress.setCloze(pageKeyRef.key, id, c, slots.length);
        }
      }, '채점하기'),
      h('button', {
        class: 'btn ghost', type: 'button', onclick: () => {
          slots.forEach(s => {
            if (s.pill) s.pill.classList.remove('used');
            s.word = null; s.pill = null;
            s.node.textContent = '　　　';
            s.node.className = 'slot';
          });
          pills.forEach(p => p.setAttribute('aria-pressed', 'false'));
          armed = null;
          fb.className = 'q-feedback';
        }
      }, '다시 풀기'),
      h('button', {
        class: 'btn ghost', type: 'button', onclick: () => {
          slots.forEach(s => {
            if (s.pill) s.pill.classList.remove('used');
            s.word = s.answers[0] || '';
            s.pill = pills.find(p => norm(p.textContent) === norm(s.word) && !p.classList.contains('used')) || null;
            if (s.pill) s.pill.classList.add('used');
            s.node.textContent = s.word;
            s.node.className = 'slot filled ok';
          });
          fb.className = 'q-feedback show ok';
          fb.innerHTML = '<b>정답</b> — 표시된 낱말을 확인해 보세요.';
        }
      }, '정답 보기')
    );
    box.appendChild(acts);
    box.appendChild(fb);
    root.appendChild(box);
    return box;
  }

  /* =====================================================================
   * 5. 확인 문제  AI.quiz(sel, cfg)
   *    item.type: 'mc' | 'multi' | 'ox' | 'short' | 'order' | 'match'
   * =================================================================== */
  function quiz(sel, cfg) {
    const root = $(sel);
    if (!root) return null;
    const items = cfg.items || [];
    const state = items.map(() => null); // true/false/null

    const box = h('div', { class: 'quiz' });
    const scoreEl = h('span', { class: 'q-score', text: '0 / ' + items.length });
    box.appendChild(h('div', { class: 'quiz-head' },
      h('span', { class: 'q-icon', text: '📝' }),
      h('h4', { text: cfg.title || '확인 문제' }),
      scoreEl
    ));
    box.appendChild(h('p', { class: 'q-sub', text: cfg.sub || '문제를 풀고 바로 해설을 확인해 보세요. 틀려도 괜찮아요 — 다시 풀 수 있습니다.' }));

    const TYPE_LABEL = { mc: '객관식', multi: '복수 정답', ox: 'O/X', short: '단답형', order: '순서 배열', match: '짝 맞추기' };

    function updateScore() {
      const c = state.filter(s => s === true).length;
      scoreEl.textContent = c + ' / ' + items.length;
      const answered = state.filter(s => s !== null).length;
      // 중간까지 푼 것도 기록에 남긴다
      if (answered) progress.setQuiz(pageKeyRef.key, c, items.length);
      resultEl.textContent = answered === items.length
        ? `모두 풀었어요 — ${c} / ${items.length} 정답 (${Math.round(c / items.length * 100)}점)`
        : `${answered} / ${items.length} 문항 풀이 완료`;
    }

    function feedback(fb, ok, why) {
      fb.className = 'q-feedback show ' + (ok ? 'ok' : 'no');
      fb.innerHTML = `<b>${ok ? '✓ 정답입니다' : '✗ 다시 생각해 봐요'}</b>` + (why ? '<br>' + why : '');
    }

    items.forEach((it, qi) => {
      const wrap = h('div', { class: 'q-item' });
      wrap.appendChild(h('div', { class: 'q-text' },
        h('span', { class: 'qno', text: qi + 1 }),
        h('span', { html: it.q }),
        h('span', { class: 'qtype', text: TYPE_LABEL[it.type] || '문제' })
      ));
      const body = h('div', { class: 'q-body' });
      const fb = h('div', { class: 'q-feedback' });

      /* ---- 객관식 / OX ---- */
      if (it.type === 'mc' || it.type === 'ox') {
        const choices = it.type === 'ox' ? ['O', 'X'] : it.choices;
        const ansIdx = it.type === 'ox' ? (it.answer ? 0 : 1) : it.answer;
        const list = h('div', { class: it.type === 'ox' ? 'ox-row' : 'q-choices' });
        const btns = choices.map((c, ci) => {
          const b = h('button', { class: 'q-choice', type: 'button', 'aria-pressed': 'false' },
            it.type === 'ox' ? null : h('span', { class: 'mk', text: '①②③④⑤⑥'[ci] || (ci + 1) }),
            h('span', { html: c })
          );
          b.addEventListener('click', () => {
            const ok = ci === ansIdx;
            btns.forEach((x, xi) => {
              x.disabled = true;
              x.classList.toggle('ok', xi === ansIdx);
              if (xi === ci && !ok) x.classList.add('no');
            });
            state[qi] = ok;
            feedback(fb, ok, it.why);
            updateScore();
            retry.style.display = '';
          });
          list.appendChild(b);
          return b;
        });
        const retry = h('button', {
          class: 'btn small ghost', type: 'button', style: { display: 'none' }, onclick: () => {
            btns.forEach(x => { x.disabled = false; x.className = 'q-choice'; x.setAttribute('aria-pressed', 'false'); });
            state[qi] = null; fb.className = 'q-feedback'; retry.style.display = 'none'; updateScore();
          }
        }, '다시 풀기');
        body.appendChild(list);
        body.appendChild(h('div', { class: 'q-actions' }, retry));
      }

      /* ---- 복수 정답 ---- */
      else if (it.type === 'multi') {
        const picked = new Set();
        const list = h('div', { class: 'q-choices' });
        const btns = it.choices.map((c, ci) => {
          const b = h('button', { class: 'q-choice', type: 'button', 'aria-pressed': 'false' },
            h('span', { class: 'mk', text: '①②③④⑤⑥'[ci] || (ci + 1) }),
            h('span', { html: c })
          );
          b.addEventListener('click', () => {
            if (picked.has(ci)) picked.delete(ci); else picked.add(ci);
            b.setAttribute('aria-pressed', picked.has(ci) ? 'true' : 'false');
          });
          list.appendChild(b);
          return b;
        });
        body.appendChild(list);
        body.appendChild(h('div', { class: 'q-actions' },
          h('button', {
            class: 'btn primary small', type: 'button', onclick: () => {
              const ans = new Set(it.answer);
              const ok = picked.size === ans.size && [...picked].every(x => ans.has(x));
              btns.forEach((x, xi) => {
                x.disabled = true;
                if (ans.has(xi)) x.classList.add('ok');
                else if (picked.has(xi)) x.classList.add('no');
              });
              state[qi] = ok; feedback(fb, ok, it.why); updateScore();
            }
          }, '확인'),
          h('button', {
            class: 'btn small ghost', type: 'button', onclick: () => {
              picked.clear();
              btns.forEach(x => { x.disabled = false; x.className = 'q-choice'; x.setAttribute('aria-pressed', 'false'); });
              state[qi] = null; fb.className = 'q-feedback'; updateScore();
            }
          }, '다시 풀기')
        ));
      }

      /* ---- 단답형 ---- */
      else if (it.type === 'short') {
        const inp = h('input', { type: 'text', placeholder: it.placeholder || '답을 입력하세요', autocomplete: 'off' });
        const answers = [].concat(it.answer);
        function grade() {
          const v = inp.value.trim();
          if (!v) { toast('답을 입력해 주세요'); return; }
          const ok = answers.some(a => norm(a) === norm(v));
          inp.style.borderColor = ok ? 'var(--ok)' : 'var(--no)';
          state[qi] = ok;
          feedback(fb, ok, (ok ? '' : `정답: <b>${esc(answers[0])}</b><br>`) + (it.why || ''));
          updateScore();
        }
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); grade(); } });
        body.appendChild(h('div', { class: 'q-short' }, inp,
          h('button', { class: 'btn primary small', type: 'button', onclick: grade }, '확인')));
      }

      /* ---- 순서 배열 ---- */
      else if (it.type === 'order') {
        // it.items: 정답 순서대로 적은 배열. 화면에는 섞어서 보여 준다.
        let cur = shuffle(it.items.map((_, i) => i), rng((it.seed || 3) + qi * 17));
        if (cur.every((v, i) => v === i)) cur = cur.slice().reverse();
        const list = h('div', { class: 'q-order' });
        function render() {
          list.innerHTML = '';
          cur.forEach((origIdx, pos) => {
            const row = h('div', { class: 'order-item' },
              h('span', { class: 'oh', text: pos + 1 }),
              h('span', { class: 'otxt', html: it.items[origIdx] }),
              h('span', { class: 'oc' },
                h('button', {
                  type: 'button', title: '위로', disabled: pos === 0,
                  onclick: () => { [cur[pos - 1], cur[pos]] = [cur[pos], cur[pos - 1]]; render(); }
                }, '▲'),
                h('button', {
                  type: 'button', title: '아래로', disabled: pos === cur.length - 1,
                  onclick: () => { [cur[pos + 1], cur[pos]] = [cur[pos], cur[pos + 1]]; render(); }
                }, '▼')
              )
            );
            list.appendChild(row);
          });
        }
        render();
        body.appendChild(list);
        body.appendChild(h('div', { class: 'q-actions' },
          h('button', {
            class: 'btn primary small', type: 'button', onclick: () => {
              const ok = cur.every((v, i) => v === i);
              [...list.children].forEach((row, pos) => row.classList.add(cur[pos] === pos ? 'ok' : 'no'));
              state[qi] = ok;
              feedback(fb, ok, (ok ? '' : '올바른 순서: ' + it.items.map((t, i) => (i + 1) + ') ' + t).join(' → ') + '<br>') + (it.why || ''));
              updateScore();
            }
          }, '확인'),
          h('button', {
            class: 'btn small ghost', type: 'button', onclick: () => {
              cur = shuffle(it.items.map((_, i) => i), rng(Date.parse(new Date()) % 9973 + qi));
              render(); state[qi] = null; fb.className = 'q-feedback'; updateScore();
            }
          }, '다시 섞기')
        ));
      }

      /* ---- 짝 맞추기 ---- */
      else if (it.type === 'match') {
        // it.left: [..], it.right: [..], it.answer: left i → right index
        const rows = it.left.map((L, li) => {
          const sel2 = h('select', {},
            h('option', { value: '' }, '— 고르기 —'),
            ...it.right.map((R, ri) => h('option', { value: ri }, R))
          );
          const row = h('div', { class: 'match-row' }, h('span', { class: 'ml', html: L }), sel2);
          return { row, sel: sel2, li };
        });
        const g = h('div', { class: 'q-match' }, ...rows.map(r => r.row));
        body.appendChild(g);
        body.appendChild(h('div', { class: 'q-actions' },
          h('button', {
            class: 'btn primary small', type: 'button', onclick: () => {
              let c = 0;
              rows.forEach(r => {
                const ok = String(it.answer[r.li]) === r.sel.value;
                r.row.classList.toggle('ok', ok);
                r.row.classList.toggle('no', !ok);
                if (ok) c++;
              });
              const ok = c === rows.length;
              state[qi] = ok;
              feedback(fb, ok, `${c} / ${rows.length} 짝을 맞혔어요.` + (it.why ? '<br>' + it.why : ''));
              updateScore();
            }
          }, '확인'),
          h('button', {
            class: 'btn small ghost', type: 'button', onclick: () => {
              rows.forEach(r => { r.sel.value = ''; r.row.className = 'match-row'; });
              state[qi] = null; fb.className = 'q-feedback'; updateScore();
            }
          }, '다시 풀기')
        ));
      }

      body.appendChild(fb);
      wrap.appendChild(body);
      box.appendChild(wrap);
    });

    const resultEl = h('span', { class: 'q-result', text: '0 / ' + items.length + ' 문항 풀이 완료' });
    box.appendChild(h('div', { class: 'q-foot' }, resultEl));
    root.appendChild(box);
    updateScore();
    return box;
  }

  /* =====================================================================
   * 6. 활동 기록 (활동지)  AI.note(sel, cfg)
   *    cfg = { id, title, prompt, fields:[{key,label,type,rows,placeholder}] }
   * =================================================================== */
  function note(sel, cfg) {
    const root = $(sel);
    if (!root) return null;
    const id = cfg.id;
    const fields = cfg.fields || [{ key: 'main', label: '', type: 'textarea', rows: 5 }];

    const box = h('div', { class: 'note' });
    const st = h('span', { class: 'n-state', text: '' });
    box.appendChild(h('div', { class: 'note-head' },
      h('span', { class: 'n-icon', text: '✍️' }),
      h('span', { text: cfg.title || '활동 기록' }),
      st
    ));
    if (cfg.prompt) box.appendChild(h('div', { class: 'note-prompt', html: cfg.prompt }));

    const saved = (() => { try { return JSON.parse(progress.note(id) || '{}'); } catch (_) { return {}; } })();
    const inputs = {};
    let tmr = null;

    // 포트폴리오에서 읽을 수 있도록 제목·필드 이름표를 남긴다
    progress.meta('notes', id, {
      title: cfg.title || '활동 기록',
      page: pageKeyRef.key,
      fields: fields.map(f => ({ key: f.key, label: f.label || '' }))
    });

    function persist() {
      const v = {};
      for (const k in inputs) v[k] = inputs[k].value;
      progress.note(id, JSON.stringify(v));
      st.textContent = '저장됨 ✓';
      clearTimeout(tmr);
      tmr = setTimeout(() => { st.textContent = ''; }, 1600);
    }

    const grid = h('div', { class: 'field-row' });
    const longs = [];
    fields.forEach(f => {
      const control = (f.type === 'text' || f.type === 'select')
        ? (f.type === 'select'
          ? h('select', {}, ...[''].concat(f.options || []).map(o => h('option', { value: o }, o || '— 선택 —')))
          : h('input', { type: 'text', placeholder: f.placeholder || '' }))
        : h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' });
      control.value = saved[f.key] || '';
      control.addEventListener('input', persist);
      control.addEventListener('change', persist);
      inputs[f.key] = control;
      const wrapF = h('div', { class: 'field' }, f.label ? h('label', { text: f.label }) : null, control);
      if (f.type === 'text' || f.type === 'select') grid.appendChild(wrapF);
      else longs.push(wrapF);
    });
    if (grid.children.length) box.appendChild(grid);
    longs.forEach(x => box.appendChild(x));

    box.appendChild(h('div', { class: 'note-foot' },
      h('button', { class: 'btn small', type: 'button', onclick: persist }, '저장'),
      h('button', {
        class: 'btn small ghost', type: 'button', onclick: () => {
          const txt = fields.map(f => (f.label ? '■ ' + f.label + '\n' : '') + (inputs[f.key].value || '(작성하지 않음)')).join('\n\n');
          navigator.clipboard ? navigator.clipboard.writeText(txt).then(() => toast('활동 기록을 복사했어요')) : toast('복사를 지원하지 않는 환경이에요');
        }
      }, '복사'),
      h('span', { class: 'hintxt', text: '입력한 내용은 이 브라우저에 자동 저장돼요.' })
    ));
    root.appendChild(box);
    return box;
  }

  /* =====================================================================
   * 7. 자가평가  AI.rubric(sel, {items:[{std, text}]})
   * =================================================================== */
  function rubric(sel, cfg) {
    const root = $(sel);
    if (!root) return null;
    const box = h('div', { class: 'rubric' });
    (cfg.items || []).forEach((it, i) => {
      const rid = (cfg.id || 'r') + '-' + i;
      const cur = progress.rubric(rid);
      progress.meta('rubric', rid, { std: it.std || '', text: it.text || '', page: pageKeyRef.key });
      const row = h('div', { class: 'rubric-row' });
      row.appendChild(h('div', { class: 'rq' },
        it.std ? h('code', { text: it.std }) : null,
        h('span', { html: it.text })
      ));
      const lvRow = h('div', { class: 'lv-row' });
      const btns = D.LEVELS.map(L => {
        const b = h('button', {
          class: 'lv', type: 'button', 'aria-pressed': cur === L.g ? 'true' : 'false',
          title: L.desc
        }, L.g, h('small', { text: L.label }));
        b.addEventListener('click', () => {
          btns.forEach(x => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          progress.rubric(rid, L.g);
          toast(`${L.g} · ${L.label} 로 기록했어요`);
        });
        lvRow.appendChild(b);
        return b;
      });
      row.appendChild(lvRow);
      box.appendChild(row);
    });
    root.appendChild(box);
    return box;
  }

  /* =====================================================================
   * 8. UI 도우미
   * =================================================================== */
  const ui = {
    h, el, esc,

    btn(label, onClick, variant) {
      return h('button', { class: 'btn' + (variant ? ' ' + variant : ''), type: 'button', onclick: onClick }, label);
    },

    /** 슬라이더 — {el, input, set(v), value} */
    slider(o) {
      const out = h('b', { text: (o.value ?? o.min) + (o.unit || '') });
      const input = h('input', {
        type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value ?? o.min
      });
      const wrap = h('div', { class: 'ctl', style: o.width ? { minWidth: o.width } : null },
        h('label', {}, h('span', { text: o.label }), out), input);
      function report() {
        const v = Number(input.value);
        out.textContent = (o.format ? o.format(v) : v) + (o.unit || '');
        if (o.onInput) o.onInput(v);
      }
      input.addEventListener('input', report);
      out.textContent = (o.format ? o.format(Number(input.value)) : input.value) + (o.unit || '');
      return {
        el: wrap, input,
        get value() { return Number(input.value); },
        set(v) { input.value = v; report(); }
      };
    },

    /** 세그먼트 버튼 — {el, value, set(v)} */
    seg(o) {
      let value = o.value ?? (o.options[0] && (o.options[0].value ?? o.options[0]));
      const box = h('div', { class: 'seg', role: 'group', 'aria-label': o.label || '선택' });
      const btns = o.options.map(op => {
        const v = op.value ?? op;
        const t = op.label ?? op;
        const b = h('button', { type: 'button', 'aria-pressed': v === value ? 'true' : 'false' }, t);
        b.addEventListener('click', () => {
          value = v;
          btns.forEach(x => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          if (o.onChange) o.onChange(v);
        });
        box.appendChild(b);
        return b;
      });
      return {
        el: box,
        get value() { return value; },
        set(v) { const i = o.options.findIndex(op => (op.value ?? op) === v); if (i >= 0) btns[i].click(); }
      };
    },

    /** 통계 표시 — {el, set(key, val)} */
    stats(spec) {
      const map = {};
      const box = h('div', { class: 'sim-stats' });
      spec.forEach(s => {
        const v = h('span', { class: 'v', text: s.value ?? '–' });
        map[s.key] = v;
        box.appendChild(h('div', { class: 'sim-stat', title: s.title || '' },
          h('span', { class: 'l', text: s.label }), v));
      });
      return { el: box, set(k, val) { if (map[k]) map[k].textContent = val; } };
    },

    /** 실행 로그 — {el, add(msg), clear()} */
    log(o) {
      const box = h('div', { class: 'sim-log', 'aria-live': 'polite' });
      let n = 0;
      return {
        el: box,
        add(msg, em) {
          n++;
          box.appendChild(h('div', {},
            h('span', { class: 't', text: String(n).padStart(2, '0') }),
            h('span', { class: em ? 'em' : '', html: msg })));
          box.scrollTop = box.scrollHeight;
        },
        clear() { box.innerHTML = ''; n = 0; }
      };
    },

    /** 범례 — items:[{color,label}] */
    legend(items) {
      return h('div', { class: 'legend' }, ...items.map(i =>
        h('span', {}, h('i', { style: { background: i.color } }), i.label)));
    },

    /** 표 만들기 */
    table(headers, rows, opt) {
      const t = h('table', { class: 'tb' },
        h('thead', {}, h('tr', {}, ...headers.map(x => h('th', { html: x })))),
        h('tbody', {}, ...rows.map(r => h('tr', {}, ...r.map(c =>
          h('td', typeof c === 'object' && c && !(c instanceof Node) ? { class: c.cls, html: c.html } : { html: c })))))
      );
      const w = h('div', { class: 'table-wrap' }, opt && opt.caption ? null : null, t);
      if (opt && opt.caption) t.insertBefore(h('caption', { html: opt.caption }), t.firstChild);
      return w;
    },

    toast, theme
  };

  /* =====================================================================
   * 9. 시뮬레이터 도우미
   * =================================================================== */
  const sim = {
    rng, shuffle, clamp, lerp, fmt, norm,

    /** 시뮬레이터 패널 생성 → 본문(body) 요소 반환 */
    panel(sel, o) {
      const root = $(sel);
      if (!root) return null;
      const body = h('div', { class: 'sim-body' });
      const p = h('div', { class: 'sim-panel' },
        h('div', { class: 'sim-head' },
          h('span', { class: 'dot' }),
          h('span', { class: 'sim-title', text: o.title }),
          h('span', { class: 'sim-tag', text: o.tag || '시뮬레이터' })
        ),
        body
      );
      if (o.desc) body.appendChild(h('p', { class: 'sim-desc', html: o.desc }));
      root.appendChild(p);
      return body;
    },

    /** 캔버스 (고해상도 대응) — {canvas, ctx, w, h, clear()} */
    canvas(w, h2, opt) {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const c = h('canvas', { class: 'sim', width: w * dpr, height: h2 * dpr, style: { width: w + 'px', height: h2 + 'px' } });
      if (opt && opt.maxFull) c.style.maxWidth = '100%';
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      return {
        canvas: c, ctx, w, h: h2, dpr,
        wrap: h('div', { class: 'sim-canvas-wrap' }, c),
        clear(bg) {
          ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h2); } else ctx.clearRect(0, 0, w, h2);
          ctx.restore();
        },
        /** 마우스/터치 좌표 → 캔버스 논리 좌표 */
        pos(ev) {
          const r = c.getBoundingClientRect();
          const t = ev.touches ? ev.touches[0] : ev;
          return { x: (t.clientX - r.left) * (w / r.width), y: (t.clientY - r.top) * (h2 / r.height) };
        }
      };
    },

    /** 현재 테마에 맞는 그리기 색 */
    colors() {
      const dark = theme.isDark();
      return {
        dark,
        bg: dark ? '#21242d' : '#ffffff',
        grid: dark ? '#333846' : '#e6eaf2',
        axis: dark ? '#6b7382' : '#98a0b0',
        ink: dark ? '#eef0f5' : '#16181d',
        ink3: dark ? '#98a0b0' : '#6b7382',
        a: dark ? '#8ba4ff' : '#3b5bdb',
        b: dark ? '#4ecfb4' : '#0d8f7a',
        c: dark ? '#f0a866' : '#b3541e',
        d: dark ? '#bd97f5' : '#7a44c9',
        ok: dark ? '#56d0a0' : '#128a5b',
        no: dark ? '#ff8b9d' : '#c8354a',
        warn: dark ? '#e8b356' : '#a86400'
      };
    },

    /** 재생/일시정지/한 단계 루프 — {play,pause,toggle,step,reset,playing} */
    loop(o) {
      let timer = null, playing = false;
      const fps = o.fps || 5;
      function tick() {
        const cont = o.step();
        if (cont === false) pause();
      }
      function play() {
        if (playing) return;
        playing = true;
        timer = setInterval(tick, 1000 / fps);
        if (o.onState) o.onState(true);
      }
      function pause() {
        playing = false;
        clearInterval(timer); timer = null;
        if (o.onState) o.onState(false);
      }
      return {
        play, pause,
        toggle() { playing ? pause() : play(); },
        step() { pause(); tick(); },
        get playing() { return playing; },
        setFps(f) { if (playing) { pause(); o.fps = f; play(); } }
      };
    },

    /** requestAnimationFrame 애니메이션 — stop() 반환 */
    raf(fn) {
      let id = 0, on = true, t0 = performance.now();
      (function frame(t) {
        if (!on) return;
        fn((t - t0) / 1000);
        id = requestAnimationFrame(frame);
      })(t0);
      return () => { on = false; cancelAnimationFrame(id); };
    }
  };

  /* =====================================================================
   * 10. 페이지 크롬
   * =================================================================== */
  const pageKeyRef = { key: '' };

  function buildHeader(cfg, base) {
    const a = cfg.area ? D.area(cfg.area) : null;
    const crumb = h('nav', { class: 'crumb', 'aria-label': '현재 위치' });
    crumb.appendChild(h('a', { href: base + 'index.html' }, '🏠 웹교과서'));
    if (a) {
      crumb.appendChild(h('span', { class: 'sep mid', text: '›' }));
      crumb.appendChild(h('a', { class: 'mid', href: base + a.dir + '/index.html' }, a.no + '단원 ' + a.title));
    }
    crumb.appendChild(h('span', { class: 'sep', text: '›' }));
    crumb.appendChild(h('span', { class: 'here', text: cfg.crumb || (cfg.lesson === 'closing' ? '단원 마무리' : cfg.lesson ? cfg.lesson + '차시' : cfg.title) }));

    return h('header', { class: 'tb-header' },
      h('div', { class: 'bar' },
        crumb,
        h('span', { class: 'spacer' }),
        h('button', {
          class: 'hbtn', type: 'button', title: '밝은/어두운 화면 전환',
          onclick: e => { theme.toggle(); e.currentTarget.textContent = theme.isDark() ? '☀️' : '🌙'; }
        }, theme.isDark() ? '☀️' : '🌙'),
        h('a', { class: 'hbtn', href: base + 'portfolio.html', title: '학습 포트폴리오' }, '📊 내 학습')
      )
    );
  }

  function buildHero(cfg) {
    const a = cfg.area ? D.area(cfg.area) : null;
    const hero = h('section', { class: 'hero' });
    const w = h('div', { class: 'wrap' });

    const eyebrow = h('div', { class: 'eyebrow' });
    if (a) eyebrow.appendChild(h('span', { text: a.no + '단원 · ' + a.title }));
    if (cfg.lesson && cfg.lesson !== 'closing') eyebrow.appendChild(h('span', { text: '· ' + cfg.lesson + '차시' }));
    if (cfg.lesson === 'closing') eyebrow.appendChild(h('span', { text: '· 단원 마무리' }));
    w.appendChild(eyebrow);

    w.appendChild(h('h1', {}, cfg.title, cfg.sub ? h('span', { class: 'sub', text: cfg.sub }) : null));
    if (cfg.lead) w.appendChild(h('p', { class: 'lead', html: cfg.lead }));

    if (cfg.standards && cfg.standards.length) {
      const chips = h('div', { class: 'chips' });
      cfg.standards.forEach(s => chips.appendChild(
        h('span', { class: 'std-badge', title: D.STANDARDS[s] || '', text: s })));
      (cfg.keywords || []).forEach(k => chips.appendChild(h('span', { class: 'chip', text: k })));
      w.appendChild(chips);
    } else if (cfg.keywords && cfg.keywords.length) {
      const chips = h('div', { class: 'chips' });
      cfg.keywords.forEach(k => chips.appendChild(h('span', { class: 'chip', text: k })));
      w.appendChild(chips);
    }

    if (cfg.goals && cfg.goals.length) {
      w.appendChild(h('div', { class: 'goals' },
        h('div', { class: 'goals-label', text: '이 차시의 학습 목표' }),
        h('ul', {}, ...cfg.goals.map(g => h('li', { html: g })))
      ));
    }

    if (cfg.standards && cfg.standards.length) {
      const dl = h('div', { class: 'more-body', style: { padding: '3px 0 0' } },
        h('ul', { style: { margin: 0 } }, ...cfg.standards.map(s =>
          h('li', {}, h('code', { text: s }), ' ', D.STANDARDS[s] || ''))));
      w.appendChild(h('details', { class: 'more-box', style: { margin: '14px 0 0' } },
        h('summary', {}, h('span', { class: 'plus-tag', text: '성취기준' }), ' 이 차시가 다루는 성취기준 원문'),
        h('div', { class: 'more-body' }, dl)));
    }

    hero.appendChild(w);
    return hero;
  }

  function buildNav(cfg, base) {
    if (!cfg.area) return null;
    const a = D.area(cfg.area);
    const seq = [...a.lessons.map(l => ({ href: l.file, label: l.n + '차시 · ' + l.title })),
    { href: 'closing.html', label: '단원 마무리' }];
    let idx = -1;
    if (cfg.lesson === 'closing') idx = seq.length - 1;
    else if (cfg.lesson) idx = a.lessons.findIndex(l => l.n === Number(cfg.lesson));
    if (idx < 0) return null;

    const prev = idx > 0 ? seq[idx - 1] : { href: 'index.html', label: a.no + '단원 목차' };
    let next = idx < seq.length - 1 ? seq[idx + 1] : null;
    if (!next) {
      const na = D.area(a.no + 1);
      next = na ? { href: '../' + na.dir + '/index.html', label: na.no + '단원 · ' + na.title } : { href: base + 'portfolio.html', label: '내 학습 포트폴리오' };
    }

    return h('nav', { class: 'nav-foot' },
      h('a', { href: prev.href }, h('span', { class: 'dir', text: '← 이전' }), h('span', { class: 'where', text: prev.label })),
      h('a', { class: 'next', href: next.href }, h('span', { class: 'dir', text: '다음 →' }), h('span', { class: 'where', text: next.label }))
    );
  }

  function buildFooter(base) {
    return h('footer', { class: 'tb-footer' },
      h('div', { class: 'fwrap' },
        h('span', { text: '인공지능 기초 웹교과서 · 2022 개정 교육과정 (고등학교 진로 선택)' }),
        h('span', { class: 'spacer' }),
        h('a', { href: base + 'index.html' }, '단원 목록'),
        h('a', { href: base + 'portfolio.html' }, '내 학습'),
        h('a', { href: '#', onclick: e => { e.preventDefault(); global.print(); } }, '인쇄')
      ),
      h('div', { class: 'flic' },
        h('div', {}, '제작 및 문의 : ',
          h('a', { href: 'mailto:enssam21@gmail.com' }, 'enssam21@gmail.com')),
        h('div', {}, '이 웹페이지의 무단 배포 및 상업적 이용을 금합니다. 학교 수업 목적으로만 이용해 주세요.'),
        h('div', {}, h('b', {}, '© 2026 티쳐무'), ' · 모든 권리 보유')
      )
    );
  }

  function buildDock(cfg, base) {
    const panel = h('div', { class: 'dock-panel', id: 'dockPanel' });
    panel.appendChild(h('h5', { text: '학습 도구' }));

    const pct = progress.totalPct();
    panel.appendChild(h('div', { class: 'drow' }, h('span', { text: '전체 진도' }), h('span', { class: 'spacer', style: { flex: '1' } }), h('b', { text: pct + '%' })));
    panel.appendChild(h('div', { class: 'dock-prog' }, h('i', { style: { width: pct + '%' } })));

    if (blanks.count) {
      panel.appendChild(h('div', { class: 'drow' },
        h('button', { class: 'btn small', type: 'button', onclick: () => blanks.toggle() }, '✏️ 빈칸 모드 켜기/끄기')));
    }
    panel.appendChild(h('div', { class: 'drow' },
      h('button', { class: 'btn small', type: 'button', onclick: () => global.print() }, '🖨 이 쪽 인쇄하기')));
    panel.appendChild(h('div', { class: 'drow' },
      h('a', { class: 'btn small', href: base + 'portfolio.html' }, '📊 내 학습 포트폴리오')));
    panel.appendChild(h('div', { class: 'drow' },
      h('button', {
        class: 'btn small ghost', type: 'button', onclick: () => {
          if (confirm('이 브라우저에 저장된 학습 기록(진도·활동 기록·자가평가)을 모두 지울까요?')) {
            progress.reset(); toast('학습 기록을 초기화했어요'); setTimeout(() => location.reload(), 700);
          }
        }
      }, '기록 초기화')));

    const fab = h('button', {
      class: 'dock-fab', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'dockPanel', title: '학습 도구 열기',
      onclick: e => {
        const open = panel.classList.toggle('open');
        e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    }, '🎒');

    return h('div', { class: 'dock' }, panel, fab);
  }

  /**
   * 페이지 크롬을 만든다.
   * cfg = { area, lesson, title, sub, lead, standards[], keywords[], goals[],
   *         crumb, base, blankBar:false, noHero:false }
   */
  function page(cfg) {
    cfg = cfg || {};
    const base = cfg.base || (cfg.area ? '../' : './');
    if (cfg.area) document.documentElement.setAttribute('data-area', cfg.area);

    pageKeyRef.key = cfg.area ? D.lessonKey(cfg.area, cfg.lesson || 1) : (cfg.key || 'home');

    const top = document.getElementById('tb-top');
    const bottom = document.getElementById('tb-bottom');

    if (top) {
      top.appendChild(buildHeader(cfg, base));
      if (!cfg.noHero) top.appendChild(buildHero(cfg));
    }

    // 본문 첫머리에 빈칸 모드 바
    const main = document.querySelector('main');
    let barHolder = null;
    if (main && cfg.blankBar !== false) {
      barHolder = h('div');
      main.insertBefore(barHolder, main.firstChild);
    }
    blanks.init(pageKeyRef.key, barHolder);
    if (barHolder && !barHolder.firstChild) barHolder.remove();

    if (bottom) {
      const nav = buildNav(cfg, base);
      if (nav && main) main.appendChild(nav);
      bottom.appendChild(buildFooter(base));
      bottom.appendChild(buildDock(cfg, base));
    }

    if (cfg.area) progress.visit(pageKeyRef.key);

    // 테마 변경 시 시뮬레이터 다시 그리기 신호
    global.addEventListener('ai:theme', () => global.dispatchEvent(new Event('ai:redraw')));

    return { key: pageKeyRef.key, base };
  }

  /* =====================================================================
   * 11. 목차 페이지 자동 생성
   * =================================================================== */
  function renderHome(sel) {
    const root = $(sel || '#home');
    if (!root) return;

    const pct = progress.totalPct();
    const done = D.AREAS.reduce((s, a) =>
      s + a.lessons.filter(l => progress.page(D.lessonKey(a.no, l.n)).visited).length, 0);

    root.appendChild(h('div', { class: 'stat-strip' },
      h('div', { class: 'stat-box' }, h('span', { class: 'sl', text: '전체 진도' }), h('span', { class: 'sv' }, pct, h('small', { text: '%' }))),
      h('div', { class: 'stat-box' }, h('span', { class: 'sl', text: '학습한 차시' }), h('span', { class: 'sv' }, done, h('small', { text: ' / ' + D.totalLessons() }))),
      h('div', { class: 'stat-box' }, h('span', { class: 'sl', text: '영역' }), h('span', { class: 'sv' }, D.AREAS.length, h('small', { text: '개' }))),
      h('div', { class: 'stat-box' }, h('span', { class: 'sl', text: '성취기준' }), h('span', { class: 'sv' }, Object.keys(D.STANDARDS).length, h('small', { text: '개' })))
    ));

    const grid = h('div', { class: 'area-grid' });
    D.AREAS.forEach(a => {
      const p = progress.areaPct(a.no);
      const stds = a.lessons.flatMap(l => l.std);
      const range = stds.length ? stds[0] + ' ~ ' + stds[stds.length - 1] : '';
      grid.appendChild(h('a', { class: 'area-card', href: a.dir + '/index.html', dataset: { ac: a.no } },
        h('span', { class: 'ac-no', text: a.no }),
        h('h3', {}, h('span', { text: a.icon }), a.title),
        h('p', { class: 'ac-tag', text: a.tagline }),
        h('p', { text: a.summary }),
        h('div', { class: 'ac-meta' },
          h('span', { class: 'ac-std', text: range }),
          h('span', { text: a.lessons.length + '차시 + 마무리' }),
          h('span', { style: { marginLeft: 'auto' }, text: p + '% 학습' })
        ),
        h('div', { class: 'ac-bar' }, h('i', { style: { width: p + '%' } }))
      ));
    });
    root.appendChild(grid);
  }

  function renderAreaIndex(no, sel) {
    const a = D.area(no);
    const root = $(sel || '#areaIndex');
    if (!a || !root) return;

    // 핵심 아이디어
    root.appendChild(h('div', { class: 'box box-think' },
      h('div', { class: 'box-label', text: '💡 이 단원의 핵심 아이디어' }),
      h('ul', { style: { margin: 0 } }, ...a.ideas.map(i => h('li', { text: i })))
    ));

    // 내용 요소
    const rows = Object.entries(a.elements).map(([k, v]) =>
      [`<b>${k}</b>`, v.map(x => '· ' + esc(x)).join('<br>')]);
    root.appendChild(h('div', { class: 'section' },
      h('div', { class: 'sec-head' }, h('span', { class: 'sec-num', text: '내용' }), h('h2', { text: '무엇을 배울까?' })),
      ui.table(['범주', '내용 요소'], rows)
    ));

    // 차시 목록
    const list = h('div', { class: 'lesson-list' });
    a.lessons.forEach(l => {
      const visited = progress.page(D.lessonKey(a.no, l.n)).visited;
      list.appendChild(h('a', { class: 'lesson-card' + (visited ? ' done' : ''), href: l.file },
        h('span', { class: 'lc-no' }, h('b', { text: l.n }), h('small', { text: '차시' })),
        h('span', { class: 'lc-body' },
          h('span', { class: 'lc-title', text: l.title }),
          h('span', { class: 'lc-sub', text: l.sub }),
          h('span', { class: 'lc-meta' },
            ...l.std.map(s => h('span', { class: 'lc-std', text: s, title: D.STANDARDS[s] })),
            h('span', { class: 'lc-sim', text: '🕹 ' + l.sim })
          )
        ),
        h('span', { class: 'lc-go', text: visited ? '✓' : '→' })
      ));
    });
    const cVisited = progress.page(D.lessonKey(a.no, 'closing')).visited;
    list.appendChild(h('a', { class: 'lesson-card closing' + (cVisited ? ' done' : ''), href: 'closing.html' },
      h('span', { class: 'lc-no' }, h('b', { text: '★' })),
      h('span', { class: 'lc-body' },
        h('span', { class: 'lc-title', text: '단원 마무리' }),
        h('span', { class: 'lc-sub', text: '개념 지도 · 단원 평가 · 서·논술형 · 자가평가' }),
        h('span', { class: 'lc-meta' }, h('span', { class: 'lc-sim', text: '📋 배운 내용을 정리하고 스스로 점검해요' }))
      ),
      h('span', { class: 'lc-go', text: cVisited ? '✓' : '→' })
    ));

    root.appendChild(h('div', { class: 'section' },
      h('div', { class: 'sec-head' }, h('span', { class: 'sec-num', text: '차시' }),
        h('h2', { text: '차시 구성' }),
        h('span', { class: 'sec-tag', text: progress.areaPct(a.no) + '% 학습 완료' })),
      list
    ));

    // 성취기준
    const stdRows = a.lessons.flatMap(l => l.std).filter((v, i, arr) => arr.indexOf(v) === i)
      .map(s => [`<code>${s}</code>`, D.STANDARDS[s]]);
    root.appendChild(h('div', { class: 'section' },
      h('div', { class: 'sec-head' }, h('span', { class: 'sec-num', text: '기준' }), h('h2', { text: '이 단원의 성취기준' })),
      ui.table(['코드', '성취기준'], stdRows)
    ));
  }

  /* =====================================================================
   * 12. 공개 API
   * =================================================================== */
  global.AI = {
    page, renderHome, renderAreaIndex,
    blanks, cloze, quiz, note, rubric,
    ui, sim, progress, toast, theme,
    h, el, $, esc, norm, clamp, lerp, fmt, rng, shuffle,
    get pageKey() { return pageKeyRef.key; },
    DATA: D
  };
})(window);
