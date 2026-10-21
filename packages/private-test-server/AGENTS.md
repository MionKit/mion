# @mionjs/test-server guidelines

## ⚠️ The edge/cloudflare bundles must stay STRICT

- Edge + cloudflare test bundles are evaluated as a SCRIPT (EdgeVM / miniflare `initialCode`): sloppy mode by default.
- Sloppy mode: failed property assignment silently does nothing instead of throwing.
  That breaks node-vs-edge error parity in the e2e suites.
- Rolldown emits no `"use strict"` prologue (rollup did) → BOTH vite configs add it via `output.intro`.
- [buildTestBundle.ts](buildTestBundle.ts) asserts it on every build.
- Never remove the intro or the assertion. Bundler change drops the prologue → fix the config, not the assertion.
