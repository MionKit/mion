# platform-bun: ts-runtypes injection lane (DONE)

**Status:** done — the bun lane runs and passes (`10 pass / 1 todo / 0 fail`). R2 of
[migration-review-findings.md](migration-review-findings.md).
**Created:** 2026-07-20
**Closed:** 2026-08-21

## What was actually wrong

⚠️ **The blocker this spec previously described did not exist.** The earlier pass concluded
that "the resolver only INJECTS files inside its own `include`, so imported cross-package
route definitions are read but never rewritten". That is not how the resolver works, and it
is not what was failing. Recording the correction here so nobody re-derives the wrong model:

- The resolver's Program is built from the tsconfig **plus everything it transitively
  imports**, and its whole-program scan walks every non-declaration program file. So
  `@mionjs/router`'s internal `route()` / `middleFn()` sites were always scanned.
- Bun resolves `@mionjs/router` to its TypeScript source through the root tsconfig `paths`,
  so no `--conditions=source` flag is needed either (checked: `bunfig.toml` has no
  `conditions` key in bun 1.3.11, only the CLI flag exists, and it turned out to be
  unnecessary).

The real causes were two, both small:

1. **`bun-preload.ts` did not `await plugin(...)`.** `Bun.plugin()` returns a promise for an
   async `setup` but does **not** wait for it before importing modules. So the resolver was
   still starting while the first files loaded, the plugin's `transform` bailed on a null
   resolver, and every early module — `@mionjs/router`'s route definitions among them —
   loaded with no injected type information. `initRouter()` then threw
   `MissingRtFnsError: … no type id injected for 'mion@methodsMetadata#params'`.

   Measured: the user's own files load ~9ms in while `buildStart` finishes ~84ms in.

2. **`bunHttp.test.ts` was stale.** With (1) fixed, five of six tests passed; the sixth
   expected a `validation-error` for invalid params. mion restores params from JSON *before*
   validating, so a wrong-typed param surfaces as a `serialization-error` — exactly what
   `packages/platform-node/src/mionHttp.spec.ts:89` already expects. The bun copy was never
   updated because the lane has been out of CI since the deepkit removal.

## Shipped

- `loader/runtypes-loader.ts` rewritten off `@deepkit/type-compiler` onto the `unplugin.bun`
  lane plus two runtime shims; `@deepkit/*` devDeps removed; the `reflection` tsconfig flag
  and the `MION_COMPILE` AOT contract removed.
- `bun-preload.ts` awaits the plugin registration, with a comment explaining why the keyword
  is load-bearing (commit `eea4aea`).
- `bunHttp.test.ts` aligned with platform-node's expectations.

## Upstream follow-up (not required for this spec)

The two shims in `loader/runtypes-loader.ts` are not mion-specific — they patch gaps in
unplugin's Bun context, which targets `Bun.build` rather than the `Bun.plugin` runtime
loader. They have since been fixed upstream in `@ts-runtypes/devtools/bun`, which also makes
the missing `await` harmless by gating every load on the resolver being ready. **When mion
next upgrades, `runtypes-loader.ts` should collapse to a thin wrapper over that entry** and
the local shims deleted. Filed as
[platform-bun-adopt-upstream-adapter.md](platform-bun-adopt-upstream-adapter.md).

Also shipped in the same pass: the bun suites now run in CI (`pnpm run test:bun`, its own
step in [pull-requests.yml](../../.github/workflows/pull-requests.yml) since `bun:test` cannot
join the vitest projects), and the "temporarily unsupported" warning is gone from
`packages/platform-bun/README.md`.
