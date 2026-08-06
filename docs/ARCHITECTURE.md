# Architecture

TypeScript throws your types away before your code runs. RunTypes reads them first, at
build time, and writes out real JavaScript that does what the types imply: validators,
JSON and binary converters, mock data, and reflection.

Everything in this repo serves that one idea. This document is a map, not a manual. It
explains how the repo is laid out, what each part is responsible for, and the handful of
concepts you need before reading any code. For the deep details, follow the links at the
end.

## Three parts

The repo splits into three groups that barely overlap:

| Directory          | What it is                                                       |
| ------------------ | ---------------------------------------------------------------- |
| `ts-go-runtypes/`  | A Go program that reads TypeScript types. The only part that understands types. |
| `packages/`        | The JavaScript monorepo. The only part users install.            |
| `container/`       | Supporting apps (docs site, benchmarks, release tests) kept inside container images. |

The split is deliberate. Type knowledge lives in one place, the public surface in
another, and anything with heavy third party dependencies is walled off entirely.

## The main ideas

Six concepts explain most of the codebase.

**Build time, not run time.** Every generated function is written out ahead of time as
ordinary JavaScript. At run time there is no reflection, no schema walking, and no
first call penalty. The shipped runtime is small and generic; the specialised code is
generated.

**Markers.** The build does not scan for function names. Instead, a function opts in by
declaring one extra optional last parameter whose type is a special marker, for example
`InjectRunTypeId<T>`. The build recognises that parameter, works out what `T` is at each
call site, and fills the slot in. Because the marker travels on the function signature,
your own wrapper functions opt in the same way with no extra configuration. A marker only
counts if it is both named correctly and declared by the RunTypes package, so a
same named type of your own is inert.

**One type, one id.** Each type gets a short id derived from its shape, not its name.
Two types with the same shape get the same id and share one generated entry, so a
validator and a serializer built from the same type can never disagree about what it
means. Property order does not matter.

**Generated cache modules.** The output is a set of small generated JavaScript modules,
one per thing that was needed, each exporting a single compact array. The build rewrites
your call sites to import the matching module directly, so bundlers can split and
tree shake them like any other code.

**Only what you ask for.** Generation is driven by demand. A call site says exactly which
operations it needs for which type, and nothing else is produced. A file that only asks
for a type id generates no validator, no JSON converter, and no binary converter.

**Data only.** Validators and converters work on the JSON shaped projection of your type.
Members that cannot survive that trip (functions, symbols, promises) are dropped, and
decoders say so in their return type via `DataOnly<T>`. A dropped member in a harmless
position is a build **Warning**. A problem that would throw at run time is an **Error**
and fails the build.

## 1. The Go side (`ts-go-runtypes/`)

A single Go program. Its job is to answer one question well: at this exact call site,
what type is being asked about, and what code should be generated for it? It does not
type check your project and, in the normal path, it does not emit your JavaScript. Your
existing toolchain keeps doing both.

### Why Go

TypeScript's new compiler (`tsgo`, the Go rewrite) has no plugin or transformer API, and
it can no longer be patched from Node the way older type reflection libraries patched
`tsc`. The only way to ask the real type checker a question today is to talk to it in Go.
So this program links against the checker directly and asks it about types the same way
the compiler would, which means what we resolve as `T` is what TypeScript resolves.

### How it runs

The program has three subcommands:

- **`serve`** is the daemon mode, and the one the bundler plugin drives. It starts once,
  keeps the parsed project and the type checker in memory, and speaks one JSON message
  per line over standard input and output. The build tool spawns it, asks about each
  file, then shuts it down.
- **`compile`** is a one shot batch build for projects with no bundler plugin. It is the
  only mode that writes JavaScript, and it does so by handing the rewritten source back
  to TypeScript's own emitter and then stitching the source maps together.
- **`enrich`** serves the enrichment workflow described below: it scaffolds the hand
  edited files, re-syncs them when a type changes, and checks them. One shot, and off the
  build path.

`compile` and `enrich` are both code generation from the same source of truth, the type the
checker resolves. What separates them is who owns the result. `compile` emits the caches and
functions: machine output, gitignored, rewritten wholesale every time. `enrich` emits the
friendly text and mock data files: your output, committed, and regenerated by merging into
what you already wrote rather than replacing it. That is also why `enrich` carries the
verbs a generator normally would not, re-syncing an edited file, deleting parked leftovers,
and checking that nothing was left blank. Both take `--no-emit`, which turns either into a
report that writes nothing, the way `tsc --noEmit` does.

One check the Go program does not run itself: regex format patterns. A pattern's samples
exist to satisfy the JavaScript `RegExp` the emitted validator runs, and Go's RE2 engine
only approximates JS semantics (no lookarounds or backreferences, and divergent behavior
even on shared syntax), so the resolver drives a real JS engine instead. A small sidecar —
authored as the private `@ts-runtypes/go-be-sidecar` workspace package, bundled by vite,
committed at `internal/jsengine/sidecar.bundle.mjs`, and embedded into the binary via
`go:embed` — is spawned once per session under a host JavaScript runtime (`node` and
`bun` are found automatically; `--js-runtime` / `RT_JS_RUNTIME` pin any node-compatible
runtime, and the bundler plugin passes its own runtime automatically) and
answers pattern jobs over newline-delimited JSON with memoized verdicts. Two ops ride the
protocol: `validate` (pattern compile + sample checks) and `generate` — for a pattern that
declares no `mockSamples`, the sidecar draws `patternSampleCount` candidate values from
the regex (randexp under a seeded PRNG), keeps the ones the real compiled pattern and any
declared length bounds accept, and retries up to `patternSampleCount ×
patternSampleRetries` draws before the resolver fails the build with FMT005 (declare
mockSamples explicitly). The PRNG seed mixes the pattern content with a RUN KEY that
decides reproducibility: by default the key is random per build session (pools re-roll
every fresh build, stay stable across a session's rebuilds), and a literal
`{mock: {seed}}` written at a `createMockDataFn` call site pins it — the scanner reads
the seed through the lenient `CompTimeHints` marker on the options parameter (read when
literal, never validated, so dynamic bags stay legal), and every pattern node that site's
type graph reaches then generates the same pool on every machine and build. The resolver
injects the survivors into the emitted formatAnnotation post-intern, so typeIDs never
depend on any of this (the two count knobs are disk cache fingerprint inputs, since the
emitted content does depend on them; annotations themselves are never disk-cached).

The WASM build has no subprocess. When the host installs the synchronous
`__tsRunTypesJsEngine` hook (the sidecar bundle's IIFE twin, `dist/sidecar-hook.js` —
the website playground stages and loads it before instantiating the module), BOTH ops
route through it: request-line JSON in, response-line JSON out, the exact stdio contract,
so the playground generates the same deterministic samples a native build does. Without
the hook, validation falls back to the host's own `RegExp` and generation degrades to
FMT005 — never a crash. Projects with no patterns never need a JS runtime; with patterns
and no runtime, the build fails closed (FMT004). Under WASM and native alike, the engine
is the validation authority — there is no RE2 fallback.

Settings come from your `tsconfig.json` (a `ts-runtypes` entry under `plugins`), with
command line flags taking precedence, mirroring how `tsc` resolves its own options. The
on disk cache follows the `incremental` setting rather than adding a switch of its own.

### `internal/compiler/`: finding and rewriting call sites

- **`program`** boots the project: reads the `tsconfig.json`, builds the same view of your
  files TypeScript would, and can layer unsaved editor buffers on top.
- **`marker`** decides whether a parameter is one of the recognised markers, checking both
  the name and the package that declares it.
- **`builders`** recognises the value first builder calls (`RT.object({...})` and
  friends) by their return type, so they are never mistaken for something to rewrite.
- **`comptimeargs`** enforces that options which must be known at build time really are
  literal values, and reads those values out. It follows imported constants so a shared
  options preset works.
- **`resolver`** is the coordinator. It walks every call in a file, asks the type checker
  what each call resolves to, checks the parameters for markers, and turns each match into
  a record of what needs generating. It then drives the generators and assembles the
  result. Most build warnings and errors originate here.
- **`sourcerewrite`** performs the edit: it inserts the extra argument at each call site,
  adds one import block at the top, and produces a source map. It is a direct twin of the
  JavaScript version in the devtools package, so both produce identical bytes.
- **`entrymodules`** turns the collected results into the actual text of the generated
  modules, deciding naming, ordering, and which imports each one needs.
- **`batchcompile`** implements the `compile` subcommand on top of the above.

One detail worth knowing because it causes real bugs: the Go side counts text positions in
bytes, while JavaScript and source maps count in UTF-16 units. The conversion happens in
one place, and everything downstream stays in one unit.

### `internal/cachegen/`: deciding what code to write

This is the largest part of the Go program.

- **`runtype`** converts the type checker's view of a type into a plain, serialisable
  description, and gives it its short id. Because types can be circular and JSON cannot,
  repeated types become references by id.
- **`typefunctions`** is the code generator. For each supported operation it walks the
  type description and produces the JavaScript body. Operations include validation,
  validation errors, several JSON strategies, binary encode and decode, unknown key
  checks, exact shape cloning, and format transforms. Each operation is one plug in
  module behind a shared interface, so adding one does not touch the walker.
- **`typefunctions/formats/`** holds the string, number, and date and time format checks
  (email, uuid, url, patterns, Temporal types) that get spliced into the generated bodies.
- **`purefunctions`** handles small self contained helper functions, both yours and the
  package's own. Their bodies are extracted at build time, hashed, and shipped as their
  own modules so shared logic is not duplicated into every generated body. A purity check
  rejects anything that reaches outside itself, because these bodies are rebuilt from
  source text at run time.
- **`operations`** is the single registry of every operation the build can be asked for,
  and the one place their short hashes are computed. Both the call site scanner and the
  code generator read it, which is what guarantees they agree on names.
- **`builtinpurefns`** carries the package's own helper bodies inside the Go binary. A
  published install has only compiled output, with no source for the extractor to read, so
  the bodies have to travel with the compiler and are served on demand.
- **`diskcache`** stores generated bodies between builds so an unchanged type does not get
  walked again. Entries record what they depended on and are rechecked on read, so a
  stale entry is a miss rather than a wrong answer.
- **`hashid`** is the shared short hash used for ids, tuned so the result is always a
  valid JavaScript identifier.

### `internal/enrichment/`: the files humans edit

Two features need information no type can carry: friendly validation messages and
realistic mock data. These live in generated files that are meant to be **committed and
hand edited**, which makes them a different kind of artifact from everything else here.

The compiler owns each file's location, its structure, and its imports. You own the
values inside. Regenerating merges rather than overwrites: your text is preserved, new
fields are added, and a field whose type disappeared is parked in place rather than
deleted. Freshly scaffolded spots are tagged `@todo` and left blank, and parked leftovers
are tagged `@rtOrphan`; the lint rules refuse to let a leftover reach a commit. An
unfilled spot is reported but tolerated while you are still writing, and becomes an error
under `enrich --require-complete`, which is also what a production build enforces (a blank
label would otherwise ship blank to the app). The `cldr` helper picks the right plural
forms per language at generation time only.

The same merge engine answers the running dev server, so a project can opt into keeping
these files in sync automatically instead of running the command by hand. It computes the
files and hands them back; only the caller ever writes, and a production build never
writes at all.

### The rest of `internal/`

- **`protocol`** defines the JSON shapes exchanged with the JavaScript side, including the
  record of each call site and what it demands.
- **`diagnostics`** is the catalog of every build message. Each has a stable code, a
  family, and a severity. Only the code and its arguments cross the wire; the wording is
  rendered on the JavaScript side from a generated copy of the same catalog, so there is
  one source of truth for text.
- Small helpers: `constants` (values mirrored into TypeScript), `jsquote`, `textpos`, and
  `testfixtures` (a corpus of TypeScript files the Go tests run against).

### `cmd/`: the binaries and the mirrors

Besides the resolver, `cmd/` holds a WebAssembly build of the same resolver (which powers
the in browser playground, using a direct function call instead of pipes) and a set of
small `gen-*` programs. Those generators exist to stop Go and TypeScript from drifting:
each reads a Go definition and writes the matching TypeScript file (operation hashes, the
diagnostic catalog, shared constants, reflection kinds, format metadata, recognised
config keys). CI regenerates them and fails if the result differs, so the two languages
cannot disagree about a shared value.

### `third_party/`: off limits

`third_party/tsgolint` is a git submodule of an outside project whose purpose is to expose
TypeScript's internal Go packages as importable ones. `go.mod` redirects the compiler
imports onto it.
Nothing under this directory may be edited: changes are silently discarded by
`git submodule update`, and the submodule is configured so edits do not even show in
`git status`. Moving to a newer revision is a separate, deliberate commit. Note that only
the access layer is used here; none of that project's lint rules are.

### A call site, end to end

```
createValidateFn<User>()
```

1. The build tool sends the file to the running Go program.
2. The program walks every call, and asks the type checker what this one resolves to.
3. It sees the last parameter is a marker naming the `validate` operation, and that the
   caller left that slot empty, so this is a request.
4. It converts `User` into a type description and gives it a short id.
5. It records exactly what is needed: a validator for that id.
6. The generator writes the validator body, plus anything it depends on.
7. The results become small generated modules.
8. The call site is rewritten to import the matching module and pass it in.
9. At run time the factory reads the value it was handed, registers it, and returns the
   ready made function. No type inspection happens.

## 2. The JS monorepo (`packages/`)

A pnpm workspace with three published packages plus one internal folder. All three
published packages move together on one version number, so a user never has to reason
about compatibility between them.

### `ts-runtypes`

Published as `@ts-runtypes/core`. The package users import at run time. It is deliberately
small, because the specialised code is generated. What ships here is:

- **The markers**, which are just branded string types. They carry no runtime behaviour.
- **The factories** users call: `createValidateFn`, `createGetValidationErrorsFn`,
  `createJsonEncoderFn` and `createJsonDecoderFn`, `createBinaryEncoderFn` and its decoder
  and sizer, `createHasUnknownKeysFn`, `createCloneExactShapeFn`, `createMockDataFn`,
  `createStandardSchema`, and the reflection helpers `getRunTypeId` and `getRunType`.
  Each one reads the value the build injected and returns the ready made function.
- **A small registry** that generated modules register themselves into, plus the generic
  machinery they lean on: the binary reader and writer, the built in helper functions, the
  mock data walker, and the friendly message renderer. Note that mock data is the one
  feature that walks the type at run time rather than using generated code.
- **Extension points**: `overrideX` to replace the generated function for one specific
  type, `registerClassSerializer` to rebuild real class instances, plus hooks for custom
  formats, mock functions, and helper functions.

There are three ways to describe a type, and they all meet in the same place. Type first
uses plain TypeScript (`createValidateFn<User>()`). Value first uses builders from the
`/schema` subpath (`RT.object({...})`) with `InferType` to get the type back out. JSON
Schema first passes a draft 2020-12 literal from the `/json-schema` subpath
(`createValidateFn(runTypeFromJsonSchema({...}))`) with `FromJsonSchema` to get the type back out.
All three converge on the same structural id, so equivalent shapes resolve to the same
cached factory whichever way they were written. The `/formats` subpath adds string,
number, and date formats such as email and uuid, and `/formats/temporal` adds Temporal
support as an opt in so nobody pays for it unintentionally.

The JSON Schema form is a translation, not a second engine. The schema literal is read at
build time and turned into the TypeScript type it denotes (constraint keywords land in the
same format brands the other two forms use), and the resolver never sees the schema at
all; it reflects the computed type. Keywords a type cannot express ride sentinel-encoded
slots the intersection collapse lifts off the base — `__rtNot` (negation), `__rtContains`
(occurrence counting), `__rtPatternProps` / `__rtPropNames` (key-scoped children),
`__rtUnevaluated` (the `unevaluated*` evaluated-set sweep) — plus
the structural format families (formattedArray / formattedObject) for length, uniqueness,
key-count and closedness checks, so the generated validator is exact even where the
recovered type is the closest expressible supertype. Every one of these keywords also has
a value-first + type-first spelling: they ride a single params bag on the collection
builders — `RT.array(item, {uniqueItems, contains, …})` / `RT.object(config, {minProperties,
patternProperties, propertyNames, …})` / `RT.record(…, {…})` — and the `FormattedArray<Base, P>`
/ `FormattedObject<Base, P>` wrapper types (formats/structural.ts), the door's exact twins.
Closedness is derived from the shape rather than hand-authored. Two emit-side rules keep the translation honest where the recovered type alone would not: a key matched by a sibling `__rtPatternProps` entry is EXEMPT from the index signature a schema-valued `additionalProperties` lowers to (2020-12: a matched key is not "additional"), the pattern twin of the long-standing sibling-named-key skip; and a REQUIRED member whose type imposes no value check (`unknown` / `any`) still emits a PRESENCE check, since `{}` is not assignable to `{foo: unknown}` — without it the slot leaves the AND chain and the member silently turns optional, which also breaks the weak-type gate's "one required prop already enforces presence" shortcut. The collapse also merges TUPLE ∩
TUPLE intersections slot-wise (the shape allOf-over-prefixItems produces; boolean slot
schemas ride along — `true` pads, `false` forbids the position): unknown sides defer,
id-equal sides collapse, the length window intersects, and the merged node is
indistinguishable from the equivalent hand-written tuple — while a genuine slot conflict
or impossible length window projects `never` (over-rejects; a silent noop validator is
the one forbidden outcome). A plain ARRAY joins the same merge as a tuple with no fixed
slots and an open tail of its element type, which is what `prefixItems` in one applicator
meeting `items` in another lowers to. Slots the two sides constrain DIFFERENTLY get one
more chance before the conflict verdict: they fold ARM BY ARM (a type-less schema keyword
denotes the six-kind union, so both sides are unions differing in one arm), identical arms
pass through, same-base arms merge their format annotations through the same
`MergeFormatAnnotations` that tightens bounds and folds `multipleOf` by least common
multiple, and a pair the fold cannot express is DROPPED — which narrows the slot, keeping
the failure direction over-rejection. The fold verdict is computed once, in the shared
`typeid` package, so both collapse halves reach it identically; every slot that reaches it
used to project `never`, so no id that resolves without it can move.

`unevaluatedProperties` / `unevaluatedItems` read the same way. Where the DOCUMENT pins
the evaluated set down the keyword resolves statically (a no-op when something in scope
already evaluates every member, a closed shape over the merged key set, or a leftover
value type); where the VALUE decides it — a passing `anyOf` / `oneOf` arm, an `if` with or
without branches, a `dependentSchemas` trigger key, a `contains` match — the door hands
the engine a `__rtUnevaluated` payload carrying the unconditional key set / prefix plus
one guarded group per conditional contributor, and the emit sweeps the members against it.
The object side sweeps keys with `for…in`; the array side raises a prefix watermark per
passing group and skips `contains`-matched indexes past it. Both splices are gated on the
node kind (the payload is shared by the two families), and the two collapse halves must
lift it identically or a cache entry and its id part company. Plain-union validation is
at-least-one (pinned by test), which makes anyOf the faithful spelling of a union; oneOf
is the exactly-one combinator (`OneOf<[…]>` / `RT.oneOf`): every non-nullish member
carries the branch tuple on an OPTIONAL `__rtOneOf` sentinel prop
(`A & {__rtOneOf?: Bs} | B & {__rtOneOf?: Bs} | null`, built as ONE shallow mapped type
plus an indexed access — O(1) instantiation depth at any width; the per-arm nullish
check is a naked-parameter conditional so it distributes into union-valued branches and
their null stays plain). Per-member carriage is deliberate: a whole-union intersection
distributes and destroys null branches, and an extra tag member breaks plain-union
consumption (discriminated switches, widening back to `A | B`). The union projection
reads the carriers (or their merged DataOnly shadow) onto the node's `oneOf` branch
list, both collapses skip the carrier so members serialize as their plain selves, and
validate counts branch matches instead of short-circuiting. One degenerate is handled
explicitly: identical branches intern to one arm and dedup the union away, so a
STANDALONE carrier'd intersection with duplicate branch ids projects the one-member
union with counting (nothing validates — exactly what duplicate branches mean) instead
of silently degrading to the plain base.

How faithful the whole translation is gets measured, not asserted: the official
JSON-Schema-Test-Suite (draft 2020-12 required set plus optional/format) runs as its own
vitest project at `packages/ts-runtypes/test/json-schema-official/`. The suite is a
commit-pinned git devDependency; `scripts/core/gen-json-schema-suite.mjs` type-probes every
schema group against the door's input contract (committed `triage.json`), generates real
`as const` call-site modules (gitignored, rebuilt by `check:builds`), and the lane pins
every verdict against a committed two-way divergence ledger — a regression AND a silently
fixed divergence both turn it red. The scoreboard is that directory's `CONFORMANCE.md`.

`DataOnly<T>` lives here too. It is the type level statement of the data only contract: it
projects a type down to what can actually survive a JSON round trip, which is why decoders
return it. The return type cannot claim a method survived when it did not.

One quirk worth knowing: the package's own tests import it by its public name, so its
`package.json` declares a `source` export condition to make that resolve to `src/` rather
than the built output. Both the test runner and the type checker have to agree on that, and
removing it from either breaks development whenever the build output is missing or stale.

### `ts-runtypes-devtools`

Published as `@ts-runtypes/devtools`. The build time half, and the piece that talks to the
Go program. It plugs into Vite, Rollup, Rolldown, webpack, Rspack, and esbuild from one
shared implementation, and it has four jobs.

**Transform.** It hooks the bundler early, before types are stripped, so the positions the
Go program reports still line up. It spawns the resolver once and keeps it alive for the
whole build. It knows which files matter because a whole project scan at build start
reports back the list, which is why a wrapper function in someone else's library works with
no configuration. By default the Go side returns just a list of edits and the plugin
applies them, which keeps the messages small; a fallback mode lets Go return the whole
rewritten file instead. A checksum guards against another plugin having changed the file
underneath.

**Codegen.** It writes the generated modules as real files under `<genDir>/types/`, one per
entry, and prunes the ones no longer used. That directory is generated and git ignored. It
regenerates at build start, again if a file introduced something new, and per edit in watch
mode, writing only files whose contents actually changed so the dev server reloads the
minimum.

**Enrich.** The merge engine itself lives in the Go CLI. What this package contributes is
consistency: it decides where the generated root is so the hand edited files land in the
same place the build reads from, it makes sure the directory exists, and its lint rules are
what surface enrichment problems.

**Lint.** One module serves as both an OXlint plugin (the primary one) and an ESLint v9
plugin, on the `./eslint` and `./oxlint` subpaths. It works for both because the rules use
only the common subset of the two APIs and type the rule context structurally, so the
package depends on neither host's types. There are two groups of rules: one carries the Go
compiler's diagnostics into your editor, named after what they catch rather than their
severity; the other keeps the hand edited enrichment files honest by refusing unfilled
`@todo` markers and leftover `@rtOrphan` blocks. The rules do not analyse anything
themselves. They ask the Go program and route the answers, caching per file so all the
rules share one round trip.

Because there is no `source` condition here, and because the lint entry points are literal
paths into the built output, **this package must be rebuilt after every source edit.** It
is the one exception to the usual "do not build during development" rule.

### `ts-runtypes-bin`

Published as `@ts-runtypes/bin`. A tiny launcher with no dependencies. Its single job is to
find the right prebuilt resolver
for the current machine. In a published install it resolves an optional dependency named
`@ts-runtypes/binary-<os>-<arch>`; inside this repo it finds the locally built
`bin/ts-runtypes` instead. There is deliberately **no postinstall download step**, since
install scripts are blocked by policy, so the binary arrives as an ordinary package.

One escape hatch precedes both lookups: the `RT_BIN` environment variable. Every lane
funnels through the launcher, so it is the single knob that redirects the bundler plugins
and the lint plugin (which has no `binary` option) at one build. A value that does not name
an executable file throws rather than falling through, since silently running a different
binary would key caches on another version. It is a development knob — the how-to lives in
[SETUP.md](../SETUP.md#pointing-a-consumer-project-at-a-specific-binary-rt_bin).

The binary carries two version strings, and the difference matters. Its own version is
folded into every type id hash, which is what keeps caches from different releases apart
automatically. The bundled TypeScript revision is metadata only and is never part of a
hash, so upgrading it does not churn every id.

### `examples`

Not a package at all: just a source folder and a tsconfig, with no `package.json`. Every
file is a real compilable example, and the docs website includes them by reference instead
of copying snippets. They are type checked by the root script, against the built type
definitions rather than the source, so they see exactly the surface a user sees. If the API
changes and an example stops compiling, CI fails. That is the whole point.

### Versioning and publishing

One version number in `version.json` drives everything. A bump script writes it into every
manifest, and internal dependencies use pnpm's workspace protocol so they resolve to real
versions at pack time. Everything is pinned exactly rather than by range, and all
development dependencies live at the root rather than per package.

At publish time the resolver is cross compiled for seven platforms, each wrapped as its own
package, and the launcher's optional dependencies are filled in pinned to the exact same
version. Publishing always goes leaves first, so a user can never install a launcher whose
platform packages are not on the registry yet.

Releases land through a frozen release branch that is merged into a `prod` branch. That
merge is the single place in the repo where a merge commit is used rather than a rebase,
because `prod` has to keep the main branch as an ancestor. CI enforces both halves of that
rule.

## 3. Containers (`container/`)

This group holds three supporting apps: the documentation website, the benchmarks, and the
pre publish release test. None of them are part of the product, and all of them need large
amounts of third party code: a full Nuxt site, competing validation libraries, six
bundlers, and a local npm registry.

**They are isolated so that code never touches this project.** That is a supply chain
decision, and it is enforced in four independent ways rather than by convention:

1. The pnpm workspace only includes `packages/*`, so nothing here can enter the root lock
   file. The project's own dependency graph stays small and reviewable.
2. Each app keeps its manifests in a `_deps/` subfolder rather than at its root, so there
   is no place to accidentally run an install.
3. An ignore file limits what can even enter an image build, to `_deps/` and a couple of
   support folders. First party code is never copied in; it is mounted at run time. So an
   image only changes when a dependency changes, and editing source rebuilds nothing.
4. The install runs **inside** the image, never on the host, and each `_deps/` carries its
   own policy: an allow list for packages permitted to run install scripts, a minimum
   release age of thirty days so brand new versions cannot be pulled in, exact pins, and a
   block on unusual dependency sources.

The practical result: you can work on this repo without ever installing Nuxt, zod, typia,
webpack, or verdaccio, and a compromised release of any of them cannot reach the packages
that get published.

### The three apps

**`website/`** is the documentation site (Nuxt and Docus), and the content is Markdown. Two
mechanisms keep it honest. Code examples are pulled in from the real example files by
reference, so an example that stops compiling breaks the build rather than silently rotting.
And the type hover annotations in the docs are rendered from the actual built type
definitions, so a signature change shows up in the docs. It also embeds a playground that
runs entirely in the browser, using the WebAssembly build of the resolver, with no server
involved. The site deploys to Cloudflare Pages, and only after a check confirms the version
being documented is actually live on npm.

**`benchmarks/`** compares RunTypes against zod, TypeBox, Ajv, and typia, and also measures
things that matter to this project specifically: how much type checking work the types cost,
how long builds take, and how large the messages between the Go program and the plugin are.
Each competitor is a separate isolated project with its own dependencies, so one library's
awkward install cannot break the others' results. The benchmarks double as a conformance
check: the test cases live in a shared folder with no library imports, and each competitor
must map every single case (or explicitly mark it unsupported) or the build fails. Results
flow into the website as generated data.

**`pre-publish-e2e/`** is the release gate, and it tests the thing nothing else does: a real
consumer install. It starts a throwaway local npm registry, publishes the actual packaged
tarballs into it, installs them from there, and then builds a small app with each of the six
supported bundlers to check the plugin works and produced rewritten code. It also runs a
lean test on the host machine itself, because verifying that the launcher picks the correct
platform binary is the one thing a Linux container cannot do for macOS or Windows.

### The two images

Both are published to GHCR and are dependency only. `tsrt-website` carries the site and the
benchmark dependencies. `tsrt-e2e` carries the registry and the bundler toolchains.

They used to be one image, which grew to over six gigabytes and started failing CI by
filling the runner's disk. Splitting them means the light jobs (smoke checks, benchmarks,
site builds) never download the heavy release tooling, which only the release gate needs.

CI never builds these images, it only pulls them. So after changing anything under a
`_deps/` folder you have to push the image yourself, or the next run quietly uses the old
dependencies. That is the one manual step in this group worth remembering.

## The tooling around it

- **`pnpm rtx <area> <command>`** is the single entry point for development tasks (build,
  test, fuzz, website, benchmarks, containers, release). It is a thin dispatcher over the
  same scripts CI runs, never a reimplementation, so local and CI cannot drift.
- **Build order matters.** The plugin's tests launch the real Go binary, so it has to exist
  before the JavaScript tests run. That is why `pretest` builds it, and why you should not
  try to move that into test setup: the binary is spawned while the test runner is still
  starting up.
- **Tests** are Vitest on the JavaScript side and standard `go test` on the Go side. Note
  that the JavaScript suite needs Node 26 or newer, because it relies on Temporal being
  available globally.
- **Generated mirrors are checked, not trusted.** Every value shared between Go and
  TypeScript is generated from the Go definition, and CI regenerates and compares, so the
  two languages cannot disagree.
- **Environment variables** are all listed in one registry in the scripts folder. That list
  is the contract; anything reading a variable not in it is a bug.

## Where to go next

- [../SETUP.md](../SETUP.md) for prerequisites, bootstrap, build, test, and publishing.
- [ROADMAP.md](ROADMAP.md) for what is deliberately out of scope and the known gaps.
- [AI_ENRICHMENT.md](AI_ENRICHMENT.md) for the friendly text and mock data workflow.
- [FUZZING.md](FUZZING.md) for how the generated functions are stress tested.
- [WEBSITE-DOCGEN.md](WEBSITE-DOCGEN.md) for the generated documentation pages.
