// Public surface of the duckdb-gis UI kit.
//
// Every export re-exports a component from ../../frontend/src in place — the
// frontend stays the single source of truth; this package is a build/story
// harness over it. Only isolation-safe presentational components are exposed:
// map/DuckDB/dockview-coupled components (MapView, Dock, the attach/overture
// feature dialogs) are intentionally excluded. The two store-connected pieces
// are exposed via their prop-driven `*View` halves.

export { Button } from "../../frontend/src/components/Button";
export { Modal, FieldLabel, ModalNote } from "../../frontend/src/components/Modal";
export { ContextMenu } from "../../frontend/src/components/ContextMenu";
export type { MenuItem, MenuState } from "../../frontend/src/components/ContextMenu";
export { TypeGlyph } from "../../frontend/src/components/TypeGlyph";
export { SymbologyGlyph } from "../../frontend/src/components/SymbologyGlyph";
export { OvertureLogo } from "../../frontend/src/components/OvertureLogo";
export { SelectionChipView } from "../../frontend/src/components/SelectionChipView";
export { DrawToolbarView } from "../../frontend/src/components/DrawToolbarView";

// Prop types the components take, re-exported for story/consumer convenience.
// All type-only — no runtime graph is pulled from the coupled lib modules.
export type { TypeKind } from "../../frontend/src/lib/columnTypes";
export type { GeometryKind, LayerStyle } from "../../frontend/src/lib/layers";
export type { EditMode, DrawMode } from "../../frontend/src/lib/editing";
