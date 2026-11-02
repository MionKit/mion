---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# Batches and lint rules in Vue apps: injected clients, `.vue` linting, SFC-only batches

## Intent

Idiomatic Vue and Nuxt code cannot batch or lint with mion today; the starters had to move every batch into `.ts`
modules with a module-level client. Found while porting the mion-starters Vue and Nuxt starters to 0.13.2;
investigation in the mion-starters repo, `docs/investigations/mion-0.13-migration/` (README rows 13-15, `vue.md`
issues 4-5, `nuxt.md` issues 3, 7-8, repro `repros/batch-destructure`).

1. **Batch reader.** `const {routes} = initClient(...)` and `const routes = client.routes` work, but
   `const {routes} = client` (an imported client, a same-file client, a Vue `inject()` composable, `useNuxtApp()`)
   fails with `rpc-batch-element-unreadable`, whose advice ("bind it to a const") is what the code already does.
2. **Lint on `.vue`.** The mion ESLint rules answer every `.vue` file with
   `resolver failed: scanFiles […].vue: source file not in program`; the docs promise the linter shows build
   errors in the editor.
3. **SFC-only batches** exist only for builds that transform that SFC: a separately built API never sees them and
   answers `404 batch-unknown-id`. Undocumented.

## Direction

The implementer plans the fixes. Verified pointers:

- `ts-go-runtypes/internal/compiler/requestbatch/routes.go:216-256` (`bindingElementPath` only accepts an
  `initClient()` initializer, line 247); the variable-declaration branch at `:180-197` already follows access
  chains. Decide how far tracing should go (a value returned from `inject()` cannot be traced; say so in the
  diagnostic and the docs).
- `packages/devtools/src/lint/lint-worker.ts:85-106` sends the raw SFC under its `.vue` path; the Vite preset
  already registers the extracted script as a virtual `Comp.vue.ts` (`packages/devtools/src/vite/sfcTransform.ts`).
  Lint rules live in the compiler (`packages/devtools/src/lint/AGENTS.md`).
- SFC-only batches: at minimum document it; consider a build diagnostic when a separate server build misses a batch
  the program has.
- Marker API tests cover both `getRunTypeId` call shapes (root `AGENTS.md`).

## Docs

`container/website/content/01.rpc/04.client/03.batch.md` "Writing a Batch the Build Can Read" (client origins the
build can trace), `01.rpc/07.devtools/02.vite.md` "Vue Single-File Components" (SFC batches and separate builds),
`01.rpc/07.devtools/01.linter.md` "Installing the Plugin" or "Recommended Config" (`.vue` support).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A client destructured from a traceable client compiles in a batch, an untraceable one gets a diagnostic that says
  why, and the mion lint rules run on `.vue` files, each pinned by tests.
- The SFC batch limitation is documented or removed.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
