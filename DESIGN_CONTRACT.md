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

## Data-analysis mode (added 2026-10-02) — chatbot drives the serverless-analyst backend

The chatbot gains an "Analyze" flow in the sidebar that uploads a dataset to the
serverless-analyst backend, starts an agentic analysis, polls progress, and
renders the final report as an assistant message. The backend URL/key are
user-configurable (the backend is not deployed yet; default points at local dev).

Sidebar section `.sidebar-section.backend-section` (after the chat-buttons
section, before the footer):
- `h3` "Data analysis" (same visual weight as other `.sidebar-label`s)
- `label` "Backend URL" + `input#backend-url` (type=url, placeholder "http://localhost:8000")
- `label` "Backend key (optional)" + `input#backend-key` (type=password, autocomplete="off",
  placeholder "Only if the backend requires one")
- `button#save-backend-btn` ("Save backend settings", secondary/ghost style)
- `label` "Dataset" + `input#dataset-file` (type=file, accept=".csv,.xlsx,.xls")
- `label` "Question" + `textarea#analysis-question` (rows=2,
  placeholder "e.g. What drives revenue?")
- `button#analyze-btn` ("Analyze", --accent primary style)
- `div#analysis-status` (muted small text, aria-live="polite", initial text "")

Behavior (inside the existing DOMContentLoaded closure; reuse showToast,
renderAssistantMessage, scrollToBottom — do not duplicate rendering):
- Storage: `orcb_backend_url` (default "http://localhost:8000"),
  `orcb_backend_key` (default ""). Populate inputs on load.
- `#save-backend-btn`: trim trailing "/" from URL, persist both values,
  toast "Backend settings saved".
- `#analyze-btn`: require a chosen file and a non-empty question; require a
  backend URL. Disable the button while running.
  - Request headers: include `X-API-Key: <key>` only when a key is saved.
  - `POST {url}/datasets` (FormData `file`) → `{dataset_id}`.
    Network failure → status text "Backend unreachable at {url} — is it running?",
    error toast, re-enable. HTTP 401 → status "Backend rejected the key (401).",
    error toast, re-enable. Other non-2xx → toast the backend's detail.
  - `POST {url}/datasets/{id}/analyses` with `{question}` → `{run_id}`.
  - Poll `GET {url}/analyses/{run_id}` every 3000ms: status
    "{done}/{total} steps complete…". On `"succeeded"`: stop polling,
    `GET {url}/analyses/{run_id}/report` → renderAssistantMessage with
    `"## Data analysis report\n\n" + report_markdown`, status "Done.",
    toast "Analysis complete". On `"failed"`: stop polling, error toast
    "Analysis failed — check the backend logs", status "Failed.".
- Styling: inputs/textarea full-width, --panel-2 background, 1px --border,
  --radius-sm; section separated by a top border like other sections; the
  file input keeps the native control (no custom styling beyond width).
- No emojis. All copy plain English.

## In-browser analyst (added 2026-10-02 — SUPERSEDES the Data-analysis mode section above)

The analyst runs ENTIRELY in the browser. There is no backend server.
~/workspace/serverless-analyst has been deleted. The LLM engine is the chatbot's
own OpenRouter setup: the saved key (localStorage `orcb_api_key`) and the
currently selected free model in #model-select. CSV input only for now (Excel
needs an external library, which the zero-external-asset rule forbids).

Files: index.html, styles.css, app.js (existing) + analyst.js (new).
analyst.js exposes `window.Analyst = { runAnalysis(file, question, onProgress) }`
returning Promise<string> (the report markdown). Load order in index.html:
analyst.js (defer) BEFORE app.js (defer).

### analyst.js contents (no external libraries, no emojis in strings)

1. `parseCSV(text)` — small robust parser (quoted fields, commas/newlines inside
   quotes, \r\n line endings) → `{columns: string[], rows: string[][], rowCount}`.
   Throw `Error("Could not parse the CSV…")` on empty/unparseable input.
2. `profileDataset(ds)` — deterministic, no LLM →
   `{rowCount, columns: [{name, dtype: 'number'|'date'|'text', nullPct, unique}], numericSummaries: {col: {min, max, mean}}, sample: first 5 rows as objects}`.
   dtype sniff: number if every non-empty value parses as a number; date if
   Date.parse succeeds on >80% of non-empty values; else text.
3. `callLLM(systemPrompt, userPrompt)` — POST
   `https://openrouter.ai/api/v1/chat/completions` with the saved key,
   `model` = current `#model-select` value, headers `Authorization: Bearer`,
   `Content-Type`, `HTTP-Referer: location.origin`, `X-Title: "Ruby Free Chatbot"`.
   Body `{model, messages: [{role:'system',...},{role:'user',...}], temperature: 0.2, max_tokens: 4000}`.
   Return the assistant text; throw on !ok with the server's error message.
   Throw `Error("Add your OpenRouter API key first.")` when no key is saved.
4. Pipeline — sequential, each step awaited; `onProgress(label, done, total)` called
   per step (9 steps):
   1. `framing` (LLM): question + dataset summary (columns, row count) → short brief.
   2. `profiler` (deterministic): profileDataset.
   3. `hypothesis` (LLM): brief + profile → up to 3 testable hypotheses.
   4. `planner` (LLM): → JSON ONLY, an array ≤6 of
      `{title, op, column?, groupBy?}` where op ∈ {count, sum, mean, group_count, group_sum}.
      Parse defensively (strip ``` fences before JSON.parse).
   5. `executor` (deterministic): run each planned op over the rows —
      count → rowCount; sum/mean → numeric column; group_count/group_sum →
      top 10 groups sorted desc. Produce markdown tables of the results.
   6. `narrator` (LLM): results tables → findings markdown with the numbers.
   7. `verifier` (LLM): findings + raw result tables → re-check every number,
      list corrections or confirm.
   8. `validator` (LLM): → output MUST be only
      `{"verdict": "pass"|"fail", "notes": "..."}`; if verdict is fail, throw
      `Error("Analysis failed validation: " + notes)`.
   9. `reporter` (LLM): everything → full markdown report (title, key findings
      with numbers, result tables, caveats). Return the markdown.
   Prompts are tight, unattended-execution tone, adapted from the ai-analyst
   agent contracts (framing / hypothesis / planning / verification / validation /
   reporting). Never log the API key.

### UI changes (chatbot repo)

- index.html: REMOVE the backend-url, backend-key, and save-backend-btn rows.
  The `.sidebar-section.backend-section` keeps: h3 "Data analysis", a short hint
  ("Runs in your browser using your OpenRouter key and the selected free model."),
  `label`+`input#dataset-file` (type=file, accept=".csv"), `label`+`textarea#analysis-question`
  (rows=2), `button#analyze-btn` ("Analyze"), `div#analysis-status` (aria-live="polite").
- app.js: DELETE the backend fetch/poll code (POST /datasets, polling, X-API-Key).
  Wire `#analyze-btn`: require a `.csv` file (else toast "Please choose a CSV file —
  Excel support is coming later.") and a non-empty question; disable the button;
  read the file as text; `await window.Analyst.runAnalysis(file, question, onProgress)`;
  onProgress sets `#analysis-status` text ("Step 3/9: planning…");
  on success renderAssistantMessage("## Data analysis report\n\n" + md),
  status "Done.", toast "Analysis complete"; on error status shows the message
  and an error toast. Re-enable the button on every path.
- styles.css: remove rules that only served the deleted backend-settings rows;
  keep everything else.
- README.md: rewrite the "Data analysis mode" section for the in-browser design
  (no backend, CSV only, uses the saved OpenRouter key + selected model).
- decision.md: prepend a 2026-10-02 entry recording the pivot (serverless folder
  removed; analyst runs in-browser on the chatbot's OpenRouter key).

## Chat-embedded analyst (added 2026-10-02 — the chat IS the analyst; SUPERSEDES the sidebar UI described in the In-browser analyst section)

There is NO sidebar analysis section and NO separate Analyze button/question box.
The main chat itself performs analysis: the user attaches a CSV in the composer,
then just chats. While a dataset is attached, every message runs the analyst
pipeline and the findings come back as ordinary assistant messages.

- The analyst.js ENGINE spec from the previous section stands, with two changes:
  (a) expose `window.Analyst.parseCSV` as well as `window.Analyst.runAnalysis`;
  (b) `runAnalysis(dataset, question, onProgress)` takes
  `dataset = {name: string, text: string}` (CSV text, not a File).
- index.html:
  - DELETE the entire `.sidebar-section.backend-section` (backend-url, backend-key,
    save-backend-btn, dataset-file, analysis-question, analyze-btn, analysis-status —
    all of it).
  - In `form#composer`, before the textarea: `button#attach-btn` (type="button",
    text "Attach", title "Attach a CSV dataset", secondary style) and a hidden
    `input#chat-file-input` (type="file", accept=".csv").
  - Between `#chat-messages` and the composer: `div#dataset-chip` (hidden by default)
    containing `span#dataset-chip-label` and `button#clear-dataset-btn` ("×",
    aria-label "Remove dataset"); and `div#analysis-progress` (hidden by default,
    muted small text, aria-live="polite").
- app.js (inside the existing DOMContentLoaded closure):
  - `#attach-btn` click → `#chat-file-input` click. On file chosen: must end in
    `.csv` (else toast "Please choose a CSV file — Excel support is coming later.");
    read as text; `window.Analyst.parseCSV(text)` (throws on bad input → toast the
    message); store as closure-scope `activeDataset = {name, text}` AND persist
    `localStorage["orcb_dataset"] = JSON.stringify({name, text})` inside try/catch
    (quota errors → keep memory-only); show `#dataset-chip` with label
    `"{name} — {rows} rows"`; toast "Dataset attached — ask me anything about it.".
    On load: restore `orcb_dataset` if present (re-parse; on failure clear it).
  - `#clear-dataset-btn`: clear activeDataset + localStorage, hide chip,
    toast "Dataset removed".
  - Form submit: if `activeDataset` is set → analyst path: render the user message
    normally, disable the composer, show `#analysis-progress` ("Analyzing… step 1/9"),
    `await window.Analyst.runAnalysis(activeDataset, question, onProgress)` with
    onProgress updating `#analysis-progress` text ("Analyzing… step 3/9: planning");
    on success hide progress, renderAssistantMessage("## Data analysis report\n\n" + md)
    (persisted to history like normal messages), toast "Analysis complete";
    on error hide progress, error toast with the message. Re-enable the composer
    on every path.
  - If no dataset is attached: the existing OpenRouter chat flow, unchanged.
- styles.css: style `#attach-btn` (secondary), `#dataset-chip` (pill: --panel-2 bg,
  --border, --radius, small text; × button muted), `#analysis-progress` (muted small,
  padding); remove any rules that only served the deleted backend-section.
- README.md: describe the chat-embedded analyst (attach a CSV in the composer;
  while attached, the chat answers as an analyst; × removes the dataset).
- decision.md: prepend a 2026-10-02 entry for this correction (chat-embedded
  instead of sidebar-based; no backend anywhere).

## Full repo port (added 2026-10-02 — SUPERSEDES the 9-step engine spec; chat-embedded UI stands)

Port the ai-analyst-lab/ai-analyst pipeline faithfully into the browser. Reference
material: /tmp/ai-analyst-ref (agents/registry.yaml + agents/*/[*.md], helpers/
for behavior reference). The engine remains the chatbot's OpenRouter key + selected
free model. Scripts (classic, defer, in order): helpers.js, agents.js, analyst.js,
app.js. Each of the first three attaches to `window` (`window.Helpers`,
`window.AgentRegistry`, `window.Analyst`).

### agents.js — `window.AgentRegistry = { agents: [...] }`
Port ALL agents from the repo's registry.yaml (40). Each entry:
`{name, step, kind, critical, depends_on[], depends_on_any[], inputs: [{name, source}],
outputs: [{key}], needsCompute, prompt}`.
- kind: 'llm' for all, except add ONE new deterministic agent `dataset-profiler`
  (step 1.5, critical, depends_on [], runs Helpers.profileDataset, outputs [{key:'profile'}]).
- needsCompute=true for: data-explorer, descriptive-analytics, overtime-trend,
  cohort-analysis, root-cause-investigator (the repo's LLM+det agents).
- inputs use the repo's source vocabulary: 'user' | 'system' | 'agent:<name>'.
  System inputs available: DATASET_PROFILE, KNOWLEDGE (schema/quirks/corrections/metrics),
  DATE. `agent:<name>` resolves to that agent's primary output text.
- Prompt adaptation rules: start every prompt with a header line `[agent: <name>]`;
  keep the repo prompt's intent and unattended tone; REMOVE .knowledge/... paths,
  outputs/... file writes, and Claude-Code-isms; inputs arrive as {{VAR}} sections
  which the runner fills; outputs are artifact keys, not files; keep prompts tight.
- chart-maker (and any visual agent): prompt must demand output be ONLY the chart-spec
  JSON: `{"charts": [{"key": "chart1", "type": "bar", "title": "...", "labels": [...], "values": [...]}]}`.
- validation agent: output MUST be only `{"verdict": "pass"|"fail", "notes": "..."}`.
- No emojis anywhere. Never mention API keys in prompts.

### helpers.js — `window.Helpers = {...}` (no external libs, no DOM except noted)
- `parseCSV(text)` → {columns, rows, rowCount} (robust: quotes, embedded commas/newlines).
- `profileDataset(ds)` → {rowCount, columns:[{name, dtype, nullPct, unique}], numericSummaries, sample}.
- `describeStats(rows, column)` → {min, max, mean, median} for numeric columns.
- `correlation(rows, colA, colB)` → Pearson r or null.
- `iqrOutliers(rows, column)` → array of row indexes that are outliers.
- `executeOps(parsed, ops)` → markdown tables string; ops: {title, op, column?, groupBy?},
  op ∈ {count, sum, mean, group_count, group_sum}; max 6 ops; group results top 10 desc;
  non-numeric ignored for sum/mean; pipe chars escaped.
- `barChartSVG({title, labels, values})`, `lineChartSVG({title, labels, values})` → SVG string
  (self-contained: inline styles, no external refs, readable at 600px wide).
- `renderChartSpecs(specs)` → {key: svgString}.
- `Knowledge` (localStorage `orcb_knowledge`, JSON {datasets:{}, corrections:[], metrics:{}}):
  getDataset/saveDataset(name, {schema, quirks}), getCorrections/addCorrection(text),
  getMetrics/setMetric(name, def), all try/catch-guarded.
- `downloadMarkdown(filename, text)` → Blob download (DOM allowed here).

### analyst.js — generic DAG runner (REWRITES the old 9-step engine)
- `window.Analyst = { runAnalysis(dataset, question, onProgress), parseCSV }`
  (parseCSV delegates to Helpers; keep the signature — app.js depends on it).
- On run: validate registry (dup names, unknown deps, cycles — port the repo's dag.py
  semantics incl. depends_on_any as OR); compute tiers (Kahn's); execute tier by tier,
  agents sequentially inside a tier.
- Input resolution per agent: user → {QUESTION: question}; system → DATASET_PROFILE
  (from dataset-profiler artifact), KNOWLEDGE (rendered from Helpers.Knowledge),
  DATE; agent:<name> → upstream artifact text (missing required → throw).
- kinds: 'llm' → render prompt ({{VAR}} substitution), callLLM (same headers/auth as
  before: saved key, #model-select model, temperature 0.2, max_tokens 4000);
  'deterministic' → call the named Helpers function with a ctx {dataset, artifacts}.
- needsCompute agents: prompt includes the compute-block instruction —
  'To compute exact numbers, emit a ```computejson fenced block containing
  {"ops":[{...}]} (ops: count|sum|mean|group_count|group_sum, max 6).'
  Runner extracts the block, runs Helpers.executeOps, appends
  "## Computed results (exact — use these numbers, do not recompute)" and re-prompts
  ONCE for the final answer.
- Chart pipeline: after any agent named chart-maker completes, parse its chart-spec
  JSON, Helpers.renderChartSpecs → artifacts; the report-writer prompt instructs
  placing `<!--CHART:<key>-->` markers; after report-writer, the runner replaces
  markers with the SVG strings (only markers the runner inserted are replaced —
  SVGs come from our code, never from LLM text).
- Artifacts: `{[agentName]: {[outputKey]: text}}` in memory; persisted per run to
  localStorage `orcb_run_state` ({artifacts, done:[names]}) after each agent for
  resume; resume continues at the first incomplete agent in tier order.
- Robustness: 1200ms pacing between LLM calls; on HTTP 429 retry once after 5s;
  critical agent failure → throw (run fails); non-critical failure → mark degraded,
  continue. validation agent: parse verdict JSON; fail → throw
  "Analysis failed validation: <notes>".
- onProgress(label, done, total) per agent. No emojis. Never log the key.

### app.js changes (chat-embedded UI stands; these are additions)
- Keep attach/chip/progress/dataset flows exactly as built.
- `remember:` prefix: if the message starts with "remember:" (case-insensitive),
  save the remainder via Helpers.Knowledge.addCorrection, reply with a short
  assistant confirmation ("Noted — I'll honor that in future analyses."), and do
  NOT run the analyst or the normal chat path.
- After a successful analysis: show a "Download report (.md)" button inside
  #analysis-progress (temporary, removed on next run) calling
  Helpers.downloadMarkdown("analysis-report.md", reportMarkdown).
- Everything else unchanged.

### Not ported (honest limits — document in README)
Warehouse connectors (Postgres/Snowflake/BigQuery…), Python-only advanced stats
(causal inference, power analysis, forecasting), OAuth exports (Google/Notion/Slack),
the eval harness. README's port-notes section must list these four plainly.
