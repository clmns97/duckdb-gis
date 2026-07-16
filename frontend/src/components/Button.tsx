import type { ButtonHTMLAttributes } from "react";

// Shared button primitive matching the DuckDB-UI button family.
//   primary — filled indigo CTA (modal confirm actions)
//   ghost   — quiet toolbar / dialog-cancel button
//   mini    — compact icon affordance (section "+" add buttons)
//   icon    — the ubiquitous 24×24 square icon button (gray-500, gray-100 hover)
type Variant = "primary" | "ghost" | "mini" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-editor font-medium text-white bg-primary border border-accent rounded-md px-3.5 py-1.5 " +
    "hover:enabled:bg-accent disabled:opacity-50 disabled:cursor-default",
  ghost:
    "text-gray-500 rounded-lg px-2.5 py-1.5 hover:bg-gray-100 hover:text-gray-900",
  mini:
    "leading-none text-gray-500 rounded-md px-1.5 py-0.5 hover:bg-gray-100 hover:text-gray-900",
  icon:
    "w-6 h-6 grid place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 " +
    "disabled:opacity-40 disabled:cursor-default",
};

export function Button({
  variant = "ghost",
  className = "",
  type = "button",
  ...rest
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`cursor-pointer ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
