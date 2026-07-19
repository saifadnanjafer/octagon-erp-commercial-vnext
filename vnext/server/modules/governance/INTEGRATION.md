# R8.1, R8.2, R8.3, R8.4 & R8.5 Integration

- `migrations/801_r8_consolidation.mjs`, `migrations/802_r8_licensing.mjs`, `migrations/803_r8_sso.mjs`, `migrations/804_r8_integration.mjs`, and `migrations/805_r8_supportability.mjs` define the consolidation, tenancy, licensing, identity/SSO, integration hub, and upgrade/supportability schema.
- `consolidation-engine.js`, `licensing-engine.js`, `sso-engine.js`, `integration-engine.js`, and `support-engine.js` are the domain owners.
- `consolidation-routes.js`, `licensing-routes.js`, `sso-routes.js`, `integration-routes.js`, and `support-routes.js` are mounted at `/api/x/governance`.
- Inter-company rules support automatic generation of mirrored Sales Orders from Purchase Orders (and vice versa) across companies.
- Consolidation rate engine translates accounts across companies.
- Entitlement engine verifies HMAC signed license files. Supports standard/enterprise/saas editions, allowed modules gating, seat limits, and trial tenant database/company provisioning.
- OIDC/SAML configurations support user-identity linkages, auto-provisioning employee profiles, password length constraints, and MFA policy enforcements.
- Scoped API key creation checks sha256 token validity. Webhook registration hooks event callbacks. Credential vault secures API credentials, encrypted at rest via AES-256-CBC.
- Diagnostics engine runs SQLite integrity/FK audits and OS statistics monitoring. Support bundle exports table metadata and upgrade logs.
- Enforces strict company and tenant row-level security boundaries.
