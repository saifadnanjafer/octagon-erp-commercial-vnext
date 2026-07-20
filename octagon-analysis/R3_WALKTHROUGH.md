# R3 walkthrough

1. Fresh migrations 610-618 build the R3 relational surface after R2 migration 609; migration 618 owns blocker-closure state.
2. The shared `/api/x/r3` router derives actor and company from the authenticated session and scope resolver.
3. Product/pricing reuses `product_master`; sales, procurement, inventory, manufacturing, landed/subcontracting, and services flows delegate ledger posting to the existing stock and AR/AP engines; inventory posting remains online-only.
4. `vnext/client/r3.html` is an Arabic RTL responsive workbench with live domain tabs, company-scoped lists, and server-backed product creation.
5. The disposable core, blocker-closure, HTTP, migration, regression, permission, provenance, runtime-boundary, and interactive desktop/mobile browser gates pass. External review is the next gate.
