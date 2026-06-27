# QC Section 3: Feature Function Verification
**Project:** Prepaid Expense Amortization System (Amort)
**Date:** 2026-06-27
**Scope:** CRUD, Period-Close, Approvals, Budget, GL Recon

---

## 1. CRUD (app.html)

| # | Test | Expected | Actual | Result |
|---|------|----------|--------|--------|
| 1.1 | `loadCrudData()` calls `getCrudRecords()` | Line should call `.getCrudRecords()` | Line 3986: `}).getCrudRecords();` | ✅ **PASS** |
| 1.2 | `crudShowAddModal()` exists | Function defined | Line 4063: `function crudShowAddModal() {` | ✅ **PASS** |
| 1.3 | `crudSave()` calls `addPrepaidRecord` for new records | Line should call `.addPrepaidRecord(data)` | Line 4227: `}).addPrepaidRecord(data);` (called when `_crudEditing` is falsy) | ✅ **PASS** |
| 1.4 | `crudDeleteConfirm()` calls `deletePrepaidRecord` | Line should call `.deletePrepaidRecord()` | Line 4294: `}).deletePrepaidRecord(_crudDeleteDocNo);` | ✅ **PASS** |
| 1.5 | `generateDocNo()` exists | Defined in server-side code | `DataLayer.gs` line 191: `function generateDocNo() {`. Also used in `Import.gs` line 448 and `DataLayer.gs` line 266 inside `addPrepaidRecord`. | ✅ **PASS** |
| 1.6 | Search/filter: `crudSearch`, `crudFilter()` | Input with id `crudSearch` calling `crudFilter()` on input | Line 776: `<input ... id="crudSearch" ... oninput="crudFilter()">`. Line 4046: `function crudFilter() { crudRenderTable(); }` | ✅ **PASS** |

---

## 2. Period-Close (app.html + PeriodClose.gs)

| # | Test | Expected | Actual | Result |
|---|------|----------|--------|--------|
| 2.1 | `loadPeriodClose()` calls `getAllPeriodStatuses` | Function should call `getAllPeriodStatuses()` | `loadPeriodClose()` (lines 4309-4321) does **NOT** call `getAllPeriodStatuses`. It calls `loadPeriodChecklist()` which calls `getCloseChecklist()` and `getPeriodStatus()`. `getAllPeriodStatuses()` is only called from `loadPeriodStatusHistory()` (line 4571). | ❌ **FAIL** |
| 2.2 | `closePeriod()` called from app.html | Function call exists | Line 4510 (inside `executeClosePeriod`): `}).closePeriod(period, notes);` | ✅ **PASS** |
| 2.3 | `reopenPeriod()` called from app.html | Function call exists | Line 4533 (inside `executeReopenPeriod`): `}).reopenPeriod(period);` | ✅ **PASS** |

---

## 3. Approvals (app.html + Approval.gs)

| # | Test | Expected | Actual | Result |
|---|------|----------|--------|--------|
| 3.1 | `loadApprovals()` calls `getPendingApprovals` | Function should trigger `getPendingApprovals()` | `loadApprovals()` (lines 4579-4587) calls `updatePendingBadge()` (line 4586), which calls `.getPendingApprovals()` at line 4613. Indirect call. | ✅ **PASS** *(indirectly via `updatePendingBadge`)* |
| 3.2 | `approveRequest()` correct params | Called with requestId parameter | Line 4811: `}).approveRequest(requestId);` — single string param. Server-side `Approval.gs` line 101: `function approveRequest(requestId) {` accepts same. | ✅ **PASS** |
| 3.3 | `rejectRequest()` correct params | Called with requestId and reason | Line 4836: `}).rejectRequest(requestId, reason);` — two string params. Server-side `Approval.gs` line 162: `function rejectRequest(requestId, reason) {` accepts same. | ✅ **PASS** |
| 3.4 | `loadMyRequests()` exists | Function defined | Line 4714: `function loadMyRequests() {` | ✅ **PASS** |

---

## 4. Budget (app.html)

| # | Test | Expected | Actual | Result |
|---|------|----------|--------|--------|
| 4.1 | `loadBudgetData()` calls `getBudgetSummary` | Should call `getBudgetSummary()` | Line 4893: `}).getBudgetData(period);` — calls `getBudgetData`, **NOT** `getBudgetSummary`. `getBudgetSummary()` exists in `Dashboard.gs` (line 228) and is exposed in `Code.gs` (line 39), but is for the dashboard, not the budget page. | ❌ **FAIL** *(calls `getBudgetData` instead of `getBudgetSummary`)* |
| 4.2 | `loadBudgetVsActual()` calls `getBudgetVsActual` | Should call `getBudgetVsActual()` | Line 5053: `}).getBudgetVsActual(period);` | ✅ **PASS** |

---

## 5. GL Recon (app.html + GlRecon.gs)

| # | Test | Expected | Actual | Result |
|---|------|----------|--------|--------|
| 5.1 | `loadGLRecon()` calls `getGLSummary` | Should trigger `getGLSummary()` | `loadGLRecon()` (line 5318) calls `loadGLAccountSummary()` (line 5326), which calls `.getGLSummary()` at line 5350. | ✅ **PASS** *(indirectly via `loadGLAccountSummary`)* |
| 5.2 | `runGLRecon()` calls `runGLReconciliation` | Should call `runGLReconciliation()` | Line 5618: `}).runGLReconciliation(period);` | ✅ **PASS** |
| 5.3 | `removeGLRow()` / `closest('tr')` fix works | Uses `closest('tr')` not fragile parent chain | Line 5478: `inp.closest('tr')`. Also line 5470 inline button uses `this.closest('tr').remove()`. Both use the correct `closest('tr')` pattern. | ✅ **PASS** |
| 5.4 | `saveGLBalances()` calls `saveGLBalance` | Should call `saveGLBalance()` | Line 5529: `}).saveGLBalance(period, balances);` | ✅ **PASS** |

---

## Summary

| Section | Tests | Pass | Fail |
|---------|-------|------|------|
| 1. CRUD | 6 | 6 | 0 |
| 2. Period-Close | 3 | 2 | 1 |
| 3. Approvals | 4 | 4 | 0 |
| 4. Budget | 2 | 1 | 1 |
| 5. GL Recon | 4 | 4 | 0 |
| **Total** | **19** | **17** | **2** |

### Failing Tests

**2.1** — `loadPeriodClose()` does NOT call `getAllPeriodStatuses()`. It initializes the UI and calls `loadPeriodChecklist()` (which calls `getCloseChecklist()` and `getPeriodStatus()`). The `getAllPeriodStatuses()` function is called from `loadPeriodStatusHistory()` instead — this is used for the history view, not the initial load.

**4.1** — `loadBudgetData()` calls `getBudgetData(period)` not `getBudgetSummary()`. `getBudgetSummary()` exists in `Dashboard.gs` as a separate dashboard KPI function. The budget page correctly uses its own dedicated `getBudgetData()` function, but the test expected `getBudgetSummary()`.
