#!/usr/bin/env python3
import argparse
import json
import sqlite3
from collections import Counter
from pathlib import Path


DEFAULT_DB = Path(__file__).resolve().parents[1] / "database.json"
DEFAULT_SQLITE = Path(__file__).resolve().parents[1] / "database.db"

EXPECTED = {
    "employees": 26,
    "attendanceRecords": 1298,
    "financeTransactions": 526,
    "officialAdvances": 373,
    "cashOpening": 997000,
    "cashInflow": 29199000,
    "cashOutflow": 30153000,
    "cashNet": -954000,
    "cashClosing": 43000,
}


def money(value):
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sqlite_collection_counts(path):
    if not path.exists():
        return {}
    con = sqlite3.connect(path)
    try:
        cur = con.cursor()
        tables = {row[0] for row in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "collections" not in tables:
            return {}
        return {name: count for name, count in cur.execute(
            "SELECT collection, COUNT(*) FROM collections GROUP BY collection"
        )}
    finally:
        con.close()


def cashbox_totals(transactions):
    inflow = 0
    outflow = 0
    net = 0
    cash_rows = 0
    for tx in transactions:
        if tx.get("sourceType") != "cashbox":
            continue
        effect = money(tx.get("cashboxEffect"))
        if effect == 0:
            amount = money(tx.get("amount"))
            effect = amount if tx.get("direction") == "in" else -amount if tx.get("direction") == "out" else 0
        if effect == 0:
            continue
        cash_rows += 1
        net += effect
        if effect > 0:
            inflow += effect
        else:
            outflow += abs(effect)
    return {"cashRows": cash_rows, "cashInflow": inflow, "cashOutflow": outflow, "cashNet": net}


def build_report(db, sqlite_counts):
    finance = db.get("finance") or {}
    omni = db.get("omni") or {}
    employees = db.get("employees") or []
    transactions = finance.get("transactions") or []
    official_advances = omni.get("workshopAdvances") or []
    employee_advances = db.get("employee_advances") or []
    cash = cashbox_totals(transactions)
    cash_opening = money(finance.get("cashOpening"))
    account_ids = {account.get("id") for account in finance.get("accounts") or []}
    source_keys = Counter(tx.get("sourceCanonicalKey") for tx in transactions if tx.get("sourceCanonicalKey"))
    advance_keys = Counter((
        item.get("employeeName") or item.get("employee_name") or item.get("employee") or "",
        item.get("date") or "",
        money(item.get("amount")),
        item.get("advanceType") or item.get("advance_type") or item.get("type") or "",
    ) for item in official_advances)

    report = {
        "employees": len(employees),
        "attendanceRecords": sum(len(emp.get("records") or []) for emp in employees),
        "financeTransactions": len(transactions),
        "officialAdvances": len(official_advances),
        "employeeAdvancesLedger": len(employee_advances),
        "employeeAdvancesLedgerTotal": sum(money(item.get("amount")) for item in employee_advances),
        "employeeAdvancesLedgerPendingReview": sum(1 for item in employee_advances if item.get("status") == "needs_review"),
        "officialAdvancesTotal": sum(money(item.get("amount")) for item in official_advances),
        "timesheetAdvanceTotal": sum(money(rec.get("advance")) for emp in employees for rec in emp.get("records") or []),
        "cashOpening": cash_opening,
        "cashInflow": cash["cashInflow"],
        "cashOutflow": cash["cashOutflow"],
        "cashNet": cash["cashNet"],
        "cashClosing": cash_opening + cash["cashNet"],
        "cashEffectRows": cash["cashRows"],
        "financeAccounts": len(finance.get("accounts") or []),
        "financeTransactionsWithoutAccountId": sum(1 for tx in transactions if not tx.get("accountId")),
        "financeTransactionsInvalidAccountId": sum(1 for tx in transactions if tx.get("accountId") and tx.get("accountId") not in account_ids),
        "duplicateFinanceSourceCanonicalKeys": sum(count - 1 for count in source_keys.values() if count > 1),
        "duplicateOfficialAdvanceGroups": sum(1 for count in advance_keys.values() if count > 1),
        "duplicateOfficialAdvanceExtraRows": sum(count - 1 for count in advance_keys.values() if count > 1),
        "accountMoves": len(db.get("account_moves") or []),
        "postedAccountMoves": sum(1 for move in db.get("account_moves") or [] if move.get("state") == "posted"),
        "journalEntries": len(db.get("journal_entries") or []),
        "payrollPeriods": len(db.get("payroll_periods") or []),
        "employeePayrollClosings": len(db.get("employee_payroll_closings") or []),
        "sqliteCollections": {
            "finance.transactions": sqlite_counts.get("finance.transactions", 0),
            "omni.workshopAdvances": sqlite_counts.get("omni.workshopAdvances", 0),
            "account_moves": sqlite_counts.get("account_moves", 0),
            "journal_entries": sqlite_counts.get("journal_entries", 0),
            "employee_advances": sqlite_counts.get("employee_advances", 0),
        },
    }
    mismatches = {}
    for key, expected in EXPECTED.items():
        actual = report.get(key)
        if actual != expected:
            mismatches[key] = {"expected": expected, "actual": actual}
    report["matchesExpectedBaseline"] = not mismatches
    report["mismatches"] = mismatches
    return report


def main():
    parser = argparse.ArgumentParser(description="Verify Octagon finance/payroll baseline before repair migrations.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--sqlite", type=Path, default=DEFAULT_SQLITE)
    parser.add_argument("--strict", action="store_true", help="Exit non-zero if expected baseline counts do not match.")
    args = parser.parse_args()

    db = load_json(args.db)
    report = build_report(db, sqlite_collection_counts(args.sqlite))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.strict and not report["matchesExpectedBaseline"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
