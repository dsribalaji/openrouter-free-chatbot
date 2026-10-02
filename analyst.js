(function () {
  "use strict";

  /**
   * Robust CSV parser supporting quotes, escaped quotes (""),
   * commas and newlines inside quotes, and \r\n endings.
   * Throws Error("Could not parse the CSV…") on empty or unparseable input.
   */
  function parseCSV(text) {
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Could not parse the CSV: input is empty");
    }

    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;
    let i = 0;
    const len = text.length;

    while (i < len) {
      const char = text[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            currentField += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          currentField += char;
          i++;
          continue;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
          continue;
        } else if (char === ",") {
          currentRow.push(currentField);
          currentField = "";
          i++;
          continue;
        } else if (char === "\r") {
          if (i + 1 < len && text[i + 1] === "\n") {
            i++;
          }
          currentRow.push(currentField);
          currentField = "";
          rows.push(currentRow);
          currentRow = [];
          i++;
          continue;
        } else if (char === "\n") {
          currentRow.push(currentField);
          currentField = "";
          rows.push(currentRow);
          currentRow = [];
          i++;
          continue;
        } else {
          currentField += char;
          i++;
          continue;
        }
      }
    }

    if (inQuotes) {
      throw new Error("Could not parse the CSV: unclosed quote");
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    // Remove empty trailing lines
    while (rows.length > 1) {
      const lastRow = rows[rows.length - 1];
      if (lastRow.length === 0 || (lastRow.length === 1 && lastRow[0].trim() === "")) {
        rows.pop();
      } else {
        break;
      }
    }

    if (rows.length === 0) {
      throw new Error("Could not parse the CSV: no rows found");
    }

    const rawColumns = rows[0];
    if (!rawColumns || rawColumns.length === 0 || rawColumns.every((c) => !c.trim())) {
      throw new Error("Could not parse the CSV: header row is empty");
    }

    const columns = rawColumns.map((col, idx) => {
      const trimmed = col.trim();
      return trimmed.length > 0 ? trimmed : "col_" + (idx + 1);
    });

    const dataRows = rows.slice(1);
    const normalizedRows = dataRows.map((row) => {
      const res = [];
      for (let c = 0; c < columns.length; c++) {
        res.push(row[c] !== undefined ? row[c] : "");
      }
      return res;
    });

    return {
      columns: columns,
      rows: normalizedRows,
      rowCount: normalizedRows.length
    };
  }

  /**
   * Deterministic dataset profiling without LLM.
   * Returns {rowCount, columns: [{name, dtype, nullPct, unique}], numericSummaries: {col: {min, max, mean}}, sample: first 5 rows as objects}
   */
  function profileDataset(ds) {
    const rowCount = ds.rowCount;
    const columnsProfile = [];
    const numericSummaries = {};

    ds.columns.forEach((colName, cIdx) => {
      const rawValues = ds.rows.map((r) => r[cIdx]);
      let nonEmptyCount = 0;
      let numberCount = 0;
      let dateCount = 0;
      const uniqueSet = new Set();

      for (let r = 0; r < rowCount; r++) {
        const val = rawValues[r];
        uniqueSet.add(val);
        const str = (val !== null && val !== undefined) ? String(val).trim() : "";
        if (str !== "") {
          nonEmptyCount++;
          const num = Number(str);
          if (!isNaN(num) && isFinite(num)) {
            numberCount++;
          }
          const parsedDate = Date.parse(str);
          if (!isNaN(parsedDate)) {
            dateCount++;
          }
        }
      }

      let dtype = "text";
      if (nonEmptyCount > 0 && numberCount === nonEmptyCount) {
        dtype = "number";
      } else if (nonEmptyCount > 0 && (dateCount / nonEmptyCount) > 0.8) {
        dtype = "date";
      } else {
        dtype = "text";
      }

      const nullCount = rowCount - nonEmptyCount;
      const nullPct = rowCount > 0 ? Math.round((nullCount / rowCount) * 1000) / 1000 : 0;

      columnsProfile.push({
        name: colName,
        dtype: dtype,
        nullPct: nullPct,
        unique: uniqueSet.size
      });

      if (dtype === "number") {
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        let count = 0;
        for (let r = 0; r < rowCount; r++) {
          const val = rawValues[r];
          if (val !== null && val !== undefined && String(val).trim() !== "") {
            const num = parseFloat(val);
            if (!isNaN(num) && isFinite(num)) {
              if (num < min) min = num;
              if (num > max) max = num;
              sum += num;
              count++;
            }
          }
        }
        if (count > 0) {
          numericSummaries[colName] = {
            min: min,
            max: max,
            mean: Math.round((sum / count) * 1000) / 1000
          };
        } else {
          numericSummaries[colName] = { min: 0, max: 0, mean: 0 };
        }
      }
    });

    const sample = ds.rows.slice(0, 5).map((row) => {
      const obj = {};
      ds.columns.forEach((colName, cIdx) => {
        obj[colName] = row[cIdx] !== undefined ? row[cIdx] : "";
      });
      return obj;
    });

    return {
      rowCount: rowCount,
      columns: columnsProfile,
      numericSummaries: numericSummaries,
      sample: sample
    };
  }

  /**
   * Call OpenRouter LLM using saved orcb_api_key and current #model-select value.
   */
  async function callLLM(systemPrompt, userPrompt) {
    const key = localStorage.getItem("orcb_api_key");
    if (!key) {
      throw new Error("Add your OpenRouter API key first.");
    }
    const modelEl = document.getElementById("model-select");
    const model = modelEl ? modelEl.value : "";
    if (!model) {
      throw new Error("Please select a model first.");
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "HTTP-Referer": (window.location && window.location.origin) || "http://localhost",
        "X-Title": "Ruby Free Chatbot"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 4000
      })
    });

    if (!res.ok) {
      let msg = "";
      try {
        const errJson = await res.json();
        msg = (errJson && errJson.error && errJson.error.message) || (errJson && errJson.message) || "";
      } catch (_) {}
      if (!msg) {
        msg = "OpenRouter request failed with HTTP " + res.status;
      }
      throw new Error(msg);
    }

    const data = await res.json();
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  }

  /**
   * Helper to parse JSON defensively from LLM output, stripping ``` fences.
   */
  function parseJsonDefensively(text) {
    if (typeof text !== "string") return text;
    let clean = text.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*/i, "");
      clean = clean.replace(/\s*```$/, "");
      clean = clean.trim();
    }
    const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      clean = match[1].trim();
    }
    try {
      return JSON.parse(clean);
    } catch (err) {
      const arrStart = clean.indexOf("[");
      const arrEnd = clean.lastIndexOf("]");
      if (arrStart !== -1 && arrEnd > arrStart) {
        try {
          return JSON.parse(clean.slice(arrStart, arrEnd + 1));
        } catch (_) {}
      }
      const objStart = clean.indexOf("{");
      const objEnd = clean.lastIndexOf("}");
      if (objStart !== -1 && objEnd > objStart) {
        try {
          return JSON.parse(clean.slice(objStart, objEnd + 1));
        } catch (_) {}
      }
      throw err;
    }
  }

  /**
   * Run the 9-step analytical pipeline.
   * dataset = {name: string, text: string}
   * Returns Promise<string> (markdown report)
   */
  async function runAnalysis(dataset, question, onProgress) {
    const ds = parseCSV(dataset.text);
    const labels = [
      "framing",
      "profiling",
      "hypothesis",
      "planning",
      "executing",
      "narrating",
      "verifying",
      "validating",
      "reporting"
    ];

    function mark(i) {
      if (typeof onProgress === "function") {
        onProgress(labels[i], i + 1, 9);
      }
    }

    // Step 2 profile is computed deterministically
    const profile = profileDataset(ds);
    const profileText = JSON.stringify(profile);

    const datasetSummary = "Dataset: " + ds.columns.length + " columns, " + ds.rowCount + " rows. Columns: " +
      profile.columns.map((c) => c.name + " (" + c.dtype + ")").join(", ") + ".";

    // 1 framing (LLM, system "You are a data analyst. Be concise.")
    mark(0);
    const framingPrompt = "Question: " + question + "\n" + datasetSummary + "\nProvide a concise analysis framing brief outlining the analytical scope and goals.";
    const brief = await callLLM("You are a data analyst. Be concise.", framingPrompt);

    // 2 profiler (deterministic)
    mark(1);
    // Already profiled into profile / profileText

    // 3 hypothesis (LLM)
    mark(2);
    const hypothesisPrompt = "Framing brief: " + brief + "\nDataset profile: " + profileText + "\nPropose up to 3 short testable hypotheses relevant to the question: \"" + question + "\".";
    const hypotheses = await callLLM("You are a data analyst. Be concise.", hypothesisPrompt);

    // 4 planner (LLM)
    mark(3);
    const plannerPrompt = "Dataset profile: " + profileText + "\nHypotheses: " + hypotheses + "\nQuestion: \"" + question + "\"\n\nReturn ONLY a JSON array (no prose, no fences) of at most 6 steps: {\"title\": string, \"op\": one of count|sum|mean|group_count|group_sum, \"column\": optional numeric column for sum|mean, \"groupBy\": optional column for group_count|group_sum}.";
    const planRaw = await callLLM("You are a data analyst. Plan data aggregation steps.", plannerPrompt);

    let plan;
    try {
      plan = parseJsonDefensively(planRaw);
    } catch (e) {
      throw new Error("Planner returned an invalid step: " + e.message);
    }

    if (!Array.isArray(plan)) {
      throw new Error("Planner returned an invalid step: output was not a JSON array");
    }

    const steps = plan.slice(0, 6);
    if (steps.length === 0) {
      throw new Error("Planner returned an invalid step: empty plan array");
    }

    const validOps = new Set(["count", "sum", "mean", "group_count", "group_sum"]);
    for (const step of steps) {
      if (!step || typeof step !== "object" || !validOps.has(step.op)) {
        throw new Error("Planner returned an invalid step: " + (step && step.op ? step.op : "missing or invalid op"));
      }
    }

    // 5 executor (deterministic)
    mark(4);
    function findColIndex(colName) {
      if (!colName) return -1;
      const target = String(colName).trim().toLowerCase();
      for (let i = 0; i < ds.columns.length; i++) {
        if (ds.columns[i].toLowerCase() === target) return i;
      }
      for (let i = 0; i < ds.columns.length; i++) {
        if (ds.columns[i].toLowerCase().includes(target) || target.includes(ds.columns[i].toLowerCase())) return i;
      }
      return -1;
    }

    const resultSections = [];
    for (let sIdx = 0; sIdx < steps.length; sIdx++) {
      const step = steps[sIdx];
      const title = step.title ? String(step.title).trim() : ("Step " + (sIdx + 1) + ": " + step.op);
      let sectionMd = "## " + title + "\n\n";

      if (step.op === "count") {
        sectionMd += "| Metric | Value |\n|---|---|\n| Total Row Count | " + ds.rowCount + " |";
      } else if (step.op === "sum") {
        const colIdx = findColIndex(step.column);
        const colName = colIdx >= 0 ? ds.columns[colIdx] : (step.column || "Unknown");
        let sum = 0;
        let validCount = 0;
        if (colIdx >= 0) {
          for (let r = 0; r < ds.rows.length; r++) {
            const val = parseFloat(ds.rows[r][colIdx]);
            if (!isNaN(val) && isFinite(val)) {
              sum += val;
              validCount++;
            }
          }
        }
        const roundedSum = Math.round(sum * 1000) / 1000;
        sectionMd += "| Column | Sum | Count of Numbers |\n|---|---|---|\n| " + colName + " | " + roundedSum + " | " + validCount + " |";
      } else if (step.op === "mean") {
        const colIdx = findColIndex(step.column);
        const colName = colIdx >= 0 ? ds.columns[colIdx] : (step.column || "Unknown");
        let sum = 0;
        let validCount = 0;
        if (colIdx >= 0) {
          for (let r = 0; r < ds.rows.length; r++) {
            const val = parseFloat(ds.rows[r][colIdx]);
            if (!isNaN(val) && isFinite(val)) {
              sum += val;
              validCount++;
            }
          }
        }
        const mean = validCount > 0 ? (Math.round((sum / validCount) * 1000) / 1000) : 0;
        sectionMd += "| Column | Mean | Count of Numbers |\n|---|---|---|\n| " + colName + " | " + mean + " | " + validCount + " |";
      } else if (step.op === "group_count") {
        const groupColIdx = findColIndex(step.groupBy);
        const groupColName = groupColIdx >= 0 ? ds.columns[groupColIdx] : (step.groupBy || "Group");
        const counts = new Map();
        for (let r = 0; r < ds.rows.length; r++) {
          const raw = groupColIdx >= 0 ? ds.rows[r][groupColIdx] : "";
          const key = (raw !== null && raw !== undefined && String(raw).trim() !== "") ? String(raw).trim() : "(empty)";
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const topGroups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
        sectionMd += "| " + groupColName + " | Count |\n|---|---|\n";
        if (topGroups.length === 0) {
          sectionMd += "| (none) | 0 |\n";
        } else {
          topGroups.forEach(([k, cnt]) => {
            sectionMd += "| " + k.replace(/\|/g, "/") + " | " + cnt + " |\n";
          });
        }
        sectionMd = sectionMd.trimEnd();
      } else if (step.op === "group_sum") {
        const groupColIdx = findColIndex(step.groupBy);
        const groupColName = groupColIdx >= 0 ? ds.columns[groupColIdx] : (step.groupBy || "Group");
        let sumColIdx = findColIndex(step.column);
        if (sumColIdx === -1) {
          for (let c = 0; c < profile.columns.length; c++) {
            if (profile.columns[c].dtype === "number") {
              sumColIdx = c;
              break;
            }
          }
        }
        const sumColName = sumColIdx >= 0 ? ds.columns[sumColIdx] : (step.column || "Value");
        const sums = new Map();
        for (let r = 0; r < ds.rows.length; r++) {
          const rawGroup = groupColIdx >= 0 ? ds.rows[r][groupColIdx] : "";
          const groupKey = (rawGroup !== null && rawGroup !== undefined && String(rawGroup).trim() !== "") ? String(rawGroup).trim() : "(empty)";
          let numVal = 0;
          if (sumColIdx >= 0) {
            const parsed = parseFloat(ds.rows[r][sumColIdx]);
            if (!isNaN(parsed) && isFinite(parsed)) {
              numVal = parsed;
            }
          }
          sums.set(groupKey, (sums.get(groupKey) || 0) + numVal);
        }
        const topGroups = Array.from(sums.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
        sectionMd += "| " + groupColName + " | Sum of " + sumColName + " |\n|---|---|\n";
        if (topGroups.length === 0) {
          sectionMd += "| (none) | 0 |\n";
        } else {
          topGroups.forEach(([k, total]) => {
            const rounded = Math.round(total * 1000) / 1000;
            sectionMd += "| " + k.replace(/\|/g, "/") + " | " + rounded + " |\n";
          });
        }
        sectionMd = sectionMd.trimEnd();
      }

      resultSections.push(sectionMd);
    }
    const resultsMd = resultSections.join("\n\n");

    // 6 narrator (LLM)
    mark(5);
    const narratorPrompt = "Question: " + question + "\n\nExecution results:\n" + resultsMd + "\n\nNarrate the key findings from these results. Cite specific numbers from the tables.";
    const findings = await callLLM("You are a data analyst. State findings clearly with precise numbers.", narratorPrompt);

    // 7 verifier (LLM)
    mark(6);
    const verifierPrompt = "Raw calculation results:\n" + resultsMd + "\n\nDraft findings:\n" + findings + "\n\nRe-check every number mentioned in the draft findings against the raw calculation results. Output the verified findings, correcting any numbers that do not match the raw data.";
    const verifiedFindings = await callLLM("You are a data analyst verifying numbers against raw calculation results.", verifierPrompt);

    // 8 validator (LLM)
    mark(7);
    const validatorPrompt = "Question: " + question + "\nRaw results:\n" + resultsMd + "\nVerified findings:\n" + verifiedFindings + "\n\nValidate whether the findings directly address the question and accurately reflect the results. Reply with ONLY this JSON, nothing else: {\"verdict\": \"pass\" or \"fail\", \"notes\": \"...\"}";
    const validationRaw = await callLLM("You are a quality validator evaluating a data analysis.", validatorPrompt);

    let validationObj = null;
    try {
      validationObj = parseJsonDefensively(validationRaw);
    } catch (_) {
      if (validationRaw.toLowerCase().includes('"verdict": "fail"') || validationRaw.toLowerCase().includes('"verdict":"fail"')) {
        throw new Error("Analysis failed validation: " + validationRaw);
      }
    }

    if (validationObj && String(validationObj.verdict).toLowerCase().trim() === "fail") {
      throw new Error("Analysis failed validation: " + (validationObj.notes || ""));
    }

    // 9 reporter (LLM)
    mark(8);
    const reporterPrompt = "Question: " + question + "\nVerified findings:\n" + verifiedFindings + "\nExecution results:\n" + resultsMd + "\n\nGenerate a comprehensive markdown report. Include a title, executive summary, key findings with exact numbers, formatted result tables, and caveats/methodology notes.";
    const report = await callLLM("You are an executive data analyst writing a final report.", reporterPrompt);

    return report;
  }

  const Analyst = {
    runAnalysis: runAnalysis,
    parseCSV: parseCSV
  };

  if (typeof window !== "undefined") {
    window.Analyst = Analyst;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      Analyst: Analyst,
      parseCSV: parseCSV,
      profileDataset: profileDataset,
      callLLM: callLLM,
      runAnalysis: runAnalysis
    };
  }
})();
