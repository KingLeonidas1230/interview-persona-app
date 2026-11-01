import './style.css';
import { $, h, renderMarkdown } from './dom.js';
import { PERSONAS, PERSONA_ORDER } from './personas.js';
import { MODEL_ID, streamChat, validateKey, friendlyError, GeminiError } from './gemini.js';
import { createQuizView } from './quiz.js';

const KEY_STORAGE = 'aiprep.apiKey';
const CHAT_STORAGE = 'aiprep.chats';
const ROLE_STORAGE = 'aiprep.role';
const VIEW_STORAGE = 'aiprep.view';

/* ---------------------------------------------------------------- state */

const state = {
  apiKey: localStorage.getItem(KEY_STORAGE) || sessionStorage.getItem(KEY_STORAGE) || '',
  role: PERSONAS[localStorage.getItem(ROLE_STORAGE)] ? localStorage.getItem(ROLE_STORAGE) : 'pm',
  view: localStorage.getItem(VIEW_STORAGE) === 'quiz' ? 'quiz' : 'chat',
  chats: loadChats(),
  busy: false,
  controller: null,
};

const quizView = createQuizView({
  getRole: () => state.role,
  getApiKey: () => state.apiKey,
  onDiscuss: (text) => {
    setView('chat');
    submit(text);
  },
});

function loadChats() {
  const empty = Object.fromEntries(PERSONA_ORDER.map((id) => [id, []]));
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE) || '{}');
    for (const id of PERSONA_ORDER) if (Array.isArray(saved[id])) empty[id] = saved[id];
  } catch {
    /* corrupted storage — start fresh */
  }
  return empty;
}

function saveChats() {
  localStorage.setItem(CHAT_STORAGE, JSON.stringify(state.chats));
}

function applyTheme(role) {
  const t = PERSONAS[role].theme;
  const root = document.documentElement.style;
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-2', t.accent2);
  root.setProperty('--glow', t.glow);
  root.setProperty('--user-bubble', t.userBubble);
  document.documentElement.dataset.role = role;
}

/* ---------------------------------------------------------- key screen */

function renderKeyGate(errorMsg = '') {
  const app = $('#app');
  app.replaceChildren();

  const input = h('input', {
    id: 'api-key',
    type: 'password',
    placeholder: 'Paste your Gemini API key (AIza…)',
    autocomplete: 'off',
    spellcheck: 'false',
    value: state.apiKey,
  });
  const remember = h('input', { type: 'checkbox', id: 'remember', checked: true });
  const error = h('p', { class: 'gate-error', role: 'alert' }, errorMsg);
  const button = h('button', { class: 'btn-primary', type: 'submit' }, 'Unlock coach →');

  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': 'Show or hide key',
      onclick: () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        toggle.textContent = input.type === 'password' ? '👁' : '🙈';
      },
    },
    '👁',
  );

  const form = h(
    'form',
    {
      class: 'gate-card glass',
      onsubmit: async (e) => {
        e.preventDefault();
        const key = input.value.trim();
        if (!key) {
          error.textContent = 'Please enter your API key.';
          return;
        }
        button.disabled = true;
        button.textContent = 'Verifying…';
        error.textContent = '';
        try {
          await validateKey(key);
          state.apiKey = key;
          localStorage.removeItem(KEY_STORAGE);
          sessionStorage.removeItem(KEY_STORAGE);
          (remember.checked ? localStorage : sessionStorage).setItem(KEY_STORAGE, key);
          renderApp();
        } catch (err) {
          error.textContent = friendlyError(err);
          button.disabled = false;
          button.textContent = 'Unlock coach →';
        }
      },
    },
    h('div', { class: 'gate-logo' }, '◆'),
    h('h1', { class: 'gate-title' }, 'AI Interview Agent'),
    h(
      'p',
      { class: 'gate-sub' },
      'Interview coaching and quizzes for ',
      h('b', { class: 'c-pm' }, 'AI Product Managers'),
      ', ',
      h('b', { class: 'c-fde' }, 'Forward Deployed Engineers'),
      ' and ',
      h('b', { class: 'c-research' }, 'AI Researchers'),
      '.',
    ),
    h('label', { for: 'api-key', class: 'gate-label' }, 'Gemini API key'),
    h('div', { class: 'key-row' }, input, toggle),
    h('label', { class: 'remember' }, remember, ' Remember on this device'),
    error,
    button,
    h(
      'p',
      { class: 'gate-note' },
      'No key yet? Create one free at ',
      h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'Google AI Studio'),
      '. Your key is stored only in this browser and sent directly to Google.',
    ),
    h('p', { class: 'model-pill' }, `Model · ${MODEL_ID}`),
  );

  app.append(h('main', { class: 'gate' }, form));
  input.focus();
}

/* ---------------------------------------------------------- main app */

function renderApp() {
  applyTheme(state.role);
  const app = $('#app');
  app.replaceChildren();

  // Compact role switcher: small circles + label (keeps the wireframe's circles).
  const roles = h(
    'nav',
    { class: 'roles', role: 'tablist', 'aria-label': 'Choose a job role' },
    PERSONA_ORDER.map((id, n) => {
      const p = PERSONAS[id];
      return h(
        'button',
        {
          class: `role-btn role-${id}`,
          role: 'tab',
          'data-role': id,
          'aria-selected': String(id === state.role),
          title: `${p.label}  (Alt+${n + 1})`,
          onclick: () => switchRole(id),
        },
        h('span', { class: 'role-circle' }, p.icon),
        h('span', { class: 'role-name' }, p.short),
      );
    }),
  );

  const header = h(
    'header',
    { class: 'topbar' },
    h('h1', { class: 'app-title' }, 'AI Interview Agent'),
    roles,
    h(
      'div',
      { class: 'top-actions' },
      h('span', { class: 'model-pill', title: 'Model in use' }, MODEL_ID),
      h('button', { class: 'icon-btn small', onclick: changeKey, title: 'Change API key', 'aria-label': 'Change API key' }, '🔑'),
    ),
  );

  // Role banner (subtitle) + Chat/Quiz switch on one slim line.
  const viewToggle = h(
    'div',
    { class: 'view-toggle', role: 'tablist', 'aria-label': 'Mode' },
    h('button', { role: 'tab', 'data-view': 'chat', onclick: () => setView('chat'), title: 'Chat with your coach' }, '💬 Chat'),
    h('button', { role: 'tab', 'data-view': 'quiz', onclick: () => setView('quiz'), title: 'Test yourself (Alt+Q)' }, '🧠 Quiz'),
  );
  const subtitle = h(
    'section',
    { class: 'subtitle' },
    h('div', { class: 'sub-info', id: 'sub-info', 'aria-live': 'polite' }),
    viewToggle,
  );

  // Chat view
  const messages = h('div', { class: 'messages', id: 'messages', onscroll: updateJumpButton });
  const jump = h(
    'button',
    { class: 'jump-btn', id: 'jump', type: 'button', hidden: true, onclick: () => scrollToBottom(true), 'aria-label': 'Jump to latest message' },
    '↓ Latest',
  );
  const chips = h('div', { class: 'chips', id: 'chips' });

  const textarea = h('textarea', {
    id: 'input',
    rows: 1,
    placeholder: 'Ask your coach anything, or start a mock interview…',
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    },
    oninput: autoGrow,
  });
  const sendBtn = h('button', { class: 'send-btn', id: 'send', type: 'submit', 'aria-label': 'Send' }, '➤');

  const composer = h(
    'form',
    {
      class: 'composer',
      onsubmit: (e) => {
        e.preventDefault();
        if (state.busy) stop();
        else submit();
      },
    },
    h('button', { class: 'icon-btn small clear-btn', type: 'button', onclick: clearChat, title: 'Clear this conversation', 'aria-label': 'Clear conversation' }, '🗑'),
    textarea,
    sendBtn,
  );

  const chatView = h(
    'section',
    { class: 'chat-view', id: 'chat-view' },
    h('div', { class: 'messages-wrap' }, messages, jump),
    chips,
    composer,
    h('p', { class: 'footnote' }, 'AI can make mistakes — verify important facts. Enter to send · Shift+Enter for a new line.'),
  );

  app.append(h('div', { class: 'shell' }, header, subtitle, h('main', { class: 'panel glass' }, chatView, quizView.el)));

  renderSubtitle();
  renderMessages();
  quizView.render();
  setView(state.view, { focus: true });
}

function renderSubtitle() {
  const p = PERSONAS[state.role];
  const el = $('#sub-info');
  el.replaceChildren(
    h('span', { class: 'sub-dot', 'aria-hidden': 'true' }),
    h('strong', {}, `${p.coach} · ${p.label} Coach`),
    h('span', { class: 'sub-desc' }, p.subtitle),
  );
  // retrigger the entrance animation
  const bar = el.parentElement;
  bar.classList.remove('animate');
  void bar.offsetWidth;
  bar.classList.add('animate');
}

function setView(view, { focus = true } = {}) {
  state.view = view;
  localStorage.setItem(VIEW_STORAGE, view);
  document.querySelectorAll('.view-toggle button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $('#chat-view').hidden = view !== 'chat';
  quizView.el.hidden = view !== 'quiz';
  if (view === 'chat') {
    scrollToBottom();
    if (focus) $('#input')?.focus();
  } else {
    quizView.render();
  }
}

function messageEl(msg, persona) {
  const isUser = msg.role === 'user';
  const bubble = h('div', { class: 'bubble' });
  if (isUser) bubble.textContent = msg.text;
  else bubble.innerHTML = renderMarkdown(msg.text);

  return h(
    'div',
    { class: `msg ${isUser ? 'from-user' : 'from-coach'}${msg.error ? ' is-error' : ''}` },
    isUser ? null : h('div', { class: 'avatar', title: persona.coach }, persona.icon),
    h('div', { class: 'msg-body' }, isUser ? null : h('div', { class: 'msg-name' }, persona.coach), bubble),
  );
}

function renderMessages() {
  const persona = PERSONAS[state.role];
  const list = $('#messages');
  const chat = state.chats[state.role];

  list.replaceChildren(
    messageEl({ role: 'model', text: persona.welcome }, persona),
    ...chat.map((m) => messageEl(m, persona)),
  );

  $('#chips').replaceChildren(
    ...(chat.length === 0
      ? persona.prompts.map((text) => h('button', { class: 'chip', type: 'button', onclick: () => submit(text) }, text))
      : []),
  );
  scrollToBottom();
}

function isNearBottom(list = $('#messages')) {
  return list.scrollHeight - list.scrollTop - list.clientHeight < 120;
}

function scrollToBottom(smooth = false) {
  const list = $('#messages');
  if (!list) return;
  list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  updateJumpButton();
}

function updateJumpButton() {
  const btn = $('#jump');
  if (btn) btn.hidden = isNearBottom();
}

function switchRole(id) {
  if (id === state.role) return;
  if (state.busy) stop();
  state.role = id;
  localStorage.setItem(ROLE_STORAGE, id);
  applyTheme(id);
  document.querySelectorAll('.role-btn').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.role === id)));
  renderSubtitle();
  renderMessages();
  quizView.render();
  if (state.view === 'chat') $('#input')?.focus();
}

function autoGrow() {
  const ta = $('#input');
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
}

function setBusy(busy) {
  state.busy = busy;
  const btn = $('#send');
  btn.textContent = busy ? '■' : '➤';
  btn.setAttribute('aria-label', busy ? 'Stop generating' : 'Send');
  btn.classList.toggle('is-stop', busy);
}

async function submit(preset) {
  const ta = $('#input');
  const text = (preset ?? ta.value).trim();
  if (!text || state.busy) return;

  const role = state.role;
  const persona = PERSONAS[role];
  const chat = state.chats[role];

  // Drop previous error bubbles from the context sent to the model.
  for (let i = chat.length - 1; i >= 0; i--) if (chat[i].error) chat.splice(i, 1);

  chat.push({ role: 'user', text });
  if (preset == null) ta.value = '';
  autoGrow();
  renderMessages();

  const reply = { role: 'model', text: '' };
  const node = messageEl(reply, persona);
  const bubble = $('.bubble', node);
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('#messages').append(node);
  scrollToBottom();

  state.controller = new AbortController();
  setBusy(true);

  let frame = 0;
  const paint = () => {
    frame = 0;
    if (state.role !== role) return; // user switched roles mid-stream
    const follow = isNearBottom();
    bubble.innerHTML = renderMarkdown(reply.text);
    if (follow) scrollToBottom();
    else updateJumpButton();
  };

  try {
    await streamChat({
      apiKey: state.apiKey,
      system: persona.system,
      history: chat.map(({ role: r, text: t }) => ({ role: r, text: t })),
      signal: state.controller.signal,
      onToken: (chunk) => {
        reply.text += chunk;
        if (!frame) frame = requestAnimationFrame(paint);
      },
    });
    if (!reply.text) reply.text = '_(No response — try rephrasing your message.)_';
    chat.push(reply);
  } catch (err) {
    if (err?.name === 'AbortError') {
      if (reply.text) chat.push({ role: 'model', text: `${reply.text}\n\n_(stopped)_` });
    } else {
      chat.push({ role: 'model', text: `⚠️ ${friendlyError(err)}`, error: true });
      if (err instanceof GeminiError && (err.status === 401 || err.status === 403)) {
        chat.push({ role: 'model', text: 'Use the 🔑 button at the top right to update your API key.', error: true });
      }
    }
  } finally {
    if (frame) cancelAnimationFrame(frame);
    state.controller = null;
    setBusy(false);
    saveChats();
    if (state.role === role) {
      // keep the reader's position if they scrolled up to read
      const follow = isNearBottom();
      const top = $('#messages').scrollTop;
      renderMessages();
      if (!follow) {
        $('#messages').scrollTop = top;
        updateJumpButton();
      }
    }
  }
}

function stop() {
  state.controller?.abort();
}

function clearChat() {
  if (state.chats[state.role].length && !confirm(`Clear your ${PERSONAS[state.role].label} conversation?`)) return;
  if (state.busy) stop();
  state.chats[state.role] = [];
  saveChats();
  renderMessages();
}

function changeKey() {
  if (state.busy) stop();
  localStorage.removeItem(KEY_STORAGE);
  sessionStorage.removeItem(KEY_STORAGE);
  renderKeyGate();
}

/* ---------------------------------------------------- keyboard shortcuts */

document.addEventListener('keydown', (e) => {
  if (!$('.shell')) return; // key gate is showing
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (n !== -1) {
      e.preventDefault();
      switchRole(PERSONA_ORDER[n]);
      return;
    }
    if (e.key.toLowerCase() === 'q' || e.code === 'KeyQ') {
      e.preventDefault();
      setView(state.view === 'quiz' ? 'chat' : 'quiz');
      return;
    }
  }
  if (state.view === 'quiz' && quizView.handleKey(e)) e.preventDefault();
});

/* ---------------------------------------------------------------- boot */

applyTheme(state.role);
if (state.apiKey) renderApp();
else renderKeyGate();
