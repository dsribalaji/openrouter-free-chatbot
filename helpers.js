(function () {
  "use strict";

  /**
   * Escape XML entities for safe SVG text embedding.
   */
  function escapeXML(str) {
    return String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Escape pipe characters for safe Markdown table cell embedding.
   */
  function escapeMarkdownCell(val) {
    return String(val === null || val === undefined ? "" : val).replace(/\|/g, "\\|");
  }

  /**
   * Helper to retrieve a cell value from a row.
   * Handles row as array (with index or column name matched against columns array)
   * or row as object.
   */
  function getRowValue(row, colIdentifier, columns) {
    if (row === null || row === undefined) return undefined;
    if (Array.isArray(row)) {
      if (typeof colIdentifier === "number") {
        return row[colIdentifier];
      }
      if (typeof colIdentifier === "string") {
        if (/^\d+$/.test(colIdentifier)) {
          const idx = parseInt(colIdentifier, 10);
          return row[idx];
        }
        if (columns && Array.isArray(columns)) {
          const target = colIdentifier.trim().toLowerCase();
          for (let i = 0; i < columns.length; i++) {
            if (columns[i].toLowerCase() === target) return row[i];
          }
          for (let i = 0; i < columns.length; i++) {
            if (columns[i].toLowerCase().includes(target) || target.includes(columns[i].toLowerCase())) {
              return row[i];
            }
          }
        }
      }
      return undefined;
    }
    if (typeof row === "object") {
      if (row[colIdentifier] !== undefined) return row[colIdentifier];
      const target = String(colIdentifier).trim().toLowerCase();
      const keys = Object.keys(row);
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === target) return row[keys[i]];
      }
      return undefined;
    }
    if (colIdentifier === undefined || colIdentifier === null) {
      return row;
    }
    return undefined;
  }

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
    if (!rawColumns || rawColumns.length === 0 || rawColumns.every(function (c) { return !c.trim(); })) {
      throw new Error("Could not parse the CSV: header row is empty");
    }

    const columns = rawColumns.map(function (col, idx) {
      const trimmed = col.trim();
      return trimmed.length > 0 ? trimmed : "col_" + (idx + 1);
    });

    const dataRows = rows.slice(1);
    const normalizedRows = dataRows.map(function (row) {
      const res = [];
      for (let c = 0; c < columns.length; c++) {
        res.push(row[c] !== undefined ? row[c] : "");
      }
      return res;
    });

    Object.defineProperty(normalizedRows, "columns", {
      value: columns,
      enumerable: false,
      writable: true,
      configurable: true
    });

    return {
      columns: columns,
      rows: normalizedRows,
      rowCount: normalizedRows.length
    };
  }

  /**
   * Deterministic dataset profiling without LLM.
   * Returns {rowCount, columns: [{name, dtype: 'number'|'date'|'text', nullPct, unique}], numericSummaries: {col: {min, max, mean}}, sample: first 5 rows as objects}
   */
  function profileDataset(ds) {
    if (!ds || !Array.isArray(ds.columns) || !Array.isArray(ds.rows)) {
      return {
        rowCount: 0,
        columns: [],
        numericSummaries: {},
        sample: []
      };
    }

    const rowCount = typeof ds.rowCount === "number" ? ds.rowCount : ds.rows.length;
    const columnsProfile = [];
    const numericSummaries = {};

    ds.columns.forEach(function (colName, cIdx) {
      const rawValues = ds.rows.map(function (r) { return r[cIdx]; });
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
      const nullPct = rowCount > 0 ? Math.round((nullCount / rowCount) * 10000) / 100 : 0;

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

    const sample = ds.rows.slice(0, 5).map(function (row) {
      const obj = {};
      ds.columns.forEach(function (colName, cIdx) {
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
   * Describe statistics for numeric columns.
   * Returns {min, max, mean, median} for numeric columns.
   */
  function describeStats(rows, column) {
    let rowList = rows;
    let colList = null;

    if (rows && !Array.isArray(rows) && Array.isArray(rows.rows)) {
      colList = rows.columns;
      rowList = rows.rows;
    } else if (Array.isArray(rows) && rows.columns) {
      colList = rows.columns;
    }

    if (!Array.isArray(rowList) || rowList.length === 0) {
      return { min: null, max: null, mean: null, median: null };
    }

    const numbers = [];
    for (let i = 0; i < rowList.length; i++) {
      const val = getRowValue(rowList[i], column, colList);
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        const num = Number(val);
        if (!isNaN(num) && isFinite(num)) {
          numbers.push(num);
        }
      }
    }

    if (numbers.length === 0) {
      return { min: null, max: null, mean: null, median: null };
    }

    numbers.sort(function (a, b) { return a - b; });

    const min = numbers[0];
    const max = numbers[numbers.length - 1];
    let sum = 0;
    for (let i = 0; i < numbers.length; i++) {
      sum += numbers[i];
    }
    const mean = Math.round((sum / numbers.length) * 1000) / 1000;

    let median;
    const mid = Math.floor(numbers.length / 2);
    if (numbers.length % 2 === 1) {
      median = numbers[mid];
    } else {
      median = Math.round(((numbers[mid - 1] + numbers[mid]) / 2) * 1000) / 1000;
    }

    return {
      min: min,
      max: max,
      mean: mean,
      median: median
    };
  }

  /**
   * Pearson correlation between two columns.
   * Returns Pearson r (rounded to 4 decimal places) or null.
   */
  function correlation(rows, colA, colB) {
    let rowList = rows;
    let colList = null;

    if (rows && !Array.isArray(rows) && Array.isArray(rows.rows)) {
      colList = rows.columns;
      rowList = rows.rows;
    } else if (Array.isArray(rows) && rows.columns) {
      colList = rows.columns;
    }

    if (!Array.isArray(rowList) || rowList.length === 0) {
      return null;
    }

    const pairs = [];
    for (let i = 0; i < rowList.length; i++) {
      const row = rowList[i];
      const valA = getRowValue(row, colA, colList);
      const valB = getRowValue(row, colB, colList);

      if (
        valA !== null && valA !== undefined && String(valA).trim() !== "" &&
        valB !== null && valB !== undefined && String(valB).trim() !== ""
      ) {
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && isFinite(numA) && !isNaN(numB) && isFinite(numB)) {
          pairs.push([numA, numB]);
        }
      }
    }

    const n = pairs.length;
    if (n < 2) {
      return null;
    }

    let sumA = 0;
    let sumB = 0;
    for (let i = 0; i < n; i++) {
      sumA += pairs[i][0];
      sumB += pairs[i][1];
    }
    const meanA = sumA / n;
    const meanB = sumB / n;

    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (let i = 0; i < n; i++) {
      const diffA = pairs[i][0] - meanA;
      const diffB = pairs[i][1] - meanB;
      cov += diffA * diffB;
      varA += diffA * diffA;
      varB += diffB * diffB;
    }

    if (varA === 0 || varB === 0) {
      return null;
    }

    const denominator = Math.sqrt(varA * varB);
    if (denominator === 0 || isNaN(denominator)) {
      return null;
    }

    let r = cov / denominator;
    if (isNaN(r) || !isFinite(r)) {
      return null;
    }

    r = Math.max(-1, Math.min(1, r));
    return Math.round(r * 10000) / 10000;
  }

  /**
   * IQR outlier detection on a numeric column.
   * Returns array of row indexes in rows that are outliers.
   */
  function iqrOutliers(rows, column) {
    let rowList = rows;
    let colList = null;

    if (rows && !Array.isArray(rows) && Array.isArray(rows.rows)) {
      colList = rows.columns;
      rowList = rows.rows;
    } else if (Array.isArray(rows) && rows.columns) {
      colList = rows.columns;
    }

    if (!Array.isArray(rowList) || rowList.length === 0) {
      return [];
    }

    const validEntries = [];
    for (let i = 0; i < rowList.length; i++) {
      const val = getRowValue(rowList[i], column, colList);
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        const num = Number(val);
        if (!isNaN(num) && isFinite(num)) {
          validEntries.push({ index: i, value: num });
        }
      }
    }

    if (validEntries.length < 4) {
      return [];
    }

    const sorted = validEntries.slice().sort(function (a, b) { return a.value - b.value; });

    function getQuantile(sortedArr, p) {
      const n = sortedArr.length;
      const idx = (n - 1) * p;
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      const fraction = idx - lower;
      if (lower === upper) {
        return sortedArr[lower].value;
      }
      return sortedArr[lower].value + fraction * (sortedArr[upper].value - sortedArr[lower].value);
    }

    const q1 = getQuantile(sorted, 0.25);
    const q3 = getQuantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    const outlierIndices = [];
    for (let j = 0; j < validEntries.length; j++) {
      const entry = validEntries[j];
      if (entry.value < lowerFence || entry.value > upperFence) {
        outlierIndices.push(entry.index);
      }
    }

    return outlierIndices;
  }

  /**
   * Execute operations on parsed dataset and produce Markdown tables.
   * ops: array of {title, op, column?, groupBy?}, max 6 ops.
   * op in {count, sum, mean, group_count, group_sum}.
   * Group results top 10 desc; non-numeric ignored for sum/mean; pipe chars escaped.
   */
  function executeOps(parsed, ops) {
    if (!parsed || !Array.isArray(parsed.rows)) {
      return "";
    }

    const rawSteps = Array.isArray(ops) ? ops : (ops && Array.isArray(ops.ops) ? ops.ops : []);
    const steps = rawSteps.slice(0, 6);
    if (steps.length === 0) {
      return "";
    }

    const columns = Array.isArray(parsed.columns) ? parsed.columns : [];
    const rows = parsed.rows;
    const rowCount = typeof parsed.rowCount === "number" ? parsed.rowCount : rows.length;

    function findCol(name) {
      if (name === undefined || name === null || !columns) return -1;
      if (typeof name === "number" && name >= 0 && name < columns.length) return name;
      const target = String(name).trim().toLowerCase();
      for (let i = 0; i < columns.length; i++) {
        if (columns[i].toLowerCase() === target) return i;
      }
      for (let i = 0; i < columns.length; i++) {
        if (columns[i].toLowerCase().includes(target) || target.includes(columns[i].toLowerCase())) return i;
      }
      return -1;
    }

    const validOps = new Set(["count", "sum", "mean", "group_count", "group_sum"]);
    const sections = [];

    for (let sIdx = 0; sIdx < steps.length; sIdx++) {
      const step = steps[sIdx];
      if (!step || typeof step !== "object" || !validOps.has(step.op)) {
        continue;
      }

      const title = step.title ? String(step.title).trim() : ("Step " + (sIdx + 1) + ": " + step.op);
      let sectionMd = "## " + escapeMarkdownCell(title) + "\n\n";

      if (step.op === "count") {
        sectionMd += "| Metric | Value |\n|---|---|\n| Total Row Count | " + rowCount + " |";
      } else if (step.op === "sum" || step.op === "mean") {
        const colIdx = findCol(step.column);
        const colName = colIdx >= 0 ? columns[colIdx] : (step.column || "Column");
        let sum = 0;
        let count = 0;
        if (colIdx >= 0) {
          for (let r = 0; r < rows.length; r++) {
            const rawVal = rows[r][colIdx];
            if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== "") {
              const num = parseFloat(rawVal);
              if (!isNaN(num) && isFinite(num)) {
                sum += num;
                count++;
              }
            }
          }
        }
        if (step.op === "sum") {
          const roundedSum = Math.round(sum * 1000) / 1000;
          sectionMd += "| Column | Sum | Count of Numbers |\n|---|---|---|\n| " + escapeMarkdownCell(colName) + " | " + roundedSum + " | " + count + " |";
        } else {
          const mean = count > 0 ? (Math.round((sum / count) * 1000) / 1000) : 0;
          sectionMd += "| Column | Mean | Count of Numbers |\n|---|---|---|\n| " + escapeMarkdownCell(colName) + " | " + mean + " | " + count + " |";
        }
      } else if (step.op === "group_count") {
        const groupColIdx = findCol(step.groupBy);
        const groupColName = groupColIdx >= 0 ? columns[groupColIdx] : (step.groupBy || "Group");
        const counts = new Map();
        for (let r = 0; r < rows.length; r++) {
          const raw = groupColIdx >= 0 ? rows[r][groupColIdx] : "";
          const key = (raw !== null && raw !== undefined && String(raw).trim() !== "") ? String(raw).trim() : "(empty)";
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const topGroups = Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
        sectionMd += "| " + escapeMarkdownCell(groupColName) + " | Count |\n|---|---|\n";
        if (topGroups.length === 0) {
          sectionMd += "| (none) | 0 |\n";
        } else {
          for (let g = 0; g < topGroups.length; g++) {
            sectionMd += "| " + escapeMarkdownCell(topGroups[g][0]) + " | " + topGroups[g][1] + " |\n";
          }
        }
        sectionMd = sectionMd.trimEnd();
      } else if (step.op === "group_sum") {
        const groupColIdx = findCol(step.groupBy);
        const groupColName = groupColIdx >= 0 ? columns[groupColIdx] : (step.groupBy || "Group");
        let sumColIdx = findCol(step.column);
        if (sumColIdx === -1) {
          for (let c = 0; c < columns.length; c++) {
            let allNumeric = true;
            let seen = 0;
            for (let r = 0; r < Math.min(rows.length, 20); r++) {
              const val = rows[r][c];
              if (val !== null && val !== undefined && String(val).trim() !== "") {
                seen++;
                if (isNaN(Number(val))) {
                  allNumeric = false;
                  break;
                }
              }
            }
            if (seen > 0 && allNumeric) {
              sumColIdx = c;
              break;
            }
          }
        }
        const sumColName = sumColIdx >= 0 ? columns[sumColIdx] : (step.column || "Value");
        const sums = new Map();
        for (let r = 0; r < rows.length; r++) {
          const rawGroup = groupColIdx >= 0 ? rows[r][groupColIdx] : "";
          const groupKey = (rawGroup !== null && rawGroup !== undefined && String(rawGroup).trim() !== "") ? String(rawGroup).trim() : "(empty)";
          let numVal = 0;
          if (sumColIdx >= 0) {
            const rawVal = rows[r][sumColIdx];
            if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== "") {
              const parsedNum = parseFloat(rawVal);
              if (!isNaN(parsedNum) && isFinite(parsedNum)) {
                numVal = parsedNum;
              }
            }
          }
          sums.set(groupKey, (sums.get(groupKey) || 0) + numVal);
        }
        const topGroups = Array.from(sums.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
        sectionMd += "| " + escapeMarkdownCell(groupColName) + " | Sum of " + escapeMarkdownCell(sumColName) + " |\n|---|---|\n";
        if (topGroups.length === 0) {
          sectionMd += "| (none) | 0 |\n";
        } else {
          for (let g = 0; g < topGroups.length; g++) {
            const roundedTotal = Math.round(topGroups[g][1] * 1000) / 1000;
            sectionMd += "| " + escapeMarkdownCell(topGroups[g][0]) + " | " + roundedTotal + " |\n";
          }
        }
        sectionMd = sectionMd.trimEnd();
      }

      sections.push(sectionMd);
    }

    return sections.join("\n\n");
  }

  /**
   * Helper to format numbers cleanly for chart axes/labels.
   */
  function formatChartNumber(num) {
    if (typeof num !== "number" || isNaN(num)) return "0";
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    }
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    }
    if (Number.isInteger(num)) {
      return String(num);
    }
    return String(Math.round(num * 100) / 100);
  }

  /**
   * Self-contained Bar Chart SVG string (readable at 600px wide, theme-aligned).
   * spec: {title, labels, values}
   */
  function barChartSVG(spec) {
    const rawTitle = (spec && spec.title) ? String(spec.title).trim() : "Bar Chart";
    const rawLabels = (spec && Array.isArray(spec.labels)) ? spec.labels : [];
    const rawValues = (spec && Array.isArray(spec.values)) ? spec.values : [];

    const numVals = rawValues.map(function (v) {
      const n = Number(v);
      return (!isNaN(n) && isFinite(n)) ? n : 0;
    });

    const labels = rawLabels.map(function (l) { return String(l !== null && l !== undefined ? l : ""); });

    const totalWidth = 600;
    const totalHeight = 340;
    const plotX = 64;
    const plotY = 56;
    const plotW = 504;
    const plotH = 224;

    let maxVal = 0;
    for (let i = 0; i < numVals.length; i++) {
      if (numVals[i] > maxVal) maxVal = numVals[i];
    }
    if (maxVal <= 0) maxVal = 10;

    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + totalWidth + ' ' + totalHeight + '" width="100%" height="' + totalHeight + '" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Inter,sans-serif;background:#151a23;border-radius:12px;display:block;margin:12px 0;">';
    svg += '<rect width="' + totalWidth + '" height="' + totalHeight + '" rx="12" fill="#151a23" stroke="#262d3d" stroke-width="1"/>';
    svg += '<text x="24" y="34" fill="#e8eaf0" font-size="15" font-weight="600">' + escapeXML(rawTitle) + '</text>';

    // Horizontal grid lines and Y-axis labels (4 intervals)
    for (let step = 0; step <= 4; step++) {
      const yFraction = step / 4;
      const yPos = plotY + plotH - (yFraction * plotH);
      const valAtStep = yFraction * maxVal;
      svg += '<line x1="' + plotX + '" y1="' + yPos + '" x2="' + (plotX + plotW) + '" y2="' + yPos + '" stroke="#262d3d" stroke-dasharray="3,3" stroke-width="1"/>';
      svg += '<text x="' + (plotX - 10) + '" y="' + (yPos + 4) + '" fill="#9aa3b5" font-size="10" text-anchor="end">' + escapeXML(formatChartNumber(valAtStep)) + '</text>';
    }

    // Baseline
    svg += '<line x1="' + plotX + '" y1="' + (plotY + plotH) + '" x2="' + (plotX + plotW) + '" y2="' + (plotY + plotH) + '" stroke="#262d3d" stroke-width="1.5"/>';

    const n = Math.max(numVals.length, labels.length);
    if (n === 0) {
      svg += '<text x="' + (plotX + plotW / 2) + '" y="' + (plotY + plotH / 2) + '" fill="#9aa3b5" font-size="13" text-anchor="middle">No data available</text>';
    } else {
      const slotW = plotW / n;
      const barW = Math.max(6, Math.min(44, slotW * 0.65));

      for (let i = 0; i < n; i++) {
        const val = numVals[i] !== undefined ? numVals[i] : 0;
        const barH = maxVal > 0 ? (val / maxVal) * plotH : 0;
        const x = plotX + i * slotW + (slotW - barW) / 2;
        const y = plotY + plotH - barH;

        if (barH > 0) {
          svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" rx="4" fill="#6e8cff"/>';
        }

        // Value above bar
        const displayVal = formatChartNumber(val);
        const textY = Math.max(plotY + 12, y - 6);
        svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + textY.toFixed(1) + '" fill="#e8eaf0" font-size="10" text-anchor="middle">' + escapeXML(displayVal) + '</text>';

        // X label below axis
        let rawLabel = labels[i] || "";
        if (rawLabel.length > 10) {
          rawLabel = rawLabel.substring(0, 9) + "\u2026";
        }
        svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (plotY + plotH + 20) + '" fill="#9aa3b5" font-size="11" text-anchor="middle">' + escapeXML(rawLabel) + '</text>';
      }
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Self-contained Line Chart SVG string (readable at 600px wide, theme-aligned).
   * spec: {title, labels, values}
   */
  function lineChartSVG(spec) {
    const rawTitle = (spec && spec.title) ? String(spec.title).trim() : "Line Chart";
    const rawLabels = (spec && Array.isArray(spec.labels)) ? spec.labels : [];
    const rawValues = (spec && Array.isArray(spec.values)) ? spec.values : [];

    const numVals = rawValues.map(function (v) {
      const n = Number(v);
      return (!isNaN(n) && isFinite(n)) ? n : 0;
    });

    const labels = rawLabels.map(function (l) { return String(l !== null && l !== undefined ? l : ""); });

    const totalWidth = 600;
    const totalHeight = 340;
    const plotX = 64;
    const plotY = 56;
    const plotW = 504;
    const plotH = 224;

    let minVal = numVals.length > 0 ? numVals[0] : 0;
    let maxVal = numVals.length > 0 ? numVals[0] : 0;
    for (let i = 0; i < numVals.length; i++) {
      if (numVals[i] < minVal) minVal = numVals[i];
      if (numVals[i] > maxVal) maxVal = numVals[i];
    }
    if (minVal > 0) minVal = 0;
    if (minVal === maxVal) maxVal = minVal + 10;
    const valRange = maxVal - minVal;

    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + totalWidth + ' ' + totalHeight + '" width="100%" height="' + totalHeight + '" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Inter,sans-serif;background:#151a23;border-radius:12px;display:block;margin:12px 0;">';
    svg += '<rect width="' + totalWidth + '" height="' + totalHeight + '" rx="12" fill="#151a23" stroke="#262d3d" stroke-width="1"/>';
    svg += '<text x="24" y="34" fill="#e8eaf0" font-size="15" font-weight="600">' + escapeXML(rawTitle) + '</text>';

    // Horizontal grid lines and Y-axis labels
    for (let step = 0; step <= 4; step++) {
      const yFraction = step / 4;
      const yPos = plotY + plotH - (yFraction * plotH);
      const valAtStep = minVal + yFraction * valRange;
      svg += '<line x1="' + plotX + '" y1="' + yPos + '" x2="' + (plotX + plotW) + '" y2="' + yPos + '" stroke="#262d3d" stroke-dasharray="3,3" stroke-width="1"/>';
      svg += '<text x="' + (plotX - 10) + '" y="' + (yPos + 4) + '" fill="#9aa3b5" font-size="10" text-anchor="end">' + escapeXML(formatChartNumber(valAtStep)) + '</text>';
    }

    // Baseline
    svg += '<line x1="' + plotX + '" y1="' + (plotY + plotH) + '" x2="' + (plotX + plotW) + '" y2="' + (plotY + plotH) + '" stroke="#262d3d" stroke-width="1.5"/>';

    const n = Math.max(numVals.length, labels.length);
    if (n === 0) {
      svg += '<text x="' + (plotX + plotW / 2) + '" y="' + (plotY + plotH / 2) + '" fill="#9aa3b5" font-size="13" text-anchor="middle">No data available</text>';
    } else {
      const points = [];
      for (let i = 0; i < n; i++) {
        const val = numVals[i] !== undefined ? numVals[i] : 0;
        const px = n === 1 ? (plotX + plotW / 2) : (plotX + (i / (n - 1)) * plotW);
        const py = plotY + plotH - ((val - minVal) / valRange) * plotH;
        points.push({ x: px, y: py, val: val, label: labels[i] || "" });
      }

      // Shaded area under line
      if (points.length > 1) {
        let areaPoints = plotX + ',' + (plotY + plotH) + ' ';
        for (let i = 0; i < points.length; i++) {
          areaPoints += points[i].x.toFixed(1) + ',' + points[i].y.toFixed(1) + ' ';
        }
        areaPoints += (plotX + plotW) + ',' + (plotY + plotH);
        svg += '<polygon points="' + areaPoints + '" fill="#6e8cff" fill-opacity="0.12"/>';
      }

      // Line path
      let pathD = "";
      for (let i = 0; i < points.length; i++) {
        const cmd = i === 0 ? 'M' : 'L';
        pathD += cmd + ' ' + points[i].x.toFixed(1) + ' ' + points[i].y.toFixed(1) + ' ';
      }
      svg += '<path d="' + pathD.trim() + '" fill="none" stroke="#6e8cff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';

      // Circles, value labels, and X labels
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        svg += '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="4" fill="#6e8cff" stroke="#151a23" stroke-width="2"/>';

        // Value text
        const textY = Math.max(plotY + 12, pt.y - 8);
        svg += '<text x="' + pt.x.toFixed(1) + '" y="' + textY.toFixed(1) + '" fill="#e8eaf0" font-size="10" text-anchor="middle">' + escapeXML(formatChartNumber(pt.val)) + '</text>';

        // X label below axis
        let rawLabel = pt.label;
        if (rawLabel.length > 10) {
          rawLabel = rawLabel.substring(0, 9) + "\u2026";
        }
        svg += '<text x="' + pt.x.toFixed(1) + '" y="' + (plotY + plotH + 20) + '" fill="#9aa3b5" font-size="11" text-anchor="middle">' + escapeXML(rawLabel) + '</text>';
      }
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Render chart specification(s) to a map of {key: svgString}.
   */
  function renderChartSpecs(specs) {
    const result = {};
    if (!specs) return result;

    let parsed = specs;
    if (typeof specs === "string") {
      try {
        const cleaned = specs.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        parsed = JSON.parse(cleaned);
      } catch (_) {
        return result;
      }
    }

    let list = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && Array.isArray(parsed.charts)) {
      list = parsed.charts;
    } else if (parsed && typeof parsed === "object") {
      if (parsed.type && parsed.values) {
        list = [parsed];
      } else {
        const keys = Object.keys(parsed);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const item = parsed[k];
          if (item && typeof item === "object") {
            list.push(Object.assign({ key: k }, item));
          }
        }
      }
    }

    for (let idx = 0; idx < list.length; idx++) {
      const chart = list[idx];
      if (!chart || typeof chart !== "object") continue;
      const key = chart.key ? String(chart.key) : ("chart" + (idx + 1));
      const type = chart.type ? String(chart.type).toLowerCase() : "bar";
      let svg = "";
      if (type === "line" || type === "line_chart" || type === "linechart") {
        svg = lineChartSVG(chart);
      } else {
        svg = barChartSVG(chart);
      }
      result[key] = svg;
    }

    return result;
  }

  /**
   * Knowledge manager stored in localStorage under orcb_knowledge.
   * JSON structure: {datasets: {}, corrections: [], metrics: {}}
   * All methods are try/catch-guarded and fallback gracefully if localStorage is unavailable.
   */
  const KNOWLEDGE_KEY = "orcb_knowledge";
  const memoryKnowledge = { datasets: {}, corrections: [], metrics: {} };

  function loadKnowledge() {
    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        const raw = localStorage.getItem(KNOWLEDGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            const datasets = (parsed.datasets && typeof parsed.datasets === "object") ? parsed.datasets : {};
            const corrections = Array.isArray(parsed.corrections) ? parsed.corrections : [];
            const metrics = (parsed.metrics && typeof parsed.metrics === "object") ? parsed.metrics : {};
            memoryKnowledge.datasets = datasets;
            memoryKnowledge.corrections = corrections;
            memoryKnowledge.metrics = metrics;
            return { datasets: datasets, corrections: corrections, metrics: metrics };
          }
        }
      }
    } catch (_) {}
    return {
      datasets: memoryKnowledge.datasets || {},
      corrections: Array.isArray(memoryKnowledge.corrections) ? memoryKnowledge.corrections : [],
      metrics: memoryKnowledge.metrics || {}
    };
  }

  function saveKnowledge(data) {
    try {
      memoryKnowledge.datasets = data.datasets || {};
      memoryKnowledge.corrections = Array.isArray(data.corrections) ? data.corrections : [];
      memoryKnowledge.metrics = data.metrics || {};
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        localStorage.setItem(KNOWLEDGE_KEY, JSON.stringify(data));
      }
    } catch (_) {}
  }

  const Knowledge = {
    getDataset: function (name) {
      try {
        if (!name) return null;
        const k = loadKnowledge();
        return (k.datasets && k.datasets[name]) ? k.datasets[name] : null;
      } catch (_) {
        return null;
      }
    },

    saveDataset: function (name, datasetInfo) {
      try {
        if (!name) return false;
        const k = loadKnowledge();
        k.datasets[name] = {
          schema: (datasetInfo && datasetInfo.schema !== undefined) ? datasetInfo.schema : "",
          quirks: (datasetInfo && datasetInfo.quirks !== undefined) ? datasetInfo.quirks : ""
        };
        saveKnowledge(k);
        return true;
      } catch (_) {
        return false;
      }
    },

    getCorrections: function () {
      try {
        const k = loadKnowledge();
        return Array.isArray(k.corrections) ? k.corrections.slice() : [];
      } catch (_) {
        return [];
      }
    },

    addCorrection: function (text) {
      try {
        if (typeof text !== "string") return false;
        const trimmed = text.trim();
        if (!trimmed) return false;
        const k = loadKnowledge();
        if (!Array.isArray(k.corrections)) k.corrections = [];
        k.corrections.push(trimmed);
        saveKnowledge(k);
        return true;
      } catch (_) {
        return false;
      }
    },

    getMetrics: function () {
      try {
        const k = loadKnowledge();
        return (k.metrics && typeof k.metrics === "object") ? Object.assign({}, k.metrics) : {};
      } catch (_) {
        return {};
      }
    },

    setMetric: function (name, def) {
      try {
        if (!name) return false;
        const k = loadKnowledge();
        if (!k.metrics || typeof k.metrics !== "object") k.metrics = {};
        k.metrics[name] = def !== undefined ? def : "";
        saveKnowledge(k);
        return true;
      } catch (_) {
        return false;
      }
    }
  };

  /**
   * Triggers a browser download of text content as a Markdown file.
   * Uses Blob and temporary <a> DOM element.
   */
  function downloadMarkdown(filename, text) {
    try {
      if (typeof document === "undefined" || typeof Blob === "undefined") {
        return false;
      }
      const safeName = (filename && typeof filename === "string" ? filename.trim() : "") || "analysis-report.md";
      const content = typeof text === "string" ? text : String(text || "");
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = safeName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(function () {
        try {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 200);
      return true;
    } catch (_) {
      return false;
    }
  }

  const Helpers = {
    parseCSV: parseCSV,
    profileDataset: profileDataset,
    describeStats: describeStats,
    correlation: correlation,
    iqrOutliers: iqrOutliers,
    executeOps: executeOps,
    barChartSVG: barChartSVG,
    lineChartSVG: lineChartSVG,
    renderChartSpecs: renderChartSpecs,
    Knowledge: Knowledge,
    downloadMarkdown: downloadMarkdown
  };

  if (typeof window !== "undefined") {
    window.Helpers = Helpers;
  }
  if (typeof global !== "undefined") {
    global.Helpers = Helpers;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Helpers;
  }
})();
