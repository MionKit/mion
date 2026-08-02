// The JSON Schema suite — one group, whose cases carry the schema document
// itself. See ./JsonSchema.ts for why the literal lives on the case.

import {JSON_SCHEMA} from './JsonSchema.ts';
import type {JsonSchemaCase} from './JsonSchema.ts';

// Re-exported as the group itself, not just inside the suite object: the ajv
// competitor imports it directly so it compiles the case's OWN document.
export {JSON_SCHEMA} from './JsonSchema.ts';
export type {JsonSchemaCase} from './JsonSchema.ts';

export const JSON_SCHEMA_SUITE = {
  JSON_SCHEMA,
} as const satisfies {
  JSON_SCHEMA: Record<string, JsonSchemaCase>;
};
