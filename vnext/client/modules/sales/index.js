// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

window.OctagonR3.register({
  key: 'sales',
  label: { ar: 'المبيعات وCRM', en: 'Sales & CRM' },
  resources: [
    { key: 'sales-leads', resource: 'sales-leads', label: { ar: 'الفرص', en: 'Leads' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['draft', 'qualified', 'won', 'lost'] }],
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'title', label: { ar: 'العنوان', en: 'Title' } }, { key: 'partner_id', label: { ar: 'العميل', en: 'Customer' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      states: ['draft', 'qualified', 'won', 'lost'] },
    { key: 'quotes', resource: 'quotes', label: { ar: 'عروض الأسعار', en: 'Quotations' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['draft', 'confirmed', 'cancelled'] }],
      columns: [{ key: 'quote_number', label: { ar: 'الرقم', en: 'Number' } }, { key: 'partner_id', label: { ar: 'العميل', en: 'Customer' } }, { key: 'total_amount', label: { ar: 'الإجمالي', en: 'Total' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
    { key: 'orders', resource: 'orders', label: { ar: 'أوامر البيع', en: 'Sales orders' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['confirmed', 'done', 'cancelled'] }],
      columns: [{ key: 'order_number', label: { ar: 'الرقم', en: 'Number' } }, { key: 'partner_id', label: { ar: 'العميل', en: 'Customer' } }, { key: 'total_amount', label: { ar: 'الإجمالي', en: 'Total' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      actions: [
        { key: 'reserve', label: { ar: 'حجز المخزون', en: 'Reserve' } },
        { key: 'invoice', label: { ar: 'فوترة', en: 'Invoice' } },
        { key: 'down-payment', label: { ar: 'دفعة مقدمة', en: 'Down payment' }, fields: [{ key: 'percent', label: { ar: 'النسبة %', en: 'Percent %' }, type: 'number', default: 30 }] },
      ] },
    { key: 'deliveries', resource: 'deliveries', label: { ar: 'التسليمات', en: 'Deliveries' }, search: true,
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'order_id', label: { ar: 'الأمر', en: 'Order' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
    { key: 'rmas', resource: 'rmas', label: { ar: 'المرتجعات', en: 'Returns' }, search: true,
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'order_id', label: { ar: 'الأمر', en: 'Order' } }, { key: 'reason', label: { ar: 'السبب', en: 'Reason' } }] },
    { key: 'commissions', resource: 'commissions', label: { ar: 'العمولات', en: 'Commissions' }, search: true,
      columns: [{ key: 'order_id', label: { ar: 'الأمر', en: 'Order' } }, { key: 'salesperson_id', label: { ar: 'البائع', en: 'Salesperson' } }, { key: 'amount', label: { ar: 'المبلغ', en: 'Amount' } }] },
  ],
});
