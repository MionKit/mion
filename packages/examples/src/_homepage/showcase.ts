import type * as TF from '@mionjs/run-types/formats';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createMockDataFn,
  createStandardSchema,
} from '@mionjs/run-types';

// start-type
// One real-world type, the single source of truth for everything below.
type Order = {
  id: TF.UUIDv4;
  customer: {name: string; email: TF.Email};
  items: {sku: string; qty: number; price: number}[];
  total: number;
  placedAt: Date;
  status: 'pending' | 'paid' | 'shipped';
};
// end-type

const order: Order = {
  id: '6f9619ff-8b86-d011-b42d-00cf4fc964ff' as TF.UUIDv4,
  customer: {name: 'Ada', email: 'ada@example.com' as TF.Email},
  items: [{sku: 'TS-7', qty: 1, price: 42}],
  total: 42,
  placedAt: new Date(),
  status: 'paid',
};

// start-validate
const isOrder = createValidateFn<Order>();
isOrder(order); // true

const orderErrors = createGetValidationErrorsFn<Order>();
orderErrors({...order, total: 'free'}); // [{path: ['total'], expected: 'number'}]
// end-validate

// start-binary
const toBytes = createBinaryEncoderFn<Order>();
const fromBytes = createBinaryDecoderFn<Order>();

const bytes = toBytes(order); // a Uint8Array: the compact wire, smaller than JSON
const order2 = fromBytes(bytes); // back to a typed object
// end-binary

// start-mock
const mockOrder = createMockDataFn<Order>();
const fake = mockOrder(); // a valid, randomized Order for your tests
// end-mock

// start-standard
const orderSchema = createStandardSchema<Order>();

// a Standard Schema v1 object: hand it to any tool that speaks the spec
orderSchema['~standard'].validate(order); // {value: order}
orderSchema['~standard'].validate({}); // {issues: [{message, path}, …]}
// end-standard

export {order, order2, fake, orderSchema};
