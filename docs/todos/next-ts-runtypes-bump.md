# Bump `@ts-runtypes/*` once the next release lands, then drop the `allSingle` guard

**Status:** todo — blocked ONLY on an upstream release. Two separate pieces of mion work are waiting
on the same version bump, so they are tracked together here rather than as two todos that would both
sit idle for the same reason.
**Created:** 2026-08-22 · **Affects:** @ts-runtypes/* pinned at 0.12.1

## What is owed

### 1. Raise the pin

Every `@ts-runtypes/*` dependency is exact-pinned at `0.12.1` across `packages/*/package.json`. The
release must contain both of these, which are on ts-run-types `main` but unreleased:

- **The `allSingle` import-grouping fix** (`c7fb861`, PR
  [MionKit/ts-run-types#361](https://github.com/MionKit/ts-run-types/pull/361)).
- **Type-dependency invalidation**, plus the follow-up that stops a virtual source being declared as
  a bundler watch dependency. Without that second commit mion's Vue SFC lane fails in dev with
  `Failed to resolve import "…/Comp.vue.ts"`. See
  [../done/type-only-dep-hmr-staleness.md](../done/type-only-dep-hmr-staleness.md).

`minimumReleaseAgeExclude` in `pnpm-workspace.yaml` already lists `'@ts-runtypes/*'`, so the 30-day
policy will not block the bump.

### 2. Drop the `allSingle` guard

`moduleMode: 'allSingle'` groups the compiled-fn cache into per-family modules
(`types/fns/<family>.js`) but emitted a **single** import from `types/fns/val.js` listing bindings
from all nine families, so every binding belonging to the other eight was unresolvable. Measured on
mion's `test-server` (68 types): **605 bindings imported from `val.js`, which exports 99. 537
unresolvable.** rollup failed the build with an empty error body ~6000 columns into a single-line
import; esbuild / vite-node did not check at all, so the names became `undefined` and surfaced far
from the cause as a registration error naming an internal route nobody wrote.

mion rejects the mode at config time until the fix ships. Once bumped:

- Delete the `allSingle` guard in `packages/devtools/src/vite-plugin/mionVitePlugin.ts` and its two
  cases in `removedOptions.spec.ts`.
- **Run the end-to-end verification the guard currently blocks** — the server-mapper transport's
  `allSingle` handling is unit-tested but has never run in a live server (see
  [../done/server-mappers-from-generated-pure-fn-cache.md](../done/server-mappers-from-generated-pure-fn-cache.md)).

Companion record: [../done/module-mode-allsingle-broken.md](../done/module-mode-allsingle-broken.md).

## Verifying before the release

Both pieces can be exercised against a locally packed upstream build without waiting, which is how
the type-dependency work above was validated:

```bash
# in ts-run-types
pnpm rtx release binaries && pnpm run build && pnpm rtx release pack

# in mion — overlay the packed tarballs into the installed tree
for p in core devtools bin binary-linux-x64; do
  rm -rf "node_modules/@ts-runtypes/$p" && mkdir -p "node_modules/@ts-runtypes/$p"
  tar -xzf "../ts-run-types/tarballs/ts-runtypes-$p-<version>.tgz" \
      -C "node_modules/@ts-runtypes/$p" --strip-components=1
done
RT_BIN=../ts-run-types/bin/ts-runtypes pnpm run test
```

Overlaying beats repointing the deps at `file:` tarballs: it needs no re-resolution (which
`minimumReleaseAge` makes expensive and a metadata-poor registry mirror can block outright) and it
leaves `package.json` and the lockfile untouched, so nothing temporary can leak into a commit.
`RT_BIN` is the single override honoured by `@ts-runtypes/bin` for both the vite transform and the
ESLint lane, so they cannot end up on different binaries.
