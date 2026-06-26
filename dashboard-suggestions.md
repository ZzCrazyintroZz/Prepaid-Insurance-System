# Dashboard Enhancement Suggestions — Prepaid Expense Amortization System

> Based on analysis of Code.gs (1241 lines) and index.html (873 lines)
> Data source: Google Sheet "payment system" — 3,979 records, 15 columns (A–O)
> Current Dashboard: 3 KPI cards + 2 charts (trend line + top GL bar)

---

## Category 1: KPI Cards (Numerical Summaries)

### S-1. Total Active Items vs. Fully Amortized Items
- **Data used:** `startDate`, `endDate` (Col M, N), amortization engine `remaining` from schedule
- **Why useful:** Shows inventory health — how many prepaids are still running vs. completed. A high "completed" count means old data can be archived.
- **Effort:** **Easy** — compare `endDate` to today; if endDate < today and remaining ≈ 0 → completed. Already available from checker logic.

### S-2. Total Remaining Balance
- **Data used:** Amortization engine — sum `remaining` from last schedule row of each item
- **Why useful:** Shows the total outstanding prepaid expense liability that hasn't been recognized yet. Critical for financial planning and period-end close.
- **Effort:** **Medium** — needs a full pass of `calculateAmortization_` per item (like `getDashboardData` already does) to extract final `remaining`. Can be computed in the same loop as the trend.

### S-3. Average Prepaid Duration (Months)
- **Data used:** `startDate` (Col M), `endDate` (Col N) → `(endDate - startDate) / 30`
- **Why useful:** Quickly tells the typical contract length. Short-duration items (< 3 months) may need faster amortization tracking; long-duration items (> 12 months) represent material prepaids.
- **Effort:** **Easy** — pure column math, no amortization engine needed.

### S-4. Items Expiring This Month / Next Quarter
- **Data used:** `endDate` (Col N), `remaining` from amortization engine
- **Why useful:** Alerts the finance team which prepaids are ending soon and need renewal, refund, or write-off action. Critical for cash flow planning.
- **Effort:** **Easy** — filter by `endDate` between today and +N months. No new backend function needed if integrated into `getDashboardData`.

### S-5. Month-over-Month Change in Amortization
- **Data used:** Trend data (already calculated in `getDashboardData`) — `trend[t].amount` for current period vs. previous period
- **Why useful:** Shows whether monthly amortization is increasing or decreasing. A sharp jump may indicate large new prepaids booked; a drop may indicate items expiring.
- **Effort:** **Easy** — percentage change from existing `trend` array; pure frontend math.

### S-6. Largest Single Prepaid Item (Max Amount)
- **Data used:** `amount` (Col O), `description` (Col F), `docNo` (Col D)
- **Why useful:** Highlights the most material prepaid for management attention. Large items have greater financial impact if amortization is wrong.
- **Effort:** **Easy** — sort items by `amount` descending, take top 1.

---

## Category 2: Charts (Visualizations)

### S-7. Stacked Bar Chart — Amortization by Cost Center (Period over Period)
- **Data used:** `costCenter` (Col K), amortization `period`, `amortAmount` from engine
- **Why useful:** Shows which departments/cost centers are consuming prepaid expenses over time. Enables departmental cost allocation visibility and budgeting.
- **Effort:** **Medium** — needs grouping by cost center × period in the backend loop, similar to how `glMap` is built. Reuses existing amortization engine results.

### S-8. Pie / Doughnut Chart — Amortization by Company
- **Data used:** `company` (Col A), amortization `amortAmount` (current period)
- **Why useful:** If the system handles multiple companies (common in Thai corporate groups), this shows which entity carries the largest prepaid burden. The current data shows company codes in Col A.
- **Effort:** **Easy** — group by `company` in the same loop that builds `glMap`. Company is a raw column, no calc needed.

### S-9. Heatmap or Bar Chart — Items by Month (Count of Active Items per Period)
- **Data used:** `startDate` (Col M), `endDate` (Col N) → count items overlapping each month
- **Why useful:** Shows seasonality/prepaid volume. How many prepaids are active each month? Useful for workload planning (e.g., month-end close team knows how many items need SAP JE processing).
- **Effort:** **Medium** — requires iterating each item's date range and counting overlap. Can reuse `calculateAmortization_` logic but only counting days-in-month > 0.

### S-10. Waterfall or Trend Chart — Accumulated Amortization Over Time
- **Data used:** `accumulated` from amortization engine, grouped by period
- **Why useful:** Shows the cumulative recognized expense. Management can see "we've recognized X% of total prepaids to date." Useful for audit and financial reporting.
- **Effort:** **Easy** — already available from `calculateAmortization_` schedule as `accumulated`. Just aggregate the last value per period.

### S-11. Horizontal Bar Chart — Top 10 IO (Debit Account) by Amount
- **Data used:** `io` (Col H), amortization `amortAmount` (current period)
- **Why useful:** Currently the GL breakdown is shown (credit side). Showing the IO breakdown (debit side) gives the full picture — which expense accounts are being charged. Complements the existing GL chart.
- **Effort:** **Easy** — same logic as existing `glMap`; just build an `ioMap` in parallel.

---

## Category 3: Summary Tables (Lists)

### S-12. "Expiring Soon" Table — Next 10 Prepaids Ending
- **Data used:** `docNo` (Col D), `description` (Col F), `endDate` (Col N), `amount` (Col O), `remaining` from engine
- **Why useful:** A table (not just chart) that finance staff can scan and act on: renew contracts, prepare refunds, or write off remaining balances. Links to Void/Terminate tab.
- **Effort:** **Medium** — needs filtered/sorted query with remaining balance lookup, plus frontend table rendering. Reuses engine.

### S-13. "Items Needing Review" Table — Data Quality Issues on Dashboard
- **Data used:** Checker validation results (missing IO, missing GL, start > end, amount ≤ 0)
- **Why useful:** Instead of waiting for the Checker tab, surface data quality warnings directly on the Dashboard. A small red/yellow badge + table saying "5 items have missing IO" alerts the user to fix data early.
- **Effort:** **Medium** — partial checker logic (some checks) needs to run in the dashboard backend, or the existing `runPreUploadCheck` result can be cached and exposed.

---

## Category 4: Status Indicators / Alerts

### S-14. Data Freshness / Last Check Date Badge
- **Data used:** Checker `timestamp` or last update time of input sheet
- **Why useful:** Answers "is this data from today or last month?" — users need trust that the dashboard reflects current data. Also shows when the amortization was last calculated.
- **Effort:** **Easy** — expose `runPreUploadCheck` timestamp or query sheet metadata. Pure info display.

### S-15. Overall Data Health Score (%)
- **Data used:** Checker results — `validItems / totalItems` ratio
- **Why useful:** A single green/yellow/red gauge that gives an instant "go/no-go" for period-end processing. If health < 90%, warn before running export.
- **Effort:** **Easy** — derived from existing `totalItems` and `errorCount`. Already computed in checker; just expose on dashboard.

---

## Implementation Priority Matrix

| Suggestion  | Category     | Effort   | Impact     | Priority |
|-------------|-------------|----------|------------|----------|
| S-2         | KPI         | Medium   | High       | ⭐ P1     |
| S-1         | KPI         | Easy     | High       | ⭐ P1     |
| S-7         | Chart       | Medium   | High       | ⭐ P1     |
| S-13        | Table       | Medium   | High       | ⭐ P1     |
| S-3         | KPI         | Easy     | Medium     | P2        |
| S-4         | KPI         | Easy     | Medium     | P2        |
| S-12        | Table       | Medium   | Medium     | P2        |
| S-5         | KPI         | Easy     | Medium     | P2        |
| S-11        | Chart       | Easy     | Medium     | P2        |
| S-8         | Chart       | Easy     | Low-Med    | P3        |
| S-9         | Chart       | Medium   | Low-Med    | P3        |
| S-14        | Status      | Easy     | Low        | P3        |
| S-15        | Status      | Easy     | Low        | P3        |
| S-6         | KPI         | Easy     | Low        | P3        |
| S-10        | Chart       | Easy     | Low        | P3        |

**Legend:**
- **P1** = High value, moderate effort — do these first
- **P2** = Good value, easy-medium effort — next batch
- **P3** = Nice-to-have — implement when time permits

---

## Technical Note on Implementation

All suggestions reuse the existing `getDashboardData()` backend function (Code.gs line 598–663) or the amortization engine (`calculateAmortization_` at line 141). No new Google Sheet data sources are needed — all columns (A–O) are already read by `readInputData_()` (line 53–85).

The biggest backend change needed is for **S-2 (Total Remaining Balance)** and **S-7 (Stacked by Cost Center)**, which require running the full amortization engine on all items and aggregating differently. The existing trend loop already does a full pass; these aggregations can be added to the same loop with minimal performance impact (~same CPU cost as existing dashboard load).
