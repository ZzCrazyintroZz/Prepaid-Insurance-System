# Prepaid Expense Amortization System — GAS Web App

Daily amortization, SAP JE generation, Wide Format, Void/Terminate, Dashboard.

## Deployments
- **v177**: Chunked cache (supports >100KB)
- **v182**: SSR Dashboard (server-side rendered KPIs)
- **v183**: Fix app.html crash (unescaped single quote)
- **v187**: Final — SSR + app.html fix + all 17 menus working

## Tech Stack
- Google Apps Script (V8 runtime)
- HTML/CSS/JS (Chart.js, Google Charts)
- clasp CLI for deployment

## Structure
- `Code.js` — Backend: doGet(), batchGet(), warmup()
- `index.html` — Main template + SSR inline renderer
- `app.html` — Frontend JS (5955 lines: all menus, navigation, lazy loading)
- `Dashboard.js` — Dashboard data aggregation
- `*.js` — Admin, AmortEngine, Approval, Checker, DataLayer, Export, GlRecon, Import, PeriodClose, Void
