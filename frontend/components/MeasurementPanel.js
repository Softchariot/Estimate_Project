import { useEffect, useState } from "react";
import axios from "axios";

/** Strip leading Excel "=" and trim. Empty → "". */
function normalizeFormulaText(value) {
  let s = String(value ?? "").trim();
  if (!s) return "";
  if (s.startsWith("=")) s = s.slice(1).trim();
  return s;
}

function findClosingParen(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i += 1) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findTopLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") depth -= 1;
    else if (s[i] === "," && depth === 0) return i;
  }
  return -1;
}

function evalArithmeticOnly(expr) {
  const s = String(expr ?? "").trim();
  if (!s) return { val: null, err: true };
  if (!/^[0-9+\-*/.() \t]+$/.test(s)) return { val: null, err: true };
  try {
    // eslint-disable-next-line no-new-func
    const v = Function('"use strict"; return (' + s + ")")();
    if (!isFinite(v) || isNaN(v)) return { val: null, err: true };
    return { val: Number(v), err: false };
  } catch {
    return { val: null, err: true };
  }
}

const EXCEL_FN_NAMES = ["ROUND", "ABS", "INT", "FLOOR", "CEILING"];

/** Expand Excel ROUND/ABS/INT/FLOOR/CEILING to numeric literals (innermost first). */
function expandExcelFunctions(input) {
  let s = String(input ?? "");
  for (let guard = 0; guard < 40; guard += 1) {
    const upper = s.toUpperCase();
    let replaced = false;
    for (const name of EXCEL_FN_NAMES) {
      const token = `${name}(`;
      let searchFrom = 0;
      while (searchFrom < upper.length) {
        const idx = upper.indexOf(token, searchFrom);
        if (idx < 0) break;
        const openIdx = idx + name.length;
        if (s[openIdx] !== "(") {
          searchFrom = idx + 1;
          continue;
        }
        const closeIdx = findClosingParen(s, openIdx);
        if (closeIdx < 0) return null;
        const inside = s.slice(openIdx + 1, closeIdx);
        const insideUpper = inside.toUpperCase();
        if (EXCEL_FN_NAMES.some((n) => insideUpper.includes(`${n}(`))) {
          searchFrom = idx + 1;
          continue;
        }
        let value;
        if (name === "ROUND") {
          const comma = findTopLevelComma(inside);
          const arg = comma < 0 ? inside : inside.slice(0, comma);
          const digitsRaw = comma < 0 ? "0" : inside.slice(comma + 1).trim();
          const digits = parseInt(digitsRaw, 10);
          if (!Number.isFinite(digits)) return null;
          const inner = expandExcelFunctions(arg);
          if (inner == null) return null;
          const ar = evalArithmeticOnly(inner);
          if (ar.err) return null;
          const factor = 10 ** digits;
          value = Math.round(ar.val * factor) / factor;
        } else {
          const inner = expandExcelFunctions(inside);
          if (inner == null) return null;
          const ar = evalArithmeticOnly(inner);
          if (ar.err) return null;
          if (name === "ABS") value = Math.abs(ar.val);
          else if (name === "INT") value = Math.trunc(ar.val);
          else if (name === "FLOOR") value = Math.floor(ar.val);
          else if (name === "CEILING") value = Math.ceil(ar.val);
          else return null;
        }
        s = `${s.slice(0, idx)}(${value})${s.slice(closeIdx + 1)}`;
        replaced = true;
        break;
      }
      if (replaced) break;
    }
    if (!replaced) break;
  }
  return s;
}

/**
 * Evaluate Excel-style arithmetic, including ROUND/ABS/INT/FLOOR/CEILING.
 * Cell references (A1, K48) are rejected.
 */
function calcExpr(expr) {
  try {
    let s = normalizeFormulaText(expr);
    if (!s.trim()) return { val: null, err: false };
    s = expandExcelFunctions(s);
    if (s == null) return { val: null, err: true };
    // After expanding known fns, no letters should remain (blocks A1, SUM, etc.)
    if (/[a-zA-Z_]/.test(s)) return { val: null, err: true };
    const r = evalArithmeticOnly(s);
    if (r.err) return r;
    return { val: parseFloat(r.val.toFixed(4)), err: false };
  } catch {
    return { val: null, err: true };
  }
}

function uid() {
  return "r" + Math.random().toString(36).slice(2, 9);
}

/**
 * Factor for Quantity product.
 * Empty → 1 (when at least one dimension is present); plain number or math expression is evaluated.
 */
function parseDimFactor(value) {
  const s = normalizeFormulaText(value);
  if (!s) return { val: 1, err: false };
  const plain = s.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(plain)) {
    const n = parseFloat(plain);
    if (isNaN(n)) return { val: null, err: true };
    return { val: n, err: false };
  }
  return calcExpr(s);
}

function rowDimsAllEmpty(row) {
  return !["num", "len", "brd", "hgt"].some((k) =>
    Boolean(normalizeFormulaText(row[k])),
  );
}

function computeQty(row) {
  // Description-only (or blank dims): Quantity is null, not 1×1×1×1
  if (rowDimsAllEmpty(row)) {
    return { val: null, err: false };
  }
  const factors = [
    parseDimFactor(row.num),
    parseDimFactor(row.len),
    parseDimFactor(row.brd),
    parseDimFactor(row.hgt),
  ];
  if (factors.some((f) => f.err || f.val === null)) {
    return { val: null, err: true };
  }
  const total = factors.reduce((acc, f) => acc * f.val, 1);
  if (!isFinite(total)) return { val: null, err: true };
  return { val: parseFloat(total.toFixed(4)), err: false };
}

const measurementRowBase = {
  id: null,
  localId: "",
  sequence: null,
  desc: "",
  num: "",
  len: "",
  brd: "",
  hgt: "",
  qty: null,
  measErr: false,
  dirty: false,
};

const QTY_FIELDS = ["num", "len", "brd", "hgt"];

function isNumericCell(value) {
  const t = normalizeFormulaText(value).replace(/,/g, "");
  if (!t) return false;
  return /^-?\d+(\.\d+)?$/.test(t);
}

function isExprCell(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const t = normalizeFormulaText(raw);
  if (!t) return false;
  if (isNumericCell(t)) return false;
  if (/^(ROUND|ABS|INT|FLOOR|CEILING)\s*\(/i.test(t)) return true;
  return /[+\-*/()]/.test(t) || raw.startsWith("=");
}

/** Excel A1-style cell reference (G4863, $A$1, …). */
function looksLikeExcelCellRef(value) {
  return /^\$?[A-Za-z]{1,3}\$?\d+$/.test(normalizeFormulaText(value));
}

function parseNumericCell(value) {
  return parseFloat(normalizeFormulaText(value).replace(/,/g, ""));
}

function approxEqual(a, b) {
  if (!isFinite(a) || !isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff < 0.015) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / scale < 0.012;
}

function looksLikeHeaderRow(cells) {
  const first = String(cells[0] || "")
    .trim()
    .toLowerCase();
  const joined = cells.join(" ").toLowerCase();
  if (!first) return false;
  if (
    /^(seq|sequence|sr\.?|description|desc|item)$/i.test(first) &&
    /(meas|quantity|qty|no\.?|length|\b[lbh]\b)/i.test(joined)
  ) {
    return true;
  }
  return false;
}

function decodeBasicHtmlEntities(s) {
  return String(s ?? "")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#0*34;/g, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * Browsers often strip Excel's x:fmla / x:num from the DOM, but they remain in
 * the raw clipboard HTML. Pull formula + cached numeric value per <td>/<th>.
 */
function extractTdMetaFromOpenTags(html) {
  const metas = [];
  const openTagRe = /<(td|th)\b([^>]*)>/gi;
  let m;
  while ((m = openTagRe.exec(html))) {
    const attrs = m[2] || "";
    let formula = "";
    let cachedNum = "";
    const formulaPatterns = [
      /\b(?:[\w.-]+:)?fmla\s*=\s*"([^"]*)"/i,
      /\b(?:[\w.-]+:)?fmla\s*=\s*'([^']*)'/i,
      /\b(?:[\w.-]+:)?Formula\s*=\s*"([^"]*)"/i,
      /\b(?:[\w.-]+:)?Formula\s*=\s*'([^']*)'/i,
    ];
    for (const re of formulaPatterns) {
      const fm = attrs.match(re);
      if (fm) {
        formula = decodeBasicHtmlEntities(fm[1]).trim();
        break;
      }
    }
    const numMatch =
      attrs.match(/\b(?:[\w.-]+:)?num\s*=\s*"([^"]*)"/i) ||
      attrs.match(/\b(?:[\w.-]+:)?num\s*=\s*'([^']*)'/i) ||
      attrs.match(/\b(?:[\w.-]+:)?num\s*=\s*([^>\s]+)/i) ||
      attrs.match(/\bsdval\s*=\s*"([^"]*)"/i) ||
      attrs.match(/\bsdval\s*=\s*'([^']*)'/i);
    if (numMatch) {
      cachedNum = decodeBasicHtmlEntities(numMatch[1]).trim();
    }
    metas.push({ formula, cachedNum });
  }
  return metas;
}

/** @deprecated use extractTdMetaFromOpenTags */
function extractFormulaAttrsFromTdOpenTags(html) {
  return extractTdMetaFromOpenTags(html).map((m) => m.formula);
}

/** Formulas from SpreadsheetML / Xml Spreadsheet clipboard (ss:Formula). */
function extractFormulasFromSpreadsheetXml(xml) {
  if (!xml) return [];
  const formulas = [];
  const re = /<Cell\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1] || "";
    const fm =
      attrs.match(/\b(?:[\w.-]+:)?Formula\s*=\s*"([^"]*)"/i) ||
      attrs.match(/\b(?:[\w.-]+:)?Formula\s*=\s*'([^']*)'/i);
    formulas.push(fm ? decodeBasicHtmlEntities(fm[1]).trim() : "");
  }
  return formulas;
}

function readAttrByName(el, nameRe) {
  if (!el) return "";
  for (const attr of Array.from(el.attributes || [])) {
    if (nameRe.test(attr.name) && attr.value) return String(attr.value).trim();
  }
  return "";
}

/** Read Excel HTML cell: formula, cached x:num, and visible text. */
function getExcelHtmlCellPair(td) {
  if (!td) return { formula: "", display: "", cachedNum: "" };
  let formula = readAttrByName(td, /fmla|formula/i);
  let cachedNum =
    readAttrByName(td, /(?:^|:)num$/i) || readAttrByName(td, /sdval/i);

  if (!formula) {
    const nested = td.querySelector("[x\\:fmla], [ss\\:Formula], [formula]");
    if (nested) formula = readAttrByName(nested, /fmla|formula/i);
  }
  if (!cachedNum) {
    const nestedNum = td.querySelector("[x\\:num], [sdval]");
    if (nestedNum) {
      cachedNum =
        readAttrByName(nestedNum, /(?:^|:)num$/i) ||
        readAttrByName(nestedNum, /sdval/i);
    }
  }

  if ((!formula || !cachedNum) && td.outerHTML) {
    const fromOuter = extractTdMetaFromOpenTags(td.outerHTML)[0];
    if (fromOuter) {
      if (!formula && fromOuter.formula) formula = fromOuter.formula;
      if (!cachedNum && fromOuter.cachedNum) cachedNum = fromOuter.cachedNum;
    }
  }

  const text = String(td.innerText || td.textContent || "").trim();
  // Prefer cached calculated value when Show Formulas is on (text is the formula)
  const display = cachedNum || text;
  return { formula, display, cachedNum, text };
}

/**
 * Keep formula text only when our evaluator supports it (arithmetic + ROUND/ABS/…).
 * Otherwise use Excel's cached/evaluated value (x:num) — needed for cell refs
 * like G4863 when Show Formulas is on.
 */
function resolvePasteDimValue(formulaRaw, displayRaw, cachedNumRaw) {
  const formula = normalizeFormulaText(formulaRaw);
  const cachedNum = String(cachedNumRaw ?? "").trim();
  const display = String(displayRaw ?? "").trim();
  const displayNorm = normalizeFormulaText(display);
  const cachedNorm = normalizeFormulaText(cachedNum);

  const pickNumeric = (raw) => {
    const n = normalizeFormulaText(raw);
    if (!n) return null;
    if (isNumericCell(n)) return n.replace(/,/g, "");
    const dr = calcExpr(n);
    if (!dr.err && dr.val !== null) return n;
    return null;
  };

  if (!formula) {
    return (
      pickNumeric(cachedNum) ??
      pickNumeric(display) ??
      (displayNorm || display || cachedNorm || "")
    );
  }

  if (isNumericCell(formula)) return formula.replace(/,/g, "");

  const r = calcExpr(formula);
  if (!r.err && r.val !== null) return formula;

  // Cell ref / SUM / etc. → Excel cached value (x:num) or display number
  return (
    pickNumeric(cachedNum) ??
    pickNumeric(display) ??
    formula
  );
}

function resolvePasteCell(pair, isDescription) {
  if (isDescription) {
    return (
      String(pair?.text || pair?.display || "").trim() ||
      normalizeFormulaText(pair?.formula) ||
      ""
    );
  }
  return resolvePasteDimValue(pair?.formula, pair?.display, pair?.cachedNum);
}

/**
 * Parse Excel HTML clipboard into rows of { formula, display, cachedNum } pairs.
 * Uses raw-string regex for x:fmla / x:num because DOMParser often drops them.
 */
function extractExcelHtmlTablePairs(html, spreadsheetXml) {
  if ((!html && !spreadsheetXml) || typeof DOMParser === "undefined") return [];
  try {
    const rawMetas = extractTdMetaFromOpenTags(html || "");
    const xmlFormulas = extractFormulasFromSpreadsheetXml(spreadsheetXml || "");
    const doc = new DOMParser().parseFromString(
      html || "<table></table>",
      "text/html",
    );
    const trs = Array.from(doc.querySelectorAll("tr"));
    const rows = [];
    let cellOrdinal = 0;
    let xmlOrdinal = 0;
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll("td, th"));
      if (!tds.length) continue;
      const cells = tds.map((td) => {
        const pair = getExcelHtmlCellPair(td);
        const raw = rawMetas[cellOrdinal] || { formula: "", cachedNum: "" };
        if (!pair.formula && raw.formula) pair.formula = raw.formula;
        if (!pair.cachedNum && raw.cachedNum) {
          pair.cachedNum = raw.cachedNum;
          // Refresh display preference when Show Formulas shows the formula text
          if (
            pair.cachedNum &&
            (!pair.display ||
              isExprCell(pair.text || pair.display) ||
              /^\$?[A-Za-z]{1,3}\$?\d+$/.test(
                normalizeFormulaText(pair.text || pair.display),
              ))
          ) {
            pair.display = pair.cachedNum;
          }
        }
        if (!pair.formula && xmlFormulas[xmlOrdinal]) {
          pair.formula = xmlFormulas[xmlOrdinal];
        }
        cellOrdinal += 1;
        if (xmlFormulas.length) xmlOrdinal += 1;
        return pair;
      });
      if (cells.some((c) => c.formula || c.display || c.cachedNum)) {
        rows.push(cells);
      }
    }
    // SpreadsheetML-only paste (no HTML table)
    if (!rows.length && xmlFormulas.some(Boolean) && spreadsheetXml) {
      const dataRe =
        /<Cell\b([^>]*)>(?:\s*<Data\b[^>]*>([\s\S]*?)<\/Data>)?/gi;
      const flat = [];
      let cm;
      while ((cm = dataRe.exec(spreadsheetXml))) {
        const attrs = cm[1] || "";
        const fm =
          attrs.match(/\b(?:[\w.-]+:)?Formula\s*=\s*"([^"]*)"/i) ||
          attrs.match(/\b(?:[\w.-]+:)?Formula\s*=\s*'([^']*)'/i);
        const formula = fm ? decodeBasicHtmlEntities(fm[1]).trim() : "";
        const display = decodeBasicHtmlEntities(
          String(cm[2] ?? "").replace(/<[^>]+>/g, ""),
        ).trim();
        flat.push({ formula, display, cachedNum: display, text: display });
      }
      if (flat.length) rows.push(flat);
    }
    return rows;
  } catch {
    return [];
  }
}

function parsePlainPasteRows(text) {
  if (!String(text || "").trim()) return [];
  const raw = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = raw.split("\n").filter((line) => String(line).trim() !== "");
  return lines.map((line) => {
    let cells = line.split("\t").map((c) => String(c).trim());
    if (cells.length === 1 && line.includes(",") && !line.includes("\t")) {
      cells = line.split(",").map((c) => String(c).trim());
    }
    return cells;
  });
}

/**
 * All Excel formulas in clipboard HTML/XML (global scan).
 * Browsers may drop x:fmla from the DOM but leave it in the raw string.
 */
function extractAllExcelFormulas(html, xml) {
  const found = [];
  const seen = new Set();
  const add = (raw) => {
    const t = decodeBasicHtmlEntities(String(raw || "")).trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(t);
  };
  const re =
    /(?:[\w.-]+:)?(?:fmla|Formula)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const src of [html || "", xml || ""]) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src))) add(m[1] || m[2] || "");
  }
  return found;
}

/**
 * Prefer an evaluable formula whose result matches the pasted display value.
 */
function matchFormulaToValue(display, formulaPool, usedIndexes) {
  if (!formulaPool?.length) return null;
  const displayNorm = normalizeFormulaText(display);
  if (!displayNorm) return null;
  let target = null;
  if (isNumericCell(displayNorm)) target = parseNumericCell(displayNorm);
  else {
    const dr = calcExpr(displayNorm);
    if (!dr.err && dr.val != null) target = dr.val;
  }
  if (target == null || !isFinite(target)) return null;

  for (let i = 0; i < formulaPool.length; i += 1) {
    if (usedIndexes.has(i)) continue;
    const formula = formulaPool[i];
    const r = calcExpr(normalizeFormulaText(formula));
    if (r.err || r.val == null) continue;
    if (!approxEqual(r.val, target)) continue;
    usedIndexes.add(i);
    return normalizeFormulaText(formula);
  }
  return null;
}

/**
 * Map cell refs / unevaluable formulas → Excel cached values (x:num / Data).
 * Needed when Show Formulas is on (plain text is G4863, not 8.9).
 */
function buildCellRefValueMap(html, xml, pairRows) {
  const map = new Map();
  const add = (formulaRaw, numRaw) => {
    const formula = normalizeFormulaText(formulaRaw);
    const num = normalizeFormulaText(numRaw).replace(/,/g, "");
    if (!formula || !num || !isNumericCell(num)) return;
    map.set(formula.toUpperCase(), num);
  };

  for (const meta of extractTdMetaFromOpenTags(html || "")) {
    add(meta.formula, meta.cachedNum);
  }

  // Same-tag fmla + num in either attribute order (raw scan)
  const tagRe = /<(td|th)\b([^>]*)>/gi;
  let tm;
  while ((tm = tagRe.exec(html || ""))) {
    const attrs = tm[2] || "";
    const fm =
      attrs.match(/\b(?:[\w.-]+:)?fmla\s*=\s*"([^"]*)"/i) ||
      attrs.match(/\b(?:[\w.-]+:)?fmla\s*=\s*'([^']*)'/i) ||
      attrs.match(/\b(?:[\w.-]+:)?Formula\s*=\s*"([^"]*)"/i);
    const nm =
      attrs.match(/\b(?:[\w.-]+:)?num\s*=\s*"([^"]*)"/i) ||
      attrs.match(/\b(?:[\w.-]+:)?num\s*=\s*'([^']*)'/i) ||
      attrs.match(/\b(?:[\w.-]+:)?num\s*=\s*([^>\s]+)/i) ||
      attrs.match(/\bsdval\s*=\s*"([^"]*)"/i);
    if (fm && nm) add(fm[1], nm[1]);
  }

  for (const row of pairRows || []) {
    for (const cell of row) {
      add(cell.formula, cell.cachedNum);
      if (looksLikeExcelCellRef(cell.text) && cell.cachedNum) {
        add(cell.text, cell.cachedNum);
      }
      if (looksLikeExcelCellRef(cell.formula) && isNumericCell(cell.display)) {
        add(cell.formula, cell.display);
      }
    }
  }

  if (xml) {
    const dataRe =
      /<Cell\b([^>]*)>(?:\s*<Data\b[^>]*>([\s\S]*?)<\/Data>)?/gi;
    let cm;
    while ((cm = dataRe.exec(xml))) {
      const attrs = cm[1] || "";
      const fm =
        attrs.match(/\b(?:[\w.-]+:)?Formula\s*=\s*"([^"]*)"/i) ||
        attrs.match(/\b(?:[\w.-]+:)?Formula\s*=\s*'([^']*)'/i);
      const dataVal = decodeBasicHtmlEntities(
        String(cm[2] ?? "").replace(/<[^>]+>/g, ""),
      ).trim();
      if (fm) add(fm[1], dataVal);
    }
  }

  return map;
}

/**
 * Merge plain TSV (values when Show Formulas is off) with HTML pairs / formula pool.
 * Keeps evaluable formulas; cell refs use Excel x:num / cached value map.
 */
function mergePlainWithHtmlPairs(plainRows, pairRows, formulaPool, refValueMap) {
  const pool = formulaPool || [];
  const refMap = refValueMap || new Map();
  const rowCount = Math.max(plainRows.length, pairRows.length);
  const out = [];
  const usedIndexes = new Set();

  const cachedForRef = (refOrFormula, pair, htmlCells) => {
    const key = normalizeFormulaText(refOrFormula).toUpperCase();
    if (!key) return "";
    if (pair?.cachedNum && isNumericCell(pair.cachedNum)) {
      return normalizeFormulaText(pair.cachedNum).replace(/,/g, "");
    }
    if (refMap.has(key)) return refMap.get(key);
    for (const hc of htmlCells || []) {
      const fk = normalizeFormulaText(hc.formula).toUpperCase();
      const tk = normalizeFormulaText(hc.text || "").toUpperCase();
      if (
        (fk === key || tk === key) &&
        hc.cachedNum &&
        isNumericCell(hc.cachedNum)
      ) {
        return normalizeFormulaText(hc.cachedNum).replace(/,/g, "");
      }
    }
    return "";
  };

  for (let r = 0; r < rowCount; r += 1) {
    const plainCells = plainRows[r] || [];
    const htmlCells = pairRows[r] || [];
    const colCount = Math.max(plainCells.length, htmlCells.length);
    if (!colCount) continue;
    const row = [];
    for (let c = 0; c < colCount; c += 1) {
      const plain = String(plainCells[c] ?? "").trim();
      const pair = htmlCells[c] || {
        formula: "",
        display: "",
        cachedNum: "",
        text: "",
      };
      if (c === 0) {
        row.push(
          plain ||
            pair.text ||
            pair.display ||
            normalizeFormulaText(pair.formula) ||
            "",
        );
        continue;
      }

      const plainIsRef = looksLikeExcelCellRef(plain);
      const plainIsFormula = isExprCell(plain) || plainIsRef;

      // 1) HTML formula for this column
      if (pair.formula) {
        const cached = cachedForRef(pair.formula, pair, htmlCells);
        const resolved = resolvePasteDimValue(
          pair.formula,
          cached || (isNumericCell(pair.display) ? pair.display : ""),
          cached,
        );
        if (looksLikeExcelCellRef(resolved) && cached) {
          row.push(cached);
        } else {
          row.push(resolved);
        }
        continue;
      }

      // 2) Show Formulas on: plain is formula or cell ref
      if (plainIsFormula) {
        const cached = cachedForRef(plain, pair, htmlCells);
        if (plainIsRef && cached) {
          row.push(cached);
          continue;
        }
        const resolved = resolvePasteDimValue(
          plain,
          cached || (isNumericCell(pair.display) ? pair.display : ""),
          cached,
        );
        if (looksLikeExcelCellRef(resolved) && cached) {
          row.push(cached);
        } else if (looksLikeExcelCellRef(resolved)) {
          // Unresolved ref — don't store G4863 (causes Invalid); leave blank
          row.push("");
        } else {
          row.push(resolved);
        }
        continue;
      }

      // 3) Match evaluable clipboard formula to this numeric value
      const display = plain || pair.display || "";
      const matched = matchFormulaToValue(display, pool, usedIndexes);
      if (matched) {
        row.push(matched);
        continue;
      }

      // 4) Cached number
      if (pair.cachedNum && isNumericCell(pair.cachedNum)) {
        row.push(normalizeFormulaText(pair.cachedNum).replace(/,/g, ""));
        continue;
      }

      row.push(normalizeFormulaText(display) || display);
    }
    if (row.some((v) => String(v).trim())) out.push(row);
  }
  return out;
}

/** Rejoin ROUND(x,2) etc. split across cells by Excel/CSV commas. */
function rejoinSplitExcelFunctions(cells) {
  const out = [];
  for (let i = 0; i < cells.length; i += 1) {
    let c = String(cells[i] ?? "");
    while (i + 1 < cells.length) {
      const normalized = normalizeFormulaText(c);
      const openIdx = normalized.indexOf("(");
      const looksLikeFn = /^(ROUND|ABS|INT|FLOOR|CEILING)\s*\(/i.test(
        normalized,
      );
      if (!looksLikeFn || openIdx < 0) break;
      // Map openIdx from normalized back — use c for paren matching
      const openInC = c.indexOf("(");
      if (openInC >= 0 && findClosingParen(c, openInC) >= 0) break;
      i += 1;
      c = `${c},${cells[i]}`;
    }
    out.push(c);
  }
  return out;
}

/** Convert one row of cells → measurement row (or null). */
function cellsToMeasurementRow(rawCells) {
  let cells = rejoinSplitExcelFunctions(
    (rawCells || []).map((c) => String(c ?? "").trim()),
  );
  if (!cells.length || cells.every((c) => !c)) return null;
  if (looksLikeHeaderRow(cells)) return null;

  // Drop leading Sequence column when present
  if (
    cells.length >= 3 &&
    isNumericCell(cells[0]) &&
    !isNumericCell(cells[1]) &&
    !isExprCell(cells[1])
  ) {
    cells = cells.slice(1);
  }

  // Normalize dim cells (strip =); keep description as-is
  cells = cells.map((c, idx) =>
    idx === 0 ? c : normalizeFormulaText(c),
  );

  // Drop trailing Quantity column (value or Excel formula with cell refs)
  if (cells.length >= 3) {
    const last = cells[cells.length - 1];
    const lastIsQtyFormula =
      isExprCell(last) && /[a-zA-Z_]/.test(normalizeFormulaText(last));
    if (lastIsQtyFormula) {
      cells = cells.slice(0, -1);
    } else if (isNumericCell(last) || isExprCell(last)) {
      const lastVal = isNumericCell(last)
        ? parseNumericCell(last)
        : calcExpr(normalizeFormulaText(last)).val;
      const dimNums = cells
        .slice(1, -1)
        .map((c) => {
          if (isNumericCell(c)) return parseNumericCell(c);
          if (isExprCell(c) || normalizeFormulaText(c)) {
            const r = calcExpr(normalizeFormulaText(c));
            return r.err ? null : r.val;
          }
          return null;
        })
        .filter((n) => n !== null && isFinite(n));
      if (
        lastVal !== null &&
        isFinite(lastVal) &&
        dimNums.length >= 1
      ) {
        const prod = dimNums.reduce((a, b) => a * b, 1);
        if (approxEqual(prod, lastVal)) {
          cells = cells.slice(0, -1);
        }
      }
    }
  }

  const desc = cells[0] || "";
  const rest = cells.slice(1);
  let num = "";
  let len = "";
  let brd = "";
  let hgt = "";
  // Excel paste: Description | No | L | B | H [| Qty]
  if (rest.length >= 4) {
    [num, len, brd, hgt] = rest;
  } else if (rest.length === 3) {
    [num, len, brd] = rest;
  } else if (rest.length === 2) {
    [num, len] = rest;
  } else if (rest.length === 1) {
    num = rest[0];
  }

  if (![desc, num, len, brd, hgt].some((v) => String(v).trim())) {
    return null;
  }

  const base = {
    ...measurementRowBase,
    localId: uid(),
    desc,
    num: String(num ?? ""),
    len: String(len ?? ""),
    brd: String(brd ?? ""),
    hgt: String(hgt ?? ""),
    dirty: true,
  };
  const result = computeQty(base);
  return {
    ...base,
    qty: result.val,
    measErr: result.err,
  };
}

/**
 * Parse Excel paste.
 * Keep supported formulas from HTML x:fmla / Formula even when Show Formulas is off.
 * Unsupported formulas (cell refs, SUM, …) use the calculated value.
 * Returns { rows, formulasInClipboard }.
 */
function parseExcelPaste(text, html, spreadsheetXml) {
  const htmlPairRows = extractExcelHtmlTablePairs(html, spreadsheetXml);
  const plainRows = parsePlainPasteRows(text);
  const formulaPool = extractAllExcelFormulas(html, spreadsheetXml);
  // Also add formulas already attached to HTML cells
  for (const row of htmlPairRows) {
    for (const cell of row) {
      if (cell.formula) {
        const t = String(cell.formula).trim();
        if (t && !formulaPool.some((f) => f.toLowerCase() === t.toLowerCase())) {
          formulaPool.push(t);
        }
      }
    }
  }
  const refValueMap = buildCellRefValueMap(html, spreadsheetXml, htmlPairRows);
  const hasHtmlFormula = formulaPool.length > 0;

  let tableRows = [];
  if (htmlPairRows.length && plainRows.length) {
    tableRows = mergePlainWithHtmlPairs(
      plainRows,
      htmlPairRows,
      formulaPool,
      refValueMap,
    );
  } else if (htmlPairRows.length && hasHtmlFormula) {
    tableRows = mergePlainWithHtmlPairs(
      htmlPairRows.map((r) =>
        r.map((p) =>
          isNumericCell(p.cachedNum || p.display)
            ? p.cachedNum || p.display
            : p.display || "",
        ),
      ),
      htmlPairRows,
      formulaPool,
      refValueMap,
    );
  } else if (plainRows.length) {
    tableRows = plainRows.map((cells) =>
      cells.map((c, idx) => {
        if (idx === 0) return c;
        const formula = normalizeFormulaText(c);
        if (!formula) return "";
        if (isNumericCell(formula)) return formula.replace(/,/g, "");
        // Cell ref with no HTML x:num — cannot resolve
        if (looksLikeExcelCellRef(formula)) return "";
        const r = calcExpr(formula);
        if (!r.err && r.val !== null) return formula;
        return formula;
      }),
    );
  } else if (htmlPairRows.length) {
    tableRows = mergePlainWithHtmlPairs(
      htmlPairRows.map((r) =>
        r.map((p) =>
          isNumericCell(p.cachedNum || p.display)
            ? p.cachedNum || p.display
            : p.display || "",
        ),
      ),
      htmlPairRows,
      formulaPool,
      refValueMap,
    );
  }

  const parsed = [];
  let unresolvedCellRefs = 0;
  for (const cells of tableRows) {
    // Count blanks that came from cell refs in plain source
    const row = cellsToMeasurementRow(cells);
    if (row) parsed.push(row);
  }
  for (const prow of plainRows) {
    for (let i = 1; i < prow.length; i += 1) {
      if (looksLikeExcelCellRef(prow[i])) unresolvedCellRefs += 1;
    }
  }
  // If we resolved them via map, dims won't contain the ref text
  const stillHasRefs = parsed.some((r) =>
    ["num", "len", "brd", "hgt"].some((k) => looksLikeExcelCellRef(r[k])),
  );
  const droppedRefs =
    unresolvedCellRefs > 0 &&
    !stillHasRefs &&
    refValueMap.size === 0;

  return {
    rows: parsed,
    formulasInClipboard: hasHtmlFormula,
    cellRefValuesFound: refValueMap.size > 0,
    droppedUnresolvedCellRefs: droppedRefs || stillHasRefs,
  };
}

function mapDbRows(dbRows) {
  const ordered = [...dbRows].sort((a, b) => {
    const seqA = Number(a.Sequence ?? 999999);
    const seqB = Number(b.Sequence ?? 999999);
    if (seqA !== seqB) return seqA - seqB;
    return Number(a.MeasurementId) - Number(b.MeasurementId);
  });
  return ordered.map((r, idx) => {
    const base = {
      ...measurementRowBase,
      id: r.MeasurementId,
      localId: uid(),
      sequence: r.Sequence != null ? Number(r.Sequence) : idx + 1,
      desc: r.Description ?? "",
      num: r.Number != null ? String(r.Number) : "",
      len: r.Length != null ? String(r.Length) : "",
      brd: r.Breadth != null ? String(r.Breadth) : "",
      hgt: r.Height != null ? String(r.Height) : "",
      dirty: false,
    };
    const result = computeQty(base);
    const dimsEmpty = rowDimsAllEmpty(base);
    return {
      ...base,
      qty: dimsEmpty
        ? null
        : r.Quantity != null
          ? Number(r.Quantity)
          : result.val,
      measErr: dimsEmpty ? false : result.err,
    };
  });
}

function MeasurementPanel({
  item,
  projectId,
  subWorkId,
  API_BASE,
  onCommentSaved,
  onMeasurementsSaved,
}) {
  const apiBase =
    API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState({});
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState("");
  const [dragLocalId, setDragLocalId] = useState(null);
  const COMMENT_MAX_LEN = 500;
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const reloadRows = async () => {
    const res = await axios.get(`${apiBase}/api/measurements`, {
      params: { workAbstractId: item.WorkAbstractId },
    });
    const dbRows = Array.isArray(res.data?.data) ? res.data.data : [];
    setRows([...mapDbRows(dbRows), { ...measurementRowBase, localId: uid() }]);
  };

  useEffect(() => {
    if (!item?.WorkAbstractId) {
      setRows([{ ...measurementRowBase, localId: uid() }]);
      return;
    }
    axios
      .get(`${apiBase}/api/measurements`, {
        params: { workAbstractId: item.WorkAbstractId },
      })
      .then((res) => {
        const dbRows = Array.isArray(res.data?.data) ? res.data.data : [];
        setRows([...mapDbRows(dbRows), { ...measurementRowBase, localId: uid() }]);
      })
      .catch((err) => {
        console.error("Failed to load measurements:", err);
        setRows([{ ...measurementRowBase, localId: uid() }]);
      });
  }, [item?.WorkAbstractId, apiBase]);

  const updateField = (localId, field, value) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.localId !== localId) return r;
        let nextValue = value;
        // Strip Excel "=" from No / L / B / H as user types or pastes
        if (QTY_FIELDS.includes(field) && typeof nextValue === "string") {
          if (nextValue.trim().startsWith("=")) {
            nextValue = normalizeFormulaText(nextValue);
          }
        }
        const next = { ...r, [field]: nextValue, dirty: true };
        if (QTY_FIELDS.includes(field)) {
          const result = computeQty(next);
          next.qty = result.val;
          next.measErr = result.err;
        }
        return next;
      });

      const lastRow = updated[updated.length - 1];
      const lastRowHasContent =
        lastRow.desc.trim() ||
        lastRow.num.trim() ||
        lastRow.len.trim() ||
        lastRow.brd.trim() ||
        lastRow.hgt.trim();
      if (lastRow.localId === localId && lastRowHasContent) {
        return [...updated, { ...measurementRowBase, localId: uid() }];
      }
      return updated;
    });
  };

  const persistOrder = async (nextRows) => {
    const saved = nextRows.filter((r) => r.id !== null);
    if (!saved.length) return;
    setReordering(true);
    setError("");
    try {
      await axios.put(`${apiBase}/api/measurements/reorder`, {
        workAbstractId: item.WorkAbstractId,
        orderedIds: saved.map((r) => r.id),
      });
      const blank = nextRows.filter((r) => r.id === null);
      const reSeq = saved.map((r, idx) => ({
        ...r,
        sequence: idx + 1,
        dirty: r.dirty,
      }));
      setRows([
        ...reSeq,
        ...(blank.length
          ? blank
          : [{ ...measurementRowBase, localId: uid() }]),
      ]);
    } catch (err) {
      setError(
        `Reorder failed: ${err.response?.data?.message || err.message}`,
      );
      try {
        await reloadRows();
      } catch {
        /* ignore */
      }
    } finally {
      setReordering(false);
    }
  };

  const moveRow = (fromLocalId, toLocalId) => {
    if (!fromLocalId || !toLocalId || fromLocalId === toLocalId) return;
    setRows((prev) => {
      const blankRows = prev.filter((r) => r.id === null);
      const savedRows = prev.filter((r) => r.id !== null);
      const fromIdx = savedRows.findIndex((r) => r.localId === fromLocalId);
      const toIdx = savedRows.findIndex((r) => r.localId === toLocalId);
      if (fromIdx < 0 || toIdx < 0) return prev;

      const nextSaved = [...savedRows];
      const [moved] = nextSaved.splice(fromIdx, 1);
      nextSaved.splice(toIdx, 0, moved);
      const next = [
        ...nextSaved,
        ...(blankRows.length
          ? blankRows
          : [{ ...measurementRowBase, localId: uid() }]),
      ];

      // Persist after state update
      queueMicrotask(() => persistOrder(next));
      return next;
    });
  };

  const deleteRow = async (localId) => {
    const row = rows.find((r) => r.localId === localId);
    if (!row) return;
    if (row.id === null) {
      setRows((prev) => {
        const next = prev.filter((r) => r.localId !== localId);
        return next.length
          ? next
          : [{ ...measurementRowBase, localId: uid() }];
      });
      return;
    }
    if (!window.confirm("Delete this measurement permanently?")) return;
    setDeleting((d) => ({ ...d, [localId]: true }));
    try {
      await axios.delete(`${apiBase}/api/measurements/${row.id}`);
      await reloadRows();
    } catch (err) {
      setError(`Delete failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setDeleting((d) => ({ ...d, [localId]: false }));
    }
  };

  const applyExcelPaste = (text, html, spreadsheetXml) => {
    const {
      rows: pasted,
      formulasInClipboard,
      cellRefValuesFound,
      droppedUnresolvedCellRefs,
    } = parseExcelPaste(text, html, spreadsheetXml);
    if (!pasted.length) {
      setError(
        "No measurement rows found in paste. Select Excel columns: Description, No, L, B, H (Quantity optional / ignored).",
      );
      return false;
    }
    const keptFormulas = pasted.some((r) =>
      ["num", "len", "brd", "hgt"].some((k) => {
        const v = r[k];
        return Boolean(
          v && !isNumericCell(v) && (isExprCell(v) || /[+\-*/()]/.test(v)),
        );
      }),
    );
    if (droppedUnresolvedCellRefs && !cellRefValuesFound) {
      setError(
        "Some cells are Excel references (e.g. G4863). With Show Formulas on, the browser often does not send their values. Fix: in Excel replace those refs with values (Paste Special → Values), or copy those cells with Show Formulas off. Arithmetic formulas like (10.4+8.2)/2 still paste correctly with Show Formulas on.",
      );
    } else if (!keptFormulas && pasted.some((r) => rowHasMeasurementData(r))) {
      setError(
        "Paste OK as values, but Excel did not include formulas in the clipboard. To keep formulas like =(10.4+8.2)/2: in Excel press Ctrl+` (Show Formulas), copy, paste here, then Ctrl+` again to turn it off.",
      );
    } else {
      setError("");
    }
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[measurements paste]", {
        formulasInClipboard,
        cellRefValuesFound,
        droppedUnresolvedCellRefs,
        htmlHasFmla: /fmla|Formula/i.test(html || ""),
        htmlHasNum: /(?:^|[^\w])num\s*=/i.test(html || ""),
        htmlLen: (html || "").length,
        plainLen: (text || "").length,
        sample: String(html || "").slice(0, 600),
      });
    }
    setRows((prev) => {
      const existing = (prev || []).filter(rowHasContent);
      const blank = { ...measurementRowBase, localId: uid() };
      return [...existing, ...pasted, blank];
    });
    return true;
  };

  const onPanelPaste = (e) => {
    const text = e.clipboardData?.getData("text/plain") || "";
    const html = e.clipboardData?.getData("text/html") || "";
    // Excel often exposes formulas here when HTML x:fmla is stripped by the browser
    let spreadsheetXml = "";
    try {
      const types = Array.from(e.clipboardData?.types || []);
      for (const type of types) {
        if (/xml|spreadsheet/i.test(type)) {
          const data = e.clipboardData.getData(type);
          if (data && /Formula|ss:Cell|<Cell/i.test(data)) {
            spreadsheetXml = data;
            break;
          }
        }
      }
      if (!spreadsheetXml) {
        spreadsheetXml =
          e.clipboardData.getData("Xml Spreadsheet") ||
          e.clipboardData.getData("application/xml") ||
          e.clipboardData.getData("text/xml") ||
          "";
      }
    } catch {
      spreadsheetXml = "";
    }
    if (!text && !html && !spreadsheetXml) return;
    // Multi-cell Excel paste uses tabs and/or multiple lines / HTML table
    const isMulti =
      text.includes("\t") ||
      text.includes("\n") ||
      text.includes("\r") ||
      /<table[\s>]/i.test(html) ||
      /<Cell\b/i.test(spreadsheetXml);
    if (!isMulti) return;
    e.preventDefault();
    applyExcelPaste(text, html, spreadsheetXml);
  };

  // Any typed content (used for auto-adding the next blank row)
  const rowHasContent = (r) =>
    r.desc.trim() ||
    r.num.trim() ||
    r.len.trim() ||
    r.brd.trim() ||
    r.hgt.trim();

  // Any No / L / B / H value present (empty dims → Quantity null)
  const rowHasMeasurementData = (r) =>
    Boolean(
      r.num.trim() || r.len.trim() || r.brd.trim() || r.hgt.trim(),
    );

  const openCommentModal = () => {
    const existing =
      item?.Comment != null ? String(item.Comment).slice(0, COMMENT_MAX_LEN) : "";
    setCommentText(existing);
    setCommentOpen(true);
    setError("");
  };

  const saveComment = async () => {
    if (!item?.WorkAbstractId) return;
    setSavingComment(true);
    setError("");
    try {
      const res = await axios.put(
        `${apiBase}/api/work-abstract/${item.WorkAbstractId}/comment`,
        { comment: commentText },
      );
      const saved =
        res.data?.data?.Comment ?? (commentText.trim() || null);
      if (typeof onCommentSaved === "function") {
        onCommentSaved(item.WorkAbstractId, saved);
      }
      setCommentOpen(false);
      alert("Comment saved successfully.");
    } catch (err) {
      setError(
        `Comment save failed: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setSavingComment(false);
    }
  };

  const saveAll = async () => {
    // Description-only rows are saved with NULL No/L/B/H/Quantity
    const toSave = rows.filter((r) => r.dirty && rowHasContent(r));
    if (!toSave.length) {
      setError("Nothing new to save.");
      return;
    }
    setError("");
    setSaving(true);

    let savedCount = 0;
    let failed = 0;
    let firstError = "";

    // Save sequentially so Sequence becomes 1, 2, 3… (not all 1)
    for (const row of toSave) {
      const dimsEmpty = rowDimsAllEmpty(row);
      const payload = {
        workAbstractId: item.WorkAbstractId,
        description: row.desc || "",
        number: dimsEmpty ? null : normalizeFormulaText(row.num) || null,
        length: dimsEmpty ? null : normalizeFormulaText(row.len) || null,
        breadth: dimsEmpty ? null : normalizeFormulaText(row.brd) || null,
        height: dimsEmpty ? null : normalizeFormulaText(row.hgt) || null,
        quantity: dimsEmpty ? null : row.qty,
      };
      try {
        if (row.id === null) {
          await axios.post(`${apiBase}/api/insert-work-measurements`, payload);
        } else {
          await axios.put(
            `${apiBase}/api/update-work-measurements/${row.id}`,
            payload,
          );
        }
        savedCount += 1;
      } catch (err) {
        failed += 1;
        if (!firstError) {
          firstError =
            err.response?.data?.message || err.message || "Save failed.";
        }
      }
    }

    if (savedCount > 0) {
      alert(`${savedCount} measurement(s) saved successfully.`);
      try {
        await reloadRows();
      } catch (reloadErr) {
        console.error("Failed to reload measurements:", reloadErr);
      }
      if (typeof onMeasurementsSaved === "function") {
        onMeasurementsSaved(item.WorkAbstractId);
      }
    }
    if (failed) {
      setError(`${failed} row(s) failed to save: ${firstError}`);
    }

    setSaving(false);
  };

  const total = (rows ?? []).reduce((sum, r) => {
    if (!rowHasMeasurementData(r)) return sum;
    const res = computeQty(r);
    return sum + (res.val ?? 0);
  }, 0);

  const s = {
    cell: {
      background: "#f4f8ff",
      padding: "14px 18px",
      borderBottom: "2px solid #c5d5ee",
      verticalAlign: "top",
    },
    colHdr: {
      fontSize: 10,
      color: "#8fa0b5",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      paddingBottom: 5,
    },
    inputBase: {
      fontSize: 13,
      padding: "5px 8px",
      height: 32,
      borderRadius: 6,
      border: "1px solid #c5d5ee",
      background: "#fff",
      color: "#24323f",
      width: "100%",
      boxSizing: "border-box",
    },
    smallInput: {
      fontSize: 12,
      padding: "5px 6px",
      height: 32,
      borderRadius: 6,
      border: "1px solid #c5d5ee",
      background: "#fff",
      color: "#24323f",
      width: "100%",
      minWidth: 110,
      boxSizing: "border-box",
      textAlign: "right",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    // Seq | drag | Description | No | L | B | H | = | Qty | delete
    rowGrid:
      "36px 28px minmax(180px,1.6fr) minmax(120px,1fr) minmax(120px,1fr) minmax(120px,1fr) minmax(120px,1fr) 22px 90px 30px",
    row: {
      display: "grid",
      gap: 6,
      alignItems: "center",
      marginBottom: 6,
      padding: "7px 10px",
      background: "#fff",
      border: "0.5px solid #b8d0f0",
      borderLeft: "3px solid #378ADD",
      borderRadius: "0 8px 8px 0",
    },
    rowDragging: {
      opacity: 0.55,
      borderLeft: "3px solid #EF9F27",
      background: "#fffdf5",
    },
    iconBtn: (color) => ({
      background: "none",
      border: "none",
      cursor: "pointer",
      color,
      fontSize: 15,
      padding: "3px 5px",
      borderRadius: 4,
      lineHeight: 1,
    }),
    saveAllBtn: {
      fontSize: 13,
      padding: "7px 18px",
      borderRadius: 7,
      border: "1px solid #2a7d4f",
      background: "#e6f4ea",
      color: "#2a7d4f",
      cursor: "pointer",
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
    },
    equalsSign: {
      fontSize: 14,
      color: "#9aafbf",
      textAlign: "center",
      userSelect: "none",
    },
    qtyDisplay: {
      fontSize: 13,
      fontWeight: 600,
      textAlign: "right",
      paddingRight: 4,
      color: "#24323f",
    },
    dragHandle: {
      cursor: "grab",
      color: "#8fa0b5",
      fontSize: 16,
      textAlign: "center",
      userSelect: "none",
      lineHeight: 1,
    },
    seqBadge: {
      fontSize: 12,
      fontWeight: 700,
      color: "#185FA5",
      textAlign: "center",
      fontFamily: "monospace",
    },
  };

  if (rows === null) {
    return (
      <tr>
        <td colSpan={8} style={{ ...s.cell, color: "#8fa0b5", fontSize: 13 }}>
          Loading measurements…
        </td>
      </tr>
    );
  }

  const dirtyCount = rows.filter(
    (r) => r.dirty && rowHasContent(r),
  ).length;

  return (
    <tr>
      <td colSpan={8} style={s.cell}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#3a6fbf",
              letterSpacing: "0.03em",
            }}
          >
            📐 MEASUREMENTS — Item #{item.ItemId} · {item.ItemNumber}
          </div>
          <button
            type="button"
            onClick={openCommentModal}
            title="Add Comment Max 500 Characters"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #9bb8e0",
              background: "#eef5ff",
              color: "#185FA5",
              cursor: "pointer",
            }}
          >
            Add Comment Max 500 Characters
          </button>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#5d6c7a",
            marginBottom: 10,
          }}
        >
          Paste from Excel: Description | No | L | B | H. Use{" "}
          <code>Ctrl+`</code> (Show Formulas) so arithmetic / ROUND formulas
          paste as text. Cell references (e.g. G4863) paste as their calculated
          value when Excel includes it. Hover a cell for full text. Quantity =
          No × L × B × H.
          {reordering ? " Updating sequence…" : ""}
        </div>

        {error && (
          <div
            style={{
              color: "#cc2222",
              fontSize: 12,
              marginBottom: 10,
              padding: "5px 10px",
              background: "#fff0f0",
              borderRadius: 6,
              border: "1px solid #f5c0c0",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{ overflowX: "auto", minWidth: 0 }}
          onPasteCapture={onPanelPaste}
          title="Click here and paste Excel rows (Ctrl+V)"
        >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: s.rowGrid,
            gap: 6,
            padding: "0 10px 4px",
            minWidth: 780,
          }}
        >
          <span style={{ ...s.colHdr, textAlign: "center" }}>Seq</span>
          <span />
          <span style={s.colHdr}>Description</span>
          <span style={{ ...s.colHdr, textAlign: "right" }}>No.</span>
          <span style={{ ...s.colHdr, textAlign: "right" }}>L</span>
          <span style={{ ...s.colHdr, textAlign: "right" }}>B</span>
          <span style={{ ...s.colHdr, textAlign: "right" }}>H</span>
          <span />
          <span style={{ ...s.colHdr, textAlign: "right" }}>Quantity</span>
          <span />
        </div>

        {rows.map((r, idx) => {
          const isSaved = r.id !== null;
          const contentIndex = rows
            .slice(0, idx + 1)
            .filter(rowHasContent).length;
          const displaySeq = rowHasContent(r) ? contentIndex : "";
          return (
            <div
              key={r.localId}
              onDragOver={(e) => {
                if (!isSaved || !dragLocalId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId =
                  e.dataTransfer.getData("text/plain") || dragLocalId;
                moveRow(fromId, r.localId);
                setDragLocalId(null);
              }}
              style={{
                ...s.row,
                gridTemplateColumns: s.rowGrid,
                minWidth: 780,
                ...(dragLocalId === r.localId ? s.rowDragging : null),
              }}
            >
              <span style={s.seqBadge}>{displaySeq || "—"}</span>
              <span
                draggable={isSaved && !reordering}
                onDragStart={(e) => {
                  if (!isSaved) return;
                  setDragLocalId(r.localId);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", r.localId);
                }}
                onDragEnd={() => setDragLocalId(null)}
                style={{
                  ...s.dragHandle,
                  cursor: isSaved ? "grab" : "default",
                  opacity: isSaved ? 1 : 0.25,
                }}
                title={
                  isSaved
                    ? "Drag to reorder"
                    : "Save row before reordering"
                }
              >
                ⠿
              </span>
              <input
                type="text"
                placeholder="Description (Optional)"
                value={r.desc}
                style={s.inputBase}
                onChange={(e) => updateField(r.localId, "desc", e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder=""
                value={r.num}
                title={r.num || "Number — figure or formula e.g. ROUND(12.5,2)"}
                style={s.smallInput}
                onChange={(e) => updateField(r.localId, "num", e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder=""
                value={r.len}
                title={r.len || "Length — figure or formula"}
                style={s.smallInput}
                onChange={(e) => updateField(r.localId, "len", e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder=""
                value={r.brd}
                title={r.brd || "Breadth — figure or formula"}
                style={s.smallInput}
                onChange={(e) => updateField(r.localId, "brd", e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder=""
                value={r.hgt}
                title={r.hgt || "Height — figure or formula"}
                style={s.smallInput}
                onChange={(e) => updateField(r.localId, "hgt", e.target.value)}
              />
              <span style={s.equalsSign}>=</span>
              <div
                style={{
                  ...s.qtyDisplay,
                  color: r.measErr ? "#cc2222" : "#24323f",
                }}
              >
                {r.measErr ? "Invalid" : r.qty !== null ? r.qty.toFixed(3) : "—"}
              </div>
              <button
                type="button"
                title={r.id !== null ? "Delete" : "Remove row"}
                disabled={deleting[r.localId]}
                style={s.iconBtn("#cc2222")}
                onClick={() => deleteRow(r.localId)}
              >
                🗑
              </button>
            </div>
          );
        })}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <button
            type="button"
            style={{
              ...s.saveAllBtn,
              opacity: dirtyCount === 0 ? 0.5 : 1,
              cursor: dirtyCount === 0 ? "default" : "pointer",
            }}
            disabled={saving || dirtyCount === 0}
            onClick={saveAll}
          >
            {saving
              ? "Saving…"
              : `✓ Save measurements${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </button>

          {rows.filter(rowHasMeasurementData).length > 0 && (
            <div
              style={{
                padding: "6px 14px",
                background: "#ddeeff",
                borderRadius: 8,
                display: "flex",
                gap: 16,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#185FA5" }}>Σ Total quantity</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#185FA5" }}>
                {total.toFixed(3)}
              </span>
            </div>
          )}
        </div>

        {commentOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(20, 30, 45, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000,
              padding: 16,
            }}
            onClick={() => !savingComment && setCommentOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Add Comment Max 500 Characters"
              style={{
                width: "100%",
                maxWidth: 480,
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #c5d5ee",
                boxShadow: "0 12px 40px rgba(36, 50, 63, 0.18)",
                padding: 20,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#24323f",
                  marginBottom: 4,
                }}
              >
                Add Comment Max 500 Characters
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#5d6c7a",
                  marginBottom: 12,
                }}
              >
                Item #{item.ItemId} · {item.ItemNumber}
              </div>
              <textarea
                value={commentText}
                onChange={(e) =>
                  setCommentText(e.target.value.slice(0, COMMENT_MAX_LEN))
                }
                maxLength={COMMENT_MAX_LEN}
                rows={5}
                placeholder="Enter comment for this checked item…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontSize: 13,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #c5d5ee",
                  color: "#24323f",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 6,
                  fontSize: 12,
                  color:
                    commentText.length >= COMMENT_MAX_LEN
                      ? "#cc2222"
                      : "#5d6c7a",
                }}
              >
                <span>
                  {commentText.length} / {COMMENT_MAX_LEN} characters
                </span>
                <span>
                  {COMMENT_MAX_LEN - commentText.length} remaining
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  disabled={savingComment}
                  onClick={() => setCommentOpen(false)}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "7px 14px",
                    borderRadius: 6,
                    border: "1px solid #c5d5ee",
                    background: "#fff",
                    color: "#5d6c7a",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingComment}
                  onClick={saveComment}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "7px 14px",
                    borderRadius: 6,
                    border: "1px solid #185FA5",
                    background: "#185FA5",
                    color: "#fff",
                    cursor: savingComment ? "default" : "pointer",
                    opacity: savingComment ? 0.7 : 1,
                  }}
                >
                  {savingComment ? "Saving…" : "Save Comment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

export default MeasurementPanel;
