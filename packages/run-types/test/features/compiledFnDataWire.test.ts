// CompiledFnData is public API documented as the closure-free WIRE form, which
// invites a consumer to build codecs over it — exactly what this suite does.
//
// Regression for the `defaultParamValues` drift: the Go emitter's ArgSpec says
// `args[key] = name` (a JS identifier) and `defaultParamValues[key] = default`
// (a JS-source default expression, "" for none), so BOTH tables are text and
// `CompiledFnArgs` types them as all-string correctly. The JS mirror in
// entryTuple.ts had drifted to storing real runtime values (`undefined`, `[]`,
// `{}`) behind `as unknown as CompiledFnArgs` casts, which broke the wire two
// ways at once:
//
//   1. `createValidateFn<CompiledFnData>()` rejected every real entry — the
//      required `vλl` slot held `undefined`, not a string.
//   2. `JSON.stringify` emitted `"vλl":undefined` for that required slot, i.e.
//      syntactically INVALID JSON that no receiver can parse.
//
// The call sites below register real entries across every family SHAPE
// (value-shaped, error-shaped, and the opts / binary pairs), so the assertions
// run against what the pipeline actually produces rather than a hand-authored
// literal.
import {describe, it, expect} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  getRTFnCaches,
  type CompiledFnData,
} from '@mionjs/run-types';

// Each of these registers at least one entry of a distinct family shape:
//   validate            → value-shaped  (vλl)
//   validationErrors    → error-shaped  (vλl, pλth, εrr)
//   jsonEncoder         → the prepareForJson / stringify composite chain
//   binary encode/decode → tb (vλl, sεr) and fb (vλl, dεs)
interface WireShape {
  id: number;
  name: string;
  tags: string[];
  nested: {active: boolean};
}
createValidateFn<WireShape>();
createGetValidationErrorsFn<WireShape>();
createJsonEncoderFn<WireShape>();
createBinaryEncoderFn<WireShape>();
createBinaryDecoderFn<WireShape>();

// The registered entries, as CompiledFnData (CompiledTypeFn extends it).
function registeredEntries(): CompiledFnData[] {
  return Object.values(getRTFnCaches().rtFnsCache) as unknown as CompiledFnData[];
}

describe('CompiledFnData — the public wire form round-trips', () => {
  it('registers entries across several family shapes (guards the assertions below)', () => {
    const entries = registeredEntries();
    expect(entries.length).toBeGreaterThan(0);
    // More than one distinct arg-table shape, else the sweep proves little.
    const shapes = new Set(entries.map((entry) => Object.keys(entry.args).sort().join(',')));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('every args / defaultParamValues value is a string, as CompiledFnArgs declares', () => {
    for (const entry of registeredEntries()) {
      for (const [slot, name] of Object.entries(entry.args)) {
        expect(typeof name, `args.${slot} of ${entry.rtFnHash} (${entry.familyTag})`).toBe('string');
      }
      for (const [slot, dflt] of Object.entries(entry.defaultParamValues)) {
        expect(typeof dflt, `defaultParamValues.${slot} of ${entry.rtFnHash} (${entry.familyTag})`).toBe('string');
      }
    }
  });

  // The load-bearing one: JSON-serializable with NO conversion step.
  //
  // Asserted as SLOT PRESERVATION, not `toEqual`, because both would otherwise
  // hide the bug: `JSON.stringify({vλl: undefined})` silently DROPS the key
  // (undefined-valued properties are omitted), and `toEqual` treats a missing
  // key and an undefined one as equal. So a slot that vanishes across the wire
  // is the observable failure — the receiver rebuilding a signature would be
  // missing a parameter's default entirely.
  it('every slot survives a JSON round-trip with no conversion', () => {
    for (const entry of registeredEntries()) {
      const wire = {args: entry.args, defaultParamValues: entry.defaultParamValues};
      const json = JSON.stringify(wire);
      expect(() => JSON.parse(json), `${entry.rtFnHash} (${entry.familyTag}) emitted unparseable JSON`).not.toThrow();
      const back = JSON.parse(json) as typeof wire;
      for (const table of ['args', 'defaultParamValues'] as const) {
        expect(
          Object.keys(back[table]).sort(),
          `${table} slots of ${entry.rtFnHash} (${entry.familyTag}) did not survive the wire`
        ).toEqual(Object.keys(wire[table]).sort());
        for (const slot of Object.keys(wire[table])) {
          expect(back[table][slot], `${table}.${slot} of ${entry.rtFnHash} changed across the wire`).toBe(wire[table][slot]);
        }
      }
    }
  });

  // Both slots are spliced back into a signature by a consumer rebuilding the
  // function via `new Function(...)`, so the text must actually compose:
  // `function f(v, pth=[], er=[])`. An empty default means the parameter takes
  // none at all.
  it('composes a valid function signature, which is what the text is FOR', () => {
    for (const entry of registeredEntries()) {
      const params = Object.keys(entry.args).map((slot) => {
        const name = entry.args[slot];
        const dflt = entry.defaultParamValues[slot];
        return dflt === '' ? name : `${name} = ${dflt}`;
      });
      expect(
        () => new Function(...params, 'return null;'),
        `${entry.rtFnHash} (${entry.familyTag}) produced an unparseable signature: (${params.join(', ')})`
      ).not.toThrow();
    }
  });

  // The compiled codecs the library itself generates for CompiledFnData must
  // accept the library's own entries — the test the todo says would have caught
  // this. Marker rule: both getRunTypeId call shapes are exercised by the
  // static / reflection pair below.
  it('the library validates + encodes its OWN entries [static]', () => {
    const isCompiledFnData = createValidateFn<CompiledFnData>();
    const encode = createJsonEncoderFn<CompiledFnData>();
    for (const entry of registeredEntries()) {
      const plain: CompiledFnData = {
        typeName: entry.typeName,
        fnID: entry.fnID,
        familyTag: entry.familyTag,
        rtFnHash: entry.rtFnHash,
        args: entry.args,
        defaultParamValues: entry.defaultParamValues,
      };
      expect(isCompiledFnData(plain), `validate rejected ${entry.rtFnHash} (${entry.familyTag})`).toBe(true);
      const json = JSON.stringify(encode(structuredClone(plain)));
      expect(() => JSON.parse(json), `encoded ${entry.rtFnHash} is not parseable JSON`).not.toThrow();
    }
  });

  it('the library validates its OWN entries [reflection]', () => {
    const sample = registeredEntries()[0];
    const plain: CompiledFnData = {
      typeName: sample.typeName,
      fnID: sample.fnID,
      familyTag: sample.familyTag,
      rtFnHash: sample.rtFnHash,
      args: sample.args,
      defaultParamValues: sample.defaultParamValues,
    };
    const isCompiledFnData = createValidateFn(plain);
    expect(isCompiledFnData(plain)).toBe(true);
  });
});
