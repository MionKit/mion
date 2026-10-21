# typefunctions: decoder guards, format error keys

Read before adding a JSON decoder arm, a format or a format param.

## ⚠️ MustValidateJson: a JSON decoder checks the wire shape before it converts

- Validation runs on the RESTORED value, after decode → decoder = only check between attacker JSON and a constructor.
- Why: `new Date(true)` is epoch 1, `BigInt('')` is `0n`, `new Set(null)` is an empty set.
- Restore arm converts only the exact form the encoder writes. Anything else stays untouched for validate to refuse.
- Guard = `typeof`, `Array.isArray`, `Number.isInteger` or bigint-regex check on the SAME variable it converts.
- Kinds that convert: `MustValidateJson` in [reflection/must_validate_json.go](../../reflection/must_validate_json.go).
- New kind whose decoder calls a constructor on a wire value → add it there AND guard its arm on every JSON road:
  `json_restore.go`, `json_compact_restore.go`, `json_restore_clone.go`.
- Else `must_validate_json_test.go` fails (per kind, and the inverse: a transform under an unflagged kind).
- Else the JS `GC-GUARD` generated-code oracle fails: `packages/run-types/test/fuzz/security/generatedCodeOracle.ts`.
  Runs over the nasty corpus in `pnpm test` and in the `secgen` fuzz lane.

## ⚠️ A new format or param needs error-key samples, or CI fails

- FriendlyText `rt$errors` keys come from each format's own validation-errors code. Never a hand list.
  Reader: `formats.ErrorKeysFor` ([formats/errorkeys.go](formats/errorkeys.go)).
- Editor's per-format key list = union over sample params in
  [formats/errorkeys_samples.go](formats/errorkeys_samples.go).
- New format → samples reaching every branch of its error code (else `TestErrorKeySamples_EveryFormat` fails).
- New format → also a row in `ParamsByFormat` in `packages/run-types/test/types/formatErrorKeysCoverage.test.ts`
  (else typecheck fails).
- New param → a sample, or an `excludedParams` entry with a written reason.
  Until then `formatErrorKeysCoverage.test.ts` fails typecheck.
- Then run `pnpm miondevx core codegen errorkeys`.
  CI's `codegen all --check` fails on a stale `formatErrorKeys.generated.ts`.
