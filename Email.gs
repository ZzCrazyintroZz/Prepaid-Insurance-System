/*************************************************************
 * Email.gs — แจ้งเตือนเมื่อรายการใกล้ตัดจ่ายหมด (เหลือ ≤ 1 เดือน)
 * ผู้รับ: Tippawan.si@pt.co.th (แก้ได้ใน SAP_Config / CFG.alertEmail)
 *************************************************************/

function getAlertEmail_() {
  try {
    const sh = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_CFG);
    if (sh) {
      const v = sh.getDataRange().getValues();
      for (const row of v) if (String(row[0]).trim() === 'AlertEmail' && row[1]) return String(row[1]).trim();
    }
  } catch (e) {}
  return CFG.alertEmail;
}

function fmtMoney_(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function checkAndNotify() {
  const cut = Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  const due = getData().map(it => ({ it: it, s: summarize(it, cut) }))
    .filter(x => x.s.status === 'Near-End');           // เหลือ ≤ CFG.alertMonths เดือน
  if (!due.length) { Logger.log('ไม่มีรายการใกล้หมด'); return; }

  const rows = due.map(x =>
    '<tr><td style="padding:6px;border:1px solid #2a2a30">' + x.it[COL.DocNo] + '</td>' +
    '<td style="padding:6px;border:1px solid #2a2a30">' + (x.it[COL.Desc] || '') + '</td>' +
    '<td style="padding:6px;border:1px solid #2a2a30">' + (x.it[COL.Plate] || '') + '</td>' +
    '<td style="padding:6px;border:1px solid #2a2a30;text-align:right">' + fmtMoney_(x.s.remain) + '</td>' +
    '<td style="padding:6px;border:1px solid #2a2a30">' + fmtDate_(x.it[COL.End]) + '</td></tr>').join('');

  const url = ScriptApp.getService().getUrl() || '';
  const html =
    '<div style="font-family:Segoe UI,Tahoma,sans-serif;color:#1a1d2e">' +
    '<h2 style="color:#a8841f">⚠ แจ้งเตือน: รายการจ่ายล่วงหน้าใกล้ตัดจ่ายหมด</h2>' +
    '<p>มีรายการที่จะตัดจ่ายหมดภายใน ' + CFG.alertMonths + ' เดือน จำนวน <b>' + due.length + '</b> รายการ (ณ งวด ' + cut + ')</p>' +
    '<table style="border-collapse:collapse;font-size:13px">' +
    '<tr style="background:#0b0b0d;color:#d4af37">' +
    '<th style="padding:8px;border:1px solid #2a2a30">เลขที่ DOC</th>' +
    '<th style="padding:8px;border:1px solid #2a2a30">รายการ</th>' +
    '<th style="padding:8px;border:1px solid #2a2a30">ทะเบียน</th>' +
    '<th style="padding:8px;border:1px solid #2a2a30">คงเหลือ</th>' +
    '<th style="padding:8px;border:1px solid #2a2a30">สิ้นสุด</th></tr>' + rows + '</table>' +
    (url ? '<p style="margin-top:16px"><a href="' + url + '" style="background:#d4af37;color:#1a1400;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">เปิด Dashboard</a></p>' : '') +
    '<p style="color:#9a9488;font-size:12px;margin-top:20px">ส่งอัตโนมัติจากระบบตัดจ่ายค่าใช้จ่ายจ่ายล่วงหน้า (GL 11370010)</p></div>';

  try {
    MailApp.sendEmail({
      to: getAlertEmail_(),
      subject: '[แจ้งเตือน] จ่ายล่วงหน้าใกล้ตัดจ่ายหมด ' + due.length + ' รายการ (งวด ' + cut + ')',
      htmlBody: html
    });
    Logger.log('ส่งเมลแล้ว ' + due.length + ' รายการ');
  } catch (e) {
    Logger.log('ส่งเมลล้มเหลว: ' + e);
  }
}

// ติดตั้ง trigger รายวัน 08:00 (รันครั้งเดียวเพื่อติดตั้ง)
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkAndNotify') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAndNotify').timeBased().atHour(8).everyDays(1).inTimezone(TZ).create();
  SpreadsheetApp.getActive().toast('ติดตั้ง trigger รายวัน 08:00 แล้ว', 'สำเร็จ', 5);
}
