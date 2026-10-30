import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Button } from "./Button";
import { errMsg } from "../lib/duckdb";

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
        className="flex flex-col bg-white border border-gray-200 rounded-lg max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)]"
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
            className="shrink-0 text-lg leading-none text-gray-500 px-1 rounded-sm cursor-pointer hover:text-gray-900"
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

// Shared className for a modal text input / select, so every dialog's field
// looks the same (one source of truth — T-044).
export const INPUT =
  "text-editor text-gray-900 px-2 py-1.5 bg-white border border-gray-200 rounded-sm focus:outline-none focus:border-primary";

// A labelled text input for a FormModal body.
export function TextField({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-2">
      <FieldLabel>{label}</FieldLabel>
      <input className={INPUT} type="text" spellCheck={false} {...input} />
    </label>
  );
}

// A labelled drop-down for a FormModal body.
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <FieldLabel>{label}</FieldLabel>
      <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// A dialog whose body is one small form with a single primary action (Attach,
// Save/Open project, New layer). Owns the async submit: Enter in any field or
// the primary button runs `onSubmit`; a throw shows its message inline and keeps
// the dialog open for a retry, otherwise it closes — unless `onSubmit` returns
// `false` (the user backed out of a follow-up confirm).
export function FormModal({
  title,
  action,
  busyAction = action,
  canSubmit,
  onSubmit,
  onClose,
  note,
  children,
}: {
  title: ReactNode;
  action: string;
  busyAction?: string;
  canSubmit: boolean;
  onSubmit: () => unknown;
  onClose: () => void;
  note: ReactNode;
  children: ReactNode;
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if ((await onSubmit()) !== false) return onClose();
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy(false);
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!canSubmit || busy}>
            {busy ? busyAction : action}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {children}
      </form>
      {error && <ModalNote error>{error}</ModalNote>}
      <ModalNote>{note}</ModalNote>
    </Modal>
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
