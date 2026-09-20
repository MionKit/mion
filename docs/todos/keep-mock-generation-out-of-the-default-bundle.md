---
type: fix
spec: guidelines
status: ready
created: 2026-09-20
---

# Keep mock generation out of a default client bundle

## Intent

A browser client that only calls routes ships mock data generation. Measured on a real build of
`@mionjs/client` plus one route call, resolved from the published dist: 114.5 kB minified, 31.4 kB
gzipped, of which `@mionjs/run-types` is 77.5 kB. Inside that:

```
 8.2 kB  run-types/dist/mocking/mockDateTimeBounds.js
 8.0 kB  run-types/dist/mocking/mockStringFormat.js
10.0 kB  run-types/dist/formats/string/string-patterns.js
```

Mock generation is a development feature. It should never be in a default bundle, and where it is
wanted it should load on demand rather than sit in the main chunk.

## Direction

The implementer plans the details. These are the pointers and the one constraint, all verified.

- **The cause** is bare side-effect imports in `packages/run-types/src/formats/index.ts`, which no
  bundler can drop:
  ```ts
  import '../mocking/mockStringFormat.ts';
  import '../mocking/mockNumberFormat.ts';
  import '../mocking/mockBigIntFormat.ts';
  ```
- **One import pulls roughly 16 kB.** `mockDateTimeBounds` is not imported there; it rides in behind
  `mockStringFormat`, which imports `mockBoundedDate`, `mockBoundedTime` and `mockBoundedDateTime`
  from it.
- **The constraint a fix must keep**, stated in that file's own comment: those imports run first so
  pure-fn registration is ordered before any format module reaches a pure fn at runtime. Deleting
  them trades bundle size for a load-order bug, so the ordering needs another home.
- **The split to aim for: separate entry points.** The packages already use subpaths for this kind
  of separation, and `@mionjs/run-types` has five (`.`, `./builders`, `./formats`,
  `./formats/temporal`, `./schema`). None is a mock entry, and the main entry exports no mock names,
  so mocking has no home of its own today. Giving it one, so only a consumer who asks for mocking
  pulls it, is the obvious shape. A subpath alone is not enough, though: `./formats` has to stop
  importing the mock modules for their side effect, which is where the ordering question comes back.
  The same question applies to any other package that mixes development-only code with runtime code.
- **Pure functions are already mostly handled**, so that half of the problem is smaller than it
  looks. The published dist is hollowed (`string-formats-pure-fns.js` goes from 28.7 kB of source to
  2.2 kB) and bodies are served to the compiler on demand. What still ships whole is
  `string-patterns.js` at 10.0 kB, the regex table for every built-in string format, pulled in by
  `stringFormats.ts` whether or not an app uses a format. Worth settling whether it is needed at
  runtime at all, and if it is, whether a client needs the patterns for formats its routes never
  name.

## Docs

Docs: none, unless the fix adds a subpath or an option a consumer sets. If it does, the change lands
on the client bundling page under `container/website/content/01.rpc/03.client/`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page
and example this change touched, review its report against the code, and commit it as its own
commit.

## Done when

- A default client build contains no mock generation, and a build test proves it rather than a
  reading of the source.
- Mock generation is reachable only through an entry a consumer opts into, never from the default
  one.
- Mocking still works wherever it is used today.
- Pure-fn registration order is still guaranteed, by something other than an unshakeable import.
- The simplify-comments pass ran on every touched source file, committed on its own.
