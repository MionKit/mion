---
type: fix
spec: guidelines
status: done
created: 2026-09-12
---

# The pre-publish e2e consumer lane fails: a batch in the server program

## Intent

Get the `pre-publish e2e · consumer lanes` job passing again on `main`. It fails today for
everyone who turns it on, and it is the only gate that proves a real consumer can install the
published packages and build with them.

## What fails

The lane's CLI compile step exits 1:

```
/e2e-mion/src/tests/json.spec.ts(133,82): error BAT008(/e2e-mion/client-app/tsconfig.json)
e2e: the mion consumer lane failed
```

Reproduce it with `pnpm miondevx release e2e`, or read it off the run at
https://github.com/MionKit/mion/actions/runs/34716637727/job/103616263252.

## Why it fails

The consumer fixture compiles with a separate client project:

```jsonc
// container/pre-publish-e2e/mion-consumer/package.json
"compile": "mion compile --tsconfig tsconfig.compile.json --client-tsconfig client-app/tsconfig.json --gen-dir .mion-cli"
```

`tsconfig.compile.json` extends the fixture's root tsconfig, so the program includes
`src/tests/`, and `src/tests/json.spec.ts:133` calls `batch([...])`. BAT008 is exactly that
situation: with a client pointer set, a batch written in the server's own program never reaches
the table the server registers, so the build reports it.

BAT008 used to be a warning. `ed06912` (`fix(diagnostics): split Error into fatal Error and
RuntimeError`) set it to `LevelRuntimeError`, and every build lane exits non-zero on that level.
That is the promotion working as designed; the fixture is what is wrong.

The lane is label gated (`pre-publish-e2e` on a PR, plus the release gate), so nothing ran it
between that commit and today, and it went unnoticed.

## Shape of the fix

Two roads, and the implementing session should pick with the lane in front of it:

- Keep the vitest specs out of the CLI compile program, so the fixture's `batch()` lives only in
  the `client-app/` project the pointer names. An `exclude` in `tsconfig.compile.json` is the
  small version, but check first what the lane asserts about the compiled output afterwards (the
  step prints a file count, and `build-output.spec.ts` reads the emitted tree).
- Or move the batch call into `client-app/`, if the spec's coverage is meant to include a batch
  round trip through the CLI-compiled server.

Either way the lane must end green, and the fixture should keep proving what it proves today: a
consumer compiling a server against a separate client project, then compiling that client.

## Done when

- `pnpm miondevx release e2e` passes locally.
- The `pre-publish-e2e` label on the PR shows the consumer lane green.
- The fixture still exercises the separate-client-project compile, batches included.

## Plan: road 1, plus the guards the break asked for (2026-09-12)

Road 1 (keep the vitest specs out of the CLI compile program), because road 2 cannot be taken:
`src/tests/json.spec.ts` is the only batch in the `vite build` lane too, and
`build-output.spec.ts` asserts that lane inlines the mapper body authored in it. Moving the
batch out would trade one broken lane for another.

- `mion-consumer/tsconfig.compile.json` grows an `exclude` carrying `src/tests`. The compile
  program keeps `src/server/`, `lint/` and `globalSetup.ts`, so the emitted tree still holds
  `dist-cli/src/server/server.js` and nothing `compile-output.spec.ts` reads moves.
- The round-trip lane (`vitest.config.ts`) and the build lane (`vite.build.config.ts`) both
  compile against the fixture's root `tsconfig.json` with no client pointer, so the spec's two
  batches keep working exactly as before. Only the CLI compile changes.
- `compile-output.spec.ts` keeps its `ids` assertion (the client project holds one batch), and
  the comments that described the server program as holding the specs' batches are rewritten.

Tests, since nothing on the host runs the fixture and the lane is label gated:

- `packages/devtools/test/compile-cli-mion.test.ts` gets a second case: the same two projects,
  plus one batch in the server's own program, asserting `mion compile` exits non-zero and names
  BAT008 and the offending file. That is the failure mode the gate hit, pinned host-side.
- `packages/devtools/test/cli-surface.test.ts` gets the fixture guard, in the same spirit as
  the verb/flag guard already there: read the fixture's own `compile` argv, resolve the include
  and exclude globs of the tsconfig it names, and fail if any file of that program calls
  `batch(`. A third case asserts the excluded specs DO batch, so the guard cannot pass hollow.

Docs, since the promotion left both pages reading as a warning:

- `01.rpc/06.devtools/02.vite.md` said the build "says so"; it now says the build fails and how
  to fix it.
- `01.rpc/03.client/03.batch.md` never mentioned the case at all. It gets a short note.

## What shipped

All of the above, unchanged from the plan. Built by a background session with no human in the
loop, so nothing here was reviewed before it was written.

`pnpm miondevx release e2e --backend container --no-matrix` was run locally and ended
`pre-publish e2e: PASS`, the consumer lane included. `pnpm run lint` and `pnpm run test:ci`
are green.
