# R6.3 Loyalty & membership engine test contract

`scripts/test-r6-loyalty.mjs` uses a disposable SQLite database and proves:

- loyalty program creation and list/get endpoints;
- loyalty card creation under partner/company scope;
- points earning and balance calculations;
- points redemption with balance enforcement;
- automatic tier upgrade based on 12-month points velocity (silver/gold threshold check);
- tier discount resolution (5% silver, 10% gold);
- gift card issuance, load, and redemption with balance and expiry enforcement;
- eWallet balance deposits, expenditures, and balance enforcement;
- company scope and permission enforcement on all routes;
- migration 633 schema restoration on down.
