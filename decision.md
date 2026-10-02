## 2026-10-02 — Data-analysis mode added: chatbot drives the serverless-analyst backend (SB, ~20:00 IST)
- **Decided by:** SB ("Set this up for my chatbot we have done earlier")
- **Decision:** new sidebar section (backend URL/key settings, dataset upload,
  question, live progress) that calls the serverless-analyst API
  (upload → analyze → poll → report) and renders the report in-chat. Backend
  gained CORS + optional X-API-Key auth for browser use. Backend URL defaults
  to local dev; nothing is deployed yet — a public backend needs SB's cloud
  choice and credentials.
- **Rationale:** reuses the existing chat UI/rendering; backend stays
  cloud-agnostic and SB-controlled.
- **Status:** active

# decision.md

Newest first. Records why this repo is the way it is; git history records
what changed.

## 2026-10-02 — Built as a zero-dependency static site, deployed on GitHub Pages (Ruby, per SB)
- **Decided by:** SB ("Create a chatbot with simple html, css and javascript using openrouter api ... Give me live url after build. Deploy the Engineering team")
- **Decision:** three files only (`index.html`, `styles.css`, `app.js`) — no
  frameworks, no build step, no CDNs — served from the repo root via GitHub
  Pages at `dsribalaji/openrouter-free-chatbot`. API key is supplied by SB
  later, entered in the UI and kept in browser `localStorage` only.
- **Rationale:** static Pages hosting is free, needs no server and no secrets
  in the repo; OpenRouter's API is CORS-friendly for browser calls. Two
  parallel workers (UI + logic) built to a shared `DESIGN_CONTRACT.md` per the
  multi-worker protocol, with a Ruby consistency pass before publish.
- **Status:** active

## 2026-10-02 — Free models resolved dynamically, filtered by $0 pricing (Ruby)
- **Decided by:** Ruby (implements SB's "use only free models")
- **Decision:** at runtime the app fetches OpenRouter's public `/models`
  endpoint and keeps only models with `"0"` prompt and completion pricing;
  a 21-model fallback list (verified 2026-10-02) ships in the contract for
  offline/failure cases.
- **Rationale:** the free-model roster changes over time; hard-coding would rot.
- **Status:** active
