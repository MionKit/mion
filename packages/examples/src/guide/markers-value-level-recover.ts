import {getRTFunction, type InjectTypeFnArgs} from '@mionjs/run-types';

function jsonValueCodec<T>(
  fns?: InjectTypeFnArgs<T, 'prepareForJsonClone', 'restoreFromJsonClone'>
) {
  // the name repeated here is what gives getRTFunction the function's type
  const prepare = getRTFunction<'prepareForJsonClone'>(fns?.[0]);
  const restore = getRTFunction<'restoreFromJsonClone'>(fns?.[1]);
  return {prepare, restore};
}

type Message = {id: bigint; sentAt: Date; body: string};

// the build injects both handles for Message at this call site
const messageCodec = jsonValueCodec<Message>();

const message: Message = {
  id: 42n,
  sentAt: new Date('2020-01-02T03:04:05.000Z'),
  body: 'hi',
};

// your code owns the JSON.stringify and JSON.parse, so many values share one envelope
const wire = JSON.stringify(messageCodec.prepare(message));
const restored = messageCodec.restore(JSON.parse(wire));

export {jsonValueCodec, messageCodec, restored};
