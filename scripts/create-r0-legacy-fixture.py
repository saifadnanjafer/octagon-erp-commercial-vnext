"""Create a sanitized R0 legacy fixture using SQLite's online backup API.

The source path is mandatory and opened read-only. The resulting fixture is
never a VNext runtime database and must not be pointed to by the application.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
from collections import Counter
from pathlib import Path

FROZEN_COLLECTIONS = {
    "employees",
    "employee_payroll_closings",
    "payroll_periods",
    "payroll_payments",
    "employee_advances",
    "omni.employeeAttendance",
    "omni.workshopTimesheetCases",
    "omni.workshopAdvances",
}

SENSITIVE_KEY_PARTS = (
    "name", "alias", "email", "phone", "mobile", "address", "note",
    "description", "token", "secret", "password", "credential", "iban",
    "national", "passport", "user", "created_by", "updated_by", "closedby",
)


def stable_token(prefix: str, value: object) -> str:
    digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def is_sensitive_key(key: str) -> bool:
    lowered = key.replace("_", "").lower()
    return any(part in lowered for part in SENSITIVE_KEY_PARTS)


def redact_value(value: object, key: str, employee_names: dict[str, str], id_map: dict[str, str]) -> object:
    if isinstance(value, dict):
        return {child_key: redact_value(child_value, child_key, employee_names, id_map) for child_key, child_value in value.items()}
    if isinstance(value, list):
        return [redact_value(child, key, employee_names, id_map) for child in value]
    if isinstance(value, str):
        if value in id_map:
            return id_map[value]
        if value in employee_names.values():
            return value
        if is_sensitive_key(key):
            if "name" in key.lower():
                return employee_names.setdefault(value, f"Employee {len(employee_names) + 1}")
            return f"redacted:{stable_token('field', value)}"
    return value


def parse_json(raw: str) -> object:
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}


def quote_identifier(value: str) -> str:
    return "[" + value.replace("]", "]]" ) + "]"


def table_counts(conn: sqlite3.Connection) -> dict[str, int]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
    return {name: conn.execute(f"SELECT COUNT(*) FROM {quote_identifier(name)}").fetchone()[0] for (name,) in rows}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="Production SQLite path; opened read-only.")
    parser.add_argument("--fixture", required=True, help="Sanitized fixture output path.")
    parser.add_argument("--manifest", required=True, help="Safe JSON manifest output path.")
    args = parser.parse_args()

    source = Path(args.source).resolve()
    fixture = Path(args.fixture).resolve()
    manifest = Path(args.manifest).resolve()
    if not source.exists():
        raise SystemExit(f"Source database does not exist: {source}")
    if source == fixture:
        raise SystemExit("Source and fixture paths must differ")
    fixture.parent.mkdir(parents=True, exist_ok=True)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    capture = fixture.with_suffix(fixture.suffix + ".capture.tmp")
    if capture.exists():
        capture.unlink()

    source_uri = f"file:{source.as_posix()}?mode=ro"
    src = sqlite3.connect(source_uri, uri=True)
    captured = sqlite3.connect(capture)
    try:
        before_counts = table_counts(src)
        user_version = src.execute("PRAGMA user_version").fetchone()[0]
        src.backup(captured)
    finally:
        captured.close()
        src.close()

    conn = sqlite3.connect(capture)
    try:
        # Keep only the frozen compatibility collections. Other tables are schema-only.
        original_rows = conn.execute("SELECT collection, id, data FROM collections").fetchall()
        frozen_rows = [row for row in original_rows if row[0] in FROZEN_COLLECTIONS]
        conn.execute("DELETE FROM collections")

        employee_names: dict[str, str] = {}
        id_map: dict[str, str] = {}
        for collection, row_id, raw in frozen_rows:
            payload = parse_json(raw)
            payload_id = str(payload.get("id", row_id)) if isinstance(payload, dict) else str(row_id)
            prefix = "employee" if collection == "employees" else collection.replace(".", "_").replace("-", "_")
            id_map[str(row_id)] = stable_token(prefix, row_id)
            id_map[payload_id] = stable_token(prefix, payload_id)

        golden_rows = []
        periods = {}
        for collection, row_id, raw in frozen_rows:
            payload = parse_json(raw)
            if collection == "payroll_periods" and isinstance(payload, dict):
                periods[str(payload.get("id", row_id))] = payload
        for collection, row_id, raw in frozen_rows:
            payload = parse_json(raw)
            if collection != "employee_payroll_closings" or not isinstance(payload, dict):
                continue
            period = periods.get(str(payload.get("payrollPeriodId")), {})
            golden_rows.append({
                "employeeId": id_map.get(str(payload.get("employeeId")), stable_token("employee", payload.get("employeeId", "unknown"))),
                "payrollPeriodId": id_map.get(str(payload.get("payrollPeriodId")), stable_token("period", payload.get("payrollPeriodId", "unknown"))),
                "year": period.get("year"),
                "month": period.get("month"),
                "attendanceDays": payload.get("attendanceDays"),
                "baseSalarySnapshot": payload.get("baseSalarySnapshot"),
                "grossSalary": payload.get("grossSalary"),
                "salaryDeductions": payload.get("salaryDeductions"),
                "currentPeriodAdvances": payload.get("currentPeriodAdvances"),
                "bonuses": payload.get("bonuses"),
                "damageDeductions": payload.get("damageDeductions"),
                "netAccruedSalary": payload.get("netAccruedSalary"),
                "netPayableAfterAdvanceSettlement": payload.get("netPayableAfterAdvanceSettlement"),
                "remainingAmount": payload.get("remainingAmount"),
                "status": payload.get("status"),
            })

        for collection, row_id, raw in frozen_rows:
            payload = redact_value(parse_json(raw), "", employee_names, id_map)
            if isinstance(payload, dict):
                payload["id"] = id_map.get(str(payload.get("id", row_id)), id_map.get(str(row_id), stable_token(collection, row_id)))
            sanitized_row_id = id_map.get(str(row_id), stable_token(collection, row_id))
            conn.execute("INSERT INTO collections(collection, id, data) VALUES (?, ?, ?)", (collection, sanitized_row_id, json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))))

        for (table_name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():
            if table_name not in {"collections"}:
                conn.execute(f"DELETE FROM {quote_identifier(table_name)}")

        conn.execute("CREATE TABLE r0_legacy_golden_summary (employee_id TEXT NOT NULL, payroll_period_id TEXT NOT NULL, summary_json TEXT NOT NULL, PRIMARY KEY (employee_id, payroll_period_id))")
        for summary in golden_rows:
            conn.execute("INSERT INTO r0_legacy_golden_summary(employee_id, payroll_period_id, summary_json) VALUES (?, ?, ?)", (summary["employeeId"], summary["payrollPeriodId"], json.dumps(summary, sort_keys=True, separators=(",", ":"))))
        conn.execute("CREATE TABLE r0_snapshot_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        conn.execute("INSERT INTO r0_snapshot_metadata(key, value) VALUES (?, ?)", ("sanitization", "R0 SQLite online backup; frozen collections only; identifiers and sensitive fields redacted"))
        conn.execute("INSERT INTO r0_snapshot_metadata(key, value) VALUES (?, ?)", ("source_user_version", str(user_version)))
        conn.commit()
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        after_counts = table_counts(conn)
    finally:
        conn.close()

    if integrity != "ok":
        raise RuntimeError(f"Sanitized fixture integrity failed: {integrity}")
    if fixture.exists():
        fixture.unlink()
    shutil.move(str(capture), str(fixture))
    safe_manifest = {
        "captureMethod": "SQLite online backup API from a read-only source connection",
        "sourceDatabase": str(source),
        "fixtureDatabase": str(fixture),
        "sourceUserVersion": user_version,
        "sourceTableCounts": before_counts,
        "fixtureTableCounts": after_counts,
        "frozenCollections": sorted(FROZEN_COLLECTIONS),
        "goldenSummaryRows": len(golden_rows),
        "integrityCheck": integrity,
        "sanitization": {
            "sessionsAndOperationalTables": "cleared",
            "collections": "whitelist only",
            "identifiers": "stable pseudonyms",
            "namesNotesCredentials": "redacted",
            "uploadsAttachments": "not copied",
        },
    }
    manifest.write_text(json.dumps(safe_manifest, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(safe_manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"R0 fixture creation failed: {error}", file=sys.stderr)
        raise
