import { useState } from "react";
import { saveProject } from "../lib/project";
import { FormModal, TextField } from "./Modal";

// Save the current session as a project file (#33) — a form over
// `saveProject`, mirroring AttachModal's typed-server-side-path pattern (the
// path is on the extension host's filesystem, not the browser's). Overwrites
// an existing file in place.
export function SaveProjectModal({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  return (
    <FormModal
      title="Save project"
      action="Save"
      busyAction="Saving…"
      canSubmit={path.trim().length > 0}
      onSubmit={() => saveProject({ path, name })}
      onClose={onClose}
      note={
        <>
          The path is on the server (the DuckDB extension host), not this browser.
          Writes a plain <code className="font-mono text-[0.95em]">.duckdb</code> file
          containing the working layers plus their styling, z-order and the map view —
          overwriting anything already at that path. Layers from an attached source are
          saved as a reference (reattached on Open), not copied.
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
      <TextField
        label="Project name (optional)"
        value={name}
        placeholder="Untitled project"
        onChange={(e) => setName(e.target.value)}
      />
    </FormModal>
  );
}
