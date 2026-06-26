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

function clearCache() {
  try {
    CacheService.getScriptCache().remove('dashboard_data');
    CacheService.getScriptCache().remove('input_summary');
    CacheService.getScriptCache().remove('amort_data');
    return { ok: true, message: 'Cache cleared' };
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
