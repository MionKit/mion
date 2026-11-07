---
type: chore
spec: guidelines
status: done
created: 2026-10-27
updated: 2026-10-30
---

# Require the gate checks on prod, archive the two old repositories

Owner only: both need repository admin rights. Done after 0.13.2 shipped through the CI release,
so the real check names existed.

## What shipped

- **Required status checks on the `prod` ruleset**, next to merge-commit-only: 32 checks, all from
  GitHub Actions, names matched against the 0.13.2 release commit.
  - `version.json not already on npm`
  - `gate / build + full source suite + pack`, `gate / suite tree in the value forms`
  - `gate / e2e linux-x64`, `gate / e2e darwin-arm64`, `gate / e2e win32-x64`
  - `gate / binary-exec linux/linux-arm`, `gate / binary-exec linux/linux-arm64`
  - `gate / static docs site build (podman)`, `gate / validation + type-cost benchmarks (podman)`
  - `gate / pick soak lanes`, `gate / fuzz-soak-nondata / fuzz soak · nondata`
  - `gate / fuzz soak · <lane>` for apiids, apitypes, cloning, convert, convertcli, drizzletypes,
    elision, enrich, i18n, jsonsize, race, roundtrip, secformat, secgen, sechttp, secjson,
    typedemit, typemod, types, value
- `release head is an ancestor of main` stays out: a forced-tree reunification keeps it red
  forever, which would leave the release line with no legal repair.
- **`MionKit/ts-run-types` archived**, its README points to `MionKit/mion`. History is preserved
  there under the `pre-merge-ts-run-types` tag.
- **`MionKit/Benchmarks` deleted** rather than archived: its harness lives in `container/mion-bench/`.

## Could go stale

The fuzz lanes come from a fixed registry (`miondevx core fuzz-lanes`). Renaming or removing a lane
needs the same change in the `prod` ruleset, or the next release PR waits on a check that never runs.
