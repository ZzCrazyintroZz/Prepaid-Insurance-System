# UX/UI Review: Budget Bonus DEV vs. Prepaid Amort System

> **Reviewed:** Budget Bonus DEV (`/tmp/budget-ref/`)  
> **Reference:** Prepaid Amortization System (`/tmp/prepaid-amort/`)  
> **Files analyzed:** `index.html` (HTML+CSS), `app.html` (JS), `Code.gs` (backend)  
> **Date:** 2026-06-26

---

## Table of Contents

1. [SIDEBAR DESIGN](#1-sidebar-design)
2. [SYNC DATA PAGE](#2-sync-data-page)
3. [SAP EXPORT PAGES](#3-sap-export-pages)
4. [ADMIN CONSOLE](#4-admin-console)
5. [HELP/ABOUT PAGE](#5-helpabout-page)
6. [OVERALL UX PATTERNS](#6-overall-ux-patterns)
7. [WHAT LOOKS BETTER THAN AMORT SYSTEM](#7-what-looks-better-than-current-amort-system)
8. [SPECIFIC ISSUES & RECOMMENDATIONS](#8-specific-issues--recommendations)

---

## 1. SIDEBAR DESIGN

### 1.1 Colors & Tokens

```css
/* /tmp/budget-ref/index.html lines 15-23 */
:root {
  --bg:#080809;  --sf:#0E0E10;  --card:#111113;  --card2:#161618;
  --bdr:rgba(255,255,255,.07);
  --blue:#5888BB; --vi:#8070CC; --gn:#3A9F65; --am:#C9A96E;
  --rd:#B85252; --cy:#3A99A8; --pk:#B37090;
  --tx:#ECEBE6; --mt:#676460;
  --nav:228px; --hh:56px; --r:8px;
}
```

**Palette quality:** Excellent contrast ratio between `--bg` (#080809) and `--tx` (#ECEBE6). The amber/gold accent `--am:#C9A96E` is used consistently for active states, creating strong visual hierarchy. Six semantic colors (blue, violet, green, amber, red, cyan) cover all badge/chart needs.

**Amort comparison:** Amort uses `--gold:#C9A96E` with similar amber accent but has fewer semantic colors (5 vs. 7). Budget Bonus adds `--cy:#3A99A8` and `--pk:#B37090` which give more chart palette diversity.

### 1.2 Navigation Container

```css
/* lines 80-81 */
nav {
  width: var(--nav);           /* 228px desktop default */
  flex-shrink: 0;
  background: var(--sf);       /* #0E0E10 */
  border-right: 1px solid var(--bdr);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 8px 6px;
}
```

### 1.3 Navigation Group Headers

```css
/* lines 81-82 */
.ng {
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: var(--mt);            /* #676460 */
  padding: 12px 10px 4px;
  opacity: .65;
}
.ng:first-child { padding-top: 6px; }
```

**Section groups used:** "Overview" (2 items), "Data" (7 items), "SAP" (3 items), "Admin" (3 items), "Help" (1 item) — 16 nav items total across 5 groups.

**Amort comparison:** Amort has 8 nav items across 3 groups (Dashboard, Management, System). Budget Bonus has more items (16) but uses 5 groups, making it scannable. The `padding:12px 10px 4px` on `.ng` gives adequate breathing room before each section.

### 1.4 Navigation Item — Default State

```css
/* lines 83-84 */
.ni {
  display: flex;
  align-items: center;
  gap: 9px;                    /* Icon-label spacing */
  padding: 8px 10px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--mt);            /* Muted default */
  font-size: 12px;
  transition: all .10s;
  position: relative;
  letter-spacing: .01em;
  border: 1px solid transparent;
}
.ni:hover {
  background: rgba(255,255,255,.03);
  color: var(--tx);            /* Brighter on hover */
}
```

**Issues:**
- `.ni:hover` uses `rgba(255,255,255,.03)` — this is extremely subtle. On a `--sf` background (#0E0E10), the difference is nearly imperceptible even on high-brightness monitors. **Recommendation:** Increase to `rgba(255,255,255,.06)` or use `var(--card)` as hover background.
- `padding: 8px 10px` with `gap:9px` — the 10px horizontal padding is tight given `--nav:228px`. The icon (16px) + gap (9px) + text (variable) leaves about 193px for text which is fine for most labels.

### 1.5 Navigation Item — Active State

```css
/* lines 85-86 */
.ni.on {
  background: rgba(201,169,110,.08);       /* Amber at 8% */
  border-color: rgba(201,169,110,.14);     /* Amber border */
  color: var(--am);                        /* #C9A96E */
  font-weight: 500;
}
.ni.on::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  height: 60%;
  width: 2px;
  background: var(--am);                   /* Left accent bar */
  border-radius: 0 2px 2px 0;
}
```

**Excellent touch:** The `::before` left accent bar. However, `top:20%; height:60%` means the bar starts 20% from top and goes to 80%. This is a nice visual trick but could be improved with `inset` or better centering math.

**Amort comparison:** Both use identical `.on` active state styling — the Budget Bonus system copied this pattern from the Amort system. This is a strong pattern.

### 1.6 Navigation Icons

```css
/* line 87 */
.ic {
  font-size: 12px;
  width: 16px;                 /* Fixed width for alignment */
  text-align: center;
  flex-shrink: 0;
  pointer-events: none;        /* Prevents click on icon */
}
```

**Issues:**
- Icons are emoji/unicode text (◈, ⟳, 💹, 🏛, etc.), not SVGs or icon fonts. This means rendering varies across OS/browser. On Windows, many of these render as monochrome outlines; on macOS they render as color emoji. The visual inconsistency is noticeable.
- **Recommendation:** Use inline SVGs or a lightweight icon set (Feather, Lucide) for consistent rendering.

**Amort comparison:** Amort also uses emoji/unicode icons. Same issue present in both.

### 1.7 Responsive Behavior

```css
/* line 444 — 1024px */
@media(max-width:1024px) {
  :root{--nav:196px}
  .g4{grid-template-columns:repeat(2,1fr)}
  .bva-grid{grid-template-columns:repeat(3,1fr)}
}

/* lines 445-462 — 768px */
@media(max-width:768px) {
  :root{--nav:0px;--hh:50px}
  nav{display:none;position:fixed;top:var(--hh);left:0;bottom:60px;width:260px;z-index:200;
      background:var(--sf);border-right:1px solid var(--bdr);padding:12px 6px;box-shadow:4px 0 24px rgba(0,0,0,.4)}
  nav.open{display:flex}
  .nav-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:199}
  .nav-overlay.show{display:block}
  .hamburger{display:flex!important}
  #ct{padding:12px;padding-bottom:70px!important}
  .g4{grid-template-columns:repeat(2,1fr);gap:8px}
  .g3{grid-template-columns:repeat(2,1fr);gap:8px}
  .bva-grid{grid-template-columns:repeat(2,1fr);gap:8px}
  .bottom-nav{display:block}
  .btn{min-height:38px}
  .ni{min-height:44px}
}

/* lines 463-479 — 480px */
@media(max-width:480px) {
  :root{--hh:48px;--r:6px}
  #ct{padding:10px;padding-bottom:70px!important}
  .h-name{font-size:13px}.h-sub{display:none}
  .g4,.g3{grid-template-columns:1fr 1fr;gap:7px}
  .g2{grid-template-columns:1fr}
  .hero-val{font-size:32px}
  .co-cards{grid-template-columns:repeat(2,1fr)}
  .btn{min-height:38px}
}
```

**Issues:**
- `nav.open{display:flex}` should also set `flex-direction:column` explicitly. While flex defaults to row, the original `nav` has `flex-direction:column` from the base style, so mobile inherits it correctly — but only because `nav` itself has `display:flex` (which is overridden to `display:none` at mobile, then `display:flex` on `.open`). The `flex-direction:column` is inherited because the `.open` class is added to the same `nav` element. **This is correct but fragile** - a minor refactor could break it.
- `padding-bottom:70px!important` on `#ct` at mobile uses `!important` which is avoidable. Could use a CSS variable or calc pattern instead.
- `bottom:60px` on `nav` at mobile overlaps with the bottom nav bar. Good.
- `box-shadow:4px 0 24px rgba(0,0,0,.4)` on the mobile nav creates nice depth.

**Amort comparison:** Budget Bonus mobile breakpoints match Amort identically (1024px, 768px, 480px) with very similar CSS. The Budget Bonus version adds the `nav-bottom:60px` for bottom nav clearance which Amort also has.

### 1.8 Bottom Navigation (Mobile)

```css
/* lines 339-343 */
.bottom-nav {
  display:none;
  position:fixed; bottom:0; left:0; right:0;
  background:var(--sf);
  border-top:1px solid var(--bdr);
  z-index:100;
  padding:4px 0 env(safe-area-inset-bottom,6px);
}
.bn-items{display:flex;justify-content:space-around;align-items:center;padding:0 4px}
.bn-item{
  display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:7px 6px;cursor:pointer;color:var(--mt);font-size:9px;font-weight:500;
  transition:color .15s;min-width:58px;border-radius:6px;-webkit-tap-highlight-color:transparent
}
.bn-item.on,.bn-item:hover{color:var(--am)}
.bn-ic{font-size:18px;line-height:1}
```

**Issues:**
- `padding:4px 0 env(safe-area-inset-bottom,6px)` — good iOS notch support. But the desktop base rule uses `env()` which requires the device to support it. **Recommendation:** Add a `@supports(padding:env(safe-area-inset-bottom))` wrapper for forward compatibility only; as-is it's harmless since unknown env() values resolve to 0 in most browsers.
- Bottom nav only has 5 items (Dashboard, Bonus, CC, Budget, Sync). The sidebar has 16 items. This is a good curated subset for mobile but means 11 nav items are only accessible via the hamburger sidebar.

**Amort comparison:** Amort bottom nav also has 5 items (Dashboard, Amortization, SAP, Void, Settings). Budget Bonus replaces Amort/AP/Void with Bonus/CC/Budget — more relevant to the data-centric workflow.

---

## 2. SYNC DATA PAGE

### 2.1 Layout

**Structure (lines 566–641):**
```
#p-sync
  ├── Page header (ph): "Data Sync" + subtitle
  ├── Status bar (flex row): badge, date, record count, Sync button
  ├── Progress section (hidden initially)
  └── Grid (g3): 3 cards
      ├── Connection Info (card)
      ├── Auto-Sync (card with checkbox + interval select)
      └── Sync Log (card with logbox)
```

**Selector references:**
- Status bar: `#p-sync > div:first-of-type` — uses `display:flex;align-items:center;gap:10px;padding:14px 18px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--r)` — this is actually an inline `<div>` not a class, meaning it can't be reused.
- **Issue:** The status bar uses inline styles instead of a reusable class like `.status-bar`. 5 different style properties directly in the HTML.

### 2.2 Loading States

```javascript
// app.html lines 369-377
document.getElementById('s-prog').classList.remove('hidden');
document.getElementById('s-stat').innerHTML='<span class="badge b-am">● Syncing...</span>';
const setPb=(p,txt)=>{
  document.getElementById('pb').style.width=p+'%';
  document.getElementById('s-prog-txt').textContent=txt;
};
setPb(15,'Connecting...');
```

**Progress stages:**
1. **15%** — "Connecting..."
2. **40%** — "Fetching data..."
3. **80%** — "Processing..."
4. **100%** — "Done"

**Issues:**
- The progress bar uses arbitrary percentage values that don't reflect actual progress. These are "stages" not real progress. When data is large, the "Processing..." stage (80%) can take much longer than "Fetching data..." (40%). **Recommendation:** Use indeterminate animation (pulsing/indeterminate bar) for the data fetch phase, then switch to determinate for the processing phase.
- The progress bar hides after 800ms with `setTimeout`: `document.getElementById('s-prog').classList.add('hidden')`. If sync takes longer than 800ms to complete cleanup, the bar flickers.
- No error state on the progress bar itself — errors are handled by changing the status badge and showing a toast, not by updating the progress bar.

### 2.3 Data Display

```javascript
// app.html lines 415-425
document.getElementById('hdot').className=isLive?'dot g':'dot y';
document.getElementById('htxt').textContent=parsed.length.toLocaleString()+' records'+(isLive?' (Live)':'')+' · '+syncTs;
document.getElementById('s-stat').innerHTML=isLive
  ?'<span class="badge b-ok">● Live — '+result.method+'</span>'
  :'<span class="badge b-am">● Offline (embedded)</span>';
```

**Excellent pattern:** Three states clearly communicated:
- **Dot color:** green (live) / yellow (cached/offline) / red (error)
- **Status badge:** `b-ok` for live, `b-am` for offline, `b-er` for error
- **Text:** record count + source method + timestamp

**Connection info card** shows: Source name, API type (badge), sheet tab name, format description. All useful metadata but the sheet ID is not shown in the sync page — it's only visible in Admin Console.

### 2.4 Auto-Sync Section

```javascript
// app.html lines 2014-2055
function toggleAutoSync(){
  const on=document.getElementById('autoSyncEnabled').checked;
  localStorage.setItem('ptg_autosync',on?'1':'0');
  if(on)startAutoSync();else stopAutoSync();
  updateAutoSyncStatus();
}
function startAutoSync(){
  const min=parseInt(localStorage.getItem('ptg_autosync_min')||'15');
  stopAutoSync();
  autoSyncTimer=setInterval(()=>{if(!S.syncing){slog('info','Auto-sync triggered...');doSync();}},min*60*1000);
}
```

**Issues:**
- `autoSyncTimer` is a single global variable but `startAutoSync()` can be called multiple times before the first interval fires, leading to duplicate timers. The `stopAutoSync()` at the beginning mitigates this, but there's a race window.
- No polling indicator for when auto-sync fires — the user only sees the sync progress if they're on the dashboard when it fires.

**Amort comparison:** Amort doesn't have auto-sync functionality at all. This is a clear improvement.

---

## 3. SAP EXPORT PAGES

### 3.1 SAP Template Generator (lines 795-916)

**Form Layout (SAP section, lines 814-882):**

The form uses inline grid styles with `export-grid` patterns. Key sections:

1. **เลือกข้อมูล** — Company selector (custom dropdown) + Month (select)
2. **วันที่ & งวดบัญชี** — 3-column grid: DOC DATE, POST DATE, Fiscal Period
3. **รหัสบัญชี & อ้างอิง** — 3-column grid: GL Clearing, Profit Center, REF
4. **ข้อมูลเพิ่มเติม** — Business Type + Item Text

```css
/* Inline <style> in index.html lines 803-808 */
.sap-section-label {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: .12em; color: var(--am); margin-bottom: 10px;
  padding-bottom: 6px; border-bottom: 1px solid var(--bdr); opacity: .85;
}
.sap-input {
  width: 100%; padding: 8px 10px; background: var(--bg);
  border: 1px solid var(--bdr); border-radius: 5px; color: var(--tx);
  font-size: 12px; outline: none; transition: .12s; font-family: inherit;
}
.sap-input:focus { border-color: rgba(201,169,110,.35); }
.sap-label {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: .07em; color: var(--mt); margin-bottom: 5px; display: block;
}
```

**Issues:**
- The `.sap-section-label`, `.sap-input`, and `.sap-label` styles are defined in an inline `<style>` block inside `<div id="p-sap">` rather than in the main stylesheet. This means they're scoped to that page but also means they can't be reused in other form sections (like Pre-Upload Checker).
- **Recommendation:** Promote `.sap-input` and `.sap-label` to the main stylesheet as `.form-input` and `.form-label` for reuse across all form pages.

### 3.2 Company Selector (Custom Dropdown)

```javascript
// app.html lines 1480-1550
function toggleScoDD(){
  const dd=document.getElementById('scoDD');
  dd.style.display=dd.style.display==='none'?'block':'none';
}
```

**Issues:**
- The custom dropdown (`#scoDD`) is a styled `<div>` containing checkboxes. This is accessible but not keyboard-navigable — `Enter`/`Space` won't toggle checkboxes via native behavior since they're inside a click-to-show container.
- **Recommendation:** Add keyboard handlers (`keydown` events for Enter/Escape) for accessibility.
- The "select all" checkbox at top of dropdown (`togAllSco`) is a nice touch but doesn't have a "clear all" counterpart.
- **Outside click handler** (line 1544): Good pattern — closing dropdown when clicking outside the `#scoWrap` container. This uses `document.addEventListener('click', ...)` which works but could interfere with other click handlers.

### 3.3 Preview Table

```javascript
// app.html lines 1588-1594
const sapTW=document.getElementById('sapTW');
sapTW.innerHTML='<table style="font-size:10px;border-collapse:collapse;width:100%;overflow-x:auto"><thead><tr>'+
  SAP107_HDR.slice(0,20).map(h=>'<th style="border:1px solid var(--bdr);padding:2px 4px;background:var(--card2)">'+esc(h)+'</th>').join('')+'<th>...</th></tr></thead><tbody>'+
  rows.slice(0,10).map(r=>'<tr>'+r.slice(0,20).map(v=>'<td style="border:1px solid #333;padding:2px 4px">'+esc(String(v||''))+'</td>').join('')+'<td>...</td></tr>').join('')+'</tbody></table>';
```

**Issues:**
- Inline styles on table elements (`border:1px solid var(--bdr)`, `padding:2px 4px`, etc.) rather than using the existing `.stbl` CSS class defined at line 235-238.
- `overflow-x:auto` on the wrapping div is critical but it's set via inline style on `#sapTW` (line 913: `<div class="tw" style="max-height:320px" id="sapTW">`). The `.tw` class already has `overflow:auto` (line 149).
- Only 10 rows and 20 columns of 107 shown — good for preview. Missing column indicator `...` is clearly shown.

### 3.4 Validation & Button Placement

```html
<!-- lines 888-894 -->
<div style="display:flex;align-items:center;gap:8px;padding-top:4px;border-top:1px solid var(--bdr)">
  <button class="btn b-ghost" onclick="valSAP()">Validate</button>
  <button class="btn b-pri" onclick="prevSAP()">Preview</button>
  <button class="btn b-gn" onclick="genSAP()" id="btnG" disabled>⬇ Generate & Export</button>
  <div style="flex:1"></div>
  <span style="font-size:10px;color:var(--mt)">107 columns · Template_Intercom</span>
</div>
```

**Button hierarchy:**
1. **Validate** (ghost) — lighter weight, checks data completeness
2. **Preview** (primary/amber) — main action users take to inspect data
3. **Generate & Export** (green, disabled until validated) — final action, highest visual weight

**Issues:**
- `btnG` is disabled initially and only enabled after validation succeeds. Good guardrail pattern.
- But `valSAP()` automatically calls `prevSAP()` after validation (line 1567: `prevSAP();`). This means the user can't validate without previewing. Some users might want to validate first, review warnings, then preview. **Recommendation:** Let validation return results without auto-previewing, show validation results in `#sapVD`.
- The `#sapVD` validation results div exists (line 899) but `valSAP()` never populates it — it only calls `toast()` and `prevSAP()`.

**Amort comparison:** Amort has a simpler 2-button pattern (Preview + Export) without a separate Validate step. Budget Bonus adds dedicated validation which is better for preventing errors.

### 3.5 Per-Company Config (Multi-Company)

```javascript
// app.html lines 1501-1521
function renderCoConfig(sel){
  if(sel.length<=1){wrap.innerHTML='';return;}
  // Shows a table of GL/PC/BZ per selected company
}
```

**Excellent feature:** When multiple companies are selected, a per-company configuration table appears. This is critical because different companies have different GL accounts.

**Issues:**
- The per-company config inputs use inline styles (`background:#0d1017;border:1px solid var(--bdr)`) instead of the `.sap-input` class.
- The config warning message `"⚠ แต่ละ Company ใช้ GL Clearing / Profit Center ต่างกัน"` uses hardcoded Thai — no i18n.

### 3.6 SAP Export History (lines 948-957)

The history page is simple: a table showing past exports with file names, dates, record counts, and upload status.

**Issues:**
- No search/filter on the history table.
- "ยังไม่มีประวัติ" (no history) placeholder uses inline style: `<div style="padding:40px;text-align:center;color:var(--mt)">`.

---

## 4. ADMIN CONSOLE

### 4.1 Layout (lines 960-1009)

```
#p-admin
  ├── Page header: "⚙ Admin Console"
  ├── Row 1: Status KPIs (g4) — Connection, Records, Last Sync, Storage
  ├── Row 2: Quick Actions + System Config (g2 cards)
  ├── Row 3: Local Cache + Recent Audit (g2 cards, flex:1)
```

### 4.2 KPI Cards

```javascript
// app.html lines 2148-2154
document.getElementById('admStatus').textContent=d.length?'🟢 Live':'🟡 Waiting';
document.getElementById('admRecs').textContent=d.length.toLocaleString();
document.getElementById('admSync').textContent=lastSync?lastSync.ts:'—';
document.getElementById('admStore').textContent=storage+'KB';
```

**Issues:**
- The status KPI "🟢 Live" vs "🟡 Waiting" uses emoji as indicator — mixed with `--kc:var(--gn)` CSS border accent. Two indicators for the same thing (emoji + colored border).
- `admSync` (last sync) only finds the last log entry containing '✓'. If the last sync was an error, this shows "—". **Recommendation:** Store the last sync timestamp explicitly rather than parsing logs.

### 4.3 Quick Actions

```html
<!-- lines 974-979 -->
<button class="btn b-pri" onclick="exportPDF()">📄 Dashboard Report</button>
<button class="btn b-ghost" onclick="exportBonusPDF()">💹 Bonus Data</button>
<button class="btn b-ghost" onclick="exportBVAPDF()">📊 Budget vs Actual</button>
<button class="btn b-ghost" onclick="doSync()">⟳ Force Sync</button>
<button class="btn b-ghost" onclick="admClearLog()">🗑 Clear Audit Log</button>
<button class="btn b-ghost" onclick="admReset()">🔄 Reset Dashboard</button>
```

**Issues:**
- "Dashboard Report" has `b-pri` (amber/primary) while everything else is `b-ghost`. No clear visual distinction between safe actions (export PDF) and destructive actions (Clear Audit Log, Reset Dashboard).
- **Recommendation:** Destructive actions (admReset, admClearLog) should use `b-rd` (red) styling to signal caution.

### 4.4 System Config

```javascript
// app.html lines 2155-2159
document.getElementById('admSheet').textContent=typeof SHEET_ID!=='undefined'?SHEET_ID:'—';
document.getElementById('admApi').textContent=typeof GAS_URL!=='undefined'?GAS_URL:'—';
document.getElementById('admEnv').textContent=env;
```

**Issues:**
- The API URL is shown as full text in a cell with `max-width:260px;overflow:hidden;text-overflow:ellipsis` (line 991). Long URLs are truncated without any way to copy them. **Recommendation:** Add a "copy to clipboard" button for the API URL.
- The config is read-only display with no way to modify it from the UI. If a user needs to change the Sheet ID, they must edit Code.gs.

### 4.5 Local Cache & Audit Preview

```javascript
// app.html lines 2164-2182
const keys=Object.keys(localStorage);
const adDetails=keys.map(k=>{
  const v=localStorage.getItem(k)||'';
  const sz=((new Blob([v]).size)/1024).toFixed(1);
  return `<div>${k} — ${sz}KB</div>`;
}).join('');
```

**Issues:**
- The cache panel shows ALL localStorage keys including potentially sensitive cached data.
- No way to clear individual cache entries — only full dashboard reset clears everything.
- The `Blob` size calculation doesn't account for UTF-8 multi-byte characters accurately (Blob uses UTF-8, but `new Blob([string])` gets the byte length correctly in modern browsers — **this is actually correct**).

---

## 5. HELP/ABOUT PAGE

### 5.1 Content Structure (lines 1028-1071)

**Sections:**
1. **Getting Started** — 3-step setup (Sync, Dashboard, Filter)
2. **Menu Overview** — 14 menu items with descriptions
3. **SAP Template Generator** — Step-by-step guide
4. **Multi-Company** — How to export multiple companies
5. **Batch Split** — 900-row batch limit explained
6. **Tips & Tricks** — Dark/Light mode, Mobile, Global Search, CC Notes, Print

**Issues:**
- Content is hardcoded in Thai with inline HTML. No dynamic content loading.
- The `.at-row` class (used for account type rows) is reused here for content rows. This is a semantic mismatch — `at-row` means "account type row" but it's used for "getting started steps" and "menu items". **Recommendation:** create a `.help-row` class.
- No expandable/collapsible sections — all content is visible at once. For a 14-item menu overview, this creates a very long page.
- No "About" section — version info, build date, or team info is missing. The README has this info but it's not accessible from within the app.

**Amort comparison:** Amort's help page is simpler (fewer sections) and doesn't include a menu overview. Budget Bonus's help page is more comprehensive but harder to scan.

### 5.2 Print Stylesheet

```css
/* line 441 */
@media print {
  nav,header,#toast,button{display:none!important}
  #ct,#main,#app,body{overflow:visible!important}
}
```

**Very minimal print styles.** Only hides nav, header, toasts, and buttons. Doesn't:
- Remove backgrounds/colors to save ink
- Adjust font sizes for readability on paper
- Add page breaks between sections
- Remove the `.bottom-nav`

---

## 6. OVERALL UX PATTERNS

### 6.1 Toasts

```css
/* lines 269-271 */
#toast{position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:5px}
.tm{background:var(--card2);border:1px solid var(--bdr);border-left:2px solid var(--am);padding:9px 14px;border-radius:5px;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,.4);animation:si .2s ease;min-width:180px}
.tm.ok{border-left-color:var(--gn);color:var(--gn)}
.tm.er{border-left-color:var(--rd);color:var(--rd)}
```

```javascript
// app.html line 1129
function toast(msg,type){
  const t=document.createElement('div');
  t.className='tm '+(type||'');
  t.textContent=msg;
  document.getElementById('toast').appendChild(t);
  setTimeout(()=>t.remove(),3000);
}
```

**Excellent pattern:** Simple, effective toast system. Key features:
- **Position:** Bottom-right, a stack (flex column on `#toast` container)
- **Duration:** 3 seconds auto-dismiss
- **States:** Default (amber left border), `.ok` (green), `.er` (red)
- **Animation:** `si` keyframe — slide in from right (opacity 0, translateX 10px → opacity 1, translateX 0)

**Issues:**
- No toast dismissal on click (user must wait 3 seconds or refresh)
- Multiple toasts stack but there's no limit — if sync spams toasts, the stack grows unbounded
- No accessibility attributes — toasts aren't announced to screen readers

### 6.2 Modals

```css
/* lines 325-327 */
.modal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
.modal-box{background:var(--card2);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.5);animation:fadeIn .2s ease;width:90%;max-width:1100px;max-height:85vh;overflow-y:auto}
```

```javascript
// app.html lines 1263-1281
function showAlertModal(){
  // Builds modal inner HTML
  const html=`<div class="modal" onclick="closeModal()">
    <div class="modal-box" onclick="event.stopPropagation()" style="...">
      <!-- content -->
    </div>
  </div>`;
  document.getElementById('modals').innerHTML=html;
}
function closeModal(){document.getElementById('modals').innerHTML='';}
```

**Issues:**
- Modals are rendered as HTML strings to `#modals.innerHTML`, not created as DOM elements. This means any event listeners on the content are lost when the modal is opened again. The modal in `showAlertModal()` uses inline `onclick` attributes so it works, but this is fragile.
- No keyboard handling — Escape doesn't close the modal.
- No focus trapping — Tab navigation can continue behind the modal.
- Multiple modals can't stack — the second one replaces the first.
- `align-items:flex-start` means the modal box is at the top of the viewport rather than vertically centered. Long modals are scrollable within the container which is good, but short modals look top-heavy.
- **Recommendation:** Use `align-items:center` for default modal centering.

### 6.3 Confirmation Dialogs

```javascript
// app.html line 2194
function admReset(){
  if(!confirm('Reset dashboard? Cache + filters will clear.'))return;
  // ...
}
```

**Issues:**
- Uses the native `confirm()` dialog which looks completely different from the app theme. On some browsers (Chrome on macOS), it's a strip at the top of the page; on others (Firefox), it's a centered dialog. Very inconsistent.
- **Recommendation:** Build a custom confirmation modal matching the app theme, with button styling that differentiates confirm (red/destructive) from cancel (ghost).

### 6.4 Loading Indicators

**Skeleton Loading** (lines 205-216):
```css
@keyframes skel{0%{opacity:.4}50%{opacity:.7}100%{opacity:.4}}
.skel{animation:skel 1.4s ease-in-out infinite;background:var(--bdr);border-radius:4px}
.skel-hero{height:48px;width:180px}
.skel-sub{height:14px;width:300px}
.skel-chart{height:130px;width:100%}
```

**Issues:**
- Two separate skeleton systems exist: `.skel-*` (lines 205-216) and `.skeleton-*` (lines 330-336). The `.skeleton` class uses `linear-gradient(90deg, var(--card), var(--card2), var(--card))` with a `shimmer` animation — a much nicer effect than the simple opacity pulse of `.skel`.
- **Recommendation:** Remove the `.skel` system and use only `.skeleton` (shimmer) for consistency.
- The skeleton rendering in JavaScript (lines 80-99) uses `.skel` classes but the shimmer system is only defined in CSS with no JS usage.

**Sync Loading (Progress Bar)** (lines 201-203):
```css
.pw{height:2px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;margin-top:7px}
.pb{height:100%;background:var(--am);border-radius:2px;transition:width .4s}
```

2px height with amber color — subtle and elegant. The `transition: width .4s` smooths the progress bar animation.

### 6.5 Pull-to-Refresh (Mobile)

```javascript
// app.html lines 1286-1326
ctEl.addEventListener('touchstart', e=>{ ... });
ctEl.addEventListener('touchmove', e=>{ ... });
ctEl.addEventListener('touchend', ()=>{
  if(ptrActive){
    el.classList.add('syncing');
    doSync().finally(()=>{
      el.classList.remove('active','syncing');
    });
  }
});
```

**Issues:**
- The pull-to-refresh only tracks the `#ct` element. If the user touches the header or sidebar, the touch events won't fire. On mobile, the content div `#ct` is padded to `70px` from bottom due to bottom nav, but the top offset starts at `--hh` (50px mobile). This is correct.
- `passive:true` on all listeners — good for scroll performance but means `preventDefault()` can't cancel the native pull-to-refresh in some browsers. On iOS Safari, the native pull-to-refresh might conflict.
- No rotation lock — if the user rotates the device, the `touch` events may fire incorrectly.

### 6.6 Section Cache (Phase 1)

```javascript
// app.html lines 307-336
function readSectionCache(page){
  var c=JSON.parse(localStorage.getItem('ptg_sec_'+page));
  if(c&&c.ts&&c.html&&(Date.now()-c.ts)<3600000){
    document.getElementById('p-'+page).innerHTML=c.html;
    return true;
  }
  return false;
}
```

**Issues:**
- Caches raw HTML of `#p-dash` and `#p-bonus` sections. This saves the rendered content including chart canvases (which lose their Chart.js instances on reload).
- On cache hit, the `go()` function calls the rendering function again anyway (lines 1091-1096): `if(readSectionCache(p)){ setTimeout(function(){ if(p==='dash')rendDash(); ... },50); }`. This essentially re-renders the section on top of the cached HTML, which means the cache gives no performance benefit — it actually adds overhead.
- **Recommendation:** Either use the cache alone (skip re-render on cache hit) or remove the section cache system entirely since the main data cache (`ptg_bonus_data`) serves the same purpose more effectively.

### 6.7 Role System

```javascript
// app.html lines 2058-2073
function isViewer(){return S.isAdmin===false;}
function toggleRole(){ ... }
```

The role toggle controls whether admin-only features (sync button, CC editing, import, draft, approve, reset) are visible. Uses CSS `viewer-hide` class:
```css
/* line 361 */
.viewer-mode .viewer-hide{display:none!important}
```

**Issues:**
- The class `viewer-hide` only hides elements visually. The JS functions (`draftCC`, `approveCC`, `bulkImportCC`, `admClearLog`, `admReset`) all check `isViewer()` and reject with a toast. This is good defense-in-depth.
- But the toast messages are not localized consistently: "⛔ Viewer: ไม่สามารถ Sync ข้อมูลได้" (Thai) vs. "⛔ Viewer: ไม่ได้" (short for Reset). **Recommendation:** Standardize error messages.

### 6.8 Light/Dark Mode Toggle

```css
/* lines 374-438 */
.light-mode{
  --bg:#F2F0EC; --sf:#F8F7F4; --card:#FFFFFF; --card2:#EDEBE6;
  --bdr:rgba(0,0,0,.10); --tx:#1A1917; --mt:#8E8B83;
  --blue:#3B70A0; --vi:#5D4D9A; --gn:#2B7A50; --am:#9A7230; --rd:#922222; --cy:#1B6A75;
  --shadow:0 2px 12px rgba(0,0,0,.06);
}
```

**Excellent:** Full light mode with adjusted colors for ALL components. 37 `.light-mode` overrides covering backgrounds, borders, scrollbars, inputs, boxes, badges, alerts, skeletons, shadows, and more.

**Issues:**
- Light mode uses `!important` on 3 selectors (lines 385, 434). These should be avoided with proper specificity.
- Theme toggle rerenders all charts (lines 1157-1164), which is correct because Chart.js canvas colors are set at render time and don't respond to CSS variables.

**Amort comparison:** Amort also has a light/dark toggle with about 20 overrides. Budget Bonus has 37 — more thorough.

---

## 7. WHAT LOOKS BETTER THAN CURRENT AMORT SYSTEM

### 7.1 Improvements to Adopt

| Feature | Budget Bonus DEV | Prepaid Amort | Winner |
|---------|-----------------|---------------|--------|
| **Number of semantic colors** | 7 (blue, vi, gn, am, rd, cy, pk) | 5 (blue, vi, gn, gold, rd) | **Bonus** — richer chart palette |
| **Light mode overrides** | 37 selectors | ~20 selectors | **Bonus** — more complete |
| **Auto-sync** | Interval-based auto-refresh | None | **Bonus** |
| **Global search** | Search CC, Company, Department across all data | None | **Bonus** |
| **SAP validation step** | 3-step flow: Validate → Preview → Export | 2-step: Preview → Export | **Bonus** — catch errors earlier |
| **Multi-company config** | Per-company GL/PC/BZ override | Single-company only | **Bonus** |
| **Pull-to-refresh** | Touch gesture for mobile sync | None | **Bonus** |
| **Progress bar with stages** | Multi-stage sync progress | None | **Bonus** |
| **Section cache** | HTML content caching for Dashboard/Bonus | None | **Bonus** — but needs optimization |
| **Column visibility toggles** | Per-column show/hide in Bonus Data table | Fixed columns | **Bonus** |
| **Notification sound** | Web Audio API ping on sync complete | None | **Bonus** |
| **Cache-first loading** | Instant load from localStorage while syncing | Loads from GAS every time | **Bonus** |
| **Alert system** | Budget alerts for high-value CCs | None | **Bonus** |
| **Anomaly detection** | ±30% deviation detection per CC | None | **Bonus** |
| **Data validation page** | 4 checks: format, dup, dept, negatives | Checker exists but is less comprehensive | **Bonus** |
| **Pre-upload checker** | 5 checks before SAP upload | Similar checker exists | Tie |
| **Bottom nav items** | 5 (Dash, Bonus, CC, Budget, Sync) | 5 (Dash, Amort, SAP, Void, Settings) | Tie — different focus |
| **Drill-down overlays** | Click-driven company/month/CC drill-downs | None | **Bonus** |
| **Badge variations** | 6 badge classes (b-ok, b-er, b-bl, b-am, b-vi, b-gn) | 3 badge classes (pass, warn, fail) | **Bonus** |
| **Toast system** | 3-state animated toasts | Similar toast system | Tie |
| **Form input styling** | `.sap-input` with focus states | Similar `input` styling | Tie |

### 7.2 Specific Patterns Budget Bonus Does Better

1. **Company Cards (Dashboard):** The `.co-cards` grid shows each company with total, BU, percentage bar. Amort has no equivalent — it shows text KPI cards only. The horizontal bar at the bottom of each company card (`co-bar`) with dynamic width is excellent.

2. **Export Calendar:** The `.xcal` table showing company × month export status is superior to Amort's simpler export status display. Color coding (green = done, gray = not exported) with click-to-drill-down makes it highly actionable.

3. **Hero Section:** The dashboard hero with `font-size:56px` total value, chips, and clickable BVA chart gives immediate at-a-glance understanding. Amort's dashboard hero is more compact (smaller font) and less impactful.

4. **Budget vs Actual comparison:** `.bva-card` cards per month with progress bars, color-coded over/under, shown alongside the summary chart. Amort has BVA but displayed differently (chart only, no individual month cards).

5. **Anomaly Detection with visual indicators:** Individual row highlighting in Bonus Data table (`.anomaly-row`), clickable filter controls, KPI strip at top. Amort has no anomaly detection.

6. **Data Validation badge in sidebar:** The `#valBadge` shows pass/fail status directly in the sidebar navigation. Amort doesn't surface data quality at the nav level.

7. **Global Search**: The header-based search that searches CC, Company, and Department simultaneously is absent in Amort.

### 7.3 What Amort Does Better

| Feature | Prepaid Amort | Budget Bonus DEV | Winner |
|---------|---------------|-----------------|--------|
| **PDF export** | Uses html2canvas + jsPDF for styled PDFs | Uses window.print() only | **Amort** — better quality |
| **Form field consistency** | All form inputs use single `.input` class | Inconsistent: `.sap-input`, `.chk-f select`, inline styles | **Amort** |
| **Error state styling on inputs** | Red border on all invalid inputs | Only `.ei.err` for editable CC cells | **Amort** |
| **Footer with branding** | Custom footer in PDF/print | None | **Amort** |
| **JS modularity** | Functions grouped with clear comments | Functions are interleaved | **Amort** |
| **Single skeleton system** | One shimmer-based system | Two skeleton systems (`.skel` + `.skeleton`) | **Amort** |

---

## 8. SPECIFIC ISSUES & RECOMMENDATIONS

### 8.1 Critical Issues

| # | Issue | Location | Severity | Recommendation |
|---|-------|----------|----------|----------------|
| 1 | Two skeleton loading systems | CSS lines 205-216 and 330-336 | Medium | Consolidate into single shimmer system |
| 2 | Section cache re-renders on cache hit | app.html lines 1091-1096 | Medium | Cache is wasted — either skip re-render or remove cache |
| 3 | `!important` in 3 light-mode rules | CSS lines 385, 434 | Low | Use increased specificity instead |
| 4 | Modal lacks Escape key handler | app.html showAlertModal() | Low | Add `document.addEventListener('keydown', ...)` |
| 5 | Page header icons are emoji (OS-dependent) | All `.ic` elements | Low | Use inline SVGs or icon font |
| 6 | Light mode `!important` on inputs | CSS line 385 | Medium | Replace with `.light-mode input` selector chain |

### 8.2 Recommendations for Priority Changes

**P1 — UX Consistency:**
- Promote `.sap-input`/`.sap-label` to main stylesheet as `.form-input`/`.form-label`
- Consolidate `.skel` and `.skeleton` into one shimmer system
- Remove redundant section cache logic or fix it to skip re-render on cache hit

**P2 — Polish:**
- Increase nav hover opacity from 3% to 6% for better visibility
- Add custom confirmation dialog instead of native `confirm()`
- Add keyboard handlers for modal (Escape to close) and custom dropdowns
- Add search/filter to Export History
- Show copy-to-clipboard for API URL in Admin Console

**P3 — Accessibility:**
- Add `role="alert"` and `aria-live="polite"` to toast container
- Ensure tab navigation follows visual order in modals
- Add `aria-expanded` on mobile hamburger button

### 8.3 CSS Audit: Unused/Redundant Selectors

| Selector | Location | Status |
|----------|----------|--------|
| `.spin` | line 362 (empty class) | **Unused** — only `@keyframes spin` is used |
| `.viewer-hide` | line 361 | Used — via `.viewer-mode` parent |
| `.g{}.y{}.r{}.on{}.ok{}.er{}.active{}.open{}.show{}.pass{}.fail{}.admin{}.viewer` | lines 362 | **All empty classes** — these are CSS class placeholders with no rules. They're vestigial and only used generically in JS. Should be removed. |
| `.page-flex` | lines 363-365 | Used for bonus page and anomaly page flex layout |

---

## Summary

**Budget Bonus DEV** is a significant evolution beyond the **Prepaid Amort System** in terms of:
- **Feature density:** 16 nav items vs. 8, covering sync management, SAP export pipeline, data validation, anomaly detection, and admin tools
- **UX sophistication:** Drill-down overlays, pull-to-refresh, auto-sync, notification sounds, cache-first loading, multi-company SAP config
- **Visual polish:** Richer color palette, 37 light-mode overrides, more badge variants, consistent active-state patterns
- **Data quality:** Explicit validation, anomaly detection, budget alerts, pre-upload checks — all surfaced to the user

Both systems share the same CSS architecture (CSS custom properties, dark/light mode, amber accent, same responsive breakpoints) which confirms they came from the same design system. Budget Bonus benefits from more iterations and features.

**File created:** `/tmp/prepaid-amort/budget-analysis-reviewer.md`
