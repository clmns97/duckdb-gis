# TypeScript Workspace

## Structure

This directory is a [pnpm workspace](https://pnpm.io/workspaces). Use the [pnpm](https://pnpm.io/) package manager, not npm or yarn.

One (recommended) way to install pnpm is using [corepack](https://pnpm.io/installation#using-corepack).

## Build

Run `pnpm install` (or just `pnpm i`) in a package directory to install dependencies and build. Note that this will also build dependent packages in this workspace. This builds src files, but not test files.

Run `pnpm build` to just run the build. This will not build dependencies. It will build both src and test files. To build just src or just test, use `pnpm build:src` or `pnpm build:test`.

Run `pnpm build:watch` in a package to rebuild (both src and test files) when source files are changed.

Run `pnpm check` in a package to check formatting and linting rules. To just check formatting, run `pnpm format:check`. To correct formatting, run `pnpm format:write`. To just check linting rules, run `pnpm lint`.

Run `pnpm clean` in that package to remove built output files for that package.

Run `pnpm build` at the root of the workspace to build all packages (both src and test files).

Run `pnpm build:watch` at the root can be used to rebuild (only) relevant packages when source files are changed.

Run `pnpm check` at the root of the workspace to check formatting and linting rules all packages.

## Test

Run `pnpm test` in a package directory to run its tests.

Run `pnpm test:watch` in a package directory to run its tests and rerun when source files change.

Tests use [vitest](https://vitest.dev/), either in Node or in [Browser Mode](https://vitest.dev/guide/browser.html) (using Chrome), depending on the package.

Run `pnpm test` at the root of the workspace to test all packages.

## Create

To create a new package, add a directory under `packages`.

Add a `package.json` file following the conventions of other packages.

The `package.json` should have `preinstall`, `build`, `clean`, and `test` scripts, as well as 'check', 'format', and 'lint' scripts. See existing packages for details.
It should have a `name`, `version`, and `description`, set `"type": "module"`, and set `main`, `module`, and `types` appropriately.

Production source code should go in a `src` subdirectory.
Put a `tsconfig.json` in this directory that extends `tsconfig.library.json` and sets the `outDir` to `../out`.

Test source code should got in a `test` subdirectory.
Put a `tsconfig.json` in this directory that extends `tsconfig.test.json` and references `../src`.

For browser-based tests, create a `vite.config.js` file, and enable `browser` mode, set the `headless` option to `true`, and set the `type` to `chrome`.
Note that `crossOriginIsolated` can be enabled by setting server headers. See example in `wasm-extension`.

Add references to both the `src` and `test` directories of your new package to the root `tsconfig.json` of the workspace.
