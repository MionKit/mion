// Build-path proof that the Go binary reads project knobs from the tsconfig
// mion plugin entry, with tsc-style precedence: a flag forwarded over
// the wire overrides the tsconfig value, which overrides the binary default.
//
// The signal is moduleMode: in 'allSingle' a getRunTypeId site rides the
// shared runtypes bundle (site.module === RUNTYPES_BUNDLE_BASENAME); in the
// default layout it rides a per-root facade (a different module). Driving
// moduleMode ONLY through tsconfig (no moduleMode forwarded) means the bundle
// routing can ONLY come from the build path having read the tsconfig.
//
// Each case is a real default-mode resolver (serve --sources project --tsconfig
// against an on-disk fixture), NOT the overlay serve modes the other suites use
// — those carry no tsconfig, so they never exercise this path.

import {describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {ResolverClient} from '../src/core/resolver-client.ts';
import {BIN, runIfBinary, writeMarkerPackage} from './helpers/inline.ts';
import {MODULE_MODE_ALL_SINGLE, RUNTYPES_BUNDLE_BASENAME} from '../src/core/go-generated/runtypes-constants.generated.ts';

const register = runIfBinary(it);

// Both getRunTypeId call shapes in one file (marker coverage rule): the static
// form supplies T, the reflection form infers it from a value. Equivalent T, so
// both sites must resolve to the SAME typeId.
const ENTRY = `import {getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
export const staticId = getRunTypeId<User>();
const u = {id: 1, name: 'm'} as User;
export const reflectedId = getRunTypeId(u);
`;

function tsconfig(pluginEntry: string): string {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": [],
    "plugins": [${pluginEntry}]
  },
  "include": ["*.ts"]
}`;
}

// makeFixture writes a self-contained project (ambient mion shim + one
// source + a tsconfig carrying pluginEntry) into a fresh temp dir.
function makeFixture(pluginEntry: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tsconfig-'));
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'entry.ts'), ENTRY);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfig(pluginEntry));
  return dir;
}

// scanModules spawns a default-mode resolver against the fixture's tsconfig and
// returns the recorded sites. cacheDir:'' forces the disk cache off (child
// MION_CACHE_DIR=''), so the run never writes under node_modules regardless of
// the fixture tsconfig's incremental setting.
async function scanSites(dir: string, opts: {moduleMode?: string; hashLength?: number} = {}) {
  const client = new ResolverClient(BIN, dir, 'tsconfig.json', {cacheDir: '', ...opts});
  try {
    const resp = await client.scanFiles(['entry.ts']);
    return resp.sites;
  } finally {
    client.close();
  }
}

describe('@mionjs/devtools / tsconfig plugin config (build path)', () => {
  register(
    'tsconfig moduleMode:allSingle is honored; both getRunTypeId shapes share one typeId',
    async () => {
      const dir = makeFixture(`{ "name": "mion", "moduleMode": "${MODULE_MODE_ALL_SINGLE}" }`);
      try {
        const sites = await scanSites(dir);
        expect(sites.length).toBe(2);
        // Hash equivalence: static getRunTypeId<User>() and reflection
        // getRunTypeId(u) resolve to the same cache entry.
        expect(sites[0].id).toBe(sites[1].id);
        // allSingle routes every getRunTypeId site to the shared runtypes
        // bundle — only possible if the build path read the tsconfig entry.
        expect(sites.every((s) => s.module === RUNTYPES_BUNDLE_BASENAME)).toBe(true);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'a forwarded --module-mode overrides the tsconfig entry (flag > tsconfig)',
    async () => {
      const dir = makeFixture(`{ "name": "mion", "moduleMode": "${MODULE_MODE_ALL_SINGLE}" }`);
      try {
        // tsconfig says allSingle, but the explicit flag forces the default
        // layout, so neither site lands on the shared bundle.
        const sites = await scanSites(dir, {moduleMode: 'default'});
        expect(sites.length).toBe(2);
        expect(sites[0].id).toBe(sites[1].id);
        expect(sites.some((s) => s.module === RUNTYPES_BUNDLE_BASENAME)).toBe(false);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'no mion plugin entry falls back to the default layout',
    async () => {
      const dir = makeFixture(`{ "name": "other" }`);
      try {
        const sites = await scanSites(dir);
        expect(sites.length).toBe(2);
        expect(sites.some((s) => s.module === RUNTYPES_BUNDLE_BASENAME)).toBe(false);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'tsconfig hashLength sets the generated short-id length end-to-end',
    async () => {
      // 12 is distinctly non-default (the binary default is 7); the id length can
      // only be 12 if the build path parsed the tsconfig hashLength.
      const dir = makeFixture(`{ "name": "mion", "hashLength": 12 }`);
      try {
        const sites = await scanSites(dir);
        expect(sites.length).toBe(2);
        // Both getRunTypeId shapes still resolve to one entry (equivalent T)...
        expect(sites[0].id).toBe(sites[1].id);
        // ...and the short id is exactly the tsconfig-configured length.
        expect(sites[0].id.length).toBe(12);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'a forwarded --hash-length overrides the tsconfig hashLength (flag > tsconfig)',
    async () => {
      const dir = makeFixture(`{ "name": "mion", "hashLength": 12 }`);
      try {
        // The bundler forwards hashLength over the wire (--hash-length); it must
        // win over the tsconfig value — proving both the wire forwarding and the
        // tsc-style precedence.
        const sites = await scanSites(dir, {hashLength: 9});
        expect(sites.length).toBe(2);
        expect(sites[0].id).toBe(sites[1].id);
        expect(sites[0].id.length).toBe(9);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );
});

// A project-wide validate.numberMode default: the Go binary reads it off the
// tsconfig `validate` object and folds it into every validate site's fnId
// variant, with a forwarded --number-mode winning tsc-style. The signal is the
// createValidateFn site's fnId — it forks when the default is non-isFinite.
const VAL_ENTRY = `import {createValidateFn} from '@mionjs/run-types';
export const isNum = createValidateFn<number>();
`;

function makeValFixture(pluginEntry: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-numbermode-'));
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'entry.ts'), VAL_ENTRY);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfig(pluginEntry));
  return dir;
}

async function valFnId(dir: string, opts: {numberMode?: string} = {}): Promise<string> {
  const client = new ResolverClient(BIN, dir, 'tsconfig.json', {cacheDir: '', ...opts});
  try {
    const resp = await client.scanFiles(['entry.ts']);
    const site = resp.sites.find((s) => s.fnId);
    if (!site?.fnId) throw new Error('expected a createValidateFn site with an injected fnId');
    return site.fnId;
  } finally {
    client.close();
  }
}

describe('@mionjs/devtools / tsconfig validate.numberMode (build path)', () => {
  register(
    'tsconfig validate.numberMode:typeof forks the validate fnId project-wide',
    async () => {
      const plainDir = makeValFixture(`{ "name": "mion" }`);
      const typeofDir = makeValFixture(`{ "name": "mion", "validate": { "numberMode": "typeof" } }`);
      try {
        // The only difference between the two projects is the tsconfig default,
        // so a differing fnId proves the build path read validate.numberMode.
        expect(await valFnId(typeofDir)).not.toBe(await valFnId(plainDir));
      } finally {
        fs.rmSync(plainDir, {recursive: true, force: true});
        fs.rmSync(typeofDir, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'a forwarded --number-mode overrides the tsconfig validate.numberMode (flag > tsconfig)',
    async () => {
      const plainDir = makeValFixture(`{ "name": "mion" }`);
      const typeofDir = makeValFixture(`{ "name": "mion", "validate": { "numberMode": "typeof" } }`);
      try {
        const plain = await valFnId(plainDir);
        // tsconfig says typeof, but the forwarded flag forces isFinite (the
        // default) back — so the fnId collapses to the plain one.
        expect(await valFnId(typeofDir, {numberMode: 'isFinite'})).toBe(plain);
      } finally {
        fs.rmSync(plainDir, {recursive: true, force: true});
        fs.rmSync(typeofDir, {recursive: true, force: true});
      }
    },
    60_000
  );
});
