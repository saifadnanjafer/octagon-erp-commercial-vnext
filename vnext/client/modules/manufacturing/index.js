// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

window.OctagonR3.register({
  key: 'manufacturing',
  label: { ar: 'التصنيع', en: 'Manufacturing' },
  resources: [
    { key: 'boms', resource: 'boms', label: { ar: 'قوائم المواد', en: 'BOMs' }, search: true,
      columns: [{ key: 'code', label: { ar: 'الرمز', en: 'Code' } }, { key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'revision', label: { ar: 'المراجعة', en: 'Rev' } }, { key: 'bom_type', label: { ar: 'النوع', en: 'Type' } }],
      actions: [{ key: 'rolled-cost', label: { ar: 'الكلفة المجمعة', en: 'Rolled cost' } }] },
    { key: 'work-centers', resource: 'work-centers', label: { ar: 'مراكز العمل', en: 'Work centers' }, search: true,
      columns: [{ key: 'code', label: { ar: 'الرمز', en: 'Code' } }, { key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'hourly_cost', label: { ar: 'كلفة الساعة', en: 'Hourly' } }] },
    { key: 'work-orders', resource: 'work-orders', label: { ar: 'أوامر العمل', en: 'Work orders' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['draft', 'confirmed', 'done'] }],
      columns: [{ key: 'order_number', label: { ar: 'الرقم', en: 'Number' } }, { key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'qty', label: { ar: 'الكمية', en: 'Qty' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      states: ['draft', 'confirmed', 'done'] },
    { key: 'landed-costs', resource: 'landed-costs', label: { ar: 'التكاليف الإضافية', en: 'Landed costs' }, search: true,
      columns: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'total_amount', label: { ar: 'المبلغ', en: 'Amount' } }, { key: 'allocation_basis', label: { ar: 'أساس التوزيع', en: 'Basis' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
    { key: 'subcontract-orders', resource: 'subcontract-orders', label: { ar: 'التصنيع الخارجي', en: 'Subcontracting' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['draft', 'issued', 'received', 'reversed'] }],
      columns: [{ key: 'order_number', label: { ar: 'الرقم', en: 'Number' } }, { key: 'supplier_id', label: { ar: 'المورد', en: 'Supplier' } }, { key: 'qty', label: { ar: 'الكمية', en: 'Qty' } }, { key: 'service_cost', label: { ar: 'كلفة الخدمة', en: 'Service' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      actions: [{ key: 'valuation', label: { ar: 'ملخص التقييم', en: 'Valuation' } }] },
  ],
});
