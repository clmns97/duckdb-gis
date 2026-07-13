import { useEffect } from "react";

// Reusable right-click menu. The catalog tree opens it today (Add to map);
// the Layers panel will reuse it for remove / zoom-to (T-022). Positioned at
// viewport coordinates; a transparent backdrop catches an outside click and
// Escape closes it.

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="context-menu-backdrop" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <ul
        className="context-menu"
        role="menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => (
          <li key={i} role="menuitem">
            <button
              className="context-menu-item"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
