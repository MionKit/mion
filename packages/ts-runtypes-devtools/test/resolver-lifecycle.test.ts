// Resolver lifecycle hardening — the buildEnd close race and its two fixes:
//   - MessageTransport.close() DRAINS: a request already on the wire gets its
//     real response instead of rejecting with "resolver exited"; only new
//     requests are refused.
//   - ResolverClient respawns once and replays a request interrupted by an
//     UNEXPECTED child death (external kill, host teardown race); an
//     intentional close never respawns.
//   - The unplugin closes the shared resolver only when the LAST plugin
//     container tears down (vite runs one container per environment over one
//     plugin instance), so a sibling container's buildEnd no longer kills the
//     child under in-flight work.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {ResolverClient} from '../src/resolver-client.ts';
import runtypesRollup from '../src/rollup.ts';
import {BARE_CWD, BIN, hasBinary, MARKER_PACKAGE_OVERLAY, writeMarkerPackage} from './helpers/inline.ts';

const register = hasBinary() ? it : it.skip;

// Marker coverage rule: both getRunTypeId call shapes — static (caller
// supplies T) and reflection (T inferred from the value).
const USER_SRC = `import {getRunTypeId} from '@ts-runtypes/core';
interface User {name: string; age: number}
export const staticId = getRunTypeId<User>();
const aUser: User = {name: 'ada', age: 36};
export const valueId = getRunTypeId(aUser);
`;

function inlineClient(): ResolverClient {
  return new ResolverClient(BIN, BARE_CWD, '', {
    inlineSources: {...MARKER_PACKAGE_OVERLAY, 'user.ts': USER_SRC},
  });
}

// Both marker sites must have resolved — the drained/retried response is the
// REAL scan result, not a partial.
function expectBothShapesScanned(sites: Array<{file?: string}>): void {
  expect(sites.filter((site) => site.file === 'user.ts').length).toBe(2);
}

describe('resolver lifecycle: drain on close', () => {
  register('close() with a request in flight drains it to a real response', async () => {
    const client = inlineClient();
    // The request is written to the wire synchronously; the response needs
    // event-loop turns, so close() below is guaranteed to land mid-flight.
    const pending = client.scanFiles(['user.ts']);
    client.close();
    const result = await pending;
    expectBothShapesScanned(result.sites);
  });

  register('after an intentional close, new requests fail fast and nothing respawns', async () => {
    const client = inlineClient();
    const before = await client.scanFiles(['user.ts']);
    expectBothShapesScanned(before.sites);
    const pid = client.pid;
    client.close();
    await expect(client.scanFiles(['user.ts'])).rejects.toThrow('resolver is closed');
    expect(client.pid).toBe(pid);
  });
});

describe('resolver lifecycle: respawn-retry on unexpected child death', () => {
  register('a request issued after a silent child death respawns and succeeds', async () => {
    const client = inlineClient();
    const healthy = await client.scanFiles(['user.ts']);
    expectBothShapesScanned(healthy.sites);
    const oldPid = client.pid!;
    process.kill(oldPid, 'SIGKILL');
    // Let the 'exit' event mark the transport closed so the next request
    // exercises the closed-transport respawn path (the "resolver is closed"
    // cascade seen in CI).
    await new Promise((resolve) => setTimeout(resolve, 200));
    const recovered = await client.scanFiles(['user.ts']);
    expectBothShapesScanned(recovered.sites);
    expect(client.pid).toBeDefined();
    expect(client.pid).not.toBe(oldPid);
    client.close();
  });

  register('a request in flight when the child dies is replayed on the fresh child', async () => {
    const client = inlineClient();
    // Kill while the scan (program build, tens of ms) is on the wire. If the
    // response somehow wins the race the test still passes — the assertion is
    // that the caller NEVER observes "resolver exited".
    const pending = client.scanFiles(['user.ts']);
    process.kill(client.pid!, 'SIGKILL');
    const result = await pending;
    expectBothShapesScanned(result.sites);
    client.close();
  });
});

// Plugin-level lifecycle: two containers over one plugin instance (the vite
// client + ssr environment shape). Driven through the rollup adapter like the
// other plugin suites — the hooks are the shared unplugin factory's.
describe('resolver lifecycle: plugin refcounts containers', () => {
  let FIXTURE_DIR = '';

  const TSCONFIG = JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      types: [],
    },
    include: ['*.ts'],
  });

  const ctx = {
    error(message: string): never {
      throw new Error(message);
    },
    warn(): void {},
  };

  const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
    typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

  beforeEach(() => {
    FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lifecycle-'));
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'user.ts'), USER_SRC);
  });
  afterEach(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('first buildEnd keeps the shared resolver alive; last buildEnd closes it', async () => {
    const plugin = runtypesRollup({
      binary: BIN,
      cwd: FIXTURE_DIR,
      tsconfig: 'tsconfig.json',
      genDir: path.join(FIXTURE_DIR, '__runtypes'),
    }) as any;

    // Two containers start over the same plugin instance.
    await callHook(plugin.buildStart, ctx);
    await callHook(plugin.buildStart, ctx);

    // Container A tears down — the old behaviour closed the child right here.
    await callHook(plugin.buildEnd, ctx);

    // Container B still transforms through the shared resolver.
    const survived = (await callHook(plugin.transform, ctx, USER_SRC, path.join(FIXTURE_DIR, 'user.ts'))) as {
      code: string;
    } | null;
    expect(survived, 'transform after a sibling buildEnd must still be served').not.toBeNull();
    expect(survived!.code).toContain('__rt_');

    // Container B tears down — NOW the resolver closes and transforms stop.
    await callHook(plugin.buildEnd, ctx);
    const closed = (await callHook(plugin.transform, ctx, USER_SRC, path.join(FIXTURE_DIR, 'user.ts'))) as {
      code: string;
    } | null;
    expect(closed, 'transform after the last buildEnd must be inert').toBeNull();
  });
});
