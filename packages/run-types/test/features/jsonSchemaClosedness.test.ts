// The closedness stamp: `libraryOptions.encoderStrategy` derives
// `additionalProperties` from the paired JSON encoder's wire policy. A `clone` /
// `direct` pairing never emits undeclared keys, so every KEYED object node in
// the document closes with `additionalProperties: false`; `mutate` preserves
// extras and leaves the document open; `compact` writes positional arrays the
// keyed document does not describe, so it refuses. There is deliberately NO
// independent additionalProperties param — the strategy is the single source
// of the key policy, so the document can never contradict the codec.

import {describe, expect, it} from 'vitest';
import {createJsonSchemaFn, createStandardSchema} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';

interface Person {
  id: string;
  name: string;
  address: {street: string; city: string};
}

type Catalog = Record<string, number>;

interface Mixed {
  raw: object;
  person: Person;
  lookup: Catalog;
}

const CLONE = {libraryOptions: {encoderStrategy: 'clone'}} as const;

describe('jsonSchema closedness — additionalProperties derives from the encoder strategy', () => {
  it('the default document stays open (no strategy declared, no stamp)', () => {
    const doc = createJsonSchemaFn<Person>()();
    expect(doc).not.toHaveProperty('additionalProperties');
    expect((doc.properties as Record<string, unknown>).address).not.toHaveProperty('additionalProperties');
  });

  it("a 'clone' pairing closes every keyed object node, nested ones included", () => {
    const doc = createJsonSchemaFn<Person>()(CLONE);
    expect(doc.additionalProperties).toBe(false);
    const address = (doc.properties as Record<string, Record<string, unknown>>).address;
    expect(address.additionalProperties).toBe(false);
  });

  it("a 'direct' pairing closes the same way (its walk also strips undeclared keys)", () => {
    const doc = createJsonSchemaFn<Person>()({libraryOptions: {encoderStrategy: 'direct'}});
    expect(doc.additionalProperties).toBe(false);
  });

  it("a 'mutate' pairing leaves the document open (extras ride its wire)", () => {
    const doc = createJsonSchemaFn<Person>()({libraryOptions: {encoderStrategy: 'mutate'}});
    expect(doc).not.toHaveProperty('additionalProperties');
  });

  it('a record keeps its index schema — additionalProperties already carries it', () => {
    const doc = createJsonSchemaFn<Catalog>()(CLONE);
    expect(doc.additionalProperties).toEqual({type: 'number'});
  });

  it('the bare object keyword stays open — closing it would mean "no keys at all"', () => {
    const doc = createJsonSchemaFn<Mixed>()(CLONE);
    const properties = doc.properties as Record<string, Record<string, unknown>>;
    expect(properties.raw).not.toHaveProperty('additionalProperties');
    // While its keyed sibling closes and the record sibling keeps its index
    // schema — the three key policies coexist in one document.
    expect(properties.person.additionalProperties).toBe(false);
    expect(properties.lookup.additionalProperties).toEqual({type: 'number'});
  });

  it('the stamp survives the portable strip — additionalProperties is standard vocabulary', () => {
    interface Stamped {
      at: Date;
      inner: {a: string};
    }
    const doc = createJsonSchemaFn<Stamped>()({libraryOptions: {encoderStrategy: 'clone', portable: true}});
    expect(doc.additionalProperties).toBe(false);
    expect((doc.properties as Record<string, Record<string, unknown>>).inner.additionalProperties).toBe(false);
    expect(JSON.stringify(doc)).not.toContain('jsType');
  });

  it("the 'compact' wire refuses — positional arrays are not what this document describes", () => {
    expect(() => createJsonSchemaFn<Person>()({libraryOptions: {encoderStrategy: 'compact'}})).toThrow(RangeError);
  });

  it('an unknown strategy value is a RangeError, never a silent open document', () => {
    expect(() => createJsonSchemaFn<Person>()({libraryOptions: {encoderStrategy: 'strip'}})).toThrow(RangeError);
  });

  it('both converter sides of createStandardSchema honor the declaration', () => {
    const converter = createStandardSchema<Person>()['~standard'].jsonSchema;
    expect(converter.input(CLONE).additionalProperties).toBe(false);
    expect(converter.output(CLONE).additionalProperties).toBe(false);
  });

  it('static and value-first forms produce the same closed document', () => {
    const staticDoc = createJsonSchemaFn<{tags: string[]}>()(CLONE);
    const valueFirstDoc = createJsonSchemaFn(RT.object({tags: RT.array(TF.string())}))(CLONE);
    expect(valueFirstDoc).toEqual(staticDoc);
    expect(staticDoc.additionalProperties).toBe(false);
  });

  it('static and reflection forms produce the same closed document', () => {
    const staticDoc = createJsonSchemaFn<Person>()(CLONE);
    const sample: Person = {id: 'u1', name: 'Ada', address: {street: 'A', city: 'B'}};
    const reflectedDoc = createJsonSchemaFn(sample)(CLONE);
    expect(reflectedDoc).toEqual(staticDoc);
  });
});
