---
name: website-browser
description: Start the containerized Nuxt/Docus docs website and drive it in a real browser with playwright-cli — for manual checks, UI review, debugging rendered docs (code-import / twoslash), and end-to-end testing of container/website/.
allowed-tools: Bash(pnpm:*) Bash(playwright-cli:*) Bash(npx:*)
---

# Website browser testing (Nuxt docs site + playwright-cli)

Drive the project's docs website ([container/website/](../../../container/website/)) in a real browser to verify rendered pages, debug console/network, and run end-to-end checks. The site is **containerized** (podman); `playwright-cli` runs on the **host** and reaches it through the published port. Agents start it with `--isAgent` on `http://localhost:3100` (a human's plain `dev` uses `:3000`) — see [Start the dev server](#1-start-the-dev-server-agent-mode-hot-reload).

## Prerequisites

- **playwright-cli** is installed as a pinned root devDependency (`@playwright/cli`, see [Installing playwright-cli](#installing-playwright-cli)). Invoke it via **`pnpm exec playwright-cli ...`** from the repo root. The command samples below write bare `playwright-cli` for brevity — prefix each with `pnpm exec`.
- **podman** running (the website only ever runs inside its container — see [scripts/website/site.mjs](../../../scripts/website/site.mjs)).

## Start the website, then test it

The site cannot run on the host — its `node_modules` live only in the image. Use [scripts/website/site.mjs](../../../scripts/website/site.mjs) (`pnpm rtx website dev --agent`) to bring it up, then point the browser at `http://localhost:3100`.

### 1. Start the dev server (agent mode, hot-reload)

**As an agent, always start with `--agent`.** It runs the site in a separate container (`tsrt-website-agent`) on the reserved port **3100**, so you never collide with a human running `pnpm rtx website dev` on `:3000`. It's detached (no `&` needed) and self-stops after ~5 min idle, so a forgotten server cleans itself up. Target **3100** in every command below.

```bash
# start the agent dev server (detached, self-stopping, on :3100)
pnpm rtx website dev --agent

# wait until it answers (Nuxt cold start can take ~30-60s)
until curl -fsS http://localhost:3100 -o /dev/null; do sleep 2; done
echo "website up on http://localhost:3100"
```

> Only use plain `pnpm rtx website dev` (foreground, `:3000`) if you specifically need the human-facing port — it will collide with a user's running server.
> A one-shot health check with no browser is `pnpm rtx website check` (starts a bg server, curls `:3000`, stops).

### 2. Drive it with the browser

```bash
playwright-cli open http://localhost:3100      # launch browser + load the homepage
playwright-cli snapshot                        # accessibility tree with refs (e1, e2, ...) — your main way to "see" the page
playwright-cli click e15                        # interact using refs from the snapshot
playwright-cli snapshot                         # re-snapshot to see the result
```

### 3. Verify rendered docs (code-import / twoslash)

The docs render imported code and twoslash type hovers. To confirm a docs page rendered them:

```bash
playwright-cli goto http://localhost:3100/your/doc/path
# pull rendered text and check an expected token is present
playwright-cli --raw eval "document.body.innerText" | grep -i "expected snippet text"
# check for twoslash/shiki output in the DOM
playwright-cli --raw eval "document.querySelectorAll('pre.shiki, .twoslash').length"
```

> There is also a non-browser doc verifier: `pnpm rtx website check --docs` (curl/grep based).

### 4. Debug a page

```bash
playwright-cli console            # console messages (add a level: console warning)
playwright-cli requests           # network requests
playwright-cli screenshot --filename=page.png
```

### 5. Tear down

```bash
playwright-cli close              # close the browser
# the agent server self-stops after idle; to stop it now:
podman rm -f tsrt-website-agent 2>/dev/null || true
```

## Most-used commands

Full command reference (tabs, mouse, keyboard, storage, network, tracing, video, sessions, etc.) lives in **[cli-usage.md](cli-usage.md)**. The essentials:

```bash
# lifecycle
playwright-cli open http://localhost:3100   # open browser (optionally navigate)
playwright-cli goto <url>                    # navigate current page
playwright-cli close                         # close browser
playwright-cli list                          # list running sessions
playwright-cli close-all                     # close every session

# see the page (prefer snapshot over screenshot)
playwright-cli snapshot                       # a11y tree with refs e1,e2,...
playwright-cli snapshot "#main"               # snapshot a subtree
playwright-cli screenshot --filename=page.png

# interact (targets are refs from the snapshot, CSS, or locators)
playwright-cli click e15
playwright-cli fill e5 "user@example.com" --submit
playwright-cli type "search query"
playwright-cli press Enter
playwright-cli hover e4
playwright-cli select e9 "option-value"

# read values / attributes
playwright-cli eval "document.title"
playwright-cli eval "el => el.getAttribute('data-testid')" e5
playwright-cli --raw eval "document.body.innerText"   # --raw strips status/snapshot, value only

# debug
playwright-cli console
playwright-cli requests
```

### Targeting elements

Use **refs** from `snapshot` (`e15`), or a CSS selector (`"#main > button.submit"`), or a Playwright locator (`"getByRole('button', { name: 'Submit' })"`, `"getByTestId('submit-button')"`).

### Sessions

Run several independent browsers with `-s=<name>`:

```bash
playwright-cli -s=docs open http://localhost:3100
playwright-cli -s=docs click e6
playwright-cli -s=docs close
```

## Installing playwright-cli

Already installed as a pinned **root devDependency**: `@playwright/cli` (Microsoft's agent CLI — distinct from the regular `playwright` test runner). It's in the root [package.json](../../../package.json) and the lockfile, so `pnpm install` brings it in for everyone.

```bash
pnpm exec playwright-cli --version    # confirm it resolves
```

**Browser binaries are NOT auto-installed.** This repo sets `ignoreScripts: true` in [pnpm-workspace.yaml](../../../pnpm-workspace.yaml), so Playwright's postinstall browser download is skipped. Install Chromium once per machine:

```bash
pnpm exec playwright install chromium
```

> Version bumps are gated by `minimumReleaseAge` (30 days) and must stay exact-pinned (`savePrefix: ''`). To upgrade, use `pnpm add -D -w @playwright/cli@<version>` with a version at least 30 days old, then re-run `pnpm exec playwright install chromium` if the bundled browser revision changed.

## Deeper references

Task-specific guides (originally from the upstream playwright-cli skill) live under [references/](references/):

* **Running & debugging Playwright tests** — [references/playwright-tests.md](references/playwright-tests.md)
* **Request mocking** — [references/request-mocking.md](references/request-mocking.md)
* **Running Playwright code** — [references/running-code.md](references/running-code.md)
* **Browser session management** — [references/session-management.md](references/session-management.md)
* **Spec-driven testing (plan / generate / heal)** — [references/spec-driven-testing.md](references/spec-driven-testing.md)
* **Storage state (cookies, localStorage)** — [references/storage-state.md](references/storage-state.md)
* **Test generation** — [references/test-generation.md](references/test-generation.md)
* **Tracing** — [references/tracing.md](references/tracing.md)
* **Video recording** — [references/video-recording.md](references/video-recording.md)
* **Inspecting element attributes** — [references/element-attributes.md](references/element-attributes.md)
