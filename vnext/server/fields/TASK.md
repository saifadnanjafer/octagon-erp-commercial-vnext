# Lane C completion — TASK (T1.5.1, T1.4.2, T1.8.1)

Scope: `octagon-analysis/R1_FINAL_COMPLETION_REPORT.md` rows T1.4.2, T1.5.1,
T1.8.1 and `octagon-analysis/OCTAGON_VNEXT_MASTER_ROADMAP.md` R1.5. Owned
paths only: `vnext/server/{sequences,audit,fields,notify,excel,print}/` +
matching client files. Migration: `migrations/302_r1_lane_c_completion.mjs`.

---

## T1.5.1 — Custom + snapshot fields

### Config shape

A custom field (`x_custom_fields`) may now be `type: 'snapshot'`. It carries
a `snapshot_of` JSON config (new nullable column, added by migration 302):

```json
{
  "entity": "product",
  "field": "price",
  "ref_field": "product_id",
  "at_transition_to": "posted"
}
```

Meaning: "when **this** record (the one carrying the snapshot field)
transitions to doc-state `at_transition_to`, copy the current value of
`field` from the record referenced by **this** record's own `ref_field` (a
foreign key into `entity`) into `data.custom[<this field's key>]`, then
freeze it forever."

Validated by `normalizeSnapshotOf()` in `fields/custom-fields.js`:
`entity`/`field`/`ref_field` reuse the file's existing `ENTITY_RE`/
`FIELD_KEY_RE`; `at_transition_to` must be a non-empty identifier-shaped
string (doc-state names are free text in `state/doc-state.js`, so this is
intentionally permissive, not tied to a fixed enum).

Creating/patching a field via `POST|PATCH /api/x/_custom-fields/:entity`
validates and stores this config; `GET` returns it as `snapshot_of` on the
field object. Editing a field's definition **never** touches values already
materialized into records — see "immutability" below.

### Materialization hook — why audit.js, not crud-engine.js or doc-state.js

Traced before writing any code (as instructed):

- `state/doc-state.js`'s `handleTransition()` performs its own **direct**
  `UPDATE x_records ...` and its own `writeAudit(...)` call. It never calls
  `crud-engine.js`'s `updateRecord()` / `onWrite()`. Confirmed by reading
  `state/doc-state.js:107-152` — there is no reference to the crud engine at
  all in that function.
- Therefore `crud-engine.js`'s existing `engine.subscribe(fn)` write-hook
  (the same one `chatter.js`'s `subscribeCrudChatter` uses) **does not fire
  on state transitions**. Confirmed by direct trace, not assumption.
- Both `state/doc-state.js` and `crud-engine.js` are owned by other lanes
  and are not edited here, per the brief.
- `audit/audit.js` **is** owned by this lane, and every single write path in
  the kernel — CRUD create/update/delete, doc-state transitions (which write
  `action: "state_transition_<name>"`), and this file's own view/custom-field
  admin ops — already funnels through `writeAudit()`. So the additive hook
  point chosen is a small **audit-event bus** added to `audit.js`:
  `subscribeAudit(fn)` / `notifyAuditSubscribers(entry)`, fired synchronously
  after every successful `writeAudit()` insert, with subscriber failures
  caught and logged (never allowed to break the audit write itself).

`fields/snapshot-fields.js` subscribes to that bus, filters for
`action.startsWith('state_transition_')` entries where
`entry.after.state` matches a configured `at_transition_to`, and
materializes matching snapshot fields for `entry.entity` / `entry.recordId`.

### Materialization semantics (hardened per 2026-07-17 correction)

- **Copy, never a live join.** `materializeOne()` reads the source record's
  field value **once**, at the moment of the transition, and writes it into
  the target record's own `data.custom[key]` **and** a durable shadow copy
  `data.__frozen_values__[key]`. Nothing in the read path re-resolves a
  snapshot field from its source — there is no join/lookup on read anywhere
  in this codebase for snapshot fields. `scripts/test-lane-c-completion.mjs`
  suite 3 proves this by changing the source record **twice** after
  materialization and asserting the snapshotted value never moves (byte
  identical both times), then separately confirming the source's own value
  actually did change (divergence proof), directly satisfying the roadmap
  acceptance test: "order line snapshot survives later product rename/price
  change (test proves divergence)."
- **Idempotent / freeze-once.** `isFrozen()` checks `__frozen_values__` first;
  if the key is already present, `materializeOne()` is a documented no-op
  (`{skipped:true, reason:'already_frozen'}`) — even if the same entity
  transitions through the same target state again later (e.g. a
  reversal→re-post cycle), the value is never re-materialized.
- **Unresolved references never freeze garbage.** If the FK reference or the
  source record/field cannot be resolved, materialization is skipped
  (`reason:'source_unresolved'`) rather than freezing `null`/`undefined`.

### Immutability — best-effort guard, and the honest gap

The roadmap also says the field is "immutable after" materialization. This
lane implements a **best-effort post-write self-heal**:
`wireImmutabilityGuard()` subscribes to `crudEngine.subscribe()` (the normal
CRUD write hook — a genuine `'update'` action **does** flow through
`crud-engine.js`, unlike state transitions) and, if a write changed a value
tracked in `__frozen_values__`, reverts it in the database and audit-logs a
`snapshot_write_blocked` entry.

**Known limitation, stated plainly:** this runs *after* the write has
already committed and after the HTTP response for that request has already
been prepared by `crud-engine.js`. A single offending `PATCH` may still echo
the rejected value in its own response; a subsequent `GET` reflects the
reverted, frozen value. A true pre-write `403` requires a hook inside
`crud-engine.js`'s `updateRecord()` / `acl-engine.js`'s
`checkForbiddenWrites()` path — neither file is owned by this lane and
neither is edited here. **Recommendation for the integrator:** add an
`entity`-scoped "frozen field" check to `checkForbiddenWrites()` (or a new
`beforeWrite` hook on `crud-engine.js` mirroring the existing `onWrite`)
once those files are next touched by their owning lane.

### Testing note: T1.1.2 dependency

`crud-engine.js`'s `updateRecord()` currently has a **pre-existing,
unrelated regression** (see `R1_FINAL_COMPLETION_REPORT.md` row T1.1.2):
`cfg` is referenced at `crud-engine.js:242` but is not in that function's
parameter list, so **every** `updateRecord()` call (HTTP or direct) throws
`ReferenceError`. This is owned by a different lane and is not touched here.
Because the immutability guard's real integration point is
`crudEngine.subscribe()`, and any real call into `crud-engine.js`'s update
path is currently broken independent of this lane's code,
`scripts/test-lane-c-completion.mjs` suite 4 tests the guard against a
**mock** `crudEngine` (`{ subscribe(fn) { ... } }`) that captures the
subscriber and invokes it directly with a hand-built post-write record —
this genuinely exercises this lane's own guard logic without depending on
another lane's bug being fixed first. Once T1.1.2 is fixed, an end-to-end
HTTP `PATCH` test through the real `crud-engine.js` should be added as a
follow-up (not blocking this lane's own deliverable).

### `snapshot_of` re-resolution guard on field-definition edits

Editing a snapshot field's definition (`PATCH /_custom-fields/:entity/:key`)
only changes config used for **future** materializations. It never touches
`x_records.data.custom[key]` for records that already materialized a value —
there is no code path in `custom-fields.js` that writes to `x_records` at
all. This satisfies the roadmap's "custom-field removal never destroys
stored values (tombstone)" invariant for snapshot fields specifically (and
was already implicitly true for all custom field types, since `DELETE
/_custom-fields/:entity/:key` only removes the field **definition** row, not
any record's stored `data.custom[key]` value).

---

## T1.4.2 — Client history panel

New file `vnext/client/history-panel.js` (+ `history-panel.css`). Consumes
the already-live, already-PASS backend endpoint
`GET /api/x/audit/:entity/:id` (`crud-engine.js`, mounted in `server.js`) —
no new server route was needed or added.

`OX.historyPanel.mount(el, entity, id, {fieldLabels})` renders an Arabic RTL,
field-level diff timeline grouped by day, visually matching `chatter.js`'s
widget conventions (`.oxhp-` prefix mirroring `.oxch-`, same CSS variable
set, skeleton→render split, avatar-initial bubbles). Internal/technical
fields (`id`, `created_at`, `__frozen_values__`, ...) are filtered out of the
diff view. Special-cased action labels exist for this lane's own new audit
actions (`state_transition_*`, `snapshot_materialize`,
`snapshot_write_blocked`) as well as the pre-existing ones
(`create`/`update`/`delete`/view/custom-field admin actions).

The file is **isomorphic on purpose**: pure formatting helpers
(`timeAgo`, `actionLabel`, `fieldLabel`, `formatValue`, `visibleChanges`,
`groupByDate`) are exposed via `module.exports` when running under Node (in
addition to `window.OX.historyPanel`), so
`scripts/test-lane-c-completion.mjs` can unit-test them without a browser,
and separately feeds them **real** `audit.getHistory()` output (suite 6) to
prove the backend/frontend halves actually interop, not just synthetic
fixtures.

A self-contained demo page, `vnext/client/history-demo.html` (mirrors the
existing `chatter-demo.html` pattern: in-page `fetch` stub, no server
needed), is included for manual/visual verification.

---

## T1.8.1 — Notify migration-hygiene fix

`vnext/server/notify/notify.js` no longer runs
`CREATE TABLE IF NOT EXISTS x_notification_preferences` at runtime inside
`mountNotify()`. That table is now created by
`migrations/302_r1_lane_c_completion.mjs`, using the same `IF NOT EXISTS`
DDL (safe/idempotent **inside a proper migration file** — the guardrail
violation was the runtime `db.exec()` call bypassing the migration system
entirely, not the `IF NOT EXISTS` clause itself). A dev DB that already has
this table from the old runtime path is unaffected (no data loss either
way) — verified in `scripts/test-lane-c-completion.mjs` suite 1, which
asserts the table exists **immediately after migrations run and before
`mountNotify()` is ever called**, and separately asserts (via source-text
inspection) that `notify.js` no longer contains the `CREATE TABLE` call
while `migrations/302` does.

---

## Cross-lane finding (reported, not fixed here)

While building the migration test harness for this lane, a **pre-existing,
high-severity, cross-lane migration-ordering defect** was discovered:
`migrations/102_r1_lane_a_completion.mjs`, `202_r1_lane_b_completion.mjs`,
and `402_r1_lane_d_completion.mjs` (this lane's own `302` is unaffected — see
below) all `ALTER TABLE`/reference tables that are created by
`migrations/501_r1_kernel_completion.mjs` (`x_doc_state_defs`,
`x_approval_policies`/`x_approvals`, `x_api_keys`, `x_installed_modules`).
`vnext/server/db/migration-runner.mjs` (shared, not owned by this lane)
applies migrations in plain filename-alphabetical order, which runs `102`
**before** `501` — so `runMigrations({direction:'up'})` throws
`no such table: x_doc_state_defs` on any fresh database. This reproduces
today against **both** `scripts/test-vnext-kernel-completion.mjs` (the
existing shared test) and would reproduce at real `server.js` boot on a
fresh `vnext-data/vnext.db`.

This lane's own `migrations/302_r1_lane_c_completion.mjs` only touches
`x_notification_preferences` (self-created) and `x_custom_fields` (created
by `migrations/301`, which sorts *before* `302`) — so `302` itself has no
ordering dependency on `501` and is not part of this defect. It is reported
here because it blocks running the full migration chain at all, and because
`102`/`202`/`402`/`501` are outside this lane's owned paths (per the brief:
"do not touch ... migrations/ ordering/index files"). Not fixed in this
pass. `scripts/test-lane-c-completion.mjs` documents this in its header
comment and works around it **only inside the test script** (applies every
real migration's unmodified `up()` function directly, in a dependency-safe
order, instead of using the alphabetical batch runner) — no migration file
was edited to make this lane's own tests pass.

**Recommended fix for whoever owns `migration-runner.mjs`/renumbering:**
either (a) teach the runner to resolve intra-batch dependencies instead of
pure alphabetical order, or (b) renumber so completion migrations sort after
`501` (e.g. move `501` to `099` / rename the block convention), or (c) split
`501`'s table-creation responsibilities back into each lane's own base
(`101`/`201`/`301`/`401`) migration so no completion migration depends on a
migration that sorts after it. Out of scope for this lane to decide/execute.

## Out of scope (explicitly not touched)

`server.js`, `crud-engine.js`, `doc-state.js`, `acl-engine.js`,
`ui-crud.js`/`entity-ui-registry.js`/`demo.html`, `VNEXT_PROGRESS.md`,
anything under `octagon-analysis/`, payroll/timesheet/attendance (defended
in code via `FROZEN_ENTITY_RE`, matching `chatter.js`'s existing pattern).
`vnext/client/inbox.js` was inspected but not touched — no notification
wiring was required for these three tasks.
