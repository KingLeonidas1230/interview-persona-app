# AI Interview Agent

An AI chat app that helps candidates prepare for three AI careers, each with its own coach persona and neon colour theme:

| Role | Coach | Theme | Focus |
| --- | --- | --- | --- |
| 🧭 AI Product Manager | **Nova** | Cyan / blue | Product sense, AI strategy, metrics & evals, responsible AI |
| 🛠️ Forward Deployed Engineer | **Vector** | Magenta / violet | Customer-facing engineering, RAG/agents, system design, scenarios |
| 🔬 AI Researcher | **Axiom** | Lime / green | ML fundamentals, Transformers & LLMs, paper critique, experiment design |

Built with **Vite (vanilla JS)** and powered by **Google Gemini 3.8 Flash** (`gemini-3.8-flash`).

## Features

- **Bring your own key**: users enter their Gemini API key before using the app. The key is checked against the model, stored only in the browser (local or session storage), and sent directly to Google.
- **Compact layout**: one slim top bar (title, circular role buttons, API key) and a colour-coded subtitle banner leave most of the screen for the conversation.
- **Chat / Quiz modes** for every role, switched from the subtitle banner.
- **Quiz mode**: Gemini writes a fresh multiple-choice quiz for the active role. Pick a topic, difficulty (Beginner / Intermediate / Advanced) and length (5 / 10 / 15). You get instant feedback with explanations, a final score and a review of every question, and one click sends your mistakes to the coach to discuss. Best and last scores are saved per role.
- **Easy navigation**: a "↓ Latest" button appears when you scroll up, auto-scroll pauses while you read, and there are keyboard shortcuts.
- **Separate chat history per role**, saved in `localStorage`.
- **Streaming responses** rendered as sanitised Markdown (`marked` + `DOMPurify`).
- **Quick-start prompts** for mock interviews, prep plans and deep dives.
- Blue neon gradient background with an animated grid, and a responsive layout for mobile.
- Stop generation, clear a conversation, or change the API key at any time.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Alt+1` / `Alt+2` / `Alt+3` | Switch to AI PM / FDE / Researcher |
| `Alt+Q` | Toggle Chat ↔ Quiz |
| `1`–`4` or `A`–`D` | Answer the current quiz question |
| `Enter` | Send a message / go to the next quiz question |
| `Shift+Enter` | New line in a message |

## Getting started

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`) and paste your Gemini API key. You can create a key at [Google AI Studio](https://aistudio.google.com/apikey).

Production build:

```bash
npm run build
npm run preview
```

## Project structure

```
index.html          # shell + background layers
src/main.js         # UI, state, key gate, chat flow, shortcuts
src/quiz.js         # quiz mode (generation, questions, results)
src/dom.js          # DOM + Markdown helpers
src/gemini.js       # Gemini REST client (SSE streaming + JSON)
src/personas.js     # role personas, colours, prompts
src/style.css       # neon/grid theme and layout
```

To change the model, edit `MODEL_ID` in `src/gemini.js`. To customise a coach, edit its entry in `src/personas.js`.

## Security note

This is a client-only app: the user's key is used from the browser. That is fine for personal or bring-your-own-key use. If you ship it with **your own** key, put a small backend proxy in front of Gemini so the key is never exposed.
