// The public type-format metadata surface (Part B of the compiled-fn struct
// export work). `typeFormats` is the runtime table a consumer keys off to map
// a reflected prop's
// `formatAnnotation.name` to something external; `FormatName` is the union of
// those names. Everything is imported from the package barrel (`mion run-types/
// core`) so the import itself pins public reachability.
//
// Marker coverage rule: the reflection assertions exercise BOTH getRunType call
// shapes (static `getRunType<T>()` and reflection `getRunType(value)`) and assert
// they converge on the same registered node.

import {describe, it, expect} from 'vitest';
import {getRunType, typeFormats, RunTypeKind, type FormatName, type TypeFormatMeta, type RunType} from '@mionjs/run-types';
import type {UUIDv4, Email} from '@mionjs/run-types/formats';

// The value node of property `propName` on a reflected object node — the node
// that carries the format annotation. `children` are the property nodes (they
// hold `.name`); each property's value type rides its single `.child` slot.
function fieldFormatName(node: RunType, propName: string): unknown {
  const prop = (node.children ?? []).find((child) => child.name === propName);
  return prop?.child?.formatAnnotation?.name;
}

describe('typeFormats — public format-name metadata from the barrel', () => {
  it('exports the runtime const covering the built-in format names', () => {
    // Representative names across every base kind. The full set is generated
    // from the Go registry (typeFormats.generated.ts) and drift-guarded there.
    for (const name of [
      'stringFormat',
      'uuid',
      'email',
      'date',
      'dateTime',
      'nativeDate',
      'numberFormat',
      'bigintFormat',
      'temporalInstant',
    ]) {
      const meta = (typeFormats as Record<string, TypeFormatMeta>)[name];
      expect(meta, `typeFormats.${name} should exist`).toBeDefined();
      // Key === name: the const is keyed by the canonical format name.
      expect(meta.name).toBe(name);
    }
  });

  it('each entry carries the base RunTypeKind the format refines', () => {
    expect(typeFormats.uuid.kind).toBe(RunTypeKind.string);
    expect(typeFormats.stringFormat.kind).toBe(RunTypeKind.string);
    expect(typeFormats.numberFormat.kind).toBe(RunTypeKind.number);
    expect(typeFormats.bigintFormat.kind).toBe(RunTypeKind.bigint);
    expect(typeFormats.nativeDate.kind).toBe(RunTypeKind.class);
    expect(typeFormats.temporalInstant.kind).toBe(RunTypeKind.class);
  });

  it('FormatName and TypeFormatMeta are usable types from the barrel', () => {
    const name: FormatName = 'uuid';
    const meta: TypeFormatMeta = typeFormats.email;
    expect(name).toBe('uuid');
    expect(meta.name).toBe('email');
    // FormatName is exactly the set of keys.
    expect(Object.keys(typeFormats)).toContain(name);
  });

  it('(static) a reflected format field surfaces formatAnnotation.name matching typeFormats', () => {
    const node = getRunType<{id: UUIDv4; contact: Email}>();
    expect(fieldFormatName(node, 'id')).toBe(typeFormats.uuid.name);
    expect(fieldFormatName(node, 'contact')).toBe(typeFormats.email.name);
  });

  it('(reflect) infers the format from a value, matching typeFormats and the static node', () => {
    const value = {id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', contact: 'ada@example.com'} as {id: UUIDv4; contact: Email};
    const fromValue = getRunType(value);
    const fromType = getRunType<{id: UUIDv4; contact: Email}>();
    // One shared singleton per structural id — both marker shapes land on it.
    expect(fromValue).toBe(fromType);

    const uuidName = fieldFormatName(fromValue, 'id');
    const emailName = fieldFormatName(fromValue, 'contact');
    expect(uuidName).toBe('uuid');
    expect(emailName).toBe('email');
    // The runtime-stamped names are exactly typeFormats keys — the whole point.
    expect((uuidName as string) in typeFormats).toBe(true);
    expect((emailName as string) in typeFormats).toBe(true);
  });
});
