# Rename the `size` config object to `binarySizing`

**Status:** todo
**Type:** chore — config-surface rename, guidelines only
**Created:** 2026-07-30
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

## Compatibility decision for the implementer

This is a breaking rename of a public tsconfig/plugin key on a 0.x library.
Either rename outright (release-notes entry), or accept BOTH keys for one
release with the old one logging the `unknownPluginKeys`-style stderr warning
in reverse ("size is now binarySizing"). Prefer the outright rename unless a
consumer is known to set it.

## Done when

- `binarySizing` works flag > tsconfig > default on every surface; `size` is
  gone (or warns, per the decision above); plugin-option parity, buildconfig
  merge tests, and cli-surface snapshots updated; the configuration page shows
  the new name. Disk-cache fingerprint inputs are VALUES, not key names — no
  fingerprint change.
