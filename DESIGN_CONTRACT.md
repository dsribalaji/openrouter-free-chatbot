# DESIGN_CONTRACT.md — OpenRouter Free-Model Chatbot

Single-page static chatbot (no build step, no frameworks, no npm, no external
JS/CSS libraries — everything self-contained in three files). Deploys to
GitHub Pages from the repo root (`index.html` served directly).

Build dir: `~/workspace/openrouter-chatbot/`
Target repo: `dsribalaji/openrouter-free-chatbot` (public, GitHub Pages from `main`).

## File ownership (no overlaps)

| Worker | Owns | Must NOT touch |
|---|---|---|
| UI worker | `index.html`, `styles.css` | `app.js` |
| Logic worker | `app.js` | `index.html`, `styles.css` |

Ruby (consistency pass) may fix drift in any file afterwards.

## Design tokens (use these exact values, no substitutes)

```css
--bg: #0e1117;          /* page background */
--panel: #151a23;       /* sidebar, cards */
--panel-2: #1b2230;     /* input area, hover surfaces */
--border: #262d3d;      /* 1px borders, dividers */
--text: #e8eaf0;        /* primary text */
--muted: #9aa3b5;       /* secondary text, placeholders */
--accent: #6e8cff;      /* primary actions, links, user-bubble edge */
--accent-hover: #5a78f0;
--danger: #e5484d;
--radius: 12px;
--radius-sm: 8px;
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px;
```

- Font: system stack only —
  `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;`
  Monospace for code: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;`
- Shadows: subtle, `0 2px 12px rgba(0,0,0,.35)` for floating elements (modal, toast).
- No emojis anywhere in the UI. No external fonts, no icon libraries (use plain
  text/SVG-inline only if needed; text labels are fine).

## Layout (desktop)

```
#app (flex row, 100dvh)
├── aside.sidebar (280px, --panel bg, right border)
│   ├── brand block: "Free Chat" title + "OpenRouter · free models only" subtitle
│   ├── label "Model" + select#model-select + button#refresh-models-btn ("Refresh")
│   ├── button#new-chat-btn ("New chat") , button#clear-chat-btn ("Clear chat")
│   └── footer: #key-status ("API key saved") + button#change-key-btn ("Change key")
└── main.chat (flex column, flex:1, --bg)
    ├── header.chat-header: "Free Chatbot" + #model-name-badge (current model id, muted)
    ├── #chat-messages (scrollable; #empty-state shown when no messages)
    └── form#composer (--panel bg, top border)
        ├── textarea#user-input (rows=1, auto-grow up to ~160px, placeholder "Ask anything…")
        ├── button#send-btn ("Send", --accent) 
        └── button#stop-btn ("Stop", --danger, hidden unless streaming)
```

Mobile (<768px): sidebar becomes a slide-over drawer toggled by a ☰ button
(text "Menu", id #menu-btn) in the chat header; overlay closes on selection.

## Shared element IDs and classes (exact — both workers must agree)

- `#app`, `.sidebar`, `#model-select`, `#refresh-models-btn`, `#new-chat-btn`,
  `#clear-chat-btn`, `#key-status`, `#change-key-btn`, `#menu-btn`
- `main.chat`, `.chat-header`, `#model-name-badge`
- `#chat-messages`, `#empty-state` (h2 "Start a conversation", p hint about key/models)
- `form#composer`, `textarea#user-input`, `#send-btn`, `#stop-btn`
- `#key-modal` (fixed overlay, hidden by default): `.modal-card` containing
  h2 "Enter your OpenRouter API key", p explaining the key is stored only in
  this browser's localStorage, `input#api-key-input` (type=password),
  `button#save-key-btn` ("Save key"), `button#cancel-key-btn` ("Later")
- `#toast` (fixed bottom, for errors/info; class `.show` to display,
  `.error` variant in --danger)
- Messages: `article.msg.user` / `article.msg.assistant`, each containing
  `.bubble`. Assistant bubbles render: paragraphs, `pre.code-block > code`
  for fenced code (with `code.lang-label` when a language is given),
  inline `code`, `**bold**`. Streaming adds class `.streaming` (with a
  blinking cursor via `.cursor` span).
- Typing state: assistant bubble with class `.typing` showing three animated dots
  (pure CSS, `.dot` spans) — shown between send and first streamed token.

## app.js behavior contract

- Constants: `KEY_STORAGE="orcb_api_key"`, `MODELS_CACHE="orcb_models_cache"`,
  `HISTORY_KEY="orcb_history"`, `API_URL="https://openrouter.ai/api/v1/chat/completions"`,
  `MODELS_URL="https://openrouter.ai/api/v1/models"`.
- On load: if no key in localStorage → show `#key-modal` (blocking; "Later"
  dismisses but composer stays disabled with placeholder "Add your API key to chat").
- `loadModels()`: use cache if <24h old; else fetch MODELS_URL (no auth),
  keep models where `pricing.prompt === "0" && pricing.completion === "0"`,
  map to `{id, name: m.name || m.id}`, sort by name, populate `#model-select`,
  update `#model-name-badge`. On failure: use FALLBACK_MODELS below and toast
  "Could not refresh models — showing saved list."
- `sendMessage()`: disable send, show typing bubble, POST with headers
  `Authorization: Bearer <key>`, `Content-Type: application/json`,
  `HTTP-Referer: location.origin`, `X-Title: "Ruby Free Chatbot"`;
  body `{model, messages: history, stream: true}`; parse SSE (`data: ` lines,
  `[DONE]` ends); append `choices[0].delta.content` into the bubble with
  safe rendering (escape HTML first, then minimal markdown). `#stop-btn`
  aborts via AbortController. On finish: save history, re-enable composer.
- Errors: 401 → clear stored key, reopen modal, toast "Invalid API key";
  402/429 → toast the server message; network failure → toast "Request failed".
  Never `console.log` the API key.
- Buttons: `#new-chat-btn` clears messages+history (keeps model);
  `#clear-chat-btn` same but also toasts "Chat cleared";
  `#change-key-btn` reopens modal; `#refresh-models-btn` re-fetches models;
  Enter (no Shift) in textarea submits.
- Persist conversation to localStorage on every completed turn; restore on load.

## FALLBACK_MODELS (verified free on 2026-10-02; dynamic fetch overrides)

```
apodex/apodex-1.1-mini:free
cohere/north-mini-code:free
dots-studio/dots-3-note-preview:free
google/gemma-4-26b-a4b-it:free
google/gemma-4-31b-it:free
google/lyria-3-clip-preview
google/lyria-3-pro-preview
inclusionai/ling-3.0-flash-sante:free
liquid/lfm-2.5-2.6b:free
nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
nvidia/nemotron-3-super-120b-a12b:free
nvidia/nemotron-3-ultra-550b-a55b:free
nvidia/nemotron-3.5-content-safety:free
nvidia/nemotron-3.5-lightning:free
openrouter/free
poolside/laguna-s-2.1:free
poolside/laguna-xs-2.1:free
qwen/qwen3.8-27b:free
stealth/space-bunny-alpha
thinkingmachines/inkling-small:free
thinkingmachines/inkling:free
```

## Constraints

- Zero external network assets (no CDNs, no fonts, no analytics). The only
  network calls are to `openrouter.ai` at runtime.
- Responsive: usable at 360px width; composer always visible above keyboard.
- Accessible: labels on all inputs, buttons have discernible text, focus-visible
  outlines in --accent, `aria-live="polite"` on `#toast`.
- All user-visible copy in plain English, formal-warm, no emojis.
