---
type: chore
spec: guidelines
status: ready
created: 2026-09-27
---

# Container images pin a pnpm whose node-gyp breaks behind a proxy

## What happens

Six Containerfiles pin `ARG PNPM_VERSION=11.1.1`: `container/mion-bench`, `container/pre-publish-e2e`, and all four
`container/drizzle-e2e/{pg,mysql,sqlite,cloudflare}`. `container/website` already pins `11.8.0`, the workspace's pnpm.

Behind an HTTP proxy (Claude cloud sessions, any corporate egress), an image whose install runs a native build fails.
Seen on `mion-drizzle-sqlite`: better-sqlite3's `node-gyp rebuild` (pnpm 11.1.1, node 26.10) dies fetching the
Node headers:

```
gyp http GET https://nodejs.org/download/release/v26.10.0/node-v26.10.0-headers.tar.gz
gyp ERR! stack InvalidArgumentError: invalid onError method
gyp ERR! stack at EnvHttpProxyAgent.dispatch (/usr/local/lib/node_modules/pnpm/dist/node_modules/undici/lib/dispatcher/dispatcher-base.js:188:15)
```

Repro (from a cloud session):

```bash
MION_WEBSITE_BASE_IMAGE=mirror.gcr.io/library/node:26-trixie MION_WEBSITE_BUILD_NETWORK=host \
  pnpm miondevx container build-image drizzle-sqlite
```

The same command with `MION_WEBSITE_PNPM_VERSION=11.8.0` builds cleanly.

## Direction

- Bump the six `PNPM_VERSION` pins to the workspace's pnpm (the website image's `11.8.0`), so every image uses one pnpm.
  Consider a check that keeps the pins equal to the root `packageManager`, so they cannot drift again.
- A pin change changes each image's deps hash, so rebuild and push all affected images per CLAUDE.md's Containers
  section (arm64 half included), or every lane falls back to a local build.
- Until the images are pushed, the `MION_WEBSITE_PNPM_VERSION` knob is the workaround; if the pins cannot move, list
  that knob beside the other sandbox knobs in CLAUDE.md's Containers section instead.
