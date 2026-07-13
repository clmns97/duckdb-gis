import { useEffect, useId, type ReactNode } from "react";
import { Button } from "./Button";

// Shared modal shell (backdrop + centred card + head/body/foot). Owns the two
// dismissal gestures every dialog shared: Escape and a backdrop click. The head
// renders the title and a close affordance; `subhead` sits between the head and
// the padded, scrollable body (used for the Layer Properties tab strip); the
// body holds `children`; `footer` holds the action buttons.
export function Modal({
  title,
  onClose,
  children,
  footer,
  subhead,
  width = 420,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  subhead?: ReactNode;
  width?: number;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/35"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-white border border-gray-200 rounded-lg shadow-md max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)]"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-200">
          <h2 id={titleId} className="flex-1 m-0 text-base font-medium">
            {title}
          </h2>
          <button
            type="button"
            className="shrink-0 text-lg leading-none text-gray-500 px-1 rounded-md cursor-pointer hover:text-gray-900"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {subhead}

        <div className="p-4 overflow-y-auto flex flex-col gap-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 px-4 py-3.5 border-t border-gray-200">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Small text primitives reused by dialogs and the sidebar tree/panels.
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-sm font-medium text-gray-500">{children}</span>
  );
}

export function ModalNote({
  error = false,
  children,
}: {
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <p className={`m-0 text-xs ${error ? "text-danger" : "text-gray-500"}`}>
      {children}
    </p>
  );
}

export { Button };
