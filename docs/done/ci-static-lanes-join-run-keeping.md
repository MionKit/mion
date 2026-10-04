---
type: chore
spec: guidelines
status: done
created: 2026-10-04
---

# The static lanes join the run-keeping gate

## Intent

Comment-only commits skip the test lanes, because the lanes marked `hash: 'tokens'` in `scripts/ci/lanes.mjs` hash code without comments. Once CI keeps an older run that a new commit does not affect, a comment-only push should keep the older run's test lanes alive, while the raw lanes (`go-tools`, `go-static`, `js-static`) run again. Shipped in the same PR as the run-keeping gate, MionKit/mion#454.

## What shipped

- `js-static` and `go-static` carry the `skip-defaults` gate (`gate: DEFAULTS`), like the rest of `ci.yml`.
- The waiters hold them: `js-lint-wait` waits on `js js-static`, `go-fuzz-wait` on `go js-fuzz go-tools go-static`, and each waiter starts when any of its lanes is deferred.
- `supersede()` in `scripts/ci/supersede.mjs` no longer cancels an older run for a changed raw lane. It keeps the run while an unchanged lane still waits on it, defers only the unchanged lanes, and leaves the raw lanes to run here. A changed code lane still cancels.
- js-lint reads `env.MION_LANES` (the waiter's fresh verdict) in every step `if:`, so after the wait its raw steps run and its code steps skip.
- go-fuzz saves `go-static` right after the resolver build that follows `Go vet`, and js-lint saves `js-static` right after `Contract tests`, so those markers do not wait on the long suites.

## Tests

- `ci-supersede.test.ts`: only a raw lane changed → kept, code lanes deferred, raw lane runs here; a raw plus a code lane changed → cancelled; an older run of only a changed raw lane → cancelled. The seeded property check now draws `js-static` too.
- `ci-lane-contracts.test.ts`: the waiter lists include both lanes, js-lint sets `MION_LANES` from its waiter, and the label-mirror test covers their gate.
- `ci-token-hash-contracts.test.ts`: the static and suite steps read `env.MION_LANES`.

## Docs

None, because this is contributor CI with no page.

## Done when

- Live check on the PR: push a comment-only commit while the previous run is still going. The older run is kept, its tokens lanes are not restarted, and `js-static` / `go-static` run on the new commit.
- The contract tests that pin the gate field and the waiter lists cover the two lanes.
- The simplify-comments pass ran on every touched source file, committed on its own.
