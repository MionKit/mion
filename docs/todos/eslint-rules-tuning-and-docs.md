# ESLint rule set: severity tuning, duplicate CLS001, and the deepkit-era import rules

**Status:** todo
**Created:** 2026-07-27 (split out of the retired `docs/partially/`; the adoption itself shipped —
see [../done/adopt-ts-runtypes-eslint-plugin.md](../done/adopt-ts-runtypes-eslint-plugin.md))

`@ts-runtypes/devtools/eslint`'s `configs.recommended` (24 resolver-backed `runtypes/*` rules) is
wired into `eslint.config.js` and green. Four judgement calls were deliberately deferred at
adoption time rather than guessed at. None is blocking: `pnpm run lint` is **0 errors across 13
projects** today.

## 1. Severity policy for the first release

`recommended` keeps several rules at `error`: `invalid-marker`,
`validate`/`json`/`binary-non-serializable`, `format`, `non-enumerable` and others. They pass on
today's code, but the question is whether an `error` is right for a *consumer's* first encounter
with mion, or whether some should start at `warn` and be promoted deliberately.

Decide per rule; record the rationale in `eslint.config.js` so the next reader knows it was a
choice, not a default.

## 2. Duplicate `CLS001` emission

Every `runtypes/class-serializer` (CLS001) advisory fires **twice**. Visible in any build or lint
run touching `packages/core/src/errors.ts` (the `RpcError` structural-serialization notice).
Cosmetic — but it is noise on a warning users are meant to act on.

Likely an upstream double-report. Investigate whether it is mion's config (the rule reachable
through two config layers) or `@ts-runtypes/devtools`; if upstream, file a todo in `ts-run-types`
rather than working around it here.

## 3. Re-evaluate `no-type-imports` / `enforce-type-imports`

These two mion rules are **deepkit-era**: they exist because deepkit's runtime reflection needed a
value import to preserve type metadata, so `import type` silently broke reflection. That is the
warning still shouted in CLAUDE.md's "TYPE IMPORTS !!CRITICAL!!" section.

Under `@ts-runtypes` the resolution happens at **build time** via the Go resolver reading the
TypeScript program, so an `import type` of a marker/format type may now be perfectly safe. If so,
both rules are enforcing a constraint that no longer exists, and CLAUDE.md's warning is stale too.

**Do not guess** — verify with a real case: write a route whose param type is `import type`-ed and
confirm whether the resolver still injects correct markers and the runtime validates. Keep the
rules only if a genuine failure mode remains. If they go, update CLAUDE.md in the same change.

## 4. Website rule-set documentation

`website/content/5.devtools/2.eslint-rules.md` documents only mion's own rules — it has **zero**
mentions of `runtypes/*`.

The removed `type-formats-imports` rule has since been stripped from that page (see
[website-stale-package-references.md](../done/website-stale-package-references.md)), so what is left
is purely additive: document the upstream `runtypes/*` family alongside mion's own rules, at
whatever severities item 1 lands on.

## Context

The adoption was additive, not a swap: no mion rule was dropped. mion's `pure-functions` covers
the runtime `registerMionPureFn` lane that the upstream marker-based rule does not scan, and
`strong-typed-routes` / `no-vite-client` / `no-unreachable-union-types` /
`no-mixed-union-properties` have no upstream equivalent. The one genuinely obsolete rule,
`type-formats-imports`, was already removed.
