// ================= CACHE (module-level) =================
var _inputDataCache = null;
var _inputDataCacheTime = 0;
var _INPUT_CACHE_TTL = 60 * 1000; // 60 seconds in-session cache

function invalidateInputCache() {
  _inputDataCache = null;
  _inputDataCacheTime = 0;
  try { CacheService.getScriptCache().remove('input_data_v2'); } catch(e) {}
}

// ================= SHEET ID HELPERS =================
function getInputSheetId_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('INPUT_SHEET_ID') || CONFIG.INPUT_SHEET_ID;
}
function getSapTemplateId_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('SAP_TEMPLATE_ID') || CONFIG.SAP_TEMPLATE_ID;
}

// ================= READ INPUT (with caching) =================
function readInputData_() {
  // Module-level in-session cache (fastest)
  var now = Date.now();
  if (_inputDataCache !== null && (now - _inputDataCacheTime) < _INPUT_CACHE_TTL) {
    return _inputDataCache;
  }

  // CacheService backup (cross-session)
  try {
    // Try chunked cache first (handles >100KB)
    var cached = chunkedCacheGet_('input_data_v2');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      _inputDataCache = cached;
      _inputDataCacheTime = now;
      return cached;
    }
  } catch(e) {}

  const ss = SpreadsheetApp.openById(getInputSheetId_());
  const sheet = ss.getSheetByName(CONFIG.INPUT_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบ Sheet: ' + CONFIG.INPUT_SHEET_NAME);

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!String(row[COL.DOC_NO] || '').trim()) continue; // Col D = เลขที่ DOC

    rows.push({
      company:      String(row[COL.COMPANY] || ''),     // A
      postingDate:  String(row[COL.POSTING_DATE] || ''),     // B
      docDate:      String(row[COL.DOC_DATE] || ''),     // C
      docNo:        String(row[COL.DOC_NO] || ''),     // D
      docNo2:       String(row[COL.DOC_NO_2] || ''),     // E
      description:  String(row[COL.DESC] || ''),     // F
      plate:        String(row[COL.PLATE] || ''),     // G
      io:           String(row[COL.IO] || ''),     // H
      glPrepaid:    String(row[COL.GL_PREPAID] || ''),     // I
      glName:       String(row[COL.GL_NAME] || ''),     // J
      costCenter:   String(row[COL.COST_CENTER] || ''),    // K
      costName:     String(row[COL.COST_NAME] || ''),    // L
      startDate:    row[COL.START_DATE],                   // M
      endDate:      row[COL.END_DATE],                   // N
      amount:       Number(row[COL.AMOUNT]) || 0      // O
    });
  }
  // Cache the result
  _inputDataCache = rows;
  _inputDataCacheTime = now;
  try {
    chunkedCachePut_('input_data_v2', rows, 300); // 5 min
  } catch(e) {}
  return rows;
}

// ================= GET SUMMARY (Frontend) =================

// ================= GET MODIFY PREVIEW =================
/**
 * Preview changes without saving — returns old + modified amortization schedules
 * @param {string} docNo - Document number
 * @param {Object} updates - {startDate, endDate, amount}
 * @returns {Object} {ok, old: {...}, modified: {...}}
 */
function getModifyPreview(docNo, updates) {
  try {
    if (!docNo) return { ok: false, error: 'กรุณาระบุเลขที่ DOC' };

    const items = readInputData_();
    let matched = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].docNo === docNo) { matched = items[i]; break; }
    }
    if (!matched) return { ok: false, error: 'ไม่พบเอกสาร: ' + docNo };

    // Get OLD schedule (full)
    const oldSchedule = calculateAmortization_(matched, null);

    // Build MODIFIED item
    const modified = {
      docNo: matched.docNo,
      docNo2: matched.docNo2 || '',
      description: updates.description !== undefined ? updates.description : matched.description,
      plate: matched.plate,
      io: updates.io !== undefined ? updates.io : matched.io,
      glPrepaid: updates.gl !== undefined ? updates.gl : matched.glPrepaid,
      glName: matched.glName || '',
      costCenter: matched.costCenter,
      costName: matched.costName || '',
      startDate: updates.startDate !== undefined ? new Date(updates.startDate) : new Date(matched.startDate),
      endDate: updates.endDate !== undefined ? new Date(updates.endDate) : new Date(matched.endDate),
      amount: updates.amount !== undefined ? Number(updates.amount) : matched.amount
    };

    // Get NEW schedule
    const newSchedule = calculateAmortization_(modified, null);

    // Last-row metadata
    const oldLast = oldSchedule.length > 0 ? oldSchedule[oldSchedule.length - 1] : null;
    const newLast = newSchedule.length > 0 ? newSchedule[newSchedule.length - 1] : null;

    return {
      ok: true,
      old: {
        startDate: fmtDate_(matched.startDate),
        endDate: fmtDate_(matched.endDate),
        amount: matched.amount,
        description: matched.description || '',
        io: matched.io || '',
        glPrepaid: matched.glPrepaid || '',
        scheduleRows: oldSchedule.length,
        schedule: oldSchedule,
        lastAccumulated: oldLast ? Math.round(oldLast.accumulated * 100) / 100 : 0,
        lastRemaining: oldLast ? Math.round(oldLast.remaining * 100) / 100 : (matched.amount || 0)
      },
      modified: {
        startDate: fmtDate_(modified.startDate),
        endDate: fmtDate_(modified.endDate),
        amount: modified.amount,
        description: modified.description,
        io: modified.io,
        glPrepaid: modified.glPrepaid,
        scheduleRows: newSchedule.length,
        schedule: newSchedule,
        lastAccumulated: newLast ? Math.round(newLast.accumulated * 100) / 100 : 0,
        lastRemaining: newLast ? Math.round(newLast.remaining * 100) / 100 : (modified.amount || 0)
      }
    };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}

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
      sheetId: getInputSheetId_().substring(0,8) + '...'
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= PREPAID RECORD CRUD =================

/**
 * Generate a unique Doc No like "CR-20260626-001"
 */
function generateDocNo() {
  try {
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + pad2_(now.getMonth() + 1) + '-' + pad2_(now.getDate());
    const prefix = 'CR-' + dateStr.replace(/-/g, '') + '-';
    
    const ss = SpreadsheetApp.openById(getInputSheetId_());
    const sheet = ss.getSheetByName(CONFIG.INPUT_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'Sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    let maxSeq = 0;
    for (let i = 1; i < data.length; i++) {
      const dn = String(data[i][COL.DOC_NO] || '').trim();
      if (dn.indexOf(prefix) === 0) {
        const seq = parseInt(dn.substring(prefix.length), 10) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    const seq = pad2_(maxSeq + 1);
    // Use 3-digit padding for sequence
    const seq3 = ('000' + (maxSeq + 1)).slice(-3);
    return { ok: true, docNo: prefix + seq3 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Lookup GL Name and Cost Name from existing records
 */
function lookupNames_(items, glPrepaid, costCenter) {
  let glName = '';
  let costName = '';
  for (let i = 0; i < items.length; i++) {
    if (!glName && items[i].glPrepaid === glPrepaid && items[i].glName) {
      glName = items[i].glName;
    }
    if (!costName && items[i].costCenter === costCenter && items[i].costName) {
      costName = items[i].costName;
    }
    if (glName && costName) break;
  }
  return { glName: glName, costName: costName };
}

/**
 * Add a new prepaid record to the source sheet
 * @param {Object} data - {company, postingDate, docDate, description, plate, io, glPrepaid, costCenter, startDate, endDate, amount}
 * @returns {Object} {ok, docNo, row, message}
 */
function addPrepaidRecord(data) {
  try {
    // Validate required fields
    const required = ['company', 'description', 'io', 'glPrepaid', 'costCenter', 'startDate', 'endDate', 'amount'];
    for (let i = 0; i < required.length; i++) {
      const f = required[i];
      const val = data[f];
      if (val === undefined || val === null || String(val).trim() === '') {
        return { ok: false, error: 'กรุณากรอกข้อมูล: ' + f };
      }
    }
    
    // Validate dates
    const startDt = new Date(data.startDate);
    const endDt = new Date(data.endDate);
    if (isNaN(startDt.getTime())) return { ok: false, error: 'วันที่เริ่มต้นไม่ถูกต้อง' };
    if (isNaN(endDt.getTime())) return { ok: false, error: 'วันที่สิ้นสุดไม่ถูกต้อง' };
    if (startDt > endDt) return { ok: false, error: 'วันที่เริ่มต้นต้อง ≤ วันที่สิ้นสุด' };
    
    // Validate amount
    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) return { ok: false, error: 'จำนวนเงินต้องมากกว่า 0' };
    
    // Generate doc no
    const genResult = generateDocNo();
    if (!genResult.ok) return genResult;
    const docNo = genResult.docNo;
    const docNo2 = data.docNo2 || docNo;
    
    // Process postingDate and docDate
    const postingDate = data.postingDate ? new Date(data.postingDate) : new Date();
    const docDate = data.docDate ? new Date(data.docDate) : new Date();
    
    // Lookup names from existing records
    const items = readInputData_();
    const names = lookupNames_(items, data.glPrepaid, data.costCenter);
    
    // Build row (15 columns)
    const newRow = [
      String(data.company || ''),         // A: COMPANY
      postingDate,                         // B: POSTING_DATE
      docDate,                             // C: DOC_DATE
      docNo,                               // D: DOC_NO
      docNo2,                              // E: DOC_NO_2
      String(data.description || ''),      // F: DESC
      String(data.plate || ''),            // G: PLATE
      String(data.io || ''),               // H: IO
      String(data.glPrepaid || ''),        // I: GL_PREPAID
      names.glName,                        // J: GL_NAME
      String(data.costCenter || ''),       // K: COST_CENTER
      names.costName,                      // L: COST_NAME
      startDt,                             // M: START_DATE
      endDt,                               // N: END_DATE
      amount                               // O: AMOUNT
    ];
    
    const ss = SpreadsheetApp.openById(getInputSheetId_());
    const sheet = ss.getSheetByName(CONFIG.INPUT_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'ไม่พบ Sheet: ' + CONFIG.INPUT_SHEET_NAME };
    
    // Append row at the end
    sheet.appendRow(newRow);
    
    // Log the action
    logAction('CRUD', 'เพิ่มเอกสารใหม่: ' + docNo + ' — ' + data.description);
    
    // Invalidate all caches
    invalidateInputCache();
    invalidateAmortCache();
    try { CacheService.getScriptCache().remove('dash_v2'); } catch(e) {}
    updateTimestampKeeper_();
    
    return {
      ok: true,
      docNo: docNo,
      row: newRow,
      message: 'เพิ่มเอกสาร ' + docNo + ' เรียบร้อย'
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Enhanced updatePrepaidRecord — update any field
 * Original function kept for backward compat, enhanced to update more fields
 */
function updatePrepaidRecord(docNo, updates) {
  try {
    if (!docNo) return { ok: false, error: 'กรุณาระบุเลขที่ DOC' };

    const ss = SpreadsheetApp.openById(getInputSheetId_());
    const sheet = ss.getSheetByName(CONFIG.INPUT_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'ไม่พบ Sheet: ' + CONFIG.INPUT_SHEET_NAME };

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { ok: false, error: 'ไม่มีข้อมูลใน Sheet' };

    // Find row by docNo
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.DOC_NO] || '').trim() === docNo) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) return { ok: false, error: 'ไม่พบเอกสาร: ' + docNo };

    const row = data[rowIndex];

    // Resolve final values (use update if provided, else keep current)
    const newStartDate = updates.startDate !== undefined ? updates.startDate : row[COL.START_DATE];
    const newEndDate = updates.endDate !== undefined ? updates.endDate : row[COL.END_DATE];
    const newAmount = updates.amount !== undefined ? Number(updates.amount) : Number(row[COL.AMOUNT]);

    // Validate dates
    const startDt = new Date(newStartDate);
    const endDt = new Date(newEndDate);
    if (isNaN(startDt.getTime())) return { ok: false, error: 'วันที่เริ่มต้นไม่ถูกต้อง' };
    if (isNaN(endDt.getTime())) return { ok: false, error: 'วันที่สิ้นสุดไม่ถูกต้อง' };
    if (startDt > endDt) return { ok: false, error: 'วันที่เริ่มต้นต้อง ≤ วันที่สิ้นสุด' };

    // Validate amount
    if (isNaN(newAmount) || newAmount <= 0) return { ok: false, error: 'จำนวนเงินต้องมากกว่า 0' };

    // Build updated row (copy then override)
    const updatedRow = row.slice();
    if (updates.company !== undefined) updatedRow[COL.COMPANY] = String(updates.company);
    if (updates.postingDate !== undefined) updatedRow[COL.POSTING_DATE] = new Date(updates.postingDate);
    if (updates.docDate !== undefined) updatedRow[COL.DOC_DATE] = new Date(updates.docDate);
    if (updates.desc !== undefined || updates.description !== undefined) {
      updatedRow[COL.DESC] = String(updates.desc || updates.description);
    }
    if (updates.plate !== undefined) updatedRow[COL.PLATE] = String(updates.plate);
    if (updates.io !== undefined) updatedRow[COL.IO] = String(updates.io);
    if (updates.gl !== undefined || updates.glPrepaid !== undefined) {
      updatedRow[COL.GL_PREPAID] = String(updates.gl || updates.glPrepaid);
    }
    if (updates.costCenter !== undefined) updatedRow[COL.COST_CENTER] = String(updates.costCenter);
    if (updates.startDate !== undefined) updatedRow[COL.START_DATE] = newStartDate;
    if (updates.endDate !== undefined) updatedRow[COL.END_DATE] = newEndDate;
    if (updates.amount !== undefined) updatedRow[COL.AMOUNT] = newAmount;
    if (updates.docNo2 !== undefined) updatedRow[COL.DOC_NO_2] = String(updates.docNo2);
    
    // Re-lookup GL name and Cost name if changed
    if (updates.gl !== undefined || updates.glPrepaid !== undefined || updates.costCenter !== undefined) {
      const items = readInputData_();
      const glKey = String(updates.gl || updates.glPrepaid || row[COL.GL_PREPAID]);
      const ccKey = String(updates.costCenter || row[COL.COST_CENTER]);
      const names = lookupNames_(items, glKey, ccKey);
      if (names.glName) updatedRow[COL.GL_NAME] = names.glName;
      if (names.costName) updatedRow[COL.COST_NAME] = names.costName;
    }

    // Write back (sheet rows: 1 = header, data starts at row 2; rowIndex is 0-based)
    sheet.getRange(rowIndex + 1, 1, 1, updatedRow.length).setValues([updatedRow]);

    // Log the action
    logAction('CRUD', 'แก้ไขเอกสาร: ' + docNo);
    
    // Invalidate all caches
    invalidateInputCache();
    invalidateAmortCache();
    try { CacheService.getScriptCache().remove('dash_v2'); } catch(e) {}
    updateTimestampKeeper_();

    return { ok: true, message: 'อัปเดตเอกสาร ' + docNo + ' เรียบร้อย' };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Delete a prepaid record — clears all 15 columns for the matching row
 * @param {string} docNo - Document number to delete
 * @returns {Object} {ok, message}
 */
function deletePrepaidRecord(docNo) {
  try {
    if (!docNo) return { ok: false, error: 'กรุณาระบุเลขที่ DOC' };

    const ss = SpreadsheetApp.openById(getInputSheetId_());
    const sheet = ss.getSheetByName(CONFIG.INPUT_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'ไม่พบ Sheet: ' + CONFIG.INPUT_SHEET_NAME };

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return { ok: false, error: 'ไม่มีข้อมูลใน Sheet' };

    // Find row by docNo
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.DOC_NO] || '').trim() === docNo) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) return { ok: false, error: 'ไม่พบเอกสาร: ' + docNo };

    // Check if item has been amortized — check by looking for amort entries
    // We'll check by computing the amortization schedule; if accumulated > 0, amortization has run
    const item = data[rowIndex];
    const checkItem = {
      docNo: String(item[COL.DOC_NO] || ''),
      docNo2: String(item[COL.DOC_NO_2] || ''),
      description: String(item[COL.DESC] || ''),
      plate: String(item[COL.PLATE] || ''),
      io: String(item[COL.IO] || ''),
      glPrepaid: String(item[COL.GL_PREPAID] || ''),
      glName: String(item[COL.GL_NAME] || ''),
      costCenter: String(item[COL.COST_CENTER] || ''),
      costName: String(item[COL.COST_NAME] || ''),
      startDate: item[COL.START_DATE],
      endDate: item[COL.END_DATE],
      amount: Number(item[COL.AMOUNT]) || 0
    };
    
    let hasBeenAmortized = false;
    try {
      const schedule = calculateAmortization_(checkItem, null);
      if (schedule.length > 0) {
        const last = schedule[schedule.length - 1];
        if (last.accumulated > 0) hasBeenAmortized = true;
      }
    } catch(e) {
      // If calculation fails, we still proceed but warn
    }

    // Clear the row (set all 15 columns to empty string)
    const emptyRow = [];
    for (let c = 0; c < 15; c++) emptyRow.push('');
    sheet.getRange(rowIndex + 1, 1, 1, 15).setValues([emptyRow]);

    // Log the action
    logAction('CRUD', 'Deleted document: ' + docNo + (hasBeenAmortized ? ' (has amortization entries)' : ''));
    
    // Invalidate all caches
    invalidateInputCache();
    invalidateAmortCache();
    try { CacheService.getScriptCache().remove('dash_v2'); } catch(e) {}
    updateTimestampKeeper_();
    
    return {
      ok: true,
      message: 'Deleted document ' + docNo + ' successfully' + (hasBeenAmortized ? ' (Note: this document has amortization entries)' : ''),
      hasBeenAmortized: hasBeenAmortized
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get all prepaid records for CRUD table with status
 * @returns {Object} {ok, records: [...]}
 */
function getCrudRecords() {
  try {
    const items = readInputData_();
    const now = new Date();
    const records = items.map(function(it) {
      const start = new Date(it.startDate);
      const end = new Date(it.endDate);
      const datesValid = !isNaN(start.getTime()) && !isNaN(end.getTime());
      let status = '';
      if (datesValid) {
        if (end < now) status = 'Expired';
        else if (start > now) status = 'Future';
        else status = 'Active';
      }
      
      // Calculate consumed %
      let consumed = 0;
      let amortized = 0;
      let remaining = it.amount || 0;
      try {
        const schedule = calculateAmortization_(it, null);
        if (schedule.length > 0) {
          const last = schedule[schedule.length - 1];
          amortized = last.accumulated;
          remaining = last.remaining;
          if (it.amount > 0) consumed = Math.round(amortized / it.amount * 100);
        }
      } catch(e) {}
      
      return {
        docNo: it.docNo,
        docNo2: it.docNo2 || '',
        company: it.company || '',
        postingDate: fmtDate_(it.postingDate),
        docDate: fmtDate_(it.docDate),
        description: it.description || '',
        plate: it.plate || '',
        io: it.io || '',
        glPrepaid: it.glPrepaid || '',
        glName: it.glName || '',
        costCenter: it.costCenter || '',
        costName: it.costName || '',
        startDate: fmtDate_(it.startDate),
        endDate: fmtDate_(it.endDate),
        amount: it.amount || 0,
        status: status,
        amortized: Math.round(amortized * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        consumed: consumed
      };
    });
    
    return { ok: true, records: records, count: records.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
