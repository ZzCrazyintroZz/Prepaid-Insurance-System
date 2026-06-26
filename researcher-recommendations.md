# Amort System — Holistic Analysis & Recommendations

**Analyzed by**: System Researcher  
**Date**: 26 June 2026  
**Files**: `/tmp/prepaid-amort/Code.gs` (1,561 lines), `/tmp/prepaid-amort/index.html` (1,446 lines)  
**Data**: 3,979 prepaid records (15 columns A–O) from Google Sheet "payment system"  
**Scope**: Current state after Phase 2 fixes, prior to new feature work

---

## Quick Context

The Amort system is a Google Apps Script web app for prepaid expense amortization. It reads 3,979 records from a Google Sheet, runs a daily-rate amortization engine, generates SAP journal entries (debit = IO/Key 40, credit = GL/Key 50), supports void/terminate, and provides a 15-KPI dashboard with 7 charts. It serves a Thai finance team using month-end processes.

---

## 1. 📊 Data Utilization Audit — What's Underutilized

| Column | Field | Current Use | Verdict |
|--------|-------|-------------|---------|
| A | Company | Used in dashboard company breakdown + JE generation | ✅ Used |
| B | Posting Date | Read but never used in any calculation or display | ❌ Wasted |
| C | Doc Date | Read but never used | ❌ Wasted |
| D | Doc No | Primary key, used everywhere | ✅ Used |
| E | **Doc No 2** | Read (as `docNo2`) but **never referenced** in any output | ❌ Wasted |
| F | Description | Displayed in schedules, JE, void | ✅ Used |
| G | Plate | Displayed in void + schedule | ✅ Used |
| H | IO | Core debit account in JE | ✅ Used |
| I | GL Prepaid | Core credit account in JE | ✅ Used |
| J | **GL Name** | Read (as `glName`) but **never displayed** anywhere | ❌ Wasted |
| K | Cost Center | Used in schedule, JE, CC breakdown charts | ✅ Used |
| L | **Cost Name** | Read (as `costName`) but **never displayed** | ❌ Wasted |
| M | Start Date | Core amortization engine | ✅ Used |
| N | End Date | Core amortization engine | ✅ Used |
| O | Amount | Core amortization engine | ✅ Used |

### Data Utilization Recommendations

---

### R1: Surface Doc No 2 in Schedules and JE
- **What**: Display `Doc No 2` (Col E) in the Wide Schedule table, SAP JE reference field, and Void outputs
- **Why matters**: Finance often needs secondary reference numbers (PO numbers, contract IDs, SAP doc references) for cross-referencing during month-end. Currently this data is read but silently discarded.
- **Effort**: Easy (add field to ~5 data structures)
- **Priority**: P2

### R2: Display GL Name and Cost Name in UI
- **What**: Show `GL Name` (Col J) and `Cost Name` (Col L) alongside their code equivalents in schedules, checker results, and dashboard tables
- **Why matters**: GL codes like "11370010" are meaningless without the name. Finance users waste time cross-referencing a GL chart. Same for cost centers.
- **Effort**: Easy (display-only augmentation)
- **Priority**: P2

### R3: Use Posting Date and Doc Date in Dashboard
- **What**: Add KPIs for "Oldest Unamortized Posting Date", "Average Lag (Posting → Start)", "Documents by Posting Month"
- **Why matters**: These date fields give visibility into upstream AP processing delays. Finance managers need to know if prepaids are being posted promptly.
- **Effort**: Easy (aggregation of existing data)
- **Priority**: P3

---

## 2. 🧩 Missing Features (CFO/Finance Manager View)

### R4: Period-Close Workflow
- **What**: A formal period-close page that lets the user:
  - Lock a period (prevent further amortization runs)
  - Show checklist (amortization run ✓, JE exported ✓, Dr=Cr verified ✓, checker passed ✓)
  - Mark period as "Closed" with timestamp and user
  - Generate a period-close summary report
- **Why matters**: Month-end close is the core workflow. Without a close process, there's no audit trail for which periods have been finalized. A CFO needs confidence that March's numbers won't change after close.
- **Effort**: Hard (new data model for period state, UI, validation logic, ~400 lines)
- **Priority**: P1

### R5: Prepaid Record Management (Add/Edit/Delete via UI)
- **What**: CRUD interface within the web app to add, modify, or delete prepaid records without going to the Google Sheet
- **Why matters**: Currently, to add a new prepaid, the user must open the Google Sheet directly. This is a significant workflow break — they should never leave the app. Also, 3,979 records doesn't include newly booked prepaids not yet entered.
- **Effort**: Hard (Google Sheets write operations, validation, duplicate check, audit trail, ~500 lines)
- **Priority**: P1

### R6: Approval Workflow (Submit → Approve → Amortize)
- **What**: Multi-step workflow:
  1. Data entry submits new prepaid records
  2. Supervisor/Manager reviews and approves
  3. Only approved items are included in amortization runs
  4. Rejected items return with comments for correction
- **Why matters**: Financial controls require segregation of duties. Same person entering data shouldn't be the same person running month-end amortization. Without this, the system has no governance.
- **Effort**: Hard (state machine, user identity (at minimum email), notification, reviewer UI, ~600 lines)
- **Priority**: P1

### R7: Batch Void / Mass Termination
- **What**: Select multiple documents in a checkbox list and void them all at once (same type and date)
- **Why matters**: Month-end cleanup often involves voiding 20-30 items that were terminated early. Current per-document void is tedious for finance.
- **Effort**: Medium (batch selection UI, batch processing on backend, confirmation dialog)
- **Priority**: P2

### R8: Deferral Modification (Change Dates/Amounts Mid-Term)
- **What**: Allow finance to modify start date, end date, or amount of an active prepaid, with automatic recalculation of remaining schedule
- **Why matters**: Contract amendments happen. Currently, the only way to handle a date change is to void and re-enter. This creates orphaned void records and loses history.
- **Effort**: Medium (modification history, recalculation engine, audit trail)
- **Priority**: P2

### R9: Budget vs. Actual Comparison
- **What**: Add a "Budget" field (optional per item) and a dashboard section comparing budgeted amortization to calculated amortization, with variance %
- **Why matters**: Finance managers need to know if actual amortization matches budget. Variances >10% need investigation.
- **Effort**: Medium (new data field, variance calculations, dashboard charts)
- **Priority**: P3

### R10: Running Balance View
- **What**: A table showing amortization + remaining balance over time for each prepaid item, accessible from the dashboard by clicking an item
- **Why matters**: "How much of this prepaid have we consumed?" is the most common question. Currently only shown in the void screen.
- **Effort**: Medium (new section/page, schedule extraction, formatting)
- **Priority**: P2

### R11: Multi-Period Amortization Run
- **What**: Run amortization for multiple periods at once (e.g., "Catch up" for past 6 months) in a single operation
- **Why matters**: If system wasn't used for several months (common after deployment), finance needs to back-fill amortization for past periods without running each one individually.
- **Effort**: Easy (modify runMonthEndAmortization to accept period range)
- **Priority**: P2

---

## 3. ⚡ Power User Improvements

### R12: Global Search & Column Filters
- **What**: A search bar at the top that searches Doc No, Description, IO, GL, Company, Cost Center. Per-column filter dropdowns in all tables. Date range filter.
- **Why matters**: 3,979 records = useless without search. Finance users need to find "the insurance policy for car ABC-123" in seconds.
- **Effort**: Medium (client-side filtering for loaded data, server-side for large datasets, ~300 lines)
- **Priority**: P1

### R13: Sortable Table Columns
- **What**: Click any table header to sort ascending/descending. Show sort indicator.
- **Why matters**: Currently tables are displayed in whatever order the sheet returns. Sorting by Amount (descending) to find largest items is a basic need.
- **Effort**: Easy (client-side sort function, toggle state)
- **Priority**: P1

### R14: Export to PDF / Excel / CSV
- **What**: Export dashboard summary, amortization schedule, JE preview, and checker results to PDF (for management), Excel (for analysis), CSV (for import to other systems)
- **Why matters**: Finance teams need to email reports to stakeholders. "Can you export this to Excel" is the most common request.
- **Effort**: Medium (PDF via client-side print/style, CSV/Excel via Blob generation, ~250 lines)
- **Priority**: P1

### R15: Bulk Export of SAP JE by Period
- **What**: Select multiple periods in SAP Generator and generate one combined JE per period, or a consolidated JE
- **Why matters**: At month-end, finance may need JEs for 2-3 periods (current month, prior month adjustment, next month pre-run). Running each individually wastes time.
- **Effort**: Medium (modify exportSAPJE to accept period list, batch processing)
- **Priority**: P2

### R16: Keyboard Shortcuts
- **What**: Ctrl+R (Run Amortization), Ctrl+E (Export), Ctrl+S (Save Settings), Ctrl+F (Search), / (Focus Search), Ctrl+P (Print/Export PDF)
- **Why matters**: Power users who use the system daily for month-end close will appreciate speed improvements.
- **Effort**: Easy (keydown listeners, ~50 lines)
- **Priority**: P3

### R17: Customizable Dashboard Layout
- **What**: Allow users to show/hide/reorder KPI cards and charts with settings saved to ScriptProperties per user (email key)
- **Why matters**: Different roles care about different metrics. A CFO wants Trends and MoM; a staff accountant wants Data Quality and Expiring Soon.
- **Effort**: Medium (drag-and-drop localStorage config, or toggle settings)
- **Priority**: P3

### R18: Drill-Down from Dashboard
- **What**: Click any KPI or chart segment to see the underlying list of items. E.g., click "Expiring This Month = 45" → see those 45 items in a table below
- **Why matters**: KPIs without drill-down are eye candy. Finance needs to act on numbers, not just see them.
- **Effort**: Medium (click handlers, filtered data queries, detail panel/toggle, ~300 lines)
- **Priority**: P2

---

## 4. 🔗 Integration Opportunities

### R19: Scheduled Auto-Run via Time-Driven Trigger
- **What**: ScriptApp.newTrigger("runMonthEndAmortization").timeBased().onMonthDay(1).atHour(8).create() to automatically run amortization on the 1st of each month
- **Why matters**: Month-end amortization is 100% predictable — the same calculation every month. Automating it eliminates human error and ensures consistency.
- **Effort**: Medium (install/uninstall trigger from Admin Console, email notification on completion, status tracking, ~200 lines)
- **Priority**: P1

### R20: Email Notifications (Expiring Items, Period Close, Errors)
- **What**: Send HTML emails via MailApp:
  - Weekly: "Items expiring in next 30 days"
  - Monthly: "Period close summary — X items amortized, $Y total"
  - On-demand: "SAP JE ready for approval" notification to manager
  - Error: "Amortization calculation failed for X items"
- **Why matters**: Finance teams don't live inside the Amort app. Email is their primary workspace. Proactive notifications reduce "Did we miss anything?" anxiety.
- **Effort**: Medium (MailApp.sendEmail with HTML templates, scheduling, preference settings, ~350 lines)
- **Priority**: P2

### R21: Google Drive Monthly Reporting
- **What**: Auto-generate a monthly report PDF (dashboard summary + schedule + JE) and save to a specified Drive folder. Maintain a "Monthly Reports" archive folder.
- **Why matters**: Audit requires paper trails. Having auto-generated, timestamped reports in Drive eliminates "I forgot to save the report" scenarios.
- **Effort**: Medium (DriveApp folder management, PDF generation via sheet-to-pdf or HTML-to-pdf, ~250 lines)
- **Priority**: P2

### R22: SAP Field Mapping Improvements
- **What**: Enhance the SAP JE generator with:
  - Doc No 2 → SAP reference field
  - GL Name → SAP text field (currently description is truncated to 50 chars, could use GL name)
  - Posting Date vs Doc Date → both written to SAP columns
  - Tax Branch (currently hardcoded "0000") → configurable or per-item
  - Company code per-item override (currently all "1022")
- **Why matters**: SAP upload quality directly depends on field mapping. Missing reference numbers cause SAP posting errors. Better mapping = fewer rejected batches.
- **Effort**: Medium (extend settings schema, modify JE builder, test with sample SAP uploads, ~300 lines)
- **Priority**: P1

### R23: Line/Chat/Webhook Notifications
- **What**: Optional LINE Notify (popular in Thailand), Slack webhook, or generic webhook integration for notifications
- **Why matters**: Thai finance teams commonly use LINE for work communication. A LINE notification when JE is ready would be immediately actionable.
- **Effort**: Medium (webhook URL in settings, POST JSON payload, integration settings UI, ~150 lines)
- **Priority**: P3

---

## 5. 🏗️ Technical Debt & Architecture

### R24: Refactor Backend into Module Files
- **What**: Split Code.gs into:
  - `Config.gs` — constants, sheet IDs, helpers
  - `Data.gs` — readInputData_, column definitions
  - `AmortEngine.gs` — amortization calculation logic
  - `Dashboard.gs` — dashboard data aggregation
  - `SAP.gs` — JE generation, export, void
  - `Checker.gs` — pre-upload validation
  - `Admin.gs` — sync, cache, system info, audit
- **Why matters**: 1,561-line single file is hard to maintain, debug, or extend. Small changes require scrolling past hundreds of lines. GAS supports multiple .gs files.
- **Effort**: Medium (restructuring effort, no logic changes, ~2 hours)
- **Priority**: P2

### R25: Centralize Column Index Definitions
- **What**: Replace magic numbers 0-15 with named constants:
  ```js
  const COL = {
    COMPANY: 0, POSTING_DATE: 1, DOC_DATE: 2, DOC_NO: 3,
    DOC_NO_2: 4, DESCRIPTION: 5, PLATE: 6, IO: 7,
    GL_PREPAID: 8, GL_NAME: 9, COST_CENTER: 10, COST_NAME: 11,
    START_DATE: 12, END_DATE: 13, AMOUNT: 14
  };
  ```
- **Why matters**: Magic indices make code fragile — adding a column (e.g., Budget) would require changing every `row[14]` reference. Named constants document intent and prevent off-by-one bugs.
- **Effort**: Easy (one-time find-and-replace, careful review)
- **Priority**: P1

### R26: Consolidate var → let/const Throughout
- **What**: Replace all `var` with `const` (immutable bindings) or `let` (loop variables) in both Code.gs and index.html
- **Why matters**: Mixed var/let/const is a linting violation and causes subtle bugs. `var` hoisting in GAS V8 can lead to unexpected variable shadowing.
- **Effort**: Easy (automated refactor + manual review, ~30 min)
- **Priority**: P2

### R27: Fix Cache Key Mismatch
- **What**: `getDashboardData()` caches at key `'dash_data'` while `clearCache()` tries to delete `'dashboard_data'`. Also `clearCache()` doesn't clear all used keys (it clears 3 keys but misses the one actually used).
- **Why matters**: Dashboard caching is broken — Clear Cache button does nothing useful. Users who click "Clear Cache" expecting fresh data will get stale data.
- **Effort**: Easy (align key names, also clear `dash_data` key)
- **Priority**: P1 (it's a bug)

### R28: Persistent Audit Log (Sheet-Backed)
- **What**: Replace in-memory `auditLog_` array with a `_AUDIT_LOG` sheet in the SAP template spreadsheet. Log every significant action: amortization run, JE export, void, settings change, sync.
- **Why matters**: Current audit log disappears on every script redeploy — useless for compliance. A sheet-backed log survives indefinitely and can be reviewed by an auditor.
- **Effort**: Medium (write-to-sheet wrapper, structured log entries, migration of existing pattern, ~200 lines)
- **Priority**: P1

### R29: Add Pagination to All Large Tables
- **What**: Implement server-side pagination (offset/limit) or client-side pagination for:
  - Dashboard "Expiring Soon" table (currently fixed top 10 — okay)
  - Wide Schedule preview (currently limited to 50 items — okay but arbitrary)
  - SAP JE preview (currently 30 items)
  - Checker results (could be thousands of warnings — currently loads all)
- **Why matters**: GAS has 30s execution limit. Loading all 3,979 items in preview could time out. Pagination makes the app responsive and reliable.
- **Effort**: Medium (add skip/limit to backend functions, pagination controls in UI)
- **Priority**: P2

### R30: Performance Optimization — Cache Amortization Schedule
- **What**: Cache the amortization schedule (per item) in CacheService or PropertiesService so dashboard doesn't recalculate all 3,979 items on every load
- **Why matters**: Dashboard recalculates amortization for all 3,979 items every time it loads (5-min cache helps, but first load or cache-miss is heavy). With 15 metrics requiring schedule data, this is the performance bottleneck.
- **Effort**: Medium (per-item schedule cache, cache invalidation on data change, ~300 lines)
- **Priority**: P2

### R31: Remove Redundant readInputData_() Calls
- **What**: readInputData_() is called 10+ times across the codebase — every preview, export, dashboard load, checker run. Each call reads and parses 3,979 rows from the sheet.
- **Why matters**: Each call costs ~1-3 seconds and 10K+ spreadsheet reads (quota: 50M/day). Caching the parsed data and reusing it within a script execution would dramatically speed up operations.
- **Effort**: Medium (module-level cache with memoization, invalidate on write operations, ~150 lines)
- **Priority**: P2

### R32: Add Input Validation Layer
- **What**: Centralize validation for all user-facing API functions (saveSettings, saveConfig, voidPrepaid parameters)
- **Why matters**: Currently settings are saved without validation (e.g., user could save an empty Company code or non-numeric MaxLines). This causes downstream errors in JE generation.
- **Effort**: Easy (validate params, return meaningful error messages, ~100 lines)
- **Priority**: P2

### R33: Implement Proper Error Handling Strategy
- **What**: Standardize error handling: all API functions return `{ok: false, error: "...", code: "ERR_..."}`. Frontend consistently checks `r.ok`. Remove bare `throw` statements.
- **Why matters**: Some backend functions throw exceptions (caught by withFailureHandler), others return `{ok: false}` — it's inconsistent. A standardized pattern makes debugging easier.
- **Effort**: Medium (audit all ~25 API functions, fix inconsistencies, ~200 lines)
- **Priority**: P2

---

## 6. 🚀 Production Readiness

### R34: User Authentication & Role-Based Access
- **What**: Use Session.getActiveUser().getEmail() or ScriptApp.getIdentityToken() to:
  - Identify the current user
  - Restrict access to authorized domain emails
  - Role-based features: Admin (settings, cache, config), Manager (approve, void), User (view, run, export)
  - Display user email in header
- **Why matters**: Currently ANYONE with the web app URL can run it. No audit trail per user. No access control. This is a compliance and security risk for financial systems.
- **Effort**: Medium (Session API, role config in ScriptProperties, UI conditional rendering, ~250 lines)
- **Priority**: P1

### R35: Write-Protect Closed Periods
- **What**: Once a period is "Closed" (see R4), prevent any amortization runs, modifications, or exports that would affect that period
- **Why matters**: Accountants must not accidentally change closed periods. Month-end numbers must be immutable after sign-off.
- **Effort**: Medium (period state validation in all write operations, UI warning/block, ~200 lines)
- **Priority**: P1

### R36: Confirm Before Overwrite (Safety Guards)
- **What**: Before exportWideToSheet or exportSAPJE overwrites an existing sheet tab, display the existing sheet name, last modified date, and number of rows. Require explicit confirmation.
- **Why matters**: Currently `sheet.clear()` is called without warning. Finance could accidentally overwrite last month's JE with this month's run.
- **Effort**: Easy (check sheet existence, show metadata, confirm dialog, ~50 lines)
- **Priority**: P1

### R37: Version Tracking in Generated Files
- **What**: Include system version, generation timestamp, and user email in every generated sheet (header row or hidden metadata row)
- **Why matters**: When an auditor asks "Who generated this JE, and with which version of the system?", the answer should be in the file itself, not in someone's memory.
- **Effort**: Easy (add metadata row to export headers, ~30 lines)
- **Priority**: P2

### R38: Deploy Versioning Strategy
- **What**: Maintain a version history: `getSystemInfo()` returns deploy timestamp and version from ScriptProperties. Use `ScriptApp.getScriptId()` for deployment tracking. Consider semantic versioning.
- **Why matters**: Currently version is hardcoded "v9 (Phase 1-7)". Without real version tracking, it's impossible to know what code is actually running when investigating bugs.
- **Effort**: Easy (auto-increment version script, or timestamp-based, ~50 lines)
- **Priority**: P2

### R39: Data Integrity Check — Dr = Cr Verification
- **What**: After JE generation, add an independent verification step that sums all debits and credits and reports any imbalance. Display prominently.
- **Why matters**: A single off-by-0.01 error in 900-line JE causes SAP batch rejection. Self-verification before export catches these before they cause downstream failures.
- **Effort**: Easy (sum check already exists in JS, just display it more prominently)
- **Priority**: P2

---

## 7. 🔄 Workflow Gaps

### R40: Standing Data / Template Management
- **What**: Allow finance to define prepaid templates: common descriptions, IO/GL pairs, cost centers, typical durations (e.g., 12-month insurance template)
- **Why matters**: 3,979 records likely contain many recurring prepaid types. Templates speed up data entry and reduce errors.
- **Effort**: Medium (template CRUD UI, apply template to new record form, ~250 lines)
- **Priority**: P3

### R41: "What-If" Scenario Simulator
- **What**: A sandbox mode where users can change dates or amounts and see the recalculated schedule without persisting changes. Compare current vs proposed side-by-side.
- **Why matters**: "What if we extend this contract by 3 months — how does amortization change?" This is a common question that currently requires manual spreadsheet manipulation.
- **Effort**: Hard (clone item in-memory, recalculate, diff view, ~400 lines)
- **Priority**: P3

### R42: Reconciliation View (Amort vs GL)
- **What**: A page where user inputs GL trial balance for prepaid accounts and the system compares calculated amortization vs actual GL balances. Highlight differences > threshold.
- **Why matters**: Month-end close requires reconciling system amortization against actual GL postings. Currently this is done manually in separate spreadsheets.
- **Effort**: Hard (GL balance input/import, comparison logic, reconciliation report, ~500 lines)
- **Priority**: P2

### R43: Data Import from CSV/Excel
- **What**: Upload a CSV or Excel file with new prepaid records. Map columns. Preview. Validate. Import into the input sheet.
- **Why matters**: Finance often receives prepaid data from other departments in Excel format. Manual copy-paste into the Google Sheet is error-prone.
- **Effort**: Hard (Blob upload via GAS, CSV/Excel parsing, column mapping UI, validation, ~600 lines)
- **Priority**: P1

### R44: Period-End Checklist Dashboard
- **What**: A visual checklist on the dashboard:
  - ☐ New prepaids reviewed and approved
  - ☐ Amortization run for period
  - ☐ Checker passed (no errors)
  - ☐ SAP JE generated and verified
  - ☐ Dr = Cr verified
  - ☐ Void items processed
  - ☐ Period closed
- **Why matters**: Month-end close involves many steps. Without a checklist, steps get missed. The checklist provides confidence and audit trail.
- **Effort**: Medium (checklist state in ScriptProperties, auto-check when actions complete, manual override, ~200 lines)
- **Priority**: P1

### R45: Void Impact Analysis
- **What**: Before executing a void, show a summary of impact:
  - Remaining balance
  - Which periods have already been amortized
  - How void affects current and future period totals
  - Date range that will be affected
- **Why matters**: Finance needs to understand downstream consequences before voiding. A void in month 2 of a 12-month prepaid affects 10 future periods.
- **Effort**: Medium (calculate amortization projection, show period-by-period impact table, ~200 lines)
- **Priority**: P2

---

## 8. ⚠️ Immediate Bugs Found During Analysis

### B1: Cache Key Mismatch Between Dashboard and Clear Cache
- **Location**: `getDashboardData()` (line ~601) caches at key `'dash_data'` but `clearCache()` (line ~1498) removes `'dashboard_data'`
- **Severity**: Medium — clear cache button doesn't actually clear the dashboard cache

### B2: Void Log Sheet Name Collision Risk
- **Location**: `voidPrepaid()` (line ~1067) creates sheet `'VOID_JE_' + docNo.replace(...)` but special characters like `/` in Doc No could create invalid sheet names
- **Severity**: Low — handled with regex but some characters may still cause GAS errors

### B3: No input validation in saveSettings
- **Location**: `saveSettings()` (line ~905)
- **Severity**: Medium — user can save empty company code, non-numeric MaxLines, etc.

### B4: Audit Log is In-Memory Only
- **Location**: `auditLog_` array (line ~1507)
- **Severity**: High — log disappears on every deploy, making it useless for compliance

### B5: Hardcoded "3979" in User Guide
- **Location**: `getUserGuideData()` (line ~1303)
- **Severity**: Low — will be wrong once new records are added

---

## Summary Priority Matrix

| Priority | Count | Key Items |
|----------|-------|-----------|
| **P1** | 12 | R4 (Period Close), R5 (CRUD UI), R6 (Approval), R12 (Search), R13 (Sort), R14 (Export), R19 (Auto-Run), R22 (SAP Mapping), R25 (Column Constants), R27 (Cache Bug), R28 (Persistent Audit), R34 (Auth), R35 (Period Write-Protect), R36 (Overwrite Guard), R43 (Data Import), R44 (Close Checklist) |
| **P2** | 18 | R1 (Doc No 2), R2 (GL Name), R7 (Batch Void), R8 (Modify Deferral), R10 (Running Balance), R11 (Multi-Period), R15 (Bulk Export), R18 (Drill-Down), R20 (Email), R21 (Drive Reports), R24 (Module Refactor), R26 (let/const), R29 (Pagination), R30 (Cache Perf), R31 (Dedup Reads), R32 (Validation), R33 (Error Strategy), R37 (Version Tracking), R38 (Deploy Versioning), R39 (Dr=Cr Verify), R42 (Reconciliation), R45 (Void Impact) |
| **P3** | 7 | R3 (Posting Dates), R9 (Budget Comparison), R16 (Keyboard Shortcuts), R17 (Custom Dashboard), R23 (Webhooks), R40 (Templates), R41 (What-If Sim) |

**Estimated total effort**: ~4-6 weeks for P1 items, ~6-8 weeks for P2, ongoing for P3

---

## Recommendation for Next Phase

1. **Address P1 bugs first** (R27 cache, R28 persistent audit) — 2-3 days
2. **Deliver highest-value P1 features** (R44 close checklist, R12 search/filter, R13 sort) — 1 week
3. **Build the CRUD + Approval workflow** (R5 + R6) — 2 weeks (core workflow transformation)
4. **Implement Period Close + Auto-Run** (R4 + R19) — 1 week (automation foundation)
5. **SAP field mapping improvements** (R22) — 3 days (reduce SAP rejects)
6. **Then tackle P2 items** progressively

This sequence transforms Amort from a calculation tool into a complete prepaid lifecycle management system.
