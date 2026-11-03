/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {collectBuildEntries} from '../../src/vite/buildEntries.ts';

const devtoolsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('collectBuildEntries', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mion-build-entries-'));
    const files: Record<string, string> = {
      'tsconfig.build.json': JSON.stringify({include: ['index.ts', 'src'], exclude: ['**/*.spec.ts']}),
      'index.ts': 'export * from "./src/a.ts";\n',
      'src/a.ts': 'export const a = 1;\n',
      'src/nested/b.ts': 'export const b = 2;\n',
      'src/a.spec.ts': 'export {};\n',
      'src/types.d.ts': 'export {};\n',
    };
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), {recursive: true});
      writeFileSync(join(dir, path), content);
    }
  });

  afterAll(() => rmSync(dir, {recursive: true, force: true}));

  it('maps every non-declaration root of the build tsconfig to its entry name', () => {
    expect(collectBuildEntries(dir)).toEqual({
      index: join(dir, 'index.ts'),
      'src/a': join(dir, 'src/a.ts'),
      'src/nested/b': join(dir, 'src/nested/b.ts'),
    });
  });

  it('names the tsconfig and the parse error when the config is broken', () => {
    writeFileSync(join(dir, 'broken.json'), JSON.stringify({extends: './missing.json'}));
    expect(() => collectBuildEntries(dir, 'broken.json')).toThrow(/broken\.json.*missing\.json/s);
  });

  it('devtools never loads the TypeScript JS API, so any installed TypeScript version works with the Vite plugin', () => {
    const sources = readdirSync(join(devtoolsRoot, 'src'), {recursive: true, encoding: 'utf8'}).filter((file) =>
      file.endsWith('.ts')
    );
    const importers = sources.filter((file) =>
      /from 'typescript'|import\('typescript'\)|require\('typescript'\)/.test(
        readFileSync(join(devtoolsRoot, 'src', file), 'utf8')
      )
    );
    expect(importers).toEqual([]);
    const manifest = JSON.parse(readFileSync(join(devtoolsRoot, 'package.json'), 'utf8'));
    expect(Object.keys(manifest.peerDependencies ?? {})).not.toContain('typescript');
  });
});
