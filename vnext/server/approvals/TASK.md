# Lane B — R1 Completion Gaps (T1.6.1, T1.7.1, T1.9.1, T1.9.2)

Owned paths touched: `vnext/server/acl/`, `vnext/server/approvals/`, `vnext/server/chatter/`,
`vnext/client/inbox.js`. Migration: `migrations/202_r1_lane_b_completion.mjs`.
Test: `scripts/test-lane-b-completion.mjs` (isolated DB, see "Isolation" below).

No file outside these owned paths was edited. `server.js` was read-only referenced
for line numbers (see `INTEGRATION.md`) and never modified.

## Isolation note (binding correction applied)

All work in this pass runs against `vnext-data/test-lane-b.db` (created and
deleted by the test script itself) — never the shared `vnext-data/vnext.db`.
No live HTTP server was started and no network port was bound: every
HTTP-shaped route (`approvals.js`, `chatter.js`, `worklist-counts.js`) is
exercised via in-process mock `req`/`res` objects, the same pattern the
pre-existing `scripts/test-vnext-kernel-completion.mjs` and sibling
`scripts/test-lane-a/c-completion.mjs` already use. Port 8122 (reserved for
this builder) was not needed and was not opened.

---

## Task 1 — T1.9.2 Approval Center UI (nine boxes)

`vnext/server/approvals/approvals.js`: `BOXES` expanded from
`{todo, mine, done, cc}` to the canonical nine:
`my, todo, done, cc, delegated, escalated, withdrawn, rejected, returned`
(the exact keys/Arabic labels specified by the binding correction — `mine` was
renamed to `my` to match the canonical set; the Arabic label "طلباتي" is
unchanged).

### Box semantics (chosen meaning, since several of the nine are ambiguous by name alone)

| box | who sees it | condition |
|---|---|---|
| `my` | requester | `requester = me`, any status |
| `todo` | approver | `status='pending'` AND my role (direct or via active delegation) matches `approver_role` |
| `done` | approver | `status='approved'` AND I decided it (final `decided_by = me` OR I appear in `payload._policy.history`) |
| `cc` | anyone cc'd | `cc` contains me, any status |
| `delegated` | delegate only | `status='pending'` AND `approver_role` matches a role I hold **only** via an active `x_approval_delegations` row (excludes roles I hold directly — see 4.10/4.11 in the test) |
| `escalated` | requester + current/escalated-to approver | `escalated=1` (any status), visible to the requester and to whoever the escalation routed the request to |
| `withdrawn` | requester (+ cc) | `status='withdrawn'` |
| `rejected` | requester + decider (+ cc, + any intermediate step participant) | `status='rejected'` |
| `returned` | requester + decider (+ cc, + any intermediate step participant) | `status='returned'` |

`admin`/`all` roles bypass the per-row visibility narrowing on every box except
`my`/`todo` (which stay personal/role-scoped by design — an admin's "my" is
still just their own submissions).

`GET /api/x/approvals/counts` (new) returns all nine counts in one call so the
client doesn't fire nine separate requests to render badges.

`vnext/client/inbox.js`: rewritten to render all nine boxes as tab buttons
with live count badges (fed by `/counts`), following the existing card/tab
visual pattern (no redesign). Row actions added: **موافقة / رفض / إرجاع
للمراجعة** in `todo` (the `return` route already existed server-side but had
no UI button before this pass), **سحب الطلب** (withdraw) in `my` for still-
pending items. This file's Arabic strings were also mojibake-corrupted before
this pass (double-encoded UTF-8, e.g. `Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø§Øª` instead of `الموافقات`);
rewritten with correct UTF-8 throughout (verified with a byte-level check, not
just visual inspection — see TEST.md).

## Task 2 — T1.9.1 gaps: timeout escalation + withdraw

**(a) Timeout escalation.** `x_approval_policies.escalation_timeout_minutes`
(new column, migration 202; 0 = disabled, opt-in per entity). `runEscalationSweep(db, notifyRequester)`
is invoked on-demand from `dispatch()` whenever `list` or `counts` is called
(mirrors workflow-engine.js's own on-demand/interval hybrid pattern in spirit,
without importing or depending on that file). For every `status='pending'` row
whose `step_entered_at` exceeds its policy's timeout: advances to the next
sequential chain role (or falls back to `admin` if the chain is exhausted),
sets `escalated=1`, `escalated_at`, `escalated_from_role`, resets
`step_entered_at` (so it can escalate again later if still unanswered),
writes an audit row, and notifies the requester. Self-limiting: resetting
`step_entered_at` means it will not re-fire until the timeout elapses again
(see test 2.8).

**(b) Withdraw.** `POST /api/x/approvals/withdraw/:id` — confirmed missing
before this pass (no route matched `withdraw` anywhere in `dispatch()`).
Added: only the original requester may call it, only while `status='pending'`
(404 if missing, 403 if not the requester, 409 if already decided). Sets
`status='withdrawn'`.

*"Releases the document" interpretation:* `vnext/server/state/doc-state.js`
(read, not edited — owned by another lane) is a **generic** finite-state
machine keyed by `x_doc_state_defs`; it holds **no reference to `x_approvals`
at all** today (confirmed by reading the whole file — no `x_approvals` string
appears in it). There is no literal "approval-pending guard" construct to
unblock. The only signal any other engine could reasonably gate on is
`x_approvals.status = 'pending'` for a given `(entity, record_id)`; withdrawal
clears exactly that signal by moving the row to the terminal `withdrawn`
status. This is the full extent of "releasing the document" achievable from
within this lane without editing doc-state.js.

## Task 3 — T1.6.1 gaps: @mentions + attachments

**(a) @mentions.** `extractMentions(body)` parses `@token` (letters/digits/`_`/`.`/`-`,
2-60 chars) tokens, deduped, order-preserving. `notifyMentions()` inserts one
`x_notifications` row per mentioned user, called from `postChatterItem()`
right after `notifyFollowers()` (additive, not a replacement) and scoped to
`kind === 'message'` per the roadmap wording ("messages currently only notify
followers").

**(b) Attachments.** New `x_attachments` metadata table (migration 202):
`filename` (display only), `storage_name` (generated, on-disk), `mime_type`,
`size`, `uploader`, `entity`/`record_id`, `created_at`. Files live under
`vnext-data/files/` (created on demand). Routes, added to the existing
`/api/x/chatter/*` handler (same naming pattern as the thread routes):

- `POST /api/x/chatter/:entity/:id/attachments` — upload
- `GET  /api/x/chatter/:entity/:id/attachments` — list
- `GET  /api/x/chatter/attachments/:attachmentId` — download (streams the file)

*Transport choice:* this codebase has zero HTTP/body-parsing dependencies
beyond raw `http` (no `busboy`/`multer`/`formidable` in `node_modules`, and
`package.json` lists only `dotenv`). Hand-rolling a multipart/form-data parser
from scratch for this one route was judged out of proportion to the task, so
uploads use the same JSON-body convention every other route in this codebase
already uses: `{ filename, mime_type, data_base64 }`. The upload route uses a
raised body-size ceiling (15MB) inside `handle()`, not the 1MB generic limit
the other chatter routes use.

*Path-traversal prevention:* the on-disk filename is **always**
`<generated-id><short-safe-extension>` (e.g. `att_xxxxx.pdf`); the
client-supplied `filename` is stored only as a DB display column, never used
to build a filesystem path. `safeExtension()` only accepts 1-10 alphanumeric
characters after the last dot; a hostile filename like `../../etc/passwd.txt`
degrades to just the `.txt` extension. Verified in tests 6.2-6.4 (checks both
the DB row shape and that no file landed outside `vnext-data/files/`).

*ACL:* `checkRecordReadAccess(db, user, entity, recordId)` reuses
`acl.entityAclKey()` + `acl.scopeFor()` (this lane's own `acl-engine.js`) plus
the new `acl.rowScopeAllows()` predicate — the exact same
"`<entityAclKey>:read` + row-scope" gate a CRUD read would apply. Applied to
**all three** attachment routes (upload/list/download), not just download,
since an anonymous-upload/anonymous-list hole would be an equally real gap.
Returns 403 with no session/role match. See tests 6.6-6.8 for the pass/403
proof pair the task explicitly asked for.

## Task 4 — T1.7.1: scoped worklist counts

New file `vnext/server/acl/worklist-counts.js`, wired into the *existing*
`mountAclHttp()` call in `acl-engine.js` (so **no server.js change is
required** — see `INTEGRATION.md`). `GET /api/x/_worklist/counts?entity=<name>`
resolves the caller's ACL scope (`acl.scopeFor()`), builds a row-scope SQL
predicate (`own`→`created_by`, `dept`→`json_extract(data,'$.department')`,
`all`→no extra predicate), and returns the total plus a per-saved-view
(`x_views`, owned by another lane's `custom-fields.js` — read the table
directly, did not import/edit that file) breakdown applying each view's
`filters`/`q` on top of the same scope predicate.

*Department convention:* no session/user table anywhere in this codebase
currently carries a `department` field. Rather than invent cross-lane
plumbing, this feature reads an `x-department` header (falling back to
`session.user.department` if a future session shape adds it) — a
self-contained, documented convention scoped to this one feature. A
dept-scoped user with no configured department sees `0` (safe default, not a
leak) — see test 7.5.

Test (7.1-7.4) seeds one `own`-scope user, one `dept`-scope user, and one
`all`-scope user against the same `crm_lead` records and proves three
genuinely different counts for the identical worklist definition — exceeding
the "2 users" minimum the task asked for, to demonstrate all three named
scopes.

---

## Cross-cutting fix required to unblock Task 4 (and, in fact, every CRUD route)

`vnext/server/crud/crud-engine.js` (another lane's file, not edited) calls
`acl.entityAclKey(entityName)` on every single `create/read/update/delete/
list/summary` request. **`entityAclKey` did not exist anywhere in
`acl-engine.js`'s exports before this pass** — confirmed with a direct
`Object.keys(require('acl-engine.js'))` check, which listed `ACTIONS,
SCOPE_RANK, permMatches, resolveRole, can, scopeFor, resolveRequestUser,
maskFields, checkForbiddenWrites, mountAclHttp` and nothing else. This means
`octagonCrudEngine.handle()` threw `TypeError: acl.entityAclKey is not a
function` on **every** CRUD request in the running server, a severe,
pre-existing, whole-of-vnext-blocking defect. It sits squarely inside this
lane's own owned path (`vnext/server/acl/`), and Task 4 cannot function
without it (worklist counts need the exact same `<entity> -> <aclKey>`
mapping crud-engine.js needs), so it was fixed here: `entityAclKey(entity, db)`
mirrors the algorithm already used client-side in this lane's own
`vnext/client/acl-admin.js#entityAclKey` (collection_registry.acl → `<section>:
<entity-without-prefix>` → `platform:<entity>` fallback), with `db` optional
(falls back to the last db seen by `mountAclHttp()`, since crud-engine.js
calls it with only one argument and cannot be edited to pass a second).
Covered by tests 1.1-1.2.

Also added: `acl.rowScopeAllows(user, scope, record)` — a small, reusable,
exported implementation of the `{all, dept, own}` row-scope predicate the
task description refers to as "T1.2.2's row-scope predicates". It did not
previously exist as a standalone, reusable function (crud-engine.js inlines
its own ad hoc `own`-only check; there was no `dept` handling anywhere in the
codebase). Both the chatter attachment ACL gate and worklist-counts.js share
this one implementation. Covered by tests 1.3-1.6.

## Flagged findings (not fixed — out of this lane's scope, reported per instructions)

1. **R1 parallel-approval scope discrepancy.** `approvals.js`'s existing
   `decideApproval()` (lines ~207-245, pre-dating this pass) contains
   `isParallel`/`policy.approvedRoles` quorum-voting code from an earlier,
   out-of-scope repair pass. Per the binding correction, R1 approvals are
   **sequential only**. This pass does **not** extend, wire, or depend on
   that parallel path anywhere: `runEscalationSweep()` treats
   `policy.chain[currentIndex]` as a plain role string and never reads/writes
   `policy.approvedRoles`; the nine-box queries do not special-case parallel
   steps; the client UI does not surface a "still waiting on other approvers
   in this step" state. The parallel code itself was left untouched (not
   deleted, per "don't remove working code without explicit instruction").

2. **Migration-runner ordering defect (cross-lane, independently reconfirmed).**
   First documented by the sibling `scripts/test-lane-c-completion.mjs`
   "KNOWN CROSS-LANE DEFECT" note: `vnext/server/db/migration-runner.mjs`
   (not owned by this lane) applies migrations in plain filename-alphabetical
   order, so `102/202/302/402` all run **before** `501_r1_kernel_completion.mjs`
   — even though `x_approval_policies` (which `202` needs to `ALTER`) is
   created **by** `501`, not by `201`. This lane's own `202` migration works
   around it locally (a defensive `CREATE TABLE IF NOT EXISTS
   x_approval_policies (...)` using 501's exact original shape, before the
   `ALTER`), so it is safe regardless of run order — but the underlying
   ordering bug in `migration-runner.mjs` itself was **not** fixed here (out
   of this lane's owned paths per the binding correction). `scripts/test-lane-b-completion.mjs`
   deliberately applies migrations in the **real** plain-alphabetical order
   (not a hand-picked safe order) specifically to prove `202` survives it.

3. **`vnext/client/acl-admin.js` depends on `GET /api/x/_meta/entities`**,
   which does not exist anywhere server-side (confirmed by search). This
   pre-existing gap does not block any of the four tasks assigned to this
   lane (worklist-counts.js does not need it), so it was left alone rather
   than scope-creeping into a fifth, unassigned fix. Noted here for
   visibility only.

4. `vnext/client/views-fields.js` was read for context (Task 4's note to
   check `custom-fields.js`'s `x_views` handling) but not modified — none of
   the four tasks required client-side saved-view changes; `worklist-counts.js`
   reads the `x_views` table directly server-side.
