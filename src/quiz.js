// Quiz mode: Gemini generates a multiple-choice quiz for the active role,
// the user answers one question at a time, then reviews the results.

import { h, renderMarkdown, renderInline } from './dom.js';
import { PERSONAS } from './personas.js';
import { generateJSON, friendlyError } from './gemini.js';

const STATS_STORAGE = 'aiprep.quizStats';
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const COUNTS = [5, 10, 15];
const LETTERS = ['A', 'B', 'C', 'D'];

/** Per-role quiz state, kept in memory so switching roles doesn't lose progress. */
const quizzes = {};

function getQuiz(role) {
  quizzes[role] ??= {
    status: 'setup', // setup | loading | active | done
    topic: 'Mixed',
    difficulty: 'Intermediate',
    count: 5,
    questions: [],
    index: 0,
    answers: [], // chosen option index per question
    error: '',
    controller: null,
  };
  return quizzes[role];
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_STORAGE) || '{}');
  } catch {
    return {};
  }
}

function recordResult(role, score, total) {
  const stats = loadStats();
  const s = (stats[role] ??= { taken: 0, bestPct: 0, last: null });
  s.taken += 1;
  s.bestPct = Math.max(s.bestPct, Math.round((score / total) * 100));
  s.last = { score, total };
  localStorage.setItem(STATS_STORAGE, JSON.stringify(stats));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Validates model output and shuffles options so the answer position is random. */
function normaliseQuestions(data, wanted) {
  const list = Array.isArray(data) ? data : data?.questions;
  if (!Array.isArray(list)) throw new Error('The quiz came back in an unexpected format. Please try again.');

  const valid = list
    .filter(
      (q) =>
        q &&
        typeof q.question === 'string' &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every((o) => typeof o === 'string' && o.trim()) &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < 4,
    )
    .slice(0, wanted)
    .map((q) => {
      const order = shuffle([0, 1, 2, 3]);
      return {
        question: q.question.trim(),
        options: order.map((i) => q.options[i].trim()),
        answer: order.indexOf(q.answer),
        explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
      };
    });

  if (valid.length === 0) throw new Error('The quiz came back empty. Please try again.');
  return valid;
}

function buildPrompt(persona, quiz) {
  const topic = quiz.topic === 'Mixed' ? `a mix of: ${persona.quizTopics.join(', ')}` : quiz.topic;
  return `Create a ${quiz.count}-question multiple-choice quiz to prepare a candidate for a ${persona.label} interview.
Topic: ${topic}.
Difficulty: ${quiz.difficulty}.

Return ONLY valid JSON in exactly this shape:
{"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}

Rules:
- Exactly 4 options per question and exactly one correct option.
- "answer" is the 0-based index of the correct option.
- Questions should be realistic, interview-style and test understanding, not trivia.
- Distractors must be plausible. Do not use "all of the above" or "none of the above".
- "explanation" is 1-3 sentences explaining why the answer is correct.
- Keep each option under 25 words.`;
}

/**
 * Creates the quiz view.
 * @param {{ getRole: () => string, getApiKey: () => string, onDiscuss: (text: string) => void }} deps
 */
export function createQuizView({ getRole, getApiKey, onDiscuss }) {
  const root = h('section', { class: 'quiz', id: 'quiz-view', 'aria-live': 'polite' });

  async function start(role) {
    const quiz = getQuiz(role);
    const persona = PERSONAS[role];
    quiz.status = 'loading';
    quiz.error = '';
    quiz.controller = new AbortController();
    render();

    try {
      const data = await generateJSON({
        apiKey: getApiKey(),
        system: `${persona.system}\nYou are now writing a quiz. Output JSON only.`,
        prompt: buildPrompt(persona, quiz),
        signal: quiz.controller.signal,
      });
      quiz.questions = normaliseQuestions(data, quiz.count);
      quiz.index = 0;
      quiz.answers = [];
      quiz.status = 'active';
    } catch (err) {
      quiz.status = 'setup';
      quiz.error = err?.name === 'AbortError' ? '' : friendlyError(err);
    } finally {
      quiz.controller = null;
      if (getRole() === role) render();
    }
  }

  function answer(quiz, choice) {
    if (quiz.answers[quiz.index] != null) return;
    quiz.answers[quiz.index] = choice;
    render();
    root.querySelector('.quiz-next')?.focus();
  }

  function next(role, quiz) {
    if (quiz.index < quiz.questions.length - 1) {
      quiz.index += 1;
    } else {
      quiz.status = 'done';
      recordResult(role, score(quiz), quiz.questions.length);
    }
    render();
    root.scrollTop = 0;
  }

  const score = (quiz) => quiz.questions.reduce((n, q, i) => n + (quiz.answers[i] === q.answer ? 1 : 0), 0);

  /* ------------------------------------------------------ screens */

  function segmented(label, values, current, onPick, fmt = (v) => v) {
    return h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': label },
        values.map((v) =>
          h(
            'button',
            { type: 'button', role: 'radio', 'aria-checked': String(v === current), onclick: () => onPick(v) },
            fmt(v),
          ),
        ),
      ),
    );
  }

  function setupScreen(role, quiz) {
    const persona = PERSONAS[role];
    const stats = loadStats()[role];
    const topics = ['Mixed', ...persona.quizTopics];

    return h(
      'div',
      { class: 'quiz-card' },
      h('h2', { class: 'quiz-title' }, `🧠 ${persona.label} Quiz`),
      h(
        'p',
        { class: 'quiz-sub' },
        `${persona.coach} will write a fresh multiple-choice quiz to test your interview knowledge.`,
      ),
      stats
        ? h(
            'div',
            { class: 'quiz-stats' },
            h('span', {}, `Quizzes taken: `, h('b', {}, String(stats.taken))),
            h('span', {}, `Best score: `, h('b', {}, `${stats.bestPct}%`)),
            stats.last ? h('span', {}, `Last: `, h('b', {}, `${stats.last.score}/${stats.last.total}`)) : null,
          )
        : null,
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field-label' }, 'Topic'),
        h(
          'div',
          { class: 'topic-grid', role: 'radiogroup', 'aria-label': 'Topic' },
          topics.map((t) =>
            h(
              'button',
              {
                type: 'button',
                class: 'chip',
                role: 'radio',
                'aria-checked': String(t === quiz.topic),
                onclick: () => {
                  quiz.topic = t;
                  render();
                },
              },
              t === 'Mixed' ? '🎲 Mixed' : t,
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'field-row' },
        segmented('Difficulty', DIFFICULTIES, quiz.difficulty, (v) => {
          quiz.difficulty = v;
          render();
        }),
        segmented(
          'Questions',
          COUNTS,
          quiz.count,
          (v) => {
            quiz.count = v;
            render();
          },
          (v) => `${v}`,
        ),
      ),
      quiz.error ? h('p', { class: 'quiz-error', role: 'alert' }, `⚠️ ${quiz.error}`) : null,
      h('button', { class: 'btn-accent quiz-start', type: 'button', onclick: () => start(role) }, 'Start quiz →'),
    );
  }

  function loadingScreen(role, quiz) {
    const persona = PERSONAS[role];
    return h(
      'div',
      { class: 'quiz-card quiz-loading' },
      h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      h('p', {}, `${persona.coach} is writing ${quiz.count} ${quiz.difficulty.toLowerCase()} questions on `, h('b', {}, quiz.topic), '…'),
      h('button', { class: 'ghost-btn', type: 'button', onclick: () => quiz.controller?.abort() }, 'Cancel'),
    );
  }

  function activeScreen(role, quiz) {
    const q = quiz.questions[quiz.index];
    const chosen = quiz.answers[quiz.index];
    const answered = chosen != null;
    const total = quiz.questions.length;
    const isLast = quiz.index === total - 1;

    return h(
      'div',
      { class: 'quiz-card' },
      h(
        'div',
        { class: 'quiz-progress-row' },
        h('span', {}, `Question ${quiz.index + 1} of ${total}`),
        h('span', {}, `Score ${score(quiz)}`),
        h(
          'button',
          {
            class: 'link-btn',
            type: 'button',
            onclick: () => {
              quiz.status = 'setup';
              render();
            },
          },
          'Quit',
        ),
      ),
      h(
        'div',
        { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': quiz.index + (answered ? 1 : 0) },
        h('div', { class: 'progress-fill', style: `width:${((quiz.index + (answered ? 1 : 0)) / total) * 100}%` }),
      ),
      h('div', { class: 'quiz-question', html: renderMarkdown(q.question) }),
      h(
        'div',
        { class: 'options' },
        q.options.map((opt, i) => {
          let state = '';
          if (answered) {
            if (i === q.answer) state = ' is-correct';
            else if (i === chosen) state = ' is-wrong';
            else state = ' is-dim';
          }
          return h(
            'button',
            {
              type: 'button',
              class: `option${state}`,
              disabled: answered,
              onclick: () => answer(quiz, i),
            },
            h('span', { class: 'option-letter' }, LETTERS[i]),
            h('span', { class: 'option-text', html: renderInline(opt) }),
          );
        }),
      ),
      answered
        ? h(
            'div',
            { class: `feedback ${chosen === q.answer ? 'good' : 'bad'}` },
            h('strong', {}, chosen === q.answer ? '✅ Correct!' : `❌ Not quite — the answer is ${LETTERS[q.answer]}.`),
            q.explanation ? h('div', { html: renderMarkdown(q.explanation) }) : null,
          )
        : h('p', { class: 'quiz-hint' }, 'Tip: press 1–4 or A–D to answer.'),
      answered
        ? h(
            'button',
            { class: 'btn-accent quiz-next', type: 'button', onclick: () => next(role, quiz) },
            isLast ? 'See results →' : 'Next question →',
          )
        : null,
    );
  }

  function doneScreen(role, quiz) {
    const persona = PERSONAS[role];
    const total = quiz.questions.length;
    const s = score(quiz);
    const pct = Math.round((s / total) * 100);
    const verdict =
      pct >= 90 ? 'Outstanding — interview ready! 🚀' : pct >= 70 ? 'Strong work — polish a few gaps. 💪' : pct >= 50 ? 'Good start — keep practising. 📈' : 'Keep going — review the explanations below. 📚';
    const missed = quiz.questions
      .map((q, i) => ({ q, i, chosen: quiz.answers[i] }))
      .filter(({ q, chosen }) => chosen !== q.answer);

    const discussText =
      `I just took ${/^[AEIOU]/.test(quiz.difficulty) ? 'an' : 'a'} ${quiz.difficulty} ${persona.label} quiz on "${quiz.topic}" and scored ${s}/${total}. ` +
      `Please help me understand the questions I missed and how to explain these concepts well in an interview:\n\n` +
      missed
        .map(
          ({ q, chosen }, n) =>
            `${n + 1}. ${q.question}\n   My answer: ${q.options[chosen]}\n   Correct answer: ${q.options[q.answer]}`,
        )
        .join('\n');

    return h(
      'div',
      { class: 'quiz-card' },
      h(
        'div',
        { class: 'result' },
        h('div', { class: 'score-ring', style: `--pct:${pct}` }, h('span', {}, `${pct}%`)),
        h('div', {}, h('h2', { class: 'quiz-title' }, `${s} / ${total} correct`), h('p', { class: 'quiz-sub' }, verdict)),
      ),
      h(
        'div',
        { class: 'result-actions' },
        h('button', { class: 'btn-accent', type: 'button', onclick: () => start(role) }, '🔁 New quiz'),
        h(
          'button',
          {
            class: 'ghost-btn',
            type: 'button',
            onclick: () => {
              quiz.status = 'setup';
              render();
            },
          },
          '⚙️ Change settings',
        ),
        missed.length
          ? h('button', { class: 'ghost-btn', type: 'button', onclick: () => onDiscuss(discussText) }, `💬 Review mistakes with ${persona.coach}`)
          : null,
      ),
      h('h3', { class: 'review-title' }, 'Review'),
      h(
        'div',
        { class: 'review' },
        quiz.questions.map((q, i) => {
          const ok = quiz.answers[i] === q.answer;
          return h(
            'details',
            { class: `review-item ${ok ? 'good' : 'bad'}`, open: !ok },
            h('summary', {}, h('span', {}, ok ? '✅' : '❌'), h('span', { html: `${i + 1}. ${renderInline(q.question)}` })),
            h(
              'div',
              { class: 'review-body' },
              !ok ? h('p', {}, h('b', {}, 'Your answer: '), h('span', { html: renderInline(q.options[quiz.answers[i]]) })) : null,
              h('p', {}, h('b', {}, 'Correct answer: '), h('span', { html: renderInline(q.options[q.answer]) })),
              q.explanation ? h('div', { class: 'review-expl', html: renderMarkdown(q.explanation) }) : null,
            ),
          );
        }),
      ),
    );
  }

  let lastScreen = '';

  function render() {
    const role = getRole();
    const quiz = getQuiz(role);
    const key = `${role}:${quiz.status}:${quiz.index}`;
    const screen = {
      setup: setupScreen,
      loading: loadingScreen,
      active: activeScreen,
      done: doneScreen,
    }[quiz.status](role, quiz);
    if (key !== lastScreen) screen.classList.add('enter');
    lastScreen = key;
    root.replaceChildren(screen);
  }

  /** Keyboard shortcuts while a question is open. Returns true if handled. */
  function handleKey(e) {
    const quiz = getQuiz(getRole());
    if (quiz.status !== 'active' || e.altKey || e.ctrlKey || e.metaKey) return false;
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return false;
    const answered = quiz.answers[quiz.index] != null;
    const k = e.key.toLowerCase();
    const idx = ['1', '2', '3', '4'].indexOf(k) !== -1 ? Number(k) - 1 : ['a', 'b', 'c', 'd'].indexOf(k);
    if (!answered && idx >= 0) {
      answer(quiz, idx);
      return true;
    }
    if (answered && e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') {
      next(getRole(), quiz);
      return true;
    }
    return false;
  }

  return { el: root, render, handleKey };
}
