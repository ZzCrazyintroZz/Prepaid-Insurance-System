# Prepaid Expense Amortization System — Security, UX & Performance Review

**Reviewer:** Automated Code Review  
**Date:** 2026-06-26  
**Files reviewed:** `Code.gs` (1046 lines), `index.html` (787 lines), `appsscript.json` (17 lines)  
**Estimated data volume:** 3,979 items  

---

## 1. 🛡️ SECURITY

### CRITICAL — `ANYONE_ANONYMOUS` Deployment (appsscript.json:8)

```json
"webapp": {
  "executeAs": "USER_DEPLOYING",
  "access": "ANYONE_ANONYMOUS"
}
```

The web app is deployed with **unauthenticated public access**. Any person on the internet who discovers the URL can:
- View the full UI with summary data (item counts, amounts, period info)
- Trigger `runMonthEndAmortization()` — reads all input data and computes amortization
- Trigger `exportWideToSheet()` — writes structured financial data to a spreadsheet
- Trigger `exportSAPJE()` — generates SAP journal entries and creates `.xlsx` files in Drive
- Trigger `voidPrepaid()` — executes void/termination of prepaid items, writes to sheets, creates `.xlsx` files in Drive

**Impact:** An attacker can generate financial journal entries, write to the company's SAP template spreadsheet, create files in Drive, and trigger void operations that affect real financial records.

**Fix:** Change to `"access": "DOMAIN"` if a G Suite domain is available, or implement an authentication gate inside `doGet()` and all server-side functions.

---

### CRITICAL — `XFrameOptionsMode.ALLOWALL` (Code.gs:29)

```javascript
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
```

Clickjacking is explicitly permitted. The app can be embedded in an iframe on any external site, enabling UI overlay attacks that trick users into performing actions unknowingly.

**Fix:** Remove this line (default is `ALLOW` which only permits same-origin framing) or set `XFrameOptionsMode.ALLOW` explicitly.

---

### CRITICAL — Hardcoded Financial Sheet IDs (Code.gs:9-11)

```javascript
INPUT_SHEET_ID: '1vnzmnZtR9U5cQcSdpjY22mR30ULbgHd62JcfC50ZC20',
SAP_TEMPLATE_ID: '1sPG7aO6d25RpiMc-88Hx8ffrPruW78h4GwOClbJxG1M',
```

Two production Google Sheet IDs are hardcoded in the source code. Combined with `ANYONE_ANONYMOUS`, any user can:
1. Read the sheet IDs from the public source
2. Try to access or brute-force share settings on those sheets
3. Trigger `exportWideToSheet()` and `exportSAPJE()` which **write** to `SAP_TEMPLATE_ID`

Sheet `SAP_TEMPLATE_ID` is both **read** and **written** to — it's the template where journal entries are created.

**Fix:** Move sheet IDs to `PropertiesService.getScriptProperties()` (already used for settings). Never hardcode in source.

---

### HIGH — Broad OAuth Scope (appsscript.json:11-15)

```json
"oauthScopes": [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive"
]
```

The `drive` scope gives full Drive access. The app only needs to create files in a specific folder. Using `drive.file` scope would be more appropriate. Additionally, `drive.appdata` or `drive.readonly` could suffice for the XLSX export feature.

**Fix:** Scope down to `https://www.googleapis.com/auth/drive.file` (per-file access) and validate that `getRootFolder()` is not used — write to a dedicated folder created by the script.

---

### HIGH — No CSRF Protection

GAS web apps offer no built-in CSRF tokens. With `ANYONE_ANONYMOUS` and `ALLOWALL` framing, an attacker can craft a page that submits requests to the GAS app on behalf of an authenticated (same-session) user.

**Fix:** Implement a token exchange pattern — generate a token in `doGet()`, pass it to the client, verify it on every server-side call.

---

### MEDIUM — No Server-Side Input Validation on Settings

`saveSettings()` (Code.gs:666-673) accepts whatever the client sends and stores it directly:

```javascript
function saveSettings(settings) {
  PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(settings));
}
```

No validation that `company`, `prepaidGL`, `docType` are safe strings. No bounds check on `maxLinesPerJE`.

**Fix:** Validate each field server-side before saving.

---

### MEDIUM — Comment Leaks Internal Email (Code.gs:4)

```javascript
* Account: tippawan.si@pt.co.th
```

An internal email address is exposed in the source code. With public deployment, this is information disclosure.

**Fix:** Remove the comment or move it to a private configuration file.

---

## 2. 🎨 UX / UI

### CRITICAL — Only One @media Query (index.html:74)

```css
@media(max-width:600px){.kpi-grid{grid-template-columns:1fr 1fr}}
```

That's the **only** responsive rule. On mobile (<480px):
- **Header** is 52px fixed with small text but the chip icons overlap on narrow screens
- **Tabs** wrap but have no scroll/overflow treatment — they cascade down looking broken
- **Tables** have `overflow-x:auto` which is good, but cell content at `font-size:11px` and `padding:5px 8px` is barely tappable
- **Form fields** (`input.fi`) don't expand to full width on mobile
- **Button rows** wrap but buttons remain small and close together

**Fix:** Add comprehensive mobile breakpoints: `<480px` (phone portrait), `480-768px` (phone landscape/tablet), with adjusted font sizes, full-width form inputs, stacked layouts.

---

### HIGH — Touch Targets Below WCAG Minimum

WCAG 2.2 requires touch targets of at least 24×24px (AA) and recommends 44×44px. Current button sizing:
- Buttons: `padding: 8px 14px; font-size: 12px` → ~28×40px (borderline)
- Tab buttons: `padding: 8px 16px; font-size: 12px` → ~28×44px (OK)
- Chips (header): `padding: 3px 9px; font-size: 10px` → ~22×28px (**FAIL**)
- Select dropdowns, table cells: no special touch sizing

**Fix:** Increase minimum touch target to 44×44px with `min-height` and `min-width` on interactive elements.

---

### HIGH — Loading States Have No Timeout/Abort

All loaders use a simple `.hidden` class toggle:

```javascript
document.getElementById('loaderAmort').classList.remove('hidden');
```

If a server call hangs (GAS 6-min timeout), the loader displays indefinitely with no abort button. User has no feedback on progress for long-running operations (3,979 items).

**Fix:** Add a 30-second "still working..." fallback message. Consider a `setTimeout` that shows extended progress text. For long operations, show elapsed time.

---

### MEDIUM — Toast Auto-Dismiss Too Short

```javascript
setTimeout(function(){t.remove()}, 3000)
```

3 seconds is insufficient for error messages that may contain row numbers, doc numbers, and Thai-language context. Users must re-run to re-read errors.

**Fix:** Make error toasts persist until dismissed (click-to-dismiss). Success toasts can auto-dismiss at 3-4 seconds. Use different handler for error vs success.

---

### MEDIUM — Settings "Rounding" Option Never Applied

The settings UI has a rounding dropdown (`'4dec'` vs `'full'`) but `calculateAmortization_()` always uses 4-decimal precision:

```javascript
const ratePerDay = Math.round((totalAmt / totalDays) * 10000) / 10000;
```

The saved `settings.rounding` value is never read or used in calculations.

**Fix:** Either implement the rounding option in the engine or remove it from settings to avoid confusion.

---

### LOW — No Confirmation on Potentially Destructive Exports

`exportWide()` and `exportSAPJE()` clear and overwrite existing sheet data without warning the user about data loss beyond a basic `confirm()` dialog. The `confirm()` dialog is good but doesn't warn the user that existing data in that sheet will be **lost**.

**Fix:** Enhance the confirm message to explicitly state: "This will overwrite existing data in sheet 'SAP_JE_...'".

---

## 3. ⚡ PERFORMANCE

### CRITICAL — `getDashboardData()` Computes Full Amortization for ALL 3,979 Items

```javascript
for (var i = 0; i < items.length; i++) {
  var item = items[i];
  var schedule = calculateAmortization_(item, null);  // Full schedule, every item
  ...
}
```

This computes the complete amortization schedule for **every single prepaid item** every time the dashboard loads (unless cached). At 3,979 items spanning potentially 12-60 months each, this is:
- **142,000–240,000+ individual month-period calculations**
- **30+ seconds of GAS execution time** before the 5-min cache helps
- Repeated on every page visit, tab switch to Dashboard, and after cache expiry

**Fix:**
1. Don't compute amortization in dashboard — pre-aggregate or store results in a separate sheet
2. Increase cache TTL to 30 minutes and add manual "Refresh" button
3. Compute trends incrementally — only compute for items whose schedule is needed

---

### HIGH — No Caching for Expensive Operations (Export, Amort Run)

CacheService is **only** used for dashboard data (5 min TTL). Other expensive operations run fresh every time:
- `runMonthEndAmortization()` — no cache
- `exportWideToSheet()` — no cache
- `exportSAPJE()` — no cache
- `getDocDetail()` — no cache

These all call `readInputData_()` + `calculateAmortization_()` in a loop over 3,979 items.

**Fix:** Cache `readInputData_()` results for 60 seconds with a cache key that invalidates on write operations.

---

### HIGH — Repeated `readInputData_()` Calls

Each server function calls `readInputData_()` independently. For example, `exportSAPJE()` calls it once, but both `getSAPJEPreview()` and `exportSAPJE()` call it separately. The preview → export flow reads 3,979 rows from Sheets **twice**.

**Fix:** Implement a request-level cache — read once per request and reuse across function calls within the same execution.

---

### MEDIUM — `getDataRange()` Fetches Entire Sheet Including Empty Trailing Rows

```javascript
const data = sheet.getDataRange().getValues();
```

If the sheet has 10,000 rows with data only in the first 3,979, `getDataRange()` still fetches all data (including empty rows beyond the data range) if there's formatting or stale data. In worst case, this could fetch 10× more rows than needed.

**Fix:** Use `getRange(1, 1, sheet.getLastRow(), 15).getValues()` instead.

---

### MEDIUM — GAS 6-Minute Execution Limit Risk

Processing 3,979 items through the full amortization engine could approach or exceed the 6-minute GAS execution limit, especially if items have long date ranges (12-60+ months per item). Each of the following could hit the limit:
- `getDashboardData()` (full amort on 3,979 items)
- `exportSAPJE()` (read + amort + generate JE + write to sheet + create XLSX)
- `exportWideToSheet()` (read + amort + pivot + write to sheet)

**Fix:** Implement cursor/batch processing, or pre-compute amortization results and store them in a results sheet.

---

### LOW — Temp File Cleanup on XLSX Export

```javascript
DriveApp.getFileById(tempSs.getId()).setTrashed(true);
```

The XLSX export creates a temporary copy of the spreadsheet, which is placed in Trash (not deleted). Over time, trashed files accumulate and consume Drive storage quota.

**Fix:** Use `DriveApp.removeFile()` (permanent delete) or document the behaviour.

---

## 4. 🔧 RELIABILITY

### HIGH — Core Calculation Functions Have No try-catch

Three critical functions lack try-catch blocks at the function level:

| Function | Risk |
|---|---|
| `calculateAmortization_()` (Code.gs:130) | Date parsing errors, floating-point errors bubble up |
| `pivotToWideFormat_()` (Code.gs:220) | Key manipulation errors, null reference errors |
| `generateSAPJE_()` (Code.gs:360) | Array manipulation errors, property access errors |

These are called from within loops. A single unhandled error in one item — e.g., an unexpected date format in `calculateAmortization_()` — **crashes the entire batch processing** for all 3,979 items. The calling functions have try-catch at the outer level, but the error message will be generic ("Cannot read property...").

**Fix:** Add try-catch inside the loop at the item level, so a single bad item doesn't kill the entire run. Log the error and continue processing remaining items.

---

### HIGH — Floating-Point Rounding Accumulation

```javascript
const ratePerDay = Math.round((totalAmt / totalDays) * 10000) / 10000;
```

The per-day rate is rounded to 4 decimals. For 3,979 items with varying date ranges, the sum of `daysInMonth * ratePerDay` will rarely equal `totalAmt` exactly. The "last-month adjustment" logic attempts to fix this:

```javascript
if (overlapEnd.getTime() === end.getTime() && 
    Math.abs(daysInMonth * ratePerDay - (totalAmt - accumulated)) < 0.05) {
  amortAmount = Math.round((totalAmt - accumulated) * 100) / 100;
}
```

**Issues:**
- The tolerance `< 0.05` (5 satang) may be too tight for large amounts with many months
- If it doesn't trigger, the remaining balance `< 0.01` is left as residual
- `accumulated` rounding errors compound across 3,979 items
- The `remaining = Math.max(0, ...)` at line 173 silently discards negative residuals

**Fix:** Use integer math (multiply by 100 for satang, or by 10000 for 4-decimal precision) for all intermediate calculations. Only round at display time.

---

### MEDIUM — No Locking for Concurrent Access

With `ANYONE_ANONYMOUS`, multiple users could trigger operations simultaneously:
1. User A runs `exportWideToSheet()` which clears and writes to a sheet
2. User B runs `exportSAPJE()` which also writes to the same spreadsheet
3. Race conditions cause data corruption

**Fix:** Use `LockService.getScriptLock()` to serialize write operations.

---

### MEDIUM — Unnecessary `Math.round` Proliferation

```javascript
Math.round(accumulated * 100) / 100;       // line 172
Math.round((totalAmt - accumulated) * 100) / 100;  // line 173
Math.round(amortAmount * 100) / 100;       // line 177
```

Numbers are rounded to 2 decimal places multiple times within the same calculation chain, introducing cumulative rounding artifacts.

**Fix:** Round once at the end of calculation. Use a single formatting step.

---

### MEDIUM — Date Parsing Depends on Spreadsheet Locale

```javascript
const start = new Date(item.startDate);
```

`item.startDate` comes from `sheet.getValues()` — GAS returns Date objects when it recognizes dates, but the column mapping doesn't parse them explicitly (line 70: `amount: Number(row[14]) || 0` but startDate/endDate are raw `row[12]`, `row[13]`).

If the spreadsheet stores dates as text strings in different formats (Thai Buddhist year, different locale separators), `new Date()` parsing will produce wildly different results across environments.

**Fix:** Explicitly validate and normalize date values using `Utilities.parseDate()` with an explicit format and timezone.

---

## 5. ♿ ACCESSIBILITY

### CRITICAL — Hardcoded Blue-On-Blue Color Scheme (index.html:566,578)

```javascript
headHtml += '<th style="'+(isMonth?'background:#cfe2f3;color:#1a5276':'')+'">' ...;
style = ci>=r.baseCount?'color:#1a5276;font-weight:500':'';
```

The wide-format schedule uses **dark blue (#1a5276) text on light blue (#cfe2f3) backgrounds**. This fails WCAG 2.1 AA contrast ratio requirements:
- **#1a5276 on #cfe2f3**: contrast ratio ≈ **3.4:1** (fails AA which requires 4.5:1 for normal text)
- This affects the entire month-column section of every wide-format preview/export

**Fix:** Use properly contrasting colors that work in both dark and light modes. For month columns, use a subtle tint with the normal text color (`var(--tx)`).

---

### HIGH — Font Sizes Too Small for Readability

| Element | Size | WCAG Requirement |
|---|---|---|
| Table header labels | 9px | Should be ≥12px |
| KPI labels (`.kl`) | 9px | Should be ≥12px |
| Chip text | 10px | Should be ≥12px |
| Table cell text | 11px | Should be ≥12px for readability |
| Subtitles (`.ps`) | 12px | Borderline OK |

9px and 10px text is extremely difficult to read, especially on mobile devices. KPI labels and table headers are the primary information architecture elements.

**Fix:** Increase minimum font size to 11px for secondary labels and 12px for primary content. Use `clamp()` for responsive sizing.

---

### HIGH — No Visible Focus Indicators

```css
.fi:focus{border-color:rgba(201,169,110,.3)}
```

The only focus indicator is a subtle gold border on form inputs. There are **no focus styles** for:
- Buttons (`.btn`)
- Tabs (`.tab`)
- Chips (`.chip`)
- Select dropdowns (`.sel`)

Keyboard-only users cannot navigate the application.

**Fix:** Add `outline: 2px solid var(--gold)` or a similar high-contrast focus ring to all interactive elements.

---

### MEDIUM — No ARIA Landmarks or Semantic Roles

- Tabs use `div` elements with `onclick` — no `role="tablist"`, `role="tab"`, `role="tabpanel"`, or `aria-selected`
- No `aria-label` on any button
- No `<caption>` or `scope="col"` on tables
- No `role="alert"` on toast/error messages
- No `aria-live` regions for dynamic content updates

**Fix:** Add proper ARIA roles, labels, and live regions to all interactive and dynamic elements.

---

### MEDIUM — Toast Animation Ignores `prefers-reduced-motion`

```css
@keyframes slide{from{transform:translateX(300px);opacity:0}to{transform:translateX(0);opacity:1}}
```

The slide-in animation has no `@media (prefers-reduced-motion: reduce)` fallback.

**Fix:** Wrap animation in a reduced-motion query:
```css
@media (prefers-reduced-motion: no-preference) {
  @keyframes slide { ... }
}
.toast { animation: slide .2s; }
```

---

## 6. 📋 CODE QUALITY

### MEDIUM — Inconsistent Variable Declarations (`var` vs `let`/`const`)

The codebase mixes ES5 `var` (in all server-side functions except the first 190 lines) with ES6 `let`/`const`. Since `runtimeVersion: "V8"`, there's no reason to use `var`. This is a maintenance concern.

### MEDIUM — Duplicate Loop Pattern Repeated in Every Function

The pattern `readInputData_()` → loop over items → `calculateAmortization_()` → collect results is duplicated in 6+ functions:
- `runMonthEndAmortization()`
- `exportWideToSheet()`
- `getWidePreview()`
- `getSAPJEPreview()`
- `exportSAPJE()`
- `getDashboardData()`
- `getDocDetail()`

This violates DRY and makes the codebase harder to maintain. Each function processes all 3,979 items independently.

**Fix:** Extract a reusable `processItems(targetPeriod, maxItems)` helper that handles the loop, error isolation, and optional caching.

---

## 7. SUMMARY — Findings by Severity

| Severity | Count | Key Issues |
|---|---|---|
| **CRITICAL** | 4 | `ANYONE_ANONYMOUS`, `ALLOWALL` clickjacking, hardcoded sheet IDs, full amortization in dashboard |
| **HIGH** | 10 | No try-catch in core calc functions, blue-on-blue contrast fail, font sizes, focus indicators, no scope reduction, no CSRF, floating-point accumulation, GAS 6-min limit, no caching for expensive ops, repeated data reads |
| **MEDIUM** | 11 | Only 1 @media query, touch targets, toast timing, rounding setting unused, no LockService, date parsing, temp file accumulation, ARIA missing, reduced-motion, code duplication, `var`/`let` inconsistency |
| **LOW** | 4 | Email in comment, blank separator rows, stale trashed files, missing `<caption>` |

### Immediate Action Items (CRITICAL)

1. **Change `ANYONE_ANONYMOUS` to `DOMAIN` or add auth gate** — the app handles financial journal entries with real money amounts
2. **Remove `XFrameOptionsMode.ALLOWALL`** — prevent clickjacking
3. **Move sheet IDs to Script Properties** — secrets don't belong in source code
4. **Add try-catch inside item-level loops** — so one bad record doesn't crash all 3,979
5. **Cache `readInputData_()` results** — reduce API calls and execution time

---

*Review generated by automated code review process. All line numbers refer to files in `/tmp/prepaid-amort/`.*
