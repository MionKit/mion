# `getExePath()` has no env escape hatch — pre-publish / custom-binary validation is awkward

**Status:** todo
**Created:** 2026-07-26

`@ts-runtypes/bin`'s `getExePath()` resolves the resolver binary from exactly two places: the
in-repo dev path (`<repo>/bin/ts-runtypes`, only when the module itself lives at
`packages/ts-runtypes-bin/lib`) and the per-platform `@ts-runtypes/binary-<os>-<arch>` package.
There is **no environment-variable override**, so a consumer that wants to point the resolver at a
specific binary cannot — even though the *plugin* lanes accept one.

## Evidence

- `packages/ts-runtypes-bin/lib/index.js` → `getExePath()` reads no `process.env` at all.
- The **ESLint lint lane** calls it directly with no override path:
  `packages/ts-runtypes-devtools/src/eslint/lint-worker.ts` → `const binaryPath = getExePath();`
  (its only env knob is `RT_LINT_PRESPAWN`, which just disables the pre-spawn shim).
- By contrast the bundler plugin lane DOES accept an explicit binary (`PluginOptions.binary`), and
  downstream wrappers expose an env var over it — mion's `mionVitePlugin` resolves
  `options.binary → process.env.TS_RUNTYPES_BIN → getExePath()`. So the two lanes disagree: a
  consumer can redirect the *transform* binary but not the *lint* binary.

### How it bit us (mion pre-publish validation, mion PR #128)

Validating an **unpublished** ts-runtypes build inside mion: core/devtools/bin were consumed as
locally packed `file:` tarballs, but `@ts-runtypes/binary-<os>-<arch>` only exists once
`scripts/release/build-binaries.mjs` runs at publish time. Result:

- tests passed (mion's vite plugin honored `TS_RUNTYPES_BIN` → the locally built binary), but
- `pnpm run lint` failed on every marker file with
  `[runtypes] resolver failed: [ts-runtypes-bin] Unable to resolve @ts-runtypes/binary-linux-x64`
  (routed as `runtypes/broken-tsconfig`), because the lint lane has no way to be told which binary
  to use.

The only workaround was hand-fabricating a `node_modules/@ts-runtypes/binary-linux-x64` package
(package.json + the built binary copied to `lib/`) — fine locally, but it is not committable, so
CI cannot run the lint lane against an unpublished build at all.

## Why it matters beyond our case

- **Pre-publish validation** (the "prove it works in a real consumer before we publish" gate) can
  never exercise the lint lane.
- **Bisecting / debugging** a resolver regression in a consumer repo requires swapping binaries;
  today that means editing `node_modules`.
- **Air-gapped / vendored installs** that ship the binary out-of-band have no supported hook.

## Fix plan

- Add an env override read at the TOP of `getExePath()`, before the dev-path and platform-package
  lookups — e.g. `TS_RUNTYPES_BIN` (match the name mion's wrapper already uses) or the
  project-prefixed `RT_BIN`. Validate it exists + is executable and throw a clear error if not, so a
  typo fails loudly instead of silently falling through to a different binary.
- Register the new var in `scripts/lib/env.mjs`'s `REGISTRY` (scope `dev`) and mirror it in
  `.env.sample` — the registry is the contract for every env var the project consumes.
- Document it in SETUP.md (troubleshooting / dev loop) and in the devtools README's options table
  next to the `binary` plugin option, noting it applies to BOTH the bundler and lint lanes.
- Consider also threading an explicit `binary` option through the ESLint plugin settings
  (`settings.runtypes.binary`, alongside the existing `timeoutMs`) so a lint config can pin a
  binary without an env var. Env var alone is sufficient to unblock; this is the tidier long-term
  surface.
- ⚠️ Keep the existing safety note in mind: the binary VERSION is folded into every typeId, so an
  override pointing at a different-version binary produces caches that diverge from a normal
  install. The docs for the new var should say so explicitly (mion's wrapper already carries that
  warning verbatim).
