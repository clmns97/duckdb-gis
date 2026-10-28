// ---------------------------------------------------------------------------
// Unsaved-working-database-state tracking (#67).
//
// ADR-0001 accepts "work is lost on crash or accidental close" as a deliberate
// trade-off for never writing to the user's sources — but nothing told the
// user that trade-off was in effect (UC-003 extension 7a: "the single most
// likely user misunderstanding in the product"). This tracks whether there's
// actually anything to lose right now, so a warning only fires when it's
// warranted (never on a clean session).
//
// Marked dirty by every path that can leave state uncommitted-to-disk:
//   - a Terra Draw change (draw/drag/vertex-edit) in *either* edit-session
//     flavor, before any commit — the issue's own motivating scenario
//     ("twenty minutes correcting geometry and close the tab"). This also
//     covers `editing.ts` `commit()`'s new-table write: committing a new
//     layer always requires drawn features first, so a change event has
//     already marked dirty by the time commit runs — no separate hook needed
//     there. An *existing*-layer commit writes straight to its source (already
//     durable, ADR-0002) rather than the working catalog, but the in-progress
//     drag/vertex-edit before that commit is exactly the same kind of
//     lose-it-on-close risk, so it's covered the same way.
//   - `createLayerFromSelection` (Overture "Create Layer from Selection"),
//     the one other path that writes into the working catalog without going
//     through an edit session first.
// Cleared by a successful Save or (project) Open — both re-establish a
// baseline where the working catalog and disk agree.
// ---------------------------------------------------------------------------

let dirty = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export const unsavedChanges = {
  get isDirty(): boolean {
    return dirty;
  },
  markDirty(): void {
    if (dirty) return;
    dirty = true;
    emit();
  },
  clear(): void {
    if (!dirty) return;
    dirty = false;
    emit();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
