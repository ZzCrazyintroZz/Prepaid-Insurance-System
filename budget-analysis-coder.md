# Budget Bonus DEV → Amort Porting Analysis

**Source**: `/tmp/budget-ref/` (Budget Bonus DEV)  
**Purpose**: Deep-dive into features Tony wants to port to the Amort prepaid system.  
**Files analyzed**: `Code.gs` (428 lines), `app.html` (2282 lines JS), `index.html` (1145 lines HTML/CSS)

---

## 1. SYNC DATA Mechanism

### How it works

**Backend (`Code.gs` lines 39–86)**:
- `getBonusData(forceRefresh)` reads from a **Google Sheet** using `SpreadsheetApp.openById(SHEET_ID)`
- Uses **PropertiesService.getScriptProperties()** as a server-side cache with **5-minute TTL**
- `readSheetData(sheet)` auto-detects the header row by scanning for ASCII keywords (`Jan`, `Feb`, `AccountCode`, `CostCenterCode`), then falls back to a 4-digit company code in column 0
- `refreshData()` deletes the cache key then calls `getBonusData(true)` for a forced refresh

```javascript
// Code.gs L39-52 — Cache-first pattern
function getBonusData(forceRefresh) {
  if (!forceRefresh) {
    const cache = PropertiesService.getScriptProperties();
    const cached = cache.getProperty(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.ts && (Date.now() - parsed.ts) < CACHE_TTL && parsed.data && parsed.data.length > 0) {
        return { ok: true, data: parsed.data, method: 'GAS Cache (Nmin)' };
      }
    }
  }
  // Cache miss → read from Sheet
  const result = readSheetData(sheet);
  // Best-effort cache write
  PropertiesService.getScriptProperties().setProperty(CACHE_KEY, JSON.stringify({ data: result.data, ts: Date.now() }));
  return result;
}
```

**Frontend (`app.html` lines 229–305, 360–462)**:
- **Multi-strategy progressive loading** with fallbacks:
  1. **Cowork MCP** (if `window.cowork.callMcpTool` exists) → parses raw text
  2. **localStorage cache** (`ptg_bonus_data`) — instant load, 1-hour TTL
  3. **google.script.run** (GAS Web App native API) — primary runtime path
  4. **Legacy GAS fetch** (HTTPS GET to GAS_URL) — fallback with 4 endpoint variants
  5. **Embedded fallback** — hardcoded data in the HTML
- `doSync(silent)` drives the UX: progress bar (15%→40%→80%→100%), status badges, skeleton placeholders

```javascript
// app.html L361-427 — doSync() core flow
async function doSync(silent) {
  setPb(15, 'Connecting...');
  // Clear cache only if !silent
  if(!silent) localStorage.removeItem("ptg_bonus_data");
  const result = await loadGoogleSheetData(!silent);
  S.data = parsed; S.filt = parsed;
  // Update hero, charts, tables
  populateSels(); applyF(); rendCC(); ccKpis(); rendDash();
  // Cache to localStorage
  localStorage.setItem('ptg_bonus_data', JSON.stringify(parsed));
  localStorage.setItem('ptg_bonus_ts', Date.now());
}
```

### What the frontend shows during sync

| Stage | Progress | UI text |
|-------|----------|---------|
| Start | 0% | Dot turns yellow, "Syncing…", badge "● Syncing..." |
| Connecting | 15% | "Connecting..." |
| Fetching | 40% | "Fetching data..." |
| Processing | 80% | "Processing N records via [method]..." |
| Done | 100% | "Done", dot green, "N records (Live)" |
| Error | — | Dot red, "Offline (embedded)", toast with error |

### Cache strategy (summary)

| Layer | Storage | TTL | Key |
|-------|---------|-----|-----|
| Server (GAS) | ScriptProperties | 5 min | `BONUS_DATA_CACHE` |
| Browser | localStorage | 1 hour | `ptg_bonus_data` + `ptg_bonus_ts` |
| Section (dash/bonus) | localStorage | 1 hour | `ptg_sec_dash`, `ptg_sec_bonus` |

### Effort to port: **Medium**

Core logic is simple (fetch → parse → display), but the multi-strategy fallback chain and cache layers need to be replicated. For Amort, you'd replace the Cowork MCP / GAS with your own backend API. The progressive loading UX pattern (skeleton → fetch → update) is directly reusable.

---

## 2. SAP Export

### How many export options?

**One primary format**: SAP Template_Intercom (107 columns).  
**Two output file types**: `.xlsx` (via SheetJS/XLSX library) or `.csv` fallback if XLSX unavailable.

### SAP formats

The template is a standard **SAP FB50 journal entry upload** with 107 columns defined in `SAP107_HDR` (app.html lines 1644–1671).

### How JEs are structured (`buildSAP107`, lines 1673–1734)

```javascript
function buildSAP107(data, mo, co, docDate, postDate, fiscalPd) {
  // For each row in data:
  //   DR entry: Posting Key 40, GL = AccountCode, Amount = +amt
  //   Fields: bukrs='SA', doc=ddFmt, post=ppFmt, period=fm,
  //           currency='THB', bizType, CC, itemText, tax='VX'
  // Grouped by company, then batched at 900 rows/batch.
  // After each batch: CR entry (Posting Key 50) for batch total
  //   with GL Clearing (default '21240030'), amount = -batchTotal
}
```

**Journal entry structure**:
- **DR lines** (Posting Key `40`): 1 per data row, debits the expense GL, populates cost center
- **CR lines** (Posting Key `50`): 1 per batch, credits the GL Clearing account (default `21240030`) for the batch total
- **Batch splitting**: 900 rows max per batch (SAP limit). Each batch produces a separate journal entry with its own Cr closing line

**Key fields per JE row** (of 107 total):
```
[0]  seq (batch #)
[1]  bukrs (company code)
[2]  'SA' (document type)
[3-4] doc date, post date
[5]  fiscal period (e.g., '05')
[6]  'THB' (currency)
[10] reference number (e.g., 'ACC_BONUS_05-26')
[15] posting key ('40'=Dr, '50'=Cr)
[16] GL account
[19-21] amount (document, local, group currency)
[22] business type (default '9001')
[34] item text
[35] tax code ('VX')
[43] cost center (Dr) / profit center (Cr: col 44)
```

### Multi-company support

When multiple companies are selected, per-company config is shown for GL Clearing, Profit Center, and Business Type (lines 1501–1536). Each company's data is grouped and batched separately.

### Effort to port: **Hard**

The SAP 107-column template is bespoke to this system. For Amort you'd need a **new SAP template** (likely different columns, account codes, GL mappings). However, the **core pattern** (Dr per row, Cr batch closing, auto-batch-split at 900 rows) is directly reusable. The `buildSAP107()` function is a 60-line function — the porting work is in defining Amort's SAP headers and account mappings, not the logic itself.

---

## 3. Admin Console

### What admins can configure

**Rendered by** `rendAdmin()` (app.html lines 2147–2182). Located at `index.html` lines 960–1009.

### KPI strip (read-only status)

| Metric | Source |
|--------|--------|
| Connection status | `S.data.length ? '🟢 Live' : '🟡 Waiting'` |
| Records count | `S.data.length.toLocaleString()` |
| Last sync time | First `ok` log entry containing `✓` |
| Storage used | `JSON.stringify(localStorage).size / 1024` KB |

### Quick actions

| Action | Function | Viewer-gated |
|--------|----------|--------------|
| 📄 Dashboard Report | `exportPDF()` | No |
| 💹 Bonus Data | `exportBonusPDF()` | No |
| 📊 Budget vs Actual | `exportBVAPDF()` | No |
| ⟳ Force Sync | `doSync()` | No (but viewer blocked in doSync) |
| 🗑 Clear Audit Log | `admClearLog()` | Yes — `isViewer()` |
| 🔄 Reset Dashboard | `admReset()` | Yes — `isViewer()` + `confirm()` |

### System config (read-only display)

- Sheet ID, GAS API URL, Environment (GitHub Pages / GAS Web App / Local)
- Storage detail: "N.NKB / M keys"
- Role display + toggle
- Theme display + toggle

### Cache viewer

Shows all `localStorage` keys with their sizes in KB.

### Cost Center override

**Not in Admin Console directly** — managed in the CC page (`p-cc`). But the **CC override mechanism** is critical:

```javascript
// app.html L1122-1128 — The CC resolution chain
function getCC(row) {
  const k = row['CostCenterCode'];
  if (S.ccOvr[k] !== undefined && S.ccOvr[k] !== '') return S.ccOvr[k];  // 1. Manual override
  const rec = row['CostCenterCode บันทึก'];
  if (rec && String(rec).trim()) return String(rec).trim();              // 2. "Recorded" column
  return k;                                                               // 3. Original
}
```

CC overrides are stored in:
- `localStorage` (`ptg_cc`) — quick access
- `S.ccOvr` — in-memory state object
- Google Sheet `CC_Masters` tab — persistent via `saveCCMaster()` / `getCCMasters()`

### User management

**None** — it's a simple localStorage role toggle (`ptg_admin`):
```javascript
S.isAdmin = localStorage.getItem('ptg_admin') === 'true';
```
Viewer mode hides: Sync button, CC editing, all data-modifying actions.

### Effort to port: **Medium**

Admin console is mostly a read-only status dashboard. The CC override chain is the important piece. For Amort you'd want actual user auth (not localStorage toggle) and section-specific config (amortization rules, prepaid parameters).

---

## 4. Audit Log

### How history is tracked

**Two separate history mechanisms**:

#### A. In-memory audit log (client-side only)

```javascript
// app.html L1074 — The audit function
function audit(t, m) {
  S.logs.unshift({ ts: new Date().toLocaleString('th-TH'), t, m });
  const el = document.getElementById('auditB');
  if (el) el.innerHTML = S.logs.slice(0, 300).map(l => ...).join('');
}
```

- `S.logs` is initialized as empty `[]` (line 47)
- **NOT persisted** to localStorage — lost on refresh
- Max 300 entries displayed
- Used for: sync events, SAP exports, CC edits, navigation, errors

#### B. Export History (localStorage + Google Sheet)

```javascript
// app.html L1626-1629 — genSAP saves to localStorage + Sheet
S.hist.unshift(hEntry);
if (S.hist.length > 50) S.hist.pop();
localStorage.setItem('ptg_hist', JSON.stringify(S.hist));
// Also server-side:
gasRun('saveExportHistory', entry);  // saves to 'Export History' sheet
```

- `S.hist` persisted to localStorage (`ptg_hist`) — max 50 entries
- Server history via `saveExportHistory()` → Google Sheet tab "Export History"
- Columns: ID, Company, Month, Export Date, File Name, Records, Total Amount, Journals, Doc Date, Post Date, Uploaded, User
- Two-way sync: `loadExportHistoryFromSheet()` merges Sheet records into local `S.hist`
- History used by: Export Calendar (renders grid by company×month), Pre-Upload Checker

#### C. CC Master history (localStorage + Google Sheet)

- `S.masters` persisted to localStorage (`ptg_master`)
- Sheet storage: `CC_Masters` tab with columns Name, Date, Mappings (JSON), User

### Effort to port: **Easy**

The in-memory audit log is trivial. The export history pattern (localStorage + backend sheet) is standard CRUD. For Amort, you'd likely want a proper database backend instead of a Google Sheet, but the frontend patterns are directly portable.

---

## 5. Sidebar HTML Structure

### Exact nav structure (`index.html` lines 498–522)

```html
<nav>
  <div class="ng">Overview</div>                              <!-- Group label -->
  <div class="ni on" id="nav-dash" onclick="go('dash')">     <!-- Active item -->
    <span class="ic">◈</span>Dashboard

  <div class="ng">Data</div>
  <div class="ni" id="nav-sync" onclick="go('sync')">⟳ Data Sync
  <div class="ni" id="nav-bonus" onclick="go('bonus')">💹 Bonus Data
  <div class="ni" id="nav-cc" onclick="go('cc')">
    🏛 Cost Center<span class="nbdg hidden" id="ccb">0</span>  <!-- Badge -->
  <div class="ni" id="nav-bva" onclick="go('bva')">📊 Budget vs Actual
  <div class="ni" id="nav-xcal" onclick="go('xcal')">🗓 Export Calendar
  <div class="ni" id="nav-acct" onclick="go('acct')">🔖 Account Type
  <div class="ni" id="nav-dup" onclick="go('dup')">⚠️ Duplicate CC
  <div class="ni" id="nav-anomaly" onclick="go('anomaly')">📡 Anomaly Detection
  <div class="ni" id="nav-cccomp" onclick="go('cccomp')">⚖ Budget vs CC
  <div class="ni" id="nav-validation" onclick="go('validation')">
    ✅ Data Validation <span class="val-badge pass hidden" id="valBadge">

  <div class="ng">SAP</div>
  <div class="ni" id="nav-sap" onclick="go('sap')">⚙ Template Generator
  <div class="ni" id="nav-hist" onclick="go('hist')">📂 Export History
  <div class="ni" id="nav-checker" onclick="go('checker')">🔍 Pre-Upload Checker

  <div class="ng">Admin</div>
  <div class="ni" id="nav-admin" onclick="go('admin')">⚙ Admin Console
  <div class="ni" id="nav-master" onclick="go('master')">🗂 CC Master
  <div class="ni" id="nav-audit" onclick="go('audit')">🔎 Audit Log

  <div class="ng">Help</div>
  <div class="ni" id="nav-help" onclick="go('help')">📖 User Guide
</nav>
```

### CSS class structure

| Class | Purpose |
|-------|---------|
| `ng` | **Group header** — uppercase, muted, spaced |
| `ni` | **Nav item** — flex row, icon + label, hover state |
| `ni.on` | **Active** — gold accent bar on left, highlighted text |
| `.ic` | Icon container (16px, centered) |
| `.nbdg` | Notification badge (red circle, positioned right) |

### Navigation mechanism (`go()` function, lines 1077–1115)

```javascript
function go(p) {
  // Hide all pages, deselect all nav items
  document.querySelectorAll('[id^="p-"]').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(e => e.classList.remove('on'));
  // Show target page + activate nav item
  document.getElementById('p-'+p).classList.remove('hidden');
  document.getElementById('nav-'+p).classList.add('on');
  // Section cache for dash/bonus pages
  if (p === 'dash' || p === 'bonus') {
    if (readSectionCache(p)) { /* use cached HTML */ return; }
  }
  // Lazy-render the page
  if (p === 'dash') rendDash();
  if (p === 'bonus') applyF();
  // ...etc for all pages
}
```

### Effort to port: **Easy**

The nav structure is pure HTML+CSS. The `go()` page-routing pattern with lazy rendering and section caching is directly reusable. For Amort you'd just rename the page IDs and icons.

---

## 6. Reusable Code Patterns for Amort

### Pattern 1: State object (`S`) as central store
```javascript
const S = {
  data: [], filt: [],          // Data + current filter view
  ccOvr: safeLS('ptg_cc','{}'), // CC overrides
  hist: safeLS('ptg_hist','[]'), // Export history
  masters: safeLS('ptg_master','[]'), // Saved CC masters
  logs: [],                     // Audit log
  syncing: false,               // Sync state
  bpg: 1, bps: 50,             // Bonus pagination
  ccpg: 1, ccps: 60,           // CC pagination
  approved: false,
};
```
**Port to Amort**: Replace CC-specific props with Amort-specific data (prepaid items, amort schedules, etc.)

### Pattern 2: CC Override chain (`getCC()`)
```javascript
function getCC(row) {
  if (S.ccOvr[k] !== undefined && S.ccOvr[k] !== '') return S.ccOvr[k];  // Override
  const rec = row['CostCenterCode บันทึก'];                                // Recorded
  if (rec && String(rec).trim()) return String(rec).trim();
  return k;                                                                // Original
}
```
**Port to Amort**: Reuse for any field that needs a manual override chain (e.g., GL account, department code)

### Pattern 3: Safe localStorage helper
```javascript
function safeLS(k, def) { 
  try { return JSON.parse(localStorage.getItem(k) || def); } 
  catch(e) { return JSON.parse(def); }
}
```

### Pattern 4: `gasRun()` Promise wrapper
```javascript
function gasRun(fn, ...a) {
  return new Promise((s, f) => {
    try { google.script.run.withSuccessHandler(s).withFailureHandler(f)[fn](...a); }
    catch(e) { f(e); }
  });
}
```
**Port to Amort**: Replace with a `fetch()` wrapper around your REST API, keeping the same Promise interface.

### Pattern 5: Multi-environment loader (`loadGoogleSheetData`)
The progressive fallback chain (MCP → Cache → GAS → fetch → embedded) is a clean pattern. For Amort, simplify to: localStorage cache → REST API.

### Pattern 6: Chart.js wrapper with auto-cleanup
```javascript
function mkC(id, type, data, opts = {}) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  try { Chart.getChart(id)?.destroy(); } catch(e) {}  // Auto-destroy previous
  new Chart(el, { type, data, options: { responsive: true, maintainAspectRatio: false, ...opts } });
}
```

### Pattern 7: Pagination helper
```javascript
function mkPg(id, pg, tot, fn) {
  // Renders compact page buttons with ellipsis for large page counts
}
```

### Pattern 8: CSV/XLSX export utilities
```javascript
function dlCSV107(rows107, headers, fn) { /* BOM-prefixed CSV download */ }
function dlXLSX107(rows107, headers, fn) { /* SheetJS workbook download */ }
```

### Pattern 9: SAP batch JE builder (core logic)
```javascript
function buildSAP107(data, mo, co, docDate, postDate, fiscalPd) {
  // 1. Group by company
  // 2. Build DR rows (PK 40) per data record
  // 3. Batch at 900 rows
  // 4. Append CR closing row (PK 50) per batch
  // Returns flat array of 107-column arrays
}
```
**Port to Amort**: This is the most reusable pattern — the batch-split + Dr/Cr structure is universal for SAP FB50 imports. You'd replace the 107-column headers and account mappings.

### Pattern 10: Skeleton loading & progress
```html
<div class="skel-row">
  <div class="skel skel-box"></div>
  <div class="skel skel-box"></div>
</div>
```
Combined with the progress bar during `doSync()` — reusable for any async data loading.

### Pattern 11: Section cache for fast navigation
```javascript
function readSectionCache(page) { /* localStorage check + render */ }
function writeSectionCache(page) { /* save innerHTML */ }
```
Only caches `dash` and `bonus` pages. **Port to Amort**: Use for high-traffic pages.

---

## Summary: Porting Effort Matrix

| Feature | Effort | Key Complexity | Amort Adaptation |
|---------|--------|----------------|------------------|
| 1. Sync Data | **Medium** | Multi-fallback chain, cache layers | Replace GAS/MCP with your REST API; keep progressive loading UX |
| 2. SAP Export | **Hard** | 107-column template is bespoke | Replace headers + account mappings; keep batch-split & Dr/Cr patterns |
| 3. Admin Console | **Medium** | Mostly read-only status | Add real auth (not localStorage toggle); add amort-specific configs |
| 4. Audit Log | **Easy** | Simple in-memory array | Add proper persistence (indexedDB or backend); keep the `audit()` interface |
| 5. Sidebar HTML | **Easy** | Pure HTML+CSS | Rename page IDs/icons; keep `go()` routing pattern |
| 6. Reusable Patterns | **Easy–Medium** | 11 identified patterns | Mix of copy-paste (mkC, mkPg, safeLS) and adapt (gasRun→fetch, getCC→getField) |

### Recommended porting order

1. **Sidebar + navigation** — establish page structure
2. **State object S** + localStorage helpers — data foundation
3. **Sync Data** with simplified backend (your API instead of GAS)
4. **Audit log** — trivial, quick win
5. **SAP export core** (`buildSAP107` → `buildAmortSAP`) — highest business value
6. **CC override chain** → Amort-specific field overrides
7. **Admin Console** after core features are working

---

*Analysis generated from Budget Bonus DEV codebase at `/tmp/budget-ref/` (Code.gs, app.html, index.html)*
