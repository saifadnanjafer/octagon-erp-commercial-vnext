"""
Read-only verification: confirm all four test users exist in database.json
with the correct groups for permission scenario testing.

Expected users:
  system       -> system.admin
  mgr_finance  -> finance.manager
  user_finance -> finance.user
  mgr_workshop -> workshop.manager

Run against a live server: python verify_test_users.py
Or against the file directly: python verify_test_users.py --file
"""
import json, sys, urllib.request

FILE_MODE = '--file' in sys.argv
DB_PATH = 'C:/Users/Zahraa dlbooz/Downloads/odoo-19.0/octagon-erp/database.json'
BASE = 'http://localhost:8080/api/db'

EXPECTED = [
    {'id': 'system',       'group': 'system.admin'},
    {'id': 'mgr_finance',  'group': 'finance.manager'},
    {'id': 'user_finance', 'group': 'finance.user'},
    {'id': 'mgr_workshop', 'group': 'workshop.manager'},
]

def load():
    if FILE_MODE:
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return json.loads(urllib.request.urlopen(BASE).read())

print("=== Test User Verification ===")
print(f"Source: {'file' if FILE_MODE else BASE}")
print()

db = load()
users = db.get('users', db.get('omni', {}).get('users', []))
user_map = {u['id']: u for u in users}

results = []
for spec in EXPECTED:
    uid = spec['id']
    grp = spec['group']
    u = user_map.get(uid)
    if not u:
        results.append((uid, 'FAIL', 'user not found'))
        continue
    groups = u.get('groups', [])
    if grp not in groups:
        results.append((uid, 'FAIL', f'missing group {grp}, has {groups}'))
        continue
    if u.get('is_active') is False:
        results.append((uid, 'FAIL', 'user is_active=false'))
        continue
    results.append((uid, 'PASS', f'{grp} / {u.get("name", "")}'))

for uid, mark, note in results:
    print(f"  [{mark}] {uid:<16} {note}")

passed = sum(1 for _, m, _ in results if m == 'PASS')
failed = sum(1 for _, m, _ in results if m == 'FAIL')
print()
print(f"PASSED: {passed}  FAILED: {failed}  TOTAL: {len(results)}")

if failed:
    sys.exit(1)
