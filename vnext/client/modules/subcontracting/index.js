// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

// Subcontracting operational surfaces live inside the manufacturing module
// (subcontract-orders tab); this module registers the receipt ledger view.
window.OctagonR3.register({
  key: 'subcontracting',
  label: { ar: 'إيصالات التصنيع الخارجي', en: 'Subcontract receipts' },
  resources: [
    { key: 'subcontract-receipts', resource: 'subcontract-receipts', label: { ar: 'الإيصالات', en: 'Receipts' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['received', 'reversed'] }],
      columns: [{ key: 'order_id', label: { ar: 'الأمر', en: 'Order' } }, { key: 'qty', label: { ar: 'الكمية', en: 'Qty' } }, { key: 'consumed_value', label: { ar: 'قيمة المكونات', en: 'Consumed' } }, { key: 'service_cost', label: { ar: 'الخدمة', en: 'Service' } }, { key: 'variance', label: { ar: 'الانحراف', en: 'Variance' } }, { key: 'landed_value', label: { ar: 'الإضافية', en: 'Landed' } }, { key: 'total_value', label: { ar: 'الإجمالي', en: 'Total' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      actions: [{ key: 'reverse', label: { ar: 'عكس الإيصال', en: 'Reverse' } }] },
  ],
});
