#!/usr/bin/env python3
import argparse
import copy
import datetime as dt
import hashlib
import json
import shutil
import sqlite3
from collections import Counter
from pathlib import Path


DEFAULT_DB = Path(__file__).resolve().parents[1] / "database.json"
DEFAULT_SQLITE = Path(__file__).resolve().parents[1] / "database.db"
DEFAULT_REPORT_DIR = Path(__file__).resolve().parents[1] / "review-reports"


CHART_ACCOUNTS = [
    {"id": "cash_workshop", "code": "1001", "name": "قاصة الورشة", "type": "asset", "normal_side": "debit"},
    {"id": "bank_account", "code": "1002", "name": "حساب بنكي / تحويلات", "type": "asset", "normal_side": "debit"},
    {"id": "employee_cash_custody", "code": "1003", "name": "عهد نقدية عند موظفين", "type": "asset", "normal_side": "debit"},
    {"id": "receivables_customers", "code": "1101", "name": "ذمم العملاء", "type": "asset", "normal_side": "debit"},
    {"id": "employee_advances", "code": "1102", "name": "سلف الموظفين", "type": "asset", "normal_side": "debit"},
    {"id": "employee_meal_clearing", "code": "1109", "name": "وسيط توزيع طعام الموظفين", "type": "asset", "normal_side": "debit"},
    {"id": "inventory_stock", "code": "1200", "name": "مخزون مواد", "type": "asset", "normal_side": "debit"},
    {"id": "fixed_assets_tools_machines", "code": "1300", "name": "عدد ومعدات ومكائن", "type": "asset", "normal_side": "debit"},
    {"id": "accumulated_depreciation", "code": "1390", "name": "مجمع إهلاك", "type": "asset", "normal_side": "credit"},
    {"id": "payables_suppliers", "code": "2001", "name": "ذمم الموردين", "type": "liability", "normal_side": "credit"},
    {"id": "customer_deposits", "code": "2002", "name": "دفعات مقدمة من العملاء", "type": "liability", "normal_side": "credit"},
    {"id": "accrued_payroll", "code": "2100", "name": "رواتب مستحقة", "type": "liability", "normal_side": "credit"},
    {"id": "payables_people", "code": "2101", "name": "ذمم الأشخاص/الموظفين", "type": "liability", "normal_side": "credit"},
    {"id": "owner_loans_funding", "code": "2300", "name": "تمويل/قروض من المالك", "type": "liability", "normal_side": "credit"},
    {"id": "owner_capital", "code": "3000", "name": "رأس مال المالك", "type": "equity", "normal_side": "credit"},
    {"id": "owner_drawings", "code": "3100", "name": "مسحوبات المالك", "type": "equity", "normal_side": "debit"},
    {"id": "retained_earnings", "code": "3200", "name": "أرباح/خسائر مرحلة", "type": "equity", "normal_side": "credit"},
    {"id": "opening_balances", "code": "3900", "name": "أرصدة افتتاحية", "type": "equity", "normal_side": "credit"},
    {"id": "income_sales", "code": "4001", "name": "واردات مبيعات/خدمات", "type": "income", "normal_side": "credit"},
    {"id": "income_projects", "code": "4002", "name": "إيرادات مشاريع", "type": "income", "normal_side": "credit"},
    {"id": "other_income", "code": "4900", "name": "إيرادات أخرى", "type": "income", "normal_side": "credit"},
    {"id": "cogs_materials", "code": "5000", "name": "تكلفة المواد المباعة", "type": "expense", "normal_side": "debit"},
    {"id": "expense_payroll", "code": "5101", "name": "رواتب وأجور", "type": "expense", "normal_side": "debit"},
    {"id": "expense_employee_benefits", "code": "5102", "name": "منافع وطعام الموظفين", "type": "expense", "normal_side": "debit"},
    {"id": "expense_materials", "code": "5201", "name": "مواد تشغيل", "type": "expense", "normal_side": "debit"},
    {"id": "expense_tools", "code": "5202", "name": "عدد وصيانة", "type": "expense", "normal_side": "debit"},
    {"id": "expense_general", "code": "5299", "name": "مصروفات عامة", "type": "expense", "normal_side": "debit"},
    {"id": "rent_expense", "code": "5301", "name": "إيجار", "type": "expense", "normal_side": "debit"},
    {"id": "utilities_expense", "code": "5302", "name": "كهرباء وماء", "type": "expense", "normal_side": "debit"},
    {"id": "transport_fuel_expense", "code": "5303", "name": "نقل ووقود", "type": "expense", "normal_side": "debit"},
    {"id": "marketing_ads_expense", "code": "5401", "name": "تسويق وإعلانات", "type": "expense", "normal_side": "debit"},
    {"id": "adjustments_differences", "code": "5900", "name": "فروقات وتسويات", "type": "expense", "normal_side": "debit"},
    {"id": "vat_payable", "code": "2200", "name": "ضريبة القيمة المضافة المستحقة (VAT)", "type": "liability", "normal_side": "credit"},
    {"id": "suspense", "code": "9999", "name": "حساب الاستيداع", "type": "asset", "normal_side": "debit"},
]


def now():
    return dt.datetime.now().replace(microsecond=0).isoformat()


def today_iso():
    return dt.date.today().isoformat()


def money(value):
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def text(value):
    return str(value or "").strip()


def stable_id(prefix, key):
    digest = hashlib.sha1(text(key).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def source_key(tx):
    return tx.get("sourceCanonicalKey") or "|".join([
        text(tx.get("sourceType") or "finance.transactions"),
        text(tx.get("sourceId") or tx.get("id")),
        text(tx.get("type")),
        str(money(tx.get("amount"))),
    ])


def cashbox_effect(tx):
    effect = tx.get("cashboxEffect")
    try:
        if effect is not None and float(effect) != 0:
            return money(effect)
    except (TypeError, ValueError):
        pass
    amount = money(tx.get("amount"))
    if tx.get("direction") == "in":
        return amount
    if tx.get("direction") == "out":
        return -amount
    return 0


def account_ids(db):
    return {account.get("id") for account in (db.get("finance") or {}).get("accounts") or []}


def normalize_account(db, account_id):
    return account_id if account_id in account_ids(db) else "suspense"


def counter_account_for_tx(db, tx):
    if tx.get("type") == "salary_payment":
        return normalize_account(db, "accrued_payroll")
    return normalize_account(db, tx.get("accountId") or tx.get("chartAccountId") or "suspense")


def build_move_lines(db, tx):
    effect = cashbox_effect(tx)
    amount = abs(effect or money(tx.get("amount")))
    if amount <= 0:
        raise ValueError(f"zero amount transaction cannot be posted: {tx.get('id')}")
    label = tx.get("description") or tx.get("cashboxCategory") or tx.get("type") or "حركة مالية"
    partner = tx.get("customerId") or tx.get("partyName") or tx.get("paidByName") or ""
    department = tx.get("departmentId") or ""
    counter = counter_account_for_tx(db, tx)
    cash_account = normalize_account(db, tx.get("cashAccountId") or "cash_workshop")

    if tx.get("sourceType") == "cashbox" or effect or tx.get("paymentMethod") == "cash":
        if effect > 0 or tx.get("direction") == "in":
            return [
                {"account_id": cash_account, "debit": amount, "credit": 0, "label": label, "partner_id": partner, "department_id": department},
                {"account_id": counter, "debit": 0, "credit": amount, "label": label, "partner_id": partner, "department_id": department},
            ]
        return [
            {"account_id": counter, "debit": amount, "credit": 0, "label": label, "partner_id": partner, "department_id": department},
            {"account_id": cash_account, "debit": 0, "credit": amount, "label": label, "partner_id": partner, "department_id": department},
        ]

    if tx.get("sourceType") == "person_pocket":
        return [
            {"account_id": counter, "debit": amount, "credit": 0, "label": label, "partner_id": partner, "department_id": department},
            {"account_id": normalize_account(db, "payables_people"), "debit": 0, "credit": amount, "label": label, "partner_id": partner, "department_id": department},
        ]

    return [
        {"account_id": counter, "debit": amount, "credit": 0, "label": label, "partner_id": partner, "department_id": department},
        {"account_id": normalize_account(db, "suspense"), "debit": 0, "credit": amount, "label": label, "partner_id": partner, "department_id": department},
    ]


def line_totals(lines):
    return {
        "debit": sum(money(line.get("debit")) for line in lines),
        "credit": sum(money(line.get("credit")) for line in lines),
    }


def validate_balanced(lines):
    totals = line_totals(lines)
    if len(lines) < 2 or totals["debit"] <= 0 or totals["debit"] != totals["credit"]:
        raise ValueError(f"unbalanced move lines: {totals}")
    return totals


def ensure_chart_accounts(db):
    finance = db.setdefault("finance", {})
    accounts = finance.setdefault("accounts", [])
    by_id = {item.get("id"): item for item in accounts if isinstance(item, dict)}
    by_code = {item.get("code"): item for item in accounts if isinstance(item, dict) and item.get("code")}
    added = 0
    updated = 0
    for default in CHART_ACCOUNTS:
        current = by_id.get(default["id"]) or by_code.get(default["code"])
        if not current:
            current = copy.deepcopy(default)
            accounts.append(current)
            by_id[current["id"]] = current
            by_code[current["code"]] = current
            added += 1
        for key, value in default.items():
            if not current.get(key):
                current[key] = value
                updated += 1
        if not current.get("key"):
            current["key"] = current.get("id")
            updated += 1
        if not current.get("nameAr"):
            current["nameAr"] = current.get("name")
            updated += 1
        if not current.get("normalSide"):
            current["normalSide"] = current.get("normal_side") or "debit"
            updated += 1
        if current.get("active") is None:
            current["active"] = True
            updated += 1
    return {"accountsAdded": added, "accountFieldsUpdated": updated}


def ensure_journals(db):
    defaults = [
        {"id": "j_gen", "code": "GEN", "name": "يومية عامة", "type": "general", "default_account_id": "", "sequence_prefix": "JE"},
        {"id": "j_sale", "code": "SALE", "name": "يومية المبيعات", "type": "sale", "default_account_id": "receivables_customers", "sequence_prefix": "SJ"},
        {"id": "j_purc", "code": "PURC", "name": "يومية المشتريات", "type": "purchase", "default_account_id": "payables_people", "sequence_prefix": "PJ"},
        {"id": "j_bank", "code": "BANK", "name": "صندوق / بنك", "type": "cash", "default_account_id": "cash_workshop", "sequence_prefix": "BJ"},
        {"id": "j_payroll", "code": "PAY", "name": "يومية الرواتب", "type": "general", "default_account_id": "accrued_payroll", "sequence_prefix": "PAY"},
    ]
    journals = db.setdefault("journals", [])
    by_id = {item.get("id"): item for item in journals if isinstance(item, dict)}
    added = 0
    stamp = now()
    for journal in defaults:
        if journal["id"] in by_id:
            continue
        journals.append({**journal, "created_at": stamp, "created_by": "system", "updated_at": stamp, "updated_by": "system", "is_active": True})
        added += 1
    return added


def sequence_prefix(move):
    if move.get("journal_id") == "j_bank":
        return "BJ"
    if move.get("journal_id") == "j_payroll":
        return "PAY"
    if move.get("journal_id") == "j_sale":
        return "SJ"
    if move.get("journal_id") == "j_purc":
        return "PJ"
    return "JE"


def seed_counters(moves):
    counters = Counter()
    for move in moves:
        name = text(move.get("name"))
        parts = name.split("/")
        if len(parts) == 3 and parts[1].isdigit() and parts[2].isdigit():
            counters[f"{parts[0]}/{parts[1]}"] = max(counters[f"{parts[0]}/{parts[1]}"], int(parts[2]))
    return counters


def next_name(move, counters):
    year = text(move.get("date") or today_iso())[:4]
    key = f"{sequence_prefix(move)}/{year}"
    counters[key] += 1
    return f"{key}/{str(counters[key]).zfill(5)}"


def hash_move(move, previous_hash="genesis"):
    payload = json.dumps({
        "id": move.get("id"),
        "name": move.get("name"),
        "date": move.get("date"),
        "journal_id": move.get("journal_id"),
        "move_type": move.get("move_type"),
        "previous_hash": previous_hash,
        "line_ids": [
            {
                "account_id": line.get("account_id"),
                "debit": money(line.get("debit")),
                "credit": money(line.get("credit")),
                "partner_id": line.get("partner_id") or "",
            }
            for line in move.get("line_ids") or []
        ],
    }, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def mirror_journal_entry(move):
    return {
        "id": move.get("legacy_journal_entry_id") or move.get("id"),
        "name": move.get("name"),
        "date": move.get("date"),
        "journal_id": move.get("journal_id"),
        "partner_id": move.get("partner_id") or "",
        "state": move.get("state"),
        "lines": copy.deepcopy(move.get("line_ids") or []),
        "amount_total": move.get("amount_total") or line_totals(move.get("line_ids") or [])["debit"],
        "origin": move.get("origin") or "",
        "hash": move.get("hash"),
        "prev_hash": move.get("previous_hash"),
        "previous_hash": move.get("previous_hash"),
        "account_move_id": move.get("id"),
        "created_at": move.get("created_at"),
        "created_by": move.get("created_by") or "system",
        "updated_at": move.get("updated_at"),
        "updated_by": move.get("updated_by") or "system",
        "is_active": move.get("is_active") is not False,
    }


def posted_cash_net(db):
    total = 0
    for move in db.get("account_moves") or []:
        if move.get("state") != "posted":
            continue
        for line in move.get("line_ids") or []:
            if line.get("account_id") == "cash_workshop":
                total += money(line.get("debit")) - money(line.get("credit"))
    return total


def migrate(db):
    ensure_result = ensure_chart_accounts(db)
    journals_added = ensure_journals(db)
    db.setdefault("account_moves", [])
    db.setdefault("journal_entries", [])
    transactions = (db.get("finance") or {}).get("transactions") or []
    existing_keys = {move.get("sourceCanonicalKey") for move in db.get("account_moves") or [] if move.get("sourceCanonicalKey")}
    existing_origins = {move.get("origin") for move in db.get("account_moves") or [] if move.get("origin")}
    counters = seed_counters(db.get("account_moves") or [])
    created = []
    skipped = 0
    suspense = 0
    stamp = now()

    for tx in transactions:
        amount = abs(cashbox_effect(tx) or money(tx.get("amount")))
        if amount <= 0:
            skipped += 1
            continue
        key = source_key(tx)
        origin = f"finance.transactions/{key}"
        if key in existing_keys or origin in existing_origins:
            tx.setdefault("postingStatus", "posted")
            skipped += 1
            continue
        lines = build_move_lines(db, tx)
        totals = validate_balanced(lines)
        move = {
            "id": stable_id("MOVE_FIN", key),
            "name": "/",
            "journal_id": "j_bank" if tx.get("sourceType") == "cashbox" or tx.get("paymentMethod") == "cash" else "j_gen",
            "date": tx.get("date") or today_iso(),
            "move_type": "entry",
            "state": "posted",
            "partner_id": tx.get("customerId") or tx.get("partyName") or tx.get("paidByName") or "",
            "origin": origin,
            "sourceType": tx.get("sourceType") or "finance.transactions",
            "sourceId": tx.get("sourceId") or tx.get("id") or "",
            "sourceCanonicalKey": key,
            "financeTransactionId": tx.get("id") or "",
            "postingEngine": "finance_transactions_v1",
            "reviewStatus": "needs_review" if counter_account_for_tx(db, tx) == "suspense" else "",
            "line_ids": [
                {"id": f"{stable_id('AML_FIN', key)}_{idx}", "sequence": idx, "amount_residual": max(money(line["debit"]), money(line["credit"])), "reconciled": False, "reconcile_id": None, **line}
                for idx, line in enumerate(lines, start=1)
            ],
            "amount_total": totals["debit"],
            "hash": None,
            "previous_hash": None,
            "created_at": stamp,
            "posted_at": stamp,
            "cancelled_at": None,
            "created_by": "finance_transaction_migration",
            "updated_at": stamp,
            "updated_by": "finance_transaction_migration",
            "is_active": True,
            "companyId": tx.get("companyId") or "",
        }
        move["name"] = next_name(move, counters)
        db["account_moves"].append(move)
        tx["accountMoveId"] = move["id"]
        tx["v6_move_id"] = move["id"]
        tx["postingStatus"] = "posted"
        tx["postedAt"] = stamp
        tx["sourceCanonicalKey"] = key
        if move["reviewStatus"] == "needs_review":
            suspense += 1
        created.append(move)
        existing_keys.add(key)
        existing_origins.add(origin)

    previous_hash = "genesis"
    for move in sorted([m for m in db.get("account_moves") or [] if m.get("state") == "posted"], key=lambda m: (text(m.get("date")), text(m.get("name")), text(m.get("id")))):
        move["previous_hash"] = previous_hash
        move["hash"] = hash_move(move, previous_hash)
        previous_hash = move["hash"]

    by_entry_id = {entry.get("id"): entry for entry in db.get("journal_entries") or []}
    by_move_id = {entry.get("account_move_id"): entry for entry in db.get("journal_entries") or [] if entry.get("account_move_id")}
    mirrored = 0
    for move in created:
        legacy = mirror_journal_entry(move)
        current = by_entry_id.get(legacy["id"]) or by_move_id.get(move["id"])
        if current:
            current.update(legacy)
        else:
            db["journal_entries"].append(legacy)
        mirrored += 1

    audit = db.setdefault("audit_log", [])
    audit.append({
        "id": f"audit_finance_posting_migration_{dt.datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "action": "finance_transactions_posted_to_account_moves",
        "createdAt": stamp,
        "createdBy": "codex",
        "details": {
            **ensure_result,
            "journalsAdded": journals_added,
            "createdMoves": len(created),
            "skippedTransactions": skipped,
            "suspenseMoves": suspense,
            "postedCashNet": posted_cash_net(db),
        },
    })

    return {
        **ensure_result,
        "journalsAdded": journals_added,
        "createdMoves": len(created),
        "skippedTransactions": skipped,
        "suspenseMoves": suspense,
        "totalAccountMoves": len(db.get("account_moves") or []),
        "totalJournalEntries": len(db.get("journal_entries") or []),
        "postedCashNet": posted_cash_net(db),
        "cashOpening": money((db.get("finance") or {}).get("cashOpening")),
        "cashClosingFromPostedMoves": money((db.get("finance") or {}).get("cashOpening")) + posted_cash_net(db),
        "unbalancedMoves": [
            move.get("id") for move in db.get("account_moves") or []
            if move.get("state") == "posted" and line_totals(move.get("line_ids") or [])["debit"] != line_totals(move.get("line_ids") or [])["credit"]
        ],
    }


def extract_db_collections(obj, path="", collections=None, metadata=None):
    if collections is None:
        collections = {}
    if metadata is None:
        metadata = {}
    if obj is None:
        return collections, metadata
    known = path in {
        "employees", "contacts", "departments", "users", "locations", "quants", "stock_moves",
        "transfers", "journals", "journal_entries", "account_moves", "account_payments",
        "account_partial_reconciles", "payments", "maintenance_requests", "production_orders",
        "work_orders", "audit_log",
    } or (path.startswith("omni.") and isinstance(obj, list))
    if isinstance(obj, list):
        has_ids = bool(obj) and all(isinstance(item, dict) and item.get("id") is not None for item in obj)
        if known or has_ids:
            collections[path] = obj
            return collections, metadata
    if isinstance(obj, dict) and (path == "" or path in {"omni", "finance"}):
        for key, value in obj.items():
            next_path = f"{path}.{key}" if path else key
            extract_db_collections(value, next_path, collections, metadata)
        return collections, metadata
    metadata[path] = obj
    return collections, metadata


def save_sqlite(sqlite_path, db):
    collections, metadata = extract_db_collections(db)
    con = sqlite3.connect(sqlite_path)
    try:
        con.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)")
        con.execute("CREATE TABLE IF NOT EXISTS collections (collection TEXT, id TEXT, data TEXT, PRIMARY KEY (collection, id))")
        con.execute("BEGIN")
        con.execute("DELETE FROM metadata")
        con.execute("DELETE FROM collections")
        for key, value in metadata.items():
            con.execute("INSERT INTO metadata (key, value) VALUES (?, ?)", (key, json.dumps(value, ensure_ascii=False)))
        seen = set()
        for collection, records in collections.items():
            for idx, record in enumerate(records, start=1):
                raw_id = record.get("id") if isinstance(record, dict) else None
                record_id = str(raw_id or f"{collection[:3]}_{idx:04d}")
                key = (collection, record_id)
                counter = 1
                while key in seen:
                    record_id = f"{raw_id or collection[:3]}_dup{counter}"
                    key = (collection, record_id)
                    counter += 1
                seen.add(key)
                if isinstance(record, dict) and record.get("id") != record_id:
                    record["id"] = record_id
                con.execute(
                    "INSERT INTO collections (collection, id, data) VALUES (?, ?, ?)",
                    (collection, record_id, json.dumps(record, ensure_ascii=False)),
                )
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def backup_file(path, stamp):
    if not path.exists():
        return None
    backup = path.with_name(f"{path.name}.backup-before-finance-posting-{stamp}")
    shutil.copy2(path, backup)
    return backup


def main():
    parser = argparse.ArgumentParser(description="Post finance.transactions into balanced account_moves.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--sqlite", type=Path, default=DEFAULT_SQLITE)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    db = json.loads(args.db.read_text(encoding="utf-8"))
    next_db = copy.deepcopy(db)
    report = migrate(next_db)
    report["db"] = str(args.db)
    report["sqlite"] = str(args.sqlite)
    report["applied"] = bool(args.apply)

    if args.apply:
        if report["unbalancedMoves"]:
            raise SystemExit(f"Refusing to apply: unbalanced moves {report['unbalancedMoves']}")
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        db_backup = backup_file(args.db, stamp)
        sqlite_backup = backup_file(args.sqlite, stamp)
        args.db.write_text(json.dumps(next_db, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.sqlite.exists():
            save_sqlite(args.sqlite, copy.deepcopy(next_db))
        report["dbBackup"] = str(db_backup) if db_backup else ""
        report["sqliteBackup"] = str(sqlite_backup) if sqlite_backup else ""

    args.report_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.report_dir / f"finance_transaction_posting_{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    report["reportPath"] = str(report_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
