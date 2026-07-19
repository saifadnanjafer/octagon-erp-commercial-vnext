# R6.4 Customer & vendor portals

Scoped portal endpoints for quotes, orders, bills, statements, and RFQs, bound to the user's mapped partner profile.

Frozen boundaries:
- Existing `partner_master`, product, and finance primitives remain canonical.
- Portal users can only read and write data scoped to their linked partner.
- No unlinked user can bypass the portal access validation gate.
