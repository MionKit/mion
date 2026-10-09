# Stage 2: Verify

Prove no rule got lost. Fix losses yourself: restore, do not just report.

## Input

- Original file list, base ref, rewrite report, list of new files.

## Steps

1. `node .agents/skills/compact-agent-docs/lost-tokens.mjs <base> <paths>`. Prints:
   - exact tokens (code spans, links, flags, env vars) gone from all changed + new files
   - every old rule line (never / always / must / only / ⚠️)
2. Do NOT build a fact list by hand. Do NOT reread every old file whole. Old text on demand:
   `git show <base>:<path>`, only around a flagged line.
3. Per gone token and per rule line, mark:
   - **kept**: same file. **moved**: new file path.
   - **dup**: dropped, still lives in named file. Open that file and confirm.
   - **noise**: dropped history / filler / restatement. Must match the rewrite noise list.
   - **lost**: nowhere. Restore it in style, in the right file.
4. Meaning check: each rule line still says the same thing (scope, never vs prefer, numbers).
   Also read every "dropped" entry in the rewrite report: really a dup / noise?
5. Structure check:
   - `node scripts/ci/check-tree.mjs`: no agent-doc row for task files.
   - `node .agents/skills/compact-agent-docs/check-links.mjs <files>`: all links resolve.
   - Every new file linked from parent AGENTS.md or its SKILL.md.
   - Skill frontmatter: `name` unchanged, `description` keeps trigger words.
   - No em / en dashes added: `grep -n '[—–]' <files>`.
   - Scripts: `bash -n` / `node --check` pass, skill dry-run if any.
6. Restore pushes a file over limit → shorten elsewhere in it, never drop the fact.

## Output: report

- Counts: kept / moved / dup / noise / lost-and-restored.
- Each restored fact: text + file.
- Each meaning change found and fixed.
- Open doubts for a human, one line each. Empty is fine.
