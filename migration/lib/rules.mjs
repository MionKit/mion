// The auto-marking rules. This is what keeps the migration from being a row-by-row slog:
// each rule claims a whole FAMILY of occurrences, and only what no rule claims is left
// for a person to judge.
//
// Two properties every rule must hold, both pinned by tests in test/rules.test.mjs:
//
//   1. EXACT. A rule matches its family and nothing else. Each one ships with a list of
//      near-misses it must reject, so it cannot quietly widen later.
//   2. ORDERED. First match wins, so the specific rules sit above the general ones.
//
// The single most important discriminator in this whole migration:
//
//     the PACKAGE name is always lowercase   ts-runtypes, @ts-runtypes/core, runtypes
//     the CONCEPT always has a capital T     getRunTypeId, RunTypeKind, runTypeId
//
// which is why `keep:concept` can be both broad and safe. `RunTypes` in prose is the
// BRAND rather than the concept, so md-prose is excluded and falls through to a decision.

// NOTE: there is deliberately no `regenerate` rule here. Row keys carry no file, so a
// file-dependent rule would be decided by whichever file happened to produce the row
// first. Generated files are excluded in lib/walk.mjs instead, where the file is known.

export const RULES = [
  // ---- structural: decided by WHERE the occurrence lives, not what it says ----
  {
    name: 'freeze',
    mark: 'freeze',
    why: 'docs/done is the historical record',
    test: (token, kind, area) => area === '09-frozen',
  },

  // ---- exact identities: long, unambiguous, zero judgement needed ----
  {
    name: 'go-module',
    mark: 'go-module',
    why: 'the Go module path and everything under it',
    test: (token) => /^github\.com\/mionkit\/ts-runtypes(\/[A-Za-z0-9._/-]*)?$/.test(token),
    rejects: ['github.com/mionkit/mion', 'github.com/other/ts-runtypes'],
  },
  {
    name: 'npm-scope',
    mark: 'npm-scope',
    // Anywhere the scope appears, including nested inside a longer path such as
    // node_modules/@ts-runtypes/core/package.json. The scope is unmistakable wherever it
    // sits, so there is no need to anchor it to the start of the token.
    why: 'the npm scope and its subpaths, wherever they appear',
    test: (token) => token === '@ts-runtypes' || token.includes('@ts-runtypes/'),
    rejects: ['@mionjs/core', 'ts-runtypes', '@ts-runtypesx'],
  },
  {
    name: 'repo-url',
    mark: 'repo-url',
    why: 'the dead MionKit/ts-run-types repo, wrong regardless of the naming decision',
    test: (token) => /ts-run-types$/i.test(token),
    rejects: ['ts-runtypes', 'run-types'],
  },

  // ---- keep: the concept and the rt internals, NOT the package ----
  {
    name: 'pkg-dir',
    mark: 'pkg-dir',
    // A PATH whose segments include a package directory. Matching the segment rather
    // than a `packages/` prefix is what catches every way the directory is addressed:
    //
    //   packages/ts-runtypes            from the repo root
    //   ../ts-runtypes                  a tsconfig reference from a sibling package
    //   ../../ts-runtypes/test/x.ts     a relative import from a sibling's test
    //   ./../ts-runtypes/dist/index.d.ts   a tsconfig paths entry
    //
    // The segment must NOT be the leading one: `ts-runtypes/formats` with no prefix is
    // a bare npm specifier, not a directory, and belongs to npm-subpath. A bare
    // `ts-runtypes` has no slash at all and is the tool name.
    // The segment must sit directly under `packages` or a relative hop. That is what a
    // package directory looks like, and it is what separates it from same-named things
    // that are NOT the package:
    //
    //   bin/ts-runtypes                       the compiled resolver binary  -> cli-bin
    //   ts-go-runtypes/cmd/ts-runtypes/x.go   the Go command source         -> go-dir
    why: 'a path whose segments include a package directory',
    test: (token) => {
      const parts = token.split('/');
      return parts.some(
        (part, i) =>
          i > 0 &&
          /^ts-runtypes(-devtools|-bin|-go-be-sidecar)?$/.test(part) &&
          (parts[i - 1] === 'packages' || parts[i - 1] === '..' || parts[i - 1] === '.')
      );
    },
    rejects: [
      'ts-runtypes',
      'ts-runtypes/formats',
      'ts-go-runtypes',
      'packages/core',
      'bin/ts-runtypes',
      'ts-go-runtypes/cmd/ts-runtypes/enrich_cli.go',
    ],
  },
  {
    name: 'keep:concept',
    mark: 'keep',
    // CAPITAL T, and nothing less. Verified against the whole tree: every capital-T
    // spelling (RunType, getRunTypeId, RunTypeKind, 8000+ sites) is the concept, and
    // every lowercase-t one (tsRuntypesPlugin, RuntypesPlayground, ~110 sites) is an
    // identifier built from the PACKAGE name, which `pkg-ident` below claims instead.
    why: 'RunType the domain concept and public API, never the package name',
    test: (token, kind) => /RunType|runType/.test(token) && kind !== 'md-prose',
    rejects: ['ts-runtypes', '@ts-runtypes/core', 'runtypes', 'TsRuntypesPluginOptions', 'tsRuntypesPlugin'],
  },
  {
    name: 'keep:go-pkg',
    mark: 'keep',
    why: 'the internal Go package named after the concept (runtype.Cache)',
    test: (token, kind) => kind === 'go' && /^runtypes?(\.[A-Za-z]|[A-Z])/.test(token),
    rejects: ['runtypes', 'ts-runtypes'],
  },
  {
    name: 'keep:src-dir',
    mark: 'keep',
    // packages/core/src/runtypes (the mion reflection adapter) and
    // packages/ts-runtypes/src/runtypes. Source directories named after the CONCEPT, not
    // after the package, so they read correctly whatever the package ends up called.
    why: 'a src/runtypes source directory, named for the concept',
    test: (token) => /(^|\/)src\/runtypes(\/|$)/.test(token),
    rejects: ['src/other', 'packages/ts-runtypes/dist'],
  },
  {
    name: 'keep:format-file',
    mark: 'keep',
    why: 'the *.runtype.ts format-file naming convention',
    test: (token) => token.endsWith('.runtype.ts'),
    rejects: ['runtype.ts', 'runtypes.d.ts'],
  },
  {
    name: 'keep:rt-dsl',
    mark: 'keep',
    why: 'PUBLIC DATA FORMAT: consumers commit enrichment files keyed by these',
    test: (token) => /^rt\$[a-zA-Z]+$/.test(token),
    rejects: ['rt$', 'rtx', 'art$label'],
  },
  {
    name: 'keep:rt-ns',
    mark: 'keep',
    why: 'CACHE WIRE FORMAT: the pure-fn namespaces are baked into generated caches',
    test: (token) => /^rt(Formats)?::$/.test(token),
    rejects: ['rt:', 'art::'],
  },
  {
    name: 'keep:rt-brand',
    mark: 'keep',
    why: 'internal compiler brands, renaming is churn with no consumer benefit',
    test: (token) => /^__rt[A-Za-z_]+$/.test(token),
    rejects: ['__rt', '_rtFormat'],
  },
  {
    name: 'keep:rtx',
    mark: 'keep',
    why: 'the repo CLI, already mion-side',
    test: (token) => token === 'rtx',
    rejects: ['rtxx', 'sort'],
  },
  {
    // Ordered above env-var, which would otherwise claim it: the name is RETIRED, read by
    // nothing, and survives only so the plugin can warn a user who still sets it. Renaming
    // it would move the warning off the string people actually have in their shell.
    name: 'keep:retired-env',
    mark: 'keep',
    why: 'a retired env var kept verbatim so its deprecation warning still matches',
    test: (token) => /^(process\.env\.)?TS_RUNTYPES_BIN$/.test(token),
    rejects: ['TS_RUNTYPES_DIVERGENT', 'RT_BIN'],
  },

  // ---- renames: each is a distinct concept with its own target ----
  {
    name: 'tool-name',
    mark: 'tool-name',
    // The bare name, wearing every hat at once: the `ts-runtypes` CLI, the tsconfig
    // plugin key, the node_modules/.cache directory, and the product in prose. Renaming
    // it is a rebrand rather than a move, so it waits for the brand decision.
    why: 'the bare tool / product name, deferred to the brand phase',
    test: (token) => /^ts-runtypes(-devtools|-bin|-go-be-sidecar)?$/.test(token),
    rejects: ['ts-go-runtypes', 'packages/ts-runtypes', '@ts-runtypes/core'],
  },
  {
    name: 'site',
    mark: 'site',
    why: 'the docs site identity: the runtypes.pages.dev domain and the sites/ tree',
    test: (token) => /runtypes\.pages\.dev/.test(token) || /(^|\/)sites\/runtypes(\/|$)/.test(token),
    rejects: ['mion.pages.dev', 'sites/mion'],
  },
  {
    name: 'gen-file',
    mark: 'gen-dir',
    why: 'the emitted bundle basename (runtypes.js / runtypes.d.ts and its constant)',
    test: (token) =>
      /(^|\/)runtypes\.(d\.ts|js|mjs|cjs)$/.test(token) || /^RUNTYPES_BUNDLE[A-Z_]*$/.test(token),
    rejects: ['runtypes', 'runtypes.pages.dev'],
  },
  {
    name: 'npm-subpath',
    mark: 'npm-scope',
    why: 'an unscoped subpath import of the package',
    test: (token) => /^ts-runtypes(-devtools|-bin)?\/[A-Za-z0-9._/-]+$/.test(token),
    rejects: ['ts-runtypes', 'ts-go-runtypes/internal'],
  },
  {
    name: 'go-dir',
    mark: 'go-dir',
    why: 'the ts-go-runtypes directory',
    test: (token) => /^[./]*ts-go-runtypes(\/.*)?$/.test(token),
    rejects: ['ts-runtypes', 'go-runtypes'],
  },
  {
    name: 'gen-dir',
    mark: 'gen-dir',
    why: 'the generated __runtypes directory',
    test: (token) => /^[./]*__runtypes(\/.*)?$/.test(token),
    rejects: ['__runtypesX', 'runtypes'],
  },
  {
    name: 'cli-bin',
    mark: 'cli-bin',
    why: 'the resolver binary path and the ts-runtypes-* tool names',
    test: (token) =>
      /^[./]*(bin|cmd)\/ts-runtypes/.test(token) || /^ts-runtypes-(skills|setup)$/.test(token),
    rejects: ['ts-runtypes', 'bin/other', 'ts-runtypes-devtools'],
  },
  {
    name: 'env-var',
    mark: 'env-var',
    why: 'the RT_ / TS_RUNTYPES_ env prefixes',
    test: (token) => /^(RT_[A-Z][A-Z0-9_]*|TS_RUNTYPES[A-Z0-9_]*)$/.test(token),
    rejects: ['RT', 'RT_', 'RTX', 'MION_TEST_PORT'],
  },
  {
    name: 'image',
    mark: 'image',
    why: 'the tsrt- container image prefix',
    test: (token) => /^tsrt[-_]/.test(token),
    rejects: ['tsrt', 'tsrtx', 'mion-bench'],
  },
  {
    name: 'pkg-ident',
    mark: 'pkg-ident',
    // The mirror of keep:concept. A lowercase-t `Runtype` inside a camel/Pascal
    // identifier is always naming the PACKAGE (tsRuntypesPlugin, RuntypesPlayground),
    // so it renames along with it. Ordered AFTER keep:concept so a capital-T token can
    // never reach here.
    why: 'an identifier built from the package name (lowercase-t Runtype)',
    test: (token) => /^[A-Za-z][A-Za-z0-9$_]*$/.test(token) && /[a-z]untype|Runtype[a-z]|Runtypes$/.test(token),
    rejects: ['getRunTypeId', 'RunTypeKind', 'ts-runtypes', '@ts-runtypes/core'],
  },
  {
    name: 'lint-rule',
    mark: 'lint-rule',
    why: 'the runtypes/ oxlint rule namespace',
    test: (token) => /^runtypes\/[a-z-]+$/.test(token),
    rejects: ['runtypes', 'runtypes/Types.ts'],
  },
];

// Returns {mark, rule} for the first rule that claims this row, or null when none does.
// A null is not a failure: it is the residue, and the residue is exactly what a person
// still has to decide.
export function classify(token, kind, area, file) {
  for (const rule of RULES) {
    if (rule.test(token, kind, area, file)) return {mark: rule.mark, rule: rule.name};
  }
  return null;
}
