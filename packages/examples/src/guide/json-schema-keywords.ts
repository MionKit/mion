import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema, type JsonSchemaInput} from '@ts-runtypes/core/json-schema';

// start-strings
// String keywords. All three spellings below describe the same value, so they
// resolve to the same generated function.
const emailSchema = {type: 'string', format: 'email', maxLength: 100} as const satisfies JsonSchemaInput;

type BoundedEmail = TF.Email<{maxLength: 100}>;

const isFromSchema = createValidateFn(runTypeFromJsonSchema(emailSchema));
const isFromType = createValidateFn<BoundedEmail>();
const isFromBuilder = createValidateFn(TF.email({maxLength: 100}));

isFromSchema('ada@example.com'); // true
isFromType('ada@example.com'); // true
isFromBuilder('not-an-email'); // false

// Same function, not merely the same behaviour.
getRunTypeId(runTypeFromJsonSchema(emailSchema)) === getRunTypeId<BoundedEmail>(); // true
// end-strings

// start-numbers
// Number keywords. The JSON spellings and the shorter RunTypes ones are the
// same constraint, so either is fine to write.
const scoreSchema = {type: 'number', minimum: 0, exclusiveMaximum: 1} as const satisfies JsonSchemaInput;

type Score = TF.Number<{min: 0; lt: 1}>;

const isScore = createValidateFn(runTypeFromJsonSchema(scoreSchema));
const isScoreBuilt = createValidateFn(TF.number({min: 0, lt: 1}));

isScore(0.5); // true
isScoreBuilt(1); // false, the upper bound is exclusive
getRunTypeId(runTypeFromJsonSchema(scoreSchema)) === getRunTypeId<Score>(); // true
// end-numbers

// start-objects
// Object keywords. A member left out of `required` becomes optional, and the
// count bounds ride the object's options bag.
const userSchema = {
  type: 'object',
  properties: {id: {type: 'string'}, nickname: {type: 'string'}},
  required: ['id'],
  minProperties: 1,
} as const satisfies JsonSchemaInput;

type User = TF.FormattedObject<{id: string; nickname?: string}, {minProperties: 1}>;

const isUser = createValidateFn(runTypeFromJsonSchema(userSchema));
const isUserBuilt = createValidateFn(RT.object({id: TF.string(), nickname: RT.optional(TF.string())}, {minProperties: 1}));

isUser({id: 'u1'}); // true, nickname is optional
isUserBuilt({id: 'u1', nickname: 'ada'}); // true
getRunTypeId(runTypeFromJsonSchema(userSchema)) === getRunTypeId<User>(); // true
// end-objects

// start-arrays
// Array keywords. `uniqueItems` and `contains` cannot be written as a plain
// TypeScript type, so they ride the array's options bag and the generated
// function carries the check.
const tagsSchema = {
  type: 'array',
  items: {type: 'string'},
  uniqueItems: true,
  maxItems: 5,
} as const satisfies JsonSchemaInput;

type Tags = TF.FormattedArray<string[], {uniqueItems: true; maxItems: 5}>;

const isTags = createValidateFn(runTypeFromJsonSchema(tagsSchema));
const isTagsBuilt = createValidateFn(RT.array(TF.string(), {uniqueItems: true, maxItems: 5}));

isTags(['a', 'b']); // true
isTagsBuilt(['a', 'a']); // false, the entries repeat
getRunTypeId(runTypeFromJsonSchema(tagsSchema)) === getRunTypeId<Tags>(); // true
// end-arrays
