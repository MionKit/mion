// The `embedType` escape hatch — the ONE typed door into a schema document for
// what pure data cannot carry: an arbitrary TS type embedded verbatim at any
// schema position. `FromJsonSchema` substitutes the carried type at the node
// (one rule, no per-feature lowering), so an embedded subtree is id-exact by
// construction. The returned VALUE is inert; only its type matters, exactly
// like the schema literal itself.
//
// Two call shapes, mirroring `getRunTypeId`:
//   embedType<MyEnum>()   — type-first: the type argument is carried directly
//   embedType(123n)       — value-first: T inferred (const) from the value

import type {EmbedSchema} from './fromJsonSchema.ts';

/** Embed a TS type at a schema position: `{items: embedType<MyEnum>()}`,
 *  `runTypeFromJsonSchema(embedType(123n))`. The value is never consulted at
 *  runtime; the Go scanner accepts the call as a compile-time leaf. **/
export function embedType<const T>(_value?: T): EmbedSchema<T> {
  return {__rtEmbed: true} as EmbedSchema<T>;
}
