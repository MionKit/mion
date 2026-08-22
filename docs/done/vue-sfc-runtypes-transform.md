# Vue SFC `<script>` blocks are type-transformed (the other half of R28)

**Status:** done — shipped on `claude/vite-plugin-ssr-middleware-35q9jm` (PR #144), alongside
[vite-plugin-ssr-middleware-mode.md](vite-plugin-ssr-middleware-mode.md). Closes the last open piece
of R28 in [migration-review-findings.md](migration-review-findings.md).
**Created:** 2026-08-22

## Problem

Typed mion code inside a `.vue` SFC (`route()`, `createValidate*`, any marker call in a `<script>`
block) was **silently not transformed**: no diagnostic, no build failure — the marker never got its
compiled fns, and the failure surfaced at runtime as missing fns or a route that never validated.
The pre-migration plugin handled SFCs by running deepkit's per-file text transform against a
synthetic `.ts` name; the migration dropped it, and `@ts-runtypes/devtools` transforms only plain
TS/JS ids (`dist/unplugin.js:249-270` — `if (!/\.[mc]?[jt]sx?$/.test(id)) return null`, and an
out-of-program file is swallowed silently).

## Three corrections to this spec's first draft

It was filed as upstream-blocked. Investigating properly showed otherwise:

1. **The engine was never the limitation.** The resolver transforms a path that is in no tsconfig
   program and on no disk, provided its source is registered first. Measured against the 0.12.1
   binary, with the imports resolving through the normal program:

   | the registered script imports | result |
   | --- | --- |
   | type from a sibling `.ts` in the program | resolved — `typeof v.name === 'string' && Number.isFinite(v.age)` |
   | type from a `.ts` **outside** the tsconfig `include` | resolved — TS pulls transitively imported files in |
   | type from node_modules (`Email` from `@ts-runtypes/core/formats`) | resolved, with the format's pure fn + regex |
   | type imported from another `.vue` | `MKR007`, severity **error** — "Marker type resolved to `any` … would silently accept anything" |
   | same virtual path re-registered with new content | new fn id, no stale reuse |

2. **mion can reach that without a second resolver process — and it is the package's own pattern.**
   Its ESLint lane does exactly this, because ESLint also hands it text rather than a path the
   resolver already parsed (`dist/eslint/lint-worker.js:63-64`):
   `setSources({[rel]: text})` → `scanFiles([rel])`. The vite plugin exposes the same sequence
   through `handleHotUpdate` (`dist/unplugin.js:283-322`: setSources → scanFiles → generate), so mion
   registers the SFC script there and then calls that same plugin instance's `transform`.

3. **There is no `setSources` client bug.** The draft reported one; that error came from the probe
   script itself (`JSON.stringify(undefined).slice(...)`). Nothing to report upstream.

## What shipped

`packages/devtools/src/vite-plugin/sfcTransform.ts` — two plugins wired off the SAME ts-runtypes
instance mion already builds (one resolver, one program, one generated tree):

- **`mion-sfc` (`enforce: 'pre'`)** parses the SFC with the compiler borrowed from
  `@vitejs/plugin-vue`'s `api.options` (no new dependency, always the project's own version),
  registers the script under a virtual `<Comp.vue>.<lang>` path **next to the SFC** — which is what
  makes the emitted relative import (`./__runtypes/types/<hash>.js`) resolve from the `.vue` module —
  transforms it, and splices the injected script back into the SFC source. `<script>` and
  `<script setup>` are registered as ONE module so a type declared in one resolves for a marker call
  in the other, exactly as Vue merges them.
- **`mion-sfc-audit` (`enforce: 'post'`)** watches the emitted module: an SFC that carries a marker
  but no injected fns is reported, naming the file. It stays wired even when `runTypes.sfc: false`,
  because that is precisely when the silent failure happens.

**Why not hook inside plugin-vue**, which was the first design: `compileScript` is **synchronous**
and the resolver round-trip is not, so there is nothing to await inside it. Its `Options.compiler`
extension point is still used — for the parser — but the injection has to happen before plugin-vue
runs. Everything after it is too late: measured, a `post` transform sees `createValidateFn()` with
the generic and the type import already erased by plugin-vue's `transformWithEsbuild`.

The injected import block is folded onto the first line of the script rather than prepended, so the
script keeps its original line numbers and plugin-vue's source map stays true.

## Verified

- `packages/devtools/src/vite-plugin/sfcTransform.spec.ts` — real vite + real `@vitejs/plugin-vue`
  over fixture projects: `<script setup lang="ts">` and classic `<script lang="ts">` both receive the
  compiled fn; a type imported from a sibling `.ts` produces a validator over the real shape; a type
  declared in `<script>` reaches a marker in `<script setup>`; an SFC with no mion code is untouched
  and no source file is ever rewritten on disk; `runTypes.sfc: false` ships no fns **and warns**; and
  a `vite build` whose marker type comes from an unresolvable import (a type from another `.vue`)
  **fails the build** instead of shipping an always-true validator.
- A real `vite dev` Vue app: the SFC module carries `import {__rt_…} from '/src/__runtypes/types/…'`,
  the generated validator checks the imported type's real properties, and touching the SFC after
  changing that type re-injects a new fn.

## Known boundary (documented, not silent)

A type imported **from another `.vue`** cannot be resolved by a TypeScript program, so it stops the
build with `MKR007` naming the import. Keep types a marker uses in `.ts`/`.d.ts` or a package.

Separately, in dev, editing a **type-only** dependency does not re-transform the modules that use it:
vite has no module-graph edge for an erased import, so nothing invalidates them until the using file
itself changes. That is pre-existing and identical for `.ts` files (measured side by side) — see
[../todos/type-only-dep-hmr-staleness.md](../todos/type-only-dep-hmr-staleness.md).
