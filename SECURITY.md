# Security policy

## Reporting a vulnerability

**Please don't open a public issue for a security problem.**

Use GitHub's private vulnerability reporting instead:
[Report a vulnerability](https://github.com/clmns97/duckdb-gis/security/advisories/new).
That channel is private to the maintainer until an advisory is published.

This is a single-maintainer project, so please be patient: expect an
acknowledgement within about a week. If you've had no reply after two weeks,
feel free to nudge by opening a normal issue that says only "sent a private
report, please check" — with no details.

## Supported versions

Pre-1.0, only the latest release is supported. Fixes land on `main` and go out
in the next release rather than being backported.

## What's in scope

`duckdb-gis` is worth a careful look because of what it does: `CALL start_gis()`
starts an **HTTP server on your machine** that can **execute arbitrary SQL** in
the DuckDB instance that loaded the extension. DuckDB can read and write local
files, so a bug that lets an untrusted page reach those endpoints is
serious — it's local code execution territory, not just an information leak.

Especially interesting:

- **Bypassing the origin checks** on the SQL endpoints (`/ddb/run` and friends
  in `src/http_server.cpp`), e.g. from a malicious page in the user's browser,
  DNS rebinding, or a redirect.
- **Binding wider than intended** — the server is meant to be reachable only
  from the local machine.
- Path traversal or similar in anything the server serves.
- XSS in the frontend that could reach the SQL endpoints, since the frontend is
  same-origin with them by design.
- Dependency vulnerabilities that are actually reachable in our usage.

## What's out of scope

- The fact that the SQL endpoints run SQL. That is the entire point of the
  extension; a user who loads it is trusting it with their DuckDB instance.
- Anything requiring an attacker who already has local code execution or shell
  access as the same user.
- Vulnerabilities in DuckDB itself — report those to
  [duckdb/duckdb](https://github.com/duckdb/duckdb). Likewise, this project is
  an independent fork and is not maintained or endorsed by the DuckDB
  Foundation; please don't route reports about it to them.
