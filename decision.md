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
