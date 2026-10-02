document.addEventListener("DOMContentLoaded", () => {
  const KEY_STORAGE = "orcb_api_key";
  const MODELS_CACHE = "orcb_models_cache";
  const HISTORY_KEY = "orcb_history";
  const SELECTED_MODEL_KEY = "orcb_selected_model";
  const API_URL = "https://openrouter.ai/api/v1/chat/completions";
  const MODELS_URL = "https://openrouter.ai/api/v1/models";

  const FALLBACK_MODELS = [
    "apodex/apodex-1.1-mini:free",
    "cohere/north-mini-code:free",
    "dots-studio/dots-3-note-preview:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-31b-it:free",
    "google/lyria-3-clip-preview",
    "google/lyria-3-pro-preview",
    "inclusionai/ling-3.0-flash-sante:free",
    "liquid/lfm-2.5-2.6b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3.5-content-safety:free",
    "nvidia/nemotron-3.5-lightning:free",
    "openrouter/free",
    "poolside/laguna-s-2.1:free",
    "poolside/laguna-xs-2.1:free",
    "qwen/qwen3.8-27b:free",
    "stealth/space-bunny-alpha",
    "thinkingmachines/inkling-small:free",
    "thinkingmachines/inkling:free"
  ];

  const keyModal = document.getElementById("key-modal");
  const cancelKeyBtn = document.getElementById("cancel-key-btn");
  const saveKeyBtn = document.getElementById("save-key-btn");
  const apiKeyInput = document.getElementById("api-key-input");
  const modelSelect = document.getElementById("model-select");
  const modelNameBadge = document.getElementById("model-name-badge");
  const refreshModelsBtn = document.getElementById("refresh-models-btn");
  const chatMessages = document.getElementById("chat-messages");
  const emptyState = document.getElementById("empty-state");
  const composerForm = document.getElementById("composer");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const stopBtn = document.getElementById("stop-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const clearChatBtn = document.getElementById("clear-chat-btn");
  const changeKeyBtn = document.getElementById("change-key-btn");
  const keyStatus = document.getElementById("key-status");
  const menuBtn = document.getElementById("menu-btn");
  const toast = document.getElementById("toast");
  const sidebar = document.querySelector(".sidebar") || document.querySelector("aside");

  let history = [];
  let isStreaming = false;
  let currentAbortController = null;
  let toastTimer = null;

  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.setAttribute("aria-live", "polite");
    if (isError) {
      toast.classList.add("error");
    } else {
      toast.classList.remove("error");
    }
    toast.classList.add("show");

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      toast.classList.remove("error");
    }, 4000);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderMarkdown(rawText) {
    if (!rawText) return "";
    const escaped = escapeHtml(rawText);
    const nonce = Math.random().toString(36).slice(2);
    const blockPrefix = `__CB_${nonce}_`;
    const inlinePrefix = `__IC_${nonce}_`;
    const codeBlocks = [];
    const inlineCodes = [];

    let text = escaped.replace(/```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```[ \t]*/g, (match, lang, code) => {
      const placeholder = `${blockPrefix}${codeBlocks.length}__`;
      const cleanLang = lang.trim();
      const langSpan = cleanLang ? `<span class="code lang-label">${cleanLang}</span>` : "";
      const html = `<pre class="code-block"${cleanLang ? ` data-lang="${cleanLang}"` : ""}>${langSpan}<code>${code}</code></pre>`;
      codeBlocks.push(html);
      return placeholder;
    });

    text = text.replace(/```([a-zA-Z0-9_+-]*)[ \t]*\r?\n?([\s\S]*)$/g, (match, lang, code) => {
      const placeholder = `${blockPrefix}${codeBlocks.length}__`;
      const cleanLang = lang.trim();
      const langSpan = cleanLang ? `<span class="code lang-label">${cleanLang}</span>` : "";
      const html = `<pre class="code-block"${cleanLang ? ` data-lang="${cleanLang}"` : ""}>${langSpan}<code>${code}</code></pre>`;
      codeBlocks.push(html);
      return placeholder;
    });

    text = text.replace(/`([^`\r\n]+)`/g, (match, code) => {
      const placeholder = `${inlinePrefix}${inlineCodes.length}__`;
      inlineCodes.push(`<code>${code}</code>`);
      return placeholder;
    });

    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\r?\n/g, "<br>");

    inlineCodes.forEach((inlineHtml, idx) => {
      text = text.replace(`${inlinePrefix}${idx}__`, () => inlineHtml);
    });

    codeBlocks.forEach((blockHtml, idx) => {
      text = text.replace(`${blockPrefix}${idx}__`, () => blockHtml);
    });

    return text;
  }

  function renderUserMessage(content) {
    const article = document.createElement("article");
    article.className = "msg user";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = escapeHtml(content).replace(/\r?\n/g, "<br>");
    article.appendChild(bubble);
    return article;
  }

  function renderAssistantMessage(content) {
    const article = document.createElement("article");
    article.className = "msg assistant";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = renderMarkdown(content);
    article.appendChild(bubble);
    return article;
  }

  function scrollToBottom() {
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function updateEmptyState(hasMessages) {
    if (!emptyState) return;
    if (hasMessages) {
      emptyState.hidden = true;
      emptyState.setAttribute("hidden", "");
      emptyState.classList.add("hidden");
      emptyState.classList.remove("show");
      emptyState.style.display = "none";
    } else {
      if (chatMessages && !chatMessages.contains(emptyState)) {
        chatMessages.appendChild(emptyState);
      }
      emptyState.hidden = false;
      emptyState.removeAttribute("hidden");
      emptyState.classList.remove("hidden");
      emptyState.classList.add("show");
      emptyState.style.display = "";
      if (getComputedStyle(emptyState).display === "none") {
        emptyState.style.display = "block";
      }
    }
  }

  function setComposerEnabled(enabled, placeholder) {
    if (userInput) {
      userInput.disabled = !enabled;
      if (placeholder !== undefined) {
        userInput.placeholder = placeholder;
      }
    }
    if (sendBtn) {
      sendBtn.disabled = !enabled;
    }
  }

  function setStreamingState(streaming) {
    isStreaming = streaming;
    if (stopBtn) {
      if (streaming) {
        stopBtn.hidden = false;
        stopBtn.removeAttribute("hidden");
        stopBtn.classList.remove("hidden");
        stopBtn.classList.add("show");
        stopBtn.style.display = "";
        if (getComputedStyle(stopBtn).display === "none") {
          stopBtn.style.display = "inline-flex";
        }
      } else {
        stopBtn.hidden = true;
        stopBtn.setAttribute("hidden", "");
        stopBtn.classList.add("hidden");
        stopBtn.classList.remove("show");
        stopBtn.style.display = "none";
      }
    }
  }

  function updateKeyStatus(hasKey) {
    if (!keyStatus) return;
    keyStatus.textContent = hasKey ? "API key saved" : "API key not set";
  }

  function showKeyModal() {
    if (!keyModal) return;
    keyModal.hidden = false;
    keyModal.removeAttribute("hidden");
    keyModal.classList.remove("hidden");
    keyModal.classList.add("show");
    keyModal.classList.add("open");
    keyModal.setAttribute("aria-hidden", "false");
    keyModal.style.display = "";
    if (getComputedStyle(keyModal).display === "none") {
      keyModal.style.display = "flex";
    }
    if (apiKeyInput) {
      apiKeyInput.value = localStorage.getItem(KEY_STORAGE) || "";
      setTimeout(() => {
        apiKeyInput.focus();
      }, 50);
    }
  }

  function hideKeyModal() {
    if (!keyModal) return;
    keyModal.hidden = true;
    keyModal.setAttribute("hidden", "");
    keyModal.classList.add("hidden");
    keyModal.classList.remove("show");
    keyModal.classList.remove("open");
    keyModal.setAttribute("aria-hidden", "true");
    keyModal.style.display = "none";
  }

  function closeMobileDrawer() {
    if (sidebar && sidebar.classList.contains("open")) {
      sidebar.classList.remove("open");
    }
  }

  function autoGrowTextarea() {
    if (!userInput) return;
    userInput.style.height = "auto";
    const maxHeight = 160;
    if (userInput.scrollHeight > maxHeight) {
      userInput.style.height = `${maxHeight}px`;
      userInput.style.overflowY = "auto";
    } else {
      userInput.style.height = `${userInput.scrollHeight}px`;
      userInput.style.overflowY = "hidden";
    }
  }

  function resetTextareaHeight() {
    if (!userInput) return;
    userInput.style.height = "";
    userInput.style.overflowY = "";
  }

  function populateModelSelect(models) {
    if (!modelSelect) return;
    const previouslySelected = modelSelect.value || localStorage.getItem(SELECTED_MODEL_KEY);

    modelSelect.innerHTML = "";
    models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      modelSelect.appendChild(opt);
    });

    if (previouslySelected && models.some((m) => m.id === previouslySelected)) {
      modelSelect.value = previouslySelected;
    } else if (models.length > 0) {
      modelSelect.value = models[0].id;
    }

    const currentId = modelSelect.value;
    if (modelNameBadge) {
      modelNameBadge.textContent = currentId;
    }
    if (currentId) {
      try {
        localStorage.setItem(SELECTED_MODEL_KEY, currentId);
      } catch (_) {}
    }
  }

  async function loadModels(bypassCache = false) {
    if (refreshModelsBtn) {
      refreshModelsBtn.disabled = true;
    }
    try {
      let models = null;

      if (!bypassCache) {
        try {
          const raw = localStorage.getItem(MODELS_CACHE);
          if (raw) {
            const parsed = JSON.parse(raw);
            const age = Date.now() - (parsed.timestamp || 0);
            const ONE_DAY = 24 * 60 * 60 * 1000;
            if (age < ONE_DAY && Array.isArray(parsed.models) && parsed.models.length > 0) {
              models = parsed.models;
            }
          }
        } catch (_) {}
      }

      if (!models) {
        try {
          const res = await fetch(MODELS_URL);
          if (!res.ok) {
            throw new Error("HTTP error " + res.status);
          }
          const json = await res.json();
          const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
          const free = list.filter((m) => {
            return m && m.pricing && String(m.pricing.prompt) === "0" && String(m.pricing.completion) === "0";
          });
          if (free.length === 0) {
            throw new Error("No free models found");
          }
          models = free.map((m) => ({
            id: m.id,
            name: m.name || m.id
          }));
          models.sort((a, b) => a.name.localeCompare(b.name));
          try {
            localStorage.setItem(MODELS_CACHE, JSON.stringify({
              timestamp: Date.now(),
              models: models
            }));
          } catch (_) {}
        } catch (_) {
          models = FALLBACK_MODELS.map((id) => ({ id: id, name: id })).sort((a, b) => a.name.localeCompare(b.name));
          showToast("Could not refresh models \u2014 showing saved list.", true);
        }
      }

      populateModelSelect(models);
    } finally {
      if (refreshModelsBtn) {
        refreshModelsBtn.disabled = false;
      }
    }
  }

  function restoreHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          history = parsed;
          updateEmptyState(true);
          history.forEach((msg) => {
            if (msg.role === "user") {
              chatMessages.appendChild(renderUserMessage(msg.content));
            } else if (msg.role === "assistant") {
              chatMessages.appendChild(renderAssistantMessage(msg.content));
            }
          });
          scrollToBottom();
          return;
        }
      }
    } catch (_) {
      history = [];
    }
    updateEmptyState(false);
  }

  function clearChat(shouldToast = false) {
    if (isStreaming && currentAbortController) {
      currentAbortController.abort();
    }
    history = [];
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (_) {}

    if (chatMessages) {
      const msgElements = chatMessages.querySelectorAll("article.msg, .msg");
      msgElements.forEach((el) => el.remove());
    }
    updateEmptyState(false);

    if (shouldToast) {
      showToast("Chat cleared");
    }
  }

  async function sendMessage() {
    if (isStreaming) return;

    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) {
      setComposerEnabled(false, "Add your API key to chat");
      showKeyModal();
      return;
    }

    const text = userInput ? userInput.value.trim() : "";
    if (!text) return;

    const selectedModel = modelSelect ? modelSelect.value : "";
    if (!selectedModel) {
      showToast("Please select a model", true);
      return;
    }

    userInput.value = "";
    resetTextareaHeight();

    history.push({ role: "user", content: text });
    updateEmptyState(true);

    const userMsgEl = renderUserMessage(text);
    chatMessages.appendChild(userMsgEl);
    scrollToBottom();

    const assistantMsgEl = document.createElement("article");
    assistantMsgEl.className = "msg assistant";
    const bubbleEl = document.createElement("div");
    bubbleEl.className = "bubble typing";
    bubbleEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    assistantMsgEl.appendChild(bubbleEl);
    chatMessages.appendChild(assistantMsgEl);
    scrollToBottom();

    setComposerEnabled(false);
    setStreamingState(true);
    currentAbortController = new AbortController();

    let assistantText = "";
    let receivedFirstToken = false;
    let hasHandledCompletion = false;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin || "http://localhost",
          "X-Title": "Ruby Free Chatbot"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: history,
          stream: true
        }),
        signal: currentAbortController.signal
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 401) {
          try {
            localStorage.removeItem(KEY_STORAGE);
          } catch (_) {}
          updateKeyStatus(false);
          setComposerEnabled(false, "Add your API key to chat");
          showKeyModal();
          showToast("Invalid API key", true);
        } else if (status === 402 || status === 429) {
          let serverError = "";
          try {
            const errData = await response.json();
            serverError = errData?.error?.message || errData?.message || "";
          } catch (_) {}
          if (!serverError) {
            serverError = status === 402 ? "Payment required or credit limit reached" : "Too many requests. Please wait and try again.";
          }
          showToast(serverError, true);
        } else {
          let serverError = "";
          try {
            const errData = await response.json();
            serverError = errData?.error?.message || errData?.message || "";
          } catch (_) {}
          showToast(serverError || "Request failed", true);
        }

        assistantMsgEl.remove();
        history.pop();
        return;
      }

      if (!response.body) {
        throw new Error("No response body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6).trim();
          if (payload === "[DONE]") {
            hasHandledCompletion = true;
            break;
          }

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              showToast(parsed.error.message || "Error during generation", true);
              hasHandledCompletion = true;
              break;
            }
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) {
              if (!receivedFirstToken) {
                receivedFirstToken = true;
                bubbleEl.className = "bubble streaming";
              }
              assistantText += chunk;
              bubbleEl.innerHTML = renderMarkdown(assistantText) + '<span class="cursor"></span>';
              scrollToBottom();
            }
          } catch (_) {}
        }

        if (hasHandledCompletion) break;
      }

      if (!hasHandledCompletion && buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6).trim();
          if (payload === "[DONE]") {
            hasHandledCompletion = true;
            break;
          }
          try {
            const parsed = JSON.parse(payload);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) {
              if (!receivedFirstToken) {
                receivedFirstToken = true;
                bubbleEl.className = "bubble streaming";
              }
              assistantText += chunk;
              bubbleEl.innerHTML = renderMarkdown(assistantText) + '<span class="cursor"></span>';
              scrollToBottom();
            }
          } catch (_) {}
        }
      }

      if (receivedFirstToken && assistantText.length > 0) {
        bubbleEl.className = "bubble";
        bubbleEl.innerHTML = renderMarkdown(assistantText);
        history.push({ role: "assistant", content: assistantText });
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (_) {}
      } else {
        assistantMsgEl.remove();
        history.pop();
        showToast("No response from model", true);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        if (receivedFirstToken && assistantText.length > 0) {
          bubbleEl.className = "bubble";
          bubbleEl.innerHTML = renderMarkdown(assistantText);
          history.push({ role: "assistant", content: assistantText });
          try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
          } catch (_) {}
        } else {
          assistantMsgEl.remove();
          history.pop();
        }
      } else {
        showToast("Request failed", true);
        if (!receivedFirstToken) {
          assistantMsgEl.remove();
          history.pop();
        } else {
          bubbleEl.className = "bubble";
          bubbleEl.innerHTML = renderMarkdown(assistantText);
          history.push({ role: "assistant", content: assistantText });
          try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
          } catch (_) {}
        }
      }
    } finally {
      setStreamingState(false);
      setComposerEnabled(true);
      currentAbortController = null;
      scrollToBottom();
      if (userInput) {
        userInput.focus();
      }
    }
  }

  if (cancelKeyBtn) {
    cancelKeyBtn.addEventListener("click", () => {
      hideKeyModal();
      const hasKey = Boolean(localStorage.getItem(KEY_STORAGE));
      if (!hasKey) {
        setComposerEnabled(false, "Add your API key to chat");
        updateKeyStatus(false);
      }
    });
  }

  if (saveKeyBtn) {
    saveKeyBtn.addEventListener("click", () => {
      const key = apiKeyInput ? apiKeyInput.value.trim() : "";
      if (!key) {
        showToast("Please enter an API key", true);
        if (apiKeyInput) apiKeyInput.focus();
        return;
      }
      try {
        localStorage.setItem(KEY_STORAGE, key);
      } catch (_) {}
      hideKeyModal();
      setComposerEnabled(true, "Ask anything...");
      updateKeyStatus(true);
      loadModels();
    });
  }

  if (apiKeyInput) {
    apiKeyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (saveKeyBtn) {
          saveKeyBtn.click();
        }
      }
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener("change", () => {
      const val = modelSelect.value;
      if (modelNameBadge) {
        modelNameBadge.textContent = val;
      }
      try {
        localStorage.setItem(SELECTED_MODEL_KEY, val);
      } catch (_) {}
      closeMobileDrawer();
    });
  }

  if (refreshModelsBtn) {
    refreshModelsBtn.addEventListener("click", () => {
      loadModels(true);
    });
  }

  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
      clearChat(false);
      closeMobileDrawer();
    });
  }

  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      clearChat(true);
      closeMobileDrawer();
    });
  }

  if (changeKeyBtn) {
    changeKeyBtn.addEventListener("click", () => {
      showKeyModal();
      closeMobileDrawer();
    });
  }

  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("open");
    });
  }

  document.addEventListener("click", (e) => {
    if (sidebar && sidebar.classList.contains("open")) {
      if (!sidebar.contains(e.target) && !menuBtn?.contains(e.target)) {
        closeMobileDrawer();
      }
    }
  });

  if (userInput) {
    userInput.addEventListener("input", autoGrowTextarea);
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        if (e.isComposing) return;
        e.preventDefault();
        if (sendBtn && !sendBtn.disabled) {
          sendMessage();
        }
      }
    });
  }

  if (composerForm) {
    composerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (sendBtn && !sendBtn.disabled) {
        sendMessage();
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", (e) => {
      if (sendBtn.type === "button") {
        e.preventDefault();
        if (!sendBtn.disabled) {
          sendMessage();
        }
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (currentAbortController) {
        currentAbortController.abort();
      }
    });
  }

  setStreamingState(false);
  restoreHistory();

  const savedKey = localStorage.getItem(KEY_STORAGE);
  if (!savedKey) {
    setComposerEnabled(false, "Add your API key to chat");
    updateKeyStatus(false);
    showKeyModal();
  } else {
    setComposerEnabled(true, "Ask anything...");
    updateKeyStatus(true);
  }

  loadModels();
});
