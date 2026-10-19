// Offline unit tests for O12: clone and compact wires must decode to the same value, key order aside (compact decode
// may rebuild keys in another order). Found by the nondata soak lane flagging deep-equal wires (seed 0x90f3baf6).

import {describe, it, expect} from 'vitest';
import {checkCrossWire, type FuzzTarget} from './fuzzOracle.ts';

const ctx = {seed: 1, phase: 'valid' as const};

/** The oracle calls jsonEncode twice (the value, then the compact decode), so the second call models the compact side. **/
function targetWith(jsonWire: string | undefined, viaCompactWire: string | undefined): FuzzTarget {
  let call = 0;
  return {
    title: 'stub',
    schema: {} as never,
    mock: () => ({}),
    validate: () => true,
    getValidationErrors: () => [],
    jsonEncode: () => (call++ === 0 ? jsonWire : viaCompactWire),
    jsonDecode: (text: string) => JSON.parse(text),
    compactEncode: () => '{}',
    compactDecode: () => ({}),
  };
}

describe('O12 cross-wire — key order is not a value difference', () => {
  it('accepts wires that differ only in key order (the compact rebuild order)', () => {
    // The exact shape the nondata lane reported: `{p0?, p1}` comes back `{p1, p0}`.
    const target = targetWith('{"p0":[1,2],"p1":null}', '{"p1":null,"p0":[1,2]}');
    expect(checkCrossWire(target, {}, ctx)).toBeNull();
  });

  it('accepts nested key-order differences', () => {
    const target = targetWith('{"a":{"p0":1,"p1":2},"b":[{"x":1,"y":2}]}', '{"a":{"p1":2,"p0":1},"b":[{"y":2,"x":1}]}');
    expect(checkCrossWire(target, {}, ctx)).toBeNull();
  });

  it('accepts identical wires without needing to parse', () => {
    const target = targetWith('{"p0":1}', '{"p0":1}');
    expect(checkCrossWire(target, {}, ctx)).toBeNull();
  });

  it('stays silent on an undefined root (nothing to compare)', () => {
    const target = targetWith(undefined, '{"p0":1}');
    expect(checkCrossWire(target, undefined, ctx)).toBeNull();
  });

  // Negative controls: without them the key-order relaxation could blind the oracle.
  it('reports a differing value', () => {
    const target = targetWith('{"p0":1,"p1":null}', '{"p1":null,"p0":2}');
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });

  it('reports a dropped key', () => {
    const target = targetWith('{"p0":1,"p1":null}', '{"p1":null}');
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });

  it('reports an added key', () => {
    const target = targetWith('{"p1":null}', '{"p1":null,"p2":3}');
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });

  it('reports a reordered ARRAY (order is meaningful there)', () => {
    const target = targetWith('[1,2,3]', '[3,2,1]');
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });

  it('reports a changed scalar type (1 vs "1")', () => {
    const target = targetWith('{"p0":1}', '{"p0":"1"}');
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });

  it('reports a malformed wire rather than excusing it as unparseable', () => {
    const target = targetWith('{"p0":1}', '{"p0":');
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });

  it('reports when the compact side is missing entirely', () => {
    const target = targetWith('{"p0":1}', undefined);
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });

  it('reports when compactEncode returns undefined but the clone wire does not', () => {
    const target = {...targetWith('{"p0":1}', '{"p0":1}'), compactEncode: () => undefined};
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });
});

// Seed 3065189181 (nondata soak): the copy taken before compactEncode flattened a DataView to `{}`, which a sibling
// union member's object codec then kept on the compact wire.
describe('O12 cross-wire — the compact side gets a faithful copy of binary natives', () => {
  const BYTES = [1, 2, 3, 4, 5, 6, 7, 8];
  const filled = <Buffer extends ArrayBufferLike>(buffer: Buffer): Buffer => (new Uint8Array(buffer).set(BYTES), buffer);
  const bytesOf = (binary: ArrayBufferLike | ArrayBufferView): number[] =>
    ArrayBuffer.isView(binary)
      ? [...new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength)]
      : [...new Uint8Array(binary)];
  const binaries: Record<string, () => ArrayBufferLike | ArrayBufferView> = {
    ArrayBuffer: () => filled(new ArrayBuffer(8)),
    SharedArrayBuffer: () => filled(new SharedArrayBuffer(8)),
    DataView: () => new DataView(filled(new ArrayBuffer(8)), 2, 4),
    Uint8Array: () => new Uint8Array(BYTES),
    Float64Array: () => new Float64Array(filled(new ArrayBuffer(8))),
    BigInt64Array: () => new BigInt64Array(filled(new ArrayBuffer(8))),
  };

  function copyHandedToCompact(original: unknown): unknown {
    let seen: unknown;
    const target = {...targetWith('{}', '{}'), compactEncode: (value: unknown) => ((seen = value), '{}')};
    expect(checkCrossWire(target, {f1: original}, ctx)).toBeNull();
    return (seen as {f1: unknown}).f1;
  }

  for (const [name, make] of Object.entries(binaries)) {
    it(`hands compactEncode a ${name} with the same bytes in its own memory`, () => {
      const original = make();
      const copy = copyHandedToCompact(original) as typeof original;
      expect(Object.prototype.toString.call(copy)).toBe(Object.prototype.toString.call(original));
      expect(bytesOf(copy)).toEqual(bytesOf(original));
      if (ArrayBuffer.isView(original))
        expect([(copy as ArrayBufferView).byteOffset, (copy as ArrayBufferView).byteLength]).toEqual([
          original.byteOffset,
          original.byteLength,
        ]);
      const before = bytesOf(copy);
      new Uint8Array(ArrayBuffer.isView(original) ? original.buffer : original).fill(0);
      expect(bytesOf(copy)).toEqual(before);
    });
  }

  it('hands compactEncode the same Promise', () => {
    const promise = Promise.resolve(1);
    expect(copyHandedToCompact(promise)).toBe(promise);
  });
});
