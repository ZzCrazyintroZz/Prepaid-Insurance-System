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
      message: 'Calculated ' + activeItems + ' items (' + allSchedules.length + ' lines) — Total ' + fmtMoney_(totalAmortAmount) + ' THB',
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

/**
 * Full Amortization run — returns KPIs, full schedule (with future periods), SAP preview, and checker.
 * Matches the standalone Prepaid_Amortization_Dashboard.html reference.
 */
function runAmortizationFull(period, company, roundRate, glPrepaid, linesPerJe) {
  try {
    const items = readInputData_();
    const now = new Date();
    const pad2 = function(n) { return (n < 10 ? '0' : '') + n; };
    const fmt = function(n) { return Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); };
    
    // Filter by company
    var filtered = items;
    if (company && company.trim() !== '') {
      filtered = items.filter(function(it) { return String(it.company).trim() === company.trim(); });
    }
    
    // Process each item: get full schedule, find current period row
    var activeItems = [];
    var totalAmortPeriod = 0;
    var totalRemaining = 0;
    var totalBase = 0;
    var allFuturePeriods = new Set();
    var amortMap = {}; // docNo -> {item, cur, full, futureAmts}
    var glMap = {};
    var allLong = []; // long format for wide pivot + running balance
    
    for (var i = 0; i < filtered.length; i++) {
      var it = filtered[i];
      totalBase += Number(it.amount) || 0;
      
      // Get full schedule
      var full = calculateAmortization_(it, null);
      if (!full || full.length === 0) continue;
      
      // Collect long format for wide pivot
      for (var j = 0; j < full.length; j++) {
        allLong.push({
          docNo: it.docNo, docNo2: it.docNo2 || '', description: it.description,
          io: it.io || '', glPrepaid: it.glPrepaid || '', plate: it.plate || '',
          costCenter: it.costCenter || '', startDate: it.startDate, endDate: it.endDate,
          amount: Number(it.amount) || 0,
          period: full[j].period, amortAmount: full[j].amortAmount,
          accumulated: full[j].accumulated, remaining: full[j].remaining
        });
      }
      
      // Find current period row
      var curRow = null;
      for (var j = 0; j < full.length; j++) {
        if (full[j].period === period) { curRow = full[j]; break; }
      }
      if (!curRow || curRow.amortAmount === 0) continue;
      
      // Collect future periods from this item's full schedule
      var futureAmts = {};
      var started = false;
      for (var j = 0; j < full.length; j++) {
        var p = full[j].period;
        if (p === period) started = true;
        if (started) {
          allFuturePeriods.add(p);
          futureAmts[p] = full[j].amortAmount;
        }
      }
      
      totalAmortPeriod += curRow.amortAmount;
      totalRemaining += curRow.remaining;
      
      glMap[it.glPrepaid || 'N/A'] = (glMap[it.glPrepaid || 'N/A'] || 0) + curRow.amortAmount;
      
      amortMap[it.docNo + '_' + i] = {
        docNo: it.docNo, docNo2: it.docNo2 || '', description: it.description,
        plate: it.plate || '', io: it.io || '', gl: it.glPrepaid || '', glName: it.glName || '',
        costCenter: it.costCenter || '', company: it.company || '',
        startDate: it.startDate, endDate: it.endDate, amount: Number(it.amount) || 0,
        curPeriod: curRow.period, curDays: curRow.daysInMonth, curRate: curRow.amortAmount / (curRow.daysInMonth || 1),
        curAmort: curRow.amortAmount, curAccum: curRow.accumulated, curRemain: curRow.remaining,
        futureAmts: futureAmts,
        totalDays: 0
      };
      // Calculate total days
      (function() {
        var s = new Date(it.startDate), e = new Date(it.endDate);
        if (!isNaN(s) && !isNaN(e)) amortMap[it.docNo + '_' + i].totalDays = Math.round((e - s) / (1000*60*60*24)) + 1;
      })();
    }
    
    var activeCount = Object.keys(amortMap).length;
    totalAmortPeriod = Math.round(totalAmortPeriod * 100) / 100;
    totalRemaining = Math.round(totalRemaining * 100) / 100;
    totalBase = Math.round(totalBase * 100) / 100;
    
    // Sort future periods
    var futurePeriods = Array.from(allFuturePeriods).sort();
    
    // Build schedule table rows (sorted for display)
    var scheduleRows = Object.keys(amortMap).sort().map(function(key) {
      var a = amortMap[key];
      var fp = {};
      futurePeriods.forEach(function(p) {
        fp[p] = a.futureAmts[p] || null;
      });
      return {
        company: a.company, plate: a.plate, io: a.io,
        gl: a.gl, glName: a.glName, costCenter: a.costCenter,
        description: a.description,
        startDate: typeof a.startDate === 'object' ? a.startDate.toISOString().slice(0,10) : String(a.startDate).slice(0,10),
        endDate: typeof a.endDate === 'object' ? a.endDate.toISOString().slice(0,10) : String(a.endDate).slice(0,10),
        amount: a.amount,
        totalDays: a.totalDays, ratePerDay: a.curRate,
        curPeriod: a.curPeriod, curDays: a.curDays,
        curAmort: a.curAmort, curAccum: a.curAccum, curRemain: a.curRemain,
        futurePeriods: fp
      };
    });
    
    // GL breakdown
    var glKeys = Object.keys(glMap).sort(function(a,b){ return glMap[b] - glMap[a]; });
    var glBreakdown = glKeys.map(function(g) { return {gl: g, amount: Math.round(glMap[g] * 100) / 100}; });
    
    // Build SAP JE lines
    var glP = glPrepaid || '11370010';
    var cap = Math.max(1, parseInt(linesPerJe) || 900);
    var sapLines = [];
    var seq = 1, debCount = 0, debSum = 0;
    var activeArr = Object.keys(amortMap).sort().map(function(k) { return amortMap[k]; });
    
    function emitCredit() {
      sapLines.push({seq: seq, pk: 50, gl: glP, amount: -Math.round(debSum * 100) / 100, cc: '', io: '', ref: '', text: 'ค่าเบี้ยประกันตัดจ่าย เดือน ' + period.slice(5) + '_' + period.slice(0,4)});
      seq++; debCount = 0; debSum = 0;
    }
    
    for (var a = 0; a < activeArr.length; a++) {
      var item = activeArr[a];
      if (debCount >= cap) emitCredit();
      sapLines.push({seq: seq, pk: 40, gl: item.gl, amount: item.curAmort, cc: item.costCenter, io: item.io, ref: item.plate, text: item.description});
      debCount++; debSum += item.curAmort;
    }
    if (debCount > 0) emitCredit();
    
    // Build checker
    var totalDebits = 0, totalCredits = 0;
    sapLines.forEach(function(l) {
      if (l.pk === 40) totalDebits += Math.abs(l.amount);
      else if (l.pk === 50) totalCredits += Math.abs(l.amount);
    });
    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
    var balanced = Math.abs(totalDebits - totalCredits) < 0.005;
    var noCC = activeArr.filter(function(a) { return !a.costCenter; }).length;
    var noGL = activeArr.filter(function(a) { return !a.gl; }).length;
    var negItems = activeArr.filter(function(a) { return a.curAmort <= 0; }).length;
    
    // Build wide format from long data
    var wideData = pivotToWideFormat_(allLong);
    
    // Build running balance
    var runningBalance = Object.keys(amortMap).sort().map(function(key) {
      var a = amortMap[key];
      return {
        docNo: a.docNo, description: a.description, startDate: a.startDate, endDate: a.endDate,
        amount: a.amount, amortized: a.curAccum, remaining: a.curRemain,
        consumedPct: a.amount > 0 ? Math.round(a.curAccum / a.amount * 10000) / 100 : 0
      };
    });
    
    var checker = [
      {pass: activeCount > 0, text: 'Items in period ' + period + ': ' + activeCount.toLocaleString() + ' items'},
      {pass: noCC === 0, text: 'Cost Center complete (missing ' + noCC + ')'},
      {pass: noGL === 0, text: 'Expense GL complete (missing ' + noGL + ')'},
      {pass: negItems === 0, text: 'Amortization > 0 all items (invalid ' + negItems + ')'},
      {pass: balanced, text: 'Debit = Credit (Dr ' + fmt(totalDebits) + ' / Cr ' + fmt(totalCredits) + ')'},
      {pass: true, text: 'JE count: ' + seq + ' (split every ' + cap + ' debits)'}
    ];
    
    return {
      ok: true,
      period: period,
      kpis: {
        activeItems: activeCount,
        amortAmount: totalAmortPeriod,
        totalRemaining: totalRemaining,
        totalBase: totalBase,
        companyFilter: company || 'ทั้งหมด'
      },
      scheduleRows: scheduleRows,
      futurePeriods: futurePeriods,
      glBreakdown: glBreakdown,
      sapLines: sapLines,
      checker: checker,
      balanced: balanced,
      totalDebits: totalDebits,
      totalCredits: totalCredits,
      wideFormat: { headers: wideData.headers, rows: wideData.rows, monthColumns: wideData.monthColumns },
      runningBalance: runningBalance
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
