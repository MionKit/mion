// Offline unit tests for the O12 cross-wire oracle's comparison rule.
//
// O12 asks whether the JSON and binary wires agree on the same DataOnly VALUE.
// It normalises both sides through jsonEncode, and textual equality is its fast
// path — but the two wires do not share a key order. The binary layout splits an
// object's properties into required-then-optional (the presence bitmap depends
// on that split), so binaryDecode rebuilds in layout order while jsonEncode
// emits declaration order. A type declaring an optional before a required
// property round-trips to the same value with the keys spelled in a different
// order, which is by design.
//
// This pins both halves of that rule: a key-order-only difference is NOT a
// violation, and every real value difference still is. Found by the nondata
// soak lane (seed 0x90f3baf6, type `({2}&{3}&{3})`), which reported O12 on an
// interface declaring `p0?` before `p1` — the wires were deep-equal.

import {describe, it, expect} from 'vitest';
import {checkCrossWire, type FuzzTarget} from './fuzzOracle.ts';

const ctx = {seed: 1, phase: 'valid' as const};

/** A target whose wires are whatever the two encoders are told to return. The
 *  oracle only ever calls jsonEncode / binaryEncode / binaryDecode, so the
 *  binary pair is modelled as "the value jsonEncode sees the second time". **/
function targetWith(jsonWire: string | undefined, viaBinaryWire: string | undefined): FuzzTarget {
  let call = 0;
  return {
    title: 'stub',
    schema: {} as never,
    mock: () => ({}),
    validate: () => true,
    getValidationErrors: () => [],
    jsonEncode: () => (call++ === 0 ? jsonWire : viaBinaryWire),
    jsonDecode: (text: string) => JSON.parse(text),
    binaryEncode: () => new Uint8Array(),
    binaryDecode: () => ({}),
  };
}

describe('O12 cross-wire — key order is not a value difference', () => {
  it('accepts wires that differ only in key order (the binary layout split)', () => {
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

  // The negative controls: everything that is a REAL divergence still reports,
  // otherwise the relaxation above would have blinded the oracle.
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

  it('stays silent when the binary side is missing entirely', () => {
    const target = targetWith('{"p0":1}', undefined);
    // undefined via-binary is a real divergence, not a key-order artefact.
    expect(checkCrossWire(target, {}, ctx)?.oracle).toBe('O12');
  });
});
