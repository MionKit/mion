import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

// Wrap each element in RT.slot to name it. The result is the same type as the
// labeled tuple written by hand, so both spellings share one validator.
const pointRunType = RT.tuple({
  required: [RT.slot('x', TF.number()), RT.slot('y', TF.number())],
});
type Point = InferType<typeof pointRunType>; // [x: number, y: number]

const isPoint = createValidateFn(pointRunType);
const samePoint = createValidateFn<[x: number, y: number]>(); // same cached validator

// Optional and rest elements take slots too. Each group is named, and you only
// write the groups you need. The rest slot carries its own name.
const rowRunType = RT.tuple({
  required: [RT.slot('id', TF.number())],
  optional: [RT.slot('note', TF.string())],
  rest: RT.slot('tags', TF.string()),
});
type Row = InferType<typeof rowRunType>; // [id: number, note?: string, ...tags: string[]]

// A tuple with a rest element but no optional elements just leaves out the
// optional group.
const logRunType = RT.tuple({
  required: [RT.slot('level', TF.string())],
  rest: RT.slot('lines', TF.string()),
});
type Log = InferType<typeof logRunType>; // [level: string, ...lines: string[]]

// RT.func names its parameters the same way, under the params group, and ret
// names the return type.
const handlerRunType = RT.func({
  params: [RT.slot('event', TF.string()), RT.slot('retries', TF.number())],
  ret: RT.boolean(),
});
type Handler = InferType<typeof handlerRunType>; // (event: string, retries: number) => boolean

export {isPoint, samePoint, rowRunType, logRunType, handlerRunType};
export type {Point, Row, Log, Handler};
