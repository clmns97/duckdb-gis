// The duckdb-gis mark: a black disc with a dot in DuckDB's Community
// Extensions color (Medium Slate Blue, `--color-ce-purple`), since duckdb-gis
// ships as a community extension. public/favicon.svg is the same mark.

export function AppLogo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="13" cy="13" r="13" fill="#000" />
      <circle cx="13" cy="13" r="5.5" fill="var(--color-ce-purple, #7d66ff)" />
    </svg>
  );
}
