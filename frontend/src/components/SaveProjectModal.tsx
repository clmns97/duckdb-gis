import { useState } from "react";
import { saveProject } from "../lib/project";
import { Modal, Button, FieldLabel, ModalNote, INPUT } from "./Modal";

// Save the current session as a project file (#33) — a form over
// `saveProject`, mirroring AttachModal's typed-server-side-path pattern (the
// path is on the extension host's filesystem, not the browser's). Overwrites
// an existing file in place; owns the async save so it can show inline errors
// and stay open on failure.

export function SaveProjectModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = path.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await saveProject({ path, name });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Save project"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save"}
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

      <label className="flex flex-col gap-2">
        <FieldLabel>Project name (optional)</FieldLabel>
        <input
          className={INPUT}
          type="text"
          value={name}
          placeholder="Untitled project"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </label>

      {error && <ModalNote error>{error}</ModalNote>}

      <ModalNote>
        The path is on the server (the DuckDB extension host), not this browser.
        Writes a plain <code className="font-mono text-[0.95em]">.duckdb</code> file
        containing the working layers plus their styling, z-order and the map view —
        overwriting anything already at that path. Layers from an attached source are
        saved as a reference (reattached on Open), not copied.
      </ModalNote>
    </Modal>
  );
}
