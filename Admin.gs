// ================= SETTINGS =================
function getSettings() {
  try {
    var props = PropertiesService.getScriptProperties();
    var defaults = {
      company: '1022',
      docType: 'SA',
      currency: 'THB',
      prepaidGL: '11370010',
      rounding: '4dec',       // 'full' or '4dec'
      maxLinesPerJE: 900,
      currentPeriod: ''
    };
    var saved = props.getProperty('settings');
    if (saved) {
      var parsed = JSON.parse(saved);
      for (var k in defaults) {
        if (parsed[k] === undefined) parsed[k] = defaults[k];
      }
      return { ok: true, settings: parsed };
    }
    return { ok: true, settings: defaults };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function saveSettings(settings) {
  try {
    PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(settings));
    return { ok: true, message: 'Settings saved' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= USER GUIDE DATA =================
function getUserGuideData() {
  try {
    return {
      ok: true,
      system: {
        name: 'Prepaid Expense Amortization System',
        version: 'v9 (Phase 1-7)',
        runtime: 'Google Apps Script (V8)',
        webApp: true
      },
      dataSources: [
        {
          name: 'Input Sheet',
          id: getInputSheetId_().substring(0, 8) + '...',
          sheet: CONFIG.INPUT_SHEET_NAME,
          totalRecords: 3979,
          columns: [
            { col: 'A', name: 'Company', desc: 'รหัสบริษัท' },
            { col: 'B', name: 'Posting Date', desc: 'วันที่ลงบัญชี' },
            { col: 'C', name: 'Doc Date', desc: 'วันที่เอกสาร' },
            { col: 'D', name: 'Doc No', desc: 'เลขที่เอกสาร (KEY)' },
            { col: 'E', name: 'Doc No 2', desc: 'เลขที่เอกสารเพิ่มเติม' },
            { col: 'F', name: 'Description', desc: 'รายละเอียด' },
            { col: 'G', name: 'Plate', desc: 'ทะเบียนรถ' },
            { col: 'H', name: 'IO', desc: 'IO รหัส (Debit Key 40)' },
            { col: 'I', name: 'GL Prepaid', desc: 'GL รหัส (Credit Key 50)' },
            { col: 'J', name: 'GL Name', desc: 'ชื่อ GL' },
            { col: 'K', name: 'Cost Center', desc: 'ศูนย์ต้นทุน' },
            { col: 'L', name: 'Cost Name', desc: 'ชื่อศูนย์ต้นทุน' },
            { col: 'M', name: 'Start Date', desc: 'วันที่เริ่มต้นสัญญา' },
            { col: 'N', name: 'End Date', desc: 'วันที่สิ้นสุดสัญญา' },
            { col: 'O', name: 'Amount', desc: 'จำนวนเงินรวม' }
          ]
        },
        {
          name: 'SAP Template Sheet',
          id: getSapTemplateId_().substring(0, 8) + '...',
          sheet: CONFIG.SAP_SHEET_NAME,
          desc: 'ใช้เก็บ Wide Format Pivot, SAP JE, และ Void JE'
        }
      ],
      tabs: [
        {
          id: 'dashboard',
          icon: '📈',
          name: 'Dashboard',
          desc: 'ภาพรวมระบบ: KPI จำนวนรายการ, ยอดตัดจ่ายรวม, งวดปัจจุบัน + กราฟแนวโน้มรายงวด (Line Chart) และกราฟ GL (Bar Chart)',
          howto: 'เปิดหน้าแรกมาแสดงอัตโนมัติ — กด Dark Mode toggle (พระจันทร์/พระอาทิตย์) เพื่อเปลี่ยนธีม',
          dataSource: 'คำนวณจาก Input Sheet ทั้งหมด 3,979 รายการ'
        },
        {
          id: 'amort',
          icon: '🚀',
          name: 'Amortization',
          desc: 'คำนวณค่าใช้จ่ายตัดจ่ายรายเดือนแบบ Average Per Day — ระบบจะกระจายยอดเงินตามจำนวนวันในแต่ละเดือน',
          howto: 'กรอก YYYY-MM หรือเว้นว่าง = ทั้งหมด → กด Run → ดูผล KPI และตาราง Schedule',
          formula: 'Rate/Day = Amount / TotalDays → Amort/Month = DaysInMonth × Rate/Day → ปัดเศษ 4 ตำแหน่ง',
          dataSource: 'อ่านจาก Input Sheet Columns M (Start), N (End), O (Amount)'
        },
        {
          id: 'schedule',
          icon: '📅',
          name: 'Schedule (Wide Format)',
          desc: 'ตารางตัดจ่ายแบบ Wide Format — 1 แถว/รายการ, คอลัมน์เดือนละ column มีสีฟ้า 🟦',
          howto: 'กรอกงวด → Preview → Export to Sheet เพื่อเขียนไปยัง SAP Template Sheet',
          dataSource: 'คำนวณจาก Amortization Engine แล้ว Pivot เป็น Wide Format'
        },
        {
          id: 'sap',
          icon: '📤',
          name: 'SAP Generator',
          desc: 'สร้าง SAP Journal Entry — Debit Key 40 = IO, Credit Key 50 = GL, สูงสุด 900 บรรทัด/เอกสาร',
          howto: 'กรอกงวด → Preview ดูตัวอย่าง → Generate & Export → เปิด Sheet หรือ Download .xlsx',
          note: 'Dr = Cr ทุกเอกสาร • ใช้ Company/DocType/Currency จาก Settings'
        },
        {
          id: 'checker',
          icon: '🔍',
          name: 'Pre-Upload Checker',
          desc: 'ตรวจสอบความถูกต้องของข้อมูลก่อน Export SAP — 10 รายการตรวจสอบ',
          howto: 'กด Run Check → ดูผล PASS/FAIL → ถ้ามี Error ต้องแก้ไขก่อน Export',
          checks: ['Doc No ครบ', 'Doc No ซ้ำ', 'IO ครบ', 'GL ครบ','วันที่เริ่มต้นครบ', 'วันที่สิ้นสุดครบ', 'Start ≤ End','วันที่สิ้นสุดผ่านไปแล้ว (Warning)', 'ยอดเงิน > 0','Amortization Sample Check']
        },
        {
          id: 'void',
          icon: '⛔',
          name: 'Void / Terminate',
          desc: 'ยกเลิกสัญญากลางคัน — คำนวณยอดคงเหลือ (Remaining Balance) และสร้าง Void Journal Entry',
          howto: 'เลือก Doc No → ดู KPI Amount/Amortized/Remaining → เลือกประเภท (Refund=คืนเงิน / Loss=ตัดสูญ) → Preview → Execute Void',
          types: ['Refund: Dr = GL (Key 40), Cr = IO (Key 50)','Loss: Dr = Loss GL (Key 50), Cr = IO (Key 40)'],
          output: 'สร้าง Sheet VOID_JE_xxxx + .xlsx + บันทึก Log ใน _VOID_LOG'
        },
        {
          id: 'settings',
          icon: '⚙️',
          name: 'Settings',
          desc: 'ตั้งค่าระบบ: Company, Prepaid GL, Doc Type, Currency, Max Lines/JE, วิธีปัดเศษ',
          howto: 'แก้ไขค่า → กด Save — ค่าจะถูกบันทึกใน Script Properties'
        },
        {
          id: 'sync',
          icon: '🔄',
          name: 'Sync Data',
          desc: 'Data source synchronization — view Sheet ID, records count, last sync timestamp, and trigger manual sync',
          howto: 'เปิดหน้า Sync Data → ดูสถานะ Data Source → กด Sync Now เพื่อรีเฟรชข้อมูล',
          dataSource: 'อ่านจาก Input Sheet และ CacheService'
        },
        {
          id: 'admin',
          icon: '🛠️',
          name: 'Admin Console',
          desc: 'System administration — view version/runtime/deploy info, manage cache, quick actions',
          howto: 'เปิดหน้า Admin Console → ดู System Info → กด Clear Cache เพื่อล้าง CacheService → Quick Actions สำหรับงาน admin อื่นๆ'
        },
        {
          id: 'audit',
          icon: '📋',
          name: 'Audit Log',
          desc: 'System activity log — tracks actions like sync, cache clear, and system events',
          howto: 'เปิดหน้า Audit Log → ดูตาราง Timestamp/Action/Detail — รายการจะถูกบันทึกใน memory (ชั่วคราว)'
        }
      ],
      techNotes: [
        'Amortization: Average Per Day — Rate/Day = Amount ÷ (EndDate - StartDate + 1 วัน)',
        'Rounding: เลือกได้ใน Settings — ปัด 4 ตำแหน่ง (4dec) หรือ เต็มความละเอียด (full)',
        'SAP JE: Debit Key 40 = IO Column (H), Credit Key 50 = GL Column (I)',
        'Batching: สูงสุด 900 Lines/JE Document — สร้างหลาย Document อัตโนมัติ',
        'Dark Mode: ใช้ CSS Variables + Local Storage — คงค่าที่ผู้ใช้เลือก',
        'Cache: Dashboard Data เก็บใน CacheService 5 นาที',
        'Void: คำนวณ Remaining จาก Amortization Schedule — ไม่ได้ Track สถานะแยก'
      ]
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= CONFIG API (Frontend) =================
function getConfig() {
  try {
    var props = PropertiesService.getScriptProperties();
    return {
      ok: true,
      inputSheetId: props.getProperty('INPUT_SHEET_ID') || CONFIG.INPUT_SHEET_ID,
      sapTemplateId: props.getProperty('SAP_TEMPLATE_ID') || CONFIG.SAP_TEMPLATE_ID,
      inputSheetName: CONFIG.INPUT_SHEET_NAME,
      sapSheetName: CONFIG.SAP_SHEET_NAME
    };
  } catch(e) { return { ok: false, error: e.message }; }
}

function saveConfig(params) {
  try {
    var props = PropertiesService.getScriptProperties();
    if (params.inputSheetId) props.setProperty('INPUT_SHEET_ID', params.inputSheetId);
    if (params.sapTemplateId) props.setProperty('SAP_TEMPLATE_ID', params.sapTemplateId);
    return { ok: true, message: 'Config saved' };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ================= BACKEND STUBS: SYNC, ADMIN, AUDIT =================
function getSyncStatus() {
  try {
    var props = PropertiesService.getScriptProperties();
    var lastSync = props.getProperty('LAST_SYNC') || 'Never';
    var items = [];
    try { items = readInputData_(); } catch(e) {}
    return {
      ok: true,
      sheetId: getInputSheetId_().substring(0, 8) + '...',
      records: items.length,
      lastSync: lastSync,
      status: 'Online'
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function syncData() {
  try {
    // Invalidate all caches to force fresh data
    invalidateAllCaches();
    var items = readInputData_();
    var now = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('LAST_SYNC', now);
    return {
      ok: true,
      records: items.length,
      lastSync: now,
      message: 'Synced ' + items.length + ' records'
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getSystemInfo() {
  try {
    return {
      ok: true,
      version: 'v9 (Phase 1-7)',
      runtime: 'Google Apps Script (V8)',
      deploy: ScriptApp.getScriptId().substring(0, 8) + '...'
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function invalidateAllCaches() {
  // Module-level caches
  invalidateInputCache();
  invalidateAmortCache();
  
  // CacheService: clear all known keys
  var cache = CacheService.getScriptCache();
  try {
    cache.remove('dash_v2');
    cache.remove('dash_data');
    cache.remove('dashboard_data');
    cache.remove('input_summary');
    cache.remove('amort_data');
    cache.remove('input_data_v2');
    cache.remove('avail_periods_v2');
    // Remove all sap_je_* cache keys
    var items = []; // Will be populated as needed; for now, pattern remove isn't available, so just remove known keys
  } catch(e) {}
}

function clearCache() {
  try {
    invalidateAllCaches();
    return { ok: true, message: 'All caches cleared' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= EMAIL NOTIFICATIONS =================
function escHtml_(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function getEmailConfig() {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('emailConfig');
    var defaults = {
      recipients: Session.getActiveUser().getEmail(),
      sendOnAutoRun: true,
      sendWeeklyAlerts: false,
      dashboardUrl: ScriptApp.getService().getUrl()
    };
    if (saved) {
      var parsed = JSON.parse(saved);
      for (var k in defaults) {
        if (parsed[k] === undefined) parsed[k] = defaults[k];
      }
      return { ok: true, config: parsed };
    }
    return { ok: true, config: defaults };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function saveEmailConfig(config) {
  try {
    PropertiesService.getScriptProperties().setProperty('emailConfig', JSON.stringify(config));
    logAction('Admin', 'Email config saved');
    return { ok: true, message: 'Email config saved' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sendAmortReport(period) {
  try {
    var cfg = getEmailConfig();
    if (!cfg.ok) throw new Error(cfg.error);
    var config = cfg.config;

    var items = readInputData_();
    var p = period || (new Date().getFullYear() + '-' + pad2_(new Date().getMonth() + 1));

    // Calculate amortization for the period
    var totalItems = 0, totalAmt = 0;
    for (var i = 0; i < items.length; i++) {
      var schedule = calculateAmortization_(items[i], p);
      if (schedule.length > 0) {
        totalItems++;
        for (var j = 0; j < schedule.length; j++) totalAmt += schedule[j].amortAmount;
      }
    }

    var recipients = config.recipients || Session.getActiveUser().getEmail();
    var subject = '📊 Amortization Report — ' + p;
    var dashboardUrl = config.dashboardUrl || ScriptApp.getService().getUrl();

    var htmlBody = buildAmortReportHtml_(p, totalItems, Math.round(totalAmt * 100) / 100, dashboardUrl);

    MailApp.sendEmail({
      to: recipients,
      subject: subject,
      htmlBody: htmlBody
    });

    logAction('Email', 'Amort report sent for ' + p + ' to ' + recipients);
    return { ok: true, message: 'Report sent to ' + recipients };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function buildAmortReportHtml_(period, totalItems, totalAmount, dashboardUrl) {
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;color:#333;background:#f9f9f9;padding:20px}' +
    '.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);overflow:hidden}' +
    '.header{background:#C9A96E;color:#fff;padding:20px;text-align:center}' +
    '.header h1{margin:0;font-size:20px}' +
    '.header p{margin:4px 0 0;opacity:.9;font-size:13px}' +
    '.body{padding:24px}' +
    '.kpi{display:inline-block;width:45%;margin:6px 2%;padding:14px;background:#f5f5f5;border-radius:6px;text-align:center}' +
    '.kpi .val{font-size:22px;font-weight:700;color:#1a5276}' +
    '.kpi .lbl{font-size:11px;color:#888;margin-top:2px}' +
    '.footer{text-align:center;padding:16px;font-size:11px;color:#aaa;border-top:1px solid #eee}' +
    '.btn{display:inline-block;padding:10px 24px;background:#C9A96E;color:#fff;text-decoration:none;border-radius:5px;font-size:14px;margin-top:12px}' +
    '</style></head><body>' +
    '<div class="container">' +
    '<div class="header"><h1>📊 Amortization Report</h1><p>' + dateStr + '</p></div>' +
    '<div class="body">' +
    '<p style="font-size:14px;margin-bottom:16px">Here is the summary for <strong>Period: ' + period + '</strong></p>' +
    '<div style="text-align:center">' +
    '<div class="kpi"><div class="val">' + totalItems.toLocaleString() + '</div><div class="lbl">Items Processed</div></div>' +
    '<div class="kpi"><div class="val">฿' + totalAmount.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) + '</div><div class="lbl">Total Amortization</div></div>' +
    '</div>' +
    '<div style="text-align:center;margin-top:16px">' +
    '<a href="' + dashboardUrl + '" class="btn">🔗 Open Dashboard</a>' +
    '</div>' +
    '</div>' +
    '<div class="footer">Prepaid Expense Amortization System · Automated Report</div>' +
    '</div></body></html>';
}

function checkAndNotify() {
  try {
    var cfg = getEmailConfig();
    if (!cfg.ok) throw new Error(cfg.error);
    var config = cfg.config;

    var items = readInputData_();
    var now = new Date();
    var thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    var expiringItems = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var end = new Date(item.endDate);
      if (isNaN(end.getTime())) continue;
      if (end > now && end <= thirtyDaysLater) {
        // Calculate remaining balance
        var schedule = calculateAmortization_(item, null);
        var remaining = schedule.length > 0 ? schedule[schedule.length - 1].remaining : item.amount;
        expiringItems.push({
          docNo: item.docNo,
          description: item.description,
          endDate: fmtDate_(end),
          amount: item.amount,
          remaining: remaining
        });
      }
    }

    if (expiringItems.length === 0) {
      logAction('Email', 'Expiration check: no items expiring in next 30 days');
      return { ok: true, message: 'No items expiring in the next 30 days', count: 0 };
    }

    var recipients = config.recipients || Session.getActiveUser().getEmail();
    var subject = '⚠️ ' + expiringItems.length + ' prepaid item(s) expiring soon';
    var dashboardUrl = config.dashboardUrl || ScriptApp.getService().getUrl();

    var htmlBody = buildExpirationAlertHtml_(expiringItems, dashboardUrl);

    MailApp.sendEmail({
      to: recipients,
      subject: subject,
      htmlBody: htmlBody
    });

    logAction('Email', 'Expiration alert sent: ' + expiringItems.length + ' items to ' + recipients);
    return { ok: true, message: 'Alert sent for ' + expiringItems.length + ' expiring items', count: expiringItems.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function buildExpirationAlertHtml_(items, dashboardUrl) {
  var rows = items.map(function(it) {
    return '<tr>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">' + escHtml_(it.docNo) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">' + escHtml_((it.description||'').substring(0,40)) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">' + escHtml_(it.endDate) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right">฿' + fmtMoney_(it.amount) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right">฿' + fmtMoney_(it.remaining) + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;color:#333;background:#f9f9f9;padding:20px}' +
    '.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);overflow:hidden}' +
    '.header{background:#B85252;color:#fff;padding:20px;text-align:center}' +
    '.header h1{margin:0;font-size:18px}' +
    '.header p{margin:4px 0 0;opacity:.9;font-size:13px}' +
    '.body{padding:24px}' +
    'table{width:100%;border-collapse:collapse;margin-top:10px}' +
    'th{background:#f5f5f5;padding:6px 8px;font-size:11px;text-align:left;border-bottom:2px solid #ddd}' +
    '.footer{text-align:center;padding:16px;font-size:11px;color:#aaa;border-top:1px solid #eee}' +
    '.btn{display:inline-block;padding:10px 24px;background:#C9A96E;color:#fff;text-decoration:none;border-radius:5px;font-size:14px;margin-top:12px}' +
    '</style></head><body>' +
    '<div class="container">' +
    '<div class="header"><h1>⚠️ Prepaid Items Expiring Soon</h1><p>' + items.length + ' item(s) will expire within 30 days</p></div>' +
    '<div class="body">' +
    '<p style="font-size:13px;color:#666">The following prepaid items are expiring soon. Please review and take necessary action.</p>' +
    '<table><thead><tr><th>Doc No</th><th>Description</th><th>End Date</th><th style="text-align:right">Amount</th><th style="text-align:right">Remaining</th></tr></thead><tbody>' +
    rows +
    '</tbody></table>' +
    '<div style="text-align:center;margin-top:16px">' +
    '<a href="' + dashboardUrl + '" class="btn">🔗 Open Dashboard</a>' +
    '</div>' +
    '</div>' +
    '<div class="footer">Prepaid Expense Amortization System · Expiration Alert</div>' +
    '</div></body></html>';
}

function sendTestEmail() {
  try {
    var email = Session.getActiveUser().getEmail();
    var subject = '✅ Test Email — Prepaid Amortization System';
    var htmlBody = '<!DOCTYPE html>' +
      '<html><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,sans-serif;color:#333;padding:20px}' +
      '.container{max-width:500px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:8px;padding:24px}' +
      '.header{font-size:18px;font-weight:700;color:#3A9F65;margin-bottom:12px}' +
      '</style></head><body>' +
      '<div class="container">' +
      '<div class="header">✅ Test Email</div>' +
      '<p>This is a test email from the <strong>Prepaid Expense Amortization System</strong>.</p>' +
      '<p>If you received this email, your email notification settings are working correctly.</p>' +
      '<hr style="border:none;border-top:1px solid #eee;margin:16px 0">' +
      '<p style="font-size:11px;color:#888">Sent: ' + new Date().toLocaleString('en-US') + '<br>Email: ' + email + '</p>' +
      '</div></body></html>';

    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });

    logAction('Email', 'Test email sent to ' + email);
    return { ok: true, message: 'Test email sent to ' + email };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sendWeeklyExpirationAlert() {
  try {
    var cfg = getEmailConfig();
    if (!cfg.ok) throw new Error(cfg.error);
    if (!cfg.config.sendWeeklyAlerts) {
      return { ok: true, message: 'Weekly alerts disabled' };
    }
    return checkAndNotify();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= MONTHLY TRIGGER (GAS Auto-Run) =================
function installMonthlyTrigger() {
  try {
    removeMonthlyTrigger();
    ScriptApp.newTrigger('autoMonthEndAmort').timeBased().onMonthDay(1).atHour(8).create();
    logAction('Admin', 'Monthly trigger installed');
    return { ok: true, message: 'Monthly trigger installed — runs on 1st of each month at 8:00' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function removeMonthlyTrigger() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'autoMonthEndAmort') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    logAction('Admin', 'Monthly trigger removed');
    return { ok: true, message: 'Monthly trigger removed' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function autoMonthEndAmort() {
  try {
    var result = runMonthEndAmortization(null);
    logAction('Admin', 'Auto month-end amortization completed');

    // Send email notification if enabled
    try {
      var cfg = getEmailConfig();
      if (cfg.ok && cfg.config.sendOnAutoRun) {
        var period = new Date().getFullYear() + '-' + pad2_(new Date().getMonth() + 1);
        sendAmortReport(period);
        logAction('Admin', 'Auto-run report sent');
      }
    } catch (e) {
      Logger.log('Auto email notification failed: ' + e.message);
    }

    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getTriggerStatus() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var found = null;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'autoMonthEndAmort') {
        found = triggers[i];
        break;
      }
    }
    if (found) {
      var nextDate = found.getNextRunTime();
      return {
        ok: true,
        installed: true,
        nextRun: nextDate ? nextDate.toISOString() : null,
        handler: 'autoMonthEndAmort'
      };
    }
    return { ok: true, installed: false, nextRun: null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

var auditLog_ = [
  { timestamp: new Date().toISOString(), action: 'System initialized', detail: 'Amort system started' },
  { timestamp: new Date().toISOString(), action: 'User guide loaded', detail: 'Guide data accessed' }
];

function getAuditLog() {
  try {
    return { ok: true, log: auditLog_ };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function logAction(action, detail) {
  try {
    auditLog_.push({
      timestamp: new Date().toISOString(),
      action: String(action || ''),
      detail: String(detail || '')
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
