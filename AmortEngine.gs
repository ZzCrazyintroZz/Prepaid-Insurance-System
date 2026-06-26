// ================= AMORTIZATION ENGINE =================
function calculateAmortization_(item, targetPeriod) {
  try {
    const start = new Date(item.startDate);
    const end = new Date(item.endDate);
    if (isNaN(start) || isNaN(end) || start > end) return [];

    const totalAmt = Number(item.amount) || 0;
    if (totalAmt <= 0) return [];

    const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const ratePerDay = Math.round((totalAmt / totalDays) * 10000) / 10000;

    const results = [];
    let accumulated = 0;
    let current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth();
      const period = year + '-' + pad2_(month + 1);

      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);

      const overlapStart = (start > monthStart) ? start : monthStart;
      const overlapEnd = (end < monthEnd) ? end : monthEnd;

      const daysInMonth = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
      if (daysInMonth <= 0) { current = new Date(year, month + 1, 1); continue; }

      let amortAmount;
      if (overlapEnd.getTime() === end.getTime() && 
          Math.abs(daysInMonth * ratePerDay - (totalAmt - accumulated)) < 0.05) {
        amortAmount = Math.round((totalAmt - accumulated) * 100) / 100;
      } else {
        amortAmount = Math.round((daysInMonth * ratePerDay) * 100) / 100;
      }

      accumulated += amortAmount;
      if (accumulated > totalAmt && daysInMonth > 0) {
        amortAmount -= (accumulated - totalAmt);
        accumulated = totalAmt;
      }
      accumulated = Math.round(accumulated * 100) / 100;
      const remaining = Math.max(0, Math.round((totalAmt - accumulated) * 100) / 100);

      if (!targetPeriod || period === targetPeriod) {
        results.push({
          period: period, daysInMonth: daysInMonth, amortAmount: Math.round(amortAmount * 100) / 100,
          accumulated: accumulated, remaining: remaining,
          docNo: item.docNo, description: item.description, io: item.io,
          glPrepaid: item.glPrepaid, costCenter: item.costCenter, plate: item.plate
        });
      }

      if (remaining <= 0) break;
      if (targetPeriod && period === targetPeriod) break;
      current = new Date(year, month + 1, 1);
    }
    return results;
  } catch (e) {
    Logger.log('calculateAmortization_ error for doc ' + (item && item.docNo || '?') + ': ' + e.message);
    return [];
  }
}

// ================= RUN AMORTIZATION =================
function runMonthEndAmortization(targetPeriod) {
  try {
    const items = readInputData_();
    let allSchedules = [], totalAmortAmount = 0, activeItems = 0;

    for (let i = 0; i < items.length; i++) {
      const schedule = calculateAmortization_(items[i], targetPeriod);
      if (schedule.length > 0) {
        allSchedules = allSchedules.concat(schedule);
        activeItems++;
        for (let j = 0; j < schedule.length; j++) totalAmortAmount += schedule[j].amortAmount;
      }
    }

    return {
      ok: true,
      message: 'คำนวณ ' + activeItems + ' รายการ (' + allSchedules.length + ' บรรทัด) — ยอดรวม ' + fmtMoney_(totalAmortAmount) + ' บาท',
      totalItems: items.length, activeItems: activeItems,
      scheduleRows: allSchedules.length,
      totalAmount: Math.round(totalAmortAmount * 100) / 100,
      sample: allSchedules.slice(0, 10)
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
