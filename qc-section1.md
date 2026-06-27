# QC Section 1: Dashboard + Amortization + Schedule

## 1. Dashboard (app.html)

### 1.1 loadDashboard() — batchCall with ['getDashboardData','getSettings','getEmailConfig']

**RESULT: FAIL**

- Original `loadDashboard()` at line 1319 correctly calls `batchCall(['getDashboardData','getSettings','getEmailConfig'], callback, errorCallback)`.
- Backend `batchGet()` (Code.gs line 18) whitelists all three function names correctly.
- **However**, a PATCH at line 5158–5228 redefines `loadDashboard` (line 5161) to directly call `google.script.run...getDashboardData()` — bypassing `batchCall` entirely.
- The original batchCall-based function is saved as `_origLoadDashboard` (line 5160) but **never invoked** — the PATCH calls `_callOrigLoadDashboard(r)` (a separate helper) instead.
- Therefore, `getSettings` and `getEmailConfig` are **never fetched** alongside dashboard data at startup. The batchCall optimization is dead code.
- The startup call at line 5703–5704 calls the **patched** `loadDashboard`, which uses a direct single-function call.

### 1.2 renderCharts() — all 7 charts registered in ChartManager

**RESULT: PASS**

- `renderCharts()` at line 1397 registers exactly 7 charts via `ChartManager.registerChart()`:
  1. `trendChart` (line 1409) — line chart
  2. `glChart` (line 1436) — bar chart
  3. `lineAccumTrend` (line 1459) — line chart
  4. `stackedBarCC` (line 1512) — stacked bar chart
  5. `pieCompany` (line 1530) — pie chart
  6. `barActiveItems` (line 1551) — bar chart
  7. `barIoTop10` (line 1576) — horizontal bar chart
- `setupSectionVisibility` at line 1599 explicitly lists all 7 IDs.
- Each registration is guarded by a data-availability check (`if(r.trend && r.trend.length>0)` etc.), so no registrations occur on empty data — acceptable defensive pattern.

### 1.3 loadRunningBalance() — runs after dashboard render

**RESULT: PASS**

- In original `loadDashboard` (line 1384): `setTimeout(function(){loadRunningBalance(r);}, 200);`
- In patched `_callOrigLoadDashboard` (line 5287): `setTimeout(function() { loadRunningBalance(r); }, 200);`
- Both versions schedule `loadRunningBalance` with a 200ms delay after dashboard render. ✅
- The function `loadRunningBalance` at line 3751 correctly calls `google.script.run...getDocList()`.

### 1.4 ClientSideCache.set('dashData', r, 300) — any issues?

**RESULT: FAIL**

- `ClientSideCache` is referenced at 6 locations in `app.html` but **never defined** anywhere in the codebase (neither in `app.html`, `index.html`, nor any `.gs` file).
- The original `loadDashboard` (line 1386) calls `ClientSideCache.set('dashData', r, 300)` but this code path is **never executed** because the PATCH overrides `loadDashboard`.
- The patched `_callOrigLoadDashboard` (lines 5231–5288) does **NOT** include any `ClientSideCache.set(...)` call — the dashboard data is never cached client-side.
- However, `PACache` (line 547) is properly defined with `set(type, key, data)` and `get(type, key)` methods, and is used elsewhere (guide, settings). The `ClientSideCache` name appears to be a separate, undefined caching mechanism — likely a bug or leftover from a previous refactor.

### 1.5 batchCall flow — function references correct

**RESULT: FAIL** (the flow exists but is dead code)

- `batchCall` at line 27 correctly defines the wrapper: validates input, calls `google.script.run.withSuccessHandler(...).withFailureHandler(...).batchGet(fns)`.
- `batchGet` in Code.gs (line 18) is a server-side dispatcher that uses an allowlist of function references (including `getDashboardData`, `getSettings`, `getEmailConfig`).
- The call `batchCall(['getDashboardData','getSettings','getEmailConfig'], ...)` in the original `loadDashboard` (line 1321–1322) is syntactically and semantically correct — it would fetch all three functions in one round-trip.
- **However**, the flow is **completely dead** because the PATCH at line 5161 overrides `loadDashboard` to bypass batchCall. The original `_origLoadDashboard` is never called. The PATCH directly calls `getDashboardData()` only and ignores settings/email config entirely.

---

## 2. Amortization (app.html)

### 2.1 runAmort() — calls correct backend function

**RESULT: PASS**

- `runAmort()` at line 1666 calls `google.script.run[...].runMonthEndAmortization(periodArg)` at line 1744.
- Backend function `runMonthEndAmortization` exists in `AmortEngine.gs` line 92 ✅
- The `periodArg` is correctly constructed:
  - If multi-period is checked: generates an array of YYYY-MM strings via `generatePeriodList_()` (line 1649)
  - If single period: uses the period value directly or null (empty = all periods)
- Input validation (regex, date range order) is present and correct.

### 2.2 getAmortPreview() — pagination works?

**RESULT: FAIL** (function does not exist)

- **No `getAmortPreview()` function exists** anywhere in the codebase.
- Amortization pagination works differently:
  - Pagination state stored in `_pagState.amort` (line 484: page=0, pageSize=50, total=0)
  - `pagPrev`/`pagNext` (lines 511, 518) update the page and dispatch a `CustomEvent('paginate', ...)` (line 536)
  - Event listener at line 3951 receives the event and **re-runs `runAmort()` entirely** (line 3959)
  - `runAmort()` then slices the cached `r.sample` data with `sampleAll.slice(page * ps, (page + 1) * ps)` (line 1719) and re-renders the paginated table
- This design works but is **inefficient** — every pagination re-triggers the full `runMonthEndAmortization` backend call instead of just re-slicing cached data client-side. It relies on backend caching for performance.
- Pagination UI buttons, info text, and range display (lines 490–508) are all correctly rendered.

### 2.3 Multi-period selector toggleMultiPeriod() works?

**RESULT: PASS**

- `toggleMultiPeriod()` at line 1641:
  - Reads checkbox `multiPeriodChk` (line 1642)
  - Toggles visibility of `multiPeriodRange` div (line 1645) between `'flex'` and `'none'`
- HTML structure (line 730–741) correctly creates:
  - Checkbox with `onchange="toggleMultiPeriod()"`
  - Start/End date inputs (`mpStart`, `mpEnd`) initially hidden
- `runAmort()` correctly reads the checkbox state (line 1667), validates multi-period inputs (lines 1673–1675), and passes either an array of periods or a single period/null to the backend (lines 1676–1681).

---

## 3. Schedule (app.html)

### 3.1 loadWidePreview() — calls exportWideToSheet?

**RESULT: PASS**

- `loadWidePreview()` at line 2024 calls `google.script.run[...].getWidePreview(period||null)` at line 2056.
- Backend function `getWidePreview` exists in `Export.gs` line 116 ✅
- The function correctly validates the period input, shows/hides loader, and renders the wide-format schedule table.
- **Note**: The test asks "calls exportWideToSheet?" — it actually calls `getWidePreview`, not `exportWideToSheet`. `exportWideToSheet` is called by `exportWide()`. The naming is correct for the function's purpose (preview vs export).

### 3.2 exportWide() — correct params?

**RESULT: PASS**

- `exportWide()` at line 2059 calls `google.script.run[...].exportWideToSheet(period||null)` at line 2075.
- Backend function `exportWideToSheet` exists in `Export.gs` line 64 ✅
- Parameters:
  - Reads `schedPeriod` input value (line 2060)
  - Validates YYYY-MM format (line 2061)
  - Shows confirmation dialog (line 2062)
  - Passes period (or null for all) to backend
  - Shows result message on success/failure (lines 2066–2071)

---

## Summary

| # | Test | Result | Issue |
|---|------|--------|-------|
| 1.1 | loadDashboard() batchCall with getDashboardData+getSettings+getEmailConfig | **FAIL** | PATCH overrides loadDashboard to call getDashboardData() directly; batchCall is dead code; settings+emailConfig never fetched via batch |
| 1.2 | renderCharts() all 7 charts registered | **PASS** | All 7 chart configs registered correctly via ChartManager |
| 1.3 | loadRunningBalance() runs after dashboard render | **PASS** | Called via setTimeout with 200ms delay in both original and patched versions |
| 1.4 | ClientSideCache.set('dashData', r, 300) | **FAIL** | `ClientSideCache` never defined in codebase; also the patched `_callOrigLoadDashboard` omits this cache call entirely |
| 1.5 | batchCall flow function references correct | **FAIL** | Syntactically correct but dead code — PATCH bypasses batchCall entirely |
| 2.1 | runAmort() calls correct backend function | **PASS** | Calls `runMonthEndAmortization(periodArg)` — backend exists in AmortEngine.gs |
| 2.2 | getAmortPreview() pagination | **FAIL** | Function does not exist; pagination works via pagPrev/pagNext → re-running full runAmort() |
| 2.3 | toggleMultiPeriod() works | **PASS** | Correctly shows/hides period range inputs and populates periodArg in runAmort() |
| 3.1 | loadWidePreview() calls exportWideToSheet? | **PASS** | Calls `getWidePreview` (correct backend function for preview) |
| 3.2 | exportWide() correct params | **PASS** | Calls `exportWideToSheet(period\|null)` with correct validation and confirm dialog |

**Overall: 6 PASS / 4 FAIL**

**Key issues to address:**
1. **ClientSideCache undefined** — referenced 6 times but never defined; likely should be `PACache` or needs to be implemented
2. **PATCH at line 5158** completely bypasses the `batchCall` optimization and doesn't fetch settings/emailConfig — either remove the PATCH or make it also use batchCall
3. **getAmortPreview function missing** — if a dedicated preview endpoint is desired, it needs to be implemented; current pagination re-runs full amortization
