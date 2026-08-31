// The model + command set for the FriendlyText i18n-sync fuzzer.
//
// SUT: the `enrich --i18n` / `enrich --i18n --no-emit` pipeline over a (SOURCE
// TYPE, translation file T) pair — the SRC-DERIVED reconcile: a locale file is generated
// from the source TYPE by the same driver as the friendly mirror; the friendly
// mirror is a DISCOVERY input only (breadcrumb + type-name annotations), never
// a content input. The fuzzer therefore edits the .ts SOURCE (format params
// carry the constraint set) and keeps the friendly mirror deliberately filled
// with `SRC_` text — T2 proves that text never leaks into T even though the
// file sits right there. Random edit sequences, asserting after each:
//
//   T1  idempotence     a second `--i18n --update` is byte-identical
//   T2  never-copy      friendly-mirror text NEVER appears in a translation
//   T3  preservation    an authored translated leaf survives every update verbatim
//   T4  orphan-keep     a source-dropped leaf's authored value lives on in a carcass
//   T5  arms-owned      a translator-pruned plural arm stays pruned; extra arms stay
//   T6  kind-stable     plural constraints stay objects, string constraints stay strings
//   T7  todo/prune      prune strips carcasses only; a cleared @todo never regrows
//   T10 totality        every CLI run is controlled — never a panic/hang
//
// The shape is deliberately narrow so every oracle is SOUND: one type (User),
// one plural-bearing field (`alpha`, permanent, minLength format param),
// droppable string fields with an optional `pattern` format param. Fields use
// the INLINE format-brand intersection (`__rtFormatName`/`__rtFormatParams`
// sentinels — what the real TF.String<P> aliases widen to) so the temp project
// needs no mion install. Leaf fields render on ONE LINE in T, so
// leaf-scoped assertions are plain line lookups — no parser, no false
// positives.

import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import type {ReconcileFixture} from '../../util/enrichReconcile.ts';
import {BIN, type CliResult, isControlled} from './enrichCli.ts';

export type I18nRuleId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T10';

export interface I18nViolation {
  rule: I18nRuleId;
  command: string;
  step: number;
  seed: number;
  message: string;
}

export const LOCALE = 'pl';
const PL_ARMS = ['one', 'few', 'many', 'other'];
const PLURAL_FIELD = 'alpha'; // permanent — keeps the plural oracles alive
const NAME_POOL = ['bravo', 'charlie', 'delta', 'echo', 'foxtrot'];

interface FieldSpec {
  pattern: boolean; // declares a `pattern` format param (plain-string rt$errors key)
}

export interface I18nModel {
  /** Source-side fields (the next update's desired set). `alpha` is implicit. **/
  fields: Map<string, FieldSpec>;
  /** Fields as MATERIALIZED in T (as of the last scaffold/update). **/
  tFields: Map<string, FieldSpec>;
  /** leafId → token authored into T. leafId: `root.rt$label`, `<f>.rt$label`,
   *  `<f>.type`, `<f>.pattern`, `alpha.minLength.<arm>`. **/
  authored: Map<string, string>;
  /** Tokens whose leaf the source dropped — must live on inside a carcass. **/
  carcassed: Map<string, string>;
  /** Arms the translator pruned from alpha's plural (never `other`). **/
  prunedArms: Set<string>;
  /** The translator cleared the const's @todo line — it must never regrow. **/
  todoCleared: boolean;
  tokenCounter: number;
}

export function initialI18nModel(): I18nModel {
  return {
    fields: new Map([['bravo', {pattern: true}]]),
    tFields: new Map(),
    authored: new Map(),
    carcassed: new Map(),
    prunedArms: new Set(),
    todoCleared: false,
    tokenCounter: 0,
  };
}

export interface I18nCtx {
  fixture: ReconcileFixture;
  seed: number;
  step: number;
}

// --- paths + SUT plumbing -------------------------------------------------------

export function translationPathOf(fixture: ReconcileFixture): string {
  return resolve(fixture.enrichDir, 'i18n', LOCALE, 'models.ts');
}

function readTranslation(fixture: ReconcileFixture): string {
  return readFileSync(translationPathOf(fixture), 'utf8');
}

function writeTranslation(fixture: ReconcileFixture, text: string): void {
  writeFileSync(translationPathOf(fixture), text);
}

function runTranslateCli(fixture: ReconcileFixture, args: string[]): CliResult {
  const result = spawnSync(BIN, args, {cwd: fixture.dir, encoding: 'utf8', timeout: 30_000});
  const timedOut = result.signal != null && result.status == null && !result.error;
  return {
    argv: args,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut,
    launchError: result.error ? result.error.message : null,
  };
}

// The inline format-brand intersections the .ts source declares per field kind.
//
// ⚠️ EXCEPTION, NOT THE RULE: fuzz fixtures use the real shipped types,
// imported, wherever an import can resolve ("Real types, never copies" in
// test/fuzz/README.md). These are inline ONLY because the fixtures are scratch
// temp dirs with no mion install, so a relative import cannot resolve.
// Exported so i18nInlineSpelling.test.ts can pin them against the SHIPPED
// TF.String<P> encoding by structural id: if the sentinel encoding ever
// changes, that test fails loudly instead of this fuzzer silently exercising a
// plain string. Do not copy this pattern for new fixtures.
export const MINLENGTH_FMT = "string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {minLength: 2}}";
export function patternFmt(name: string): string {
  return `string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {pattern: {source: '${name}'; flags: ''}}}`;
}

// materializeSource writes the .ts SOURCE from the model — the ONLY desired-
// state input of the src-derived reconcile. The constraint set rides the
// format params: `alpha` keeps a count-bearing minLength (plural oracles),
// pattern-flagged fields declare a pattern param, the rest are plain strings.
export function materializeSource(fixture: ReconcileFixture, model: I18nModel): void {
  const decls = [`  ${PLURAL_FIELD}: ${MINLENGTH_FMT};`];
  for (const [name, spec] of model.fields) {
    decls.push(`  ${name}: ${spec.pattern ? patternFmt(name) : 'string'};`);
  }
  writeFileSync(fixture.sourcePath, `export interface User {\n${decls.join('\n')}\n}\n`);
}

// syncFriendlyMirror regenerates the friendly mirror from src (the ordinary
// gen reconcile) and fills EVERY blank with an `SRC_`-prefixed token, keeping
// it a realistic fully-authored source-language map. The mirror is only a
// DISCOVERY input for the translate verbs — T2 asserts its text never leaks
// into T, which is precisely the "generated files never feed generation"
// contract of the src-derived design.
export function syncFriendlyMirror(fixture: ReconcileFixture, model: I18nModel): CliResult {
  const args = existsSync(fixture.friendlyPath)
    ? ['enrich', 'src/models.ts', 'User', '--friendly', '--update']
    : ['enrich', 'src/models.ts', 'User', '--friendly'];
  const result = runTranslateCli(fixture, args);
  if (isControlled(result) && existsSync(fixture.friendlyPath)) {
    const text = readFileSync(fixture.friendlyPath, 'utf8');
    writeFileSync(
      fixture.friendlyPath,
      text.replace(/: ''/g, () => `: 'SRC_${model.tokenCounter++}'`)
    );
  }
  return result;
}

// --- line-scoped translation edits ----------------------------------------------

// fieldLineIndex finds the ONE line declaring a leaf field in T (fails loudly
// on ambiguity so oracles never silently probe the wrong leaf).
function fieldLine(text: string, field: string): {lines: string[]; index: number} {
  const lines = text.split('\n');
  const matches = lines.map((line, index) => ({line, index})).filter(({line}) => line.trimStart().startsWith(`${field}: {`));
  if (matches.length !== 1) {
    throw new Error(`fuzz harness: field ${field} matched ${matches.length} lines in the translation`);
  }
  return {lines, index: matches[0].index};
}

function editFieldLine(fixture: ReconcileFixture, field: string, edit: (line: string) => string): boolean {
  const text = readTranslation(fixture);
  const {lines, index} = fieldLine(text, field);
  const edited = edit(lines[index]);
  if (edited === lines[index]) return false;
  lines[index] = edited;
  writeTranslation(fixture, lines.join('\n'));
  return true;
}

function nextToken(model: I18nModel): string {
  return `FZT_${model.tokenCounter++}`;
}

// --- oracles ---------------------------------------------------------------------

const carcassPattern = /\/\* @rtOrphan(?:Child)? [\s\S]*? \*\//g;

function stripCarcasses(text: string): string {
  return text.replace(carcassPattern, '');
}

function violation(rule: I18nRuleId, command: string, ctx: I18nCtx, message: string): I18nViolation {
  return {rule, command, step: ctx.step, seed: ctx.seed, message};
}

function controlledOr(result: CliResult, command: string, ctx: I18nCtx, out: I18nViolation[]): boolean {
  if (isControlled(result)) return true;
  const why = result.timedOut
    ? 'timed out'
    : result.launchError
      ? `failed to launch: ${result.launchError}`
      : `exit ${result.status}`;
  out.push(violation('T10', command, ctx, `${why}: ${result.stderr.slice(0, 400)}`));
  return false;
}

// assertInvariants runs the whole post-state oracle battery over T.
function assertInvariants(model: I18nModel, ctx: I18nCtx, command: string, out: I18nViolation[]): void {
  const text = readTranslation(ctx.fixture);
  const live = stripCarcasses(text);

  // T2 — source text never leaks into a translation.
  if (text.includes('SRC_')) {
    out.push(violation('T2', command, ctx, 'source text leaked into the translation'));
  }
  // T3 — every authored live leaf survives verbatim, outside any carcass.
  for (const [leafId, token] of model.authored) {
    if (!live.includes(token)) {
      out.push(violation('T3', command, ctx, `authored leaf ${leafId} (${token}) lost or carcassed`));
    }
  }
  // T4 — a source-dropped leaf's value lives on inside a carcass.
  for (const [leafId, token] of model.carcassed) {
    if (!text.includes(token)) {
      out.push(violation('T4', command, ctx, `carcassed leaf ${leafId} (${token}) deleted (orphan must preserve)`));
    }
  }
  // T5 — pruned arms stay pruned (no blank re-scaffold).
  const {lines, index} = fieldLine(text, PLURAL_FIELD);
  const pluralLine = lines[index];
  for (const arm of model.prunedArms) {
    if (new RegExp(`\\b${arm}: ''`).test(pluralLine)) {
      out.push(violation('T5', command, ctx, `pruned arm '${arm}' re-scaffolded onto the plural`));
    }
  }
  // T6 — the plural stays an object; string constraints stay strings.
  if (!pluralLine.includes('minLength: {')) {
    out.push(violation('T6', command, ctx, 'alpha.minLength lost its plural-object kind'));
  }
  if (/pattern: \{/.test(live)) {
    out.push(violation('T6', command, ctx, 'a string constraint (pattern) became an object'));
  }
  // T7 — a cleared @todo never regrows (one fresh const → at most one line).
  const todoCount = (text.match(/\/\/ @todo:/g) ?? []).length;
  if (model.todoCleared && todoCount > 0) {
    out.push(violation('T7', command, ctx, 'cleared @todo regrew'));
  }
  if (todoCount > 1) {
    out.push(violation('T7', command, ctx, `@todo duplicated (${todoCount})`));
  }
}

// --- commands ---------------------------------------------------------------------

export interface I18nCommand {
  name: string;
  canApply(model: I18nModel, ctx: I18nCtx): boolean;
  apply(model: I18nModel, ctx: I18nCtx, rng: () => number): I18nViolation[];
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

// authorable leaf ids currently blank in T (per the model's view).
function authorableLeaves(model: I18nModel): string[] {
  const leaves: string[] = ['root.rt$label'];
  leaves.push(`${PLURAL_FIELD}.rt$label`, `${PLURAL_FIELD}.type`);
  for (const arm of PL_ARMS) {
    if (!model.prunedArms.has(arm)) leaves.push(`${PLURAL_FIELD}.minLength.${arm}`);
  }
  for (const [name, spec] of model.tFields) {
    leaves.push(`${name}.rt$label`, `${name}.type`);
    if (spec.pattern) leaves.push(`${name}.pattern`);
  }
  return leaves.filter((leafId) => !model.authored.has(leafId));
}

// applyAuthor writes one blank leaf's token into T.
function applyAuthor(model: I18nModel, ctx: I18nCtx, leafId: string, token: string): boolean {
  if (leafId === 'root.rt$label') {
    const text = readTranslation(ctx.fixture);
    const edited = text.replace(/^(\s*rt\$label: )''/m, `$1'${token}'`);
    if (edited === text) return false;
    writeTranslation(ctx.fixture, edited);
    return true;
  }
  const [field, key, arm] = leafId.split('.');
  return editFieldLine(ctx.fixture, field, (line) => {
    if (key === 'rt$label') return line.replace("rt$label: ''", `rt$label: '${token}'`);
    if (key === 'minLength') return line.replace(`${arm}: ''`, `${arm}: '${token}'`);
    return line.replace(`${key}: ''`, `${key}: '${token}'`);
  });
}

export const I18N_COMMANDS: I18nCommand[] = [
  {
    // The translator fills a blank leaf with a unique token.
    name: 'authorLeaf',
    canApply: (model) => authorableLeaves(model).length > 0,
    apply(model, ctx, rng) {
      const leafId = pick(authorableLeaves(model), rng);
      const token = nextToken(model);
      if (applyAuthor(model, ctx, leafId, token)) model.authored.set(leafId, token);
      return [];
    },
  },
  {
    // The translator prunes an unfilled non-`other` arm (their language, their call).
    name: 'pruneArm',
    canApply: (model) =>
      PL_ARMS.some(
        (arm) => arm !== 'other' && !model.prunedArms.has(arm) && !model.authored.has(`${PLURAL_FIELD}.minLength.${arm}`)
      ),
    apply(model, ctx, rng) {
      const candidates = PL_ARMS.filter(
        (arm) => arm !== 'other' && !model.prunedArms.has(arm) && !model.authored.has(`${PLURAL_FIELD}.minLength.${arm}`)
      );
      const arm = pick(candidates, rng);
      const edited = editFieldLine(ctx.fixture, PLURAL_FIELD, (line) =>
        line.replace(`${arm}: '', `, '').replace(`, ${arm}: ''`, '')
      );
      if (edited) model.prunedArms.add(arm);
      return [];
    },
  },
  {
    // The translator hand-adds an arm beyond the pl set (locale-owned superset).
    name: 'addExtraArm',
    canApply: (model, ctx) => !readTranslation(ctx.fixture).includes('two:'),
    apply(model, ctx) {
      const token = nextToken(model);
      const edited = editFieldLine(ctx.fixture, PLURAL_FIELD, (line) => line.replace('other:', `two: '${token}', other:`));
      if (edited) model.authored.set(`${PLURAL_FIELD}.minLength.two`, token);
      return [];
    },
  },
  {
    // The translator clears the scaffold's @todo line.
    name: 'clearTodo',
    canApply: (model) => !model.todoCleared,
    apply(model, ctx) {
      const text = readTranslation(ctx.fixture);
      const edited = text.replace(/\/\/ @todo:[^\n]*\n/, '');
      if (edited !== text) {
        writeTranslation(ctx.fixture, edited);
        model.todoCleared = true;
      }
      return [];
    },
  },
  {
    // The source TYPE gains a field (arrives in T on the next update). The
    // friendly mirror re-syncs + refills too — a translation must derive from
    // the type even with that fully-authored mirror sitting next to it.
    name: 'srcAddField',
    canApply: (model) => model.fields.size < NAME_POOL.length,
    apply(model, ctx, rng) {
      const out: I18nViolation[] = [];
      const free = NAME_POOL.filter((name) => !model.fields.has(name));
      model.fields.set(pick(free, rng), {pattern: rng() < 0.5});
      materializeSource(ctx.fixture, model);
      controlledOr(syncFriendlyMirror(ctx.fixture, model), 'srcAddField(gen)', ctx, out);
      return out;
    },
  },
  {
    // The source TYPE drops a field — its authored tokens must carcass on update.
    name: 'srcDropField',
    canApply: (model) => model.fields.size > 0,
    apply(model, ctx, rng) {
      const out: I18nViolation[] = [];
      const name = pick([...model.fields.keys()], rng);
      model.fields.delete(name);
      materializeSource(ctx.fixture, model);
      controlledOr(syncFriendlyMirror(ctx.fixture, model), 'srcDropField(gen)', ctx, out);
      return out;
    },
  },
  {
    // The i18n reconcile: run --update, then the full oracle battery + T1.
    name: 'updateT',
    canApply: () => true,
    apply(model, ctx) {
      const out: I18nViolation[] = [];
      const first = runTranslateCli(ctx.fixture, ['enrich', '--i18n', LOCALE, 'src/models.ts', '--update']);
      if (!controlledOr(first, 'updateT', ctx, out)) return out;
      const afterFirst = readTranslation(ctx.fixture);

      // Move tokens of leaves the source dropped (or de-declared) to carcassed.
      // De-declared covers a field DROPPED and RE-ADDED between updates with a
      // different spec: T still carries the old line, but a re-add without the
      // pattern param de-declares that leaf, so its authored value must carcass
      // (the reconciler parks it in an @rtOrphanChild) exactly like a drop.
      for (const [leafId, token] of [...model.authored]) {
        const [field, key] = leafId.split('.');
        const isFieldLeaf = field !== 'root' && field !== PLURAL_FIELD;
        if (!isFieldLeaf) continue;
        const spec = model.fields.get(field);
        if (!spec || (key === 'pattern' && !spec.pattern)) {
          model.authored.delete(leafId);
          model.carcassed.set(leafId, token);
        }
      }
      model.tFields = new Map([...model.fields].map(([name, spec]) => [name, {...spec}]));

      // T1 — a second update is byte-identical.
      const second = runTranslateCli(ctx.fixture, ['enrich', '--i18n', LOCALE, 'src/models.ts', '--update']);
      if (!controlledOr(second, 'updateT(second)', ctx, out)) return out;
      const afterSecond = readTranslation(ctx.fixture);
      if (afterSecond !== afterFirst) {
        out.push(violation('T1', 'updateT', ctx, 'second --i18n --update was not byte-identical'));
      }

      assertInvariants(model, ctx, 'updateT', out);
      return out;
    },
  },
  {
    // The only delete: --prune strips carcasses (and only carcasses).
    name: 'pruneT',
    canApply: (model, ctx) => existsSync(translationPathOf(ctx.fixture)),
    apply(model, ctx) {
      const out: I18nViolation[] = [];
      const result = runTranslateCli(ctx.fixture, ['enrich', '--i18n', LOCALE, 'src/models.ts', '--prune']);
      if (!controlledOr(result, 'pruneT', ctx, out)) return out;
      const text = readTranslation(ctx.fixture);
      if (text.includes('@rtOrphan')) {
        out.push(violation('T7', 'pruneT', ctx, 'prune left a carcass behind'));
      }
      model.carcassed.clear();
      assertInvariants(model, ctx, 'pruneT', out);
      return out;
    },
  },
  {
    // The completeness gate: controlled, and TR002 fires iff blanks exist.
    name: 'checkT',
    canApply: () => true,
    apply(model, ctx) {
      const out: I18nViolation[] = [];
      const result = runTranslateCli(ctx.fixture, ['enrich', '--i18n', LOCALE, '--no-emit']);
      if (!controlledOr(result, 'checkT', ctx, out)) return out;
      const hasBlanks = /: ''/.test(readTranslation(ctx.fixture));
      const reported = result.stdout.includes('TR002');
      if (hasBlanks !== reported) {
        out.push(violation('T10', 'checkT', ctx, `TR002 mismatch: blanks=${hasBlanks} reported=${reported}`));
      }
      return out;
    },
  },
];

// bootstrap lays down the project (tsconfig with the i18n object, the .ts
// source, and the gen-produced friendly mirror — a source translates once it
// HAS one) and scaffolds the initial translation.
export function bootstrapI18n(fixture: ReconcileFixture, seed: number): {model: I18nModel; violations: I18nViolation[]} {
  const model = initialI18nModel();
  const violations: I18nViolation[] = [];
  writeFileSync(
    resolve(fixture.dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          rootDir: 'src',
          plugins: [{name: 'mion', i18n: {sourceLocale: 'en', locales: [LOCALE]}}],
        },
      },
      null,
      2
    )
  );
  materializeSource(fixture, model);

  const ctx: I18nCtx = {fixture, seed, step: -1};
  if (!controlledOr(syncFriendlyMirror(fixture, model), 'bootstrap(gen)', ctx, violations)) return {model, violations};
  const result = runTranslateCli(fixture, ['enrich', '--i18n', LOCALE, 'src/models.ts']);
  if (!controlledOr(result, 'bootstrap', ctx, violations)) return {model, violations};
  if (!existsSync(translationPathOf(fixture))) {
    violations.push(violation('T10', 'bootstrap', ctx, 'scaffold produced no translation file'));
    return {model, violations};
  }
  model.tFields = new Map([...model.fields].map(([name, spec]) => [name, {...spec}]));
  assertInvariants(model, ctx, 'bootstrap', violations);
  return {model, violations};
}
