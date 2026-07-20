# CI flake: "generate: resolver exited" during batch-2 project init

**Status:** todo
**Created:** 2026-07-20

## Problem

The `test:ci` pipeline can fail with a startup `AggregateError: Failed to initialize
projects` whose inner error is `Error: generate: resolver exited` (thrown by
`@ts-runtypes/devtools` `ResolverClient.generate` when its Go resolver child process dies
while a scan request is pending). Observed on PR #123 run 29711086477 (head 396c4785):

- Batch 1 (`core run-types router type-formats`) initialized, scanned, and passed
  36 files / 597 tests.
- Batch 2 (`drizze devtools platform-aws platform-gcloud`) began initializing 0.3s after
  batch 1's summary and died **0.6s later**. `Promise.all (index 2)` maps (root
  `vitest.config.ts` projects order filtered to the batch) to the **devtools** project —
  its resolver child exited silently: no Go panic, no diagnostics, no signal message
  anywhere in the job log.
- The identical tree passes everywhere else: the full local suite is green, and the exact
  batch-2 invocation (`vitest run --project drizze --project devtools --project
  platform-aws --project platform-gcloud`) passes locally (16 files / 354 tests).
- A content-identical re-push (amend, no diff) went green on CI, confirming flakiness.

## Evidence against the obvious causes

- **Not a code defect:** every source file changed in 396c4785 lives in batch-1 programs,
  which scanned and passed on the same runner one second earlier; batch 2 passes locally
  on the same bytes.
- **Probably not plain OOM:** local RSS sampling of batch 2 shows the four resolver
  processes peak at ~510MB combined (~130MB each) and the whole batch at ~1.4GB — far
  under the 7GB runner. The known OOM mode (the reason `test:ci` is split into 4 batches)
  needs the all-projects run. A teardown/spawn overlap spike can't plausibly bridge that
  gap alone, though the kernel OOM killer would match the silent-SIGKILL signature.
- Most likely a transient runner-level failure (fd/process churn at the batch boundary:
  4 resolver children exiting while 4 new ones spawn) killing or failing one child.

## Fix plan

1. **Cheap mitigation (mion):** nothing code-side; re-run the job when this signature
   appears (startup AggregateError + `resolver exited` + zero resolver output).
2. **Real hardening (upstream ts-run-types candidate):** `ResolverClient` could respawn
   the resolver and retry the pending `generate` once when the child exits unexpectedly
   before/while serving a request — turning this class of transient child death into a
   logged warning instead of a build failure. File under ts-run-types docs/todos if it
   recurs.
3. If it recurs even once more, also consider staggering project init (vitest has no
   direct knob; a `globalSetup`-free option is splitting batch 2 further) — but don't
   spend CI minutes on speculation before a second occurrence.

## Acceptance

- Signature documented; one-line triage path (re-run) known.
- Upstream retry filed if a second occurrence is seen.
