import { useState } from "react";
import { openProject, UnsavedChangesError } from "../lib/project";
import { FormModal, TextField } from "./Modal";

// Open a project file, or attach a plain `.duckdb` (#33/#8) — a form over
// `openProject`, which tells the two apart by the file's `_gis` schema.
// Opening a project **replaces the current working session** (layers, edit
// state, camera) — there's no merge. If that would discard unsaved changes
// (#67), `openProject` throws `UnsavedChangesError` instead of proceeding;
// confirm with the user and retry with `force: true` rather than silently
// discarding. The plain-attach fallback never discards anything, so it's
// never gated.
export function OpenProjectModal({
  onClose,
  onOpened,
}: {
  onClose: () => void;
  onOpened: (kind: "project" | "attached") => void;
}) {
  const [path, setPath] = useState("");
  const open = async () => {
    let kind;
    try {
      kind = await openProject(path);
    } catch (e) {
      if (!(e instanceof UnsavedChangesError)) throw e;
      if (!window.confirm(`${e.message} Continue?`)) return false;
      kind = await openProject(path, { force: true });
    }
    onOpened(kind);
  };
  return (
    <FormModal
      title="Open project"
      action="Open"
      busyAction="Opening…"
      canSubmit={path.trim().length > 0}
      onSubmit={open}
      onClose={onClose}
      note={
        <>
          The path is on the server (the DuckDB extension host), not this browser. A
          file saved with "Save project…" replaces the current session — its layers,
          styling and map view — with the ones in the file. A plain{" "}
          <code className="font-mono text-[0.95em]">.duckdb</code> (no project data)
          is attached read-only instead, alongside the current session.
        </>
      }
    >
      <TextField
        label="Project file path"
        value={path}
        placeholder="/data/my-project.duckdb"
        autoFocus
        onChange={(e) => setPath(e.target.value)}
      />
    </FormModal>
  );
}
