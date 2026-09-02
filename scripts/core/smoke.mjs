#!/usr/bin/env node
// Fast end-to-end smoke for the Go binary + @mionjs/devtools wiring.
//
// What it exercises (~1s when everything is healthy):
//   - bin/mion spawns and accepts an --inline-server session
//     (no tsconfig handshake; mirrors the test helper).
//   - The plugin's transform() recognises the marker import and produces a
//     Site for both reflection forms AND a createX call.
//   - scanFiles({includeEntryModules: true}) returns the cache modules the
//     resolver would serve to Vite at rtmod:/<…>.js.
//
// Fixture coverage follows the marker test coverage rule (CLAUDE.md):
//   - getRunTypeId<T>()        — static
//   - getRunTypeId(value)      — reflect (T inferred from value)
//   - createValidateFn<T>()      — exercises the InjectTypeFnArgs path
//
// Exit codes: 0 PASS, 1 FAIL.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../../packages/devtools/dist/core/resolver-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin/mion');
const PLUGIN_DIST = path.join(REPO_ROOT, 'packages/devtools/dist');

function fail(msg) {
  console.error(`==> smoke: FAIL  ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(BIN)) {
  fail(`missing ${path.relative(REPO_ROOT, BIN)} - run 'pnpm miondevx core build'`);
}
if (!fs.existsSync(path.join(PLUGIN_DIST, 'core/resolver-client.js'))) {
  fail(`missing ${path.relative(REPO_ROOT, PLUGIN_DIST)} - run 'pnpm miondevx core build'`);
}

// The REAL marker package (package.json + built dist .d.ts tree) as virtual
// node_modules sources, so the smoke resolves `@mionjs/run-types` exactly the
// way a consumer install does — no hand-written stand-in to drift. The dist
// is guaranteed present: this script already gates on the built plugin dist,
// and `check:builds` covers the marker dist.
const MARKER_PKG_DIR = path.join(REPO_ROOT, 'packages/run-types');
const MARKER_OVERLAY = (() => {
  const files = {
    'node_modules/@mionjs/run-types/package.json': fs.readFileSync(path.join(MARKER_PKG_DIR, 'package.json'), 'utf8'),
  };
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${rel}${entry.name}/`);
      else if (entry.name.endsWith('.d.ts')) {
        files[`node_modules/@mionjs/run-types/dist/${rel}${entry.name}`] = fs.readFileSync(path.join(dir, entry.name), 'utf8');
      }
    }
  };
  walk(path.join(MARKER_PKG_DIR, 'dist'), '');
  return files;
})();

const SOURCES = {
  ...MARKER_OVERLAY,
  'static.ts': `import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<string>();\n`,
  'reflect.ts': `import {getRunTypeId} from '@mionjs/run-types';\nconst v: string = 'hi';\ngetRunTypeId(v);\n`,
  'validate.ts': `import {createValidateFn} from '@mionjs/run-types';\nconst isUser = createValidateFn<{name: string}>();\nisUser({name: 'x'});\n`,
};
const FILES = ['static.ts', 'reflect.ts', 'validate.ts'];

const started = Date.now();
console.log(`==> smoke: spawning ${path.relative(REPO_ROOT, BIN)} (--inline-server)`);
const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});

let exitCode = 0;
try {
  await client.setSources(SOURCES);

  // 1) Plugin transform for every fixture. Each call site must produce a Site
  //    so the patcher has somewhere to inject the resolved id. transform() is
  //    the resolver op the plugin's transform hook drives (see unplugin.ts); it
  //    reads the in-memory sources set above and returns the file-tagged sites.
  for (const file of FILES) {
    const {sites} = await client.transform([file]);
    if (sites.length === 0) fail(`transform produced no sites for ${file}`);
  }

  // 2) Resolver renders the cache modules the plugin would serve at
  //    rtmod:/<…>.js. An empty entryModules map means the type-fn /
  //    runtype bundle pipeline never fired.
  const result = await client.scanFiles(FILES, {includeEntryModules: true});
  const sites = result.sites ?? [];
  const entryCount = Object.keys(result.entryModules ?? {}).length;
  if (sites.length < FILES.length) fail(`scanFiles returned ${sites.length} sites for ${FILES.length} fixtures`);
  if (entryCount === 0) fail('scanFiles returned no entryModules');

  const elapsedMs = Date.now() - started;
  console.log(`==> smoke: PASS  ${FILES.length} fixtures rewritten, ${sites.length} sites, ${entryCount} entry modules (${elapsedMs}ms)`);
} catch (err) {
  console.error('==> smoke: FAIL ', err);
  exitCode = 1;
} finally {
  client.close();
}

process.exit(exitCode);
