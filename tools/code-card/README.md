# @mionjs/code-card

Private, never published. Turns a small markdown card (title, subtitle, code, footer) into a shareable PNG: the code in an editor window, coloured by Shiki, in the mion colours.

```bash
pnpm miondevx card new <name> [--tmp]   # scaffold a card
pnpm miondevx card shot <name>          # render it to PNG (2400px wide)
pnpm miondevx card serve                # preview service with PNG downloads
pnpm miondevx card test                 # its type check + tests (no CI lane runs them)
```

Agents: follow the [code-card skill](../../.claude/skills/code-card/SKILL.md).

Fonts: Inter and JetBrains Mono, both under the SIL Open Font License (see `fonts/`).
