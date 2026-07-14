import { useEffect, useState, useSyncExternalStore } from "react";
import type { IDockviewPanelProps } from "dockview";
import { layers, loadLayerInfo, qualified, ident } from "../../lib/layers";
import { query, str } from "../../lib/duckdb";

// QGIS "Open Attribute Table" as a dock tab (T-026): a paged grid of a layer's
// non-geometry attributes. One panel per layer (keyed by id via dockBus). Rows
// are read with LIMIT/OFFSET paging so large tables stay responsive; the
// geometry column is excluded. Query-backed layers (Overture / SQL result) have
// no catalog source to page, so v1 shows a short "not available" note.

const PAGE_SIZE = 100;

type Rows = Awaited<ReturnType<typeof query>>;

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function AttributesPanel(props: IDockviewPanelProps) {
  const layerId = str(props.params.layerId);
  // Re-render on store changes so a removed layer is reflected.
  useSyncExternalStore(layers.subscribe, () => layers.version);
  const layer = layers.list().find((l) => l.id === layerId);
  const source = layer?.source;

  const [columns, setColumns] = useState<string[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Columns + total once per layer (the geometry column is dropped for display).
  useEffect(() => {
    if (!layer || !source) return;
    let cancelled = false;
    loadLayerInfo(layer)
      .then((info) => {
        if (cancelled) return;
        setColumns(info.columns.map((c) => c.name).filter((n) => n !== source.geomColumn));
        setTotal(info.featureCount);
      })
      .catch((e) => !cancelled && setError(msg(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId]);

  // The current page of rows.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setLoading(true);
    const sql = `SELECT * EXCLUDE (${ident(source.geomColumn)}) FROM ${qualified(source)} LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    query(sql)
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        setError(null);
      })
      .catch((e) => !cancelled && setError(msg(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, offset]);

  if (!layer) {
    return <Note>This layer is no longer available.</Note>;
  }
  if (!source) {
    return (
      <Note>
        The attribute table is available for catalog tables. “{layer.name}” is a
        query-backed layer, so its rows aren’t browsable here yet.
      </Note>
    );
  }

  const displayCols =
    columns ?? (rows && rows.length > 0 ? Object.keys(rows[0] as object) : []);
  const from = rows && rows.length > 0 ? offset + 1 : 0;
  const to = offset + (rows?.length ?? 0);
  const hasNext = total != null ? offset + PAGE_SIZE < total : (rows?.length ?? 0) === PAGE_SIZE;

  return (
    <div className="h-full flex flex-col bg-white text-editor">
      <div className="flex items-center gap-3 px-2.5 py-1.5 border-b border-gray-200 shrink-0">
        <span className="font-medium">{layer.name}</span>
        <span className="text-gray-500">
          {total != null ? `${total.toLocaleString()} rows` : "…"}
          {rows ? ` · showing ${from.toLocaleString()}–${to.toLocaleString()}` : ""}
        </span>
        <span className="flex-1" />
        <button
          className="px-2 py-[3px] rounded-md border border-gray-200 text-gray-900 cursor-pointer hover:border-primary-border-active hover:text-accent disabled:opacity-40 disabled:cursor-default"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
        >
          ‹ Prev
        </button>
        <button
          className="px-2 py-[3px] rounded-md border border-gray-200 text-gray-900 cursor-pointer hover:border-primary-border-active hover:text-accent disabled:opacity-40 disabled:cursor-default"
          disabled={!hasNext || loading}
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
        >
          Next ›
        </button>
      </div>

      {error ? (
        <Note danger>{error}</Note>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="border-collapse text-left w-max min-w-full">
            <thead className="sticky top-0 bg-subtle">
              <tr>
                <th className="px-2 py-1 border-b border-gray-200 text-gray-500 font-medium text-right select-none">
                  #
                </th>
                {displayCols.map((c) => (
                  <th
                    key={c}
                    className="px-2 py-1 border-b border-gray-200 text-gray-500 font-medium whitespace-nowrap"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, i) => (
                <tr key={offset + i} className="hover:bg-gray-200">
                  <td className="px-2 py-1 border-b border-gray-200 text-gray-500 text-right tabular-nums">
                    {offset + i + 1}
                  </td>
                  {displayCols.map((c) => (
                    <td
                      key={c}
                      className="px-2 py-1 border-b border-gray-200 whitespace-nowrap max-w-[420px] overflow-hidden text-ellipsis"
                      title={str((row as Record<string, unknown>)[c])}
                    >
                      {str((row as Record<string, unknown>)[c])}
                    </td>
                  ))}
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr>
                  <td
                    className="px-2 py-2 text-gray-500 italic"
                    colSpan={displayCols.length + 1}
                  >
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Note({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div className="h-full grid place-items-center bg-white p-6">
      <p className={`text-editor text-center max-w-sm ${danger ? "text-danger" : "text-gray-500"}`}>
        {children}
      </p>
    </div>
  );
}
