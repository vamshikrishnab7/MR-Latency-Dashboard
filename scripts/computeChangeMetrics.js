#!/usr/bin/env node
/**
 * Compute % change metrics across all ReconLatency .xlsx files in ../data.
 * Output JSON with counts and top positive/negative rows.
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const dataDir = path.resolve(process.cwd(), '../data');
if (!fs.existsSync(dataDir)) {
  console.error('Data directory not found:', dataDir);
  process.exit(1);
}

const files = fs.readdirSync(dataDir).filter(f => /\.xlsx$/i.test(f));
if (files.length === 0) {
  console.error('No .xlsx files found in', dataDir);
  process.exit(1);
}

const positive = [];
const negative = [];
let zeroCount = 0;
let processedRows = 0;

function normalizeChangeHeader(h) {
  return h.trim().toLowerCase().replace(/[%\s]/g, '');
}

for (const file of files) {
  const fullPath = path.join(dataDir, file);
  let wb;
  try {
    const buf = fs.readFileSync(fullPath);
    wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  } catch (e) {
    console.warn('Failed to read file', file, e.message);
    continue;
  }
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  if (!sheet) continue;
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  if (json.length === 0) continue;
  const headers = Object.keys(json[0] || {});
  const changeKey = headers.find(h => normalizeChangeHeader(h) === 'change');
  if (!changeKey) {
    console.warn('No % change column found in', file);
    continue;
  }
  for (const row of json) {
    let valRaw = row[changeKey];
    if (valRaw === '' || valRaw == null) continue;
    if (typeof valRaw === 'string') {
      valRaw = valRaw.trim();
    }
    // Remove trailing percent sign and spaces
    const num = typeof valRaw === 'number' ? valRaw : parseFloat(String(valRaw).replace(/%/g, ''));
    if (Number.isNaN(num)) continue;
    processedRows++;
    const entry = { file, sheet: firstSheetName, changeValue: num, row };
    if (num > 0) positive.push(entry);
    else if (num < 0) negative.push(entry);
    else zeroCount++;
  }
}

positive.sort((a, b) => b.changeValue - a.changeValue);
negative.sort((a, b) => a.changeValue - b.changeValue); // most negative first

const topPos = positive.slice(0, 3);
const topNeg = negative.slice(0, 3);

const summary = {
  filesProcessed: files.length,
  rowsWithChange: processedRows,
  positiveCount: positive.length,
  negativeCount: negative.length,
  zeroCount,
  topPositive: topPos.map(e => ({ file: e.file, value: e.changeValue, row: e.row })),
  topNegative: topNeg.map(e => ({ file: e.file, value: e.changeValue, row: e.row }))
};

console.log(JSON.stringify(summary, null, 2));