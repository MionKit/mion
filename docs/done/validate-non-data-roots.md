---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# Validate refuses every non-data type at the root

## Intent

Every `runtypes` test run printed 10 `DWN001` warnings ("unused `@mion-downgrade-error`") over symbol-literal validators in `Atomic.ts` and `symbolLiteralWire.test.ts`. The comments were not stale by design. Their VL002 came from a `noLiterals` test that shared the same type, and removing that option took the error away by accident. Validate had been checking a symbol literal by its description at the root, which breaks the contract: validators check `DataOnly<T>`, and `DataOnly` turns every non-data type into `never`.

## What shipped

- **Validate and validationErrors refuse every non-data root** with an alwaysThrow factory and a RuntimeError, like a bare `symbol`:
  - symbol literal (`typeof sym`): VL002 / VE002
  - function, method, call signature, callable interface: new VL003 / VE003
  - `Promise`, `RegExp`: VL001 / VE001
- **The same refusal reaches the root from a propagating slot:** an array item, a tuple slot (a function slot no longer falls back to `=== undefined`), and a union made only of non-data members. validationErrors now throws for such a union too, instead of delegating to a validator that throws later.
- Object properties and mixed unions still drop these members with the existing warnings.
- The 10 comments stay, and now match real errors.
- **Gate:** `pnpm run lint:directives` (part of `pnpm run lint`) runs the `runtypes/invalid-downgrade-error` and `runtypes/invalid-expect-error` rules at `error` on every tracked `packages/*.ts` file that carries a directive, since the main oxlint config ignores `test/` and `examples/`. A stale directive now fails lint.
- Tests: Go root / array / tuple / union cases for all kinds in both families; the JS validation suites expect `factoryThrows`; the feature tests expect the throw. In the benchmarks, mion marks these cases `NOT_SUPPORTED`; the other libraries keep running them.

## Docs

The website already said a non-data root fails the build. The diagnostics catalog was regenerated for VL003 / VE003.
