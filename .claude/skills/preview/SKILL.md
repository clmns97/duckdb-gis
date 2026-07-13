---
name: preview
description: Spin up the duckdb-gis UI (extension server + Vite dev server) and hand back a Tailscale URL so it can be viewed from a phone or other device on the tailnet. Use when the user wants to "preview", "look at the UI", "see the app", or get a link to the running GIS frontend.
---

# preview — view the GIS UI from your phone over Tailscale

Launches the app so the user can browse it on another device:

```
phone --Tailscale--> Vite :5173 (0.0.0.0) --proxy--> extension :4213 (loopback)
```

Vite serves the frontend from `frontend/src` (unbuilt, with HMR) and proxies
the SQL-over-HTTP API to the extension server, rewriting Origin so the
extension's same-origin gate passes. Only Vite is exposed on the tailnet; the
extension stays loopback-only.

Both processes are launched **detached** (`setsid`, logs in
`$TMPDIR/duckdb-gis-preview/`) so they keep running after this chat ends.

## How to run it

Everything lives in `serve.sh` next to this file. Run and relay the URL:

```sh
.claude/skills/preview/serve.sh start
```

Then tell the user the `Open on your phone:` line it prints (e.g.
`http://100.82.86.25:5173/`). That is a Tailscale IP — the user must be on the
same tailnet (they have Tailscale on their phone).

Other verbs:

- `serve.sh status` — are the two servers up? prints the URL.
- `serve.sh stop`   — tear both down.
- `serve.sh logs`   — tail both logs (use if a server failed to come up).

## Named views (optional)

The user chose to keep both quick named views and free navigation. `serve.sh`
just gets the app running; it does not navigate. If the user asks to be taken
to a specific view, append a URL hash/query the frontend understands, or (if
the frontend has no deep-linking yet) tell them which panel to tap. Default
landing is the map + editor shell.

## Requirements / gotchas

- Needs `make` to have built `build/release/duckdb` and `pnpm` on PATH.
- Access via the **Tailscale IP** works out of the box. The MagicDNS hostname
  (`personal-vps.tail81936c.ts.net`) would be rejected by Vite 8's host check
  unless `allowedHosts` is added to `frontend/vite.config.ts` — prefer the IP.
- If nothing loads on the phone, run `serve.sh status` then `serve.sh logs`.
