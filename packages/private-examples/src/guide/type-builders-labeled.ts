import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

// the same type as the labeled tuple written by hand
const pointRunType = RT.tuple({
  required: [RT.slot('x', TF.number()), RT.slot('y', TF.number())],
});
type Point = InferType<typeof pointRunType>; // [x: number, y: number]

const isPoint = createValidateFn(pointRunType);
const samePoint = createValidateFn<[x: number, y: number]>(); // same cached validator

// optional and rest elements take slots too; write only the groups you need
const rowRunType = RT.tuple({
  required: [RT.slot('id', TF.number())],
  optional: [RT.slot('note', TF.string())],
  rest: RT.slot('tags', TF.string()),
});
type Row = InferType<typeof rowRunType>; // [id: number, note?: string, ...tags: string[]]

// no optional elements, so no optional group
const logRunType = RT.tuple({
  required: [RT.slot('level', TF.string())],
  rest: RT.slot('lines', TF.string()),
});
type Log = InferType<typeof logRunType>; // [level: string, ...lines: string[]]

// RT.func names its parameters the same way
const handlerRunType = RT.func({
  params: [RT.slot('event', TF.string()), RT.slot('retries', TF.number())],
  ret: RT.boolean(),
});
type Handler = InferType<typeof handlerRunType>; // (event: string, retries: number) => boolean

export {isPoint, samePoint, rowRunType, logRunType, handlerRunType};
export type {Point, Row, Log, Handler};
