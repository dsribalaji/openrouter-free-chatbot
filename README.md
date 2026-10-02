# Free Chatbot — OpenRouter

A simple static chatbot (HTML + CSS + vanilla JavaScript) that talks to the
OpenRouter API using **free models only**. No build step, no frameworks, no
external assets — the only network calls at runtime go to `openrouter.ai`.

**Live:** https://dsribalaji.github.io/openrouter-free-chatbot/

## Use

1. Open the live URL.
2. Paste your OpenRouter API key when prompted (get one at
   https://openrouter.ai/keys). It is stored only in your browser's
   `localStorage` — never sent anywhere except OpenRouter.
3. Pick a free model from the sidebar (the list refreshes from OpenRouter's
   public `/models` endpoint and is filtered to `$0` prompt + completion
   pricing) and start chatting.

## Features

- Streaming responses (SSE) with a typing indicator and Stop button
- Free-model picker with daily refresh + offline fallback list
- Conversation persisted in the browser; New chat / Clear chat
- Responsive dark UI, mobile drawer sidebar, keyboard submit (Enter)

## Files

- `index.html` — markup (all element IDs per `DESIGN_CONTRACT.md`)
- `styles.css` — design tokens, layout, responsive rules
- `app.js` — key management, model fetching, streaming chat logic
- `DESIGN_CONTRACT.md` — the build contract the engineering team worked to
- `decision.md` — why the repo is shaped this way

## Data analysis mode

The sidebar's **Data analysis** section connects the chatbot to the
serverless-analyst backend (SB's agentic data-analysis platform):

1. Set the **Backend URL** (default `http://localhost:8000` for local runs) and
   the optional **Backend key**, then save.
2. Choose a CSV/Excel dataset, type your question, and hit **Analyze**.
3. The chatbot uploads the file, starts the 8-step agentic pipeline, shows live
   progress, and renders the final report in the chat when done.

Run the backend locally with:
`SLA_BLOB_BACKEND=local uvicorn slanalyst.api.app:app --reload`
from `~/workspace/serverless-analyst` (see its README for cloud deploys).
