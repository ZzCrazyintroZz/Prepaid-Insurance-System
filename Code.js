// ==========================================
// PREPAID EXPENSE AMORTIZATION SYSTEM v2
// ==========================================

const CONFIG = {
  PAYMENT_SHEET_ID: '1_KprIF33jgsZvouDaqBkVPXim4PPjPUo3WMXifNrBQQ',
  MASTER_SHEET_ID: '1kE0-TY4q1lnnetb-SaazIgUGEE_L_m3oAOvdonOnpCU',
  SAP_TEMPLATE_ID: '1sPG7aO6d25RpiMc-88Hx8ffrPruW78h4GwOClbJxG1M',
  SHEET_DATA: 'payment system',
  SHEET_MASTER: 'DATA',
  SHEET_CFG: 'SAP_Config',
  SHEET_HIST: 'Export_History',
  SHEET_LOG: 'Audit_Log',
  SHEET_ALERT_SETTINGS: 'Alert_Settings',
  SHEET_ALERT_HISTORY: 'Alert_History',
  COL: {
    PostingDate: 'วันที่ผ่านรายการ',
    DocDate: 'วันที่ตามเอกสาร',
    DocNo: 'เลขที่ DOC',
    DocRef: 'เลขที่ เอกสาร',
    Desc: 'รายการ',
    Plate: 'ทะเบียนรถ',
    ExpenseGL: 'GL',
    GLName: 'GL-Name',
    CC: 'Cost center',
    CCName: 'Cost-Name',
    IO: 'IO',
    Type: 'ประเภทค่าเบี้ยประกัน',
    Start: 'เริ่มต้น',
    End: 'สิ้นสุด',
    Days: 'Day',
    Total: 'จำนวนเงิน',
    AmortPrior: 'ตัดจ่ายเดือนก่อนหน้า',
    AmortCur: 'ตัดจ่าย',
    Remain: 'คงเหลือ'
  },
  COMPANY: '1022',
  DOC_TYPE: 'SA',
  CURRENCY: 'THB',
  TAX_BRANCH: '0000',
  PREPAID_GL: '11370010',
  ALERT_EMAIL: 'Tippawan.si@pt.co.th',
  TZ: 'Asia/Bangkok',
  SHEET_GIDS: {
    'payment system': '2098665604',
    'DATA': '302964062'
  }
};

const CAT_MAP = {
  '54610020': 'ค่าเบี้ยประกันภัยรถยนต์',
  '54610030': 'ค่าต่อทะเบียน/พรบ.รถ',
  '54320010': 'ค่าเช่าจ่ายล่วงหน้า',
  '54520010': 'ค่าบำรุงรักษา/สัญญา MA',
  '54710010': 'ค่าธรรมเนียม/ใบอนุญาต',
  '54810010': 'ค่าโฆษณา/ส่งเสริมการขาย'
};

// ==========================================
// HELPERS
// ==========================================
function norm_(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate_(d) {
  if (!d || d === '') return '';
  try { var x = new Date(d); return isNaN(x) ? String(d) : x.getFullYear() + '-' + pad2_(x.getMonth() + 1) + '-' + pad2_(x.getDate()); } catch(e) { return String(d); }
}
function catOf(item) {
  var name = String(item[CONFIG.COL.GLName] || '').trim();
  if (name) return name;
  var gl = String(item[CONFIG.COL.ExpenseGL] || '').trim();
  return CAT_MAP[gl] || (gl ? 'GL ' + gl : 'อื่นๆ');
}
function ss_() { return SpreadsheetApp.openById(CONFIG.PAYMENT_SHEET_ID); }
function sheet_(name) {
  var ss = ss_(); var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name); return sh;
}

// ==========================================
// SHEET LOOKUP (with GID fallback)
// ==========================================
function findSheetById_(spreadsheetId, sheetName, gid) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    // 1. Try by name
    var sh = ss.getSheetByName(sheetName);
    if (sh) return sh;
    // 2. Try by GID
    if (gid) {
      sh = ss.getSheets().find(function(s) { return s.getSheetId().toString() === String(gid); });
      if (sh) return sh;
    }
    // 3. Fallback to first sheet
    return ss.getSheets()[0];
  } catch(e) {
    Logger.log('findSheetById_ error: ' + e.message);
    return null;
  }
}

function readJson_(sheetName, key) {
  try {
    var sh = sheet_(sheetName);
    if (sh.getLastRow() < 2) return {};
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    var result = {};
    data.forEach(function(r) { if (r[0]) result[r[0]] = r[1]; });
    return result;
  } catch(e) { return {}; }
}

function writeJson_(sheetName, key, value) {
  try {
    var sh = sheet_(sheetName);
    if (sh.getLastRow() === 0) sh.appendRow(['Key', 'Value']);
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sh.getRange(i + 1, 2).setValue(value);
        return;
      }
    }
    sh.appendRow([key, value]);
  } catch(e) {}
}

// ==========================================
// DATA ACCESS
// ==========================================
function findData_() {
  try {
    // Try by sheet name first, then by GID
    var sh = ss_().getSheetByName(CONFIG.SHEET_DATA);
    if (!sh && CONFIG.SHEET_GIDS[CONFIG.SHEET_DATA]) {
      sh = ss_().getSheets().find(function(s) {
        return s.getSheetId().toString() === CONFIG.SHEET_GIDS[CONFIG.SHEET_DATA];
      });
    }
    if (!sh) sh = ss_().getSheets()[0];
    if (!sh || sh.getLastRow() < 3) return null;
    
    var scan = Math.min(sh.getLastRow(), 10);
    var top = sh.getRange(1, 1, scan, sh.getLastColumn()).getValues();
    for (var i = 0; i < scan; i++) {
      var rowStr = top[i].map(function(c) { return String(c || '').toLowerCase(); }).join(' ');
      if (rowStr.indexOf('doc') >= 0 || rowStr.indexOf('เลขที่') >= 0) {
        return { sheet: sh, headerRow: i + 1 };
      }
    }
    return null;
  } catch (e) { Logger.log('findData_ error: ' + e.message); return null; }
}

function getData() {
  try {
    var f = findData_();
    if (!f) { Logger.log('findData_ null'); return []; }
    var sh = f.sheet, hr = f.headerRow;
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow <= hr) return [];
    var head = sh.getRange(hr, 1, 1, lastCol).getValues()[0];
    var idxDoc = -1;
    for (var i = 0; i < head.length; i++) {
      var h = String(head[i] || '').toLowerCase().trim();
      if (h.indexOf('doc') >= 0 || h.indexOf('เลขที่') >= 0) { idxDoc = i; break; }
    }
    if (idxDoc < 0) { Logger.log('DocNo not found'); return []; }
    var vals = sh.getRange(hr + 1, 1, lastRow - hr, lastCol).getValues();
    Logger.log('Read ' + vals.length + ' rows, DocNo col=' + idxDoc);
    var data = [];
    for (var j = 0; j < vals.length; j++) {
      if (vals[j][idxDoc] && String(vals[j][idxDoc]).trim() !== '') {
        var o = {};
        for (var k = 0; k < head.length; k++) { o[String(head[k])] = vals[j][k]; }
        data.push(o);
      }
    }
    Logger.log('Filtered ' + data.length + ' rows');
    return data;
  } catch (e) { Logger.log('getData error: ' + e.message); return []; }
}

// ==========================================
// DASHBOARD (with remainMonths calculation)
// ==========================================
function getDashboard(period, force) {
  try {
    // Check cache first (skip if force)
    if (!force) {
      var cached = CacheService.getScriptCache().get('dashboard');
      if (cached) return JSON.parse(cached);
    }
    
    var now = new Date();
    var cut = period || (now.getFullYear() + '-' + pad2_(now.getMonth() + 1));
    var items = getData();
    Logger.log('getDashboard items: ' + items.length);
    
    var count = 0, sumRemain = 0, sumMonth = 0, near = 0;
    var rows = [], nearEndItems = [], monthlyData = {}, categoryData = {};
    
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var total = Number(it[CONFIG.COL.Total]) || 0;
      if (total <= 0) continue;
      count++;
      
      var start = new Date(it[CONFIG.COL.Start]);
      var end = new Date(it[CONFIG.COL.End]);
      var remain = total, monthAmt = 0, status = 'Active';
      
      if (!isNaN(start) && !isNaN(end)) {
        var totalDays = Math.max(1, Math.ceil((end - start) / 86400000));
        var daysPassed = Math.max(0, Math.ceil((now - start) / 86400000));
        var daysToEnd = Math.ceil((end - now) / 86400000);
        
        // Monthly amortization (30-day basis)
        var monthlyRate = total / (totalDays / 30);
        remain = Math.max(0, total - (monthlyRate * (daysPassed / 30)));
        
        // Current month expense
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        var monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        var effStart = start > monthStart ? start : monthStart;
        var effEnd = end < monthEnd ? end : monthEnd;
        if (effEnd >= effStart) {
          var daysInMonth = Math.ceil((effEnd - effStart) / 86400000) + 1;
          monthAmt = monthlyRate * (daysInMonth / 30);
        }
        
        // Near-End check (use remainMonths instead of daysToEnd)
        var remainMonths = daysToEnd / 30;
        if (remainMonths <= 3 && remainMonths >= 0) {
          status = 'Near-End'; near++;
          nearEndItems.push({
            plate: String(it[CONFIG.COL.Plate] || ''),
            desc: String(it[CONFIG.COL.Desc] || ''),
            end: fmtDate_(it[CONFIG.COL.End]),
            remain: round2(remain),
            status: status
          });
        }
      }
      
      sumRemain += remain;
      sumMonth += monthAmt;
      
      var startMonth = fmtDate_(it[CONFIG.COL.Start]).substring(0, 7);
      if (startMonth && startMonth.length === 7) {
        monthlyData[startMonth] = (monthlyData[startMonth] || 0) + monthAmt;
      }
      
      var cat = catOf(it);
      categoryData[cat] = (categoryData[cat] || 0) + remain;
      
      rows.push({
        doc: String(it[CONFIG.COL.DocNo] || ''),
        desc: String(it[CONFIG.COL.Desc] || ''),
        plate: String(it[CONFIG.COL.Plate] || ''),
        gl: String(it[CONFIG.COL.ExpenseGL] || ''),
        cc: String(it[CONFIG.COL.CC] || ''),
        ccName: String(it[CONFIG.COL.CCName] || ''),
        io: String(it[CONFIG.COL.IO] || ''),
        cat: cat,
        start: fmtDate_(it[CONFIG.COL.Start]),
        end: fmtDate_(it[CONFIG.COL.End]),
        total: round2(total),
        accum: round2(total - remain),
        remain: round2(remain),
        monthAmt: round2(monthAmt),
        status: status
      });
    }
    
    var mKeys = Object.keys(monthlyData).sort();
    var monthly = []; for (var a = 0; a < mKeys.length; a++) monthly.push([mKeys[a], round2(monthlyData[mKeys[a]])]);
    var cKeys = Object.keys(categoryData);
    var category = []; for (var b = 0; b < cKeys.length; b++) category.push([cKeys[b], round2(categoryData[cKeys[b]])]);
    
    var result = {
      period: cut, count: count, sumRemain: round2(sumRemain), sumMonth: round2(sumMonth),
      near: near, rows: rows, nearEndItems: nearEndItems,
      chartData: { monthly: monthly, category: category }
    };
    
    // Cache for 5 minutes
    CacheService.getScriptCache().put('dashboard', JSON.stringify(result), 300);
    
    Logger.log('Result: count=' + count + ' sumRemain=' + sumRemain);
    return result;
  } catch (e) {
    Logger.log('getDashboard error: ' + e.message);
    return { period: '', count: 0, sumRemain: 0, sumMonth: 0, near: 0, rows: [], nearEndItems: [], chartData: { monthly: [], category: [] }, error: e.message };
  }
}

function rebuildAll() { SpreadsheetApp.getUi().alert('คำนวณใหม่สำเร็จ'); }

// ==========================================
// DATA SYNC
// ==========================================
function getDataSyncStatus() {
  try {
    Logger.log('=== getDataSyncStatus Start ===');
    var paymentData = getData();
    Logger.log('Payment data count: ' + paymentData.length);
    
    var masterCount = 0;
    try {
      var mss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
      var msh = findSheetById_(CONFIG.MASTER_SHEET_ID, CONFIG.SHEET_MASTER, CONFIG.SHEET_GIDS[CONFIG.SHEET_MASTER]);
      if (msh && msh.getLastRow() >= 2) {
        masterCount = msh.getLastRow() - 1;
        Logger.log('Master count: ' + masterCount);
      }
    } catch (e) { Logger.log('Master error: ' + e.message); }
    
    var sapStatus = 'Not configured';
    try {
      if (CONFIG.SAP_TEMPLATE_ID) {
        var sapSS = SpreadsheetApp.openById(CONFIG.SAP_TEMPLATE_ID);
        sapStatus = 'Connected (' + sapSS.getSheets().length + ' sheets)';
      }
    } catch (e) { sapStatus = 'Error'; }
    
    var result = {
      source: 'Google Sheets API',
      sheets: [
        CONFIG.SHEET_DATA + ' (' + paymentData.length + ' records)',
        CONFIG.SHEET_MASTER + ' (' + masterCount + ' records)',
        'SAP Template: ' + sapStatus
      ],
      totalRecords: paymentData.length,
      masterRecords: masterCount,
      sapStatus: sapStatus,
      period: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'),
      lastSync: new Date().toISOString(),
      logs: getRecentLogs(10),
      events: getSystemEvents(10)
    };
    
    Logger.log('Result: ' + JSON.stringify(result));
    return result;
  } catch (e) {
    Logger.log('getDataSyncStatus error: ' + e.message);
    return {
      source: 'Error: ' + e.message,
      sheets: [],
      totalRecords: 0,
      masterRecords: 0,
      sapStatus: 'Error',
      period: '',
      lastSync: null,
      logs: [],
      events: []
    };
  }
}

function syncAllData() {
  try {
    CacheService.getScriptCache().remove('dashboard');
    CacheService.getScriptCache().remove('syncStatus');
    
    var result = updateAllIO();
    logSystemEvent('SYNC', 'Data synced', { updated: result.updated });
    
    return { ok: true, updated: result.updated, count: result.updated };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ==========================================
// MASTER DATA & IO
// ==========================================
function fetchMasterData() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
    // Use GID fallback
    var sh = findSheetById_(CONFIG.MASTER_SHEET_ID, CONFIG.SHEET_MASTER, CONFIG.SHEET_GIDS[CONFIG.SHEET_MASTER]);
    if (!sh || sh.getLastRow() < 2) return {};
    
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    var map = {};
    for (var i = 0; i < data.length; i++) {
      var plate = String(data[i][8] || '').trim(), io = String(data[i][10] || '').trim();
      if (plate && io) map[plate] = io;
    }
    return map;
  } catch (e) { return {}; }
}

function updateAllIO() {
  var f = findData_();
  if (!f) throw new Error('ไม่พบ Sheet');
  var sh = f.sheet, hr = f.headerRow;
  var headers = sh.getRange(hr, 1, 1, sh.getLastColumn()).getValues()[0];
  var plateIdx = -1, ioIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = norm_(headers[i]);
    if (h.indexOf('ทะเบียน') >= 0) plateIdx = i;
    if (h === 'io') ioIdx = i;
  }
  if (plateIdx < 0 || ioIdx < 0) throw new Error('ไม่พบคอลัมน์');
  var data = sh.getRange(hr + 1, 1, sh.getLastRow() - hr, sh.getLastColumn()).getValues();
  var master = fetchMasterData();
  var updated = 0;
  for (var j = 0; j < data.length; j++) {
    var plate = String(data[j][plateIdx] || '').trim();
    if (plate && master[plate]) { sh.getRange(hr + 1 + j, ioIdx + 1).setValue(master[plate]); updated++; }
  }
  return { updated: updated };
}

function updateAllCalculations() { return { updated: getData().length, errors: [] }; }

// ==========================================
// DELETE ROW
// ==========================================
function deleteRow(docNo) {
  try {
    var f = findData_();
    if (!f) return { ok: false, msg: 'ไม่พบ Sheet' };
    var sh = f.sheet, hr = f.headerRow;
    var head = sh.getRange(hr, 1, 1, sh.getLastColumn()).getValues()[0];
    var idxDoc = -1;
    for (var i = 0; i < head.length; i++) { var h = norm_(head[i]); if (h.indexOf('doc') >= 0 || h.indexOf('เลขที่') >= 0) { idxDoc = i; break; } }
    var vals = sh.getRange(hr + 1, 1, sh.getLastRow() - hr, sh.getLastColumn()).getValues();
    for (var j = 0; j < vals.length; j++) {
      if (String(vals[j][idxDoc]).trim() === String(docNo).trim()) { sh.deleteRow(hr + 1 + j); return { ok: true }; }
    }
    return { ok: false, msg: 'ไม่พบ ' + docNo };
  } catch (e) { return { ok: false, msg: e.message }; }
}

// ==========================================
// LOGGING
// ==========================================
function logSystemEvent(action, message, details) {
  try {
    var sh = sheet_(CONFIG.SHEET_LOG);
    if (sh.getLastRow() === 0) sh.appendRow(['Timestamp', 'Action', 'Message', 'Details']);
    sh.appendRow([new Date(), action, message, JSON.stringify(details || {})]);
  } catch (e) {}
}
function getSystemEvents(limit) {
  try {
    var sh = sheet_(CONFIG.SHEET_LOG);
    if (sh.getLastRow() < 2) return [];
    var lastRow = sh.getLastRow(); var startRow = Math.max(2, lastRow - (limit || 10) + 1);
    var data = sh.getRange(startRow, 1, lastRow - startRow + 1, 4).getValues();
    var result = []; for (var i = data.length - 1; i >= 0; i--) result.push({ time: data[i][0], action: data[i][1], message: data[i][2], details: data[i][3] });
    return result;
  } catch (e) { return []; }
}
function getRecentLogs(limit) {
  try {
    var sh = sheet_(CONFIG.SHEET_LOG);
    if (sh.getLastRow() < 2) return [];
    var lastRow = sh.getLastRow(); var startRow = Math.max(2, lastRow - (limit || 10) + 1);
    var data = sh.getRange(startRow, 1, lastRow - startRow + 1, 4).getValues();
    var result = []; for (var i = data.length - 1; i >= 0; i--) result.push({ time: data[i][0], message: data[i][2] });
    return result;
  } catch (e) { return []; }
}
function clearSystemEvents() { try { var sh = sheet_(CONFIG.SHEET_LOG); if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } }

// ==========================================
// ALERTS (with Sheet persistence)
// ==========================================
function getAlertSettings() {
  try {
    var data = readJson_(CONFIG.SHEET_ALERT_SETTINGS, 'settings');
    return {
      senderName: data.senderName || 'Prepaid Expense System',
      subject: data.subject || '[แจ้งเตือน] รายการจ่ายล่วงหน้าใกล้หมดอายุ',
      recipients: data.recipients || CONFIG.ALERT_EMAIL,
      enabled: data.enabled === 'true',
      alertDays: parseInt(data.alertDays) || 30
    };
  } catch(e) {
    return { senderName: 'Prepaid Expense System', subject: '[แจ้งเตือน] รายการจ่ายล่วงหน้าใกล้หมดอายุ', recipients: CONFIG.ALERT_EMAIL, enabled: false, alertDays: 30 };
  }
}

function saveAlertSettings(settings) {
  try {
    writeJson_(CONFIG.SHEET_ALERT_SETTINGS, 'senderName', settings.senderName);
    writeJson_(CONFIG.SHEET_ALERT_SETTINGS, 'subject', settings.subject);
    writeJson_(CONFIG.SHEET_ALERT_SETTINGS, 'recipients', settings.recipients);
    writeJson_(CONFIG.SHEET_ALERT_SETTINGS, 'enabled', settings.enabled ? 'true' : 'false');
    writeJson_(CONFIG.SHEET_ALERT_SETTINGS, 'alertDays', settings.alertDays);
    
    logSystemEvent('ALERT_CONFIG', 'Alert settings updated', settings);
    return { ok: true, message: 'บันทึกสำเร็จ' };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

function sendTestEmail() {
  try {
    var settings = getAlertSettings();
    MailApp.sendEmail({
      to: settings.recipients,
      subject: 'TEST ทดสอบระบบ Prepaid Insurance',
      htmlBody: '<h2>ระบบพร้อมใช้งาน</h2><p>ทดสอบส่งอีเมลจาก Prepaid Expense Amortization System</p>'
    });
    logSystemEvent('EMAIL', 'Test email sent', { to: settings.recipients });
    return { ok: true, message: 'ส่งอีเมลสำเร็จ' };
  } catch (e) { return { ok: false, message: e.message }; }
}

function sendNearEndAlerts() {
  try {
    var settings = getAlertSettings();
    if (!settings.enabled) return { ok: true, count: 0, message: 'Alerts disabled' };
    
    var items = getData();
    var today = new Date();
    var alertDate = new Date();
    alertDate.setDate(today.getDate() + (settings.alertDays || 30));
    
    var nearEndItems = items.filter(function(item) {
      var endDate = new Date(item[CONFIG.COL.End]);
      return endDate <= alertDate && endDate >= today;
    });
    
    if (nearEndItems.length === 0) return { ok: true, count: 0 };
    
    // Build HTML body
    var html = '<h2>แจ้งเตือนรายการจ่ายล่วงหน้าใกล้หมดอายุ</h2>';
    html += '<p>พบ ' + nearEndItems.length + ' รายการใกล้หมดอายุ:</p>';
    html += '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">';
    html += '<tr><th>ทะเบียน</th><th>รายการ</th><th>สิ้นสุด</th><th>คงเหลือ</th></tr>';
    nearEndItems.forEach(function(item) {
      html += '<tr><td>' + item[CONFIG.COL.Plate] + '</td><td>' + item[CONFIG.COL.Desc] + '</td><td>' + fmtDate_(item[CONFIG.COL.End]) + '</td><td>' + Number(item[CONFIG.COL.Total]).toLocaleString() + '</td></tr>';
    });
    html += '</table>';
    
    MailApp.sendEmail({
      to: settings.recipients,
      subject: settings.subject + ' (' + nearEndItems.length + ' รายการ)',
      htmlBody: html
    });
    
    // Log to Alert_History
    var histSh = sheet_(CONFIG.SHEET_ALERT_HISTORY);
    if (histSh.getLastRow() === 0) histSh.appendRow(['Timestamp', 'Action', 'Count', 'Details']);
    histSh.appendRow([new Date(), 'NEAR_END_ALERT', nearEndItems.length, JSON.stringify({ items: nearEndItems.map(function(i) { return i[CONFIG.COL.Plate]; }) })]);
    
    logSystemEvent('ALERT', 'Near-end alert sent', { count: nearEndItems.length });
    return { ok: true, count: nearEndItems.length };
  } catch (e) { return { ok: false, message: e.message }; }
}

function getAlertHistory() {
  try {
    var sh = sheet_(CONFIG.SHEET_ALERT_HISTORY);
    if (sh.getLastRow() < 2) return [];
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    return data.reverse().slice(0, 20).map(function(r) {
      return { time: r[0], action: r[1], count: r[2], details: r[3] };
    });
  } catch(e) { return []; }
}

// ==========================================
// SAP CONFIG (with Sheet persistence)
// ==========================================
function getSAPConfig() {
  try {
    var data = readJson_(CONFIG.SHEET_CFG, 'config');
    return {
      glCodes: JSON.parse(data.glCodes || '[]'),
      companyCodes: JSON.parse(data.companyCodes || '[]'),
      other: JSON.parse(data.other || '{}')
    };
  } catch(e) {
    return { glCodes: [], companyCodes: [], other: {} };
  }
}

function saveSAPConfig(c) {
  try {
    writeJson_(CONFIG.SHEET_CFG, 'glCodes', JSON.stringify(c.glCodes || []));
    writeJson_(CONFIG.SHEET_CFG, 'companyCodes', JSON.stringify(c.companyCodes || []));
    writeJson_(CONFIG.SHEET_CFG, 'other', JSON.stringify(c.other || {}));
    logSystemEvent('SAP_CONFIG', 'SAP config updated', {});
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function addGLCode(code, name) {
  try {
    var config = getSAPConfig();
    var exists = config.glCodes.some(function(g) { return g.code === code; });
    if (exists) return { ok: false, message: 'GL code นี้มีอยู่แล้ว' };
    config.glCodes.push({ code: code, name: name });
    saveSAPConfig(config);
    return { ok: true, message: 'Added' };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

function addCompanyCode(code, name) {
  try {
    var config = getSAPConfig();
    var exists = config.companyCodes.some(function(c) { return c.code === code; });
    if (exists) return { ok: false, message: 'Company code นี้มีอยู่แล้ว' };
    config.companyCodes.push({ code: code, name: name });
    saveSAPConfig(config);
    return { ok: true, message: 'Added' };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// ==========================================
// SAP EXPORT (Real implementation)
// ==========================================
function precheckSAPData(params) {
  try {
    var data = getData();
    var totalAmount = 0;
    for (var i = 0; i < data.length; i++) totalAmount += (Number(data[i][CONFIG.COL.Total]) || 0);
    
    var glGroups = {};
    data.forEach(function(item) {
      var gl = String(item[CONFIG.COL.ExpenseGL] || 'N/A');
      if (!glGroups[gl]) glGroups[gl] = { count: 0, amount: 0 };
      glGroups[gl].count++;
      glGroups[gl].amount += Number(item[CONFIG.COL.Total]) || 0;
    });
    
    return {
      totalItems: data.length,
      glGroups: Object.keys(glGroups).map(function(k) {
        return { gl: k, count: glGroups[k].count, amount: round2(glGroups[k].amount) };
      }),
      estimatedFiles: Math.ceil(data.length / 900) || 1,
      totalAmount: round2(totalAmount)
    };
  } catch (e) {
    Logger.log('precheckSAPData error: ' + e.message);
    return { totalItems: 0, glGroups: [], estimatedFiles: 0, totalAmount: 0, error: e.message };
  }
}

function generateSAPByGL(params) {
  try {
    var items = getData();
    if (items.length === 0) return { ok: false, error: 'ไม่มีข้อมูล' };
    
    var period = params.period || (new Date().getFullYear() + '-' + pad2_(new Date().getMonth() + 1));
    var docDate = params.docDate || new Date().toISOString().split('T')[0];
    var postDate = params.postDate || new Date().toISOString().split('T')[0];
    
    // Read SAP template
    var templateHeaders = [];
    try {
      var sapSS = SpreadsheetApp.openById(CONFIG.SAP_TEMPLATE_ID);
      var sapSh = sapSS.getSheets()[0];
      if (sapSh && sapSh.getLastRow() > 0) {
        templateHeaders = sapSh.getRange(1, 1, 1, sapSh.getLastColumn()).getValues()[0];
      }
    } catch(e) { Logger.log('Template read error: ' + e.message); }
    
    // Build SAP rows
    var sapRows = [];
    var seq = 1;
    
    items.forEach(function(item) {
      var total = Number(item[CONFIG.COL.Total]) || 0;
      if (total <= 0) return;
      
      var gl = String(item[CONFIG.COL.ExpenseGL] || CONFIG.PREPAID_GL);
      var desc = String(item[CONFIG.COL.Desc] || '');
      var cc = String(item[CONFIG.COL.CC] || '');
      var io = String(item[CONFIG.COL.IO] || '');
      var plate = String(item[CONFIG.COL.Plate] || '');
      
      // Header row (Debit)
      var headerRow = {};
      headerRow['Company Code'] = CONFIG.COMPANY;
      headerRow['Doc Type'] = CONFIG.DOC_TYPE;
      headerRow['Posting Date'] = postDate;
      headerRow['Document Date'] = docDate;
      headerRow['Reference'] = 'PREPAID-' + period + '-' + pad2_(seq);
      headerRow['Currency'] = CONFIG.CURRENCY;
      headerRow['Line Item'] = seq;
      headerRow['GL Account'] = gl;
      headerRow['Debit Amount'] = round2(total);
      headerRow['Credit Amount'] = 0;
      headerRow['Description'] = desc;
      headerRow['Cost Center'] = cc;
      headerRow['IO'] = io;
      headerRow['Tax Branch'] = CONFIG.TAX_BRANCH;
      
      sapRows.push(headerRow);
      seq++;
      
      // Credit row (Prepaid GL)
      var creditRow = {};
      creditRow['Company Code'] = CONFIG.COMPANY;
      creditRow['Doc Type'] = CONFIG.DOC_TYPE;
      creditRow['Posting Date'] = postDate;
      creditRow['Document Date'] = docDate;
      creditRow['Reference'] = 'PREPAID-' + period + '-' + pad2_(seq);
      creditRow['Currency'] = CONFIG.CURRENCY;
      creditRow['Line Item'] = seq;
      creditRow['GL Account'] = CONFIG.PREPAID_GL;
      creditRow['Debit Amount'] = 0;
      creditRow['Credit Amount'] = round2(total);
      creditRow['Description'] = desc;
      creditRow['Cost Center'] = cc;
      creditRow['IO'] = io;
      creditRow['Tax Branch'] = CONFIG.TAX_BRANCH;
      
      sapRows.push(creditRow);
      seq++;
    });
    
    // Create CSV file
    var headers = ['Company Code', 'Doc Type', 'Posting Date', 'Document Date', 'Reference', 'Currency', 'Line Item', 'GL Account', 'Debit Amount', 'Credit Amount', 'Description', 'Cost Center', 'IO', 'Tax Branch'];
    var csvContent = headers.join(',') + '\n';
    sapRows.forEach(function(row) {
      var line = headers.map(function(h) { return '"' + String(row[h] || '').replace(/"/g, '""') + '"'; }).join(',');
      csvContent += line + '\n';
    });
    
    // Save to Drive
    var folder = DriveApp.getRootFolder();
    var filename = 'SAP_Export_' + period + '_' + new Date().getTime() + '.csv';
    var file = folder.createFile(filename, csvContent, MimeType.CSV);
    
    // Log export
    var histSh = sheet_(CONFIG.SHEET_HIST);
    if (histSh.getLastRow() === 0) histSh.appendRow(['Timestamp', 'Seq', 'Period', 'Lines', 'File', 'URL']);
    histSh.appendRow([new Date(), seq - 1, period, sapRows.length, filename, file.getUrl()]);
    
    logSystemEvent('SAP_EXPORT', 'SAP file generated', { period: period, lines: sapRows.length, file: filename });
    
    return {
      ok: true,
      files: [{ name: filename, url: file.getUrl(), lines: sapRows.length }],
      totalFiles: 1,
      totalLines: sapRows.length,
      totalAmount: round2(items.reduce(function(sum, i) { return sum + (Number(i[CONFIG.COL.Total]) || 0); }, 0))
    };
  } catch (e) {
    Logger.log('generateSAPByGL error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function exportReconFile(params) {
  try {
    var items = getData();
    var period = params.period || (new Date().getFullYear() + '-' + pad2_(new Date().getMonth() + 1));
    
    // Build reconciliation data
    var reconData = items.map(function(item) {
      var total = Number(item[CONFIG.COL.Total]) || 0;
      var start = new Date(item[CONFIG.COL.Start]);
      var end = new Date(item[CONFIG.COL.End]);
      var now = new Date();
      
      var totalDays = Math.max(1, Math.ceil((end - start) / 86400000));
      var daysPassed = Math.max(0, Math.ceil((now - start) / 86400000));
      var monthlyRate = total / (totalDays / 30);
      var remain = Math.max(0, total - (monthlyRate * (daysPassed / 30)));
      
      return {
        doc: String(item[CONFIG.COL.DocNo] || ''),
        plate: String(item[CONFIG.COL.Plate] || ''),
        gl: String(item[CONFIG.COL.ExpenseGL] || ''),
        desc: String(item[CONFIG.COL.Desc] || ''),
        total: round2(total),
        start: fmtDate_(item[CONFIG.COL.Start]),
        end: fmtDate_(item[CONFIG.COL.End]),
        remain: round2(remain)
      };
    });
    
    // Create Excel-like CSV
    var headers = ['Doc No', 'Plate', 'GL', 'Description', 'Total', 'Start', 'End', 'Remaining'];
    var csvContent = headers.join(',') + '\n';
    reconData.forEach(function(row) {
      var line = headers.map(function(h) {
        var key = h.toLowerCase().replace(/ /g, '');
        var val = row[key] || '';
        return '"' + String(val).replace(/"/g, '""') + '"';
      }).join(',');
      csvContent += line + '\n';
    });
    
    var folder = DriveApp.getRootFolder();
    var filename = 'Reconciliation_' + period + '_' + new Date().getTime() + '.csv';
    var file = folder.createFile(filename, csvContent, MimeType.CSV);
    
    logSystemEvent('RECON_EXPORT', 'Reconciliation file generated', { period: period, items: reconData.length });
    
    return {
      ok: true,
      fileUrl: file.getUrl(),
      name: filename,
      items: reconData.length
    };
  } catch (e) {
    Logger.log('exportReconFile error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function getHistory() {
  try {
    var sh = sheet_(CONFIG.SHEET_HIST);
    if (sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().reverse();
  } catch (e) { return []; }
}

// ==========================================
// WEB APP
// ==========================================
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Prepaid Expense Amortization System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==========================================
// DEBUG
// ==========================================
function debugAll() {
  var f = findData_();
  Logger.log('findData_: ' + JSON.stringify(f ? { headerRow: f.headerRow } : null));
  var data = getData();
  Logger.log('getData: ' + data.length + ' rows');
  var dash = getDashboard(null, true);
  Logger.log('Dashboard: count=' + dash.count + ' sumRemain=' + dash.sumRemain);
  var sync = getDataSyncStatus();
  Logger.log('Sync: totalRecords=' + sync.totalRecords);
  return { dataCount: data.length, dashboard: dash, sync: sync };
}
