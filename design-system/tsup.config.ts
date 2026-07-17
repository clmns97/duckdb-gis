import { defineConfig } from "tsup";

// Library build for the UI kit. Emits ESM + types from src/index.ts, which
// re-exports the frontend's presentational primitives in place. React is a peer
// (externalised); lucide-react + the pure type/helper deps are bundled so the
// component bundle is self-contained apart from React. CSS is built separately
// by the Tailwind CLI (see the `build` script) into dist/styles.css.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
});
