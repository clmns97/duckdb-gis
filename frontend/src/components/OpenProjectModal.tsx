import { useState } from "react";
import { openProject, UnsavedChangesError } from "../lib/project";
import { Modal, Button, FieldLabel, ModalNote, INPUT } from "./Modal";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canOpen = path.trim().length > 0 && !busy;

  const submit = async (force = false) => {
    if (!canOpen) return;
    setBusy(true);
    setError(null);
    try {
      const kind = await openProject(path, { force });
      onOpened(kind);
      onClose();
    } catch (e) {
      if (e instanceof UnsavedChangesError) {
        setBusy(false);
        if (window.confirm(`${e.message} Continue?`)) void submit(true);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Open project"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canOpen} onClick={() => void submit()}>
            {busy ? "Opening…" : "Open"}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-2">
        <FieldLabel>Project file path</FieldLabel>
        <input
          className={INPUT}
          type="text"
          value={path}
          placeholder="/data/my-project.duckdb"
          spellCheck={false}
          autoFocus
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </label>

      {error && <ModalNote error>{error}</ModalNote>}

      <ModalNote>
        The path is on the server (the DuckDB extension host), not this browser. A
        file saved with "Save project…" replaces the current session — its layers,
        styling and map view — with the ones in the file. A plain{" "}
        <code className="font-mono text-[0.95em]">.duckdb</code> (no project data)
        is attached read-only instead, alongside the current session.
      </ModalNote>
    </Modal>
  );
}
