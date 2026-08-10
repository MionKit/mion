// THE CONFORMANCE TEST for docs/json-schema-2020-12-javascript.md.
//
// The spec gives every rule an ID (`JS-DATE`, `RT-FORMAT-BIGINT`, …). This file
// has one case per ID: a TypeScript declaration handed to the REAL convert
// binary, and the exact JSON Schema the spec says it must produce. The spec is
// the prose, this is the executable twin, and `coversEveryRule` reads the spec
// file and fails if it names a rule with no case here. Neither can move without
// the other.
//
// Why the output is asserted EXACTLY rather than loosely: the whole design is
// that the wire keywords and the extension keywords say different halves of one
// thing. A test that only checked `jsType` would pass a schema that had quietly
// stopped emitting the `type` beside it, which is the exact regression the
// dialect exists to prevent (CORE-SIBLING).
//
// ── STATUS ────────────────────────────────────────────────────────────────
// The spec is fully landed: all 37 rules, emitter and door
// (docs/done/implement-json-schema-javascript-dialect.md).
//
// `LANDED` stays because it is what made the progressive landing possible — it
// lists the rules whose emitter and door are in place, so a slice could go
// green on its own instead of the suite being all-or-nothing. It is now pinned
// EQUAL to the spec's declared set by the coverage check below, so a rule
// cannot be added to the spec and quietly left skipped. Staging a future slice
// means consciously relaxing that assertion, which is the point.
//
// The COVERAGE check is not gated: the spec-to-test drift guard is useful from
// the moment the spec exists, and it does not depend on the converter.
import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BIN, hasBinary, writeMarkerPackage} from '../../../ts-runtypes-devtools/test/helpers/inline.ts';

/** The rules whose implementation has landed. Grows one slice at a time. */
const LANDED: ReadonlySet<string> = new Set<string>([
  // Slice 1 — Date, and the three CORE rules it demonstrates.
  'CORE-SIBLING',
  'CORE-PRECEDENCE',
  'CORE-INERT',
  'JS-DATE',
  // Slices 2-5 — the rest of the jsType rows that needed no door change.
  'JS-BIGINT',
  'JS-REGEXP',
  'JS-OBJECT',
  'JS-UNDEFINED',
  'JS-VOID',
  'JS-TEMPORAL-INSTANT',
  'JS-TEMPORAL-PLAINDATE',
  'JS-TEMPORAL-DURATION',
  'JS-TEMPORAL-PATTERNED',
  // Slices 6-7 — the two rows that needed the door to read MORE from the wire.
  'JS-BIGINT-LITERAL',
  'JS-MAP',
  'JS-SET',
  'JS-PROMISE',
  // Slice 8 — the rtFormat / rtFormatParams split.
  'RT-FORMAT-NAME',
  'RT-FORMAT-PARAMS',
  'RT-FORMAT-BIGINT',
  // Slice 9 — the six ts* renames.
  'TS-LABELS',
  'TS-READONLY',
  'TS-INDEXES',
  'TS-TEMPLATE',
  'TS-FUNCTION',
  'TS-META',
  'TS-DROPPABLE',
  'JS-SYMBOL',
  'JS-ANY',
  'RT-FORMAT-NONVALIDATING',
  'CORE-PORTABLE',
  // Slice 10-11 — the last four.
  'CORE-NOT',
  'RT-FORMAT-STANDARD',
  'RT-FORMAT-DEFAULT',
  'TS-WIRE-HALF',
]);

const SPEC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/json-schema-2020-12-javascript.md');

const landed = (id: string) => (LANDED.has(id) && hasBinary() ? it : it.skip);

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "lib": ["ES2022", "ESNext.Temporal"],
    "rootDir": "src", "outDir": "dist", "strict": true
  },
  "include": ["src"]
}
`;

interface Rule {
  /** The spec's rule ID. Must appear in the spec or the coverage check fails. */
  readonly id: string;
  /** The declaration under test, written type-first. */
  readonly source: string;
  /**
   * The schema fragment the converted file must contain, verbatim. Written the
   * way the emitter prints it (single quotes, no spaces after `{`) rather than
   * as JSON, because that is what lands in the user's file.
   */
  readonly emits: string;
  /** A second required fragment, when one rule pins two separate keywords. */
  readonly alsoEmits?: string;
  /** Fragments that must NOT appear. Defaults to the embed escape. */
  readonly forbids?: readonly string[];
  /** Set when the rule is about a property of the output, not a spelling. */
  readonly note?: string;
}

const RULES: readonly Rule[] = [
  // ── CORE ───────────────────────────────────────────────────────────────
  {
    id: 'CORE-SIBLING',
    // The load-bearing case: `jsType` never appears without the `type` that
    // describes the wire beside it.
    source: 'export type Stamp = Date;\n',
    emits: "{type: 'string', format: 'date-time', jsType: 'Date'}",
  },
  {
    id: 'CORE-INERT',
    source: 'export type Stamp = Date;\n',
    emits: "{type: 'string', format: 'date-time', jsType: 'Date'}",
    note: 'stripping the extension keywords leaves {type, format}, which validates the same JSON',
  },
  {
    id: 'CORE-NOT',
    // Negation has no keyword: it rides the standard `not`.
    source: "import * as TF from '@ts-runtypes/core/formats';\nexport type NotMail = TF.Not<TF.Email>;\n",
    emits: "{type: 'string', not: {type: 'string', format: 'email'",
    forbids: ['embedType', 'jsNot'],
  },
  {
    id: 'CORE-PORTABLE',
    // A type the standard can say entirely carries no extension keyword at
    // all. The refusal half (a Date under --portable) is the separate case
    // below, since it asserts an exit code rather than a spelling.
    source: 'export type Name = string;\n',
    emits: "{type: 'string'}",
    forbids: ['embedType', 'jsType', 'rtFormat', 'tsLabels'],
    note: 'a portable document uses no extension keyword',
  },
  {
    id: 'CORE-PRECEDENCE',
    // `jsType` wins over the format beside it: this recovers Date, not the
    // date-time-formatted STRING the same `format` would give on its own. If
    // both contributed, every Date would land on a different id than written.
    source: 'export type Stamp = Date;\n',
    emits: "{type: 'string', format: 'date-time', jsType: 'Date'}",
    note: 'jsType decides the type, the wire keywords only describe the JSON',
  },

  // ── jsType: values that travel as a string ─────────────────────────────
  {
    id: 'JS-BIGINT',
    source: 'export type Big = bigint;\n',
    emits: "{type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'}",
  },
  {
    id: 'JS-DATE',
    source: 'export type Stamp = Date;\n',
    emits: "{type: 'string', format: 'date-time', jsType: 'Date'}",
  },
  {
    id: 'JS-BIGINT-LITERAL',
    // The same row with the value pinned: `const` holds the WIRE value, which
    // is the digit string. No separate keyword.
    source: 'export type Build = 4096n;\n',
    emits: "{type: 'string', const: '4096', jsType: 'bigint'}",
    forbids: ['embedType', 'jsBigint'],
  },
  {
    id: 'JS-REGEXP',
    source: 'export type Matcher = RegExp;\n',
    emits: "{type: 'string', jsType: 'RegExp'}",
  },

  // ── jsType: Temporal ───────────────────────────────────────────────────
  {
    id: 'JS-TEMPORAL-INSTANT',
    source: 'export type At = Temporal.Instant;\n',
    emits: "{type: 'string', format: 'date-time', jsType: 'Temporal.Instant'}",
  },
  {
    id: 'JS-TEMPORAL-PLAINDATE',
    source: 'export type Day = Temporal.PlainDate;\n',
    emits: "{type: 'string', format: 'date', jsType: 'Temporal.PlainDate'}",
  },
  {
    id: 'JS-TEMPORAL-DURATION',
    source: 'export type Span = Temporal.Duration;\n',
    emits: "{type: 'string', format: 'duration', jsType: 'Temporal.Duration'}",
  },
  {
    id: 'JS-TEMPORAL-PATTERNED',
    // toJSON() emits RFC 9557, which `format: date-time` would reject, so the
    // wire half is a pattern. Asserted structurally: the regex is the
    // implementation's business, the `pattern`-not-`format` choice is the rule.
    source: 'export type Meeting = Temporal.ZonedDateTime;\n',
    emits: "jsType: 'Temporal.ZonedDateTime'",
    note: "carries `pattern`, never `format: 'date-time'`",
  },

  // ── jsType: containers ─────────────────────────────────────────────────
  {
    id: 'JS-MAP',
    // The key and value live in the WIRE schema, so there is no argument list.
    source: 'export type Index = Map<string, number>;\n',
    emits:
      "{type: 'array', items: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], minItems: 2, items: false}, jsType: 'Map'}",
    forbids: ['embedType', 'typeArguments'],
  },
  {
    id: 'JS-SET',
    source: 'export type Tags = Set<string>;\n',
    emits: "{type: 'array', items: {type: 'string'}, uniqueItems: true, jsType: 'Set'}",
    forbids: ['embedType', 'typeArguments'],
  },

  // ── jsType: the absent values ──────────────────────────────────────────
  {
    id: 'JS-UNDEFINED',
    source: 'export type Missing = {a: undefined};\n',
    emits: "{type: 'null', jsType: 'undefined'}",
  },
  {
    id: 'JS-VOID',
    source: 'export type Nothing = {a: void};\n',
    emits: "{type: 'null', jsType: 'void'}",
  },
  {
    id: 'JS-PROMISE',
    source: 'export type Later = {a: Promise<string>};\n',
    emits: "{jsType: 'Promise', jsResolved: {type: 'string'}}",
  },
  {
    id: 'JS-SYMBOL',
    // No wire keywords: a symbol has no encoding at all. The annotation is
    // still there, recording which type it was so the schema converts back.
    source: 'export type Tagged = {a: string; b: symbol};\n',
    emits: "b: {jsType: 'symbol'}",
  },

  // ── jsType: the broad types ────────────────────────────────────────────
  {
    id: 'JS-ANY',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source: 'export type Loose = {a: any};\n',
    emits: "{jsType: 'any'}",
  },
  {
    id: 'JS-OBJECT',
    source: 'export type Thing = {a: object};\n',
    emits: "{type: ['object', 'array'], jsType: 'object'}",
  },

  // ── rtFormat ───────────────────────────────────────────────────────────
  {
    id: 'RT-FORMAT-NAME',
    source: "import * as TF from '@ts-runtypes/core/formats';\nexport type Mail = TF.Email;\n",
    emits: "{type: 'string', format: 'email', maxLength: 254, minLength: 7, rtFormat: 'email'",
  },
  {
    id: 'RT-FORMAT-STANDARD',
    // The bound rides `minLength`, the STANDARD keyword, so a plain validator
    // enforces it. Only the family name needs the extension.
    source: "import * as TF from '@ts-runtypes/core/formats';\nexport type Short = TF.String<{minLength: 3}>;\n",
    emits: "{type: 'string', minLength: 3, rtFormat: 'stringFormat'",
  },
  {
    id: 'RT-FORMAT-PARAMS',
    // rtFormatParams carries ALL the family's params, `localPart` (which has no
    // standard keyword) among them. Every param folds into the identity, so
    // carrying only the leftovers would change what the type is.
    source: "import * as TF from '@ts-runtypes/core/formats';\nexport type Mail = TF.Email<{localPart: {maxLength: 64}}>;\n",
    emits: "rtFormat: 'email', rtFormatParams: {localPart: {maxLength: 64}, ",
  },
  {
    id: 'RT-FORMAT-BIGINT',
    source: "import * as TF from '@ts-runtypes/core/formats';\nexport type Small = TF.BigInt<{min: 0n, max: 255n}>;\n",
    emits: "{type: 'string', pattern: '^-?[0-9]+$', rtFormat: 'bigintFormat', rtFormatParams: {max: '255', min: '0'}}",
  },
  {
    id: 'RT-FORMAT-DEFAULT',
    // minItems 0 IS the standard default, so the standard keyword cannot carry
    // it back and it rides rtFormatParams instead.
    source: "import * as TF from '@ts-runtypes/core/formats';\nexport type Loose = TF.FormattedArray<string[], {minItems: 0}>;\n",
    emits: 'rtFormatParams: {minItems: 0}',
  },
  {
    id: 'RT-FORMAT-NONVALIDATING',
    // mockSamples drives mock generation only, so it gets no STANDARD keyword.
    // It still rides rtFormatParams: it is part of the type's identity even
    // though it constrains nothing, and dropping it would move the id.
    source: "import * as TF from '@ts-runtypes/core/formats';\nexport type Named = TF.String<{mockSamples: ['ana']}>;\n",
    emits: "{type: 'string', rtFormat: 'stringFormat', rtFormatParams: {mockSamples: ['ana']}}",
  },

  // ── ts keywords ────────────────────────────────────────────────────────
  {
    id: 'TS-LABELS',
    source: 'export type Point = [x: number, y: number];\n',
    emits: "tsLabels: ['x', 'y']",
  },
  {
    id: 'TS-READONLY',
    source: 'export type Frozen = {readonly id: string; hits: number};\n',
    emits: "required: ['id', 'hits'], tsReadonly: ['id']",
    forbids: ['embedType'],
  },
  {
    id: 'TS-INDEXES',
    // The wire half (propertyNames) is REQUIRED beside it, per TS-WIRE-HALF.
    source: 'export type Numeric = {[key: number]: string};\n',
    emits: "tsIndexes: [{key: {type: 'number'}, value: {type: 'string'}}]",
    forbids: ['embedType'],
  },
  {
    id: 'TS-TEMPLATE',
    source: 'export type Route = `api/${string}`;\n',
    emits: "tsTemplate: {texts: ['api/', ''], placeholders: [{type: 'string'}]}",
    // TS-WIRE-HALF applies here too: the literal chunks are pinned, the
    // placeholder is a wildcard (a narrower regex would reject strings the
    // type accepts).
    alsoEmits: String.raw`pattern: '^api/[\\s\\S]*$'`,
    forbids: ['embedType'],
  },
  {
    id: 'TS-FUNCTION',
    source: 'export type Notify = (message: string) => boolean;\n',
    emits:
      "tsFunction: {params: {type: 'array', prefixItems: [{type: 'string'}], minItems: 1, items: false, tsLabels: ['message']}, return: {type: 'boolean'}}",
  },
  {
    id: 'TS-META',
    source: "export type UserId = string & {readonly __brand: 'UserId'};\n",
    emits: "tsMeta: {base: {type: 'string'}",
    forbids: ['embedType'],
  },
  {
    id: 'TS-WIRE-HALF',
    // A ts keyword never travels alone: the numeric key really does constrain
    // the JSON, so propertyNames has to say so too.
    source: 'export type Numeric = {[key: number]: string};\n',
    emits: "propertyNames: {pattern: '^(?:0|[1-9][0-9]*)$'}",
  },
  {
    id: 'TS-DROPPABLE',
    source: 'export type Frozen = {readonly id: string};\n',
    emits: "tsReadonly: ['id']",
    note: 'removing every ts keyword leaves a schema that validates the same JSON',
  },
];

/** Convert one declaration and return the rewritten file. */
function convertToSchema(source: string, portable = false): {status: number; stderr: string; main: string} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-dialect-'));
  try {
    writeMarkerPackage(dir);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'main.ts'), "import {getRunTypeId} from '@ts-runtypes/core';\n" + source);
    const args = ['convert', '--tsconfig', path.join(dir, 'tsconfig.json'), '--to', 'json-schema'];
    if (portable) args.push('--portable');
    args.push(path.join(dir, 'src', 'main.ts'));
    const result = spawnSync(BIN, args, {encoding: 'utf8', cwd: dir, maxBuffer: 32 * 1024 * 1024});
    return {
      status: result.status ?? -1,
      stderr: result.stderr ?? '',
      main: fs.readFileSync(path.join(dir, 'src', 'main.ts'), 'utf8'),
    };
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe('json-schema-2020-12-javascript — the dialect spec', () => {
  // Not gated on IMPLEMENTED: this is the drift guard between the prose and
  // this file, and it does not touch the converter.
  it('covers every rule the spec declares', () => {
    const spec = fs.readFileSync(SPEC, 'utf8');
    const declared = new Set(Array.from(spec.matchAll(/`((?:CORE|JS|RT|TS)-[A-Z0-9-]+)`/g), (m) => m[1]!));
    const covered = new Set(RULES.map((rule) => rule.id));

    const untested = [...declared].filter((id) => !covered.has(id)).sort();
    expect(
      untested,
      `the spec declares rules with no case in this file:\n  ${untested.join('\n  ')}\n` +
        'Add a case, or remove the rule from the spec. A rule that is not tested does not exist.'
    ).toEqual([]);

    const invented = [...covered].filter((id) => !declared.has(id)).sort();
    expect(invented, `this file tests rules the spec does not declare:\n  ${invented.join('\n  ')}`).toEqual([]);

    // A case that exists but is not in LANDED silently SKIPS, which would read
    // as coverage without being it. The spec is complete, so the two sets are
    // pinned equal.
    const skipped = [...declared].filter((id) => !LANDED.has(id)).sort();
    expect(
      skipped,
      `the spec declares rules missing from LANDED, so their cases skip:\n  ${skipped.join('\n  ')}\n` +
        'Implement the rule and add it to LANDED, or stage it deliberately by relaxing this assertion.'
    ).toEqual([]);

    expect(declared.size).toBeGreaterThan(20);
  });

  for (const rule of RULES) {
    landed(rule.id)(`${rule.id}${rule.note ? ` — ${rule.note}` : ''}`, {timeout: 120_000}, () => {
      const {main} = convertToSchema(rule.source);
      expect(main, `${rule.id}: expected the schema to contain\n  ${rule.emits}\ngot:\n${main}`).toContain(rule.emits);
      if (rule.alsoEmits !== undefined) {
        expect(main, `${rule.id}: expected the schema to contain\n  ${rule.alsoEmits}\ngot:\n${main}`).toContain(rule.alsoEmits);
      }
      for (const forbidden of rule.forbids ?? ['embedType']) {
        expect(main, `${rule.id}: the schema must not contain ${forbidden}:\n${main}`).not.toContain(forbidden);
      }
    });
  }

  landed('CORE-PORTABLE')('CORE-PORTABLE refuses the extension rather than dropping it', {timeout: 120_000}, () => {
    const {status, stderr, main} = convertToSchema('export type Stamp = Date;\n', true);
    expect(status, `--portable must fail on a type needing the extension:\n${stderr}`).not.toBe(0);
    expect(stderr).toContain('CNV006');
    expect(main, 'the declaration must survive untouched').toContain('export type Stamp = Date;');
  });
});
