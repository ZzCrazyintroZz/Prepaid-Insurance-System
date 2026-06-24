/*************************************************************
 * SapExport.gs — สร้างไฟล์ SAP Template (Template_ตัดจ่าย, 107 คอลัมน์)
 * กฎ: 900 บรรทัดเดบิต/journal + 1 บรรทัดเครดิต(Prepaid 11370010, ยอดลบ)
 *     "ลำดับที่" (A) +1 ต่อเนื่อง และต่อจากลำดับล่าสุดใน Export_History
 *************************************************************/

// หัวคอลัมน์ครบ 107 ช่อง ตามไฟล์ Template-Amortize.xlsx (แถว 1)
const SAP_HEADERS = [
  'ลำดับที่','รหัสบริษัท ','ประเภทเอกสาร ','วันที่เอกสาร','วันที่ผ่านรายการ','งวดบัญชี','สกุลเงิน',
  'อัตราแลกเปลี่ยน','วันที่คิดอัตราแลกเปลี่ยน','กลุ่มบัญชี','เลขอ้างอิง','ข้อความส่วนหัวเอกสาร','สาขาภาษี',
  'ไม่ใช้','ไม่ใช้','คีย์การผ่านรายการ',
  'รหัสบัญชีแยกประเภท/\nรหัสลูกหนี้/\nรหัสเจ้าหนี้',
  'รหัสบัญชีพิเศษ ใช้กรณีที่ Posting Key ลงท้ายด้วยเลข 9',
  'รหัสบัญชีที่บันทึกต่างจาก reconcile account ใน เจ้าหนี้/ลูกหนี้',
  'จำนวนเงิน(Document currency)','จำนวนเงิน(Local Currency)','จำนวนเงิน(Group currency)',
  'ประเภทธุรกิจ','คู่ค้าทางธุรกิจ','วันที่แสดงมูลค่า สำหรับบัญชีธนาคารเท่านั้น','เงื่อนไขการชำระเงิน ',
  'วันที่เริ่มคิดการกำหนดชำระเงิน','วิธีการจ่ายเงิน','ระงับการชำระเงิน',
  'อ้างอิงเอกสารใบแจ้งหนี้ในระบบ SAP ใช้สำหรับCN/DN','ปีบัญชีของ invoice','จำนวน ','หน่วยนับ',
  'GL ระบบเดิม','ข้อความ','รหัสภาษีมูลค่าเพิ่ม','รหัสสาขา ภพ20',
  'ฐานภาษีมูลค่าเพิ่ม(Document currency)','ฐานภาษีมูลค่าเพิ่ม(Local currency)','ฐานภาษีมูลค่าเพิ่ม(Group currency)',
  'จำนวนภาษีมูลค่าเพิ่ม(Document currency)','จำนวนภาษีมูลค่าเพิ่ม(Local currency)','จำนวนภาษีมูลค่าเพิ่ม(Group currency)',
  'ศูนย์ต้นทุน','ศูนย์กำไร','รหัสงบประมาณ','เกี่ยวข้องกับ CO-PA หรือไม่ ถ้าใช่ = X ',
  'รหัส ControllingArea ','รหัส Company ','รหัส Plant ','รหัส BA ','รหัส Profit Center ',
  'Cost center','องค์กรการขาย','ช่องทางการจัดจำหน่าย','กลุ่มผลิตภัณฑ์','ภูมิภาคการขาย','หัวหน้าทีมขาย',
  'รหัส SalesSup ','รหัส SalesRep ','กลุ่มลูกหนี้','การจัดกลุ่มลูกค้า','การจัดกลุ่มลูกค้า','การจัดกลุ่มลูกค้า',
  'การจัดเกรดลูกค้า','ตำบล','อำเภอ','รหัส SalesDistrict ','รหัสจังหวัด','รหัส CustomerNo ',
  'รหัส MatGrp1 ','รหัส MatGrp2 ','รหัส MatGrp3 ','รหัส MatGrp4 ','รหัส MatGrp5 ','รหัส MatNo ',
  'รหัส PDH1 ','รหัส PDH2 ','รหัส PDH3 ','รหัส PDH4 ','รหัส PDH5','Material group','Valualtion Type',
  'ประเภทภาษีหัก ณ ที่จ่าย (อัตรา 1)','รหัสภาษีหัก ณ ที่จ่าย (อัตรา 1)',
  'ฐานภาษีหัก ณ ที่จ่าย(Document currency) (อัตรา 1)','ฐานภาษีหัก ณ ที่จ่าย(Local currenty) (อัตรา 1)',
  'จำนวนภาษีหัก ณ ที่จ่าย(Document currency) (อัตรา 1)','จำนวนภาษีหัก ณ ที่จ่าย(Local currency) (อัตรา 1)',
  'ประเภทภาษีหัก ณ ที่จ่าย (อัตรา 2)','รหัสภาษีหัก ณ ที่จ่าย (อัตรา 2)',
  'ฐานภาษีหัก ณ ที่จ่าย(Document currency) (อัตรา 2)','ฐานภาษีหัก ณ ที่จ่าย(Local currency) (อัตรา 2)',
  'จำนวนภาษีหัก ณ ที่จ่าย(Document currency) (อัตรา 2)','จำนวนภาษีหัก ณ ที่จ่าย(Local currency) (อัตรา 2)',
  'เป็นลูกหนี้ขาจร หรือไม่ ถ้าใช่ = X','ชื่อ 1 ของลูกหนี้ขาจร','ชื่อ 2 ของลูกหนี้ขาจร','ชื่อ 3 ของลูกหนี้ขาจร',
  'ชื่อ 4 ของลูกหนี้ขาจร','ที่อยู่ของลูกหนี้ขาจร','เมืองของลูกหนี้ขาจร','รหัสไปรษณีย์ของลูกหนี้ขาจร',
  'ภาษาของลูกหนี้ขาจร','ประเทศของลูกหนี้ขาจร','เลขที่ Tax ID ของลูกหนี้ขาจร','เลขที่สาขาของลูกหนี้ขาจร'
];

// index คอลัมน์ (0-based) ที่ใช้
const IX = { seq:0, company:1, docType:2, docDate:3, postDate:4, period:5, cur:6,
  ref:10, taxBranch:12, pk:15, gl:16, recAcc:18, amtDoc:19, amtLoc:20, amtGrp:21,
  bizType:22, payTerm:25, payStart:26, text:34, vat:35, costCenter:43, profitCenter:44, budget:45 };

function fmtDateSAP_(d) { // -> DD.MM.YYYY
  const x = new Date(d), p = n => ('0' + n).slice(-2);
  return p(x.getDate()) + '.' + p(x.getMonth() + 1) + '.' + x.getFullYear();
}
function shortDate_(d) { // -> DD-MM-YY
  const x = new Date(d), p = n => ('0' + n).slice(-2);
  return p(x.getDate()) + '-' + p(x.getMonth() + 1) + '-' + String(x.getFullYear()).slice(-2);
}

function getCC_(row) {
  try {
    const ovr = (PropertiesService.getDocumentProperties()
        .getProperty('ccOvr_' + row[COL.CC]) || '').trim();
    return ovr || row[COL.CC];
  } catch (e) {
    return row[COL.CC];
  }
}

function getNextSequence_() {
  const sh = sheet_(SHEET_HIST);
  if (sh.getLastRow() < 2) return 1;
  const raw = sh.getRange(sh.getLastRow(), 2).getValue();
  if (raw instanceof Date) throw new Error('Export_History column B contains a Date value; expected integer sequence number');
  const last = Number(raw) || 0;
  if (!Number.isInteger(last) || last < 0) throw new Error('Invalid sequence in Export_History col B: ' + raw);
  return last + 1;
}

// สร้าง array 107 ช่อง
function buildSapLine_(seq, r, p) {
  const a = new Array(SAP_HEADERS.length).fill('');
  a[IX.seq] = seq; a[IX.company] = CFG.company; a[IX.docType] = CFG.docType;
  a[IX.docDate] = p.docDate; a[IX.postDate] = p.postDate; a[IX.period] = p.fiscalPeriod;
  a[IX.cur] = CFG.cur; a[IX.taxBranch] = CFG.taxBranch; a[IX.pk] = r.pk; a[IX.gl] = r.gl;
  a[IX.amtDoc] = r.amount; a[IX.amtLoc] = r.amount; a[IX.amtGrp] = r.amount;
  a[IX.bizType] = CFG.bizType; a[IX.payTerm] = CFG.payTerm; a[IX.payStart] = p.docDate;
  a[IX.text] = r.text; a[IX.vat] = CFG.vat;
  if (r.pk === 40) {
    a[IX.ref] = r.ref || ''; a[IX.costCenter] = r.cc || ''; a[IX.budget] = r.io || '';
  } else { // PK 50 credit
    a[IX.ref] = 'ตัดจ่าย-' + p.shortDate; a[IX.profitCenter] = CFG.creditPC;
  }
  return a;
}

/**
 * params: { period:'2026-05', docDate:'2026-05-31', postDate, fiscalPeriod:'05' }
 * คืน { aoa:[headers,...rows], journals, totalDebit, batches:[{seq,count,credit}] }
 */
function generateSAP(params) {
  const items = getData();
  const cutPeriod = params.period;
  // 1 บรรทัดเดบิตต่อรายการที่มียอดตัดจ่ายในงวดนั้น
  const debit = [];
  items.forEach(it => {
    const s = summarize(it, cutPeriod);
    const m = s.sched.find(x => x.period === cutPeriod);
    if (m && m.amount > 0) debit.push({
      pk: 40, gl: it[COL.ExpenseGL], cc: getCC_(it), io: it[COL.IO],
      ref: it[COL.Plate], amount: round2(m.amount), text: it[COL.Desc]
    });
  });

  const dDate = fmtDateSAP_(params.docDate);
  const pDate = fmtDateSAP_(params.postDate || params.docDate);
  const sDate = shortDate_(params.docDate);
  const d = new Date(params.docDate);
  const fp = params.fiscalPeriod || (isNaN(d) ? '' : ('0' + (d.getMonth() + 1)).slice(-2));
  const p = { docDate: dDate, postDate: pDate, shortDate: sDate, fiscalPeriod: fp };

  const startSeq = getNextSequence_();
  const aoa = [SAP_HEADERS.slice()];
  const batches = [];
  for (let i = 0, b = 0; i < debit.length; i += CFG.batch, b++) {
    const chunk = debit.slice(i, i + CFG.batch);
    const seq = startSeq + b;
    const sum = round2(chunk.reduce((acc, x) => acc + x.amount, 0));
    chunk.forEach(r => aoa.push(buildSapLine_(seq, r, p)));
    // เครดิตรวม = Prepaid 11370010 ยอดลบ
    aoa.push(buildSapLine_(seq, {
      pk: 50, gl: CFG.prepaidGL, amount: -sum,
      text: 'ค่าเบี้ยประกันตัดจ่าย เดือน ' + cutPeriod.replace('-', '_')
    }, p));
    batches.push({ seq: seq, count: chunk.length, credit: -sum });
  }
  return {
    aoa: aoa, journals: batches.length, totalDebit: debit.length,
    startSeq: startSeq, endSeq: startSeq + batches.length - 1, batches: batches
  };
}

// สร้างไฟล์ .xlsx จริง บน Drive แล้วคืน URL ดาวน์โหลด
function exportSAPFile(params) {
  const r = generateSAP(params);
  if (r.totalDebit === 0) throw new Error('ไม่มีรายการตัดจ่ายในงวด ' + params.period);
  const tmp = SpreadsheetApp.create('AMORTIZE_' + CFG.company + '_' + params.period.replace('-', '') + '_tmp');
  const sh = tmp.getSheets()[0]; sh.setName('Template_ตัดจ่าย');
  sh.getRange(1, 1, r.aoa.length, SAP_HEADERS.length).setValues(r.aoa);
  SpreadsheetApp.flush();
  const url = 'https://docs.google.com/spreadsheets/d/' + tmp.getId() +
              '/export?format=xlsx';
  let blob;
  try {
    blob = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
    }).getBlob();
  } catch (e) {
    try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch(e2) {}
    throw new Error('สร้างไฟล์ XLSX ไม่สำเร็จ: ' + e.message);
  }
  const fname = 'AMORTIZE_' + CFG.company + '_' + params.period.replace('-', '') + '.xlsx';
  const file = DriveApp.createFile(blob.setName(fname));
  try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch(e) { Logger.log('Cleanup failed: ' + e); }
  // บันทึกประวัติ + ลำดับล่าสุด
  recordHistory_(params, r, file.getUrl());
  return { ok: true, fileUrl: file.getUrl(), name: fname, journals: r.journals,
    rows: r.aoa.length - 1, startSeq: r.startSeq, endSeq: r.endSeq };
}

function recordHistory_(params, r, fileUrl) {
  const sh = sheet_(SHEET_HIST);
  if (sh.getLastRow() === 0)
    sh.appendRow(['เวลา', 'ลำดับสูงสุด', 'งวด', 'บรรทัดเดบิต', 'จำนวน Journal', 'ไฟล์', 'สถานะ']);
  sh.appendRow([new Date(), r.endSeq, params.period, r.totalDebit, r.journals, fileUrl, 'Generated']);
}

/**
 * Truncate/pad every row in a 2D array to `cols` columns.
 * Guards against the dreaded "data has N but range has M" error.
 */
function alignCols_(rows, cols, pad) {
  if (!rows || !rows.length) return rows;
  if (pad === undefined) pad = '';
  return rows.map(function(row) {
    var r = row.slice(0, cols);
    while (r.length < cols) r.push(pad);
    return r;
  });
}

// ===========================================================
// EXPORT กระทบยอด (Reconciliation) — xlsx / pdf หลายชีต
// ===========================================================
function ssToBlob_(ssId, format, fname) {
  var url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=' + format;
  if (format === 'pdf') url += '&portrait=true&fitw=true&size=A4&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5&sheetnames=false&printtitle=false&gridlines=false';
  var blob;
  try {
    blob = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
    }).getBlob();
  } catch (e) {
    throw new Error('สร้างไฟล์ไม่สำเร็จ: ' + e.message);
  }
  return blob.setName(fname);
}
function ssToXlsxBlob_(ssId, fname) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx';
  let blob;
  try {
    blob = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
    }).getBlob();
  } catch (e) {
    throw new Error('สร้างไฟล์ XLSX ไม่สำเร็จ: ' + e.message);
  }
  return blob.setName(fname);
}

/**
 * สร้างไฟล์กระทบยอด ณ งวดที่เลือก (ค่าว่าง = งวดปัจจุบัน)
 * 3 ชีต: Cover (แบบ 05_2026), Summary (ต่อรายการ), MonthlyMatrix (รายเดือน×ปี)
 */
function exportReconFile(period) {
  const cut = period || Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  const items = getData();
  if (!items.length) throw new Error('ไม่มีข้อมูลใน sheet Data');

  // เก็บ schedule + รวบรวมงวดทั้งหมด
  let sumTotal = 0, sumAccum = 0, sumRemain = 0;
  const allPeriods = {};
  const recs = items.map(it => {
    const s = summarize(it, cut);
    sumTotal += s.total; sumAccum += s.accum; sumRemain += s.remain;
    s.sched.forEach(x => allPeriods[x.period] = true);
    return { it: it, s: s };
  });
  const periods = Object.keys(allPeriods).sort();

  // ----- Cover -----
  const cover = [
    ['บริษัท พีทีจี โลจิสติกส์ จำกัด'],
    ['รายละเอียดค่าประกันภัยจ่ายล่วงหน้า (' + CFG.prepaidGL + ')'],
    ['ณ งวด ' + cut],
    ['หน่วย : บาท'], [],
    ['ยอดคงเหลือตามระบบ GL.', '', '', '', ''],
    ['ระบบ ตัดจ่าย Excel', '', '', '', round2(sumRemain)],
    [],
    ['มูลค่าจ่ายล่วงหน้ารวม', '', '', '', round2(sumTotal)],
    ['ตัดจ่ายสะสม', '', '', '', round2(sumAccum)],
    ['คงเหลือ', '', '', '', round2(sumRemain)],
    [],
    ['ผลต่าง (Diff = GL − ระบบ)', '', '', 'กรอกยอด GL ในช่อง E6', ''],
    [], [],
    ['จัดทำโดย', 'ผู้ตรวจสอบ 1', 'ผู้ตรวจสอบ 2'],
    ['..................', '..................', '..................']
  ];

  // ----- Summary -----
  const sumHead = ['เลขที่ DOC', 'รายการ', 'ทะเบียน', 'GL', 'Cost center', 'IO',
    'เริ่มต้น', 'สิ้นสุด', 'มูลค่ารวม', 'ตัดจ่ายสะสม', 'คงเหลือ', '% ตัดจ่าย', 'สถานะ'];
  const sumRows = recs.map(r => [
    r.it[COL.DocNo], String(r.it[COL.Desc] || '').replace(/\n/g, ' '), r.it[COL.Plate],
    r.it[COL.ExpenseGL], r.it[COL.CC], r.it[COL.IO],
    fmtDateSAP_(r.it[COL.Start]), fmtDateSAP_(r.it[COL.End]),
    r.s.total, r.s.accum, r.s.remain,
    r.s.total ? round2(r.s.accum / r.s.total * 100) : 0, r.s.status
  ]);
  sumRows.push(['รวม', '', '', '', '', '', '', '', round2(sumTotal), round2(sumAccum), round2(sumRemain), '', '']);

  // ----- MonthlyMatrix -----
  const matHead = ['เลขที่ DOC', 'รายการ', 'Cost center'].concat(periods).concat(['รวม']);
  const matRows = recs.map(r => {
    const map = {}; r.s.sched.forEach(x => map[x.period] = x.amount);
    const cells = periods.map(p => map[p] || 0);
    return [r.it[COL.DocNo], String(r.it[COL.Desc] || '').replace(/\n/g, ' '), r.it[COL.CC]]
      .concat(cells).concat([round2(cells.reduce((a, b) => a + b, 0))]);
  });

  // ----- เขียนลง Spreadsheet ชั่วคราว -----
  const tmp = SpreadsheetApp.create('RECON_' + cut.replace('-', '') + '_tmp');
  const c = tmp.getSheets()[0]; c.setName('Cover');
  c.getRange(1, 1, cover.length, 5).setValues(cover.map(r => { const c = [...r]; while (c.length < 5) c.push(''); return c; }));
  const sm = tmp.insertSheet('Summary');
  sm.getRange(1, 1, 1, sumHead.length).setValues([sumHead]);
  if (sumRows.length) sm.getRange(2, 1, sumRows.length, sumHead.length).setValues(alignCols_(sumRows, sumHead.length));
  const mx = tmp.insertSheet('MonthlyMatrix');
  mx.getRange(1, 1, 1, matHead.length).setValues([matHead]);
  if (matRows.length) mx.getRange(2, 1, matRows.length, matHead.length).setValues(alignCols_(matRows, matHead.length));
  SpreadsheetApp.flush();

  // ใช้ ssToBlob_ แทน ssToXlsxBlob_ (ตัวใหม่ใช้ร่วมกันได้ทั้ง xlsx/pdf)
  const fname = 'RECON_' + CFG.prepaidGL + '_' + cut.replace('-', '') + '.xlsx';
  let file;
  try {
    file = DriveApp.createFile(ssToBlob_(tmp.getId(), 'xlsx', fname));
  } catch (e) {
    try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch(e2) {}
    throw new Error('สร้างไฟล์กระทบยอดไม่สำเร็จ: ' + e.message);
  }
  try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch(e) { Logger.log('Cleanup failed: ' + e); }
  return { ok: true, fileUrl: file.getUrl(), name: fname, count: recs.length,
    sumRemain: round2(sumRemain) };
}

// สร้างไฟล์ PDF กระทบยอด (Amortization Trend)
function exportReconPdfFile(period) {
  const cut = period || Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  const items = getData();
  if (!items.length) throw new Error('ไม่มีข้อมูลใน sheet Data');

  // data logic เดียวกับ exportReconFile
  let sumTotal = 0, sumAccum = 0, sumRemain = 0;
  const allPeriods = {};
  const recs = items.map(function(it) {
    const s = summarize(it, cut);
    sumTotal += s.total; sumAccum += s.accum; sumRemain += s.remain;
    s.sched.forEach(function(x) { allPeriods[x.period] = true; });
    return { it: it, s: s };
  });
  const periods = Object.keys(allPeriods).sort();

  // ----- Cover Sheet (for PDF) -----
  const cover = [
    ['บริษัท พีทีจี โลจิสติกส์ จำกัด'],
    ['รายละเอียดค่าประกันภัยจ่ายล่วงหน้า (' + CFG.prepaidGL + ')'],
    ['ณ งวด ' + cut],
    ['หน่วย : บาท'], [],
    ['รายการทั้งหมด', '', recs.length],
    ['มูลค่ารวม', '', round2(sumTotal)],
    ['ตัดจ่ายสะสม', '', round2(sumAccum)],
    ['คงเหลือ', '', round2(sumRemain)],
    ['สถานะ', '', sumRemain < 0.01 ? 'ตัดจ่ายหมดแล้ว' : 'อยู่ระหว่างตัดจ่าย']
  ];

  // ----- Summary (5-column layout for print) -----
  const sumHead = ['เลขที่ DOC', 'รายการ', 'ทะเบียน', 'GL', 'Cost center', 'IO',
    'เริ่มต้น', 'สิ้นสุด', 'มูลค่ารวม', 'ตัดจ่ายสะสม', 'คงเหลือ', '%', 'สถานะ'];
  const sumRows = recs.map(function(r) {
    return [
      r.it[COL.DocNo], String(r.it[COL.Desc] || '').replace(/\n/g, ' '), r.it[COL.Plate],
      r.it[COL.ExpenseGL], r.it[COL.CC], r.it[COL.IO],
      fmtDateSAP_(r.it[COL.Start]), fmtDateSAP_(r.it[COL.End]),
      r.s.total, r.s.accum, r.s.remain,
      r.s.total ? round2(r.s.accum / r.s.total * 100) : 0, r.s.status
    ];
  });
  sumRows.push(['รวม', '', '', '', '', '', '', '', round2(sumTotal), round2(sumAccum), round2(sumRemain), '', '']);

  // ----- สร้าง Spreadsheet ชั่วคราว -----
  const tmp = SpreadsheetApp.create('RECON_PDF_' + cut.replace('-', '') + '_tmp');
  const c = tmp.getSheets()[0]; c.setName('Cover');
  c.getRange(1, 1, cover.length, 4).setValues(alignCols_(cover, 4));
  // ตั้งค่าการพิมพ์ Cover
  c.setColumnWidth(1, 250); c.setColumnWidth(2, 200); c.setColumnWidth(3, 150); c.setColumnWidth(4, 150);

  const sm = tmp.insertSheet('Summary');
  sm.getRange(1, 1, 1, sumHead.length).setValues([sumHead]);
  if (sumRows.length) sm.getRange(2, 1, sumRows.length, sumHead.length).setValues(alignCols_(sumRows, sumHead.length));
  // freeze header row
  sm.setFrozenRows(1);

  SpreadsheetApp.flush();

  const fname = 'RECON_' + CFG.prepaidGL + '_' + cut.replace('-', '') + '.pdf';
  const file = DriveApp.createFile(ssToBlob_(tmp.getId(), 'pdf', fname));
  try { DriveApp.getFileById(tmp.getId()).setTrashed(true); } catch(e) { Logger.log('Cleanup failed: ' + e); }
  return { ok: true, fileUrl: file.getUrl(), name: fname, count: recs.length, sumRemain: round2(sumRemain) };
}
