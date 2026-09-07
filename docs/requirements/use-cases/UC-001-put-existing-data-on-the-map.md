# UC-001 — Put existing spatial data on the map

| | |
|---|---|
| **Primary actor** | Data engineer / analyst |
| **Scope** | duckdb-gis |
| **Level** | User goal |
| **Status** | Supported |

**Goal.** See spatial data they already have — a DuckDB file, a Parquet dataset
— rendered on a map, without an import, conversion or preparation step.

**Preconditions.** duckdb-gis is running. The actor has a data source containing
at least one table with a geometry column.

**Trigger.** The actor wants to look at data they can currently only query.

## Main success scenario

1. The actor attaches their data source to the session.
2. The system adds it to the read-only catalog and shows its databases, schemas
   and tables in the Browser panel.
3. The actor looks for the table they want.
4. The system indicates which tables are renderable, having identified them by
   the presence of a geometry column rather than by name.
5. The actor adds the table as a layer.
6. The system creates the layer, renders its features on the map, and lists it
   in the Layers panel with its visibility and draw order under the actor's
   control.
7. The actor zooms the map to the layer's extent to confirm it is where they
   expected.

## Extensions

- **2a.** The source cannot be attached (bad path, unreadable file, missing
  credentials).
  - **2a1.** The system reports why, and the session is otherwise unchanged.
- **4a.** No table in the source has a geometry column.
  - **4a1.** The system offers nothing renderable. The actor can still browse the
    catalog. *Gap: it does not currently explain why a table they expected is
    absent, which is the most likely first confusion for a new user.*
- **4b.** The geometry column exists but its CRS is not WGS84.
  - **4b1.** *Undecided — #65.*
- **6a.** The layer is large enough that preparing it for rendering is slow.
  - **6a1.** The system shows the layer as loading and the map stays interactive.
    *Gap: not met today — see REQ-Q-001, #59.*
- **6b.** The table has a geometry column but no rows, or all geometries are null.
  - **6b1.** The layer is created and renders empty. Nothing fails.

## Postconditions

**On success.** The layer is in the Layers panel and rendered. The source is
attached read-only and has not been modified.

**On failure.** The source is not attached and no layer exists. The actor's data
is untouched in every branch — nothing in this use case writes.

## Traces to

**Requirements.** REQ-F-001 (geometry-type detection), REQ-F-002 (add as layer),
REQ-F-006 (read-only sources), REQ-Q-001 (responsiveness), REQ-C-003 (in-process
compute) — [`../register.md`](../register.md)
**Decisions.** [ADR-0001](../../adr/0001-in-memory-working-database-and-project-files.md)
**Issues.** #2, #8, #9, #22, #23, #25, #32 · gaps: #65 (CRS)

## Open questions

- **CRS handling is unspecified** — filed as #65. Step 4b has no defined
  behaviour. Does the system reproject, refuse, or render wrong coordinates
  silently? Silently wrong is the worst outcome and is plausibly what happens
  today.
- **What counts as "renderable" is narrower than "has a geometry column"** — an
  unsupported geometry type would pass detection and fail at render. Should
  detection or rendering own that check?
