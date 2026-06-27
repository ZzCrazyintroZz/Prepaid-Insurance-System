# QC Test Report — Section 2: SAP Generator + Checker + Void

**Date:** 2026-06-27
**Scope:** app.html → validate wiring of SAP Generator, Checker, and Void sections

---

## 1. SAP Generator

### previewSAPJE() calls getSAPJEPreview?
**PASS** ✅ — Line 1797: `.getSAPJEPreview(period||null)` correctly calls the backend function with the period parameter (null if empty).

### exportSAPJE() calls exportSAPJE? (correct params)
**PASS** ✅ — Line 1826: `.exportSAPJE(period||null)` correctly calls the backend function with the period parameter (null if empty).

### Bulk Export Functions

#### toggleBulkSAP()
**PASS** ✅ — Line 1832-1843: Toggles `bulkSapSection` visibility, calls `loadBulkSAPPeriods()` when expanding to populate periods.

#### loadBulkSAPPeriods()
**PASS** ✅ — Line 1845-1873: Calls `.getAvailablePeriods()` on the backend, populates `bulkSapBody` with period rows and checkboxes.

#### onBulkSAPSelectAll()
**PASS** ✅ — Line 1876-1879: Sets all `.bulk-sap-cb` checkboxes to the state of `#bulkSapSelectAll`, then calls `updateBulkSAPCount()`.

#### exportBulkSAP()
**PASS** ✅ — Line 1964-2020: Calls `.bulkExportSAPJE(selected)` on the backend (line 2020) with the array of selected periods. All wiring is correct.

### SAP table has sapBody, sapTable?
**PASS** ✅ — SAP template (lines 882-885):
- `<table class="tb" id="sapTable">` (line 882)
- `<tbody id="sapBody">` (line 884)
Both IDs exist and are referenced by `loadSAP()` (line 1287) and `previewSAPJE()` (line 1773).

### Pagination for SAP: _pagState.sap?
**PASS** ✅ — `_pagState.sap` is defined at line 485.

**NOTE:** Although `_pagState.sap` exists, the SAP section does NOT actually use pagination in its preview/export flow (no pagination bar or paginated data loading). The `paginate` event listener (lines 3951-3961) handles 'void', 'checker', and 'amort' but NOT 'sap'. The state entry exists but is unused — this is dead code. No functional impact since the SAP table just renders all preview data at once.

**Verdict: PASS** (state exists, but flag as unused/dead code)

---

## 2. Checker

### runChecker() calls runPreUploadCheck?
**PASS** ✅ — Line 2230: `.runPreUploadCheck(null)` correctly calls the backend function.

### Results display: cErrorBody, cWarnBody exist?
**PASS** ✅ — Checker template:
- Line 964: `<tbody id="cErrorBody">` exists in the Errors card
- Line 968: `<tbody id="cWarnBody">` exists in the Warnings card
Both are populated in `runChecker()` (lines 2210, 2218).

### Pagination for checker: _pagState.checker?
**PASS** ✅ — `_pagState.checker` is defined at line 487. The paginate event listener (line 3955-3956) IS wired to call `runChecker()` when section='checker'.

**WARNING:** 
1. `loadChecker()` (line 1293) references `document.getElementById('checkerBody')` which does NOT exist in the checker template. This is a **minor bug** — the element is never created, so `innerHTML=''` on null is an error (silently fails in JS, no impact).
2. No pagination bar/controls exist in the checker template (lines 939-971). The pagination state is wired via events but has no UI to drive it. The error/warning tables render all results at once.

**Verdict: PASS with issues** — state exists and event listener is wired, but no pagination UI in template.

---

## 3. Void

### loadVoidDocs() calls getDocList?
**PASS** ✅ — Line 2248: `.getDocList()` correctly calls the backend function to populate the void doc dropdown.

### batchVoidPrepaid() — type parameter?
**PASS** ✅ — Line 2499: `.batchVoidPrepaid(selected, voidDate, type, lossGL)` passes `type` as the third parameter (string: 'refund' or 'loss'). Correctly wired.

### getDocDetail() — cached correctly?
**FAIL** ❌ — The void section does NOT implement client-side caching for `getDocDetail()`:
- `onVoidDocSelect()` (line 2276) calls `.getDocDetail(docNo)` fresh each time
- `voidPreview()` (line 2309) calls `.getDocDetail(docNo)` again without cache
- `voidExecute()` calls the void backend directly (not getDocDetail)
- `onModifyDocSelect()` (line 2550) also calls `.getDocDetail(docNo)` without cache

The only `getDocDetail` caching exists in the **Running Balance** module (`_rbData` at line 3789), not in the void section itself. Each navigation fetches the same doc details repeatedly from the backend.

**Recommendation:** Add a `_voidDocCache = {}` to cache results between onVoidDocSelect/voidPreview calls within the same session.

### loadBatchVoidDocs() — works?
**PASS** ✅ — Line 2346-2387:
- Fetches paginated doc list via `.getDocList(skip, limit)` with pagination params (line 2387)
- Renders pagination bar using `renderPagination('void', total)` (line 2366)
- Properly handles empty/error states
- Wire for the "โหลดรายการเอกสาร" button (line 1022) correctly calls this function

### Pagination for void: _pagState.void?
**PASS** ✅ — `_pagState.void` is defined at line 486 and ACTIVELY USED:
- `loadBatchVoidDocs()` reads `_pagState['void']` for skip/limit calculations (line 2352)
- Pagination bar is rendered (line 2366)
- `paginate` event listener (line 3953-3954) calls `loadBatchVoidDocs()` on void pagination

---

## Summary

| Test | Result |
|------|--------|
| **1. SAP Generator** | |
| previewSAPJE() → getSAPJEPreview | ✅ PASS |
| exportSAPJE() → exportSAPJE | ✅ PASS |
| toggleBulkSAP() | ✅ PASS |
| loadBulkSAPPeriods() | ✅ PASS |
| onBulkSAPSelectAll() | ✅ PASS |
| exportBulkSAP() | ✅ PASS |
| sapBody + sapTable exist | ✅ PASS |
| _pagState.sap exists | ✅ PASS (unused) |
| **2. Checker** | |
| runChecker() → runPreUploadCheck | ✅ PASS |
| cErrorBody + cWarnBody exist | ✅ PASS |
| _pagState.checker exists + wired | ✅ PASS (no UI, minor bug) |
| **3. Void** | |
| loadVoidDocs() → getDocList | ✅ PASS |
| batchVoidPrepaid() type param | ✅ PASS |
| getDocDetail() cached correctly | ❌ FAIL |
| loadBatchVoidDocs() works | ✅ PASS |
| _pagState.void exists + used | ✅ PASS |

**Overall: 14 PASS / 1 FAIL**

**Key issues:**
1. **FAIL** — `getDocDetail()` has no client-side caching in the void section (redundant backend calls)
2. **Minor** — `loadChecker()` references non-existent `checkerBody` element (line 1293)
3. **Note** — `_pagState.sap` is defined but never used for actual pagination
