# R7.1 Shop-floor execution terminals test contract

`scripts/test-r7-shopfloor.mjs` uses a disposable SQLite database and proves:

- creating operators and handling badge PIN collisions;
- operator kiosk login via PIN;
- work order action logs (start, pause, finish) updating state (running, paused, completed);
- automatic scrap logging into the `mrp_scrap` table;
- material issues and optional stock move consumption;
- company scope and permissions checks;
- migration 701 schema restoration on down.
