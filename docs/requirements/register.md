# Requirements register

Seed set, derived from behaviour the project already commits to in `README.md`,
`CONTRIBUTING.md`, [ADR-0001](../adr/0001-in-memory-working-database-and-project-files.md)
and the issue backlog. It is **not complete** — it is enough structure to add to
rather than a finished specification.

Conventions and the ID scheme are in [README.md](README.md). Template in
[template.md](template.md).

**Status key:** `Draft` (proposed) · `Agreed` (settled, not built) ·
`Implemented` (built and true today) · `Retired` (no longer applies).

---

## Constraints

### REQ-C-001 — Make no unrequested network calls

| | |
|---|---|
| **Type** | Constraint |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | Security-conscious end user; maintainer |
| **Source** | `CONTRIBUTING.md` ("Don't break the offline guarantee") |

**Requirement.** The extension shall serve all of its own assets from its
compiled binary and shall make no outbound network request that the user did not
ask for. Fetching user-requested data — a chosen basemap, an Overture query — is
explicitly permitted.

**Rationale.** It's a local tool operating on the user's own data; silent
outbound traffic would betray that. Being self-contained also means it works
offline and survives a CDN going away. This is a boundary, not a trade-off: a
change adding a CDN fetch, telemetry or a runtime download is rejected on
principle even when convenient.

**Acceptance criteria.**

- [x] The frontend is compiled into the extension binary.
- [ ] A run with the network blocked serves the full UI, degrading only
      user-requested remote data.

**Traces to.** #54 · `scripts/generate_embedded_assets.py`

---

### REQ-C-002 — Coexist with DuckDB's core `ui` extension

| | |
|---|---|
| **Type** | Constraint |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | End user; community-extensions reviewers |
| **Source** | #53 |

**Requirement.** The extension shall be named `gis` and expose `gis`-prefixed
entry points, such that `LOAD ui; LOAD gis;` succeed in one session without
collision.

**Rationale.** This project began as a fork of `duckdb/duckdb-ui`; keeping the
`ui` name would have made the two mutually exclusive and blocked the community
listing. Users should not have to choose.

**Acceptance criteria.**

- [x] `start_gis()`, `gis_is_started` and settings use the `gis` prefix.
- [x] Both extensions load in one session.

**Traces to.** #53, #15 · `src/http_server.cpp`

---

### REQ-C-003 — Compute stays in-process

| | |
|---|---|
| **Type** | Constraint |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | Data engineer; maintainer |
| **Source** | `README.md` north star |

**Requirement.** All SQL and spatial computation shall run in the DuckDB
instance that loaded the extension. The system shall not depend on a remote
backend for query execution.

**Rationale.** The whole reason to build this natively rather than on
DuckDB-WASM: full extension ecosystem, native performance, large datasets,
spill-to-disk. Introducing a remote execution path would forfeit all of it.

**Traces to.** ADR-0001 · `src/http_server.cpp`

---

## Functional requirements

### REQ-F-001 — Detect map layers by geometry column type

| | |
|---|---|
| **Type** | Functional |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | GIS practitioner; data engineer |
| **Source** | #2 |

**Requirement.** The system shall identify candidate map layers by detecting
columns of DuckDB `GEOMETRY` type, across every attached database, without
relying on column or table naming conventions.

**Rationale.** Type-based detection is correct where name-based detection merely
guesses; it finds layers in data that was never prepared for this tool, which is
the point of pointing it at a catalog you already have. Peer extensions that
match on names miss these.

**Acceptance criteria.**

- [x] A table with a geometry column is offered as a layer regardless of naming.
- [x] Detection spans all attached catalogs, not just the default one.

**Traces to.** #2 · `frontend/src/lib/catalog.ts`, `frontend/src/lib/layers.ts`

---

### REQ-F-002 — Add catalog tables to the map as layers

| | |
|---|---|
| **Type** | Functional |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | GIS practitioner |
| **Source** | #22, #25 |

**Requirement.** The user shall be able to add a table from the Browser panel to
the Layers panel, where it is rendered on the map, and shall be able to control
its visibility and draw order.

**Rationale.** The core QGIS loop. Browsing a catalog and putting something on a
map is the first thing a user will try.

**Traces to.** #22, #23, #25, #31, #32 · `frontend/src/lib/deckRender.ts`

---

### REQ-F-003 — Select features as input to further operations

| | |
|---|---|
| **Type** | Functional |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | GIS practitioner |
| **Source** | #4 |

**Requirement.** The user shall be able to select features on the map from any
added layer, forming a selection set that serves as input to geoprocessing
operations.

**Rationale.** Selection is the verb-object grammar of a GIS: you select, then
you act. Without it every operation needs its own bespoke targeting UI.

**Traces to.** #4, #42 · `frontend/src/lib/selection.ts`

---

### REQ-F-004 — Digitize and edit geometry by hand

| | |
|---|---|
| **Type** | Functional |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | GIS practitioner |
| **Source** | #26, #39 |

**Requirement.** In edit mode, the user shall be able to draw new features and
modify existing geometry, with edits held in the working database until saved.

**Rationale.** Editing is what separates a GIS from a map viewer. Confining the
digitizing toolbar to edit mode keeps map clicks unambiguous — outside edit
mode a click means selection.

**Traces to.** ADR-0001 · #26, #39, #44 · `frontend/src/lib/editing.ts`

---

### REQ-F-005 — Run spatial SQL and promote results to layers

| | |
|---|---|
| **Type** | Functional |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | Data engineer |
| **Source** | #28 |

**Requirement.** The user shall be able to run arbitrary SQL against the session
and promote a result carrying a geometry column to a tracked layer.

**Rationale.** The DuckDB half of the value proposition. The map is an
inspection surface for SQL, not merely a viewer — so a query result must be able
to become a layer without a round-trip through a file.

**Traces to.** #28 · `frontend/src/lib/layers.ts` (`LayerKind` `preview`, `query`)

---

### REQ-F-006 — Attach external data sources read-only

| | |
|---|---|
| **Type** | Functional |
| **Status** | Agreed (partly implemented) |
| **Priority** | P1 |
| **Stakeholder** | Data engineer |
| **Source** | ADR-0001; #8, #9, #10 |

**Requirement.** The user shall be able to attach additional data sources —
DuckDB files, object storage, folders of geo files, Postgres — and the system
shall treat them as read-only, never writing edits back to them.

**Rationale.** Pointing the tool at data you already have is the main adoption
path. Read-only is what makes that safe: a user must be able to attach their
production database without fear that a stray edit rewrites it.

**Acceptance criteria.**

- [x] DuckDB database files can be attached and browsed.
- [ ] Object storage and folders of geo files can be attached (#9).
- [ ] Postgres can be attached (#10, exploratory).
- [ ] Read-only is *enforced*, not merely conventional (ADR-0001, #66).

**Traces to.** ADR-0001 · #8, #9, #10, #66 · `frontend/src/lib/attach.ts`

---

### REQ-F-007 — Save and reopen a session as a project

| | |
|---|---|
| **Type** | Functional |
| **Status** | Agreed |
| **Priority** | P1 |
| **Stakeholder** | GIS practitioner |
| **Source** | ADR-0001; #33 |

**Requirement.** The user shall be able to save a session — layers, styling and
camera — to a `.duckdb` file, and reopen it later to restore that session.

**Rationale.** The working database is ephemeral by design, which is only
acceptable if there is an explicit way to keep work. This is the counterweight
that makes in-memory-by-default safe.

**Traces to.** ADR-0001 · #33, #29

---

### REQ-F-008 — Never render non-WGS84 geometry silently wrong

| | |
|---|---|
| **Type** | Functional |
| **Status** | Implemented |
| **Priority** | P1 |
| **Stakeholder** | GIS practitioner; data engineer |
| **Source** | ADR-0003; #65 |

**Requirement.** When a layer's geometry column carries a known, non-WGS84
CRS, the system shall reproject it to WGS84 for rendering. When a layer's
extent is outside the valid WGS84 range and its CRS is unknown, the system
shall refuse to render it and explain why, rather than plotting coordinates
that don't belong there.

**Rationale.** REQ-F-001 detects layers by column type alone, with no regard
for CRS — a projected dataset (UTM, a national grid, Web Mercator metres)
passes detection exactly like a lon/lat one. Verified live: such data can
render at a plausible-looking but entirely wrong location with no error at
all. Silently wrong is worse than loudly broken; a user has no way to notice
it on their own.

**Acceptance criteria.**

- [x] A layer whose geometry column carries a known, non-WGS84 CRS is
      reprojected automatically.
- [x] A layer whose extent is outside `[-180,180]×[-90,90]` and whose CRS is
      unknown is refused with a specific, readable explanation — not rendered,
      and not left to fail later on a MapLibre camera error.
- [x] A layer with a plausible (in-range) extent and no CRS metadata — the
      common case for data this app itself produces — renders as before; this
      requirement does not add friction to the working majority case.

**Traces to.** ADR-0003 · #65 · `frontend/src/lib/catalog.ts`,
`frontend/src/lib/layers.ts`, `frontend/src/lib/deckRender.ts`

---

## Quality requirements

### REQ-Q-001 — Stay responsive on large layers

| | |
|---|---|
| **Type** | Quality (performance) |
| **Status** | Draft |
| **Priority** | P2 |
| **Stakeholder** | GIS practitioner; data engineer |
| **Source** | #37, #59 |

**Requirement.** Adding a layer shall not block the UI thread; the map shall
remain interactive while data loads and geometry is prepared for rendering.

**Rationale.** DuckDB makes large data easy to reach, so large data will be
reached — a viewer that freezes on it undoes the advantage. Framed as
responsiveness rather than a throughput number because the blocking behaviour,
not raw speed, is what users actually experience.

**Known gap.** Overture cold start takes roughly 70 s for a viewport (#37), and
polygon triangulation currently runs on the main thread (#59). This requirement
is **not met today**; both issues are open against it.

**Acceptance criteria.**

- [ ] Polygon triangulation runs off the main thread (#59).
- [ ] Overture cold-start cause identified and reduced (#37).
- [ ] A provisional target is agreed once #37 establishes what is achievable.

**Traces to.** #37, #59

---

### REQ-Q-002 — Be recognisable to a QGIS user

| | |
|---|---|
| **Type** | Quality (usability) |
| **Status** | Agreed |
| **Priority** | P2 |
| **Stakeholder** | GIS practitioner |
| **Source** | `README.md`; `CONTRIBUTING.md` |

**Requirement.** Panels, terminology and interaction patterns shall follow QGIS
conventions where a QGIS equivalent exists, unless there is a recorded reason to
diverge.

**Rationale.** The target user already knows QGIS; familiarity is free adoption.
It also settles a large class of design arguments cheaply — "QGIS does it this
way" is an accepted argument in review.

**Traces to.** #35, #40

---

### REQ-Q-003 — Build reproducibly across the supported platforms

| | |
|---|---|
| **Type** | Quality (portability) |
| **Status** | Draft |
| **Priority** | P1 |
| **Stakeholder** | Community-extensions reviewers; contributor |
| **Source** | #55, #57 |

**Requirement.** The extension shall build from a clean checkout across the
`duckdb/community-extensions` build matrix without manual intervention.

**Rationale.** A hard gate for listing — an extension that doesn't build on the
matrix cannot ship, regardless of merit. It is also what makes drive-by
contribution possible.

**Acceptance criteria.**

- [ ] `MainDistributionPipeline.yml` green across the matrix (#57).
- [ ] Build-image risk reduced by dropping the OpenSSL dependency (#56).

**Traces to.** #55, #56, #57
