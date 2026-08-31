import type * as TF from '@mionjs/run-types/formats';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createMockDataFn,
} from '@mionjs/run-types';

// One real-world type, the single source of truth every suite + benchmark
// below is generated from. A handful of formats (uuid, email), a Date, a
// string-literal union and a nested array, exactly the shape you'd put on a
// wire in a real app.
type User = {
  id: TF.UUIDv4;
  name: string;
  email: TF.Email;
};

type Order = {
  id: TF.UUIDv4;
  customer: User;
  items: {sku: string; qty: number; price: number}[];
  total: number;
  placedAt: Date;
  status: 'pending' | 'paid' | 'shipped' | 'cancelled';
};

const order: Order = {
  id: '6f9619ff-8b86-d011-b42d-00cf4fc964ff' as TF.UUIDv4,
  customer: {
    id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as TF.UUIDv4,
    name: 'Ada Lovelace',
    email: 'ada@example.com' as TF.Email,
  },
  items: [
    {sku: 'TS-7', qty: 1, price: 42},
    {sku: 'GO-1', qty: 3, price: 12},
  ],
  total: 78,
  placedAt: new Date(),
  status: 'paid',
};

// Validate: fast yes/no, plus a detailed error report when you need it.
const isOrder = createValidateFn<Order>();
isOrder(order); // true

const orderErrors = createGetValidationErrorsFn<Order>();
orderErrors({...order, total: 'free'}); // [{path: ['total'], expected: 'number'}]

// JSON that round-trips: Date survives the trip, typed as DataOnly<Order>.
const toJson = createJsonEncoderFn<Order>();
const fromJson = createJsonDecoderFn<Order>();

const wire = toJson(order)!; // Date -> string, ready for the network
const back = fromJson(wire); // string -> Date again

// Binary: the same type, a compact buffer instead of JSON.
const toBytes = createBinaryEncoderFn<Order>();
const fromBytes = createBinaryDecoderFn<Order>();

const bytes = toBytes(order); // a Uint8Array; smaller than JSON
const order2 = fromBytes(bytes); // back to a typed object

// Mock: believable, valid, randomized data for your tests and fixtures.
const mockOrder = createMockDataFn<Order>();
const fake = mockOrder(); // a valid, randomized Order

export {order, back, order2, fake};
