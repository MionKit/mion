# Update in-repo references after the default branch is renamed to main

**Status:** open
**Created:** 2026-08-23

The default branch is still `master`. Renaming it to `main` is an owner-only action in GitHub
settings (Settings → Branches → rename), and it is a prerequisite of step 2 of
[merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md)
(decision 4). Several in-repo references hardcode the branch name and must be updated once the
rename lands.

This was carved out of [../done/premerge-cleanup-of-mion.md](../done/premerge-cleanup-of-mion.md).
Everything else in that spec has shipped; only this half is blocked.

## Why it did not ship with the rest

These edits cannot land before the rename without breaking things in the window between:

- The `raw.githubusercontent.com/.../master/...` asset URLs are what npm renders on the package
  pages. Pointing them at `main` before the branch exists gives every published README broken
  images.
- `nuxtjs.yml` triggers the GitHub Pages deploy on pushes to `master`. Pointing it at `main`
  early means no deploy runs at all.

They are equally wrong left as-is after the rename, so this needs to follow the rename promptly
rather than sit.

## Evidence (verified 2026-08-23)

`git ls-remote --symref origin HEAD` → `ref: refs/heads/master`. No `main` branch exists yet,
locally or on the remote.

## Fix plan

Once the owner has renamed the branch:

1. `.github/workflows/nuxtjs.yml` line 10: `branches: ['master']` → `['main']`.
2. `nx.json` line 26: `"defaultBase": "master"` → `"main"`. Nothing in this repo reads
   `defaultBase` today (nx is only invoked via `nx reset` in the root `clean` script and as
   lerna's task runner), and step 3 of the master plan deletes nx entirely — but it must not
   point at a dead branch in the meantime.
3. The `raw.githubusercontent.com/MionKit/mion/master/...` asset URLs → `main`. 38 URLs across
   10 files: root `README.md` (2) and the READMEs of `packages/{client,core,drizze,examples,
   platform-aws,platform-bun,platform-gcloud,platform-node,router}` (4 each).
4. `website/app/app.config.ts` line 49: `https://github.com/MionKit/mion/blob/master/LICENSE`
   → `blob/main/LICENSE`.

Leave alone: `https://github.com/MionKit/Benchmarks/blob/master/...` in the root README (a
different repo, unaffected by this rename), and the prose mentions of `master` in
`packages/client/src/lib/validation.ts`, its spec, and several `docs/done/` records, which
refer to git history rather than linking to a branch.

## Done criteria

- `grep -rn "MionKit/mion/\(blob\|tree\|raw\)\?/*master" --include='*.md' --include='*.ts' --include='*.yml' .`
  returns nothing outside `docs/` history notes and the `MionKit/Benchmarks` links.
- The Pages deploy runs from `main`, and `master` receives no further pushes.
