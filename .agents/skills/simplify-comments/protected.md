# Protected comments

Detail for [SKILL.md](SKILL.md) step 0. These comments control builds, diagnostics, generated output or tests.

## Rules

- Keep the entire comment byte for byte: tag, arguments, diagnostic names, surrounding text.
- Never delete, shorten, reflow, split, combine or move it. Never change its comment delimiters.
- Keep its attachment: a line directive targets the same next statement, a declaration tag stays on its declaration.
- These rules override the one-line and word-count rules.
- Comment mixes prose with a semantic tag → keep the whole comment unchanged.
- Package name like `@mionjs/devtools` in plain prose is not a tag. Prose may be simplified when no tool reads it.
- Unfamiliar marker → inspect `ts-go-runtypes/cmd/code-digest/digest.go` and its reader. Unsure → keep, report why.

## Repo tags

- Mion diagnostics: `@mion-expect-error`, `@mion-downgrade-error`, incl. code lists, wildcards, file-versus-line scope.
- Router declarations: `@mion:route`, `@mion:middleware`, `@mion:headersMiddleware`.
- Resolver metadata: `@nonEnumerable`.
- Enrichment metadata: `@rtType`, `@rtIds`, `@rtOrphan`, `@rtOrphanChild`, `@todo`, other compiler-owned `@rt` tags.
- Markers: `// biome-`, `// ^?`, `// ^|`, `// @annotate`, `// start-` / `// end-`, `GC-GUARD`, any comment a tool reads.

## Tool directives

- TypeScript `@ts-*` directives.
- JSDoc tags and blocks consumed by typechecking, especially in JS/MJS/CJS.
- `@vite-ignore`; `@vitest-environment` and its options; webpack magic comments.
- `__PURE__`, `__NO_SIDE_EFFECTS__`.
- Coverage, formatter, lint: `istanbul`, `c8 ignore`, `v8 ignore`, `prettier-ignore`, `oxfmt-ignore`,
  `eslint-*`, `oxlint-*`.
- Triple-slash references, source-map directives, shebangs.
- Go: `//go:*`, `// +build`, `//line`, `//export`, `//nolint`, cgo preambles,
  example-test `Output:` / `Unordered output:` comments.
