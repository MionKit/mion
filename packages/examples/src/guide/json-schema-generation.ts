import {createJsonSchemaFn, createStandardSchema} from '@mionjs/run-types';

interface Order {
  id: string;
  total: bigint;
  placed: Date;
  note?: string;
}

// start-docfn
// createJsonSchemaFn -> a function that returns the JSON Schema document
// describing T. The document is generated at build time; calling it costs
// nothing at runtime.
const orderSchemaDoc = createJsonSchemaFn<Order>();

orderSchemaDoc();
// {
//   type: 'object',
//   properties: {
//     id: {type: 'string'},
//     total: {type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'},
//     placed: {type: 'string', format: 'date-time', jsType: 'Date'},
//     note: {type: 'string'},
//   },
//   required: ['id', 'total', 'placed'],
// }
// end-docfn

// start-portable
// {portable: true} strips the extension keywords, leaving plain draft
// 2020-12 any tool can consume.
orderSchemaDoc({libraryOptions: {portable: true}});
// placed is now {type: 'string', format: 'date-time'} and total is
// {type: 'string', pattern: '^-?[0-9]+$'}: only standard keywords survive.
// end-portable

// start-closedness
// Declaring the paired encoder strategy closes the document to the keys the
// wire can actually carry: clone and direct never emit undeclared keys, so
// every object with declared properties gains additionalProperties: false.
orderSchemaDoc({libraryOptions: {encoderStrategy: 'clone'}});
// {type: 'object', properties: {...}, required: [...], additionalProperties: false}

// A mutate pairing preserves extra keys on the wire, so its document stays
// open; records keep the index schema additionalProperties already carries.
orderSchemaDoc({libraryOptions: {encoderStrategy: 'mutate'}}); // unchanged
// end-closedness

// start-standard
// createStandardSchema returns ONE object implementing both standard
// interfaces: validation (validate) and JSON Schema conversion (jsonSchema).
const orderSchema = createStandardSchema<Order>();

orderSchema['~standard'].validate({id: 'o1'}); // {issues: [...]}
orderSchema['~standard'].jsonSchema.input(); // the same document as above
orderSchema['~standard'].jsonSchema.output({target: 'draft-2020-12'});
// end-standard
