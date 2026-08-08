// The embedType escape + jsType dialect atoms (phase 1 of the format
// conversion layer, docs/todos/format-conversion-layer.md): every spelling
// must converge on the type-first structural id — the schema door, the escape
// hatch, and plain TS are one engine.
import {describe, expect, it} from 'vitest';
import {getRunTypeId} from '@ts-runtypes/core';
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
  it('any converges (and stays distinct from unknown)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getRunTypeId(runTypeFromJsonSchema({jsType: 'any'} as const))).toBe(getRunTypeId<any>());
    expect(getRunTypeId(runTypeFromJsonSchema({jsType: 'any'} as const))).not.toBe(getRunTypeId<unknown>());
  });
});
