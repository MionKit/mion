---
name: website-browser
description: Start docs site container, drive it with playwright-cli. Use to check, review or debug rendered docs pages.
allowed-tools: Bash(pnpm:*) Bash(playwright-cli:*)
---

# Website browser testing (Nuxt docs site + playwright-cli)

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

- Drive docs site ([container/website/](../../../container/website/)) in a real browser: check pages, debug, e2e.
- Site runs ONLY in its podman container (its `node_modules` live in the image). Never on host.
- `playwright-cli` runs on host, reaches site via published port.

## Prerequisites

- Needs `@playwright/cli` (root devDependency): [Installing playwright-cli](#installing-playwright-cli).
- Run `pnpm exec playwright-cli ...` from repo root. Samples below drop the `pnpm exec` prefix.
- podman running. Site lifecycle: [scripts/website/site.mjs](../../../scripts/website/site.mjs).

## Start the website, then test it

### 1. Start the dev server (agent mode, hot-reload)

- Agent: ALWAYS `pnpm miondevx website dev --agent`. Target 3100 in every command.
- Own container `tsrt-website-agent` on reserved port 3100 → no clash with human `website dev` on `:3000`.
- Detached (no `&`). Self-stops after ~5 min idle.

```bash
pnpm miondevx website dev --agent   # one site, three subsites: /rpc, /runtypes, /benchmarks
until curl -fsS http://localhost:3100 -o /dev/null; do sleep 2; done   # Nuxt cold start ~30-60s
```

- Plain `pnpm miondevx website dev` (foreground, `:3000`) only if you need the human port. Collides with user's server.
- One-shot health check, no browser: `pnpm miondevx website check` (starts bg server, curls `:3000`, stops).

### 2. Drive it with the browser

```bash
playwright-cli open http://localhost:3100   # launch browser + load homepage
playwright-cli snapshot                     # a11y tree with refs (e1, e2, ...): main way to "see" page
playwright-cli click e15                    # act via snapshot refs, then snapshot again
```

- Prefer `snapshot` (or `snapshot "#main"` subtree) over screenshot.
- Every other command (fill, type, press, eval, tabs, storage, network, sessions): [cli-usage.md](cli-usage.md).

### 3. Verify rendered docs (code-import / twoslash)

```bash
playwright-cli goto http://localhost:3100/your/doc/path
playwright-cli --raw eval "document.body.innerText" | grep -i "expected snippet text"
playwright-cli --raw eval "document.querySelectorAll('pre.shiki, .twoslash').length"   # twoslash/shiki in DOM
```

- Non-browser doc verifier (curl/grep): `pnpm miondevx website check --docs`.

### 4. Debug a page

- `playwright-cli console` (add level: `console warning`), `playwright-cli requests`.
- `playwright-cli screenshot --filename=page.png`.

### 5. Tear down

```bash
playwright-cli close                                 # close browser
podman rm -f tsrt-website-agent 2>/dev/null || true  # stop agent server now (else self-stops when idle)
```

## Installing playwright-cli

- Pinned root devDependency `@playwright/cli` (Microsoft agent CLI, not the `playwright` test runner).
- In root [package.json](../../../package.json) + lockfile → `pnpm install` brings it.
- Check: `pnpm exec playwright-cli --version`.
- ⚠️ Browser binaries NOT auto-installed (postinstall download skipped).
  Cause: `ignoreScripts: true` in [pnpm-workspace.yaml](../../../pnpm-workspace.yaml).
  Once per machine: `pnpm exec playwright install chromium`.
- Upgrade: `pnpm add -D -w @playwright/cli@<version>`. Version ≥ 30 days old (`minimumReleaseAge`).
- Stays exact-pinned (`savePrefix: ''`). Browser revision changed → rerun `pnpm exec playwright install chromium`.

## Deeper references

- Run + debug Playwright tests: [references/playwright-tests.md](references/playwright-tests.md)
- Request mocking: [references/request-mocking.md](references/request-mocking.md)
- Running Playwright code: [references/running-code.md](references/running-code.md)
- Frames, downloads, clipboard: [references/frames-downloads-clipboard.md](references/frames-downloads-clipboard.md)
- Browser sessions: [references/session-management.md](references/session-management.md)
- Spec-driven testing (plan / generate / heal): [references/spec-driven-testing.md](references/spec-driven-testing.md)
- Spec-driven generate: [references/spec-driven-generate.md](references/spec-driven-generate.md)
- Spec-driven heal: [references/spec-driven-heal.md](references/spec-driven-heal.md)
- Storage state (cookies, localStorage): [references/storage-state.md](references/storage-state.md)
- Test generation: [references/test-generation.md](references/test-generation.md)
- Tracing: [references/tracing.md](references/tracing.md)
- Video recording: [references/video-recording.md](references/video-recording.md)
- Element attributes: [references/element-attributes.md](references/element-attributes.md)
