---
name: code-card
description: Make a shareable PNG of a code snippet (an editor window in the mion colours) with the code-card app and `pnpm miondevx card`. Use when the user wants an image of code to post or share.
---

# code-card

The app lives in [packages/code-card/](../../../packages/code-card/). You write a small markdown card; the app colours the code (Shiki) and saves a 2400px-wide PNG through the repo's playwright-cli.

## The flow

1. **Ask first, with AskUserQuestion: keep this card in git?**
   - Yes: `pnpm miondevx card new <name>` puts it in `packages/code-card/cards/`. Commit the `.md` AND the `.png`.
   - No: `pnpm miondevx card new <name> --tmp` puts it in `packages/code-card/tmp/`, which git ignores.
   Names are lowercase letters, digits and dashes.
2. **Fill the card file** the command printed (format below).
3. **Render it:** `pnpm miondevx card shot <name>`. The PNG lands next to the card (`--out <dir>` to move it).
4. **Look at it before sending:** Read the PNG. Check that nothing is cut off, no line wraps, the right lines are highlighted and the title fits on one line.
5. **Send it** with SendUserFile (`display: 'render'`). Offer tweaks: each one is an edit to the `.md` and another `shot`.

`pnpm miondevx card serve` starts a preview page on port 4400 (`--port`), with a live view of every card and a PNG download link.

## The card format

````md
---
title: *Typed match* coming soon to run-types
subtitle: Match unknown data by type. The runtime check is generated at build time.
file: feed.ts
highlight: 11-12
footer: No schemas to keep in sync. Just TypeScript.
badge: @mionjs/run-types
---

```ts
import { match } from '@mionjs/run-types';
…
```
````

| Field | Required | What it does |
| --- | --- | --- |
| `title` | yes | The headline. `*text*` paints that part in the mion olive accent. |
| `subtitle` | no | One sentence under the title. |
| `file` | no | The file name in the window's title bar. |
| `highlight` | no | Lines to mark: `3`, `11-12` or `3,7-8`. Line 1 is the first line INSIDE the code block. |
| `footer` | no | A short line under the window. |
| `badge` | no | A small pill at the bottom right, usually the package name. |
| fence language | no | Picks the colouring: `ts` (default), `js`, `json`, `bash`, `go`… |

The app refuses a card with an unknown key, a bad highlight range, or a code line over 80 columns (the window is fixed at that width). Its error names the problem.

## Rules for good cards

- **Real API only.** Every name in the code must exist in the repo, or be a planned feature the user named. When the API is not shipped yet, say "coming soon" in the title.
- **Short:** a title that fits one line, about 15 lines of code at most, one idea per card.
- Highlight the two or three lines the card is about, not more.
- Plain words in the subtitle and footer (see the writing rules in CLAUDE.md). No em dashes.

## If Chromium will not start

The error says what is missing. Either install Playwright's browser once with `pnpm exec playwright-cli install-browser chromium`, or pass a Chromium that is already there: `--browser <path>` (in a Claude cloud session: `--browser /opt/pw-browsers/chromium`).
