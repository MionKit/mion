// The Next broker: one resolver and one whole-program buildStart shared by every
// Turbopack loader worker.
//
// Why this exists at all: Turbopack has no plugin API, so the only way in is a
// webpack-style loader, and Turbopack runs loaders in a POOL OF NODE WORKER
// PROCESSES (four on a typical machine). A loader that started its own resolver
// would start four of them and pay for four whole-program tsgo builds per build.
// Measured before the broker: 4 resolvers, buildStarts of 310/307/528/522ms.
// After: 1 resolver, one 323ms buildStart.
//
// # Why there is no `next build` test in this file
//
// `next` is ~202MB and is NOT a workspace dependency, so a vitest test that shells out to
// it would be permanently skipped here and in CI — a test that never runs, which is worse
// than no test. This file covers what can be proven WITHOUT Next; the real Turbopack build
// is covered in the e2e container, where Next is installed:
// container/pre-publish-e2e/apps/smoke-next (+ its entry in build-all.mjs and its
// assertions in test/build-outputs.test.mjs). A change to the adapter needs BOTH.
// See src/runtypes/next/CLAUDE.md.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {ownsBroker, socketPathFor, startBroker} from '../src/runtypes/next/broker.ts';
import {createLineReader} from '../src/runtypes/next/wire.ts';
import {BIN, hasBinary} from './helpers/inline.ts';

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
        // Both still ride: an EMPTY typeDeps means "unknown", not "no
        // dependencies", and the stamp is what keeps that case correct rather
        // than silently stale (src/runtypes/next/CLAUDE.md invariant 7).
        expect(reply.stamp).toBeTruthy();
      } finally {
        await first.close();
        await second.close();
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
    120_000
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
});
