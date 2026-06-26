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
      healthScore: healthScore
    };
    
    // Cache 5 min
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 300); } catch(e) {}
    
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
