import {
  createValidateFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createMockDataFn,
  createStandardSchema,
} from '@ts-runtypes/core';
import {runTypeFromJsonSchema, type JsonSchemaInput} from '@ts-runtypes/core/json-schema';

// start-factories
const orderSchema = {
  type: 'object',
  properties: {
    id: {type: 'string', format: 'uuid'},
    total: {type: 'number', minimum: 0},
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {sku: {type: 'string'}, qty: {type: 'integer', minimum: 1}},
        required: ['sku', 'qty'],
      },
    },
  },
  required: ['id', 'total', 'lines'],
} as const satisfies JsonSchemaInput;

// One schema, the whole toolbelt. Every factory takes it the same way.
const isOrder = createValidateFn(runTypeFromJsonSchema(orderSchema));
const encodeOrder = createJsonEncoderFn(runTypeFromJsonSchema(orderSchema));
const decodeOrder = createJsonDecoderFn(runTypeFromJsonSchema(orderSchema));
const mockOrder = createMockDataFn(runTypeFromJsonSchema(orderSchema));
const orderStandardSchema = createStandardSchema(runTypeFromJsonSchema(orderSchema));
// end-factories

// start-usage
// Mock data respects the constraints, so a generated order passes its own
// validator, and the round-trip returns what went in.
const sample = mockOrder();

isOrder(sample); // true

const wire = encodeOrder(sample)!;
const back = decodeOrder(wire);
// end-usage

export {isOrder, encodeOrder, decodeOrder, mockOrder, orderStandardSchema, sample, back};
