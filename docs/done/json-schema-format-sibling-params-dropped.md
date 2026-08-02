---
type: bug
spec: mini-plan
status: done
created: 2026-08-02
---

# Named `format` beside constraint keywords drops the keywords

> **SHIPPED** (2026-08-02, feature/json-schema-rollout M9): siblings now
> apply. Two architectural decisions taken (best-judgment, logged here):
> (1) minLength/maxLength REPLACE the brand's default bounds for the
> variable-width pattern families (email / hostname / uri) — fidelity is
> to the DOCUMENT, and the RFC-ish brand defaults are the type-first
> surface's opinion; the Go emitters already enforced length params via
> namedPatternValidate, so no Go change was needed. (2) On the
> fixed-width families (uuid / date / time / date-time / ipv4 / ipv6) a
> length sibling is redundant-or-contradictory, and `pattern` or
> `contentEncoding` beside ANY named format would stack a second pattern
> slot — all resolve never, loud over lossy. Mocks: named-family draws
> now length-filter against the merged bounds (32-attempt loud
> exhaustion). Pinned in referencesUneval.test.ts ("format sibling
> keywords") incl. distinct-identity, never-poisons, and marker pair.

`{type: 'string', format: 'email', minLength: 5}` recovers the Email brand
and silently ignores minLength — StringFrom's format branch returns
`BrandBySchemaFormat[F]` without consulting `StringParamsFrom<S>`. Same for
every named format beside length / pattern keywords. Violates the
"constraint accepted is a constraint enforced" doctrine.

Pre-existing (shipped with the original M1 subset); spotted during the M6
content-keyword work, where the same shape was handled by folding sibling
params into ONE annotation (the jsonContent family carries its string
params — see StringFrom). Out of scope there because named-format params
merge needs the Go emitters to accept extra length params per family.

## Fix plan

1. Go: named string emitters (email/uuid/date/…) append
   `lengthConditions(params, vλl)` like stringformat.go does, so extra
   params are enforced rather than ignored.
2. Translation: format branch becomes
   `BrandBySchemaFormat[F] with params StringParamsFrom<S>` — a
   TypeFormat re-brand carrying the extra keys (id impact: only for
   schemas that carry the siblings today, whose constraints were dropped).
3. Rows in json-schema-define pinning `format + minLength` enforcement,
   both marker shapes.
