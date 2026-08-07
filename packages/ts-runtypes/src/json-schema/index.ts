// Public entry for the `ts-runtypes/json-schema` subpath — draft 2020-12 JSON
// Schema literals as a first-class authoring form, the THIRD form beside
// type-first (`createValidateFn<T>()`) and value-first (`RT.object({…})`):
//
//   const isUser = createValidateFn(runTypeFromJsonSchema({type: 'object', …}));
//
// `FromJsonSchema<S>` recovers the TS type a schema denotes (constraint
// keywords land in RunTypes format brands, so generated validators enforce
// them), and the recovered type converges on the SAME structural id — hence the
// same cached factory — as the hand-written type-first equivalent.
// NOT the `/schema` subpath: that name is the value-first surface.

export {runTypeFromJsonSchema} from './runTypeFromJsonSchema.ts';
export type {FromJsonSchema, JsonSchemaInput, RootJsonSchemaInput, ExactJsonSchema} from './fromJsonSchema.ts';
export type {StripRunTypeMeta} from '../runtypes/stripRunTypeMeta.ts';

import type {StripRunTypeMeta} from '../runtypes/stripRunTypeMeta.ts';
import type {FromJsonSchema} from './fromJsonSchema.ts';

/** `JsonSchemaType<typeof schema>` — the CLEAN TypeScript type a schema
 *  denotes: `FromJsonSchema` with every RunTypes sentinel stripped, so format
 *  brands collapse to their base and the slot machinery disappears from
 *  hovers and generated docs. Every spec-valid value assigns to it.
 *
 *  ⚠️ NEVER REFLECT this type: the stripped metadata IS the validation
 *  contract, so `createValidateFn<JsonSchemaType<…>>()` would validate with
 *  every constraint silently deleted. Pass the schema (or `FromJsonSchema`)
 *  to the factories; use this type for annotations only. **/
export type JsonSchemaType<S> = StripRunTypeMeta<FromJsonSchema<S>>;

// Side-effect import: schema-recovered types carry format brands (email / uuid /
// bounded numbers / …), whose emitted validators reach the `rtFormats::` pure
// fns and whose built-in patterns must be registered — the same load-bearing
// registrations the formats subpath performs for the value-first surface. The
// format MOCK fns ride the mock subtree itself (createMockData.ts), so mock
// soundness holds either way; this import is for the validator-side runtime.
import '../formats/index.ts';
