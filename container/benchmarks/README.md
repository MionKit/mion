# Validation benchmarks — per-competitor isolated builds (podman)

Compares **RunTypes** validators against **zod**, **typebox**, **ajv**
and **typia**, over the **full** `validation` + `format-validation` + `realworld`
suites (263 cases — the exact cases the package tests itself with, plus a
real-world DTO group). All heavy tooling (the validator libraries, vite, typia's
tsgo transform) lives **only inside a podman image** — the host never installs it.

## Architecture — every competitor is its own isolated build

Each competitor is a **standalone pnpm project**: its own `package.json` (under
[`_deps/competitors/<name>/`](_deps/competitors/)) → its own `node_modules`, with
its source under [`competitors/<name>/`](competitors/), its own build and its own
`dist/run.mjs`, run as its own process
writing [`results/<name>.json`](results/). [`aggregate.mjs`](aggregate.mjs) then
joins those per-competitor results by case key into one comparison table.

```
competitors/<name>/  cases.ts ── (the validators) ─┐
shared/cases/    ────  the 263 cases (samples + metadata, ZERO library deps)
shared/harness/  ────  runCompetitor() + writeResult()  ──> results/<name>.json
                                                             aggregate.mjs ──> table
```

This isolation is the whole point:

- **One competitor can never break another.** typia's heavier / more fragile
  tree (its tsgo transform: `ttsc` + `@ttsc/unplugin` + `@typescript/native-preview`)
  installs into *its own* `node_modules`; a fresh, supply-chain-blocked, or broken
  dep there can't abort zod/typebox/ajv/ts-go. Each competitor installs in its own
  `Containerfile` layer with its own pnpm store cache.
- **RunTypes is just another competitor.** Its `cases.ts` is a
  `CompetitorCases` map like everyone else's; the runner has no ts-go branch. The
  only thing special about it is *build* mechanics — its validators are generated
  at build time by `@mionjs/devtools` spawning the **Go binary**, so that
  binary + the first-party packages are bind-mounted into its `node_modules` at run
  time (see [`scripts/website/bench-data/bench.mjs`](../scripts/website/bench-data/bench.mjs) `mount_args`).

## Totality — a validator **or** an explicit not-supported, for every case

The shared cases (`shared/cases`) carry only **samples + metadata** — no library
imports. Each competitor's [`cases.ts`](competitors/zod/cases.ts) is a **total**
`Record<CaseKey, CaseEntry>`: every case key maps either to a lazy validator
builder `() => (v) => boolean` **or** to the `NOT_SUPPORTED` sentinel. The
`CaseKey` union is derived from the suite objects
([`shared/cases/index.ts`](shared/cases/index.ts)), so a competitor that omits a
case does not compile — that is the "function or explicit not-supported, for
every case" guarantee.

**That guarantee is enforced by `pnpm rtx bench typecheck`, not by the type
annotation on its own.** The competitor builds are `vite build` / esbuild, which
strip types without checking them, so for a long time nothing ever compiled these
files and a dropped key was a silently absent column rather than an error (it
happened: the whole `CIRCULAR_REFS` group went missing from
`competitors/mion/schemaCases.ts`). The verb runs each competitor's
`tsconfig.json` through the compiler in its own baked `node_modules` inside the
image, and CI runs it on every PR that touches `container/**` or `scripts/**`.
`shared/` is checked along with them: every competitor project `include`s
`../../shared`. If you add a first-party file to a competitor dir, add it to that
project's `include` too — the gate only covers what the project compiles.

The runner ([`shared/harness/runner.ts`](shared/harness/runner.ts)) builds each
validator, then checks correctness against the case's valid/invalid samples and
measures throughput. A builder that **throws** is a hard `errored` (a broken
plugin rewrite for ts-go, a broken schema for the rest) — surfaced loudly, never
hidden as not-supported.

Typical coverage (validations/sec; the gap widens on complex objects):

```
case                  mion       zod    typebox      ajv      typia
simple_interface              107M/s     646k/s     93M/s        —          —
nested_object                  78M/s     481k/s     69M/s        —          —
user (realworld)               63M/s     337k/s     50M/s     24M/s      68M/s

Coverage (of 263):
  mion   ok=260   not-supported=3
  zod               ok=118   not-supported=145
  typebox           ok=96    not-supported=167
  ajv               ok=67    not-supported=196
  typia             ok=40    not-supported=223
```

Why the competitors are not-supported on so many: JSON Schema (ajv) has no
`bigint`, can't reject `NaN`/`Infinity`, can't validate `Date`/`Map`/`Set`/`Temporal`;
TypeBox can't express bigint literals or `RegExp`; zod has no compile-time type
recovery for many TS-only constructs; typia's runtime semantics diverge on a
handful of shapes (see below). RunTypes is not-supported only on the three
cases that are intrinsically un-validatable (bare `symbol` at a root, etc.).

## typia — wired via the tsgo transform

typia, like RunTypes, derives validators from TypeScript **types** at
build time, so it is the most apt comparison. This project runs on tsgo
(typescript-go / `@typescript/native-preview`), and typia's tsgo path is the
`samchon/ttsc` toolchain — typia ships a **Go-native transform** that plugs into
`ttsc`. (The older `@ryoppippi/unplugin-typia` is archived and has no tsgo
support.) Because bundlers bypass the `ttsc` CLI, the typia competitor drives the
same transform through `@ttsc/unplugin`'s esbuild adapter and bundles to one
`dist/run.mjs` — see [`competitors/typia/esbuild.config.mjs`](competitors/typia/esbuild.config.mjs)
(it also documents the one esbuild quirk it works around: stripping typia's
`: input is T =>` return-predicate annotations before esbuild parses).

The first build compiles typia's native plugin once (~200s, "once per cache key")
via ttsc's own embedded Go toolchain. Since the image is deps-only (no source at
build time), this compile happens on the **first run that includes typia** rather
than at image build, writing into a persisted named volume (`competitors/typia/node_modules/.ttsc`)
so every later run reuses it; `pnpm rtx bench clean` drops the volume.

typia entries copy the per-case literal `T` verbatim from the ts-go competitor
(the type must be written at the `createIs<T>()` call site, like ts-go's
`createValidateFn<T>()`). A case is supported only when typia can express the type
**and** its runtime semantics match the shared samples; the divergences that force
`NOT_SUPPORTED` are documented inline in
[`competitors/typia/cases.ts`](competitors/typia/cases.ts) — e.g. `createIs<number>()`
accepts `NaN`/`Infinity`, `Date` is an `instanceof` check, and a string index
signature accepts an explicit-`undefined` property value (`{a: undefined}`).

## What runs where

The image is **deps-only**: it bakes per-competitor `node_modules` (from the
manifests in [`_deps/`](_deps/)) and nothing first-party. ALL benchmark source —
the shared suite, every competitor's source files, `typecost/`, `aggregate.mjs` —
is bind-mounted at run time (`scripts/website/bench-data/bench.mjs:mount_args`), so an image is
invalidated only when a dependency manifest changes.

| Inside the image (deps only)                           | Bind-mounted from the repo at run time                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| zod · @sinclair/typebox · ajv · typia · vite · esbuild | every competitor's source files + `shared/` + `typecost/` source |
| each competitor's `node_modules` + `package.json`      | `bin/mion` + `packages/*` (ts-go competitor only) |
| typia's `.ttsc` compile cache → a persisted named volume | writable `results/` (so each `<name>.json` survives `--rm`) |

## Usage

From the repo root:

```bash
pnpm rtx bench prep            # build the Go binaries (host + Linux cross) + first-party JS packages on the host (one-time)
pnpm rtx bench                 # build + validate + throughput for EVERY competitor + aggregate
pnpm rtx bench --one zod         # the same for a SINGLE competitor (fastest verification loop)
pnpm rtx bench typecost        # compile-time: per-competitor TS type-instantiation cost
pnpm rtx bench serialization   # mion round-trip serialization bench (+ formats), IN-CONTAINER
pnpm rtx bench --website         # ONE command: ALL website benchmark data (validation + typecost + serialization)
pnpm rtx bench smoke           # quick: build every competitor's dist (no run)
pnpm rtx bench typecheck       # quickest: compile every competitor project (the totality gate; also what CI runs)
# --- image publishing (maintainer); all delegate to scripts/container/image.mjs ---
pnpm rtx container build-image     # build the shared website+benchmark image locally
pnpm rtx container login           # log in to GHCR (needs a PAT; see SETUP.md)
pnpm rtx container push            # build + push the multi-arch image to GHCR
pnpm rtx container pull            # pull the published image and tag it locally
```

The benchmarks run in the **single shared image** built from
[`container/website/Containerfile`](../website/Containerfile) (`FROM node:26-bookworm`): the
website deps live at `/app`, the benchmark deps at `/bench` (`/bench/competitors/<name>`
+ `/bench/typecost`), each its own isolated pnpm project. `scripts/container/image.mjs` owns
the image (build/push/pull) and `scripts/website/bench-data/bench.mjs` delegates to it, then runs
the bench half under `/bench`. Node 26 unflags the global `Temporal` API, so every
timing runs on native Temporal, the same runtime the published library targets, with
**no `temporal-polyfill`**. Override the base with `MION_WEBSITE_BASE_IMAGE` (or
`MION_VALIDATION_BENCH_BASE_IMAGE`, forwarded to the build).

**`bench:serialization`** runs the mion-only round-trip bench
([`scripts/website/bench-data/gen-serialization.mjs`](../scripts/website/bench-data/gen-serialization.mjs))
**inside** the Node 26 container — previously it ran on the host (wrong Node /
polyfilled Temporal). It reuses the mion competitor context (baked vite +
the bind-mounted marker package, plugin and Go binary) plus a bind-mounted Linux
build of the source-body extractor (`bin/extract-fn-bodies-linux-<arch>`, so no Go
toolchain is needed in-container), and writes `serialization` +
`serialization-formats` straight into `container/website/public/bench-data`.

Two things this stage needs that the other lanes don't, because it loads the
**marker package's own test program** rather than a competitor project:

- **The repo-root tsconfig is mounted too.** The marker package is bound at
  `<competitor>/node_modules/@mionjs/run-types` — a segment deeper than
  `packages/run-types` sits in the repo — while its `tsconfig.json` extends the
  repo-root one, so `../../tsconfig.json` lands on `node_modules/` and finds
  nothing. `bench.mjs` mounts the real root config at that path (not a copy, so
  it can't drift), and the suite compiles under exactly the options it does on
  the host. If the `extends` chain ever grows a link, that mount stops being
  enough — the contract test walks the chain and says so.
- **`failOnError: false`.** `buildStart` scans everything the tsconfig includes,
  alwaysThrow suites included, and those deliberately hold Error-severity types.
  Same opt-out, same reason, as `packages/run-types/vitest.config.ts`.

Both are pinned by `packages/devtools/test/repo-contracts.test.ts`;
each broke a website deploy after landing green in every other lane.

**`bench:website`** is the single command that regenerates **all** benchmark data
the docs site renders — runtime validation + typecost + `capture-env` +
serialization (+ formats), every measurement taken inside the Node 26 container,
then the `gen-bench-docs` host transform. (Suite-doc panels — schema / generated
code — are a separate `pnpm rtx website build`.)

The run commands **pull the latest published `ghcr.io/mionkit/tsrt-website:latest`
(the shared image) by default** (cheap no-op when current), falling back to a local
build when the registry is unreachable. Set `MION_VALIDATION_BENCH_USE_LOCAL=1` to build/use a local image
(offline, or to test a dep bump before pushing). typia's native plugin is
pre-compiled into `node_modules/.ttsc` at image build time (baked into the image),
so the bench build reuses it with no ~200s runtime compile.

`bench` runs each competitor in its **own `--rm` container** (strongest
isolation), then `aggregate.mjs` prints the table + coverage. It exits non-zero if
any competitor has a `fail`/`errored` case, so the run doubles as a cross-library
conformance test. Each run also **publishes** the per-competitor JSON into the
canonical `<repo>/.docdata/container/benchmarks/` dir, which the docs website mounts
read-only (`MION_DOCDATA`) to build benchmark docs from. Env knobs: `MION_VALIDATION_BENCH_NO_TIMING=1` (correctness only, fast),
`MION_VALIDATION_BENCH_TIME_MS=100` (per-cell window). typia runs **by default** now that each
competitor installs in isolation; a failed typia build degrades gracefully (its
column is left blank that run). Set `MION_VALIDATION_BENCH_NO_TYPIA=1` to skip it on a host where
its native plugin won't build.

## Type-checking cost (`bench:typecost`)

A second, orthogonal axis: how expensive each form is for the **TypeScript
compiler** to type-check. Every schema library that recovers a static type
(`Static<typeof schema>` / `z.infer<typeof schema>`) makes the checker *evaluate*
that type at every use site; a plain `type T = …` definition is essentially free.

[`typecost/typecost.mjs`](typecost/typecost.mjs) assembles, per case, a tiny
self-contained `.ts` probe per **form**, compiles each in isolation through the
TypeScript compiler API, and reads `program.getInstantiationCount()`
(baseline-subtracted, so the number is the marginal cost for that case). Each
probe **assigns a real value** — `const x: <type> = <the case's first valid
sample>` — so TypeScript fully resolves the type **and** structurally checks the
value against it (the cost you pay on every `const x: T = {…}`). Forms, extracted
per-competitor from each competitor's own files:

- **ts-go (type)** — `competitors/mion/cases.ts` `createValidateFn<TYPE>()` type arg.
- **typia** — `competitors/typia/cases.ts` `typia.createIs<TYPE>()` type arg (format suites use typia tag intersections, e.g. `string & tags.MaxLength<5>`).
- **ts-go (builder)** — `competitors/mion/schemaCases.ts` `createValidateFn(EXPR)` arg.
- **zod / typebox** — `competitors/<name>/cases.ts` schema expressions.
- **ajv** — none (JSON Schema has no static type inference).

ts-go(type) and typia are both **pure-type** forms — the cost is just resolving
the literal `T` the developer writes (no schema object, no runtime transform
involved in type-checking). They diverge only where typia expresses a constraint
as a tag intersection rather than a `Format*` brand, and over the differing
subset of cases each supports.

```
ts-go(type)      ~4 instantiations/case     # writing the type is ~free
typebox        ~219 /case
ts-go(builder) ~546 /case
zod            ~619 /case
```
(apples-to-apples averages over the cases all forms support; run `bench:typecost`
for the live typia column.)

i.e. the type-definition form is ~55–155× cheaper for `tsc` to resolve than any
schema→type form — including ts-go's own value-first schema form. Adding a
competitor automatically extends typecost; it is a separate command, never gating
the runtime benches.

**Value forcing vs. broader accepted sets.** A few forms intentionally accept a
wider value set than their *static* type — ts-go's `noLiterals` option (the type
stays the literal `2`, but any number validates) and the serializable-only
validate contract (a function/method member is dropped, so the data sample omits
it). For those the chosen sample need not satisfy `T`, so the probe falls back to
**declare-only** (`let x!: T`) and measures pure type-resolution cost. A genuine
type error (a name the type can't resolve, an excessively-deep instantiation —
e.g. typebox on a circular tuple) still fails and reports `err`, excluded from
totals; the full `err` detail (case · form · first TS message) prints after the
table.

**Inspection knobs.** `MION_VALIDATION_BENCH_CASE=<substr>` restricts **both** the runtime bench
and typecost to cases whose dotted key contains the (case-insensitive) substring —
run **one case across every library** to compare/diagnose it. A filtered run prints
to the console and does **not** rewrite the results JSON (nor aggregate or publish
to `.docdata`), so a per-case iteration loop never clobbers the published full-suite
results. `MION_VALIDATION_BENCH_DUMP=<exact.key>` is typecost-only: it prints the assembled probe
sources for one case and exits. All are forwarded into the container:

```bash
MION_VALIDATION_BENCH_CASE=atomic_union pnpm bench           # runtime throughput, every competitor, one case
MION_VALIDATION_BENCH_CASE=atomic_union pnpm bench:typecost  # type-instantiation cost, every form, one case
MION_VALIDATION_BENCH_DUMP=UNION.atomic_union pnpm bench:typecost
```

After a filtered iteration loop, run the **full** `pnpm bench` / `pnpm
bench:typecost` (no `MION_VALIDATION_BENCH_CASE`) once to refresh the canonical results JSON.

## Compile-time cost (`bench:compiletime`)

A third axis: the build-time cost of the two transform-based libraries — **mion**
and **typia** — measured on **tsgo** (the Go TypeScript both transform on), over the
**whole suite as one file** (one build, not per case), in three tiers:

- **strip** — `tsgo` transpile only, types stripped, NO type-checking. The floor.
- **typecheck** — `tsgo --noEmit`, a full type-check, no transform. A "normal" compile
  that produces no validators.
- **full** — type-check + transform + emit the generated validators:
  - typia — `ttsc` (tsgo + the typia transform, emitting the inlined validators).
  - mion — `vite` + the `@mionjs/devtools` plugin (the Go resolver, itself
    tsgo, generates the validators; the bundler emits them). RT's transform is not a
    tsgo plugin, so this is its real build path rather than a `tsgo` CLI call.

The deltas read the story: **typecheck − strip** = the cost of type-checking;
**full − typecheck** = the cost of the transform + emitting the functions.

[`compiletime/compiletime.mjs`](compiletime/compiletime.mjs) reuses the typecost AST
extractors ([`_lib/extract-cases.mjs`](_lib/extract-cases.mjs) — one source of truth)
to assemble every supported call site into one file (each case in its own block), then
spawns `tsgo`/`ttsc` (or runs vite) per tier. A warm-up build runs first so the cold
process-start — and typia's one-time ~200s `ttsc` plugin compile, cached in the `.ttsc`
volume — never lands in a measured tier; each number is the **median of N** (default 5).

```bash
pnpm rtx bench compiletime                              # mion + typia, three tiers
MION_COMPILETIME_COMPETITORS="mion" pnpm rtx bench compiletime   # one library
MION_COMPILETIME_N=10 pnpm rtx bench compiletime             # more repeats
```

Results land in `results/{mion,typia}.compiletime.json` (`strip_ms`,
`typecheck_ms`, `full_ms`, `types`) and join the website as a per-library breakdown (the
two libraries as columns; the three tiers plus the two derived costs as rows) via
`gen-docs.mjs` → `bench-data/compiletime/`, on the **Compile Time** page (shared
with the `typecost` type-checking table).

> **What the numbers show.** tsgo type-checks the whole suite fast, so **typecheck −
> strip** is small; the meat is **full − typecheck**, the transform + emit. mion'
> full build (one resolver spawn + generate + bundle) and typia's `ttsc` are directly
> comparable, both on tsgo. mion needs `@typescript/native-preview` (tsgo) in its
> competitor deps for the strip/typecheck tiers; typia already ships it.

## Format-serialization (`serialization-formats`)

`bench:serialization` writes **two** datasets: the regular `serialization` round-trip
suite, and `serialization-formats` (the `format-serialization` suite). The format
dataset is the one that shows how a format constraint shrinks the **binary** payload:
an unconstrained `number` / `bigint` rides the wire as a fixed 8 bytes, but a
fixed-width (`int8`/`uint16`/…) or a `min`/`max`-bounded twin packs into the narrowest
width that fits (1, 2, 4 bytes). The bytes tier of the verdict table reads the delta
off directly. The suite already pairs each unconstrained number against its
constrained twin, so no new cases are needed.

## Layout

```
shared/
  cases/{validation,format-validation,realworld}/  the 263 cases (samples + metadata, no library deps)
  cases/index.ts                                    the CaseKey union (drives totality) + iterateCases()
  harness/{types,measure,runner,result}.ts          the generic, competitor-agnostic run loop
competitors/<name>/        (source only on the host — bind-mounted at run time)
  cases.ts          total Record<CaseKey, CaseEntry> — a builder or NOT_SUPPORTED per case
  main.ts           runCompetitor({name, cases}) → writeResult() → results/<name>.json
  tsconfig.json     extends ../../tsconfig.base.json
  vite.config.ts    per-competitor build (typia uses esbuild.config.mjs instead)
  (ts-go also: schemaCases.ts for the typecost schema column; setup.ts registers format patterns)
_deps/                     (package-manager files only — kept out of the source dirs so
  pnpm-workspace.yaml      no one can `pnpm install` at a competitor dir; COPYed into the image)
  .npmrc
  competitors/<name>/package.json   ONLY that competitor's deps (isolation)
  typecost/package.json
typecost/typecost.mjs   per-competitor type-instantiation cost
compiletime/compiletime.mjs  tsgo build cost: strip / typecheck / full, whole suite (mion, typia)
_lib/extract-cases.mjs  shared AST extractors (typecost + compiletime consume it)
aggregate.mjs           results/*.json → comparison table + coverage; sets the exit code
```

## Adding competitor coverage for a case

Edit the relevant `competitors/<name>/cases.ts`: change a `NOT_SUPPORTED` entry to
a builder `() => { const s = <schema>; return (v) => <validate>(v, s); }` (the
`CaseKey` union catches typo'd keys, and `pnpm rtx bench typecheck` is what
compiles it). Run `pnpm rtx bench --one
<name>` with `MION_VALIDATION_BENCH_NO_TIMING=1` and fix any reported mismatch — or downgrade it
back to `NOT_SUPPORTED` (with a one-line reason) when the library genuinely
diverges from RunTypes' semantics. To add a whole new competitor, copy a
`competitors/<name>/` source folder, add its `package.json` under
`_deps/competitors/<name>/`, write a total `cases.ts`, add a COPY+install layer
to [`Containerfile`](Containerfile), and add it to `competitor_list()` in
`scripts/website/bench-data/bench.mjs`.

## Cross-library validation alignment audit

The benchmark stays green by design: a competitor can hide a value it treats
differently behind a `SampleOverride`, or opt out with `NOT_SUPPORTED`. The
alignment audit looks behind both, running each competitor's real validator
against the SHARED samples (never its override) to surface and explain every
cross-library divergence. It is analysis only and changes no case file.

```bash
pnpm rtx bench audit        # build + audit-run every competitor, then aggregate + classify
```

Tooling lives in [`_audit/`](_audit/); the committed write-up is
[`docs/cross-library-validation-alignment-report.md`](../../docs/cross-library-validation-alignment-report.md).
The audit also feeds the website's **Correctness** benchmark page (an `alignment` bench
in `scripts/website/bench-data/gen-docs.mjs`); `pnpm rtx bench --website` runs the audit so that page's
data regenerates with the rest.

## Behind a corporate / MITM proxy

The image build must trust the proxy CA to install deps over TLS. When
`MION_VALIDATION_BENCH_CA_CERT` is unset, the script auto-detects host CA certs in
`/usr/local/share/ca-certificates` and trusts them in the image; pass it
explicitly (file or dir) to override, and point the build at the proxy network:

```bash
MION_VALIDATION_BENCH_CA_CERT=/usr/local/share/ca-certificates \
MION_VALIDATION_BENCH_BUILD_NETWORK=host \
  pnpm rtx container build-image
```

The Go binary + first-party packages are built on the host by `bench:prep` and
mounted in, so the benchmark **run** itself needs no network.
```
