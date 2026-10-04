---
type: chore
spec: guidelines
status: blocked
created: 2026-10-04
---

# The static lanes join the run-keeping gate

## Intent

Comment-only commits now skip the test lanes because the lanes marked `hash: 'tokens'` in `scripts/ci/lanes.mjs` hash code without comments. The planned "CI keeps the runs a new commit does not affect" work (not built yet) keeps an older run alive when a new commit leaves its lane hashes equal, and makes the new run wait for that run's markers. Once it lands, a comment-only push should keep the older run's test lanes alive, while the two raw lanes, `js-static` and `go-static`, run again.

Blocked until that work is merged.

## Direction

- Give `js-static` and `go-static` the label gate that work adds to each lane (both are blocked by `skip-defaults`, like the rest of `ci.yml`).
- Add them to the waiter `lanes:` list of the job that runs them: js-lint holds `js` and `js-static`, go-fuzz holds `go`, `js-fuzz`, `go-tools` and `go-static`.
- Check that a waiting job still runs its raw steps when only the tokens lanes were kept.
- The implementer plans the details against the code that landed.

## Docs

None, because this is contributor CI with no page.

## Done when

- Live check on the PR: push a comment-only commit while the previous run is still going. The older run is kept, its tokens lanes are not restarted, and `js-static` / `go-static` run on the new commit.
- The contract tests that pin the gate field and the waiter lists cover the two lanes.
- The simplify-comments pass ran on every touched source file, committed on its own.
