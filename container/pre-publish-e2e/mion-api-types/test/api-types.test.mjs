// Read-only assertions over what run.mjs left under out/ and the client; run.mjs did every build.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const VERSION_DRIFT = /rpc-client-(?:server-version-mismatch|no-server-version)/;

const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(HERE, 'out');
const CLIENT = path.join(HERE, 'client');
const INSTALLED = path.join(CLIENT, 'node_modules/@acme/api/dist');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const build = (name) => readJson(path.join(OUT, `${name}.json`));
const serverVersion = () => readJson(path.join(INSTALLED, '.mion/api/manifest.json')).buildVersion;
const BUILDS = ['vite', 'cli'];

test('@acme/api ships its .d.ts and its server manifest, and the .d.ts carries the server build version', () => {
  const entries = execFileSync('tar', ['-tzf', path.join(OUT, 'tarballs/acme-api-0.0.0.tgz')], {encoding: 'utf8'}).split('\n');
  assert.ok(entries.includes('package/dist/index.d.ts'), 'the declarations ship');
  assert.ok(entries.includes('package/dist/.mion/api/manifest.json'), 'the server manifest ships for api-check');
  const version = serverVersion();
  assert.match(version, /^[A-Za-z0-9]{12}$/);
  assert.ok(readFileSync(path.join(INSTALLED, 'index.d.ts'), 'utf8').includes(`ApiBuildVersion<"${version}">`), 'the API type names the version');
  const overrides = readJson(path.join(INSTALLED, 'mion-pure-fns/index.json')).overrides ?? [];
  assert.equal(overrides.length, 1, 'the Note override ships, since a .d.ts keeps no override call');
});

for (const kind of BUILDS) {
  test(`client (${kind}): builds clean from the published types and injects the server's version`, () => {
    const {status, output} = build(`client-${kind}`);
    assert.equal(status, 0, output);
    assert.doesNotMatch(output, VERSION_DRIFT);
    const emitted = readFileSync(path.join(CLIENT, kind === 'vite' ? 'dist-vite/main.js' : 'dist-cli/main.js'), 'utf8');
    assert.ok(emitted.includes(`'${serverVersion()}'`) || emitted.includes(`"${serverVersion()}"`), 'the client carries the version');
  });

  test(`client (${kind}): calls the server booted from the tarball, with the pattern checked and no version error`, () => {
    const report = readJson(path.join(OUT, 'reports.json'))[kind];
    assert.deepEqual(report.product, {sku: 'ABC-1234', label: null});
    assert.equal(report.error, null);
    assert.ok(report.invalid, 'a sku that breaks the published pattern is refused');
  });
}

for (const kind of BUILDS) {
  test(`client-fetch (${kind}): built apart from its API, fetches its routes and calls the installed server`, () => {
    const {status, output} = build(`client-fetch-${kind}`);
    assert.equal(status, 0, output);
    assert.doesNotMatch(output, /rpc-client-(?:no-metadata-route|fetch-not-set-up|server-version-mismatch|no-server-version)/);
    const report = readJson(path.join(OUT, 'fetch-reports.json'))[kind];
    assert.deepEqual(report.product, {sku: 'ABC-1234', label: null});
    assert.equal(report.error, null);
    assert.ok(report.invalid, 'a sku that breaks the published pattern is refused');
  });
}

test('client: api-check passes between the shipped server manifest and the client build', () => {
  const {status, output} = build('api-check');
  assert.equal(status, 0, output);
});

test('client: bundles only the route it calls', () => {
  // mionFetchMetadata is alwaysRun, so it joins the called route's chain.
  assert.deepEqual(Object.keys(readJson(path.join(CLIENT, '.mion-cli/api/client-manifest.json')).methods), ['mionFetchMetadata', 'products/getBySku']);
  const bundle = readFileSync(path.join(CLIENT, 'dist-vite/main.js'), 'utf8');
  assert.ok(!bundle.includes('products/remove'), 'the uncalled route stays out');
  assert.ok(!bundle.includes('code.length'), 'no handler body reaches the client');
});

for (const kind of BUILDS) {
  test(`client-plain (${kind}): types written by plain tsc build with the rpc-client-no-server-version warning`, () => {
    const {status, output} = build(`client-plain-${kind}`);
    assert.equal(status, 0, output);
    assert.match(output, /rpc-client-no-server-version/);
  });

  test(`client-drift (${kind}): ids computed under another tsconfig fail the build with rpc-client-server-version-mismatch`, () => {
    const {status, output} = build(`client-drift-${kind}`);
    assert.notEqual(status, 0, output);
    assert.match(output, /rpc-client-server-version-mismatch/);
  });
}

const TYPES_TARBALL = path.join(OUT, 'tarballs/acme-api-types-0.0.0.tgz');

test('@acme/api-types: types only, the marker, the manifest and the pure fns, and no server-only code', () => {
  const entries = execFileSync('tar', ['-tzf', TYPES_TARBALL], {encoding: 'utf8'}).split('\n').filter(Boolean);
  for (const shipped of ['package/package.json', 'package/index.d.ts', 'package/mion-api.json', 'package/.mion/api/manifest.json', 'package/mion-pure-fns/index.json']) {
    assert.ok(entries.includes(shipped), `${shipped} ships`);
  }
  const javascript = entries.filter((entry) => entry.endsWith('.js') && !entry.startsWith('package/mion-pure-fns/'));
  assert.deepEqual(javascript, [], 'no server JavaScript');
  assert.ok(!entries.includes('package/audit.d.ts') && !entries.includes('package/internal.d.ts'), 'files only server-only code uses stay out');
  const dts = execFileSync('tar', ['-xzOf', TYPES_TARBALL, 'package/index.d.ts'], {encoding: 'utf8'});
  for (const serverOnly of ['serverRaw', 'serverAudit', 'AuditLog', 'RawSecret', 'startServer']) {
    assert.ok(!dts.includes(serverOnly), `${serverOnly} is not published`);
  }
  assert.ok(dts.includes('class Product'), 'a type the API reaches stays');
  assert.ok(entries.includes('package/_outside/@acme/geo.d.ts'), "the outside package's types ship printed");
  const printed = execFileSync('tar', ['-xzOf', TYPES_TARBALL, 'package/_outside/@acme/geo.d.ts'], {encoding: 'utf8'});
  assert.match(printed, /export declare enum Stock/);
  assert.match(printed, /export declare class Crate \{/);
  for (const entry of entries.filter((name) => name.endsWith('.d.ts'))) {
    const text = execFileSync('tar', ['-xzOf', TYPES_TARBALL, entry], {encoding: 'utf8'});
    assert.doesNotMatch(text, /['"]@acme\/geo['"]/, `${entry} imports no outside package`);
  }
  const manifest = execFileSync('tar', ['-xzOf', TYPES_TARBALL, 'package/.mion/api/manifest.json'], {encoding: 'utf8'});
  for (const serverOnly of ['serverRaw', 'serverAudit']) assert.ok(!manifest.includes(serverOnly), `${serverOnly} is not in the shipped manifest`);
  const pkg = JSON.parse(execFileSync('tar', ['-xzOf', TYPES_TARBALL, 'package/package.json'], {encoding: 'utf8'}));
  assert.equal(pkg.main, undefined);
  assert.equal(pkg.peerDependencies['@types/node'], undefined, "the raw middleware's node:http import leaves no peer");
  assert.deepEqual(pkg.mion, {apiTypes: './mion-api.json'});
  for (const peer of ['@mionjs/core', '@mionjs/router', '@mionjs/run-types']) assert.ok(pkg.peerDependencies[peer], `${peer} is a peer`);
  assert.equal(pkg.peerDependencies['@acme/geo'], undefined, 'a printed outside package is no peer');
  const marker = JSON.parse(execFileSync('tar', ['-xzOf', TYPES_TARBALL, 'package/mion-api.json'], {encoding: 'utf8'}));
  assert.equal(marker.package, '@acme/api');
  assert.equal(marker.buildVersion, serverVersion());
});

for (const name of ['client-types', 'client-types-fetch']) {
  for (const kind of BUILDS) {
    test(`${name} (${kind}): builds clean from the types-only package and calls the server`, () => {
      const {status, output} = build(`${name}-${kind}`);
      assert.equal(status, 0, output);
      assert.doesNotMatch(output, /rpc-client-(?:no-metadata-route|fetch-not-set-up|server-version-mismatch|no-server-version|types-not-built-by-mion|types-other-mion-version)/);
      const report = readJson(path.join(OUT, 'types-reports.json'))[name][kind];
      assert.deepEqual(report.product, {sku: 'ABC-1234', label: null});
      assert.equal(report.error, null);
      assert.ok(report.invalid, 'a sku that breaks the published pattern is refused');
      assert.ok(!existsSync(path.join(OUT, name, 'node_modules/@acme/geo')), 'the client never installs the outside package');
    });
  }
}

test('client-types: api-check passes against the manifest the types-only package ships', () => {
  const {status, output} = build('api-check-types');
  assert.equal(status, 0, output);
});

for (const kind of BUILDS) {
  test(`client-types-nomarker (${kind}): a types-only package without its marker fails with one rpc-client-types-not-built-by-mion`, () => {
    const {status, output} = build(`client-types-nomarker-${kind}`);
    assert.notEqual(status, 0, output);
    // the Vite error repeats its first finding, so count distinct messages
    const rpcClientTypesNotBuiltByMion = new Set(output.split('\n').filter((line) => line.includes('rpc-client-types-not-built-by-mion')).map((line) => line.slice(line.indexOf('rpc-client-types-not-built-by-mion'))));
    assert.equal(rpcClientTypesNotBuiltByMion.size, 1, output);
    assert.doesNotMatch(output, VERSION_DRIFT);
  });
}
