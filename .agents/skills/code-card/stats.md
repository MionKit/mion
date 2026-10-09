# Stats cards

Same window, same frontmatter. A ` ```stats ` fence draws big-number tiles, a GitHub-style diff line
and one before / after bar chart instead of code. Use for results: sizes, counts, costs, speed-ups.

````md
---
title: *7× lighter* AGENTS.md. Not one rule lost.
subtitle: 25 Claude agents rewrote 66 agent docs.
file: compact-agent-docs
footer: Every session now starts with 6 KB of rules, not 44 KB.
---

```stats
tile: 7× | lighter root AGENTS.md
tile: $54 | API price of the whole run
bar: Root AGENTS.md size | 44.1 | 6.2 | KB
bar: Biggest file | 962 | 99 | lines
```
````

- `tile: <value> | <label>`: a big number in the olive accent, label under it. 1 to 4 tiles, value ≤ 12 chars.
- `diff: <added> | <removed> | <label>`: GitHub-style `+added −removed` and its 5 squares. One per card.
  Numbers from `git diff --shortstat <base>` (`git add -N` new files first, so they count).
- `bar: <label> | <before> | <after> | <unit>`: grey bar = before, olive bar = after, plus the % change.
  Unit optional. Numbers may use `,`. Up to 6 bars. Each row scales to itself, so units can mix.
- Any mix of tiles, diff and bars is fine. `highlight` is refused on a stats card.
- Labels ≤ 44 chars. Two bars with the same label read as a mistake: name what differs.

## Rules for stats cards

- **Real numbers only.** Measure them (git, `wc`, logs) right before the card. Never round up.
- Estimates say so: `≤`, `~`, or "about" in the label.
- One story per card: the title is the biggest win, tiles back it, bars show the before / after.
