// ================= DASHBOARD CONFIG =================
var DASHBOARD_CONFIG_DEFAULTS = {
  showKPIs: true,
  showCharts: true,
  showBudget: true,
  showRunningBalance: true,
  visibleKpis: ['totalItems','totalAmt','curPeriod','avgConsumed','activeItems','completedItems','totalRemaining','avgDuration','expiringThisMonth','momChange','largestItem','healthScore'],
  kpiOrder: ['totalItems','totalAmt','curPeriod','avgConsumed','activeItems','completedItems','totalRemaining','avgDuration','expiringThisMonth','momChange','largestItem','healthScore']
};

function saveDashboardConfig(config) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('dashboardConfig', JSON.stringify(config));
    logAction('Dashboard', 'Dashboard config saved');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getDashboardConfig() {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('dashboardConfig');
    if (saved) {
      var parsed = JSON.parse(saved);
      // Merge with defaults for any missing keys
      for (var k in DASHBOARD_CONFIG_DEFAULTS) {
        if (parsed[k] === undefined) parsed[k] = DASHBOARD_CONFIG_DEFAULTS[k];
      }
      return { ok: true, config: parsed };
    }
    return { ok: true, config: JSON.parse(JSON.stringify(DASHBOARD_CONFIG_DEFAULTS)) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function resetDashboardConfig() {
  try {
    PropertiesService.getScriptProperties().deleteProperty('dashboardConfig');
    logAction('Dashboard', 'Dashboard config reset to defaults');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= BUDGET DATA =================

/**
 * Save budget entries for a period
 * @param {string} period - YYYY-MM
 * @param {Array} items - [{gl, costCenter, description, budgetAmount}, ...]
 */
function setBudgetData(period, items) {
  try {
    if (!period) return { ok: false, error: 'กรุณาระบุงวด' };
    var props = PropertiesService.getScriptProperties();
    var allBudget = {};
    var saved = props.getProperty('budgetData');
    if (saved) allBudget = JSON.parse(saved);
    
    // Clean items
    var cleanItems = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.gl && it.budgetAmount && Number(it.budgetAmount) > 0) {
        cleanItems.push({
          gl: String(it.gl).trim(),
          costCenter: String(it.costCenter || '').trim(),
          description: String(it.description || '').trim(),
          budgetAmount: Math.round(Number(it.budgetAmount) * 100) / 100
        });
      }
    }
    
    allBudget[period] = cleanItems;
    props.setProperty('budgetData', JSON.stringify(allBudget));
    
    // Invalidate cache
    try { CacheService.getScriptCache().remove('dash_v2'); } catch(e) {}
    logAction('Budget', 'Budget data saved for period ' + period + ' (' + cleanItems.length + ' items)');
    
    return { ok: true, message: 'บันทึกงบประมาณสำหรับงวด ' + period + ' เรียบร้อย (' + cleanItems.length + ' รายการ)' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get budget entries for a period
 */
function getBudgetData(period) {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('budgetData');
    if (!saved) return { ok: true, period: period, items: [] };
    var allBudget = JSON.parse(saved);
    var items = allBudget[period] || [];
    return { ok: true, period: period, items: items };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get all periods that have budget data
 */
function getAllBudgetPeriods() {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('budgetData');
    if (!saved) return { ok: true, periods: [] };
    var allBudget = JSON.parse(saved);
    var periods = Object.keys(allBudget).sort();
    return { ok: true, periods: periods };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Compare budget with actual amortization for a period
 */
function getBudgetVsActual(period) {
  try {
    if (!period) return { ok: false, error: 'กรุณาระบุงวด' };
    
    // Get budget data
    var budgetResult = getBudgetData(period);
    if (!budgetResult.ok) return budgetResult;
    var budgetItems = budgetResult.items || [];
    
    // Get actual amortization data from existing engine
    var items = readInputData_();
    var actualMap = {};
    var actualByName = {};
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var schedule = calculateAmortization_(item, period);
      for (var j = 0; j < schedule.length; j++) {
        var s = schedule[j];
        if (s.period !== period) continue;
        var gl = s.glPrepaid || 'N/A';
        var cc = s.costCenter || 'N/A';
        var key = gl + '|' + cc;
        if (!actualMap[key]) {
          actualMap[key] = { gl: gl, costCenter: cc, costName: s.costName || '', amount: 0 };
        }
        actualMap[key].amount += s.amortAmount;
      }
    }
    
    // Round actual amounts
    for (var k in actualMap) {
      actualMap[k].amount = Math.round(actualMap[k].amount * 100) / 100;
    }
    
    // Build comparison items
    var comparisonItems = [];
    var totalBudget = 0;
    var totalActual = 0;
    
    // Process budget items
    for (var i = 0; i < budgetItems.length; i++) {
      var bi = budgetItems[i];
      var key = bi.gl + '|' + bi.costCenter;
      var actual = actualMap[key] ? actualMap[key].amount : 0;
      delete actualMap[key]; // remove matched items
      
      var variance = actual - bi.budgetAmount;
      var pct = bi.budgetAmount > 0 ? Math.round((actual / bi.budgetAmount) * 10000) / 100 : (actual > 0 ? 999 : 0);
      
      comparisonItems.push({
        gl: bi.gl,
        costCenter: bi.costCenter,
        description: bi.description,
        budget: bi.budgetAmount,
        actual: actual,
        variance: Math.round(variance * 100) / 100,
        pct: pct
      });
      
      totalBudget += bi.budgetAmount;
      totalActual += actual;
    }
    
    // Add unmatched actual items
    for (var k in actualMap) {
      var am = actualMap[k];
      comparisonItems.push({
        gl: am.gl,
        costCenter: am.costCenter,
        description: am.costName || '',
        budget: 0,
        actual: am.amount,
        variance: am.amount,
        pct: 999
      });
      totalActual += am.amount;
    }
    
    totalBudget = Math.round(totalBudget * 100) / 100;
    totalActual = Math.round(totalActual * 100) / 100;
    var overallVariance = Math.round((totalActual - totalBudget) * 100) / 100;
    var overallPct = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 10000) / 100 : (totalActual > 0 ? 999 : 0);
    
    return {
      ok: true,
      period: period,
      budget: totalBudget,
      actual: totalActual,
      variance: overallVariance,
      variancePct: overallPct,
      items: comparisonItems
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Summary across all periods with budget data
 */
function getBudgetSummary() {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('budgetData');
    if (!saved) return { ok: true, totalBudget: 0, totalActual: 0, variance: 0, variancePct: 0, periods: 0 };
    
    var allBudget = JSON.parse(saved);
    var periods = Object.keys(allBudget).sort();
    var totalBudget = 0;
    var totalActual = 0;
    
    for (var p = 0; p < periods.length; p++) {
      var period = periods[p];
      var budgetItems = allBudget[period] || [];
      for (var i = 0; i < budgetItems.length; i++) {
        totalBudget += Number(budgetItems[i].budgetAmount) || 0;
      }
      
      // Get actual for this period
      var vsActual = getBudgetVsActual(period);
      if (vsActual.ok) {
        totalActual += vsActual.actual;
      }
    }
    
    totalBudget = Math.round(totalBudget * 100) / 100;
    totalActual = Math.round(totalActual * 100) / 100;
    var variance = Math.round((totalActual - totalBudget) * 100) / 100;
    var variancePct = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 10000) / 100 : (totalActual > 0 ? 999 : 0);
    
    return {
      ok: true,
      totalBudget: totalBudget,
      totalActual: totalActual,
      variance: variance,
      variancePct: variancePct,
      periods: periods.length
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= DASHBOARD DATA =================
function getDashboardData() {
  try {
    var cacheKey = 'dash_v2';
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.trend) return parsed;
    }
    
    // Invalidate old cache keys (A1)
    try { CacheService.getScriptCache().remove('dash_data'); } catch(e) {}
    try { CacheService.getScriptCache().remove('dashboard_data'); } catch(e) {}
    
    var items = readInputData_();
    var now = new Date();
    var currentPeriod = now.getFullYear() + '-' + pad2_(now.getMonth() + 1);
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();
    
    // --- Accumulators ---
    var trendMap = {};
    var glMap = {};
    var glNameMap = {};  // A2: track GL name per GL code
    var ioMap = {};
    var ccPeriodMap = {};
    var companyMap = {};
    var activeByMonthMap = {};
    
    var activeCount = 0;
    var completedCount = 0;
    var totalRemainingSum = 0;
    var totalDurationDays = 0;
    var itemsWithDuration = 0;
    var expiringThisMonthCount = 0;
    var maxAmount = 0;
    var largestItem = null;
    var expiringSoonList = [];
    
    // Data quality counters
    var missingIOCount = 0;
    var missingGLCount = 0;
    var invalidDatesCount = 0;
    var zeroAmountsCount = 0;
    var validItemsCount = 0;
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      
      // --- Data quality checks ---
      var qualityIssue = false;
      if (!item.io || item.io.trim() === '') { missingIOCount++; qualityIssue = true; }
      if (!item.glPrepaid || item.glPrepaid.trim() === '') { missingGLCount++; qualityIssue = true; }
      
      var start = new Date(item.startDate);
      var end = new Date(item.endDate);
      var datesValid = !isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end;
      if (!datesValid) { invalidDatesCount++; qualityIssue = true; }
      
      if (!item.amount || item.amount <= 0) { zeroAmountsCount++; qualityIssue = true; }
      if (!qualityIssue) validItemsCount++;
      
      // --- Active / Completed (based on endDate) ---
      if (datesValid) {
        if (end >= now) {
          activeCount++;
        } else {
          completedCount++;
        }
        
        // --- Duration (for avgDurationMonths) ---
        var diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
        totalDurationDays += diffDays;
        itemsWithDuration++;
        
        // --- Expiring this month ---
        if (end.getFullYear() === currentYear && end.getMonth() === currentMonth) {
          expiringThisMonthCount++;
        }
      }
      
      // --- Largest single item (S-6) ---
      if (item.amount > maxAmount) {
        maxAmount = item.amount;
        largestItem = { docNo: item.docNo, description: item.description, amount: item.amount };
      }
      
      // --- Amortization engine (single pass) ---
      var schedule = calculateAmortization_(item, null);
      var lastRemaining = 0;
      
      if (schedule.length > 0) {
        lastRemaining = schedule[schedule.length - 1].remaining;
        totalRemainingSum += lastRemaining;
      }
      
      for (var j = 0; j < schedule.length; j++) {
        var s = schedule[j];
        
        // Trend: aggregate all periods (existing)
        trendMap[s.period] = (trendMap[s.period] || 0) + s.amortAmount;
        
        // Current-period aggregations
        if (s.period === currentPeriod) {
          // GL breakdown (existing)
          var gl = s.glPrepaid || 'N/A';
          glMap[gl] = (glMap[gl] || 0) + s.amortAmount;
          
          // A2: track GL name for this GL code
          if (item.glName && !glNameMap[gl]) glNameMap[gl] = item.glName;
          
          // IO breakdown (S-11)
          var ioKey = s.io || 'N/A';
          ioMap[ioKey] = (ioMap[ioKey] || 0) + s.amortAmount;
          
          // Company breakdown (S-8)
          var co = item.company || 'N/A';
          companyMap[co] = (companyMap[co] || 0) + s.amortAmount;
        }
        
        // Cost Center × Period breakdown (S-7)
        var ccKey = (s.costCenter || 'N/A') + '|' + s.period;
        ccPeriodMap[ccKey] = (ccPeriodMap[ccKey] || 0) + s.amortAmount;
        
        // Active items by month (S-9): count items with overlap in each period
        activeByMonthMap[s.period] = (activeByMonthMap[s.period] || 0) + 1;
      }
      
      // --- Expiring soon candidate (S-12) ---
      if (datesValid && schedule.length > 0) {
        expiringSoonList.push({
          docNo: item.docNo,
          docNo2: item.docNo2 || '',
          description: item.description,
          endDate: fmtDate_(end),
          amount: item.amount,
          remaining: lastRemaining,
          _sortTime: end.getTime()
        });
      }
    }
    
    // --- Build trend (existing) ---
    var periods = Object.keys(trendMap).sort();
    var trend = [];
    for (var p = 0; p < periods.length; p++) {
      trend.push({period: periods[p], amount: Math.round(trendMap[periods[p]] * 100) / 100});
    }
    
    // --- Accumulated trend (S-10) ---
    var accumulatedTrend = [];
    var cumSum = 0;
    for (var p = 0; p < periods.length; p++) {
      cumSum += trendMap[periods[p]];
      accumulatedTrend.push({period: periods[p], accumulated: Math.round(cumSum * 100) / 100});
    }
    
    // --- GL breakdown (existing) ---
    var glKeys = Object.keys(glMap).sort(function(a,b){ return glMap[b] - glMap[a]; });
    var glBreakdown = [];
    for (var g = 0; g < glKeys.length; g++) {
      glBreakdown.push({gl: glKeys[g], glName: glNameMap[glKeys[g]] || '', amount: Math.round(glMap[glKeys[g]] * 100) / 100});
    }
    
    // --- IO breakdown (S-11) ---
    var ioKeys = Object.keys(ioMap).sort(function(a,b){ return ioMap[b] - ioMap[a]; });
    var ioBreakdown = [];
    for (var k = 0; k < ioKeys.length; k++) {
      ioBreakdown.push({io: ioKeys[k], amount: Math.round(ioMap[ioKeys[k]] * 100) / 100});
    }
    
    // --- Cost Center breakdown (S-7) ---
    var ccKeys = Object.keys(ccPeriodMap).sort();
    var ccBreakdown = [];
    for (var k = 0; k < ccKeys.length; k++) {
      var sep = ccKeys[k].lastIndexOf('|');
      ccBreakdown.push({
        cc: ccKeys[k].substring(0, sep),
        period: ccKeys[k].substring(sep + 1),
        amount: Math.round(ccPeriodMap[ccKeys[k]] * 100) / 100
      });
    }
    
    // --- Company breakdown (S-8) ---
    var coKeys = Object.keys(companyMap).sort(function(a,b){ return companyMap[b] - companyMap[a]; });
    var companyBreakdown = [];
    for (var k = 0; k < coKeys.length; k++) {
      companyBreakdown.push({company: coKeys[k], amount: Math.round(companyMap[coKeys[k]] * 100) / 100});
    }
    
    // --- Active items by month (S-9) ---
    var abmPeriods = Object.keys(activeByMonthMap).sort();
    var activeItemsByMonth = [];
    for (var p = 0; p < abmPeriods.length; p++) {
      activeItemsByMonth.push({period: abmPeriods[p], count: activeByMonthMap[abmPeriods[p]]});
    }
    
    // --- Expiring soon top 10 (S-12) ---
    expiringSoonList.sort(function(a,b){ return a._sortTime - b._sortTime; });
    var expiringSoon = [];
    for (var k = 0; k < Math.min(expiringSoonList.length, 10); k++) {
      var es = expiringSoonList[k];
      expiringSoon.push({
        docNo: es.docNo,
        docNo2: es.docNo2 || '',
        description: es.description,
        endDate: es.endDate,
        amount: es.amount,
        remaining: es.remaining
      });
    }
    
    // --- Month-over-month change (S-5) ---
    var momChange = null;
    if (trend.length >= 2) {
      var lastIdx = trend.length - 1;
      var prevIdx = trend.length - 2;
      var curAmt = trend[lastIdx].amount;
      var prevAmt = trend[prevIdx].amount;
      if (prevAmt !== 0) {
        momChange = {
          period: trend[lastIdx].period,
          amount: curAmt,
          changePercent: Math.round((curAmt - prevAmt) / prevAmt * 10000) / 100
        };
      } else {
        momChange = {
          period: trend[lastIdx].period,
          amount: curAmt,
          changePercent: curAmt > 0 ? 100 : 0
        };
      }
    }
    
    // --- Average duration in months (S-3) ---
    var avgDurationMonths = itemsWithDuration > 0
      ? Math.round(totalDurationDays / itemsWithDuration / 30 * 10) / 10
      : 0;
    
    // --- Data quality summary (S-13) ---
    var dataQuality = {
      missingIO: missingIOCount,
      missingGL: missingGLCount,
      invalidDates: invalidDatesCount,
      zeroAmounts: zeroAmountsCount
    };
    
    // --- Health score (S-15) ---
    var totalItems = items.length;
    var healthScore = totalItems > 0 ? Math.round(validItemsCount / totalItems * 100) : 100;
    
    // --- Total amortization (existing) ---
    var totalAmt = 0;
    for (var ti = 0; ti < items.length; ti++) totalAmt += items[ti].amount;
    
    // Include budget summary
    var budgetSummary = getBudgetSummary();
    var budgetData = budgetSummary.ok ? budgetSummary : null;
    
    // Get dashboard config
    var dashConfig = getDashboardConfig();
    var config = dashConfig.ok ? dashConfig.config : DASHBOARD_CONFIG_DEFAULTS;
    
    var result = {
      ok: true,
      totalItems: totalItems,
      currentPeriod: currentPeriod,
      totalAmortization: Math.round(totalAmt * 100) / 100,
      trend: trend,
      glBreakdown: glBreakdown,
      scheduleRows: trend.length > 0 ? 'calculated' : 'none',
      // === NEW DASHBOARD FIELDS ===
      activeItems: activeCount,
      completedItems: completedCount,
      totalRemaining: Math.round(totalRemainingSum * 100) / 100,
      avgDurationMonths: avgDurationMonths,
      expiringThisMonth: expiringThisMonthCount,
      momChange: momChange,
      largestItem: largestItem,
      ccBreakdown: ccBreakdown,
      companyBreakdown: companyBreakdown,
      activeItemsByMonth: activeItemsByMonth,
      accumulatedTrend: accumulatedTrend,
      ioBreakdown: ioBreakdown,
      expiringSoon: expiringSoon,
      dataQuality: dataQuality,
      healthScore: healthScore,
      // === BUDGET SUMMARY ===
      budgetSummary: budgetData,
      // === DASHBOARD CONFIG ===
      dashboardConfig: config
    };
    
    // Cache 5 min
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 300); } catch(e) {}
    
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
