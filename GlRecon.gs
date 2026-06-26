// ================= C6: GL RECONCILIATION =================

var GL_RECON_KEY = 'gl_recon_data_v1';
var GL_BALANCE_KEY_PREFIX = 'gl_balance_';
var GL_RECON_HISTORY_KEY = 'gl_recon_history_v1';
var GL_RECON_SEQ_KEY = 'gl_recon_seq_v1';

function getGlReconSeq_() {
  var props = PropertiesService.getScriptProperties();
  var seq = Number(props.getProperty(GL_RECON_SEQ_KEY)) || 0;
  seq++;
  props.setProperty(GL_RECON_SEQ_KEY, String(seq));
  return seq;
}

function getGlBalanceData_(period) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(GL_BALANCE_KEY_PREFIX + period);
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return [];
}

function saveGlBalanceData_(period, data) {
  PropertiesService.getScriptProperties().setProperty(GL_BALANCE_KEY_PREFIX + period, JSON.stringify(data));
}

function getReconHistoryData_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(GL_RECON_HISTORY_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return [];
}

function saveReconHistoryData_(data) {
  PropertiesService.getScriptProperties().setProperty(GL_RECON_HISTORY_KEY, JSON.stringify(data));
}

/**
 * Save GL balances for a period
 * @param {string} period - YYYY-MM period
 * @param {Array} glBalances - [{glCode, glName, balance}, ...]
 * @returns {Object} {ok, saved, message}
 */
function saveGLBalance(period, glBalances) {
  try {
    if (!period) return { ok: false, error: 'กรุณาระบุงวด' };
    if (!glBalances || !Array.isArray(glBalances)) {
      return { ok: false, error: 'กรุณาระบุข้อมูล GL Balance' };
    }
    
    // Clean and validate
    var cleaned = [];
    for (var i = 0; i < glBalances.length; i++) {
      var item = glBalances[i];
      if (!item.glCode || String(item.glCode).trim() === '') continue;
      cleaned.push({
        glCode: String(item.glCode).trim(),
        glName: String(item.glName || '').trim(),
        balance: Number(item.balance) || 0
      });
    }
    
    if (cleaned.length === 0) {
      return { ok: false, error: 'ไม่มีข้อมูล GL Balance ที่ถูกต้อง' };
    }
    
    saveGlBalanceData_(period, cleaned);
    logAction('GL Recon', 'Save GL balances for ' + period + ': ' + cleaned.length + ' accounts');
    
    return { ok: true, saved: cleaned.length, message: 'บันทึก GL Balance จำนวน ' + cleaned.length + ' บัญชีสำหรับงวด ' + period };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get saved GL balances for a period
 * @param {string} period - YYYY-MM
 * @returns {Object} {ok, period, balances: [{glCode, glName, balance}]}
 */
function getGLBalances(period) {
  try {
    if (!period) return { ok: false, error: 'กรุณาระบุงวด' };
    var data = getGlBalanceData_(period);
    return { ok: true, period: period, balances: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get all GL accounts used in the system, with amort totals per period
 * @returns {Object} {ok, accounts: [{glCode, glName, totalAmount}]}
 */
function getGLSummary() {
  try {
    var items = readInputData_();
    var glMap = {};
    
    for (var i = 0; i < items.length; i++) {
      var gl = items[i].glPrepaid || 'N/A';
      if (!glMap[gl]) {
        glMap[gl] = { glCode: gl, glName: items[i].glName || '', totalAmount: 0 };
      }
      if (items[i].glName && !glMap[gl].glName) {
        glMap[gl].glName = items[i].glName;
      }
      glMap[gl].totalAmount += Number(items[i].amount) || 0;
    }
    
    var accounts = [];
    var keys = Object.keys(glMap).sort();
    for (var k = 0; k < keys.length; k++) {
      var acc = glMap[keys[k]];
      accounts.push({
        glCode: acc.glCode,
        glName: acc.glName,
        totalAmount: Math.round(acc.totalAmount * 100) / 100
      });
    }
    
    return { ok: true, accounts: accounts };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Calculate system amortization totals grouped by GL for a given period
 * @param {string} period - YYYY-MM
 * @returns {Object} {ok, byGL: [{glCode, glName, amount}]}
 */
function getSystemAmortByGL_(period) {
  var items = readInputData_();
  var glMap = {};
  
  for (var i = 0; i < items.length; i++) {
    var schedule = calculateAmortization_(items[i], period);
    for (var j = 0; j < schedule.length; j++) {
      var s = schedule[j];
      var gl = s.glPrepaid || 'N/A';
      if (!glMap[gl]) {
        glMap[gl] = { glCode: gl, glName: s.glName || '', amount: 0 };
      }
      glMap[gl].amount += s.amortAmount;
      if (s.glName && !glMap[gl].glName) {
        glMap[gl].glName = s.glName;
      }
    }
  }
  
  var result = [];
  var keys = Object.keys(glMap).sort();
  for (var k = 0; k < keys.length; k++) {
    var acc = glMap[keys[k]];
    result.push({
      glCode: acc.glCode,
      glName: acc.glName,
      amount: Math.round(acc.amount * 100) / 100
    });
  }
  
  return result;
}

/**
 * Run GL reconciliation for a period
 * @param {string} period - YYYY-MM
 * @returns {Object} {ok, period, items: [...], summary: {...}}
 */
function runGLReconciliation(period) {
  try {
    if (!period) return { ok: false, error: 'กรุณาระบุงวด' };
    
    // Get saved GL balances
    var glBalances = getGlBalanceData_(period);
    if (!glBalances || glBalances.length === 0) {
      return { ok: false, error: 'กรุณาบันทึก GL Balance สำหรับงวด ' + period + ' ก่อน' };
    }
    
    // Get system amort totals by GL
    var systemByGL = getSystemAmortByGL_(period);
    
    // Build lookup map for system totals
    var systemMap = {};
    for (var i = 0; i < systemByGL.length; i++) {
      systemMap[systemByGL[i].glCode] = systemByGL[i].amount;
    }
    
    // Reconcile: for each GL in saved balances, compare with system
    var items = [];
    var totalGLBalance = 0;
    var totalSystemBalance = 0;
    var totalDifference = 0;
    
    // Track which GLs have been processed
    var processedGLs = {};
    
    for (var i = 0; i < glBalances.length; i++) {
      var gl = glBalances[i];
      var glCode = gl.glCode;
      var glBalance = Number(gl.balance) || 0;
      var systemAmount = systemMap[glCode] || 0;
      var diff = glBalance - systemAmount;
      var absDiff = Math.abs(diff);
      var direction = 'match';
      
      if (absDiff > 0.01) {
        direction = diff > 0 ? 'over' : 'under';
      }
      
      items.push({
        glCode: glCode,
        glName: gl.glName || '',
        glBalance: glBalance,
        systemTotal: systemAmount,
        difference: Math.round(diff * 100) / 100,
        diffPercent: glBalance > 0 ? Math.round(Math.abs(diff) / glBalance * 10000) / 100 : (systemAmount > 0 ? 100 : 0),
        direction: direction
      });
      
      totalGLBalance += glBalance;
      totalSystemBalance += systemAmount;
      totalDifference += diff;
      processedGLs[glCode] = true;
    }
    
    // Add any GLs in system but not in saved balances
    for (var i = 0; i < systemByGL.length; i++) {
      var sysGL = systemByGL[i];
      if (!processedGLs[sysGL.glCode]) {
        items.push({
          glCode: sysGL.glCode,
          glName: sysGL.glName || '',
          glBalance: 0,
          systemTotal: sysGL.amount,
          difference: Math.round(-sysGL.amount * 100) / 100,
          diffPercent: 100,
          direction: 'under'
        });
        totalSystemBalance += sysGL.amount;
        totalDifference -= sysGL.amount;
      }
    }
    
    // Round summary totals
    totalGLBalance = Math.round(totalGLBalance * 100) / 100;
    totalSystemBalance = Math.round(totalSystemBalance * 100) / 100;
    totalDifference = Math.round(totalDifference * 100) / 100;
    
    // Sort items by difference (largest absolute diff first)
    items.sort(function(a, b) {
      return Math.abs(b.difference) - Math.abs(a.difference);
    });
    
    // Save to history
    var seq = getGlReconSeq_();
    var user = Session.getActiveUser().getEmail();
    var reconRecord = {
      id: 'GLR-' + period.replace('-', '') + '-' + String(seq).padStart(3, '0'),
      period: period,
      ranAt: new Date().toISOString(),
      ranBy: user,
      totalGLBalance: totalGLBalance,
      totalSystemBalance: totalSystemBalance,
      totalDifference: totalDifference,
      itemCount: items.length,
      status: Math.abs(totalDifference) < 0.01 ? 'PASS' : (Math.abs(totalDifference) / totalGLBalance * 100 < 1 ? 'WARN' : 'FAIL')
    };
    
    var history = getReconHistoryData_();
    history.push(reconRecord);
    saveReconHistoryData_(history);
    
    logAction('GL Recon', 'Run reconciliation for ' + period + ': ' + items.length + ' items, diff=' + totalDifference + ' by ' + user);
    
    return {
      ok: true,
      period: period,
      items: items,
      totalGLBalance: totalGLBalance,
      totalSystemBalance: totalSystemBalance,
      totalDifference: totalDifference,
      summary: reconRecord
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get reconciliation history with pagination
 * @param {number} limit - Max items (default 50)
 * @param {number} skip - Items to skip (default 0)
 * @returns {Object} {ok, history, total, limit, skip}
 */
function getReconciliationHistory(limit, skip) {
  try {
    limit = limit || 50;
    skip = skip || 0;
    var data = getReconHistoryData_();
    data.sort(function(a, b) { return b.ranAt.localeCompare(a.ranAt); });
    var total = data.length;
    var page = data.slice(skip, skip + limit);
    return { ok: true, history: page, total: total, limit: limit, skip: skip };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Export reconciliation report as text
 * @param {string} period - YYYY-MM
 * @returns {Object} {ok, period, report: string}
 */
function exportReconciliationReport(period) {
  try {
    if (!period) return { ok: false, error: 'กรุณาระบุงวด' };
    
    // Run reconciliation if not already run? Actually we just regenerate from saved data
    var glBalances = getGlBalanceData_(period);
    if (!glBalances || glBalances.length === 0) {
      return { ok: false, error: 'ไม่มีข้อมูล GL Balance สำหรับงวด ' + period };
    }
    
    // Re-run to get latest comparison
    var reconResult = runGLReconciliation(period);
    if (!reconResult.ok) return reconResult;
    
    var lines = [];
    lines.push('=================================================================');
    lines.push('  GL RECONCILIATION REPORT');
    lines.push('  Period: ' + period);
    lines.push('  Generated: ' + new Date().toLocaleString('en-US'));
    lines.push('=================================================================');
    lines.push('');
    lines.push('─── SUMMARY ───');
    lines.push('  Total GL Balance:    ' + reconResult.totalGLBalance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}));
    lines.push('  Total System Amort:  ' + reconResult.totalSystemBalance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}));
    lines.push('  Difference:          ' + reconResult.totalDifference.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}));
    lines.push('');
    lines.push('─── DETAIL ───');
    lines.push('  GL Code  | GL Name' + ' '.repeat(25) + '| GL Balance   | System Total | Difference  | % Diff | Status');
    lines.push('  ' + '-'.repeat(95));
    
    var items = reconResult.items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var statusChar = it.direction === 'match' ? '✓' : (it.direction === 'over' ? '↑' : '↓');
      lines.push(
        '  ' + padRight_(it.glCode, 8) +
        '| ' + padRight_(it.glName, 27) +
        '| ' + padLeft_(fmtMoney_(it.glBalance), 12) +
        ' | ' + padLeft_(fmtMoney_(it.systemTotal), 12) +
        ' | ' + padLeft_(fmtMoney_(it.difference), 10) +
        ' | ' + padLeft_((it.diffPercent || 0).toFixed(1) + '%', 6) +
        ' | ' + statusChar
      );
    }
    
    lines.push('');
    lines.push('─── STATUS: ' + reconResult.summary.status + ' ───');
    lines.push('');
    lines.push('--- End of Report ---');
    
    return {
      ok: true,
      period: period,
      report: lines.join('\n')
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= HELPERS =================

function padRight_(s, len) {
  s = String(s || '');
  while (s.length < len) s += ' ';
  return s;
}

function padLeft_(s, len) {
  s = String(s || '');
  while (s.length < len) s = ' ' + s;
  return s;
}
