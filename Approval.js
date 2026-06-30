// ================= C3: APPROVAL WORKFLOW =================

var APPROVAL_KEY = 'approval_requests_v1';
var APPROVAL_SEQ_KEY = 'approval_seq_v1';

function getApprovalSeq_() {
  var props = PropertiesService.getScriptProperties();
  var seq = Number(props.getProperty(APPROVAL_SEQ_KEY)) || 0;
  seq++;
  props.setProperty(APPROVAL_SEQ_KEY, String(seq));
  return seq;
}

function getApprovalData_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(APPROVAL_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return [];
}

function saveApprovalData_(data) {
  PropertiesService.getScriptProperties().setProperty(APPROVAL_KEY, JSON.stringify(data));
}

/**
 * Submit documents for approval
 * @param {string[]} docNos - Array of document numbers
 * @param {string} notes - Optional notes
 * @returns {Object} {ok, requestId, count, message}
 */
function submitForApproval(docNos, notes) {
  try {
    if (!docNos || !Array.isArray(docNos) || docNos.length === 0) {
      return { ok: false, error: 'Please select at least 1 document' };
    }

    var now = new Date();
    var period = now.getFullYear() + '-' + pad2_(now.getMonth() + 1);
    var user = Session.getActiveUser().getEmail();

    var seq = getApprovalSeq_();
    var reqId = 'REQ-' + now.getFullYear() +
      pad2_(now.getMonth() + 1) + pad2_(now.getDate()) +
      '-' + String(seq).padStart(3, '0');

    var request = {
      id: reqId,
      status: 'pending',
      docNos: docNos,
      period: period,
      submittedBy: user,
      submittedAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      notes: notes || '',
      amortResult: null
    };

    var data = getApprovalData_();
    data.push(request);
    saveApprovalData_(data);

    logAction('Approval', 'Submit for approval: ' + reqId + ' (' + docNos.length + ' docs) by ' + user);

    return { ok: true, message: 'ส่งขออนุมัติ ' + reqId + ' จำนวน ' + docNos.length + ' เอกสาร', requestId: reqId, count: docNos.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get all pending (unresolved) approval requests
 * @returns {Object} {ok, approvals, count}
 */
function getPendingApprovals() {
  try {
    var data = getApprovalData_();
    var pending = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].status === 'pending') {
        pending.push(data[i]);
      }
    }
    pending.sort(function(a,b){ return b.submittedAt.localeCompare(a.submittedAt); });
    return { ok: true, approvals: pending, count: pending.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Approve a pending request — runs amortization automatically
 * @param {string} requestId - REQ-YYYYMMDD-xxx
 * @returns {Object} {ok, message, requestId, period, amortResult}
 */
function approveRequest(requestId) {
  try {
    if (!requestId) return { ok: false, error: 'กรุณาระบุ Request ID' };

    var data = getApprovalData_();
    var found = null;
    var idx = -1;
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === requestId) {
        found = data[i];
        idx = i;
        break;
      }
    }
    if (!found) return { ok: false, error: 'ไม่พบคำขอ: ' + requestId };
    if (found.status !== 'pending') {
      return { ok: false, error: 'คำขอ ' + requestId + ' อยู่ในสถานะ ' + found.status + ' ไม่สามารถอนุมัติได้' };
    }

    var user = Session.getActiveUser().getEmail();
    found.status = 'approved';
    found.approvedBy = user;
    found.approvedAt = new Date().toISOString();

    // Run amortization automatically
    var amortResult = null;
    try {
      amortResult = runMonthEndAmortization(found.period);
      found.amortResult = amortResult && amortResult.ok ? {
        ok: true,
        scheduleRows: amortResult.scheduleRows,
        totalAmount: amortResult.totalAmount,
        activeItems: amortResult.activeItems
      } : { ok: false, error: amortResult ? amortResult.error : 'Amortization failed' };
    } catch (e) {
      found.amortResult = { ok: false, error: e.message };
    }

    data[idx] = found;
    saveApprovalData_(data);

    logAction('Approval', 'Approved: ' + requestId + ' โดย ' + user + ' — รัน amortization งวด ' + found.period);

    return {
      ok: true,
      message: 'อนุมัติ ' + requestId + ' เรียบร้อย — ดำเนินการ amortization งวด ' + found.period,
      requestId: requestId,
      period: found.period,
      amortResult: found.amortResult
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Reject a pending request
 * @param {string} requestId - REQ-YYYYMMDD-xxx
 * @param {string} reason - Rejection reason
 * @returns {Object} {ok, message}
 */
function rejectRequest(requestId, reason) {
  try {
    if (!requestId) return { ok: false, error: 'กรุณาระบุ Request ID' };

    var data = getApprovalData_();
    var found = null;
    var idx = -1;
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === requestId) {
        found = data[i];
        idx = i;
        break;
      }
    }
    if (!found) return { ok: false, error: 'ไม่พบคำขอ: ' + requestId };
    if (found.status !== 'pending') {
      return { ok: false, error: 'คำขอ ' + requestId + ' อยู่ในสถานะ ' + found.status };
    }

    var user = Session.getActiveUser().getEmail();
    found.status = 'rejected';
    found.rejectedBy = user;
    found.rejectedAt = new Date().toISOString();
    found.rejectionReason = reason || '';

    data[idx] = found;
    saveApprovalData_(data);

    logAction('Approval', 'Rejected: ' + requestId + ' โดย ' + user + (reason ? ' — ' + reason : ''));

    return { ok: true, message: 'ปฏิเสธ ' + requestId + ' เรียบร้อย', requestId: requestId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get paginated approval history
 * @param {number} limit - Max items per page (default 50)
 * @param {number} skip - Items to skip (default 0)
 * @returns {Object} {ok, history, total, limit, skip}
 */
function getApprovalHistory(limit, skip) {
  try {
    limit = limit || 50;
    skip = skip || 0;
    var data = getApprovalData_();
    data.sort(function(a,b){ return b.submittedAt.localeCompare(a.submittedAt); });
    var total = data.length;
    var page = data.slice(skip, skip + limit);
    return { ok: true, history: page, total: total, limit: limit, skip: skip };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get approval requests submitted by the current user
 * @returns {Object} {ok, approvals, count}
 */
function getMyApprovalRequests() {
  try {
    var user = Session.getActiveUser().getEmail();
    var data = getApprovalData_();
    var mine = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].submittedBy === user) {
        mine.push(data[i]);
      }
    }
    mine.sort(function(a,b){ return b.submittedAt.localeCompare(a.submittedAt); });
    return { ok: true, approvals: mine, count: mine.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
