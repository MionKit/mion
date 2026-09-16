---
type: chore
spec: guidelines
status: ready
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
