// The JSON Schema DOCUMENTS, in one place.
//
// This is no longer a suite: the cases themselves live inside the two suites
// that bench them, as the group `JSON_SCHEMA` in each (structural keywords in
// ../validation/JsonSchema.ts, value constraints in
// ../format-validation/JsonSchema.ts). A dedicated suite meant a dedicated page
// that asked "who can consume a document", which left every column but ajv
// reading not-supported and duplicated shapes the other groups already bench.
//
// What survives here is the merged view the DOCUMENT consumers need: ajv
// compiles the case's own bytes, and the typecost document columns read the
// same map. Keeping one import path for that is the whole reason this file
// exists — the case objects are defined next to the suites they belong to.

import {JSON_SCHEMA as STRUCTURAL} from '../validation/JsonSchema.ts';
import {JSON_SCHEMA as VALUE_CONSTRAINTS} from '../format-validation/JsonSchema.ts';

export type {JsonSchemaCase, JsonSchemaFormatCase} from '../types.ts';

/** Every JSON_SCHEMA case, both halves, keyed by case name. The two halves have
 *  disjoint names by construction (they share one `JSON_SCHEMA.<name>` key
 *  space across the two suites), so the merge is lossless. */
export const JSON_SCHEMA = {...STRUCTURAL, ...VALUE_CONSTRAINTS} as const;
