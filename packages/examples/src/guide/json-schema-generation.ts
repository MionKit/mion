import {createJsonSchemaFn, createStandardSchema} from '@mionjs/run-types';

interface Order {
  id: string;
  total: bigint;
  placed: Date;
  note?: string;
}

// start-docfn
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
orderSchemaDoc({libraryOptions: {portable: true}});
// placed is now {type: 'string', format: 'date-time'} and total is
// {type: 'string', pattern: '^-?[0-9]+$'}
// end-portable

// start-closedness
// clone and direct send no extra keys, so every object with declared properties is closed
orderSchemaDoc({libraryOptions: {encoderStrategy: 'clone'}});
// {type: 'object', properties: {...}, required: [...], additionalProperties: false}

// mutate keeps extra keys, so it stays open; records keep the index schema in additionalProperties
orderSchemaDoc({libraryOptions: {encoderStrategy: 'mutate'}}); // unchanged
// end-closedness

// start-standard
const orderSchema = createStandardSchema<Order>();

orderSchema['~standard'].validate({id: 'o1'}); // {issues: [...]}
orderSchema['~standard'].jsonSchema.input(); // the same document as above
orderSchema['~standard'].jsonSchema.output({target: 'draft-2020-12'});
// end-standard
