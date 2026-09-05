/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// TRIPWIRE for `createSizingSerializer` (packages/core/src/binary/dataView.ts).
//
// The measure pass reassembles what upstream builds internally for `sizeStrategy: 'precalculate'`,
// which it does not export: a serializer whose writes go nowhere and whose cursor still advances
// exactly as the real encoder's would. mion sizes POOLED buffers from it, so if the two ever
// disagree the failure is a buffer that comes up short — silent truncation caught only by a
// re-encode, or a wrong-sized allocation nobody notices.
//
// Every framing method except serString/serLength is inherited from the real serializer, so the two
// can only drift where mion reimplements: the LEB128 length width and the UTF-8 byte count. This
// spec pins measured == written on real compiled encoders across the shapes that exercise both.

import {describe, expect, it, beforeAll} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain} from '../router.ts';
import {Routes} from '../types/general.ts';
import {createDataViewSerializer, createSizingSerializer} from '@mionjs/core';
import type {MethodWithJitFns} from '@mionjs/core';

const mion = createMionRouter({serializer: 'binary'});

interface Tag {
  label: string;
  weight: number;
}

interface Profile {
  id: string;
  name?: string;
  active: boolean;
  tags: Tag[];
  meta: {created: Date; score: number | null};
}

const routes = {
  num: mion.route((): number => 0),
  str: mion.route((): string => ''),
  bool: mion.route((): boolean => false),
  date: mion.route((): Date => new Date()),
  list: mion.route((): number[] => []),
  tags: mion.route((): Tag[] => []),
  profile: mion.route((): Profile => ({id: '', active: false, tags: [], meta: {created: new Date(), score: null}})),
  union: mion.route((): string | number | boolean => 0),
  optional: mion.route((): {a?: string; b?: number} => ({})),
  record: mion.route((): Record<string, number> => ({})),
} satisfies Routes;

function methodFor(path: string): MethodWithJitFns {
  const chain = getRouteExecutionChain(path)!.methods as unknown as MethodWithJitFns[];
  return chain.find((m) => m.id === path.slice(1))!;
}

/** Bytes the measure pass says this value costs. */
function measured(method: MethodWithJitFns, value: unknown): number {
  const sizer = createSizingSerializer();
  method.returnJitFns.binary!.toBinary.fn(value, sizer);
  return sizer.getLength();
}

/** Bytes the real encoder actually writes for this value. */
function written(method: MethodWithJitFns, value: unknown): number {
  const serializer = createDataViewSerializer(method.id, 256 * 1024);
  method.returnJitFns.binary!.toBinary.fn(value, serializer);
  return serializer.getLength();
}

function expectExact(path: string, value: unknown): void {
  const method = methodFor(path);
  expect(measured(method, value)).toBe(written(method, value));
}

describe('binary measure pass', () => {
  beforeAll(async () => {
    resetRouter();
    mion.initRoutes(routes);
  });

  it('counts scalars exactly', () => {
    expectExact('/num', 0);
    expectExact('/num', -1);
    expectExact('/num', 1.5e300);
    expectExact('/bool', true);
    expectExact('/bool', false);
    expectExact('/date', new Date('2026-08-22T13:00:00.000Z'));
  });

  it('counts strings exactly, whatever their UTF-8 width', () => {
    expectExact('/str', '');
    expectExact('/str', 'ascii');
    expectExact('/str', 'ünïcödé'); // 2-byte code points
    expectExact('/str', '日本語のテキスト'); // 3-byte
    expectExact('/str', '👋🏽 emoji 🎉'); // surrogate pairs -> one 4-byte code point each
    expectExact('/str', 'mixed ascii + ü + 日 + 👋');
  });

  it('counts the varint length prefix exactly at every width boundary', () => {
    // 1-byte varint below 128 bytes, 2-byte below 16384, 3-byte beyond — the widths mion
    // reimplements, so each boundary is checked from both sides
    for (const len of [126, 127, 128, 129, 16382, 16383, 16384, 16385, 200_000]) {
      expectExact('/str', 'x'.repeat(len));
    }
    // and a multi-byte string whose CHAR length and BYTE length straddle different widths
    expectExact('/str', 'é'.repeat(64)); // 64 chars, 128 bytes
    expectExact('/str', 'é'.repeat(8192)); // 8192 chars, 16384 bytes
  });

  it('counts collections exactly, including their element counts', () => {
    expectExact('/list', []);
    expectExact('/list', [1]);
    expectExact(
      '/list',
      Array.from({length: 200}, (_, i) => i)
    );
    expectExact('/tags', []);
    expectExact(
      '/tags',
      Array.from({length: 130}, (_, i) => ({label: `tag-${i}`, weight: i}))
    );
    expectExact('/record', {});
    expectExact('/record', {a: 1, b: 2, ç: 3});
  });

  it('counts optional properties and unions exactly', () => {
    expectExact('/optional', {});
    expectExact('/optional', {a: 'set'});
    expectExact('/optional', {b: 7});
    expectExact('/optional', {a: 'both', b: 7});
    expectExact('/union', 'a string arm');
    expectExact('/union', 42);
    expectExact('/union', true);
  });

  it('counts a nested object graph exactly', () => {
    expectExact('/profile', {
      id: 'p-1',
      active: true,
      tags: [
        {label: 'x', weight: 1},
        {label: 'ü', weight: 2},
      ],
      meta: {created: new Date('2026-01-01T00:00:00.000Z'), score: null},
    });
    expectExact('/profile', {
      id: 'p-2',
      name: 'with an optional name',
      active: false,
      tags: [],
      meta: {created: new Date('2026-06-15T12:34:56.789Z'), score: 99.5},
    });
  });

  it('allocates nothing while measuring', () => {
    const sizer = createSizingSerializer();
    expect(sizer.buffer.byteLength).toBe(0);
    const method = methodFor('/tags');
    method.returnJitFns.binary!.toBinary.fn(
      Array.from({length: 500}, (_, i) => ({label: `tag-${i}`, weight: i})),
      sizer
    );
    expect(sizer.getLength()).toBeGreaterThan(1000);
    // the buffer never grew: the measure pass reserves nothing and writes nothing
    expect(sizer.buffer.byteLength).toBe(0);
  });
});
