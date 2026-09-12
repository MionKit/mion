#!/usr/bin/env bash
# Scope a branch for review: base ref, diff stat, new files, spec docs, website
# pages, test coverage signal, and the CLAUDE.md files governing each change.
# Usage: bash .claude/skills/review-pr/scope.sh [base-ref]
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not a git repo" >&2; exit 1; }

base_ref=${1:-}
if [ -z "$base_ref" ]; then
  git fetch --quiet origin main 2>/dev/null || true
  if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
    base_ref=origin/main
  else
    base_ref=main
  fi
fi

merge_base=$(git merge-base "$base_ref" HEAD 2>/dev/null) || {
  echo "no merge base between $base_ref and HEAD" >&2; exit 1; }
range="$merge_base..HEAD"

section() { printf '\n## %s\n' "$1"; }
indent()  { local out; out=$(cat); if [ -z "$out" ]; then echo "  (none)"; else printf '%s\n' "$out" | sed 's/^/  /'; fi; }
area()    { awk -F/ '{ if ($1=="packages" && NF>1) print $1"/"$2; else print $1 }'; }

printf '## Target\n'
printf 'branch:     %s\n' "$(git rev-parse --abbrev-ref HEAD)"
printf 'base ref:   %s\n' "$base_ref"
printf 'merge base: %s\n' "$merge_base"
printf 'diff range: %s   <- every pass must use this exact range\n' "$range"

section "Commits"
git log --oneline "$range" | indent

changed=$(git diff --name-only -M "$range")
if [ -z "$changed" ]; then printf '\nNo changes against %s.\n' "$base_ref"; exit 0; fi

section "Diff stat"
git diff --stat=160 "$range" | indent

section "Added files, biggest first (added removed path)"
git diff --numstat -M "$range" --diff-filter=A | sort -rn | head -20 | indent

section "Deleted and renamed files"
git diff --name-status -M "$range" --diff-filter=DR | indent

section "Governing CLAUDE.md (count = changed files it covers)"
printf '%s\n' "$changed" | while IFS= read -r f; do
  d=$(dirname "$f")
  while :; do
    if [ "$d" = "." ]; then [ -f CLAUDE.md ] && echo CLAUDE.md; break; fi
    [ -f "$d/CLAUDE.md" ] && echo "$d/CLAUDE.md"
    d=$(dirname "$d")
  done
done | sort | uniq -c | sort -rn | indent

section "Spec docs in the diff (a todos -> done rename is this PR's spec)"
git diff --name-status -M "$range" -- docs/todos docs/done | indent

section "New references to a spec doc outside docs/ (banned by root CLAUDE.md)"
git diff -M "$range" -- . ':(exclude)docs' 2>/dev/null | grep -E '^\+.*docs/(todos|done)/' | head -20 | indent

section "Website pages changed"
git diff --name-only -M "$range" -- container/website/content | indent

tests=$(printf '%s\n' "$changed" | grep -E '\.(spec|test)\.ts$|_test\.go$' || true)
section "Test files changed"
printf '%s\n' "$tests" | grep -v '^$' | indent

section "Source areas changed with no test change"
src_areas=$(printf '%s\n' "$changed" | grep -vE '\.(spec|test)\.ts$|_test\.go$' | grep -E '^(packages|ts-go-runtypes)/' | area | sort -u)
test_areas=$(printf '%s\n' "$tests" | grep -v '^$' | area | sort -u)
comm -23 <(printf '%s\n' "$src_areas" | grep -v '^$') <(printf '%s\n' "$test_areas" | grep -v '^$') | indent
