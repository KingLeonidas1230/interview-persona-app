import './style.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { PERSONAS, PERSONA_ORDER } from './personas.js';
import { MODEL_ID, streamChat, validateKey, GeminiError } from './gemini.js';

marked.setOptions({ gfm: true, breaks: true });

const KEY_STORAGE = 'aiprep.apiKey';
const CHAT_STORAGE = 'aiprep.chats';
const ROLE_STORAGE = 'aiprep.role';

/* ---------------------------------------------------------------- state */

const state = {
  apiKey: localStorage.getItem(KEY_STORAGE) || sessionStorage.getItem(KEY_STORAGE) || '',
  role: PERSONAS[localStorage.getItem(ROLE_STORAGE)] ? localStorage.getItem(ROLE_STORAGE) : 'pm',
  chats: loadChats(),
  busy: false,
  controller: null,
};

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

/* ---------------------------------------------------------------- utils */

const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

const renderMarkdown = (text) => DOMPurify.sanitize(marked.parse(text || ''));

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
    h('h1', { class: 'gate-title' }, 'AI Role Prep'),
    h(
      'p',
      { class: 'gate-sub' },
      'Interview coaching for ',
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

function friendlyError(err) {
  if (err?.name === 'AbortError') return 'Generation stopped.';
  if (err instanceof GeminiError) {
    if (err.status === 401 || err.status === 403 || /api key/i.test(err.message)) {
      return 'That API key was rejected by Google. Please check it and try again.';
    }
    if (err.status === 404) return `The model “${MODEL_ID}” is not available for this key.`;
    if (err.status === 429) return 'Rate limit reached — wait a moment and try again.';
    return err.message;
  }
  if (err instanceof TypeError) return 'Network error — check your internet connection.';
  return err?.message || 'Something went wrong.';
}

/* ---------------------------------------------------------- main app */

function renderApp() {
  applyTheme(state.role);
  const app = $('#app');
  app.replaceChildren();

  const tabs = h(
    'nav',
    { class: 'tabs', role: 'tablist', 'aria-label': 'Choose a role' },
    PERSONA_ORDER.map((id) => {
      const p = PERSONAS[id];
      return h(
        'button',
        {
          class: `tab tab-${id}`,
          role: 'tab',
          'data-role': id,
          'aria-selected': String(id === state.role),
          onclick: () => switchRole(id),
        },
        h('span', { class: 'tab-icon' }, p.icon),
        h('span', { class: 'tab-label' }, p.label),
        h('span', { class: 'tab-short' }, p.short),
      );
    }),
  );

  const header = h(
    'header',
    { class: 'topbar glass' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '◆'), h('span', {}, 'AI Role Prep')),
    tabs,
    h(
      'div',
      { class: 'top-actions' },
      h('span', { class: 'model-pill' }, MODEL_ID),
      h('button', { class: 'ghost-btn', onclick: clearChat, title: 'Clear this conversation' }, 'Clear'),
      h('button', { class: 'ghost-btn', onclick: changeKey, title: 'Change API key' }, 'API key'),
    ),
  );

  const subtitle = h('section', { class: 'subtitle', id: 'subtitle', 'aria-live': 'polite' });

  const messages = h('div', { class: 'messages', id: 'messages' });
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
      class: 'composer glass',
      onsubmit: (e) => {
        e.preventDefault();
        if (state.busy) stop();
        else submit();
      },
    },
    textarea,
    sendBtn,
  );

  app.append(
    h(
      'div',
      { class: 'shell' },
      header,
      subtitle,
      h('main', { class: 'chat glass' }, messages, chips),
      composer,
      h('p', { class: 'footnote' }, 'AI can make mistakes — verify important facts. Shift+Enter for a new line.'),
    ),
  );

  renderSubtitle();
  renderMessages();
  textarea.focus();
}

function renderSubtitle() {
  const p = PERSONAS[state.role];
  const el = $('#subtitle');
  el.replaceChildren(
    h('span', { class: 'sub-badge' }, `${p.icon} ${p.short} mode`),
    h(
      'div',
      { class: 'sub-text' },
      h('strong', {}, `${p.coach} · ${p.label} Coach`),
      h('span', {}, p.subtitle),
    ),
  );
  // retrigger the entrance animation
  el.classList.remove('animate');
  void el.offsetWidth;
  el.classList.add('animate');
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

  const chips = $('#chips');
  chips.replaceChildren(
    ...(chat.length === 0
      ? persona.prompts.map((text) => h('button', { class: 'chip', type: 'button', onclick: () => submit(text) }, text))
      : []),
  );
  list.scrollTop = list.scrollHeight;
}

function switchRole(id) {
  if (id === state.role) return;
  if (state.busy) stop();
  state.role = id;
  localStorage.setItem(ROLE_STORAGE, id);
  applyTheme(id);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.role === id)));
  renderSubtitle();
  renderMessages();
  $('#input')?.focus();
}

function autoGrow() {
  const ta = $('#input');
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
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
  ta.value = '';
  autoGrow();
  renderMessages();

  const reply = { role: 'model', text: '' };
  const node = messageEl(reply, persona);
  const bubble = $('.bubble', node);
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('#messages').append(node);
  $('#messages').scrollTop = $('#messages').scrollHeight;

  state.controller = new AbortController();
  setBusy(true);

  let frame = 0;
  const paint = () => {
    frame = 0;
    if (state.role !== role) return; // user switched tabs mid-stream
    const list = $('#messages');
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    bubble.innerHTML = renderMarkdown(reply.text);
    if (nearBottom) list.scrollTop = list.scrollHeight;
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
        chat.push({ role: 'model', text: 'Use the **API key** button at the top right to update your key.', error: true });
      }
    }
  } finally {
    if (frame) cancelAnimationFrame(frame);
    state.controller = null;
    setBusy(false);
    saveChats();
    if (state.role === role) renderMessages();
  }
}

function stop() {
  state.controller?.abort();
}

function clearChat() {
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

/* ---------------------------------------------------------------- boot */

applyTheme(state.role);
if (state.apiKey) renderApp();
else renderKeyGate();
