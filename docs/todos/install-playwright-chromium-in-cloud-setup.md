---
type: chore
spec: guidelines
status: ready
created: 2026-10-10
---

# Install Playwright's Chromium in the cloud setup

## Intent

Card shots, card browser tests and `playwright-cli` all need Chromium. On a fresh Claude web session the repo's
Playwright cannot find its own Chromium: the image ships an older copy under `/opt/pw-browsers` (revision 1194),
while the pinned Playwright wants revision 1224, and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` stops the normal install.
Today we work around it with `--browser /opt/pw-browsers/chromium` or the `MION_CARD_BROWSER` env var.
We use Playwright often, so the setup script should install the right Chromium once, and every tool should just work.
Then `MION_CARD_BROWSER` goes away, leaving no trace.

## Direction

The implementer investigates and plans the details. Pointers checked on 2026-10-10:

- `scripts/setup-claude-web.sh` has no Playwright step. Add one: install the Chromium build that the root
  `@playwright/cli` pin (0.1.13, through its playwright-core) expects. Prefer the repo's own command
  (`pnpm exec playwright-cli install-browser chromium`, or a `package.json` script wrapping it) over a raw one.
- The install must land where the tools look. The env sets `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`: either
  install there (check it is writable) or decide on another path and make every tool read it. Pick one, no mix.
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` must stay for `pnpm install`; the explicit install step ignores it or
  unsets it for that one command only.
- Idempotent: a rerun with the right revision present does nothing. `--check` reports the browser as OK / MISSING,
  like the other deps. Bump `SETUP_DATE` per that script's rule.
- Network: check the Playwright download host passes the environment's network policy. Blocked → stop and
  report, never fall back to the image's older copy silently.
- Decide whether the local mion-setup skill (`.agents/skills/ts-runtypes-setup/`: `setup.sh`, `steps.md`, `lib/`)
  installs it too, so local and cloud hosts match.
- Remove `MION_CARD_BROWSER` everywhere: `scripts/lib/env.mjs` (code card knobs group, drop the group if empty),
  `.env.sample`, `tools/code-card/src/shoot.ts` (`defaultBrowser`), `tools/code-card/test/{browser,server,shoot}.test.ts`,
  `.agents/skills/card/commands.md`. The `--browser` flag of `card shot` stays only if it still has a real use.
- Session start hook output (the env check) should list Chromium so a missing one shows up at once.

## Docs

`SETUP.md`: existing setup section, one line saying the cloud setup installs Playwright's Chromium.
`.agents/skills/card/commands.md`: existing section "If Chromium will not start", rewritten for the new setup.
mion-setup `steps.md` if the local setup installs it too. No website page.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A fresh Claude web session after `bash scripts/setup-claude-web.sh` runs `pnpm miondevx card shot`,
  `pnpm miondevx card test` and `playwright-cli` with no flag and no env var.
- Rerunning the setup is a no-op; `--check` reports the browser.
- `MION_CARD_BROWSER` leaves no trace (grep is empty outside git history and `docs/done/`).
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
