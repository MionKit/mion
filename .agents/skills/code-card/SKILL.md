---
name: code-card
description: Make a shareable PNG of code or stats (tiles, bars) with `pnpm miondevx card`. Use for an image to share.
---

# code-card

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

App: [tools/code-card/](../../../tools/code-card/). An editor window in the mion colours.
You write a small markdown card. App colours the code (Shiki), saves a 2400px-wide PNG via the repo's playwright-cli.

## The flow

1. **Ask first, with the available question tool: keep this card in git?**
   - Yes: `pnpm miondevx card new <name>` puts it in `tools/code-card/cards/`. Commit the `.md` AND the `.png`.
   - No: `pnpm miondevx card new <name> --tmp` puts it in `tools/code-card/tmp/`, which git ignores.
   Names: lowercase letters, digits, dashes.
2. **Fill the card file** the command printed (format below).
3. **Render it:** `pnpm miondevx card shot <name>`. The PNG lands next to the card (`--out <dir>` to move it).
4. **Look at it before sending:** Read the PNG. Check: nothing cut off, no line wraps, right lines highlighted,
   title fits on one line.
5. **Send it** with SendUserFile (`display: 'render'`). Offer tweaks: each = an edit to the `.md` + another `shot`.

`pnpm miondevx card serve`: preview page on port 4400 (`--port`), live view of every card + a PNG download link.

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
| `padding` | no | Space between the image edge and the content, in px. Default `40`, from `0` to `120`. |
| `codeSize` | no | Code font size, in px. Default `22`, from `12` to `32`. |
| fence language | no | Picks the colouring: `ts` (default), `js`, `json`, `bash`, `go`… |

### More than one code block

A card can stack several windows. Any block can sit under a `## heading` line (caption above its window,
`*text*` = accent) and set its own `file` / `highlight` on the fence line. Frontmatter `file` + `highlight`
belong to the first block (set them in one place only). Highlight lines count from the top of each block.

````md
```ts
// server code…
```

## *Bonus*: the client
```ts file=client.ts highlight=3-4
// client code…
```
````

- Only blank lines, `## heading` lines and code blocks go under the frontmatter. Other text is refused.
- A `stats` block must be the only block.

- App refuses a card with an unknown key, bad highlight range, size out of range, or code line too long for the window.
  The error names the problem and the limit.
- Defaults fit 80 columns. Smaller `codeSize` or `padding` fits more.
- Numbers instead of code (tiles + a before / after bar chart): [stats.md](stats.md). Read before a results card.

## Rules for good cards

- **Real API only.** Every name in the code exists in the repo, or is a planned feature the user named.
  API not shipped yet → say "coming soon" in the title.
- **Short:** a title that fits one line, about 15 lines of code per block, one idea per card.
- Highlight the two or three lines the card is about, not more.
- Plain words in subtitle + footer ([writing rules](../../docs/website-writing.md)). No em dashes.

## If Chromium will not start

The error says what is missing. Either:

- Install Playwright's browser once: `pnpm exec playwright-cli install-browser chromium`.
- Or pass an existing Chromium: `--browser <path>` (Claude cloud session: `--browser /opt/pw-browsers/chromium`).
