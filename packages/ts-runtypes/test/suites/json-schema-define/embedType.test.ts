// The embedType escape + jsType dialect atoms (phase 1 of the format
// conversion layer, docs/done/format-conversion-layer.md): every spelling
// must converge on the type-first structural id — the schema door, the escape
// hatch, and plain TS are one engine.
import {describe, expect, it} from 'vitest';
import {getRunTypeId} from '@ts-runtypes/core';
import * as TF from '@ts-runtypes/core/formats';
import {embedType, runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('json-schema / embedType escape', () => {
  // Marker coverage rule: the static shape (type argument) and the value
  // shape (T inferred from the value) must resolve to the same cache entry.
  it('type-arg shape converges with the type-first id', () => {
    const embedded = runTypeFromJsonSchema(embedType<123n>());
    expect(getRunTypeId(embedded)).toBe(getRunTypeId<123n>());
  });

  it('value shape converges with the type-first id', () => {
    const embedded = runTypeFromJsonSchema(embedType(123n));
    expect(getRunTypeId(embedded)).toBe(getRunTypeId<123n>());
  });

  it('embeds at a nested schema position', () => {
    const nested = runTypeFromJsonSchema({
      type: 'object',
      properties: {big: embedType<bigint>()},
      required: ['big'],
    } as const);
    type Twin = {big: bigint};
    expect(getRunTypeId(nested)).toBe(getRunTypeId<Twin>());
  });
});

describe('json-schema / jsFormat dialect', () => {
  it('stringFormat params converge with the TF brand', () => {
    const viaSchema = runTypeFromJsonSchema({rtFormat: 'stringFormat', rtFormatParams: {maxLength: 5, minLength: 2}} as const);
    expect(getRunTypeId(viaSchema)).toBe(getRunTypeId<TF.String<{minLength: 2; maxLength: 5}>>());
  });
  it('numberFormat params converge with the TF brand', () => {
    const viaSchema = runTypeFromJsonSchema({rtFormat: 'numberFormat', rtFormatParams: {integer: true}} as const);
    expect(getRunTypeId(viaSchema)).toBe(getRunTypeId<TF.Number<{integer: true}>>());
  });
  it('a bigint-family brand rides embedType (no JSON spelling for bigint params)', () => {
    const viaSchema = runTypeFromJsonSchema(embedType<TF.BigInt<{min: 5n}>>());
    expect(getRunTypeId(viaSchema)).toBe(getRunTypeId<TF.BigInt<{min: 5n}>>());
  });
});

describe('json-schema / jsType dialect atoms', () => {
  it('bigint converges', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({jsType: 'bigint'} as const))).toBe(getRunTypeId<bigint>());
  });
  it('symbol converges', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({jsType: 'symbol'} as const))).toBe(getRunTypeId<symbol>());
  });
  it('undefined converges', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({jsType: 'undefined'} as const))).toBe(getRunTypeId<undefined>());
  });
  it('void converges', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({jsType: 'void'} as const))).toBe(getRunTypeId<void>());
  });
  it('RegExp converges through both marker shapes', () => {
    const matcher = runTypeFromJsonSchema({jsType: 'RegExp'} as const);
    expect(getRunTypeId(matcher)).toBe(getRunTypeId<RegExp>());
    const sample: RegExp = /x/;
    expect(getRunTypeId(sample)).toBe(getRunTypeId<RegExp>());
  });

  it('native containers converge (Date / Map / Set / Promise)', () => {
    // Map and Set read their arguments out of the WIRE schema: a Map encodes
    // as an array of [key, value] pairs and a Set as a unique array, so the
    // schema already had to say what the elements are.
    const stamp = runTypeFromJsonSchema({type: 'string', format: 'date-time', jsType: 'Date'} as const);
    expect(getRunTypeId(stamp)).toBe(getRunTypeId<Date>());
    const lookup = runTypeFromJsonSchema({
      type: 'array',
      items: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], minItems: 2, items: false},
      jsType: 'Map',
    } as const);
    expect(getRunTypeId(lookup)).toBe(getRunTypeId<Map<string, number>>());
    const bag = runTypeFromJsonSchema({
      type: 'array',
      items: {type: 'boolean'},
      uniqueItems: true,
      jsType: 'Set',
    } as const);
    expect(getRunTypeId(bag)).toBe(getRunTypeId<Set<boolean>>());
    // A promise is the exception: it has no encoding of its own, so the
    // resolved value's schema rides its own key rather than merging in.
    const later = runTypeFromJsonSchema({jsType: 'Promise', jsResolved: {type: 'string'}} as const);
    expect(getRunTypeId(later)).toBe(getRunTypeId<Promise<string>>());
  });

  it('any converges (and stays distinct from unknown)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getRunTypeId(runTypeFromJsonSchema({jsType: 'any'} as const))).toBe(getRunTypeId<any>());
    expect(getRunTypeId(runTypeFromJsonSchema({jsType: 'any'} as const))).not.toBe(getRunTypeId<unknown>());
  });
});
