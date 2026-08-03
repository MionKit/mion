---
type: fix
spec: guidelines
status: ready
created: 2026-08-03
---

# The link-speed icon in BenchTable renders nothing

Found while adding the per-column info hint to the benchmark tables
([BenchColumnInfo.vue](../../container/website/app/components/content/BenchColumnInfo.vue)).
Predates that change.

## Evidence

[BenchTable.vue](../../container/website/app/components/content/BenchTable.vue)
draws the serialization page's link-speed label with a Tabler webfont glyph:

```html
<span id="bench-bw-label" class="bench-bw-label"><i class="ti ti-wifi" aria-hidden="true"></i> link speed</span>
```

Nothing in the site defines those classes:

- `ti ti-wifi` is the only `ti`-prefixed usage in `container/website/app/`.
- No `@font-face`, no `.ti` rule, and no `@tabler/icons*` dependency in
  `container/website/_deps/package.json`.
- In the built site `ti-wifi` appears **only** inside the JS chunk that carries
  the template string, never in any emitted CSS.
- The rendered page shows a bare "link speed" with no glyph in front of it.

The site's real icon mechanism is Iconify through Nuxt UI, spelled
`i-<collection>:<name>` (see `app/app.config.ts`, e.g.
`i-vscode-icons:file-type-typescript`). So the `<i>` is an empty inline element
that only contributes a stray space before the label.

Cosmetic, not functional. It is filed because the fix is a one-liner and the
current markup reads as if an icon were intended.

## Direction

Either drop the `<i>` entirely, or replace it with something the site actually
renders. Two options that match existing house style:

- an Iconify name (`i-lucide:wifi` or similar) if that collection is available
  offline in the container, or
- an inline SVG, the approach BenchColumnInfo took for exactly this reason (no
  dependency, always renders, inherits `currentColor`).

While in there, check `.bench-bw-label .ti` in the same file's `<style scoped>`
block: it styles a class nothing carries, so it goes with the `<i>`.

## Done when

The link-speed label either shows a real icon or has no icon markup left, the
orphan `.bench-bw-label .ti` rule is gone, and a grep for `class="ti ` across
`container/website/app/` returns nothing.
