// Minimal Gemini REST client (no SDK) with streaming via Server-Sent Events.
// The API key is supplied by the user at runtime and sent directly from the
// browser to Google — it never touches any other server.

export const MODEL_ID = 'gemini-3.8-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
  get isAuthError() {
    return this.status === 400 || this.status === 401 || this.status === 403;
  }
}

async function toError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || '';
  } catch {
    /* ignore non-JSON bodies */
  }
  return new GeminiError(detail || `Request failed with HTTP ${res.status}`, res.status);
}

/** Checks that the key works and has access to the model. */
export async function validateKey(apiKey) {
  const res = await fetch(`${BASE}/models/${MODEL_ID}`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) throw await toError(res);
  return res.json();
}

/**
 * Streams a chat completion.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.system   System instruction (persona).
 * @param {{role:'user'|'model', text:string}[]} opts.history
 * @param {(chunk:string)=>void} opts.onToken
 * @param {AbortSignal} [opts.signal]
 */
export async function streamChat({ apiKey, system, history, onToken, signal }) {
  const res = await fetch(`${BASE}/models/${MODEL_ID}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    }),
  });

  if (!res.ok) throw await toError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;

      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.error) throw new GeminiError(json.error.message, json.error.code);

      const parts = json.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.thought || typeof p.text !== 'string') continue; // skip thinking summaries
        full += p.text;
        onToken(p.text);
      }
      const block = json.promptFeedback?.blockReason;
      if (block) throw new GeminiError(`The prompt was blocked (${block}).`, 400);
    }
  }
  return full;
}
