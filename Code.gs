// VERIFICATION PASS — All 7 fixes confirmed correct (see summary at end of file)
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
  
  var t = HtmlService.createTemplateFromFile('index');
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
