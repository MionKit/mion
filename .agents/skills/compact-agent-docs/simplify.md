# Stage 1a: Simplify

Rewrite each file in place in [style.md](style.md) style. Same file, same sections, far fewer words.
Same subagent then runs [split.md](split.md) and returns ONE report.

## Input

- Task file list, base ref.

## Steps

1. Read [style.md](style.md) and the root `AGENTS.md` rules on removed things and dashes.
2. Per file: read it whole. Note its job in one line (who reads it, when).
3. Per section, top to bottom:
   - Paragraph → bullets, one fact each.
   - Cut filler words and repeated facts inside the file.
   - Fact already in a parent AGENTS.md or sibling file? Keep the better home only.
     Unsure which home is better → keep both, flag in report.
   - Long why → one clause, or drop if rule stands alone.
   - Merge sections that say the same thing. Keep every heading other files link to (`#anchor`).
4. Fix every line over 120 chars: shorten, then split into two bullets. Wrap last.
5. Frontmatter `description:`: one line ≤ 120 chars total. Keep the "use when" trigger words.
6. Scripts (`.sh`, `.ts`, `.mjs`) in a skill: only wrap long lines. No logic change. `bash -n` / `node --check`.

## Contradictions

- Two files disagree, or text disagrees with code → settle from repo evidence (grep, scripts, `--help`).
- Cap: a few lookups. Still unclear → keep the safer wording, list as open doubt.
- Bug outside the task files → report it. Caller delegates it.

## Do not

- Move content before every file is simplified. Moves come in [split.md](split.md).
- Rename a heading another file links to. Check: `grep -rn "<file>#" --include=*.md .`
- Drop a fact because it seems obvious. Verifier will bring it back anyway.

## Output: report

- Per file: lines before → after, wide lines before → after.
- Facts dropped as duplicate: fact + where it still lives.
- Facts dropped as noise: one line each, why.
- Contradictions: how settled + evidence, or open doubt.
