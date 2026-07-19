# R6.6 eCommerce foundation test contract

`scripts/test-r6-ecommerce.mjs` uses a disposable SQLite database and proves:

- publishing and unpublishing products in the catalog;
- listing online catalog items (checks only published items return);
- creating guest shopping carts with unique session tokens;
- adding items to cart, updating quantity, and removing items;
- checking out a guest cart (creates draft sales order/lines and auto-creates guest partner);
- checking out a registered cart linked to a partner;
- company scope and permissions checks;
- migration 636 schema restoration on down.
