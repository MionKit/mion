// Assertions over what run.mjs left: the packed tarballs, the installed libraries, the consumer's
// two builds and the reports their outputs printed. Read-only; run.mjs did every build.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(HERE, 'out');
const TARBALLS = path.join(OUT, 'tarballs');
const CONSUMER = path.join(HERE, 'consumer');
const ARTIFACT_DIR = 'mion-pure-fns';
const INDEX = 'index.json';
const HASH_PREFIX = '#pf_';
const ID = /^@acme\/[a-z]+#pf_[A-Za-z0-9_-]{14}$/;

const tarballOf = (name) => path.join(TARBALLS, readdirSync(TARBALLS).find((file) => file.startsWith(`acme-${name}-`)));
const entriesOf = (tarball) => execFileSync('tar', ['-tzf', tarball], {encoding: 'utf8'}).trim().split('\n');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
// A library's output dir once installed; a consumer's is one of its own build dirs.
const installed = (name) => path.join(CONSUMER, 'node_modules/@acme', name, 'dist');
const readIndex = (outDir) => readJson(path.join(outDir, ARTIFACT_DIR, INDEX));
// The same path the module has under `<genDir>/types/pf/`.
const modulePath = (id) => {
  const [pkg, hash] = id.split(HASH_PREFIX);
  return path.join(...pkg.split('/'), `${hash}.js`);
};
const readModule = (outDir, id) => readFileSync(path.join(outDir, ARTIFACT_DIR, modulePath(id)), 'utf8');
const idsOf = (outDir) => Object.fromEntries(readIndex(outDir).pureFns.map((row) => [row.bindingName, row.id]));

for (const [name, builtWith] of [
  ['text', 'the Vite adapter'],
  ['dates', 'mion compile'],
]) {
  test(`@acme/${name} (${builtWith}): the tarball ships dist/${ARTIFACT_DIR}/ and nothing of the build scratch`, () => {
    const entries = entriesOf(tarballOf(name));
    assert.ok(entries.includes(`package/dist/${ARTIFACT_DIR}/${INDEX}`), `no index in the tarball:\n${entries.join('\n')}`);
    const modules = entries.filter((entry) => new RegExp(`^package/dist/${ARTIFACT_DIR}/@acme/${name}/[A-Za-z0-9_-]{14}\\.js$`).test(entry));
    assert.equal(modules.length, name === 'text' ? 2 : 1, `one module per pure fn:\n${entries.join('\n')}`);
    assert.ok(entries.includes('package/dist/index.js') && entries.includes('package/dist/index.d.ts'), 'the bundle and its declarations ship');
    assert.ok(!entries.some((entry) => entry.startsWith('package/src/')), 'sources do not ship: the artifact is what serves the bodies');
    assert.ok(!entries.some((entry) => entry.startsWith('package/.mion/')), 'the gen dir is build scratch and does not ship');
  });
}

test('@acme/dates (mion compile): the gen dir placed inside dist ships, so the emitted imports resolve once installed', () => {
  const entries = entriesOf(tarballOf('dates'));
  assert.ok(entries.some((entry) => entry.startsWith('package/dist/.mion/types/pf/@acme/dates/')), `dist/.mion must ship:\n${entries.join('\n')}`);
  const emitted = readFileSync(path.join(installed('dates'), 'index.js'), 'utf8');
  const imports = [...emitted.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  assert.ok(imports.some((specifier) => specifier.startsWith('./.mion/')), `the emit imports its generated modules:\n${emitted}`);
  for (const specifier of imports.filter((entry) => entry.startsWith('.'))) {
    assert.ok(existsSync(path.join(installed('dates'), specifier)), `${specifier} must resolve inside the installed package`);
  }
});

test('@acme/plain (plain tsc): the tarball ships no compiled pure functions', () => {
  const entries = entriesOf(tarballOf('plain'));
  assert.ok(entries.includes('package/dist/index.js'), 'the emit ships');
  assert.ok(!entries.some((entry) => entry.includes(ARTIFACT_DIR)), `no ${ARTIFACT_DIR}/ from a build without mion:\n${entries.join('\n')}`);
});

test('installed @acme/text: the index maps each export to its id and each id to its module', () => {
  const dir = installed('text');
  const index = readIndex(dir);
  assert.equal(index.format, 1);
  assert.equal(index.package, '@acme/text');
  assert.deepEqual(
    index.pureFns.map((row) => row.bindingName).sort(),
    ['slugify', 'title'],
  );
  assert.deepEqual(
    index.pureFns.map((row) => row.id),
    [...index.pureFns.map((row) => row.id)].sort(),
    'rows are sorted by id',
  );
  for (const row of index.pureFns) {
    assert.match(row.id, ID);
    assert.equal(row.file, 'src/index.ts');
    assert.ok(existsSync(path.join(dir, ARTIFACT_DIR, modulePath(row.id))), `${row.id}: module at the path its id names`);
  }
  const {slugify, title} = idsOf(dir);
  assert.ok(readModule(dir, slugify).includes('toLowerCase'), 'slugify module carries its body');
  const titleModule = readModule(dir, title);
  assert.ok(titleModule.includes(`getPureFn(\\'${slugify}\\')`), 'title module carries the lowered slugify id');
  // The .d.ts is what tsc emitted: a name, no id. The index is how a consumer maps it.
  const dts = readFileSync(path.join(dir, 'index.d.ts'), 'utf8');
  assert.ok(!dts.includes(HASH_PREFIX), `the declarations carry no id:\n${dts}`);
});

test('installed @acme/dates: its module carries the lowered @acme/text id and lists it as a dep', () => {
  const {slugify} = idsOf(installed('text'));
  const {isoDay} = idsOf(installed('dates'));
  assert.match(isoDay, ID);
  const module = readModule(installed('dates'), isoDay);
  assert.ok(module.includes(`getPureFn(\\'${slugify}\\')`), `isoDay must reach slugify by id:\n${module}`);
  assert.ok(module.includes(`'${slugify}'`), 'the dep list names slugify');
  // `mion compile` bakes the id into the declaration, so a consumer needs no index lookup for it.
  assert.ok(readFileSync(path.join(installed('dates'), 'index.d.ts'), 'utf8').includes(isoDay));
});

test('consumer (Vite adapter): only the demanded modules are generated, and the consumer ships its own artifact', () => {
  const {slugify} = idsOf(installed('text'));
  const {isoDay} = idsOf(installed('dates'));
  const pf = path.join(CONSUMER, '.mion/types/pf');
  assert.deepEqual(readdirSync(path.join(pf, '@acme/text')), [modulePath(slugify).split(path.sep).pop()], 'slugify only: title was never demanded');
  assert.deepEqual(readdirSync(path.join(pf, '@acme/dates')), [modulePath(isoDay).split(path.sep).pop()]);
  const own = readIndex(path.join(CONSUMER, 'dist-vite'));
  assert.equal(own.package, '@acme/consumer');
  assert.deepEqual(own.pureFns.map((row) => row.bindingName), ['stamp']);
  assert.equal(readModule(path.join(CONSUMER, 'dist-vite'), own.pureFns[0].id), readFileSync(path.join(pf, modulePath(own.pureFns[0].id)), 'utf8'));
  assert.doesNotMatch(readFileSync(path.join(OUT, 'build-vite.log'), 'utf8'), /PFE901\d/);
});

test('consumer (mion compile): the same modules, its own artifact next to the emit, no library import left', () => {
  const {slugify} = idsOf(installed('text'));
  const pf = path.join(CONSUMER, '.mion-cli/types/pf');
  assert.deepEqual(readdirSync(path.join(pf, '@acme/text')), [modulePath(slugify).split(path.sep).pop()]);
  assert.equal(readdirSync(path.join(pf, '@acme/dates')).length, 1);
  const own = readIndex(path.join(CONSUMER, 'dist-cli'));
  assert.equal(own.package, '@acme/consumer');
  assert.deepEqual(own.pureFns.map((row) => [row.bindingName, row.file]), [['stamp', 'src/main.ts']]);
  const emitted = readFileSync(path.join(CONSUMER, 'dist-cli/main.js'), 'utf8');
  assert.ok(!emitted.includes("from '@acme/dates'"), 'lowering left the import unused, so the emit dropped it');
  assert.doesNotMatch(readFileSync(path.join(OUT, 'build-cli.log'), 'utf8'), /PFE901\d/);
});

for (const lane of ['vite', 'cli']) {
  test(`consumer (${lane}): the program served every body from the artifacts and both getRunTypeId shapes agree`, () => {
    const {slugify} = idsOf(installed('text'));
    const report = readJson(path.join(OUT, `report-${lane}.json`));
    assert.match(report.stampId, /^@acme\/consumer#pf_/);
    assert.equal(report.deps.length, 1);
    assert.match(report.deps[0], /^@acme\/dates#pf_/);
    // consumer -> dates -> text, all three bodies bound into the consumer's own modules.
    assert.equal(report.result, 'hello-world@2026-09-18');
    assert.deepEqual(report.isoDayDeps, [slugify]);
    assert.ok(report.servedSlugifyCode.includes('toLowerCase'));
    assert.ok(report.staticId && report.staticId === report.valueId, 'getRunTypeId<T>() and getRunTypeId(value) name one type');
  });
}

test('consumer (mion compile): nothing of @acme/text ran, so title exists nowhere in the registry', () => {
  // The Vite bundle keeps `import '@acme/dates'` for its side effects, which loads text too; the tsc-style emit drops it.
  assert.equal(readJson(path.join(OUT, 'report-cli.json')).titleStillOwnedByText, false);
});

for (const lane of ['vite', 'cli']) {
  test(`consumer-plain (${lane}): a dependency on a library built without mion fails the build with PFE9016`, () => {
    const {status, output} = readJson(path.join(OUT, `plain-${lane}.json`));
    assert.notEqual(status, 0, 'the build must fail');
    assert.match(output, /PFE9016/);
    assert.match(output, /@acme\/plain/);
  });
}
