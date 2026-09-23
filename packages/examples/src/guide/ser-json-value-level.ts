import {
  createPrepareForJsonFn,
  createRestoreFromJsonFn,
} from '@mionjs/run-types';

// start-value-level
type Item = {id: bigint; at: Date};

const prepareItem = createPrepareForJsonFn<Item>();
const restoreItem = createRestoreFromJsonFn<Item>();

// one JSON.stringify for your own envelope
const text = JSON.stringify({
  ok: true,
  items: [prepareItem({id: 1n, at: new Date(0)})],
});

const envelope = JSON.parse(text);
const first = restoreItem(envelope.items[0]); // id is a bigint, at a Date
// end-value-level

export {first};
