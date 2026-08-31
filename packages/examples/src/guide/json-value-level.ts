import {getRTFunction, type InjectTypeFnArgs} from '@mionjs/run-types';

type Message = {id: bigint; sentAt: Date; body: string};

// start-value-codec
// prepareForJson and restoreFromJson have no factory of their own, so you name
// the pair you want in a marker and recover the handles with getRTFunction.
// 'pjs' is the clone prepare, 'rj' the matching restore.
function jsonValueCodec<T>(fns?: InjectTypeFnArgs<T, 'pjs', 'rj'>) {
  return {
    prepare: getRTFunction<'pjs'>(fns?.[0]),
    restore: getRTFunction<'rj'>(fns?.[1]),
  };
}

// A concrete call site: the build injects both handles for Message here.
const messageCodec = jsonValueCodec<Message>();

const message: Message = {id: 42n, sentAt: new Date('2020-01-02T03:04:05.000Z'), body: 'hi'};

const safe = messageCodec.prepare(message); // JSON-safe value, no string yet
const back = messageCodec.restore(safe); // typed shape again, bigint and Date included
// end-value-codec

export {jsonValueCodec, messageCodec, safe, back};
