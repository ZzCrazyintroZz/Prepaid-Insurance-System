// ================= WIDE FORMAT PIVOT =================
function pivotToWideFormat_(longData) {
  try {
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
          docNo: r.docNo, docNo2: r.docNo2 || '', description: r.description || '', io: r.io || '',
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
    var baseHeaders = ['Doc No', 'Doc No 2', 'Description', 'IO', 'GL', 'Plate', 'Cost Center',
      'Total Months', 'Total', 'Accumulated', 'Remaining'];
    var headers = baseHeaders.concat(monthCols);
    
    var rows = [];
    var keys = Object.keys(groups);
    for (var k = 0; k < keys.length; k++) {
      var g = groups[keys[k]];
      var monthsActive = Object.keys(g.monthly).length;
      var row = [
        g.docNo, g.docNo2, g.description, g.io, g.glPrepaid, g.plate, g.costCenter,
        monthsActive, Math.round(g.amount * 100) / 100,
        Math.round(g.accumulated * 100) / 100, Math.round(g.remaining * 100) / 100
      ];
      for (var m = 0; m < monthCols.length; m++) {
        row.push(g.monthly[monthCols[m]] || 0);
      }
      rows.push(row);
    }
    
    return {headers: headers, rows: rows, monthColumns: monthCols, baseCount: baseHeaders.length};
  } catch (e) {
    Logger.log('pivotToWideFormat_ error: ' + e.message);
    return {headers: [], rows: [], monthColumns: [], baseCount: 0};
  }
}
// ================= XLSX HELPER =================
function toXLSXBase64_(headers, rows, fileName) {
  var ss = SpreadsheetApp.create('_tmp_xlsx_' + new Date().getTime());
  var sheet = ss.getActiveSheet();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  SpreadsheetApp.flush();
  var exportUrl = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  var resp = UrlFetchApp.fetch(exportUrl, {
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}
  });
  var xlsxBlob = resp.getBlob();
  xlsxBlob.setName(fileName + '.xlsx');
  var base64 = Utilities.base64Encode(xlsxBlob.getBytes());
  try { DriveApp.getFileById(ss.getId()).setTrashed(true); } catch(e) {}
  return base64;
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
    var ss = SpreadsheetApp.openById(getSapTemplateId_());
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
      message: 'Exported ' + pivot.rows.length + ' items (' + pivot.monthColumns.length + ' months) to Sheet ' + CONFIG.SAP_SHEET_NAME,
      rows: pivot.rows.length,
      months: pivot.monthColumns.length
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function getWidePreview(targetPeriod) {
  try {
    // Cache check
    var cacheKey = 'wide_preview_full_' + (targetPeriod || 'ALL') + '_v2';
    try {
      var cs = CacheService.getScriptCache().get(cacheKey);
      if (cs) {
        var parsed = JSON.parse(cs);
        if (parsed && parsed.ok) return parsed;
      }
    } catch(e) {}

    var items = readInputData_();
    var allLong = [];
    for (var i = 0; i < items.length; i++) {
      var sched = calculateAmortization_(items[i], targetPeriod);
      for (var j = 0; j < sched.length; j++) allLong.push(sched[j]);
    }
    if (allLong.length === 0) return {ok: false, error: 'No data'};
    var pivot = pivotToWideFormat_(allLong);
    var result = {
      ok: true,
      headers: pivot.headers,
      rows: pivot.rows,
      monthColumns: pivot.monthColumns,
      baseCount: pivot.baseCount,
      totalRows: pivot.rows.length,
      totalMonths: pivot.monthColumns.length
    };
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 300); } catch(e) {}
    return result;
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ================= WIDE FORMAT CSV EXPORT =================
function exportWideCSV(targetPeriod) {
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
    
    // Build CSV with BOM for Thai UTF-8 support
    var csv = '\ufeff';
    // Headers
    for (var h = 0; h < pivot.headers.length; h++) {
      if (h > 0) csv += ',';
      csv += '"' + String(pivot.headers[h]).replace(/"/g, '""') + '"';
    }
    csv += '\n';
    // Data rows
    for (var r = 0; r < pivot.rows.length; r++) {
      for (var c = 0; c < pivot.rows[r].length; c++) {
        if (c > 0) csv += ',';
        var val = pivot.rows[r][c];
        if (typeof val === 'number') {
          csv += val;
        } else {
          csv += '"' + String(val || '').replace(/"/g, '""') + '"';
        }
      }
      csv += '\n';
    }
    
    return {
      ok: true,
      csv: csv,
      fileName: (targetPeriod || 'all_periods') + '_amort_schedule.csv',
      totalRows: pivot.rows.length,
      totalMonths: pivot.monthColumns.length
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ================= WIDE FORMAT XLSX EXPORT (via temp sheet) =================
function exportWideXLSX(targetPeriod) {
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
    
    // Create temp spreadsheet
    var tempSs = SpreadsheetApp.create('_temp_amort_export_' + new Date().getTime());
    var sheet = tempSs.getActiveSheet();
    sheet.setName(targetPeriod || 'All Periods');
    
    // Headers
    sheet.getRange(1, 1, 1, pivot.headers.length).setValues([pivot.headers]);
    sheet.getRange(1, 1, 1, pivot.headers.length).setFontWeight('bold');
    
    // Data
    if (pivot.rows.length > 0) {
      sheet.getRange(2, 1, pivot.rows.length, pivot.rows[0].length).setValues(pivot.rows);
    }
    
    // Blue highlight for monthly columns
    if (pivot.monthColumns.length > 0) {
      var startCol = pivot.baseCount + 1;
      sheet.getRange(1, startCol, pivot.rows.length + 1, pivot.monthColumns.length)
        .setBackground('#cfe2f3');
    }
    
    // Get blob as XLSX via Drive export URL (most reliable method)
    SpreadsheetApp.flush();
    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + tempSs.getId() + '/export?format=xlsx';
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}
    });
    var blob = response.getBlob();
    blob.setName((targetPeriod || 'all_periods') + '_amort_schedule.xlsx');
    
    // Delete temp spreadsheet
    try { DriveApp.getFileById(tempSs.getId()).setTrashed(true); } catch(e) { Logger.log('cleanup: ' + e.message); }
    
    return {
      ok: true,
      blobData: Utilities.base64Encode(blob.getBytes()),
      blobType: blob.getContentType(),
      fileName: blob.getName(),
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
  try {
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
      var io = s.io || '';
      currentDoc.push({
        company: company, docType: docType, postDate: postDate, docDate: docDate,
        ref: ref, currency: currency, lineItem: lineItem,
        glAccount: io, debit: amt, credit: 0,
        description: String((s.docNo2 ? '[' + s.docNo2 + '] ' : '') + (s.description || '')).substring(0, 50),
        costCenter: s.costCenter || '', io: io, key: '40', taxBranch: '0000'
      });
      totalDebit += amt;
      lineCount++;
      
      // Credit line (Key=50, GL=GL from input)
      var gl = s.glPrepaid || '';
      lineItem = lineCount + 1;
      currentDoc.push({
        company: company, docType: docType, postDate: postDate, docDate: docDate,
        ref: ref, currency: currency, lineItem: lineItem,
        glAccount: gl, debit: 0, credit: amt,
        description: String((s.docNo2 ? '[' + s.docNo2 + '] ' : '') + (s.description || '')).substring(0, 50),
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
  } catch (e) {
    Logger.log('generateSAPJE_ error: ' + e.message);
    return {documents: [], totalDocs: 0, totalLines: 0, totalDebit: 0, totalCredit: 0};
  }
}

function exportSAPJE(targetPeriod) {
  try {
    // Cache check: cache per period, 5 min TTL via CacheService
    var cacheKey = 'sap_je_' + (targetPeriod || 'ALL') + '_v2';
    var cached = null;
    try {
      var cs = CacheService.getScriptCache().get(cacheKey);
      if (cs) cached = JSON.parse(cs);
    } catch(e) {}
    if (cached && cached.ok) {
      // Cache hit — but still need to check if data exists
      Logger.log('exportSAPJE cache hit for ' + cacheKey);
      return cached;
    }

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
    var ss = SpreadsheetApp.openById(getSapTemplateId_());
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
      // Get the blob via Drive export URL
      SpreadsheetApp.flush();
      var exportUrl = 'https://docs.google.com/spreadsheets/d/' + tempSs.getId() + '/export?format=xlsx';
      var resp = UrlFetchApp.fetch(exportUrl, {
        headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}
      });
      var xlsxBlob = resp.getBlob();
      xlsxBlob.setName(xlsxName);
      var xlsxFile = folder.createFile(xlsxBlob);
      xlsxUrl = xlsxFile.getUrl();
      // Delete temp file
      DriveApp.getFileById(tempSs.getId()).setTrashed(true);
    } catch(e) {
      Logger.log('XLSX error: ' + e.message);
      xlsxUrl = ss.getUrl();
    }
    
    // Cache the result (5 min)
    var cacheResult = {
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
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(cacheResult), 300); } catch(e) {}
    return cacheResult;
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ================= BULK SAP JE EXPORT =================
/**
 * Get all unique periods available in the input data
 * @returns {string[]} Array of YYYY-MM period strings
 */
function getAvailablePeriods() {
  try {
    // Cache check via CacheService
    var cacheKey = 'avail_periods_v2';
    try {
      var cs = CacheService.getScriptCache().get(cacheKey);
      if (cs) {
        var parsed = JSON.parse(cs);
        if (parsed && Array.isArray(parsed)) return parsed;
      }
    } catch(e) {}

    var items = readInputData_();
    var periodSet = {};
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var start = new Date(item.startDate);
      var end = new Date(item.endDate);
      if (isNaN(start) || isNaN(end) || start > end) continue;
      var cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        var y = cur.getFullYear();
        var m = cur.getMonth() + 1;
        periodSet[y + '-' + (m < 10 ? '0' : '') + m] = true;
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    var result = Object.keys(periodSet).sort();
    // Cache the result (5 min)
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 300); } catch(e) {}
    return result;
  } catch (e) {
    Logger.log('getAvailablePeriods error: ' + e.message);
    return [];
  }
}

/**
 * Bulk export SAP JE for multiple periods
 * @param {string[]} periods - Array of YYYY-MM period strings
 * @returns {Object} Combined summary
 */
function bulkExportSAPJE(periods) {
  try {
    if (!periods || !Array.isArray(periods) || periods.length === 0) {
      return {ok: false, error: 'No periods specified', totalDocs: 0, totalLines: 0, totalDebit: 0, totalCredit: 0, perPeriod: [], succeeded: 0, failed: 0};
    }
    
    var totalDocs = 0, totalLines = 0, totalDebit = 0, totalCredit = 0;
    var perPeriod = [];
    var succeeded = 0, failed = 0;
    
    for (var i = 0; i < periods.length; i++) {
      var period = periods[i];
      try {
        var result = exportSAPJE(period);
        perPeriod.push({
          period: period,
          ok: result.ok,
          docs: result.ok ? result.totalDocs : 0,
          lines: result.ok ? result.totalLines : 0,
          debit: result.ok ? result.totalDebit : 0,
          credit: result.ok ? result.totalCredit : 0,
          error: result.ok ? '' : (result.error || 'Unknown error'),
          sheetUrl: result.ok ? result.sheetUrl : '',
          xlsxUrl: result.ok ? result.xlsxUrl : ''
        });
        if (result.ok) {
          succeeded++;
          totalDocs += result.totalDocs || 0;
          totalLines += result.totalLines || 0;
          totalDebit += result.totalDebit || 0;
          totalCredit += result.totalCredit || 0;
        } else {
          failed++;
        }
      } catch (e) {
        perPeriod.push({
          period: period,
          ok: false,
          docs: 0,
          lines: 0,
          debit: 0,
          credit: 0,
          error: e.message,
          sheetUrl: '',
          xlsxUrl: ''
        });
        failed++;
      }
    }
    
    return {
      ok: succeeded > 0,
      message: 'Bulk export: ' + succeeded + ' succeeded, ' + failed + ' failed — ' + totalDocs + ' docs, ' + totalLines + ' lines',
      totalDocs: totalDocs,
      totalLines: totalLines,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      perPeriod: perPeriod,
      succeeded: succeeded,
      failed: failed
    };
  } catch (e) {
    Logger.log('bulkExportSAPJE error: ' + e.message);
    return {ok: false, error: e.message, totalDocs: 0, totalLines: 0, totalDebit: 0, totalCredit: 0, perPeriod: [], succeeded: 0, failed: 0};
  }
}

// ================= NEW EXPORT FUNCTIONS =================

function exportFullSchedule(searchTerm) {
  try {
    var items = readInputData_();
    var allSched = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var sched = calculateAmortization_(item, null);
      if (sched.length === 0) continue;
      var last = sched[sched.length - 1];
      var start = new Date(item.startDate);
      var end = new Date(item.endDate);
      var totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      var ratePerDay = Math.round((item.amount / totalDays) * 10000) / 10000;
      // Build summary row
      var row = {
        docNo: item.docNo, docNo2: item.docNo2 || '', description: item.description,
        io: item.io, glPrepaid: item.glPrepaid, plate: item.plate,
        costCenter: item.costCenter,
        startDate: item.startDate, endDate: item.endDate,
        amount: item.amount, totalDays: totalDays, ratePerDay: ratePerDay,
        accumulated: last.accumulated, remaining: last.remaining
      };
      // Apply search filter
      if (searchTerm) {
        var term = searchTerm.toLowerCase();
        var match = (row.docNo.toLowerCase().indexOf(term) !== -1) ||
                    (row.docNo2.toLowerCase().indexOf(term) !== -1) ||
                    (row.description.toLowerCase().indexOf(term) !== -1) ||
                    (row.io.toLowerCase().indexOf(term) !== -1) ||
                    (row.glPrepaid.toLowerCase().indexOf(term) !== -1);
        if (!match) continue;
      }
      allSched.push(row);
    }
    if (allSched.length === 0) return {ok: false, error: 'No data matching criteria'};
    // Build CSV
    var csv = '\ufeff';
    var headers = ['docNo','docNo2','description','IO','GL','plate','costCenter','startDate','endDate','amount','totalDays','ratePerDay','accumulated','remaining'];
    for (var h = 0; h < headers.length; h++) {
      if (h > 0) csv += ',';
      csv += '"' + String(headers[h]).replace(/"/g, '""') + '"';
    }
    csv += '\n';
    for (var r = 0; r < allSched.length; r++) {
      var row = allSched[r];
      var vals = [row.docNo, row.docNo2, row.description, row.io, row.glPrepaid, row.plate,
                  row.costCenter, row.startDate, row.endDate, row.amount, row.totalDays,
                  row.ratePerDay, row.accumulated, row.remaining];
      for (var c = 0; c < vals.length; c++) {
        if (c > 0) csv += ',';
        var val = vals[c];
        if (typeof val === 'number') {
          csv += val;
        } else {
          csv += '"' + String(val || '').replace(/"/g, '""') + '"';
        }
      }
      csv += '\n';
    }
    return {
      ok: true,
      data: toXLSXBase64_(
        ['docNo','docNo2','description','IO','GL','plate','costCenter','startDate','endDate','amount','totalDays','ratePerDay','accumulated','remaining'],
        allSched.map(function(r){return[r.docNo,r.docNo2,r.description,r.io,r.glPrepaid,r.plate,r.costCenter,r.startDate,r.endDate,r.amount,r.totalDays,r.ratePerDay,r.accumulated,r.remaining];}),
        'full_schedule_verify'),
      fileName: 'full_schedule_verify.xlsx',
      totalRows: allSched.length
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function exportMonthlyPivot(targetPeriod, searchTerm) {
  try {
    var items = readInputData_();
    var allLong = [];
    for (var i = 0; i < items.length; i++) {
      var sched = calculateAmortization_(items[i], targetPeriod);
      for (var j = 0; j < sched.length; j++) {
        // Apply search filter on long data after calculation
        var r = sched[j];
        if (searchTerm) {
          var term = searchTerm.toLowerCase();
          var match = (r.docNo.toLowerCase().indexOf(term) !== -1) ||
                      ((r.docNo2||'').toLowerCase().indexOf(term) !== -1) ||
                      ((r.description||'').toLowerCase().indexOf(term) !== -1) ||
                      (r.io.toLowerCase().indexOf(term) !== -1) ||
                      (r.glPrepaid.toLowerCase().indexOf(term) !== -1);
          if (!match) continue;
        }
        allLong.push(r);
      }
    }
    if (allLong.length === 0) return {ok: false, error: 'No data calculated'};
    var pivot = pivotToWideFormat_(allLong);
    if (pivot.rows.length === 0) return {ok: false, error: 'No pivot data'};
    // Build CSV with BOM
    var csv = '\ufeff';
    for (var h = 0; h < pivot.headers.length; h++) {
      if (h > 0) csv += ',';
      csv += '"' + String(pivot.headers[h]).replace(/"/g, '""') + '"';
    }
    csv += '\n';
    for (var r = 0; r < pivot.rows.length; r++) {
      for (var c = 0; c < pivot.rows[r].length; c++) {
        if (c > 0) csv += ',';
        var val = pivot.rows[r][c];
        if (typeof val === 'number') {
          csv += val;
        } else {
          csv += '"' + String(val || '').replace(/"/g, '""') + '"';
        }
      }
      csv += '\n';
    }
    return {
      ok: true,
      data: toXLSXBase64_(pivot.headers, pivot.rows, 'prepaid_monthly_pivot'),
      fileName: 'prepaid_monthly_pivot.xlsx',
      totalRows: pivot.rows.length
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function exportThisPeriod(targetPeriod, searchTerm) {
  try {
    if (!targetPeriod) return {ok: false, error: 'No period specified'};
    var items = readInputData_();
    var results = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var sched = calculateAmortization_(item, targetPeriod);
      if (sched.length === 0) continue;
      for (var j = 0; j < sched.length; j++) {
        var r = sched[j];
        // Apply search filter
        if (searchTerm) {
          var term = searchTerm.toLowerCase();
          var match = (r.docNo.toLowerCase().indexOf(term) !== -1) ||
                      ((r.docNo2||'').toLowerCase().indexOf(term) !== -1) ||
                      ((r.description||'').toLowerCase().indexOf(term) !== -1) ||
                      (r.io.toLowerCase().indexOf(term) !== -1) ||
                      (r.glPrepaid.toLowerCase().indexOf(term) !== -1);
          if (!match) continue;
        }
        results.push({
          docNo: r.docNo,
          description: r.description || '',
          io: r.io,
          gl: r.glPrepaid,
          period: r.period,
          amortAmount: r.amortAmount,
          remaining: r.remaining
        });
      }
    }
    if (results.length === 0) return {ok: false, error: 'No data matching criteria'};
    // Build CSV with BOM
    var csv = '\ufeff';
    var headers = ['docNo','description','IO','GL','period','amortAmount','remaining'];
    for (var h = 0; h < headers.length; h++) {
      if (h > 0) csv += ',';
      csv += '"' + String(headers[h]).replace(/"/g, '""') + '"';
    }
    csv += '\n';
    for (var r = 0; r < results.length; r++) {
      var row = results[r];
      var vals = [row.docNo, row.description, row.io, row.gl, row.period, row.amortAmount, row.remaining];
      for (var c = 0; c < vals.length; c++) {
        if (c > 0) csv += ',';
        var val = vals[c];
        if (typeof val === 'number') {
          csv += val;
        } else {
          csv += '"' + String(val || '').replace(/"/g, '""') + '"';
        }
      }
      csv += '\n';
    }
    return {
      ok: true,
      data: toXLSXBase64_(
        ['docNo','description','IO','GL','period','amortAmount','remaining'],
        results.map(function(r){return[r.docNo,r.description,r.io,r.gl,r.period,r.amortAmount,r.remaining];}),
        'this_period_export'),
      fileName: 'this_period_export.xlsx',
      totalRows: results.length
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function getSAPJEPreview(targetPeriod) {
  try {
    // Cache check
    var cacheKey = 'sap_je_preview_' + (targetPeriod || 'ALL') + '_v2';
    try {
      var cs = CacheService.getScriptCache().get(cacheKey);
      if (cs) {
        var parsed = JSON.parse(cs);
        if (parsed && parsed.ok) return parsed;
      }
    } catch(e) {}

    var items = readInputData_();
    var allSched = [];
    for (var i = 0; i < Math.min(items.length, 30); i++) { // preview 30 items
      var sched = calculateAmortization_(items[i], targetPeriod);
      for (var j = 0; j < sched.length; j++) allSched.push(sched[j]);
    }
    if (allSched.length === 0) return {ok: false, error: 'No data'};
    
    var settings = {company:'1022', docType:'SA', currency:'THB', prepaidGL:'11370010', maxLinesPerJE:900};
    var jeResult = generateSAPJE_(allSched, settings);
    
    var result = {
      ok: true,
      sample: jeResult.documents.slice(0, 3),
      totalDocs: '~' + Math.ceil(allSched.length / (CONFIG.MAX_LINES_PER_JE / 2)),
      totalLines: jeResult.totalLines
    };
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 300); } catch(e) {}
    return result;
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function exportRunningBalance(targetPeriod, searchTerm) {
  try {
    var items = readInputData_();
    var allRB = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var sched = calculateAmortization_(item, targetPeriod);
      if (sched.length === 0) continue;
      var last = sched[sched.length - 1];
      var curAccum = last.accumulated;
      var curRemain = last.remaining;
      var consumedPct = item.amount > 0 ? Math.round(curAccum / item.amount * 10000) / 100 : 0;
      var row = {
        docNo: item.docNo, description: item.description,
        startDate: item.startDate, endDate: item.endDate,
        amount: item.amount, amortized: curAccum, remaining: curRemain,
        consumedPct: consumedPct
      };
      if (searchTerm) {
        var term = searchTerm.toLowerCase();
        var match = (row.docNo.toLowerCase().indexOf(term) !== -1) ||
                    (row.description.toLowerCase().indexOf(term) !== -1);
        if (!match) continue;
      }
      allRB.push(row);
    }
    if (allRB.length === 0) return {ok: false, error: 'No data matching criteria'};
    var csv = '\ufeff';
    var headers = ['docNo','description','startDate','endDate','amount','amortized','remaining','consumedPct'];
    csv += headers.map(function(h){return '"'+h.replace(/"/g,'""')+'"';}).join(',') + '\n';
    for (var r = 0; r < allRB.length; r++) {
      var row = allRB[r];
      var vals = [row.docNo, row.description, row.startDate, row.endDate,
                  row.amount, row.amortized, row.remaining, row.consumedPct + '%'];
      csv += vals.map(function(v){
        if (typeof v === 'number') return v;
        return '"' + String(v || '').replace(/"/g, '""') + '"';
      }).join(',') + '\n';
    }
    return {ok: true, data: toXLSXBase64_(
      ['docNo','description','startDate','endDate','amount','amortized','remaining','consumedPct'],
      allRB.map(function(r){return[r.docNo,r.description,r.startDate,r.endDate,r.amount,r.amortized,r.remaining,r.consumedPct+'%'];}),
      'running_balance'),
      fileName: 'running_balance.xlsx', totalRows: allRB.length};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}
