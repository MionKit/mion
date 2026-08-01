# Rename the `size` config object to `binarySizing`

**Status:** done
**Type:** chore — config-surface rename, guidelines only
**Created:** 2026-07-30
**Completed:** 2026-08-01
**Found by:** PR #302 review (M-jerez): the key name is too generic for what it tunes

## Problem

The tsconfig plugin / bundler-plugin key `size` groups the binary encoder's
cold-start buffer-estimate knobs (`bias`, `items`, `stringBytes`, `maxBytes`).
"size" says nothing about WHAT it sizes — a reader scanning the options table
cannot tell it is binary-serialization tuning. Rename it to `binarySizing` on
every surface.

## Surfaces to rename (the `hashLength`/`emitMode` trace, in reverse)

- `cmd/ts-runtypes/config.go` — `tsRuntypesPlugin.Size *sizePluginConfig`
  json tag `size` → `binarySizing` (+ regen `pnpm rtx core codegen pluginkeys`;
  the plugin-option parity test then forces the JS side).
- `packages/ts-runtypes-devtools/src/unplugin.ts` — `PluginOptions.size` →
  `binarySizing` + the guarded spread; `plugin-option-keys.ts` row.
- `packages/ts-runtypes-devtools/src/resolver-client.ts` — the forwarded
  options field (the CLI flags `--size-bias` / `--size-items` /
  `--size-string-bytes` / `--size-max-bytes` can stay or move to
  `--binary-sizing-*`; decide during implementation — renaming them touches
  `cli-surface` snapshots and `main.go` sharedFlags).
- Website: `1.introduction/4.configuration.md` main-table row + the `size`
  sub-table heading.
- `docs/ARCHITECTURE.md` if it names the key.

## Compatibility decision

Owner's call (2026-08-01): **outright rename, no back-compat shim, external
consumers ignored** — treated as if `binarySizing` had always been the name. The
CLI flags moved too.

## What shipped

| Surface | Before | After |
| --- | --- | --- |
| tsconfig plugin key | `size` | `binarySizing` |
| Go struct | `tsRuntypesPlugin.Size *sizePluginConfig` | `.BinarySizing *binarySizingPluginConfig` |
| Bundler plugin option | `PluginOptions.size` | `PluginOptions.binarySizing` |
| CLI flags | `--size-bias` / `--size-items` / `--size-string-bytes` / `--size-max-bytes` | `--binary-sizing-bias` / `-items` / `-string-bytes` / `-max-bytes` |
| `ResolverClientOptions` | `sizeBias` / `sizeItems` / `sizeStringBytes` / `sizeMaxBytes` | `binarySizingBias` / `binarySizingItems` / `binarySizingStringBytes` / `binarySizingMaxBytes` |

The nested inner keys (`bias` / `items` / `stringBytes` / `maxBytes`) are
unchanged — they were never the ambiguous part, and they now read as
`binarySizing: {bias, items, …}`.

`ResolverClientOptions` was renamed alongside the flags to keep the file's
stated "same name as the CLI flag, for greppability" convention intact.

## One deliberate non-rename, and the coupling it protects

`BinarySizingOptions` in the marker package (the runtime
`createMockDataFn(…, {mock: {binarySizingOptions}})` surface) keeps its
`sizeBias` / `sizeItems` / `sizeStringBytes` / `sizeMaxBytes` members. It is NOT
the `size` config object this todo is about, and its enclosing type already says
`BinarySizing`.

That matters because the two shapes were structurally coupled on purpose:
`typeFuzzHarness.openClient(cfg)` spread a `Required<BinarySizingOptions>`
straight into `ResolverClientOptions`, so ONE config literal drove both the
resolver's baked cold-start estimate and the mock generator's value bounds —
which is exactly what makes the binary-size fuzz oracle sound. Renaming the
build side alone would have silently broken that spread, so `openClient` now
maps the four fields explicitly and documents why.

**Residual asymmetry, left for the owner:** the runtime spells them `sizeBias`
inside `binarySizingOptions` while the build side spells them
`binarySizingBias`. Collapsing the runtime members to bare
`bias` / `items` / `stringBytes` / `maxBytes` would make the runtime object
identical in shape to the tsconfig `binarySizing` block, which is the tidier end
state — but it is a public runtime API change outside this todo's scope, so it
was not taken.

## Verified

- `pnpm rtx core codegen pluginkeys` regenerated: the generated tsconfig key
  list flips `'size'` → `'binarySizing'`, and the plugin-option parity test then
  forces the JS side (it passes).
- `ts-runtypes serve --help` lists the four `--binary-sizing-*` flags; no
  `--size-*` flag remains.
- cli-surface golden regenerated: exactly the four flag renames.
- Go: `go -C ts-go-runtypes test ./internal/... ./cmd/...` green (buildconfig
  merge tests included).
- JS: `pnpm test` green — 241 files / 8294 tests.
- `pnpm run lint` + `pnpm run format` green.
- Website configuration page updated (main table row + sub-table heading); the
  page's MDC-component and code-fence counts match the pre-edit baseline.
- `docs/ARCHITECTURE.md` never named the key, so it needed no edit.

## Done when

- [x] `binarySizing` works flag > tsconfig > default on every surface; `size` is
      gone. Plugin-option parity, buildconfig merge tests, and cli-surface
      snapshots updated; the configuration page shows the new name.
- [x] Disk-cache fingerprint inputs are VALUES, not key names — no fingerprint
      change.
