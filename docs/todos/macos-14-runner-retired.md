---
type: chore
spec: guidelines
status: ready
created: 2026-10-02
---

# Move the release workflows off the retired macos-14 runner

## Intent

GitHub retires the `macos-14` runner image by 2026-11-02. Before that, jobs on `macos-14` fail on purpose during
brownout windows, the first on 2026-10-05 14:00 UTC to 2026-10-06 00:00 UTC (then Oct 12, 16, 19, 23, 26, 29, 30, same
hours). A release cut in one of those windows would fail its macOS lane.

Two jobs use it, both darwin-arm64 consumer smokes:

```yaml
# .github/workflows/release-gate.yml:267
- {runner: macos-14, pkg: darwin-arm64, backend: host-npx}
# .github/workflows/post-publish.yml:78
- {runner: macos-14, pkg: darwin-arm64, extra: '--no-matrix'}
```

## Direction

The implementer plans the details. Suggested: `macos-15` (Apple Silicon, pinned, so a future `macos-latest` image swap
cannot change a release run without notice). GitHub's other arm64 labels are `macos-latest` (macos-26),
`macos-15-xlarge`, `macos-latest-xlarge`.

- Grep the whole repo (workflows, actions, scripts, docs, tests such as the repo or release contract tests) for any other
  `macos-14` mention and change it in the same PR.
- Check nothing on the lane assumes the macOS 14 image (Node install, `npx verdaccio`, Xcode path).
- Prove the lane on the new runner before merge, e.g. a `workflow_dispatch` run of the gate or a temporary trigger, if
  the workflow allows one without publishing anything. Never publish to npm to test it.

## Docs

None, because no consumer-facing behaviour changes. If `SETUP.md` names the runner version, update that line.

## Done when

- No `macos-14` label is left in the repo.
- The macOS lane of the release gate has run green on the new runner, or the PR says why it could not be run yet.
- The simplify-comments pass ran on every touched source file, committed on its own.
