# Stage 1b: Split

Same subagent as [simplify.md](simplify.md). Files still over a limit get split.
Under the limit and well placed → touch nothing.

## AGENTS.md

Root and parent files keep only what EVERY task under them needs. Rest moves down.

1. Per section: which dir does it govern? Move it to `<that dir>/AGENTS.md` (create or append).
   - e.g. containers → `container/AGENTS.md`, Go program → `ts-go-runtypes/AGENTS.md`.
2. No home dir (git flow, env vars, PR rules, CI lanes)? → `.agents/docs/<topic>.md`.
3. Parent keeps one pointer line per moved section: `- <topic>: [path](path). Read before <trigger>.`
4. Every new AGENTS.md or `.agents/docs/` file is linked from its nearest parent AGENTS.md.
5. ⚠️ Keep in root: rules every task needs (fix-not-file, removed-leaves-no-trace, pnpm only,
   commit/format rules, reply style). These never move.
6. New file layout: `# <Title>` + 1 line job + sections. Same style as [style.md](style.md).

## Skills

SKILL.md = the arc. Detail pages = the how.

1. SKILL.md keeps: frontmatter, 1-2 line goal, ordered steps, hard rules every run needs, links.
2. Move out: long step detail, examples, reference tables, command catalogs, templates.
3. Detail page lives in the skill dir: `<topic>.md`, or `references/<topic>.md` if 4+ pages.
4. Link with a trigger: `Step 3 detail → [scoring.md](scoring.md)`. No orphan pages.
5. Detail page still over 100 lines → split by topic again. Never by "part 1 / part 2".
6. Long script → split by concern into sourced files (`lib/<topic>.sh`). Same behaviour.
   Check: `bash -n`, `node --check`, plus the skill's own test or dry-run if it has one.

## Links

- After every move: `grep -rn "<old path>" .` (md, code comments, scripts, workflows). Fix all.
- Anchors: `grep -rn "<file>#" .`. Moved heading → update each link to new file + anchor.
- Relative links only. Packaged skill links stay inside the skill dir.
- Run [check-links.mjs](check-links.mjs) over every touched file.

## Output: added to the simplify report

- Moves: section → new file (lines).
- New files + the parent line that links each.
- Links updated: file:line list.
- Root pointer lines needed but not added (root owned by another task).
- Files still over limit + why.
