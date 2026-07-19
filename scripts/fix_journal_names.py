import json, sys

DB_PATH = 'C:/Users/Zahraa dlbooz/Downloads/odoo-19.0/octagon-erp/database.json'

JOURNAL_NAMES = {
    'j_gen':     'يومية عامة',
    'j_sale':    'يومية المبيعات',
    'j_purc':    'يومية المشتريات',
    'j_bank':    'صندوق / بنك',
    'j_payroll': 'يومية الرواتب',
}

CATEGORY_NAMES = {
    'cat_payroll':          'رواتب',
    'cat_materials':        'مواد',
    'cat_tools':            'صيانة وعدد',
    'cat_transport':        'نقل وتجهيز',
    'cat_general':          'مصروف عام',
    'cat_sales':            'وارد مبيعات',
    'cat_service':          'خدمة/تصنيع',
    'cat_customer_payment': 'تسديد عميل',
}

with open(DB_PATH, 'r', encoding='utf-8') as f:
    raw = f.read()

# Detect if file has double-encoded Arabic (UTF-8 bytes read as latin-1)
# If so, re-read as latin-1 and encode back to UTF-8
if 'Ã™' in raw or 'Ã˜' in raw:
    with open(DB_PATH, 'r', encoding='latin-1') as f:
        raw = f.read()
    raw = raw.encode('latin-1').decode('utf-8')
    print('Detected double-encoding; re-decoded from latin-1 -> utf-8')

db = json.loads(raw)

# Fix journal names
fixed_journals = 0
for j in db.get('journals', []):
    if j['id'] in JOURNAL_NAMES:
        j['name'] = JOURNAL_NAMES[j['id']]
        fixed_journals += 1

# Fix finance category names
cats = db.get('finance', {}).get('categories', {})
for group in cats.values():
    for cat in group:
        if cat.get('id') in CATEGORY_NAMES:
            cat['name'] = CATEGORY_NAMES[cat['id']]

# Fix department names (detect and fix if corrupted)
for dept in db.get('finance', {}).get('departments', []):
    if 'Ã' in str(dept.get('name', '')):
        try:
            dept['name'] = dept['name'].encode('latin-1').decode('utf-8')
        except Exception:
            pass

# Fix employee names
for emp in db.get('employees', []):
    if 'Ã' in str(emp.get('name', '')):
        try:
            emp['name'] = emp['name'].encode('latin-1').decode('utf-8')
        except Exception:
            pass

with open(DB_PATH, 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print(f'Fixed {fixed_journals} journal names')
print('Done. database.json written with UTF-8 encoding.')
