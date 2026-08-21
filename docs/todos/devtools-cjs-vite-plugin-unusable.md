# `@mionjs/devtools/vite-plugin` advertises a `require` condition that cannot load

**Status:** todo — BLOCKS the release. Needs a packaging decision (see the options below); everything
else in [pre-publish-gate-repair.md](../done/pre-publish-gate-repair.md) is fixed and verified.
**Created:** 2026-08-21

## Problem

`packages/devtools/package.json` exports:

```json
"./vite-plugin": {
    "import": "./build/vite-plugin/esm/index.js",
    "require": "./build/vite-plugin/cjs/index.cjs"
}
```

That CJS build **cannot load**. It does `require('@ts-runtypes/devtools/vite')`, and upstream declares
that subpath ESM-only:

```json
"./vite": {"types": "./dist/vite.d.ts", "import": "./dist/vite.js"}
```

— no `require` condition. So any CJS consumer of `@mionjs/devtools/vite-plugin` gets:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './vite' is not defined by "exports"
  in node_modules/@ts-runtypes/devtools/package.json
```

## Evidence — it already breaks the repo's own build

`@mionjs/platform-bun` is the only package without `"type": "module"`, so vite loads its
`vite.config.ts` through the CJS path. Its config imports `cjsPackageJsonPlugin` from
`@mionjs/devtools/vite-plugin`, which pulls the CJS barrel → the CJS `mionVitePlugin.cjs` → the failing
`require`.

```
$ pnpm --filter @mionjs/platform-bun run build
failed to load config from packages/platform-bun/vite.config.ts
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './vite' is not defined by "exports" …
```

`pnpm run build` (lerna, `--nx-bail`) therefore dies at platform-bun, and `@mionjs/client` and
`@mionjs/examples` never build — which is step 4 of `scripts/pre-publish-test.sh`. It is also why
`packaged-sources.spec.ts` reports "no declaration files found under @mionjs/platform-bun/build": the
package has no `build/` at all.

Note this is masked in a piped shell: `pnpm run build | tail` reports exit 0 while lerna printed
`Failed tasks: @mionjs/platform-bun:build`.

## Fix options (a decision, not a mechanical fix)

1. **Drop the `require` condition for `./vite-plugin`** (and stop building the CJS lane for it). Vite
   configs load as ESM in any modern setup, and the lane has never worked. Honest, smallest surface —
   but a CJS consumer then gets a resolution error instead, so platform-bun still needs option 2 or 3.
2. **Give `@mionjs/platform-bun` `"type": "module"`.** Fixes the repo build, leaves the broken CJS
   lane shipping to real consumers. Needs a check that bun's loader/`bunfig.toml` setup tolerates it.
3. **Make the CJS build load upstream lazily** via dynamic `import()`, returning a promise from
   `mionVitePlugin` (vite accepts `Promise<PluginOption>` in `plugins`). Keeps the advertised CJS
   support genuinely working; largest change.

Recommendation: 1 + 2 together — stop advertising a lane that cannot work, and move platform-bun onto
the ESM lane every other package already uses.
