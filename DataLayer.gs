// ================= SHEET ID HELPERS =================
function getInputSheetId_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('INPUT_SHEET_ID') || CONFIG.INPUT_SHEET_ID;
}
function getSapTemplateId_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('SAP_TEMPLATE_ID') || CONFIG.SAP_TEMPLATE_ID;
}

// ================= READ INPUT =================
function readInputData_() {
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
  return rows;
}

// ================= GET SUMMARY (Frontend) =================
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
