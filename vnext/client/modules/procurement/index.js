// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

window.OctagonR3.register({
  key: 'procurement',
  label: { ar: 'المشتريات', en: 'Procurement' },
  resources: [
    { key: 'requisitions', resource: 'requisitions', label: { ar: 'طلبات الشراء', en: 'Requisitions' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['draft', 'approved', 'rejected'] }],
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'requester_id', label: { ar: 'الطالب', en: 'Requester' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      states: ['draft', 'approved', 'rejected'] },
    { key: 'rfqs', resource: 'rfqs', label: { ar: 'طلبات التسعير', en: 'RFQs' }, search: true,
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'supplier_id', label: { ar: 'المورد', en: 'Supplier' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      actions: [{ key: 'compare', label: { ar: 'مقارنة العروض', en: 'Compare quotes' } }] },
    { key: 'supplier-quotes', resource: 'supplier-quotes', label: { ar: 'عروض الموردين', en: 'Supplier quotes' }, search: true,
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'supplier_id', label: { ar: 'المورد', en: 'Supplier' } }, { key: 'total_amount', label: { ar: 'الإجمالي', en: 'Total' } }, { key: 'lead_time_days', label: { ar: 'مدة التوريد', en: 'Lead days' } }, { key: 'selected', label: { ar: 'مختار', en: 'Selected' } }],
      actions: [{ key: 'select', label: { ar: 'اختيار العرض', en: 'Select' } }] },
    { key: 'purchase-orders', resource: 'purchase-orders', label: { ar: 'أوامر الشراء', en: 'Purchase orders' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['draft', 'confirmed', 'done', 'cancelled'] }],
      columns: [{ key: 'order_number', label: { ar: 'الرقم', en: 'Number' } }, { key: 'supplier_id', label: { ar: 'المورد', en: 'Supplier' } }, { key: 'total_amount', label: { ar: 'الإجمالي', en: 'Total' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      states: ['draft', 'confirmed', 'done', 'cancelled'],
      actions: [{ key: 'bill', label: { ar: 'فاتورة مورد', en: 'Vendor bill' } }, { key: 'match', label: { ar: 'مطابقة ثلاثية', en: '3-way match' } }] },
    { key: 'receipts', resource: 'receipts', label: { ar: 'الاستلامات', en: 'Receipts' }, search: true,
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'order_id', label: { ar: 'الأمر', en: 'Order' } }, { key: 'supplier_doc_ref', label: { ar: 'مستند المورد', en: 'Supplier doc' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
    { key: 'matches', resource: 'matches', label: { ar: 'المطابقات', en: 'Matches' }, search: true,
      columns: [{ key: 'order_id', label: { ar: 'الأمر', en: 'Order' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }, { key: 'qty_delta', label: { ar: 'فرق الكمية', en: 'Qty' } }, { key: 'price_delta', label: { ar: 'فرق السعر', en: 'Price' } }] },
    { key: 'supplier-scorecards', resource: 'supplier-scorecards', label: { ar: 'تقييم الموردين', en: 'Scorecards' }, search: true,
      columns: [{ key: 'supplier_id', label: { ar: 'المورد', en: 'Supplier' } }, { key: 'period', label: { ar: 'الفترة', en: 'Period' } }, { key: 'on_time_score', label: { ar: 'الالتزام', en: 'On-time' } }, { key: 'quality_score', label: { ar: 'الجودة', en: 'Quality' } }] },
  ],
});
