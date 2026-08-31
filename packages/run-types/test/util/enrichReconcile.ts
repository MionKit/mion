// Reconcile lane for the AI-enrichment suite: drives the `gen --update` /
// `gen --prune` CLI over a throwaway temp project (tsconfig + a source file +
// the enrich dir) and returns the resulting mirror-file text. Unlike the gen
// lane (which compares stdout skeletons), this exercises the FULL reconcile path
// on disk — property merge, rename, orphan, restore, prune — so the tests assert
// authored-value preservation + marker behaviour end-to-end. See
// docs/AI_ENRICHMENT.md → gen semantics.

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const BIN = resolve(REPO_ROOT, 'bin/ts-runtypes');
const LANE_ROOT = resolve(HERE, '../suites/enrich/.tmp/reconcile');

// Fixtures THIS module instance created. Cleanup removes only these, never the shared
// LANE_ROOT: test files run in parallel vitest workers that share this on-disk lane, so
// a blanket `rmSync(LANE_ROOT)` in one file's afterAll would delete a sibling file's
// in-flight fixtures (e.g. the enrich fuzzer's long-lived `fz-<seed>` dir), surfacing as
// a flaky ENOENT. Each worker has its own module instance, so its Set is private to it.
const createdFixtures = new Set<string>();

// A mirror family: each enrichment family owns its own mirror subtree
// (<genDir>/enriched/friendly/ vs <genDir>/enriched/mock/).
export type MirrorFamily = 'friendly' | 'mock';

// A reconcile fixture is a self-contained temp project under a unique subdir of
// the reconcile lane. `dir` is the project root (holds tsconfig + src/);
// `sourcePath` is the source .ts; `enrichDir` is the mirror root;
// `friendlyPath` / `mockPath` are the source's per-family mirror files.
export interface ReconcileFixture {
  dir: string;
  sourcePath: string;
  enrichDir: string;
  friendlyPath: string;
  mockPath: string;
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      rootDir: 'src',
      plugins: [{name: 'mion'}],
    },
  },
  null,
  2
);

// makeFixture lays down a temp project with one source module at src/<name>.ts
// carrying `source`. Each family's mirror path mirrors src/ under its family
// segment of the conventional <genDir>/enriched/ (genDir defaults to src/__runtypes).
export function makeFixture(name: string, source: string): ReconcileFixture {
  const dir = resolve(LANE_ROOT, name);
  createdFixtures.add(dir);
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(resolve(dir, 'src'), {recursive: true});
  writeFileSync(resolve(dir, 'tsconfig.json'), TSCONFIG);
  const sourcePath = resolve(dir, 'src', 'models.ts');
  writeFileSync(sourcePath, source);
  const enrichDir = resolve(dir, 'src', '__runtypes', 'enriched');
  const friendlyPath = resolve(enrichDir, 'friendly', 'models.ts');
  const mockPath = resolve(enrichDir, 'mock', 'models.ts');
  return {dir, sourcePath, enrichDir, friendlyPath, mockPath};
}

// mirrorPathOf resolves a family's mirror file path.
export function mirrorPathOf(fixture: ReconcileFixture, family: MirrorFamily): string {
  return family === 'friendly' ? fixture.friendlyPath : fixture.mockPath;
}

// setSource rewrites the fixture's source module (simulating a type edit).
export function setSource(fixture: ReconcileFixture, source: string): void {
  writeFileSync(fixture.sourcePath, source);
}

// editMirror reads, transforms, and rewrites one family's mirror file — used to
// inject authored values before a reconcile.
export function editMirror(fixture: ReconcileFixture, family: MirrorFamily, transform: (text: string) => string): void {
  const path = mirrorPathOf(fixture, family);
  const text = readFileSync(path, 'utf8');
  writeFileSync(path, transform(text));
}

// readMirror returns one family's mirror file text (throws if absent).
export function readMirror(fixture: ReconcileFixture, family: MirrorFamily): string {
  return readFileSync(mirrorPathOf(fixture, family), 'utf8');
}

// readMirrors returns BOTH families' mirror texts concatenated (a missing file
// reads as '') — the whole-state view for convergence / no-op compares.
export function readMirrors(fixture: ReconcileFixture): string {
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  return read(fixture.friendlyPath) + '\n<<<mock>>>\n' + read(fixture.mockPath);
}

// runGen runs `gen <source> <Type> [extraArgs…]` from the fixture's project
// root. Throws on a non-zero exit.
export function runGen(fixture: ReconcileFixture, typeName: string, extraArgs: string[] = []): void {
  const args = ['enrich', 'src/models.ts', typeName, ...extraArgs];
  const result = spawnSync(BIN, args, {cwd: fixture.dir, encoding: 'utf8'});
  if (result.error) throw new Error(`gen failed to launch: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gen ${args.join(' ')} exited ${result.status}: ${result.stderr}\n${result.stdout}`);
}

// runPrune runs `gen --prune <enrichDir>` from the fixture's project root —
// the whole mirror root, so carcasses in BOTH family files are swept.
export function runPrune(fixture: ReconcileFixture): void {
  const result = spawnSync(BIN, ['enrich', '--prune', fixture.enrichDir], {cwd: fixture.dir, encoding: 'utf8'});
  if (result.error) throw new Error(`prune failed to launch: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gen --prune exited ${result.status}: ${result.stderr}\n${result.stdout}`);
}

// cleanupReconcileLane removes only the fixtures THIS module instance created (never the
// shared LANE_ROOT), so a parallel sibling test file's in-flight fixtures survive.
export function cleanupReconcileLane(): void {
  for (const dir of createdFixtures) {
    if (existsSync(dir)) rmSync(dir, {recursive: true, force: true});
  }
  createdFixtures.clear();
}
