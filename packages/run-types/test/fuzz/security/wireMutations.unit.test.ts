// Pins the byte mutators and the wire map: varints encode as the wire expects,
// splices keep the surrounding bytes, the blind set always carries every
// truncation of a short wire and the count bombs, the dictionary payloads land
// at the mapped offset, and the instrumented deserializer records the reads
// the (pre-fix twin of the) decoder makes in wire order.

import {describe, expect, it} from 'vitest';
import {encodeVarint, splice, blindWireAttacks, dictionaryWireAttacks, stringBytes} from './wireMutations.ts';
import {instrumentDeserializer} from './wireMap.ts';
import {createDataViewDeserializer} from '@mionjs/run-types';
import {stringArrayEncode} from './prefixReader.ts';
import {mulberry32} from '../core/seededRng.ts';

describe('varint + splice', () => {
  it('encodes unsigned LEB128 like the serializer', () => {
    expect([...encodeVarint(0)]).toEqual([0]);
    expect([...encodeVarint(127)]).toEqual([127]);
    expect([...encodeVarint(128)]).toEqual([0x80, 0x01]);
    expect([...encodeVarint(2 ** 31)]).toEqual([0x80, 0x80, 0x80, 0x80, 0x08]);
    expect([...encodeVarint(2 ** 32 - 1)]).toEqual([0xff, 0xff, 0xff, 0xff, 0x0f]);
  });

  it('splices in place, clamping offsets to the wire', () => {
    const wire = Uint8Array.from([1, 2, 3, 4]);
    expect([...splice(wire, 1, 2, Uint8Array.from([9]))]).toEqual([1, 9, 4]);
    expect([...splice(wire, 4, 0, Uint8Array.from([5]))]).toEqual([1, 2, 3, 4, 5]);
    expect([...splice(wire, 10, 3, Uint8Array.from([5]))]).toEqual([1, 2, 3, 4, 5]);
    expect([...splice(wire, 0, 99, new Uint8Array(0))]).toEqual([]);
  });
});

describe('blind attacks', () => {
  const wire = stringArrayEncode(['ab', 'c']);

  it('always emits every truncation of a short wire plus the count bombs', () => {
    const attacks = blindWireAttacks(wire, mulberry32(1), 8);
    const ids = attacks.map((attack) => attack.id);
    for (let end = 0; end < wire.length; end++) expect(ids).toContain(`blind.truncate@${end}`);
    expect(ids).toContain('blind.huge-varint-then-nothing');
    expect(ids).toContain('blind.max-varint-then-nothing');
  });

  it('is deterministic for one seed and never mutates the source wire', () => {
    const snapshot = [...wire];
    const a = blindWireAttacks(wire, mulberry32(7), 16).map((attack) => `${attack.id}:${[...attack.bytes].join(',')}`);
    const b = blindWireAttacks(wire, mulberry32(7), 16).map((attack) => `${attack.id}:${[...attack.bytes].join(',')}`);
    expect(a).toEqual(b);
    expect([...wire]).toEqual(snapshot);
  });
});

describe('the wire map + dictionary payloads', () => {
  it('records every top-level read of a compiled-style decode in wire order', () => {
    const wire = stringArrayEncode(['ab', 'c']);
    const des = createDataViewDeserializer('t', wire);
    const records = instrumentDeserializer(des);
    // The emitted `string[]` arm: a count, then one string per item.
    const count = des.desLength();
    for (let i = 0; i < count; i++) des.desString();
    expect(records).toEqual([
      {read: 'length', offset: 0, length: 1},
      {read: 'string', offset: 1, length: 3},
      {read: 'string', offset: 4, length: 2},
    ]);
  });

  it('records raw view reads at the offset the decoder passed', () => {
    const wire = new Uint8Array(9);
    new DataView(wire.buffer).setFloat64(1, 1.5, true);
    const des = createDataViewDeserializer('t', wire);
    const records = instrumentDeserializer(des);
    const flag = des.view.getUint8(des.index++);
    // The emitted read shape: the index advance rides in a trailing argument.
    const getFloat64 = des.view.getFloat64 as unknown as (...args: unknown[]) => number;
    const value = getFloat64.call(des.view, des.index, true, (des.index += 8));
    expect(flag).toBe(0);
    expect(value).toBe(1.5);
    expect(records).toEqual([
      {read: 'uint8', offset: 0, length: 1},
      {read: 'float64', offset: 1, length: 8},
    ]);
  });

  it('splices a count bomb exactly where the count lives', () => {
    const wire = stringArrayEncode(['ab', 'c']);
    const attacks = dictionaryWireAttacks(wire, {read: 'length', offset: 0, length: 1});
    const bomb = attacks.find((attack) => attack.id === 'count.2^31@0')!;
    expect([...bomb.bytes.subarray(0, 5)]).toEqual([...encodeVarint(2 ** 31)]);
    expect([...bomb.bytes.subarray(5)]).toEqual([...wire.subarray(1)]);
    expect(bomb.expect).toBe('reject');
  });

  it('splices a string length past the end where the string lives', () => {
    const wire = stringArrayEncode(['ab', 'c']);
    const attacks = dictionaryWireAttacks(wire, {read: 'string', offset: 1, length: 3});
    const past = attacks.find((attack) => attack.id === 'string.length-past-end@1')!;
    expect(past.bytes[0]).toBe(2);
    expect(past.bytes[1]).toBe(wire.length - 1 + 1);
    expect([...past.bytes.subarray(2)]).toEqual([...wire.subarray(2)]);
    const proto = attacks.find((attack) => attack.id === 'string.proto-key@1')!;
    expect([...proto.bytes.subarray(1, 1 + stringBytes('__proto__').length)]).toEqual([...stringBytes('__proto__')]);
  });

  it('has payloads for every reader kind', () => {
    const wire = new Uint8Array(16);
    for (const read of [
      'length',
      'string',
      'propName',
      'float64',
      'uint8',
      'uint16',
      'uint32',
      'int32',
      'enum',
      'bigint64',
      'temporal',
    ] as const) {
      expect(dictionaryWireAttacks(wire, {read, offset: 4, length: 4}).length, read).toBeGreaterThan(0);
    }
  });
});
