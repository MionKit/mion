---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# The lint worker request declared a markers field that nothing ever sent

## What shipped

`LintWorkerRequest` in
[packages/devtools/src/lint/session-protocol.ts](../../packages/devtools/src/lint/session-protocol.ts)
carried a `markers?: {packages?: string[]; checkPackage?: boolean}` field that no writer set and
no reader touched. It is gone. Option 1 of the two the spec put up: the worker genuinely has no
use for it.

The request is now exactly the five fields `roundTrip()` posts, and a key table pins that:

```ts
const LINT_WORKER_REQUEST_KEY_TABLE = {seq: true, file: true, text: true, tsconfig: true, binary: true} satisfies Record<
  keyof LintWorkerRequest,
  true
>;

export const LINT_WORKER_REQUEST_KEYS = Object.keys(LINT_WORKER_REQUEST_KEY_TABLE) as (keyof LintWorkerRequest)[];
```

Same shape `LINT_SETTING_KEY_TABLE` already uses a few lines above, so the two wire contracts in
the file read alike.

## Why option 1

The Go resolver DOES have a marker-packages input, so the spec's precondition for option 2 held:
`--marker-packages` and `--no-marker-package-check` in
[ts-go-runtypes/cmd/mion/main.go](../../ts-go-runtypes/cmd/mion/main.go), merged with the
tsconfig `markers` key by `mergeBuildOptions`. Forwarding from the lint lane is still wrong:

- Those flags are SPAWN config. The resolver folds them into its marker options once, when it
  builds the Program, which is why `ResolverClientOptions.markerPackages` is a client option
  rather than a per-request field.
- The lint worker already hands the resolver the project tsconfig, and the resolver reads the
  `markers` key out of it. So a project's configured marker packages already reach the resolver
  on this lane, through the tsconfig, with no wire field involved.
- The lint lane carries no config logic of its own on purpose. `roundTrip()` forwards only an
  explicit tsconfig; everything else the Go side discovers exactly as tsc does.
- `LintSessionOptions.markers` is the rule-thread text pre-filter's knob and nothing else.
  `e2e-lint-settings.test.ts` already stated that in a test comment, and the docs say the plugin
  reads the full project tsconfig.

So the field was a copy of the `LintSessionOptions` one, comment included, contradicting the
design the rest of the file states.

## Test

`packages/devtools/test/eslint/session.test.ts` gained a case that captures the message
`roundTrip()` posts and asserts its keys equal `LINT_WORKER_REQUEST_KEYS`. It passes a `markers`
option in, so the assertion is the meaningful one: a pre-filter knob that must not ride the wire.
Re-adding the field to the interface makes it fail.

## Not changed

- `LintSessionOptions.markers`, `LINT_SETTING_KEY_TABLE` and `needsResolverPass(text, options.markers)`
  are untouched, so the pre-filter lets through exactly what it did before.
- No docs. The removed field is an internal wire type with no consumer-facing behaviour.
