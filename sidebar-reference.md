# Budget Bonus DEV — Sidebar Navigation Reference

> Source: https://github.com/ZzCrazyintroZz/Budget (branch: `Dev`)
> Files analyzed: `index.html` (HTML + CSS), `app.html` (JS behavior)

---

## 1. CSS Variables (Design Tokens)

```css
:root {
  --nav: 228px;       /* Sidebar width (desktop default) */
  --hh: 56px;          /* Header height */
  --r: 8px;            /* Global border radius */

  /* Colors (dark theme) */
  --bg:#080809;        /* Page background */
  --sf:#0E0E10;        /* Surface (header, nav, cards background) */
  --card:#111113;      /* Card background */
  --card2:#161618;     /* Secondary card */
  --bdr:rgba(255,255,255,.07);  /* Border color */
  --tx:#ECEBE6;        /* Text primary */
  --mt:#676460;        /* Text muted */
  --am:#C9A96E;        /* Amber/gold accent (active nav, highlights) */
  --blue:#5888BB;
  --vi:#8070CC;
  --gn:#3A9F65;
  --rd:#B85252;
}

/* Light mode overrides */
.light-mode {
  --bg:#F2F0EC;
  --sf:#F8F7F4;
  --card:#FFFFFF;
  --card2:#EDEBE6;
  --bdr:rgba(0,0,0,.10);
  --tx:#1A1917;
  --mt:#8E8B83;
  --am:#9A7230;
}
```

---

## 2. HTML Layout (Overall Structure)

```html
<div id="app">
  <header>
    <button class="hamburger" id="hamburger" onclick="toggleNav()" style="display:none">☰</button>
    <div class="h-logo" onclick="go('dash')" style="cursor:pointer">
      <div class="h-icon">⛽</div>
      <div>
        <div class="h-name">Dashboard</div>
        <div class="h-sub">Budget Bonus</div>
      </div>
    </div>
    <div class="sp"></div>
    <!-- global search, status chip, role toggle, theme toggle, sync button -->
  </header>

  <div id="main">
    <!-- SIDEBAR / NAV -->
    <nav>
      <div class="ng">Overview</div>
      <div class="ni on" id="nav-dash" onclick="go('dash')">
        <span class="ic">◈</span>Dashboard
      </div>
      <div class="ni" id="nav-sync" onclick="go('sync')">
        <span class="ic">⟳</span>Data Sync
      </div>

      <div class="ng">Data</div>
      <div class="ni" id="nav-bonus" onclick="go('bonus')">
        <span class="ic">💹</span>Bonus Data
      </div>
      <div class="ni" id="nav-cc" onclick="go('cc')">
        <span class="ic">🏛</span>Cost Center<span class="nbdg hidden" id="ccb">0</span>
      </div>
      <!-- more nav items ... -->
    </nav>

    <!-- OVERLAY (mobile) -->
    <div class="nav-overlay" id="navOverlay" onclick="toggleNav()"></div>

    <!-- CONTENT AREA -->
    <div id="ct">
      <!-- page content panels -->
    </div>
  </div>

  <!-- BOTTOM NAV (mobile only) -->
  <div class="bottom-nav" id="bottomNav">
    <div class="bn-items">
      <div class="bn-item on" onclick="go('dash')"><span class="bn-ic">◈</span>Dashboard</div>
      <div class="bn-item" onclick="go('bonus')"><span class="bn-ic">💹</span>Bonus</div>
      <div class="bn-item" onclick="go('cc')"><span class="bn-ic">🏛</span>CC</div>
      <div class="bn-item" onclick="go('bva')"><span class="bn-ic">📊</span>Budget</div>
      <div class="bn-item" onclick="go('sync')"><span class="bn-ic">⟳</span>Sync</div>
    </div>
  </div>
</div>
```

---

## 3. Core Sidebar CSS

### 3.1 Navigation Container

```css
nav {
  width: var(--nav);           /* 228px default */
  flex-shrink: 0;              /* Don't shrink in flex layout */
  background: var(--sf);       /* Surface bg (#0E0E10) */
  border-right: 1px solid var(--bdr);
  display: flex;
  flex-direction: column;
  overflow-y: auto;            /* Scroll if many items */
  padding: 8px 6px;
}
```

### 3.2 Navigation Group Header

```css
.ng {
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: var(--mt);            /* Muted text #676460 */
  padding: 12px 10px 4px;
  opacity: .65;
}
.ng:first-child {
  padding-top: 6px;
}
```

### 3.3 Navigation Item (Default State)

```css
.ni {
  display: flex;
  align-items: center;
  gap: 9px;                    /* Gap between icon + label */
  padding: 8px 10px;
  border-radius: 5px;          /* Rounded hover/active bg */
  cursor: pointer;
  color: var(--mt);            /* Muted color by default */
  font-size: 12px;
  transition: all .10s;
  position: relative;
  letter-spacing: .01em;
  border: 1px solid transparent;
}
.ni:hover {
  background: rgba(255,255,255,.03);
  color: var(--tx);            /* Text primary on hover */
}
```

### 3.4 Navigation Item — Active State

```css
.ni.on {
  background: rgba(201,169,110,.08);            /* Amber/gold at 8% opacity */
  border-color: rgba(201,169,110,.14);          /* Amber border */
  color: var(--am);                              /* Amber text #C9A96E */
  font-weight: 500;
}
.ni.on::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  height: 60%;
  width: 2px;
  background: var(--am);                         /* Amber left accent bar */
  border-radius: 0 2px 2px 0;
}
```

### 3.5 Navigation Icon

```css
.ic {
  font-size: 12px;
  width: 16px;                 /* Fixed width for alignment */
  text-align: center;
  flex-shrink: 0;
  pointer-events: none;        /* Don't intercept clicks */
}
```

### 3.6 Navigation Badge

```css
.nbdg {
  margin-left: auto;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: var(--rd);       /* Red background for count badges */
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
```

### 3.7 Mobile Overlay

```css
.nav-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.55);
  z-index: 99;
}
.nav-overlay.show {
  display: block;
}
```

### 3.8 Hamburger Button

```css
.hamburger {
  display: none;               /* Hidden on desktop by default */
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  border: 1px solid var(--bdr);
  background: transparent;
  color: var(--tx);
  cursor: pointer;
  font-size: 16px;
}
```

### 3.9 Bottom Nav (Mobile)

```css
.bottom-nav {
  display: none;               /* Hidden on desktop */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--sf);
  border-top: 1px solid var(--bdr);
  z-index: 100;
  padding: 4px 0 env(safe-area-inset-bottom, 6px);
}
.bn-items {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 0 4px;
}
.bn-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 7px 6px;
  cursor: pointer;
  color: var(--mt);
  font-size: 9px;
  font-weight: 500;
  transition: color .15s;
  min-width: 58px;
  border-radius: 6px;
  -webkit-tap-highlight-color: transparent;
}
.bn-item.on,
.bn-item:hover {
  color: var(--am);
}
.bn-ic {
  font-size: 18px;
  line-height: 1;
}
```

### 3.10 Layout Container (main + content)

```css
#main {
  display: flex;
  flex: 1;
  overflow: hidden;
}
#ct {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg);
  -webkit-overflow-scrolling: touch;
}
```

---

## 4. Responsive Behavior

### 4.1 Breakpoint: 1024px (Small Desktop)

```css
@media (max-width: 1024px) {
  :root {
    --nav: 196px;              /* Narrower sidebar */
  }
  .g4 { grid-template-columns: repeat(2, 1fr); }
  .bva-grid { grid-template-columns: repeat(3, 1fr); }
}
```

### 4.2 Breakpoint: 768px (Tablet / Mobile Portrait)

```css
@media (max-width: 768px) {
  :root {
    --nav: 0px;                /* Collapse sidebar to 0 width */
    --hh: 50px;                /* Shorter header */
  }

  /* Sidebar becomes a fixed overlay panel */
  nav {
    display: none;             /* Hidden by default */
    position: fixed;
    top: var(--hh);
    left: 0;
    bottom: 60px;              /* Leave room for bottom nav */
    width: 260px;              /* Fixed width overlay */
    z-index: 200;
    background: var(--sf);
    border-right: 1px solid var(--bdr);
    padding: 12px 6px;
    box-shadow: 4px 0 24px rgba(0,0,0,.4);
  }
  nav.open { display: flex; }  /* Toggled via JS */

  /* Overlay visible on mobile */
  .nav-overlay { ... }         /* Position: fixed, full screen */
  .nav-overlay.show { display: block; }

  /* Hamburger visible */
  .hamburger { display: flex !important; }

  /* Header tightening */
  header { padding: 0 14px; gap: 8px; }

  /* Padding for bottom nav */
  #ct { padding: 12px; padding-bottom: 70px !important; }

  /* Grid adjustments */
  .g4, .g3 { grid-template-columns: repeat(2, 1fr); gap: 8px; }

  /* Show bottom nav */
  .bottom-nav { display: block; }

  /* Hide desktop-only status chip */
  .h-chip { display: none; }

  /* Increase touch targets */
  .ni { min-height: 44px; }
  .btn { min-height: 38px; }
}

/* Landscape on mobile — hide bottom nav, restore wider layout */
@media (max-width: 768px) and (orientation: landscape) {
  :root { --hh: 42px; }
  .bottom-nav { display: none; }
  .g4 { grid-template-columns: repeat(4, 1fr); }
  #ct { padding-bottom: 0 !important; }
}
```

### 4.3 Breakpoint: 480px (Small Phone)

```css
@media (max-width: 480px) {
  :root { --hh: 48px; --r: 6px; }
  header { padding: 0 10px; gap: 5px; }
  #ct { padding: 10px; padding-bottom: 70px !important; }
  .h-name { font-size: 13px; }
  .h-sub { display: none; }
  .g4, .g3 { grid-template-columns: 1fr 1fr; gap: 7px; }
  .g2 { grid-template-columns: 1fr; }
  /* Smaller KPIs, hero text, buttons */
}
```

### 4.4 Print

```css
@media print {
  nav, header, #toast, button { display: none !important; }
  #ct, #main, #app, body { overflow: visible !important; }
}
```

---

## 5. JavaScript Behavior

### 5.1 Navigation function (`go()`)

Location: `app.html` line 1077

```javascript
function go(p) {
  // Hide all page panels
  document.querySelectorAll('[id^="p-"]').forEach(e => e.classList.add('hidden'));
  // Remove active state from all nav items
  document.querySelectorAll('.ni').forEach(e => e.classList.remove('on'));
  
  // Show the target page
  const pageEl = document.getElementById('p-' + p);
  const navEl   = document.getElementById('nav-' + p);
  if (pageEl) pageEl.classList.remove('hidden');
  if (navEl)   navEl.classList.add('on');
  
  // Close mobile nav if open
  if (window.innerWidth <= 768) {
    document.querySelector('nav').classList.remove('open');
    document.getElementById('navOverlay').classList.remove('show');
  }
  
  // Also update bottom nav active state
  // (via window.go wrapper at line 1332 — see below)
}
```

### 5.2 Mobile Nav Toggle

```javascript
function toggleNav() {
  const nav = document.querySelector('nav');
  const overlay = document.getElementById('navOverlay');
  nav.classList.toggle('open');
  overlay.classList.toggle('show');
}

function checkMobile() {
  const hamburger = document.getElementById('hamburger');
  if (window.innerWidth <= 768) {
    hamburger.style.display = 'flex';
  } else {
    hamburger.style.display = 'none';
    document.querySelector('nav').classList.remove('open');
    document.getElementById('navOverlay').classList.remove('show');
  }
}

window.addEventListener('resize', checkMobile);
checkMobile(); // Run on load
```

### 5.3 Bottom Nav Sync (via wrapped `go`)

```javascript
const origGo = window.go;
if (origGo) {
  const _go = origGo;
  window.go = function(p) {
    _go(p);
    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav .bn-item').forEach(el => el.classList.remove('on'));
    const map = { dash: 0, bonus: 1, cc: 2, bva: 3, sync: 4 };
    const idx = map[p];
    if (idx !== undefined) {
      const items = document.querySelectorAll('.bottom-nav .bn-item');
      if (items[idx]) items[idx].classList.add('on');
    }
  };
}
```

---

## 6. Key Design Patterns Summary

| Feature | Implementation |
|---|---|
| **Sidebar width** | `--nav: 228px` (desktop), `--nav: 196px` (<=1024px), 0px + overlay (<=768px) |
| **Sidebar background** | `--sf` (#0E0E10 dark, #F8F7F4 light) |
| **Default item color** | `--mt` (#676460 dark, #8E8B83 light) |
| **Hover state** | `background: rgba(255,255,255,.03)`, text → `--tx` |
| **Active state** | Amber/gold theme: `rgba(201,169,110,.08)` bg, `--am` text + border, 2px left accent bar (`::before`) |
| **Icons** | Emoji/text via `<span class="ic">`, fixed 16px width for alignment |
| **Section headers** | `.ng` class — uppercase, 9px, muted, letter-spaced, 65% opacity |
| **Badges** | `.nbdg` — red circle pill, right-aligned via `margin-left: auto` |
| **Mobile nav** | Fixed overlay (260px), positioned below header, above bottom nav, toggled via hamburger + backdrop overlay |
| **Hamburger** | Hidden on desktop (`display:none`), shown flex on <=768px |
| **Bottom nav** | Hidden on desktop, shown on <=768px — up to 5 items, amber active color |
| **Touch targets** | `.ni` gets `min-height: 44px` on mobile for touch accessibility |
| **Overlay** | `.nav-overlay` — fixed fullscreen, 55% black, z-index 99; shown behind sidebar on mobile |

---

## 7. Minimal Sidebar HTML Template for Amort System

```html
<nav>
  <div class="ng">Main Menu</div>
  <div class="ni on" id="nav-overview" onclick="go('overview')">
    <span class="ic">◈</span>Overview
  </div>
  <div class="ni" id="nav-amort" onclick="go('amort')">
    <span class="ic">📊</span>Amortization
  </div>
  <div class="ng">Management</div>
  <div class="ni" id="nav-schedule" onclick="go('schedule')">
    <span class="ic">🗓</span>Schedule
  </div>
  <div class="ni" id="nav-reports" onclick="go('reports')">
    <span class="ic">📋</span>Reports
  </div>
  <div class="ng">Settings</div>
  <div class="ni" id="nav-config" onclick="go('config')">
    <span class="ic">⚙</span>Configuration
  </div>
</nav>

<div class="nav-overlay" id="navOverlay" onclick="toggleNav()"></div>

<!-- Bottom Nav (mobile) -->
<div class="bottom-nav" id="bottomNav">
  <div class="bn-items">
    <div class="bn-item on" onclick="go('overview')"><span class="bn-ic">◈</span>Home</div>
    <div class="bn-item" onclick="go('amort')"><span class="bn-ic">📊</span>Amort</div>
    <div class="bn-item" onclick="go('schedule')"><span class="bn-ic">🗓</span>Schedule</div>
    <div class="bn-item" onclick="go('reports')"><span class="bn-ic">📋</span>Reports</div>
    <div class="bn-item" onclick="go('config')"><span class="bn-ic">⚙</span>Config</div>
  </div>
</div>
```
