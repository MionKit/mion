// RunTypeKind / RunTypeSubKind are the public graph-dispatch constants
// (auto-generated from the Go protocol, see src/go-generated/runTypeKind.generated.ts). Both const
// maps must be reachable from the package INDEX so graph consumers can key
// builtin-class detection on subKind (`subKind === RunTypeSubKind.date`)
// instead of the false-positive-prone `typeName === 'Date'`.
// (Marker coverage rule: both getRunType call shapes, converging on one node.)

import {describe, it, expect} from 'vitest';
import {getRunType, RunTypeKind, RunTypeSubKind, type RunType} from '@ts-runtypes/core';

describe('RunTypeKind / RunTypeSubKind — public index exports', () => {
  it('exposes both const maps (kind/subKind name → numeric index) matching the Go wire values', () => {
    expect(RunTypeKind.string).toBe(5);
    expect(RunTypeKind.class).toBe(20);
    expect(RunTypeKind.objectLiteral).toBe(30);
    expect(RunTypeSubKind.none).toBe(0);
    expect(RunTypeSubKind.date).toBe(2001);
    expect(RunTypeSubKind.map).toBe(2002);
    expect(RunTypeSubKind.set).toBe(2003);
    expect(RunTypeSubKind.nonSerializable).toBe(2004);
  });

  it('(static) builtin-class detection keys on subKind, not typeName', () => {
    const node = getRunType<{when: Date}>();
    const when = (node.children ?? []).find((child) => child.name === 'when') as RunType;
    const dateNode = when.child as RunType;
    expect(dateNode.kind).toBe(RunTypeKind.class);
    expect(dateNode.subKind).toBe(RunTypeSubKind.date);
  });

  it('(reflect) infers from a value and converges on the same node as the static form', () => {
    const value = {when: new Date(0)};
    const fromValue = getRunType(value);
    const fromType = getRunType<{when: Date}>();
    expect(fromValue).toBe(fromType);
    const when = (fromValue.children ?? []).find((child) => child.name === 'when') as RunType;
    expect((when.child as RunType).subKind).toBe(RunTypeSubKind.date);
  });
});
