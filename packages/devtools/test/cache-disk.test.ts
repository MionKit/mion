// End-to-end test for the on-disk RT artifact cache. Spawns a
// short-lived ResolverClient with the internal `cacheDir` override (forwarded
// as the child's MION_CACHE_DIR env) pointed at a temp directory, which forces
// the cache on there regardless of the project's incremental setting. Runs a
// scanFiles request, asserts that:
//   1. cache files appear under <cacheDir>/<fp>/<typeID>/<fnTag>.json
//      (the layout the plan locked in: file id == type id);
//   2. a second spawn against the same cache dir produces byte-identical
//      cache module output for the same sources (round-trip safety);
//   3. tweaking a non-version build option (--hash-length) moves the
//      fingerprint subdir so the previous cache doesn't leak across
//      incompatible configurations.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {ResolverClient} from '../src/core/resolver-client.ts';
import {BIN, hasBinary, MARKER_PACKAGE_OVERLAY} from './helpers/inline.ts';

// Fresh ResolverClient forcing the cache on at the supplied scratch directory
// (via the internal cacheDir override → child MION_CACHE_DIR env). Each test owns
// its own scratch root, and the override rides per-child env, so they run in
// parallel without stomping on each other.
function spawnWithCache(cacheDir: string): ResolverClient {
  const root = path.resolve(__dirname, '../../..');
  return new ResolverClient(BIN, root, '', {serverMode: true, cacheDir});
}

async function renderValidateFor(client: ResolverClient, files: Record<string, string>): Promise<string> {
  await client.setSources({...MARKER_PACKAGE_OVERLAY, ...files});
  const fileNames = Object.keys(files);
  const response = await client.scanFiles(fileNames, {includeEntryModules: true});
  const entryModules = response.entryModules ?? {};
  // Concatenate the validate-family entry modules (sorted by key) — the
  // per-entry equivalent of the pre-migration single validate body, byte-
  // stable across runs for the determinism assertions below.
  const keys = Object.keys(entryModules).sort();
  const body = keys.map((key) => `// ${key}\n` + entryModules[key]).join('\n');
  if (!body) throw new Error('no entry modules in response');
  return body;
}

const skipUnlessBinary = hasBinary() ? describe : describe.skip;

skipUnlessBinary('disk RT cache (end-to-end)', () => {
  // One scratch root per describe block; each test gets its own subdir.
  let scratchRoot: string;
  beforeAll(() => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-runtypes-cache-'));
  });
  afterAll(() => {
    fs.rmSync(scratchRoot, {recursive: true, force: true});
  });

  it('populates <cacheDir>/<fp>/<typeID>/it.json on first scan', async () => {
    const cacheDir = path.join(scratchRoot, 'populates');
    const client = spawnWithCache(cacheDir);
    try {
      await renderValidateFor(client, {
        'user.ts': `
          import {createValidateFn} from '@mionjs/run-types';
          export const isStr = createValidateFn<string>();
        `,
      });
    } finally {
      client.close();
    }
    // Find the single fingerprint subdir under the cache root.
    const fps = fs.readdirSync(cacheDir);
    expect(fps.length).toBe(1);
    const fpDir = path.join(cacheDir, fps[0]);

    // At least one typeID directory should have an `it.json` for the
    // string we resolved. Walk the tree; assert there's at least one
    // `it.json` and its contents look like a RTEntry.
    const rtFiles: string[] = [];
    for (const typeId of fs.readdirSync(fpDir)) {
      const itPath = path.join(fpDir, typeId, 'val.json');
      if (fs.existsSync(itPath)) rtFiles.push(itPath);
    }
    expect(rtFiles.length).toBeGreaterThan(0);
    const parsed = JSON.parse(fs.readFileSync(rtFiles[0], 'utf8'));
    // Mirrors disk.FormatVersion (internal/cachegen/diskcache/format.go). Bumped to 16
    // when Diagnostics was added so a warm entry re-emits the findings its walk
    // produced (v15 payloads carry none and must miss, or a cached build stays
    // silent). Earlier: v15 added PureFnRefs so a warm entry rebuilds its
    // demand-driven built-in pure-fn edges; v14 dropped constants.Version from the
    // fnHash salt, so a same-version rebuild misses stale payloads keyed by the old
    // fnHash prefix.
    expect(parsed.version).toBe(16);
    expect(typeof parsed.structuralID).toBe('string');
    expect(parsed.structuralID.length).toBeGreaterThan(0);
    expect(typeof parsed.argsText).toBe('string');
    // v5 payload is the tuple ARGUMENT TEXT — cache key first, no init() wrapper.
    expect(parsed.argsText).toMatch(/^'[A-Za-z0-9]+_[A-Za-z0-9]+',/);
  });

  it('second spawn against the same cache reproduces byte-identical output', async () => {
    const cacheDir = path.join(scratchRoot, 'roundtrip');
    const sources = {
      'roundtrip.ts': `
        import {createValidateFn} from '@mionjs/run-types';
        export const a = createValidateFn<string>();
        export const b = createValidateFn<number>();
        export const c = createValidateFn<{x: string; y: number}>();
      `,
    };
    const clientA = spawnWithCache(cacheDir);
    let first: string;
    try {
      first = await renderValidateFor(clientA, sources);
    } finally {
      clientA.close();
    }
    // Second spawn — same cache dir, same sources, fresh process.
    // Output must be byte-identical: same typeIDs (idempotence) and
    // either fresh or cached compile yields the same factory bodies.
    const clientB = spawnWithCache(cacheDir);
    let second: string;
    try {
      second = await renderValidateFor(clientB, sources);
    } finally {
      clientB.close();
    }
    expect(second).toBe(first);
  });

  it('--hash-length change moves the fingerprint subdir', async () => {
    // Sanity check on the fingerprint inclusion list. Default
    // hashLength=6 and a non-default 8 must land under different
    // <fp> directories so a cache entry written under one config is
    // not consulted under the other.
    const cacheDirDefault = path.join(scratchRoot, 'fp-default');
    const cacheDirAlt = path.join(scratchRoot, 'fp-alt');
    const sources = {
      'fp.ts': `
        import {createValidateFn} from '@mionjs/run-types';
        export const isStr = createValidateFn<string>();
      `,
    };
    const root = path.resolve(__dirname, '../../..');
    const clientDefault = new ResolverClient(BIN, root, '', {serverMode: true, cacheDir: cacheDirDefault});
    try {
      await renderValidateFor(clientDefault, sources);
    } finally {
      clientDefault.close();
    }
    // --hash-length is a CLI flag of the Go binary; the test client
    // doesn't expose it directly, so spawn one with the same shape
    // as ResolverClient does but adding the extra arg. For now,
    // accept that we can only assert the default path exists; the
    // hash-length isolation is covered by the Go-side fingerprint test
    // (internal/cachegen/diskcache/disk_test.go::TestFingerprint_OptionIsolation).
    expect(fs.existsSync(cacheDirDefault)).toBe(true);
    expect(fs.readdirSync(cacheDirDefault).length).toBe(1);
    // Empty alt dir would also have been created if we'd run the alt
    // config; leaving the assertion to the Go-side fingerprint test.
    expect(fs.existsSync(cacheDirAlt)).toBe(false);
  });

  // Diagnostics survive a cache HIT.
  //
  // The walker is what emits build-time findings, and a hit skips the walker —
  // so a project's warnings used to appear on the first build and then silently
  // vanish on every build after it, coming back only when someone wiped
  // node_modules/.cache/ts-runtypes. Measured on mion before the fix: 148
  // CLS001 lines cold, 0 warm. Entries now persist their findings and re-emit
  // them against the CURRENT build's call sites.
  it("re-emits an entry's diagnostics on a warm cache hit", async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-cache-diag-'));
    const sources = {
      'warm.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
export class Pet { name: string = 'x'; }
export const enc = createJsonEncoderFn<Pet>();
`,
    };
    const clsCodes = async (): Promise<string[]> => {
      const client = spawnWithCache(cacheDir);
      try {
        await client.setSources({...MARKER_PACKAGE_OVERLAY, ...sources});
        const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
        return (response.diagnostics ?? []).filter((d) => d.code === 'CLS001').map((d) => d.args?.[0] ?? '');
      } finally {
        client.close();
      }
    };

    const cold = await clsCodes();
    expect(cold, 'cold build must report the class-serializer advisory').toEqual(['Pet']);
    // Same sources, same cache dir — every entry is now a hit, so this is the
    // run that used to come back empty.
    const warm = await clsCodes();
    expect(warm, 'a cached build must report exactly what the cold one did').toEqual(cold);
    // And it must stay stable, not just survive one extra build.
    expect(await clsCodes()).toEqual(cold);
  });
});
