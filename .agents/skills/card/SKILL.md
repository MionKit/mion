---
name: card
description: Make a PNG or website card with `pnpm miondevx card`: quick code card or content card. Use for any visual.
---

# card

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

App: [tools/code-card/](../../../tools/code-card/). A card is a small `.vue` file built from a component library
([components.md](components.md)). The app renders it alone (no website, no container) to a 2400px-wide PNG, and
`card export` hands the same card, with its animation, to the website. Commands + checks: [commands.md](commands.md).

## Pick the kind of card

1. **Read the request.**
   - A code fragment to share → **code card**: one editor window of code. Follow [code.md](code.md).
   - Numbers, a before / after, a chart, a comparison, a sequence, or a card for the website → **content card**.
     Follow [content.md](content.md).
2. **Unclear?** Ask with the question tool: "Quick code card, or a content card (numbers, chart, website)?"
   Never guess silently.
3. **Ask, as always: keep this card in git?**
   - Yes: it lives in `tools/code-card/cards/`. Commit the `.vue`, its snippet if any, AND the `.png`.
   - No: it lives in `tools/code-card/tmp/`, which git ignores (`card new <name> --tmp`).
   - Names: lowercase letters, digits, dashes.
4. **Follow the kind's file**, then look at the PNG before sending it (Read it: nothing cut off, right lines
   highlighted, title on one line). Send it with SendUserFile (`display: 'render'`) and offer tweaks.

## Rules for every card

- **Real API only.** Every name in code exists in the repo, or is a planned feature the user named.
  Not shipped yet → say "coming soon" in the title.
- **Real numbers only.** Measure them (git, `wc`, logs, a benchmark) right before the card. Never round up.
  Estimates say so: `≤`, `~`, or "about".
- **One idea per card.** A title that fits one line; the `<em>` words in it are the takeaway.
- Plain words in title, subtitle, labels and footer ([writing rules](../../docs/website-writing.md)). No em dashes.
