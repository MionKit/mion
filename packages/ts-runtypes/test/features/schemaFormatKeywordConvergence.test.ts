// Every `format` keyword the JSON Schema door accepts must resolve to ONE
// structural id with its type-first spelling — and to the brand the door
// actually lowers it to, which is not always the one whose name matches:
// `email` means the full RFC 5321 grammar (EmailAddress), `hostname` may be a
// single label (Hostname, not Domain), `uri` accepts any scheme (Uri, not Url).
//
// The enumerated id-integrity suite covers 16 of the 19 rows through its case
// tables; `email`, `idn-email` and `regex` had no id-convergence case anywhere
// (docs/done/fuzz-followups.md). This file closes that gap and pins the whole
// keyword table in one place, so a remapped row fails here rather than in a
// fuzz lane that happens to draw the leaf.
//
// This is deliberately an ENUMERATION, not a fuzz property: the keyword set is
// a 19-row lookup table, so sampling it would cover less and take longer.

import {describe, expect, it} from 'vitest';
import {getRunTypeId} from '@ts-runtypes/core';
import * as TF from '@ts-runtypes/core/formats';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('every JSON Schema format keyword converges with its type-first brand', () => {
  // The three rows that had no id-convergence case before.
  it('email lowers to EmailAddress, not Email', () => {
    const typeFirst = getRunTypeId<TF.EmailAddress>();
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'email'}))).toBe(typeFirst);
    // The everyday shape is a DIFFERENT type, which is exactly why the keyword
    // needed its own case: a fuzz leaf spelled `TF.Email` can never converge.
    expect(getRunTypeId<TF.Email>()).not.toBe(typeFirst);
  });

  it('idn-email lowers to IdnEmail', () => {
    const typeFirst = getRunTypeId<TF.IdnEmail>();
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'idn-email'}))).toBe(typeFirst);
  });

  it('regex lowers to RegexString', () => {
    const typeFirst = getRunTypeId<TF.RegexString>();
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'regex'}))).toBe(typeFirst);
  });

  // The remaining rows, pinned here so the whole table lives in one place. Each
  // door call must be a LITERAL — the plugin resolves it statically from the
  // argument type, so a keyword read from a variable resolves to nothing useful.
  it('the rest of the keyword table converges', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'uuid'}))).toBe(getRunTypeId<TF.UUID>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'date'}))).toBe(getRunTypeId<TF.StringDate>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'time'}))).toBe(getRunTypeId<TF.StringTime>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'date-time'}))).toBe(getRunTypeId<TF.StringDateTime>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'hostname'}))).toBe(getRunTypeId<TF.Hostname>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'idn-hostname'}))).toBe(getRunTypeId<TF.IdnHostname>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'ipv4'}))).toBe(getRunTypeId<TF.IPv4>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'ipv6'}))).toBe(getRunTypeId<TF.IPv6>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'uri'}))).toBe(getRunTypeId<TF.Uri>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'uri-reference'}))).toBe(getRunTypeId<TF.UriReference>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'uri-template'}))).toBe(getRunTypeId<TF.UriTemplate>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'iri'}))).toBe(getRunTypeId<TF.Iri>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'iri-reference'}))).toBe(getRunTypeId<TF.IriReference>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'duration'}))).toBe(getRunTypeId<TF.StringDuration>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'json-pointer'}))).toBe(getRunTypeId<TF.JsonPointer>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'relative-json-pointer'}))).toBe(
      getRunTypeId<TF.RelativeJsonPointer>()
    );
  });

  // The two rows whose brand name deliberately differs from the keyword —
  // pinned as NEGATIVE cases so a "helpful" remap to the same-named brand fails.
  it('hostname is not Domain, and uri is not Url', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'hostname'}))).not.toBe(getRunTypeId<TF.Domain>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'uri'}))).not.toBe(getRunTypeId<TF.Url>());
  });

  // Marker coverage rule: both call shapes agree on a keyword-lowered brand.
  it('resolves the same id from the static and reflection call shapes', () => {
    const staticId = getRunTypeId<TF.EmailAddress>();
    const value: TF.EmailAddress = 'ada@example.com' as TF.EmailAddress;
    expect(getRunTypeId(value)).toBe(staticId);
  });
});
