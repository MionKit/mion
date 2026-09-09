---
type: fix
spec: guidelines
status: ready
created: 2026-09-09
---

# A binary route silently drops every middleFn in its chain that has no binary pair

## Intent

On a route whose encoder is `binary`, any middleFn in its chain that does not itself compile the
binary pair has its params and its result **dropped from the wire entirely**. Not encoded as JSON
alongside, not an error: absent. The caller sees `undefined` and nothing says why.

The body writer skips any method whose `toBinary` is missing:

```ts
// packages/core/src/binary/bodySerializer.ts:153
const toBinary = isResponse ? method.returnJitFns.binary?.toBinary : method.paramsJitFns.binary?.toBinary;
if (!willSerialize(method, value, toBinary, isResponse)) continue;

// packages/core/src/binary/bodySerializer.ts:364, inside willSerialize
if (!toBinary?.fn || toBinary.isNoop) return false;
```

The only signal is a one-time `console.warn` from `ensureBinaryJitFns`
(`packages/router/src/lib/reflection.ts:154`).

This became the default with the per-route encoder change (`68d98bd feat(router)!: per-route encoder
strategies`). Before it, every method compiled every encoding, so any middleFn could ride a binary
body. Now the pair is opt-in per method, so **the default for every middleFn is no binary pair**, and
a binary route with ordinary middleFns loses their data. It is easy to hit and gives no error.

Found while getting the pre-publish e2e consumer lane green: its `binarySession` middleFn returned
`undefined` on every binary route until the fixture declared `encoder: 'binary'` on the middleFn
itself.

## Direction

The implementer plans the fix. What was checked:

- **The design already intends the chain to be upgraded, and cannot deliver it.** The router
  collects every middleFn sitting in a binary route's chain and calls a function whose name and
  comment promise compilation:

  ```ts
  // packages/router/src/router.ts:205
  if (binaryMiddlewares.size > 0) compileBinaryForMiddleware(binaryMiddlewares);
  ```

  `compileBinaryForMiddleware` (`packages/router/src/router.ts:522`) only calls
  `ensureBinaryJitFns`, which checks presence and warns. It compiles nothing, and cannot: the pair
  is compiled at BUILD time from the encoder literal, long before the router sees a chain. So the
  chain knowledge exists in the wrong place. Whatever the fix is, it probably has to reach the build
  (`@mionjs/devtools` + the Go resolver), not the router.

- **A workaround exists today**: `encoder: 'binary'` router-wide. Resolution is route option, then
  router option, then the built-in default (`resolveEncoder`, `packages/core/src/encoder.ts:41`), and
  it applies to middleFns as much as routes. The warning already names it. It costs the binary pair
  on every method in the router, which is roughly the pre-change behaviour scoped to one router.

- **The internal mion methods pin their own encoder on purpose** (the metadata middleFn answers
  JSON), and `compileBinaryForMiddleware` already skips them. Any fix must keep that carve-out.

Options worth weighing, in rough order of how loud each is. **The choice is deliberately left to the
maintainer**, and more than one may apply:

| Option | What it buys | What it costs |
| --- | --- | --- |
| Make it an error, not a warning | Refuses to start a router whose binary route has a chain member with no pair. Silent data loss becomes impossible. | Breaks existing apps that are quietly lossy today; needs a documented migration. |
| Upgrade the chain at build time | The thing `compileBinaryForMiddleware` already promises. A middleFn in a binary route's chain compiles the pair without the author asking. | The build must derive the chain, which the router currently derives at registration. |
| Compile the pair for every method when any route is binary | Simple, no chain analysis. | Pays the pair on methods that never need it, in bundle size and build time. |
| Always compile the pair | The old behaviour, no surprises at all. | The cost the per-route change was made to avoid, on every project. |

A type that genuinely cannot be binary-serialized has to stay a warning under any option: the JSON
pair riding instead is the documented behaviour there, and that case must not become a hard failure.

## Done when

- A binary route can no longer lose a middleFn's params or result without saying so: either the
  chain compiles what it needs, or startup refuses and names the method.
- The case where a type genuinely cannot ride binary is still a warning, never a hard failure.
- `compileBinaryForMiddleware` either does what its name says or stops claiming to.
- A test pins a binary route with a default middleFn end to end, so the silent drop cannot come back.
- The website's serialization docs say what a middleFn needs in order to ride a binary body.
