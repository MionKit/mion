// With no `genDir`, the generated folder is `<include dir>/.mion`. A dev server's first edit hands the checker
// every project file, a root `vite.config.ts` included, and the folder used to climb to `./.mion`: two trees,
// with the imports pointing at the new one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLogger, createServer, type ViteDevServer} from 'vite';
import {afterEach, describe, expect, it} from 'vitest';
import {mionVitePlugin} from '../src/vite/index.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const register = hasBinary() ? describe : describe.skip;

const TSCONFIG = JSON.stringify({
  compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true},
  include: ['src'],
});
const A_TS = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const isUser = createValidateFn<{name: string}>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`;

async function waitFor(check: () => boolean, what: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

register('the inferred generated folder stays put in vite dev', () => {
  let dir = '';
  let vite: ViteDevServer | undefined;

  afterEach(async () => {
    await vite?.close();
    vite = undefined;
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('keeps src/.mion after an edit, with a vite.config.ts at the project root', async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mion-gen-dir-dev-')));
    fs.mkdirSync(path.join(dir, 'src'));
    writeMarkerPackage(dir);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
    fs.writeFileSync(path.join(dir, 'vite.config.ts'), 'export default {};\n');
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), A_TS);
    vite = await createServer({
      root: dir,
      configFile: false,
      customLogger: createLogger('silent'),
      server: {middlewareMode: true},
      plugins: mionVitePlugin({runTypes: {tsConfig: path.join(dir, 'tsconfig.json'), binary: BIN}}),
    });
    const inferred = path.join(dir, 'src', '.mion', 'types');
    await waitFor(() => fs.existsSync(inferred), 'the build-start output under src/.mion');

    const file = path.join(dir, 'src', 'a.ts');
    const before = fs.readdirSync(inferred).length;
    fs.writeFileSync(file, A_TS + 'export const isAge = createValidateFn<{age: number}>();\n');
    vite.watcher.emit('change', file);
    await waitFor(() => fs.readdirSync(inferred).length > before, 'the new validator under src/.mion');
    expect(fs.existsSync(path.join(dir, '.mion'))).toBe(false);
    const transformed = await vite.transformRequest('/src/a.ts', {ssr: true});
    expect(transformed?.code).toContain('/src/.mion/');
  }, 60_000);
});
