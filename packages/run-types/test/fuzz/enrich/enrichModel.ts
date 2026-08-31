// The model + the event/oracle command set for the enrichment-sync fuzzer.
//
// SUT: the `mion` gen/update/prune/check pipeline over a (source type T,
// generated mirror E) pair. We model just enough of (T, E) to state the oracles,
// then drive RANDOM sequences of edit events and assert, after each, a rule that
// the example suite (test/suites/enrich/enrichReconcile.test.ts) already PROVES
// on hand-written cases — so every assertion here is sound (a failure is a real
// regression). Rule ids match
// .claude/skills/fuzzy-testing/framework-fuzzy-testing.md §6.4:
//
//   R1  idempotence      a second `--update` is byte-identical
//   R2  metamorphic      a type edit makes a bounded, predictable change to E
//   R3  preservation     `--update` never disturbs an unrelated authored value
//   R5  negative-space   a malformed mirror edit is reported, never silently kept
//   R6  convergence      after `--update` the file is a fixed point
//   R7a orphan carcass   a removed field's value is kept as an @rtOrphanChild
//   R8  @todo / prune     prune strips carcasses, never touches @todo
//   R10 totality         every CLI run is controlled — never a panic/hang

import {
  setSource,
  editMirror,
  readMirror,
  readMirrors,
  type MirrorFamily,
  type ReconcileFixture,
} from '../../util/enrichReconcile.ts';
import {scaffold, update, prune, check, isControlled, type CliResult} from './enrichCli.ts';

export type RuleId = 'R1' | 'R2' | 'R3' | 'R5' | 'R6' | 'R7a' | 'R8' | 'R10';

export interface EnrichViolation {
  rule: RuleId;
  command: string;
  step: number;
  seed: number;
  message: string;
}

export type FieldType = 'string' | 'number' | 'boolean';

interface Authored {
  /** Unique token embedded in a friendly `rt$label` (always settable). **/
  label?: string;
  /** Unique token embedded in a mock `pool` (string/number fields only). **/
  poolToken?: string;
}

export interface Model {
  typeName: string; // the source interface's name — the "user" can rename it
  fields: Map<string, FieldType>;
  authored: Map<string, Authored>; // live fields' authored tokens
  removed: Map<string, {type: FieldType; authored: Authored}>; // carcassed fields
  todoCleared: Set<string>; // const var-names whose @todo the "user" deleted
}

export const TYPE_NAME = 'User';
const MAX_FIELDS = 6;
const NAME_POOL = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
// PascalCase type names the renameType command swaps between. Deliberately none is
// a substring of another (so a `friendly<Name>` includes-check is unambiguous) and
// none overlaps a field name (NAME_POOL is lowercase) — the rename oracle keys on
// the distinctive `friendly<Name>` / `mock<Name>` const tokens.
const TYPE_NAME_POOL = [TYPE_NAME, 'Account', 'Person', 'Customer', 'Member', 'Profile'];
const TYPES: FieldType[] = ['string', 'number', 'boolean'];

export function initialModel(): Model {
  return {
    typeName: TYPE_NAME,
    fields: new Map<string, FieldType>([
      ['alpha', 'string'],
      ['bravo', 'number'],
    ]),
    authored: new Map(),
    removed: new Map(),
    todoCleared: new Set(),
  };
}

export function renderSource(model: Model): string {
  const body = [...model.fields].map(([name, type]) => `${name}: ${type}`).join('; ');
  return `export interface ${model.typeName} { ${body} }\n`;
}

// --- small helpers -------------------------------------------------------------

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function unusedName(model: Model, rng: () => number): string | null {
  const taken = new Set([...model.fields.keys(), ...model.removed.keys()]);
  const free = NAME_POOL.filter((n) => !taken.has(n));
  return free.length ? pick(free, rng) : null;
}

function poolLiteral(field: string, type: FieldType, step: number): {token: string; literal: string} | null {
  if (type === 'string') return {token: `FZS_${field}_${step}`, literal: `'FZS_${field}_${step}'`};
  if (type === 'number') return {token: `${900000 + step}`, literal: `${900000 + step}`};
  return null; // boolean pools aren't uniquely trackable — author the label instead
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) return count;
    count++;
    from = at + needle.length;
  }
}

function v(rule: RuleId, command: string, ctx: Ctx, message: string): EnrichViolation {
  return {rule, command, step: ctx.step, seed: ctx.seed, message};
}

/** R10 — assert a gen/update/prune run was controlled (no panic / hang). **/
function controlledOr(result: CliResult, command: string, ctx: Ctx, out: EnrichViolation[]): boolean {
  if (isControlled(result)) return true;
  const why = result.timedOut
    ? 'TIMED OUT (hang)'
    : result.launchError
      ? `launch error: ${result.launchError}`
      : `uncontrolled exit ${result.status}: ${result.stderr.slice(0, 300)}`;
  out.push(v('R10', command, ctx, `\`${result.argv.join(' ')}\` ${why}`));
  return false;
}

/** R3 — every OTHER live field's authored tokens must still be present, each
 *  in ITS OWN family's mirror file (labels are friendly-only, pools mock-only). **/
function preservationOr(
  model: Model,
  friendly: string,
  mock: string,
  except: string,
  command: string,
  ctx: Ctx,
  out: EnrichViolation[]
): void {
  for (const [field, a] of model.authored) {
    if (field === except) continue;
    if (a.label && !friendly.includes(a.label))
      out.push(v('R3', command, ctx, `authored friendly label of \`${field}\` (${a.label}) was lost`));
    if (a.poolToken && !mock.includes(a.poolToken))
      out.push(v('R3', command, ctx, `authored mock pool of \`${field}\` (${a.poolToken}) was lost`));
  }
}

/** R1/R6 — a second `--update` must leave BOTH family files byte-identical. **/
function convergenceOr(
  fixture: ReconcileFixture,
  typeName: string,
  firstMirrors: string,
  command: string,
  ctx: Ctx,
  out: EnrichViolation[]
): void {
  const again = update(fixture, typeName);
  if (!controlledOr(again, command, ctx, out)) return;
  const second = readMirrors(fixture);
  if (second !== firstMirrors)
    out.push(v('R6', command, ctx, 'a second --update was NOT a byte-identical no-op (files are not a fixed point)'));
}

export interface Ctx {
  fixture: ReconcileFixture;
  seed: number;
  step: number;
}

export interface Command {
  readonly name: string;
  canApply(model: Model): boolean;
  apply(model: Model, ctx: Ctx, rng: () => number): EnrichViolation[];
}

// --- the command set (event alphabet) -----------------------------------------

const addField: Command = {
  name: 'addField',
  canApply: (m) => m.fields.size < MAX_FIELDS && NAME_POOL.some((n) => !m.fields.has(n) && !m.removed.has(n)),
  apply(model, ctx, rng) {
    const out: EnrichViolation[] = [];
    const name = unusedName(model, rng);
    if (!name) return out;
    const type = pick(TYPES, rng);
    model.fields.set(name, type);
    setSource(ctx.fixture, renderSource(model));
    const result = update(ctx.fixture, model.typeName);
    if (!controlledOr(result, this.name, ctx, out)) return out;
    const friendly = readMirror(ctx.fixture, 'friendly');
    const mock = readMirror(ctx.fixture, 'mock');
    // R2 (add): the new field gets a fresh scaffold node in BOTH family files.
    if (!friendly.includes(`${name}: {rt$label: ''`))
      out.push(v('R2', this.name, ctx, `added field \`${name}\` has no friendly scaffold node`));
    if (!mock.includes(`${name}: {pool: []}`))
      out.push(v('R2', this.name, ctx, `added field \`${name}\` has no mock scaffold node`));
    // R3 (others untouched) + R6 (fixed point).
    preservationOr(model, friendly, mock, name, this.name, ctx, out);
    convergenceOr(ctx.fixture, model.typeName, readMirrors(ctx.fixture), this.name, ctx, out);
    return out;
  },
};

const authorFriendly: Command = {
  name: 'authorFriendly',
  canApply: (m) => [...m.fields.keys()].some((f) => !m.authored.get(f)?.label),
  apply(model, ctx, _rng) {
    // Pure setup (no oracle): fill a friendly rt$label so later edits can be
    // checked for preservation. Only records state if the edit actually took.
    const field = [...model.fields.keys()].find((f) => !model.authored.get(f)?.label);
    if (!field) return [];
    const token = `FZL_${field}_${ctx.step}`;
    const target = `${field}: {rt$label: ''`;
    let took = false;
    editMirror(ctx.fixture, 'friendly', (text) => {
      if (!text.includes(target)) return text;
      took = true;
      return text.replace(target, `${field}: {rt$label: '${token}'`);
    });
    if (took) {
      const a = model.authored.get(field) ?? {};
      a.label = token;
      model.authored.set(field, a);
    }
    return [];
  },
};

const authorMock: Command = {
  name: 'authorMock',
  canApply: (m) => [...m.fields].some(([f, t]) => t !== 'boolean' && !m.authored.get(f)?.poolToken),
  apply(model, ctx, _rng) {
    const entry = [...model.fields].find(([f, t]) => t !== 'boolean' && !model.authored.get(f)?.poolToken);
    if (!entry) return [];
    const [field, type] = entry;
    const lit = poolLiteral(field, type, ctx.step);
    if (!lit) return [];
    const target = `${field}: {pool: []}`;
    let took = false;
    editMirror(ctx.fixture, 'mock', (text) => {
      if (!text.includes(target)) return text;
      took = true;
      return text.replace(target, `${field}: {pool: [${lit.literal}]}`);
    });
    if (took) {
      const a = model.authored.get(field) ?? {};
      a.poolToken = lit.token;
      model.authored.set(field, a);
    }
    return [];
  },
};

const removeField: Command = {
  name: 'removeField',
  canApply: (m) => m.fields.size > 1,
  apply(model, ctx, rng) {
    const out: EnrichViolation[] = [];
    const name = pick([...model.fields.keys()], rng);
    const type = model.fields.get(name)!;
    const authored = model.authored.get(name) ?? {};
    model.fields.delete(name);
    model.authored.delete(name);
    model.removed.set(name, {type, authored});
    setSource(ctx.fixture, renderSource(model));
    const result = update(ctx.fixture, model.typeName);
    if (!controlledOr(result, this.name, ctx, out)) return out;
    const friendly = readMirror(ctx.fixture, 'friendly');
    const mock = readMirror(ctx.fixture, 'mock');
    // R7a: a removed field with an authored value becomes an @rtOrphanChild
    // carcass that PRESERVES the value (proven: enrichReconcile orphan-child test).
    // The dropped field carcasses in BOTH family files; each authored token must
    // survive in ITS family's carcass (label → friendly file, pool → mock file).
    if (authored.label || authored.poolToken) {
      if (!friendly.includes('@rtOrphanChild'))
        out.push(
          v('R7a', this.name, ctx, `removed authored field \`${name}\` left no @rtOrphanChild carcass in the friendly file`)
        );
      if (!mock.includes('@rtOrphanChild'))
        out.push(v('R7a', this.name, ctx, `removed authored field \`${name}\` left no @rtOrphanChild carcass in the mock file`));
      if (authored.label && !friendly.includes(authored.label))
        out.push(
          v(
            'R7a',
            this.name,
            ctx,
            `removed field \`${name}\` lost its authored label (${authored.label}) instead of carcassing it`
          )
        );
      if (authored.poolToken && !mock.includes(authored.poolToken))
        out.push(v('R7a', this.name, ctx, `removed field \`${name}\` lost its authored pool (${authored.poolToken})`));
    }
    preservationOr(model, friendly, mock, name, this.name, ctx, out);
    convergenceOr(ctx.fixture, model.typeName, readMirrors(ctx.fixture), this.name, ctx, out);
    return out;
  },
};

const renameField: Command = {
  name: 'renameField',
  canApply: (m) => m.fields.size >= 1 && NAME_POOL.some((n) => !m.fields.has(n) && !m.removed.has(n)),
  apply(model, ctx, rng) {
    const out: EnrichViolation[] = [];
    const oldName = pick([...model.fields.keys()], rng);
    const newName = unusedName(model, rng);
    if (!newName) return out;
    const authored = model.authored.get(oldName);
    // rebuild fields preserving order, swapping the key
    const next = new Map<string, FieldType>();
    for (const [k, t] of model.fields) next.set(k === oldName ? newName : k, t);
    model.fields = next;
    model.authored.delete(oldName);
    if (authored) model.authored.set(newName, authored);
    setSource(ctx.fixture, renderSource(model));
    const result = update(ctx.fixture, model.typeName);
    if (!controlledOr(result, this.name, ctx, out)) return out;
    const friendly = readMirror(ctx.fixture, 'friendly');
    const mock = readMirror(ctx.fixture, 'mock');
    // Rename carries the authored value under the new key (proven: rename tests).
    if (authored?.label && !friendly.includes(authored.label))
      out.push(v('R2', this.name, ctx, `rename ${oldName}→${newName} LOST the authored label (${authored.label})`));
    if (authored?.poolToken && !mock.includes(authored.poolToken))
      out.push(v('R2', this.name, ctx, `rename ${oldName}→${newName} LOST the authored pool (${authored.poolToken})`));
    preservationOr(model, friendly, mock, newName, this.name, ctx, out);
    convergenceOr(ctx.fixture, model.typeName, readMirrors(ctx.fixture), this.name, ctx, out);
    return out;
  },
};

// renameType is the "user renames the whole interface" event — the edit that
// uncovered the overlapping-splice crash by hand. A big interface keeps its full
// authored tree (every label + pool); the reconcile must carry that tree to the
// new `friendly<New>` / `mock<New>` consts and leave NO `friendly<Old>` carcass.
// Pre-fix this either crashed ("overlapping splice ops — internal error", caught
// by R10 via the tightened isControlled) or left a stale old-name tree (caught by
// the R2 stale-const check below).
const renameType: Command = {
  name: 'renameType',
  canApply: (m) => TYPE_NAME_POOL.some((n) => n !== m.typeName),
  apply(model, ctx, rng) {
    const out: EnrichViolation[] = [];
    const oldName = model.typeName;
    const newName = pick(
      TYPE_NAME_POOL.filter((n) => n !== oldName),
      rng
    );
    model.typeName = newName;
    setSource(ctx.fixture, renderSource(model));
    const result = update(ctx.fixture, newName);
    if (!controlledOr(result, this.name, ctx, out)) return out;
    const friendly = readMirror(ctx.fixture, 'friendly');
    const mock = readMirror(ctx.fixture, 'mock');
    // R2 (rename type): each family's const moves to the new name in ITS file,
    // with NO stale old-name tree left behind (a stale tree is the orphan-carcass /
    // overlapping-splice bug).
    if (!friendly.includes(`friendly${newName}`))
      out.push(v('R2', this.name, ctx, `rename type ${oldName}→${newName}: no friendly${newName} const emitted`));
    if (!mock.includes(`mock${newName}`))
      out.push(v('R2', this.name, ctx, `rename type ${oldName}→${newName}: no mock${newName} const emitted`));
    if (friendly.includes(`friendly${oldName}`))
      out.push(v('R2', this.name, ctx, `rename type ${oldName}→${newName} left a stale friendly${oldName} tree behind`));
    if (mock.includes(`mock${oldName}`))
      out.push(v('R2', this.name, ctx, `rename type ${oldName}→${newName} left a stale mock${oldName} tree behind`));
    // R3: renaming the TYPE keeps every field's authored leaf — nothing is excepted.
    preservationOr(model, friendly, mock, '', this.name, ctx, out);
    convergenceOr(ctx.fixture, newName, readMirrors(ctx.fixture), this.name, ctx, out);
    return out;
  },
};

const idempotenceProbe: Command = {
  name: 'idempotence',
  canApply: () => true,
  apply(model, ctx, _rng) {
    const out: EnrichViolation[] = [];
    const r1 = update(ctx.fixture, model.typeName);
    if (!controlledOr(r1, this.name, ctx, out)) return out;
    const first = readMirrors(ctx.fixture);
    const r2 = update(ctx.fixture, model.typeName);
    if (!controlledOr(r2, this.name, ctx, out)) return out;
    const second = readMirrors(ctx.fixture);
    if (first !== second) out.push(v('R1', this.name, ctx, 'two consecutive --update runs were NOT byte-identical'));
    return out;
  },
};

const pruneProbe: Command = {
  name: 'prune',
  canApply: () => true,
  apply(model, ctx, _rng) {
    const out: EnrichViolation[] = [];
    const before = readMirrors(ctx.fixture);
    const todoBefore = countOccurrences(before, '@todo');
    const result = prune(ctx.fixture);
    if (!controlledOr(result, this.name, ctx, out)) return out;
    // R8: prune (now a whole-enrichDir sweep) strips carcasses from BOTH family
    // files, leaves every @todo + live field intact.
    const after = readMirrors(ctx.fixture);
    if (after.includes('@rtOrphan')) out.push(v('R8', this.name, ctx, 'prune left an @rtOrphan/@rtOrphanChild carcass behind'));
    if (countOccurrences(after, '@todo') !== todoBefore)
      out.push(v('R8', this.name, ctx, `prune changed the @todo count (${todoBefore} → ${countOccurrences(after, '@todo')})`));
    const friendly = readMirror(ctx.fixture, 'friendly');
    const mock = readMirror(ctx.fixture, 'mock');
    for (const field of model.fields.keys()) {
      if (!friendly.includes(`${field}:`) || !mock.includes(`${field}:`))
        out.push(v('R8', this.name, ctx, `prune dropped a LIVE field node \`${field}\``));
    }
    // carcasses are gone → re-adding a removed field would scaffold fresh.
    model.removed.clear();
    return out;
  },
};

// Negative-space probes (R5): splice ONE malformed edit into a single FAMILY's
// mirror file, run `check` against THAT file, and assert the SPECIFIC diagnostic
// code fires (verified live: MD001 / FT002 / FT005), then REVERT so the sequence
// continues from a valid state.
//
// Channel boundary (discovered by running it): the `check` CLI does NOT look
// inside a function-form `rt$errors` (opaque to the walk) and does NOT do MD003
// pool-type checks — those are BUILD-time (CompTimeArgs CTA001/2/3, MD003), a
// DIFFERENT observation channel. So a "non-literal node in comptime args" probe
// (the CTA case) belongs to a future build-driven harness, not this one — `check`
// is the wrong instrument for it.
function negativeProbe(
  name: string,
  family: MirrorFamily,
  expectedCode: string,
  token: string,
  mutate: (text: string) => string
): Command {
  return {
    name,
    canApply: () => true,
    apply(_model, ctx, _rng) {
      const out: EnrichViolation[] = [];
      const snapshot = readMirror(ctx.fixture, family);
      editMirror(ctx.fixture, family, (text) => mutate(text));
      if (!readMirror(ctx.fixture, family).includes(token)) {
        editMirror(ctx.fixture, family, () => snapshot); // anchor not found — skip, never false-fire
        return out;
      }
      const {findings, controlled} = check(ctx.fixture, family);
      if (!controlled) out.push(v('R10', name, ctx, `check was uncontrolled on a mirror carrying a ${name}`));
      else if (!findings.some((finding) => finding.code === expectedCode)) {
        out.push(
          v(
            'R5',
            name,
            ctx,
            `expected ${expectedCode} for ${name}; check returned [${findings.map((finding) => finding.code).join(', ') || 'none'}]`
          )
        );
      }
      editMirror(ctx.fixture, family, () => snapshot); // revert: keep the sequence valid
      return out;
    },
  };
}

const unknownMockField = negativeProbe('unknownMockField', 'mock', 'MD001', 'fzUnrelated', (text) =>
  text.replace(
    `export const mock${TYPE_NAME}: MockData<${TYPE_NAME}> = {`,
    `export const mock${TYPE_NAME}: MockData<${TYPE_NAME}> = {\n  fzUnrelated: {pool: []},`
  )
);

const unknownFriendlyField = negativeProbe('unknownFriendlyField', 'friendly', 'FT002', 'fzUnrelated', (text) =>
  text.replace(
    `export const friendly${TYPE_NAME}: FriendlyText<${TYPE_NAME}> = {`,
    `export const friendly${TYPE_NAME}: FriendlyText<${TYPE_NAME}> = {\n  fzUnrelated: {rt$label: ''},`
  )
);

const badPlaceholder = negativeProbe('badPlaceholder', 'friendly', 'FT005', '$[badname]', (text) =>
  text.replace("rt$errors: {type: ''}", "rt$errors: {type: 'x $[badname]'}")
);

/** The event alphabet the generator samples from. **/
export const COMMANDS: Command[] = [
  addField,
  authorFriendly,
  authorMock,
  removeField,
  renameField,
  renameType,
  idempotenceProbe,
  pruneProbe,
  unknownMockField,
  unknownFriendlyField,
  badPlaceholder,
];

/** Create + scaffold a fresh workspace for one fuzz sequence. Returns the
 *  initial model and a violation if the very first scaffold isn't controlled. **/
export function bootstrap(fixture: ReconcileFixture, seed: number): {model: Model; violations: EnrichViolation[]} {
  const model = initialModel();
  setSource(fixture, renderSource(model));
  const out: EnrichViolation[] = [];
  const result = scaffold(fixture, model.typeName);
  controlledOr(result, 'scaffold', {fixture, seed, step: -1}, out);
  return {model, violations: out};
}
