// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

window.OctagonR3.register({
  key: 'pricing',
  label: { ar: 'التسعير والعروض', en: 'Pricing' },
  resources: [
    { key: 'price-lists', resource: 'price-lists', label: { ar: 'قوائم الأسعار', en: 'Price lists' }, search: true,
      columns: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'currency', label: { ar: 'العملة', en: 'Currency' } }, { key: 'priority', label: { ar: 'الأولوية', en: 'Priority' } }],
      form: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' }, required: true }, { key: 'currency', label: { ar: 'العملة', en: 'Currency' }, default: 'IQD' }, { key: 'priority', label: { ar: 'الأولوية', en: 'Priority' }, type: 'number', default: 10 }] },
    { key: 'price-items', resource: 'price-items', label: { ar: 'بنود الأسعار', en: 'Price items' }, search: true,
      columns: [{ key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'fixed_price', label: { ar: 'السعر', en: 'Price' } }, { key: 'percent_discount', label: { ar: 'الخصم %', en: 'Disc %' } }, { key: 'min_qty', label: { ar: 'أدنى كمية', en: 'Min qty' } }, { key: 'currency', label: { ar: 'العملة', en: 'Currency' } }] },
    { key: 'pricing-rules', resource: 'pricing-rules', label: { ar: 'قواعد التسعير', en: 'Rules' }, search: true,
      columns: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'product_id', label: { ar: 'المنتج', en: 'Product' } }, { key: 'partner_id', label: { ar: 'العميل', en: 'Partner' } }, { key: 'fixed_price', label: { ar: 'السعر', en: 'Price' } }, { key: 'priority', label: { ar: 'الأولوية', en: 'Priority' } }] },
    { key: 'promotions', resource: 'promotions', label: { ar: 'العروض', en: 'Promotions' }, search: true,
      columns: [{ key: 'name', label: { ar: 'الاسم', en: 'Name' } }, { key: 'promotion_type', label: { ar: 'النوع', en: 'Type' } }, { key: 'amount', label: { ar: 'القيمة', en: 'Amount' } }, { key: 'coupon_code', label: { ar: 'الكوبون', en: 'Coupon' } }] },
    { key: 'coupons', resource: 'coupons', label: { ar: 'الكوبونات', en: 'Coupons' }, search: true,
      columns: [{ key: 'code', label: { ar: 'الرمز', en: 'Code' } }, { key: 'usage_limit', label: { ar: 'حد الاستخدام', en: 'Limit' } }, { key: 'used_count', label: { ar: 'المستخدم', en: 'Used' } }] },
  ],
});
