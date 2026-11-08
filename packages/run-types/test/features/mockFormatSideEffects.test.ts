// A production Vite build honours `sideEffects`, so a mock registration import it does not keep makes mocks fail.

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {globSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'vite';
import runtypesPlugin from '@mionjs/devtools/runtypes/vite';

const packageRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const MOCK_ROUNDS = 50;

// One format per registration file; type-only formats import, like a consumer that brands types.
const APP = `import {createValidateFn} from '${path.join(packageRoot, 'src/index.ts')}';
import {createMockDataFn} from '${path.join(packageRoot, 'src/mocking/index.ts')}';
import type * as TF from '${path.join(packageRoot, 'src/formats/index.ts')}';
interface Formats {
  small: TF.Number<{integer: true; min: 1; max: 3}>;
  big: TF.BigInt<{min: 1n; max: 3n}>;
  id: TF.UUIDv4;
}
const seed = {small: 2, big: 2n, id: '3f2f38f5-8b2e-4b0e-9f0a-0d9c2a4b1e77'} as Formats;
export const staticShape = {mock: createMockDataFn<Formats>(), isValid: createValidateFn<Formats>()};
export const valueShape = {mock: createMockDataFn(seed), isValid: createValidateFn(seed)};
`;

type Shape = {mock: () => unknown; isValid: (value: unknown) => boolean};
type Chunk = {type: string; code?: string; fileName: string; isEntry?: boolean};

let root: string;
let app: {staticShape: Shape; valueShape: Shape};

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'mion-mock-side-effects-'));
  writeFileSync(path.join(root, 'app.ts'), APP);
  // rootDir `/`: the app lives outside the package and imports its sources by absolute path.
  const tsconfig = {extends: path.join(packageRoot, 'tsconfig.json'), include: ['app.ts'], compilerOptions: {rootDir: '/'}};
  writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig));
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: {conditions: ['source']},
    plugins: [
      runtypesPlugin({
        binary: path.join(repoRoot, 'mion-bin/mion'),
        cwd: root,
        tsconfig: 'tsconfig.json',
        genDir: path.join(root, '.mion'),
      }),
    ],
    build: {write: false, minify: false, lib: {entry: path.join(root, 'app.ts'), formats: ['es'], fileName: 'app'}},
  });
  const outputs = (Array.isArray(result) ? result : [result]) as {output: Chunk[]}[];
  const chunks = outputs.flatMap((out) => out.output).filter((chunk) => chunk.type === 'chunk');
  for (const chunk of chunks) writeFileSync(path.join(root, chunk.fileName), chunk.code ?? '');
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('build produced no entry chunk');
  app = await import(pathToFileURL(path.join(root, entry.fileName)).href);
}, 120_000);

afterAll(() => rmSync(root, {recursive: true, force: true}));

describe('format mocks in a production bundle', () => {
  it('static shape: every createMockDataFn<T>() value passes createValidateFn<T>()', () => {
    for (let round = 0; round < MOCK_ROUNDS; round++) expect(app.staticShape.isValid(app.staticShape.mock())).toBe(true);
  });

  it('value shape: every createMockDataFn(value) value passes createValidateFn(value)', () => {
    for (let round = 0; round < MOCK_ROUNDS; round++) expect(app.valueShape.isValid(app.valueShape.mock())).toBe(true);
  });
});

describe('package.json sideEffects', () => {
  it('keeps every file src reaches through a bare import', () => {
    const {sideEffects} = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {sideEffects: string[]};
    const kept = (file: string) => sideEffects.some((glob) => path.matchesGlob(`./${file}`, glob));
    const dropped: string[] = [];
    for (const file of globSync('src/**/*.ts', {cwd: packageRoot})) {
      const source = readFileSync(path.join(packageRoot, file), 'utf8');
      for (const [, target] of source.matchAll(/^import '(\.[^']+)';$/gm)) {
        const imported = path.relative(packageRoot, path.resolve(packageRoot, path.dirname(file), target));
        if (!kept(imported)) dropped.push(`${file} -> ${imported}`);
      }
    }
    expect(dropped).toEqual([]);
  });

  it('every src glob has its dist twin', () => {
    const {sideEffects} = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {sideEffects: string[]};
    const twins = sideEffects
      .filter((glob) => glob.startsWith('./src/'))
      .map((glob) => glob.replace('./src/', './dist/').replace(/\.ts$/, '.js'));
    expect(sideEffects).toEqual(expect.arrayContaining(twins));
  });
});
