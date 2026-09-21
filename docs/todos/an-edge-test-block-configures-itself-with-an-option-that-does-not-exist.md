---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# An edge test block configures itself with an option that does not exist

## Intent

[packages/platform-vercel/src/vercelHandler.edge.spec.ts](../../packages/platform-vercel/src/vercelHandler.edge.spec.ts)
opens a describe block like this:

```ts
describe('with the direct encoder (stringifyJson framing)', () => {
    beforeAll(async () => {
      vm = createEdgeVM();
      await vm.evaluate("EdgeTestServer.setup({encoder: 'direct'})");
    });
```

`EdgeSetupOptions` in
[packages/test-server/src/test-server-edge.ts](../../packages/test-server/src/test-server-edge.ts)
declares no `encoder`:

```ts
export interface EdgeSetupOptions {
  basePath?: string;
  /** `mutate` answers with the in-place encoder; the default is `clone`. */
  serializer?: 'mutate' | 'clone';
  defaultResponseHeaders?: Record<string, string>;
}
```

and `'direct'` is not one of `serializer`'s values either. `setup()` reads only
`options?.serializer === 'mutate'`, so the block runs on the DEFAULT `clone` routes.

The mistake survives because the call is a STRING passed to `vm.evaluate(...)`, so TypeScript never
checks it. Every assertion under that heading currently passes for the default configuration, and
would keep passing if the "direct" behaviour broke entirely.

The same file has a smaller instance of the shape: `EdgeSetupOptions.basePath` is accepted and never
read (`setup()` hardcodes `basePath: 'api/'` on the router and passes only
`defaultResponseHeaders` to the handler). The cloudflare twin,
`test-server-cloudflare.ts`, DOES forward `options?.basePath ?? ''`, so the two fixtures disagree.

## What to settle

1. Work out what the block was meant to exercise. `stringifyJson` framing is a real serializer
   strategy, so "direct" was probably an older name for one of the current ones. Find which, then
   either configure it properly through `serializer` (extending the union and `setup()` if the
   strategy it wants is not there yet) or delete the block and its heading if the coverage is
   genuinely redundant with another suite.
2. Make the same mistake impossible to repeat. The `vm.evaluate` string is the hole. Options worth
   weighing: a typed helper that builds the evaluate string from a checked object, or making
   `setup()` throw on an unknown key so a wrong option fails loudly inside the VM instead of being
   ignored.
3. Decide whether the edge fixture should honour `basePath` like its cloudflare twin, or stop
   accepting it.

## Evidence to produce

- What "direct" meant, with the reference that settles it (git history of the fixture or the
  serializer strategy names).
- After the fix, a check that the block actually runs under the intended configuration: assert
  something only that configuration produces, so the test would fail if the option stopped applying.
- `pnpm --filter @mionjs/platform-vercel test` green, and the cloudflare edge suite too if you touch
  the shared fixture shape.

## Watch out

- Sweep the other `vm.evaluate("...setup({...})")` call sites in both edge suites before concluding
  this is the only one. The same string-escape hole applies to all of them.
- The test-server fixtures are shared. Changing `EdgeSetupOptions` can affect the cloudflare suite,
  which uses a parallel interface.

## Origin

Found during a repo-wide comment simplification pass, while checking a comment that said an accepted
option is unused.
