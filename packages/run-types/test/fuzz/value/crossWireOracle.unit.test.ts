// Offline unit tests for O12: the clone and compact wires must decode to the same value, where a key-order-only
// difference is the same value (compact decode may rebuild keys in another order) and every real difference reports.
// Found by the nondata soak lane (seed 0x90f3baf6, type `({2}&{3}&{3})`), which reported O12 on deep-equal wires.

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

  // The negative controls: every REAL divergence still reports, or the key-order relaxation would blind the oracle.
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
