// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const arap = require('../../finance/arap-engine');
const stock = require('../../stock/stock-engine');
const infra = require('../r3-infra');
const { id, now, money, asDate, within, fail, ensureCompany, tableExists, withImmediateTransaction, idempotencyScope, rememberIdempotency, publish, recordWrite, location, product, issueNumber, approvalContract, approvedOverride } = infra;

function slaTick(db, companyId, ticketId, input={}, userId, runtime) { const ticket=db.prepare('SELECT * FROM helpdesk_ticket WHERE id=? AND company_id=?').get(ticketId,companyId); if(!ticket) throw fail('ticket is outside company scope',403); const at=new Date(input.at||now()); const links=db.prepare('SELECT ts.*,s.response_hours,s.resolution_hours FROM helpdesk_ticket_sla ts JOIN helpdesk_sla s ON s.id=ts.sla_id WHERE ts.ticket_id=? AND ts.company_id=?').all(ticketId,companyId); const events=[]; for(const link of links){const responseDue=link.response_due?new Date(link.response_due):null; const resolutionDue=link.resolution_due?new Date(link.resolution_due):null; const breach=(responseDue&&at>responseDue&&!link.response_at)||(resolutionDue&&at>resolutionDue&&!link.resolution_at); db.prepare('UPDATE helpdesk_ticket_sla SET breached=? WHERE ticket_id=? AND sla_id=?').run(breach?1:0,ticketId,link.sla_id); const event={id:id('slaevent'),company_id:companyId,ticket_id:ticketId,sla_id:link.sla_id,event_type:breach?'breach':'tick',event_at:at.toISOString(),actor_id:userId,payload:JSON.stringify({response_due:link.response_due,resolution_due:link.resolution_due})}; db.prepare('INSERT INTO helpdesk_sla_event(id,company_id,ticket_id,sla_id,event_type,event_at,actor_id,payload) VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(event)); if(breach){const escalation={id:id('escalation'),company_id:companyId,ticket_id:ticketId,sla_id:link.sla_id,escalation_level:1,escalated_to:input.escalated_to||ticket.assignee_id||userId,escalated_at:at.toISOString(),state:'open'}; db.prepare('INSERT INTO helpdesk_escalation(id,company_id,ticket_id,sla_id,escalation_level,escalated_to,escalated_at,state) VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(escalation)); events.push(escalation);} else events.push(event); } recordWrite(db,runtime,companyId,'helpdesk_ticket',ticketId,'sla_tick',userId,null,events,'services'); return events; }

function slaBusinessSchedule(input = {}) {
  const raw = input.business_hours || input.business_calendar || {};
  const parseClock = (value, fallback) => { const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || fallback)); return match ? Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2])) : fallback; };
  const weekdays = Array.isArray(raw.weekdays) && raw.weekdays.length ? raw.weekdays.map(Number).filter(day => day >= 0 && day <= 6) : [1, 2, 3, 4, 5];
  return { start: parseClock(raw.start, 9 * 60), end: parseClock(raw.end, 17 * 60), weekdays: new Set(weekdays), holidays: new Set(Array.isArray(raw.holidays) ? raw.holidays.map(String) : []) };
}

function businessSecondsBetween(startValue, endValue, schedule) {
  const start = new Date(startValue); const end = new Date(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return 0;
  let day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); let seconds = 0;
  while (day < end) {
    const key = day.toISOString().slice(0, 10);
    if (schedule.weekdays.has(day.getUTCDay()) && !schedule.holidays.has(key) && schedule.end > schedule.start) {
      const open = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Math.floor(schedule.start / 60), schedule.start % 60));
      const close = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Math.floor(schedule.end / 60), schedule.end % 60));
      const from = Math.max(start.getTime(), open.getTime()); const to = Math.min(end.getTime(), close.getTime());
      if (to > from) seconds += (to - from) / 1000;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return seconds;
}

function slaTickBusinessClock(db, companyId, ticketId, input={}, userId, runtime) {
  const ticket = db.prepare('SELECT * FROM helpdesk_ticket WHERE id=? AND company_id=?').get(ticketId, companyId);
  if (!ticket) throw fail('ticket is outside company scope', 403);
  const at = new Date(input.at || now()); if (!Number.isFinite(at.getTime())) throw fail('SLA tick timestamp is invalid', 400);
  const action = String(input.action || input.sla_action || 'tick').toLowerCase(); const schedule = slaBusinessSchedule(input); const links = db.prepare('SELECT ts.*,s.response_hours,s.resolution_hours FROM helpdesk_ticket_sla ts JOIN helpdesk_sla s ON s.id=ts.sla_id WHERE ts.ticket_id=? AND ts.company_id=?').all(ticketId, companyId); const events = [];
  for (const link of links) {
    let state = link.sla_state || 'running'; let pausedAt = link.paused_at || null; let pausedBusinessSeconds = Number(link.paused_business_seconds || 0); let responseAt = link.response_at || null; let resolutionAt = link.resolution_at || null;
    if (action === 'pause' && state !== 'paused') {
      state = 'paused'; pausedAt = at.toISOString();
      db.prepare("UPDATE helpdesk_ticket_sla SET sla_state='paused',paused_at=?,last_tick_at=? WHERE ticket_id=? AND sla_id=? AND company_id=?").run(pausedAt, at.toISOString(), ticketId, link.sla_id, companyId);
      const event = { id: id('slaevent'), company_id: companyId, ticket_id: ticketId, sla_id: link.sla_id, event_type: 'pause', event_at: at.toISOString(), actor_id: userId, payload: JSON.stringify({ sla_state: state }) };
      db.prepare('INSERT INTO helpdesk_sla_event(id,company_id,ticket_id,sla_id,event_type,event_at,actor_id,payload) VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(event)); events.push(event); continue;
    }
    if (action === 'resume' && state === 'paused') { pausedBusinessSeconds += businessSecondsBetween(pausedAt, at, schedule); pausedAt = null; state = 'running'; }
    if (action === 'respond' && !responseAt) responseAt = at.toISOString();
    if (action === 'resolve' && !resolutionAt) resolutionAt = at.toISOString();
    const activeEnd = pausedAt ? new Date(pausedAt) : at; const activeSeconds = Math.max(0, businessSecondsBetween(ticket.opened_at, activeEnd, schedule) - pausedBusinessSeconds); const activeHours = activeSeconds / 3600;
    const responseDue = link.response_due ? new Date(link.response_due) : null; const resolutionDue = link.resolution_due ? new Date(link.resolution_due) : null;
    const responseBreach = !responseAt && ((responseDue && at > responseDue) || (Number(link.response_hours) > 0 && activeHours > Number(link.response_hours)));
    const resolutionBreach = !resolutionAt && ((resolutionDue && at > resolutionDue) || (Number(link.resolution_hours) > 0 && activeHours > Number(link.resolution_hours)));
    const breach = state !== 'paused' && (responseBreach || resolutionBreach); const breached = Number(link.breached) || (breach ? 1 : 0);
    db.prepare('UPDATE helpdesk_ticket_sla SET sla_state=?,paused_at=?,paused_business_seconds=?,last_tick_at=?,response_at=?,resolution_at=?,breached=? WHERE ticket_id=? AND sla_id=? AND company_id=?').run(state, pausedAt, pausedBusinessSeconds, at.toISOString(), responseAt, resolutionAt, breached, ticketId, link.sla_id, companyId);
    const event = { id: id('slaevent'), company_id: companyId, ticket_id: ticketId, sla_id: link.sla_id, event_type: breach ? 'breach' : (action === 'respond' ? 'responded' : action === 'resolve' ? 'resolved' : action === 'resume' ? 'resume' : 'tick'), event_at: at.toISOString(), actor_id: userId, payload: JSON.stringify({ sla_state: state, active_hours: activeHours, response_hours: Number(link.response_hours || 0), resolution_hours: Number(link.resolution_hours || 0), response_due: link.response_due, resolution_due: link.resolution_due }) };
    db.prepare('INSERT INTO helpdesk_sla_event(id,company_id,ticket_id,sla_id,event_type,event_at,actor_id,payload) VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(event)); events.push(event);
    if (breach && !db.prepare("SELECT 1 FROM helpdesk_escalation WHERE ticket_id=? AND sla_id=? AND company_id=? AND state='open'").get(ticketId, link.sla_id, companyId)) { const escalation = { id: id('escalation'), company_id: companyId, ticket_id: ticketId, sla_id: link.sla_id, escalation_level: 1, escalated_to: input.escalated_to || ticket.assignee_id || userId, escalated_at: at.toISOString(), state: 'open' }; db.prepare('INSERT INTO helpdesk_escalation(id,company_id,ticket_id,sla_id,escalation_level,escalated_to,escalated_at,state) VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(escalation)); events.push(escalation); }
  }
  recordWrite(db, runtime, companyId, 'helpdesk_ticket', ticketId, 'sla_tick', userId, null, events, 'services'); return events;
}

module.exports = {
  slaTick: infra.atomicCommand(slaTick),
  slaTickBusinessClock: infra.atomicCommand(slaTickBusinessClock),
  slaBusinessSchedule, businessSecondsBetween,
  _internal: { slaTick, slaBusinessSchedule, businessSecondsBetween, slaTickBusinessClock },
};
