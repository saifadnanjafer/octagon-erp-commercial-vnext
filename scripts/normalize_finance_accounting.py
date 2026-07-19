#!/usr/bin/env python3
import argparse
import copy
import datetime as dt
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
    {"id": "rent_expense", "code": "5301", "name": "إيجار", "type": "expense", "normal_side": "debit"},
    {"id": "utilities_expense", "code": "5302", "name": "كهرباء وماء", "type": "expense", "normal_side": "debit"},
    {"id": "transport_fuel_expense", "code": "5303", "name": "نقل ووقود", "type": "expense", "normal_side": "debit"},
    {"id": "marketing_ads_expense", "code": "5401", "name": "تسويق وإعلانات", "type": "expense", "normal_side": "debit"},
    {"id": "expense_general", "code": "5299", "name": "مصروفات عامة", "type": "expense", "normal_side": "debit"},
    {"id": "adjustments_differences", "code": "5900", "name": "فروقات وتسويات", "type": "expense", "normal_side": "debit"},
    {"id": "vat_payable", "code": "2200", "name": "ضريبة القيمة المضافة المستحقة (VAT)", "type": "liability", "normal_side": "credit"},
    {"id": "suspense", "code": "9999", "name": "حساب الاستيداع", "type": "asset", "normal_side": "debit"},
]


FINANCE_CATEGORIES = {
    "expense": [
        {"id": "cat_payroll", "name": "رواتب", "accountId": "expense_payroll"},
        {"id": "cat_employee_advance", "name": "سلف موظفين", "accountId": "employee_advances"},
        {"id": "cat_employee_benefits", "name": "طعام ومنافع", "accountId": "expense_employee_benefits"},
        {"id": "cat_materials", "name": "مواد", "accountId": "expense_materials"},
        {"id": "cat_tools", "name": "صيانة وعدد", "accountId": "expense_tools"},
        {"id": "cat_transport", "name": "نقل وتجهيز", "accountId": "expense_general"},
        {"id": "cat_general", "name": "مصروف عام", "accountId": "expense_general"},
        {"id": "cat_suspense", "name": "تسوية/استيداع", "accountId": "suspense"},
    ],
    "income": [
        {"id": "cat_sales", "name": "وارد مبيعات", "accountId": "income_sales"},
        {"id": "cat_service", "name": "خدمة/تصنيع", "accountId": "income_sales"},
        {"id": "cat_customer_payment", "name": "تسديد عميل", "accountId": "receivables_customers"},
        {"id": "cat_suspense_in", "name": "تسوية واردة", "accountId": "suspense"},
    ],
}


FINANCE_DEPARTMENTS = [
    {"id": "dept_workshop", "name": "الورشة"},
    {"id": "dept_projects", "name": "المشاريع"},
    {"id": "dept_sales", "name": "المبيعات"},
    {"id": "dept_admin", "name": "الإدارة"},
    {"id": "dept_payroll", "name": "الرواتب"},
]


KNOWN_COLLECTIONS = {
    "employees",
    "contacts",
    "departments",
    "users",
    "locations",
    "quants",
    "stock_moves",
    "transfers",
    "journals",
    "journal_entries",
    "account_moves",
    "account_payments",
    "account_partial_reconciles",
    "payments",
    "maintenance_requests",
    "production_orders",
    "work_orders",
    "audit_log",
}


def text(value):
    return str(value or "").strip()


def money(value):
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def has_any(value, tokens):
    value = text(value)
    return any(token in value for token in tokens)


def classify_transaction(tx):
    category = text(tx.get("cashboxCategory") or tx.get("categoryName"))
    tx_type = text(tx.get("type"))
    direction = text(tx.get("direction"))
    employee_advance = text(tx.get("employeeAdvance"))

    if tx_type == "salary_payment":
        return "expense_payroll", "cat_payroll", "dept_payroll"
    if tx_type == "advance" or employee_advance == "نعم" or "سلفة" in category:
        return "employee_advances", "cat_employee_advance", "dept_payroll"
    if direction == "in" or tx_type in {"income", "sales_receipt"}:
        if has_any(category, ("رصيد", "فرق", "تسوية", "ملاحظة")):
            return "suspense", "cat_suspense_in", "dept_admin"
        return "income_sales", "cat_sales", "dept_sales"
    if has_any(category, ("وجبة", "طعام", "ضيافة", "مشروبات")):
        return "expense_employee_benefits", "cat_employee_benefits", "dept_payroll"
    if has_any(category, ("مواد", "شراء", "مورد", "مستلزمات", "طلبية")):
        return "expense_materials", "cat_materials", "dept_workshop"
    if has_any(category, ("صيانة", "عدد", "معدات", "تصليح", "مولدة", "أدوات")):
        return "expense_tools", "cat_tools", "dept_workshop"
    if has_any(category, ("كروة", "نقل", "بنزين", "مركبات", "سفر", "كهرباء", "ماء", "غاز")):
        return "expense_general", "cat_transport", "dept_workshop"
    if has_any(category, ("فرق", "تسوية", "رصيد", "ملاحظة")):
        return "suspense", "cat_suspense", "dept_admin"
    return "expense_general", "cat_general", "dept_workshop"


def merge_by_id(records, defaults):
    records = records if isinstance(records, list) else []
    by_id = {item.get("id"): item for item in records if isinstance(item, dict)}
    added = 0
    for default in defaults:
        current = by_id.get(default["id"])
        if not current:
            records.append(copy.deepcopy(default))
            added += 1
        else:
            for key, value in default.items():
                if not current.get(key):
                    current[key] = value
    return records, added


def normalize_finance(db):
    finance = db.setdefault("finance", {})
    finance.setdefault("transactions", [])
    finance["accounts"], accounts_added = merge_by_id(finance.get("accounts", []), CHART_ACCOUNTS)
    finance["departments"], departments_added = merge_by_id(finance.get("departments", []), FINANCE_DEPARTMENTS)

    categories = finance.setdefault("categories", {})
    category_adds = 0
    for side, defaults in FINANCE_CATEGORIES.items():
        categories[side], added = merge_by_id(categories.get(side, []), defaults)
        category_adds += added

    account_ids = {account.get("id") for account in finance["accounts"]}
    category_ids = {item.get("id") for side in categories.values() for item in side if isinstance(item, dict)}
    department_ids = {item.get("id") for item in finance["departments"]}

    changed_transactions = 0
    empty_before = sum(1 for tx in finance["transactions"] if not tx.get("accountId"))
    source_keys = []
    for idx, tx in enumerate(finance["transactions"], start=1):
        before = (tx.get("accountId"), tx.get("categoryId"), tx.get("departmentId"), tx.get("sourceCanonicalKey"))
        if not tx.get("id"):
            tx["id"] = f"finance_tx_{idx:04d}"
        if not tx.get("sourceType"):
            tx["sourceType"] = "cashbox"
        if not tx.get("sourceId"):
            tx["sourceId"] = tx["id"]
        account_id, category_id, department_id = classify_transaction(tx)
        tx["accountId"] = account_id
        tx["categoryId"] = category_id
        tx["departmentId"] = department_id
        tx["chartAccountId"] = account_id
        tx["accountingSource"] = "finance.transactions"
        tx["sourceCanonicalKey"] = "|".join([text(tx.get("sourceType")), text(tx.get("sourceId")), text(tx.get("type")), str(money(tx.get("amount")))])
        source_keys.append(tx["sourceCanonicalKey"])
        after = (tx.get("accountId"), tx.get("categoryId"), tx.get("departmentId"), tx.get("sourceCanonicalKey"))
        if before != after:
            changed_transactions += 1

    invalid_accounts = [tx.get("id") for tx in finance["transactions"] if tx.get("accountId") not in account_ids]
    invalid_categories = [tx.get("id") for tx in finance["transactions"] if tx.get("categoryId") not in category_ids]
    invalid_departments = [tx.get("id") for tx in finance["transactions"] if tx.get("departmentId") not in department_ids]
    duplicate_source_keys = {key: count for key, count in Counter(source_keys).items() if count > 1 and key}

    db.setdefault("audit_log", [])
    db["audit_log"].append({
        "id": f"audit_finance_chart_normalize_{dt.datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "action": "finance_chart_normalize",
        "createdAt": dt.datetime.now().replace(microsecond=0).isoformat(),
        "createdBy": "codex",
        "details": {
            "accountsAdded": accounts_added,
            "categoriesAdded": category_adds,
            "departmentsAdded": departments_added,
            "changedTransactions": changed_transactions,
            "emptyAccountIdsBefore": empty_before,
            "invalidAccountsAfter": len(invalid_accounts),
            "duplicateSourceKeys": len(duplicate_source_keys),
        },
    })

    return {
        "accountsAdded": accounts_added,
        "categoriesAdded": category_adds,
        "departmentsAdded": departments_added,
        "changedTransactions": changed_transactions,
        "emptyAccountIdsBefore": empty_before,
        "transactionCount": len(finance["transactions"]),
        "invalidAccountsAfter": invalid_accounts,
        "invalidCategoriesAfter": invalid_categories,
        "invalidDepartmentsAfter": invalid_departments,
        "duplicateSourceKeys": duplicate_source_keys,
        "accountDistribution": dict(Counter(tx.get("accountId") for tx in finance["transactions"])),
        "categoryDistribution": dict(Counter(tx.get("categoryId") for tx in finance["transactions"])),
    }


def extract_db_collections(obj, path="", collections=None, metadata=None):
    if collections is None:
        collections = {}
    if metadata is None:
        metadata = {}
    if obj is None:
        return collections, metadata

    is_known_collection = path in KNOWN_COLLECTIONS or (path.startswith("omni.") and isinstance(obj, list))
    if isinstance(obj, list):
        has_ids = bool(obj) and all(isinstance(x, dict) and x.get("id") is not None for x in obj)
        if is_known_collection or has_ids:
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
            for idx, rec in enumerate(records, start=1):
                raw_id = rec.get("id") if isinstance(rec, dict) else None
                rec_id = str(raw_id or f"{collection[:3]}_{idx:04d}")
                key = (collection, rec_id)
                counter = 1
                while key in seen:
                    rec_id = f"{raw_id or collection[:3]}_dup{counter}"
                    key = (collection, rec_id)
                    counter += 1
                seen.add(key)
                if isinstance(rec, dict) and rec.get("id") != rec_id:
                    rec["id"] = rec_id
                con.execute(
                    "INSERT INTO collections (collection, id, data) VALUES (?, ?, ?)",
                    (collection, rec_id, json.dumps(rec, ensure_ascii=False)),
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
    backup = path.with_name(f"{path.name}.backup-before-finance-normalize-{stamp}")
    shutil.copy2(path, backup)
    return backup


def main():
    parser = argparse.ArgumentParser(description="Normalize Octagon finance transactions against the chart of accounts.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--sqlite", type=Path, default=DEFAULT_SQLITE)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    db = json.loads(args.db.read_text(encoding="utf-8"))
    report = normalize_finance(db)
    report["db"] = str(args.db)
    report["sqlite"] = str(args.sqlite)
    report["applied"] = bool(args.apply)

    if args.apply:
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        db_backup = backup_file(args.db, stamp)
        sqlite_backup = backup_file(args.sqlite, stamp)
        args.db.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.sqlite.exists():
            save_sqlite(args.sqlite, copy.deepcopy(db))
        report["dbBackup"] = str(db_backup) if db_backup else ""
        report["sqliteBackup"] = str(sqlite_backup) if sqlite_backup else ""

    args.report_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.report_dir / f"finance_accounting_normalization_{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    report["reportPath"] = str(report_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
