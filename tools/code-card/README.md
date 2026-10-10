# @mionjs/code-card

Private, never published. Turns a small `.vue` card, built from the components in `components/`, into a shareable PNG, or exports it to the website, where it plays its own animation. It needs no website or container.

```bash
pnpm miondevx card new <name> [--tmp]   # scaffold a code card + its snippet
pnpm miondevx card serve                # preview: live pages, play / pause / replay, PNG downloads
pnpm miondevx card shot <name>          # check the layout, render it to PNG (2400px wide)
pnpm miondevx card export <name>        # hand it to the website (container/website/app/data/cards/)
pnpm miondevx card test                 # its type check + tests (no CI lane runs them)
```

Agents: follow the [card skill](../../.agents/skills/card/SKILL.md).

Fonts: Inter and JetBrains Mono, both under the SIL Open Font License (see `fonts/`).
