# Releasing

How to cut a release of the `gis` extension. Releases matter mechanically, not
just as announcements: the DuckDB community-extensions build pins an immutable
commit SHA (`repo.ref` in `description.yml`), and that commit is literally what
users install with `INSTALL gis FROM community`.

Versions are `vMAJOR.MINOR.PATCH`, independent of DuckDB (see "Versioning" in
the README). Before 1.0, mark releases as pre-releases on GitHub.

## 1. Check that `main` is releasable

- The latest runs of `MainDistributionPipeline.yml` (every platform),
  `Compatibility.yml` (DuckDB 1.4 / 1.5 / 2.0) and `Frontend.yml` on `main`
  are green:

  ```sh
  gh run list --branch main --limit 10
  ```

- The end-to-end suite passes: `cd frontend && pnpm test:e2e` locally, or
  Actions → E2E → "Run workflow" on `main`.
- The excluded and opt-in platforms match in both places. Each pair must list
  the same platforms:

  ```sh
  grep -E 'exclude_archs|opt_in_archs' .github/workflows/MainDistributionPipeline.yml
  grep -E 'excluded_platforms|opt_in_platforms' description.yml
  ```

  Excluding a platform that fails to build is a legitimate release decision,
  but make it on purpose and record it in the changelog.

## 2. Release PR: changelog and version

On a branch `docs/release-vX.Y.Z`:

1. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`,
   add a fresh empty `## [Unreleased]` above it, and update the two link
   references at the bottom. Call out any change to the SQL functions under
   **Breaking**.
2. In `description.yml`, set `extension.version: X.Y.Z`. Leave `repo.ref`
   alone; it is pinned in step 5.

Open the PR, merge it, and wait for `MainDistributionPipeline.yml` to go green
on the merge commit. That run builds exactly the commit you are about to tag.

The extension needs no version bump in code. The build takes its version from
`git tag --points-at HEAD` (`extension-ci-tools/scripts/configure_helper.py`),
and falls back to the short commit hash when the checkout has no tags — which
can happen in the community build, as it checks out a bare SHA.

## 3. Tag

Tag the release PR's merge commit (annotated, so it records who and when):

```sh
git switch main && git pull --ff-only
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

Don't move or delete a tag once pushed. If something is wrong, release
`vX.Y.Z+1`.

## 4. GitHub Release

Use the changelog entry as the notes:

```sh
awk '/^## \[X.Y.Z\]/{f=1; next} /^(## )?\[/{f=0} f' CHANGELOG.md > /tmp/notes.md
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file /tmp/notes.md --prerelease
```

Drop `--prerelease` from 1.0 on. Binary assets are optional: the community
build produces and hosts the installable binaries.

## 5. Pin the SHA in `description.yml`

```sh
git rev-list -n 1 vX.Y.Z
```

Set `repo.ref` to that full SHA, **quoted** (an all-digit SHA would otherwise
parse as a number), in a small PR on `main` (`chore: pin description.yml to
vX.Y.Z`). The pinned commit is the tag's, not this PR's.

## 6. Community-extensions PR

1. Fork [`duckdb/community-extensions`](https://github.com/duckdb/community-extensions)
   (or sync your fork).
2. Copy `description.yml` to `extensions/gis/description.yml` and open a PR,
   titled e.g. `gis: vX.Y.Z`. Their CI builds the extension from `repo.ref` on
   every platform not excluded.
3. If their build fails on a platform ours didn't, fix it in a patch release
   rather than adding a platform exclusion only on their side: the two lists
   must stay in sync (step 1).

For the first listing, also remove the "Not yet listed" note under "Install"
in the README once the PR is merged.

## 7. Verify the published extension

After the community PR is merged and its deploy has run, in a fresh DuckDB
(no locally built extension on the path):

```sql
INSTALL gis FROM community;
LOAD gis;
CALL start_gis();
```

The UI opens, the demo `CREATE TABLE cities …` from `description.yml` can be
added to the map, and `SELECT extension_version FROM duckdb_extensions() WHERE
extension_name = 'gis'` shows `vX.Y.Z` or the tag's short commit hash.
