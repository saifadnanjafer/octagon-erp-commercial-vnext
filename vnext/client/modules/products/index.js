// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

window.OctagonR3.register({
  key: 'products',
  label: { ar: 'المنتجات', en: 'Products' },
  resources: [
    { key: 'products', resource: 'products', label: { ar: 'المنتجات', en: 'Products' }, search: true,
      filters: [{ key: 'product_type', label: { ar: 'النوع', en: 'Type' }, options: ['goods', 'service', 'consumable'] }],
      columns: [{ key: 'code', label: { ar: 'الرمز', en: 'Code' } }, { key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'product_type', label: { ar: 'النوع', en: 'Type' } }, { key: 'barcode', label: { ar: 'الباركود', en: 'Barcode' } }, { key: 'standard_cost', label: { ar: 'الكلفة', en: 'Cost' } }],
      form: [{ key: 'code', label: { ar: 'الرمز', en: 'Code' }, required: true }, { key: 'name', label: { ar: 'الاسم', en: 'Name' }, required: true }, { key: 'product_type', label: { ar: 'النوع', en: 'Type' }, type: 'select', options: ['goods', 'service', 'consumable'] }, { key: 'barcode', label: { ar: 'الباركود', en: 'Barcode' } }, { key: 'standard_cost', label: { ar: 'الكلفة', en: 'Std cost' }, type: 'number' }] },
    { key: 'categories', resource: 'categories', label: { ar: 'التصنيفات', en: 'Categories' }, search: true,
      columns: [{ key: 'code', label: { ar: 'الرمز', en: 'Code' } }, { key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'parent_id', label: { ar: 'الأب', en: 'Parent' } }],
      form: [{ key: 'code', label: { ar: 'الرمز', en: 'Code' }, required: true }, { key: 'name', label: { ar: 'الاسم', en: 'Name' }, required: true }] },
    { key: 'uoms', resource: 'uoms', label: { ar: 'وحدات القياس', en: 'UoM' }, search: true,
      columns: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'symbol', label: { ar: 'الرمز', en: 'Symbol' } }, { key: 'factor', label: { ar: 'المعامل', en: 'Factor' } }, { key: 'category_id', label: { ar: 'الفئة', en: 'Category' } }] },
    { key: 'variants', resource: 'variants', label: { ar: 'المتغيرات', en: 'Variants' }, search: true,
      columns: [{ key: 'code', label: { ar: 'الرمز', en: 'Code' } }, { key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'template_id', label: { ar: 'القالب', en: 'Template' } }] },
    { key: 'barcodes', resource: 'barcodes', label: { ar: 'الباركودات', en: 'Barcodes' }, search: true,
      columns: [{ key: 'barcode', label: { ar: 'الباركود', en: 'Barcode' } }, { key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'barcode_type', label: { ar: 'النوع', en: 'Type' } }] },
  ],
});
