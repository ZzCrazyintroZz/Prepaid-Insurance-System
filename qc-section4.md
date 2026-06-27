# QC Section 4: Sync + Import + Admin + Settings + Audit + Guide + Navigation

## 1. Sync (app.html)

| Test | Result | Evidence |
|------|--------|----------|
| `loadSyncData()` → calls `getSyncStatus()` | **PASS** | Line 2656: `}) .getSyncStatus();` |
| `syncNow()` → calls correct backend function | **PASS** | Line 2669: `}) .syncData();` (back-end `syncData()` exists in Admin.gs:295) |
| `syncImportQuickPreview()` → calls `getImportPreview()` | **PASS** | Line 2965: `}) .getImportPreview(csvText);` |

## 2. Import (app.html + Import.gs)

| Test | Result | Evidence |
|------|--------|----------|
| `importPreview()` → calls `getImportPreview()` which calls `parseCSVData()` | **PASS** | app.html:2694 → `.getImportPreview(csvText)`. Import.gs:163 → `var parsed = parseCSVData(csvText)` inside `getImportPreview()`. Chain is intact. |
| `confirmImport()` → calls backend `confirmImport()` | **PASS** | app.html:2873 → `.confirmImport(_importCsvText, columnMapping)` (backend function exists in Import.gs:317) |
| `loadImportHistory()` → calls `getImportHistory()` | **PASS** | app.html:2912 → `}) .getImportHistory();` (backend function exists in Import.gs:572) |

## 3. Admin Console (app.html)

| Test | Result | Evidence |
|------|--------|----------|
| `loadAdminConsole()` → `batchCall()` works | **PASS** | Lines 2977-2989: `batchCall(['getSystemInfo', 'getTriggerStatus', 'getEmailConfig'], callback, errorCallback)` |
| `_renderAdminConsole()` function exists | **PASS** | Line 2991: `function _renderAdminConsole(results) {` |
| `_adminCache` in-memory cache pattern | **PASS** | Line 2969: `var _adminCache = null;` Line 2972-2974: check cache, return early. Line 2980: `_adminCache = results;` Line 2984: auto-invalidate after 60s. |
| `clearCache()` → calls backend which calls `invalidateAllCaches()` | **PASS** | app.html:3035 → `.clearCache()`. Admin.gs:346-348: `function clearCache() { try { invalidateAllCaches();` — chain is intact. |
| `toggleTrigger()` → install/remove trigger | **PASS** | Lines 3071-3072: determines `actionFn = isInstalling ? 'installMonthlyTrigger' : 'removeMonthlyTrigger'`. Line 3090: `}) [actionFn]();` |
| `saveEmailConfig()` → correct backend call | **FAIL** | Line 3117: calls `.saveDashboardConfig(cfg)` — **TWO BUGS**: (1) Variable `cfg` is undefined (should be `config`), (2) Function name is `saveDashboardConfig` instead of `saveEmailConfig`. Backend `saveEmailConfig(config)` exists at Admin.gs:380. The success toast at line 3114 also says "Dashboard config saved" instead of "Email config saved". |
| `sendTestEmail()` → correct backend call | **PASS** | Line 3137: `}) .sendTestEmail();` (backend function exists in Admin.gs:552) |

## 4. Settings (app.html)

| Test | Result | Evidence |
|------|--------|----------|
| `loadSettings()` → calls `getSettings()` | **PASS** | Line 2168: `}) .getSettings();` |
| `saveSettings()` → calls `saveSettings()` | **PASS** | Line 2188: `}) .saveSettings(settings);` |
| `ClientSideCache` (PACache) cache-first pattern | **PASS** | Lines 2148-2157: checks `ClientSideCache.get('settings')`, returns early with cached data if found. Only calls backend on cache miss. |
| Cache invalidated on save via `ClientSideCache.remove('settings')` | **PASS** | Lines 2183-2184: `PACache.invalidateType('settings'); ClientSideCache.remove('settings');` — both PACache and ClientSideCache are cleared. |

## 5. Audit (app.html)

| Test | Result | Evidence |
|------|--------|----------|
| `loadAuditLog()` → calls `getAuditLog()` | **PASS** | Line 3173: `}) .getAuditLog();` (backend function exists in Admin.gs:676) |
| `auditBody` table element exists | **PASS** | Line 1103: `<tbody id=\"auditBody\">` defined in section template. Also referenced in Lines 3170, 3172, 3176, 3519. |

## 6. Guide (app.html)

| Test | Result | Evidence |
|------|--------|----------|
| `loadGuide()` → calls `getUserGuideData()` | **PASS** | Line 2143: `}) .getUserGuideData();` (backend function exists in Admin.gs:38) |
| `ClientSideCache` cache-first pattern | **PASS** | Lines 2080-2083: checks `ClientSideCache.get('guide')`, returns early with cached HTML if found. |
| Cache duration = 1800s | **PASS** | Line 2140: `ClientSideCache.set('guide', html, 1800);` — 1800 seconds = 30 minutes. |

## 7. Navigation (app.html)

| Test | Result | Evidence |
|------|--------|----------|
| `go()` uses `_domCache.sections/navItems/bnItems` | **PASS** | Lines 1233-1255: iterates `_domCache.sections`, `_domCache.navItems`, and `_domCache.bnItems` (cached DOM references). |
| `LazySectionLoader.loadSection()` — no `setTimeout(0)` for previously-loaded sections | **PASS** | Line 1127-1129: if `loadedSections[sectionName]` is true, returns `Promise.resolve()` immediately without calling `callInitFunction` (which uses `setTimeout(0)` at line 1179). However, the **sectionContentCache** path (line 1136-1144) does still call `callInitFunction` with `setTimeout(0)` on first cache hit — but this is a one-time cost. |
| `isLoaded()` check used in `go()` to avoid redundant lazy loads | **PASS** | Line 1265: `if (p !== 'dashboard' && typeof LazySectionLoader !== 'undefined' && !LazySectionLoader.isLoaded(p))` — only lazy-loads if not already loaded. |
| `_refreshDomCache()` called periodically | **PASS** | Line 1216-1222: function defined. Line 1229: `if (!_domCache.sections || Math.random() < 0.01) _refreshDomCache();` — called on cache miss or probabilistically (~1% per navigation). Comment says "every 10th call" but actual implementation uses Math.random() < 0.01 (≈1% chance). |

---

## Summary

| Section | Pass | Fail | Notes |
|---------|------|------|-------|
| 1. Sync | 3/3 | 0 | Clean |
| 2. Import | 3/3 | 0 | Clean |
| 3. Admin Console | 6/7 | **1** | `saveEmailConfig()` has wrong function name (`saveDashboardConfig`) and undefined variable `cfg` at line 3117 |
| 4. Settings | 4/4 | 0 | Clean |
| 5. Audit | 2/2 | 0 | Clean |
| 6. Guide | 3/3 | 0 | Clean |
| 7. Navigation | 4/4 | 0 | Clean (minor: 10th call comment vs 1% prob) |

**Total: 25/26 PASS, 1 FAIL**

### Critical Bug Found

**saveEmailConfig()** (app.html:3117): Calls `google.script.run...saveDashboardConfig(cfg)` instead of `saveEmailConfig(config)`. The variable `cfg` is undefined (symbol never declared), and the backend function is `saveEmailConfig` (Admin.gs:380), not `saveDashboardConfig`. This will throw a ReferenceError at runtime if the user clicks "Save Config" in the Email Notifications section. The success toast also incorrectly says "Dashboard config saved".
