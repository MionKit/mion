/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Re-export all modules from the package.json exports field
export * from './src/types';
export * from './src/constants.functions';
export * from './src/constants.kind';
export * from './src/constants';
export * from './src/createRunType';
export * from './src/createRunTypeFunctions';
export * from './src/lib/typeId';
export * from './src/lib/dkProxy';
export * from './src/lib/baseRunTypeFormat';
export * from './src/lib/baseRunTypes';
export * from './src/lib/formats.runtype';
export * from './src/lib/formats';
export * from './src/lib/guards';
export * from './src/lib/jitFnCompiler';
export * from './src/lib/jitFnsRegistry';
export * from './src/mocking/constants.mock';
export * from './src/mocking/mockRegistry';
export * from './src/mocking/mockType';
export * from './src/mocking/mockUtils';

// TODO: decide if we want to export all nodes or not
export type * from './src/nodes/atomic/any';
export type * from './src/nodes/atomic/bigInt';
export type * from './src/nodes/atomic/boolean';
export type * from './src/nodes/atomic/date';
export type * from './src/nodes/atomic/enum';
export type * from './src/nodes/atomic/enumMember';
export type * from './src/nodes/atomic/literal';
export type * from './src/nodes/atomic/never';
export type * from './src/nodes/atomic/null';
export type * from './src/nodes/atomic/number';
export type * from './src/nodes/atomic/object';
export type * from './src/nodes/atomic/regexp';
export type * from './src/nodes/atomic/string';
export type * from './src/nodes/atomic/symbol';
export type * from './src/nodes/atomic/undefined';
export type * from './src/nodes/atomic/unknown';
export type * from './src/nodes/atomic/void';
export type * from './src/nodes/collection/class';
export type * from './src/nodes/collection/functionParams';
export type * from './src/nodes/collection/interface';
export type * from './src/nodes/collection/intersection';
export type * from './src/nodes/collection/tuple';
export type * from './src/nodes/collection/union';
export type * from './src/nodes/collection/unionDiscriminator';
export type * from './src/nodes/function/function';
export type * from './src/nodes/member/array';
export type * from './src/nodes/member/callSignature';
export type * from './src/nodes/member/genericMember';
export type * from './src/nodes/member/indexProperty';
export type * from './src/nodes/member/method';
export type * from './src/nodes/member/methodSignature';
export type * from './src/nodes/member/param';
export type * from './src/nodes/member/property';
export type * from './src/nodes/member/restParams';
export type * from './src/nodes/member/tupleMember';
export type * from './src/nodes/native/Iterable';
export type * from './src/nodes/native/map';
export type * from './src/nodes/native/nonSerializable';
export type * from './src/nodes/native/promise';
export type * from './src/nodes/native/set';
