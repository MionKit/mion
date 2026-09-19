import {
  createPrepareForJsonFn,
  createRestoreFromJsonFn,
} from '@mionjs/run-types';

type Message = {id: bigint; sentAt: Date; body: string};

// start-value-codec
// both default to the clone strategy, which builds a new value and drops undeclared keys
const prepare = createPrepareForJsonFn<Message>();
const restore = createRestoreFromJsonFn<Message>();

const message: Message = {
  id: 42n,
  sentAt: new Date('2020-01-02T03:04:05.000Z'),
  body: 'hi',
};

const safe = prepare(message); // JSON-safe value, no string yet
const back = restore(safe); // typed shape again, bigint and Date included
// end-value-codec

export {prepare, restore, safe, back};
