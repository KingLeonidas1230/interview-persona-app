import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

export const $ = (sel, root = document) => root.querySelector(sel);

/** Tiny hyperscript helper: h('div', { class: 'x', onclick }, ...children) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

export const renderMarkdown = (text) => DOMPurify.sanitize(marked.parse(text || ''));

/** Inline Markdown (no wrapping <p>) for short strings like titles and options. */
export const renderInline = (text) => DOMPurify.sanitize(marked.parseInline(text || ''));
