---
type: fix
spec: guidelines
status: ready
created: 2026-09-23
---

# Number multipleOf with a decimal step rejects valid values

## Intent

`TF.Number<{multipleOf: 0.01}>` is the natural way to say "a price with at most two decimals", and the Go tests already call it a supported money use. It rejects ordinary values: `9.99` passes but `19.99` fails, because the generated check is `Number.isInteger(v / 0.01)` and `19.99 / 0.01` is `1998.9999999999998` in JavaScript. Anyone using a decimal step gets random rejections of valid input.

## Direction

- Repro: `createValidateFn<TF.Number<{multipleOf: 0.01}>>()`, then `19.99` returns `false`. `9.99` returns `true`.
- The check is emitted by `multipleOfCondition` in `ts-go-runtypes/internal/cachegen/typefunctions/formats/numeric/numberformat.go`. The whole-number branch (`v % n === 0`) is fine; only the fractional branch is wrong.
- Every place that reads the same param must agree: the error-list emitter beside the validator, mocking (a mock must pass its own check), JSON Schema output, and the binary sizing that reads number bounds. Look for other readers of `multipleOf`.
- Pick a fix that stays exact for ordinary decimal steps (for example, scale by the step's decimal places, or compare with a tolerance relative to the quotient) and say why in one line. The implementer plans the details.
- Follow the Marker test coverage rule in `ts-go-runtypes/CLAUDE.md` for any JS test that uses the marker API.

## Docs

Page: `container/website/content/02.runtypes/03.type-formats/03.number.md`, existing section Custom Number Formats. Its example deliberately uses a whole-number step (`multipleOf: 6`); once this is fixed, a money example with `multipleOf: 0.01` can go there if it reads better.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- `TF.Number<{multipleOf: 0.01}>` accepts `19.99` and `0.3`, and rejects `19.995`; the same holds for the error list and for mocks.
- A Go test pins the emitted check and a JS test pins the runtime results.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
