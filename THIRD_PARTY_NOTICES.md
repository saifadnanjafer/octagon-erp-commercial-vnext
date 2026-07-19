# Third-Party Notices and Provenance Policy

## R0 status

No donor-source code has been copied into Octagon Commercial VNext during R0. This file records the reuse boundary before any engine is added.

## Permitted only with attribution

| Donor | Verified license | Rule |
|---|---|---|
| RuoYi-Vue-Pro (yudao) | MIT | Code may be used only with an entry here that identifies the copied component and preserves the required MIT notice. R0 uses no RuoYi code. |
| AureusERP | MIT at repository root | Code may be used only with an entry here that identifies the copied component and preserves the required MIT notice. A Webkul plugin requires separate license verification before use. R0 uses no AureusERP code. |

## Copy-prohibited or unresolved sources

- ERPNext (GPLv3), IDURAR (AGPLv3), Odoo Community and all Odoo Enterprise material: concepts, schemas, and independently written behavior only; no source copy or line-by-line port.
- NocoBase: clean-room only until its contradictory in-tree licensing is resolved by the owner (O-6).

## Required engine header

Every file under `vnext/server/` or `vnext/client/` that implements an engine must begin with a provenance line in its first eight lines:

```js
// clean-room; behavior modeled on <source/path or approved self reference> (<license or proprietary self>, not copied)
```

Run `node scripts/check-provenance.mjs` before any integration gate. A failure blocks the task.
