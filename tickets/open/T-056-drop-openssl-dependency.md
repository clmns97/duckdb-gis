---
id: T-056
title: Drop the OpenSSL dependency to remove the only vcpkg/build-image risk
status: open
priority: P2
area: build
depends_on: [T-053]
branch:
---

## Goal

`make` builds the extension with no vcpkg dependency at all. "Done" means
`vcpkg.json` no longer lists `openssl`, the `perl-core` hack in `Makefile` is
deleted, and the community-extensions build has nothing left that can fail on a
build image's Perl/package inventory.

## Context

<context>
Discovered while de-risking [T-054]. The `Makefile` installs `perl-core` via
`yum` because OpenSSL's `./Configure` needs Perl core modules that the
linux_amd64 LTS build image lacks. **Pinning an older OpenSSL does not help** —
`Configure`'s `use` lines are byte-identical between 3.5.4 and 3.6.0 (verified
against both vcpkg buildtrees), and a non-default version pin makes a binary
cache miss — i.e. an actual source build — *more* likely, not less. So the hack
cannot be replaced, only removed along with the dependency.

Why the dependency is now near-vestigial: before [T-053] the extension proxied
the UI from `https://ui.duckdb.org`, which genuinely needed a TLS client. Now
the frontend is embedded and `gis_remote_url` defaults to empty
(`src/http_server.cpp:285-288`). The only remaining use of the proxy path is the
local Vite dev server at `http://localhost:5173` — plain HTTP.

What pulls OpenSSL in:
- `CMakeLists.txt:10` `find_package(OpenSSL REQUIRED)`, `:12` include dirs,
  `:84-85` `target_link_libraries(... OpenSSL::SSL OpenSSL::Crypto)`
- `#define CPPHTTPLIB_OPENSSL_SUPPORT` in `src/include/http_server.hpp:6` and
  `src/event_dispatcher.cpp:5`
- `vcpkg.json`
- The one real TLS API call: `client.enable_server_certificate_verification(false)`
  at `src/http_server.cpp:299`, gated on the `ui_disable_server_certificate_verification`
  env var — dead weight once the remote is only ever localhost.

**Behaviour change to accept and document:** after this, setting
`gis_remote_url` to an `https://` URL stops working. That is the whole cost.
Decide whether to reject non-`http://` values with a clear error rather than
failing obscurely.

Note `duckdb_httplib_openssl` is just DuckDB's vendored namespace name for
httplib (`src/include/http_server.hpp:17`); it does not by itself imply linking
OpenSSL. httplib compiles fine without `CPPHTTPLIB_OPENSSL_SUPPORT`.

Sequencing: this is deliberately *not* part of [T-054]. Shipping a change to the
core HTTP path unverified, immediately before a first public submission, is the
wrong risk ordering — land the submission on the known-good (if ugly) hack, then
do this cleanly with a full build + `unittest` run behind it.
</context>

## Acceptance criteria

- [ ] `vcpkg.json` no longer depends on `openssl`; `CMakeLists.txt` no longer
      calls `find_package(OpenSSL)` or links `OpenSSL::*`.
- [ ] The `install-build-prereqs` target and its `release debug:` order-only
      prerequisite are deleted from `Makefile`.
- [ ] `gis_remote_url` with an `http://` URL still proxies the Vite dev server
      correctly (manual check: `pnpm dev` + `SET gis_remote_url='http://localhost:5173'`).
- [ ] An `https://` `gis_remote_url` fails with a clear, deliberate error.
- [ ] README documents that `gis_remote_url` is HTTP-only.
- [ ] Tests / build pass (`make`, `./build/release/test/unittest`).

## Progress log

- 2026-08-05: Filed out of [T-054] de-risking. Established that the version-pin
  workaround is a dead end (identical `Configure` requirements across 3.5.x and
  3.6.x); removing the dependency is the only real fix. Not blocking T-054.
