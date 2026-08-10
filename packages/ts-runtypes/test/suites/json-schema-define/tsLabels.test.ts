// tsLabels — the RunTypes dialect keyword naming tuple slots
// (`[x: number, y: number]`). One literal per slot in order (rest slot
// included); the door lowers the list onto the `__rtLabels` sentinel, so the
// schema spelling converges with the labeled type-first tuple AND the slot
// builders on one structural id. Labels never affect validation behavior —
// only positional types are checked — but they ARE id data (`children[].name`
// must be per-site reliable). Marker rule: both getRunTypeId call shapes
// pinned.
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import {runTypeFromJsonSchema, type FromJsonSchema} from '@ts-runtypes/core/json-schema';

const LABELED_POINT = {
  type: 'array',
  prefixItems: [{type: 'number'}, {type: 'number'}],
  minItems: 2,
  items: false,
  tsLabels: ['x', 'y'],
} as const;

describe('tsLabels — labeled tuples from JSON Schema', () => {
  it('converges with the labeled type-first tuple — both getRunTypeId shapes', () => {
    // Reflect shape: the id of the type the schema value models.
    const fromSchema = getRunTypeId(runTypeFromJsonSchema(LABELED_POINT));
    // Static shape: caller supplies T.
    const fromType = getRunTypeId<[x: number, y: number]>();
    expect(fromSchema).toBe(fromType);
    // The label-less document keeps modeling the UNLABELED tuple.
    const unlabeled = getRunTypeId(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'number'}, {type: 'number'}],
        minItems: 2,
        items: false,
      } as const)
    );
    expect(unlabeled).toBe(getRunTypeId<[number, number]>());
    expect(fromSchema).not.toBe(unlabeled);
  });

  it('converges with the slot builders — all three authoring forms, one id', () => {
    const fromSchema = getRunTypeId(runTypeFromJsonSchema(LABELED_POINT));
    const fromBuilder = getRunTypeId(RT.tuple([RT.slot('x', TF.number()), RT.slot('y', TF.number())]));
    expect(fromSchema).toBe(fromBuilder);
  });

  it('covers optional slots and a labeled rest, in slot order', () => {
    const fromSchema = getRunTypeId(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'number'}, {type: 'string'}],
        minItems: 1,
        items: {type: 'boolean'},
        tsLabels: ['a', 'b', 'tail'],
      } as const)
    );
    expect(fromSchema).toBe(getRunTypeId<[a: number, b?: string, ...tail: boolean[]]>());
  });

  it('ignores a list that does not cover every slot (labels are all-or-nothing)', () => {
    const shortList = getRunTypeId(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'number'}, {type: 'number'}],
        minItems: 2,
        items: false,
        tsLabels: ['x'],
      } as const)
    );
    expect(shortList).toBe(getRunTypeId<[number, number]>());
  });

  it('never changes validation behavior — labels are names, not checks', () => {
    const labeled = createValidateFn(runTypeFromJsonSchema(LABELED_POINT));
    expect(labeled([1, 2])).toBe(true);
    expect(labeled([1])).toBe(false);
    expect(labeled([1, 2, 3])).toBe(false);
    expect(labeled(['1', 2])).toBe(false);
  });

  it('FromJsonSchema recovers the labeled tuple (assignment-equivalent)', () => {
    type Recovered = FromJsonSchema<typeof LABELED_POINT>;
    const value: [x: number, y: number] = [1, 2];
    const fromType: Recovered = value;
    const toType: [x: number, y: number] = fromType;
    expect([fromType, toType]).toBeDefined();
    // The runtype value channel recovers it too.
    const schema = runTypeFromJsonSchema(LABELED_POINT);
    type FromValue = InferType<typeof schema>;
    const roundtrip: FromValue = value;
    expect(roundtrip).toBeDefined();
  });
});
