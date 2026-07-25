// Translation lane of the AI-enrichment suite: drives the `gen --translate` /
// `check --translate` verbs over throwaway temp projects and asserts the i18n
// behaviour end-to-end. Translations are SRC-DERIVED: a locale file is
// generated from the source TYPE by the same driver as the friendly mirror
// (locale-parameterized plural arms + const prefix + output path) — the
// friendly mirror is only ever a discovery input (which sources translate),
// never a content input. The Go binary MUST be rebuilt before this runs.

import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {describe, it, expect, afterAll} from 'vitest';
import {makeFixture, setSource, runGen, cleanupReconcileLane, type ReconcileFixture} from '../../util/enrichReconcile.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '../../../../../bin/ts-runtypes');

afterAll(cleanupReconcileLane);

// The temp projects carry no ts-runtypes install, so format-branded fields use
// the INLINE intersection the resolver's structural format detection reads
// (`__rtFormatName` / `__rtFormatParams` sentinels — the same shape the real
// `TF.String<P>` aliases widen to). Inline (not via a local alias) so the
// closure emitter keeps the field as a leaf instead of hoisting a named type.
const NAME_FMT = "string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {minLength: 2}}";
const NAME_FMT_GROWN =
  "string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {minLength: 2; maxLength: 60}}";
const USER_SRC = `export interface User {\n  name: ${NAME_FMT};\n  email: string;\n}\n`;

// i18nFixture upgrades a reconcile fixture's tsconfig with the i18n plugin
// object and returns the per-locale translation path helper.
function i18nFixture(name: string, source: string, locales: string[], strict = false): ReconcileFixture {
  const fixture = makeFixture(name, source);
  writeFileSync(
    resolve(fixture.dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          rootDir: 'src',
          plugins: [{name: 'ts-runtypes', i18n: {sourceLocale: 'en', locales, strict}}],
        },
      },
      null,
      2
    )
  );
  return fixture;
}

function translationPath(fixture: ReconcileFixture, locale: string): string {
  return resolve(fixture.enrichDir, 'i18n', locale, 'models.ts');
}

function readTranslation(fixture: ReconcileFixture, locale: string): string {
  return readFileSync(translationPath(fixture, locale), 'utf8');
}

function editTranslation(fixture: ReconcileFixture, locale: string, transform: (text: string) => string): void {
  writeFileSync(translationPath(fixture, locale), transform(readTranslation(fixture, locale)));
}

// runBin spawns the CLI from the fixture root, returning status + output.
function runBin(fixture: ReconcileFixture, args: string[]): {status: number | null; out: string} {
  const result = spawnSync(BIN, args, {cwd: fixture.dir, encoding: 'utf8'});
  if (result.error) throw new Error(`${args.join(' ')} failed to launch: ${result.error.message}`);
  return {status: result.status, out: `${result.stdout}\n${result.stderr}`};
}

function runTranslate(fixture: ReconcileFixture, locale: string, extraArgs: string[] = []): void {
  const {status, out} = runBin(fixture, ['enrich', '--translate', locale, 'src/models.ts', ...extraArgs]);
  if (status !== 0) throw new Error(`gen --translate exited ${status}: ${out}`);
}

describe('enrichment i18n — gen --translate', () => {
  it('scaffolds a same-tree per-locale file straight from the source type', () => {
    const fixture = i18nFixture('tr-scaffold', USER_SRC, ['pl']);
    runGen(fixture, 'User'); // a source translates once it HAS a friendly mirror (discovery)
    runTranslate(fixture, 'pl');

    const translation = readTranslation(fixture, 'pl');
    expect(translation, 'one type annotates every friendly-family const').toContain(
      'export const pl_friendlyUser: FriendlyText<User>'
    );
    expect(translation).toContain("import type { FriendlyText } from '@ts-runtypes/core'");
    expect(translation, 'breadcrumb is the ordinary src type import').toContain("from '../../../../models'");
    expect(translation, 'plural keys carry the TARGET locale arms').toContain(
      "minLength: {one: '', few: '', many: '', other: ''}"
    );
    expect(translation, 'the locale rides the path + const prefix, not a marker').not.toContain('@rtI18n');
    expect(translation, 'mock never rides into translations').not.toContain('mock');
  });

  it('is create-only without --update: an authored file is left alone', () => {
    const fixture = i18nFixture('tr-create-only', USER_SRC, ['pl']);
    runGen(fixture, 'User');
    runTranslate(fixture, 'pl');
    editTranslation(fixture, 'pl', (text) => text.replace("name: {rt$label: ''", "name: {rt$label: 'Imię'"));
    const authored = readTranslation(fixture, 'pl');
    runTranslate(fixture, 'pl');
    expect(readTranslation(fixture, 'pl'), 'plain gen --translate never touches an existing file').toBe(authored);
  });

  it('reconciles value-preservingly from the src type, descending into rt$errors (the load-bearing case)', () => {
    const fixture = i18nFixture('tr-update', USER_SRC, ['pl']);
    runGen(fixture, 'User');
    runTranslate(fixture, 'pl');

    // The translator fills a plural arm + a label.
    editTranslation(fixture, 'pl', (text) =>
      text
        .replace("minLength: {one: ''", "minLength: {one: 'co najmniej $[val] znak'")
        .replace("email: {rt$label: ''", "email: {rt$label: 'Adres e-mail'")
    );

    // The SOURCE TYPE gains a maxLength param — the reconcile must scaffold the
    // new key INSIDE the existing rt$errors node, with pl arms.
    setSource(fixture, USER_SRC.replace(NAME_FMT, NAME_FMT_GROWN));

    runTranslate(fixture, 'pl', ['--update']);
    const updated = readTranslation(fixture, 'pl');
    expect(updated, 'authored arm survives').toContain("one: 'co najmniej $[val] znak'");
    expect(updated, 'authored label survives').toContain("rt$label: 'Adres e-mail'");
    expect(updated, 'src-added constraint scaffolded with target arms').toContain(
      "maxLength: {one: '', few: '', many: '', other: ''}"
    );

    // Idempotency: a second --translate --update is a byte-identical no-op.
    const first = readTranslation(fixture, 'pl');
    runTranslate(fixture, 'pl', ['--update']);
    expect(readTranslation(fixture, 'pl'), 'second update is byte-identical').toBe(first);
  });

  it('respects the authored rt$errors mode and author-owned keys on update', () => {
    const fixture = i18nFixture('tr-authored-mode', USER_SRC, ['pl']);
    runGen(fixture, 'User');
    runTranslate(fixture, 'pl');

    // The author converts name to the exclusive rt$default mode and plants an
    // unrecognized key on email (only type-attributable keys may be orphaned).
    editTranslation(fixture, 'pl', (text) =>
      text
        .replace(
          /name: \{rt\$label: '', rt\$errors: \{[^}]*\}\}\},/,
          "name: {rt$label: 'Imię', rt$errors: {rt$default: 'Nieprawidłowe imię'}},"
        )
        .replace(
          "email: {rt$label: '', rt$errors: {type: ''}}",
          "email: {rt$label: '', rt$errors: {type: '', customNote: 'author-owned'}}"
        )
    );

    runTranslate(fixture, 'pl', ['--update']);
    const updated = readTranslation(fixture, 'pl');
    expect(updated, 'a rt$default-only node is never descended').toContain("rt$errors: {rt$default: 'Nieprawidłowe imię'}");
    expect(updated, 'rt$default node does not get constraint keys re-scaffolded').not.toContain('minLength');
    expect(updated, 'unrecognized keys are author-owned, never orphaned').toContain("customNote: 'author-owned'");
    expect(updated).not.toContain('@rtOrphanChild');
  });

  it('--translate all fans out over every configured locale', () => {
    const fixture = i18nFixture('tr-all', 'export interface User { name: string }\n', ['es', 'pt-BR']);
    // The no-arg walk discovers targets as "sources that have a friendly
    // mirror" (path math only), so generate the friendly mirror first.
    runGen(fixture, 'User');
    const {status, out} = runBin(fixture, ['enrich', '--translate', 'all']);
    expect(status, out).toBe(0);
    expect(existsSync(translationPath(fixture, 'es'))).toBe(true);
    expect(existsSync(translationPath(fixture, 'pt-BR'))).toBe(true);
    expect(readTranslation(fixture, 'pt-BR')).toContain('export const pt_BR_friendlyUser: FriendlyText<User>');
  });

  it('--translate --prune strips translation carcasses', () => {
    const fixture = i18nFixture('tr-prune', 'export interface User { name: string; age: number }\n', ['pl']);
    runGen(fixture, 'User');
    runTranslate(fixture, 'pl');
    // Source drops a field → the translation reconcile orphans it.
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);
    runTranslate(fixture, 'pl', ['--update']);
    expect(readTranslation(fixture, 'pl')).toContain('@rtOrphanChild');

    runTranslate(fixture, 'pl', ['--prune']);
    expect(readTranslation(fixture, 'pl')).not.toContain('@rtOrphan');
  });
});

describe('enrichment i18n — check --translate', () => {
  it('reports blanks as warnings (exit 0) when lenient, errors (exit 1) when strict', () => {
    const lenient = i18nFixture('tr-check-lenient', 'export interface User { name: string }\n', ['pl'], false);
    runGen(lenient, 'User');
    runTranslate(lenient, 'pl');
    const lenientRun = runBin(lenient, ['enrich', '--translate', 'pl', '--no-emit']);
    expect(lenientRun.out).toContain('TR002');
    expect(lenientRun.status, 'lenient gate never fails the build').toBe(0);

    const strict = i18nFixture('tr-check-strict', 'export interface User { name: string }\n', ['pl'], true);
    runGen(strict, 'User');
    runTranslate(strict, 'pl');
    const strictRun = runBin(strict, ['enrich', '--translate', 'pl', '--no-emit']);
    expect(strictRun.out).toContain('TR002');
    expect(strictRun.status, 'strict gate fails CI on blanks').toBe(1);
  });

  it('flags a missing translation file (TR001) and an out-of-date one (TR003, vs the src type)', () => {
    const fixture = i18nFixture('tr-check-missing', 'export interface User { name: string }\n', ['pl']);
    runGen(fixture, 'User');
    const missing = runBin(fixture, ['enrich', '--translate', 'pl', '--no-emit']);
    expect(missing.out).toContain('TR001');

    runTranslate(fixture, 'pl');
    // The SOURCE TYPE changes; the translation is now stale even though the
    // friendly mirror hasn't been updated either — staleness is src-driven.
    setSource(fixture, 'export interface User { name: string; age: number }\n');
    const stale = runBin(fixture, ['enrich', '--translate', 'pl', '--no-emit']);
    expect(stale.out).toContain('TR003');
    expect(stale.out, 'the finding names the src file, not the friendly mirror').toContain('src/models.ts');
  });
});
