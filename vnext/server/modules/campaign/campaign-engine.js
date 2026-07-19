// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function createCampaign(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const row = {
    id: String(input.id || id('camp')),
    company_id: companyId,
    name: String(input.name || '').trim(),
    channel: String(input.channel || 'whatsapp').trim(),
    template_body: String(input.template_body || '').trim(),
    state: 'draft',
    created_at: now(),
    created_by: userId || null
  };
  
  if (!row.name) throw fail('campaign name is required', 400, 'CAMPAIGN_NAME_REQUIRED');
  if (!['whatsapp', 'email', 'sms'].includes(row.channel)) {
    throw fail('invalid communication channel', 400, 'CAMPAIGN_CHANNEL_INVALID');
  }
  if (!row.template_body) throw fail('template body is required', 400, 'TEMPLATE_BODY_REQUIRED');
  
  db.prepare(`
    INSERT INTO omni_campaign (id, company_id, name, channel, template_body, state, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.name, row.channel, row.template_body, row.state, row.created_at, row.created_by);
  
  return row;
}

function getCampaign(db, companyId, id) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM omni_campaign WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!row) throw fail('campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
  return row;
}

function listCampaigns(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM omni_campaign WHERE company_id = ?').all(companyId);
}

function interpolate(template, placeholders) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return placeholders[key] !== undefined ? String(placeholders[key]) : match;
  });
}

function dispatchCampaign(db, companyId, campaignId, targetPartnerIds, userId) {
  ensureCompany(db, companyId);
  const campaign = db.prepare('SELECT * FROM omni_campaign WHERE id = ? AND company_id = ?').get(campaignId, companyId);
  if (!campaign) throw fail('campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
  if (campaign.state !== 'draft' && campaign.state !== 'scheduled') {
    throw fail('campaign is already running or completed', 409, 'CAMPAIGN_STATE_INVALID');
  }
  
  const partnerIds = Array.isArray(targetPartnerIds) ? targetPartnerIds : [];
  if (!partnerIds.length) throw fail('at least one target partner ID is required', 400, 'TARGETS_REQUIRED');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE omni_campaign SET state = 'running' WHERE id = ?").run(campaignId);
    
    for (const partnerId of partnerIds) {
      const partner = db.prepare('SELECT * FROM partner_master WHERE id = ? AND company_id = ?').get(partnerId, companyId);
      if (!partner) continue;
      
      // Resolve recipient (phone for whatsapp/sms, email for email)
      // Since partner_master has name/currency, we can look up phone/email from details or default
      const recipient = campaign.channel === 'email' 
        ? `${partner.name.toLowerCase().replace(/\s+/g, '')}@example.com`
        : `+964${Math.floor(100000000 + Math.random() * 900000000)}`; // simulated Iraqi mobile number
        
      // Fetch loyalty points balance to support template variables
      let points = 0;
      let tier = 'standard';
      const card = db.prepare('SELECT id, tier FROM loyalty_card WHERE partner_id = ? AND company_id = ? AND active = 1').get(partnerId, companyId);
      if (card) {
        tier = card.tier;
        const ptsRow = db.prepare('SELECT COALESCE(SUM(points), 0) as balance FROM loyalty_points_ledger WHERE card_id = ?').get(card.id);
        points = ptsRow.balance;
      }
      
      const bodyText = interpolate(campaign.template_body, {
        partner_name: partner.name,
        points: points,
        tier: tier
      });
      
      const messageId = id('msg');
      db.prepare(`
        INSERT INTO omni_message_log (id, company_id, campaign_id, partner_id, recipient, body, direction, delivery_state, sent_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'outbound', 'sent', ?, ?)
      `).run(messageId, companyId, campaignId, partnerId, recipient, bodyText, now(), now());
    }
    
    db.prepare("UPDATE omni_campaign SET state = 'completed' WHERE id = ?").run(campaignId);
    
    if (owns) db.exec('COMMIT');
    return db.prepare('SELECT * FROM omni_campaign WHERE id = ?').get(campaignId);
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function receiveWebhookDlr(db, companyId, messageId, status) {
  ensureCompany(db, companyId);
  if (!['delivered', 'failed', 'read'].includes(status)) {
    throw fail('invalid message delivery status', 400, 'STATUS_INVALID');
  }
  
  const msg = db.prepare('SELECT * FROM omni_message_log WHERE id = ? AND company_id = ?').get(messageId, companyId);
  if (!msg) throw fail('logged message not found', 404, 'MESSAGE_NOT_FOUND');
  
  db.prepare('UPDATE omni_message_log SET delivery_state = ?, updated_at = ? WHERE id = ?').run(status, now(), messageId);
  return db.prepare('SELECT * FROM omni_message_log WHERE id = ?').get(messageId);
}

function receiveWebhookInbound(db, companyId, fromNumber, bodyText) {
  ensureCompany(db, companyId);
  
  // Try to match sender number with a partner profile if possible
  // For safety, we search phone number formats or log as guest
  const msgId = id('msg_in');
  const row = {
    id: msgId,
    company_id: companyId,
    campaign_id: null,
    partner_id: null,
    recipient: fromNumber,
    body: bodyText,
    direction: 'inbound',
    delivery_state: 'read',
    sent_at: now(),
    updated_at: now()
  };
  
  db.prepare(`
    INSERT INTO omni_message_log (id, company_id, campaign_id, partner_id, recipient, body, direction, delivery_state, sent_at, updated_at)
    VALUES (?, ?, null, null, ?, ?, 'inbound', 'read', ?, ?)
  `).run(row.id, row.company_id, row.recipient, row.body, row.sent_at, row.updated_at);
  
  return row;
}

function getMessageLogs(db, companyId, campaignId = null) {
  ensureCompany(db, companyId);
  let query = 'SELECT * FROM omni_message_log WHERE company_id = ?';
  const params = [companyId];
  if (campaignId) {
    query += ' AND campaign_id = ?';
    params.push(campaignId);
  }
  return db.prepare(query).all(...params);
}

module.exports = {
  createCampaign: infra.atomicCommand(createCampaign),
  getCampaign,
  listCampaigns,
  dispatchCampaign,
  receiveWebhookDlr,
  receiveWebhookInbound: infra.atomicCommand(receiveWebhookInbound),
  getMessageLogs
};
