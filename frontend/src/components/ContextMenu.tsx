import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";

// Reusable right-click / anchored menu. The catalog tree, Layers panel, and the
// Processing menu (T-004) open it; the basemap picker (T-033) uses its submenu
// support. Positioned at viewport coordinates with a transparent backdrop that
// catches an outside click; Escape closes it. The root menu clamps into the
// viewport; hover submenus (`children`) flip to the left edge when they'd
// overflow on the right.

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Non-selectable section label (e.g. a provider group heading). */
  header?: boolean;
  /** Leading ✓ marker (e.g. the active basemap). */
  checked?: boolean;
  /** A hover flyout submenu. */
  children?: MenuItem[];
}

/** An open anchored menu: viewport position + its items. */
export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

const MENU_CLASS =
  "min-w-[180px] m-0 p-1 list-none bg-white border border-hairline rounded-lg shadow-md";

// One row: a section header, a leaf action, or a parent that opens a flyout.
function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const hasChildren = !!item.children?.length;

  if (item.header) {
    return (
      <li className="px-2.5 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 select-none">
        {item.label}
      </li>
    );
  }

  return (
    <li
      className={hasChildren ? "relative" : undefined}
      onMouseEnter={() => hasChildren && setOpen(true)}
      onMouseLeave={() => hasChildren && setOpen(false)}
      role="menuitem"
    >
      <button
        className="flex items-center w-full text-left text-editor text-gray-900 px-2.5 py-1.5 rounded-md cursor-pointer enabled:hover:bg-gray-100 disabled:text-gray-500 disabled:cursor-default"
        disabled={item.disabled}
        aria-haspopup={hasChildren || undefined}
        onClick={() => {
          if (hasChildren) return; // parent rows only open their flyout
          item.onSelect?.();
          onClose();
        }}
      >
        <span className="w-3.5 shrink-0 text-accent" aria-hidden="true">
          {item.checked && <Check size={13} strokeWidth={2.5} />}
        </span>
        <span className="flex-1">{item.label}</span>
        {hasChildren && <ChevronRight size={14} strokeWidth={2} className="ml-3 text-gray-500" />}
      </button>
      {hasChildren && open && <Flyout items={item.children!} onClose={onClose} />}
    </li>
  );
}

// A submenu positioned beside its parent row; flips to the left if it would
// overflow the right edge of the viewport.
function Flyout({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLUListElement>(null);
  const [side, setSide] = useState<"right" | "left">("right");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (side === "right" && el.getBoundingClientRect().right > window.innerWidth - 4) {
      setSide("left");
    }
  }, [side]);

  return (
    <ul
      ref={ref}
      className={`${MENU_CLASS} absolute top-[-5px]`}
      role="menu"
      style={side === "right" ? { left: "100%" } : { right: "100%" }}
    >
      {items.map((item, i) => (
        <MenuRow key={i} item={item} onClose={onClose} />
      ))}
    </ul>
  );
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
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clamp the root menu into the viewport once its size is known.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > window.innerWidth) left = Math.max(4, window.innerWidth - r.width - 4);
    if (top + r.height > window.innerHeight) top = Math.max(4, window.innerHeight - r.height - 4);
    setPos({ left, top });
  }, [x, y]);

  return (
    <div
      className="fixed inset-0 z-20"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ul
        ref={ref}
        className={`fixed ${MENU_CLASS}`}
        role="menu"
        style={{ left: pos.left, top: pos.top }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => (
          <MenuRow key={i} item={item} onClose={onClose} />
        ))}
      </ul>
    </div>
  );
}
