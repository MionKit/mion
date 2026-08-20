# ESLint rule set: severities settled, `no-type-imports` deleted, `runtypes/*` documented

**Status:** done
**Created:** 2026-07-27 (the adoption itself shipped earlier — see
[adopt-ts-runtypes-eslint-plugin.md](adopt-ts-runtypes-eslint-plugin.md))
**Shipped:** 2026-08-20

Four judgement calls were deferred at adoption time. All four are settled.

## 1. Severity policy — keep `@ts-runtypes`' defaults, and say why

No severity was changed. `eslint.config.js` now carries the reasoning next to the config so the next
reader knows it was a decision, not an unexamined default:

- every `error` rule marks output that is **wrong or impossible to generate** (`invalid-marker`,
  `{validate,json,binary}-non-serializable`, `format`, `non-enumerable`, `invalid-override`, the
  enrichment-file rules) — the build fails on these anyway, so lint-time is strictly earlier;
- every `warn` rule describes something that **still works but silently drops or reshapes data**
  (`*-skipped-member`, `class-serializer`, `clone-shared-reference`, `unknown-keys`,
  `redundant-marker`, `override-side-effect`) — worth reading, not worth blocking a consumer's first
  build on.

The full set passes on this repo: `pnpm run lint` is 0 errors across 13 projects.

## 2. Duplicate CLS001 — upstream, and localised

Confirmed **not mion's config**, which was the obvious suspicion. `tsRuntypesESLint.configs.recommended`
is a single config object registering one `runtypes` plugin with one `class-serializer` entry, and
mion's own plugin uses the `@mionjs/` prefix with no CLS-style rule — yet the identical message is
emitted twice at the identical position. It doubles in the **vite plugin's** output too, so it is in
the diagnostic stream, not either consumer.

Nothing to fix here. Filed as
[../todos/upstream-cls001-duplicate-diagnostic.md](../todos/upstream-cls001-duplicate-diagnostic.md)
with the reproduction, and explicitly **not** worked around in mion's config.

## 3. `no-type-imports` — deleted. `enforce-type-imports` — kept.

**The spec was wrong to pair these two.** Only `no-type-imports` is deepkit-era.
`enforce-type-imports` is a 2026 bundle-hygiene rule (keeps backend code out of the frontend bundle),
has nothing to do with reflection, and is not enabled in `recommended` anyway. It stays.

`no-type-imports` existed because deepkit emitted reflection metadata from the import statement, so
`import type` erased it and silently broke validation. Under `@ts-runtypes` the resolver reads the
TypeScript program at build time and injects at the `route()` call site, so an erased import changes
nothing.

Verified before deleting, not assumed: **`packages/router/src/typeOnlyImports.spec.ts`** was written
first, declaring routes whose param and return types come from an `import type`, and asserting
reflection, param names, successful validation, *rejection* of bad input, and Date revival through
the JSON lane. It passed. The spec was kept as the regression guard for the deletion.

Removed: the rule and its spec, its registration in `packages/devtools/src/eslint/index.ts`, its two
example fixtures, its section in `website/content/5.devtools/2.eslint-rules.md`, its entry in
`test-publish/eslint.config.js`, and its stale advice in `packages/router/examples/eslint-rule-test.routes.ts`.
Devtools was rebuilt (its exports point at `./build/`, which is committed).

**Docs that asserted the dead constraint were rewritten, not just unlinked:**
`website/content/4.run-types/4.caveats.md`'s "Type-Only Imports" section now says `import type` is
safe and explains why it used to not be, and CLAUDE.md's "⚠️⚠️⚠️ TYPE IMPORTS !!CRITICAL!! ⚠️⚠️⚠️"
section was replaced with the current truth.

## 4. Website documentation for `runtypes/*`

`website/content/5.devtools/2.eslint-rules.md` documented only mion's own rules and had zero
mentions of `runtypes/*`. All 25 are now documented, grouped by what they cover (markers and pure
functions, validation, serialization, formats and overrides, generated enrichment files), each with
its recommended severity, plus the config snippet for enabling both plugins together and a note
recording the severity reasoning from item 1.
