// Resolver lifecycle hardening — the buildEnd close race and its two fixes:
//   - MessageTransport.close() DRAINS: a request already on the wire gets its
//     real response instead of rejecting with "resolver exited"; only new
//     requests are refused.
//   - ResolverClient respawns once and replays a request interrupted by an
//     UNEXPECTED child death (external kill, host teardown race); an
//     intentional close never respawns.
//   - The unplugin closes the shared resolver only when the LAST plugin
//     container tears down (vite runs one container per environment over one
//     plugin instance), so a sibling container's buildEnd never kills the
//     child under in-flight work.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {ResolverClient} from '../src/core/resolver-client.ts';
import runtypesRollup from '../src/runtypes/rollup.ts';
import {BARE_CWD, BIN, callHook, hasBinary, MARKER_PACKAGE_OVERLAY, writeMarkerPackage} from './helpers/inline.ts';

const register = hasBinary() ? it : it.skip;

// Marker coverage rule: both getRunTypeId call shapes — static (caller
// supplies T) and reflection (T inferred from the value).
const USER_SRC = `import {getRunTypeId} from '@mionjs/run-types';
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

describe('resolver lifecycle: a child that exits with an error is reported, not respawned', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-fatal-exit-'));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({extends: './missing-base.json'}));
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  register('a broken tsconfig surfaces the child error and never prints the respawn warning', async () => {
    const warnings: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => warnings.push(args.join(' '));
    try {
      const client = new ResolverClient(BIN, dir, 'tsconfig.json');
      const pid = client.pid;
      await expect(client.scanFiles(['user.ts'])).rejects.toThrow(/resolver exited \(code 1\): .*missing-base\.json/s);
      // a later request still names the real error instead of "resolver is closed"
      await expect(client.scanFiles(['user.ts'])).rejects.toThrow(/missing-base\.json/);
      expect(client.pid).toBe(pid);
      client.close();
    } finally {
      console.error = originalError;
    }
    expect(warnings.filter((line) => line.includes('respawned'))).toEqual([]);
  });
});

describe('resolver lifecycle: a crashing child (exit 2, a Go panic) is still respawned', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-crash-exit-'));
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  (process.platform === 'win32' ? it.skip : register)(
    'the first spawn exits 2, the respawned real resolver answers',
    async () => {
      const wrapper = path.join(dir, 'crash-once.sh');
      const marker = path.join(dir, 'crashed');
      fs.writeFileSync(
        wrapper,
        `#!/bin/sh\nif [ ! -f '${marker}' ]; then touch '${marker}'; echo 'panic: boom' >&2; exit 2; fi\nexec '${BIN}' "$@"\n`
      );
      fs.chmodSync(wrapper, 0o755);
      const originalError = console.error;
      console.error = () => {};
      try {
        const client = new ResolverClient(wrapper, BARE_CWD, '', {
          inlineSources: {...MARKER_PACKAGE_OVERLAY, 'user.ts': USER_SRC},
        });
        const result = await client.scanFiles(['user.ts']);
        expectBothShapesScanned(result.sites);
        client.close();
      } finally {
        console.error = originalError;
      }
    }
  );
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
      genDir: path.join(FIXTURE_DIR, '.mion'),
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
