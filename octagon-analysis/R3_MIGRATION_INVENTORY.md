# R3 migration inventory

| ID | File | Depends on | Scope | Rollback |
|---|---|---|---|---|
| 610_r3_product_pricing_core | `migrations/610_r3_product_pricing_core.mjs` | 609 | canonical product extension, categories, UOM, barcode, variants | supporting tables/indexes removed; R2 product table remains migration-owned |
| 611_r3_pricing_rules | `migrations/611_r3_pricing_rules.mjs` | 610 | price lists, rules, promotions, coupons | tables removed |
| 612_r3_sales_core | `migrations/612_r3_sales_core.mjs` | 611 | sales pipeline, delivery, RMA, commission | tables and R3 partner credit columns removed with R2 chain |
| 613_r3_procurement_core | `migrations/613_r3_procurement_core.mjs` | 612 | procurement and match records | tables/indexes removed |
| 614_r3_inventory_operations | `migrations/614_r3_inventory_operations.mjs` | 613 | warehouse operations and reservations | tables removed |
| 615_r3_manufacturing_core | `migrations/615_r3_manufacturing_core.mjs` | 614 | BOM/routing/work-order records | tables/indexes removed |
| 616_r3_landed_subcontracting | `migrations/616_r3_landed_subcontracting.mjs` | 615 | landed/subcontract records | tables/index removed |
| 617_r3_services_helpdesk | `migrations/617_r3_services_helpdesk.mjs` | 616 | project/helpdesk/field-service records | tables removed |
| 618_r3_blocker_closure | `migrations/618_r3_blocker_closure.mjs` | 617 | ledger-linked closure state for sales, procurement, inventory, manufacturing, landed/subcontracting, services, SLA, and worklists | closure tables removed; product columns are migration-owned |
| 619_r3_control_plane_contracts | `migrations/619_r3_control_plane_contracts.mjs` | 618 | scoped approvals and idempotency contract fields/tables | idempotency table/indexes removed; x_approvals safely rebuilt without R3 fields |
| 620_r3_sla_business_clock | `migrations/620_r3_sla_business_clock.mjs` | 619 | SLA pause/resume state, business-seconds accounting, and last-tick state | helpdesk_ticket_sla safely rebuilt without R3 clock columns |

The dependency runner proved fresh build, reapply, reverse dependency rollback, restart-equivalent rebuild, and pre-existing order compatibility.

Compatibility note: `migrations/605_r2_stock_ledger.mjs` was restored to own the stock columns and inventory-adjustment table previously created by the R2 runtime compatibility hook. This preserves the T2.5.1 partial-migration fixture while keeping runtime DDL at zero. `vnext/server/db/sqlite-rebuild.mjs` provides safe SQLite table-rebuild downs for product_master, partner_master, and x_approvals; `scripts/test-r3-migration-rollback-fingerprints.mjs` proves row preservation, schema restoration, integrity, and FK safety.
