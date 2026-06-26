# FINAL PLAN — Amort System Development

## ✅ Done (รออนุมัติ)
| # | ฟีเจอร์ | Agent | Status |
|---|---------|-------|--------|
| D1 | Sidebar หมวดหมู่ (Main Menu, Data, System) | 💻 Coder | ✅ |
| D2 | Dashboard ขยาย 15 metrics (KPI+charts+tables) | 💻 Coder | ✅ |
| D3 | Sync Data tab (sheet info, sync btn) | 💻 Coder | ✅ |
| D4 | Admin Console tab (system info, cache) | 💻 Coder | ✅ |
| D5 | Audit Log tab (table + log) | 💻 Coder | ✅ |
| D6 | Backend stubs (getSyncStatus, getSystemInfo, clearCache, logAction) | 💻 Coder | ✅ |

---

## 🏗️ REFACTOR — แยกโครงสร้างใหม่

### R1. Split Code.gs → Modules
แยก backend เป็นไฟล์ตาม responsibility:
| ไฟล์ใหม่ | เนื้อหา | ขนาดโดยประมาณ |
|----------|--------|--------------|
| `Code.gs` | doGet, doPost, CONFIG, helpers | ~200 lines |
| `DataLayer.gs` | readInputData_, getInputSheetId_, getSapTemplateId_ | ~100 lines |
| `AmortEngine.gs` | calculateAmortization_, runMonthEndAmortization_ | ~200 lines |
| `Export.gs` | pivotToWideFormat_, exportWideToSheet_, exportSAPJE_ | ~300 lines |
| `Void.gs` | getDocList_, getDocDetail_, voidPrepaid_ | ~200 lines |
| `Checker.gs` | runPreUploadCheck_ | ~150 lines |
| `Dashboard.gs` | getDashboardData_ | ~200 lines |
| `Admin.gs` | getSystemInfo_, getSyncStatus_, clearCache_, auditLog_ | ~150 lines |
| **รวม** | | **~1500 lines** |

### R2. Split index.html → index.html + app.html
| ไฟล์ | เนื้อหา |
|------|--------|
| `index.html` | HTML structure + CSS (เหมือน Budget Bonus) |
| `app.html` | JavaScript ทั้งหมด (เหมือน Budget Bonus) |

### R3. ใช้ Column Constants
```javascript
const COL = { COMPANY:0, POSTING_DATE:1, DOC_DATE:2, DOC_NO:3, 
  DOC_NO_2:4, DESC:5, PLATE:6, IO:7, GL_PREPAID:8, 
  GL_NAME:9, COST_CENTER:10, COST_NAME:11, 
  START_DATE:12, END_DATE:13, AMOUNT:14 };
```
เปลี่ยน magic numbers ทั้งหมด → COL.DOC_NO, COL.AMOUNT ฯลฯ

---

## 🚀 PHASE A — Quick Wins

| A# | ฟีเจอร์ | Priority | Effort | Agent |
|----|---------|----------|--------|-------|
| A1 | **Fix Cache Key** (dash_data vs dashboard_data) | P1 | Easy | 💻 Coder |
| A2 | **Surface Doc No 2, GL Name, Cost Name** ใน UI | P2 | Easy | 💻 Coder |
| A3 | **Global Search + Column Filter** ทุกตาราง | P1 | Medium | 💻 Coder |
| A4 | **Sortable Table Columns** (click header sort) | P1 | Easy | 💻 Coder |
| A5 | **Export CSV/PDF** (dashboard, schedule, checker) | P1 | Medium | 💻 Coder |
| A6 | **Keyboard Shortcuts** (Ctrl+R, Ctrl+E, Ctrl+F, Ctrl+S) | P3 | Easy | 💻 Coder |
| A7 | **Drill-Down Dashboard** (คลิก KPI → รายการละเอียด) | P2 | Medium | 💻 Coder |

---

## 🏗️ PHASE B — Power Features

| B# | ฟีเจอร์ | Priority | Effort | Agent |
|----|---------|----------|--------|-------|
| B1 | **Scheduled Auto-Run** (GAS Trigger วันที่ 1 ทุกเดือน) | P1 | Medium | 🔧 DevOps |
| B2 | **Multi-Period Amortization Run** (ย้อนหลังหลายงวด) | P2 | Easy | 💻 Coder |
| B3 | **Batch Void** (เลือกหลายรายการ void พร้อมกัน) | P2 | Medium | 💻 Coder |
| B4 | **Deferral Modification** (แก้ไขวันที่/จำนวนระหว่างสัญญา) | P2 | Medium | 💻 Coder |
| B5 | **Running Balance View** (consumption + remaining) | P2 | Medium | 💻 Coder |
| B6 | **Email Notifications** (expiring, period close, errors) | P1 | Medium | 🔧 DevOps + ✍️ Writer |
| B7 | **Bulk SAP JE Export** (หลายงวดพร้อมกัน) | P2 | Medium | 💻 Coder |

---

## 🏛️ PHASE C — Enterprise Features

| C# | ฟีเจอร์ | Priority | Effort | Agent |
|----|---------|----------|--------|-------|
| C1 | **Prepaid Record CRUD** (เพิ่ม/แก้ไข/ลบผ่าน UI) | P1 | Hard | 💻 Coder |
| C2 | **Period-Close Workflow** (lock งวด, checklist, close) | P1 | Hard | 💻 Coder + 🔍 Reviewer |
| C3 | **Approval Workflow** (Submit → Approve → Amortize) | P1 | Hard | 💻 Coder + 🔍 Reviewer |
| C4 | **Budget vs Actual** (เปรียบเทียบงบ) | P3 | Medium | 💻 Coder |
| C5 | **Customizable Dashboard** (select KPIs per role) | P3 | Medium | 💻 Coder |
| C6 | **GL Reconciliation Report** | P3 | Hard | 💻 Coder + 🔍 Reviewer |
| C7 | **Data Import (CSV/Excel upload)** | P2 | Medium | 💻 Coder |

---

## 📋 NICE TO HAVE

| N# | ฟีเจอร์ | Effort |
|----|---------|--------|
| N1 | Void Impact Analysis (ดูผลกระทบก่อน void) | Medium |
| N2 | Templates สำหรับรายการประจำ (Insurance, Tax, ฯลฯ) | Easy |
| N3 | Auto Month-End Email Report | Medium |
| N4 | LINE/Webhook alert เมื่อ amortization เสร็จ | Medium |
| N5 | Multi-Language Support (TH/EN) | Hard |

---

## Summary Timeline

```
WEEK 1: REFACTOR (R1+R2+R3) + PHASE A (A1-A7)
WEEK 2: PHASE B (B1-B7)
WEEK 3-4: PHASE C (C1-C7)
```

**รอคุณ Tony อนุมัติแผนนี้ก่อน — แล้วค่อยเริ่มทำงานครับ** 🙏
