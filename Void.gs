// ================= VOID / TERMINATE =================

// Module-level cache for doc details
var _docDetailCache = {};
var _docDetailCacheTime = {};
var _DOC_DETAIL_CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Get list of all active doc numbers (for dropdown)
 * Supports optional skip/limit for pagination
 * @param {number} skip - items to skip (default 0)
 * @param {number} limit - max items to return (default 0 = all)
 */
function getDocList(skip, limit) {
  try {
    skip = Number(skip) || 0;
    limit = Number(limit) || 0;
    var items = readInputData_();
    var docMap = {};
    for (var i = 0; i < items.length; i++) {
      var doc = items[i].docNo || '';
      if (doc && !docMap[doc]) {
        docMap[doc] = { docNo: doc, docNo2: items[i].docNo2 || '', description: items[i].description, plate: items[i].plate };
      }
    }
    var list = [];
    for (var d in docMap) list.push(docMap[d]);
    list.sort(function(a,b){ return a.docNo.localeCompare(b.docNo); });
    var total = list.length;
    if (limit > 0) {
      list = list.slice(skip, skip + limit);
    }
    return { ok: true, list: list, total: total, hasMore: (skip + list.length) < total };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get paginated doc list with search
 * @param {number} skip - items to skip (default 0)
 * @param {number} limit - items per page (default 50)
 * @param {string} search - optional search filter
 * @returns {Object} {items, total, hasMore}
 */
function getPagedDocList(skip, limit, search) {
  try {
    skip = Number(skip) || 0;
    limit = Number(limit) || 50;
    search = (search || '').trim().toLowerCase();
    var items = readInputData_();
    var docMap = {};
    for (var i = 0; i < items.length; i++) {
      var doc = items[i].docNo || '';
      if (!doc) continue;
      // Apply search filter
      if (search) {
        var haystack = (doc + ' ' + (items[i].docNo2 || '') + ' ' + (items[i].description || '') + ' ' + (items[i].plate || '')).toLowerCase();
        if (haystack.indexOf(search) === -1) continue;
      }
      if (!docMap[doc]) {
        docMap[doc] = { docNo: doc, docNo2: items[i].docNo2 || '', description: items[i].description, plate: items[i].plate };
      }
    }
    var list = [];
    for (var d in docMap) list.push(docMap[d]);
    list.sort(function(a,b){ return a.docNo.localeCompare(b.docNo); });
    var total = list.length;
    var paged = list.slice(skip, skip + limit);
    return { ok: true, items: paged, total: total, hasMore: (skip + paged.length) < total };
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
    // Module-level cache
    var now = Date.now();
    if (_docDetailCache[docNo] !== undefined && (now - (_docDetailCacheTime[docNo] || 0)) < _DOC_DETAIL_CACHE_TTL) {
      return _docDetailCache[docNo];
    }
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
    
    // Build result and cache it
    var result = {
      ok: true,
      docNo: matched.docNo,
      docNo2: matched.docNo2 || '',
      description: matched.description,
      plate: matched.plate,
      io: matched.io,
      glPrepaid: matched.glPrepaid,
      glName: matched.glName || '',
      costCenter: matched.costCenter,
      costName: matched.costName || '',
      amount: matched.amount,
      startDate: fmtDate_(matched.startDate),
      endDate: fmtDate_(matched.endDate),
      amortized: Math.round(amortized * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
      scheduleRows: fullSchedule.length,
      schedule: fullSchedule.slice(0, 5) // first 5 rows preview
    };
    _docDetailCache[docNo] = result;
    _docDetailCacheTime[docNo] = Date.now();
    return result;
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
    var io = detail.io || '';
    var gl = detail.glPrepaid || '';
    
    if (type === 'refund') {
      // REFUND: Dr = GL (Key 50, credit side reversal), Cr = IO (Key 40)
      // Accounting: Reverse the remaining prepaid balance
      // Dr: Expense/Asset reversal GL - debit the GL that will receive the refund
      // Cr: IO (prepaid account) - credit to clear the prepaid
      lines.push({
        company: settings.company, docType: settings.docType,
        postDate: postDate, docDate: docDate,
        ref: ref, currency: settings.currency, lineItem: 1,
        glAccount: io, debit: Math.round(remaining * 100) / 100, credit: 0,
        description: 'VOID-REFUND ' + docNo + ' ' + String(detail.description || '').substring(0, 35),
        costCenter: detail.costCenter || '', io: io, key: '40', taxBranch: '0000'
      });
      lines.push({
        company: settings.company, docType: settings.docType,
        postDate: postDate, docDate: docDate,
        ref: ref, currency: settings.currency, lineItem: 2,
        glAccount: gl, debit: 0, credit: Math.round(remaining * 100) / 100,
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
        costCenter: detail.costCenter || '', io: io, key: '40', taxBranch: '0000'
      });
      lines.push({
        company: settings.company, docType: settings.docType,
        postDate: postDate, docDate: docDate,
        ref: ref, currency: settings.currency, lineItem: 2,
        glAccount: io, debit: 0, credit: Math.round(remaining * 100) / 100,
        description: 'VOID-LOSS ' + docNo + ' ' + String(detail.description || '').substring(0, 35),
        costCenter: detail.costCenter || '', io: io, key: '50', taxBranch: '0000'
      });
    }
    
    // Write to sheet
    var ss = SpreadsheetApp.openById(getSapTemplateId_());
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
 * Batch void multiple prepaid documents
 * @param {string[]} docList - Array of docNo strings
 * @param {string} voidDate - Void date (YYYY-MM-DD)
 * @param {string} type - 'refund' or 'loss'
 * @param {string} lossGL - Loss GL account (for loss type)
 * @return {Object} Summary { ok, total, succeeded, failed, results }
 */
function batchVoidPrepaid(docList, voidDate, type, lossGL) {
  try {
    if (!docList || !Array.isArray(docList) || docList.length === 0) {
      return { ok: false, error: 'กรุณาระบุรายการเอกสารที่ต้องการ Void' };
    }
    type = type || 'refund';
    lossGL = lossGL || '51990010';
    voidDate = voidDate || '';
    
    var results = [];
    var succeeded = 0;
    var failed = 0;
    
    for (var i = 0; i < docList.length; i++) {
      var docNo = docList[i];
      if (!docNo) continue;
      
      try {
        var result = voidPrepaid({
          docNo: docNo,
          voidDate: voidDate,
          type: type,
          lossGL: lossGL
        });
        
        if (result.ok) {
          succeeded++;
          results.push({
            docNo: docNo,
            ok: true,
            message: result.message,
            amount: result.amount,
            jeRef: result.jeRef
          });
        } else {
          failed++;
          results.push({
            docNo: docNo,
            ok: false,
            error: result.error || 'Unknown error'
          });
        }
      } catch (e) {
        failed++;
        results.push({
          docNo: docNo,
          ok: false,
          error: e.message
        });
      }
    }
    
    return {
      ok: succeeded > 0,
      total: docList.length,
      succeeded: succeeded,
      failed: failed,
      results: results,
      message: 'Batch Void: ' + succeeded + ' สำเร็จ, ' + failed + ' ล้มเหลว จาก ' + docList.length + ' รายการ'
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
