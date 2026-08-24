// Tuple labels + function param names are id-relevant: same-shape types
// differing only in labels/param names are DIFFERENT canonical nodes, each
// carrying its own reliable `children[].name` / `parameters[].name` — the
// names a framework reads to expose handler param names (mion's
// `Parameters<H>` case).
//
// (Marker coverage rule: both getRunTypeId call shapes, with a convergence
// assert per shape.)

import {describe, expect, it} from 'vitest';
import {getRunType, getRunTypeId, RunTypeKind, type RunType} from '@ts-runtypes/core';

describe('tuple labels — id-relevant, per-site reliable', () => {
  it('same shape, different labels → different ids, each with its OWN label', () => {
    const nodeS = getRunType<[s: string]>();
    const nodeName = getRunType<[name: string]>();
    expect(nodeS.kind).toBe(RunTypeKind.tuple);
    expect(nodeS.id).not.toBe(nodeName.id);
    const memberS = (nodeS.children ?? [])[0] as RunType;
    const memberName = (nodeName.children ?? [])[0] as RunType;
    expect(memberS.name).toBe('s');
    expect(memberName.name).toBe('name');
  });

  it('unlabeled [string] is a third distinct node with unnamed members', () => {
    const plain = getRunType<[string]>();
    const labeled = getRunType<[s: string]>();
    expect(plain.id).not.toBe(labeled.id);
    expect(((plain.children ?? [])[0] as RunType).name).toBeUndefined();
  });

  it('(static + reflect) both call shapes converge per label variant', () => {
    const staticId = getRunTypeId<[s: string]>();
    const value: [s: string] = ['hello'];
    expect(getRunTypeId(value)).toBe(staticId);

    const otherValue: [name: string] = ['world'];
    expect(getRunTypeId(otherValue)).not.toBe(staticId);
  });
});

describe('function param names — id-relevant, per-site reliable', () => {
  it('same signature shape, different param names → different ids, own names', () => {
    const nodeA = getRunType<(a: string) => number>();
    const nodeB = getRunType<(b: string) => number>();
    expect(nodeA.id).not.toBe(nodeB.id);
    const paramA = (nodeA.parameters ?? [])[0] as RunType;
    const paramB = (nodeB.parameters ?? [])[0] as RunType;
    expect(paramA.name).toBe('a');
    expect(paramB.name).toBe('b');
  });

  it('(static + reflect) both call shapes converge for the same named signature', () => {
    const staticId = getRunTypeId<(a: string) => number>();
    const value: (a: string) => number = (a) => a.length;
    expect(getRunTypeId(value)).toBe(staticId);
  });
});
