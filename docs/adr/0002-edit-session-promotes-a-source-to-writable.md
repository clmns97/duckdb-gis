# ADR-0002 — An edit session promotes its source to writable; otherwise attached sources stay read-only

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-08 |
| **Tracked by** | #66 |

## Context

ADR-0001 decided that attached databases and files are read-only sources,
permanently — edits live in the in-memory working database until the user
explicitly saves a project file, and write-back to a source was out of scope.
Issue #66 was filed to *enforce* that decision (it was a convention, not a
guarantee — `ATTACH` adds catalogs read-write by default and nothing stopped a
bug from writing through one).

Revisiting the decision itself, not just its enforcement, surfaced two things:

- **This project's stated north star is QGIS's workflow** (`CLAUDE.md`
  "Vision"; REQ-Q-002, QGIS familiarity). QGIS's edit model is toggle editing →
  edit → save layer, straight against the source. "Never write back" is a
  divergence from that, not an implementation of it. UC-003 extension 7b
  already names never-writes-back as "the single most likely user
  misunderstanding in the product."
- **DuckDB's file locking is exclusive for a read-write attach.** Verified
  against 1.5.4: a process holding a database read-write locks every other
  process out of that file entirely (`Could not set lock on file...`); a
  read-only attach allows concurrent readers. A permanently-writable attach
  would mean leaving duckdb-gis open all day locks the file against the user's
  own CLI, a concurrent `dbt run`, everything — for no benefit, since nothing
  is actually being written most of the time.

Both point the same direction: read-only should be the *default* state, not a
*permanent* one. The write path itself is otherwise unguarded today —
`frontend/src/lib/editing.ts` `commit()` issues `INSERT`/`UPDATE`/`DELETE`
straight at a layer's source table, and `beginEdit()` never checks whether that
catalog is writable at all.

DuckDB supports the swap this needs. Verified against 1.5.4: `DETACH` then
re-`ATTACH` under the *same alias*, with or without `(READ_ONLY)`, works
mid-session and every reference through that alias (`db.schema.table`) keeps
resolving across the swap — no layer needs to know its source's mode changed.
A write against a read-only catalog fails with a clear, catchable error
(`Cannot execute statement of type "INSERT" on database "src" which is
attached in read-only mode!`).

## Decision

An attached source is **read-only by default, always** — `frontend/src/lib/
attach.ts` attaches unconditionally with `(READ_ONLY)`; there is no opt-out.
Toggling editing on one of that source's layers promotes the *whole catalog*
to writable for the span of the edit session (`frontend/src/lib/workspace.ts`
`acquireWriteLock`); Save or Cancel demotes it back
(`releaseWriteLock`). Outside a session, DuckDB itself rejects writes — the
attach mode is the enforcement, nothing else has to check permission.

The in-memory working database and explicit project files (the other two
legs of ADR-0001) are unchanged: a layer drawn from scratch still lives in
the `memory` catalog until saved as its own table or a project.

## Consequences

**Good.**

- Matches the project's own stated model (QGIS) instead of diverging from it.
  "Fix a bad vertex" now has an answer: edit it, save, it's in the source.
- The exclusive-lock cost is scoped to the edit window instead of the whole
  session — attaching a source read-only and browsing it all day never blocks
  another process from it.
- Enforcement is structural (DuckDB's own read-only attach), not a convention
  layered on top that a bug can bypass.
- Resolves ADR-0001's one item flagged "unresolved, needs a spike": what
  `duckdb file.db -ui` should do. It no longer needs special-casing — a
  writable launch database is now an ordinary, legal state, not a
  contradiction of "sources are read-only." (It was never routed through
  `attach.ts`'s read-only gate to begin with, so it sits outside this ADR's
  promote/demote machinery entirely; see References for the one place that
  still matters.)

**Bad.**

- Entering edit mode can now fail for a reason it never used to: another
  process holds the file. That has to surface *before* the user has invested
  any drawing work, not at Save — `beginEdit` acquires the lock as its first
  step, before loading any features, precisely so the failure is cheap.
  Un-acquiring on every failure path (row-count cap, map not ready) is
  bookkeeping the previous read-only design didn't need.
- While an edit session is open, duckdb-gis itself now holds the exclusive
  lock on that file — the user's own CLI or another tool touching the same
  file will get locked out for as long as the session runs. This is
  unavoidable (it's DuckDB's file-locking model, not a choice we made) but is
  a real, user-visible behaviour change from "sources are read-only" that is
  worth being able to see; a lock-status affordance in the UI is a reasonable
  follow-on if this proves confusing in practice.
- Demoting back to read-only can itself fail (rare — e.g. a lock re-attach
  racing another process). The working set has already been torn down
  locally by that point (`editing.ts` `finishEdit` always does local cleanup
  before attempting the release), so the user doesn't get stuck in edit mode,
  but the source can be left writable until they retry. Surfaced as an error
  rather than swallowed (`workspace.ts` `releaseWriteLock`).
- One writable catalog at a time in practice — the editing store only ever
  has one active target, so there's no scenario today where two sources need
  to be promoted simultaneously. Worth noting as a constraint this design
  leans on, not a designed-in limit.

**Follow-on work.**

- A lock-status indicator in the Browser/Layers panel, if users are surprised
  by the exclusive-lock behaviour in practice.
- `duckdb file.db -ui`'s launch database sits outside this ADR's read-only
  gate (never attached via `attach.ts`). Whether it should be brought under
  the same model, or is correctly treated as a plain already-writable source,
  is a decision this ADR deliberately leaves open rather than deciding by
  implication.
- `src/http_server.cpp`'s optional named-result-table HTTP parameter still
  hardcodes `"memory"` as its default catalog — a pre-existing rough edge,
  unaffected by any flow this ADR covers (the frontend's own `CREATE TABLE`
  calls are explicitly qualified with the working catalog now), noted here so
  it isn't mistaken for something this change fixed.

## Alternatives considered

**Keep ADR-0001's permanent read-only sources, just enforce it.** The
originally scoped version of #66. Rejected: it locks in a real product
divergence from QGIS familiarity (REQ-Q-002) and leaves "fix a bad vertex in
my own database" with no answer, for a safety property (the lock argument)
that a session-scoped promotion gets just as well.

**Write directly to attached sources with no read-only default at all.**
What `ATTACH` does by default. Rejected for the reasons ADR-0001 already gave:
a stray write from anywhere in the app — a bug in geoprocessing, a mistaken
SQL-editor statement — reaches the source silently, with no session boundary
to contain it.

**Promote at Save instead of at toggle-editing.** Keeps the writable window
smaller. Rejected: it means a user can invest an entire digitizing session and
only then discover the source is locked by another process, and it leaves
rowids loaded under a read-only catalog stale by the time a write is
attempted. Acquiring at toggle fails cheap, before any work exists to lose,
and matches QGIS's explicit edit-session semantics.

## References

- `frontend/src/lib/workspace.ts` — `ensureWorkingCatalog`, `acquireWriteLock`,
  `releaseWriteLock`
- `frontend/src/lib/editing.ts` — `beginEdit`, `finishEdit`, `commit`
- `frontend/src/lib/attach.ts` — always-read-only `ATTACH`
- `test/sql/attach_readonly.test` — pins the DETACH/re-ATTACH contract this
  decision depends on at the DuckDB level
- [ADR-0001](0001-in-memory-working-database-and-project-files.md) — the
  decision this partially supersedes
- Issues #66 (this decision + its enforcement), #29, #33
- `docs/requirements/register.md` REQ-F-006, REQ-Q-002
- `docs/requirements/use-cases/UC-003-correct-a-feature-by-hand.md`
