// Vitest's on-disk module cache keys a file on its own text, while mion's rewrite of it follows the whole program.
// The plugin's `configureVitest` mixes a program digest into the key of every file it may rewrite.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import runtypesRollup from '../src/runtypes/rollup.ts';
import runtypesVite from '../src/runtypes/vite.ts';
import {mionSfcPlugins} from '../src/vite/sfcTransform.ts';
import type {CacheKeyGenerator, VitestCacheContext} from '../src/core/types.ts';
import {BIN, callHook, createMarkerProject, hasBinary, type Hook} from './helpers/inline.ts';

const PLUGIN_DIST = path.resolve(__dirname, '../dist/runtypes/vite.js');
// The repo's own Vitest: its `experimental.fsModuleCache` is the cache Vitest 5 turns on by default, same key hook.
const VITEST = path.join(path.dirname(createRequire(__filename).resolve('vitest/package.json')), 'vitest.mjs');

function captureGenerator(plugin: {configureVitest: (context: VitestCacheContext) => void}, legacy = false): CacheKeyGenerator {
  let generator: CacheKeyGenerator | undefined;
  const define = (callback: CacheKeyGenerator): void => {
    generator = callback;
  };
  plugin.configureVitest(legacy ? {experimental_defineCacheKeyGenerator: define} : {defineCacheKeyGenerator: define});
  expect(generator).toBeTypeOf('function');
  return generator as CacheKeyGenerator;
}

const hostContext = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

// Stands in for the runtime package: the rewrite adds the reflected type as a second argument.
const STUB = `export function getRunTypeId(...args) {
  return args.length > 1 ? JSON.stringify(args[1]) : 'untransformed';
}
`;

// Both marker shapes, so the reflected form is shown to land on the static form's entry in every run.
const TEST_FILE = `import {writeFileSync} from 'node:fs';
import {getRunTypeId} from '@mionjs/run-types';
import type {User} from '../src/types';
test('id', () => {
  const user = {name: 'Ada'} as User;
  writeFileSync('result.json', JSON.stringify({static: getRunTypeId<User>(), reflected: getRunTypeId(user)}));
});
`;

function setInclude(dir: string, include: string[]): void {
  const file = path.join(dir, 'tsconfig.json');
  fs.writeFileSync(file, JSON.stringify({...JSON.parse(fs.readFileSync(file, 'utf8')), include}));
}

function vitestRun(dir: string): string {
  execFileSync(process.execPath, [VITEST, 'run'], {cwd: dir, stdio: 'pipe', env: {...process.env, CI: 'true'}});
  const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')) as {static: string; reflected: string};
  expect(result.reflected).toBe(result.static);
  return result.static;
}

/** Cache entry name to mtime, the metadata file left out. */
function cacheEntries(cacheDir: string): Map<string, number> {
  const entries = fs.readdirSync(cacheDir).filter((name) => name !== '_metadata.json');
  return new Map(entries.map((name) => [name, fs.statSync(path.join(cacheDir, name)).mtimeMs]));
}

describe('vitest fsModuleCache key', () => {
  // The child Vitest loads the BUILT plugin, as a consumer's config does.
  it.runIf(hasBinary() && fs.existsSync(PLUGIN_DIST))(
    'Vitest serves the new rewrite after the tsconfig include or another file changes',
    () => {
      const dir = createMarkerProject('rt-vitest-cache-');
      const cacheDir = path.join(dir, '.vitest-cache');
      fs.mkdirSync(path.join(dir, 'src'));
      fs.mkdirSync(path.join(dir, 'tests'));
      fs.writeFileSync(path.join(dir, 'src/types.ts'), 'export type User = {name: string};\n');
      fs.writeFileSync(path.join(dir, 'tests/id.test.ts'), TEST_FILE);
      fs.writeFileSync(path.join(dir, 'stub.js'), STUB);
      fs.writeFileSync(
        path.join(dir, 'vitest.config.mjs'),
        `import runtypes from ${JSON.stringify(PLUGIN_DIST)};
export default {
  plugins: [runtypes({binary: ${JSON.stringify(BIN)}})],
  resolve: {alias: [{find: /^@mionjs\\/run-types$/, replacement: ${JSON.stringify(path.join(dir, 'stub.js'))}}]},
  test: {globals: true, include: ['tests/**/*.test.ts'], experimental: {fsModuleCache: true, fsModuleCachePath: ${JSON.stringify(cacheDir)}}},
};
`
      );
      try {
        // The test file sits outside the program: nothing to rewrite, and Vitest caches it.
        setInclude(dir, ['src/**/*.ts']);
        expect(vitestRun(dir)).toBe('untransformed');
        const outsideProgram = cacheEntries(cacheDir);
        expect(outsideProgram.size).toBeGreaterThan(0);

        setInclude(dir, ['src/**/*.ts', 'tests/**/*.ts']);
        const first = vitestRun(dir);
        expect(first).not.toBe('untransformed');
        const included = cacheEntries(cacheDir);
        expect([...included.keys()].some((name) => !outsideProgram.has(name))).toBe(true);

        // Nothing changed: every entry is read back, none rewritten.
        expect(vitestRun(dir)).toBe(first);
        expect(cacheEntries(cacheDir)).toEqual(included);

        // A type edit in ANOTHER file leaves the test file's text untouched.
        fs.writeFileSync(path.join(dir, 'src/types.ts'), 'export type User = {name: string; age: number};\n');
        const edited = vitestRun(dir);
        expect(edited).not.toBe('untransformed');
        expect(edited).not.toBe(first);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    120_000
  );

  it.runIf(hasBinary())(
    'keys only the files the transform may rewrite, and skips the cache until the program is known',
    async () => {
      const dir = createMarkerProject('rt-vitest-cache-unit-');
      const staticSite = path.join(dir, 'static.ts');
      const staticCode = "import {getRunTypeId} from '@mionjs/run-types';\nexport const id = getRunTypeId<string>();\n";
      const reflectedSite = path.join(dir, 'reflected.ts');
      const reflectedCode =
        "import {getRunTypeId} from '@mionjs/run-types';\nconst text: string = 'hello';\nexport const id = getRunTypeId(text);\n";
      fs.writeFileSync(staticSite, staticCode);
      fs.writeFileSync(reflectedSite, reflectedCode);
      const plugin = runtypesVite({binary: BIN, cwd: dir, tsconfig: 'tsconfig.json'}) as any;
      const generate = captureGenerator(plugin);
      try {
        expect(generate({id: staticSite, sourceCode: staticCode})).toBe(false);
        expect(generate({id: reflectedSite, sourceCode: reflectedCode})).toBe(false);
        expect(generate({id: path.join(dir, 'style.css'), sourceCode: ''})).toBeUndefined();

        await callHook(plugin.buildStart as Hook, hostContext);
        const key = generate({id: staticSite, sourceCode: staticCode});
        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(generate({id: reflectedSite, sourceCode: reflectedCode})).toBe(key);
        expect(generate({id: path.join(dir, 'plain.ts'), sourceCode: 'export const x = 1;\n'})).toBeUndefined();
        // Vitest 4 registers through the `experimental_` name and gets the same key.
        expect(captureGenerator(plugin, true)({id: staticSite, sourceCode: staticCode})).toBe(key);
        expect(plugin.rtCacheDigest()).toBe(key);

        // A Vue SFC script registration is no edit: the key holds while it runs and after.
        const registration = plugin.rtHotUpdate(hostContext, [{file: path.join(dir, 'Comp.vue.ts'), content: staticCode}]);
        expect(generate({id: staticSite, sourceCode: staticCode})).toBe(key);
        await registration;
        expect(generate({id: staticSite, sourceCode: staticCode})).toBe(key);

        // A real edit skips the cache until its generate, then keys on the new program.
        const editedCode = `${staticCode}export const other = getRunTypeId<number>();\n`;
        const edit = plugin.rtHotUpdate(hostContext, [{file: staticSite, content: editedCode}]);
        expect(generate({id: staticSite, sourceCode: editedCode})).toBe(false);
        await edit;
        const editedKey = generate({id: staticSite, sourceCode: editedCode});
        expect(editedKey).toMatch(/^[0-9a-f]{64}$/);
        expect(editedKey).not.toBe(key);
      } finally {
        await callHook(plugin.buildEnd as Hook, hostContext);
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );

  it.runIf(hasBinary())(
    'a plugin option the program does not show still changes the key, on the rollup entry too',
    async () => {
      const dir = createMarkerProject('rt-vitest-cache-options-');
      const site = path.join(dir, 'site.ts');
      const code = "import {getRunTypeId} from '@mionjs/run-types';\nexport const id = getRunTypeId<string>();\n";
      fs.writeFileSync(site, code);
      const keyWith = async (hashLength: number): Promise<ReturnType<CacheKeyGenerator>> => {
        const plugin = runtypesRollup({binary: BIN, cwd: dir, tsconfig: 'tsconfig.json', hashLength}) as any;
        const generate = captureGenerator(plugin);
        try {
          await callHook(plugin.buildStart as Hook, hostContext);
          return generate({id: site, sourceCode: code});
        } finally {
          await callHook(plugin.buildEnd as Hook, hostContext);
        }
      };
      try {
        const short = await keyWith(6);
        expect(short).toMatch(/^[0-9a-f]{64}$/);
        expect(await keyWith(8)).not.toBe(short);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );

  it('the Vue pass keys a .vue file with mion code by the core digest', () => {
    let digest: string | false = false;
    const [injector] = mionSfcPlugins({name: 'rt', transform: () => null, rtCacheDigest: () => digest} as any);
    const generate = captureGenerator(injector as any);
    const sfc = '<script setup lang="ts">import {getRunTypeId} from \'@mionjs/run-types\';</script>';
    expect(generate({id: '/app/Comp.vue', sourceCode: sfc})).toBe(false);
    digest = 'abc';
    expect(generate({id: '/app/Comp.vue', sourceCode: sfc})).toBe('abc');
    expect(generate({id: '/app/Plain.vue', sourceCode: '<template><p /></template>'})).toBeUndefined();
    expect(generate({id: '/app/util.ts', sourceCode: sfc})).toBeUndefined();
  });
});
