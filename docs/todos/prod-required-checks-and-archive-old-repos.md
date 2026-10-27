---
type: chore
spec: guidelines
status: blocked
created: 2026-10-27
---

# Require the gate checks on prod, archive the two old repositories

Owner only: both need repository admin rights. 0.13.2 shipped through the CI release, so the
real check names now exist.

## Owner actions

- **Required status checks on the `prod` ruleset** (merge-commit-only is already set), under
  **Settings → Rules → prod**: `version.json not already on npm` and the `gate / …` jobs. The
  names are listed in #507's comment. Leave `main-ancestor` out: a forced-tree reunification keeps
  it red forever, which would leave the release line with no legal repair.
- **Archive `MionKit/ts-run-types`** with a README pointer: development moved to `MionKit/mion`,
  history preserved there under the `pre-merge-ts-run-types` tag.
- **Archive `MionKit/Benchmarks`**: its harness lives in `container/mion-bench/`.

## Done when

- `prod` requires its status checks.
- Both old repositories are archived.
