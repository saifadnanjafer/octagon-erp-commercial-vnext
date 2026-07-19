"""
Migration: backfill normal_side on finance accounts that are missing it.
The ensureFinance() merge loop now patches in-memory, but existing database.json
records need a one-time write so the canonical store matches.

normal_side is derived from account type:
  asset     -> debit
  expense   -> debit
  liability -> credit
  income    -> credit
  equity    -> credit

Run once; idempotent (skips accounts already having normal_side).
"""
import json, sys

DB_PATH = 'C:/Users/Zahraa dlbooz/Downloads/odoo-19.0/octagon-erp/database.json'
CHECK_ONLY = '--check' in sys.argv

TYPE_TO_SIDE = {
    'asset':     'debit',
    'expense':   'debit',
    'liability': 'credit',
    'income':    'credit',
    'equity':    'credit',
}

with open(DB_PATH, 'r', encoding='utf-8') as f:
    db = json.load(f)

accounts = (db.get('finance') or {}).get('accounts', [])
patched = 0
skipped = 0

for acc in accounts:
    if acc.get('normal_side'):
        skipped += 1
        continue
    side = TYPE_TO_SIDE.get(acc.get('type', ''))
    if side:
        if not CHECK_ONLY:
            acc['normal_side'] = side
        patched += 1
        print(f"  [PATCH] {acc['id']:<30} type={acc.get('type'):<10} -> normal_side={side}")
    else:
        print(f"  [WARN]  {acc['id']:<30} unknown type={acc.get('type')!r} — skipped")

print()
print(f"Accounts: {len(accounts)} total, {patched} to patch, {skipped} already correct")

if CHECK_ONLY:
    print("Check-only mode — no changes written.")
    sys.exit(1 if patched else 0)

if patched:
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print("Written.")
else:
    print("Nothing to do.")
