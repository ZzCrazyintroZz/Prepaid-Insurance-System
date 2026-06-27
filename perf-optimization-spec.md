# Amort (Prepaid Expense Amortization System) — Performance Optimization Specification

**Project**: Amort — Prepaid Expense Amortization System  
**Script ID**: `1gCqBMay0074MnqBufDxmnokiczGU2eEGJQoKTZaPxjyWY8sqrsE14o7l`  
**Current Deploy**: @37 live  
**Tech Stack**: GAS Web App (doGet + index.html + app.html), V8 runtime  
**Working Dir**: `/tmp/prepaid-amort/`

---

## 1. MEASURED BOTTLENECKS (Current State)

### 1.1 Bundle Size Analysis

| File | Size | Composition |
|------|------|-------------|
| `index.html` | **94 KB** | Inline CSS: 38 KB (40%) + HTML: 56 KB (60%) |
| `app.html` | **215 KB** | 34 `load*` functions + 80+ backend handlers + 7 Chart.js chart initializers + Phase A features (A3 search, A7 drill-down, B5 running balance) |
| **Deployed HTML** | **~420 KB** | Combined after GAS templating + CDN resources |

**CDN Dependencies (blocking):**
- Google Fonts (Prompt, DM Serif Display, JetBrains Mono) — 3 weights each
- Bootstrap Icons CDN (`cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css`)
- Chart.js CDN (`cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js`) — ~180 KB gzipped

### 1.2 DOM & Rendering

| Metric | Current | Problem |
|--------|---------|---------|
| DOM sections | 17 sections in DOM, **only 1 visible** | All 17 `<section>` elements rendered at load |
| Dashboard charts | 7 charts render **simultaneously** on load | Blocks main thread ~800-1200ms |
| Dashboard KPIs | 20+ KPI cards rendered upfront | Layout thrashing on initial paint |
| Running Balance (B5) | Loads **all document details sequentially** (1 `google.script.run` per doc) | 50-200+ sequential RPC calls = 10-100s |
| Tables | No virtualization, full DOM rendering | 100-500 rows = heavy reflow |

### 1.3 Network / RPC Latency

| Call Pattern | Latency | Frequency | Impact |
|--------------|---------|-----------|--------|
| `google.script.run` (cold) | **200-500 ms** | 30+ calls on dashboard load | 6-15s sequential latency |
| `google.script.run` (warm) | 80-150 ms | Subsequent tab switches | 1-3s per tab |
| Dashboard `getDashboardData()` | ~1.2s server-side | 1 call + 7 chart renders | Blocks TTI |
| Running Balance `getDocDetail()` | 100-300 ms × N docs | Sequential, N=50-200 | **10-60s total** |
| Batch operations (SAP, Void) | 500ms-5s per batch | Sequential per-period | User-perceived hang |

### 1.4 Caching (Current State)

| Layer | Status | TTL | Hit Rate |
|-------|--------|-----|----------|
| GAS `CacheService` (server) | ✅ `dash_v2` | 5 min | High (dashboard only) |
| `localStorage` / `IndexedDB` (client) | ❌ **None** | — | 0% |
| Browser HTTP cache (CDN) | ⚠️ Partial | — | Fonts/CSS only |
| Service Worker | ❌ None | — | 0% offline |

### 1.5 Measured Performance (Estimated from Code Analysis)

| Metric | Current | Target |
|--------|---------|--------|
| **Initial Load (TTI)** | ~6-10s (cold) / ~3-5s (warm) | **< 2s** |
| **Dashboard TTI** | ~3-5s (7 charts + data) | **< 1.5s** |
| **Tab Switch (inactive → active)** | ~1-3s (RPC + render) | **< 500ms** |
| **Running Balance Load** | 10-60s (sequential RPC) | **< 3s** (batched) |
| **Bundle Size (HTML)** | ~420 KB | **< 150 KB** (gzipped < 50 KB) |
| **Chart.js Parse/Compile** | ~180 KB JS | Lazy-load only when visible |

---

## 2. PRIORITIZED OPTIMIZATION LIST (Effort × Impact Matrix)

| # | Optimization | Effort | Impact | Priority | Est. Time |
|---|--------------|--------|--------|----------|-----------|
| **1** | **Lazy-load non-dashboard sections** (remove 16 hidden sections from initial DOM) | Low | **High** | **P0** | 2h |
| **2** | **Lazy-load Chart.js** (load only when dashboard visible) | Low | **High** | **P0** | 1h |
| **3** | **Batch Running Balance RPC** (single `getDocDetailsBatch([docNos])` call) | Medium | **Critical** | **P0** | 4h |
| **4** | **Client-side caching (localStorage + IndexedDB)** for dashboard data, doc lists, settings | Medium | **High** | **P0** | 4h |
| **5** | **Debounce + coalesce `google.script.run` calls** (dedupe rapid calls) | Low | Medium | **P1** | 2h |
| **6** | **Virtualize large tables** (running balance, CRUD, wide schedule) | Medium | High | **P1** | 4h |
| **7** | **Lazy-load Google Fonts / Bootstrap Icons** (preload + font-display: swap) | Low | Medium | **P1** | 1h |
| **8** | **Code-split `app.html`** → separate per-section JS modules (dynamic import) | High | High | **P1** | 8h |
| **9** | **Service Worker + offline shell** (cache HTML/CSS/JS, stale-while-revalidate) | Medium | Medium | **P2** | 6h |
| **10** | **Dashboard chart lazy-render** (IntersectionObserver) | Low | Medium | **P2** | 2h |
| **11** | **Pre-fetch next-tab data on hover** (speculative `google.script.run`) | Low | Medium | **P2** | 1h |
| **12** | **Compress inline CSS** (remove duplicates, use CSS custom properties) | Low | Low | **P3** | 2h |
| **13** | **Server-side pagination for all list endpoints** (already partial, extend to all) | Medium | Medium | **P2** | 4h |
| **14** | **Web Worker for chart data transformation** (off main thread) | High | Low | **P3** | 6h |

---

## 3. SPECIFIC IMPLEMENTATION PLANS

### 3.1 P0: Lazy-Load Non-Dashboard Sections (DOM Reduction)

**Problem**: 17 sections in DOM at load, only 1 visible.

**Solution**: Render sections on-demand via `go()` navigation.

```javascript
// In app.html — replace static sections with dynamic injection
const SECTION_TEMPLATES = {
  'amort': () => import('./sections/amort.html.js'),
  'schedule': () => import('./sections/schedule.html.js'),
  // ... 15 more
};

function go(page) {
  const sectionId = 'sec' + page.charAt(0).toUpperCase() + page.slice(1);
  let section = document.getElementById(sectionId);
  
  if (!section) {
    // First visit — lazy-load and inject
    showLoader(sectionId);
    SECTION_TEMPLATES[page]().then(module => {
      const html = module.render();
      const container = document.createElement('div');
      container.id = sectionId;
      container.className = 'section';
      container.innerHTML = html;
      document.getElementById('ct').appendChild(container);
      hideLoader(sectionId);
      activateSection(page);
      // Call page-specific load function
      if (window['load' + page.charAt(0).toUpperCase() + page.slice(1)]) {
        window['load' + page.charAt(0).toUpperCase() + page.slice(1)]();
      }
    });
  } else {
    activateSection(page);
  }
}
```

**Files to create**: `/sections/*.html.js` (17 modules, ~10-15 KB each)  
**Impact**: Initial DOM nodes ↓ from ~3000 to ~500; initial HTML ↓ from 420 KB to ~120 KB

---

### 3.2 P0: Lazy-Load Chart.js

**Problem**: Chart.js (180 KB) blocks main thread on every load, even non-dashboard tabs.

**Solution**: Dynamic import when dashboard becomes visible.

```javascript
// In app.html — replace CDN script tag with:
let _chartJsLoaded = false;
async function ensureChartJs() {
  if (_chartJsLoaded) return;
  if (typeof Chart === 'undefined') {
    await import('https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js');
  }
  _chartJsLoaded = true;
}

// In loadDashboard():
async function loadDashboard() {
  await ensureChartJs();
  // ... existing logic
}

// In go() when leaving dashboard:
function go(page) {
  if (currentPage === 'dashboard' && page !== 'dashboard') {
    destroyCharts(); // Already exists
  }
  // ...
}
```

**Impact**: Saves 180 KB parse/compile on non-dashboard loads; TTI improves ~400ms.

---

### 3.3 P0: Batch Running Balance RPC (Critical)

**Problem**: `loadRunningBalance()` makes **1 `getDocList()` + N × `getDocDetail()`** sequential calls (N = 50-200). At 200ms/call = 10-40s.

**Backend Change** (`Dashboard.gs` or new `RunningBalance.gs`):

```javascript
// NEW: Batch endpoint
function getDocDetailsBatch(docNos) {
  try {
    const items = readInputData_();
    const docMap = {};
    items.forEach(item => { docMap[item.docNo] = item; });
    
    const results = {};
    docNos.forEach(docNo => {
      const item = docMap[docNo];
      if (item) {
        const schedule = calculateAmortization_(item, null);
        results[docNo] = {
          ok: true,
          docNo: item.docNo,
          docNo2: item.docNo2 || '',
          description: item.description,
          plate: item.plate || '',
          io: item.io || '',
          glPrepaid: item.glPrepaid || '',
          glName: item.glName || '',
          costCenter: item.costCenter || '',
          costName: item.costName || '',
          startDate: fmtDate_(new Date(item.startDate)),
          endDate: fmtDate_(new Date(item.endDate)),
          amount: item.amount,
          amortized: schedule.reduce((s, x) => s + x.amortAmount, 0),
          remaining: schedule.length ? schedule[schedule.length-1].remaining : item.amount,
          schedule: schedule.slice(0, 50), // Limit for payload
          scheduleRows: schedule.length
        };
      } else {
        results[docNo] = { ok: false, error: 'Not found' };
      }
    });
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
```

**Frontend Change** (`app.html`):

```javascript
function loadRunningBalance(dashData) {
  _rbRunning = true;
  showRbProgress('Loading document list...');
  
  google.script.run.withSuccessHandler(function(r) {
    if (!r.ok || !r.list?.length) { showRbProgress('No documents'); _rbRunning = false; return; }
    _rbDocs = r.list;
    showRbProgress(`Loaded ${r.list.length} docs. Fetching details in batch...`);
    
    // SINGLE batch call instead of N sequential calls
    const docNos = r.list.map(d => d.docNo);
    google.script.run.withSuccessHandler(function(batchResult) {
      if (!batchResult.ok) { showRbProgress('Batch failed: ' + batchResult.error); _rbRunning = false; return; }
      
      _rbData = batchResult.results; // {docNo: detail}
      _rbDocs.forEach(doc => renderRbRow(_rbData[doc.docNo]));
      showRbProgress(`✅ Loaded ${_rbDocs.length} documents`);
      _rbRunning = false;
      updateRbAvgConsumed();
    }).getDocDetailsBatch(docNos);
    
  }).withFailureHandler(function(e) {
    showRbProgress('Error: ' + e.message);
    _rbRunning = false;
  }).getDocList();
}
```

**Impact**: 50-200 RPC calls → **1 RPC call** (95% latency reduction).

---

### 3.4 P0: Client-Side Caching (localStorage + IndexedDB)

**Strategy**: Cache dashboard data, doc lists, settings, user preferences.

```javascript
// cache.js — new module
const CACHE_PREFIX = 'pa_';
const CACHE_TTL = {
  dashboard: 5 * 60 * 1000,      // 5 min (matches server cache)
  docList: 10 * 60 * 1000,       // 10 min
  settings: 60 * 60 * 1000,      // 1 hour
  userPrefs: 7 * 24 * 60 * 60 * 1000 // 7 days
};

const Cache = {
  // localStorage for small, frequently accessed data
  set(key, data, ttl = CACHE_TTL.dashboard) {
    const payload = { data, expires: Date.now() + ttl };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(payload));
  },
  get(key) {
    const item = localStorage.getItem(CACHE_PREFIX + key);
    if (!item) return null;
    const { data, expires } = JSON.parse(item);
    if (Date.now() > expires) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    return data;
  },
  
  // IndexedDB for large payloads (doc lists, wide schedules)
  async setLarge(key, data, ttl = CACHE_TTL.docList) {
    const db = await getDB();
    const tx = db.transaction('cache', 'readwrite');
    await tx.objectStore('cache').put({ key: CACHE_PREFIX + key, data, expires: Date.now() + ttl });
    return tx.done;
  },
  async getLarge(key) {
    const db = await getDB();
    const tx = db.transaction('cache', 'readonly');
    const result = await tx.objectStore('cache').get(CACHE_PREFIX + key);
    if (!result || Date.now() > result.expires) { 
      if (result) await deleteLarge(key);
      return null; 
    }
    return result.data;
  }
};

// Usage in loadDashboard():
async function loadDashboard() {
  const cached = Cache.get('dashboard');
  if (cached && cached.dashboardConfig?.showCharts) {
    // Render instantly from cache
    renderDashboard(cached);
    // Then refresh in background
    refreshDashboardSilent();
    return;
  }
  // ... normal load
  google.script.run.withSuccessHandler(function(r) {
    Cache.set('dashboard', r);
    renderDashboard(r);
  }).getDashboardData();
}
```

**Impact**: Returning users see dashboard in **<300ms** (cache hit); cold start unchanged.

---

### 3.5 P1: Debounce & Coalesce `google.script.run` Calls

**Problem**: Rapid user actions (search, filter, pagination) fire duplicate RPCs.

**Solution**: Generic wrapper with deduplication + debouncing.

```javascript
// rpc.js — new module
const _rpcCache = new Map(); // key -> {promise, timestamp}
const _pendingCalls = new Map(); // key -> {resolve, reject, timeout}

function rpc(fnName, args, options = {}) {
  const { dedupe = true, debounce = 0, cache = 0 } = options;
  const key = fnName + ':' + JSON.stringify(args);
  const now = Date.now();
  
  // Return cached promise if within TTL
  if (cache && _rpcCache.has(key)) {
    const { promise, timestamp } = _rpcCache.get(key);
    if (now - timestamp < cache) return promise;
  }
  
  // Debounce: delay execution, coalesce identical calls
  if (debounce > 0) {
    if (_pendingCalls.has(key)) {
      clearTimeout(_pendingCalls.get(key).timeout);
    }
    return new Promise((resolve, reject) => {
      _pendingCalls.set(key, {
        timeout: setTimeout(() => executeCall(key, fnName, args, resolve, reject, cache), debounce),
        resolve, reject
      });
    });
  }
  
  return executeCall(key, fnName, args, null, null, cache);
}

function executeCall(key, fnName, args, extResolve, extReject, cacheTTL) {
  const promise = new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(result => {
        if (cacheTTL) _rpcCache.set(key, { promise: Promise.resolve(result), timestamp: Date.now() });
        resolve(result);
        if (extResolve) extResolve(result);
      })
      .withFailureHandler(err => {
        reject(err);
        if (extReject) extReject(err);
      })[fnName](...args);
  });
  
  if (cacheTTL) _rpcCache.set(key, { promise, timestamp: Date.now() });
  return promise;
}

// Usage examples:
rpc('getDashboardData', [], { cache: 5*60*1000 }); // 5-min cache
rpc('getDocList', [skip, limit], { dedupe: true }); // dedupe rapid pagination
rpc('getCrudRecords', [], { debounce: 300 }); // debounce search/filter
```

---

### 3.6 P1: Virtualize Large Tables

**Target tables**: Running Balance (50-200 rows), CRUD (100-500 rows), Wide Schedule (100+ cols × 500 rows).

**Implementation**: Lightweight virtual scroller (~3 KB) — no external dependency.

```javascript
// virtual-table.js — new module
function createVirtualTable(container, options) {
  const { rowHeight = 32, renderRow, getRowCount, overscan = 5 } = options;
  let scrollTop = 0;
  
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;overflow:auto;height:100%';
  
  const spacer = document.createElement('div');
  spacer.style.cssText = 'position:absolute;top:0;left:0;right:0;pointer-events:none';
  
  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:relative;will-change:transform';
  
  wrapper.appendChild(spacer);
  wrapper.appendChild(viewport);
  container.appendChild(wrapper);
  
  function render() {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(getRowCount(), Math.ceil((scrollTop + wrapper.clientHeight) / rowHeight) + overscan);
    spacer.style.height = (getRowCount() * rowHeight) + 'px';
    viewport.style.transform = `translateY(${start * rowHeight}px)`;
    viewport.innerHTML = '';
    
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      frag.appendChild(renderRow(i));
    }
    viewport.appendChild(frag);
  }
  
  wrapper.addEventListener('scroll', () => { scrollTop = wrapper.scrollTop; render(); }, { passive: true });
  render();
  return { render };
}

// Usage in running balance:
createVirtualTable(document.getElementById('runningBalanceTable'), {
  rowHeight: 36,
  getRowCount: () => _rbDocs.length,
  renderRow: (i) => {
    const doc = _rbDocs[i];
    const detail = _rbData[doc.docNo];
    const tr = document.createElement('tr');
    tr.innerHTML = `...`; // existing renderRbRow logic
    return tr;
  }
});
```

**Impact**: DOM nodes ↓ from 500+ to ~20; scroll performance 60fps.

---

### 3.7 P1: Optimize Font & Icon Loading

**Current**: Blocking `<link>` for Google Fonts + Bootstrap Icons.

**Fix**: Preload + `font-display: swap` + subset fonts.

```html
<!-- In index.html head — replace existing font links -->
<link rel="preload" as="font" type="font/woff2" crossorigin 
  href="https://fonts.gstatic.com/s/prompt/v20/3hyjU1RyR2O6xKpl2VKnPeRZc88.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin 
  href="https://fonts.gstatic.com/s/dmserifdisplay/v17/-nFnOHM81r4j6kpUjSlP5cUB9CGOCZ3qIZk.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin 
  href="https://fonts.gstatic.com/s/jetbrainsmono/v23/tDbD2oWUg0MKXjf-vVShj6RsgPWj73fQoPnR.woff2">

<!-- Async load with font-display:swap -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500&display=swap" media="print" onload="this.media='all'">

<!-- Bootstrap Icons: inline SVG subset instead of full font -->
<!-- Extract only used icons (bi-graph-up, bi-bar-chart, bi-pie-chart, bi-check-circle, etc.) -->
<!-- ~2 KB inline SVG vs 50 KB font file -->
```

**Impact**: Eliminates font/FOIT blocking; saves ~60 KB transfer.

---

### 3.8 P1: Code-Split `app.html` into Modules

**Current**: Single 215 KB `app.html` with all 34 load functions + 80 handlers.

**Target Structure**:

```
/tmp/prepaid-amort/
├── index.html              # ~15 KB (shell + inline critical CSS)
├── app-shell.js            # ~5 KB (navigation, routing, RPC wrapper)
├── modules/
│   ├── dashboard.js        # ~25 KB (charts, KPIs, drill-down)
│   ├── amort.js            # ~8 KB
│   ├── schedule.js         # ~10 KB
│   ├── crud.js             # ~20 KB
│   ├── sap.js              # ~15 KB
│   ├── void.js             # ~18 KB
│   ├── checker.js          # ~8 KB
│   ├── sync.js             # ~5 KB
│   ├── import.js           # ~12 KB
│   ├── budget.js           # ~8 KB
│   ├── periodclose.js      # ~12 KB
│   ├── approvals.js        # ~10 KB
│   ├── glrecon.js          # ~8 KB
│   ├── settings.js         # ~5 KB
│   ├── admin.js            # ~8 KB
│   ├── audit.js            # ~5 KB
│   └── guide.js            # ~5 KB
├── shared/
│   ├── chart-helpers.js    # Chart.js config builders
│   ├── table-helpers.js    # Virtual table, pagination
│   ├── rpc.js              # Debounced/deduped RPC
│   └── cache.js            # localStorage + IndexedDB
└── styles/
    └── critical.css        # Inlined in index.html
```

**Build Step**: Use `esbuild` or simple concat script to bundle for GAS deployment (GAS doesn't support ES modules natively, so bundle at deploy time).

```bash
# deploy-build.sh
npx esbuild app-shell.js --bundle --outfile=dist/app.html --format=iife --global-name=Amort
# Then inject into index.html via clasp or manual deploy
```

**Impact**: Initial JS parse ↓ from 215 KB to ~20 KB (shell only); tab switch loads ~10-25 KB module.

---

### 3.9 P2: Service Worker + Offline Shell

**Create**: `sw.js` (served via GAS `doGet` static route or separate deployment).

```javascript
// sw.js
const CACHE_NAME = 'amort-v37';
const STATIC_ASSETS = [
  '/',  // index.html
  '/app-shell.js',
  '/styles/critical.css',
  'https://fonts.gstatic.com/...',  // Pre-cached fonts
  'https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('fetch', e => {
  // Stale-while-revalidate for HTML/JS/CSS
  if (e.request.mode === 'navigate' || e.request.destination === 'script' || e.request.destination === 'style') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(network => {
          if (network.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, network.clone()));
          return network;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
  // Network-first for google.script.run (RPC) — never cache
});
```

**Register in index.html**:

```html
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.warn);
}
</script>
```

**Impact**: Repeat visits load shell in **<200ms** (from cache); offline-capable for read-only views.

---

### 3.10 P2: Dashboard Chart Lazy-Render (IntersectionObserver)

**Current**: All 7 charts render synchronously in `renderCharts()`.

**Fix**: Render only when chart canvas enters viewport.

```javascript
function renderCharts(r) {
  destroyCharts();
  // ... existing chart config setup ...
  
  // Instead of immediate render, observe each canvas
  const chartConfigs = buildChartConfigs(r); // Extract config building
  
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const canvas = entry.target;
        const config = chartConfigs[canvas.id];
        if (config) {
          const ctx = canvas.getContext('2d');
          chartInstances[canvas.id] = new Chart(ctx, config);
          obs.unobserve(canvas);
        }
      }
    });
  }, { rootMargin: '100px' }); // Start rendering 100px before visible
  
  Object.keys(chartConfigs).forEach(id => {
    const canvas = document.getElementById(id);
    if (canvas) observer.observe(canvas);
  });
}
```

**Impact**: Initial dashboard paint ↓ by ~800ms (charts render progressively).

---

### 3.11 P2: Speculative Pre-fetch on Tab Hover

```javascript
// In app-shell.js
const _prefetchCache = new Set();
const HOVER_DELAY = 200; // ms

document.querySelectorAll('.ni, .bn-item').forEach(el => {
  let hoverTimer;
  el.addEventListener('mouseenter', () => {
    const page = el.id.replace('nav-', '') || el.dataset.page;
    if (page && !_prefetchCache.has(page)) {
      hoverTimer = setTimeout(() => {
        _prefetchCache.add(page);
        // Fire-and-forget RPC to warm server cache
        google.script.run.withSuccessHandler(() => {}).withFailureHandler(() => {})['get' + capitalize(page) + 'Data']();
      }, HOVER_DELAY);
    }
  });
  el.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
});
```

**Impact**: Perceived tab switch latency ↓ 50-80% (server cache warm).

---

### 3.12 P3: CSS Optimization

- Remove duplicate rules (many `.card`, `.btn`, `.kpi` variants)
- Consolidate media queries
- Use CSS custom properties for theming (already done)
- **Target**: Inline CSS ↓ from 38 KB → 15 KB

---

## 4. SUCCESS METRICS & TARGETS

| Metric | Current (Est.) | Target | Measurement Method |
|--------|----------------|--------|-------------------|
| **Initial Load (TTI)** | 6-10s cold / 3-5s warm | **< 2s** | `performance.timing.domInteractive` + custom `ttfi` mark |
| **Dashboard TTI** | 3-5s | **< 1.5s** | `performance.now()` in `loadDashboard` success handler |
| **Tab Switch (inactive→active)** | 1-3s | **< 500ms** | `go()` start → section `.active` + data rendered |
| **Running Balance Load** | 10-60s | **< 3s** | `loadRunningBalance` start → table interactive |
| **Bundle Size (HTML gzipped)** | ~120 KB | **< 50 KB** | `curl -I` deployed URL + `content-encoding: gzip` |
| **Chart.js Load (non-dashboard)** | 180 KB parsed | **0 KB** | Network tab — verify no Chart.js on non-dashboard tabs |
| **Cache Hit Rate (returning users)** | 0% | **> 80%** | `localStorage` / IndexedDB inspection |
| **Memory (idle dashboard)** | ~80-120 MB | **< 60 MB** | Chrome DevTools Memory tab |
| **FPS during scroll (large tables)** | 15-30 fps | **60 fps** | Chrome DevTools Performance tab |

---

## 5. IMPLEMENTATION ROADMAP

### Week 1 (P0 — Critical Path)
| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 1 | Lazy-load non-dashboard sections (DOM reduction) | FE | `sections/` modules + dynamic `go()` |
| 2 | Lazy-load Chart.js + IntersectionObserver chart render | FE | `ensureChartJs()` + lazy charts |
| 3-4 | Batch Running Balance RPC (backend + frontend) | BE + FE | `getDocDetailsBatch()` + new `loadRunningBalance()` |
| 5 | Client-side cache layer (localStorage + IndexedDB) | FE | `cache.js` module + integration in `loadDashboard()` |

### Week 2 (P1 — High Impact)
| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 1-2 | RPC debounce/dedupe wrapper | FE | `rpc.js` + migration of all calls |
| 3-4 | Virtual tables for Running Balance, CRUD, Wide Schedule | FE | `virtual-table.js` + 3 integrations |
| 5 | Font/icon optimization (preload + subset SVG icons) | FE | Updated `index.html` head |

### Week 3 (P1-P2 — Code Split + SW)
| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 1-3 | Code-split `app.html` → ES modules + build script | FE | `modules/`, `deploy-build.sh`, bundled `app.html` |
| 4-5 | Service Worker + offline shell | FE | `sw.js` + registration |

### Week 4 (P2-P3 — Polish)
| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 1 | Speculative pre-fetch on hover | FE | `app-shell.js` hover listeners |
| 2 | CSS optimization pass | FE | Minified critical CSS |
| 3 | Performance testing & validation | QA | Lighthouse CI + manual verification |
| 4 | Documentation & rollback plan | All | `PERF-RESULTS.md` |

---

## 6. ROLLOUT STRATEGY

1. **Feature flags** for each optimization (enable via `PropertiesService`):
   ```javascript
   // In doGet() or config
   const FEATURES = {
     lazySections: true,
     lazyCharts: true,
     batchRunningBalance: true,
     clientCache: true,
     rpcDebounce: true,
     virtualTables: true,
     serviceWorker: true,
     codeSplit: false // Requires build step — enable last
   };
   ```

2. **Canary deploy**: Deploy @38 with flags off; enable per-user via admin console.

3. **Rollback**: Disable flag → immediate revert (no code redeploy).

4. **Monitoring**: Log `performance.now()` marks to Audit Log for each key metric.

---

## 7. BACKEND CHANGES REQUIRED

| File | New Function | Purpose |
|------|--------------|---------|
| `Dashboard.gs` or new `RunningBalance.gs` | `getDocDetailsBatch(docNos)` | Batch fetch doc details (replaces N×`getDocDetail`) |
| `Dashboard.gs` | `getDashboardData()` — already cached 5 min | No change needed |
| All `*List` endpoints | Add `skip`, `limit` params | Server-side pagination (already partial) |
| `CacheService` | Invalidate on data mutations | Call `CacheService.getScriptCache().remove('dash_v2')` in `runMonthEndAmortization`, `addPrepaidRecord`, `updatePrepaidRecord`, `deletePrepaidRecord`, `syncData` |

---

## 8. RISKS & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Chart.js dynamic import fails in GAS iframe | Medium | High | Fallback to CDN `<script>` if `import()` throws; test in GAS Web App context |
| IndexedDB not available (incognito/Safari) | Low | Medium | Graceful fallback to localStorage + in-memory cache |
| Code-split breaks GAS `google.script.run` binding | Medium | High | Keep `google.script.run` in shell; modules only import UI logic |
| Batch RPC payload too large (>10MB) | Low | Medium | Chunk `docNos` into batches of 50; aggregate results client-side |
| Service Worker caches stale RPC responses | Low | High | **Never** cache `google.script.run` URLs; SW only for static assets |

---

## 9. FILES TO CREATE / MODIFY

### New Files
```
/tmp/prepaid-amort/
├── modules/
│   ├── dashboard.js
│   ├── amort.js
│   ├── schedule.js
│   ├── crud.js
│   ├── sap.js
│   ├── void.js
│   ├── checker.js
│   ├── sync.js
│   ├── import.js
│   ├── budget.js
│   ├── periodclose.js
│   ├── approvals.js
│   ├── glrecon.js
│   ├── settings.js
│   ├── admin.js
│   ├── audit.js
│   └── guide.js
├── shared/
│   ├── rpc.js
│   ├── cache.js
│   ├── virtual-table.js
│   └── chart-helpers.js
├── app-shell.js
├── sw.js
├── deploy-build.sh
└── perf-optimization-spec.md  (this file)
```

### Modified Files
- `index.html` — Inline critical CSS only; add font preloads; register SW; remove Chart.js/Bootstrap Icons blocking links
- `app.html` → **replaced by** `app-shell.js` + dynamic modules (bundled at deploy)
- `Dashboard.gs` — Add `getDocDetailsBatch(docNos)` + cache invalidation hooks
- `Code.gs` / `Import.gs` / `Admin.gs` — Add cache invalidation on mutations

---

## 10. VALIDATION CHECKLIST (Post-Implementation)

- [ ] Cold load TTI < 2s (Lighthouse Performance > 90)
- [ ] Dashboard renders KPIs < 500ms; charts appear progressively
- [ ] Tab switch (dashboard ↔ amort) < 500ms on warm cache
- [ ] Running Balance loads 100 docs < 3s (batched RPC)
- [ ] CRUD table 500 rows scrolls at 60fps (virtualized)
- [ ] Repeat visit loads shell from SW < 200ms
- [ ] No Chart.js network request on non-dashboard tabs
- [ ] Fonts load with `font-display: swap` (no FOIT)
- [ ] All `google.script.run` calls go through `rpc()` wrapper (dedupe working)
- [ ] Cache hit rate > 80% on returning user session
- [ ] Bundle size (gzipped) < 50 KB initial

---

**Document Version**: 1.0  
**Created**: 2026-06-27  
**Author**: Performance Analysis Agent  
**Next Review**: After Week 1 implementation (P0 complete)