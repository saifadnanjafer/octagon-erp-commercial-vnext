# R6.7 Integration

- `migrations/637_r6_campaign.mjs` depends on `636_r6_ecommerce` and owns the `omni_campaign` and `omni_message_log` tables.
- `campaign-engine.js` is the domain owner.
- `campaign-routes.js` is mounted at `/api/x/campaigns`.
- Dispatches target partners, interpolates placeholders including loyalty card balances, and logs delivery states.
- Webhook routes handle inbound reports (DLR) and customer replies.
