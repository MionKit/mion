/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Pins the WRITE LIST that `serializeBinaryBody` resolves once per request
// (packages/core/src/binary/bodySerializer.ts).
//
// The plan, measure and write passes all read that one list instead of re-deciding per pass what
// goes on the wire, so what this spec has to hold is the list's lifetime: it survives a throw, it
// survives being re-entered, and it retains no request data once the request is done.

import {describe, expect, it, beforeAll, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain} from '../router.ts';
import {Routes} from '../types/general.ts';
import {
  serializeBinaryBody,
  deserializeBinaryBody,
  configureBinary,
  resetBinaryOptions,
  resetBufferPool,
  resetSizeStats,
  getBinaryStrategyStats,
  resetBinaryStrategyStats,
} from '@mionjs/core';
import type {MethodWithJitFns} from '@mionjs/core';

const mion = createMionRouter({serializer: 'binary'});

const routes = {
  tags: mion.route((): string[] => []),
} satisfies Routes;

function methodFor(id: string): MethodWithJitFns {
  const chain = getRouteExecutionChain(`/${id}`)!.methods as unknown as MethodWithJitFns[];
  return chain.find((m) => m.id === id)!;
}

/** A chain member whose compiled `toBinary` is whatever the test needs it to be. */
function fakeMethod(id: string, fn: (value: any, serializer: any) => void): MethodWithJitFns {
  return {id, hasReturnData: true, returnJitFns: {toBinary: {fn, isNoop: false}}, paramsJitFns: {}} as any;
}

describe('binary write list', () => {
  beforeAll(async () => {
    resetRouter();
    mion.initRoutes(routes);
  });

  beforeEach(() => {
    resetBufferPool();
    resetSizeStats();
    resetBinaryOptions();
    resetBinaryStrategyStats();
    configureBinary({pool: {enabled: true}});
  });

  it('reads each value ONCE, so the measure pass and the write pass cannot disagree', () => {
    // A getter that grows on every read is the one case a MEASURED pooled size could still
    // overrun: the measure pass sized for the first read, the write pass then wrote the second.
    let reads = 0;
    const body: Record<string, any> = {};
    Object.defineProperty(body, 'tags', {
      enumerable: true,
      get() {
        reads++;
        return Array.from({length: reads * 40}, (_, i) => `tag-number-${i}`);
      },
    });

    const {view, release} = serializeBinaryBody('/tags', [methodFor('tags')], body, true);
    const bytes = new Uint8Array(view);
    release();

    expect(reads).toBe(1);
    // a cold method has no size history, so this request was sized by the measure pass...
    expect(getBinaryStrategyStats().measured).toBe(1);
    // ...and that size held, so nothing had to be re-encoded on the adaptive path
    expect(getBinaryStrategyStats().retries).toBe(0);
    const {body: wire} = deserializeBinaryBody('/tags', bytes, true);
    expect(wire.tags).toHaveLength(40);
  });

  it('releases the list when a compiled toBinary throws', () => {
    const boom = fakeMethod('boom', () => {
      throw new Error('boom');
    });
    expect(() => serializeBinaryBody('/tags', [boom], {boom: 1}, true)).toThrow();

    // the next request must still see its OWN methods, not the failed one's leftovers
    const {view, release} = serializeBinaryBody('/tags', [methodFor('tags')], {tags: ['a', 'b']}, true);
    const bytes = new Uint8Array(view);
    release();
    expect(deserializeBinaryBody('/tags', bytes, true).body.tags).toEqual(['a', 'b']);
  });

  it('survives a compiled toBinary re-entering serializeBinaryBody', () => {
    // Serialization is synchronous, so the only way two lists can be live at once is a nested
    // call. The inner one must not clobber the walk the outer one is halfway through.
    let inner: Uint8Array | undefined;
    const reentrant = fakeMethod('reentrant', (_value, serializer) => {
      const nested = serializeBinaryBody('/tags', [methodFor('tags')], {tags: ['nested']}, true);
      inner = new Uint8Array(nested.view);
      nested.release();
      serializer.serString('ok');
    });

    const chain = [methodFor('tags'), reentrant];
    const {view, release} = serializeBinaryBody('/tags', chain, {tags: ['outer'], reentrant: 1}, true);
    const bytes = new Uint8Array(view);
    release();

    expect(deserializeBinaryBody('/tags', inner!, true).body.tags).toEqual(['nested']);
    // the outer envelope still carries BOTH of its own entries, in its own order
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true)).toBe(2);
  });

  it('retains no request values once the request is done', () => {
    const value = ['retained?'];
    const {release} = serializeBinaryBody('/tags', [methodFor('tags')], {tags: value}, true);
    release();
    // a second request over an EMPTY body must write nothing — if the list still held the first
    // request's method and value it would write that instead
    const second = serializeBinaryBody('/tags', [methodFor('tags')], {}, true);
    const bytes = new Uint8Array(second.view);
    second.release();
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true)).toBe(0);
  });
});
