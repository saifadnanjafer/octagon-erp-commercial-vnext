/**
 * OCTAGON ERP — SERVER-SIDE JARVIS READ-BACK VERIFICATION
 * (Post-Execution Verification Sprint 2026-07-05)
 *
 * Verifies execution results by reading directly from the real system
 * (SQLite or database.json) instead of trusting client state.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APPROVALS_FILE = process.env.OCTAGON_JARVIS_APPROVALS_FILE
  ? path.resolve(process.env.OCTAGON_JARVIS_APPROVALS_FILE)
  : path.join(__dirname, 'approvals_queue.json');

let H = null; // { loadDbForMutation }
function init(helpers) { H = helpers; }

function loadApprovals() {
  try { return JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf8')); } catch (_) { return []; }
}

function trimmed(v) { return (v == null) ? '' : String(v).trim(); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function buildVerificationPlan(toolName, args, executionResult, context) {
  // Returns a list of checks to perform
  return {
    toolName,
    args,
    executionResult
  };
}

function verifyCreateTask(db, args, resVal) {
  const taskId = resVal.taskId;
  if (!taskId) return { verified: false, confidence: 'low', warnings: ['No taskId returned from executor.'] };

  const omni = db.omni || {};
  const tm = omni.taskManager || {};
  const spaces = Array.isArray(tm.spaces) ? tm.spaces : [];

  let foundTask = null;
  for (const space of spaces) {
    const deps = Array.isArray(space.departments) ? space.departments : [];
    for (const dep of deps) {
      const secs = Array.isArray(dep.sections) ? dep.sections : [];
      for (const sec of secs) {
        const types = Array.isArray(sec.taskTypes) ? sec.taskTypes : [];
        for (const type of types) {
          const tasks = Array.isArray(type.tasks) ? type.tasks : [];
          foundTask = tasks.find(t => t && t.id === taskId);
          if (foundTask) break;
        }
        if (foundTask) break;
      }
      if (foundTask) break;
    }
    if (foundTask) break;
  }

  if (!foundTask) {
    return {
      verified: false,
      confidence: 'low',
      method: 'read_back_db',
      target: 'task',
      checks: [{ name: 'record_exists', passed: false }],
      warnings: ['Task record not found in database.']
    };
  }

  const expectedTitle = trimmed(args.title || args.name || args.task);
  const titleMatches = trimmed(foundTask.title) === expectedTitle;

  return {
    verified: titleMatches,
    confidence: titleMatches ? 'high' : 'medium',
    method: 'read_back_db',
    target: 'task',
    matchedId: taskId,
    checks: [
      { name: 'record_exists', passed: true },
      { name: 'field_match_title', passed: titleMatches }
    ],
    warnings: titleMatches ? [] : ['Task found but title does not match.']
  };
}

function verifyCreateCustomer(db, args, resVal) {
  const customerId = resVal.customerId;
  if (!customerId) return { verified: false, confidence: 'low', warnings: ['No customerId returned from executor.'] };

  const customers = (db.finance && Array.isArray(db.finance.customers)) ? db.finance.customers : [];
  const found = customers.find(c => c && c.id === customerId);

  if (!found) {
    return {
      verified: false,
      confidence: 'low',
      method: 'read_back_db',
      target: 'customer',
      checks: [{ name: 'record_exists', passed: false }],
      warnings: ['Customer record not found in database.']
    };
  }

  const expectedName = trimmed(args.customer_name || args.name);
  const nameMatches = trimmed(found.name) === expectedName;

  return {
    verified: nameMatches,
    confidence: nameMatches ? 'high' : 'medium',
    method: 'read_back_db',
    target: 'customer',
    matchedId: customerId,
    checks: [
      { name: 'record_exists', passed: true },
      { name: 'field_match_name', passed: nameMatches }
    ],
    warnings: nameMatches ? [] : ['Customer found but name does not match.']
  };
}

function verifyFinanceTransaction(db, toolName, args, resVal) {
  const txId = resVal.txId;
  if (!txId) return { verified: false, confidence: 'low', warnings: ['No txId returned from executor.'] };

  const txs = (db.finance && Array.isArray(db.finance.transactions)) ? db.finance.transactions : [];
  const found = txs.find(t => t && t.id === txId);

  if (!found) {
    return {
      verified: false,
      confidence: 'low',
      method: 'read_back_db',
      target: 'transaction',
      checks: [{ name: 'record_exists', passed: false }],
      warnings: ['Transaction record not found in database.']
    };
  }

  const expectedAmount = num(args.amount);
  const amountMatches = num(found.amount) === expectedAmount;

  return {
    verified: amountMatches,
    confidence: amountMatches ? 'high' : 'medium',
    method: 'read_back_db',
    target: 'transaction',
    matchedId: txId,
    checks: [
      { name: 'record_exists', passed: true },
      { name: 'field_match_amount', passed: amountMatches }
    ],
    warnings: amountMatches ? [] : ['Transaction amount mismatch.']
  };
}

function verifyMaterialModification(db, args, resVal) {
  const matId = resVal.materialId;
  if (!matId) return { verified: false, confidence: 'low', warnings: ['No materialId returned from executor.'] };

  const omni = db.omni || {};
  const mats = Array.isArray(omni.materials) ? omni.materials : [];
  const found = mats.find(m => m && m.id === matId);

  if (!found) {
    return {
      verified: false,
      confidence: 'low',
      method: 'read_back_db',
      target: 'material',
      checks: [{ name: 'record_exists', passed: false }],
      warnings: ['Material record not found in database.']
    };
  }

  const checks = [{ name: 'record_exists', passed: true }];
  let verified = true;
  
  if (args.cost !== undefined) {
    const costMatch = num(found.cost) === num(args.cost);
    checks.push({ name: 'field_match_cost', passed: costMatch });
    if (!costMatch) verified = false;
  }
  if (args.stock !== undefined) {
    const stockMatch = num(found.stock) === num(args.stock);
    checks.push({ name: 'field_match_stock', passed: stockMatch });
    if (!stockMatch) verified = false;
  }

  return {
    verified,
    confidence: verified ? 'high' : 'medium',
    method: 'read_back_db',
    target: 'material',
    matchedId: matId,
    checks,
    warnings: verified ? [] : ['Some updated fields did not match in DB.']
  };
}

function verifyEmployeeModification(db, args, resVal) {
  const empId = resVal.employeeId;
  if (!empId) return { verified: false, confidence: 'low', warnings: ['No employeeId returned from executor.'] };

  const employees = Array.isArray(db.employees) ? db.employees : [];
  const found = employees.find(e => e && e.id === empId);

  if (!found) {
    return {
      verified: false,
      confidence: 'low',
      method: 'read_back_db',
      target: 'employee',
      checks: [{ name: 'record_exists', passed: false }],
      warnings: ['Employee record not found in database.']
    };
  }

  const checks = [{ name: 'record_exists', passed: true }];
  let verified = true;

  if (args.salary !== undefined) {
    const salaryMatch = num(found.salary) === num(args.salary);
    checks.push({ name: 'field_match_salary', passed: salaryMatch });
    if (!salaryMatch) verified = false;
  }
  if (args.role !== undefined) {
    const roleMatch = trimmed(found.role) === trimmed(args.role);
    checks.push({ name: 'field_match_role', passed: roleMatch });
    if (!roleMatch) verified = false;
  }

  return {
    verified,
    confidence: verified ? 'high' : 'medium',
    method: 'read_back_db',
    target: 'employee',
    matchedId: empId,
    checks,
    warnings: verified ? [] : ['Some updated fields did not match in DB.']
  };
}

function verifyApprovalExecution(context) {
  const approvalId = context.approvalId;
  if (!approvalId) return { verified: false, confidence: 'low', warnings: ['No approvalId provided in context.'] };

  const list = loadApprovals();
  const found = list.find(r => r.id === approvalId);

  if (!found) {
    return {
      verified: false,
      confidence: 'low',
      method: 'read_back_approvals',
      target: 'approval_record',
      checks: [{ name: 'approval_exists', passed: false }],
      warnings: ['Approval record not found.']
    };
  }

  const isExecuted = found.status === 'executed';
  return {
    verified: isExecuted,
    confidence: isExecuted ? 'high' : 'low',
    method: 'read_back_approvals',
    target: 'approval_record',
    matchedId: approvalId,
    checks: [
      { name: 'approval_exists', passed: true },
      { name: 'status_is_executed', passed: isExecuted }
    ],
    warnings: isExecuted ? [] : ['Approval status is ' + found.status + ' instead of executed.']
  };
}

function verifyExecution(toolName, args, executionResult, context) {
  context = context || {};
  if (!H || typeof H.loadDbForMutation !== 'function') {
    return { verified: null, confidence: 'low', warnings: ['Verification helpers not initialized.'] };
  }

  // Handle refused/denied tools immediately
  if (toolName === 'execute_js_mutation' || executionResult.status === 'denied') {
    return {
      verified: false,
      confidence: 'high',
      method: 'denied_check',
      target: 'denied_tool',
      checks: [{ name: 'prevented_execution', passed: true }],
      warnings: ['Action was denied or refused by policy.']
    };
  }

  let db;
  try {
    db = H.loadDbForMutation();
  } catch (e) {
    return { verified: null, confidence: 'low', warnings: ['Failed to load DB for verification: ' + e.message] };
  }

  const resVal = executionResult.result || {};

  // Verify the specific DB changes
  let dbVerify = { verified: null };
  if (toolName === 'create_task') {
    dbVerify = verifyCreateTask(db, args, resVal);
  } else if (toolName === 'create_customer') {
    dbVerify = verifyCreateCustomer(db, args, resVal);
  } else if (['add_customer_debt', 'record_customer_payment', 'create_purchase_expense', 'create_sales_receipt'].includes(toolName)) {
    dbVerify = verifyFinanceTransaction(db, toolName, args, resVal);
  } else if (toolName === 'modify_material') {
    dbVerify = verifyMaterialModification(db, args, resVal);
  } else if (toolName === 'modify_employee') {
    dbVerify = verifyEmployeeModification(db, args, resVal);
  } else if (toolName === 'create_journal_entry') {
    const entryId = resVal.pendingEntryId;
    if (!entryId) {
      dbVerify = { verified: false, confidence: 'low', warnings: ['No pendingEntryId returned.'] };
    } else {
      const omni = db.omni || {};
      const entries = Array.isArray(omni.aiPendingJournalEntries) ? omni.aiPendingJournalEntries : [];
      const found = entries.find(e => e && e.id === entryId);
      if (!found) {
        dbVerify = { verified: false, confidence: 'low', target: 'journal_entry', checks: [{ name: 'record_exists', passed: false }] };
      } else {
        const isAwaiting = found.state === 'awaiting_finance_engine';
        dbVerify = {
          verified: isAwaiting,
          confidence: isAwaiting ? 'high' : 'medium',
          target: 'journal_entry',
          matchedId: entryId,
          checks: [
            { name: 'record_exists', passed: true },
            { name: 'state_awaiting_engine', passed: isAwaiting }
          ]
        };
      }
    }
  }

  // Verify the approval status itself if executing an approved action
  let approvalVerify = null;
  if (context.approvalId) {
    approvalVerify = verifyApprovalExecution(context);
  }

  // Combine results
  if (approvalVerify) {
    if (dbVerify.verified === false || approvalVerify.verified === false) {
      return {
        verified: false,
        confidence: 'low',
        dbVerification: dbVerify,
        approvalVerification: approvalVerify,
        warnings: [...(dbVerify.warnings || []), ...(approvalVerify.warnings || [])]
      };
    }
    return {
      verified: dbVerify.verified,
      confidence: dbVerify.confidence,
      dbVerification: dbVerify,
      approvalVerification: approvalVerify,
      warnings: [...(dbVerify.warnings || []), ...(approvalVerify.warnings || [])]
    };
  }

  return dbVerify;
}

function summarizeVerificationResult(result) {
  if (result.verified === true) {
    return 'Verification passed with ' + result.confidence + ' confidence.';
  } else if (result.verified === false) {
    return 'Verification failed! Warnings: ' + (result.warnings || []).join(', ');
  }
  return 'Verification unavailable.';
}

module.exports = {
  init,
  buildVerificationPlan,
  verifyExecution,
  summarizeVerificationResult
};
