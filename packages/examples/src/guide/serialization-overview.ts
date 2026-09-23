import {
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
} from '@mionjs/run-types';

interface Order {
  id: string;
  total: bigint;
  placedAt: Date;
  tags: Set<string>;
}

const order: Order = {
  id: 'o-1',
  total: 4999n,
  placedAt: new Date('2024-05-01T10:00:00.000Z'),
  tags: new Set(['gift']),
};

// start-json
const toJson = createJsonEncoderFn<Order>();
const fromJson = createJsonDecoderFn<Order>();

const json = toJson(order) as string;
// {"id":"o-1","total":"4999","placedAt":"2024-05-01T10:00:00.000Z","tags":["gift"]}

const fromJsonOrder = fromJson(json);
// total is a bigint, placedAt is a Date, tags is a Set
// end-json

// start-binary
const toBinary = createBinaryEncoderFn<Order>();
const fromBinary = createBinaryDecoderFn<Order>();

const bytes = toBinary(order); // Uint8Array
const fromBinaryOrder = fromBinary(bytes);
// end-binary

export {fromJsonOrder, fromBinaryOrder};
