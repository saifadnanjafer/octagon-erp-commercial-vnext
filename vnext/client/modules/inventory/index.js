// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

window.OctagonR3.register({
  key: 'inventory',
  label: { ar: 'المخزون', en: 'Inventory' },
  resources: [
    { key: 'reservations', resource: 'reservations', label: { ar: 'الحجوزات', en: 'Reservations' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['reserved', 'released', 'fulfilled'] }],
      columns: [{ key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'location_id', label: { ar: 'الموقع', en: 'Location' } }, { key: 'qty', label: { ar: 'الكمية', en: 'Qty' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
    { key: 'picks', resource: 'picks', label: { ar: 'الالتقاط والشحن', en: 'Picks' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['draft', 'shipped'] }],
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'source_ref', label: { ar: 'المصدر', en: 'Source' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }],
      actions: [{ key: 'ship', label: { ar: 'شحن', en: 'Ship' } }] },
    { key: 'routes', resource: 'routes', label: { ar: 'المسارات', en: 'Routes' }, search: true,
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'name', label: { ar: 'الاسم', en: 'Name' } }],
      actions: [{ key: 'execute', label: { ar: 'تنفيذ المسار', en: 'Execute' }, fields: [{ key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'qty', label: { ar: 'الكمية', en: 'Qty' }, type: 'number', default: 1 }] }] },
    { key: 'reorder-rules', resource: 'reorder-rules', label: { ar: 'قواعد إعادة الطلب', en: 'Reorder rules' }, search: true,
      columns: [{ key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'location_id', label: { ar: 'الموقع', en: 'Location' } }, { key: 'min_qty', label: { ar: 'الأدنى', en: 'Min' } }, { key: 'max_qty', label: { ar: 'الأقصى', en: 'Max' } }] },
    { key: 'reorder-requests', resource: 'reorder-requests', label: { ar: 'اقتراحات التزويد', en: 'Replenishment' }, search: true,
      filters: [{ key: 'state', label: { ar: 'الحالة', en: 'State' }, options: ['draft', 'converted'] }],
      columns: [{ key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'demand_qty', label: { ar: 'الكمية', en: 'Qty' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }, { key: 'supply_ref', label: { ar: 'مستند التوريد', en: 'Supply' } }],
      actions: [{ key: 'convert', label: { ar: 'تحويل لمسودة توريد', en: 'Convert' }, fields: [{ key: 'kind', label: { ar: 'purchase/manufacture/transfer', en: 'purchase/manufacture/transfer' }, default: 'purchase' }] }] },
    { key: 'cycle-counts', resource: 'cycle-counts', label: { ar: 'الجرد الدوري', en: 'Cycle counts' }, search: true,
      columns: [{ key: 'id', label: { ar: 'المعرف', en: 'Id' } }, { key: 'location_id', label: { ar: 'الموقع', en: 'Location' } }, { key: 'count_date', label: { ar: 'التاريخ', en: 'Date' } }, { key: 'state', label: { ar: 'الحالة', en: 'State' }, state: true }] },
    { key: 'scans', resource: 'scans', label: { ar: 'قراءات الباركود', en: 'Scans' }, search: true,
      columns: [{ key: 'barcode', label: { ar: 'الباركود', en: 'Barcode' } }, { key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'scan_type', label: { ar: 'النوع', en: 'Type' } }, { key: 'scanned_at', label: { ar: 'الوقت', en: 'At' } }] },
  ],
});
