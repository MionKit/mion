# Build-time checks: enrich-text-\*

`enrich --no-emit` cross-references the authored literal against the live `RunType` and reports these.

## Shipped

- enrich-text-unknown-field (Warning): key is not a field of `T`. Stale (field renamed/removed), nothing reads it.
  Catches drift: rename a field → this flags the now-stale entry.
- enrich-text-unknown-error-key (Warning): `rt$errors` key is not an error this field can produce.
  TS catches keys the FORMAT never produces as an excess-property error.
- enrich-text-unknown-placeholder (Warning): unknown `$[…]` placeholder for this constraint/context.
  Checked per plural arm.
- enrich-text-plural-missing-other (Warning): plural object missing the mandatory `other` arm.
- enrich-text-unknown-plural-arm (Warning): plural-object arm key is not a CLDR category.
- enrich-text-plural-without-count (Info): plural object on a non-count-bearing constraint (dead arms).
- enrich-text-default-and-messages (Warning): `rt$default` beside any other `rt$errors` key.
  Modes are mutually exclusive; the catch-all silently wins.
- enrich-text-missing-message (Warning): a failure this field can produce has no `rt$errors` key
  (and no `rt$default`) → shows a generic message.
- enrich-text-reserved-prefix (Error): a property of `T` is named `rt$…`, the reserved meta prefix.
  `enrich` refuses the type up front, writes no mirror. Rename the property.
- Unfilled scaffold: enrich-text-todo-left / enrich-text-blank-value (Warning).

## Designed (not yet wired)

- enrich-text-missing-label (Info): field of `T` has no label (renders the raw name).
- enrich-text-shape-mismatch: object node where `T` is scalar, or vice-versa. `FriendlyText<T>` mapped type catches it.
- enrich-text-type-drift: `T`'s structural id changed since authored, review for drift.

## Levels

- Content checks are **Warnings** (one Info): message still renders, falls back to something less specific
  (generic "value is invalid", the `other` plural arm, the raw field name).
- Degraded text = enrichment that did not apply, not a broken function.
- **enrich-text-reserved-prefix is the one Error**: enrich plan fails, no mirror file written at all.
- enrich-text-todo-left / enrich-text-blank-value fail `enrich --require-complete` through their
  completeness flag, not their level.
