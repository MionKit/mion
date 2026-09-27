---
type: chore
spec: guidelines
status: done
created: 2026-09-27
---

# Container images pin a pnpm whose node-gyp breaks behind a proxy

## What happened

Six Containerfiles pinned `ARG PNPM_VERSION=11.1.1`: `container/mion-bench`, `container/pre-publish-e2e`, and all four
`container/drizzle-e2e/{pg,mysql,sqlite,cloudflare}`. `container/website` already pinned `11.8.0`, the workspace's pnpm.

Behind an HTTP proxy, an image whose install runs a native build failed. Seen on `mion-drizzle-sqlite`:
better-sqlite3's `node-gyp rebuild` (pnpm 11.1.1 bundles node-gyp 12.3.0, node 26.10) died fetching the Node headers:

```
gyp ERR! stack InvalidArgumentError: invalid onError method
gyp ERR! stack at EnvHttpProxyAgent.dispatch (/usr/local/lib/node_modules/pnpm/dist/node_modules/undici/lib/dispatcher/dispatcher-base.js:188:15)
```

## What shipped

- All six pins moved to `11.8.0`, the root `package.json` `packageManager`. Every image now runs one pnpm.
- A guard in `packages/devtools/test/repo-contracts.test.ts` (`every container image runs the workspace pnpm`): every
  `ARG PNPM_VERSION=` in a `container/**/Containerfile`, and every pnpm `packageManager` in a `container/**/package.json`
  (the website `_deps`), must equal the root `packageManager`. Checked to fail when one pin is set back to `11.1.1`.
- `SETUP.md` and the setup skill's `setup.sh` header named `packageManager: pnpm@11.1.1`; both now say `11.8.0`.
- No `MION_WEBSITE_PNPM_VERSION` workaround went into CLAUDE.md, since the pins themselves moved.

## Verification

- `MION_WEBSITE_BASE_IMAGE=mirror.gcr.io/library/node:26-trixie MION_WEBSITE_BUILD_NETWORK=host pnpm miondevx container build-image drizzle-sqlite`
  succeeds with no pnpm override.
- A `--no-cache` build of the same context also succeeds, and inside it a forced `node-gyp rebuild` of better-sqlite3
  (node-gyp 12.4.0 from pnpm 11.8.0) downloads the Node headers through the proxy and compiles.

## Images

All six affected images (`mion-bench`, `e2e`, `drizzle-pg`, `drizzle-mysql`, `drizzle-sqlite`, `drizzle-cloudflare`)
were rebuilt and pushed to GHCR, amd64 and arm64.
