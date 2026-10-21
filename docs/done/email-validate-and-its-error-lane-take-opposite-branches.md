---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# The email validator and its error lane took opposite branches

## Problem

`email.go` emits two lanes for one format, and they tested the same two conditions in opposite
order. Validate ran `emailHasParts` then `emailHasRfc`; the error lane ran `emailHasRfc` then
`emailHasParts`. A format carrying BOTH keys therefore validated under the decomposition rules and
reported errors under the RFC ones.

Reachable from the public surface: `EmailAddress<P>` defaults set `emailRfc: 'ascii'` and its bound
pinned only `pattern`, so `localPart` / `domain` stayed free. `ValidateParams` rejected `pattern`
with `localPart`/`domain` but said nothing about `emailRfc` with them.

Measured before the fix:

```ts
type E = EmailAddress<{localPart: {maxLength: 8}}>;
createValidateFn<E>()('averyveryverylonglocalpart@example.com');            // false
createGetValidationErrorsFn<E>()('averyveryverylonglocalpart@example.com'); // []
```

That breaks the validate / getValidationErrors agreement invariant (fuzz oracle O4) in the worse
direction: a caller using the error list as its gate accepted a value the validator rejected.

## The two questions, and the answers

The spec asked which path should win, and whether the combination should reach emit at all. Both
answers shipped, because neither is sufficient alone.

**Which path wins: the decomposition.** Both lanes now test `emailHasParts` before `emailHasRfc`,
the order `domain.go` already uses for `domainHasNames` before `domainHasIdna`. The reason is not
that one lane already spelled it that way. `localPart` / `domain` only ever arrive because a field
author wrote them, while `emailRfc` only ever arrives as a preset default, so when one has to win
the explicit rule beats the default. It also leaves the validate lane's output byte-identical, so no
format that compiles today changes shape.

**The combination is rejected too.** `ValidateParams` now reports
``FormatEmail: cannot combine `emailRfc` with `localPart`/`domain` `` (FMT002), exactly as it
already does for `pattern` with the same two keys. Ordering alone was not enough: either order
silently drops a rule the author asked for, the RFC grammar or the local-part bound, and a silent
drop is what the finding was about.

**Ordering alone and rejection alone are both incomplete**, which is why both landed. FMT002 is a
`LevelRuntimeError`: the code IS emitted, every build lane halts but a dev server only reports it,
and `downgradeErrors` / `@mion-downgrade-error` can stand it down deliberately. So an annotation
carrying both keys still reaches emit in real lanes, and the two lanes have to agree on their own.

**The preset bounds narrowed, the other half of the rejection.** `EmailAddress` and `IdnEmail` (and
their `emailAddress` / `idnEmail` builders) now pin `'pattern' | 'localPart' | 'domain'`, so the
combination is a TypeScript error at the field, before any build runs. `EmailStrict` is the road
that owns the split and is unchanged. `EmailPunycode` was left alone: it carries `pattern`, so
adding `localPart` was already an FMT002 today.

**Running both roads together was considered and not built.** A field wanting "an RFC address whose
local part is at most 8 characters" has no spelling now. Adding one means the RFC engine and a
localPart sub-format both judging the same half, where they can disagree by design (the RFC accepts
a quoted local part a sub-format pattern would reject), and it doubles the `errorType` modes a
consumer sees. That is a feature with its own design questions, not this fix; `EmailStrict` covers
the same ground with the split's own rules.

## What changed

- [email.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/string/email.go) —
  `EmitValidationErrorsCheck` tests the decomposition first, like `EmitValidateCheck`;
  `ValidateParams` rejects `emailRfc` with `localPart`/`domain`.
- [stringFormats.ts](../../packages/run-types/src/formats/string/stringFormats.ts) — the two RFC
  presets and their builders pin the two split keys.
- [02.type-formats.md](../../container/website/content/02.runtypes/02.guide/02.type-formats.md) —
  one sentence naming `TF.EmailStrict` as the format that takes `localPart` and `domain`.

## Evidence

- `email_lane_agreement_test.go` — both lanes emit the decomposition for a params set carrying both
  keys, and `ValidateParams` rejects the pair while accepting each road alone. Both tests fail on
  the parent commit: the error lane emitted `isEmailAddress` where the validate lane split on `@`,
  and no message was reported.
- `assertionsEmailPresetRoads` in `typesafety.test.ts` — the pair is unspellable on the presets and
  on the builders. Widening either bound back makes the check fail with TS2578, so it is load
  bearing rather than decorative.
- `emailLaneAgreement.test.ts` — validate and getValidationErrors agree on each of the three roads
  through the full plugin pipeline, in the static and the value-inferred marker shape, plus the
  retuned-bound preset case. This is the regression guard for O4 on email; the both-keys case it
  cannot express, since the build now rejects it, is what the Go test covers.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm test` green.

## Not covered here

`domain.go` has the same shape (`idna` alongside `names`/`tld`) and does NOT reject the pair. It is
not the same bug: both its lanes already pick `names` first, so nothing diverges, and the
`Hostname` / `IdnHostname` presets pin `names`/`tld` so a field cannot build the pair. Making it a
build error there is tidier but changes no behaviour, so it stayed out.
