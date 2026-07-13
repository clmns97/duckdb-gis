// ---------------------------------------------------------------------------
// Object-storage / remote data plumbing (T-008).
//
// Lazily brings up the network stack a remote source needs — the `httpfs`
// extension and any S3 access config — so app startup stays lean (only spatial
// + the render extensions load eagerly; see the bootstrap in `App.tsx`) and
// network extensions load the first time a remote source is actually used.
//
// State persists across `query()` calls: the UI client talks to the extension
// over a singleton connection, and loaded extensions + DuckDB secrets are
// database-wide anyway — so the ensure* helpers memoise a single successful
// setup and clear the memo on failure so a later attempt can retry.
// ---------------------------------------------------------------------------

import { query } from "./duckdb";

let httpfsPromise: Promise<void> | null = null;

/** Install + load `httpfs` once (idempotent). Required for any `s3://`/`https://`
 *  read. Cheap no-op after the first success. */
export function ensureHttpfs(): Promise<void> {
  if (!httpfsPromise) {
    httpfsPromise = (async () => {
      await query("INSTALL httpfs; LOAD httpfs;");
    })().catch((e) => {
      httpfsPromise = null; // let a later load retry
      throw e;
    });
  }
  return httpfsPromise;
}

/** The public Overture Maps bucket (region us-west-2). */
export const OVERTURE_BUCKET = "s3://overturemaps-us-west-2";

let overturePromise: Promise<void> | null = null;

/**
 * Ensure anonymous read access to the public Overture S3 bucket (T-012).
 *
 * Overture is public and served unsigned, so we register a *scoped* S3 secret
 * with an explicit `config` provider and empty credentials. Two deliberate
 * choices, both verified against the live bucket:
 *   - `PROVIDER config` (not the default `credential_chain`) makes httpfs issue
 *     anonymous requests instead of probing the AWS credential chain — whose
 *     EC2-metadata lookup *hangs* for minutes when no real credentials exist.
 *   - `SCOPE` pins region `us-west-2` to this bucket only, so it never clobbers
 *     the global `s3_region` or interferes with other (credentialed) S3 sources
 *     a user might add later.
 */
export function ensureOvertureAccess(): Promise<void> {
  if (!overturePromise) {
    overturePromise = (async () => {
      await ensureHttpfs();
      await query(
        `CREATE OR REPLACE SECRET overture (
           TYPE s3, PROVIDER config, KEY_ID '', SECRET '',
           REGION 'us-west-2', SCOPE '${OVERTURE_BUCKET}'
         );`,
      );
    })().catch((e) => {
      overturePromise = null; // let a later load retry
      throw e;
    });
  }
  return overturePromise;
}
