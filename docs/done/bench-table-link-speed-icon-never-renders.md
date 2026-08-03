---
type: fix
spec: guidelines
status: done
created: 2026-08-03
completed: 2026-08-03
---

# The link-speed icon in BenchTable renders nothing

Found while adding the per-column info hint to the benchmark tables
([BenchColumnInfo.vue](../../container/website/app/components/content/BenchColumnInfo.vue)).
Predated that change.

## Evidence

[BenchTable.vue](../../container/website/app/components/content/BenchTable.vue)
drew the serialization page's link-speed label with a Tabler webfont glyph:

```html
<span id="bench-bw-label" class="bench-bw-label"><i class="ti ti-wifi" aria-hidden="true"></i> link speed</span>
```

Nothing in the site defined those classes:

- `ti ti-wifi` was the only `ti`-prefixed usage in `container/website/app/`.
- No `@font-face`, no `.ti` rule, and no icon dependency in
  `container/website/_deps/package.json`.
- In the built site `ti-wifi` appeared **only** inside the JS chunk carrying the
  template string, never in any emitted CSS.

Measured on the running dev server, which is what settled it:

```
box:           { w: 0, h: 17.5 }   <- zero width, nothing drawn
beforeContent: "none"              <- no ::before glyph
fontFamily:    ui-monospace, ...   <- inherited mono stack, not an icon font
loadedFonts:   []                  <- no webfont loaded on the page at all
```

An icon font renders its glyph through a `::before` with content. There was
none, no webfont was loaded, and the element was zero-wide.

Worth recording because it was briefly disputed: the link-speed **control** was
never broken. The bar, the 10/100/1000 Mbps buttons and the live round-trip
recalculation all worked. Only the decorative glyph in front of the label was
missing, leaving a `margin-right: 0.15rem` of empty space. The scoped rule
`.bench-bw-label .ti` *did* apply (font-size computed to 15.2px), so the markup
and CSS had landed and only the font dependency never did.

## What shipped

Replaced the `<i>` with an inline SVG wifi mark, the same approach
BenchColumnInfo took in the commit that surfaced this, and for the same reason:
no dependency, always renders, inherits `currentColor` so it follows the label's
theme token.

- Three concentric arcs plus the dot, all sharing the centre `(8, 13.4)` in a
  `0 0 16 16` viewBox, drawn at 13x13.
- `.bench-bw-label .ti` became `.bench-bw-icon`, keeping the optical alignment
  (`vertical-align: -0.14em`) and the gap before the text.

Verified on the dev server: the box measures 13x13 (was 0 wide), the mark
inherits the muted label colour, and
`document.querySelectorAll('i.ti, [class*="ti-wifi"]')` returns 0.

## Done when

- [x] The link-speed label shows a real icon.
- [x] The orphan `.bench-bw-label .ti` rule is gone.
- [x] A grep for `class="ti ` across `container/website/app/` returns nothing.
