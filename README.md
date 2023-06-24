<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/public/logo-dark.svg?raw=true">
    <source media="(prefers-color-scheme: light)" srcset="./assets/public/logo.svg?raw=true">
    <img alt='mion, a mikro kit for Typescript Serverless APIs' src='./assets/public/logo.svg?raw=true' width="403" height="150">
  </picture>
</p>

<p align="center">
  <strong>Typescript Apis at the speed of light 🚀</strong>
</p>

<p align=center>
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

## USING TYPIA => CONCLUSIONS

- Typia blockers:

  - Ability to obtain metadata from function parameters
  - Ability to obtain metadata from function return value
  - Can we even add comments for return values?

- Typia pros:

  - Faster JSON serialization/deserialization
  - Automatic random generator
  - Getting more track then deepkit and main maintainer seems less of a personality then the one from deepkit
  - has AOT compilation and outputs better (lees) code. ATM deepkit seems to import all typescript compiler (maybe a bug?)
  - types are declared in comments rather than types.

- Typia cons:
  - code quality seem to be worst than deepkit
  - having the metadata during the runtime instead generating functions is lees flexible than having the type information at runtime

## Tests

[reflectionTypia.spec.ts](./packages/router/src/reflectionTypia.spec.ts)

## Notes

when using console log `getJsDocTags()` in the typia source code looks like the metadata (type info) from the function parameters is not parsed so maybe just need some contribution to the project might fic it.
