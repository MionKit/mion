// The clean, annotation-grade type a schema denotes. JsonSchemaType strips
// the internal metadata FromJsonSchema carries (format brands collapse to
// their base), which is what you want for hovers, generated documents and
// plain annotations. Never hand it back to a factory: the stripped metadata
// is exactly what the generated functions are built from.
import {runTypeFromJsonSchema, type JsonSchemaType} from '@ts-runtypes/core/json-schema';
import {createValidateFn} from '@ts-runtypes/core';

// start-clean
const schema = {
  type: 'object',
  properties: {
    email: {type: 'string', format: 'email'},
    tags: {type: 'array', items: {type: 'string'}, minItems: 1},
  },
  required: ['email', 'tags'],
} as const;

// {email: string; tags: string[]}: plain members, no internal metadata.
type Contact = JsonSchemaType<typeof schema>;

// Annotate data that arrives from elsewhere; validate through the schema.
const incoming: Contact = {email: 'ada@example.com', tags: ['math']};
const isContact = createValidateFn(runTypeFromJsonSchema(schema));
isContact(incoming); // true
// end-clean

export {incoming, isContact};
