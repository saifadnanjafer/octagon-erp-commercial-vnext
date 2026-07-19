// R6.6 eCommerce Catalog and Carts Schema.
'use strict';

export const migration = {
  id: '636_r6_ecommerce',
  dependsOn: ['635_r6_booking'],
  up(db) {
    // Add eCommerce fields to product_master if they do not exist
    const columns = new Set(db.prepare('PRAGMA table_info(product_master)').all().map((row) => row.name));
    if (!columns.has('website_published')) {
      db.exec('ALTER TABLE product_master ADD COLUMN website_published INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.has('website_description')) {
      db.exec('ALTER TABLE product_master ADD COLUMN website_description TEXT');
    }
    if (!columns.has('website_image_url')) {
      db.exec('ALTER TABLE product_master ADD COLUMN website_image_url TEXT');
    }
    if (!columns.has('website_price')) {
      db.exec('ALTER TABLE product_master ADD COLUMN website_price REAL NOT NULL DEFAULT 0.0');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS ecommerce_cart (
        id            TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        partner_id    TEXT REFERENCES partner_master(id),
        session_token TEXT NOT NULL,
        state         TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active', 'completed', 'abandoned')),
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        UNIQUE(company_id, session_token)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS ecommerce_cart_line (
        id         TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        cart_id    TEXT NOT NULL REFERENCES ecommerce_cart(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES product_master(id),
        qty        REAL NOT NULL CHECK(qty > 0),
        unit_price REAL NOT NULL DEFAULT 0,
        UNIQUE(cart_id, product_id)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS ecommerce_cart_line;
      DROP TABLE IF EXISTS ecommerce_cart;
    `);
    // Note: SQLite does not support easy ALTER TABLE DROP COLUMN. Leaving product_master additions is standard.
  }
};
