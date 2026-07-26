---
type: feature
spec: guidelines
status: done
created: 2026-07-26
completed: 2026-07-26
---

# `getExePath()` has no env escape hatch — pre-publish / custom-binary validation is awkward

**Status:** done (shipped as `RT_BIN`; see [Implemented](#implemented) below)
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

## Implemented

Shipped as **`RT_BIN`** (not `TS_RUNTYPES_BIN`): CLAUDE.md's env-var contract prefixes every
runtypes-owned var with `RT_`, and the published surface already does exactly this for
consumer-set vars (`RT_CACHE_DIR`, read by the Go binary; `RT_LINT_PRESPAWN`, read by the lint
plugin). A single canonical name also avoids the dual-name protocol the registry section warns
about. **Downstream note for mion:** its `mionVitePlugin` resolves
`options.binary → process.env.TS_RUNTYPES_BIN → getExePath()`; its transform lane keeps working
unchanged (it passes `binary` explicitly), but to cover the LINT lane it must set / rename to
`RT_BIN` — a one-line change on that side.

What landed:

- [packages/ts-runtypes-bin/lib/index.js](../../packages/ts-runtypes-bin/lib/index.js) — `overrideExe()`
  read at the TOP of `getExePath()`, before the dev path and the platform package. Empty or
  whitespace-only is a no-op (so `RT_BIN=` in a `.env` behaves like unset); anything else is
  resolved against `process.cwd()` (so a relative path works) and must be an existing, executable
  FILE, else it throws `[ts-runtypes-bin] RT_BIN=… does not exist / is not a file / is not
  executable`. Precedence end to end: plugin `binary` option → `RT_BIN` → in-repo dev binary →
  platform package.
- [packages/ts-runtypes-devtools/test/bin-exe-path.test.ts](../../packages/ts-runtypes-devtools/test/bin-exe-path.test.ts)
  — 8 cases: override honored, relative resolved, unset/empty/whitespace fall through, and the three
  loud failures; plus two through `bin/cli.js` proving the override reaches a real exec (and that a
  bad value exits non-zero naming `RT_BIN`). Lives in the devtools project because it is the
  launcher's consumer and `@ts-runtypes/bin` has no vitest project of its own. (The marker
  coverage rule does not apply — no marker API is involved.)
- Registry + sample: `RT_BIN` (scope `dev`) in [scripts/lib/env.mjs](../../scripts/lib/env.mjs) and
  [.env.sample](../../.env.sample).
- Docs: [SETUP.md](../../SETUP.md) (dev-loop section + a troubleshooting row for the exact
  `Unable to resolve @ts-runtypes/binary-<os>-<arch>` failure this todo came from),
  [docs/ARCHITECTURE.md](../ARCHITECTURE.md) launcher section, both package READMEs, and the website
  ([1.introduction/4.configuration.md](../../container/website/content/1.introduction/4.configuration.md)
  "Choosing the compiler binary" + a pointer from
  [2.guide/9.linting.md](../../container/website/content/2.guide/9.linting.md)). Every one carries
  the version-divergence warning.

**Deferred:** `settings.runtypes.binary` for the lint lane (the "consider also" bullet). It
reverses a deliberate, documented decision in
[packages/ts-runtypes-devtools/src/eslint/index.ts](../../packages/ts-runtypes-devtools/src/eslint/index.ts)
(the binary and cwd are intentionally not configurable) and the env var alone unblocks the
motivating case. While implementing this, though, the e2e fixture turned out to already SET that
ignored setting — filed separately as
[docs/todos/lint-settings-binary-ignored.md](lint-settings-binary-ignored.md).
