// What a real vite dev server prints for mion findings: only what breaks running code, each once per session,
// through the dev server's logger without clearing the terminal. Warnings give way to one count line, since the
// editor shows them through the mion lint rules. A RuntimeError added by an edit is reported (it used to be
// lost: the edit handler read only the scan, never the regenerated program), and a fatal Error prints once and
// is thrown by the transform, which puts it in the overlay.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLogger, createServer, type ViteDevServer} from 'vite';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {mionVitePlugin} from '../src/vite/index.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const register = hasBinary() ? describe : describe.skip;

const TSCONFIG = JSON.stringify({
  compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true},
  include: ['src'],
});

// MKR001 (a function called only to read its return type) is a Warning; both getRunTypeId shapes resolve.
const A_TS = `import {getRunTypeId} from '@mionjs/run-types';
function load(): {name: string} {
  return {name: 'x'};
}
export const fromCall = getRunTypeId(load());
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`;
// VL002 (a root `symbol`) is a RuntimeError: the dev server reports it and keeps running.
const B_TS = `import {createValidateFn} from '@mionjs/run-types';
export const isSymbol = createValidateFn<symbol>();
`;
// VL003 (a root function type), added while the dev server runs.
const VL003_LINE = 'export const isFn = createValidateFn<(a: number) => void>();\n';
// MKR003 (a marker in a generic function) is a fatal Error: no code is produced for it.
const FATAL_TS = `import {createValidateFn} from '@mionjs/run-types';
export function makeValidator<T>() {
  return createValidateFn<T>();
}
`;

interface Logged {
  message: string;
  clear: boolean | undefined;
}

async function waitFor(check: () => boolean, what: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

register('the dev server prints only what breaks running code, once', () => {
  let dir = '';
  let vite: ViteDevServer | undefined;
  const logged: Logged[] = [];
  const lines = (): string[] => logged.flatMap((entry) => entry.message.split('\n'));
  const count = (needle: string): number => lines().filter((line) => line.includes(needle)).length;

  beforeEach(async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mion-dev-reporter-')));
    fs.mkdirSync(path.join(dir, 'src'));
    writeMarkerPackage(dir);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), A_TS);
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), B_TS);
    logged.length = 0;
    const logger = createLogger('silent');
    logger.warn = (message: string, options?: {clear?: boolean}) => void logged.push({message, clear: options?.clear});
    vite = await createServer({
      root: dir,
      configFile: false,
      customLogger: logger,
      server: {middlewareMode: true},
      plugins: mionVitePlugin({
        runTypes: {tsConfig: path.join(dir, 'tsconfig.json'), binary: BIN, genDir: path.join(dir, '.mion')},
      }),
    });
    await waitFor(() => count('error VL002') > 0, 'the start-up report');
  });

  afterEach(async () => {
    await vite?.close();
    vite = undefined;
    fs.rmSync(dir, {recursive: true, force: true});
  });

  const edit = async (rel: string, content: string): Promise<void> => {
    const file = path.join(dir, 'src', rel);
    fs.writeFileSync(file, content);
    vite!.watcher.emit('change', file);
  };

  it('reports the RuntimeError once and the warning as one count line, never clearing the terminal', async () => {
    expect(count('error VL002')).toBe(1);
    expect(count('MKR001')).toBe(0);
    expect(lines()).toContain('mion: 1 warning (1 new). Your editor shows them through the mion lint rules.');
    expect(logged.every((entry) => entry.clear === false)).toBe(true);
  }, 60_000);

  it('reports a RuntimeError added by an edit, once, and again after it was fixed and comes back', async () => {
    await edit('b.ts', B_TS + VL003_LINE);
    await waitFor(() => count('error VL003') === 1, 'VL003 after the edit');
    // An edit that brings nothing new prints nothing.
    const before = logged.length;
    await edit('b.ts', B_TS + VL003_LINE);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(logged.length).toBe(before);
    expect(count('error VL002')).toBe(1);

    await edit('b.ts', B_TS);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await edit('b.ts', B_TS + VL003_LINE);
    await waitFor(() => count('error VL003') === 2, 'VL003 printed again once it came back');
  }, 90_000);

  it('prints a fatal Error once and throws it from the transform, without printing it again', async () => {
    await edit('fatal.ts', FATAL_TS);
    await waitFor(() => count('error MKR003') === 1, 'MKR003 after the edit');
    await expect(vite!.transformRequest('/src/fatal.ts')).rejects.toThrow(
      /build stopped on 1 mion error\. First: .*error MKR003: /
    );
    expect(count('MKR003')).toBe(1);
  }, 60_000);
});
