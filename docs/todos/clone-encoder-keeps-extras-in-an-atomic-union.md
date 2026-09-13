---
type: fix
spec: guidelines
status: ready
created: 2026-09-13
---

# The clone encoder keeps undeclared keys inside an all-atomic union

## Intent

`clone` promises that only what the type declares reaches the wire. That promise does not hold for
a union whose members are all JSON-compatible atomics, for example `{a: string}[] | number`: the
encoder returns the value untouched, so an undeclared key on an object inside that union rides out
on the wire.

The decoder no longer has this gap. `rjs`, the stripping restore, strips in that case deliberately
rather than mirroring the encoder, so the two ends of a `clone` route now disagree and the encoder
is the weaker one. Closing it makes the pair symmetric again and the promise true.

## Direction

What was checked:

- **The gate is an early return.** `emitUnionPrepareForJsonSafeLayout`
  (`ts-go-runtypes/internal/cachegen/typefunctions/json_prepare_safe.go:813`) returns empty code
  when `layout.atomicOnlyJsonIdentity()` holds (`:819`). That predicate means "no object members
  and no envelope", and it is true for a union like the one above because the array member sits in
  the ATOMIC bucket, not the object bucket. Nothing then walks into the array's element objects.

- **The decode side is the reference.** `emitUnionRestoreFromJsonSafe`
  (`json_restore_safe.go`) uses the same gate but its atomic arms compile each member through
  `ctx.CompileChild`, so the element objects reach the rebuilding object arm and strip. The
  encoder skips the members entirely instead.

- **This is not the envelope rule.** `AtomicNeedsTuple` and `compactUnionNeedsEnvelope` decide
  what shape goes on the wire and must not move. The question here is only whether the members
  get walked, which is independent of whether the union envelopes.

- **The noop predicate has to move with it.** `isNoopForPrepareJsonSafe` mirrors this arm; if the
  emit starts walking members the predicate must stop calling the union a noop for the same
  shapes, or the entry is elided and the walk never ships.

The implementer plans the rest. Points to settle rather than assume: whether the fix is to widen
what the atomic bucket compiles or to narrow `atomicOnlyJsonIdentity`, and whether any wire bytes
change for a union that carries no undeclared keys (they should not).

## Done when

A `clone` route does not put an undeclared key on the wire for any union shape, the encoder and
the stripping decoder agree on what survives in both directions, the wire is byte-identical for
values that carry no undeclared keys, and the round-trip fuzz lane covers the shape.
