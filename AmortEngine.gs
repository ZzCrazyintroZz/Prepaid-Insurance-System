// ================= AMORTIZATION ENGINE (with caching) =================
var _amortCache = {};
var _amortCacheTime = {};
var _AMORT_CACHE_TTL = 120 * 1000; // 120 seconds in-session

function invalidateAmortCache() {
  _amortCache = {};
  _amortCacheTime = {};
}

function _amortCacheKey_(item, targetPeriod) {
  return (item.docNo || '?') + '|' + (targetPeriod || '__ALL__');
}

function calculateAmortization_(item, targetPeriod) {
  try {
    // Check module-level cache
    var cacheKey = _amortCacheKey_(item, targetPeriod);
    var now = Date.now();
    if (_amortCache[cacheKey] !== undefined && (now - (_amortCacheTime[cacheKey] || 0)) < _AMORT_CACHE_TTL) {
      return _amortCache[cacheKey];
    }
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
          docNo: item.docNo, docNo2: item.docNo2 || '', description: item.description, io: item.io,
          glPrepaid: item.glPrepaid, glName: item.glName || '',
          costCenter: item.costCenter, costName: item.costName || '', plate: item.plate
        });
      }

      if (remaining <= 0) break;
      if (targetPeriod && period === targetPeriod) break;
      current = new Date(year, month + 1, 1);
    }
    // Cache the result
    _amortCache[cacheKey] = results;
    _amortCacheTime[cacheKey] = Date.now();
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

    // Multi-period: if targetPeriod is an array, run for each period and combine
    if (Array.isArray(targetPeriod)) {
      const periodList = targetPeriod;
      let allSchedules = [], totalAmortAmount = 0;
      const perPeriodResults = [];

      for (let p = 0; p < periodList.length; p++) {
        const period = periodList[p];
        let periodSchedules = [], periodAmount = 0, periodActive = 0;

        for (let i = 0; i < items.length; i++) {
          const schedule = calculateAmortization_(items[i], period);
          if (schedule.length > 0) {
            periodSchedules = periodSchedules.concat(schedule);
            periodActive++;
            for (let j = 0; j < schedule.length; j++) periodAmount += schedule[j].amortAmount;
          }
        }

        perPeriodResults.push({
          period: period,
          activeItems: periodActive,
          scheduleRows: periodSchedules.length,
          totalAmount: Math.round(periodAmount * 100) / 100,
          sample: periodSchedules.slice(0, 8)
        });

        allSchedules = allSchedules.concat(periodSchedules);
        totalAmortAmount += periodAmount;
      }

      const totalActive = perPeriodResults.reduce(function(sum, r) { return sum + r.activeItems; }, 0);

      return {
        ok: true,
        message: 'Multi-period (' + periodList.length + ' งวด): ' + allSchedules.length + ' บรรทัด — ยอดรวม ' + fmtMoney_(totalAmortAmount) + ' บาท',
        totalItems: items.length,
        activeItems: totalActive,
        scheduleRows: allSchedules.length,
        totalAmount: Math.round(totalAmortAmount * 100) / 100,
        sample: allSchedules.slice(0, 15),
        perPeriod: perPeriodResults,
        isMultiPeriod: true
      };
    }

    // Single-period (original behavior, backward compatible)
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
      sample: allSchedules.slice(0, 10),
      isMultiPeriod: false
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
