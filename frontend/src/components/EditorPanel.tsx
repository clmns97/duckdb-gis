import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { renderGeoArrow } from "../lib/deckRender";
import { layers } from "../lib/layers";

const DEFAULT_SQL = `SELECT 'Zürich' AS name, ST_Point(8.54, 47.37) AS geom
UNION ALL SELECT 'Bern', ST_Point(7.45, 46.95)
UNION ALL SELECT 'Geneva', ST_Point(6.14, 46.20);`;

type Status = { kind: "idle" | "running" | "ok" | "err"; msg: string };

export function EditorPanel() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle", msg: "⌘/Ctrl+↵ to run" });

  const run = async () => {
    const text = view.current?.state.doc.toString() ?? "";
    if (!text.trim()) return;
    setStatus({ kind: "running", msg: "Running…" });
    // Give the Run result a home in the Layers panel as a single, replaceable
    // temporary layer (T-027) — the geometry itself still renders on the pickable
    // preview slot via renderGeoArrow, so it stays selectable.
    layers.startPreview(text);
    try {
      const t0 = performance.now();
      const { featureCount, bounds } = await renderGeoArrow(text);
      const ms = Math.round(performance.now() - t0);
      layers.readyPreview(bounds);
      setStatus({ kind: "ok", msg: `${featureCount} feature${featureCount === 1 ? "" : "s"} · ${ms} ms` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      layers.errorPreview(msg);
      setStatus({ kind: "err", msg });
    }
  };

  useEffect(() => {
    if (!host.current) return;
    const runKeymap = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          void run();
          return true;
        },
      },
    ]);
    const v = new EditorView({
      doc: DEFAULT_SQL,
      extensions: [basicSetup, sql({ dialect: PostgreSQL }), runKeymap],
      parent: host.current,
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusColor =
    status.kind === "ok"
      ? "text-success"
      : status.kind === "err"
        ? "text-danger"
        : "text-gray-500";

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center gap-3 px-2.5 py-1.5 border-b border-gray-200">
        <button
          className="font-medium flex items-center gap-1.5 text-white bg-primary rounded-md px-3 py-[5px] cursor-pointer hover:bg-accent"
          onClick={() => void run()}
        >
          <span aria-hidden="true">▶</span> Run{" "}
          <span className="text-xs opacity-85">⌘↵</span>
        </button>
        <span className={`text-editor ${statusColor}`}>{status.msg}</span>
      </div>
      <div
        className="flex-1 min-h-0 overflow-auto [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-editor"
        ref={host}
      />
    </div>
  );
}
