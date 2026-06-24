/*************************************************************
 * ระบบตัดจ่ายค่าใช้จ่ายจ่ายล่วงหน้า (Prepaid Expense Amortization)
 * GL 11370010 — ค่าประกันภัยจ่ายล่วงหน้า | บริษัท พีทีจี โลจิสติกส์
 * Code.gs : config, menu, web app, อ่าน/เขียนข้อมูล, amortization engine
 *************************************************************/

const SS_ID = '18cw3wThMQsNk0Br3P_MNw2NdTBnF5F4zpkc7-_s8loM';
function ss_() {
  try { const a = SpreadsheetApp.getActive(); if (a) return a; } catch (e) {}
  return SpreadsheetApp.openById(SS_ID);
}

const SHEET_DATA   = 'Data';
const SHEET_CFG    = 'SAP_Config';
const SHEET_HIST   = 'Export_History';
const SHEET_LOG    = 'Audit_Log';
const TZ           = 'Asia/Bangkok';

const COL = {
  PostingDate:'วันที่ผ่านรายการ', DocDate:'วันที่ตามเอกสาร',
  DocNo:'เลขที่ DOC', DocRef:'เลขที่ เอกสาร', Desc:'รายการ', Plate:'ทะเบียนรถ',
  ExpenseGL:'GL', GLName:'GL-Name', CC:'Cost center', CCName:'Cost-Name', IO:'IO',
  Type:'ประเภทค่าเบี้ยประกัน', Start:'เริ่มต้น', End:'สิ้นสุด',
  Days:'Day', Total:'จำนวนเงิน', AmortPrior:'ตัดจ่ายเดือนก่อนหน้า',
  AmortCur:'ตัดจ่าย', Remain:'คงเหลือ'
};

const CAT_MAP = {
  '54610020':'ค่าเบี้ยประกันภัยรถยนต์',
  '54610030':'ค่าต่อทะเบียน/พรบ.รถ',
  '54320010':'ค่าเช่าจ่ายล่วงหน้า',
  '54520010':'ค่าบำรุงรักษา/สัญญา MA',
  '54710010':'ค่าธรรมเนียม/ใบอนุญาต',
  '54810010':'ค่าโฆษณา/ส่งเสริมการขาย'
};
function catOf(item) {
  const name = String(item[COL.GLName] || '').trim();
  if (name) return name;
  const gl = String(item[COL.ExpenseGL] || '').trim();
  return CAT_MAP[gl] || (gl ? 'GL ' + gl : 'อื่นๆ');
}

function norm_(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }
function colByNorm_() {
  const m = {}; Object.keys(COL).forEach(k => { m[norm_(COL[k])] = COL[k]; }); return m;
}
function canonHead_(h) { const n = norm_(h); return colByNorm_()[n] || String(h).trim(); }
function rowHasDoc_(row) { const t = norm_(COL.DocNo); return row.some(c => norm_(c) === t); }

const CFG = {
  company:'1022', docType:'SA', cur:'THB', taxBranch:'0000',
  bizType:'3001', payTerm:'Z000', vat:'VX', creditPC:'40000016',
  prepaidGL:'11370010', batch:900, alertEmail:'Tippawan.si@pt.co.th',
  alertMonths:1
};

var DASH_KEYS = ['doc','desc','plate','gl','cc','ccName','io','cat','start','end','total','accum','remain','monthAmt','remainMonths','status'];

// ===========================================================
// เมนู + Web App
// ===========================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙ ระบบตัดจ่าย')
    .addItem('เปิด Dashboard (URL)', 'showWebAppUrl')
    .addItem('คำนวณ Schedule ใหม่', 'rebuildAll')
    .addItem('ทดสอบส่งเมลแจ้งเตือน', 'checkAndNotify')
    .addItem('ติดตั้ง Trigger รายวัน', 'installDailyTrigger')
    .addToUi();
}

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Prepaid Amortization — ระบบตัดจ่ายจ่ายล่วงหน้า')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(f) { return HtmlService.createHtmlOutputFromFile(f).getContent(); }

function showWebAppUrl() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert('Web App URL:\n' + (url || 'ยัง deploy ไม่เสร็จ'));
}

// ===========================================================
// อ่านข้อมูล
// ===========================================================
function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

const HEADER_SCAN_ROWS = 20;
function findData_() {
  const ss = ss_();
  const sheets = ss.getSheets();
  const ordered = sheets.slice().sort((a, b) =>
    (a.getName() === SHEET_DATA ? -1 : 0) - (b.getName() === SHEET_DATA ? -1 : 0));
  for (let s = 0; s < ordered.length; s++) {
    const sh = ordered[s];
    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) continue;
    const scan = Math.min(lastRow, HEADER_SCAN_ROWS);
    const top = sh.getRange(1, 1, scan, lastCol).getValues();
    for (let i = 0; i < scan; i++) {
      if (rowHasDoc_(top[i])) return { sheet: sh, headerRow: i + 1 };
    }
  }
  return null;
}

function getData() {
  const f = findData_();
  if (!f) return [];
  const sh = f.sheet, hr = f.headerRow;
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow <= hr) return [];
  const head = sh.getRange(hr, 1, 1, lastCol).getValues()[0].map(canonHead_);
  const idxDoc = head.indexOf(COL.DocNo);
  if (idxDoc < 0) return [];
  const docCol = sh.getRange(hr + 1, idxDoc + 1, lastRow - hr, 1).getValues();
  let n = 0;
  for (let i = 0; i < docCol.length; i++) { if (docCol[i][0] !== '' && docCol[i][0] != null) n = i + 1; }
  if (n === 0) return [];
  const vals = sh.getRange(hr + 1, 1, n, lastCol).getValues();
  return vals.filter(r => r[idxDoc] !== '' && r[idxDoc] != null).map(r => {
    const o = {}; head.forEach((h, i) => o[h] = r[i]); return o;
  });
}

function dataDiag() {
  const ss = ss_();
  const f = findData_();
  let headers = '', sample = '', rawCount = 0;
  if (f) {
    headers = f.sheet.getRange(f.headerRow, 1, 1, f.sheet.getLastColumn()).getValues()[0].map(x => String(x)).join(' | ');
    const data = getData();
    rawCount = data.length;
    sample = data.length ? JSON.stringify(data[0], (k, v) => v instanceof Date ? String(v) : v) : '';
  }
  return { file: String(ss.getName()), fileId: String(ss.getId()),
    sheets: ss.getSheets().map(s => s.getName() + '(' + s.getLastRow() + '×' + s.getLastColumn() + ')'),
    found: !!f, dataSheet: f ? String(f.sheet.getName()) : '', headerRow: f ? f.headerRow : 0,
    headersRaw: String(headers), rawCount: rawCount, sampleRow: String(sample) };
}

function upsertRow(payload) {
  const f = findData_();
  if (!f) throw new Error('ไม่พบแท็บข้อมูล');
  const sh = f.sheet, hr = f.headerRow;
  const head = sh.getRange(hr, 1, 1, sh.getLastColumn()).getValues()[0].map(canonHead_);
  const idxDoc = head.indexOf(COL.DocNo);
  if (idxDoc < 0) throw new Error('ไม่พบคอลัมน์');
  const lastRow = sh.getLastRow();
  const values = lastRow > hr ? sh.getRange(hr + 1, 1, lastRow - hr, sh.getLastColumn()).getValues() : [];
  let rowIdx = -1;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idxDoc]).trim() === String(payload[COL.DocNo]).trim()) { rowIdx = hr + 1 + i; break; }
  }
  if (rowIdx === -1) {
    const arr = head.map(h => payload[h] !== undefined ? payload[h] : '');
    sh.getRange(hr + 1 + values.length, 1, 1, arr.length).setValues([arr]);
    logAudit('ADD', payload[COL.DocNo], '', JSON.stringify(payload));
  } else {
    const before = sh.getRange(rowIdx, 1, 1, head.length).getValues()[0];
    const arr = head.map((h, i) => payload[h] !== undefined ? payload[h] : before[i]);
    sh.getRange(rowIdx, 1, 1, arr.length).setValues([arr]);
    logAudit('EDIT', payload[COL.DocNo], JSON.stringify(before), JSON.stringify(arr));
  }
  cacheClearDash_();
  return { ok: true };
}

function deleteRow(docNo) {
  const f = findData_();
  if (!f) return { ok: false, msg: 'ไม่พบแท็บข้อมูล' };
  const sh = f.sheet, hr = f.headerRow;
  const head = sh.getRange(hr, 1, 1, sh.getLastColumn()).getValues()[0].map(canonHead_);
  const idxDoc = head.indexOf(COL.DocNo);
  const lastRow = sh.getLastRow();
  const values = lastRow > hr ? sh.getRange(hr + 1, 1, lastRow - hr, sh.getLastColumn()).getValues() : [];
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idxDoc]).trim() === String(docNo).trim()) {
      logAudit('DELETE', docNo, JSON.stringify(values[i]), '');
      sh.deleteRow(hr + 1 + i);
      cacheClearDash_();
      return { ok: true };
    }
  }
  return { ok: false, msg: 'ไม่พบ ' + docNo };
}

function logAudit(action, key, before, after) {
  const sh = sheet_(SHEET_LOG);
  if (sh.getLastRow() === 0) sh.appendRow(['เวลา', 'ผู้ใช้', 'การกระทำ', 'อ้างอิง', 'ก่อน', 'หลัง']);
  sh.appendRow([new Date(), Session.getActiveUser().getEmail(), action, key, before, after]);
}

// ===========================================================
// AMORTIZATION ENGINE
// ===========================================================
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { const x = new Date(d); return x.getFullYear() + '-' + pad2_(x.getMonth() + 1); }
function fmtDate_(d) {
  if (d === '' || d == null) return '';
  const x = new Date(d);
  return isNaN(x) ? String(d) : (x.getFullYear() + '-' + pad2_(x.getMonth() + 1) + '-' + pad2_(x.getDate()));
}

function buildSchedule(item) {
  const start = new Date(item[COL.Start]), end = new Date(item[COL.End]);
  if (isNaN(start) || isNaN(end)) return [];
  const totalDays = Number(item[COL.Days]) || (daysBetween(start, end) + 1);
  const total = Number(item[COL.Total]) || 0;
  const daily = total / totalDays;
  const rows = []; let accum = 0;
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const MAX_M = 120;
  let _m = 0;
  while (cur <= end && _m < MAX_M) { _m++;
    const mStart = new Date(Math.max(cur, start));
    const mEnd = new Date(Math.min(new Date(cur.getFullYear(), cur.getMonth() + 1, 0), end));
    const d = daysBetween(mStart, mEnd) + 1;
    const amt = round2(daily * d);
    rows.push({ period: ymd(cur), days: d, amount: amt });
    accum += amt;
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  if (rows.length) rows[rows.length - 1].amount = round2(rows[rows.length - 1].amount + (total - accum));
  return rows;
}

function summarize(item, asOfPeriod) {
  const sched = buildSchedule(item);
  const cut = asOfPeriod || (new Date().getFullYear() + '-' + pad2_(new Date().getMonth() + 1));
  const accum = sched.filter(s => s.period <= cut).reduce((a, s) => a + s.amount, 0);
  const total = Number(item[COL.Total]) || 0;
  const remainMonths = sched.filter(s => s.period > cut).length;
  return {
    total: round2(total), accum: round2(accum), remain: round2(total - accum),
    remainMonths, monthAmt: round2((sched.find(s => s.period === cut) || {}).amount || 0),
    status: remainMonths === 0 ? 'Completed' : remainMonths <= CFG.alertMonths ? 'Near-End' : 'Active',
    sched
  };
}

// ===========================================================
// Cache
// ===========================================================
function cacheGet_(key) {
  const c = CacheService.getScriptCache();
  const n = c.get(key + '__n'); if (!n) return null;
  const keys = []; for (let i = 0; i < +n; i++) keys.push(key + '__' + i);
  const got = c.getAll(keys); const parts = [];
  for (let i = 0; i < +n; i++) { const p = got[key + '__' + i]; if (p == null) return null; parts.push(p); }
  try { return JSON.parse(parts.join('')); } catch (e) { return null; }
}
function cachePut_(key, obj, sec) {
  const c = CacheService.getScriptCache();
  const s = JSON.stringify(obj), size = 90000, n = Math.ceil(s.length / size);
  if (n > 100) return;
  const map = { [key + '__n']: String(n) };
  for (let i = 0; i < n; i++) map[key + '__' + i] = s.substring(i * size, (i + 1) * size);
  c.putAll(map, sec);
}
function cacheClearDash_() {
  try { CacheService.getScriptCache().remove('dash_v2_' + new Date().getFullYear() + '-' + pad2_(new Date().getMonth() + 1) + '__n'); } catch(e) {}
}

// ===========================================================
// Dashboard
// ===========================================================
function getDashboard(period, force) {
  const now = new Date();
  const cut = period || (now.getFullYear() + '-' + pad2_(now.getMonth() + 1));
  const CACHE_VER = 2;
  const cacheKey = 'dash_v' + CACHE_VER + '_' + cut;
  if (!force) { const cached = cacheGet_(cacheKey); if (cached) { cached._cache = true; return cached; } }
  const f = findData_();
  const items = getData();
  let sumRemain = 0, sumMonth = 0, near = 0;
  const rows = items.map(it => {
    const s = summarize(it, cut);
    sumRemain += s.remain; sumMonth += s.monthAmt;
    if (s.status === 'Near-End') near++;
    return { doc: String(it[COL.DocNo] || ''), desc: String(it[COL.Desc] || ''),
      plate: String(it[COL.Plate] || ''), gl: String(it[COL.ExpenseGL] || ''),
      cc: String(it[COL.CC] || ''), ccName: String(it[COL.CCName] || ''),
      io: String(it[COL.IO] || ''), cat: catOf(it),
      start: fmtDate_(it[COL.Start]), end: fmtDate_(it[COL.End]),
      total: s.total, accum: s.accum, remain: s.remain,
      monthAmt: s.monthAmt, remainMonths: s.remainMonths, status: s.status };
  });
  const out = { period: cut, count: rows.length,
    sumRemain: round2(sumRemain), sumMonth: round2(sumMonth), near,
    rows: rows, keys: DASH_KEYS,
    diag: { dataSheet: f ? String(f.sheet.getName()) : '', headerRow: f ? f.headerRow : 0 } };
  try { cachePut_(cacheKey, out, 600); } catch (e) {}
  return out;
}

function getHistory() {
  const sh = sheet_(SHEET_HIST);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().reverse().map(r => [
    Utilities.formatDate(new Date(r[0]), TZ, 'dd.MM.yyyy HH:mm'), r[1], r[2], r[3], r[4], r[5]
  ]);
}

function rebuildAll() {
  const d = getDashboard();
  ss_().toast('คำนวณใหม่ ' + d.count + ' รายการ | คงเหลือรวม ' + d.sumRemain.toLocaleString(), 'เสร็จ', 5);
}
