# compiler: package types

Read before making the compiler reuse anything an installed package ships.

## A type from an installed package is always rebuilt from its `.d.ts`

- Consumer naming a package type (`createValidate<LibUser>()`) builds own ids + code from the `.d.ts`, own tsconfig.
- Never make the compiler reuse ids or generated code a package ships. Why:
  - package generated only the families its own call sites asked for; any other is rebuilt anyway;
  - package type nested in a consumer type, or a consumer-instantiated generic (`Page<LibUser>`), has no package id;
  - consumer's checker decides the type for consumer code; package-tsconfig code would check a different type.
- Package wanting its own build used exports the fn: `export const validateUser = createValidate<User>()`.
  A regular import runs it unchanged.
- Two builds agreeing over a wire (mion client + server) compare ids instead (`ApiBuildVersion`,
  `rpc-client-server-version-mismatch`).
- Pure fns = the one shipped artifact (`mion-pure-fns/`): bodies not derived from a type, a `.d.ts` cannot rebuild them.
