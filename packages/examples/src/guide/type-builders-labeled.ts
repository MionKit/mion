import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';

// Wrap each element in RT.slot to name it. The result is the same type as the
// labeled tuple written by hand, so both spellings share one validator.
const pointRunType = RT.tuple([RT.slot('x', TF.number()), RT.slot('y', TF.number())]);
type Point = InferType<typeof pointRunType>; // [x: number, y: number]

const isPoint = createValidateFn(pointRunType);
const samePoint = createValidateFn<[x: number, y: number]>(); // same cached validator

// Optional and rest elements take slots too, in the same positions the plain
// arrays use. The rest slot carries its own name.
const rowRunType = RT.tuple([RT.slot('id', TF.number())], [RT.slot('note', TF.string())], RT.slot('tags', TF.string()));
type Row = InferType<typeof rowRunType>; // [id: number, note?: string, ...tags: string[]]

// RT.func accepts slots as parameters, naming each one like a written
// call signature.
const handlerRunType = RT.func([RT.slot('event', TF.string()), RT.slot('retries', TF.number())], RT.boolean());
type Handler = InferType<typeof handlerRunType>; // (event: string, retries: number) => boolean

export {isPoint, samePoint, rowRunType, handlerRunType};
export type {Point, Row, Handler};
