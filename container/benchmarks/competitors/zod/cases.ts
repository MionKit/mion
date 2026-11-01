import {z} from 'zod';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

// RunTypes' plain-object guard: an all-optional object type accepts only an ordinary
// object, never an array, a Date / Map / Set / RegExp or any other builtin instance,
// even though every property is optional. z.object alone only excludes arrays and null,
// and a `.refine` on it sees the PARSED copy (a fresh plain object), so the guard has to
// run on the input, ahead of the object schema. This is zod's deliberate, documented
// choice here (docs/cross-library-validation-alignment-report.md, "Plain-object guard"):
// zod agrees with mion on every sample of these cases, and the release gate counts a
// `fail` on them as a broken run.
const plainObject = <Output, Input>(schema: z.ZodType<Output, Input>) =>
  z.custom<Input>((value) => Object.prototype.toString.call(value) === '[object Object]').pipe(schema);

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
  // enum_mixed: numeric reverse-mapping (0,'green',2) with mixed member types is not expressible via z.enum (strings only)
  // and z.nativeEnum also doesn't match the sample set (0, 'green', 2 but not 'Red'/'Green'/'Blue').
  // z.nativeEnum on a const object {Red:0,Green:'green',Blue:2} accepts 0,'green',2 AND keys 'Red','Green','Blue' — too broad.
  'ATOMIC.enum_mixed': {
    build: () => {
      const schema = z.union([z.literal(0), z.literal('green'), z.literal(2)]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([z.literal(0), z.literal('green'), z.literal(2)]);
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
  'ATOMIC.symbol': {
    build: () => {
      const schema = z.symbol();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.symbol();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
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
  'ARRAY.symbol_array': {
    build: () => {
      const schema = z.array(z.symbol());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.array(z.symbol());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
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
  // index_signature_named_props: {a:string, b:number} + catchall of string|number for extra keys
  'OBJECT.index_signature_named_props': {
    build: () => {
      const schema = z.object({a: z.string(), b: z.number()}).catchall(z.union([z.string(), z.number()]));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()}).catchall(z.union([z.string(), z.number()]));
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
  // index_signature_non_root: object with string prop + nested index sig — requires named prop b:string AND c:{[k]:string}
  'OBJECT.index_signature_non_root': {
    build: () => {
      const schema = z.object({b: z.string(), c: z.record(z.string(), z.string())});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({b: z.string(), c: z.record(z.string(), z.string())});
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
  // interface_all_optional: {a?:string, b?:number} — the same interface as mion, behind the
  // plain-object guard (plainObject above): z.object alone accepts Date/Map/Set/RegExp
  // instances, since its isObject only excludes arrays and null.
  'OBJECT.interface_all_optional': {
    build: () => {
      const schema = plainObject(z.object({a: z.string().optional(), b: z.number().optional()}));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = plainObject(z.object({a: z.string().optional(), b: z.number().optional()}));
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
      const schema = z.object({kind: z.union([z.literal('a'), z.literal('b')]), n: z.number()});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({kind: z.union([z.literal('a'), z.literal('b')]), n: z.number()});
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
  // circular_union: self-referential union (Date | number | string | object | array) — a lazy
  // z.union whose array + record arms recurse into the union itself.
  'UNION.circular_union': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.union([
          z.date(),
          z.number(),
          z.string(),
          z.array(z.lazy(() => schema)),
          z.record(
            z.string(),
            z.lazy(() => schema)
          ),
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
          z.array(z.lazy(() => schema)),
          z.record(
            z.string(),
            z.lazy(() => schema)
          ),
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
  // union_with_index_arm: one arm is a non-empty record of bigint values; empty {} matches no arm
  'UNION.union_with_index_arm': {
    build: () => {
      const schema = z.union([
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.bigint()).refine((record) => Object.keys(record).length > 0),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.bigint()).refine((record) => Object.keys(record).length > 0),
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
  // union_mixed_arrays_and_objects: arrays and objects in same union
  'UNION.union_mixed_arrays_and_objects': {
    build: () => {
      const schema = z.union([
        z.array(z.string()),
        z.array(z.number()),
        z.array(z.boolean()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
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
  // union_mixed_with_index: arrays + objects (some with index sigs); empty {} matches no arm
  'UNION.union_mixed_with_index': {
    build: () => {
      const schema = z.union([
        z.array(z.string()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.bigint()).refine((record) => Object.keys(record).length > 0),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.array(z.string()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.bigint()).refine((record) => Object.keys(record).length > 0),
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
  // multi_segment_url: version must be v1 or v2; username any string; post id number
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => {
      const schema = z.union([
        z.templateLiteral(['/api/v1/user/', z.string(), '/posts/', z.number()]),
        z.templateLiteral(['/api/v2/user/', z.string(), '/posts/', z.number()]),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
        z.templateLiteral(['/api/v1/user/', z.string(), '/posts/', z.number()]),
        z.templateLiteral(['/api/v2/user/', z.string(), '/posts/', z.number()]),
      ]);
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
        const schema: z.ZodType = z.array(z.union([z.date(), z.number(), z.string(), z.lazy(() => schema)]));
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.array(z.union([z.date(), z.number(), z.string(), z.lazy(() => schema)]));
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
          tuple: z.tuple([z.bigint()]).rest(z.lazy(() => schema) as z.ZodType),
        });
        return schema;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          tuple: z.tuple([z.bigint()]).rest(z.lazy(() => schema) as z.ZodType),
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
  // object_deeply_nested: T={deep1:{deep2:{deep3:{} | {deep4:T}}}}; deep4 must satisfy T or be absent
  'CIRCULAR.object_deeply_nested': {
    build: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          deep1: z.object({
            deep2: z.object({
              deep3: z.custom((value) => {
                if (typeof value !== 'object' || value === null) return false;
                const obj = value as Record<string, unknown>;
                if ('deep4' in obj) {
                  return schema.safeParse(obj.deep4).success;
                }
                return true; // empty object (no deep4)
              }),
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
              deep3: z.custom((value) => {
                if (typeof value !== 'object' || value === null) return false;
                const obj = value as Record<string, unknown>;
                if ('deep4' in obj) {
                  return schema.safeParse(obj.deep4).success;
                }
                return true; // empty object (no deep4)
              }),
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

  // ── CIRCULAR_REFS ── (cyclic VALUES; zod has no cyclic-value detection)
  'CIRCULAR_REFS.linked_list_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.tree_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.object_self_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow

  // ── UTILITY ──
  // partial: {name?:string, age?:number, createdAt?:Date} — the Partial<> of UTILITY.required, the
  // same interface as mion behind the plain-object guard (rejects arrays/Date/Map/Set).
  'UTILITY.partial': {
    build: () => {
      const schema = plainObject(
        z.object({
          name: z.string().optional(),
          age: z.number().optional(),
          createdAt: z.date().optional(),
        })
      );
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = plainObject(
        z.object({
          name: z.string().optional(),
          age: z.number().optional(),
          createdAt: z.date().optional(),
        })
      );
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
  // exclude_from_object_union: {kind:'square',x:number} | {kind:'triangle',base:number,height:number}
  'UTILITY.exclude_from_object_union': {
    build: () => {
      const schema = z.union([
        z.object({kind: z.literal('square'), x: z.number()}),
        z.object({kind: z.literal('triangle'), base: z.number(), height: z.number()}),
      ]);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.union([
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
  // mapped_type_custom: {a:string|null, b:number|null}
  'UTILITY.mapped_type_custom': {
    build: () => {
      const schema = z.object({a: z.union([z.string(), z.null()]), b: z.union([z.number(), z.null()])});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.object({a: z.union([z.string(), z.null()]), b: z.union([z.number(), z.null()])});
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
  // deep_partial_recursive_mapped: {display?:{theme?:'light'|'dark', brightness?:number}, audio?:{volume?:number, muted?:boolean}}
  // the same nested interface as mion; every level is all-optional, so every level sits
  // behind the plain-object guard, exactly where mion applies it.
  'UTILITY.deep_partial_recursive_mapped': {
    build: () => {
      const schema = plainObject(
        z.object({
          display: plainObject(
            z.object({theme: z.enum(['light', 'dark']).optional(), brightness: z.number().optional()})
          ).optional(),
          audio: plainObject(z.object({volume: z.number().optional(), muted: z.boolean().optional()})).optional(),
        })
      );
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = plainObject(
        z.object({
          display: plainObject(
            z.object({theme: z.enum(['light', 'dark']).optional(), brightness: z.number().optional()})
          ).optional(),
          audio: plainObject(z.object({volume: z.number().optional(), muted: z.boolean().optional()})).optional(),
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
  'DATETIME.instant': NOT_SUPPORTED, // Temporal.Instant not available in validation suite container (no Temporal polyfill)
  'DATETIME.zonedDateTime': NOT_SUPPORTED, // Temporal.ZonedDateTime not available in validation suite container
  'DATETIME.plainDate': NOT_SUPPORTED, // Temporal.PlainDate not available in validation suite container
  'DATETIME.plainTime': NOT_SUPPORTED, // Temporal.PlainTime not available in validation suite container
  'DATETIME.plainDateTime': NOT_SUPPORTED, // Temporal.PlainDateTime not available in validation suite container
  'DATETIME.plainYearMonth': NOT_SUPPORTED, // Temporal.PlainYearMonth not available in validation suite container
  'DATETIME.plainMonthDay': NOT_SUPPORTED, // Temporal.PlainMonthDay not available in validation suite container
  'DATETIME.duration': NOT_SUPPORTED, // Temporal.Duration not available in validation suite container

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
  'STRING_FORMAT.string_disallowedValues': {
    build: () => {
      const schema = z.string().refine((text) => !['admin', 'root'].includes(text));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().refine((text) => !['admin', 'root'].includes(text));
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
  'STRING_FORMAT.alpha': {
    build: () => {
      const schema = z.string().regex(/^[A-Za-z]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[A-Za-z]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    build: () => {
      const schema = z.string().regex(/^[A-Za-z0-9]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[A-Za-z0-9]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.numeric': {
    build: () => {
      const schema = z.string().regex(/^[0-9]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[0-9]+$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.alpha_withLength': {
    build: () => {
      const schema = z
        .string()
        .regex(/^[A-Za-z]+$/)
        .max(3);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^[A-Za-z]+$/)
        .max(3);
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
  // date_DMY: DD-MM-YYYY with calendar validity
  'STRING_FORMAT.date_DMY': {
    build: () => {
      const schema = z
        .string()
        .regex(/^\d{2}-\d{2}-\d{4}$/)
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
        .regex(/^\d{2}-\d{2}-\d{4}$/)
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
  // date_MD: MM-DD (no year) — note: 02-29 is valid (leap-day without year context), 13-01 invalid
  'STRING_FORMAT.date_MD': {
    build: () => {
      const schema = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_minMax_absolute: 2020-01-01..2020-12-31 inclusive
  'STRING_FORMAT.date_minMax_absolute': {
    build: () => {
      const schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((text) => text >= '2020-01-01' && text <= '2020-12-31');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((text) => text >= '2020-01-01' && text <= '2020-12-31');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // time_iso: HH:mm:ss with timezone (Z or ±HH:MM)
  'STRING_FORMAT.time_iso': {
    build: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/);
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
  // time_HHmmss_ms: HH:mm:ss[.mmm] optional milliseconds (exactly 1-3 digits)
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?$/);
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
  // dateTime_custom: DD-MM-YYYY HH:mm with calendar validity
  'STRING_FORMAT.dateTime_custom': {
    build: () => {
      const schema = z
        .string()
        .regex(/^\d{2}-\d{2}-\d{4} ([01]\d|2[0-3]):[0-5]\d$/)
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
        .regex(/^\d{2}-\d{2}-\d{4} ([01]\d|2[0-3]):[0-5]\d$/)
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
  // dateTime_minMax_absolute: 2020-01-01T00:00:00..2020-12-31T23:59:59 (no tz suffix in samples)
  'STRING_FORMAT.dateTime_minMax_absolute': {
    build: () => {
      const schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
        .refine((text) => text >= '2020-01-01T00:00:00' && text <= '2020-12-31T23:59:59');
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
        .refine((text) => text >= '2020-01-01T00:00:00' && text <= '2020-12-31T23:59:59');
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
  // ipv4_port: v4:port where port ≤ 65535 — zod ipv4() doesn't include port
  'STRING_FORMAT.ipv4_port': {
    build: () => {
      const schema = z
        .string()
        .regex(/^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d):\d+$/)
        .refine((text) => {
          const [ip, portStr] = text.split(':');
          const port = +portStr;
          if (port < 0 || port > 65535) return false;
          return ip.split('.').every((octet) => +octet >= 0 && +octet <= 255);
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d):\d+$/)
        .refine((text) => {
          const [ip, portStr] = text.split(':');
          const port = +portStr;
          if (port < 0 || port > 65535) return false;
          return ip.split('.').every((octet) => +octet >= 0 && +octet <= 255);
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // ipv6_port: [v6]:port where port ≤ 65535
  'STRING_FORMAT.ipv6_port': {
    build: () => {
      const schema = z
        .string()
        .regex(/^\[.+\]:\d+$/)
        .refine((text) => {
          const lastColon = text.lastIndexOf(':');
          const port = +text.slice(lastColon + 1);
          return port >= 0 && port <= 65535;
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\[.+\]:\d+$/)
        .refine((text) => {
          const lastColon = text.lastIndexOf(':');
          const port = +text.slice(lastColon + 1);
          return port >= 0 && port <= 65535;
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // domain: standard domain (2+ labels, TLD ≥ 2 chars, no leading hyphen)
  'STRING_FORMAT.domain': {
    build: () => {
      const schema = z.string().regex(/^(?!-)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^(?!-)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // domainParts: 2-6 labels, no hyphen-edge label, no digit-only TLD
  'STRING_FORMAT.domainParts': {
    build: () => {
      const schema = z.string().refine((text) => {
        const parts = text.split('.');
        if (parts.length < 2 || parts.length > 6) return false;
        const tld = parts[parts.length - 1];
        if (/^\d+$/.test(tld)) return false; // TLD must not be all digits
        for (const part of parts) {
          if (!part || part.startsWith('-') || part.endsWith('-')) return false;
          if (!/^[A-Za-z0-9-]+$/.test(part)) return false; // no underscore
        }
        return true;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().refine((text) => {
        const parts = text.split('.');
        if (parts.length < 2 || parts.length > 6) return false;
        const tld = parts[parts.length - 1];
        if (/^\d+$/.test(tld)) return false; // TLD must not be all digits
        for (const part of parts) {
          if (!part || part.startsWith('-') || part.endsWith('-')) return false;
          if (!/^[A-Za-z0-9-]+$/.test(part)) return false; // no underscore
        }
        return true;
      });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // email: zod 4 first-class z.email() builder. The case requires a localPart ≥2 chars and a first
  // domain label ≥2 chars (e.g. 'a@b.co' is rejected), which zod's default email regex does not enforce,
  // so we pass the case's pattern via the builder's {pattern} option rather than hand-rolling a refine.
  'STRING_FORMAT.email': {
    build: () => {
      const schema = z.email({pattern: /^[A-Za-z0-9.+_-]{2,}@([A-Za-z0-9][A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.email({pattern: /^[A-Za-z0-9.+_-]{2,}@([A-Za-z0-9][A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // emailPunycode: email with punycode TLD (xn--...)
  'STRING_FORMAT.emailPunycode': {
    build: () => {
      const schema = z
        .string()
        .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
        .refine((text) => {
          const [, domain] = text.split('@');
          return !!domain && domain.includes('.');
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
        .refine((text) => {
          const [, domain] = text.split('@');
          return !!domain && domain.includes('.');
        });
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // emailParts: no + in the local part, no underscore in the domain
  'STRING_FORMAT.emailParts': {
    build: () => {
      const schema = z.string().regex(/^[a-zA-Z0-9.]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[a-zA-Z0-9.]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // url: http/ftp/ws/wss schemes (mailto rejected); zod strips trailing ':' from protocol before testing regex
  'STRING_FORMAT.url': {
    build: () => {
      const schema = z.url({protocol: /^(https?|ftps?|wss?)$/});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.url({protocol: /^(https?|ftps?|wss?)$/});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // urlHttp: http(s) only
  'STRING_FORMAT.urlHttp': {
    build: () => {
      const schema = z.httpUrl();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.httpUrl();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // urlFile: file:// URLs; zod strips trailing ':' from protocol before testing
  'STRING_FORMAT.urlFile': {
    build: () => {
      const schema = z.url({protocol: /^file$/});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.url({protocol: /^file$/});
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => {
      const schema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
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
  'NUMBER_FORMAT.number_combined': {
    build: () => {
      const schema = z.number().int().min(0).max(100).multipleOf(5);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().int().min(0).max(100).multipleOf(5);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    build: () => {
      const schema = z.number().int().min(-128).max(127);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().int().min(-128).max(127);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => {
      const schema = z.number().int().min(0).max(255);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.number().int().min(0).max(255);
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
      const schema = z.bigint().gte(-9223372036854775808n).lte(9223372036854775807n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint().gte(-9223372036854775808n).lte(9223372036854775807n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_uint64': {
    build: () => {
      const schema = z.bigint().gte(0n).lte(18446744073709551615n);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.bigint().gte(0n).lte(18446744073709551615n);
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
  'DATETIME.date_gtlt': {
    build: () => {
      const schema = z
        .date()
        .refine((date) => date > new Date(Date.UTC(2020, 0, 1, 0, 0, 0)) && date < new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .date()
        .refine((date) => date > new Date(Date.UTC(2020, 0, 1, 0, 0, 0)) && date < new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_min_lt: inclusive lower via z.date().min(); the exclusive upper (lt) has no native builder, so refine
  'DATETIME.date_min_lt': {
    build: () => {
      const schema = z
        .date()
        .min(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)))
        .refine((date) => date < new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z
        .date()
        .min(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)))
        .refine((date) => date < new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_max_now: inclusive upper bound (now) via z.date().max()
  'DATETIME.date_max_now': {
    build: () => {
      const schema = z.date().max(new Date());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.date().max(new Date());
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_rel_window: inclusive relative window via z.date().min()/.max() over computed bounds
  'DATETIME.date_rel_window': {
    build: () => {
      const now = new Date();
      const minDate = new Date(now);
      minDate.setFullYear(minDate.getFullYear() - 1000);
      const maxDate = new Date(now);
      maxDate.setFullYear(maxDate.getFullYear() + 1000);
      const schema = z.date().min(minDate).max(maxDate);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const now = new Date();
      const minDate = new Date(now);
      minDate.setFullYear(minDate.getFullYear() - 1000);
      const maxDate = new Date(now);
      maxDate.setFullYear(maxDate.getFullYear() + 1000);
      const schema = z.date().min(minDate).max(maxDate);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  // date_rel_datetime_components: inclusive lower bound (now - 1000y - 12h) via z.date().min()
  'DATETIME.date_rel_datetime_components': {
    build: () => {
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 1000);
      minDate.setHours(minDate.getHours() - 12);
      const schema = z.date().min(minDate);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 1000);
      minDate.setHours(minDate.getHours() - 12);
      const schema = z.date().min(minDate);
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.safeParse(value).success;
    },
  },
  'DATETIME.instant_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.instant_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.instant_rel': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_min_only': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_max_only': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainTime_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED, // Temporal not available in benchmark container; getSamples() throws

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
  // zod has no JSON Schema INPUT door (it emits with z.toJSONSchema but cannot
  // build a validator from one), so these entries state the same CONSTRAINT in
  // zod's own dialect, exactly like every other group here. Only the keywords
  // zod genuinely cannot express opt out.
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
  'JSON_SCHEMA.contains_count': NOT_SUPPORTED, // no array `contains` / count-of-matching-items check
  'JSON_SCHEMA.unique_items': NOT_SUPPORTED, // no array uniqueness check
  'JSON_SCHEMA.object_size': NOT_SUPPORTED, // no key-count bounds on objects
  'JSON_SCHEMA.string_email': {
    build: () => {
      const schema = z.email();
      const compiled = z.compile(schema);
      return (value: unknown) => compiled.validate(value);
    },
    buildErrors: () => {
      const schema = z.email();
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
