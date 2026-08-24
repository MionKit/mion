import {getRTFunction, type InjectTypeFnArgs} from '@ts-runtypes/core';

// Some functions the generated code is built from, like the per-strategy
// prepareForJson and restoreFromJson, have no createX factory of their own. You
// still reach them from a marker: name the primitive and recover the injected
// handle with getRTFunction, which turns it into the callable function for T.
// You pass the same key you named in the marker, so getRTFunction knows the
// function's type.
//
// 'pjs' is the clone prepare (a fresh JSON-safe value with undeclared keys
// dropped) and 'rj' is the matching restore. A framework that owns its own JSON
// envelope uses this pair to transform values without a string round-trip.
function jsonValueCodec<T>(fns?: InjectTypeFnArgs<T, 'pjs', 'rj'>) {
  const prepare = getRTFunction<'pjs'>(fns?.[0]);
  const restore = getRTFunction<'rj'>(fns?.[1]);
  return {prepare, restore};
}

type Message = {id: bigint; sentAt: Date; body: string};

// A concrete call site: the build injects the clone-prepare and restore handles
// for Message here.
const messageCodec = jsonValueCodec<Message>();

// prepare turns a typed value into a JSON-safe one and restore turns it back.
// The caller owns the JSON.stringify and JSON.parse, so many values can share
// one envelope with a single stringify and a single parse.
const message: Message = {id: 42n, sentAt: new Date('2020-01-02T03:04:05.000Z'), body: 'hi'};
const wire = JSON.stringify(messageCodec.prepare(message));
const restored = messageCodec.restore(JSON.parse(wire));

export {jsonValueCodec, messageCodec, restored};
