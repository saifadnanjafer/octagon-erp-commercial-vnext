// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

window.OctagonR3.register({
  key: 'helpdesk',
  label: { ar: 'الدعم وSLA', en: 'Helpdesk & SLA' },
  resources: [
    { key: 'tickets', resource: 'tickets', label: { ar: 'التذاكر', en: 'Tickets' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['open', 'waiting_customer', 'closed'] }],
      columns: [{ key: 'title', label: { ar: 'العنوان', en: 'Title' } }, { key: 'partner_id', label: { ar: 'العميل', en: 'Customer' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      states: ['open', 'waiting_customer', 'closed'],
      actions: [{ key: 'sla-tick', label: { ar: 'فحص SLA', en: 'SLA tick' } }] },
    { key: 'slas', resource: 'slas', label: { ar: 'سياسات SLA', en: 'SLA policies' }, search: true,
      columns: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'response_minutes', label: { ar: 'دقائق الاستجابة', en: 'Response' } }, { key: 'resolution_minutes', label: { ar: 'دقائق الحل', en: 'Resolution' } }] },
    { key: 'ticket-slas', resource: 'ticket-slas', label: { ar: 'ساعات التذاكر', en: 'Ticket clocks' }, search: true,
      columns: [{ key: 'ticket_id', label: { ar: 'التذكرة', en: 'Ticket' } }, { key: 'sla_state', label: { ar: 'حالة العداد', en: 'Clock' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
  ],
});
