---
type: fix
spec: guidelines
status: ready
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
