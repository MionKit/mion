---
type: chore
spec: guidelines
status: ready
created: 2026-11-03
---

# Drop Next.js support from mion RPC, keep the RunTypes Next adapter

## Intent

The maintainer decided mion RPC targets SPAs (the browser to server bridge) and no longer supports Next.js. The
mion-starters drop their Next.js starter for a React + Vite one. mion is in beta with no users to migrate, so the
preset goes with no deprecation and no trace, per the root `AGENTS.md` rule for removed things.

RunTypes is meant to be an independent library, so its own Next adapter stays exactly as it is.

## Direction

The implementer plans the details. Verified on `main` (`85f3488af`):

**Remove (mion RPC on Next):**

- the `withMion` preset: `packages/devtools/src/next/` (`index.ts`, `devRouterReset.ts`) and the `./next` export in
  `packages/devtools/package.json`;
- the next-dev router reset it threads into the RunTypes broker:
  - `packages/devtools/src/runtypes/next/broker.ts`;
  - `packages/devtools/src/runtypes/next/index.ts`;
  - added in `28ee297c3`;
- tests: `packages/devtools/test/next-dev-router-reset.test.ts` and the reset cases in
  `packages/devtools/test/next-broker.test.ts`;
- the RPC Next e2e app `container/pre-publish-e2e/apps/mion-next/` and whatever lane wiring runs it, including the
  `next dev` lane added with the in-process reload fix;
- docs: `container/website/content/01.rpc/07.devtools/03.nextjs.md`, plus every RPC page, nav entry or option table
  that names `withMion` or `@mionjs/devtools/next`;
- examples: `packages/private-examples/src/codegen/next-config.ts`, `next-fetched-config.ts`,
  `next-route-handler.ts`, `next-client.ts`;
- any preset-only branch in `packages/devtools/src/options.ts`, which today maps options for both presets.

**Keep:**

- `@mionjs/devtools/runtypes/next` and `./runtypes/next/loader` (`withRunTypes`), as they are;
- the RunTypes e2e apps `smoke-next` and `smoke-next-ts`;
- `packages/private-examples/src/introduction/quick-start-next-config.ts` (RunTypes quick start);
- `@mionjs/platform-vercel`: the starters deploy Vite SPAs to Vercel through it.

**Out of scope (maintainer: leave the RunTypes adapter as it is).** Known issues of the RunTypes Next adapter,
recorded here so they are not lost, not to fix in this change:

- `./runtypes/next` exports only `import`, so a `next.config.ts` (compiled to CJS by Next) cannot load it;
- `withRunTypes` returns before `.mion/` exists, and a clean Turbopack build on Next 16.4 then fails;
- an intermittent "source file not in program" in `next dev` (a one-file `setSources` on source drift in
  `packages/devtools/src/core/unplugin.ts`).

Evidence for all three: the mion-starters repo, `docs/investigations/mion-0.13-migration/nextjs.md`.

## Docs

- Remove `container/website/content/01.rpc/07.devtools/03.nextjs.md` and its links.
- Check the RPC introduction and quick-start pages for Next mentions.
- RunTypes pages stay.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- No `withMion`, `@mionjs/devtools/next` or RPC-on-Next page, example, test or e2e lane remains.
- The RunTypes Next adapter and its smoke apps still pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
