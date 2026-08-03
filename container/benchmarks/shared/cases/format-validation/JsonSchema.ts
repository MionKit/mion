// The JSON_SCHEMA group of the FORMAT-VALIDATION suite: schema keywords that
// constrain a VALUE rather than a shape — a format, a numeric range, a regex, a
// divisor. They live beside the other format groups because that is the question
// they answer (how fast is the constraint checked), and because each competitor
// states them in its own dialect exactly as it does for the FormatString and
// FormatNumber groups.
//
// The structural half of this group (closedness, key patterns, uniqueness, …)
// lives in ../validation/JsonSchema.ts. See that file's header for why the
// document sits on the case and how the competitor columns are filled.
//
// No `expectedFormatErrors` here: those describe the error payload of the
// ts-runtypes FormatString / FormatNumber types, and these cases reach the same
// constraints through the schema door instead.
import type {JsonSchemaFormatCase} from '../types.ts';

export const JSON_SCHEMA = {
  string_email: {
    title: 'String with format: email',
    description: 'The format keyword as a real constraint, not an annotation',
    schema: {type: 'string', format: 'email'},
    getSamples: () => ({
      // 'john@example.com' / 'contact@test.org' are mock output.
      valid: ['ada@example.com', 'a.b+c@sub.example.co.uk', 'john@example.com', 'contact@test.org'],
      // 'missing@tld' looks like a divergence and is NOT one: under
      // `addFormats(ajv, {mode: 'full'})` ajv requires the dotted TLD exactly as
      // our Email does (verified by running it, not by reading the source). The
      // looser regex that accepts it is ajv-formats' DEFAULT mode, unused here.
      // No competitor needs a `samples` override on this case.
      invalid: ['not-an-email', 'missing@tld', '@example.com', 'no-at-sign.example.com', 42, null, undefined],
    }),
  },
  int_bounded: {
    title: 'Integer with minimum and maximum',
    schema: {type: 'integer', minimum: 0, maximum: 130},
    getSamples: () => ({
      // 95 / 7 are mock output.
      valid: [0, 36, 130, 95, 7],
      invalid: [-1, 131, 36.5, '36', null, undefined, NaN],
    }),
  },
  string_pattern: {
    title: 'String with a pattern',
    description: 'A bare 2020-12 regex string, anchored to the empty flag set',
    schema: {type: 'string', pattern: '^[a-z][a-z0-9-]*$'},
    getSamples: () => ({
      // 'p711q' / 'm90p' are mock output — the pool the build generates from the
      // regex, so ajv proves those generated values really do match the document.
      valid: ['a', 'my-slug-42', 'p711q', 'm90p'],
      invalid: ['9lives', 'Upper', 'has space', '', 42, null],
    }),
  },
  multiple_of: {
    title: 'Number divisible by a step via multipleOf',
    schema: {type: 'number', multipleOf: 5},
    getSamples: () => ({
      valid: [0, 5, -5, 100, 2.5e1],
      invalid: [7, 2.5, -3, '5', null, undefined, NaN, Infinity],
    }),
  },
} as const satisfies Record<string, JsonSchemaFormatCase>;
