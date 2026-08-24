// Temporary smoke check: the real createMockDataFn (nonDataTypes:true) wires off
// the reflection site, produces non-data values (a function for `f`), and the
// serializers drop them so the round-trip is wire-stable.
import {describe, expect} from 'vitest';
import {runIfBinary} from '../../../../ts-runtypes-devtools/test/helpers/inline.ts';
import {it} from 'vitest';
import {openClient, compileType} from './typeFuzzHarness.ts';
import type {GeneratedType} from '../core/typeGen.ts';

const objectWithMethod: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [
      {name: 'a', optional: false, readonly: false, method: false, shape: {kind: 'string'}},
      {name: 'f', optional: false, readonly: false, method: false, shape: {kind: 'function', params: [], ret: {kind: 'void'}}},
    ],
  },
};

// Date | symbol : the symbol member is DataOnly-stripped, so the mock must
// produce a Date (a surviving member), validate true, and round-trip.
const unionWithStripped: GeneratedType = {
  decls: [],
  root: {kind: 'union', members: [{kind: 'date'}, {kind: 'symbol'}]},
};

describe('nonData mock smoke', () => {
  runIfBinary(it)('union mock picks a surviving member (Date | symbol -> Date)', () => {
    const client = openClient();
    return compileType(client, unionWithStripped)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.errorDiagnostics.map((d) => d.code).join(','), 'should serialize, not fail').toBe('');
        expect(compiled.wired.mock, `wireErrors=${JSON.stringify(compiled.wireErrors)}`).toBeDefined();
        for (let i = 0; i < 20; i++) {
          const value = compiled.wired.mock!();
          expect(value instanceof Date, `mock produced non-Date: ${String(value)}`).toBe(true);
          expect(compiled.wired.validate!(value)).toBe(true);
          const enc = compiled.wired.jsonEncode!;
          const dec = compiled.wired.jsonDecode!;
          const wire1 = enc(value);
          expect(enc(dec(wire1!))).toBe(wire1);
        }
      })
      .finally(() => client.close());
  });

  runIfBinary(it)('mocks non-data values and round-trips stably', () => {
    const client = openClient();
    return compileType(client, objectWithMethod)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        // Mock wired off the reflection id.
        expect(compiled.wired.mock, `wireErrors=${JSON.stringify(compiled.wireErrors)}`).toBeDefined();
        const value = compiled.wired.mock!() as Record<string, unknown>;
        expect(typeof value).toBe('object');
        expect(typeof value.a).toBe('string');
        // nonDataTypes:true => the function-typed member is a real function.
        expect(typeof value.f).toBe('function');

        // JSON: encode drops the function, round-trip is wire-stable.
        const enc = compiled.wired.jsonEncode!;
        const dec = compiled.wired.jsonDecode!;
        const wire1 = enc(value);
        expect(wire1).toBeDefined();
        const wire2 = enc(dec(wire1!));
        expect(wire2).toBe(wire1);

        // Binary: byte-stable round-trip too.
        const benc = compiled.wired.binaryEncode!;
        const bdec = compiled.wired.binaryDecode!;
        const b1 = benc(value);
        const b2 = benc(bdec(benc(value)));
        expect([...b2]).toEqual([...b1]);
      })
      .finally(() => client.close());
  });
});
