# @mionjs/test-server guidelines

## ⚠️ The edge/cloudflare bundles must stay STRICT

The edge and cloudflare test bundles are evaluated as a SCRIPT (EdgeVM / miniflare `initialCode`), where sloppy mode is the default and a failed property assignment silently does nothing instead of throwing — which quietly breaks node-vs-edge error parity in the e2e suites.

Rolldown does not emit the `"use strict"` prologue rollup did, so BOTH vite configs add it via `output.intro`, and [buildTestBundle.ts](buildTestBundle.ts) asserts it on every build. Never remove the intro or the assertion; if a bundler change drops the prologue, fix the config, not the assertion.
