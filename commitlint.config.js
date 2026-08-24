// Stock Conventional Commits ruleset (@commitlint/config-conventional).
// Enforced on every commit by the .husky/commit-msg hook
// (`pnpm exec commitlint --edit "$1"`). Author commits with `pnpm run commit`
// (commitizen) to be prompted through a conforming message.
export default {
  extends: ['@commitlint/config-conventional'],
};
