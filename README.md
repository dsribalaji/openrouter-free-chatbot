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
