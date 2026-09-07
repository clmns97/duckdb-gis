<!--
For anything larger than a small fix, please open an issue first so we can
agree on the approach — it's no fun to write a PR that turns out to conflict
with something already planned. See CONTRIBUTING.md.
-->

## What this changes

<!-- A short description. If it's a UI change, a screenshot says more than a
     paragraph. -->

Fixes #

## Checks

<!-- Only the rows your change touches need to pass. A frontend-only change
     does not need a C++ build (that first build is slow). -->

- [ ] **Frontend** (`frontend/`): `pnpm --dir frontend typecheck` passes
- [ ] **Frontend**: ran `make frontend` and **committed the updated `frontend/dist`** — CI fails if it's stale
- [ ] **TypeScript workspace** (`ts/`): `pnpm check` and `pnpm test` pass
- [ ] **C++ / build** (`src/`, `CMakeLists.txt`): `make` succeeds and `./build/release/test/unittest` passes
- [ ] Commit messages use a [Conventional Commits](https://www.conventionalcommits.org/) prefix (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)
