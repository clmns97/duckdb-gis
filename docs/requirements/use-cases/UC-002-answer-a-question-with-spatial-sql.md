# UC-002 — Answer a question with spatial SQL and keep the answer

| | |
|---|---|
| **Primary actor** | Data engineer / analyst |
| **Scope** | duckdb-gis |
| **Level** | User goal |
| **Status** | Supported |

**Goal.** Ask a spatial question in SQL, see the answer on the map rather than as
a table of coordinates, and keep it as a layer to build on.

**Preconditions.** duckdb-gis is running with at least one source attached.

**Trigger.** The actor has a question that is easier to express in SQL than
through a sequence of UI operations — "which of these intersect that?", "what is
within 500 m of this?".

## Main success scenario

1. The actor opens the SQL editor and writes a query returning a geometry column.
2. The actor runs it.
3. The system executes the query in the DuckDB instance it is running inside, and
   renders the result on the map as a transient preview layer.
4. The actor inspects the result — pans, zooms, compares it against the other
   layers.
5. The actor decides the result is worth keeping and promotes the preview to a
   tracked layer.
6. The system adds it to the Layers panel as a layer backed by the query, and it
   behaves like any other layer from that point on.
7. The actor continues, now able to reference that result in further queries.

## Extensions

- **2a.** The query is invalid, or fails at execution.
  - **2a1.** The system reports the database error as-is and the map is unchanged.
    Showing DuckDB's own message matters — this actor can read it, and
    paraphrasing would lose detail.
- **3a.** The result has no geometry column.
  - **3a1.** It is a valid query with a non-spatial result; there is nothing to
    render. The result is still shown as data.
- **3b.** The result has several geometry columns.
  - **3b1.** *Undecided — #69.*
- **4a.** The actor runs a different query before promoting.
  - **4a1.** The preview is replaced. There is one preview at a time and it is
    explicitly transient, so nothing is silently accumulated.
- **5a.** The actor never promotes it.
  - **5a1.** The preview disappears with the next run or at session end. Nothing
    is persisted; this is the intended default.

## Postconditions

**On success.** A query-backed layer exists in the working database and the
Layers panel. No source was written to.

**On failure.** No layer is created. The preview layer is transient by
definition, so an abandoned attempt leaves nothing behind.

## Traces to

**Requirements.** REQ-F-005 (run SQL, promote result), REQ-C-003 (in-process
compute), REQ-F-002 (layer behaviour) — [`../register.md`](../register.md)
**Decisions.** [ADR-0001](../../adr/0001-in-memory-working-database-and-project-files.md) — the preview is working-database state, ephemeral until saved
**Issues.** #28, #6, #7 · gaps: #69 (multiple geometry columns)

## Open questions

- **Multiple geometry columns (3b) is undecided** — filed as #69. Pick the
  first, ask, or render several? It arises immediately with a join of two
  spatial tables, which is a common query.
- **A query-backed layer's dependencies are invisible.** If the actor detaches a
  source the query reads from, the layer breaks. Should it fail loudly, or is a
  broken layer acceptable until refreshed?
