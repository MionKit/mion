---
type: fix
spec: guidelines
status: ready
created: 2026-11-07
---

# Overlapping index signatures with different value types

## Intent

When one object carries two index signatures that both match a key and their value types differ, every family picks a
different rule for that key, so values do not round trip and valid data fails validation:

- `{[k: string]: string | bigint; [k: number]: bigint}`:
  - validate and getErrors check every key against BOTH signatures, so `{a: 'x'}` fails, while TypeScript only applies
    a number signature to numeric keys. A validation suite case pins the opposite reading: "`{[k: number]: T}`
    normalises to the same shape as a string-key index signature" (`test/suites/validation/Object.ts`).
  - The mutate encoder sweeps once per signature, so a key gets both transforms: `5n` becomes `[1,'5']`, then
    `'1,5'`. The mutate decoder sweeps twice the same way.
  - The clone encoder lets the LAST plain signature win (`buildSafeIndexSignatureObject`), the clone decoder the FIRST
    (`emitIndexSigRebuildLoop` breaks on it), so the pair disagrees on the wire.
- `{[k: string]: string | bigint; [k: \`n${number}\`]: bigint}`: validate rejects `{a: 'x'}` (the template signature
  refuses every key its pattern misses, even when a string signature beside it accepts the key), and the mutate pair
  again applies both transforms to an `n1` key.

Signatures with the SAME value type already sweep once in every family, so `Record<string | number, T>` is fine.

## Direction

- Decide the rule first, it is a design call: does a number signature govern only numeric keys (TypeScript), or every
  key (the current validation reading)? Does a pattern signature next to a broader one only constrain the keys it
  matches?
- Then one rule for every family: which signature owns a key, applied the same way by validate, getErrors, the
  unknown-key families, and every encoder / decoder pair. The clone decoder's "first matching arm wins" shape is a
  candidate for all codecs.
- A key matched by several signatures must satisfy each one that matches (TypeScript requires the narrower value to
  fit the broader one, so validating the narrowest is enough), and get exactly one transform.
- The implementer plans the details. Keep same-value signatures sweeping once: the RECORDS benchmark cases depend on it.

## Docs

The validation and serialization pages that describe records / index signatures, existing sections, if the rule
changes what a user sees.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The two types above validate and round trip in every strategy, with tests per family.
- The validation suite case that pins the number signature reading matches the chosen rule.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
