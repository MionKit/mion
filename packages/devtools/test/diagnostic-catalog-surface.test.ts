// The diagnostic catalog grew three exports nothing imported, one documenting a wire protocol
// cache format v10 had already replaced. A dead render helper reads as live API, so it survives
// re-reads; these two checks are what a reader cannot do by eye.

import {describe, it, expect} from 'vitest';
import {readFileSync, globSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, relative} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const CATALOG_PATH = 'packages/devtools/src/core/diagnosticCatalog.ts';

// Re-exports carry their own importers; only locally declared values are at risk of going dead.
function localExports(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm)].map((match) => match[1]);
}

// Counting bare occurrences of a name would call alwaysThrowFactory live off the run-types
// namesake, so only a binding imported FROM this module proves a caller.
function namesImportedFromCatalog(source: string): string[] {
  const imports = source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*\/diagnosticCatalog\.ts'/g);
  return [...imports].flatMap(([, clause]) => clause.split(',').map((name) => name.trim().split(/\s+as\s+/)[0]));
}

function workspaceSources(): {path: string; text: string}[] {
  return globSync('packages/*/src/**/*.ts', {cwd: REPO_ROOT}).map((path) => ({
    path,
    text: readFileSync(resolve(REPO_ROOT, path), 'utf8'),
  }));
}

describe('diagnosticCatalog exports', () => {
  it('every locally declared export has an importer', () => {
    const sources = workspaceSources().filter(({path}) => path !== CATALOG_PATH);
    const imported = new Set(sources.flatMap(({text}) => namesImportedFromCatalog(text)));
    const catalog = readFileSync(resolve(REPO_ROOT, CATALOG_PATH), 'utf8');
    const dead = localExports(catalog).filter((name) => !imported.has(name));
    expect(dead, 'unused export in diagnosticCatalog.ts — delete it or wire it up').toEqual([]);
  });

  // The live one is the utl.alwaysThrowFactory(message) method in run-types. A second function of
  // that name makes every grep for a caller land on the wrong file, which is how the dead copy lasted.
  it('only run-types declares alwaysThrowFactory', () => {
    const declarers = workspaceSources()
      .filter(({text}) => /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?alwaysThrowFactory\s*\(/m.test(text))
      .map(({path}) => relative('.', path));
    expect(declarers).toEqual(['packages/run-types/src/runtypes/rtUtils.ts']);
  });
});
