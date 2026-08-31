// THE CONFORMANCE TEST for docs/json-schema-2020-12-javascript.md.
//
// The spec gives every rule an ID (`JS-DATE`, `RT-FORMAT-BIGINT`, …). This file
// has one case per ID: a TypeScript type declared inline, its JSON Schema
// document produced by the REAL runtime generator (`createJsonSchemaFn<T>()`,
// whose document the Go schemadoc renderer emitted at build time), and object
// assertions on what the spec says that document must contain. The spec is the
// prose, this is the executable twin, and `covers every rule` reads the spec
// file and fails when either side names a rule the other does not.
//
// Why documents are asserted structurally rather than by a single keyword: the
// whole design is that the wire keywords and the extension keywords say
// different halves of one thing. A test that only checked `jsType` would pass a
// schema that had quietly stopped emitting the `type` beside it, which is the
// exact regression the dialect exists to prevent (CORE-SIBLING).

import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createJsonSchemaFn, JSON_SCHEMA_DIALECT_KEYWORDS} from '@mionjs/run-types';
// Value import: registers the format runtime checks AND provides the format
// builders (`TF.string()`); the TF.* types ride the same namespace.
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';

const SPEC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/json-schema-2020-12-javascript.md');

const DIALECT_KEYS = new Set<string>(JSON_SCHEMA_DIALECT_KEYWORDS);

type Doc = Record<string, unknown>;

// Collects every object key in a document, recursively (arrays included).
function collectKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((element) => collectKeys(element, into));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Doc)) {
      into.add(key);
      collectKeys(child, into);
    }
  }
  return into;
}

// Asserts the given keys appear NOWHERE in the document, at any depth.
function expectAbsent(doc: unknown, forbidden: readonly string[]): void {
  const keys = collectKeys(doc);
  for (const key of forbidden) {
    expect(keys.has(key), `the document must not contain '${key}' anywhere:\n${JSON.stringify(doc)}`).toBe(false);
  }
}

// Deep-copies a document dropping every key the predicate rejects.
function stripKeys(value: unknown, drop: (key: string) => boolean): unknown {
  if (Array.isArray(value)) return value.map((element) => stripKeys(element, drop));
  if (value !== null && typeof value === 'object') {
    const out: Doc = {};
    for (const [key, child] of Object.entries(value as Doc)) {
      if (!drop(key)) out[key] = stripKeys(child, drop);
    }
    return out;
  }
  return value;
}

// Every case registers its rule ID here; `covers every rule` pins the set
// EQUAL to what the spec declares, in both directions.
const COVERED = new Set<string>();
function rule(id: string, title: string, body: () => void): void {
  COVERED.add(id);
  it(`${id} — ${title}`, body);
}

// ── The types under test, one inline declaration per rule ─────────────────
type Stamp = Date;
type Name = string;
type Big = bigint;
type Build = 4096n;
type Matcher = RegExp;
type At = Temporal.Instant;
type Day = Temporal.PlainDate;
type Span = Temporal.Duration;
type Meeting = Temporal.ZonedDateTime;
type Index = Map<string, number>;
type Tags = Set<string>;
type Missing = {a: undefined};
type Nothing = {a: void};
type Later = {a: Promise<string>};
type TaggedPair = {a: string; b: symbol};
type Loose = {a: any};
type Thing = {a: object};
type Mail = TF.Email;
type MailBoundedLocal = TF.Email<{localPart: {maxLength: 64}}>;
type Short = TF.String<{minLength: 3}>;
type Code = TF.String<{pattern: {source: '^ab+c$'; flags: ''}}>;
type CodeInsensitive = TF.String<{pattern: {source: '^ab+c$'; flags: 'i'}}>;
type SmallBig = TF.BigInt<{min: 0n; max: 255n}>;
type LooseItems = TF.FormattedArray<string[], {minItems: 0}>;
type Named = TF.String<{mockSamples: ['ana']}>;
type Point = [x: number, y: number];
type Frozen = {readonly id: string; hits: number};
type FrozenOnly = {readonly id: string};
type Numeric = {[key: number]: string};
type Route = `api/${string}`;
type Notify = (message: string) => boolean;
type UserId = string & {readonly __brand: 'UserId'};

const DATE_DOC = {type: 'string', format: 'date-time', jsType: 'Date'};

describe('json-schema-2020-12-javascript — the dialect spec', () => {
  // ── CORE ─────────────────────────────────────────────────────────────────
  rule('CORE-SIBLING', 'jsType never appears without the wire type beside it', () => {
    const doc = createJsonSchemaFn<Stamp>()();
    expect(doc).toEqual(DATE_DOC);
    // The load-bearing pair: the extension keyword AND the wire keywords.
    expect(doc.jsType).toBe('Date');
    expect(doc.type).toBe('string');
  });

  rule('CORE-INERT', 'stripping the extension keywords leaves a document validating the same JSON', () => {
    const doc = createJsonSchemaFn<Stamp>()();
    const portable = createJsonSchemaFn<Stamp>()({libraryOptions: {portable: true}});
    // Deleting every dialect keyword by hand IS the portable document.
    expect(stripKeys(doc, (key) => DIALECT_KEYS.has(key))).toEqual(portable);
    expect(portable).toEqual({type: 'string', format: 'date-time'});
  });

  rule('CORE-PRECEDENCE', 'jsType decides the type; the wire keywords only describe the JSON', () => {
    // This document carries BOTH a format and a jsType: it recovers Date, not
    // a date-time-formatted string, so both halves must be present at once.
    expect(createJsonSchemaFn<Stamp>()()).toEqual({type: 'string', format: 'date-time', jsType: 'Date'});
  });

  rule('CORE-PORTABLE', 'a portable document uses no extension keyword at all', () => {
    // A type the standard can say entirely never needed the extension.
    const plain = createJsonSchemaFn<Name>()();
    expect(plain).toEqual({type: 'string'});
    expectAbsent(plain, ['jsType', 'rtFormat', 'rtFormatParams', 'tsLabels']);
    // A Date NEEDS it by default; the portable option strips every dialect
    // keyword and keeps the wire half intact.
    const dated = createJsonSchemaFn<Stamp>()();
    expect(collectKeys(dated).has('jsType')).toBe(true);
    const portable = createJsonSchemaFn<Stamp>()({libraryOptions: {portable: true}});
    for (const key of collectKeys(portable)) {
      expect(DIALECT_KEYS.has(key), `portable document leaked dialect keyword '${key}'`).toBe(false);
    }
    expect(portable).toEqual({type: 'string', format: 'date-time'});
  });

  // ── jsType: values that travel as a string ───────────────────────────────
  rule('JS-BIGINT', 'a bigint travels as a digit string', () => {
    expect(createJsonSchemaFn<Big>()()).toEqual({type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'});
  });

  rule('JS-DATE', 'a Date travels as an ISO date-time string', () => {
    expect(createJsonSchemaFn<Stamp>()()).toEqual(DATE_DOC);
  });

  rule('JS-BIGINT-LITERAL', 'a bigint literal pins the wire value under const', () => {
    const doc = createJsonSchemaFn<Build>()();
    expect(doc).toEqual({type: 'string', const: '4096', jsType: 'bigint'});
    // No separate keyword for it: the const + jsType pair IS the spelling.
    expectAbsent(doc, ['jsBigint']);
  });

  rule('JS-REGEXP', 'a RegExp travels as its String(re) form', () => {
    expect(createJsonSchemaFn<Matcher>()()).toEqual({type: 'string', jsType: 'RegExp'});
  });

  // ── jsType: Temporal ─────────────────────────────────────────────────────
  rule('JS-TEMPORAL-INSTANT', 'Temporal.Instant rides format: date-time', () => {
    expect(createJsonSchemaFn<At>()()).toEqual({type: 'string', format: 'date-time', jsType: 'Temporal.Instant'});
  });

  rule('JS-TEMPORAL-PLAINDATE', 'Temporal.PlainDate rides format: date', () => {
    expect(createJsonSchemaFn<Day>()()).toEqual({type: 'string', format: 'date', jsType: 'Temporal.PlainDate'});
  });

  rule('JS-TEMPORAL-DURATION', 'Temporal.Duration rides format: duration', () => {
    expect(createJsonSchemaFn<Span>()()).toEqual({type: 'string', format: 'duration', jsType: 'Temporal.Duration'});
  });

  rule('JS-TEMPORAL-PATTERNED', 'ZonedDateTime carries pattern, never format: date-time', () => {
    // toJSON() emits RFC 9557, which `format: date-time` would reject, so the
    // wire half is a pattern. The regex itself is the implementation's
    // business; the `pattern`-not-`format` choice is the rule.
    const doc = createJsonSchemaFn<Meeting>()();
    expect(doc.jsType).toBe('Temporal.ZonedDateTime');
    expect(doc.type).toBe('string');
    expect(typeof doc.pattern).toBe('string');
    expect(doc.format).toBeUndefined();
  });

  // ── jsType: containers ───────────────────────────────────────────────────
  rule('JS-MAP', 'a Map travels as an array of pairs; the arguments live in the wire schema', () => {
    const doc = createJsonSchemaFn<Index>()();
    expect(doc).toEqual({
      type: 'array',
      items: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], minItems: 2, items: false},
      jsType: 'Map',
    });
    expectAbsent(doc, ['typeArguments']);
  });

  rule('JS-SET', 'a Set travels as a unique-items array', () => {
    const doc = createJsonSchemaFn<Tags>()();
    expect(doc).toEqual({type: 'array', items: {type: 'string'}, uniqueItems: true, jsType: 'Set'});
    expectAbsent(doc, ['typeArguments']);
  });

  // ── jsType: the absent values ────────────────────────────────────────────
  rule('JS-UNDEFINED', 'undefined encodes as JSON null', () => {
    expect(createJsonSchemaFn<Missing>()()).toMatchObject({
      type: 'object',
      properties: {a: {type: 'null', jsType: 'undefined'}},
    });
  });

  rule('JS-VOID', 'void encodes as JSON null', () => {
    expect(createJsonSchemaFn<Nothing>()()).toMatchObject({
      type: 'object',
      properties: {a: {type: 'null', jsType: 'void'}},
    });
  });

  rule('JS-PROMISE', 'a Promise carries the resolved schema under jsResolved', () => {
    expect(createJsonSchemaFn<Later>()()).toMatchObject({
      properties: {a: {jsType: 'Promise', jsResolved: {type: 'string'}}},
    });
  });

  rule('JS-SYMBOL', 'a symbol has no wire keywords; the annotation records the type', () => {
    const doc = createJsonSchemaFn<TaggedPair>()();
    expect(doc).toMatchObject({properties: {a: {type: 'string'}, b: {jsType: 'symbol'}}});
    const symbolMember = (doc.properties as Record<string, Doc>).b;
    expect(symbolMember).toEqual({jsType: 'symbol'});
  });

  // ── jsType: the broad types ──────────────────────────────────────────────
  rule('JS-ANY', 'any carries no wire schema at all', () => {
    const doc = createJsonSchemaFn<Loose>()();
    const anyMember = (doc.properties as Record<string, Doc>).a;
    expect(anyMember).toEqual({jsType: 'any'});
  });

  rule('JS-OBJECT', 'object is the non-primitive gate: the two-member type union', () => {
    const doc = createJsonSchemaFn<Thing>()();
    const objectMember = (doc.properties as Record<string, Doc>).a;
    expect(objectMember).toEqual({type: ['object', 'array'], jsType: 'object'});
  });

  // ── rtFormat ─────────────────────────────────────────────────────────────
  rule('RT-FORMAT-NAME', 'rtFormat names the family; format and rtFormat appear together and agree', () => {
    const doc = createJsonSchemaFn<Mail>()();
    expect(doc).toMatchObject({type: 'string', format: 'email', rtFormat: 'email', maxLength: 254, minLength: 7});
    expect(typeof doc.pattern).toBe('string');
  });

  rule('RT-FORMAT-STANDARD', 'a family parameter rides the standard keyword whenever one exists', () => {
    // The bound rides `minLength`, the STANDARD keyword, so a plain validator
    // enforces it. Only the family name needs the extension.
    expect(createJsonSchemaFn<Short>()()).toMatchObject({
      type: 'string',
      minLength: 3,
      rtFormat: 'stringFormat',
      rtFormatParams: {minLength: 3},
    });
  });

  rule('RT-FORMAT-PATTERN-FLAGS', 'a flagless pattern projects onto the standard keyword', () => {
    const doc = createJsonSchemaFn<Code>()();
    expect(doc.pattern).toBe('^ab+c$');
    expect(doc).toMatchObject({
      type: 'string',
      rtFormat: 'stringFormat',
      rtFormatParams: {pattern: {flags: '', source: '^ab+c$'}},
    });
  });

  rule('RT-FORMAT-PATTERN-FLAGS', 'a case-insensitive pattern is NOT projected (it would over-reject)', () => {
    // The regex still rides rtFormatParams; what must NOT appear is a standard
    // `pattern` keyword, which a validator would apply case-SENSITIVELY and so
    // reject values the type accepts.
    const doc = createJsonSchemaFn<CodeInsensitive>()();
    expect(doc.pattern).toBeUndefined();
    expect(doc).toMatchObject({type: 'string', rtFormatParams: {pattern: {flags: 'i', source: '^ab+c$'}}});
  });

  rule('RT-FORMAT-PARAMS', 'rtFormatParams carries ALL the family params, localPart included', () => {
    // `localPart` has no standard keyword; every param folds into the
    // identity, so carrying only the leftovers would change what the type is.
    expect(createJsonSchemaFn<MailBoundedLocal>()()).toMatchObject({
      rtFormat: 'email',
      rtFormatParams: {localPart: {maxLength: 64}, maxLength: 254, minLength: 7},
    });
  });

  rule('RT-FORMAT-BIGINT', 'bigint bounds ride as decimal strings', () => {
    expect(createJsonSchemaFn<SmallBig>()()).toEqual({
      type: 'string',
      pattern: '^-?[0-9]+$',
      rtFormat: 'bigintFormat',
      rtFormatParams: {max: '255', min: '0'},
    });
  });

  rule('RT-FORMAT-DEFAULT', 'a default-valued parameter still rides rtFormatParams', () => {
    // minItems 0 IS the standard default, so the standard keyword cannot carry
    // it back to a reader, and rtFormatParams keeps the family's parameter.
    const doc = createJsonSchemaFn<LooseItems>()();
    expect(doc).toMatchObject({type: 'array', items: {type: 'string'}, rtFormatParams: {minItems: 0}});
  });

  rule('RT-FORMAT-NONVALIDATING', 'mock-only parameters get no standard keyword but keep their rtFormatParams seat', () => {
    // mockSamples drives mock generation only, so no standard keyword is
    // projected; it still rides rtFormatParams because it is part of the
    // type's identity even though it constrains nothing.
    expect(createJsonSchemaFn<Named>()()).toEqual({
      type: 'string',
      rtFormat: 'stringFormat',
      rtFormatParams: {mockSamples: ['ana']},
    });
  });

  // ── ts keywords ──────────────────────────────────────────────────────────
  rule('TS-LABELS', 'tuple slot names ride tsLabels beside the wire tuple', () => {
    expect(createJsonSchemaFn<Point>()()).toEqual({
      type: 'array',
      prefixItems: [{type: 'number'}, {type: 'number'}],
      minItems: 2,
      items: false,
      tsLabels: ['x', 'y'],
    });
  });

  rule('TS-READONLY', 'readonly members are named the way required names its own', () => {
    expect(createJsonSchemaFn<Frozen>()()).toEqual({
      type: 'object',
      properties: {id: {type: 'string'}, hits: {type: 'number'}},
      required: ['id', 'hits'],
      tsReadonly: ['id'],
    });
  });

  rule('TS-INDEXES', 'non-string index signatures ride tsIndexes', () => {
    expect(createJsonSchemaFn<Numeric>()()).toMatchObject({
      type: 'object',
      tsIndexes: [{key: {type: 'number'}, value: {type: 'string'}}],
    });
  });

  rule('TS-TEMPLATE', 'a template literal carries its parts beside the anchored pattern', () => {
    expect(createJsonSchemaFn<Route>()()).toEqual({
      type: 'string',
      // TS-WIRE-HALF applies here too: the literal chunks are pinned, the
      // placeholder is a wildcard (a narrower regex would reject strings the
      // type accepts).
      pattern: String.raw`^api/[\s\S]*$`,
      tsTemplate: {texts: ['api/', ''], placeholders: [{type: 'string'}]},
    });
  });

  rule('TS-FUNCTION', 'a function signature is a params tuple schema plus a return schema', () => {
    expect(createJsonSchemaFn<Notify>()()).toEqual({
      tsFunction: {
        params: {type: 'array', prefixItems: [{type: 'string'}], minItems: 1, items: false, tsLabels: ['message']},
        return: {type: 'boolean'},
      },
    });
  });

  rule('TS-META', 'a metadata intersection nests its base under tsMeta', () => {
    expect(createJsonSchemaFn<UserId>()()).toEqual({
      tsMeta: {
        base: {type: 'string'},
        meta: [
          {
            type: 'object',
            properties: {__brand: {const: 'UserId'}},
            required: ['__brand'],
            tsReadonly: ['__brand'],
          },
        ],
      },
    });
  });

  rule('TS-WIRE-HALF', 'a ts keyword never travels alone: the numeric key constrains the JSON too', () => {
    // The numeric key really does constrain the JSON object's (string) keys,
    // so propertyNames has to say so beside tsIndexes.
    expect(createJsonSchemaFn<Numeric>()()).toMatchObject({
      type: 'object',
      propertyNames: {pattern: '^(?:0|[1-9][0-9]*)$'},
    });
  });

  rule('TS-DROPPABLE', 'removing every ts keyword leaves a schema validating the same JSON', () => {
    const doc = createJsonSchemaFn<FrozenOnly>()();
    expect(doc.tsReadonly).toEqual(['id']);
    // This document's only dialect keywords are ts-prefixed, so dropping just
    // those must land exactly on the portable document.
    const withoutTs = stripKeys(doc, (key) => key.startsWith('ts') && DIALECT_KEYS.has(key));
    expect(withoutTs).toEqual(createJsonSchemaFn<FrozenOnly>()({libraryOptions: {portable: true}}));
  });

  // ── marker coverage rule: both factory call shapes, same document ────────
  it('static and value-first call shapes produce the same document', () => {
    // Static form: the caller supplies T.
    const staticDoc = createJsonSchemaFn<string[]>()();
    // Value-first form: the RunType schema value carries the id (the string
    // builder lives on the formats surface, so the composer nests TF.string()).
    const builderDoc = createJsonSchemaFn(RT.array(TF.string()))();
    expect(builderDoc).toEqual(staticDoc);
    expect(staticDoc).toEqual({type: 'array', items: {type: 'string'}});
  });

  it('static and reflection call shapes produce the same document (JS-DATE)', () => {
    // Reflection form: T inferred from the value.
    const stamp: Stamp = new Date('2026-08-10T09:00:00Z');
    expect(createJsonSchemaFn(stamp)()).toEqual(createJsonSchemaFn<Stamp>()());
  });

  // ── the spec ⇄ test drift guard ──────────────────────────────────────────
  it('covers every rule the spec declares', () => {
    const spec = fs.readFileSync(SPEC, 'utf8');
    const declared = new Set(Array.from(spec.matchAll(/`((?:CORE|JS|RT|TS)-[A-Z0-9-]+)`/g), (m) => m[1]!));

    const untested = [...declared].filter((id) => !COVERED.has(id)).sort();
    expect(
      untested,
      `the spec declares rules with no case in this file:\n  ${untested.join('\n  ')}\n` +
        'Add a case, or remove the rule from the spec. A rule that is not tested does not exist.'
    ).toEqual([]);

    const invented = [...COVERED].filter((id) => !declared.has(id)).sort();
    expect(invented, `this file tests rules the spec does not declare:\n  ${invented.join('\n  ')}`).toEqual([]);

    expect(declared.size).toBeGreaterThan(20);
  });
});
