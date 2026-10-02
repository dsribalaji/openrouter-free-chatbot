(function () {
  "use strict";

  /**
   * Enforce pacing between OpenRouter LLM calls (1200ms).
   */
  let lastCallTime = 0;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function paceLLMCall() {
    const now = Date.now();
    const elapsed = now - lastCallTime;
    if (elapsed < 1200) {
      await sleep(1200 - elapsed);
    }
    lastCallTime = Date.now();
  }

  /**
   * Call OpenRouter API with 1200ms pacing and HTTP 429 retry.
   */
  async function callLLM(userText) {
    await paceLLMCall();

    const key = (typeof localStorage !== "undefined" && localStorage.getItem("orcb_api_key")) || "";
    if (!key) {
      throw new Error("Add your OpenRouter API key first.");
    }

    const modelEl = typeof document !== "undefined" ? document.getElementById("model-select") : null;
    const model = (modelEl && modelEl.value) || "";

    const origin = (typeof window !== "undefined" && window.location && window.location.origin)
      ? window.location.origin
      : "http://localhost";

    const fetchOptions = {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "HTTP-Referer": origin,
        "X-Title": "Ruby Free Chatbot"
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: userText }],
        temperature: 0.2,
        max_tokens: 4000
      })
    };

    let response = await fetch("https://openrouter.ai/api/v1/chat/completions", fetchOptions);

    if (response.status === 429) {
      await sleep(5000);
      lastCallTime = Date.now();
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", fetchOptions);
    }

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch (_) {}
      throw new Error("OpenRouter error " + response.status + ": " + bodyText.slice(0, 200));
    }

    const data = await response.json();
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  }

  /**
   * Parse JSON defensively from LLM output (fenced or unfenced).
   */
  function parseJsonDefensively(text) {
    if (typeof text !== "string") return text;
    const clean = text.trim();
    try {
      return JSON.parse(clean);
    } catch (_) {}

    const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch (_) {}
    }

    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
      } catch (_) {}
    }

    const firstBracket = clean.indexOf("[");
    const lastBracket = clean.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(clean.slice(firstBracket, lastBracket + 1));
      } catch (_) {}
    }

    return JSON.parse(clean);
  }

  /**
   * Validate agent registry:
   * - Throw on duplicate agent names.
   * - Throw on any depends_on / depends_on_any name that is not a registered agent.
   * - Throw on dependency cycles using Kahn's algorithm (treating depends_on_any as OR-edges).
   */
  /**
   * Effective AND-dependencies: declared depends_on plus every agent referenced
   * by an `agent:<name>` input binding. The repo's own validator requires that
   * prompts only reference declared inputs; deriving the ordering from the
   * bindings enforces that invariant at runtime.
   */
  function effectiveAndDeps(agent) {
    const deps = [];
    const seen = new Set();
    const push = function (d) {
      if (typeof d === "string" && d && !seen.has(d)) {
        seen.add(d);
        deps.push(d);
      }
    };
    (Array.isArray(agent.depends_on) ? agent.depends_on : []).forEach(push);
    (Array.isArray(agent.inputs) ? agent.inputs : []).forEach(function (input) {
      if (input && typeof input.source === "string" && input.source.indexOf("agent:") === 0) {
        push(input.source.slice(6));
      }
    });
    return deps;
  }

  function effectiveOrDeps(agent) {
    const deps = [];
    const orDeps = Array.isArray(agent.depends_on_any) ? agent.depends_on_any : [];
    orDeps.forEach(function (dep) {
      if (Array.isArray(dep)) {
        dep.forEach(function (d) { if (deps.indexOf(d) === -1) deps.push(d); });
      } else if (deps.indexOf(dep) === -1) {
        deps.push(dep);
      }
    });
    return deps;
  }

  function validateRegistry(agents) {
    if (!Array.isArray(agents)) {
      throw new Error("Agent registry must be an array of agents.");
    }

    const registeredNames = new Set();
    for (const agent of agents) {
      if (!agent || typeof agent.name !== "string" || !agent.name.trim()) {
        throw new Error("Agent registry contains an entry missing a valid name.");
      }
      if (registeredNames.has(agent.name)) {
        throw new Error("Duplicate agent name: " + agent.name);
      }
      registeredNames.add(agent.name);
    }

    for (const agent of agents) {
      const andDeps = effectiveAndDeps(agent);
      for (const dep of andDeps) {
        if (!registeredNames.has(dep)) {
          throw new Error("Unknown dependency: agent '" + agent.name + "' depends on unknown agent '" + dep + "'");
        }
      }
      const orDeps = effectiveOrDeps(agent);
      for (const dep of orDeps) {
        if (!registeredNames.has(dep)) {
          throw new Error("Unknown dependency: agent '" + agent.name + "' depends_on_any unknown agent '" + dep + "'");
        }
      }
    }

    const placed = new Set();
    let remaining = agents.slice();

    while (remaining.length > 0) {
      const ready = [];
      const nextRemaining = [];

      for (const agent of remaining) {
        const andDeps = effectiveAndDeps(agent);
        const orDeps = effectiveOrDeps(agent);

        const andSatisfied = andDeps.every(function (dep) {
          return placed.has(dep);
        });
        const orSatisfied = orDeps.length === 0 || orDeps.some(function (dep) {
          return placed.has(dep);
        });

        if (andSatisfied && orSatisfied) {
          ready.push(agent);
        } else {
          nextRemaining.push(agent);
        }
      }

      if (ready.length === 0) {
        const cycleAgents = nextRemaining.map(function (a) {
          return a.name;
        }).join(", ");
        throw new Error("Dependency cycle detected: " + cycleAgents);
      }

      for (const agent of ready) {
        placed.add(agent.name);
      }
      remaining = nextRemaining;
    }
  }

  /**
   * Compute execution tiers using Kahn layering.
   * An agent is ready for the next tier when every depends_on member is in an earlier tier
   * AND (depends_on_any is empty OR at least one member is in an earlier tier).
   * Returns array of tiers (each an array of agent objects, registry order preserved).
   * Throws on deadlock (agents left unassigned).
   */
  function computeTiers(agents) {
    const tiers = [];
    const placed = new Set();
    let remaining = agents.slice();

    while (remaining.length > 0) {
      const currentTier = [];
      const nextRemaining = [];

      for (const agent of remaining) {
        const andDeps = effectiveAndDeps(agent);
        const orDeps = effectiveOrDeps(agent);

        const andSatisfied = andDeps.every(function (dep) {
          return placed.has(dep);
        });
        const orSatisfied = orDeps.length === 0 || orDeps.some(function (dep) {
          return placed.has(dep);
        });

        if (andSatisfied && orSatisfied) {
          currentTier.push(agent);
        } else {
          nextRemaining.push(agent);
        }
      }

      if (currentTier.length === 0) {
        const unassigned = nextRemaining.map(function (a) {
          return a.name;
        }).join(", ");
        throw new Error("Deadlock: agents left unassigned: " + unassigned);
      }

      tiers.push(currentTier);
      for (const agent of currentTier) {
        placed.add(agent.name);
      }
      remaining = nextRemaining;
    }

    return tiers;
  }

  /**
   * Resolve input values for an agent based on input definitions.
   */
  function resolveInputs(agent, question, artifacts) {
    const inputs = {};
    const agentInputs = Array.isArray(agent.inputs) ? agent.inputs : [];

    for (const input of agentInputs) {
      if (!input || typeof input.name !== "string") continue;
      const inputName = input.name;
      const source = input.source;

      if (source === "user") {
        inputs[inputName] = question;
      } else if (source === "system") {
        if (inputName === "DATASET_PROFILE") {
          const profilerArtifact = artifacts["dataset-profiler"];
          const rawProfile = profilerArtifact && profilerArtifact.profile;
          let profileObj = rawProfile;
          if (typeof rawProfile === "string") {
            try {
              profileObj = JSON.parse(rawProfile);
            } catch (_) {
              profileObj = rawProfile;
            }
          }
          inputs[inputName] = (typeof profileObj === "object" && profileObj !== null)
            ? JSON.stringify(profileObj, null, 2)
            : JSON.stringify(profileObj || {}, null, 2);
        } else if (inputName === "KNOWLEDGE") {
          const knowledge = window.Helpers && window.Helpers.Knowledge;
          const corrections = (knowledge && typeof knowledge.getCorrections === "function")
            ? knowledge.getCorrections()
            : [];
          const metrics = (knowledge && typeof knowledge.getMetrics === "function")
            ? knowledge.getMetrics()
            : {};

          const correctionsList = Array.isArray(corrections) && corrections.length > 0
            ? corrections.map(function (c) {
                return "- " + c;
              }).join("\n")
            : "";
          const correctionsStr = correctionsList ? "Corrections:\n" + correctionsList : "Corrections:\n";
          const metricsStr = "\nMetrics:\n" + JSON.stringify(metrics || {}, null, 2);
          inputs[inputName] = correctionsStr + metricsStr;
        } else if (inputName === "DATE") {
          inputs[inputName] = new Date().toISOString().slice(0, 10);
        } else {
          inputs[inputName] = "";
        }
      } else if (typeof source === "string" && source.startsWith("agent:")) {
        const dep = source.slice(6);
        const up = artifacts[dep];
        if (!up) {
          throw new Error("Missing required input '" + inputName + "' from agent '" + dep + "'");
        }
        const keys = Object.keys(up);
        inputs[inputName] = keys.length > 0 ? (up[keys[0]] ?? "") : "";
      } else {
        inputs[inputName] = "";
      }
    }

    return inputs;
  }

  /**
   * Render an agent's prompt by replacing {{VAR}} placeholders with inputs[VAR].
   */
  function renderPrompt(promptText, inputs) {
    if (typeof promptText !== "string") return "";
    return promptText.replace(/\{\{\s*([\w-]+)\s*\}\}/g, function (_match, varName) {
      return String(inputs[varName] ?? "");
    });
  }

  /**
   * Extract primary output text (value of the first key in the artifact).
   */
  function getPrimaryOutput(artifactEntry) {
    if (!artifactEntry || typeof artifactEntry !== "object") return "";
    const keys = Object.keys(artifactEntry);
    if (keys.length === 0) return "";
    const val = artifactEntry[keys[0]];
    return typeof val === "string" ? val : (val != null ? String(val) : "");
  }

  /**
   * Parse CSV delegating to window.Helpers.parseCSV.
   */
  function parseCSV(text) {
    if (!window.Helpers || typeof window.Helpers.parseCSV !== "function") {
      throw new Error("Analyst engine not loaded: helpers.js/agents.js missing or incomplete.");
    }
    return window.Helpers.parseCSV(text);
  }

  /**
   * Generic DAG analysis runner.
   * dataset = {name: string, text: string}
   * Returns Promise<string>
   */
  async function runAnalysis(dataset, question, onProgress) {
    if (!window.Helpers || !window.AgentRegistry || !Array.isArray(window.AgentRegistry.agents)) {
      throw new Error("Analyst engine not loaded: helpers.js/agents.js missing or incomplete.");
    }

    const agents = window.AgentRegistry.agents;
    validateRegistry(agents);
    const tiers = computeTiers(agents);
    const total = agents.length;

    let artifacts = {};
    let done = [];

    try {
      const savedStateRaw = localStorage.getItem("orcb_run_state");
      if (savedStateRaw) {
        const savedState = JSON.parse(savedStateRaw);
        if (
          savedState &&
          typeof savedState === "object" &&
          savedState.datasetName === dataset.name &&
          savedState.question === question &&
          savedState.artifacts &&
          typeof savedState.artifacts === "object" &&
          Array.isArray(savedState.done)
        ) {
          artifacts = savedState.artifacts;
          done = savedState.done.slice();
        }
      }
    } catch (_) {
      artifacts = {};
      done = [];
    }

    const parsed = window.Helpers.parseCSV(dataset.text);

    const flatAgents = [];
    for (const tier of tiers) {
      for (const agent of tier) {
        flatAgents.push(agent);
      }
    }

    let lastExecutedAgentName = null;

    for (const agent of flatAgents) {
      if (done.includes(agent.name)) {
        lastExecutedAgentName = agent.name;
        continue;
      }

      if (typeof onProgress === "function") {
        onProgress(agent.name, done.length + 1, total);
      }

      try {
        const inputs = resolveInputs(agent, question, artifacts);
        let text = "";

        if (agent.kind === "deterministic") {
          const fnName = agent.function || ({ "dataset-profiler": "profileDataset" })[agent.name];
          const fn = window.Helpers && window.Helpers[fnName];
          if (typeof fn !== "function") {
            throw new Error("Unknown helper function '" + fnName + "'");
          }
          const result = (fnName === "profileDataset")
            ? fn(parsed)
            : fn({ dataset: dataset, parsed: parsed, artifacts: artifacts, inputs: inputs });
          text = (typeof result === "string") ? result : JSON.stringify(result, null, 2);
        } else {
          const rendered = renderPrompt(agent.prompt, inputs);
          text = await callLLM(rendered);

          if (agent.needsCompute) {
            const computeMatch = text.match(/```computejson\s*([\s\S]*?)```/);
            if (computeMatch) {
              let opsObj = {};
              try {
                opsObj = JSON.parse(computeMatch[1]);
              } catch (_) {
                opsObj = parseJsonDefensively(computeMatch[1]);
              }
              const ops = (opsObj && Array.isArray(opsObj.ops)) ? opsObj.ops : (opsObj && opsObj.ops) || [];
              const tables = window.Helpers.executeOps(parsed, ops);
              const rePrompt = rendered + "\n\n## Computed results (exact — use these numbers, do not recompute)\n" + tables;
              text = await callLLM(rePrompt);
            }
          }
        }

        if (agent.name === "chart-maker") {
          let spec;
          try {
            spec = JSON.parse(text);
          } catch (_) {
            spec = parseJsonDefensively(text);
          }
          const charts = window.Helpers.renderChartSpecs(spec);
          artifacts["__charts__"] = charts;
        }

        // Chart markers are replaced in the final assembled report (see below),
        // so any agent may place <!--CHART:<key>--> markers.

        artifacts[agent.name] = {};
        const outputs = Array.isArray(agent.outputs) ? agent.outputs : [];
        if (outputs.length > 0) {
          for (const out of outputs) {
            if (out && out.key) {
              artifacts[agent.name][out.key] = text;
            }
          }
        } else {
          artifacts[agent.name]["output"] = text;
        }

        if (agent.name === "validation") {
          let v;
          try {
            v = JSON.parse(text);
          } catch (_) {
            v = parseJsonDefensively(text);
          }
          if (!v || v.verdict !== "pass") {
            throw new Error("Analysis failed validation: " + ((v && v.notes) || "no notes"));
          }
        }

        lastExecutedAgentName = agent.name;
        done.push(agent.name);

        try {
          localStorage.setItem("orcb_run_state", JSON.stringify({
            datasetName: dataset.name,
            question: question,
            artifacts: artifacts,
            done: done
          }));
        } catch (_) {}
      } catch (err) {
        if (agent.critical !== false) {
          throw err;
        } else {
          artifacts[agent.name] = {
            _status: "degraded",
            error: String((err && err.message) || err)
          };
          lastExecutedAgentName = agent.name;
          done.push(agent.name);

          try {
            localStorage.setItem("orcb_run_state", JSON.stringify({
              datasetName: dataset.name,
              question: question,
              artifacts: artifacts,
              done: done
            }));
          } catch (_) {}
        }
      }
    }

    try {
      localStorage.removeItem("orcb_run_state");
    } catch (_) {}

    // Final report: the repo's terminal narrative agent is comms-drafter
    // (step 19); storytelling is the fallback, then the last executed agent.
    let finalReport = "";
    if (artifacts["comms-drafter"]) {
      finalReport = getPrimaryOutput(artifacts["comms-drafter"]);
    } else if (artifacts["storytelling"]) {
      finalReport = getPrimaryOutput(artifacts["storytelling"]);
    } else if (lastExecutedAgentName && artifacts[lastExecutedAgentName]) {
      finalReport = getPrimaryOutput(artifacts[lastExecutedAgentName]);
    }

    // Replace any <!--CHART:<key>--> markers with the rendered SVG charts
    // (charts are generated by our own code, never by model text).
    const chartMap = artifacts["__charts__"];
    if (chartMap && typeof chartMap === "object") {
      finalReport = finalReport.replace(/<!--CHART:([\w-]+)-->/g, function (_m, k) {
        return (typeof chartMap[k] === "string" && chartMap[k].indexOf("<svg") !== -1) ? chartMap[k] : "";
      });
      // Deterministically append a Charts section for any rendered charts,
      // wrapped so the chat renderer can pass them through safely.
      const chartKeys = Object.keys(chartMap).filter(function (k) {
        return typeof chartMap[k] === "string" && chartMap[k].indexOf("<svg") !== -1;
      });
      if (chartKeys.length > 0) {
        finalReport += "\n\n## Charts\n" + chartKeys.map(function (k) {
          return '<div class="orcb-chart" data-run="1">' + chartMap[k] + "</div>";
        }).join("\n\n");
      }
    }

    return finalReport;
  }

  if (typeof window !== "undefined") {
    window.Analyst = {
      runAnalysis: runAnalysis,
      parseCSV: parseCSV
    };
  }
})();
