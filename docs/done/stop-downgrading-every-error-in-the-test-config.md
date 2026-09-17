---
type: feature
spec: guidelines
status: done
created: 2026-09-16
---

# The test config downgrades every error, so a real one reads as a warning

## Intent

Three run-types vitest projects turn every RuntimeError into a warning with a wildcard:

- `packages/run-types/vitest.config.ts:58`
- `packages/run-types/vitest.converted.config.ts:36`
- `packages/run-types/test/mock-format-isolation/vitest.config.ts:34`

The comment on the first explains why: the suites deliberately contain Error-severity types (the
alwaysThrow cases pin the runtime throw for symbol and function roots), "45 such call sites across
15 suite files, too many codes to name, which is what the wildcard is for".

The cost is that a genuine error in a test is indistinguishable from an expected one. That already
bit us: `CTA001` fired on nine call sites passing a non-literal encoder strategy, every one of them
silently compiling the default instead of the strategy it named, two of them security tests. The
compiler was right each time and nobody could see it. Those nine are fixed; the next one hides the
same way.

## Direction

Replace the wildcard in the three configs, and prefer a source-level directive over build policy.
A directive is applied at the resolver's dispatch choke point, so it settles the finding for every
consumer at once (bundler build, `mion compile`, editor squiggles), while `downgradeErrors` is
build policy applied only by whoever decides to halt.

The suites need a directive that does not yet exist. There are two different jobs:

- **Remove the finding**: `@mion-expect-error`, which exists today.
- **Keep the finding, stop it halting**: nothing today. This is what the alwaysThrow suites
  actually want, because the finding is TRUE and worth seeing in the report; only the halt is
  unwanted. Suppressing it instead would hide a correct statement about the code.

So the first part of the job is likely a new `@mion-downgrade-error` directive: same line-above
placement, same optional code list, but it lowers the finding to a warning rather than deleting it.

Model it on the existing directive, whose self-checks are the reason it is safer than a config
list. Mirror each one, with its own codes:

- Nothing to downgrade on the line below (mirrors the unused-directive check).
- The finding named is already a warning, so the directive does nothing.
- The code named does not exist in the catalog, almost always a typo.
- The code named is `LevelError`, which the level table declares never downgradeable and never
  silenceable, so the directive must refuse it rather than appear to work.

Follow the existing precedent for the level of these new codes: they are warnings, because what the
build emitted is correct and the only thing wrong is a comment.

Then work the three configs. At each place the build refuses once the wildcard is gone, decide
which it is:

- Expected, finding worth keeping visible, with a call site to point at: `@mion-downgrade-error`.
- Expected and genuinely noise at that site: `@mion-expect-error`.
- Expected but with no single call site to annotate (a whole-program or generated finding): name
  its code in an explicit `downgradeErrors` list, with a comment saying which suite needs it.
- Not expected: a real finding. Fix it, and check whether the test around it was asserting what it
  claimed, the way the `CTA001` ones were not.

The implementer plans the details. Two things worth knowing before starting. The claim that there
are too many codes to name is worth re-testing: a full run stands down 32 distinct codes, and most
are the same alwaysThrow finding repeated across the six serializer families. And the library's own
source carries three `CTA001` findings where a `CompTimeArgs` parameter is forwarded to another one
(the pure-fn registration path and the `optional` field builder); decide whether those are a false
positive worth narrowing in the resolver or a shape worth changing, rather than assuming they must
stay downgraded forever.

## The 32 codes a full run currently stands down

Measured with `pnpm run test:ci`, counting only findings printed as `(downgraded)`. A starting
worklist, not a verdict: most are deliberate, a few are the interesting ones.

The serializer families, almost certainly the deliberate alwaysThrow and non-serializable cases:

```
PJ001  PJ002  PJ003  PJ005
PJS001 PJS002 PJS003 PJS005
SJ001  SJ002  SJ003  SJ005
RJ001  RJ002  RJ003  RJ005
TB001  TB002  TB003  TB006
FB001  FB002  FB003  FB006
```

The rest, each worth its own look:

```
CES001   cloneExactShape refuses a union with object members
VL001 VL002 VE002   validator root-position refusals
CTA001   CompTimeArgs argument not a literal   <- the one that hid the strategy fallbacks
CTA003   CompTimeArgs literal has a forbidden construct
PFN001   PureFunction argument not an inline function
FMT006   format finding, single occurrence
```

## Done when

No `downgradeErrors: '*'` remains in the three run-types test configs; every finding that survives
is either annotated at its call site or named in an explicit list with a reason; anything that
turned out to be a real problem is fixed rather than stood down; and a non-literal `CompTimeArgs`
argument in a test halts the run instead of printing a warning. If the new directive ships, a
directive that names a missing finding, an already-warning finding, an unknown code or a
`LevelError` code reports itself.

## What shipped (2026-09-17)

Three commits, in this order, because the second measurement changed the shape of the third.

### 1. The count above was wrong, and the reason was a bug

The 32 codes were right; "45 such call sites across 15 suite files" was not. A run with the
wildcard removed reported **7464 findings across 1517 lines in 85 files**. Almost all of it was
mis-attribution, found by probing one finding at a time:

- **Depth.** The 28 root-position codes are registered `ScopeRoot`, whose own comment says the
  same trigger inside a property is a different, child-position code. But provenance is inherited
  down the type graph (so a member-level warning reaches the site that pulled the member in), and
  the root codes rode that inheritance onto every site that merely CONTAINED the type. One
  deliberate `createJsonEncoderFn<never>()` therefore made 846 unrelated call sites report that
  the JSON encoder they never asked for always fails.
- **Family.** Provenance was keyed by type id with no family, so a finding raised while rendering
  one family's entry reached every site that named the type. Only 19 of 333 `CES001` reports were
  actually clone sites; the rest were JSON, validate, binary and mock sites hearing a clone
  finding. A `createJsonEncoderFn` site reported `VL002`, and a validate site reported all six
  serializer root codes.
- The alwaysThrow runtime message took `provenance[0]`, so it could name a random unrelated file.

Provenance is now keyed per rendered entry (type id + family tag) and kept in two maps: a
`ScopeRoot` code reports at the sites that NAMED the type, every other scope keeps the inherited
sites. Covered by `provenance_scope_test.go`, including the "one level deeper" and "one family
over" twins and a paired `getRunTypeId` shape test. That took the tree from 7464 findings to
**205 across 200 lines**, which is the order the original estimate was reaching for.

### 2. The `@mion-downgrade-error` directive

Built as the todo described: same line-above placement and optional code list as
`@mion-expect-error`, but it KEEPS the finding and marks it `Downgraded` on the wire. Level and
severity stay whatever the catalog says, so the two consumers that decide whether to halt (the
bundler plugin and `mion compile`) read that flag alongside their own `downgradeErrors` setting
and print the same `(downgraded)` note. Four self-checks, all `LevelWarning`: `DWN001` lowered
nothing, `DWN002` names a code the level table never lowers, `DWN003` a typo, `DWN004` a code
already a warning. New lint rule `runtypes/invalid-downgrade-error`.

One thing the todo did not anticipate: lint rule severity comes from config, not per finding, so
a downgraded finding keeps its rule and stays visible in the editor. That is the intended
outcome, so nothing was changed there.

### 3. The three configs

- `packages/run-types/vitest.config.ts` and `test/mock-format-isolation/vitest.config.ts` name
  **nothing at all** now. All 200 findings say so in their own source: 185
  `@mion-downgrade-error` where the finding is true and worth reading (the alwaysThrow suites,
  the no-plugin pure-fn lanes, the shared-format-entry case), 15 `@mion-expect-error` where it is
  noise (a runtime lookup whose key comes from a helper call; the library's own three forwards in
  `pureFn.ts`, `entryTuple.ts` and `compose.ts`).
- `vitest.converted.config.ts` keeps `['CES001']`, the one generated finding. `mion convert`
  copies the comments along with the source, so the directives carry over, but four
  `cloning/Unions.ts` cases write their union across several lines and convert collapses the whole
  type argument onto one, dropping the comment that was inside it.

**The library's own CTA findings were annotated, not narrowed in the resolver.** All four are
library-internal runtime lookups or forwards, so there is no build-time dependency to track and
the finding is noise at those sites. Keeping `CTA001` sharp everywhere is what makes the
headline check work.

### Verified

`error CTA001` on a non-literal `CompTimeArgs` argument halts the run again (probed with a `let`
binding in a suite file). No `EXP`/`DWN` self-check noise anywhere, so every directive is doing
its job. The converted lane passes 7586 tests.

### Left for a parallel session

`CTA003` fires on the documented `registerFormatPattern` value spelling, which works: the scanner
recovers the pattern from the declared type, not the value, and the suite's 38 tests pass while
the build says the argument cannot be read. It is `LevelRuntimeError`, so a consumer using the
documented form gets a halted build for correct code. It predates this branch (the wildcard hid
it) and sits in the CompTimeArgs const-tracer, a different subsystem from the attribution fix, so
it went to a background session with its own branch and PR, to merge before this one. The site
carries `@mion-expect-error CTA003` until then, and that fix deletes the comment.
