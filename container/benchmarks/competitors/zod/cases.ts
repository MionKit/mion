import {z} from 'zod';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

// RunTypes' plain-object guard: an all-optional object (and every index-signature node) accepts only an ordinary
// object. z.object alone only excludes arrays and null and a `.refine` sees the PARSED copy, so the guard is a z.custom
// on the INPUT, keys asserted in place by `.check(z.properties(...))` (no output copy, unlike a pipe into z.object).
// z.record already carries the guard (isPlainObject).
//
// Hooks (z.custom, .refine, .superRefine) sit only at the leaf that needs them, where no zod feature does the same
// check; each one makes zod re-run its runtime parser on an invalid sample, the library's own cost.
//
// Each thunk is self-contained and copy-paste runnable (shared sub-schemas inlined).
// `z.compile` returns a schema with a reference cycle (the circular cases) uncompiled: those run zod's regular parser.

// One entry per shared case key, in authoritative order.
export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': {
    build: () => {
      const schema = z.any();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.any();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.bigint': {
    build: () => {
      const schema = z.bigint();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.boolean': {
    build: () => {
      const schema = z.boolean();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.boolean();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.date': {
    build: () => {
      const schema = z.date();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.date();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // enum_mixed: z.enum on the member object; getEnumValues keeps the values 0, 'green', 2 (names and reverse keys rejected)
  'ATOMIC.enum_mixed': {
    build: () => {
      const schema = z.enum({Red: 0, Green: 'green', Blue: 2});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.enum({Red: 0, Green: 'green', Blue: 2});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.literal_2': {
    build: () => {
      const schema = z.literal(2);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.literal(2);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.literal_a': {
    build: () => {
      const schema = z.literal('a');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.literal('a');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.literal_true': {
    build: () => {
      const schema = z.literal(true);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.literal(true);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.literal_1n': {
    build: () => {
      const schema = z.literal(1n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.literal(1n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // literal_symbol: match any symbol whose description === 'hello'
  'ATOMIC.literal_symbol': {
    build: () => {
      const schema = z.custom((value) => typeof value === 'symbol' && value.description === 'hello');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.custom((value) => typeof value === 'symbol' && value.description === 'hello');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.never': {
    build: () => {
      const schema = z.never();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.never();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.null': {
    build: () => {
      const schema = z.null();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.null();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.number': {
    build: () => {
      const schema = z.number();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // object: any non-null non-primitive (arrays, Date, regex all pass; null rejected)
  'ATOMIC.object': {
    build: () => {
      const schema = z.custom((value) => typeof value === 'object' && value !== null);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.custom((value) => typeof value === 'object' && value !== null);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.regexp': {
    build: () => {
      const schema = z.instanceof(RegExp);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(RegExp);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.string': {
    build: () => {
      const schema = z.string();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.symbol': NOT_SUPPORTED, // no shared samples (factoryThrows): nothing to check
  'ATOMIC.undefined': {
    build: () => {
      const schema = z.undefined();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.undefined();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.void': {
    build: () => {
      const schema = z.void();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.void();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ATOMIC.unknown': {
    build: () => {
      const schema = z.unknown();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.unknown();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── ARRAY ──
  'ARRAY.string_array': {
    build: () => {
      const schema = z.array(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.number_array': {
    build: () => {
      const schema = z.array(z.number());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.number());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.boolean_array': {
    build: () => {
      const schema = z.array(z.boolean());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.boolean());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.bigint_array': {
    build: () => {
      const schema = z.array(z.bigint());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.bigint());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.date_array': {
    build: () => {
      const schema = z.array(z.date());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.date());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.regexp_array': {
    build: () => {
      const schema = z.array(z.instanceof(RegExp));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.instanceof(RegExp));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.undefined_array': {
    build: () => {
      const schema = z.array(z.undefined());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.undefined());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.null_array': {
    build: () => {
      const schema = z.array(z.null());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.null());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.array_generic': {
    build: () => {
      const schema = z.array(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.string_array_2d': {
    build: () => {
      const schema = z.array(z.array(z.string()));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.array(z.string()));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.string_array_3d': {
    build: () => {
      const schema = z.array(z.array(z.array(z.string())));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.array(z.array(z.string())));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.object_array': {
    build: () => {
      const schema = z.array(z.object({a: z.string()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.object({a: z.string()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.union_array': {
    build: () => {
      const schema = z.array(z.union([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.union([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.tuple_array': {
    build: () => {
      const schema = z.array(z.tuple([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.tuple([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.circular_array': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.array(z.lazy(() => schema));
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.array(z.lazy(() => schema));
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.circular_object_with_array': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          a: z.string(),
          deep: z.object({b: z.string(), c: z.number()}).optional(),
          d: z.array(z.lazy(() => schema)).optional(),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          a: z.string(),
          deep: z.object({b: z.string(), c: z.number()}).optional(),
          d: z.array(z.lazy(() => schema)).optional(),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // no shared samples (factoryThrows): nothing to check
  'ARRAY.readonly_string_array': {
    build: () => {
      const schema = z.array(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    build: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.object_as_const_literals': {
    build: () => {
      const schema = z.object({name: z.literal('john'), age: z.literal(30)});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({name: z.literal('john'), age: z.literal(30)});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.object_via_return_type_utility': {
    build: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.object_via_property_access': {
    build: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.object_via_array_access': {
    build: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.interface_with_optional': {
    build: () => {
      const schema = z.object({a: z.string(), b: z.number().optional()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number().optional()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.interface_with_date': {
    build: () => {
      const schema = z.object({date: z.date(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({date: z.date(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.interface_with_method': {
    build: () => {
      const schema = z.object({name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.nested_object': {
    build: () => {
      const schema = z.object({a: z.string(), deep: z.object({b: z.string(), c: z.number()})});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.string(), deep: z.object({b: z.string(), c: z.number()})});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.interface_string_array_prop': {
    build: () => {
      const schema = z.object({tags: z.array(z.string())});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({tags: z.array(z.string())});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.circular_interface': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({name: z.string(), child: z.lazy(() => schema).optional()});
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({name: z.string(), child: z.lazy(() => schema).optional()});
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.circular_interface_on_array': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({name: z.string(), children: z.array(z.lazy(() => schema)).optional()});
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({name: z.string(), children: z.array(z.lazy(() => schema)).optional()});
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.circular_interface_on_nested_object': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          name: z.string(),
          embedded: z.object({hello: z.string(), child: z.lazy(() => schema).optional()}),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          name: z.string(),
          embedded: z.object({hello: z.string(), child: z.lazy(() => schema).optional()}),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.index_signature_string': {
    build: () => {
      const schema = z.record(z.string(), z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.string(), z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // index_signature_named_props: the record is the index signature (plain-object guard + every value string | number);
  // z.properties makes the named a / b required with their own types.
  'OBJECT.index_signature_named_props': {
    build: () => {
      const schema = z.record(z.string(), z.union([z.string(), z.number()])).check(z.properties({a: z.string(), b: z.number()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.string(), z.union([z.string(), z.number()])).check(z.properties({a: z.string(), b: z.number()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.index_signature_nested': {
    build: () => {
      const schema = z.record(z.string(), z.record(z.string(), z.number()));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.string(), z.record(z.string(), z.number()));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.index_signature_date_value': {
    build: () => {
      const schema = z.record(z.string(), z.record(z.string(), z.date()));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.string(), z.record(z.string(), z.date()));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // index_signature_non_root: {b: string; c: {a: string; [k: string]: string}}. The record is the index
  // signature (plain-object guard + every value a string); z.properties makes the named `a` required.
  'OBJECT.index_signature_non_root': {
    build: () => {
      const schema = z.object({b: z.string(), c: z.record(z.string(), z.string()).check(z.properties({a: z.string()}))});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({b: z.string(), c: z.record(z.string(), z.string()).check(z.properties({a: z.string()}))});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // function_top_level: any function (class counts too); z.function() only validates arity; use custom
  'OBJECT.function_top_level': {
    build: () => {
      const schema = z.custom((value) => typeof value === 'function');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.custom((value) => typeof value === 'function');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // interface_callable: function with extra prop — typeof function AND extra prop is string
  'OBJECT.interface_callable': {
    build: () => {
      const schema = z.custom((value) => typeof value === 'function' && typeof (value as {extra?: unknown}).extra === 'string');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.custom((value) => typeof value === 'function' && typeof (value as {extra?: unknown}).extra === 'string');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // interface_all_optional: {a?:string, b?:number} behind RunTypes' plain-object guard (see the file header).
  'OBJECT.interface_all_optional': {
    build: () => {
      const schema = z
        .custom<{a?: string; b?: number}>((value) => Object.prototype.toString.call(value) === '[object Object]')
        .check(z.properties({a: z.string().optional(), b: z.number().optional()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .custom<{a?: string; b?: number}>((value) => Object.prototype.toString.call(value) === '[object Object]')
        .check(z.properties({a: z.string().optional(), b: z.number().optional()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // class_simple: class with date+name props (method skipped); same as object with date+name
  'OBJECT.class_simple': {
    build: () => {
      const schema = z.object({date: z.date(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({date: z.date(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // rpc_error_class: brand discriminator with special char key 'mion@isΣrrθr'
  'OBJECT.rpc_error_class': {
    build: () => {
      const schema = z.object({
        'mion@isΣrrθr': z.literal(true),
        type: z.literal('test-error'),
        publicMessage: z.string(),
        id: z.string().optional(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        'mion@isΣrrθr': z.literal(true),
        type: z.literal('test-error'),
        publicMessage: z.string(),
        id: z.string().optional(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // call_signature_params: [number, boolean] tuple, excess args rejected
  'OBJECT.call_signature_params': {
    build: () => {
      const schema = z.tuple([z.number(), z.boolean()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.number(), z.boolean()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // call_signature_params_with_optional: [number, boolean, string?]
  'OBJECT.call_signature_params_with_optional': {
    build: () => {
      const schema = z.tuple([z.number(), z.boolean(), z.string().optional()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.number(), z.boolean(), z.string().optional()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // call_signature_params_with_rest: [number, boolean, ...Date[]]
  'OBJECT.call_signature_params_with_rest': {
    build: () => {
      const schema = z.tuple([z.number(), z.boolean()]).rest(z.date());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.number(), z.boolean()]).rest(z.date());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.record_union_keys': {
    build: () => {
      const schema = z.object({a: z.number(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.number(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.union_value_index': {
    build: () => {
      const schema = z.record(z.string(), z.union([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.string(), z.union([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'OBJECT.object_with_union_prop': {
    build: () => {
      const schema = z.object({kind: z.enum(['a', 'b']), n: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({kind: z.enum(['a', 'b']), n: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // interface_inheritance: merged props {a: string, b: number}
  'OBJECT.interface_inheritance': {
    build: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // class_inheritance: merged props {a: string, b: number}
  'OBJECT.class_inheritance': {
    build: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // index_signature_number_key: normalised to string-key record at runtime
  'OBJECT.index_signature_number_key': {
    build: () => {
      const schema = z.record(z.string(), z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.string(), z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    build: () => {
      const schema = z.tuple([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'TUPLE.full_mion_tuple': {
    build: () => {
      const schema = z.tuple([z.date(), z.number(), z.string(), z.null(), z.array(z.string()), z.bigint()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.date(), z.number(), z.string(), z.null(), z.array(z.string()), z.bigint()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // tuple_with_optional: [number, bigint?, boolean?, number?] — same shape as
  // tuple_multiple_trailing_optionals; z.tuple with trailing .optional() slots accepts explicit
  // undefined in the middle and rejects excess args.
  'TUPLE.tuple_with_optional': {
    build: () => {
      const schema = z.tuple([
        z.number(),
        z.bigint().optional(),
        z.boolean().optional(),
        z.number().optional(),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([
        z.number(),
        z.bigint().optional(),
        z.boolean().optional(),
        z.number().optional(),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'TUPLE.nested_tuple_in_array': {
    build: () => {
      const schema = z.array(z.tuple([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.tuple([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'TUPLE.tuple_rest': {
    build: () => {
      const schema = z.tuple([z.number()]).rest(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.number()]).rest(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // tuple_circular: self-referential tuple — [Date, number, string, null, string[], bigint] with an
  // optional 7th slot that is the tuple itself; a lazy z.tuple with a trailing optional self-ref slot.
  'TUPLE.tuple_circular': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.tuple([
          z.date(),
          z.number(),
          z.string(),
          z.null(),
          z.array(z.string()),
          z.bigint(),
          z.lazy(() => schema).optional(),
        ]);
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.tuple([
          z.date(),
          z.number(),
          z.string(),
          z.null(),
          z.array(z.string()),
          z.bigint(),
          z.lazy(() => schema).optional(),
        ]);
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // tuple_multiple_trailing_optionals: [number, bigint?, boolean?, number?]
  'TUPLE.tuple_multiple_trailing_optionals': {
    build: () => {
      const schema = z.tuple([
        z.number(),
        z.bigint().optional(),
        z.boolean().optional(),
        z.number().optional(),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([
        z.number(),
        z.bigint().optional(),
        z.boolean().optional(),
        z.number().optional(),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'TUPLE.tuple_named_labels': {
    build: () => {
      const schema = z.tuple([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // tuple_with_non_serializable: function slot must be undefined — z.tuple with undefined at slot 1
  'TUPLE.tuple_with_non_serializable': {
    build: () => {
      const schema = z.tuple([z.number(), z.undefined().optional()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.number(), z.undefined().optional()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'TUPLE.empty_tuple': {
    build: () => {
      const schema = z.tuple([]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'TUPLE.single_element_tuple': {
    build: () => {
      const schema = z.tuple([z.string()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.string()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'TUPLE.readonly_tuple': {
    build: () => {
      const schema = z.tuple([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.tuple([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── UNION ──
  'UNION.atomic_union': {
    build: () => {
      const schema = z.union([z.date(), z.number(), z.string(), z.null(), z.bigint()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.date(), z.number(), z.string(), z.null(), z.bigint()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.string_literal_union': {
    build: () => {
      const schema = z.enum(['UNO', 'DOS', 'TRES']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.enum(['UNO', 'DOS', 'TRES']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // large_union_eight_arms: 8 arms — use z.union with all members
  'UNION.large_union_eight_arms': {
    build: () => {
      const schema = z.union([
        z.literal('a'),
        z.literal('b'),
        z.number(),
        z.boolean(),
        z.null(),
        z.object({a: z.string()}),
        z.object({a: z.string(), b: z.number()}),
        z.object({c: z.bigint()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.literal('a'),
        z.literal('b'),
        z.number(),
        z.boolean(),
        z.null(),
        z.object({a: z.string()}),
        z.object({a: z.string(), b: z.number()}),
        z.object({c: z.bigint()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.string_or_number': {
    build: () => {
      const schema = z.union([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.union_of_array_types': {
    build: () => {
      const schema = z.union([z.array(z.string()), z.array(z.number()), z.array(z.boolean())]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.array(z.string()), z.array(z.number()), z.array(z.boolean())]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.array_of_union': {
    build: () => {
      const schema = z.array(z.union([z.string(), z.bigint(), z.boolean(), z.date()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.union([z.string(), z.bigint(), z.boolean(), z.date()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.union_of_object_shapes': {
    build: () => {
      const schema = z.union([
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.object({c: z.bigint()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.object({c: z.bigint()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // discriminated_union: literal 'kind' discriminator — zod 4's z.discriminatedUnion dispatches on it
  'UNION.discriminated_union': {
    build: () => {
      const schema = z.discriminatedUnion('kind', [
        z.object({kind: z.literal('a'), n: z.number()}),
        z.object({kind: z.literal('b'), s: z.string()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.discriminatedUnion('kind', [
        z.object({kind: z.literal('a'), n: z.number()}),
        z.object({kind: z.literal('b'), s: z.string()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // circular_union: Date | number | string | {a?: U; b?: string} | U[]; the all-optional object arm gets mion's
  // plain-object guard + weak-type guard (a known key present, or no key at all) on the input, then z.properties.
  'UNION.circular_union': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.union([
          z.date(),
          z.number(),
          z.string(),
          z
            .custom<{a?: unknown; b?: string}>(
              (value) =>
                Object.prototype.toString.call(value) === '[object Object]' &&
                ('a' in (value as object) || 'b' in (value as object) || Object.keys(value as object).length === 0)
            )
            .check(z.properties({a: z.lazy(() => schema).optional(), b: z.string().optional()})),
          z.array(z.lazy(() => schema)),
        ]);
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.union([
          z.date(),
          z.number(),
          z.string(),
          z
            .custom<{a?: unknown; b?: string}>(
              (value) =>
                Object.prototype.toString.call(value) === '[object Object]' &&
                ('a' in (value as object) || 'b' in (value as object) || Object.keys(value as object).length === 0)
            )
            .check(z.properties({a: z.lazy(() => schema).optional(), b: z.string().optional()})),
          z.array(z.lazy(() => schema)),
        ]);
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // union_with_methods: method props skipped — validate only data props
  'UNION.union_with_methods': {
    build: () => {
      const schema = z.union([z.object({name: z.string()}), z.object({age: z.number()})]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.object({name: z.string()}), z.object({age: z.number()})]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.intersection_to_object': {
    build: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // union_with_index_arm: third arm {c: bigint; [k: string]: bigint} is a record (plain-object guard) + z.properties for c
  'UNION.union_with_index_arm': {
    build: () => {
      const schema = z.union([
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.bigint()).check(z.properties({c: z.bigint()})),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.bigint()).check(z.properties({c: z.bigint()})),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // union_same_prop_different_types: 'type' literal discriminator with arm-dependent 'prop' value
  'UNION.union_same_prop_different_types': {
    build: () => {
      const schema = z.discriminatedUnion('type', [
        z.object({type: z.literal('a'), prop: z.boolean()}),
        z.object({type: z.literal('b'), prop: z.number()}),
        z.object({type: z.literal('c'), prop: z.string()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.discriminatedUnion('type', [
        z.object({type: z.literal('a'), prop: z.boolean()}),
        z.object({type: z.literal('b'), prop: z.number()}),
        z.object({type: z.literal('c'), prop: z.string()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // union_mixed_arrays_and_objects: arrays and objects in same union; last arm's `aa` is the literal 'string' (as mion)
  'UNION.union_mixed_arrays_and_objects': {
    build: () => {
      const schema = z.union([
        z.array(z.string()),
        z.array(z.number()),
        z.array(z.boolean()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.object({c: z.bigint(), aa: z.literal('string')}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.array(z.string()),
        z.array(z.number()),
        z.array(z.boolean()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.object({c: z.bigint(), aa: z.literal('string')}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.union_merged_property': {
    build: () => {
      const schema = z.union([z.object({a: z.boolean()}), z.object({a: z.number()})]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.object({a: z.boolean()}), z.object({a: z.number()})]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // union_mixed_with_index: string[] | {a,aa} | {b:number} | {a:string;[k]:string} | {[k]:bigint;b:bigint}; each index arm
  // is a record (plain-object guard) + z.properties for its named key
  'UNION.union_mixed_with_index': {
    build: () => {
      const schema = z.union([
        z.array(z.string()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.string()).check(z.properties({a: z.string()})),
        z.record(z.string(), z.bigint()).check(z.properties({b: z.bigint()})),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.array(z.string()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.string()).check(z.properties({a: z.string()})),
        z.record(z.string(), z.bigint()).check(z.properties({b: z.bigint()})),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.union_with_any_fallback': {
    build: () => {
      const schema = z.any();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.any();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UNION.union_with_unknown_fallback': {
    build: () => {
      const schema = z.unknown();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.unknown();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // union_subset_small_first: {a} before {a,b} — structurally, {a} arm matches both; both valid
  'UNION.union_subset_small_first': {
    build: () => {
      const schema = z.union([z.object({a: z.string()}), z.object({a: z.string(), b: z.number()})]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.object({a: z.string()}), z.object({a: z.string(), b: z.number()})]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // union_subset_nested_levels: 3-level chain {x}, {x,y}, {x,y,z}
  'UNION.union_subset_nested_levels': {
    build: () => {
      const schema = z.union([
        z.object({x: z.string()}),
        z.object({x: z.string(), y: z.number()}),
        z.object({x: z.string(), y: z.number(), z: z.boolean()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.object({x: z.string()}),
        z.object({x: z.string(), y: z.number()}),
        z.object({x: z.string(), y: z.number(), z: z.boolean()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // union_subset_mixed_related_unrelated: {id:string}, {id:string,name:string}, {value:number}
  'UNION.union_subset_mixed_related_unrelated': {
    build: () => {
      const schema = z.union([
        z.object({id: z.string()}),
        z.object({id: z.string(), name: z.string()}),
        z.object({value: z.number()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.object({id: z.string()}),
        z.object({id: z.string(), name: z.string()}),
        z.object({value: z.number()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── TEMPLATE_LITERAL ──
  // templateLiteral uses z.templateLiteral([parts]) in zod v4
  'TEMPLATE_LITERAL.url_with_number_id': {
    build: () => {
      const schema = z.templateLiteral(['api/user/', z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.templateLiteral(['api/user/', z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // multi_segment_url: `/api/v${number}/user/${string}/posts/${number}` → one template literal, one regex
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => {
      const schema = z.templateLiteral(['/api/v', z.number(), '/user/', z.string(), '/posts/', z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.templateLiteral(['/api/v', z.number(), '/user/', z.string(), '/posts/', z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    build: () => {
      const schema = z.templateLiteral([z.string(), '/', z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.templateLiteral([z.string(), '/', z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // regex_special_chars: literal '(' + number + ')' — template literal with parens in literal segments
  'TEMPLATE_LITERAL.regex_special_chars': {
    build: () => {
      const schema = z.templateLiteral(['(', z.number(), ')']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.templateLiteral(['(', z.number(), ')']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // template_literal_nested_in_object: object with url prop that is template literal
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    build: () => {
      const schema = z.object({url: z.templateLiteral(['api/user/', z.number()]), method: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({url: z.templateLiteral(['api/user/', z.number()]), method: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // template_literal_index_key: index sig with an 'api/<string>' key pattern and number values —
  // zod 4's z.record accepts a templateLiteral key schema that constrains every key.
  'TEMPLATE_LITERAL.template_literal_index_key': {
    build: () => {
      const schema = z.record(z.templateLiteral(['api/', z.string()]), z.number());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.templateLiteral(['api/', z.string()]), z.number());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // template_literal_union_placeholder: 'a-<number>' | 'b-<number>'
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    build: () => {
      const schema = z.union([z.templateLiteral(['a-', z.number()]), z.templateLiteral(['b-', z.number()])]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.templateLiteral(['a-', z.number()]), z.templateLiteral(['b-', z.number()])]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': {
    build: () => {
      const schema = z.map(z.string(), z.number());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.map(z.string(), z.number());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NATIVE.set_string': {
    build: () => {
      const schema = z.set(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.set(z.string());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // promise_string: thenable check — any object with typeof .then === 'function'
  'NATIVE.promise_string': {
    build: () => {
      const schema = z.custom((value) => typeof value === 'object' && value !== null && typeof (value as {then?: unknown}).then === 'function');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.custom((value) => typeof value === 'object' && value !== null && typeof (value as {then?: unknown}).then === 'function');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NATIVE.awaited_promise': {
    build: () => {
      const schema = z.string();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          n: z.number(),
          s: z.string(),
          c: z.lazy(() => schema).optional(),
          d: z.date().optional(),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          n: z.number(),
          s: z.string(),
          c: z.lazy(() => schema).optional(),
          d: z.date().optional(),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'CIRCULAR.array_of_union_with_self_ref': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.array(z.union([z.lazy(() => schema), z.date(), z.number(), z.string()]));
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.array(z.union([z.lazy(() => schema), z.date(), z.number(), z.string()]));
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'CIRCULAR.object_with_tuple_prop': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          tuple: z.tuple([z.bigint(), z.lazy(() => schema).optional()]),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          tuple: z.tuple([z.bigint(), z.lazy(() => schema).optional()]),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'CIRCULAR.object_with_index_prop': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          index: z.record(
            z.string(),
            z.lazy(() => schema)
          ),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          index: z.record(
            z.string(),
            z.lazy(() => schema)
          ),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // object_deeply_nested: deep3 is all-optional, so it gets the plain-object guard; deep4 recurses or is absent / undefined
  'CIRCULAR.object_deeply_nested': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          deep1: z.object({
            deep2: z.object({
              deep3: z
                .custom<{deep4?: unknown}>((value) => Object.prototype.toString.call(value) === '[object Object]')
                .check(z.properties({deep4: z.lazy(() => schema).optional()})),
            }),
          }),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          deep1: z.object({
            deep2: z.object({
              deep3: z
                .custom<{deep4?: unknown}>((value) => Object.prototype.toString.call(value) === '[object Object]')
                .check(z.properties({deep4: z.lazy(() => schema).optional()})),
            }),
          }),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // circular_child_under_literal_root: {isRoot:true, ciChild: ICircularDeep}
  // ICircularDeep: {name:string, big:bigint, embedded:{hello:string, child?: ICircularDeep}}
  'CIRCULAR.circular_child_under_literal_root': {
    build: () => {
      const schema = z.lazy(() => {
        const ciDeep: z.ZodType = z.object({
          name: z.string(),
          big: z.bigint(),
          embedded: z.object({hello: z.string(), child: z.lazy(() => ciDeep).optional()}),
        });
        return z.object({isRoot: z.literal(true), ciChild: ciDeep});
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const ciDeep: z.ZodType = z.object({
          name: z.string(),
          big: z.bigint(),
          embedded: z.object({hello: z.string(), child: z.lazy(() => ciDeep).optional()}),
        });
        return z.object({isRoot: z.literal(true), ciChild: ciDeep});
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // multiple_circular_types_cross_referenced: root with ciChild (ICircularDeep) + ciDate (ICircularDate) + optional self-ref
  'CIRCULAR.multiple_circular_types_cross_referenced': {
    build: () => {
      const schema = z.lazy(() => {
        const ciDeep: z.ZodType = z.object({
          name: z.string(),
          big: z.bigint(),
          embedded: z.object({hello: z.string(), child: z.lazy(() => ciDeep).optional()}),
        });
        const ciDate: z.ZodType = z.object({
          date: z.date(),
          month: z.number(),
          year: z.number(),
          embedded: z.lazy(() => ciDate).optional(),
          deep: ciDeep.optional(),
        });
        const root: z.ZodType = z.object({
          isRoot: z.literal(true),
          ciChild: ciDeep,
          ciDate: ciDate,
          ciRoort: z.lazy(() => root).optional(),
        });
        return root;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const ciDeep: z.ZodType = z.object({
          name: z.string(),
          big: z.bigint(),
          embedded: z.object({hello: z.string(), child: z.lazy(() => ciDeep).optional()}),
        });
        const ciDate: z.ZodType = z.object({
          date: z.date(),
          month: z.number(),
          year: z.number(),
          embedded: z.lazy(() => ciDate).optional(),
          deep: ciDeep.optional(),
        });
        const root: z.ZodType = z.object({
          isRoot: z.literal(true),
          ciChild: ciDeep,
          ciDate: ciDate,
          ciRoort: z.lazy(() => root).optional(),
        });
        return root;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── CIRCULAR_REFS ── (cyclic VALUES: one root z.custom walks the recursive edge only, then the normal recursive schema)
  // linked_list_cycle: walk follows `next` only, ancestor list like mion's findCycle
  'CIRCULAR_REFS.linked_list_cycle': {
    build: () => {
      const hasCycle = (value: unknown): boolean => {
        const stack: object[] = [];
        let node = value;
        while (typeof node === 'object' && node !== null) {
          if (stack.indexOf(node) !== -1) return true;
          stack.push(node);
          node = (node as {next?: unknown}).next;
        }
        return false;
      };
      const node: z.ZodType = z.object({value: z.number(), next: z.lazy(() => node).nullable()});
      const schema = z.custom((value) => !hasCycle(value)).pipe(node);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const hasCycle = (value: unknown): boolean => {
        const stack: object[] = [];
        let node = value;
        while (typeof node === 'object' && node !== null) {
          if (stack.indexOf(node) !== -1) return true;
          stack.push(node);
          node = (node as {next?: unknown}).next;
        }
        return false;
      };
      const node: z.ZodType = z.object({value: z.number(), next: z.lazy(() => node).nullable()});
      const schema = z.custom((value) => !hasCycle(value)).pipe(node);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // tree_cycle: walk follows `children[*]` only; `safe` skips subtrees already proven acyclic (mion's per-node Set)
  'CIRCULAR_REFS.tree_cycle': {
    build: () => {
      const hasCycle = (node: unknown, stack: object[], safe: Set<object>): boolean => {
        if (typeof node !== 'object' || node === null || safe.has(node)) return false;
        if (stack.indexOf(node) !== -1) return true;
        stack.push(node);
        const children = (node as {children?: unknown}).children;
        if (Array.isArray(children)) {
          for (let i = 0; i < children.length; i++) if (hasCycle(children[i], stack, safe)) return true;
        }
        stack.pop();
        safe.add(node);
        return false;
      };
      const node: z.ZodType = z.object({label: z.string(), children: z.array(z.lazy(() => node))});
      const schema = z.custom((value) => !hasCycle(value, [], new Set())).pipe(node);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const hasCycle = (node: unknown, stack: object[], safe: Set<object>): boolean => {
        if (typeof node !== 'object' || node === null || safe.has(node)) return false;
        if (stack.indexOf(node) !== -1) return true;
        stack.push(node);
        const children = (node as {children?: unknown}).children;
        if (Array.isArray(children)) {
          for (let i = 0; i < children.length; i++) if (hasCycle(children[i], stack, safe)) return true;
        }
        stack.pop();
        safe.add(node);
        return false;
      };
      const node: z.ZodType = z.object({label: z.string(), children: z.array(z.lazy(() => node))});
      const schema = z.custom((value) => !hasCycle(value, [], new Set())).pipe(node);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // object_self_cycle: walk follows `next` only
  'CIRCULAR_REFS.object_self_cycle': {
    build: () => {
      const hasCycle = (value: unknown): boolean => {
        const stack: object[] = [];
        let node = value;
        while (typeof node === 'object' && node !== null) {
          if (stack.indexOf(node) !== -1) return true;
          stack.push(node);
          node = (node as {next?: unknown}).next;
        }
        return false;
      };
      const node: z.ZodType = z.object({name: z.string(), next: z.lazy(() => node).optional()});
      const schema = z.custom((value) => !hasCycle(value)).pipe(node);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const hasCycle = (value: unknown): boolean => {
        const stack: object[] = [];
        let node = value;
        while (typeof node === 'object' && node !== null) {
          if (stack.indexOf(node) !== -1) return true;
          stack.push(node);
          node = (node as {next?: unknown}).next;
        }
        return false;
      };
      const node: z.ZodType = z.object({name: z.string(), next: z.lazy(() => node).optional()});
      const schema = z.custom((value) => !hasCycle(value)).pipe(node);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── UTILITY ──
  'UTILITY.partial': {
    build: () => {
      const schema = z
        .custom<{name?: string; age?: number; createdAt?: Date}>(
          (value) => Object.prototype.toString.call(value) === '[object Object]'
        )
        .check(z.properties({name: z.string().optional(), age: z.number().optional(), createdAt: z.date().optional()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .custom<{name?: string; age?: number; createdAt?: Date}>(
          (value) => Object.prototype.toString.call(value) === '[object Object]'
        )
        .check(z.properties({name: z.string().optional(), age: z.number().optional(), createdAt: z.date().optional()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // required: {name:string, age:number, createdAt:Date}
  'UTILITY.required': {
    build: () => {
      const schema = z.object({name: z.string(), age: z.number(), createdAt: z.date()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({name: z.string(), age: z.number(), createdAt: z.date()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // pick: {name:string, createdAt:Date}
  'UTILITY.pick': {
    build: () => {
      const schema = z.object({name: z.string(), createdAt: z.date()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({name: z.string(), createdAt: z.date()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // omit: same resolved shape {name:string, createdAt:Date}
  'UTILITY.omit': {
    build: () => {
      const schema = z.object({name: z.string(), createdAt: z.date()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({name: z.string(), createdAt: z.date()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // exclude_atomic: "name" | "createdAt"
  'UTILITY.exclude_atomic': {
    build: () => {
      const schema = z.union([z.literal('name'), z.literal('createdAt')]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.literal('name'), z.literal('createdAt')]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // extract_atomic: "name" | "createdAt"
  'UTILITY.extract_atomic': {
    build: () => {
      const schema = z.union([z.literal('name'), z.literal('createdAt')]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.literal('name'), z.literal('createdAt')]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UTILITY.exclude_from_object_union': {
    build: () => {
      const schema = z.discriminatedUnion('kind', [
        z.object({kind: z.literal('square'), x: z.number()}),
        z.object({kind: z.literal('triangle'), base: z.number(), height: z.number()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.discriminatedUnion('kind', [
        z.object({kind: z.literal('square'), x: z.number()}),
        z.object({kind: z.literal('triangle'), base: z.number(), height: z.number()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // non_nullable: string | number (no null, no undefined) — valid: string/number; invalid: null/undefined/bool/{}/[]/NaN/Infinity
  'UTILITY.non_nullable': {
    build: () => {
      const schema = z.union([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.string(), z.number()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // return_type: Date
  'UTILITY.return_type': {
    build: () => {
      const schema = z.date();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.date();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // readonly: {name:string, age:number}
  'UTILITY.readonly': {
    build: () => {
      const schema = z.object({name: z.string(), age: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({name: z.string(), age: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // intersection_with_required_override: {name:string, age?:number, createdAt?:Date}
  'UTILITY.intersection_with_required_override': {
    build: () => {
      const schema = z.object({name: z.string(), age: z.number().optional(), createdAt: z.date().optional()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({name: z.string(), age: z.number().optional(), createdAt: z.date().optional()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // omit_keeping_optional: {b?:number, c:boolean}
  'UTILITY.omit_keeping_optional': {
    build: () => {
      const schema = z.object({b: z.number().optional(), c: z.boolean()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({b: z.number().optional(), c: z.boolean()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // keyof_to_literal_union: "name" | "age" | "createdAt"
  'UTILITY.keyof_to_literal_union': {
    build: () => {
      const schema = z.union([z.literal('name'), z.literal('age'), z.literal('createdAt')]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.literal('name'), z.literal('age'), z.literal('createdAt')]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // typeof_variable_query: {url:string, port:number}
  'UTILITY.typeof_variable_query': {
    build: () => {
      const schema = z.object({url: z.string(), port: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({url: z.string(), port: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // indexed_access_type: string
  'UTILITY.indexed_access_type': {
    build: () => {
      const schema = z.string();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // conditional_type_resolved: boolean (IsString<"hello"> resolves to boolean)
  'UTILITY.conditional_type_resolved': {
    build: () => {
      const schema = z.boolean();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.boolean();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UTILITY.mapped_type_custom': {
    build: () => {
      const schema = z.object({a: z.string().nullable(), b: z.number().nullable()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.string().nullable(), b: z.number().nullable()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // mapped_type_with_conditional_value: complex per-prop conditional shapes
  'UTILITY.mapped_type_with_conditional_value': {
    build: () => {
      const schema = z.object({
        name: z.object({kind: z.literal('text'), value: z.string()}),
        age: z.object({kind: z.literal('number'), value: z.number(), min: z.number().optional()}),
        admin: z.object({kind: z.literal('checkbox'), value: z.boolean()}),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        name: z.object({kind: z.literal('text'), value: z.string()}),
        age: z.object({kind: z.literal('number'), value: z.number(), min: z.number().optional()}),
        admin: z.object({kind: z.literal('checkbox'), value: z.boolean()}),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // distributive_conditional_over_union: {w:string} | {w:number}
  'UTILITY.distributive_conditional_over_union': {
    build: () => {
      const schema = z.union([z.object({w: z.string()}), z.object({w: z.number()})]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.object({w: z.string()}), z.object({w: z.number()})]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'UTILITY.deep_partial_recursive_mapped': {
    build: () => {
      const schema = z
        .custom<{display?: {theme?: string; brightness?: number}; audio?: {volume?: number; muted?: boolean}}>(
          (value) => Object.prototype.toString.call(value) === '[object Object]'
        )
        .check(
          z.properties({
            display: z
              .custom<{theme?: string; brightness?: number}>(
                (value) => Object.prototype.toString.call(value) === '[object Object]'
              )
              .check(z.properties({theme: z.enum(['light', 'dark']).optional(), brightness: z.number().optional()}))
              .optional(),
            audio: z
              .custom<{volume?: number; muted?: boolean}>(
                (value) => Object.prototype.toString.call(value) === '[object Object]'
              )
              .check(z.properties({volume: z.number().optional(), muted: z.boolean().optional()}))
              .optional(),
          })
        );
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .custom<{display?: {theme?: string; brightness?: number}; audio?: {volume?: number; muted?: boolean}}>(
          (value) => Object.prototype.toString.call(value) === '[object Object]'
        )
        .check(
          z.properties({
            display: z
              .custom<{theme?: string; brightness?: number}>(
                (value) => Object.prototype.toString.call(value) === '[object Object]'
              )
              .check(z.properties({theme: z.enum(['light', 'dark']).optional(), brightness: z.number().optional()}))
              .optional(),
            audio: z
              .custom<{volume?: number; muted?: boolean}>(
                (value) => Object.prototype.toString.call(value) === '[object Object]'
              )
              .check(z.properties({volume: z.number().optional(), muted: z.boolean().optional()}))
              .optional(),
          })
        );
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── TYPE_MAPPINGS ──
  // key_prefix_rename: resolves to {user_id:number, user_name:string}
  'TYPE_MAPPINGS.key_prefix_rename': {
    build: () => {
      const schema = z.object({user_id: z.number(), user_name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({user_id: z.number(), user_name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // key_conditional_rename: {_id:number, name:string, createdAt:Date}
  'TYPE_MAPPINGS.key_conditional_rename': {
    build: () => {
      const schema = z.object({_id: z.number(), name: z.string(), createdAt: z.date()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({_id: z.number(), name: z.string(), createdAt: z.date()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // key_filter_via_never: {id:number, name:string} (secret dropped)
  'TYPE_MAPPINGS.key_filter_via_never': {
    build: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── DATETIME ──
  'DATETIME.date': {
    build: () => {
      const schema = z.date();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.date();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.instant': {
    build: () => {
      const schema = z.instanceof(Temporal.Instant);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(Temporal.Instant);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.zonedDateTime': {
    build: () => {
      const schema = z.instanceof(Temporal.ZonedDateTime);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(Temporal.ZonedDateTime);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate': {
    build: () => {
      const schema = z.instanceof(Temporal.PlainDate);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(Temporal.PlainDate);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainTime': {
    build: () => {
      const schema = z.instanceof(Temporal.PlainTime);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(Temporal.PlainTime);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDateTime': {
    build: () => {
      const schema = z.instanceof(Temporal.PlainDateTime);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(Temporal.PlainDateTime);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainYearMonth': {
    build: () => {
      const schema = z.instanceof(Temporal.PlainYearMonth);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(Temporal.PlainYearMonth);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainMonthDay': {
    build: () => {
      const schema = z.instanceof(Temporal.PlainMonthDay);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(Temporal.PlainMonthDay);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.duration': {
    build: () => {
      const schema = z.instanceof(Temporal.Duration);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.instanceof(Temporal.Duration);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {
    build: () => {
      const schema = z.string().max(5);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().max(5);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_minLength': {
    build: () => {
      const schema = z.string().min(3);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().min(3);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_length': {
    build: () => {
      const schema = z.string().length(4);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().length(4);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_range': {
    build: () => {
      const schema = z.string().min(2).max(4);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().min(2).max(4);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedChars': {
    build: () => {
      const schema = z.string().regex(/^[0-9a-f]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[0-9a-f]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': {
    build: () => {
      const schema = z.string().regex(/^[abc]+$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[abc]+$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedChars_literal': {
    build: () => {
      const schema = z.string().regex(/^[.\-]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[.\-]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    build: () => {
      const schema = z.string().regex(/^[^!@#]*$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[^!@#]*$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    build: () => {
      const schema = z.enum(['red', 'green', 'blue']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.enum(['red', 'green', 'blue']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': {
    build: () => {
      const schema = z.string().regex(/^(red|green)$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^(red|green)$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedValues_escaped': {
    build: () => {
      const schema = z.enum(['a.b', 'c+d']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.enum(['a.b', 'c+d']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // disallowedValues: one anchored negative lookahead = mion's `!/^(?:admin|root)$/.test(v)`, no hook
  'STRING_FORMAT.string_disallowedValues': {
    build: () => {
      const schema = z.string().regex(/^(?!(?:admin|root)$)/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^(?!(?:admin|root)$)/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    build: () => {
      const schema = z.enum(['a', 'b']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.enum(['a', 'b']);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // alpha family: Unicode letter / number classes, as mion (`u` flag)
  'STRING_FORMAT.alpha': {
    build: () => {
      const schema = z.string().regex(/^\p{L}+$/u);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^\p{L}+$/u);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    build: () => {
      const schema = z.string().regex(/^[\p{L}\p{N}]+$/u);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[\p{L}\p{N}]+$/u);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.numeric': {
    build: () => {
      const schema = z.string().regex(/^\p{N}+$/u);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^\p{N}+$/u);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // alpha_withLength: length first, then the Unicode letter pattern (mion's order)
  'STRING_FORMAT.alpha_withLength': {
    build: () => {
      const schema = z
        .string()
        .max(3)
        .regex(/^\p{L}+$/u);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .max(3)
        .regex(/^\p{L}+$/u);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.lowercase_validate': {
    build: () => {
      const schema = z.string();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // uuidv4: first-class zod 4 builder (rejects v7 and the no-dash / non-uuid variants)
  'STRING_FORMAT.uuidv4': {
    build: () => {
      const schema = z.uuidv4();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.uuidv4();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // uuidv7: first-class zod 4 builder
  'STRING_FORMAT.uuidv7': {
    build: () => {
      const schema = z.uuidv7();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.uuidv7();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_iso: YYYY-MM-DD — z.iso.date() validates ISO layout AND calendar correctness (2023-02-29 rejected)
  'STRING_FORMAT.date_iso': {
    build: () => {
      const schema = z.iso.date();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.iso.date();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_DMY: DD-MM-YYYY with calendar validity; `abort` on the layout regex so a bad layout is ONE error (mion)
  'STRING_FORMAT.date_DMY': {
    build: () => {
      const schema = z
        .string()
        .regex(/^\d{2}-\d{2}-\d{4}$/, {abort: true})
        .refine((text) => {
          const [dd, mm, yyyy] = text.split('-');
          const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
          return !isNaN(date.getTime()) && date.getUTCDate() === +dd && date.getUTCMonth() + 1 === +mm;
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\d{2}-\d{2}-\d{4}$/, {abort: true})
        .refine((text) => {
          const [dd, mm, yyyy] = text.split('-');
          const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
          return !isNaN(date.getTime()) && date.getUTCDate() === +dd && date.getUTCMonth() + 1 === +mm;
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_YM: YYYY-MM (no day)
  'STRING_FORMAT.date_YM': {
    build: () => {
      const schema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_MD: MM-DD with per-month day limits; 02-29 always allowed (no year), as mion
  'STRING_FORMAT.date_MD': {
    build: () => {
      const schema = z
        .string()
        .regex(/^(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|[12]\d))$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|[12]\d))$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_minMax_absolute: calendar-aware ISO date (z.iso.date) + inclusive bounds; ISO dates compare as strings
  'STRING_FORMAT.date_minMax_absolute': {
    build: () => {
      const schema = z.iso.date().refine((text) => text >= '2020-01-01' && text <= '2020-12-31');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.iso.date().refine((text) => text >= '2020-01-01' && text <= '2020-12-31');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // time_iso: RFC 3339 full-time like mion: tz required, `z` allowed, any fraction, second 60 only at 23:59 UTC
  'STRING_FORMAT.time_iso': {
    build: () => {
      const leapSecondOk = (text: string) => {
        if (text.charCodeAt(6) !== 54) return true; // seconds are not 60
        const last = text.charCodeAt(text.length - 1);
        let offset = 0;
        if (last !== 90 && last !== 122) {
          const at = text.length - 6;
          offset = (+text.slice(at + 1, at + 3) * 60 + +text.slice(at + 4, at + 6)) * (text.charCodeAt(at) === 45 ? -1 : 1);
        }
        return (+text.slice(0, 2) * 60 + +text.slice(3, 5) - offset + 2880) % 1440 === 1439;
      };
      const schema = z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/, {abort: true})
        .refine(leapSecondOk);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const leapSecondOk = (text: string) => {
        if (text.charCodeAt(6) !== 54) return true; // seconds are not 60
        const last = text.charCodeAt(text.length - 1);
        let offset = 0;
        if (last !== 90 && last !== 122) {
          const at = text.length - 6;
          offset = (+text.slice(at + 1, at + 3) * 60 + +text.slice(at + 4, at + 6)) * (text.charCodeAt(at) === 45 ? -1 : 1);
        }
        return (+text.slice(0, 2) * 60 + +text.slice(3, 5) - offset + 2880) % 1440 === 1439;
      };
      const schema = z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/, {abort: true})
        .refine(leapSecondOk);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // time_HHmmss: HH:mm:ss, 00:00:00..23:59:59
  'STRING_FORMAT.time_HHmmss': {
    build: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // time_HHmmss_ms: HH:mm:ss with an optional fraction of EXACTLY 3 digits (mion)
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // time_minMax_absolute: 09:00..17:00 (accepts HH:mm format too)
  'STRING_FORMAT.time_minMax_absolute': {
    build: () => {
      const schema = z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .refine((text) => text >= '09:00' && text <= '17:00');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .refine((text) => text >= '09:00' && text <= '17:00');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // dateTime_default: ISO 8601 datetime — z.iso.datetime({offset:true}) requires the T separator,
  // accepts Z or ±HH:MM offsets, and validates calendar correctness (2023-02-29 rejected).
  'STRING_FORMAT.dateTime_default': {
    build: () => {
      const schema = z.iso.datetime({offset: true});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.iso.datetime({offset: true});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // dateTime_custom: DD-MM-YYYY HH:mm with calendar validity; `abort` on the layout regex so a bad layout is ONE error (mion)
  'STRING_FORMAT.dateTime_custom': {
    build: () => {
      const schema = z
        .string()
        .regex(/^\d{2}-\d{2}-\d{4} ([01]\d|2[0-3]):[0-5]\d$/, {abort: true})
        .refine((text) => {
          const [date] = text.split(' ');
          const [dd, mm, yyyy] = date.split('-');
          const parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
          return !isNaN(parsed.getTime()) && parsed.getUTCDate() === +dd && parsed.getUTCMonth() + 1 === +mm;
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\d{2}-\d{2}-\d{4} ([01]\d|2[0-3]):[0-5]\d$/, {abort: true})
        .refine((text) => {
          const [date] = text.split(' ');
          const [dd, mm, yyyy] = date.split('-');
          const parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
          return !isNaN(parsed.getTime()) && parsed.getUTCDate() === +dd && parsed.getUTCMonth() + 1 === +mm;
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // dateTime_minMax_absolute: calendar-aware YYYY-MM-DD (zod's own date regex), `T`/`t`, HH:mm:ss in range,
  // then inclusive bounds compared on the date and time halves (fixed bounds parsed once)
  'STRING_FORMAT.dateTime_minMax_absolute': {
    build: () => {
      const schema = z
        .string()
        .regex(
          /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8])))[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
        )
        .refine((text) => {
          const date = text.slice(0, 10);
          const time = text.slice(11);
          return (
            (date > '2020-01-01' || (date === '2020-01-01' && time >= '00:00:00')) &&
            (date < '2020-12-31' || (date === '2020-12-31' && time <= '23:59:59'))
          );
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(
          /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8])))[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
        )
        .refine((text) => {
          const date = text.slice(0, 10);
          const time = text.slice(11);
          return (
            (date > '2020-01-01' || (date === '2020-01-01' && time >= '00:00:00')) &&
            (date < '2020-12-31' || (date === '2020-12-31' && time <= '23:59:59'))
          );
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // ipv4: dotted-quad, each octet 0-255
  'STRING_FORMAT.ipv4': {
    build: () => {
      const schema = z.ipv4();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.ipv4();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // ipv6: colon-separated
  'STRING_FORMAT.ipv6': {
    build: () => {
      const schema = z.ipv6();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.ipv6();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // ip_any: v4 or v6
  'STRING_FORMAT.ip_any': {
    build: () => {
      const schema = z.union([z.ipv4(), z.ipv6()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.ipv4(), z.ipv6()]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // ipv4_port: one regex = zod's own IPv4 rule (z.regexes.ipv4) + a required `:port` of 1-5 digits <= 65535
  'STRING_FORMAT.ipv4_port': {
    build: () => {
      const address = z.regexes.ipv4.source.slice(1, -1);
      const port = '(?:\\d{1,4}|[0-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])';
      const schema = z.string().regex(new RegExp(`^${address}:${port}$`));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const address = z.regexes.ipv4.source.slice(1, -1);
      const port = '(?:\\d{1,4}|[0-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])';
      const schema = z.string().regex(new RegExp(`^${address}:${port}$`));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // ipv6_port: `[address]:port`, zod's own IPv6 check (z.ipv6) on the address, required port <= 65535
  'STRING_FORMAT.ipv6_port': {
    build: () => {
      const ipv6 = z.compile(z.ipv6());
      const bracketed = /^\[([^\]]+)\]:(\d+)$/;
      const schema = z.string().refine((text) => {
        const match = bracketed.exec(text);
        return match !== null && +match[2] <= 65535 && ipv6.validate(match[1]);
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const ipv6 = z.compile(z.ipv6());
      const bracketed = /^\[([^\]]+)\]:(\d+)$/;
      const schema = z.string().refine((text) => {
        const match = bracketed.exec(text);
        return match !== null && +match[2] <= 65535 && ipv6.validate(match[1]);
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // domain: whole name 5..253 chars, labels 1..63 with no edge hyphen, letters-only TLD 2..63 (mion's rule)
  'STRING_FORMAT.domain': {
    build: () => {
      const schema = z
        .string()
        .max(253)
        .min(5)
        .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .max(253)
        .min(5)
        .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // domainParts: mion's rules. Name 5..253, every label 2..63 `[a-zA-Z0-9-]` without edge hyphen, 2..6 parts,
  // TLD 2..12 letters. Plain `.length`: every char must pass an ASCII pattern, so code points never change the answer.
  // validate stops at the first broken rule; errors reports every broken rule (as mion's two functions do).
  'STRING_FORMAT.domainParts': {
    build: () => {
      const label = /^[a-zA-Z0-9-]+$/;
      const tldPattern = /^[a-zA-Z]+(\.[a-zA-Z]+)?$/;
      const schema = z.string().refine((text) => {
        if (text.length > 253 || text.length < 5) return false;
        let count = 1;
        let start = 0;
        let pos;
        while ((pos = text.indexOf('.', start)) !== -1) {
          const name = text.substring(start, pos);
          if (name.startsWith('-') || name.endsWith('-')) return false;
          if (name.length > 63 || name.length < 2 || !label.test(name)) return false;
          start = pos + 1;
          count++;
        }
        if (count > 6 || count < 2) return false;
        const tld = text.substring(start);
        return tld.length <= 12 && tld.length >= 2 && tldPattern.test(tld);
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const label = /^[a-zA-Z0-9-]+$/;
      const tldPattern = /^[a-zA-Z]+(\.[a-zA-Z]+)?$/;
      const schema = z.string().superRefine((text, ctx) => {
        if (text.length > 253) ctx.addIssue('domain maxLength');
        if (text.length < 5) ctx.addIssue('domain minLength');
        let count = 0;
        let start = 0;
        let pos;
        while ((pos = text.indexOf('.', start)) !== -1) {
          const name = text.substring(start, pos);
          if (name.startsWith('-') || name.endsWith('-')) ctx.addIssue('label hyphen');
          if (name.length > 63) ctx.addIssue('label maxLength');
          if (name.length < 2) ctx.addIssue('label minLength');
          if (!label.test(name)) ctx.addIssue('label pattern');
          start = pos + 1;
          count++;
        }
        count++;
        if (count > 6) ctx.addIssue('maxParts');
        if (count < 2) ctx.addIssue('minParts');
        const tld = text.substring(start);
        if (tld.length > 12) ctx.addIssue('tld maxLength');
        if (tld.length < 2) ctx.addIssue('tld minLength');
        if (!tldPattern.test(tld)) ctx.addIssue('tld pattern');
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // email: z.email with mion's pattern + mion's whole-address length bounds 7..254
  'STRING_FORMAT.email': {
    build: () => {
      const schema = z
        .email({pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/})
        .max(254)
        .min(7);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .email({pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/})
        .max(254)
        .min(7);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // emailPunycode: as email, but the TLD may hold digits and `-` (xn--...)
  'STRING_FORMAT.emailPunycode': {
    build: () => {
      const schema = z
        .email({pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z0-9-]{2,63}$/})
        .max(254)
        .min(7);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .email({pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z0-9-]{2,63}$/})
        .max(254)
        .min(7);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // emailParts: mion's rules. Whole <= 254 code points, split at the LAST `@`, local part 1..64 code points without
  // any of ` ()<>[]:;\,{}|+@`, domain = the domainParts rules (ASCII patterns: plain `.length` there).
  // validate stops at the first broken rule; errors reports every broken rule (as mion's two functions do).
  'STRING_FORMAT.emailParts': {
    build: () => {
      const codePoints = (text: string) => {
        let count = text.length;
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i);
          if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            i++;
            count--;
          }
        }
        return count;
      };
      const disallowed = /[ ()<>[\]:;\\,{}|+@]/;
      const label = /^[a-zA-Z0-9-]+$/;
      const tldPattern = /^[a-zA-Z]+(\.[a-zA-Z]+)?$/;
      const schema = z.string().refine((email) => {
        if (email.length > 254 && (email.length > 508 || codePoints(email) > 254)) return false;
        const at = email.lastIndexOf('@');
        if (at === -1) return false;
        const local = email.substring(0, at);
        if (local.length < 1 || (local.length > 64 && (local.length > 128 || codePoints(local) > 64))) return false;
        if (disallowed.test(local)) return false;
        const domain = email.substring(at + 1);
        if (domain.length > 253 || domain.length < 5) return false;
        let count = 1;
        let start = 0;
        let pos;
        while ((pos = domain.indexOf('.', start)) !== -1) {
          const name = domain.substring(start, pos);
          if (name.startsWith('-') || name.endsWith('-')) return false;
          if (name.length > 63 || name.length < 2 || !label.test(name)) return false;
          start = pos + 1;
          count++;
        }
        if (count > 6 || count < 2) return false;
        const tld = domain.substring(start);
        return tld.length <= 12 && tld.length >= 2 && tldPattern.test(tld);
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const codePoints = (text: string) => {
        let count = text.length;
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i);
          if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            i++;
            count--;
          }
        }
        return count;
      };
      const disallowed = /[ ()<>[\]:;\\,{}|+@]/;
      const label = /^[a-zA-Z0-9-]+$/;
      const tldPattern = /^[a-zA-Z]+(\.[a-zA-Z]+)?$/;
      const schema = z.string().superRefine((email, ctx) => {
        if (email.length > 254 && (email.length > 508 || codePoints(email) > 254)) ctx.addIssue('email maxLength');
        const at = email.lastIndexOf('@');
        if (at === -1) {
          ctx.addIssue('email missing @');
          return;
        }
        const local = email.substring(0, at);
        if (local.length > 64 && (local.length > 128 || codePoints(local) > 64)) ctx.addIssue('local maxLength');
        if (local.length < 1) ctx.addIssue('local minLength');
        if (disallowed.test(local)) ctx.addIssue('local disallowedChars');
        const domain = email.substring(at + 1);
        if (domain.length > 253) ctx.addIssue('domain maxLength');
        if (domain.length < 5) ctx.addIssue('domain minLength');
        let count = 0;
        let start = 0;
        let pos;
        while ((pos = domain.indexOf('.', start)) !== -1) {
          const name = domain.substring(start, pos);
          if (name.startsWith('-') || name.endsWith('-')) ctx.addIssue('label hyphen');
          if (name.length > 63) ctx.addIssue('label maxLength');
          if (name.length < 2) ctx.addIssue('label minLength');
          if (!label.test(name)) ctx.addIssue('label pattern');
          start = pos + 1;
          count++;
        }
        count++;
        if (count > 6) ctx.addIssue('maxParts');
        if (count < 2) ctx.addIssue('minParts');
        const tld = domain.substring(start);
        if (tld.length > 12) ctx.addIssue('tld maxLength');
        if (tld.length < 2) ctx.addIssue('tld minLength');
        if (!tldPattern.test(tld)) ctx.addIssue('tld pattern');
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // url: mion's regex + 2048 cap; z.url() runs a WHATWG URL parse + trim that accepts values mion rejects
  'STRING_FORMAT.url': {
    build: () => {
      const schema = z.string().max(2048).regex(/^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().max(2048).regex(/^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // urlHttp: http(s) only, mion's regex + 2048 cap (same reason as url)
  'STRING_FORMAT.urlHttp': {
    build: () => {
      const schema = z.string().max(2048).regex(/^https?:\/\/[^\s/$.?#-][^\s]*$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().max(2048).regex(/^https?:\/\/[^\s/$.?#-][^\s]*$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // urlFile: file:// URLs, mion's regex + 2048 cap (same reason as url)
  'STRING_FORMAT.urlFile': {
    build: () => {
      const schema = z.string().max(2048).regex(/^file:\/\/\/?(?:[a-zA-Z]:)?[^\s/$.?#-][^\s]*$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().max(2048).regex(/^file:\/\/\/?(?:[a-zA-Z]:)?[^\s/$.?#-][^\s]*$/i);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => {
      const schema = z.string().regex(/^[a-z0-9-]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[a-z0-9-]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    build: () => {
      const schema = z.string().regex(/^[0-9a-fA-F]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[0-9a-fA-F]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {
    build: () => {
      const schema = z.number().max(100);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().max(100);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_min': {
    build: () => {
      const schema = z.number().min(0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().min(0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_lt': {
    build: () => {
      const schema = z.number().lt(10);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().lt(10);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_gt': {
    build: () => {
      const schema = z.number().gt(0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().gt(0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_integer': {
    build: () => {
      const schema = z.number().int();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().int();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // FormatFloat carries no failable constraint, so the equivalent zod schema is a
  // plain number: whole values are legal floats.
  'NUMBER_FORMAT.number_float': {
    build: () => {
      const schema = z.number();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_multipleOf': {
    build: () => {
      const schema = z.number().multipleOf(5);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().multipleOf(5);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // `.int()` last: a failed int check aborts every later check, so it must not hide the bound / multipleOf errors
  'NUMBER_FORMAT.number_combined': {
    build: () => {
      const schema = z.number().max(100).min(0).multipleOf(5).int();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().max(100).min(0).multipleOf(5).int();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    build: () => {
      const schema = z.number().max(127).min(-128).int();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().max(127).min(-128).int();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => {
      const schema = z.number().max(255).min(0).int();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().max(255).min(0).int();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': {
    build: () => {
      const schema = z.bigint().lte(100n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint().lte(100n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_min': {
    build: () => {
      const schema = z.bigint().gte(0n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint().gte(0n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_lt': {
    build: () => {
      const schema = z.bigint().lt(10n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint().lt(10n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_gt': {
    build: () => {
      const schema = z.bigint().gt(0n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint().gt(0n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_multipleOf': {
    build: () => {
      const schema = z.bigint().multipleOf(5n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint().multipleOf(5n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_combined': {
    build: () => {
      const schema = z.bigint().gte(0n).lte(1000n).multipleOf(10n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint().gte(0n).lte(1000n).multipleOf(10n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_int64': {
    build: () => {
      const schema = z.int64();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.int64();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_uint64': {
    build: () => {
      const schema = z.uint64();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.uint64();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── DATETIME ──
  // date_minmax: inclusive bounds — zod 4's z.date().min()/.max() are inclusive and reject Invalid Date
  'DATETIME.date_minmax': {
    build: () => {
      const schema = z.date().min(new Date(Date.UTC(2020, 0, 1))).max(new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.date().min(new Date(Date.UTC(2020, 0, 1))).max(new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_gtlt: exclusive bounds via the standalone z.gt / z.lt checks (Date constants hoisted by z.compile)
  'DATETIME.date_gtlt': {
    build: () => {
      const schema = z
        .date()
        .check(z.gt(new Date(Date.UTC(2020, 0, 1, 0, 0, 0))), z.lt(new Date(Date.UTC(2020, 11, 31, 23, 59, 59))));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .date()
        .check(z.gt(new Date(Date.UTC(2020, 0, 1, 0, 0, 0))), z.lt(new Date(Date.UTC(2020, 11, 31, 23, 59, 59))));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_min_lt: inclusive lower via .min(), exclusive upper via the standalone z.lt check
  'DATETIME.date_min_lt': {
    build: () => {
      const schema = z
        .date()
        .min(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)))
        .check(z.lt(new Date(Date.UTC(2020, 11, 31, 23, 59, 59))));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .date()
        .min(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)))
        .check(z.lt(new Date(Date.UTC(2020, 11, 31, 23, 59, 59))));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_max_now: "now" is read on every call (a .max(new Date()) frozen at build drifts)
  'DATETIME.date_max_now': {
    build: () => {
      const schema = z.date().refine((date) => date.getTime() <= Date.now());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.date().refine((date) => date.getTime() <= Date.now());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_rel_window: both bounds computed per call in UTC calendar math, one refine per bound
  'DATETIME.date_rel_window': {
    build: () => {
      const schema = z
        .date()
        .refine((date) => {
          const min = new Date();
          min.setUTCFullYear(min.getUTCFullYear() - 1000);
          return date.getTime() >= min.getTime();
        })
        .refine((date) => {
          const max = new Date();
          max.setUTCFullYear(max.getUTCFullYear() + 1000);
          return date.getTime() <= max.getTime();
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .date()
        .refine((date) => {
          const min = new Date();
          min.setUTCFullYear(min.getUTCFullYear() - 1000);
          return date.getTime() >= min.getTime();
        })
        .refine((date) => {
          const max = new Date();
          max.setUTCFullYear(max.getUTCFullYear() + 1000);
          return date.getTime() <= max.getTime();
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_rel_datetime_components: now - 1000 years (UTC) - 12 hours, computed per call
  'DATETIME.date_rel_datetime_components': {
    build: () => {
      const schema = z.date().refine((date) => {
        const min = new Date();
        min.setUTCFullYear(min.getUTCFullYear() - 1000);
        min.setTime(min.getTime() - 12 * 3_600_000);
        return date.getTime() >= min.getTime();
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.date().refine((date) => {
        const min = new Date();
        min.setUTCFullYear(min.getUTCFullYear() - 1000);
        min.setTime(min.getTime() - 12 * 3_600_000);
        return date.getTime() >= min.getTime();
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.instant_minmax': {
    build: () => {
      const min = Temporal.Instant.from('2020-01-01T00:00:00Z');
      const max = Temporal.Instant.from('2020-12-31T23:59:59Z');
      const schema = z
        .instanceof(Temporal.Instant)
        .refine((v) => Temporal.Instant.compare(v, min) >= 0)
        .refine((v) => Temporal.Instant.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const min = Temporal.Instant.from('2020-01-01T00:00:00Z');
      const max = Temporal.Instant.from('2020-12-31T23:59:59Z');
      const schema = z
        .instanceof(Temporal.Instant)
        .refine((v) => Temporal.Instant.compare(v, min) >= 0)
        .refine((v) => Temporal.Instant.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.instant_gtlt': {
    build: () => {
      const gt = Temporal.Instant.from('2020-01-01T00:00:00Z');
      const lt = Temporal.Instant.from('2020-12-31T23:59:59Z');
      const schema = z
        .instanceof(Temporal.Instant)
        .refine((v) => Temporal.Instant.compare(v, gt) > 0)
        .refine((v) => Temporal.Instant.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const gt = Temporal.Instant.from('2020-01-01T00:00:00Z');
      const lt = Temporal.Instant.from('2020-12-31T23:59:59Z');
      const schema = z
        .instanceof(Temporal.Instant)
        .refine((v) => Temporal.Instant.compare(v, gt) > 0)
        .refine((v) => Temporal.Instant.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.instant_rel': {
    build: () => {
      const span = Temporal.Duration.from('PT8760000H'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.Instant)
        .refine((v) => Temporal.Instant.compare(v, Temporal.Now.instant().subtract(span)) >= 0)
        .refine((v) => Temporal.Instant.compare(v, Temporal.Now.instant().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const span = Temporal.Duration.from('PT8760000H'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.Instant)
        .refine((v) => Temporal.Instant.compare(v, Temporal.Now.instant().subtract(span)) >= 0)
        .refine((v) => Temporal.Instant.compare(v, Temporal.Now.instant().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_minmax': {
    build: () => {
      const min = Temporal.PlainDate.from('2020-01-01');
      const max = Temporal.PlainDate.from('2020-12-31');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainDate.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const min = Temporal.PlainDate.from('2020-01-01');
      const max = Temporal.PlainDate.from('2020-12-31');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainDate.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_gtlt': {
    build: () => {
      const gt = Temporal.PlainDate.from('2020-01-01');
      const lt = Temporal.PlainDate.from('2020-12-31');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, gt) > 0)
        .refine((v) => Temporal.PlainDate.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const gt = Temporal.PlainDate.from('2020-01-01');
      const lt = Temporal.PlainDate.from('2020-12-31');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, gt) > 0)
        .refine((v) => Temporal.PlainDate.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_min_lt': {
    build: () => {
      const min = Temporal.PlainDate.from('2020-01-01');
      const lt = Temporal.PlainDate.from('2020-01-10');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainDate.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const min = Temporal.PlainDate.from('2020-01-01');
      const lt = Temporal.PlainDate.from('2020-01-10');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainDate.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_gt_max': {
    build: () => {
      const max = Temporal.PlainDate.from('2020-01-10');
      const gt = Temporal.PlainDate.from('2020-01-01');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, max) <= 0)
        .refine((v) => Temporal.PlainDate.compare(v, gt) > 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const max = Temporal.PlainDate.from('2020-01-10');
      const gt = Temporal.PlainDate.from('2020-01-01');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, max) <= 0)
        .refine((v) => Temporal.PlainDate.compare(v, gt) > 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_min_only': {
    build: () => {
      const min = Temporal.PlainDate.from('2020-01-01');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, min) >= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const min = Temporal.PlainDate.from('2020-01-01');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, min) >= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_max_only': {
    build: () => {
      const max = Temporal.PlainDate.from('2020-12-31');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const max = Temporal.PlainDate.from('2020-12-31');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_gt_only': {
    build: () => {
      const gt = Temporal.PlainDate.from('2020-01-01');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, gt) > 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const gt = Temporal.PlainDate.from('2020-01-01');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, gt) > 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_lt_only': {
    build: () => {
      const lt = Temporal.PlainDate.from('2020-12-31');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const lt = Temporal.PlainDate.from('2020-12-31');
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_rel_window': {
    build: () => {
      const span = Temporal.Duration.from('P1000Y'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, Temporal.Now.plainDateISO().subtract(span)) >= 0)
        .refine((v) => Temporal.PlainDate.compare(v, Temporal.Now.plainDateISO().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const span = Temporal.Duration.from('P1000Y'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, Temporal.Now.plainDateISO().subtract(span)) >= 0)
        .refine((v) => Temporal.PlainDate.compare(v, Temporal.Now.plainDateISO().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_rel_ymd': {
    build: () => {
      const span = Temporal.Duration.from('P100Y6M15D'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, Temporal.Now.plainDateISO().subtract(span)) >= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const span = Temporal.Duration.from('P100Y6M15D'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, Temporal.Now.plainDateISO().subtract(span)) >= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDate_rel_weeks': {
    build: () => {
      const span = Temporal.Duration.from('P52200W'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, Temporal.Now.plainDateISO().subtract(span)) >= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const span = Temporal.Duration.from('P52200W'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDate)
        .refine((v) => Temporal.PlainDate.compare(v, Temporal.Now.plainDateISO().subtract(span)) >= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainTime_minmax': {
    build: () => {
      const min = Temporal.PlainTime.from('09:00:00');
      const max = Temporal.PlainTime.from('17:00:00');
      const schema = z
        .instanceof(Temporal.PlainTime)
        .refine((v) => Temporal.PlainTime.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainTime.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const min = Temporal.PlainTime.from('09:00:00');
      const max = Temporal.PlainTime.from('17:00:00');
      const schema = z
        .instanceof(Temporal.PlainTime)
        .refine((v) => Temporal.PlainTime.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainTime.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainTime_gtlt': {
    build: () => {
      const gt = Temporal.PlainTime.from('09:00:00');
      const lt = Temporal.PlainTime.from('17:00:00');
      const schema = z
        .instanceof(Temporal.PlainTime)
        .refine((v) => Temporal.PlainTime.compare(v, gt) > 0)
        .refine((v) => Temporal.PlainTime.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const gt = Temporal.PlainTime.from('09:00:00');
      const lt = Temporal.PlainTime.from('17:00:00');
      const schema = z
        .instanceof(Temporal.PlainTime)
        .refine((v) => Temporal.PlainTime.compare(v, gt) > 0)
        .refine((v) => Temporal.PlainTime.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDateTime_minmax': {
    build: () => {
      const min = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
      const max = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
      const schema = z
        .instanceof(Temporal.PlainDateTime)
        .refine((v) => Temporal.PlainDateTime.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainDateTime.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const min = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
      const max = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
      const schema = z
        .instanceof(Temporal.PlainDateTime)
        .refine((v) => Temporal.PlainDateTime.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainDateTime.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDateTime_gtlt': {
    build: () => {
      const gt = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
      const lt = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
      const schema = z
        .instanceof(Temporal.PlainDateTime)
        .refine((v) => Temporal.PlainDateTime.compare(v, gt) > 0)
        .refine((v) => Temporal.PlainDateTime.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const gt = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
      const lt = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
      const schema = z
        .instanceof(Temporal.PlainDateTime)
        .refine((v) => Temporal.PlainDateTime.compare(v, gt) > 0)
        .refine((v) => Temporal.PlainDateTime.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDateTime_rel': {
    build: () => {
      const span = Temporal.Duration.from('P1000Y'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDateTime)
        .refine((v) => Temporal.PlainDateTime.compare(v, Temporal.Now.plainDateTimeISO().subtract(span)) >= 0)
        .refine((v) => Temporal.PlainDateTime.compare(v, Temporal.Now.plainDateTimeISO().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const span = Temporal.Duration.from('P1000Y'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDateTime)
        .refine((v) => Temporal.PlainDateTime.compare(v, Temporal.Now.plainDateTimeISO().subtract(span)) >= 0)
        .refine((v) => Temporal.PlainDateTime.compare(v, Temporal.Now.plainDateTimeISO().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainDateTime_rel_combo': {
    build: () => {
      const span = Temporal.Duration.from('P500YT12H'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDateTime)
        .refine((v) => Temporal.PlainDateTime.compare(v, Temporal.Now.plainDateTimeISO().subtract(span)) >= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const span = Temporal.Duration.from('P500YT12H'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainDateTime)
        .refine((v) => Temporal.PlainDateTime.compare(v, Temporal.Now.plainDateTimeISO().subtract(span)) >= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainYearMonth_minmax': {
    build: () => {
      const min = Temporal.PlainYearMonth.from('2020-01');
      const max = Temporal.PlainYearMonth.from('2020-12');
      const schema = z
        .instanceof(Temporal.PlainYearMonth)
        .refine((v) => Temporal.PlainYearMonth.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainYearMonth.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const min = Temporal.PlainYearMonth.from('2020-01');
      const max = Temporal.PlainYearMonth.from('2020-12');
      const schema = z
        .instanceof(Temporal.PlainYearMonth)
        .refine((v) => Temporal.PlainYearMonth.compare(v, min) >= 0)
        .refine((v) => Temporal.PlainYearMonth.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainYearMonth_gtlt': {
    build: () => {
      const gt = Temporal.PlainYearMonth.from('2020-01');
      const lt = Temporal.PlainYearMonth.from('2020-12');
      const schema = z
        .instanceof(Temporal.PlainYearMonth)
        .refine((v) => Temporal.PlainYearMonth.compare(v, gt) > 0)
        .refine((v) => Temporal.PlainYearMonth.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const gt = Temporal.PlainYearMonth.from('2020-01');
      const lt = Temporal.PlainYearMonth.from('2020-12');
      const schema = z
        .instanceof(Temporal.PlainYearMonth)
        .refine((v) => Temporal.PlainYearMonth.compare(v, gt) > 0)
        .refine((v) => Temporal.PlainYearMonth.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.plainYearMonth_rel': {
    build: () => {
      const span = Temporal.Duration.from('P1000Y'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainYearMonth)
        .refine((v) => Temporal.PlainYearMonth.compare(v, Temporal.Now.plainDateISO().toPlainYearMonth().subtract(span)) >= 0)
        .refine((v) => Temporal.PlainYearMonth.compare(v, Temporal.Now.plainDateISO().toPlainYearMonth().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const span = Temporal.Duration.from('P1000Y'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.PlainYearMonth)
        .refine((v) => Temporal.PlainYearMonth.compare(v, Temporal.Now.plainDateISO().toPlainYearMonth().subtract(span)) >= 0)
        .refine((v) => Temporal.PlainYearMonth.compare(v, Temporal.Now.plainDateISO().toPlainYearMonth().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.zonedDateTime_minmax': {
    build: () => {
      const min = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
      const max = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
      const schema = z
        .instanceof(Temporal.ZonedDateTime)
        .refine((v) => Temporal.ZonedDateTime.compare(v, min) >= 0)
        .refine((v) => Temporal.ZonedDateTime.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const min = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
      const max = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
      const schema = z
        .instanceof(Temporal.ZonedDateTime)
        .refine((v) => Temporal.ZonedDateTime.compare(v, min) >= 0)
        .refine((v) => Temporal.ZonedDateTime.compare(v, max) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.zonedDateTime_gtlt': {
    build: () => {
      const gt = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
      const lt = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
      const schema = z
        .instanceof(Temporal.ZonedDateTime)
        .refine((v) => Temporal.ZonedDateTime.compare(v, gt) > 0)
        .refine((v) => Temporal.ZonedDateTime.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const gt = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
      const lt = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
      const schema = z
        .instanceof(Temporal.ZonedDateTime)
        .refine((v) => Temporal.ZonedDateTime.compare(v, gt) > 0)
        .refine((v) => Temporal.ZonedDateTime.compare(v, lt) < 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.zonedDateTime_rel': {
    build: () => {
      const span = Temporal.Duration.from('P1000Y'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.ZonedDateTime)
        .refine((v) => Temporal.ZonedDateTime.compare(v, Temporal.Now.zonedDateTimeISO().subtract(span)) >= 0)
        .refine((v) => Temporal.ZonedDateTime.compare(v, Temporal.Now.zonedDateTimeISO().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const span = Temporal.Duration.from('P1000Y'); // constant parse, hoisted; "now" is read per call
      const schema = z
        .instanceof(Temporal.ZonedDateTime)
        .refine((v) => Temporal.ZonedDateTime.compare(v, Temporal.Now.zonedDateTimeISO().subtract(span)) >= 0)
        .refine((v) => Temporal.ZonedDateTime.compare(v, Temporal.Now.zonedDateTimeISO().add(span)) <= 0);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── REALWORLD ──
  'REALWORLD.user': {
    build: () => {
      const schema = z.object({
        id: z.number(),
        email: z.string(),
        name: z.string(),
        age: z.number().optional(),
        roles: z.array(z.enum(['admin', 'editor', 'user'])),
        active: z.boolean(),
        createdAt: z.string(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        id: z.number(),
        email: z.string(),
        name: z.string(),
        age: z.number().optional(),
        roles: z.array(z.enum(['admin', 'editor', 'user'])),
        active: z.boolean(),
        createdAt: z.string(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'REALWORLD.order': {
    build: () => {
      const schema = z.object({
        id: z.string(),
        customer: z.object({id: z.number(), email: z.string()}),
        items: z.array(
          z.object({sku: z.string(), name: z.string(), qty: z.number(), price: z.number()})
        ),
        shipping: z.object({
          street: z.string(),
          city: z.string(),
          state: z.string(),
          zip: z.string(),
          country: z.string(),
        }),
        status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']),
        total: z.number(),
        note: z.string().optional(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        id: z.string(),
        customer: z.object({id: z.number(), email: z.string()}),
        items: z.array(
          z.object({sku: z.string(), name: z.string(), qty: z.number(), price: z.number()})
        ),
        shipping: z.object({
          street: z.string(),
          city: z.string(),
          state: z.string(),
          zip: z.string(),
          country: z.string(),
        }),
        status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']),
        total: z.number(),
        note: z.string().optional(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'REALWORLD.blogPost': {
    build: () => {
      const schema = z.object({
        id: z.number(),
        title: z.string(),
        slug: z.string(),
        body: z.string(),
        tags: z.array(z.string()),
        author: z.object({name: z.string(), email: z.string()}),
        published: z.boolean(),
        publishedAt: z.string().optional(),
        meta: z.object({views: z.number(), likes: z.number()}),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        id: z.number(),
        title: z.string(),
        slug: z.string(),
        body: z.string(),
        tags: z.array(z.string()),
        author: z.object({name: z.string(), email: z.string()}),
        published: z.boolean(),
        publishedAt: z.string().optional(),
        meta: z.object({views: z.number(), likes: z.number()}),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'REALWORLD.product': {
    build: () => {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        price: z.number(),
        currency: z.enum(['USD', 'EUR', 'GBP']),
        inStock: z.boolean(),
        categories: z.array(z.string()),
        dimensions: z
          .object({width: z.number(), height: z.number(), depth: z.number()})
          .optional(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        price: z.number(),
        currency: z.enum(['USD', 'EUR', 'GBP']),
        inStock: z.boolean(),
        categories: z.array(z.string()),
        dimensions: z
          .object({width: z.number(), height: z.number(), depth: z.number()})
          .optional(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'REALWORLD.productPage': {
    build: () => {
      const schema = z.object({
        data: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            price: z.number(),
            currency: z.enum(['USD', 'EUR', 'GBP']),
            inStock: z.boolean(),
            categories: z.array(z.string()),
            dimensions: z
              .object({width: z.number(), height: z.number(), depth: z.number()})
              .optional(),
          })
        ),
        page: z.number(),
        pageSize: z.number(),
        total: z.number(),
        hasMore: z.boolean(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        data: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            price: z.number(),
            currency: z.enum(['USD', 'EUR', 'GBP']),
            inStock: z.boolean(),
            categories: z.array(z.string()),
            dimensions: z
              .object({width: z.number(), height: z.number(), depth: z.number()})
              .optional(),
          })
        ),
        page: z.number(),
        pageSize: z.number(),
        total: z.number(),
        hasMore: z.boolean(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'REALWORLD.registrationForm': {
    build: () => {
      const schema = z.object({
        email: z.string(),
        password: z.string(),
        acceptedTerms: z.literal(true),
        profile: z.object({firstName: z.string(), lastName: z.string(), age: z.number().optional()}),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        email: z.string(),
        password: z.string(),
        acceptedTerms: z.literal(true),
        profile: z.object({firstName: z.string(), lastName: z.string(), age: z.number().optional()}),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'REALWORLD.toBeChecked': {
    build: () => {
      const schema = z.object({
        number: z.number(),
        negNumber: z.number(),
        maxNumber: z.number(),
        string: z.string(),
        longString: z.string(),
        boolean: z.boolean(),
        deeplyNested: z.object({foo: z.string(), num: z.number(), bool: z.boolean()}),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({
        number: z.number(),
        negNumber: z.number(),
        maxNumber: z.number(),
        string: z.string(),
        longString: z.string(),
        boolean: z.boolean(),
        deeplyNested: z.object({foo: z.string(), num: z.number(), bool: z.boolean()}),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── JSON_SCHEMA ──
  // Not z.fromJSONSchema: it wraps each keyword in extra transform / safeParse steps, so it is not the fast path.
  'JSON_SCHEMA.property_names': {
    build: () => {
      const schema = z.record(z.string().regex(/^[a-z]+$/), z.number());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.string().regex(/^[a-z]+$/), z.number());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // contains_count: no zod check counts matching items, so a refine on the array leaf (number items: the copy equals the input)
  'JSON_SCHEMA.contains_count': {
    build: () => {
      const schema = z.array(z.number()).refine((items) => {
        let count = 0;
        for (let i = 0; i < items.length; i++) if (items[i] >= 10) count++;
        return count >= 2;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.number()).refine((items) => {
        let count = 0;
        for (let i = 0; i < items.length; i++) if (items[i] >= 10) count++;
        return count >= 2;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // unique_items: no zod uniqueness check, so a refine on the array leaf; number items, so Set (SameValueZero) like mion
  'JSON_SCHEMA.unique_items': {
    build: () => {
      const schema = z.array(z.number()).refine((items) => {
        if (items.length < 2) return true;
        const seen = new Set<number>();
        for (let i = 0; i < items.length; i++) {
          if (seen.has(items[i])) return false;
          seen.add(items[i]);
        }
        return true;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.number()).refine((items) => {
        if (items.length < 2) return true;
        const seen = new Set<number>();
        for (let i = 0; i < items.length; i++) {
          if (seen.has(items[i])) return false;
          seen.add(items[i]);
        }
        return true;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // object_size: no zod key-count check on records, so a refine on the record leaf counting keys (1..3)
  'JSON_SCHEMA.object_size': {
    build: () => {
      const schema = z.record(z.string(), z.number()).refine((obj) => {
        let count = 0;
        for (const _key in obj) count++;
        return count >= 1 && count <= 3;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.record(z.string(), z.number()).refine((obj) => {
        let count = 0;
        for (const _key in obj) count++;
        return count >= 1 && count <= 3;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'JSON_SCHEMA.string_email': {
    build: () => {
      const schema = z
        .email({pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/})
        .max(254)
        .min(7);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .email({pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/})
        .max(254)
        .min(7);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'JSON_SCHEMA.int_bounded': {
    build: () => {
      const schema = z.int().min(0).max(130);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.int().min(0).max(130);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'JSON_SCHEMA.string_pattern': {
    build: () => {
      const schema = z.string().regex(/^[a-z][a-z0-9-]*$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[a-z][a-z0-9-]*$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'JSON_SCHEMA.multiple_of': {
    build: () => {
      const schema = z.number().multipleOf(5);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().multipleOf(5);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },

  // ── STRICT ──
  // Nested objects are strict too.
  'STRICT.flat_required': {
    build: () => {
      const schema = z.strictObject({id: z.number(), name: z.string(), active: z.boolean()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.strictObject({id: z.number(), name: z.string(), active: z.boolean()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRICT.nested_required': {
    build: () => {
      const schema = z.strictObject({name: z.string(), inner: z.strictObject({x: z.number(), y: z.string()})});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.strictObject({name: z.string(), inner: z.strictObject({x: z.number(), y: z.string()})});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRICT.moltar_dto': {
    build: () => {
      const schema = z.strictObject({number: z.number(), negNumber: z.number(), maxNumber: z.number(), string: z.string(), longString: z.string(), boolean: z.boolean(), deeplyNested: z.strictObject({foo: z.string(), num: z.number(), bool: z.boolean()})});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.strictObject({number: z.number(), negNumber: z.number(), maxNumber: z.number(), string: z.string(), longString: z.string(), boolean: z.boolean(), deeplyNested: z.strictObject({foo: z.string(), num: z.number(), bool: z.boolean()})});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRICT.realworld_order': {
    build: () => {
      const schema = z.strictObject({
        id: z.string(),
        customer: z.strictObject({id: z.number(), email: z.string()}),
        items: z.array(z.strictObject({sku: z.string(), name: z.string(), qty: z.number(), price: z.number()})),
        shipping: z.strictObject({street: z.string(), city: z.string(), state: z.string(), zip: z.string(), country: z.string()}),
        status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']),
        total: z.number(),
        note: z.string().optional(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.strictObject({
        id: z.string(),
        customer: z.strictObject({id: z.number(), email: z.string()}),
        items: z.array(z.strictObject({sku: z.string(), name: z.string(), qty: z.number(), price: z.number()})),
        shipping: z.strictObject({street: z.string(), city: z.string(), state: z.string(), zip: z.string(), country: z.string()}),
        status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']),
        total: z.number(),
        note: z.string().optional(),
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
};
