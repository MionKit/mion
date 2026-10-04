// Turbopack has no plugin API and uses worker processes; one broker avoids a resolver build per worker.
// Next is not a workspace dependency; real builds run in container/pre-publish-e2e/apps/smoke-next.
// Adapter changes need both this suite and container coverage; see src/runtypes/next/AGENTS.md.
import {describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {ownsBroker, socketPathFor, startBroker} from '../src/runtypes/next/broker.ts';
import {createLineReader} from '../src/runtypes/next/wire.ts';
import {BIN, hasBinary} from './helpers/inline.ts';
import {
  PURE_FN_ARTIFACT_DIR,
  PURE_FN_ARTIFACT_INDEX,
  PURE_FN_HASH_PREFIX,
} from '../src/core/go-generated/runtypes-constants.generated.ts';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MARKER_PKG = path.resolve(REPO_ROOT, 'packages/run-types');

function writeProject(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    `{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,"skipLibCheck":true,"noEmit":true},"include":["src"]}`
  );
  fs.writeFileSync(
    path.join(root, 'src/entry.ts'),
    `import {getRunTypeId} from '@mionjs/run-types';
export interface Account { id: number; label: string }
export const staticId = getRunTypeId<Account>();
const sample: Account = {id: 1, label: 'a'};
export const reflectedId = getRunTypeId(sample);
`
  );
  const scope = path.join(root, 'node_modules/@mionjs');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(MARKER_PKG, path.join(scope, 'run-types'), 'dir');
}

// Asks the broker to rewrite one file, over the same socket a loader worker uses.
function askBroker(socketPath: string, file: string, code: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath, () => socket.write(`${JSON.stringify({id: 1, file, code})}\n`));
    socket.once('error', reject);
    socket.on(
      'data',
      createLineReader((line) => {
        socket.destroy();
        resolve(JSON.parse(line));
      })
    );
  });
}

describe('@mionjs/devtools / next broker', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'writes the pure-fn artifact into distDir once buildStart is done and again on the first request',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-next-artifact-'));
      writeProject(root);
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name: '@acme/next-app', type: 'module'}));
      fs.writeFileSync(
        path.join(root, 'src/pure.ts'),
        `import {registerPureFn} from '@mionjs/run-types/runtime';
export const slugify = registerPureFn((s: string): string => s.toLowerCase());
`
      );
      const distDir = path.join(root, '.next');
      const broker = await startBroker(root, {
        binary: BIN,
        cwd: root,
        tsconfig: 'tsconfig.json',
        genDir: '.mion',
        artifactDir: distDir,
      });
      try {
        expect(broker.owner).toBe(true);
        const entry = path.join(root, 'src/entry.ts');
        // Turbopack empties distDir between the config load and the first loader call.
        fs.rmSync(distDir, {recursive: true, force: true});
        const reply = await askBroker(broker.socketPath, entry, fs.readFileSync(entry, 'utf8'));
        expect(reply.ok).toBe(true);
        const artifactDir = path.join(distDir, PURE_FN_ARTIFACT_DIR);
        const index = JSON.parse(fs.readFileSync(path.join(artifactDir, PURE_FN_ARTIFACT_INDEX), 'utf8'));
        expect(index.package).toBe('@acme/next-app');
        expect(index.pureFns.map((row: {bindingName: string}) => row.bindingName)).toEqual(['slugify']);
        const hash = (index.pureFns[0].id as string).split(PURE_FN_HASH_PREFIX)[1];
        expect(fs.existsSync(path.join(artifactDir, '@acme/next-app', `${hash}.js`))).toBe(true);
      } finally {
        await broker.close();
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    60_000
  );

  it('keeps a resolver out of processes that only LOAD the config', () => {
    // Next's detached telemetry flush evaluates next.config but never bundles,
    // so a resolver started there is pure waste that also outlives the build.
    const original = process.argv[1];
    try {
      process.argv[1] = '/app/node_modules/next/dist/telemetry/detached-flush.js';
      expect(ownsBroker()).toBe(false);
      process.argv[1] = '/app/node_modules/next/dist/bin/next';
      expect(ownsBroker()).toBe(true);
    } finally {
      process.argv[1] = original;
    }
  });

  it('keys the socket per invocation, not per project', () => {
    // Keying on the project root alone makes the socket a global rendezvous a
    // stale-but-alive owner can hold, and a later run then joins a resolver
    // whose Program belongs to a finished build.
    const root = '/some/project';
    expect(socketPathFor(root, 111)).not.toBe(socketPathFor(root, 222));
    expect(socketPathFor(root, 111)).toBe(socketPathFor(root, 111));
  });

  register(
    'elects exactly one owner and serves every client from it',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-next-broker-'));
      writeProject(root);
      const options = {binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '.mion'};

      const [first, second] = await Promise.all([startBroker(root, options), startBroker(root, options)]);
      try {
        // next.config is evaluated more than once per build, so the second caller
        // must join rather than start a second resolver.
        expect([first.owner, second.owner].filter(Boolean)).toHaveLength(1);
        expect(first.socketPath).toBe(second.socketPath);

        const entry = path.join(root, 'src/entry.ts');
        const reply = await askBroker(first.socketPath, entry, fs.readFileSync(entry, 'utf8'));
        expect(reply.ok).toBe(true);
        expect(reply.code).toContain('.mion/types/');
        // The stamp is what makes a type edit elsewhere re-run this file.
        expect(reply.stamp).toBeTruthy();
        // typeDeps names the files actually declaring the reflected types, so
        // the loader can declare those instead of re-running every
        // marker-bearing file on any type change. The broker collects them
        // through the shared transform hook's addWatchFile, so this also pins
        // that the Next lane and the bundler lanes share ONE mechanism.
        expect(reply.typeDeps?.map((file: string) => path.basename(file))).toContain('entry.ts');
        // Empty typeDeps means unknown; the stamp prevents stale rewrites (src/runtypes/next/AGENTS.md, 7).
        expect(reply.stamp).toBeTruthy();
      } finally {
        await first.close();
        await second.close();
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );

  // The broker once forced `<root>/.mion` over the tsconfig or inferred genDir, missing the enrich CLI mirrors.
  async function generatedRootOf(root: string): Promise<{stamp: string; code: string}> {
    const handle = await startBroker(root, {binary: BIN, cwd: root, tsconfig: 'tsconfig.json'});
    try {
      const entry = path.join(root, 'src/entry.ts');
      const reply = await askBroker(handle.socketPath, entry, fs.readFileSync(entry, 'utf8'));
      expect(reply.ok).toBe(true);
      return {stamp: reply.stamp, code: reply.code};
    } finally {
      await handle.close();
    }
  }

  register(
    'with no genDir set, generates under the inferred source folder like every other host',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-next-gendir-'));
      writeProject(root);
      try {
        const {stamp, code} = await generatedRootOf(root);
        expect(stamp).toBe(path.join(root, 'src/.mion/types/.rt-stamp'));
        expect(fs.existsSync(stamp)).toBe(true);
        expect(code).toContain('./.mion/types/');
        expect(fs.existsSync(path.join(root, '.mion'))).toBe(false);
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'honours the tsconfig genDir',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-next-gendir-'));
      writeProject(root);
      const tsconfigPath = path.join(root, 'tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      tsconfig.compilerOptions.plugins = [{name: 'mion', genDir: 'gen'}];
      fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig));
      try {
        const {stamp, code} = await generatedRootOf(root);
        expect(stamp).toBe(path.join(root, 'gen/types/.rt-stamp'));
        expect(fs.existsSync(stamp)).toBe(true);
        expect(code).toContain('../gen/types/');
        expect(fs.existsSync(path.join(root, '.mion'))).toBe(false);
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'moves the invalidation stamp when a type changes',
    async () => {
      // The stamp is what re-runs a file whose rewrite depends on a type the
      // BUNDLER cannot see a dependency on. Proven load-bearing by A/B: with the
      // loader's addDependency(stamp) removed, editing an AMBIENT type under
      // `next dev` left a cached rewrite importing a generated module that had
      // just been pruned, and the dev server returned 500 with
      // "Can't resolve ../.mion/types/<hash>.js". With it, the same edit
      // re-transformed cleanly. (`next build` re-runs loaders anyway, so the
      // stamp is belt-and-braces there and essential in dev.)
      //
      // A stamp that never moved would be silently useless, so pin that it does.
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-next-broker-'));
      writeProject(root);
      const handle = await startBroker(root, {binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '.mion'});
      try {
        const entry = path.join(root, 'src/entry.ts');
        const first = await askBroker(handle.socketPath, entry, fs.readFileSync(entry, 'utf8'));
        expect(first.ok).toBe(true);
        const before = fs.readFileSync(first.stamp, 'utf8');

        const widened = fs
          .readFileSync(entry, 'utf8')
          .replace(
            'export interface Account { id: number; label: string }',
            'export interface Account { id: number; label: string; extra: string }'
          )
          .replace("const sample: Account = {id: 1, label: 'a'};", "const sample: Account = {id: 1, label: 'a', extra: 'x'};");
        fs.writeFileSync(entry, widened);
        const second = await askBroker(handle.socketPath, entry, widened);
        expect(second.ok).toBe(true);
        expect(second.code).not.toBe(first.code);
        expect(fs.readFileSync(second.stamp, 'utf8')).not.toBe(before);
      } finally {
        await handle.close();
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );

  register(
    'moves the invalidation stamp when the batch transport appears or vanishes',
    async () => {
      // A Next app that HOSTS the mion API gets the batch table's import appended to its route
      // handler, and that import appears when a client adds its first batch and vanishes when it
      // drops its last one. Turbopack has no edge to follow for either, exactly as with an ambient
      // type, so the stamp has to cover `<genDir>/rpc/` and not just `types/`. Driven at the file
      // level because what is being pinned is the stamp's REACH, not how the tree got there.
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-next-broker-'));
      writeProject(root);
      const handle = await startBroker(root, {binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '.mion'});
      try {
        const entry = path.join(root, 'src/entry.ts');
        const first = await askBroker(handle.socketPath, entry, fs.readFileSync(entry, 'utf8'));
        expect(first.ok).toBe(true);
        const before = fs.readFileSync(first.stamp, 'utf8');

        const rpcDir = path.join(root, '.mion/rpc');
        fs.mkdirSync(path.join(rpcDir, 'pf/rt'), {recursive: true});
        fs.writeFileSync(path.join(rpcDir, 'batches.generated.js'), '// GENERATED by mion\n');
        fs.writeFileSync(path.join(rpcDir, 'pf/rt/aMapper.js'), 'export const m = () => 1;\n');
        const withBatches = await askBroker(handle.socketPath, entry, fs.readFileSync(entry, 'utf8'));
        expect(withBatches.ok).toBe(true);
        const appeared = fs.readFileSync(withBatches.stamp, 'utf8');
        expect(appeared).not.toBe(before);

        // ...and back again when the last batch goes away.
        fs.rmSync(rpcDir, {recursive: true, force: true});
        const withoutBatches = await askBroker(handle.socketPath, entry, fs.readFileSync(entry, 'utf8'));
        expect(withoutBatches.ok).toBe(true);
        expect(fs.readFileSync(withoutBatches.stamp, 'utf8')).not.toBe(appeared);
      } finally {
        await handle.close();
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );

  register(
    'resolves both getRunTypeId call shapes to the same id',
    async () => {
      // The marker coverage rule: static getRunTypeId<T>() and reflection
      // getRunTypeId(value) must agree for an equivalent T, through this host too.
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-next-broker-'));
      writeProject(root);
      const handle = await startBroker(root, {binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '.mion'});
      try {
        const entry = path.join(root, 'src/entry.ts');
        const reply = await askBroker(handle.socketPath, entry, fs.readFileSync(entry, 'utf8'));
        expect(reply.ok).toBe(true);
        // Static rewrites to `getRunTypeId<Account>(undefined, __rt_X)` and
        // reflection to `getRunTypeId(sample, __rt_X)` — different call shapes,
        // and X must be the same entry for an equivalent T.
        const bindings = [...String(reply.code).matchAll(/getRunTypeId[^(]*\([^,)]*,\s*(__rt_\w+)\)/g)].map((match) => match[1]);
        expect(bindings).toHaveLength(2);
        expect(bindings[0]).toBe(bindings[1]);
      } finally {
        await handle.close();
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
  );

  // A RuntimeError (a validator for `symbol`, validate-symbol-root) is reported by `next dev`
  // and never stops it: the broker comes up, the loader gets its rewrite plus the
  // warning. `next build` halts on it. The broker has no bundler config to read
  // the lane from, so `next dev` says it through NODE_ENV (Next sets it before
  // the config loads), and `devServer` names it outright. Both marker shapes ride
  // along, per the marker coverage rule.
  describe('a RuntimeError never stops next dev, and always stops next build', () => {
    const BAD_ENTRY = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const alwaysThrows = createValidateFn<symbol>();
export interface Account { id: number; label: string }
export const staticId = getRunTypeId<Account>();
const sample: Account = {id: 1, label: 'a'};
export const reflectedId = getRunTypeId(sample);
`;
    function writeBadProject(): string {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-next-broker-'));
      writeProject(root);
      fs.writeFileSync(path.join(root, 'src/entry.ts'), BAD_ENTRY);
      return root;
    }
    async function withNodeEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
      const previous = process.env.NODE_ENV;
      if (value === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = value;
      try {
        return await run();
      } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
      }
    }

    register(
      'next dev (NODE_ENV=development): the file is rewritten and the finding rides along as a warning',
      async () => {
        const root = writeBadProject();
        const entry = path.join(root, 'src/entry.ts');
        const handle = await withNodeEnv('development', () =>
          startBroker(root, {binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '.mion'})
        );
        try {
          const reply = await askBroker(handle.socketPath, entry, BAD_ENTRY);
          expect(reply.ok).toBe(true);
          expect(reply.code).toContain('getRunTypeId');
        } finally {
          await handle.close();
          fs.rmSync(root, {recursive: true, force: true});
        }
      },
      120_000
    );

    for (const logStyle of ['grouped', 'lines'] as const) {
      register(
        `next build (NODE_ENV=production): the broker halts and every loader request fails naming the code (${logStyle})`,
        async () => {
          const root = writeBadProject();
          const entry = path.join(root, 'src/entry.ts');
          const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
          try {
            const handle = await withNodeEnv('production', () =>
              startBroker(root, {binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '.mion', logStyle})
            );
            try {
              const reply = await askBroker(handle.socketPath, entry, BAD_ENTRY);
              expect(reply.ok).toBe(false);
              // The halt reaches the loader as the same Error, never wrapped in a second one.
              expect(String(reply.error)).toMatch(/^Error: @mionjs\/devtools: build stopped on \d+ mion error/);
              const printed = [...warned.mock.calls.map((call) => String(call[0])), ...(reply.warnings ?? [])].join('\n');
              // Each print is one grouped block, or one line per finding with `lines`.
              if (logStyle === 'grouped') {
                expect(printed).toMatch(/^(\[@mionjs\/devtools\] )?error [a-z-]+ \(\d+\)$/m);
                expect(printed).not.toMatch(/\(\d+,\d+\): error /);
              } else {
                expect(printed).toMatch(/\(\d+,\d+\): error [a-z-]+: /);
                expect(printed).not.toMatch(/^(\[@mionjs\/devtools\] )?error [a-z-]+ \(\d+\)$/m);
              }
            } finally {
              await handle.close();
            }
          } finally {
            warned.mockRestore();
            fs.rmSync(root, {recursive: true, force: true});
          }
        },
        120_000
      );
    }

    register(
      'devServer: true names the lane without NODE_ENV',
      async () => {
        const root = writeBadProject();
        const entry = path.join(root, 'src/entry.ts');
        const handle = await withNodeEnv('production', () =>
          startBroker(root, {binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '.mion', devServer: true})
        );
        try {
          const reply = await askBroker(handle.socketPath, entry, BAD_ENTRY);
          expect(reply.ok).toBe(true);
        } finally {
          await handle.close();
          fs.rmSync(root, {recursive: true, force: true});
        }
      },
      120_000
    );
  });
});
