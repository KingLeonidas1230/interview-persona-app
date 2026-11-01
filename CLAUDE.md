# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Owner

Address the owner as **QUANTUM MASTER**. They are a tech entrepreneur building several businesses: an **automated marketing agency**, **Arcytex** and **Digital Voltage Media**. Their main goal is to start selling services to customers. Keep answers clear, to the point and in advanced, precise English, and end substantial answers with a few reference points for further learning.

## The app: AI Interview Agent

A Vite (vanilla JavaScript) chat app that prepares candidates for three AI roles: AI Product Manager, Forward Deployed Engineer and AI Researcher. It runs on Google **Gemini 3.8 Flash** (`gemini-3.8-flash`), using an API key the user enters in the browser.

```bash
npm install        # install dependencies
npm run dev        # dev server at http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
```

| File | Purpose |
| --- | --- |
| `src/main.js` | UI, state, API key screen, chat flow, keyboard shortcuts |
| `src/quiz.js` | Quiz mode: generation, questions, results, saved stats |
| `src/gemini.js` | Gemini REST client: SSE streaming chat and JSON generation |
| `src/personas.js` | Coach personas (Nova, Vector, Axiom), colours, prompts, quiz topics |
| `src/dom.js` | DOM and Markdown helpers (`marked` + `DOMPurify`) |
| `src/style.css` | Blue neon gradient and grid theme, layout, responsive rules |

Conventions:
- No framework. Build DOM with the `h()` helper in `src/dom.js`.
- Render model output only through `renderMarkdown` / `renderInline`, which sanitise it.
- Gemini 3.x Flash does not accept `temperature`, `top_p` or `top_k`, so don't send them.
- To change the model, edit `MODEL_ID` in `src/gemini.js`.
- The app is client-only. Never hard-code an API key; if the owner's own key is ever needed, add a server proxy.
- Run `npm run build` before committing.

## Skills library (`.claude/skills/`)

This repo ships **61 agent skills**. Claude Code loads them automatically, and each one activates when a request matches its description. Use them for the owner's business work: offers, plans, copy, outreach and content.

### Automated marketing agency: strategy, SEO, ads, email
`marketing-plan`, `marketing-ideas`, `marketing-loops`, `marketing-council`, `content-strategy`, `copywriting`, `copy-editing`, `emails`, `sms`, `seo-audit`, `ai-seo`, `programmatic-seo`, `schema`, `link-building`, `site-architecture`, `ads`, `ad-creative`, `analytics`, `attribution`, `conversion-tracking`, `cro`, `ab-testing`, `popups`, `signup`, `onboarding`, `lead-magnets`, `free-tools`, `directory-submissions`

### Digital Voltage Media: content, social, video
`social`, `video`, `image`, `influencer-marketing`, `community-marketing`, `public-relations`, `events`, `co-marketing`, `content-research-writer`, `twitter-algorithm-optimizer`, `competitive-ads-extractor`

### Selling to customers
`offers`, `pricing`, `prospecting`, `cold-email`, `sales-enablement`, `revops`, `lead-research-assistant`, `meeting-insights-analyzer`, `customer-research`, `competitor-profiling`, `competitors`, `reverse-engineer-marketing`, `marketing-psychology`, `product-marketing`, `launch`, `referrals`, `churn-prevention`, `paywalls`, `aso`

### Running the business
`invoice-organizer`, `domain-name-brainstormer`, `find-skills`

### Sources (reviewed before installing)

| Source | Pinned commit | Skills |
| --- | --- | --- |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | `92a9a34` | find-skills |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `88c79f6` | all 53 marketing skills |
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | `be2a406` | the 7 sales, research and business skills |

The only bundled script is `reverse-engineer-marketing/scripts/teardown.mjs`, a competitor-research tool that reads public sources. It only uses a `SCRAPECREATORS_API_KEY` if the owner sets one.

### Updating or adding skills

Skills run with full agent permissions, so read any new or changed `SKILL.md` and its scripts before committing them. To refresh a source, run from the repo root:

```bash
npx skills add https://github.com/coreyhaines31/marketingskills --skill '*' --agent claude-code --copy -y
```

Then review the diff (`git diff .claude/skills`) before committing.
