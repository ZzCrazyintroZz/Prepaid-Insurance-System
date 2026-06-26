# Budget Bonus DEV System — Structured Analysis

**System:** PTG Budget Bonus 2026  
**Type:** Google Apps Script Web App (HTML/CSS/JS frontend + GAS backend)  
**Files analyzed:** `/tmp/budget-ref/app.html` (2282 lines JS), `/tmp/budget-ref/index.html` (1145 lines HTML/CSS), `/tmp/budget-ref/Code.gs` (428 lines GAS)  
**Data source:** Google Sheet `14UTz2elIVuYB4caAHpqnJcQkPvUKbrzzr0DvxPvcf2U`, sheet tab "Bonus Y2026"

---

## 1. ARCHITECTURE

### 1.1 Data Loading (Sync Data mechanism)

The system uses a **4-layer priority chain** to load bonus data, defined in `loadGoogleSheetData()` (app.html:234):

| Priority | Method | Condition | Details |
|----------|--------|-----------|---------|
| 1 | **Cowork MCP** | `window.cowork.callMcpTool` exists | Reads file content from Google Sheet via MCP server `mcp__dc64c086-e99f-42e0-9bf2-f1f68709a95e__read_file_content`. Falls through if empty or fails. |
| 2 | **localStorage cache** | `ptg_bonus_data` key exists, < 1 hour old | Instant load from browser cache. Set after every successful sync. |
| 3 | **google.script.run** | `google.script.run` available (GAS Web App) | Calls `getBonusData(forceRefresh)` on server via async RPC. The server reads from Sheet and caches for 5 min in ScriptProperties. |
| 4 | **Legacy GAS HTTPS fetch** | `GAS_URL` defined | Tries 4 GET endpoint variations (`?sheet=Bonus%20Y2026`, `?sheetName=...`, `?action=getBonusData`, plain URL). Parses JSON array, `{data:...}`, or `{values:...}` (2D grid). |

**Loading flow in `doSync()`** (app.html:361):

1. Sets syncing flag, disables buttons, shows progress bar
2. Calls `loadGoogleSheetData(forceRefresh)` — tries methods 1→4
3. On success: populates `S.data`, computes aggregates (`_monthTotals`, `_buTotals`, `_ccTotals`, `_atTotals`), updates hero value, populates filter dropdowns, renders all charts (dashboard, BVA, xcal, acct, dup), saves to localStorage cache
4. On failure: falls back to embedded data (if available) or shows error state
5. Auto-refresh: fires `doSync(true)` silently every 5 minutes (`setInterval` in `initDashboard()`)

**GAS Backend (`Code.gs`):**

- `getBonusData(forceRefresh)` — checks ScriptProperties cache (5 min TTL), reads from Sheet on miss. Uses `readSheetData()` which:
  - Finds header row by scanning for ASCII keywords (`Jan`, `Feb`, `Mar`, `AccountCode`, `CostCenterCode`, `DepartmentName`, `SectionName`)
  - Falls back: finds first row where column 0 is a 4-digit number, takes row above as header
  - Parses 12 month columns + Total as floats, other columns as strings
- `refreshData()` — deletes cache property then calls `getBonusData(true)`

### 1.2 SAP Export Mechanism

The SAP Template Generator (app.html:1479-1734) produces **107-column Template_Intercom** format:

**User flow:**  
1. Select company(s) — multi-select checkbox dropdown (`#scoDD`)  
2. Select month — dropdown with Jan-Dec  
3. Enter Document Date, Post Date, Fiscal Period  
4. Enter GL Clearing (credit), Profit Center, Reference, Business Type, Item Text  
5. If multiple companies selected, a per-company config grid appears (GL/PC/BZ per company)  
6. Validate → checks data exists, CC mappings complete, enables Generate  
7. Preview → shows first 10 rows × 20 columns in a table  
8. Generate & Export → builds SAP rows, saves history, downloads `.xlsx`

**SAP Row building (`buildSAP107()`, app.html:1673):**
- Groups data by company code
- For each row: creates debit entry (Posting Key 40) using `AccountCode` as GL
- Batches of 900 rows per document sequence number
- After each batch: creates credit closing entry (Posting Key 50) with GL Clearing account, negated total
- Output columns: sequence# → company code → SA doc type → dates → fiscal period → THB → ref → posting key → GL → amounts (3 currencies) → business type → item text → cost center → profit center → (all 107 fields)

**Export format:** `.xlsx` via SheetJS (`XLSX.writeFile`), falls back to UTF-8 BOM CSV

**History:** Saved to localStorage `ptg_hist` + Google Sheet "Export History" tab via `saveExportHistory()` GAS function

### 1.3 Admin Panel Structure

Rendered in `rendAdmin()` (app.html:2147). Three rows:

**Row 1 — Status KPIs (4 cards):** Connection (Live/Waiting), Records (count), Last Sync (timestamp), Storage (KB)

**Row 2 — Two cards:**
- **Quick Actions:** Dashboard Report PDF, Bonus Data PDF, Budget vs Actual PDF, Force Sync, Clear Audit Log, Reset Dashboard
- **System Config:** Sheet ID, GAS API URL, Environment (GitHub Pages / GAS Web App / Local), Storage Used (KB + key count)

**Row 3 — Two cards:**
- **Local Cache:** Lists all localStorage keys with sizes (KB)
- **Recent Audit:** Last 50 audit log entries

---

## 2. FEATURES INVENTORY

### Overview Group

| Menu | Page ID | Function | What it does |
|------|---------|----------|-------------|
| **Dashboard** | `p-dash` | `rendDash()` | Hero with total bonus (฿XXX M), company cards with % of total, 5 charts (BVA bar, BU bar, monthly line, top 10 CC horizontal bar, account type doughnut), company summary table, export status mini-calendar. Click any chart/company to drill down. |
| **Data Sync** | `p-sync` | (status display) | Connection info card, Auto-Sync config (checkbox + interval 5/15/30/60 min), sync log box, status bar with records count, Sync Now button. |

### Data Group

| Menu | Page ID | Function | What it does |
|------|---------|----------|-------------|
| **Bonus Data** | `p-bonus` | `rendBonus()` | Filterable data table with search, company/BU/month/CC dropdowns, column visibility toggle, pagination (25/50/100 per page), CSV/Excel export, print. Shows anomaly highlighting on rows that deviate >30% from CC average. |
| **Cost Center** | `p-cc` | `rendCC()` | CC editor table with inline editing of "CC บันทึก (SAP)" field. Search + valid/missing filter. Import mapping, bulk Excel import, draft save, approve workflow. KPI strip (valid/missing/total/status). |
| **Budget vs Actual** | `p-bva` | `rendBVA()` | Large BVA bar chart, monthly cards (actual vs budget with colored bar), full summary table with diff/%/status. |
| **Export Calendar** | `p-xcal` | `rendXcal()` | Company × Month matrix showing export status (✓ green = exported, — gray = not). Click any cell for export details. Progress bar + stats. |
| **Account Type** | `p-acct` | `rendAcct()` | Doughnut chart of account types, account list with bars, stacked bar chart of top 6 types monthly, monthly breakdown table. |
| **Duplicate CC** | `p-dup` | `rendDup()` | Two panels: (1) CostCenterCode ≠ CostCenterCode บันทึก mismatches, (2) CCs that appear in multiple companies. |
| **Anomaly Detection** | `p-anomaly` | `rendAnomaly()` | Detects records where monthly amount deviates >30% from the CC's average. Filters: month, company, direction (high/low only). KPI strip + results table with deviation bars. |
| **Budget vs CC** | `p-cccomp` | `rendCCComp()` | Budget vs actual by cost center/department. Horizontal bar chart (top 10 depts), top variances list with bars, full table with searchable department filter. |
| **Data Validation** | `p-validation` | `rendValidation()` | Runs 4 checks: invalid CC format (not 9 digits starting with 1 or 2), duplicate CC codes, missing department names, negative amounts. KPI strip + detail panels for each check. |

### SAP Group

| Menu | Page ID | Function | What it does |
|------|---------|----------|-------------|
| **Template Generator** | `p-sap` | `valSAP()`, `prevSAP()`, `genSAP()` | 107-column SAP export: multi-company select, month select, date/period/GL/PC fields, per-company config, validate → preview → generate & download. Auto-batching of 900 rows. |
| **Export History** | `p-hist` | `rendHist()` | Table of all SAP exports: date, company, month, file name, records, amount, journals count, upload status. "Mark Uploaded" button per entry. |
| **Pre-Upload Checker** | `p-checker` | `runChecker()` | Runs pre-upload checks on selected data: missing CC, missing GL, zero amounts, duplicate CC+GL, total mismatch (sum of months ≠ Total column). Issues are categorized as error or warning. |

### Admin Group

| Menu | Page ID | Function | What it does |
|------|---------|----------|-------------|
| **Admin Console** | `p-admin` | `rendAdmin()` | System status KPIs, quick actions (PDF exports, force sync, clear logs, reset dashboard), system config display, localStorage cache browser, recent audit log. |
| **CC Master** | `p-master` | `rendMaster()` | Save/load/delete CC mapping configurations for reuse across years. Synced to Google Sheet "CC_Masters" tab. |
| **Audit Log** | `p-audit` | `rendAudit()` | Full audit log display (in-memory buffer, max 300 entries). |

### Help Group

| Menu | Page ID | Function | What it does |
|------|---------|----------|-------------|
| **User Guide** | `p-help` | (static HTML) | Hardcoded guide with: Getting Started (3 steps), Menu Overview (all menus described), SAP Template Generator (6-step instructions + multi-company/batch tips), Tips & Tricks (theme, mobile, global search, CC notes, print). |

---

## 3. SIDEBAR STRUCTURE

The sidebar (`<nav>` in index.html:498-522) is organized into **5 groups** with section headers:

```
┌─ Overview ─────────────────────┐
│  ◈  Dashboard                  │
│  ⟳  Data Sync                  │
├─ Data ─────────────────────────┤
│  💹  Bonus Data                │
│  🏛  Cost Center          [badge] │
│  📊  Budget vs Actual          │
│  🗓  Export Calendar           │
│  🔖  Account Type              │
│  ⚠️  Duplicate CC              │
│  📡  Anomaly Detection         │
│  ⚖  Budget vs CC              │
│  ✅  Data Validation    [badge]│
├─ SAP ──────────────────────────┤
│  ⚙   Template Generator        │
│  📂  Export History            │
│  🔍  Pre-Upload Checker        │
├─ Admin ────────────────────────┤
│  ⚙   Admin Console             │
│  🗂   CC Master                │
│  🔎  Audit Log                 │
├─ Help ─────────────────────────┤
│  📖  User Guide                │
└────────────────────────────────┘
```

**Badge indicators:**
- Cost Center: red badge with count of missing CC entries
- Data Validation: pass/fail badge with count of issues

**Icons:** All Unicode characters/emoji — no icon library. Active item gets gold left border + gold text. Hover turns text white.

**Mobile:** At ≤768px, sidebar becomes a slide-out drawer (260px). Bottom navigation bar appears with 5 items: Dashboard, Bonus, CC, Budget, Sync.

---

## 4. SYNC DATA — Detailed

### UI Components

The Sync page (`#p-sync`) has 3 main cards in a 3-column grid:

**Card 1 — Connection:**
- Source: `ALL_ประมาณการ_Bonus_Y'2026`
- API: "Google Apps Script" (green badge)
- Sheet Tab: `Bonus Y2026`
- Format: "Jan–Dec + Total columns"

**Card 2 — Auto-Sync:**
- Checkbox: "เปิดใช้ Auto-Sync" (enabled by default)
- Interval dropdown: 5, 15 (default), 30, 60 min
- Status display: "Active — every 15 min" / "Disabled"

**Card 3 — Sync Log:**
- Scrolling log box with timestamped entries
- Color-coded: ℹ info (blue), ✓ ok (green), ✗ error (red)

### Top Status Bar

- Badge: "● Not Synced" / "● Syncing..." / "● Live — GAS Direct" / "● Offline (embedded)" / "● Cached (N recs)"
- Date: timestamp of last sync
- Records count

### Sync Process

1. `doSync(silent)` is called (via button, auto-refresh, or pull-to-refresh)
2. Detects environment (Cowork vs GAS)
3. Sets progress: 15% (Connecting) → 40% (Fetching data) → 80% (Processing) → 100% (Done)
4. Calls `loadGoogleSheetData()` which tries methods 1-4 as described above
5. On success: updates all data structures, re-renders dashboard + charts, saves to localStorage cache, updates header dot (green=live, yellow=cached/embedded, red=error)
6. On failure: falls back to cache, shows yellow/red dot
7. Sets `S.syncing=false`, re-enables buttons, hides progress after 800ms

### Header Indicators

- **Dot color:** Green = live data, Yellow = cached/embedded, Red = connection failed
- **Text:** "N records (Live)" or "N records · Embedded" or "⛔ Connection failed"

---

## 5. ADMIN CONSOLE — Settings/Config

### Quick Actions (Admin-only)

| Action | Function | Description |
|--------|----------|-------------|
| 📄 Dashboard Report | `exportPDF()` | Opens new window with printable dashboard summary report |
| 💹 Bonus Data | `exportBonusPDF()` | Opens new window with filtered bonus data table |
| 📊 Budget vs Actual | `exportBVAPDF()` | Opens new window with BVA monthly comparison |
| ⟳ Force Sync | `doSync()` | Triggers data sync |
| 🗑 Clear Audit Log | `admClearLog()` | Empties in-memory audit log array |
| 🔄 Reset Dashboard | `admReset()` | Clears all data, cache, mappings, history; reloads page |

### System Info Display

| Field | Source |
|-------|--------|
| Sheet ID | `SHEET_ID` constant |
| GAS API URL | `GAS_URL` constant |
| Environment | Detected from `location.hostname` (GitHub Pages / GAS Web App / Local) |
| Storage Used | Computed from `localStorage` serialized size (KB) + key count |

### Role Toggle

- Two roles: **Admin** (🔑) and **Viewer** (👁)
- Viewer mode hides the Sync button and disables CC editing, import, approve, clear log, reset
- Stored in `localStorage ptg_admin`

### Theme Toggle

- Dark/Light mode toggle
- Stored in `localStorage ptg_theme`
- Toggle recreates all charts with appropriate grid colors

### Cache Browser

- Lists all localStorage keys with their size in KB
- Keys include: `ptg_bonus_data`, `ptg_bonus_ts`, `ptg_cc`, `ptg_ccnotes`, `ptg_hist`, `ptg_master`, `ptg_autosync`, `ptg_autosync_min`, `ptg_admin`, `ptg_theme`, `ptg_viscols`, `ptg_sec_dash`, `ptg_sec_bonus`, `ptg_bps`, `ptg_ccps`, `ptg_cc_draft`

---

## 6. AUDIT LOG

### Implementation

The audit log is a **client-side in-memory circular buffer**:

```
S.logs → array of {ts: string, t: string, m: string}
         (timestamp, type: 'ok'|'er'|'info', message)
```

- **Max entries:** 300 (`.slice(0,300)` when rendering)
- **Storage:** Not persisted to any backend — purely in `S.logs` array
- **Display:** `#auditB` shows all entries with color-coded type (green=ok, red=error, blue=info)
- **Also shown in:** Admin Console preview (last 50 entries)
- **Clear:** `admClearLog()` empties the array (Admin-only)

### Events Captured

| Event | Type | Message Example |
|-------|------|----------------|
| Dashboard opened | ok | "Dashboard opened — 26/6/2569 14:30:00" |
| Data sync | ok | "GAS Direct sync: 3938 rows at ..." |
| Data sync | er | "GAS sync failed: ..." |
| Navigation | info | "Drill-down: 1000" |
| Navigation | info | "Drill-down: bu=PTG" |
| SAP Validate | ok | "SAP Validate: 1000,1001/Jun = 245 rows" |
| SAP Validate | er | "SAP Validate blocked: 5 missing CC" |
| SAP Export | ok | "SAP Export: SAP_Template_Intercom_1000_Jun_2026-06-26.xlsx (189 rows)" |
| SAP Export | er | "SAP Generate blocked: 3 missing CC" |
| CC edit | info | "CC: 123456789 → 987654321" |
| CC draft/approve | ok | "CC Approved" / "CC Draft saved" |
| CC import | ok | "Bulk CC import: 50 mappings" |
| Export history | info | "Pre-Upload Check: 1000 rows, 2 issues" |
| CSV/Excel export | ok | "Export Excel: 500 rows" |
| Dashboard report | (from exportPDF) | (just console.log, not audit) |

---

## 7. SAP EXPORT — Detailed

### Number of SAP Tabs/Formats

**One format:** `Template_Intercom` with **107 columns**.

### Column Structure

The 107 columns (defined in `SAP107_HDR` array, app.html:1644-1671) are:

| Col # | Header | Purpose |
|-------|--------|---------|
| 0 | ลำดับที่ | Sequence/batch number |
| 1 | รหัสบริษัท | Company code |
| 2 | ประเภทเอกสาร | Document type (always "SA") |
| 3 | วันที่เอกสาร | Document date (DD.MM.YYYY) |
| 4 | วันที่ผ่านรายการ | Posting date |
| 5 | งวดบัญชี | Fiscal period |
| 6 | สกุลเงิน | Currency (THB) |
| 7-9 | อัตราแลกเปลี่ยน 등 | Exchange rate fields (empty) |
| 10 | เลขอ้างอิง | Reference number |
| 11 | ข้อความส่วนหัวเอกสาร | Header text (empty) |
| 12-14 | สาขาภาษี, ไม่ใช้, ไม่ใช้ | Tax branch + unused |
| 15 | คีย์การผ่านรายการ | Posting key (40=debit, 50=credit) |
| 16 | รหัสบัญชีแยกประเภท | GL account |
| 17-18 | รหัสบัญชีพิเศษ, reconcile | Special GL, offsetting account |
| 19-21 | จำนวนเงิน (3 currencies) | Amount in THB × 3 |
| 22 | ประเภทธุรกิจ | Business type |
| 23-33 | Business partner, payment terms, etc. | Various (mostly empty) |
| 34 | ข้อความ | Item text |
| 35-42 | Tax codes, tax amounts | VAT fields |
| 43 | ศูนย์ต้นทุน | Cost center |
| 44 | ศูนย์กำไร | Profit center |
| 45-107 | Other controlling, sales, withholding tax, customer fields | All empty |

### Key Behaviors

- **Debit rows (PK 40):** One per data row, GL from `AccountCode`, amount from selected month
- **Credit rows (PK 50):** One per batch, GL Clearing account, negated batch total
- **Batch size:** 900 rows per batch (SAP upload limit)
- **Multi-company:** When multiple companies selected, each company gets its own debit rows + credit closing, using per-company GL/PC/BZ config
- **Date format:** DD.MM.YYYY (SAP standard)
- **Validation:** Checks for missing CC mappings before allowing export
- **File naming:** `SAP_Template_Intercom_{company}_{month}_{date}.xlsx`

### Export Options in UI

| Field | ID | Default |
|-------|----|---------|
| Company | `#scoDD` (multi-select) | None |
| Month | `#smo` | None |
| DOC DATE | `#sdoc` | Today |
| POST DATE | `#spost` | Today |
| งวดบัญชี | `#sfis` | Current month (01-12) |
| GL Clearing (Credit) | `#sglc` | `21240030` |
| Profit Center (Credit) | `#sprc` | (empty) |
| เลขอ้างอิง (REF) | `#sref` | `ACC_BONUS_{period}-{year}` |
| Business Type | `#sbiz` | `9001` |
| ITEM TEXT | `#stxt` | `ประมาณการโบนัส_Y'2026_{month}` |

---

## 8. HELP/USER GUIDE

### Implementation

The help page (`#p-help`) is **static HTML** hardcoded in `index.html` (lines 1028-1072). It is NOT dynamically generated — it's plain HTML with CSS classes. Has 4 sections:

**Section 1: 🔄 Getting Started** (3 steps)
1. Press Sync button to load latest data from Google Sheet
2. Dashboard shows totals, charts, company cards — click company card for details
3. Use Company/Department/Search filters in Bonus Report page

**Section 2: 📋 Menu Overview** (descriptions of all 14 menus)

**Section 3: ⚙ SAP Template Generator** (6-step guide)
1. Select Company (4-digit code, multi-select)
2. Select Month
3. Enter Doc Date / Post Date / Fiscal Period
4. Press Validate → check data
5. Press Preview → preview before export
6. Press Generate & Export → download .xlsx

Plus notes on multi-company selection and batch splitting (900 rows/batch)

**Section 4: 💡 Tips & Tricks**
- Dark/Light mode toggle
- Mobile support with bottom nav
- Global search in header
- CC Notes (click 📝 icon)
- Print button in Export History

---

## Summary of Key Architectural Decisions

1. **Two-file HTML structure:** `index.html` is served by GAS `doGet()`, includes `app.html` via `<?!= include('app'); ?>`
2. **Multi-environment support:** Same code works on GAS Web App, GitHub Pages (PWA), or local — auto-detects environment
3. **Defensive fallback chain:** 4 data loading methods, each catching errors and falling through
4. **localStorage as primary cache:** All data, mappings, history, settings stored in browser localStorage
5. **Google Sheet as secondary persistence:** Export history and CC masters synced to Sheet when GAS API available
6. **In-memory audit log:** Not persisted to any backend — lost on page refresh
7. **SAP batching logic:** 900-row batches with credit closing entries — handles both single and multi-company scenarios
8. **Viewer/Admin roles:** All destructive operations are gated by `isViewer()` check
