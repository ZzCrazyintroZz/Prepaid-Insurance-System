// ================= C2: PERIOD-CLOSE WORKFLOW =================

var PC_STATE_KEY = 'period_close_state_v1';
var PC_CHECKLIST_KEY = 'period_checklist_v1';

function getPeriodStatusData_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(PC_STATE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return {};
}

function savePeriodStatusData_(data) {
  PropertiesService.getScriptProperties().setProperty(PC_STATE_KEY, JSON.stringify(data));
}

function getChecklistData_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(PC_CHECKLIST_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return {};
}

function saveChecklistData_(data) {
  PropertiesService.getScriptProperties().setProperty(PC_CHECKLIST_KEY, JSON.stringify(data));
}

/**
 * Get period status (closed / open) plus checklist progress
 * @param {string} period - YYYY-MM
 * @returns {Object} {ok, period, isClosed, closedBy, closedAt, checklist, notes}
 */
function getPeriodStatus(period) {
  try {
    if (!period) throw new Error('กรุณาระบุงวด');
    var state = getPeriodStatusData_();
    var p = state[period] || { isClosed: false, closedBy: '', closedAt: '', notes: '' };
    var checklist = getChecklistData_();
    var cl = checklist[period] || { preChecker: false, amortRun: false, sapExported: false, voidBatchComplete: false };
    return {
      ok: true,
      period: period,
      isClosed: p.isClosed,
      closedBy: p.closedBy,
      closedAt: p.closedAt,
      checklist: cl,
      notes: p.notes || ''
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get all period statuses with checklist progress
 * @returns {Object} {ok, statuses: [{period, isClosed, ...}]}
 */
function getAllPeriodStatuses() {
  try {
    var state = getPeriodStatusData_();
    var checklist = getChecklistData_();
    var periods = {};
    for (var p in state) periods[p] = true;
    for (var p in checklist) periods[p] = true;

    var result = [];
    for (var p in periods) {
      var s = state[p] || { isClosed: false, closedBy: '', closedAt: '', notes: '' };
      var cl = checklist[p] || { preChecker: false, amortRun: false, sapExported: false, voidBatchComplete: false };
      result.push({
        period: p,
        isClosed: s.isClosed,
        closedBy: s.closedBy,
        closedAt: s.closedAt,
        checklist: cl,
        notes: s.notes || ''
      });
    }
    result.sort(function(a,b){ return b.period.localeCompare(a.period); });
    return { ok: true, statuses: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Close (lock) a period — validates checklist items first
 * @param {string} period - YYYY-MM
 * @param {string} notes - Optional notes
 * @returns {Object} {ok, message, period, closedBy}
 */
function closePeriod(period, notes) {
  try {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return { ok: false, error: 'รูปแบบงวดไม่ถูกต้อง (YYYY-MM)' };
    }
    var state = getPeriodStatusData_();
    if (state[period] && state[period].isClosed) {
      return { ok: false, error: 'งวด ' + period + ' ถูกปิดแล้ว' };
    }
    // Check checklist
    var checklist = getChecklistData_();
    var cl = checklist[period] || {};
    var missing = [];
    if (!cl.preChecker) missing.push('Pre-Upload Checker');
    if (!cl.amortRun) missing.push('Amortization');
    if (!cl.sapExported) missing.push('SAP JE');
    if (!cl.voidBatchComplete) missing.push('Void Batch Complete');

    if (missing.length > 0) {
      return {
        ok: false,
        error: 'ต้องดำเนินการต่อไปนี้ก่อนปิดงวด: ' + missing.join(', '),
        missing: missing
      };
    }
    // Close
    var user = Session.getActiveUser().getEmail();
    state[period] = {
      isClosed: true,
      closedBy: user,
      closedAt: new Date().toISOString(),
      notes: notes || ''
    };
    savePeriodStatusData_(state);
    logAction('PeriodClose', 'ปิดงวด ' + period + ' โดย ' + user + (notes ? ' — ' + notes : ''));
    return { ok: true, message: 'ปิดงวด ' + period + ' เรียบร้อย', period: period, closedBy: user, closedAt: state[period].closedAt };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Reopen a previously closed period (admin)
 * @param {string} period - YYYY-MM
 * @returns {Object} {ok, message}
 */
function reopenPeriod(period) {
  try {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return { ok: false, error: 'รูปแบบงวดไม่ถูกต้อง (YYYY-MM)' };
    }
    var state = getPeriodStatusData_();
    if (!state[period] || !state[period].isClosed) {
      return { ok: false, error: 'งวด ' + period + ' ยังไม่ได้ปิด' };
    }
    state[period].isClosed = false;
    state[period].notes = (state[period].notes || '') + ' | Reopened at ' + new Date().toISOString();
    savePeriodStatusData_(state);
    var user = Session.getActiveUser().getEmail();
    logAction('PeriodClose', 'เปิดงวด ' + period + ' อีกครั้ง โดย ' + user);
    return { ok: true, message: 'เปิดงวด ' + period + ' อีกครั้งเรียบร้อย' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get close checklist for a period (passive read)
 * @param {string} period - YYYY-MM
 * @returns {Object} {ok, period, items, allDone}
 */
function getCloseChecklist(period) {
  try {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      period = new Date().getFullYear() + '-' + pad2_(new Date().getMonth() + 1);
    }
    var checklist = getChecklistData_();
    var cl = checklist[period] || { preChecker: false, amortRun: false, sapExported: false, voidBatchComplete: false };
    var allDone = cl.preChecker && cl.amortRun && cl.sapExported && cl.voidBatchComplete;
    return {
      ok: true,
      period: period,
      items: [
        { label: 'Pre-Upload Checker', key: 'preChecker', done: cl.preChecker, detail: cl.preChecker ? '✅ ผ่านการตรวจสอบ' : '❌ ยังไม่ได้ตรวจสอบ' },
        { label: 'Amortization Run', key: 'amortRun', done: cl.amortRun, detail: cl.amortRun ? '✅ ดำเนินการแล้ว' : '❌ ยังไม่ได้รัน' },
        { label: 'SAP JE Created', key: 'sapExported', done: cl.sapExported, detail: cl.sapExported ? '✅ สร้างแล้ว' : '❌ ยังไม่ได้สร้าง' },
        { label: 'Void Batch Complete', key: 'voidBatchComplete', done: cl.voidBatchComplete, detail: cl.voidBatchComplete ? '✅ ดำเนินการแล้ว' : '❌ ยังไม่ได้ดำเนินการ' }
      ],
      allDone: allDone
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Run all close checklist checks and save results
 * @param {string} period - YYYY-MM
 * @returns {Object} {ok, period, preChecker, amortRun, sapExported, voidBatchComplete, allDone, items}
 */
function runCloseChecklist(period) {
  try {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      period = new Date().getFullYear() + '-' + pad2_(new Date().getMonth() + 1);
    }
    var cl = { preChecker: false, amortRun: false, sapExported: false, voidBatchComplete: false };

    // 1. Pre-Upload Checker
    try {
      var checkResult = runPreUploadCheck(period);
      cl.preChecker = checkResult && checkResult.ok && checkResult.status === 'PASS';
    } catch(e) {}

    // 2. Amortization Run
    try {
      var amortResult = runMonthEndAmortization(period);
      cl.amortRun = amortResult && amortResult.ok;
    } catch(e) {}

    // 3. SAP JE — check if exported sheet exists
    try {
      var ss = SpreadsheetApp.openById(getSapTemplateId_());
      var sapSheet = ss.getSheetByName('SAP_JE_' + period);
      cl.sapExported = sapSheet !== null && sapSheet.getLastRow() > 1;
    } catch(e) {}

    // 4. Void Batch — check log
    try {
      var ss2 = SpreadsheetApp.openById(getSapTemplateId_());
      var voidLog = ss2.getSheetByName('_VOID_LOG');
      cl.voidBatchComplete = voidLog !== null && voidLog.getLastRow() > 1;
    } catch(e) {}

    // Save checklist state
    var checklist = getChecklistData_();
    checklist[period] = cl;
    saveChecklistData_(checklist);

    return {
      ok: true,
      period: period,
      preChecker: cl.preChecker,
      amortRun: cl.amortRun,
      sapExported: cl.sapExported,
      voidBatchComplete: cl.voidBatchComplete,
      allDone: cl.preChecker && cl.amortRun && cl.sapExported && cl.voidBatchComplete,
      items: [
        { label: 'Pre-Upload Checker', key: 'preChecker', done: cl.preChecker, detail: cl.preChecker ? '✅ ผ่านการตรวจสอบ' : '❌ ยังไม่ได้ตรวจสอบ' },
        { label: 'Amortization Run', key: 'amortRun', done: cl.amortRun, detail: cl.amortRun ? '✅ ดำเนินการแล้ว' : '❌ ยังไม่ได้รัน' },
        { label: 'SAP JE Created', key: 'sapExported', done: cl.sapExported, detail: cl.sapExported ? '✅ สร้างแล้ว' : '❌ ยังไม่ได้สร้าง' },
        { label: 'Void Batch Complete', key: 'voidBatchComplete', done: cl.voidBatchComplete, detail: cl.voidBatchComplete ? '✅ ดำเนินการแล้ว' : '❌ ยังไม่ได้ดำเนินการ' }
      ]
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Manually mark a checklist item as done
 * @param {string} period - YYYY-MM
 * @param {string} itemKey - preChecker|amortRun|sapExported|voidBatchComplete
 * @returns {Object} {ok, message}
 */
function markChecklistItem(period, itemKey) {
  try {
    if (!period || !itemKey) return { ok: false, error: 'Missing parameters' };
    var validKeys = { preChecker: true, amortRun: true, sapExported: true, voidBatchComplete: true };
    if (!validKeys[itemKey]) return { ok: false, error: 'Invalid item: ' + itemKey };

    var checklist = getChecklistData_();
    if (!checklist[period]) checklist[period] = { preChecker: false, amortRun: false, sapExported: false, voidBatchComplete: false };
    checklist[period][itemKey] = true;
    saveChecklistData_(checklist);
    logAction('PeriodClose', 'Mark checklist ' + itemKey + ' done for ' + period);
    return { ok: true, message: 'Marked ' + itemKey + ' done for ' + period };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
