# R8.1 Multi-company operations & consolidation test contract

`scripts/test-r8-consolidation.mjs` uses a disposable SQLite database and proves:

- creating inter-company rules between different companies;
- triggering inter-company mirroring (confirming Purchase Order automatically spawns mirrored Sales Order in the target company);
- exchange rate translation rules;
- consolidated trial balance report with correct currency translations;
- automatic inter-company balance elimination from consolidated reports;
- security routing checks;
- migration 801 schema restoration on down.
