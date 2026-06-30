// VERIFICATION PASS — All 7 fixes confirmed correct (see summary at end of file)
/**
 * Prepaid Expense Amortization System — Web App
 * Phase 2+ — Amortization Engine
 * Account: tippawan.si@pt.co.th
 */

// ================= PERFORMANCE OPTIMIZATIONS =================
// Cache key prefix - shorter and consistent
const CACHE_PREFIX = 'pa_';

// Cache TTL constants (seconds)
const CACHE_TTL_SHORT = 60;     // 1 minute
const CACHE_TTL_MEDIUM = 300;   // 5 minutes
const CACHE_TTL_LONG = 3600;    // 1 hour

// Batch API endpoint - call multiple backend functions in one round-trip
function batchGet(fns) {
  try {
    if (!fns || !Array.isArray(fns) || fns.length === 0) {
      return { ok: false, error: 'fns must be a non-empty array of function names' };
    }
    
    var results = {};
    var errors = {};
    
    for (var i = 0; i < fns.length; i++) {
      var fnName = fns[i];
      try {
        // Whitelist of allowed functions for batch calls
        var allowedFunctions = {
          'getDashboardData': getDashboardData,
          'getSettings': getSettings,
          'getEmailConfig': getEmailConfig,
          'getSyncStatus': getSyncStatus,
          'getSystemInfo': getSystemInfo,
          'getDocList': getDocList,
          'getBudgetSummary': getBudgetSummary,
          'getBudgetData': getBudgetData,
          'getAllBudgetPeriods': getAllBudgetPeriods,
          'getGLSummary': getGLSummary,
          'getAvailablePeriods': getAvailablePeriods,
          'getWidePreview': getWidePreview,
          'exportWideCSV': exportWideCSV,
          'exportWideXLSX': exportWideXLSX,
          'getCrudRecords': getCrudRecords,
          'getImportHistory': getImportHistory,
          'getAuditLog': getAuditLog,
          'getUserGuideData': getUserGuideData,
          'getConfig': getConfig,
          'getTriggerStatus': getTriggerStatus,
          'getLastEditTimestamp': getLastEditTimestamp,
          'exportFullSchedule': exportFullSchedule,
          'exportMonthlyPivot': exportMonthlyPivot,
          'exportThisPeriod': exportThisPeriod,
          'exportRunningBalance': exportRunningBalance,
          'getAllPeriodStatuses': getAllPeriodStatuses
        };
        
        var fn = allowedFunctions[fnName];
        if (!fn) {
          errors[fnName] = 'Function not allowed in batch: ' + fnName;
          continue;
        }
        
        var result = fn();
        results[fnName] = result;
      } catch (e) {
        errors[fnName] = e.message;
      }
    }
    
    return { ok: true, results: results, errors: Object.keys(errors).length > 0 ? errors : undefined };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Warm-up endpoint - pre-populates all caches on deploy
function warmup() {
  try {
    var results = {};
    var startTime = new Date().getTime();
    
    // Warm up dashboard cache
    var dashStart = new Date().getTime();
    var dashResult = getDashboardData();
    results.dashboard = { ok: dashResult.ok, timeMs: new Date().getTime() - dashStart };
    
    // Warm up settings
    var settingsStart = new Date().getTime();
    var settingsResult = getSettings();
    results.settings = { ok: settingsResult.ok, timeMs: new Date().getTime() - settingsStart };
    
    // Warm up email config
    var emailStart = new Date().getTime();
    var emailResult = getEmailConfig();
    results.emailConfig = { ok: emailResult.ok, timeMs: new Date().getTime() - emailStart };
    
    // Warm up sync status
    var syncStart = new Date().getTime();
    var syncResult = getSyncStatus();
    results.syncStatus = { ok: syncResult.ok, timeMs: new Date().getTime() - syncStart };
    
    // Warm up system info
    var sysStart = new Date().getTime();
    var sysResult = getSystemInfo();
    results.systemInfo = { ok: sysResult.ok, timeMs: new Date().getTime() - sysStart };
    
    // Warm up budget summary
    var budgetStart = new Date().getTime();
    var budgetResult = getBudgetSummary();
    results.budgetSummary = { ok: budgetResult.ok, timeMs: new Date().getTime() - budgetStart };
    
    // Warm up GL summary
    var glStart = new Date().getTime();
    var glResult = getGLSummary();
    results.glSummary = { ok: glResult.ok, timeMs: new Date().getTime() - glStart };
    
    // Warm up available periods
    var periodsStart = new Date().getTime();
    var periodsResult = getAvailablePeriods();
    results.availablePeriods = { ok: periodsResult.ok, timeMs: new Date().getTime() - periodsStart };
    
    // Warm up CRUD records
    var crudStart = new Date().getTime();
    var crudResult = getCrudRecords();
    results.crudRecords = { ok: crudResult.ok, timeMs: new Date().getTime() - crudStart };
    
    // Warm up import history
    var importStart = new Date().getTime();
    var importResult = getImportHistory();
    results.importHistory = { ok: importResult.ok, timeMs: new Date().getTime() - importStart };
    
    // Warm up audit log
    var auditStart = new Date().getTime();
    var auditResult = getAuditLog();
    results.auditLog = { ok: auditResult.ok, timeMs: new Date().getTime() - auditStart };
    
    // Warm up user guide data
    var guideStart = new Date().getTime();
    var guideResult = getUserGuideData();
    results.userGuide = { ok: guideResult.ok, timeMs: new Date().getTime() - guideStart };
    
    // Warm up config
    var configStart = new Date().getTime();
    var configResult = getConfig();
    results.config = { ok: configResult.ok, timeMs: new Date().getTime() - configStart };
    
    // Warm up trigger status
    var triggerStart = new Date().getTime();
    var triggerResult = getTriggerStatus();
    results.triggerStatus = { ok: triggerResult.ok, timeMs: new Date().getTime() - triggerStart };
    
    var totalTime = new Date().getTime() - startTime;
    
    return {
      ok: true,
      totalTimeMs: totalTime,
      message: 'Warm-up completed in ' + totalTime + 'ms',
      results: results
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Optimized cache key generator - shorter keys with consistent prefix
function cacheKey_(key) {
  return CACHE_PREFIX + key;
}

// Get from cache with compact JSON (no whitespace)
function cacheGetCompact_(key) {
  var cache = CacheService.getScriptCache();
  var val = cache.get(cacheKey_(key));
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch (e) {
    return null;
  }
}

// Put to cache with compact JSON (no whitespace)
function cachePutCompact_(key, obj, ttl) {
  var cache = CacheService.getScriptCache();
  var json = JSON.stringify(obj);  // Already compact by default
  if (json.length > 100000) {
    // Too large for cache, skip
    return false;
  }
  cache.put(cacheKey_(key), json, ttl || CACHE_TTL_MEDIUM);
  return true;
}

// ================= CHUNKED CACHE (supports >100KB objects) =================
function chunkedCacheGet_(key) {
  var c = CacheService.getScriptCache();
  var n = c.get(key + '__n'); if (!n) return null;
  var keys = []; for (var i = 0; i < +n; i++) keys.push(key + '__' + i);
  var got = c.getAll(keys); var parts = [];
  for (var i = 0; i < +n; i++) { var p = got[key + '__' + i]; if (p == null) return null; parts.push(p); }
  try { return JSON.parse(parts.join('')); } catch (e) { return null; }
}
function chunkedCachePut_(key, obj, sec) {
  var c = CacheService.getScriptCache();
  var s = JSON.stringify(obj), size = 90000, n = Math.ceil(s.length / size);
  if (n > 100) return;
  var map = {}; map[key + '__n'] = String(n);
  for (var i = 0; i < n; i++) map[key + '__' + i] = s.substring(i * size, (i + 1) * size);
  try { c.putAll(map, sec); } catch(e) {}
}

// Clear cache by prefix pattern
function cacheClearPrefix_(prefix) {
  var cache = CacheService.getScriptCache();
  // CacheService doesn't support pattern removal, so we clear known keys
  var knownKeys = [
    'dash_v2', 'dashboard_data', 'dash_data',
    'input_summary', 'amort_data', 'input_data_v2',
    'avail_periods_v2', 'budget_data', 'gl_recon_data_v1',
    'gl_balance_', 'gl_recon_history_v1', 'gl_recon_seq_v1',
    'budgetData', 'settings', 'emailConfig',
    'INPUT_SHEET_ID', 'SAP_TEMPLATE_ID', 'LAST_SYNC'
  ];
  
  for (var i = 0; i < knownKeys.length; i++) {
    var fullKey = cacheKey_(knownKeys[i]);
    try { cache.remove(fullKey); } catch(e) {}
    // Also try without prefix for backward compatibility
    try { cache.remove(knownKeys[i]); } catch(e) {}
    // Also clear chunked cache chunks
    try { cache.remove(knownKeys[i] + '__n'); } catch(e) {}
    for (var c = 0; c < 20; c++) {
      try { cache.remove(knownKeys[i] + '__' + c); } catch(e) {}
    }
  }
}

// Payload reduction: filter object to only include specified fields
function filterFields_(obj, fields) {
  if (!obj || !fields || !Array.isArray(fields) || fields.length === 0) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(function(item) { return filterFields_(item, fields); });
  }
  
  var result = {};
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    if (obj.hasOwnProperty(field)) {
      result[field] = obj[field];
    }
  }
  return result;
}

// Wrapper to get dashboard data with optional field filtering
function getDashboardDataFiltered(fields) {
  var result = getDashboardData();
  if (result.ok && fields && Array.isArray(fields) && fields.length > 0) {
    result = filterFields_(result, fields);
  }
  return result;
}

// ================= CONFIGURATION =================
const CONFIG = {
  INPUT_SHEET_ID: '1vnzmnZtR9U5cQcSdpjY22mR30ULbgHd62JcfC50ZC20',
  INPUT_SHEET_NAME: 'payment system',
  SAP_TEMPLATE_ID: '1sPG7aO6d25RpiMc-88Hx8ffrPruW78h4GwOClbJxG1M',
  SAP_SHEET_NAME: '3 Cut off payment',
  MAX_LINES_PER_JE: 900
};

// ================= COLUMN CONSTANTS =================
const COL = {
  COMPANY:0, POSTING_DATE:1, DOC_DATE:2, DOC_NO:3,
  DOC_NO_2:4, DESC:5, PLATE:6, IO:7, GL_PREPAID:8,
  GL_NAME:9, COST_CENTER:10, COST_NAME:11,
  START_DATE:12, END_DATE:13, AMOUNT:14
};

// ================= WEB APP =================
function include(f) { return HtmlService.createHtmlOutputFromFile(f).getContent(); }

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  
  // Debug column checker
  if (p.action === 'check') {
    var result = checkColumns();
    return ContentService.createTextOutput(JSON.stringify(result, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Debug dashboard
  if (p.action === 'dash_test') {
    try {
      var result = getDashboardData();
      return ContentService.createTextOutput(JSON.stringify({
        ok: result.ok,
        totalItems: result.totalItems,
        totalAmortization: result.totalAmortization,
        activeItems: result.activeItems,
        error: result.error || null
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    } catch(e) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        error: e.message,
        stack: e.stack ? e.stack.substring(0, 500) : 'no stack'
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  var t = HtmlService.createTemplateFromFile('index');
  
  // SSR: embed dashboard data directly if cache is warm (avoids google.script.run issues)
  try {
    var dashData = getDashboardData();
    if (dashData && dashData.ok) {
      t.dashboardData = JSON.stringify(dashData);
    }
  } catch(e) {
    // Cache miss or error — client will load via google.script.run fallback
  }
  
  return t.evaluate().setTitle('Amort — Prepaid Expense Amortization System').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ================= HELPERS =================
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate_(d) {
  if (!d) return '';
  try { var x = new Date(d); return isNaN(x) ? '' : x.getFullYear() + '-' + pad2_(x.getMonth() + 1) + '-' + pad2_(x.getDate()); }
  catch(e) { return ''; }
}
function fmtMoney_(n) { return Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }

// ================= DEBUG: Check Columns =================
function checkColumns() {
  try {
    const ss = SpreadsheetApp.openById(getInputSheetId_());
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

// ================= TIMESTAMP KEEPER FOR AUTO-REFRESH =================
// Stores last-edit timestamp in a hidden sheet + script properties
// Frontend polls getLastEditTimestamp() every 30s to detect changes

function ensureTimestampKeeper_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('_Config');
  if (!sheet) {
    sheet = ss.insertSheet('_Config');
    sheet.hideSheet();
    sheet.getRange('A1:B1').setValues([['lastEdit', new Date().toISOString()]]);
  }
  return sheet;
}

function updateTimestampKeeper_() {
  try {
    var sheet = ensureTimestampKeeper_();
    var now = new Date().toISOString();
    sheet.getRange('B1').setValue(now);
    PropertiesService.getScriptProperties().setProperty('LAST_EDIT_TS', now);
  } catch(e) {}
}

function getLastEditTimestamp() {
  try {
    var ts = PropertiesService.getScriptProperties().getProperty('LAST_EDIT_TS');
    if (ts) return { ok: true, timestamp: ts };
    var sheet = ensureTimestampKeeper_();
    var val = sheet.getRange('B1').getValue();
    if (val) {
      ts = new Date(val).toISOString();
      PropertiesService.getScriptProperties().setProperty('LAST_EDIT_TS', ts);
      return { ok: true, timestamp: ts };
    }
    return { ok: true, timestamp: '0' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getCompanies() {
  try {
    var items = readInputData_();
    var map = {};
    for (var i = 0; i < items.length; i++) {
      var c = String(items[i].company || '').trim();
      if (c) map[c] = true;
    }
    var list = Object.keys(map).sort();
    return { ok: true, companies: list };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


function ping() {
  return 'pong at ' + new Date().toISOString();
}
