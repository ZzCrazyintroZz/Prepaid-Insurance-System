# UAT Checklist — Amort v34 → v35

## HTTP & Access
- [x] URL returns HTTP 200
- [x] Page title "Amort — Prepaid Expense Amortization System"
- [x] All 17 section IDs present in deployed HTML

## Navigation (Every Tab)
- [ ] Dashboard — loads KPIs + 7 charts
- [ ] Amortization — single period run + multi-period run
- [ ] Schedule — preview + export
- [ ] Prepaid (CRUD) — add/edit/delete/search
- [ ] Budget vs Actual — set budget + view vs actual
- [ ] Sync Data — status + sync now
- [ ] Import CSV/Excel — paste + preview + import
- [ ] SAP Generator — preview + generate + bulk export
- [ ] Pre-Upload Checker — run check + results
- [ ] Void / Terminate — single void + batch void + modify
- [ ] Period-Close — run checklist + close + reopen
- [ ] Approvals — submit + approve + reject + history
- [ ] GL Reconciliation — load GL + save balance + run
- [ ] Settings — load + save values
- [ ] Admin Console — system info + clear cache + auto-run + email
- [ ] Audit Log — load entries
- [ ] User Guide — load guide data

## Backend Functions (cross-referenced)
- [ ] All 80 google.script.run calls match defined .gs functions
- [ ] All go() handlers map to defined load functions
- [ ] No duplicate function names across .gs files
- [ ] No dead code handlers (voidexpense removed)

## Performance Fixes (v34)
- [ ] 5 missing go() handlers added (amort, schedule, sap, checker, settings)
- [ ] 4 load functions present (loadAmort, loadSchedule, loadSAP, loadChecker, loadSettings)
- [ ] Dead loadVoidExpense removed

## User Guide Update
- [ ] Version string updated to v34
- [ ] All 17 tabs described with detailed info
- [ ] Phase B1-B7 features documented
- [ ] Phase C1-C3 features documented
- [ ] Technical notes updated with all features
- [ ] Performance + Pagination noted
