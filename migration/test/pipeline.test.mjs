// End-to-end over the EXACT composition apply.mjs uses: match -> kind -> classify ->
// rewrite -> splice. If any one of those five drifts, this catches it, which a test of
// each part in isolation would not.
//
// The headline assertion is the last one: a line made only of public API comes back
// byte-identical. That is the property the whole migration rests on.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchLine} from '../lib/match.mjs';
import {makeKinder} from '../lib/kind.mjs';
import {areaOf} from '../lib/area.mjs';
import {classify} from '../lib/rules.mjs';
import {rewriteToken, OUT_OF_PHASE} from '../lib/transforms.mjs';
import {applyEdits} from '../lib/edits.mjs';

const TARGETS = {
  packages: {
    '@ts-runtypes/core': '@mionjs/run-types',
    '@ts-runtypes/devtools': null,
    '@ts-runtypes/bin': null,
    '@ts-runtypes/binary': null,
    '@ts-runtypes/go-be-sidecar': null,
  },
};

// Mirrors apply.mjs: one file, one phase, returns the rewritten line.
function runPhase(file, line, phase) {
  const kindOf = makeKinder(file);
  const area = areaOf(file);
  const edits = [];

  for (const hit of matchLine(line)) {
    const kind = kindOf(line, hit.start);
    const verdict = classify(hit.token, kind, area, file);
    if (!verdict || verdict.mark !== phase) continue;

    const replacement = rewriteToken(hit.token, verdict.mark, TARGETS);
    if (replacement === OUT_OF_PHASE) continue;
    edits.push({start: hit.start, end: hit.end, text: replacement});
  }
  return applyEdits(line, edits);
}

test('a plain import specifier is rewritten', () => {
  assert.equal(
    runPhase('packages/core/src/x.ts', "import {validate} from '@ts-runtypes/core';", 'npm-scope'),
    "import {validate} from '@mionjs/run-types';"
  );
});

test('a subpath import keeps its subpath', () => {
  assert.equal(
    runPhase('packages/core/src/x.ts', "import {f} from '@ts-runtypes/core/formats';", 'npm-scope'),
    "import {f} from '@mionjs/run-types/formats';"
  );
});

test('two specifiers on one line both land', () => {
  assert.equal(
    runPhase(
      'packages/core/src/x.ts',
      "import {a} from '@ts-runtypes/core'; import {b} from '@ts-runtypes/core/builders';",
      'npm-scope'
    ),
    "import {a} from '@mionjs/run-types'; import {b} from '@mionjs/run-types/builders';"
  );
});

test('a package.json dependency key is rewritten', () => {
  assert.equal(
    runPhase('packages/core/package.json', '    "@ts-runtypes/core": "workspace:*",', 'npm-scope'),
    '    "@mionjs/run-types": "workspace:*",'
  );
});

test('a Go string literal is rewritten', () => {
  assert.equal(
    runPhase('ts-go-runtypes/internal/x.go', '\tcase specifier == "@ts-runtypes/core" && isTypeOnly:', 'npm-scope'),
    '\tcase specifier == "@mionjs/run-types" && isTypeOnly:'
  );
});

test('an out-of-phase package is left completely alone', () => {
  const line = "import runtypes from '@ts-runtypes/devtools/vite';";
  assert.equal(runPhase('packages/core/src/x.ts', line, 'npm-scope'), line);
});

test('a mixed line rewrites only the in-phase package', () => {
  assert.equal(
    runPhase(
      'packages/core/src/x.ts',
      "import {a} from '@ts-runtypes/core'; import p from '@ts-runtypes/devtools/vite';",
      'npm-scope'
    ),
    "import {a} from '@mionjs/run-types'; import p from '@ts-runtypes/devtools/vite';"
  );
});

// ---- THE safety property -------------------------------------------------------------

const PUBLIC_API_LINES = [
  "import {getRunTypeId, getRunType, RunTypeKind, type InjectRunTypeId} from './index';",
  'export type RunType<T> = StripRunTypeMeta<T>;',
  'const id = getRunTypeId<User>();',
  'const id2 = getRunTypeId(someValue);',
  'func (c *Cache) RunTypes() []*reflection.RunType { return c.runTypes }',
  'for _, runType := range runTypes { _ = runType.ID }',
  'export interface RunTypeSubKind { readonly kind: RunTypeKind }',
  'const errors = runTypeErrorsToIssues(runTypeErrors);',
];

test('a line of pure public API comes back BYTE-IDENTICAL', () => {
  for (const line of PUBLIC_API_LINES) {
    for (const file of ['packages/ts-runtypes/src/index.ts', 'ts-go-runtypes/internal/cache.go']) {
      for (const phase of ['npm-scope', 'pkg-dir', 'pkg-ident', 'go-module', 'gen-dir']) {
        assert.equal(runPhase(file, line, phase), line, `${phase} altered: ${line}`);
      }
    }
  }
});

test('the rt families survive every phase byte-identical', () => {
  const lines = [
    "const label = node['rt$label'] ?? node['rt$errors'];",
    "registerPureFnFactory('rt::countEnumKeys', factory);",
    'const brand = __rtFormatName in value;',
    "runOrThrow('pnpm', ['rtx', 'release']);",
  ];
  for (const line of lines) {
    for (const phase of ['npm-scope', 'pkg-dir', 'pkg-ident', 'env-var', 'gen-dir']) {
      assert.equal(runPhase('scripts/x.mjs', line, phase), line, `${phase} altered: ${line}`);
    }
  }
});

test('a public-API line that ALSO imports the package rewrites only the specifier', () => {
  // The realistic worst case: both meanings on one line, one character apart.
  assert.equal(
    runPhase(
      'packages/core/src/x.ts',
      "import {getRunTypeId, RunTypeKind} from '@ts-runtypes/core';",
      'npm-scope'
    ),
    "import {getRunTypeId, RunTypeKind} from '@mionjs/run-types';"
  );
});

test('docs/done is never touched, in any phase', () => {
  const line = "See `@ts-runtypes/core` and getRunTypeId for the original design.";
  for (const phase of ['npm-scope', 'pkg-dir', 'prose', 'freeze']) {
    assert.equal(runPhase('docs/done/old-plan.md', line, phase), line);
  }
});
