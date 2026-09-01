# @mionjs/router guidelines

## `import type` is SAFE in routes and middleFns

RunTypes resolves types at BUILD TIME from the TypeScript program and injects the compiled functions at the `route()` / `middleFn()` call site, so an erased import changes nothing. Guarded by [src/typeOnlyImports.spec.ts](src/typeOnlyImports.spec.ts).

This was NOT true under deepkit, whose runtime reflection was emitted from the import statement — `import type` stripped the metadata and caused silent failures. That is why the repo guidelines used to carry a "TYPE IMPORTS !!CRITICAL!!" warning and why `@mionjs/no-type-imports` existed; both are gone. Do not reintroduce either.

## Public env knob

`GENERATE_ROUTER_SPEC` is a public runtime knob read by this package. It is deliberately unprefixed (renaming it to `MION_*` would break consumers who already set it) — the one exception to the repo's env-var prefix rule.
