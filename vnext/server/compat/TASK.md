# R0.3 Legacy Adapter Boundary

Adapters may read only the sanitized SQLite fixture in `vnext-fixtures/`. They do not open the production database, write data, or calculate payroll. `LegacyPayrollAdapter` delegates to an approved legacy-summary provider; the default test provider reads a frozen output captured from closed legacy payroll records.
