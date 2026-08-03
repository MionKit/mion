// contentEncoding / contentMediaType formats now have a value-first spelling:
// TF.base64() / TF.base32() / TF.base16() (JSON Schema `contentEncoding`) and
// TF.jsonContent() / TF.jsonContentBase64() (`contentMediaType:
// application/json`). Each converges on one id with the schema door it mirrors,
// and validates/mocks soundly. Marker rule: both getRunTypeId call shapes.

import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import * as TF from '@ts-runtypes/core/formats';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import '@ts-runtypes/core/formats';

describe('contentEncoding base64/32/16 formats', () => {
  it('base64 converges with the schema door and validates', () => {
    const door = getRunTypeId(runTypeFromJsonSchema({type: 'string', contentEncoding: 'base64'}));
    expect(getRunTypeId(TF.base64())).toBe(door);
    expect(getRunTypeId<TF.Base64>()).toBe(door);
    const isBase64 = createValidateFn(TF.base64());
    expect(isBase64('SGVsbG8=')).toBe(true);
    expect(isBase64('not base64!')).toBe(false);
  });

  it('base32 and base16 converge with the door', () => {
    expect(getRunTypeId(TF.base32())).toBe(getRunTypeId(runTypeFromJsonSchema({type: 'string', contentEncoding: 'base32'})));
    expect(getRunTypeId(TF.base16())).toBe(getRunTypeId(runTypeFromJsonSchema({type: 'string', contentEncoding: 'base16'})));
  });
});

describe('contentMediaType application/json (jsonContent)', () => {
  it('jsonContent converges with the door and validates JSON', () => {
    const door = getRunTypeId(runTypeFromJsonSchema({type: 'string', contentMediaType: 'application/json'}));
    expect(getRunTypeId(TF.jsonContent())).toBe(door);
    // reflection form (marker rule)
    const value: TF.JsonContent = '{}' as TF.JsonContent;
    expect(getRunTypeId(value)).toBe(door);
    const isJson = createValidateFn(TF.jsonContent());
    expect(isJson('{"a":1}')).toBe(true);
    expect(isJson('not json')).toBe(false);
  });

  it('jsonContentBase64 converges with the door (base64-then-JSON)', () => {
    const door = getRunTypeId(
      runTypeFromJsonSchema({type: 'string', contentMediaType: 'application/json', contentEncoding: 'base64'})
    );
    expect(getRunTypeId(TF.jsonContentBase64())).toBe(door);
  });
});
