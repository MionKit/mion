// Read-only assertions over what run.mjs left under out/ and the client; run.mjs did every build.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

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
    assert.doesNotMatch(output, /MET01[23]/);
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
    assert.doesNotMatch(output, /MET01[0-3]/);
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
  test(`client-plain (${kind}): types written by plain tsc build with the MET013 warning`, () => {
    const {status, output} = build(`client-plain-${kind}`);
    assert.equal(status, 0, output);
    assert.match(output, /MET013/);
  });

  test(`client-drift (${kind}): ids computed under another tsconfig fail the build with MET012`, () => {
    const {status, output} = build(`client-drift-${kind}`);
    assert.notEqual(status, 0, output);
    assert.match(output, /MET012/);
  });
}
