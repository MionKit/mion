// contentEncoding / contentMediaType formats have a value-first spelling:
// TF.base64() / TF.base32() / TF.base16() (JSON Schema `contentEncoding`) and
// TF.jsonContent() / TF.jsonContentBase64() (`contentMediaType:
// application/json`). Each converges on one id between the type-first and
// value-first spellings, and validates/mocks soundly. Marker rule: both
// getRunTypeId call shapes.

import {describe, expect, it} from 'vitest';
import {createMockDataFn, createValidateFn, getRunTypeId} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import '@mionjs/run-types/formats';

describe('contentEncoding base64/32/16 formats', () => {
  it('base64 type-first and value-first converge, and validates', () => {
    expect(getRunTypeId(TF.base64())).toBe(getRunTypeId<TF.Base64>());
    const isBase64 = createValidateFn(TF.base64());
    expect(isBase64('SGVsbG8=')).toBe(true);
    expect(isBase64('not base64!')).toBe(false);
  });

  it('base32 and base16 type-first and value-first converge', () => {
    expect(getRunTypeId(TF.base32())).toBe(getRunTypeId<TF.Base32>());
    expect(getRunTypeId(TF.base16())).toBe(getRunTypeId<TF.Base16>());
  });
});

describe('contentMediaType application/json (jsonContent)', () => {
  it('jsonContent type-first and value-first converge, and validates JSON', () => {
    const typeFirst = getRunTypeId<TF.JsonContent>();
    expect(getRunTypeId(TF.jsonContent())).toBe(typeFirst);
    // reflection form (marker rule)
    const value: TF.JsonContent = '{}' as TF.JsonContent;
    expect(getRunTypeId(value)).toBe(typeFirst);
    const isJson = createValidateFn(TF.jsonContent());
    expect(isJson('{"a":1}')).toBe(true);
    expect(isJson('not json')).toBe(false);
  });

  it('jsonContentBase64 type-first and value-first converge (base64-then-JSON)', () => {
    expect(getRunTypeId(TF.jsonContentBase64())).toBe(getRunTypeId<TF.JsonContentBase64>());
  });
});

// A version-agnostic UUID still mocks: the generator narrows to v4 (every v4 is
// a valid version-agnostic UUID), so the open alias produces sample data like
// any other format. Mock ⊆ valid is the invariant — the generator may be
// narrower than the validator, never wider.
describe('UUID version any — mocks are concrete even though validation is open', () => {
  it('mocks a valid UUID for the version-agnostic alias, via type and builder', () => {
    const isUuid = createValidateFn(TF.uuid());
    for (const mock of [createMockDataFn<TF.UUID>(), createMockDataFn(TF.uuid())]) {
      for (let i = 0; i < 25; i++) {
        const value = mock() as string;
        expect(isUuid(value), `mock is not a valid UUID: ${value}`).toBe(true);
        // Narrowed to v4: the version slot is concrete, not random hex.
        expect(value[14], `expected a v4 mock, got version nibble ${value[14]}`).toBe('4');
      }
    }
  });

  it('a version-pinned alias still mocks its own version', () => {
    const isV7 = createValidateFn(TF.uuidv7());
    const mockV7 = createMockDataFn(TF.uuidv7());
    for (let i = 0; i < 25; i++) {
      const value = mockV7() as string;
      expect(isV7(value)).toBe(true);
      expect(value[14]).toBe('7');
    }
  });
});

// The mock pools are the reason these formats are usable as fixtures, so they
// are held to the same bar as the validator: EVERY drawn sample must satisfy
// the format's own validator and genuinely parse. Drawing well past the pool
// size exercises the whole pool (soundness), and the "non-trivial document"
// assert is what keeps the pool from silently degrading back to `{}` / `[]`.
describe('jsonContent mock pools are sound and non-trivial', () => {
  const DRAWS = 200;

  it('every jsonContent mock validates and parses, and real documents appear', () => {
    const isJson = createValidateFn(TF.jsonContent());
    const drawn = new Set<string>();
    const mock = createMockDataFn(TF.jsonContent());
    for (let i = 0; i < DRAWS; i++) {
      const sample = mock() as string;
      drawn.add(sample);
      expect(isJson(sample), `mock sample is not valid jsonContent: ${sample}`).toBe(true);
      expect(() => JSON.parse(sample), `mock sample does not parse: ${sample}`).not.toThrow();
    }
    // Nested containers and JSON escapes are in the pool, not just scalars.
    const parsed = [...drawn].map((sample) => JSON.parse(sample) as unknown);
    expect(
      parsed.some((value) => Array.isArray(value)),
      'no array document in the pool'
    ).toBe(true);
    expect(
      parsed.some((value) => typeof value === 'object' && value !== null && Object.keys(value).length > 2),
      'no multi-key object document in the pool'
    ).toBe(true);
    expect(
      [...drawn].some((sample) => sample.includes('\\"')),
      'no escaped-quote document in the pool'
    ).toBe(true);
  });

  it('every jsonContentBase64 mock decodes to parseable JSON', () => {
    const isJsonB64 = createValidateFn(TF.jsonContentBase64());
    const mock = createMockDataFn(TF.jsonContentBase64());
    const decoded: unknown[] = [];
    for (let i = 0; i < DRAWS; i++) {
      const sample = mock() as string;
      expect(isJsonB64(sample), `mock sample is not valid jsonContentBase64: ${sample}`).toBe(true);
      const text = Buffer.from(sample, 'base64').toString('utf8');
      // Round-trip: a truncated / mis-padded sample re-encodes differently.
      expect(Buffer.from(text, 'utf8').toString('base64'), `sample is not canonical base64: ${sample}`).toBe(sample);
      decoded.push(JSON.parse(text) as unknown);
    }
    expect(
      decoded.some((value) => Array.isArray(value)),
      'no array document in the base64 pool'
    ).toBe(true);
    // Multi-byte UTF-8 survives the decode step.
    expect(
      decoded.some((value) =>
        JSON.stringify(value)
          ?.split('')
          .some((char) => char.charCodeAt(0) > 127)
      ),
      'no multi-byte document in the base64 pool'
    ).toBe(true);
  });
});
