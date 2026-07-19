# Lane A — R1 Repair Pass Completion (T1.1.2, T1.1.3, T1.3.1)

As-built summary of what this lane changed. Owned paths only:
`vnext/server/registry/`, `vnext/server/crud/`, `vnext/server/state/`,
`vnext/server/workflow/`, `vnext/client/*.js` (flat), `migrations/102_r1_lane_a_completion.mjs`.
`server.js` was not touched — see `INTEGRATION.md` for the exact lines the
integrator needs to apply.

## T1.1.2 — `updateRecord()` ReferenceError (P0)

**Root cause confirmed exactly as briefed:** `vnext/server/crud/crud-engine.js`
`updateRecord(entity, id, patch, user, companyId)` referenced `cfg` at the old
line ~242, but `cfg` was never in that function's parameter list or closure —
`cfg` only existed as a local inside the sibling `handle()` function. Every
`PATCH /api/x/:entity/update/:id` request threw `ReferenceError: cfg is not
defined`, caught by the generic `catch` in `handle()` and returned as a
generic HTTP 500.

**Fix:** `updateRecord()` now looks up the entity's registry config itself via
`getRegistry()[entity]` — the same registry lookup `createRecord`/`summarize`/
`handle()` already use elsewhere in the file — instead of expecting `cfg` to
be threaded through as a parameter. This was chosen over changing
`updateRecord`'s parameter list because both call sites (the HTTP route in
`handle()` and the public `engine.updateRecord()` API used by `doc-state.js`
and the test harnesses) already call it with the `(entity, id, patch, user,
companyId)` shape — widening the signature would be a larger, riskier diff
for the same outcome.

**A second, more severe bug in the same class was found and fixed while
sweeping the file per the brief ("check the whole file for other functions
missing a cfg/registry lookup"):** `handle()` called `acl.entityAclKey(entityName)`
at two call sites (the main entity route and the `/api/x/audit/:entity/:id`
route), but `vnext/server/acl/acl-engine.js` never defines or exports
`entityAclKey` at all. This meant **every single CRUD HTTP route** —
create/read/update/delete/list/summary/audit, not just PATCH — threw
`TypeError: acl.entityAclKey is not a function` before even reaching verb
dispatch, also caught generically and returned as a 500. This is a bigger
finding than the one in the brief: the entire crud-engine HTTP surface was
non-functional, not just the update verb. Fixed entirely inside
`crud-engine.js` (not `acl-engine.js`, which is outside this lane's owned
paths) with a local `entityAclKey(entityName, cfg)` helper that reads the
`acl` key already seeded per-entity in `collection_registry.acl`
(`migrations/101_r1_lane_a_tables.mjs`), falling back to the bare entity name
if a registry entry has none.

**Verified no other verb has the same class of bug:** `createRecord(entity,
cfg, ...)` and `summarize(entity, cfg, ...)` both already receive `cfg` as an
explicit parameter from their call sites. `deleteRecord` never referenced
`cfg` at all. Confirmed by grepping every `acl.<name>` call in the file
against `acl-engine.js`'s actual exports — the only two undefined references
were the `entityAclKey` call sites now fixed.

## T1.1.3 — client CRUD UI reachable by browser navigation

`vnext/client/demo.html` and `vnext/client/chatter-demo.html` already existed
and already mount `OX.crud.mountEntity(host, 'crm_lead')` / `OX.chatter.mount(...)`
against a real container div with a self-contained fetch stub (list + create +
edit + delete + detail + relation lookups), so the "no real page mounts this
UI" framing in the audit doc was not fully accurate as of this pass — the gap
that *was* real: **every non-ASCII (Arabic) string across the entire
`vnext/client/*.js` set, plus `ui-crud.css` and `chatter.css`, was corrupted
mojibake** (UTF-8 bytes double-decoded through cp1252 and re-saved as UTF-8 —
the same failure mode documented in project memory
`feedback_no_powershell_on_utf8.md`). `demo.html` itself, `chatter-demo.html`,
`INTEGRATION.md`, and `TEST.md` were unaffected; every `.js`/`.css` file
alongside them was 100% affected — e.g. `data-act="new">➕ جديد</button>`
had become `data-act="new">âž• Ø¬Ø¯ÙŠØ¯</button>`. This is a genuinely
broken/incomplete state (the "if a demo page exists but is broken or
incomplete, fix it" branch of the brief) — the mounted page would have
rendered as garbage Arabic in a real browser.

**Fix:** reversed the corruption byte-for-byte (read the file as UTF-8, map
each character back to its original byte through a Windows-1252 decode
table built via `TextDecoder('windows-1252')`, then re-decode those bytes as
UTF-8) for all 10 corrupted `.js` files plus `ui-crud.css`/`chatter.css`, and
stripped the BOM the corruption pass had also added. Verified byte-level:
only the BOM fell outside the Windows-1252 range in every file (a clean,
lossless, single-pass corruption — not touched with PowerShell text cmdlets,
per project policy). `node --check` passes on all 10 `.js` files after the
fix; spot-checked Arabic strings render correctly.

Files fixed: `acl-admin.js`, `chatter.js`, `entity-ui-registry.js`,
`excel.js`, `home-widgets.js`, `inbox.js`, `print.js`, `ui-crud.js`,
`views-fields.js`, `workflow-builder.js`, `ui-crud.css`, `chatter.css`.

**Reachability:** confirmed `crm_lead` is a real seeded entity
(`migrations/101_r1_lane_a_tables.mjs`) that `demo.html`'s first tab mounts.
Per the coordinator's correction, this lane does **not** rely on or endorse
the current unrestricted static handler in `server.js`
(`path.join(__dirname, decodeURIComponent(pathname))`, no allowlist) as the
delivery mechanism — see `INTEGRATION.md` for the exact file list to
allowlist instead.

## T1.3.1 — Document State Machine gaps

### (a) Full-graph validation on state-def registration

`POST /api/x/state/defs/:entity` (`vnext/server/state/doc-state.js`) now runs
`validateStateDefinition(body)` before persisting anything:

- `states` must be a non-empty array. Each entry may be a plain string
  (`"draft"`) or an object with per-state metadata
  (`{ name: 'posted', terminal: true }` — `immutable` is accepted as a
  synonym for `terminal`).
- `initial` must be declared (explicit `initial` field, or a state literally
  named `"draft"` as the default, matching `getDocState()`'s existing
  default for records with no `x_doc_states` row).
- Every transition's `from`/`to` must reference a declared state, and every
  transition needs an `action`.
- Every declared state must be reachable from `initial` by following the
  transition edges (BFS/reachability over the declared graph).

Any violation returns `400` with `error` plus `meta.problems: [...]` listing
**every** specific problem found (not just the first) — e.g. `"الحالات
التالية غير قابلة للوصول من الحالة الابتدائية [draft] عبر مسارات الانتقال
المعرّفة: orphan"`. A successful registration now also records `updated_at`/
`updated_by` on `x_doc_state_defs` (migration 102).

Cycles are intentionally **not** rejected — a state machine cycle (e.g.
`posted -> cancelled -> draft` reopen flow) is a legitimate ERP document
pattern and the brief only asked for reachability + reference validity, not
acyclicity.

### (b) Posted-document immutability

`crud-engine.js` gained an additive **pre-write guard** mechanism, distinct
from the existing post-write `subscribe()`/`onWrite()` notification hooks
(which cannot veto a write): `engine.registerGuard(fn)` where
`fn(entity, id, action, beforeDoc)` returns an Arabic error string to reject
the write (thrown as `HTTP 409`) or a falsy value to allow it.
`updateRecord()` and `deleteRecord()` both call `checkWriteGuards()` once, up
front, before making any change.

`doc-state.js` registers exactly one guard, only if `deps.crudEngine` is
supplied to `mountDocState()` (additive — omitting it changes nothing): it
looks up the record's current doc-state and rejects the write if the current
state's definition entry is flagged `terminal`/`immutable`.

This does **not** block the state-transition endpoint itself
(`POST /api/x/state/:entity/:id/transition`), because `handleTransition()`
writes to `x_records` directly and never calls `crud-engine`'s
`updateRecord`/`deleteRecord` — so a defined reversal transition
(e.g. `posted -> cancelled`) on a terminal-state record still works exactly
as the invariant requires ("immutable except via defined reversal
transitions"), while a generic `PATCH`/`DELETE` on the same record is
rejected with 409. Verified both directions in Suite 3 of the test script
(non-terminal records are unaffected — no over-blocking).

## Schema (migration 102)

`migrations/102_r1_lane_a_completion.mjs` adds `updated_at`/`updated_by`
columns to `x_doc_state_defs` (audit trail for who registered/replaced a
lifecycle graph). The `terminal`/`immutable` flag itself is **not** a new
column — it's a per-state property that lives inside the existing
`definition` JSON blob (`states: [{ name, terminal }]`), since one entity's
lifecycle can have both terminal and non-terminal states.

**Ordering note (also see the cross-lane finding below):** `x_doc_state_defs`
is normally created in `501_r1_kernel_completion.mjs`, which sorts *after*
`102` in the migration filename order on a fresh database. `102` therefore
`CREATE TABLE IF NOT EXISTS`s the full 4-column shape itself, making the two
migrations commutative regardless of which one a given database happened to
run first (fresh DB: 102 defines it, 501's own `IF NOT EXISTS` becomes a
no-op; already-deployed DB where 501 ran historically: 102's `addColumn()`
calls top up the two new columns).

## Cross-lane finding (not fixed here — outside owned paths)

While diagnosing the migration-ordering issue above, the same hazard was
found in **`migrations/202_r1_lane_b_completion.mjs`** (Lane B's file — not
touched): it `ALTER TABLE`s `x_approval_policies`/`x_approvals`, both created
in `501_r1_kernel_completion.mjs`, which sorts *after* `202`. On a fresh
database this makes `vnext/server/db/migration-runner.mjs`'s
`runMigrations()` (which aborts entirely on the first `migration.up()` that
throws) fail before `501` (and everything after `202`) ever runs — a
blocking issue for any lane, not just this one. Flagged for the
integrator/Lane B; this lane's own test script works around it locally (see
`TEST.md`) by applying migrations directly instead of through the shared
all-or-nothing runner, specifically to avoid being blocked by another lane's
concurrent, unrelated migration while still proving Lane A's own changes work
end-to-end once the full migration set is healthy.
