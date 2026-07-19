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


def now():
    return dt.datetime.now().replace(microsecond=0).isoformat()


def money(value):
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def text(value):
    return str(value or "").strip()


def stable_id(prefix, key):
    return f"{prefix}_{hashlib.sha1(text(key).encode('utf-8')).hexdigest()[:16]}"


def canonical_key(item):
    return "|".join([
        "omni.workshopAdvances",
        text(item.get("id")),
        text(item.get("employeeName") or item.get("employee_name")),
        text(item.get("date")),
        str(money(item.get("amount"))),
        text(item.get("advanceType") or item.get("advance_type")),
    ])


def employee_index(db):
    out = {}
    for emp in db.get("employees") or []:
        name = text(emp.get("name"))
        if name:
            out[name] = emp
            out[name.replace(" ", "")] = emp
    return out


def match_employee(index, name):
    name = text(name)
    return index.get(name) or index.get(name.replace(" ", ""))


def normalize_advance_type(raw):
    raw = text(raw)
    if "طعام" in raw:
        return "food"
    if "مراجعة" in raw:
        return "review"
    return "cash"


def link_cash_transaction(finance_transactions, item):
    amount = money(item.get("amount"))
    if amount <= 0:
        return None
    employee_name = text(item.get("employeeName"))
    date = text(item.get("date"))
    candidates = []
    for tx in finance_transactions:
        if tx.get("accountId") != "employee_advances":
            continue
        if money(tx.get("amount")) != amount:
            continue
        if date and tx.get("date") != date:
            continue
        if employee_name and employee_name not in text(tx.get("partyName")) and employee_name not in text(tx.get("description")):
            continue
        candidates.append(tx)
    return candidates[0] if len(candidates) == 1 else None


def build_ledger(db):
    source = (db.get("omni") or {}).get("workshopAdvances") or []
    finance_transactions = (db.get("finance") or {}).get("transactions") or []
    employees = employee_index(db)
    duplicate_keys = Counter((text(item.get("employeeName")), text(item.get("date")), money(item.get("amount")), text(item.get("advanceType"))) for item in source)
    ledger = []
    linked = 0
    pending_review = 0
    for item in source:
        key = canonical_key(item)
        employee = match_employee(employees, item.get("employeeName"))
        kind = normalize_advance_type(item.get("advanceType"))
        tx = link_cash_transaction(finance_transactions, item) if kind == "cash" else None
        review_flags = []
        if text(item.get("review")):
            review_flags.append("source_review")
        if kind == "review":
            review_flags.append("review_only")
        if duplicate_keys[(text(item.get("employeeName")), text(item.get("date")), money(item.get("amount")), text(item.get("advanceType")))] > 1:
            review_flags.append("possible_duplicate")
        if kind == "cash" and not tx:
            review_flags.append("cashbox_link_missing")
        if tx:
            linked += 1
        status = "needs_review" if review_flags else "open"
        if status == "needs_review":
            pending_review += 1
        ledger.append({
            "id": stable_id("eadv", key),
            "employeeId": employee.get("id") if employee else "",
            "employeeNameSnapshot": text(item.get("employeeName")),
            "date": text(item.get("date")),
            "period": f"{item.get('year')}-{str(item.get('month')).zfill(2)}" if item.get("year") and item.get("month") else text(item.get("date"))[:7],
            "amount": money(item.get("amount")),
            "type": kind,
            "advanceTypeRaw": text(item.get("advanceType")),
            "description": text(item.get("description")),
            "status": status,
            "reviewFlags": review_flags,
            "source": "omni.workshopAdvances",
            "sourceId": text(item.get("id")),
            "sourceCanonicalKey": key,
            "financeTransactionId": tx.get("id") if tx else "",
            "accountMoveId": tx.get("accountMoveId") if tx else "",
            "createdFromMigration": True,
            "createdAt": now(),
        })
    return ledger, {"linkedCashAdvances": linked, "pendingReviewAdvances": pending_review}


def sum_by_type(records):
    totals = Counter()
    for record in records:
        totals[record.get("type") or "unknown"] += money(record.get("amount"))
    return dict(totals)


def migrate(db):
    db.setdefault("employee_advances", [])
    db.setdefault("payroll_periods", [])
    db.setdefault("employee_payroll_closings", [])
    db.setdefault("payroll_payments", [])
    db.setdefault("payroll_adjustments", [])
    existing_manual = [item for item in db["employee_advances"] if item.get("source") != "omni.workshopAdvances"]
    ledger, link_report = build_ledger(db)
    db["employee_advances"] = existing_manual + ledger
    official_total = sum(money(item.get("amount")) for item in ledger)
    cash_total = sum(money(item.get("amount")) for item in ledger if item.get("type") == "cash")
    food_total = sum(money(item.get("amount")) for item in ledger if item.get("type") == "food")
    finance_txs = (db.get("finance") or {}).get("transactions") or []
    finance_1102_total = sum(money(tx.get("amount")) for tx in finance_txs if tx.get("accountId") == "employee_advances")
    finance_flagged_total = sum(money(tx.get("amount")) for tx in finance_txs if text(tx.get("employeeAdvance")) == "نعم")
    duplicate_groups = Counter((item.get("employeeNameSnapshot"), item.get("date"), item.get("amount"), item.get("advanceTypeRaw")) for item in ledger)
    duplicate_group_count = sum(1 for count in duplicate_groups.values() if count > 1)
    duplicate_extra_rows = sum(count - 1 for count in duplicate_groups.values() if count > 1)
    report = {
        "ledgerRows": len(ledger),
        "manualRowsPreserved": len(existing_manual),
        "officialAdvanceTotal": official_total,
        "cashAdvanceTotal": cash_total,
        "foodAdvanceTotal": food_total,
        "financeEmployeeAdvancesAccountTotal": finance_1102_total,
        "financeEmployeeAdvanceFlaggedTotal": finance_flagged_total,
        "financeVsOfficialDifference": finance_1102_total - official_total,
        "cashLedgerVsFlaggedCashDifference": cash_total - finance_flagged_total,
        "duplicateGroups": duplicate_group_count,
        "duplicateExtraRows": duplicate_extra_rows,
        "totalsByType": sum_by_type(ledger),
        **link_report,
    }
    omni = db.setdefault("omni", {})
    omni["employeeAdvancesReconciliation"] = {
        **report,
        "generatedAt": now(),
        "policy": "official ledger from omni.workshopAdvances; possible duplicates and missing cashbox links remain review items",
    }
    db.setdefault("audit_log", []).append({
        "id": f"audit_employee_advances_ledger_{dt.datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "action": "employee_advances_ledger_migration",
        "createdAt": now(),
        "createdBy": "codex",
        "details": report,
    })
    return report


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
        "work_orders", "audit_log", "employee_advances",
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
    backup = path.with_name(f"{path.name}.backup-before-employee-advances-ledger-{stamp}")
    shutil.copy2(path, backup)
    return backup


def main():
    parser = argparse.ArgumentParser(description="Create official employee_advances ledger from omni.workshopAdvances.")
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
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        db_backup = backup_file(args.db, stamp)
        sqlite_backup = backup_file(args.sqlite, stamp)
        args.db.write_text(json.dumps(next_db, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.sqlite.exists():
            save_sqlite(args.sqlite, copy.deepcopy(next_db))
        report["dbBackup"] = str(db_backup) if db_backup else ""
        report["sqliteBackup"] = str(sqlite_backup) if sqlite_backup else ""

    args.report_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.report_dir / f"employee_advances_ledger_{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    report["reportPath"] = str(report_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
