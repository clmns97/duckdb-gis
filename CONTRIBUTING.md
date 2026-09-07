# Contributing to duckdb-gis

Thanks for your interest. This is a young project with a single maintainer, so
please read the two short rules below before investing real time in a change.

## Two rules

1. **Open an issue before large changes.** For a typo or a small fix, just send
   the PR. For anything bigger — a new panel, a new SQL verb, a dependency, a
   refactor — open an issue first so we can agree on the approach. It is no fun
   to write a PR that turns out to conflict with something already planned.
2. **Don't break the offline guarantee.** The extension serves everything from
   its own binary and makes no outbound network requests. A change that
   introduces a CDN fetch, telemetry, or a runtime download will be rejected on
   principle, even if it's convenient. (Fetching *user-requested data*, like an
   Overture query or a basemap the user chose, is a different thing and is
   fine.)

## Ways to contribute

Bug reports and reproductions are genuinely valuable — see the
[issue templates](.github/ISSUE_TEMPLATE). Beyond that: documentation fixes,
frontend work, C++ work on the extension, and packaging/CI help are all
welcome. The project's north star is replicating QGIS's core workflows with
DuckDB as the engine, so "QGIS does it this way" is a good argument in design
discussions.

Before proposing a design change, it's worth reading
[`docs/requirements/vision.md`](docs/requirements/vision.md) for what is
deliberately in and out of scope, and [`docs/adr/`](docs/adr/) for decisions
already taken — ADR-0001 in particular explains why attached databases are
read-only. If your change contradicts one of those, that's fine, but argue
with the ADR rather than around it.

## Getting set up

`README.md` is the source of truth for building and running; this file won't
duplicate it. Read:

- [Build from source](README.md#build-from-source) — `make`, and what it produces
- [Run](README.md#run) — starting the server
- [Frontend development](README.md#frontend-development) — the Vite dev loop
- [Repository layout](README.md#repository-layout) — where things live

Two things worth knowing that aren't obvious from a directory listing:

- **Ignore `duckdb/`, `extension-ci-tools/`, and `third_party/`.** They're
  vendored submodules — hundreds of megabytes of upstream source. Almost
  nothing you want to change lives there.
- **You probably don't need the C++ build.** A frontend-only change needs Node
  and pnpm, nothing else. The first C++ build pulls the DuckDB submodule and
  compiles OpenSSL through vcpkg, which takes a while; only take that on if
  you're touching `src/`.

For the C++ build you'll need a vcpkg checkout (the extension depends on
OpenSSL — see `vcpkg.json`) with `VCPKG_TOOLCHAIN_PATH` pointing at
`scripts/buildsystems/vcpkg.cmake`. The
[DuckDB extension template](https://github.com/duckdb/extension-template)
documents that toolchain setup. Note that CMake 4.x breaks some vcpkg ports;
CMake 3.3x is the safe choice.

pnpm is pinned per workspace via `packageManager`, so `corepack enable pnpm`
gets you the right version automatically.

## Branches and commits

One convention for everyone, maintainer included:

- **Branches:** `type/short-description` — `feat/layer-opacity`,
  `fix/overture-fetch`, `docs/contributing`, `refactor/map-bus`,
  `chore/bump-deps`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  prefixes — `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. This is what
  makes generated release notes readable, so it's worth the small discipline.

Work is tracked in GitHub Issues, labelled by `priority:` and `area:`. Anything
already being worked on carries `status: in-progress`, and its progress lives in
that issue's comments — worth a read before starting, so you don't duplicate it.

## The quality gate

Run whichever rows apply to what you touched. CI runs the same things.

**Frontend (`frontend/`)**

```sh
pnpm --dir frontend install
pnpm --dir frontend typecheck
make frontend        # rebuilds frontend/dist
```

> **The one footgun in this repo:** `frontend/dist` is **committed**, because
> it gets compiled into the extension binary and the community-extensions build
> has no Node to regenerate it. If you change anything under `frontend/src`,
> run `make frontend` and **commit the resulting `frontend/dist`**. CI fails
> the PR if it's stale.

**TypeScript workspace (`ts/`)**

```sh
cd ts
pnpm install
pnpm build
pnpm check      # formatting + lint
pnpm test
```

**C++ extension (`src/`, `CMakeLists.txt`)**

```sh
make
./build/release/test/unittest
```

## Pull requests

Link the issue your PR addresses, describe what changed, and include a
screenshot for anything visual — this is a map application, and a screenshot
answers questions that a diff can't. Keep PRs focused; a bug fix plus an
unrelated refactor is two PRs.

## Code of conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please don't report security problems in a public issue — see
[SECURITY.md](SECURITY.md) for the private channel.

## Licensing and attribution

This project is MIT licensed, and is an independent project derived from
[`duckdb/duckdb-ui`](https://github.com/duckdb/duckdb-ui). It is **not**
affiliated with, maintained by, or endorsed by the DuckDB Foundation or DuckDB
Labs. By contributing you agree that your contributions are licensed under the
MIT License. Don't paste in code whose license you haven't checked.
