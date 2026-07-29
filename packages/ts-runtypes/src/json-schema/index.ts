// Public entry for the `ts-runtypes/json-schema` subpath — draft 2020-12 JSON
// Schema literals as a first-class authoring form, the THIRD form beside
// type-first (`createValidateFn<T>()`) and value-first (`RT.object({…})`):
//
//   const isUser = createValidateFn(jsonSchema({type: 'object', …}));
//
// `FromJsonSchema<S>` recovers the TS type a schema denotes (constraint
// keywords land in RunTypes format brands, so generated validators enforce
// them), and the recovered type converges on the SAME structural id — hence the
// same cached factory — as the hand-written type-first equivalent.
// NOT the `/schema` subpath: that name is the value-first surface.

export {jsonSchema} from './jsonSchema.ts';
export type {FromJsonSchema, JsonSchemaInput, ExactJsonSchema} from './fromJsonSchema.ts';

// Side-effect import: schema-recovered types carry format brands (email / uuid /
// bounded numbers / …), whose emitted validators reach the `rtFormats::` pure
// fns and whose built-in patterns must be registered — the same load-bearing
// registrations the formats subpath performs for the value-first surface. The
// format MOCK fns ride the mock subtree itself (createMockData.ts), so mock
// soundness holds either way; this import is for the validator-side runtime.
import '../formats/index.ts';
