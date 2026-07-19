"""
Seed a small set of posted journal entries for UI/report verification.
Run once; idempotent (checks origin key before inserting).
"""
import json, time, base64

DB_PATH = 'C:/Users/Zahraa dlbooz/Downloads/odoo-19.0/octagon-erp/database.json'

def load():
    with open(DB_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save(db):
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

def make_id(prefix):
    return f"{prefix}_{int(time.time()*1000) % 9999999}"

def fnv1a_hash(entry):
    payload = json.dumps({
        'id':         entry['id'],
        'date':       entry['date'],
        'journal_id': entry['journal_id'],
        'prev_hash':  entry.get('prev_hash', 'genesis'),
        'lines': [{'account_id': l['account_id'],
                   'debit': l['debit'], 'credit': l['credit']}
                  for l in entry['lines']]
    }, separators=(',', ':'))
    h = 0x811c9dc5
    for ch in payload:
        h = ((h ^ ord(ch)) * 0x01000193) & 0xFFFFFFFF
    suffix = base64.b64encode(payload[:18].encode()).decode().replace('+','').replace('/','').replace('=','')[:12]
    return f"{h:08x}-{suffix}"

NOW = '2026-05-15T12:00:00.000Z'
DATE = '2026-05-15'

ENTRIES = [
    # 1 — Payroll May
    {
        'name': 'PAY/2026/000001',
        'date': DATE,
        'journal_id': 'j_payroll',
        'origin': 'demo/payroll-may-2026',
        'lines': [
            {'id': 'DJL_001', 'sequence': 0, 'account_id': 'expense_payroll',
             'label': 'رواتب شهر 5/2026', 'debit': 3500000, 'credit': 0, 'reconciled': False},
            {'id': 'DJL_002', 'sequence': 1, 'account_id': 'accrued_payroll',
             'label': 'رواتب مستحقة', 'debit': 0, 'credit': 3500000, 'reconciled': False},
        ],
        'amount_total': 3500000,
    },
    # 2 — Sales receipt A
    {
        'name': 'SJ/2026/000001',
        'date': DATE,
        'journal_id': 'j_sale',
        'origin': 'demo/receipt-REC-001',
        'lines': [
            {'id': 'DJL_003', 'sequence': 0, 'account_id': 'receivables_customers',
             'label': 'وصل مبيعات: REC-001', 'debit': 1800000, 'credit': 0, 'reconciled': False},
            {'id': 'DJL_004', 'sequence': 1, 'account_id': 'income_sales',
             'label': 'مبيعات: عميل 1', 'debit': 0, 'credit': 1800000, 'reconciled': False},
        ],
        'amount_total': 1800000,
    },
    # 3 — Purchase materials
    {
        'name': 'PJ/2026/000001',
        'date': DATE,
        'journal_id': 'j_purc',
        'origin': 'demo/po-PO-001',
        'lines': [
            {'id': 'DJL_005', 'sequence': 0, 'account_id': 'inventory_stock',
             'label': 'شراء: أكريلك', 'debit': 650000, 'credit': 0, 'reconciled': False},
            {'id': 'DJL_006', 'sequence': 1, 'account_id': 'payables_people',
             'label': 'مورد: مورد عام', 'debit': 0, 'credit': 650000, 'reconciled': False},
        ],
        'amount_total': 650000,
    },
    # 4 — General expenses
    {
        'name': 'JE/2026/000001',
        'date': DATE,
        'journal_id': 'j_gen',
        'origin': 'demo/general-expenses-may',
        'lines': [
            {'id': 'DJL_007', 'sequence': 0, 'account_id': 'expense_general',
             'label': 'مصروفات عامة مايو', 'debit': 120000, 'credit': 0, 'reconciled': False},
            {'id': 'DJL_008', 'sequence': 1, 'account_id': 'cash_workshop',
             'label': 'صرف نقدي', 'debit': 0, 'credit': 120000, 'reconciled': False},
        ],
        'amount_total': 120000,
    },
    # 5 — Sales receipt B
    {
        'name': 'SJ/2026/000002',
        'date': DATE,
        'journal_id': 'j_sale',
        'origin': 'demo/receipt-REC-002',
        'lines': [
            {'id': 'DJL_009', 'sequence': 0, 'account_id': 'receivables_customers',
             'label': 'وصل مبيعات: REC-002', 'debit': 950000, 'credit': 0, 'reconciled': False},
            {'id': 'DJL_010', 'sequence': 1, 'account_id': 'income_sales',
             'label': 'مبيعات: عميل 2', 'debit': 0, 'credit': 950000, 'reconciled': False},
        ],
        'amount_total': 950000,
    },
]

db = load()
existing_origins = {e.get('origin') for e in db.get('journal_entries', [])}
inserted = 0
prev_hash = 'genesis'

# Find last posted hash if any exist
posted = [e for e in db.get('journal_entries', []) if e.get('state') == 'posted' and e.get('hash')]
if posted:
    posted.sort(key=lambda e: e.get('updated_at', ''))
    prev_hash = posted[-1]['hash']

for spec in ENTRIES:
    if spec['origin'] in existing_origins:
        print(f"  [SKIP] {spec['name']} (origin already exists)")
        continue

    eid = make_id('DEMO')
    entry = {
        'id':          eid,
        'name':        spec['name'],
        'date':        spec['date'],
        'journal_id':  spec['journal_id'],
        'partner_id':  '',
        'state':       'posted',
        'lines':       spec['lines'],
        'amount_total': spec['amount_total'],
        'origin':      spec['origin'],
        'prev_hash':   prev_hash,
        'reversed_of': None,
        'is_active':   True,
        'created_at':  NOW,
        'updated_at':  NOW,
        'created_by':  'system',
        'updated_by':  'system',
    }
    entry['hash'] = fnv1a_hash(entry)
    prev_hash = entry['hash']

    db.setdefault('journal_entries', []).append(entry)
    existing_origins.add(spec['origin'])
    inserted += 1
    print(f"  [POST] {spec['name']} ({spec['journal_id']}) amount={spec['amount_total']:,}")

save(db)

total = len([e for e in db['journal_entries'] if e.get('state') == 'posted'])
print(f"\nDone. Inserted {inserted} entries. Total posted JEs in DB: {total}")

# Quick double-entry check
acc = {}
for e in db['journal_entries']:
    if e.get('state') == 'posted':
        for l in e.get('lines', []):
            aid = l['account_id']
            acc.setdefault(aid, {'d': 0, 'c': 0})
            acc[aid]['d'] += l.get('debit', 0)
            acc[aid]['c'] += l.get('credit', 0)
total_d = sum(v['d'] for v in acc.values())
total_c = sum(v['c'] for v in acc.values())
ok = abs(total_d - total_c) < 0.01
print(f"Double-entry invariant: D={total_d:,}  C={total_c:,}  {'PASS' if ok else 'FAIL'}")
