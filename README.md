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

The chatbot includes a chat-embedded analyst that runs entirely in your browser:

1. Attach a CSV dataset using the **Attach** button in the composer.
2. While a dataset is attached (indicated by the dataset chip showing the file name and row count), every message you send runs the 9-step analyst pipeline (framing → profiling → hypothesis → planning → execution → narration → verification → validation → report) directly in your browser using your OpenRouter API key and selected free model.
3. The resulting analysis is delivered as an assistant report message directly into the chat conversation.
4. Click the **×** on the dataset chip to remove the attached dataset.
5. The attached dataset persists in the browser's local storage across page refreshes.
