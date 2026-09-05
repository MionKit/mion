---
type: fix
spec: guidelines
status: ready
created: 2026-09-05
---

# A type-id collision fails the build and points at `hashLength`

## Intent

Today `hashid.Dict` answers a type-id collision by re-hashing the second type at a longer length
(7, 9, 11 characters...) and only gives up after 22 attempts. Two colliding types silently get ids
of different lengths, nothing tells the user, and the id length stops being the configured
number. Instead, a collision at the configured length should stop the build with a diagnostic
that names both types and tells the user to raise `hashLength`. With the two-lane hasher a
collision at seven characters is a rare event, so failing loudly costs nothing in practice and
keeps every type id at exactly the configured length.

## Direction

The implementer plans the details. What was checked:

- The extension lives in `hashid.Dict.UniqueSalted` (`ts-go-runtypes/internal/cachegen/hashid/hashid.go`):
  on a taken hash it grows `length` by `hashIncrement` per attempt and re-hashes with the previous
  hash as `prev`; `MaxCollisions` and `ErrTooManyCollisions` are the only stop. The caller is
  `uniqueDict` in `ts-go-runtypes/internal/cachegen/runtype/serialize.go`, which salts with the
  binary version. Remove the growth loop: a taken hash for a different id is the collision.
- The length knob already exists end to end: `Options.HashLength` in `cachegen/runtype`
  (`hashLength()` falls back to `hashid.DefaultLength`), `hashLength` in the tsconfig `mion`
  block (`ts-go-runtypes/cmd/mion/config.go`), and `hashLength` on the devtools plugin
  (`packages/devtools/src/core/unplugin.ts`). The diagnostic names that option and the value to
  try (the current length plus one).
- The error must be a registered diagnostic (family, severity error, scope not-source, a headline
  in `internal/diagnostics/messages.go`, catalog regenerated) that carries both structural ids or
  the two type names, so the user can see what collided; a bare Go error from `Dict` would only
  surface as an opaque generate failure.
- `hashid_test.go` pins the extension today (`TestQuickHash_PrevExtension`,
  `TestUnique_ResolvesCollisionByExtension`, the `prev` argument of `QuickHash`); those tests and
  the `prev` parameter go if nothing else uses them, and a test pins the new behaviour with the
  crafted pair that collides in one lane.
- The non-dictionary escape ids (`x_`, `x_at_` in `serialize.go`) never went through `Dict`; leave
  them as they are.

## Done when

- Two distinct types hashing to the same id at the configured length fail the build with a
  diagnostic naming both and the `hashLength` option; no id is ever extended and every type id
  has exactly the configured length.
- `Dict` no longer grows lengths; its tests pin the failure instead of the extension; Go and JS
  suites are green.
