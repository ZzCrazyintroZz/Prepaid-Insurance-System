/**
 * Prepaid Expense Amortization System — Web App
 * Phase 2+ — Amortization Engine
 * Account: tippawan.si@pt.co.th
 */

// ================= CONFIGURATION =================
const CONFIG = {
  INPUT_SHEET_ID: '1vnzmnZtR9U5cQcSdpjY22mR30ULbgHd62JcfC50ZC20',
  INPUT_SHEET_NAME: 'payment system',
  SAP_TEMPLATE_ID: '1sPG7aO6d25RpiMc-88Hx8ffrPruW78h4GwOClbJxG1M',
  SAP_SHEET_NAME: '3 Cut off payment',
  MAX_LINES_PER_JE: 900
};

// ================= WEB APP =================
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  
  // Debug column checker
  if (p.action === 'check') {
    var result = checkColumns();
    return ContentService.createTextOutput(JSON.stringify(result, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Prepaid Expense Amortization System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================= HELPERS =================
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate_(d) {
  if (!d) return '';
  try { var x = new Date(d); return isNaN(x) ? '' : x.getFullYear() + '-' + pad2_(x.getMonth() + 1) + '-' + pad2_(x.getDate()); }
  catch(e) { return ''; }
}
function fmtMoney_(n) { return Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }

// ================= READ INPUT =================
function readInputData_() {
  const ss = SpreadsheetApp.openById(CONFIG.INPUT_SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.INPUT_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบ Sheet: ' + CONFIG.INPUT_SHEET_NAME);

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!String(row[3] || '').trim()) continue; // Col D = เลขที่ DOC

    rows.push({
      company:      String(row[0] || ''),     // A
      postingDate:  String(row[1] || ''),     // B
      docDate:      String(row[2] || ''),     // C
      docNo:        String(row[3] || ''),     // D
      docNo2:       String(row[4] || ''),     // E
      description:  String(row[5] || ''),     // F
      plate:        String(row[6] || ''),     // G
      io:           String(row[7] || ''),     // H
      glPrepaid:    String(row[8] || ''),     // I
      glName:       String(row[9] || ''),     // J
      costCenter:   String(row[10] || ''),    // K
      costName:     String(row[11] || ''),    // L
      startDate:    row[12],                   // M
      endDate:      row[13],                   // N
      amount:       Number(row[14]) || 0      // O
    });
  }
  return rows;
}

// ================= GET SUMMARY (Frontend) =================
function getInputSummary() {
  try {
    const items = readInputData_();
    return {
      ok: true,
      count: items.length,
      sample: items.slice(0, 5).map(function(it) { return {
        docNo: it.docNo,
        description: it.description,
        plate: it.plate,
        io: it.io,
        glPrepaid: it.glPrepaid,
        costCenter: it.costCenter,
        startDate: fmtDate_(it.startDate),
        endDate: fmtDate_(it.endDate),
        amount: it.amount
      }; }),
      sheetName: CONFIG.INPUT_SHEET_NAME,
      sheetId: CONFIG.INPUT_SHEET_ID.substring(0,8) + '...'
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= DEBUG: Check Columns =================
function checkColumns() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INPUT_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INPUT_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'Sheet not found' };
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { ok: false, error: 'No data' };
    const header = data[0];
    const firstRow = data[1];
    return {
      ok: true,
      headerCount: header.length,
      headers: header.map(function(h,i){ return String(h) + ' (col ' + String.fromCharCode(65+i) + ')'; }),
      sampleRow: [
        'A=' + String(firstRow[0] || '').substring(0,20),
        'M(start)=' + String(firstRow[12] || ''),
        'N(end)=' + String(firstRow[13] || ''),
        'O(amount)=' + String(firstRow[14] || '')
      ],
      totalRows: data.length
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= AMORTIZATION ENGINE =================
function calculateAmortization_(item, targetPeriod) {
  const start = new Date(item.startDate);
  const end = new Date(item.endDate);
  if (isNaN(start) || isNaN(end) || start > end) return [];

  const totalAmt = Number(item.amount) || 0;
  if (totalAmt <= 0) return [];

  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const ratePerDay = Math.round((totalAmt / totalDays) * 10000) / 10000;

  const results = [];
  let accumulated = 0;
  let current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const period = year + '-' + pad2_(month + 1);

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const overlapStart = (start > monthStart) ? start : monthStart;
    const overlapEnd = (end < monthEnd) ? end : monthEnd;

    const daysInMonth = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
    if (daysInMonth <= 0) { current = new Date(year, month + 1, 1); continue; }

    let amortAmount;
    if (overlapEnd.getTime() === end.getTime() && 
        Math.abs(daysInMonth * ratePerDay - (totalAmt - accumulated)) < 0.05) {
      amortAmount = Math.round((totalAmt - accumulated) * 100) / 100;
    } else {
      amortAmount = Math.round((daysInMonth * ratePerDay) * 100) / 100;
    }

    accumulated += amortAmount;
    if (accumulated > totalAmt && daysInMonth > 0) {
      amortAmount -= (accumulated - totalAmt);
      accumulated = totalAmt;
    }
    accumulated = Math.round(accumulated * 100) / 100;
    const remaining = Math.max(0, Math.round((totalAmt - accumulated) * 100) / 100);

    if (!targetPeriod || period === targetPeriod) {
      results.push({
        period: period, daysInMonth: daysInMonth, amortAmount: Math.round(amortAmount * 100) / 100,
        accumulated: accumulated, remaining: remaining,
        docNo: item.docNo, description: item.description, io: item.io,
        glPrepaid: item.glPrepaid, costCenter: item.costCenter, plate: item.plate
      });
    }

    if (remaining <= 0) break;
    if (targetPeriod && period === targetPeriod) break;
    current = new Date(year, month + 1, 1);
  }
  return results;
}

// ================= RUN AMORTIZATION =================
function runMonthEndAmortization(targetPeriod) {
  try {
    const items = readInputData_();
    let allSchedules = [], totalAmortAmount = 0, activeItems = 0;

    for (let i = 0; i < items.length; i++) {
      const schedule = calculateAmortization_(items[i], targetPeriod);
      if (schedule.length > 0) {
        allSchedules = allSchedules.concat(schedule);
        activeItems++;
        for (let j = 0; j < schedule.length; j++) totalAmortAmount += schedule[j].amortAmount;
      }
    }

    return {
      ok: true,
      message: 'คำนวณ ' + activeItems + ' รายการ (' + allSchedules.length + ' บรรทัด) — ยอดรวม ' + fmtMoney_(totalAmortAmount) + ' บาท',
      totalItems: items.length, activeItems: activeItems,
      scheduleRows: allSchedules.length,
      totalAmount: Math.round(totalAmortAmount * 100) / 100,
      sample: allSchedules.slice(0, 10)
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= WIDE FORMAT PIVOT =================
function pivotToWideFormat_(longData) {
  if (!longData || longData.length === 0) return {headers: [], rows: [], monthColumns: [], baseCount: 0};
  
  // Collect unique periods
  var periods = {};
  for (var i = 0; i < longData.length; i++) periods[longData[i].period] = true;
  var monthCols = Object.keys(periods).sort();
  
  // Group by doc
  var groups = {};
  for (var i = 0; i < longData.length; i++) {
    var r = longData[i];
    var key = r.docNo;
    if (!groups[key]) {
      groups[key] = {
        docNo: r.docNo, description: r.description || '', io: r.io || '',
        glPrepaid: r.glPrepaid || '', plate: r.plate || '',
        costCenter: r.costCenter || '', startDate: '', endDate: '',
        amount: 0, totalDays: 0, ratePerDay: 0,
        accumulated: 0, remaining: 0, monthly: {}
      };
    }
    var g = groups[key];
    g.monthly[r.period] = r.amortAmount;
    g.accumulated = r.accumulated;
    g.remaining = r.remaining;
    // Fill static fields from first/last entry
    if (!g.startDate || r.period < g.startDate) g.startDate = r.period;
    if (!g.endDate || r.period > g.endDate) g.endDate = r.period;
    g.amount = Math.max(g.amount, r.amortAmount + r.remaining); // estimate total
  }
  
  // Base columns
  var baseHeaders = ['Doc No', 'รายการ', 'IO', 'GL', 'ทะเบียน', 'Cost Center',
    'จำนวนเดือน', 'ยอดรวม', 'ค่าใช้จ่ายสะสม', 'มูลค่าคงเหลือ'];
  var headers = baseHeaders.concat(monthCols);
  
  var rows = [];
  var keys = Object.keys(groups);
  for (var k = 0; k < keys.length; k++) {
    var g = groups[keys[k]];
    var monthsActive = Object.keys(g.monthly).length;
    var row = [
      g.docNo, g.description, g.io, g.glPrepaid, g.plate, g.costCenter,
      monthsActive, Math.round(g.amount * 100) / 100,
      Math.round(g.accumulated * 100) / 100, Math.round(g.remaining * 100) / 100
    ];
    for (var m = 0; m < monthCols.length; m++) {
      row.push(g.monthly[monthCols[m]] || 0);
    }
    rows.push(row);
  }
  
  return {headers: headers, rows: rows, monthColumns: monthCols, baseCount: baseHeaders.length};
}

// ================= EXPORT TO SAP TEMPLATE =================
function exportWideToSheet(targetPeriod) {
  try {
    var items = readInputData_();
    var allLong = [];
    for (var i = 0; i < items.length; i++) {
      var sched = calculateAmortization_(items[i], targetPeriod);
      for (var j = 0; j < sched.length; j++) allLong.push(sched[j]);
    }
    if (allLong.length === 0) return {ok: false, error: 'No data calculated'};
    
    var pivot = pivotToWideFormat_(allLong);
    if (pivot.rows.length === 0) return {ok: false, error: 'No pivot data'};
    
    // Write to SAP Template sheet
    var ss = SpreadsheetApp.openById(CONFIG.SAP_TEMPLATE_ID);
    var sheet = ss.getSheetByName(CONFIG.SAP_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SAP_SHEET_NAME);
    } else {
      sheet.clear();
    }
    
    // Headers
    sheet.getRange(1, 1, 1, pivot.headers.length).setValues([pivot.headers]);
    sheet.getRange(1, 1, 1, pivot.headers.length).setFontWeight('bold');
    
    // Data
    if (pivot.rows.length > 0) {
      sheet.getRange(2, 1, pivot.rows.length, pivot.rows[0].length).setValues(pivot.rows);
    }
    
    // 🟦 Blue highlight for monthly columns
    if (pivot.monthColumns.length > 0) {
      var startCol = pivot.baseCount + 1;
      sheet.getRange(1, startCol, pivot.rows.length + 1, pivot.monthColumns.length)
        .setBackground('#cfe2f3');
    }
    
    // Auto-resize
    sheet.autoResizeColumns(1, Math.min(pivot.headers.length, 20));
    
    return {
      ok: true,
      message: 'Export ' + pivot.rows.length + ' รายการ (' + pivot.monthColumns.length + ' เดือน) ไปยัง Sheet ' + CONFIG.SAP_SHEET_NAME,
      rows: pivot.rows.length,
      months: pivot.monthColumns.length
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function getWidePreview(targetPeriod) {
  try {
    var items = readInputData_();
    var allLong = [];
    for (var i = 0; i < Math.min(items.length, 50); i++) { // preview 50 items max
      var sched = calculateAmortization_(items[i], targetPeriod);
      for (var j = 0; j < sched.length; j++) allLong.push(sched[j]);
    }
    if (allLong.length === 0) return {ok: false, error: 'No data'};
    var pivot = pivotToWideFormat_(allLong);
    return {
      ok: true,
      headers: pivot.headers,
      rows: pivot.rows.slice(0, 20), // preview first 20
      monthColumns: pivot.monthColumns,
      baseCount: pivot.baseCount,
      totalRows: pivot.rows.length,
      totalMonths: pivot.monthColumns.length
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ================= SAP JOURNAL ENTRY GENERATOR =================
/**
 * Generate JE lines from amortization schedule
 * Debit: Key=40, GL=IO
 * Credit: Key=50, GL=GL (from input)
 * Batching: MAX_LINES_PER_JE per document
 */
function generateSAPJE_(scheduleData, params) {
  params = params || {};
  var company = params.company || '1022';
  var docType = params.docType || 'SA';
  var currency = params.currency || 'THB';
  var prepaidGL = params.prepaidGL || '11370010';
  var maxLines = Number(params.maxLinesPerJE) || CONFIG.MAX_LINES_PER_JE;
  var postDate = params.postDate || '';
  var docDate = params.docDate || '';
  var period = '';
  
  var now = new Date();
  if (!postDate) postDate = Utilities.formatDate(now, 'Asia/Bangkok', 'dd.MM.yyyy');
  if (!docDate) docDate = postDate;
  
  var documents = [];
  var currentDoc = [];
  var lineCount = 0;
  var docSeq = 1;
  var globalLine = 1;
  var totalDebit = 0, totalCredit = 0;
  
  for (var i = 0; i < scheduleData.length; i++) {
    var s = scheduleData[i];
    if (!period && s.period) period = s.period;
    var amt = Number(s.amortAmount) || 0;
    if (amt <= 0) continue;
    
    // Check if we need a new document
    if (lineCount + 2 > maxLines) {
      documents.push({doc: docSeq, lines: currentDoc, debitTotal: totalDebit, creditTotal: totalCredit});
      currentDoc = [];
      lineCount = 0;
      docSeq++;
      totalDebit = 0;
      totalCredit = 0;
    }
    
    var ref = 'SAP-' + (period || 'PREPAID') + '-' + String(docSeq).padStart(3, '0');
    var lineItem = lineCount + 1;
    
    // Debit line (Key=40, GL=IO)
    var io = s.io || CONFIG.prepaidGL || '11370010';
    currentDoc.push({
      company: company, docType: docType, postDate: postDate, docDate: docDate,
      ref: ref, currency: currency, lineItem: lineItem,
      glAccount: io, debit: amt, credit: 0,
      description: String(s.description || '').substring(0, 50),
      costCenter: s.costCenter || '', io: io, key: '40', taxBranch: '0000'
    });
    totalDebit += amt;
    lineCount++;
    
    // Credit line (Key=50, GL=GL from input)
    var gl = s.glPrepaid || CONFIG.prepaidGL || '11370010';
    lineItem = lineCount + 1;
    currentDoc.push({
      company: company, docType: docType, postDate: postDate, docDate: docDate,
      ref: ref, currency: currency, lineItem: lineItem,
      glAccount: gl, debit: 0, credit: amt,
      description: String(s.description || '').substring(0, 50),
      costCenter: s.costCenter || '', io: io, key: '50', taxBranch: '0000'
    });
    totalCredit += amt;
    lineCount++;
  }
  
  // Push last document
  if (currentDoc.length > 0) {
    documents.push({doc: docSeq, lines: currentDoc, debitTotal: totalDebit, creditTotal: totalCredit});
  }
  
  return {
    documents: documents,
    totalDocs: documents.length,
    totalLines: documents.reduce(function(acc, d) { return acc + d.lines.length; }, 0),
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100
  };
}

function exportSAPJE(targetPeriod) {
  try {
    var items = readInputData_();
    var allSched = [];
    for (var i = 0; i < items.length; i++) {
      var sched = calculateAmortization_(items[i], targetPeriod);
      for (var j = 0; j < sched.length; j++) allSched.push(sched[j]);
    }
    if (allSched.length === 0) return {ok: false, error: 'No data calculated'};
    
    // Get settings
    var props = PropertiesService.getScriptProperties();
    var settings = {company:'1022', docType:'SA', currency:'THB', prepaidGL:'11370010', maxLinesPerJE:900};
    try {
      var saved = JSON.parse(props.getProperty('settings') || '{}');
      for (var k in saved) settings[k] = saved[k];
    } catch(e) {}
    
    var now = new Date();
    var postDate = Utilities.formatDate(now, 'Asia/Bangkok', 'dd.MM.yyyy');
    var docDate = postDate;
    var period = targetPeriod || (now.getFullYear() + '-' + (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1));
    
    var jeResult = generateSAPJE_(allSched, {
      company: settings.company, docType: settings.docType,
      currency: settings.currency, prepaidGL: settings.prepaidGL,
      maxLinesPerJE: settings.maxLinesPerJE,
      postDate: postDate, docDate: docDate
    });
    
    if (jeResult.documents.length === 0) return {ok: false, error: 'No JE generated'};
    
    // Write to sheet
    var ss = SpreadsheetApp.openById(CONFIG.SAP_TEMPLATE_ID);
    var sheet = ss.getSheetByName('SAP_JE_' + (targetPeriod || 'ALL'));
    if (!sheet) {
      sheet = ss.insertSheet('SAP_JE_' + (targetPeriod || 'ALL'));
    } else {
      sheet.clear();
    }
    
    var jeHeaders = ['Company', 'Doc Type', 'Posting Date', 'Document Date', 'Reference',
      'Currency', 'Line Item', 'GL Account', 'Debit', 'Credit', 'Description',
      'Cost Center', 'IO', 'Key', 'Tax Branch'];
    
    var jeRows = [];
    for (var d = 0; d < jeResult.documents.length; d++) {
      var doc = jeResult.documents[d];
      for (var l = 0; l < doc.lines.length; l++) {
        var line = doc.lines[l];
        jeRows.push([
          line.company, line.docType, line.postDate, line.docDate, line.ref,
          line.currency, line.lineItem, line.glAccount,
          line.debit > 0 ? Math.round(line.debit * 100) / 100 : '',
          line.credit > 0 ? Math.round(line.credit * 100) / 100 : '',
          line.description, line.costCenter, line.io, line.key, line.taxBranch
        ]);
      }
      // Add blank separator row between documents
      if (d < jeResult.documents.length - 1) {
        jeRows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      }
    }
    
    // Write all data
    sheet.getRange(1, 1, 1, jeHeaders.length).setValues([jeHeaders]);
    sheet.getRange(1, 1, 1, jeHeaders.length).setFontWeight('bold');
    sheet.getRange(2, 1, jeRows.length, jeHeaders.length).setValues(jeRows);
    sheet.autoResizeColumns(1, jeHeaders.length);
    
    // Create .xlsx in Drive
    var folder = DriveApp.getRootFolder();
    var xlsxName = 'SAP_JE_' + (targetPeriod || 'ALL') + '_' + new Date().getTime() + '.xlsx';
    var xlsxUrl = '';
    try {
      // Make a copy of the sheet and export as xlsx
      var tempSs = ss.copy('Temp_JE_' + new Date().getTime());
      var tempSheet = tempSs.getSheets()[0];
      tempSheet.setName('SAP_JE');
      // Get the blob
      var xlsxBlob = tempSs.getAs('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      xlsxBlob.setName(xlsxName);
      var xlsxFile = folder.createFile(xlsxBlob);
      xlsxUrl = xlsxFile.getUrl();
      // Delete temp file
      DriveApp.getFileById(tempSs.getId()).setTrashed(true);
    } catch(e) {
      Logger.log('XLSX error: ' + e.message);
      xlsxUrl = ss.getUrl();
    }
    
    return {
      ok: true,
      message: 'สร้าง ' + jeResult.totalDocs + ' เอกสาร (' + jeResult.totalLines + ' บรรทัด) — Dr=' + fmtMoney_(jeResult.totalDebit) + ' = Cr=' + fmtMoney_(jeResult.totalCredit),
      totalDocs: jeResult.totalDocs,
      totalLines: jeResult.totalLines,
      totalDebit: jeResult.totalDebit,
      totalCredit: jeResult.totalCredit,
      sheetUrl: ss.getUrl(),
      xlsxUrl: xlsxUrl,
      sample: jeResult.documents.slice(0, 2)
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function getSAPJEPreview(targetPeriod) {
  try {
    var items = readInputData_();
    var allSched = [];
    for (var i = 0; i < Math.min(items.length, 30); i++) { // preview 30 items
      var sched = calculateAmortization_(items[i], targetPeriod);
      for (var j = 0; j < sched.length; j++) allSched.push(sched[j]);
    }
    if (allSched.length === 0) return {ok: false, error: 'No data'};
    
    var settings = {company:'1022', docType:'SA', currency:'THB', prepaidGL:'11370010', maxLinesPerJE:900};
    var jeResult = generateSAPJE_(allSched, settings);
    
    return {
      ok: true,
      sample: jeResult.documents.slice(0, 3),
      totalDocs: '~' + Math.ceil(allSched.length / (CONFIG.MAX_LINES_PER_JE / 2)),
      totalLines: jeResult.totalLines
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ================= DASHBOARD DATA =================
function getDashboardData() {
  try {
    var cacheKey = 'dash_data';
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.trend) return parsed;
    }
    
    var items = readInputData_();
    var trendMap = {};
    var glMap = {};
    var now = new Date();
    var currentPeriod = now.getFullYear() + '-' + pad2_(now.getMonth() + 1);
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var schedule = calculateAmortization_(item, null);
      for (var j = 0; j < schedule.length; j++) {
        var s = schedule[j];
        // Trend: aggregate all periods
        trendMap[s.period] = (trendMap[s.period] || 0) + s.amortAmount;
        // GL breakdown: current period only
        if (s.period === currentPeriod) {
          var gl = s.glPrepaid || 'N/A';
          glMap[gl] = (glMap[gl] || 0) + s.amortAmount;
        }
      }
    }
    
    // Sort periods
    var periods = Object.keys(trendMap).sort();
    var trend = [];
    for (var p = 0; p < periods.length; p++) {
      trend.push({period: periods[p], amount: Math.round(trendMap[periods[p]] * 100) / 100});
    }
    
    // Sort GL by amount desc
    var glKeys = Object.keys(glMap).sort(function(a,b){ return glMap[b] - glMap[a]; });
    var glBreakdown = [];
    for (var g = 0; g < glKeys.length; g++) {
      glBreakdown.push({gl: glKeys[g], amount: Math.round(glMap[glKeys[g]] * 100) / 100});
    }
    
    var totalAmt = 0;
    for (var t = 0; t < trend.length; t++) totalAmt += trend[t].amount;
    
    var result = {
      ok: true,
      totalItems: items.length,
      currentPeriod: currentPeriod,
      totalAmortization: Math.round(totalAmt * 100) / 100,
      trend: trend,
      glBreakdown: glBreakdown,
      scheduleRows: trend.length > 0 ? 'calculated' : 'none'
    };
    
    // Cache 5 min
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 300); } catch(e) {}
    
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= SETTINGS =================
function getSettings() {
  try {
    var props = PropertiesService.getScriptProperties();
    var defaults = {
      company: '1022',
      docType: 'SA',
      currency: 'THB',
      prepaidGL: '11370010',
      rounding: '4dec',       // 'full' or '4dec'
      maxLinesPerJE: 900,
      currentPeriod: ''
    };
    var saved = props.getProperty('settings');
    if (saved) {
      var parsed = JSON.parse(saved);
      for (var k in defaults) {
        if (parsed[k] === undefined) parsed[k] = defaults[k];
      }
      return { ok: true, settings: parsed };
    }
    return { ok: true, settings: defaults };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function saveSettings(settings) {
  try {
    PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(settings));
    return { ok: true, message: 'Settings saved' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= VOID / TERMINATE =================

/**
 * Get list of all active doc numbers (for dropdown)
 */
function getDocList() {
  try {
    var items = readInputData_();
    var docMap = {};
    for (var i = 0; i < items.length; i++) {
      var doc = items[i].docNo || '';
      if (doc && !docMap[doc]) {
        docMap[doc] = { docNo: doc, description: items[i].description, plate: items[i].plate };
      }
    }
    var list = [];
    for (var d in docMap) list.push(docMap[d]);
    list.sort(function(a,b){ return a.docNo.localeCompare(b.docNo); });
    return { ok: true, list: list };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get document detail + remaining balance for void calculation
 */
function getDocDetail(docNo) {
  try {
    if (!docNo) return { ok: false, error: 'กรุณาระบุเลขที่ DOC' };
    var items = readInputData_();
    var matched = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].docNo === docNo) { matched = items[i]; break; }
    }
    if (!matched) return { ok: false, error: 'ไม่พบเอกสาร: ' + docNo };
    
    // Calculate full amortization schedule to get remaining balance
    var fullSchedule = calculateAmortization_(matched, null);
    var lastRow = fullSchedule.length > 0 ? fullSchedule[fullSchedule.length - 1] : null;
    var remaining = lastRow ? lastRow.remaining : (matched.amount || 0);
    var amortized = lastRow ? lastRow.accumulated : 0;
    
    return {
      ok: true,
      docNo: matched.docNo,
      description: matched.description,
      plate: matched.plate,
      io: matched.io,
      glPrepaid: matched.glPrepaid,
      costCenter: matched.costCenter,
      amount: matched.amount,
      startDate: fmtDate_(matched.startDate),
      endDate: fmtDate_(matched.endDate),
      amortized: Math.round(amortized * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
      scheduleRows: fullSchedule.length,
      schedule: fullSchedule.slice(0, 5) // first 5 rows preview
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Execute void/terminate
 * @param {Object} params - { docNo, voidDate, type: 'refund'|'loss', lossGL }
 */
function voidPrepaid(params) {
  try {
    if (!params || !params.docNo) return { ok: false, error: 'กรุณาระบุเลขที่ DOC' };
    var docNo = params.docNo;
    var voidDate = params.voidDate || '';
    var type = params.type || 'refund'; // 'refund' or 'loss'
    var lossGL = params.lossGL || '51990010'; // Default loss GL
    
    // Get document detail with remaining balance
    var detail = getDocDetail(docNo);
    if (!detail.ok) return detail;
    
    var remaining = detail.remaining;
    if (remaining <= 0) return { ok: false, error: 'เอกสาร ' + docNo + ' ถูกตัดจ่ายครบแล้ว (เหลือ ' + remaining + ')' };
    
    // Format dates
    var now = new Date();
    var postDate = voidDate ? formatDateForSAP_(voidDate) : Utilities.formatDate(now, 'Asia/Bangkok', 'dd.MM.yyyy');
    var docDate = postDate;
    if (!voidDate) {
      voidDate = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd');
    }
    
    // Get settings for company/docType
    var props = PropertiesService.getScriptProperties();
    var settings = {company:'1022', docType:'SA', currency:'THB', prepaidGL:'11370010'};
    try {
      var saved = JSON.parse(props.getProperty('settings') || '{}');
      for (var k in saved) settings[k] = saved[k];
    } catch(e) {}
    
    var ref = 'VOID-' + docNo + '-' + new Date().getTime().toString().slice(-6);
    var period = '';
    var periodMatch = voidDate.match(/^(\d{4})-(\d{2})/);
    if (periodMatch) period = periodMatch[1] + '-' + periodMatch[2];
    
    // Build VOID JE lines
    var lines = [];
    var io = detail.io || settings.prepaidGL || '11370010';
    var gl = detail.glPrepaid || settings.prepaidGL || '11370010';
    
    if (type === 'refund') {
      // REFUND: Dr = GL (Key 50, credit side reversal), Cr = IO (Key 40)
      // Accounting: Reverse the remaining prepaid balance
      // Dr: Expense/Asset reversal GL - debit the GL that will receive the refund
      // Cr: IO (prepaid account) - credit to clear the prepaid
      lines.push({
        company: settings.company, docType: settings.docType,
        postDate: postDate, docDate: docDate,
        ref: ref, currency: settings.currency, lineItem: 1,
        glAccount: gl, debit: Math.round(remaining * 100) / 100, credit: 0,
        description: 'VOID-REFUND ' + docNo + ' ' + String(detail.description || '').substring(0, 35),
        costCenter: detail.costCenter || '', io: io, key: '40', taxBranch: '0000'
      });
      lines.push({
        company: settings.company, docType: settings.docType,
        postDate: postDate, docDate: docDate,
        ref: ref, currency: settings.currency, lineItem: 2,
        glAccount: io, debit: 0, credit: Math.round(remaining * 100) / 100,
        description: 'VOID-REFUND ' + docNo + ' ' + String(detail.description || '').substring(0, 35),
        costCenter: detail.costCenter || '', io: io, key: '50', taxBranch: '0000'
      });
    } else {
      // LOSS: Dr = Loss GL (expense), Cr = IO (prepaid)
      // Write off the remaining prepaid as loss/expense
      lines.push({
        company: settings.company, docType: settings.docType,
        postDate: postDate, docDate: docDate,
        ref: ref, currency: settings.currency, lineItem: 1,
        glAccount: lossGL, debit: Math.round(remaining * 100) / 100, credit: 0,
        description: 'VOID-LOSS ' + docNo + ' ' + String(detail.description || '').substring(0, 35),
        costCenter: detail.costCenter || '', io: io, key: '50', taxBranch: '0000'
      });
      lines.push({
        company: settings.company, docType: settings.docType,
        postDate: postDate, docDate: docDate,
        ref: ref, currency: settings.currency, lineItem: 2,
        glAccount: io, debit: 0, credit: Math.round(remaining * 100) / 100,
        description: 'VOID-LOSS ' + docNo + ' ' + String(detail.description || '').substring(0, 35),
        costCenter: detail.costCenter || '', io: io, key: '40', taxBranch: '0000'
      });
    }
    
    // Write to sheet
    var ss = SpreadsheetApp.openById(CONFIG.SAP_TEMPLATE_ID);
    var sheetName = 'VOID_JE_' + docNo.replace(/[\/\\:*?<>|]/g, '_');
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear();
    }
    
    var jeHeaders = ['Company', 'Doc Type', 'Posting Date', 'Document Date', 'Reference',
      'Currency', 'Line Item', 'GL Account', 'Debit', 'Credit', 'Description',
      'Cost Center', 'IO', 'Key', 'Tax Branch'];
    
    var jeRows = [];
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      jeRows.push([
        line.company, line.docType, line.postDate, line.docDate, line.ref,
        line.currency, line.lineItem, line.glAccount,
        line.debit > 0 ? line.debit : '',
        line.credit > 0 ? line.credit : '',
        line.description, line.costCenter, line.io, line.key, line.taxBranch
      ]);
    }
    
    sheet.getRange(1, 1, 1, jeHeaders.length).setValues([jeHeaders]);
    sheet.getRange(1, 1, 1, jeHeaders.length).setFontWeight('bold');
    sheet.getRange(2, 1, jeRows.length, jeHeaders.length).setValues(jeRows);
    sheet.autoResizeColumns(1, jeHeaders.length);
    
    // Create .xlsx in Drive
    var folder = DriveApp.getRootFolder();
    var xlsxName = 'VOID_JE_' + docNo + '_' + new Date().getTime() + '.xlsx';
    var xlsxUrl = '';
    try {
      var tempSs = ss.copy('Temp_Void_' + new Date().getTime());
      var xlsxBlob = tempSs.getAs('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      xlsxBlob.setName(xlsxName);
      var xlsxFile = folder.createFile(xlsxBlob);
      xlsxUrl = xlsxFile.getUrl();
      DriveApp.getFileById(tempSs.getId()).setTrashed(true);
    } catch(e) {
      Logger.log('XLSX error: ' + e.message);
      xlsxUrl = ss.getUrl();
    }
    
    // Also write void data back to a tracking sheet
    try {
      var voidLogSheet = ss.getSheetByName('_VOID_LOG');
      if (!voidLogSheet) {
        voidLogSheet = ss.insertSheet('_VOID_LOG');
        voidLogSheet.getRange(1, 1, 1, 7).setValues([['Date', 'DocNo', 'Type', 'Description', 'Amount', 'Remaining', 'JE Reference']]);
        voidLogSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
      }
      var lastRow = voidLogSheet.getLastRow() + 1;
      voidLogSheet.getRange(lastRow, 1, 1, 7).setValues([[
        voidDate, docNo, type.toUpperCase(), detail.description || '',
        detail.amount, remaining, ref
      ]]);
    } catch(e) {
      Logger.log('Void log error: ' + e.message);
    }
    
    return {
      ok: true,
      message: (type === 'refund' ? 'คืนเงิน' : 'ตัดสูญ') + ' เอกสาร ' + docNo + ' จำนวน ' + fmtMoney_(remaining) + ' บาท',
      docNo: docNo, type: type, voidDate: voidDate,
      amount: remaining, lines: lines.length,
      sheetUrl: ss.getUrl(),
      xlsxUrl: xlsxUrl,
      jeRef: ref
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Format a date string (YYYY-MM-DD) to SAP format (DD.MM.YYYY)
 */
function formatDateForSAP_(dateStr) {
  if (!dateStr) return '';
  var m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '.' + m[2] + '.' + m[1];
  // Already in DD.MM.YYYY?
  var m2 = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m2) return dateStr;
  return dateStr;
}

// ================= PRE-UPLOAD CHECKER =================

/**
 * Run pre-upload validation checks on input data
 * @param {string} targetPeriod - optional YYYY-MM filter
 */
function runPreUploadCheck(targetPeriod) {
  try {
    var items = readInputData_();
    if (items.length === 0) return { ok: false, error: 'No data found' };
    
    var errors = [];
    var warnings = [];
    var docMap = {};
    var totalAmount = 0;
    var validItems = 0;
    
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var doc = it.docNo || '';
      var rowNum = i + 2; // +2 for header row (1-indexed, row 1 = header)
      
      // 1. Check missing doc number (ERROR)
      if (!doc.trim()) {
        errors.push({ row: rowNum, type: 'ERROR', field: 'Doc No', message: 'Row ' + rowNum + ': ไม่มีเลขที่ DOC' });
        continue;
      }
      
      // 2. Check duplicate doc numbers (WARNING) 
      if (docMap[doc] === undefined) {
        docMap[doc] = [rowNum];
      } else {
        docMap[doc].push(rowNum);
      }
      
      // 3. Check missing IO (ERROR)
      if (!it.io || !String(it.io).trim()) {
        errors.push({ row: rowNum, type: 'ERROR', field: 'IO', message: 'DOC ' + doc + ' (Row ' + rowNum + '): ไม่มี IO' });
      }
      
      // 4. Check missing GL (WARNING - might be OK if same as IO)
      if (!it.glPrepaid || !String(it.glPrepaid).trim()) {
        warnings.push({ row: rowNum, type: 'WARN', field: 'GL', message: 'DOC ' + doc + ' (Row ' + rowNum + '): ไม่มี GL จะใช้ค่าเริ่มต้น' });
      }
      
      // 5. Check missing dates (ERROR)
      if (!it.startDate) {
        errors.push({ row: rowNum, type: 'ERROR', field: 'Start Date', message: 'DOC ' + doc + ' (Row ' + rowNum + '): ไม่มีวันที่เริ่มต้น (Col M)' });
      }
      if (!it.endDate) {
        errors.push({ row: rowNum, type: 'ERROR', field: 'End Date', message: 'DOC ' + doc + ' (Row ' + rowNum + '): ไม่มีวันที่สิ้นสุด (Col N)' });
      }
      
      // 6. Check invalid dates (ERROR)
      if (it.startDate && it.endDate) {
        var startD = new Date(it.startDate);
        var endD = new Date(it.endDate);
        if (isNaN(startD)) {
          errors.push({ row: rowNum, type: 'ERROR', field: 'Start Date', message: 'DOC ' + doc + ' (Row ' + rowNum + '): วันที่เริ่มต้นไม่ถูกต้อง' });
        }
        if (isNaN(endD)) {
          errors.push({ row: rowNum, type: 'ERROR', field: 'End Date', message: 'DOC ' + doc + ' (Row ' + rowNum + '): วันที่สิ้นสุดไม่ถูกต้อง' });
        }
        // 7. Check start > end (ERROR)
        if (!isNaN(startD) && !isNaN(endD) && startD > endD) {
          errors.push({ row: rowNum, type: 'ERROR', field: 'Date Range', message: 'DOC ' + doc + ': วันที่เริ่มต้นมากกว่าวันที่สิ้นสุด' });
        }
        // 8. Check end date in the past (WARNING)
        if (!isNaN(endD)) {
          var today = new Date();
          today.setHours(0,0,0,0);
          if (endD < today) {
            warnings.push({ row: rowNum, type: 'WARN', field: 'End Date', message: 'DOC ' + doc + ': วันที่สิ้นสุดผ่านไปแล้ว (' + fmtDate_(it.endDate) + ')' });
          }
        }
      }
      
      // 9. Check amount (ERROR if zero/negative)
      var amt = Number(it.amount) || 0;
      if (amt <= 0) {
        errors.push({ row: rowNum, type: 'ERROR', field: 'Amount', message: 'DOC ' + doc + ' (Row ' + rowNum + '): ยอดเงิน = 0 หรือติดลบ (' + amt + ')' });
      }
      
      totalAmount += amt;
      validItems++;
    }
    
    // 10. Check duplicates - convert to warnings
    for (var d in docMap) {
      if (docMap[d].length > 1) {
        warnings.push({ row: docMap[d][0], type: 'WARN', field: 'Duplicate', message: 'DOC ' + d + ': พบ ' + docMap[d].length + ' รายการ (Rows: ' + docMap[d].join(', ') + ')' });
      }
    }
    
    // Run quick amortization check on 10 random items
    var amortCheck = { checked: 0, mismatched: 0 };
    var sampleSize = Math.min(items.length, 10);
    for (var ci = 0; ci < sampleSize; ci++) {
      var sched = calculateAmortization_(items[ci], null);
      if (sched.length > 0) {
        var lastRow = sched[sched.length - 1];
        if (lastRow.remaining > 0.01) {
          amortCheck.mismatched++;
        }
        amortCheck.checked++;
      }
    }
    
    // Determine overall status
    var status = 'PASS';
    if (errors.length > 0) status = 'FAIL';
    else if (warnings.length > 0) status = 'WARN';
    
    return {
      ok: true,
      status: status,
      totalItems: items.length,
      validItems: validItems,
      errors: errors,
      warnings: warnings,
      errorCount: errors.length,
      warningCount: warnings.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      amortCheck: amortCheck,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
