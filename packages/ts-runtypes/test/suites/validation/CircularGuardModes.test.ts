// validation / CircularGuard modes — the arming edge cases the per-vector
// CircularGuard cases don't cover, now that `rejectCircularRefs` is a COMPILE-TIME
// option (there is no global toggle): the default (unarmed) validator, the
// explicit `{rejectCircularRefs:false}` which is just the default, and the armed
// guard as a no-op over a non-circular type. Per the marker test-coverage rule,
// each arming assertion is paired across both `createValidateFn` call shapes —
// static `createValidateFn<T>()` and reflection `createValidateFn(value)`.
import {describe, expect, it} from 'vitest';
import {createValidateFn} from '@ts-runtypes/core';

interface Node {
  name: string;
  next?: Node;
}

function selfCycle(): Node {
  const node = {name: 'a'} as Node & {next?: Node};
  node.next = node;
  return node;
}

describe('validation / CircularGuard modes (compile-time option)', () => {
  it('per-call {rejectCircularRefs:true} arms — static form', () => {
    const isNode = createValidateFn<Node>(undefined, {rejectCircularRefs: true});
    expect(isNode(selfCycle())).toBe(false);
    expect(isNode({name: 'a', next: {name: 'b'}})).toBe(true);
  });

  it('per-call {rejectCircularRefs:true} arms — reflection form', () => {
    const inference: Node = {name: 'a'};
    const isNode = createValidateFn(inference, {rejectCircularRefs: true});
    expect(isNode(selfCycle())).toBe(false);
    expect(isNode({name: 'a', next: {name: 'b'}})).toBe(true);
  });

  it('unarmed by default — the plain validator has no cycle guard (static form)', () => {
    const isNode = createValidateFn<Node>();
    // No guard: an acyclic value validates exactly as without the feature.
    // (A cyclic value would recurse forever — that is the unguarded contract.)
    expect(isNode({name: 'a', next: {name: 'b'}})).toBe(true);
  });

  it('explicit {rejectCircularRefs:false} is just the default (reflection form)', () => {
    const inference: Node = {name: 'a'};
    const isNode = createValidateFn(inference, {rejectCircularRefs: false});
    expect(isNode({name: 'a', next: {name: 'b'}})).toBe(true);
  });

  it('armed guard is a no-op for a non-circular type — static form', () => {
    interface Plain {
      id: number;
      label: string;
    }
    const isPlain = createValidateFn<Plain>(undefined, {rejectCircularRefs: true});
    expect(isPlain({id: 1, label: 'x'})).toBe(true);
    expect(isPlain({id: 'no', label: 'x'} as unknown)).toBe(false);
  });

  it('armed guard is a no-op for a non-circular type — reflection form', () => {
    interface Plain {
      id: number;
      label: string;
    }
    const inference: Plain = {id: 1, label: 'x'};
    const isPlain = createValidateFn(inference, {rejectCircularRefs: true});
    expect(isPlain({id: 1, label: 'x'})).toBe(true);
    expect(isPlain({id: 'no', label: 'x'} as unknown)).toBe(false);
  });
});
