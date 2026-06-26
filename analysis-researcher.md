# 🧪 RESEARCHER ANALYSIS — Prepaid Expense Amortization System

**Date:** 2026-06-26  
**Files analyzed:** Code.gs (1046 lines), index.html (787 lines), appsscript.json  
**Data volume:** 3,979 records from Google Sheet "payment system"

---

## 1. ARCHITECTURE & DATA FLOW

```
Google Sheet "payment system"
  (15 columns A-O, 3979+ rows)
        │
        ▼
  readInputData_()    ← called by EVERY function (11+ call sites)
        │
        ├──► getInputSummary()          — sample + count
        ├──► runMonthEndAmortization()   — compute + return
        ├──► getDashboardData()          — trend + GL charts (cached 5 min)
        ├──► calculateAmortization_()    — core engine (per-item)
        │       │
        │       ├──► pivotToWideFormat_()  → exportWideToSheet()
        │       ├──► generateSAPJE_()      → exportSAPJE() → Sheet + .xlsx
        │       └──► voidPrepaid()         → Sheet + .xlsx
        │
        └──► runPreUploadCheck()         — 10 validation rules
                 │
                 └──► calculateAmortization_()  (random 10 only)
```

### Data flow issues

| Issue | Severity | Detail |
|-------|----------|--------|
| **No write-back** | 🔴 HIGH | Amortization results are computed live on every request and NEVER stored. Each page load, each tab switch, each export re-computes everything from scratch. |
| **Sheet read amplification** | 🔴 HIGH | Every RPC reads ALL 3,979 rows from the Google Sheet. That's **11 reads per full session** (dashboard, amort run, schedule preview, schedule export, SAP preview, SAP export, checker, void load, void detail ×2, settings). Each read is a full `getDataRange().getValues()`. |
| **No incremental processing** | 🔴 HIGH | No record of "what has already been processed this month." Every export re-processes ALL items every time. |
| **Monolithic file** | 🟡 MED | All logic in one Code.gs: data access, business logic, presentation, export formatting. No separation of concerns. |
| **Cache is dashboard-only** | 🟡 MED | `CacheService.getScriptCache()` only used for dashboard data (5 min TTL). Amortization results, pivot data, JE data are never cached. |
| **Sheet write overwrites** | 🟡 MED | `exportWideToSheet()` clears the target sheet and re-writes. `exportSAPJE()` clears `SAP_JE_<period>`. No versioning or history of exports. |

---

## 2. AMORTIZATION ENGINE — DEEP DIVE

### Core algorithm (lines 130-189)

```javascript
totalDays = Math.round((end - start) / 86400000) + 1
ratePerDay = Math.round((totalAmt / totalDays) * 10000) / 10000
// For each month:
daysInMonth = overlap days (inclusive)
amortAmount = daysInMonth × ratePerDay, rounded to 2 decimals
Last month: remainder adjustment with 0.05 tolerance
```

### Data integrity gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| **Rate precision loss** | 🔴 HIGH | `ratePerDay` is rounded to **4 decimal places**. With 3,979 records × 12-60 months each, accumulating 4-decimal rounding on daily rates compounds errors. Example: 1,000,000 THB / 365 days = 2739.726027... → truncated to 2739.7260, losing 0.000027 THB/day × 365 = 0.01 THB. Multiply by 3,979 records and the system-wide rounding error could be ~40+ THB. |
| **5-cent tolerance on remainder** | 🟡 MED | The last-month remainder check uses `Math.abs(days × rate - remaining) < 0.05` — a 5 satang (0.05 THB) tolerance per document. With 3,979 documents, the cumulative tolerance is up to **~199 THB** of unaccounted rounding slop. |
| **No raw-rate option** | 🟡 MED | Settings offer "4dec" vs "full" rounding, but `"full"` is **never actually implemented** — the rate is always rounded to 4 decimals regardless of the setting value. |
| **Floating-point accumulation** | 🟡 MED | `Math.round(x * 100) / 100` is used inconsistently. The `accumulated` variable is rounded after each month, but `amortAmount` is also rounded. Double-rounding can lose 0.01 THB per month per document. |
| **Date arithmetic no timezone** | 🟡 MED | `new Date(string)` is timezone-dependent. `(end - start) / 86400000` uses UTC milliseconds but the Date constructors use local time. DST transitions can shift days by ±1. |
| **Date parsing reliability** | 🟡 MED | Uses `new Date(item.startDate)` where `startDate` comes from a Google Sheet cell. Sheets dates may be serial numbers or string representations. `new Date()` on a serial number returns `Invalid Date` (NaN). |
| **No public holiday / calendar awareness** | 🟢 LOW | All days treated equally. No business-day-only calculation option. |
| **Partial-period handling** | 🟢 LOW | Mid-month start/end is handled (via overlapStart/overlapEnd) but the first month's partial period uses the same rate-per-day, which is correct but there's no option for "full month first period." |

---

## 3. PERFORMANCE BOTTLENECKS

| Bottleneck | Severity | Detail |
|------------|----------|--------|
| **GAS 6-minute execution limit** | 🔴 HIGH | Dashboard processes ALL 3,979 records through `calculateAmortization_`. At ~500 records/sec (pessimistic), it could take 8+ seconds for a single period-targeted run. For ALL periods (full amortization across all months for all records), this could produce **50,000+ schedule rows** and easily approach/exceed the 6-minute limit. |
| **Memory pressure** | 🔴 HIGH | `allSchedules` arrays for full amortization could hold 50,000+ objects. GAS memory limit is ~50-100 MB. The pivot-to-wide step doubles memory (keeping both long and wide arrays). |
| **11 redundant sheet reads** | 🔴 HIGH | Each `readInputData_()` call is a synchronous HTTP round-trip to Google Sheets API. At ~200ms per call, that's ~2.2 seconds of pure I/O latency per session. |
| **XLSX generation heavy** | 🟡 MED | Creates a temp sheet copy → `getAs('xlsx')` → creates Drive file → deletes temp. This involves Drive API writes and could take 10-30 seconds per export. |
| **Preview vs Export mismatch** | 🟡 MED | `getWidePreview()` processes only first 50 items, `getSAPJEPreview()` processes first 30 items. But the actual export processes ALL items. User sees a preview of 50 and gets a result from 3,979 — the scale difference is 80×. |
| **No streaming/chunking in frontend** | 🟡 MED | All data must arrive in a single `google.script.run` response. Large payloads (wide format with 3,979 rows × 30+ columns) could exceed GAS payload limits. |
| **No background processing** | 🟡 MED | All operations are synchronous user-facing requests. No use of GAS Triggers or `LockService` for long-running batch operations. |

### Scale estimate

| Operation | Records processed | Intermediate rows | Est. time |
|-----------|------------------|-------------------|-----------|
| Dashboard load | 3,979 | ~50,000 schedule rows | 10-30s |
| Full amort (all periods) | 3,979 | ~50,000 schedule rows | 15-45s |
| Wide format export | 3,979 | ~50,000 → 3,979 wide rows | 20-60s |
| SAP JE export (all periods) | 3,979 | ~50,000 → ~55,000 JE lines | 30-90s |
| SAP JE .xlsx generation | — | ~55,000 rows × 15 cols | 10-30s |
| Pre-upload checker | 3,979 | — (in-process validation) | 10-30s |
| **Full sequential session** | — | — | **~2-4 minutes** (approaching limits) |

---

## 4. UX GAPS

| Gap | Severity | Detail |
|-----|----------|--------|
| **No progress feedback** | 🔴 HIGH | Long operations show only a spinner ("⏳ กำลังคำนวณ..."). No progress bar, no % complete, no estimated time. User has no way to know if the system hung or is still working. |
| **Void preview != actual JE** | 🔴 HIGH | `voidPreview()` calls `getDocDetail()` (read-only) and renders a **hardcoded** JE preview from the doc detail. The actual `voidPrepaid()` function creates the real JE with different logic (different Key values for refund vs loss). The preview could mismatch the executed result. |
| **No period dropdowns** | 🟡 MED | All period inputs are free-text with regex validation: `YYYY-MM or empty`. No dropdown of available periods, no "current month" auto-fill, no "next month" suggestion. |
| **No sorting/filtering on tables** | 🟡 MED | All data tables are static HTML. No sort-by-column, no search, no filter. With 3,979 records, the wide format table is unusable for finding specific documents. |
| **Results lost on tab switch** | 🟡 MED | Switching tabs re-loads from scratch. Results from "Amortization" tab don't carry over to "Schedule" or "SAP" tabs — user must re-enter the period and re-run. |
| **⚠️ Checker will flood with warnings** | 🟡 MED | Rule #8 flags ALL records where endDate < today as WARNING. With 3,979 records and most being past contracts, this could produce **thousands of warnings** — overwhelming the UI and masking real issues. |
| **No export to CSV/PDF** | 🟡 MED | Only Google Sheet and .xlsx export. No lightweight CSV or PDF summary report. |
| **No dark mode persistence issues** | 🟢 LOW | Theme persists via localStorage, but the toggle icon state can desync on some flows. |
| **No confirmation on Wide export** | 🟢 LOW | `exportWideToSheet()` clears and overwrites a sheet without confirmation (the confirm dialog says "Export to Sheet 'period'?" but only appears in some paths). |
| **Checker samples only 10 random items** | 🟢 LOW | The amortization integrity check (#10) only tests 10 random items out of 3,979. A 0.25% sample is statistically insignificant. |

---

## 5. MISSING FEATURES

### Must-have gaps for a prepaid amortization system

| Missing Feature | Why It Matters |
|----------------|----------------|
| **🔴 Amortization results storage** | Results are never persisted. Every view/export recomputes everything. Without a cached results table, the system cannot scale to 3,979+ records. Should write to a "results" sheet with period, docNo, amount, accumulated, remaining per row. |
| **🔴 "Already posted" flag/check** | No tracking of which periods have been exported to SAP. Each month, the user exports all 3,979 records again without knowing what was already posted. Need a "Posted Periods" registry. |
| **🔴 Void marks source as voided** | After executing void, the document still appears in all amortization runs. There's no `isVoided` flag in the source data or in-memory. Voided docs need to be flagged and excluded from future amortization. |
| **🔴 Partial-period/mid-month handling** | No support for starting amortization mid-month (pro-rate first month differently). The current logic handles overlap correctly but there's no UI for "start amortizing from next month." |
| **🔴 Batch processing / chunking** | With 3,979 records, all operations need chunking to stay within GAS 6-min limit. Could use `SpreadsheetApp.flush()` periodically and process in batches of 500. |
| **🟡 Scheduled auto-amortization** | No GAS time-driven trigger for monthly auto-calculation. User must manually click "Run" each month. |
| **🟡 GL/Cost Center master validation** | No validation that IO, GL, and Cost Center codes exist in SAP master data. Would reject invalid accounts before export. |
| **🟡 Audit trail** | No changelog of who ran what, when. Exports, voids, and settings changes are untracked. |
| **🟡 Data import with validation** | No UI for uploading new prepaid records. Only reads from a hardcoded Sheet ID. |
| **🟢 Multiple amortization methods** | Only straight-line (rate/day) supported. No declining balance, sum-of-digits, or usage-based options. |
| **🟢 Multi-currency** | Hardcoded to THB. Prepaids in USD/JPY would need FX rate handling. |
| **🟢 Email notifications / reports** | No email alerts when monthly amortization completes, or when documents are nearing full amortization. |

---

## 6. CODE QUALITY OBSERVATIONS

| Issue | Detail |
|-------|--------|
| Mixed `var`/`let`/`const` | All three used inconsistently. Most variables are `var` (pre-ES6 style). |
| Column indices as magic numbers | `row[3]` (docNo), `row[12]` (startDate), etc., are hardcoded throughout. A single schema change breaks everything silently. |
| Duplicated XLSX logic | The `exportSAPJE` and `voidPrepaid` functions have ~20 identical lines for .xlsx generation (copy sheet → getAs → createFile → trash). |
| No TypeScript/type safety | All data flows through untyped objects. A missing field becomes `undefined` which becomes `NaN` or `0` silently. |
| No unit tests | Zero test coverage. The amortization engine has multiple edge cases (last month, partial overlap, zero remaining) with no verification. |
| `var` in loop closures | Several `for (var i...)` patterns inside closures. With V8 runtime, `let` should be used. |
| Error handling inconsistent | Some functions wrap in try/catch, others don't. The frontend `withFailureHandler` catches some but not all. |
| SAP JE margin check | `if (lineCount + 2 > maxLines)` — documents are split when the NEXT 2 lines would exceed max. This caps at 900 lines properly. |

---

## 7. RECOMMENDATIONS IN PRIORITY ORDER

### 🔴 MUST-HAVE (system-breaking or data-integrity risks)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 1 | **Persist amortization results to a Sheet** — after compute, write to a "Amort Results" sheet. Read from it on subsequent calls. Recompute only when source data changes. | 2-3 days | Eliminates redundant recomputation, enables scaling beyond 3,979 records, enables delta exports |
| 2 | **Add voided/inactive flag support** — mark voided docs so they're excluded from amortization runs. Check a `Status` column or maintain a separate void registry. | 1 day | Prevents double-counting voided docs |
| 3 | **Implement chunked/batch processing** — split 3,979 records into batches of 500 with `SpreadsheetApp.flush()`. Use `LockService` for concurrency. | 2 days | Prevents 6-minute timeout, enables larger datasets |
| 4 | **Fix rate precision** — remove premature `ratePerDay` rounding to 4 decimals. Keep raw division. Round only at display time. Or use the Settings' "full" option properly. | 0.5 day | Eliminates cumulative rounding error across 3,979 records |
| 5 | **Reduce sheet reads** — use `CacheService` to cache `readInputData_()` output for 30-60 seconds within a session. Or compute once and pass data between functions. | 0.5 day | Eliminates ~10 redundant API calls per session |

### 🟡 SHOULD-HAVE (significant UX or operational improvements)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 6 | **Replace free-text period inputs with dropdowns** — query available periods from data, offer current/next month as defaults. | 0.5 day | Reduces user errors, speeds workflow |
| 7 | **Add "Posted Periods" tracking** — maintain a registry of periods already exported to SAP. Offer "Export Unposted Only" mode. | 1 day | Prevents duplicate SAP postings |
| 8 | **Add progress indication for long operations** — use `google.script.run` with multiple callbacks or chunk results. Show "Processing 500/3979..." | 1 day | Huge UX improvement for 3,979-record operations |
| 9 | **Fix void preview to show actual generated JE** — call `voidPrepaid()` with a `preview: true` flag instead of rendering a hardcoded mock. | 0.5 day | Prevents preview/execution mismatch |
| 10 | **Add sorting/filtering to data tables** — use client-side JS to sort and filter table rows. At minimum, sort by docNo or period. | 1 day | Makes 3,979-record tables usable |
| 11 | **Cap checker warnings** — limit rule #8 (past end date) to show at most 50 examples, not 3,000+. Or change it to INFO level. | 0.5 day | Prevents UI flooding |
| 12 | **Add column name constants/mapping** — replace all `row[3]`, `row[12]` with named constants like `COL_DOC_NO = 3`. | 0.5 day | Schema changes won't silently break the app |

### 🟢 NICE-TO-HAVE (polish and extensibility)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 13 | **GAS time-triggered monthly job** — auto-run amortization on the 1st of each month, optionally email results. | 1 day | Fully automated monthly close |
| 14 | **Add GL/Cost Center master validation** — cross-reference IO and GL codes against a master sheet. Flag invalid codes in Checker. | 1 day | Prevents SAP upload rejections |
| 15 | **Export to CSV option** — lightweight alternative to .xlsx for data interchange. | 0.5 day | Useful for non-SAP workflows |
| 16 | **Add audit log sheet** — log all exports, voids, and settings changes with timestamp. | 0.5 day | Compliance and traceability |
| 17 | **Separate Code.gs into modules** — split into `DataLayer.gs`, `AmortEngine.gs`, `Export.gs`, `Void.gs`, `Checker.gs`, `UI.gs`. | 1 day | Maintainability |
| 18 | **Add unit tests** — at minimum test `calculateAmortization_()` with known inputs/outputs for edge cases (0 days, 1 day, partial month, DST boundary). | 1 day | Prevents regression |
| 19 | **Multiple amortization methods** — add options (straight-line, declining balance, sum-of-years-digits). | 2 days | Flexibility for different contract types |
| 20 | **Dark mode improvements** — fix icon desync, add system preference detection. | 0.5 day | Polish |

---

## 8. KEY RISK SUMMARY

```
┌─────────────────────────────────────────────────────────────────┐
│  RISK HEATMAP                                                   │
├─────────────────────────────────────────────────────────────────┤
│  🔴 No result persistence      → Every operation is O(n) on 3,979│
│  🔴 No void tracking           → Voided docs live forever        │
│  🔴 Rate rounding precision    → Cumulative error across records  │
│  🔴 GAS 6-min timeout          → Full export may fail silently   │
│  🟡 11× redundant sheet reads  → 2+ seconds of wasted latency    │
│  🟡 Preview ≠ actual export    → User sees 50, gets 3,979       │
│  🟡 Checker warning flood      → 3,000+ warnings hide real issues│
│  🟡 No posted-period tracking  → Risk of double SAP posting      │
│  🟢 No unit tests              → Amort engine changes risky      │
│  🟢 No module separation       → Code.gs maintenance burden     │
└─────────────────────────────────────────────────────────────────┘
```

**Bottom line:** The system works for its core purpose (generating SAP JE from prepaid schedules) but has significant scalability and data-integrity risks at 3,979 records. The #1 priority is persisting amortization results — without it, every operation is a full recompute that grows linearly with data volume. With 3,979 records and growing, the GAS 6-minute execution limit will become a hard blocker.

---

*Analysis generated by Hermes Agent Researcher — June 26, 2026*
*Based on full source review of Code.gs (1046 lines) and index.html (787 lines)*
