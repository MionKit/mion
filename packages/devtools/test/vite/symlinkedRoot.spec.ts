import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {build, type Rollup} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import runtypes from '../../src/runtypes/vite.ts';
import {BIN, createMarkerProject, hasBinary} from '../helpers/inline.ts';

const STATIC_ENTRY = `import {getRunTypeId} from '@mionjs/run-types';
export const staticId = getRunTypeId<{a: number}>();
`;
const VALUE_ENTRY = `import {getRunTypeId} from '@mionjs/run-types';
const sample = {a: 1};
export const valueId = getRunTypeId(sample);
`;

describe('a vite root reached through a symlink', () => {
  const register = hasBinary() ? it : it.skip;
  let realRoot = '';
  let linkRoot = '';

  beforeAll(() => {
    realRoot = createMarkerProject('rt-symlinked-root-');
    linkRoot = `${realRoot}-link`;
    fs.symlinkSync(realRoot, linkRoot, 'dir');
    fs.writeFileSync(path.join(realRoot, 'static.ts'), STATIC_ENTRY);
    fs.writeFileSync(path.join(realRoot, 'value.ts'), VALUE_ENTRY);
  });
  afterAll(() => {
    fs.rmSync(linkRoot, {force: true});
    fs.rmSync(realRoot, {recursive: true, force: true});
  });

  async function viteBuild(entry: string, tsconfig: string): Promise<string> {
    const result = (await build({
      root: linkRoot,
      configFile: false,
      logLevel: 'silent',
      plugins: [runtypes({binary: BIN, tsconfig, genDir: path.join(linkRoot, '.mion')}) as never],
      build: {
        write: false,
        minify: false,
        rollupOptions: {input: {entry: path.join(linkRoot, entry)}, external: [/^@mionjs\/run-types/]},
      },
    })) as Rollup.RollupOutput;
    return result.output[0].code;
  }

  register(
    'names the symlink instead of shipping getRunTypeId<T>() unrewritten',
    async () => {
      await expect(viteBuild('static.ts', 'tsconfig.json')).rejects.toThrow(`project path ${linkRoot} goes through a symlink`);
    },
    120_000
  );

  register(
    'names the symlink instead of shipping getRunTypeId(value) unrewritten',
    async () => {
      await expect(viteBuild('value.ts', 'tsconfig.json')).rejects.toThrow(`Build from ${realRoot} instead`);
    },
    120_000
  );

  // The real tsconfig keeps the program on real paths, so nothing is lost and nothing fails.
  register(
    'still rewrites getRunTypeId<T>() when the program holds real paths',
    async () => {
      expect(await viteBuild('static.ts', path.join(realRoot, 'tsconfig.json'))).not.toMatch(/getRunTypeId\(\s*\)/);
    },
    120_000
  );

  register(
    'still rewrites getRunTypeId(value) when the program holds real paths',
    async () => {
      expect(await viteBuild('value.ts', path.join(realRoot, 'tsconfig.json'))).not.toMatch(/getRunTypeId\(\{\s*a: 1\s*\}\)/);
    },
    120_000
  );
});
