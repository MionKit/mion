---
type: feature
spec: guidelines
status: ready
created: 2026-09-10
---

# A lint rule that errors on a variable-length type without a maximum

## Intent

A route whose params include a plain `string`, `string[]`, `Map`, `Set` or record cannot derive
its request limit from its types and falls back to the platform adapter's number. The author usually does
not notice. A lint rule should flag every such type at the call site, with the member that has no
bound, so a project can require bounded types everywhere it wants a derived limit.

## Direction

The implementer plans the details. What was checked:

- **The rule is a resolver diagnostic, the lint plugin is transport.** The `runtypes/*` lint rules
  (`packages/devtools/src/lint/`) are pure transport for the Go resolver's diagnostics: one
  resolver pass per file, then `diagnosticRouting.ts` fans the wire diagnostics out to rules. So
  the rule is a new diagnostic code the resolver emits at marker call sites, routed to a new rule
  (a name like `runtypes/require-bounded-types`), off by default or opt-in severity.
- **The walk already knows the answer.** `internal/cachegen/jsonsize` returns, for every reflection
  root, whether the type is bounded and the FIRST unbounded member path with its reason
  (`items[].name: string without maxLength`, `<value>: Map without maxSize`). The diagnostic
  carries that path; no second walk.
- **What counts as unbounded:** a string without `length` / `maxLength`, an array or tuple rest
  without `length` / `maxItems`, a Map or Set without `maxSize`, a record / index signature /
  `patternProperties`, a bigint without both bounds, `any` / `unknown` / `object`, RegExp, a
  user class, a recursive type. Named string formats without a length bound (an email, a URL)
  count as unbounded today; decide whether the rule accepts formats with an intrinsic maximum.
- **Scope and level.** Fire per site (`ScopeGraph`, with the nested example the catalog rules in
  `ts-go-runtypes/CLAUDE.md` require); a warning by default, since nothing is broken, promoted to an
  error by the rule's severity. Decide whether it covers every marker (`createValidateFn<T>()`
  included) or only mion route / middleFn params and return types, and whether a route with an
  explicit `maxBodySize` option is exempt.
- **Docs:** the linter page (`container/website/content/01.rpc/06.devtools/01.linter.md`) and a
  pointer from the security page's request-limit section.
- **Tests:** the diagnostic through the real scan (the trigger at the root and one object deeper),
  the routing test in `packages/devtools/test/`, and the ESLint / OXlint plugin tests.

## Done when

- A route or marker whose type has an unbounded member gets a diagnostic naming the member and
  the missing bound, at the call site.
- The rule is opt-in and documented, and a project that enables it as an error cannot build a
  route with an unbounded param by accident.
