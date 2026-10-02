---
type: fix
spec: guidelines
status: done
created: 2026-10-02
---

# A label added at PR open can silently skip its heavy lane

## Intent

Opening a PR with a label (`gh pr create --label bench`, as the repo asks: "label at open time") fires an `opened` and a
`labeled` event at the same second. `.github/workflows/pr-heavy.yml` cancels in progress per ref:

```yaml
concurrency:
  group: pr-heavy-${{ github.ref }}
  cancel-in-progress: true
```

and gates each lane on the EVENT payload's labels:

```yaml
if: contains(github.event.pull_request.labels.*.name, 'bench') && fromJSON(needs.lanes.outputs.lanes).bench.run
```

Seen on MionKit/mion#436: run 37070744375 was cancelled, the surviving run 37070745066 had no `bench` in its payload, so
the lane decided `bench RUN` but every bench job skipped, and the PR showed green. An unlabelled-looking run let a
labelled PR look tested. Removing and re-adding the label was the workaround.

## Direction

The implementer plans the details. Options to weigh:

- Read the PR's CURRENT labels (e.g. `gh pr view --json labels` or the API in the lanes job) instead of the event
  payload, so whichever run survives sees the label.
- Or make the concurrency group keep the run that carries the label (e.g. not cancelling a `labeled` run with an
  `opened` one).

Check `.github/workflows/drizzle-e2e.yml` and any other label-gated workflow for the same pattern and fix them together.
A contract test (the repo has workflow contract tests under `packages/devtools/test/`) should pin the chosen shape.

## Docs

None for the website. If the PR-label guidance in `CLAUDE.md` changes, update it there.

## Done when

- A PR opened with a label always runs that label's lane, proven on a real PR or by a test that pins the workflow shape.
- Every label-gated workflow uses the same fix.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-10-02)

Read the PR's live labels, never the event payload. The run that survives the cancel was queued after
both events fired, so the label already exists when it asks the API, in either ordering.

- `.github/actions/ci-lanes/action.yml` gains a `labels` output: on a pull request it runs
  `gh pr view <n> --json labels` and emits the names as a JSON array; off a PR it emits `[]`; a failed read
  fails the gate job (red), never falls back to the payload.
- The `lanes` job in `ci.yml`, `pr-heavy.yml` and `drizzle-e2e.yml` exposes `labels` and gets
  `pull-requests: read`.
- Every gate reads `contains(fromJSON(needs.lanes.outputs.labels), '<label>')`: the three `pr-heavy` lanes,
  the three `skip-defaults` guards in `ci.yml`, and `drizzle-e2e.yml`'s `decide` job (now `needs: lanes`).
- Tests: `packages/devtools/test/label-gate-contracts.test.ts` pins that no workflow reads the payload
  labels, that every reader needs `lanes`, and runs the label script with a fake `gh` (labels returned,
  `[]` off a PR, a failed read fails). The two existing label tests follow the new expression.
