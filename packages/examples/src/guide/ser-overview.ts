import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

// start-roundtrip
type Order = {id: string; total: bigint; placedAt: Date; tags: Set<string>};

const encodeOrder = createJsonEncoderFn<Order>();
const decodeOrder = createJsonDecoderFn<Order>();

const json = encodeOrder({
  id: 'o1',
  total: 4999n,
  placedAt: new Date('2026-01-01'),
  tags: new Set(['gift']),
});
const order = decodeOrder(json!); // placedAt is a Date, total a bigint, tags a Set
// end-roundtrip

export {encodeOrder, decodeOrder, order};
