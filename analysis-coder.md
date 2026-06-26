# Prepaid Expense Amortization System — Code Quality Analysis

**Analyzed:** Code.gs (1046 lines) + index.html (787 lines)  
**Date:** 2026-06-26  
**Scope:** Full read of both files

---

## 1. CODE QUALITY ISSUES

### 1.1 Anti-Patterns & Technical Debt

| Issue | Location | Severity | Details |
|-------|----------|----------|---------|
| **Mixed `var`/`let`/`const`** | Throughout Code.gs | Medium | Uses `const` at top (CONFIG), then `var` in most functions, `let` in a few. Inconsistent — GAS supports full ES6, pick one convention |
| **Google Sheets spreadsheet ID hardcoded** | Code.gs L9-10 | **High** | `INPUT_SHEET_ID` and `SAP_TEMPLATE_ID` are embedded in source. Any env switch (dev/test/prod) requires editing code. Should be ScriptProperties or at least a config file |
| **Sheet name magic strings** | Code.gs L10, L12 | Medium | `'payment system'` and `'3 Cut off payment'` are bare strings. Single typo breaks the app silently at runtime |
| **No input sanitization** | Code.gs L52-71 | Medium | All fields converted to `String()`, but dates parsed as `new Date(item.startDate)` without format validation. If spreadsheet has mixed date formats (text vs serial number), parsing will fail |
| **Deep nesting in amort engine** | Code.gs L145-187 | Low | `while` loop inside main for-loop with nested `if` conditions. Hard to unit-test individual branches |
| **`PropertiesService` fetched redundantly** | Code.gs L452-457, L768-772 | Low | Same pattern repeated 3× — get saved settings, merge with defaults. Should be a `getSavedSettings_()` helper |
| **Error swallowing** | Code.gs L456, L527-530, L631 | **High** | `catch(e){}` — silently ignores JSON parse errors in settings and XLSX creation failures. User never knows a sub-step failed |
| **`Math.round(… * 100) / 100` >30×** | Throughout | Low | Ubiquitous penny-rounding. Should be a `round2_(n)` helper |
| **No semicolons in index.html** | index.html L334-735 | Low | Style inconsistency — some lines have `;`, most don't. Works but invites ASI bugs |
| **`google.charts={}` dummy** | index.html L781 | Low | Only exists to prevent `ReferenceError` from some unknown script. If no chart lib references it, delete it |

### 1.2 Error Handling Gaps

| Gap | Location | Impact |
|-----|----------|--------|
| **No validation that sheet data matches expected column layout** | Code.gs L42-48 | If spreadsheet columns are reordered, all field offsets (row[0]..row[14]) silently grab wrong data |
| **`readInputData_()` can throw non-descriptive error** | Code.gs L43-44 | `SpreadsheetApp.openById()` and `getSheetByName()` can throw "You do not have permission" — no friendly Thai message |
| **Chart rendering errors unhandled** | index.html L371-421 | If Chart.js fails to load or canvas is missing, it throws with no user feedback |
| **`getDocDetail()` — No date validation** | Code.gs L702-737 | Passes `startDate`/`endDate` from spreadsheet directly to `new Date()` — if values are Excel serial numbers or invalid, amort calc silently returns empty array |
| **Export SAP JE: missing period validation** | Code.gs L441-545 | If `targetPeriod` is malformed, `generateSAPJE_` runs against ALL items (fallback behavior ambiguous) |

---

## 2. BUGS

### 2.1 Critical Bugs

#### BUG #1: Debit/Credit Key Mismatch in Void (Logic Bug)
**Location:** Code.gs L789-823  
**Description:** In the **refund** path (L789-804):
- Debit line uses `key: '40'` with the *GL account*
- Credit line uses `key: '50'` with the *IO account*

In the **loss** path (L806-823):
- Debit line uses `key: '50'` with the *loss GL*
- Credit line uses `key: '40'` with the *IO account*

But the **normal JE generator** (L401-424) maps:
- Key 40 = Debit → IO account
- Key 50 = Credit → GL account

The void refund path **reverses the key-to-account mapping**. The debit line has key=40 (debit side) but uses GL (should be IO per convention). The credit line has key=50 (credit side) but uses IO (should be GL). If SAP validates key-account combinations, this may be rejected.

#### BUG #2: `getDocDetail()` — Start/End Date from Pivot, Not Source Data
**Location:** Code.gs L246-249  
**Description:** In `pivotToWideFormat_()`, `startDate` and `endDate` are set to the *first/last period string* (e.g., `"2025-01"`) not the *actual start/end dates* from the source. These are period labels, not calendar dates. If `getDocDetail()` passes these to `calculateAmortization_()`, amortization will be wildly wrong. However, `getDocDetail()` reads from the matched item directly (L713), which uses the raw `startDate`/`endDate` from input — so this is a dead field in the pivot function but misleading.

#### BUG #3: `totalAmortization` in Dashboard Double-Counts
**Location:** Code.gs L618  
**Description:** `totalAmt` sums across all periods of the trend array. But `trend` is built by iterating `calculateAmortization_(item, null)` for ALL items and aggregating by period. If an item's amortization spans 12 months, its full amount appears in 12 trend buckets, and `totalAmt` sums all 12 — representing ~12× the real total prepaid balance. The KPI "ยอดตัดจ่ายรวม" shows a massively inflated number.

#### BUG #4: `getAmortAmount` Trail in Pivot Groups Overwrites Correct Totals
**Location:** Code.gs L243-249  
**Description:** For each `r` in the schedule, `g.monthly[r.period] = r.amortAmount` overwrites any previous value for the same period within the same docNo group. If a document has **multiple rows per month** (possible with overlapping amortization), only the last row's amount survives. The `g.amount` estimate `Math.max(g.amount, r.amortAmount + r.remaining)` is also crude — it picks the highest single period, not the total.

#### BUG #5: `remaining <= 0` Early Exit in `calculateAmortization_` Breaks Last Month
**Location:** Code.gs L184  
**Description:** After pushing a result, if `remaining <= 0` the loop breaks. But `remaining = Math.max(0, totalAmt - accumulated)` after rounding. Due to floating-point rounding, `remaining` can be exactly 0 even when the last month's amortization was calculated correctly (penny-off scenario). This is usually harmless, but if `accumulated` slightly exceeds `totalAmt` (line 168-170 correction), `remaining` becomes 0 and breaks the loop correctly — except when `targetPeriod` is set, the break at L185 fires before pushing, potentially **missing the last month's entry** if `remaining` hits 0 that same period.

### 2.2 Logic / Data-Type Bugs

| Bug | Location | Description |
|-----|----------|-------------|
| **IO fallback uses CONFIG.prepaidGL instead of actual IO** | Code.gs L402 | `var io = s.io || CONFIG.prepaidGL || '11370010';` — falls back to **prepaid GL** (11370010) when IO is missing, not to the correct IO. The field `s.io` is already `item.io` from input (col H). If missing, using prepaid GL as IO is wrong — should error or use a different default |
| **GL fallback also uses CONFIG.prepaidGL** | Code.gs L414 | Same issue — falls back to prepaidGL for both IO and GL defaults, making missing-IO and missing-GL indistinguishable |
| **`exportSAPJE` creates sheet with potentially unsafe chars** | Code.gs L475 | `'SAP_JE_' + (targetPeriod || 'ALL')` — if `targetPeriod` somehow contains special chars, sheet name creation fails. But this is mitigated by YYYY-MM regex |
| **`voidPrepaid` docNo regex for sheet name** | Code.gs L828 | `docNo.replace(/[/\\:*?<>|]/g, '_')` — catches most invalid sheet name chars but misses `]`? Actually this looks correct for GAS sheet name restrictions |
| **Chart label overflow** | index.html L400-401 | `r.glBreakdown.slice(0, 10)` — only uses 5 colors in the array, so months 6-10 have `undefined` background color |
| **`getSAPJEPreview()` uses unsaved settings** | Code.gs L558-559 | Uses local `settings` object with hardcoded defaults, NOT `PropertiesService`. Preview may differ from actual export |
| **`loadDashboard()` on every tab switch** | index.html L346 | Fetches and recalculates ALL 3,979 items × full amortization every time user clicks Dashboard tab. No caching |

---

## 3. MISSING FEATURES

### 3.1 Data Management (CRUD)

| Missing Feature | Priority | Rationale |
|-----------------|----------|-----------|
| **Edit existing records** | **Critical** | No way to correct a wrong IO, GL, amount, or date without editing the Google Sheet directly and re-running |
| **Delete records** | High | No UI to mark a record as deleted/archived. The input sheet keeps growing; no soft-delete |
| **Bulk import/upload** | High | Only reads from a specific Google Sheet by ID. No CSV/Excel upload, no manual entry |
| **View raw input data** | Medium | No "Data Browser" tab to see all 3,979 rows with search/filter before running amortization |
| **Input versioning / snapshots** | Low | If source sheet data changes, previously exported JEs become stale. No way to reload a known-good state |

### 3.2 User & Access Control

| Missing Feature | Priority | Rationale |
|-----------------|----------|-----------|
| **User authentication** | **Critical** | Zero access control. Anyone with the Web App URL can run amortization, export JEs, void contracts. GAS Web App can restrict by "Me", "Anyone", or "Domain" — currently set to ALLOWALL but no user-level auth |
| **Multi-user / role separation** | Medium | Different teams (AP, GL, Treasury) have different responsibilities. No separation between view/run/export/void |
| **Audit trail** | High | No logging of who ran what, when. `voidPrepaid` writes to `_VOID_LOG` but no user identity is captured |
| **Session timeout** | Low | GAS Web App has no built-in session. A user can leave the page open indefinitely |

### 3.3 Operational Features

| Missing Feature | Priority | Rationale |
|-----------------|----------|-----------|
| **Backup / restore** | High | All data lives in one sheet. No export/import of configuration (settings, period data). If the sheet is corrupted, the system is blind |
| **Scheduled auto-run** | Medium | Month-end must be run manually. Could use GAS time-driven triggers to run amortization on the 1st of each month |
| **Email notifications** | Medium | No alert when amortization is complete, when errors are detected, or when a period is overdue |
| **Multi-period comparison** | Low | Dashboard only shows trend per period; no side-by-side comparison of two periods |
| **Export formats** | Low | Only .xlsx via Drive API. No CSV, PDF report, or direct SAP iDoc/XML output |
| **Batch void / multi-select** | Medium | Can only void one document at a time. AP teams might need to void 10+ contracts in one action |
| **Undo / rollback void** | Low | Once voided, there's no "unvoid" — a reversing JE would need to be created manually |

### 3.4 UI/UX Gaps

| Missing Feature | Priority | Rationale |
|-----------------|----------|-----------|
| **Loading progress bars** | Medium | For 3,979 items, amortization can take 30+ seconds. Only a spinner — no progress percentage |
| **Search / filter on schedule** | High | Wide-format table shows all documents with no search, sort, or pagination. Users must scroll through hundreds of rows |
| **Data export from preview** | Low | Preview tables in UI have no "Copy to clipboard" or "Download CSV" button |
| **Dark mode persistence indicator** | Low | Theme preference saved in localStorage but no visual indicator that it was restored on load |

---

## 4. PERFORMANCE ANALYSIS

### 4.1 Loop Over 3,979 Items

The system reads **all rows** from the input sheet each time any operation runs (`readInputData_()`). This is called by:

| Function | Items processed | Per-item work | Total amort calls |
|----------|----------------|---------------|-------------------|
| `getDashboardData()` | All | Full amortization (all months) | **1 call per item = 3,979** |
| `runMonthEndAmortization()` | All | Partial (one period) | 1 call per item = 3,979 |
| `exportWideToSheet()` | All | Partial | 1 call per item = 3,979 |
| `exportSAPJE()` | All | Partial | 1 call per item = 3,979 |
| `runPreUploadCheck()` | All | 10 random items only | 10 calls |

**Dashboard is the worst offender** — it runs amortization on ALL items for ALL months, every time the user clicks the Dashboard tab. For 3,979 items, many spanning 12-36 months, `calculateAmortization_()` loops over 30-100 periods per item. Total operations: **~3,979 × ~30 = ~119,000 month-slice iterations.** On GAS, this can exceed the 6-minute execution quota.

### 4.2 Cache Strategy

- **Dashboard data** is cached for 5 minutes in `CacheService.getScriptCache()` (L576-631) — this is good
- **No other data is cached.** Every `getDocDetail()` recalculates full amortization. Every preview recalculates everything
- **Workaround:** Add cache keys for `items` (the full input array) and for individual document amortization schedules. GAS Cache max size is 100KB per key, 500MB total — JSON for 3,979 items at ~200 bytes each = ~800KB, which exceeds per-key limit. Cache in chunks or use `PropertiesService` for longer-term storage

### 4.3 Spreadsheet API Call Optimization

- `getDataRange().getValues()` — **1 call** for all data ✓
- `setValues()` called once per large data write ✓
- **`autoResizeColumns()`** is called on every export — on large datasets this is slow. Omit or limit columns
- **3 redundant `SpreadsheetApp.openById()` calls** per SAP export flow — could be stored in a variable
- **Sheet clears** (`sheet.clear()`) followed by rewrite — if the sheet has old data, could cause flicker. Better: write to a temp sheet then rename

### 4.4 Recommendations

1. **Defer amortization calculation to a background process** — Use GAS `LockService` with a time-based trigger so dashboard reads pre-calculated results
2. **Add progress tracking** — For 3,979 items, break into batches of 500 with `SpreadsheetApp.flush()` between batches
3. **Memoize `calculateAmortization_` results** — Same docNo queried multiple times in a single request (void preview → void execute). Cache by docNo within the request
4. **Limit dashboard to pre-computed aggregations** — Create a separate "summary" sheet updated once per day rather than recalculating on every page load

---

## 5. SAP ACCURACY ASSESSMENT

### 5.1 Debit=IO / Credit=GL Mapping Review

The generator (`generateSAPJE_`, L360-439) creates:

```
Debit (Key=40): GL Account = IO (from column H), Debit = amt, Credit = 0
Credit (Key=50): GL Account = GL (from column I), Debit = 0, Credit = amt
```

**Assessment: Correct for standard SAP FI posting.** Key 40 (Debit) typically carries the IO (internal order / asset), Key 50 (Credit) carries the offsetting GL. This matches standard prepaid amortization logic:
- Dr 40 → IO (the internal order/asset representing the prepaid)
- Cr 50 → GL (the expense account being charged)

**Exception:** If SAP is configured with different key-account mappings (e.g., some companies use key 40 for GL and key 50 for IO), the current logic is rigid. The keys should be configurable.

### 5.2 900 Lines per JE Batch

- `MAX_LINES_PER_JE = 900` (L14)
- Each amort entry produces **2 lines** (Dr + Cr)
- So max **450 entries per document**
- Split logic at L389: `if (lineCount + 2 > maxLines)` — safe check; starts new doc before exceeding

**Assessment: Sound.** 900 lines is a conservative SAP limit (most SAP systems accept 999 lines). The batching correctly accounts for 2 lines per entry.

### 5.3 SAP Field Completeness

| Field | Present? | Correct? |
|-------|----------|----------|
| Company | ✓ | Default "1022", configurable |
| Doc Type | ✓ | Default "SA", configurable |
| Posting Date | ✓ | Current date in `dd.MM.yyyy` |
| Document Date | ✓ | Same as posting date |
| Reference | ✓ | `SAP-{period}-{seq}` |
| Currency | ✓ | Default "THB" |
| Line Item | ✓ | Sequential per document |
| GL Account | ✓ | IO for debit, GL for credit |
| Debit / Credit | ✓ | Mutually exclusive |
| Description | ✓ | Truncated to 50 chars |
| Cost Center | ✓ | From input |
| IO | ✓ | Same as Debit GL for Dr line |
| Key | ✓ | 40 (Dr) / 50 (Cr) |
| Tax Branch | ✓ | Hardcoded "0000" |

**Issues:**
- **Tax Branch "0000" may be wrong** — depends on company code configuration. Should be configurable
- **No VAT / tax handling** — if any prepaid items involve VAT, there's no tax code or VAT splitting
- **No assignment field** — SAP often requires additional fields (assignment number, trading partner, business area)
- **No document header text** — could be useful for audit trail description

---

## 6. WHAT I'D ADD / MODIFY IN ONE MORE SPRINT

### Sprint Priority Order (1 sprint = ~2 weeks)

#### P0: Critical Fixes

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Fix Dashboard KPI double-count** — `totalAmt` should sum unique doc totals, not period totals | 1h | Stops misleading user with 12× inflated total |
| 2 | **Fix Void key/account mismatch** — Align void JE key-to-account mapping with standard JE convention | 2h | Prevents SAP upload rejection |
| 3 | **Add input validation at read time** — Validate column count, data types, and throw clear errors before processing | 4h | Catches 80% of runtime failures early |
| 4 | **Replace `catch(e){}` with proper error handling** — At minimum log to `Logger`, surface to user where possible | 1h | Avoids silent data corruption |

#### P1: Performance & Usability

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 5 | **Add progress feedback for long operations** — Return intermediate results every N items from server; update UI with progress bar | 8h | Prevents users from thinking app froze |
| 6 | **Add search/filter to schedule and void dashboards** — Client-side JS filter over loaded data | 4h | Dramatically improves daily usability |
| 7 | **Cache amortization results per doc in session** — Store computed schedules in a Google Sheet cache tab or ScriptProperties | 6h | 50-80% reduction in redundant recomputation |

#### P2: Missing Features

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 8 | **Edit record UI** — Inline editing in the wide-format preview, write changes back to source sheet | 10h | Enables correction without spreadsheet access |
| 9 | **Audit log sheet** — Log all actions (amortization run, JE export, void) with timestamp, user email, and parameters | 3h | Compliance requirement |
| 10 | **Backup config + data** — One-click export of settings + amortization summary to a new sheet | 4h | Disaster recovery |

#### P3: Polish & Extensibility

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 11 | **Configurable SAP keys** — Add Key 40/50 to settings UI | 1h | Flexibility for SAP config differences |
| 12 | **Multi-language support** — Extract Thai strings to a `LANG` object | 3h | Future-proofing |
| 13 | **Unit test harness** — Portable test functions for `calculateAmortization_`, `generateSAPJE_` | 6h | Regression protection |
| 14 | **CSV export for preview tables** | 2h | Quick data extraction |

---

## 7. SUMMARY OF FINDINGS

| Category | Count | Severity |
|----------|-------|----------|
| Critical bugs (double-count, key mismatch, round-off) | **3** | 🚨 Could cause financial misstatement |
| Hardcoded values needing extraction | **6** | 🔸 Operational risk for env changes |
| Silent error swallows | **4** | 🔸 User-blind failures |
| Missing features (CRUD, auth, audit) | **12+** | 🔸 Production readiness gaps |
| Performance bottlenecks | **3** | 🔸 GAS 6-min quota risk |
| SAP accuracy issues | **2** | 🔸 Tax branch hardcoded, no VAT handling |

### Verdict

The system is **functionally workable** for a manual month-end process run by a single user who controls the source spreadsheet. It is NOT production-ready for multi-user enterprise use. The amortization engine logic is sound (day-count proportional, penny-corrected), but the surrounding infrastructure — data management, error handling, performance, access control, and audit trail — has significant gaps that pose real financial risk in a live SAP environment.
