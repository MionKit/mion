---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# An edge test block configures itself with an option that does not exist

## Intent

[packages/platform-vercel/src/vercelHandler.edge.spec.ts](../../packages/platform-vercel/src/vercelHandler.edge.spec.ts)
opened a describe block like this:

```ts
describe('with the direct encoder (stringifyJson framing)', () => {
    beforeAll(async () => {
      vm = createEdgeVM();
      await vm.evaluate("EdgeTestServer.setup({encoder: 'direct'})");
    });
```

`EdgeSetupOptions` in
[packages/test-server/src/test-server-edge.ts](../../packages/test-server/src/test-server-edge.ts)
declared no `encoder`, and `'direct'` was not a `serializer` value either. `setup()` read only
`options?.serializer === 'mutate'`, so the block ran on the DEFAULT `clone` routes.

The mistake survived because the call is a STRING passed to `vm.evaluate(...)`, so TypeScript never
checked it. Every assertion under that heading passed for the default configuration, and would have
kept passing if the "direct" behaviour broke entirely.

The same file accepted `EdgeSetupOptions.basePath` and never read it. The cloudflare twin,
`test-server-cloudflare.ts`, DID forward `options?.basePath ?? ''`, so the two fixtures disagreed.

## What shipped

### 1. What "direct" meant, and what replaced the block

`direct` was a router option that named the single-pass `stringifyJson` encoder. It was **removed**
in commit `dc4e6bb`, *"refactor(router,client,platforms)!: the option is serializer, and direct is
gone"*, together with the `stringifyJson` response framing it was the only producer of. mion does
not offer it and is not going to:

```ts
// packages/core/src/types/general.types.ts
/** RunTypes also offers `direct`; mion does not, it costs 3x the memory of `clone` and 2x the time
 *  for identical bytes. */
export type SerializerStrategy = 'clone' | 'mutate' | 'compact';
```

So the block could not be configured properly: the configuration it named no longer exists. Its
assertions were NOT redundant, though (the validation-error shape, the route-set headers and the
default headers appear nowhere else in the file), so the tests stayed and the heading was corrected
to the configuration they actually run, `with the default clone serializer`.

The file's SECOND block was mislabelled the same way: `with the default mutate encoder (json
framing)` also ran the default `clone` routes, and the fixture's `mutateRoutes` were used by no test
at all. That block now really asks for `{serializer: 'mutate'}` and pins it with an assertion only
`mutate` can satisfy:

```ts
it('should keep an undeclared key the clone serializer would drop', async () => {
  const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z'), extra: 'kept'}]};
  ...
  expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z', extra: 'kept'}});
});
```

`mutateRoutes` moved from `{serializer: {return: 'mutate'}}` to `{serializer: 'mutate'}` to make
that observable: only a `mutate` PARAMS decoder restores in place and keeps a key the type does not
declare, and `getDate` handing its own argument back is what carries it to the wire. The check was
verified in both directions: flipping the block to `'clone'` fails it with `- "extra": "kept"`.

### 2. The same bug in the cloudflare twin

The sweep found `packages/platform-cloudflare/src/cloudflareHandler.workers.spec.ts` carrying an
identical copy: the same two wrong headings and the same `{encoder: 'direct'}`, built as a string for
the worker script rather than for `vm.evaluate`. Both files got the same fix.

### 3. Closing the string hole, two ways

`setup()` now throws on a key its options interface does not declare, so a wrong option fails loudly
inside the sandbox instead of being ignored. The guard is shared by both fixtures
([packages/test-server/src/setupOptions.ts](../../packages/test-server/src/setupOptions.ts)), and
each fixture's key list is written `as const satisfies readonly (keyof XSetupOptions)[]`, so dropping
a field from the interface breaks the list.

Each spec also builds the setup call from a typed object instead of a hand-written literal:

```ts
function setupCall(options: EdgeSetupOptions = {}): string {
  return `EdgeTestServer.setup(${JSON.stringify(options)})`;
}
```

Both halves are covered by a test that feeds the old wrong option in and expects the throw.

### 4. `basePath` on the edge fixture: removed, not honoured

`createVercelHandler` has **no** `basePath` option. Unlike the cloudflare handler, which strips a URL
prefix before routing, vercel's own routing hands the function an already stripped path. So the edge
fixture could not honour `basePath`, and accepting one could only lie: the field is gone. The
cloudflare fixture keeps it, with a one-line note on what it does.

## Evidence

- `pnpm --filter @mionjs/platform-vercel test` — 28 passed.
- `pnpm exec vitest run --project platform-cloudflare` — 31 passed.
- `pnpm run test:ci` — all 7 batches green.
- `pnpm run lint` and `pnpm run format` clean.
- Negative check on both new mutate tests: switching the block to `'clone'` fails them.

## Out of scope

The sweep also turned up a pre-existing, unrelated failure in the sibling
`cloudflareStorage.workers.spec.ts`, which cannot boot workerd when vitest runs from the package
directory. It was delegated to its own session, branch and PR rather than folded in here.
