# R10.2 — Frozen Payroll Compatibility Validation (Owner Sign-Off)

**Date:** 2026-07-26 · **Verdict:** zero delta across every historical period the
legacy store still holds · **Machine-readable record:** `R10_2_PAYROLL_SIGNOFF.json`
· **Acceptance suite:** `scripts/test-r10-payroll-compatibility.mjs` — **22/22 PASS**

---

## 1. What this proves

VNext can be migrated and run alongside the legacy system without changing a
single payroll figure. Specifically:

| Claim | Evidence |
|---|---|
| Closed payroll months still produce identical figures | Golden-month replay, zero delta on all 3 periods |
| The April month matches employee by employee, field by field | 7 employees × every captured field, byte-identical (sha256 digests equal) |
| The figures are not an artefact of one capture | The same numbers were captured **twice, independently, nine days apart** (R0 fixture 2026-07-17, R10.2 fixture 2026-07-26) and agree exactly |
| The named edge cases are genuinely covered | `friday_overtime`, `advances`, `month_end_bonus` all present on matched employees — plus `negative_balance`, `penalties`, `zero_attendance` |
| A full VNext migration does not touch payroll | Frozen store digest byte-identical before/after an R10.1 migration **plus** live post-cut-date GL posting |
| VNext has no payroll of its own | No payroll, attendance, or timesheet table exists in the VNext schema |
| The replay can actually fail | A deliberate 1-dinar drift, a missing summary, and a 0.01 total drift are each detected and named |

## 2. Fidelity per month — stated honestly

The legacy store does **not** hold the same depth for every month, and this
validation does not pretend otherwise.

| Month | Fidelity | What was compared |
|---|---|---|
| **2026-04** | `closing_detail` | All 7 per-employee `employee_payroll_closings` records, every captured field, byte-identical |
| **2026-05** | `period_totals` | Posted accrual total (601,303), advance-settlement total (2,853,001), payments (318,541), advance ledger (3,289,001 over 68 entries) |
| **2026-06** | `period_totals` | Posted accrual total (3,163,092), advance-settlement total (2,303,000), payments (182,879), advance ledger (3,534,000 over 95 entries) |

**Why 05 and 06 are period-level.** Those months were closed in the legacy app,
but their per-employee closing records were later superseded there — the surviving
`employee_payroll_closings` collection contains only the April set. The posted
journal totals, the payroll payments, and the advance ledger for May and June do
survive, and those are what has been proven. **No figure was reconstructed,
inferred, or recomputed to fill the gap.**

## 3. Decision needed from you (O-3)

> Accept period-level proof for 2026-05 and 2026-06 — **or** re-close those two
> months in the legacy app to regenerate their per-employee closing records, after
> which this validation can be re-run and will upgrade both months to
> `closing_detail` automatically.

Nothing else in Release 10 is blocked on this; it only affects how strong the
May/June claim in the GA package is.

## 4. Timesheet surface

The timesheet is **embedded read-only** and is not re-implemented in VNext:

- Data comes from the existing read-only legacy workshop bridge (`/api/x/r3/legacy-workshop`).
- The new payroll view (`vnext/client/modules/payroll-compat`) shows a permanent
  read-only badge and carries no create, edit, or state control.
- The API surface `/api/x/payroll-compat` has **no write verb at all**: any
  POST/PUT/PATCH/DELETE is refused with `WRITE_SURFACE_DENIED` *before*
  authentication is even considered, and there is no write permission defined to
  grant. Verified live against a running server, not only in tests.

## 5. What stays with the legacy application

Payroll, attendance, and timesheet **calculation and mutation remain exclusively
in the legacy app**. VNext reads them; it never writes them. The migration source
itself cannot even see them — the reader denies every frozen collection outright.

## 6. How to re-run this validation

```bash
node scripts/create-r10-payroll-golden-fixture.mjs && node scripts/test-r10-payroll-compatibility.mjs
```

The fixture builder reads production strictly read-only; the suite runs entirely
on a disposable database.
