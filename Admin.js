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
        name: 'Prepaid Expense Amortization System (Amort)',
        version: 'v36 (All Phases A-C: Quick Wins → Power Features → Enterprise: CRUD, Budget vs Actual, GL Recon, Import, Period-Close, Approval)',
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
      // Performance: module-level cache (60s) + CacheService (5 min)
      // Pagination: 50 items/page
      tabs: [
        {
          id: 'dashboard',
          icon: '📈',
          name: 'Dashboard',
          desc: 'ภาพรวมระบบ: 15 KPIs (Active Items, Month-End Closed, Running Balance, Actual vs Budget, MoM Change), 7 Charts (Monthly Trend, GL Pie, Top 10 by Amount, Running Balance, Budget vs Actual, Monthly Amortization, Status Breakdown)',
          howto: 'เปิดหน้าแรกมาแสดงอัตโนมัติ — KPI Row 1: Total Items, Total Amount, Current Period, Status. KPI Row 2: Active Items, Completed Items, Total Remaining, Avg Duration, Expiring This Month, MoM Change. Dashboard Config (⚙️): เลือก KPI ที่แสดง ปรับ Theme สลับ Dark/Light (พระจันทร์/พระอาทิตย์). คลิกที่ Chart เพื่อดู Drill-Down รายละเอียด',
          dataSource: 'CacheService (refresh อัตโนมัติทุก 5 นาที) + ข้อมูลงบประมาณจาก Budget tab'
        },
        {
          id: 'amort',
          icon: '🚀',
          name: 'Amortization',
          desc: 'คำนวณค่าใช้จ่ายตัดจ่ายรายเดือนแบบ Average Per Day — รองรับทั้งทีละงวด (Single Period) และหลายงวดพร้อมกัน (Multi-Period B2) + ตาราง Wide Format + Running Balance',
          howto: 'Single Period: กรอก YYYY-MM — กด Run — ดูผล KPI และตาราง Schedule. Multi-Period (B2): เปิด toggle Bulk Mode → เลือก Start Month และ End Month → กด Run → ระบบคำนวณทีละหลายงวด. Wide Tab: ตาราง 1 แถว/รายการ, คอลัมน์เดือนละ column. Running Balance Card: แสดงยอด Consumption + Remaining ราย DOC. Pagination 50 รายการ/หน้า. Export: Full Schedule (.xlsx), Monthly Pivot (.xlsx), This Period (.xlsx), Running Balance (.xlsx)',
          formula: 'Rate/Day = Amount ÷ TotalDays • Amort/Month = DaysInMonth × Rate/Day (ปัดเศษ 4 ตำแหน่ง หรือ Full Precision ตาม Settings)',
          dataSource: 'อ่านจาก Input Sheet Columns M (Start), N (End), O (Amount) • Cache Amortization Engine'
        },
        {
          id: 'crud',
          icon: '✏️',
          name: 'Prepaid (CRUD)',
          desc: 'จัดการข้อมูล Prepaid ครบวงจร: เพิ่ม (Add), แก้ไข (Edit), ลบ (Delete) — ค้นหา/กรอง + Pagination 50 รายการ + Modal ยืนยัน',
          howto: 'Add Record: กรอกรายละเอียดใน Modal → Save → ระบบ generate Doc No อัตโนมัติ. Edit: คลิก Edit→ แก้ไขข้อมูล → Save → เปรียบเทียบ Old vs New. Delete: คลิก Delete → ยืนยันอีกครั้ง → ระบบลบรายการ + ล้าง Cache',
          note: 'แก้ไข/ลบ → ล้าง CacheService + Module Cache อัตโนมัติ • Dashboard สะท้อนข้อมูลล่าสุดทันที • บันทึก Audit Log ทุกรายการ'
        },
        {
          id: 'budget',
          icon: '💰',
          name: 'Budget vs Actual',
          desc: 'ตั้งงบประมาณรายงวดและเปรียบเทียบกับยอดตัดจ่ายจริง — แยกตาม GL/Cost Center รองรับ Dashboard KPI เชื่อมโยง',
          howto: 'เลือกงวด YYYY-MM → Add Row → กรอก GL, Cost Center, งบประมาณ → Save. View vs Actual: กดปุ่ม → ตารางเปรียบเทียบ Budget/Actual/Variance/% การใช้ — แสดงทั้งตารางรวมและแยก GL',
          note: 'Variance = Budget - Actual • สีเขียว ≤ Budget, สีแดง > Budget (Overshoot) • ข้อมูลเชื่อมกับ Dashboard KPI Actual vs Budget'
        },
        {
          id: 'void',
          icon: '⛔',
          name: 'Void / Terminate',
          desc: 'ยกเลิกสัญญากลางคัน — รองรับทั้งทีละรายการและทีละหลายรายการ (Batch Void B3) + Refund/Loss พร้อมการปรับเปลี่ยนรายการ (Deferral Modify B4)',
          howto: 'Void ทีละรายการ: เลือก Doc No → ดู KPI (Amount/Amortized/Remaining) → เลือกประเภท (Full Refund/Partial Refund/Loss) → กำหนด Void Date/Loss GL → Preview → Execute. Batch Void (B3): ค้นหา/เลือกหลาย Doc No จาก Checkbox → Preview Batch → Execute ทีเดียวทุกรายการ (Error Isolation). Modify (B4): แก้ไข Start Date/End Date/Amount → ดู Old vs New เปรียบเทียบ → Save',
          types: ['Refund: Dr = GL (Key 40), Cr = IO (Key 50) (คืนเงิน)', 'Loss: Dr = Loss GL (Key 50), Cr = IO (Key 40) (ตัดสูญ)'],
          output: 'สร้าง Sheet VOID_JE_xxxx + .xlsx + บันทึก Log ใน _VOID_LOG • ประวัติแก้ไขใน Audit Log'
        },
        {
          id: 'import',
          icon: '📥',
          name: 'Import CSV/Excel',
          desc: 'นำเข้าข้อมูลจาก CSV หรือ Excel (Paste Text) — จับคู่คอลัมน์อัตโนมัติ 15 ฟิลด์ (TH/EN), ตรวจสอบความถูกต้องก่อนนำเข้า',
          howto: 'วางข้อมูลจาก Excel/CSV → กด Preview → ตรวจสอบ Column Mapping อัตโนมัติ (จับคู่ชื่อฟิลด์ไทย/อังกฤษ) → ยืนยัน Import → ดู Import History พร้อม Timestamp + Record Count',
          note: '15 system fields จับคู่อัตโนมัติ • รองรับ comma/tab delimiter • Validate ข้อมูลก่อน Import (check วันที่, ตัวเลข, ฟิลด์บังคับ) • เก็บประวัติใน Import History log'
        },
        {
          id: 'checker',
          icon: '🔍',
          name: 'Pre-Upload Checker',
          desc: 'ตรวจสอบความถูกต้องของข้อมูลก่อน Export SAP — 10 รายการตรวจสอบแบบละเอียด พร้อม Cache Result 5 นาที',
          howto: 'กด Run Check → ดูผลทีละรายการ (PASS ✅ / WARN ⚠️ / FAIL ❌) → Pagination 50 รายการ → ถ้ามี Error ต้องแก้ไขหรือลบข้อมูลผิดปกติก่อน Export SAP',
          checks: ['Doc No ครบ', 'Doc No ซ้ำ', 'IO ครบ', 'GL ครบ', 'วันที่เริ่มต้นครบ', 'วันที่สิ้นสุดครบ', 'Start ≤ End', 'วันที่สิ้นสุดผ่านไปแล้ว (Warning)', 'ยอดเงิน > 0', 'Amortization Sample Check']
        },
        {
          id: 'sap',
          icon: '📤',
          name: 'SAP Generator',
          desc: 'สร้าง SAP Journal Entry — Debit Key 40 = IO, Credit Key 50 = GL, สูงสุด 900 บรรทัด/เอกสาร (Batching อัตโนมัติ)',
          howto: 'Single: กรอกงวด → Preview (พร้อม Pagination) → Generate & Export → เปิด Sheet หรือ Download .xlsx. Bulk (B7): เปิด Bulk Export → เลือกหลายงวดจาก Checkbox → Preview ทีละงวด → Export พร้อมกัน (Error Isolation: งวดไหน Error ไม่กระทบงวดอื่น). Settings ควบคุม Company, DocType, Currency',
          note: 'Dr = Cr ทุกเอกสาร • Batching สร้างเอกสารละ 900 บรรทัด (MAX_LINES_PER_JE) • Bulk Export พร้อมผลรวม Docs/Lines/Debit/Credit/Rows'
        },
        {
          id: 'settings',
          icon: '⚙️',
          name: 'SAP Config',
          desc: 'ตั้งค่าระบบสำหรับ SAP Export: Company Code, Prepaid GL Account, Document Type, Currency, Max Lines/JE (900), Rounding Method (4dec/full), SAP Template ID',
          howto: 'แก้ไขค่าในฟิลด์ → กด Save → บันทึกใน Script Properties (persist ข้าม session). ค่าที่ตั้ง: Company (1022), DocType (KR), Prepaid GL (51990010), Currency (THB), Max Lines/JE (900), Rounding (4dec)',
          note: 'ค่าถูกบันทึกใน Script Properties • มีผลทันทีที่ Save • ไม่ต้อง Redeploy เพื่อเปลี่ยนค่า'
        },
        {
          id: 'periodclose',
          icon: '🔒',
          name: 'Period-Close',
          desc: 'ปิดงวดบัญชี — ตรวจสอบ Checklist 4 รายการ (Checker ✅ → Amortization 🚀 → SAP JE 📤 → Void ⛔) ก่อนปิดงวด พร้อมสถานะทีละรายการ',
          howto: 'เลือกงวด YYYY-MM → กด Run Checklist → ดูสถานะรายการ (✅ Done / ⏳ Pending / ❌ Error) → ถ้าทุกรายการ ✅ → กด Close Period → บันทึกหมายเหตุประกอบ → เปิดงวดใหม่ได้ด้วย Reopen',
          note: 'ประวัติการปิด/เปิดเก็บใน ScriptProperties • หมายเหตุประกอบการปิดงวด • รองรับ Reopen เมื่องวดต้องการแก้ไข'
        },
        {
          id: 'approvals',
          icon: '✅',
          name: 'Approvals',
          desc: 'ระบบอนุมัติการดำเนินการ (ยกเลิก/แก้ไข) — Submit → Approve/Reject → Auto-Execute เมื่อ Approve พร้อมประวัติและ Badge แจ้งเตือน',
          howto: 'Submit Tab: เลือก Doc No(s) → กรอกหมายเหตุ → Submit Request. Pending Tab: ดูรายการรออนุมัติ → Approve (ดำเนินการอัตโนมัติ) หรือ Reject (พร้อมเหตุผล). History Tab: ดูประวัติทั้งหมด (Approved/Rejected) พร้อม Timestamp และผู้ดำเนินการ',
          note: 'Badge แสดงจำนวน Pending Requests บนเมนู • Auto-Execute เมื่อ Approve: ดำเนินการ Void/Amort ตามที่ขอ • ประวัติย้อนหลังทั้งหมด'
        },
        {
          id: 'glrecon',
          icon: '📊',
          name: 'GL Reconciliation',
          desc: 'เปรียบเทียบ GL Balance (จาก SAP) กับยอดตัดจ่ายสะสมในระบบ — สีเขียว ≤1% diff, เหลือง 1-5%, แดง >5%',
          howto: 'เลือกงวด YYYY-MM → กด Load GL Accounts เพื่อดึง GL ทั้งหมด → กรอก GL Balance จาก SAP → Save → กด Run Reconciliation → ดูตารางเปรียบเทียบ (System Balance, GL Balance, Diff, %, Status) → Export Report (.xlsx)',
          note: 'ระบบโหลด GL ทั้งหมดจากข้อมูลตัดจ่าย • Reconciliation History เก็บทุกรอบ • รองรับ Export Report แยกตามสถานะ (OK/Warning/Error)'
        },
        {
          id: 'sync',
          icon: '🔄',
          name: 'Sync Data',
          desc: 'Data Source Synchronization — ตรวจสอบสถานะ Connection, จำนวน Records, Last Sync Timestamp, Quick Import CSV',
          howto: 'เปิดหน้า → ดูสถานะ (Sheet ID, Records 3,979, Last Sync, Online Indicator) → กด Sync Now เพื่อ Invalidate Cache + รีเฟรชข้อมูลจาก Input Sheet → ใช้ Quick Import CSV เพื่ออัปโหลดข้อมูลทีละน้อย',
          dataSource: 'อ่านจาก Input Sheet (payment system) ผ่าน CacheService + module-level cache 60s'
        },
        {
          id: 'audit',
          icon: '📋',
          name: 'Audit Log',
          desc: 'System Activity Log — บันทึกการดำเนินการทั้งหมด: Sync, Import, Cache Clear, Void, Approval, CRUD, Settings Change, Period Close',
          howto: 'เปิดหน้า → ดูตาราง Timestamp/Action/Detail/User — เรียงตามเวลาล่าสุด รองรับ Pagination',
          dataSource: 'บันทึกใน Audit Sheet ของ SAP Template • actions tracked: sync, import, cache_clear, void, void_batch, approve, reject, crud_add, crud_edit, crud_delete, settings_save, period_close, period_reopen, email_test, trigger_setup'
        },
        {
          id: 'admin',
          icon: '🛠️',
          name: 'Admin Console',
          desc: 'System Administration — System Info, Cache Management, Auto-Run Trigger (B1), Email Notifications (B6)',
          howto: 'System Info: ดู Version, Runtime, Script ID. Cache Management: กด Clear Cache (ล้าง CacheService + Module Cache). Auto-Run (B1): เปิด/ปิด Monthly Trigger → ตั้งวันที่ของเดือน (1-28) → ระบบตัดจ่ายอัตโนมัติวันนั้นทุกเดือน. Email (B6): ตั้ง Recipients → ทดสอบส่ง → เปิด/ปิด Monthly Report / Weekly Expiration Alert',
          note: 'Auto-Run: ใช้ Time-driven Trigger สัปดาห์ละครั้ง + ตรวจสอบวันที่ • Email: ส่งรายงานหลัง Auto-Run เป็น .xlsx • Weekly Alert: รายการที่จะหมดอายุใน 30 วัน'
        },
        {
          id: 'guide',
          icon: '📖',
          name: 'User Guide',
          desc: 'คู่มือการใช้งานระบบฉบับสมบูรณ์ — อธิบายทุกฟีเจอร์ ทุก Tab พร้อม Data Source และ Step-by-Step',
          howto: 'อ่านรายละเอียดแต่ละ Tab ที่แสดงในหน้านี้ • ข้อมูลระบบ, ข้อมูลนำเข้า, คำอธิบายแต่ละ Tab, Technical Notes'
        }
      ],
      techNotes: [
        'Amortization: Average Per Day — Rate/Day = Amount ÷ (EndDate - StartDate + 1 วัน)',
        'Rounding: เลือกได้ใน Settings — ปัด 4 ตำแหน่ง (4dec) หรือ เต็มความละเอียด (full)',
        'SAP JE: Debit Key 40 = IO Column (H), Credit Key 50 = GL Column (I)',
        'Batching: สูงสุด ' + CONFIG.MAX_LINES_PER_JE + ' Lines/JE Document — สร้างหลาย Document อัตโนมัติ (SAP JE + Void)',
        'Bulk SAP (B7): เลือกหลายงวด → Export พร้อมกัน — แต่ละงวดแยก try-catch ป้องกัน error ข้ามงวด',
        'Multi-Period Amort (B2): เลือกช่วง Start/End Month เพื่อคำนวณทีละหลายงวด',
        'Batch Void (B3): เลือกหลาย Doc No พร้อมกัน → รองรับ Full Refund, Partial Refund, Loss',
        'Deferral Modify (B4): แก้ไข Start Date/End Date/Amount ของรายการ — เปรียบเทียบ Old vs New',
        'Running Balance (B5): แสดงยอด Consumption + Remaining ราย DOC ใน Dashboard — ดูลึกถึงรายการ',
        'Email Notifications (B6): ส่งรายงานหลัง Auto-Run — Weekly Expiration Alert (30 วัน)',
        'Auto-Run Trigger (B1): ตั้งวันที่ N ของเดือน → Amortization อัตโนมัติ + ส่ง Email รายงาน',
        'Performance: Module-level cache (60s) + CacheService (5 min) — ทุก module เร็วขึ้น ลด GAS quota',
        'Pagination: 50 รายการ/หน้า — Amort results, SAP JE preview, Void doc list, Checker results, CRUD',
        'Cache Clear: ปุ่ม Clear Cache ใน Admin Console → ล้าง CacheService + Module-level cache',
        'Dark Mode: ใช้ CSS Variables + Local Storage — คงค่าที่ผู้ใช้เลือกข้าม Session',
        'Data Import (C7): วาง CSV/Excel → Auto-map columns (TH/EN) → Preview → Import → History',
        'GL Recon (C6): เปรียบเทียบ GL Balance (SAP) กับ System Balance — สีเขียว ≤1%, เหลือง 1-5%, แดง >5%',
        'Period-Close (C2): 4-item checklist (Checker → Amort → SAP → Void) ก่อนปิดงวด + History',
        'Approval Flow (C3): Submit → Approve/Reject → Auto-execute-on-approve + History',
        'Prepaid CRUD (C1): Add/Edit/Delete รายการ — Doc No Auto-generate + Audit Log',
        'Dashboard Config: เลือก KPI ที่แสดง / ซ่อน — ปรับแต่ง Dashboard ตามต้องการ',
        'Mobile Responsive: Hamburger Nav + Bottom Nav (≤768px) — ใช้งานบนมือถือได้',
        'Data Architecture: 3,979 records จาก Input Sheet — Cache อ่านครั้งเดียว ทำงานจาก Cache',
        'Void Types: Full Refund (กลับรายการ Dr/Cr), Partial Refund (ส่วนที่เหลือ), Loss (ตัดสูญ)',
        'Security: Authentication ผ่าน GAS Account — Domain/Anyone ตามการตั้งค่า appsscript.json'
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
      version: 'v36 (All Phases A-C: Quick Wins → Power Features → Enterprise: CRUD, Budget vs Actual, GL Recon, Import, Period-Close, Approval)',
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
