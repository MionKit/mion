---
type: fix
spec: guidelines
status: ready
created: 2026-10-01
---

# Domain Pattern Path Ignores allowedValues, maxParts and minParts

## Intent

The default domain presets (`TF.Domain`, `DomainUnicode`, `DomainPunycode`) validate with a pattern. On that
path `allowedValues`, `maxParts` and `minParts` are silently ignored: the field accepts any domain the
pattern accepts. `DomainParams` documents `allowedValues` as "only these exact domains validate", so a user
gets no error and no check.

```ts
type Site = TF.Domain<{allowedValues: {val: ['example.com']}}>; // accepts 'other.org' today
```

## Direction

- `domainEmitter.EmitValidateCheck` / `EmitValidationErrorsCheck`
  (`ts-go-runtypes/internal/cachegen/typefunctions/formats/string/domain.go:30-46`) fall through to
  `namedPatternValidate` / `namedPatternErrors` (`string/pattern.go:62-88`), which emit only length and pattern.
- `domainEmitter.ValidateParams` (`domain.go:58-84`) does not reject the combination.
- Decide: validate those params on the pattern path (validate and errors in the same order, reusing
  `stringErrorStatements` / the decomposition's parts checks), or reject them at build time with a diagnostic
  (add-diagnostic skill). The first matches the documented contract.
- Check `email`'s pattern path for the same gap.
- The implementer plans the details.

## Docs

The domain section of `container/website/content/02.runtypes/03.type-formats/` only if the supported params
change.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

A domain on the pattern path either enforces `allowedValues`, `maxParts` and `minParts` (validate and
validation errors agree) or rejects them at build time; format-validation tests pin it; the simplify-docs pass
ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
