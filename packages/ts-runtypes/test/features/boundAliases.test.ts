// Bound-keyword aliases: a numeric / bigint / date format may spell its bounds
// with the JSON Schema keywords (minimum / maximum / exclusiveMinimum /
// exclusiveMaximum) OR the engine's short keys (min / max / gt / lt), and both
// fold to ONE structural id — the Go scanner canonicalises the alias spelling
// when it reads `__rtFormatParams`. Convergence is pinned across all three
// authoring modes (type-first alias, value-first builder, JSON Schema door),
// and — per the CLAUDE.md marker-coverage rule — across both getRunTypeId call
// shapes.

import {describe, expect, it} from 'vitest';
import {getRunTypeId} from '@ts-runtypes/core';
import * as TF from '@ts-runtypes/core/formats';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import '@ts-runtypes/core/formats';

describe('bound keyword aliases converge with the short spelling', () => {
  it('number: minimum/maximum/exclusive* ≡ min/max/gt/lt (type-first + reflection)', () => {
    const short = getRunTypeId<TF.Number<{min: 0; max: 100}>>();
    // type-first alias, keyword spelling
    expect(getRunTypeId<TF.Number<{minimum: 0; maximum: 100}>>()).toBe(short);
    // reflection form (marker rule)
    const value: TF.Number<{minimum: 0; maximum: 100}> = 5 as TF.Number<{minimum: 0; maximum: 100}>;
    expect(getRunTypeId(value)).toBe(short);
    // exclusive bounds
    const exclShort = getRunTypeId<TF.Number<{gt: 0; lt: 100}>>();
    expect(getRunTypeId<TF.Number<{exclusiveMinimum: 0; exclusiveMaximum: 100}>>()).toBe(exclShort);
  });

  it('number: value-first builder converges with both spellings and the door', () => {
    const short = getRunTypeId<TF.Number<{min: 0; max: 100}>>();
    expect(getRunTypeId(TF.number({min: 0, max: 100}))).toBe(short);
    expect(getRunTypeId(TF.number({minimum: 0, maximum: 100}))).toBe(short);
    // JSON Schema door
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'number', minimum: 0, maximum: 100}))).toBe(short);
  });

  it('bigint: keyword spellings converge', () => {
    const short = getRunTypeId<TF.BigInt<{min: 0n; max: 1000n}>>();
    expect(getRunTypeId<TF.BigInt<{minimum: 0n; maximum: 1000n}>>()).toBe(short);
    expect(getRunTypeId(TF.bigInt({minimum: 0n, maximum: 1000n}))).toBe(short);
    expect(getRunTypeId(TF.bigInt({min: 0n, max: 1000n}))).toBe(short);
  });

  it('native Date: keyword bounds converge', () => {
    const short = getRunTypeId<TF.Date<{max: 'now'}>>();
    expect(getRunTypeId<TF.Date<{maximum: 'now'}>>()).toBe(short);
    expect(getRunTypeId(TF.date({maximum: 'now'}))).toBe(short);
    expect(getRunTypeId(TF.date({max: 'now'}))).toBe(short);
  });

  it('exclusive bounds via keyword spelling converge with the door', () => {
    const keyword = TF.number({minimum: 0, exclusiveMaximum: 10});
    const door = runTypeFromJsonSchema({type: 'number', minimum: 0, exclusiveMaximum: 10});
    expect(getRunTypeId(keyword)).toBe(getRunTypeId(door));
    // and with the short-key builder
    expect(getRunTypeId(TF.number({min: 0, lt: 10}))).toBe(getRunTypeId(door));
  });
});
