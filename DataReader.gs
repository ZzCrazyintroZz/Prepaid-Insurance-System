/*************************************************************
 * DataReader.gs — Multi-sheet CSV reader + join logic
 * Reads 4 published Google Sheets via export?output=csv
 *************************************************************/

const SHEET_CONFIG = {
  VEHICLE: {
    id: '2PACX-1vSeWuO-BzN6g7OlftTk6IGjC1P76g-_JAwa6Ypy__D39wnmKBf0zxK9WO-NqaeVM5qOwtHNCiJJsBIv',
    gid: '302964062',
    name: 'DATA ทะเบียนคุมรถ'
  },
  PAYMENT: {
    id: '2PACX-1vTHQIhI_M9_nFfJkpNGVnQimjqzGS1Uo8i0LIHx2I4v6Mc2SEeczSzX_m50avBtG52hyVEryuDW5D5T',
    gid: '2098665604',
    name: 'payment system'
  },
  SAP_TEMPLATE: {
    id: '2PACX-1vTGC_YuJPOtuycdL7kqsJklNkfFE25tx_F6YxK4i9jAmDt1jIWKfLjTLvvN7YN82bDyAS-mmwYtgZpR',
    gid: '1516889989',
    name: 'SAP Template'
  },
  VEHICLE_EXT: {
    id: '2PACX-1vQ4GmwUhBbAqwLaEUwd5WTdASrQUFBfZAI2MdFq3QkA',
    gid: '0',
    name: 'Vehicle Extended'
  }
};

const CACHE_TTL = 300;

function fetchCsv_(config) {
  const cache = CacheService.getScriptCache();
  const key = 'csv_' + config.id + '_' + config.gid;
  let data = cache.get(key);
  if (data) return JSON.parse(data);

  const url = 'https://docs.google.com/spreadsheets/d/e/' + config.id + '/pub?output=csv&gid=' + config.gid;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Failed to fetch ' + config.name + ': ' + res.getResponseCode());

  const text = res.getContentText();
  data = Utilities.parseCsv(text);
  cache.put(key, JSON.stringify(data), CACHE_TTL);
  return data;
}

function getVehicleLookup() {
  const data = fetchCsv_(SHEET_CONFIG.VEHICLE);
  if (!data.length) return {};

  const headers = data[0];
  const plateIdx = headers.indexOf('ทะเบียนรถ');
  const ioIdx = headers.indexOf('เลข IO');
  const ccIdx = headers.indexOf('Coct Center');
  if (plateIdx < 0 || ioIdx < 0) throw new Error('Vehicle sheet missing required columns');

  const lookup = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const plate = String(row[plateIdx] || '').trim();
    if (plate) lookup[plate] = { io: String(row[ioIdx] || '').trim(), cc: String(row[ccIdx] || '').trim() };
  }
  return lookup;
}

function readPaymentSystem() {
  const data = fetchCsv_(SHEET_CONFIG.PAYMENT);
  if (data.length < 4) throw new Error('Payment System sheet has unexpected structure (need 3 header rows + data)');

  const headers = data[2];
  const vehicleLookup = getVehicleLookup();

  const colIdx = {};
  headers.forEach((h, i) => colIdx[String(h).trim()] = i);

  const required = ['เลขที่ DOC', 'ทะเบียนรถ', 'GL', 'Cost center', 'IO', 'เริ่มต้น', 'สิ้นสุด', 'จำนวนเงิน'];
  required.forEach(r => { if (!(r in colIdx)) throw new Error('Missing column: ' + r); });

  const rows = [];
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    const docNo = String(row[colIdx['เลขที่ DOC']] || '').trim();
    if (!docNo) continue;

    const plate = String(row[colIdx['ทะเบียนรถ']] || '').trim();
    const lookup = vehicleLookup[plate] || {};

    rows.push({
      docNo: docNo,
      docRef: String(row[colIdx['เลขที่ เอกสาร']] || '').trim(),
      desc: String(row[colIdx['รายการ']] || '').trim(),
      plate: plate,
      expenseGL: String(row[colIdx['GL']] || '').trim(),
      glName: String(row[colIdx['GL-Name']] || '').trim(),
      cc: String(row[colIdx['Cost center']] || '').trim(),
      ccName: String(row[colIdx['Cost-Name']] || '').trim(),
      io: String(row[colIdx['IO']] || '').trim() || lookup.io,
      type: String(row[colIdx['ประเภทค่าเบี้ยประกัน']] || '').trim(),
      start: String(row[colIdx['เริ่มต้น']] || '').trim(),
      end: String(row[colIdx['สิ้นสุด']] || '').trim(),
      total: parseFloat(String(row[colIdx['จำนวนเงิน']] || '0').replace(/,/g, '')) || 0
    });
  }
  return rows;
}

function daysBetween(start, end) {
  const a = new Date(start), b = new Date(end);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function monthDiff(start, end) {
  const a = new Date(start), b = new Date(end);
  if (isNaN(a) || isNaN(b)) return 0;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

function computePeriodCalcs(items) {
  return items.map(it => {
    const totalDays = daysBetween(it.start, it.end);
    const months = monthDiff(it.start, it.end);
    const daysRemainder = totalDays % 30;
    const dailyCost = totalDays > 0 ? it.total / totalDays : 0;
    return { ...it, totalDays, months, daysRemainder, dailyCost };
  });
}

function buildSchedule(item) {
  const start = new Date(item.start), end = new Date(item.end);
  if (isNaN(start) || isNaN(end)) return [];
  const totalDays = item.totalDays || daysBetween(start, end);
  const daily = item.total / totalDays;
  const rows = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const mStart = new Date(Math.max(cur, start));
    const mEnd = new Date(Math.min(new Date(cur.getFullYear(), cur.getMonth() + 1, 0), end));
    const d = daysBetween(mStart, mEnd);
    const amt = Math.round(daily * d * 100) / 100;
    rows.push({ period: cur.getFullYear() + '-' + ('0' + (cur.getMonth() + 1)).slice(-2), days: d, amount: amt });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return rows;
}

function summarize(item, asOfPeriod) {
  const sched = buildSchedule(item);
  const cut = asOfPeriod || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM');
  const accum = sched.filter(s => s.period <= cut).reduce((a, s) => a + s.amount, 0);
  const total = item.total || 0;
  const remainMonths = sched.filter(s => s.period > cut).length;
  const monthAmt = (sched.find(s => s.period === cut) || {}).amount || 0;
  return {
    total: total, accum: Math.round(accum * 100) / 100, remain: Math.round((total - accum) * 100) / 100,
    remainMonths, monthAmt: Math.round(monthAmt * 100) / 100,
    status: remainMonths === 0 ? 'Completed' : remainMonths <= 1 ? 'Near-End' : 'Active',
    sched
  };
}

function computeAmortCols(items, period) {
  const cutoff = period || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM');
  return items.map(it => {
    const s = summarize(it, cutoff);
    const prior = s.sched.filter(x => x.period < cutoff).reduce((a, x) => a + x.amount, 0);
    const current = s.monthAmt;
    const manualR = it.manualR || 0;
    return { ...it, amortPrior: Math.round(prior * 100) / 100, amortCur: Math.round(current * 100) / 100, remainCalc: Math.round((manualR - prior - current) * 100) / 100 };
  });
}

function syncVehicleRegistry() {
  try {
    const lookup = getVehicleLookup();
    const cache = CacheService.getScriptCache();
    cache.put('vehicle_lookup', JSON.stringify(lookup), 86400);
    Logger.log('Vehicle registry synced: ' + Object.keys(lookup).length + ' plates');
  } catch (e) {
    Logger.log('syncVehicleRegistry failed: ' + e);
    MailApp.sendEmail({ to: 'tippawan.si@pt.co.th', subject: '❌ Vehicle Sync Failed', htmlBody: e.toString() });
  }
}

function syncVehicleExtended() {
  try {
    const data = fetchCsv_(SHEET_CONFIG.VEHICLE_EXT);
    const cache = CacheService.getScriptCache();
    cache.put('vehicle_ext_data', JSON.stringify(data), 86400);
    Logger.log('Vehicle extended synced: ' + data.length + ' rows');
  } catch (e) {
    Logger.log('syncVehicleExtended failed: ' + e);
  }
}

function onEditPaymentSystem(e) {
  try {
    const range = e.range;
    const sheet = range.getSheet();
    if (sheet.getName() !== 'payment system') return;
    const row = range.getRow(), col = range.getColumn();
    if (row < 4) return; // header rows

    const headers = sheet.getRange(3, 1, 1, sheet.getLastColumn()).getValues()[0];
    const startIdx = headers.indexOf('เริ่มต้น') + 1;
    const endIdx = headers.indexOf('สิ้นสุด') + 1;
    const totalIdx = headers.indexOf('จำนวนเงิน') + 1;
    const monthIdx = headers.indexOf('Month') + 1;
    const dateIdx = headers.indexOf('Date') + 1;
    const dayIdx = headers.indexOf('Day') + 1;

    if (col === startIdx || col === endIdx || col === totalIdx) {
      const start = sheet.getRange(row, startIdx).getValue();
      const end = sheet.getRange(row, endIdx).getValue();
      const total = parseFloat(String(sheet.getRange(row, totalIdx).getValue() || '0').replace(/,/g, '')) || 0;
      if (start && end) {
        const totalDays = daysBetween(start, end);
        const months = monthDiff(start, end);
        if (monthIdx) sheet.getRange(row, monthIdx).setValue(months);
        if (dateIdx) sheet.getRange(row, dateIdx).setValue(totalDays % 30);
        if (dayIdx) sheet.getRange(row, dayIdx).setValue(totalDays);
      }
    }
  } catch (e) {
    Logger.log('onEditPaymentSystem failed: ' + e);
  }
}

function installAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncVehicleRegistry').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('syncVehicleExtended').timeBased().atHour(7).onMonthDay(1).inTimezone('Asia/Bangkok').create();
  ScriptApp.newTrigger('checkAndNotify').timeBased().atHour(8).everyDays(1).inTimezone('Asia/Bangkok').create();
  SpreadsheetApp.getActive().toast('Triggers installed: Vehicle(06:00), Ext(1st 07:00), Alert(08:00)', 'สำเร็จ', 5);
}
