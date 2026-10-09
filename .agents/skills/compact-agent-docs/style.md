# Style: caveman, exact

Write for an agent scanning fast. Fewest words that keep every fact.

## Rules

- One fact per bullet. One line per bullet. Wrap only if a token forces it.
- Fragments fine: "pnpm only. Never `npm install`."
- Drop: articles, "note that", "in order to", "it is important", "basically", hedges, praise.
- Drop: history, how we got here, restating the code, examples that repeat the rule.
- Keep why only when the rule looks wrong without it. One clause: "(else pnpm sees a cycle)".
- Keep symptoms an agent will match: exact error text, exit codes, log lines.
- Symbols ok: `→` (then / use / leads to), `=` (means), `+` (and), `/` (or).
- Imperative: "Run X", "Never Y". Not "You should consider running X".
- ⚠️ only for rules agents break. Max 3 per file.
- CAPS for one word max per bullet (NEVER, ONLY, BOTH).
- Lists beat tables unless 3+ columns of real data.
- Code block only for a command sequence agent copies. Single command → inline.
- Headings short: noun or job. "Containers", "Release", "Run tests".
- Pointer line shape: `- <topic>: [path](path). Read before <trigger>.`

## Before / after

Before:

```
`pnpm run clean` ([scripts/core/clean.mjs](scripts/core/clean.mjs)) is a HARD clean — dists, `bin/`,
tool caches, run artifacts AND every `node_modules`. `--keep-deps` keeps the install, `--dry-run` lists
without deleting, `pnpm run fresh-start` cleans then reinstalls. Some of what it drops is expensive to
rebuild (playground WASM, benchmark data), so prefer `--dry-run` first.
```

After:

```
- `pnpm run clean`: HARD clean (dists, `bin/`, caches, artifacts, all `node_modules`).
- `--dry-run` first: drops costly WASM + bench data. `--keep-deps` keeps install.
- `pnpm run fresh-start` = clean + reinstall.
```

Before:

```
Go-only tests don't need the prebuilt binary, but they DO read the built marker dist
(`packages/run-types/dist`, the real-package overlay the test fixtures resolve); `pnpm run check:builds` covers it.
```

After:

```
- Go tests need no binary, but read `packages/run-types/dist`. Stale → `pnpm run check:builds`.
```

Before (skill step):

```
Before you start editing anything, make sure you have read all of the rule sources in full, because the
later steps assume you know them and skipping this is the most common cause of a bad result.
```

After:

```
1. Read every rule source in full. Then edit.
```

## Never cut

- never / always / must rules, ⚠️ invariants, "looks like a cleanup but is not" warnings.
- Commands, flags, env vars, paths, versions, limits, counts.
- Order requirements ("before X", "after every Y").
- Who does what (which subagent, which job, which file owns a value).
- Gotchas with their fix.
