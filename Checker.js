// ================= PRE-UPLOAD CHECKER =================

/**
 * Run pre-upload validation checks on input data
 * @param {string} targetPeriod - optional YYYY-MM filter
 */
function runPreUploadCheck(targetPeriod, skip, limit) {
  try {
    skip = Number(skip) || 0;
    limit = Number(limit) || 0;
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
        warnings.push({ row: docMap[d][0], type: 'WARN', field: 'Duplicate', message: 'DOC ' + d + ': found ' + docMap[d].length + ' items (Rows: ' + docMap[d].join(', ') + ')' });
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
    
    // Apply pagination to errors/warnings if skip/limit specified
    var allErrors = errors;
    var allWarnings = warnings;
    var errorTotal = errors.length;
    var warningTotal = warnings.length;
    if (limit > 0) {
      errors = errors.slice(skip, skip + limit);
      warnings = warnings.slice(skip, skip + limit);
    }
    
    return {
      ok: true,
      status: status,
      totalItems: items.length,
      validItems: validItems,
      errors: errors,
      warnings: warnings,
      errorCount: errorTotal,
      warningCount: warningTotal,
      errorTotal: errorTotal,
      warningTotal: warningTotal,
      totalAmount: Math.round(totalAmount * 100) / 100,
      amortCheck: amortCheck,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
