import {getRTFunction, type InjectTypeFnArgs} from '@mionjs/run-types';

// A wrapper of your own declares the marker and forwards each handle to
// getRTFunction. You pass the same name you put in the marker, so getRTFunction
// knows the function's type.
function jsonValueCodec<T>(
  fns?: InjectTypeFnArgs<T, 'prepareForJsonClone', 'restoreFromJsonClone'>
) {
  const prepare = getRTFunction<'prepareForJsonClone'>(fns?.[0]);
  const restore = getRTFunction<'restoreFromJsonClone'>(fns?.[1]);
  return {prepare, restore};
}

type Message = {id: bigint; sentAt: Date; body: string};

// A concrete call site: the build injects both handles for Message here.
const messageCodec = jsonValueCodec<Message>();

const message: Message = {
  id: 42n,
  sentAt: new Date('2020-01-02T03:04:05.000Z'),
  body: 'hi',
};

// Your code owns the JSON.stringify and JSON.parse, so many values can share one
// envelope.
const wire = JSON.stringify(messageCodec.prepare(message));
const restored = messageCodec.restore(JSON.parse(wire));

export {jsonValueCodec, messageCodec, restored};
