---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# The lint worker request declares a markers field that nothing ever sends

## Intent

`LintWorkerRequest` in
[packages/devtools/src/lint/session-protocol.ts](../../packages/devtools/src/lint/session-protocol.ts)
declares:

```ts
markers?: {packages?: string[]; checkPackage?: boolean};
```

Nothing writes it and nothing reads it. `roundTrip()` in
[packages/devtools/src/lint/session.ts](../../packages/devtools/src/lint/session.ts) posts exactly
five fields:

```ts
port.postMessage({
  seq,
  file,
  text,
  tsconfig: options.tsconfig ?? '',
  binary: options.binary ?? '',
} satisfies LintWorkerRequest);
```

and [packages/devtools/src/lint/lint-worker.ts](../../packages/devtools/src/lint/lint-worker.ts)
only ever touches `request.seq`, `request.file`, `request.text`, `request.tsconfig` and
`request.binary`.

The configured marker packages DO reach the rule thread: `lint/index.ts` calls
`needsResolverPass(text, options.markers)`, so the text pre-filter honours them. They just never
cross to the worker or the resolver. The field's comment promised a wire hop that does not happen;
that comment has already been cut back to what is verifiable, which is why this spec exists.

## What to settle

Decide which of these the design wants, and make the code say it:

1. The worker genuinely has no use for `markers`. Then remove the field from `LintWorkerRequest` and
   keep it only on `LintSessionOptions`, where the pre-filter reads it.
2. The worker (or the resolver behind it) SHOULD honour the configured marker packages. Then post
   the field from `roundTrip()` and make `lint-worker.ts` forward it, with a test that a project
   whose markers come from its own package is linted rather than skipped.

Work out whether the Go resolver has a marker-packages input at all before choosing. If it does not,
option 1 is the answer and option 2 is a larger piece of work that needs its own spec.

## Evidence to produce

- The search proving no other writer or reader of `LintWorkerRequest.markers` exists, generated code
  included.
- If option 2: a test that a file importing its markers from its own package still produces the
  diagnostic, failing before the change and passing after.
- `pnpm run lint` and `pnpm test` green, plus a `@mionjs/devtools` dist rebuild, since the root
  eslint config loads the built `./eslint` entry through node.

## Watch out

- `LintSessionOptions.markers` is NOT dead. It is in `LINT_SETTING_KEY_TABLE`, `sessionOptions()`
  reads it, and the pre-filter uses it. Only the `LintWorkerRequest` copy is unused.
- The pre-filter is additive on purpose: the Go guards stay authoritative, so removing the field
  from the request must not change what the pre-filter lets through.

## Origin

Found during a repo-wide comment simplification pass, by checking the field's comment against
`roundTrip()` and the worker.
