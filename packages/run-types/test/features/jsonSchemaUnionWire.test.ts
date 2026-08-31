// Union documents describe the ENCODER'S wire — the flat-union envelope
// (`[index, value]`, object members merged under index -1) that
// createJsonEncoderFn writes and the decoder reads. These tests close the
// loop at runtime: a small structural validator interprets the emitted
// document and must ACCEPT everything the real encoder produces and REJECT
// the natural (non-envelope) spelling, for wrapped and raw unions alike.
// The document, the encoder and the decoder therefore speak one wire.

import {describe, test, expect} from 'vitest';
import {createJsonSchemaFn, createJsonEncoderFn} from '@mionjs/run-types';

// ── A tiny structural validator over the keyword subset the renderer emits ──
// (type / const / enum / properties / required / additionalProperties:false /
// prefixItems / items / minItems / anyOf / pattern / $ref). Dialect
// keywords (jsType, rtFormat, …) are annotations and are ignored, exactly as
// the standard prescribes for unknown keywords.
type Doc = Record<string, unknown>;

function docAccepts(doc: unknown, value: unknown, root: Doc): boolean {
  if (doc === null || typeof doc !== 'object') return true;
  const node = doc as Doc;
  const ref = node.$ref;
  if (typeof ref === 'string') {
    if (ref === '#') return docAccepts(root, value, root);
    const defs = root.$defs as Record<string, unknown> | undefined;
    const key = ref.replace('#/$defs/', '');
    return defs && key in defs ? docAccepts(defs[key], value, root) : true;
  }
  if (node.anyOf) return (node.anyOf as unknown[]).some((arm) => docAccepts(arm, value, root));
  if ('const' in node && JSON.stringify(node.const) !== JSON.stringify(value)) return false;
  if (node.enum && !(node.enum as unknown[]).some((entry) => JSON.stringify(entry) === JSON.stringify(value))) return false;
  const types = Array.isArray(node.type) ? (node.type as string[]) : typeof node.type === 'string' ? [node.type] : [];
  if (types.length > 0) {
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value === 'number' ? 'number' : typeof value;
    if (!types.includes(actual)) return false;
  }
  if (typeof node.pattern === 'string' && typeof value === 'string' && !new RegExp(node.pattern).test(value)) return false;
  if (Array.isArray(value)) {
    const prefix = (node.prefixItems as unknown[] | undefined) ?? [];
    if (typeof node.minItems === 'number' && value.length < node.minItems) return false;
    for (let i = 0; i < value.length; i++) {
      if (i < prefix.length) {
        if (!docAccepts(prefix[i], value[i], root)) return false;
      } else if (node.items === false) {
        return false;
      } else if (node.items !== undefined && !docAccepts(node.items, value[i], root)) {
        return false;
      }
    }
  } else if (value !== null && typeof value === 'object') {
    const properties = (node.properties as Record<string, unknown> | undefined) ?? {};
    for (const requiredKey of (node.required as string[] | undefined) ?? []) {
      if (!(requiredKey in (value as Doc))) return false;
    }
    for (const [key, child] of Object.entries(value as Doc)) {
      if (key in properties) {
        if (!docAccepts(properties[key], child, root)) return false;
      } else if (node.additionalProperties === false) {
        return false;
      } else if (node.additionalProperties !== undefined && !docAccepts(node.additionalProperties, child, root)) {
        return false;
      }
    }
  }
  return true;
}

function encodeAndCheck<T>(doc: Doc, encode: (v: T) => string | undefined, value: T): unknown {
  const wire = encode(value);
  if (wire === undefined) throw new Error('unexpected undefined wire document');
  const parsed = JSON.parse(wire) as unknown;
  expect(docAccepts(doc, parsed, doc), `document must accept the encoder's wire: ${wire}`).toBe(true);
  return parsed;
}

interface Stamp {
  at: Date | string;
}

type ShapeUnion = {kind: 'circle'; r: Date} | {kind: 'square'; n: bigint};
interface Holder {
  shape: ShapeUnion;
}

describe('union documents describe the encoder wire', () => {
  const placed = new Date('2026-02-03T04:05:06.789Z');

  test('a wrapped union document is the [index, value] envelope', () => {
    const doc = createJsonSchemaFn<Stamp>()();
    const at = (doc.properties as Record<string, Doc>).at;
    expect(at.jsType).toBe('union');
    const arms = at.anyOf as Doc[];
    expect(arms.length).toBe(2);
    for (const arm of arms) {
      expect(arm.type).toBe('array');
      expect((arm.prefixItems as Doc[])[0]).toHaveProperty('const');
      expect(arm.minItems).toBe(2);
      expect(arm.items).toBe(false);
    }
  });

  test('the encoder output validates against the document, both members', () => {
    const doc = createJsonSchemaFn<Stamp>()();
    const encode = createJsonEncoderFn<Stamp>();
    encodeAndCheck(doc, encode, {at: placed});
    encodeAndCheck(doc, encode, {at: 'plain text'});
  });

  test('the natural (non-envelope) spelling is rejected by a wrapped document', () => {
    const doc = createJsonSchemaFn<Stamp>()();
    expect(docAccepts(doc, {at: '2026-02-03T04:05:06.789Z'}, doc)).toBe(false);
    expect(docAccepts(doc, {at: 5}, doc)).toBe(false);
  });

  test('an object-member union round-trips through the [-1, merged] arm', () => {
    const doc = createJsonSchemaFn<Holder>()();
    const encode = createJsonEncoderFn<Holder>();
    const circle = encodeAndCheck(doc, encode, {shape: {kind: 'circle', r: placed}}) as {shape: [number, unknown]};
    expect(circle.shape[0]).toBe(-1);
    encodeAndCheck(doc, encode, {shape: {kind: 'square', n: 42n}});
    // The natural object (no envelope) must NOT satisfy the document.
    expect(docAccepts(doc, {shape: {kind: 'circle', r: '2026-02-03T04:05:06.789Z'}}, doc)).toBe(false);
  });

  test('a top-level wrapped union document matches the root encoder', () => {
    const doc = createJsonSchemaFn<Date | string>()();
    expect(doc.jsType).toBe('union');
    const encode = createJsonEncoderFn<Date | string>();
    encodeAndCheck(doc, encode, placed);
    encodeAndCheck(doc, encode, 'hello');
  });

  test('raw unions stay natural on the wire and in the document', () => {
    interface Toggle {
      state: 'on' | 'off';
      level: number | null;
    }
    const doc = createJsonSchemaFn<Toggle>()();
    const properties = doc.properties as Record<string, Doc>;
    expect(properties.state).toEqual({enum: ['off', 'on']});
    expect(properties.state.jsType).toBeUndefined();
    const encode = createJsonEncoderFn<Toggle>();
    encodeAndCheck(doc, encode, {state: 'on', level: null});
    encodeAndCheck(doc, encode, {state: 'off', level: 3});
  });

  test('reflection form emits the same envelope document as the static form', () => {
    const stamp: Stamp = {at: placed};
    expect(createJsonSchemaFn(stamp)()).toEqual(createJsonSchemaFn<Stamp>()());
  });

  test('bigint members wrap and their digit strings validate', () => {
    const doc = createJsonSchemaFn<bigint | boolean>()();
    expect(doc.jsType).toBe('union');
    const encode = createJsonEncoderFn<bigint | boolean>();
    encodeAndCheck(doc, encode, 485n);
    encodeAndCheck(doc, encode, true);
  });
});
