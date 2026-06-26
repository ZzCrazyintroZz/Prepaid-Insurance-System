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
  } catch (e) {
    Logger.log('pivotToWideFormat_ error: ' + e.message);
    return {headers: [], rows: [], monthColumns: [], baseCount: 0};
  }
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
        description: String(s.description || '').substring(0, 50),
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
  } catch (e) {
    Logger.log('generateSAPJE_ error: ' + e.message);
    return {documents: [], totalDocs: 0, totalLines: 0, totalDebit: 0, totalCredit: 0};
  }
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
