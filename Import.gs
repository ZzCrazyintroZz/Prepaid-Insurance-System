// ================= CSV/EXCEL IMPORT =================
// APPROACH B: Paste CSV text into TextArea
// All functions return {ok, ...} pattern
// Uses logAction for audit trail

// ================= FUZZY COLUMN MAPPING =================
var IMPORT_FIELDS_ = [
  { id: 'company',     labels: ['company', 'คู่สัญญา', 'บริษัท', 'Company', 'COMPANY', 'บริษัท/คู่สัญญา', 'บริษัทคู่สัญญา'] },
  { id: 'postingDate', labels: ['posting date', 'postingdate', 'วันที่ลงบัญชี', 'Posting Date', 'POSTING_DATE', 'PostingDate', 'ลงบัญชี', 'วันที่ลงบัญชี'] },
  { id: 'docDate',     labels: ['doc date', 'docdate', 'วันที่เอกสาร', 'Doc Date', 'DOC_DATE', 'DocDate', 'เอกสาร', 'วันที่เอกสาร'] },
  { id: 'docNo',       labels: ['doc no', 'docno', 'เลขที่', 'เลขที่ doc', 'Doc No', 'DOC_NO', 'DocNo', 'เลขที่เอกสาร', 'เลขที่ DOC', 'เลขที่ doc'] },
  { id: 'docNo2',      labels: ['doc no 2', 'docno2', 'เลขที่เพิ่มเติม', 'Doc No 2', 'DOC_NO_2', 'DocNo2', 'เลขที่ 2'] },
  { id: 'description', labels: ['description', 'desc', 'รายการ', 'รายละเอียด', 'Description', 'DESC', 'คำอธิบาย', 'รายการ', 'รายละเอียดค่าใช้จ่าย'] },
  { id: 'plate',       labels: ['plate', 'ทะเบียน', 'ทะเบียนรถ', 'Plate', 'PLATE', 'ทะเบียนรถยนต์', 'ป้ายทะเบียน'] },
  { id: 'io',          labels: ['io', 'I/O', 'IO', 'io', 'รหัส io', 'รหัส IO', 'debit key'] },
  { id: 'glPrepaid',   labels: ['gl', 'gl prepaid', 'glprepaid', 'GL', 'GL_PREPAID', 'GL Prepaid', 'glPrepaid', 'รหัส gl', 'รหัส GL', 'credit key'] },
  { id: 'glName',      labels: ['gl name', 'glname', 'ชื่อ gl', 'GL Name', 'GL_NAME', 'GLName', 'ชื่อ GL'] },
  { id: 'costCenter',  labels: ['cost center', 'costcenter', 'cc', 'Cost Center', 'COST_CENTER', 'costCenter', 'ศูนย์ต้นทุน', 'CC', 'รหัสศูนย์ต้นทุน', 'ศูนย์ต้นทุน'] },
  { id: 'costName',    labels: ['cost name', 'costname', 'ชื่อ cc', 'Cost Name', 'COST_NAME', 'costName', 'ชื่อศูนย์ต้นทุน', 'ชื่อ Cost Center'] },
  { id: 'startDate',   labels: ['start date', 'startdate', 'start', 'วันที่เริ่มต้น', 'Start Date', 'START_DATE', 'startDate', 'วันที่เริ่ม', 'เริ่มต้น', 'วันที่เริ่ม'] },
  { id: 'endDate',     labels: ['end date', 'enddate', 'end', 'วันที่สิ้นสุด', 'End Date', 'END_DATE', 'endDate', 'วันที่สิ้น', 'สิ้นสุด', 'วันที่สิ้นสุด'] },
  { id: 'amount',      labels: ['amount', 'amt', 'จำนวนเงิน', 'Amount', 'AMOUNT', 'Amt', 'ยอดเงิน', 'จำนวน', 'ราคา', 'มูลค่า'] }
];

/**
 * Normalize a string for fuzzy matching — lowercase, trim, collapse spaces
 */
function norm_(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[_\-.]+/g, ' ');
}

/**
 * Fuzzy-match a CSV header to a system field
 * Returns the field ID if matched, null otherwise
 */
function fuzzyMatchField_(header) {
  var h = norm_(header);
  if (!h) return null;
  
  for (var i = 0; i < IMPORT_FIELDS_.length; i++) {
    var field = IMPORT_FIELDS_[i];
    for (var j = 0; j < field.labels.length; j++) {
      var label = norm_(field.labels[j]);
      // Exact match
      if (h === label) return field.id;
      // Header contains label or label contains header (if reasonable length)
      if (h.length >= 2 && (h.indexOf(label) !== -1 || label.indexOf(h) !== -1)) {
        return field.id;
      }
    }
  }
  return null;
}

/**
 * Detect delimiter: comma vs tab
 */
function detectDelimiter_(firstLine) {
  if (!firstLine) return ',';
  var tabCount = (firstLine.match(/\t/g) || []).length;
  var commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? '\t' : ',';
}

/**
 * Parse a CSV line respecting quoted fields
 */
function parseCSVLine_(line, delimiter) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

// ================= 1. PARSE CSV =================

/**
 * Parse CSV text content
 * @param {string} csvText - Raw CSV text
 * @returns {Object} {ok, headers, rows, totalRows, validRows, errorRows, delimiter}
 */
function parseCSVData(csvText) {
  try {
    if (!csvText || String(csvText).trim() === '') {
      return { ok: false, error: 'CSV text is empty' };
    }
    
    var text = String(csvText);
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim() !== ''; });
    
    if (lines.length < 2) {
      return { ok: false, error: 'CSV must have at least a header row and one data row' };
    }
    
    // Detect delimiter
    var delimiter = detectDelimiter_(lines[0]);
    
    // Parse header
    var headers = parseCSVLine_(lines[0], delimiter);
    var numCols = headers.length;
    
    // Parse data rows
    var rows = [];
    var errorRows = [];
    
    for (var i = 1; i < lines.length; i++) {
      var fields = parseCSVLine_(lines[i], delimiter);
      // Pad or truncate to match header count
      while (fields.length < numCols) fields.push('');
      fields = fields.slice(0, numCols);
      rows.push(fields);
    }
    
    return {
      ok: true,
      headers: headers,
      rows: rows,
      totalRows: rows.length,
      validRows: rows.length,
      errorRows: 0,
      delimiter: delimiter === '\t' ? 'tab' : 'comma'
    };
    
  } catch (e) {
    return { ok: false, error: 'Parse error: ' + e.message };
  }
}

// ================= 2. IMPORT PREVIEW =================

/**
 * Preview CSV data with auto-column-mapping
 * @param {string} csvText - Raw CSV text
 * @returns {Object} {ok, headers, mappedColumns, previewRows, totalRows, warnings}
 */
function getImportPreview(csvText) {
  try {
    var parsed = parseCSVData(csvText);
    if (!parsed.ok) return parsed;
    
    // Auto-map columns
    var mappedColumns = {};
    var unmappedHeaders = [];
    var warnings = [];
    
    for (var i = 0; i < parsed.headers.length; i++) {
      var header = parsed.headers[i];
      var fieldId = fuzzyMatchField_(header);
      if (fieldId) {
        mappedColumns[fieldId] = { col: i, header: header, matched: true };
      } else {
        unmappedHeaders.push(header);
        warnings.push('Unmapped column "' + header + '" — will be skipped');
      }
    }
    
    // Check which required fields are missing
    var requiredFields = ['company', 'io', 'glPrepaid', 'startDate', 'endDate', 'amount'];
    var missingRequired = [];
    for (var r = 0; r < requiredFields.length; r++) {
      if (!mappedColumns[requiredFields[r]]) {
        missingRequired.push(requiredFields[r]);
      }
    }
    
    if (missingRequired.length > 0) {
      warnings.push('Missing required fields: ' + missingRequired.join(', ') + 
        ' — please map them manually');
    }
    
    // Build preview rows (first 10)
    var previewRows = [];
    for (var i = 0; i < Math.min(parsed.rows.length, 10); i++) {
      var previewRow = {};
      for (var fieldId in mappedColumns) {
        var col = mappedColumns[fieldId].col;
        previewRow[fieldId] = parsed.rows[i][col] || '';
      }
      previewRows.push(previewRow);
    }
    
    // Build column mapping options for the frontend
    var systemFields = IMPORT_FIELDS_.map(function(f) { return f.id; });
    
    return {
      ok: true,
      headers: parsed.headers,
      mappedColumns: mappedColumns,
      previewRows: previewRows,
      totalRows: parsed.totalRows,
      warnings: warnings,
      systemFields: systemFields,
      delimiter: parsed.delimiter
    };
    
  } catch (e) {
    return { ok: false, error: 'Preview error: ' + e.message };
  }
}

// ================= 3. CONFIRM IMPORT =================

/**
 * Validate a single row value
 */
function validateImportRow_(row, colMap, rowIndex) {
  var errors = [];
  
  var getVal = function(fieldId) {
    if (colMap[fieldId] !== undefined && colMap[fieldId].col !== undefined) {
      return String(row[colMap[fieldId].col] || '').trim();
    }
    return '';
  };
  
  // Required fields
  var company = getVal('company');
  var io = getVal('io');
  var glPrepaid = getVal('glPrepaid');
  var startDateStr = getVal('startDate');
  var endDateStr = getVal('endDate');
  var amountStr = getVal('amount');
  
  if (!company) errors.push('company is empty');
  if (!io) errors.push('io is empty');
  if (!glPrepaid) errors.push('glPrepaid is empty');
  if (!startDateStr) errors.push('startDate is empty');
  if (!endDateStr) errors.push('endDate is empty');
  if (!amountStr) errors.push('amount is empty');
  
  // Validate dates
  if (startDateStr) {
    var sd = parseDate_(startDateStr);
    if (isNaN(sd.getTime())) errors.push('startDate "' + startDateStr + '" is not a valid date');
  }
  if (endDateStr) {
    var ed = parseDate_(endDateStr);
    if (isNaN(ed.getTime())) errors.push('endDate "' + endDateStr + '" is not a valid date');
  }
  if (startDateStr && endDateStr) {
    var sd2 = parseDate_(startDateStr);
    var ed2 = parseDate_(endDateStr);
    if (!isNaN(sd2.getTime()) && !isNaN(ed2.getTime()) && sd2 > ed2) {
      errors.push('startDate must be <= endDate');
    }
  }
  
  // Validate amount
  var amt = Number(amountStr);
  if (amountStr && (isNaN(amt) || amt <= 0)) {
    errors.push('amount must be > 0');
  }
  
  return errors;
}

/**
 * Parse date from various formats
 */
function parseDate_(str) {
  str = String(str || '').trim();
  if (!str) return new Date(NaN);
  
  // Try ISO format YYYY-MM-DD
  var d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  
  // Try DD/MM/YYYY or DD-MM-YYYY (Thai format)
  var parts = str.split(/[/\-.]/);
  if (parts.length === 3) {
    // Try assuming DD/MM/YYYY
    var d2 = new Date(parts[2], parts[1] - 1, parts[0]);
    if (!isNaN(d2.getTime())) return d2;
    // Try MM/DD/YYYY
    var d3 = new Date(parts[2], parts[0] - 1, parts[1]);
    if (!isNaN(d3.getTime())) return d3;
  }
  
  // Try DD Month YYYY (e.g., 01 Jan 2024)
  var d4 = new Date(str);
  if (!isNaN(d4.getTime())) return d4;
  
  return new Date(NaN);
}

/**
 * Confirm and execute the import
 * @param {string} csvText - Raw CSV text
 * @param {Object} columnMapping - {fieldId: headerName} mapping override
 * @returns {Object} {ok, imported, skipped, errors, total}
 */
function confirmImport(csvText, columnMapping) {
  try {
    // Parse CSV
    var parsed = parseCSVData(csvText);
    if (!parsed.ok) return parsed;
    
    // Get auto-mapped columns
    var preview = getImportPreview(csvText);
    if (!preview.ok) return preview;
    
    // Apply user-provided columnMapping override
    var colMap = {}; // {fieldId: {col: index, header: name}}
    
    // First, apply auto-mapping
    for (var fieldId in preview.mappedColumns) {
      colMap[fieldId] = {
        col: preview.mappedColumns[fieldId].col,
        header: preview.mappedColumns[fieldId].header
      };
    }
    
    // Then override with user mapping: columnMapping = {fieldId: "Header Name"}
    // Support both header names (strings) and column indices (numbers)
    if (columnMapping && typeof columnMapping === 'object') {
      for (var fieldId in columnMapping) {
        var headerName = columnMapping[fieldId];
        if (headerName === null || headerName === undefined || headerName === '') {
          // User explicitly unmapped this field
          delete colMap[fieldId];
          continue;
        }
        
        // If it's a number (column index), use it directly
        if (typeof headerName === 'number' || /^\d+$/.test(String(headerName))) {
          var colIdx = typeof headerName === 'number' ? headerName : parseInt(headerName, 10);
          if (colIdx >= 0 && colIdx < parsed.headers.length) {
            colMap[fieldId] = { col: colIdx, header: parsed.headers[colIdx] };
          }
          continue;
        }
        
        // Otherwise treat it as a header name string
        // Find the column index for this header name
        var found = false;
        for (var h = 0; h < parsed.headers.length; h++) {
          if (String(parsed.headers[h]).trim() === String(headerName).trim()) {
            colMap[fieldId] = { col: h, header: parsed.headers[h] };
            found = true;
            break;
          }
        }
        if (!found) {
          // Try case-insensitive match
          var hn = String(headerName).trim().toLowerCase();
          for (var h2 = 0; h2 < parsed.headers.length; h2++) {
            if (String(parsed.headers[h2]).trim().toLowerCase() === hn) {
              colMap[fieldId] = { col: h2, header: parsed.headers[h2] };
              found = true;
              break;
            }
          }
        }
        // If not found, skip this field mapping
      }
    }
    
    // Validate required fields are mapped
    var requiredFields = ['company', 'io', 'glPrepaid', 'amount'];
    var missingRequired = [];
    for (var r = 0; r < requiredFields.length; r++) {
      if (!colMap[requiredFields[r]] || colMap[requiredFields[r]].col === undefined) {
        missingRequired.push(requiredFields[r]);
      }
    }
    if (missingRequired.length > 0) {
      return { ok: false, error: 'Missing required field mappings: ' + missingRequired.join(', ') };
    }
    
    // Process all rows
    var imported = 0;
    var skipped = 0;
    var errors = [];
    var rowsToInsert = [];
    
    // Pre-read existing items for name lookups
    var existingItems = [];
    try { existingItems = readInputData_(); } catch(e) {}
    
    for (var i = 0; i < parsed.rows.length; i++) {
      var row = parsed.rows[i];
      var rowNum = i + 2; // +2 for header (row 1) and 0-based index
      
      // Validate
      var rowErrors = validateImportRow_(row, colMap, i);
      if (rowErrors.length > 0) {
        skipped++;
        errors.push({ row: rowNum, reason: rowErrors.join('; ') });
        continue;
      }
      
      // Extract values
      var getVal = function(fieldId) {
        if (colMap[fieldId] !== undefined && colMap[fieldId].col !== undefined) {
          return String(row[colMap[fieldId].col] || '').trim();
        }
        return '';
      };
      
      var company = getVal('company');
      var postingDate = getVal('postingDate') || getVal('docDate') || new Date().toISOString().split('T')[0];
      var docDate = getVal('docDate') || postingDate;
      var description = getVal('description');
      var plate = getVal('plate');
      var io = getVal('io');
      var glPrepaid = getVal('glPrepaid');
      var costCenter = getVal('costCenter');
      var startDateStr = getVal('startDate');
      var endDateStr = getVal('endDate');
      var amountStr = getVal('amount');
      
      // Parse dates
      var startDt = parseDate_(startDateStr);
      var endDt = parseDate_(endDateStr);
      
      // Parse amount
      var amount = Number(amountStr.replace(/[,\s]/g, '')) || 0;
      
      // Generate unique Doc No for new records
      var docNo = getVal('docNo');
      if (!docNo) {
        // Auto-generate
        var genResult = generateDocNo();
        if (genResult.ok) {
          docNo = genResult.docNo;
        } else {
          docNo = 'IMP-' + new Date().getTime() + '-' + pad2_(i + 1);
        }
      }
      var docNo2 = getVal('docNo2') || docNo;
      
      // Lookup names
      var names = lookupNames_(existingItems, glPrepaid, costCenter);
      
      // Build row (15 columns matching COL constants)
      var newRow = [
        company,                         // A: COMPANY
        postingDate ? parseDate_(postingDate) : startDt,  // B: POSTING_DATE
        docDate ? parseDate_(docDate) : startDt,           // C: DOC_DATE
        docNo,                           // D: DOC_NO
        docNo2,                          // E: DOC_NO_2
        description,                     // F: DESC
        plate,                           // G: PLATE
        io,                              // H: IO
        glPrepaid,                       // I: GL_PREPAID
        names.glName,                    // J: GL_NAME
        costCenter,                      // K: COST_CENTER
        names.costName,                  // L: COST_NAME
        startDt,                         // M: START_DATE
        endDt,                           // N: END_DATE
        amount                           // O: AMOUNT
      ];
      
      rowsToInsert.push(newRow);
      imported++;
    }
    
    // If no rows to import, return early
    if (rowsToInsert.length === 0) {
      return {
        ok: true,
        imported: 0,
        skipped: skipped,
        errors: errors,
        total: parsed.rows.length,
        message: 'No valid rows to import (' + skipped + ' skipped)'
      };
    }
    
    // Insert into source sheet
    var ss = SpreadsheetApp.openById(getInputSheetId_());
    var sheet = ss.getSheetByName(CONFIG.INPUT_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'ไม่พบ Sheet: ' + CONFIG.INPUT_SHEET_NAME };
    
    // Get last row with data
    var lastRow = sheet.getLastRow();
    var startRow = lastRow + 1;
    
    // Write all rows at once
    if (rowsToInsert.length > 0) {
      sheet.getRange(startRow, 1, rowsToInsert.length, 15).setValues(rowsToInsert);
    }
    
    // Log the action
    logAction('Import', 'Imported ' + imported + ' records from CSV (' + skipped + ' skipped, ' + errors.length + ' errors)');
    
    // Invalidate all caches
    invalidateInputCache();
    invalidateAmortCache();
    try { CacheService.getScriptCache().remove('dash_v2'); } catch(e) {}
    try { CacheService.getScriptCache().remove('avail_periods_v2'); } catch(e) {}
    
    // Record import history
    recordImportHistory_(imported, skipped, errors.length);
    
    return {
      ok: true,
      imported: imported,
      skipped: skipped,
      errors: errors,
      total: parsed.rows.length,
      message: 'Imported ' + imported + ' records successfully' + (skipped > 0 ? ' (' + skipped + ' skipped)' : '')
    };
    
  } catch (e) {
    return { ok: false, error: 'Import error: ' + e.message };
  }
}

// ================= 4. IMPORT HISTORY =================

var IMPORT_HISTORY_KEY_ = 'import_history_v2';
var MAX_HISTORY_ITEMS_ = 50;

function recordImportHistory_(imported, skipped, errors) {
  try {
    var props = PropertiesService.getScriptProperties();
    var historyStr = props.getProperty(IMPORT_HISTORY_KEY_);
    var history = [];
    if (historyStr) {
      try { history = JSON.parse(historyStr); } catch(e) {}
    }
    
    history.push({
      timestamp: new Date().toISOString(),
      imported: imported,
      skipped: skipped,
      errors: errors,
      user: Session.getActiveUser().getEmail()
    });
    
    // Trim to max
    if (history.length > MAX_HISTORY_ITEMS_) {
      history = history.slice(history.length - MAX_HISTORY_ITEMS_);
    }
    
    props.setProperty(IMPORT_HISTORY_KEY_, JSON.stringify(history));
  } catch(e) {
    Logger.log('recordImportHistory_ error: ' + e.message);
  }
}

/**
 * Get past import logs
 * @returns {Object} {ok, history: [...]}
 */
function getImportHistory() {
  try {
    var props = PropertiesService.getScriptProperties();
    var historyStr = props.getProperty(IMPORT_HISTORY_KEY_);
    var history = [];
    if (historyStr) {
      try { history = JSON.parse(historyStr); } catch(e) {}
    }
    return { ok: true, history: history };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= 5. COLUMN MAP TEMPLATE =================

/**
 * Returns default column mapping template
 * @returns {Object} {ok, template: {...}}
 */
function getColumnMapTemplate() {
  try {
    return {
      ok: true,
      template: {
        company: 'Company / คู่สัญญา',
        postingDate: 'Posting Date / วันที่ลงบัญชี',
        docDate: 'Doc Date / วันที่เอกสาร',
        docNo: 'Doc No / เลขที่เอกสาร',
        docNo2: 'Doc No 2 / เลขที่เพิ่มเติม',
        description: 'Description / รายการ',
        plate: 'Plate / ทะเบียนรถ',
        io: 'IO / รหัส IO',
        glPrepaid: 'GL Prepaid / รหัส GL',
        costCenter: 'Cost Center / ศูนย์ต้นทุน',
        startDate: 'Start Date / วันที่เริ่มต้น',
        endDate: 'End Date / วันที่สิ้นสุด',
        amount: 'Amount / จำนวนเงิน'
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
