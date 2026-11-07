---
type: chore
spec: guidelines
status: done
created: 2026-11-03
---

# Drop mion RPC's Next.js support

## Intent

mion RPC targets SPAs (a browser app calling its own server). The maintainer dropped Next.js for RPC: the
`withMion` preset (`@mionjs/devtools/next`) and everything that only exists for it goes, with no trace. RunTypes
keeps its Next.js adapter (`@mionjs/devtools/runtypes/next`), and Next.js code lives nowhere else.
`@mionjs/platform-vercel` stays as a plain Vercel Functions adapter. The starters side shipped in
MionKit/mion-starters#3.

## Done when

- No `withMion`, `@mionjs/devtools/next`, `mion-next` or `MION_E2E_CLIENT_ROUTES` outside `docs/done/` and
  `CHANGELOG.md`.
- The `withRunTypes` unit coverage that reached it through `withMion` still exists, now against `withRunTypes`.
- `smoke-next` checks a type edit during `next dev`, replacing the only dev-edit coverage `mion-next` had.
- `pnpm test`, `pnpm run lint`, `pnpm run format`, website links green.

## Plan (approved 2026-11-03)

- Remove `packages/devtools/src/next/`, the `./next` export, `next-dev-router-reset.test.ts`, the dev-reset case of
  `rpc-router/test/moduleCopies.spec.ts`, the `mion-next` e2e app and its build/test/release/env wiring
  (`MION_E2E_CLIENT_ROUTES`, `MION_E2E_MATRIX_MION_PKGS`), the Next codegen examples and the
  `01.rpc/07.devtools/03.nextjs.md` page (later pages renumbered).
- RunTypes adapter: drop the RPC-only `rewriteOutput` hook and the broker stamp's `rpc/` half (it only made RPC
  batches reload under `next dev`); the stamp covers `types/` alone. The compiler's batch table import stays: it is
  how batches load on any host.
- Move the `withRunTypes` cases of `mion-presets.test.ts` to call `withRunTypes` directly.
- Agent docs, CI lane comment and RPC website pages lose their Next.js mentions. RunTypes pages untouched.
- `@mionjs/platform-vercel` comments and its page describe Vercel Functions: one `api/mion.ts` plus a `vercel.json`
  rewrite, since outside Next.js a file under `api/` serves only its own path (checked in `@vercel/fs-detectors`,
  `@vercel/node` and the `vercel dev` router).
- New `smoke-next` `next dev` (Turbopack) type-edit check in `build-all.mjs` `checkNextDev`: it fails the build by
  throwing, like the existing `next build` type-edit check.
