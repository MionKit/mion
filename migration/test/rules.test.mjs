// The exactness guard. A rule that quietly widens is the one failure mode that could
// rename part of the public API, so every rule states what it claims AND what it must
// reject, and both directions are asserted here.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RULES, classify} from '../lib/rules.mjs';
import {isKnownTransform} from '../lib/transforms.mjs';
import {isGenerated} from '../lib/walk.mjs';

test('every rule marks with a known transform', () => {
  for (const rule of RULES) {
    assert.ok(isKnownTransform(rule.mark), `rule ${rule.name} marks unknown transform ${rule.mark}`);
  }
});

test('every rule explains itself', () => {
  for (const rule of RULES) {
    assert.ok(rule.why && rule.why.length > 10, `rule ${rule.name} has no usable "why"`);
  }
});

test("each rule rejects its declared near-misses", () => {
  for (const rule of RULES) {
    for (const token of rule.rejects ?? []) {
      assert.equal(
        rule.test(token, 'code', '02-ts-core', 'packages/ts-runtypes/src/x.ts'),
        false,
        `rule ${rule.name} must NOT claim ${JSON.stringify(token)}`
      );
    }
  }
});

// The single most important assertion in this directory. These are the public API; if a
// rule ever claims one of them for a rename, consumers' code stops compiling.
// InjectTypeFnArgs is deliberately absent: it carries no "runtype" spelling at all, so
// the scan never surfaces it and no rule could touch it.
const PUBLIC_API = [
  'getRunTypeId',
  'InjectRunTypeId',
  'RunType',
  'RunTypes',
  'RunTypeKind',
  'RunTypeSubKind',
  'runTypeId',
  'StripRunTypeMeta',
  'getRunType',
  'RunTypeError',
];

test('the public API is always kept, in every code context', () => {
  for (const token of PUBLIC_API) {
    for (const kind of ['code', 'go', 'comment', 'trailing-comment', 'import-spec', 'md-code']) {
      const verdict = classify(token, kind, '02-ts-core', 'packages/ts-runtypes/src/index.ts');
      assert.ok(verdict, `${token}@${kind} was claimed by no rule at all`);
      assert.equal(verdict.mark, 'keep', `${token}@${kind} must be kept, got ${verdict.mark}`);
    }
  }
});

test('the rt families that are public data / wire format are kept', () => {
  const cases = [
    ['rt$label', 'keep:rt-dsl'],
    ['rt$errors', 'keep:rt-dsl'],
    ['rt::', 'keep:rt-ns'],
    ['rtFormats::', 'keep:rt-ns'],
    ['__rtFormatName', 'keep:rt-brand'],
    ['rtx', 'keep:rtx'],
    ['TS_RUNTYPES_BIN', 'keep:retired-env'],
    ['process.env.TS_RUNTYPES_BIN', 'keep:retired-env'],
  ];
  for (const [token, expected] of cases) {
    const verdict = classify(token, 'code', '06-scripts-ci', 'scripts/rt.mjs');
    assert.equal(verdict?.mark, 'keep', `${token} must be kept`);
    assert.equal(verdict?.rule, expected);
  }
});

test('the package name is claimed for renaming, never kept', () => {
  const cases = [
    ['@ts-runtypes/core', 'npm-scope'],
    ['@ts-runtypes/devtools', 'npm-scope'],
    ['node_modules/@ts-runtypes/core/package.json', 'npm-scope'],
    ['packages/ts-runtypes', 'pkg-dir'],
    ['packages/ts-runtypes-devtools', 'pkg-dir'],
    ['ts-runtypes', 'tool-name'],
    ['github.com/mionkit/ts-runtypes', 'go-module'],
    ['github.com/mionkit/ts-runtypes/internal/protocol', 'go-module'],
    ['ts-go-runtypes', 'go-dir'],
    ['__runtypes', 'gen-dir'],
    ['RT_SITE', 'env-var'],
    ['tsrt-website', 'image'],
    ['MionKit/ts-run-types', 'repo-url'],
  ];
  for (const [token, expected] of cases) {
    const verdict = classify(token, 'code', '06-scripts-ci', 'scripts/x.mjs');
    assert.ok(verdict, `${token} was claimed by no rule`);
    assert.notEqual(verdict.mark, 'keep', `${token} must NOT be kept`);
    assert.equal(verdict.mark, expected, `${token} expected ${expected}, got ${verdict.mark}`);
  }
});

test('capital T is what separates the concept from the package name', () => {
  // The concept always carries a capital T; the package name never does. This is the
  // discriminator `keep:concept` rests on, so it is asserted directly.
  assert.equal(classify('getRunTypeId', 'code', '02-ts-core', 'a.ts').mark, 'keep');
  assert.equal(classify('runTypeId', 'code', '02-ts-core', 'a.ts').mark, 'keep');
  assert.notEqual(classify('ts-runtypes', 'code', '02-ts-core', 'a.ts').mark, 'keep');
  assert.notEqual(classify('@ts-runtypes/core', 'code', '02-ts-core', 'a.ts').mark, 'keep');
});

test('a capital-T RunTypes in PROSE is the brand, left for a decision', () => {
  // In prose it is the product name, and whether the product is renamed is an open
  // question, so no rule may claim it.
  assert.equal(classify('RunTypes', 'md-prose', '08-docs-website', 'docs/x.md'), null);
  // In a code fence the same spelling is the API again, so it is kept.
  assert.equal(classify('RunTypes', 'md-code', '08-docs-website', 'docs/x.md').mark, 'keep');
});

test('docs/done is frozen wholesale, even for the package name', () => {
  const verdict = classify('@ts-runtypes/core', 'code', '09-frozen', 'docs/done/x.md');
  assert.equal(verdict.mark, 'freeze');
});

test('generated files are excluded from the walk, not marked by a rule', () => {
  // They used to carry a `regenerate` rule. That was wrong: a row key is
  // `token@kind@area` and carries no file, so the rule saw only whichever file produced
  // the row first, and one .snap was enough to mark 369 real sites as generated. The
  // exclusion lives in walk.mjs now, where the file is actually known.
  for (const file of [
    'pnpm-lock.yaml',
    'packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts',
    'container/website/app/components/content/go-generated/diagnostics-catalog.json',
    'packages/ts-runtypes-devtools/test/__snapshots__/cli-surface.test.ts.snap',
  ]) {
    assert.ok(isGenerated(file), `${file} must be excluded from the walk`);
  }
});

test('real source is NOT treated as generated', () => {
  for (const file of [
    'packages/ts-runtypes-devtools/test/union.test.ts',
    'ts-go-runtypes/internal/testfixtures/union.ts',
    'ts-go-runtypes/internal/compiler/resolver/testdata/a.json',
    'packages/core/src/runtypes/adapter.ts',
  ]) {
    assert.equal(isGenerated(file), false, `${file} must be scanned like any other source`);
  }
});

test('a package DIRECTORY and the bare TOOL name are different decisions', () => {
  // Phase 2 moves directories. The bare name is the CLI, the tsconfig plugin key, the
  // cache dir and the product in prose all at once (3065 sites), so renaming it is a
  // rebrand and belongs with the brand phase. Conflating them would smuggle a rebrand
  // into a directory move.
  for (const token of ['packages/ts-runtypes', 'packages/ts-runtypes-bin', '../packages/ts-runtypes']) {
    assert.equal(classify(token, 'code', '06-scripts-ci', 'x.mjs').mark, 'pkg-dir', token);
  }
  for (const token of ['ts-runtypes', 'ts-runtypes-devtools', 'ts-runtypes-bin']) {
    assert.equal(classify(token, 'code', '06-scripts-ci', 'x.mjs').mark, 'tool-name', token);
  }
});

test('a package-dir segment wins over every keep:* rule on the same path', () => {
  // `keep:src-dir` used to sit above `pkg-dir` and claimed the WHOLE path, so
  // packages/ts-runtypes/src/runtypes/x.ts kept its stale directory. The package
  // directory has to move whatever the rest of the path says; only the src/runtypes
  // part is the concept.
  assert.equal(
    classify('packages/ts-runtypes/src/runtypes/pure-fns-utils.ts', 'comment', '06-scripts-ci', 'x.mjs').mark,
    'pkg-dir'
  );
  // And the mion adapter directory, which is NOT under a package being renamed, is
  // still kept.
  assert.equal(classify('packages/core/src/runtypes/adapter.ts', 'code', '04-mion-packages', 'x.ts').mark, 'keep');
  assert.equal(classify('../../src/runtypes/types.ts', 'import-spec', '04-mion-packages', 'x.ts').mark, 'keep');
});
