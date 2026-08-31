import {z} from 'zod';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

// Every supported case builds its zod schema inside its own `buildErrors` thunk —
// self-contained and copy-paste runnable, with any shared sub-schema inlined. zod
// has NO cheap boolean validator (safeParse always builds the full ZodError), so
// only the validationErrors (safeParse) metric is measured; `validate` is
// implicitly not-supported because no `build` is provided.

// EXACTLY 263 entries — one per shared case key, in authoritative order.
// Supported  → {buildErrors: () => { const schema = z....; return (v) => schema.safeParse(v).success; }}
// Unsupported → NOT_SUPPORTED  (every key the original map omitted).
export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': {
    buildErrors: () => {
      const schema = z.any();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.bigint': {
    buildErrors: () => {
      const schema = z.bigint();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.boolean': {
    buildErrors: () => {
      const schema = z.boolean();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.date': {
    buildErrors: () => {
      const schema = z.date();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // enum_mixed: numeric reverse-mapping (0,'green',2) with mixed member types is not expressible via z.enum (strings only)
  // and z.nativeEnum also doesn't match the sample set (0, 'green', 2 but not 'Red'/'Green'/'Blue').
  // z.nativeEnum on a const object {Red:0,Green:'green',Blue:2} accepts 0,'green',2 AND keys 'Red','Green','Blue' — too broad.
  'ATOMIC.enum_mixed': {
    buildErrors: () => {
      const schema = z.union([z.literal(0), z.literal('green'), z.literal(2)]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.literal_2': {
    buildErrors: () => {
      const schema = z.literal(2);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.literal_a': {
    buildErrors: () => {
      const schema = z.literal('a');
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.literal_true': {
    buildErrors: () => {
      const schema = z.literal(true);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.literal_1n': {
    buildErrors: () => {
      const schema = z.literal(1n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // literal_symbol: match any symbol whose description === 'hello'
  'ATOMIC.literal_symbol': {
    buildErrors: () => {
      const schema = z.custom((v) => typeof v === 'symbol' && v.description === 'hello');
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.never': {
    buildErrors: () => {
      const schema = z.never();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.null': {
    buildErrors: () => {
      const schema = z.null();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.number': {
    buildErrors: () => {
      const schema = z.number();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // object: any non-null non-primitive (arrays, Date, regex all pass; null rejected)
  'ATOMIC.object': {
    buildErrors: () => {
      const schema = z.custom((v) => typeof v === 'object' && v !== null);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.regexp': {
    buildErrors: () => {
      const schema = z.instanceof(RegExp);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.string': {
    buildErrors: () => {
      const schema = z.string();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.symbol': {
    buildErrors: () => {
      const schema = z.symbol();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.undefined': {
    buildErrors: () => {
      const schema = z.undefined();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.void': {
    buildErrors: () => {
      const schema = z.void();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // noLiterals cases: literal degrades to its base type
  'ATOMIC.literal_2_noLiterals': {
    buildErrors: () => {
      const schema = z.number();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.literal_a_noLiterals': {
    buildErrors: () => {
      const schema = z.string();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.literal_regexp_noLiterals': {
    buildErrors: () => {
      const schema = z.instanceof(RegExp);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.literal_true_noLiterals': {
    buildErrors: () => {
      const schema = z.boolean();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.literal_1n_noLiterals': {
    buildErrors: () => {
      const schema = z.bigint();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // literal_symbol_noLiterals: degrades to bare symbol — factoryThrows=true in shared but empty valid/invalid; z.symbol() passes vacuously
  'ATOMIC.literal_symbol_noLiterals': {
    buildErrors: () => {
      const schema = z.symbol();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ATOMIC.unknown': {
    buildErrors: () => {
      const schema = z.unknown();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── ARRAY ──
  'ARRAY.string_array': {
    buildErrors: () => {
      const schema = z.array(z.string());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.number_array': {
    buildErrors: () => {
      const schema = z.array(z.number());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.boolean_array': {
    buildErrors: () => {
      const schema = z.array(z.boolean());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.bigint_array': {
    buildErrors: () => {
      const schema = z.array(z.bigint());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.date_array': {
    buildErrors: () => {
      const schema = z.array(z.date());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.regexp_array': {
    buildErrors: () => {
      const schema = z.array(z.instanceof(RegExp));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.undefined_array': {
    buildErrors: () => {
      const schema = z.array(z.undefined());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.null_array': {
    buildErrors: () => {
      const schema = z.array(z.null());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.array_generic': {
    buildErrors: () => {
      const schema = z.array(z.string());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.string_array_2d': {
    buildErrors: () => {
      const schema = z.array(z.array(z.string()));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.string_array_3d': {
    buildErrors: () => {
      const schema = z.array(z.array(z.array(z.string())));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // string_array_noIsArrayCheck: same samples as string_array but no non-array invalid entries — z.array(z.string()) matches
  'ARRAY.string_array_noIsArrayCheck': {
    buildErrors: () => {
      const schema = z.array(z.string());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.object_array': {
    buildErrors: () => {
      const schema = z.array(z.object({a: z.string()}));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.union_array': {
    buildErrors: () => {
      const schema = z.array(z.union([z.string(), z.number()]));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.tuple_array': {
    buildErrors: () => {
      const schema = z.array(z.tuple([z.string(), z.number()]));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.circular_array': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.array(z.lazy(() => schema));
        return schema;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.circular_object_with_array': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          a: z.string(),
          deep: z.object({b: z.string(), c: z.number()}).optional(),
          d: z.array(z.lazy(() => schema)).optional(),
        });
        return schema;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.symbol_array': {
    buildErrors: () => {
      const schema = z.array(z.symbol());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'ARRAY.readonly_string_array': {
    buildErrors: () => {
      const schema = z.array(z.string());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.object_as_const_literals': {
    buildErrors: () => {
      const schema = z.object({name: z.literal('john'), age: z.literal(30)});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.object_via_return_type_utility': {
    buildErrors: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.object_via_property_access': {
    buildErrors: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.object_via_array_access': {
    buildErrors: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.interface_with_optional': {
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number().optional()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.interface_with_date': {
    buildErrors: () => {
      const schema = z.object({date: z.date(), name: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.interface_with_method': {
    buildErrors: () => {
      const schema = z.object({name: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.nested_object': {
    buildErrors: () => {
      const schema = z.object({a: z.string(), deep: z.object({b: z.string(), c: z.number()})});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.interface_string_array_prop': {
    buildErrors: () => {
      const schema = z.object({tags: z.array(z.string())});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.circular_interface': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({name: z.string(), child: z.lazy(() => schema).optional()});
        return schema;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.circular_interface_on_array': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({name: z.string(), children: z.array(z.lazy(() => schema)).optional()});
        return schema;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.circular_interface_on_nested_object': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          name: z.string(),
          embedded: z.object({hello: z.string(), child: z.lazy(() => schema).optional()}),
        });
        return schema;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.index_signature_string': {
    buildErrors: () => {
      const schema = z.record(z.string(), z.string());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // index_signature_named_props: {a:string, b:number} + catchall of string|number for extra keys
  'OBJECT.index_signature_named_props': {
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()}).catchall(z.union([z.string(), z.number()]));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.index_signature_nested': {
    buildErrors: () => {
      const schema = z.record(z.string(), z.record(z.string(), z.number()));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.index_signature_date_value': {
    buildErrors: () => {
      const schema = z.record(z.string(), z.record(z.string(), z.date()));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // index_signature_non_root: object with string prop + nested index sig — requires named prop b:string AND c:{[k]:string}
  'OBJECT.index_signature_non_root': {
    buildErrors: () => {
      const schema = z.object({b: z.string(), c: z.record(z.string(), z.string())});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // function_top_level: any function (class counts too); z.function() only validates arity; use custom
  'OBJECT.function_top_level': {
    buildErrors: () => {
      const schema = z.custom((v) => typeof v === 'function');
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // interface_callable: function with extra prop — typeof function AND extra prop is string
  'OBJECT.interface_callable': {
    buildErrors: () => {
      const schema = z.custom((v) => typeof v === 'function' && typeof (v as {extra?: unknown}).extra === 'string');
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // interface_all_optional: {a?:string, b?:number} — declared as the same interface as mion.
  // NB zod's z.object accepts Date/Map/Set instances (its isObject only excludes arrays/null), so this
  // accepts those where mion rejects them; that pass/reject discrepancy is the correctness
  // benchmark's job to surface, not a hand guard's.
  'OBJECT.interface_all_optional': {
    buildErrors: () => {
      const schema = z.object({a: z.string().optional(), b: z.number().optional()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // class_simple: class with date+name props (method skipped); same as object with date+name
  'OBJECT.class_simple': {
    buildErrors: () => {
      const schema = z.object({date: z.date(), name: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // rpc_error_class: brand discriminator with special char key 'mion@isΣrrθr'
  'OBJECT.rpc_error_class': {
    buildErrors: () => {
      const schema = z.object({
        'mion@isΣrrθr': z.literal(true),
        type: z.literal('test-error'),
        publicMessage: z.string(),
        id: z.string().optional(),
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // call_signature_params: [number, boolean] tuple, excess args rejected
  'OBJECT.call_signature_params': {
    buildErrors: () => {
      const schema = z.tuple([z.number(), z.boolean()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // call_signature_params_with_optional: [number, boolean, string?]
  'OBJECT.call_signature_params_with_optional': {
    buildErrors: () => {
      const schema = z.tuple([z.number(), z.boolean(), z.string().optional()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // call_signature_params_with_rest: [number, boolean, ...Date[]]
  'OBJECT.call_signature_params_with_rest': {
    buildErrors: () => {
      const schema = z.tuple([z.number(), z.boolean()]).rest(z.date());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.record_union_keys': {
    buildErrors: () => {
      const schema = z.object({a: z.number(), b: z.number()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.union_value_index': {
    buildErrors: () => {
      const schema = z.record(z.string(), z.union([z.string(), z.number()]));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'OBJECT.object_with_union_prop': {
    buildErrors: () => {
      const schema = z.object({kind: z.union([z.literal('a'), z.literal('b')]), n: z.number()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // interface_inheritance: merged props {a: string, b: number}
  'OBJECT.interface_inheritance': {
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // class_inheritance: merged props {a: string, b: number}
  'OBJECT.class_inheritance': {
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // index_signature_number_key: normalised to string-key record at runtime
  'OBJECT.index_signature_number_key': {
    buildErrors: () => {
      const schema = z.record(z.string(), z.string());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    buildErrors: () => {
      const schema = z.tuple([z.string(), z.number()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'TUPLE.full_mion_tuple': {
    buildErrors: () => {
      const schema = z.tuple([z.date(), z.number(), z.string(), z.null(), z.array(z.string()), z.bigint()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // tuple_with_optional: [number, bigint?, boolean?, number?] — same shape as
  // tuple_multiple_trailing_optionals; z.tuple with trailing .optional() slots accepts explicit
  // undefined in the middle and rejects excess args.
  'TUPLE.tuple_with_optional': {
    buildErrors: () => {
      const schema = z.tuple([
        z.number(),
        z.bigint().optional(),
        z.boolean().optional(),
        z.number().optional(),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'TUPLE.nested_tuple_in_array': {
    buildErrors: () => {
      const schema = z.array(z.tuple([z.string(), z.number()]));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'TUPLE.tuple_rest': {
    buildErrors: () => {
      const schema = z.tuple([z.number()]).rest(z.string());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // tuple_circular: self-referential tuple — [Date, number, string, null, string[], bigint] with an
  // optional 7th slot that is the tuple itself; a lazy z.tuple with a trailing optional self-ref slot.
  'TUPLE.tuple_circular': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // tuple_multiple_trailing_optionals: [number, bigint?, boolean?, number?]
  'TUPLE.tuple_multiple_trailing_optionals': {
    buildErrors: () => {
      const schema = z.tuple([
        z.number(),
        z.bigint().optional(),
        z.boolean().optional(),
        z.number().optional(),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'TUPLE.tuple_named_labels': {
    buildErrors: () => {
      const schema = z.tuple([z.string(), z.number()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // tuple_with_non_serializable: function slot must be undefined — z.tuple with undefined at slot 1
  'TUPLE.tuple_with_non_serializable': {
    buildErrors: () => {
      const schema = z.tuple([z.number(), z.undefined().optional()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'TUPLE.empty_tuple': {
    buildErrors: () => {
      const schema = z.tuple([]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'TUPLE.single_element_tuple': {
    buildErrors: () => {
      const schema = z.tuple([z.string()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'TUPLE.readonly_tuple': {
    buildErrors: () => {
      const schema = z.tuple([z.string(), z.number()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── UNION ──
  'UNION.atomic_union': {
    buildErrors: () => {
      const schema = z.union([z.date(), z.number(), z.string(), z.null(), z.bigint()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.string_literal_union': {
    buildErrors: () => {
      const schema = z.enum(['UNO', 'DOS', 'TRES']);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // large_union_eight_arms: 8 arms — use z.union with all members
  'UNION.large_union_eight_arms': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.string_or_number': {
    buildErrors: () => {
      const schema = z.union([z.string(), z.number()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.union_of_array_types': {
    buildErrors: () => {
      const schema = z.union([z.array(z.string()), z.array(z.number()), z.array(z.boolean())]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.array_of_union': {
    buildErrors: () => {
      const schema = z.array(z.union([z.string(), z.bigint(), z.boolean(), z.date()]));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.union_of_object_shapes': {
    buildErrors: () => {
      const schema = z.union([
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.object({c: z.bigint()}),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // discriminated_union: literal 'kind' discriminator — zod 4's z.discriminatedUnion dispatches on it
  'UNION.discriminated_union': {
    buildErrors: () => {
      const schema = z.discriminatedUnion('kind', [
        z.object({kind: z.literal('a'), n: z.number()}),
        z.object({kind: z.literal('b'), s: z.string()}),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // circular_union: self-referential union (Date | number | string | object | array) — a lazy
  // z.union whose array + record arms recurse into the union itself.
  'UNION.circular_union': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // union_with_methods: method props skipped — validate only data props
  'UNION.union_with_methods': {
    buildErrors: () => {
      const schema = z.union([z.object({name: z.string()}), z.object({age: z.number()})]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.intersection_to_object': {
    buildErrors: () => {
      const schema = z.object({a: z.string(), b: z.number()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // union_with_index_arm: one arm is a non-empty record of bigint values; empty {} matches no arm
  'UNION.union_with_index_arm': {
    buildErrors: () => {
      const schema = z.union([
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.bigint()).refine((o) => Object.keys(o).length > 0),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // union_same_prop_different_types: 'type' literal discriminator with arm-dependent 'prop' value
  'UNION.union_same_prop_different_types': {
    buildErrors: () => {
      const schema = z.discriminatedUnion('type', [
        z.object({type: z.literal('a'), prop: z.boolean()}),
        z.object({type: z.literal('b'), prop: z.number()}),
        z.object({type: z.literal('c'), prop: z.string()}),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // union_mixed_arrays_and_objects: arrays and objects in same union
  'UNION.union_mixed_arrays_and_objects': {
    buildErrors: () => {
      const schema = z.union([
        z.array(z.string()),
        z.array(z.number()),
        z.array(z.boolean()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.union_merged_property': {
    buildErrors: () => {
      const schema = z.union([z.object({a: z.boolean()}), z.object({a: z.number()})]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // union_mixed_with_index: arrays + objects (some with index sigs); empty {} matches no arm
  'UNION.union_mixed_with_index': {
    buildErrors: () => {
      const schema = z.union([
        z.array(z.string()),
        z.object({a: z.string(), aa: z.boolean()}),
        z.object({b: z.number()}),
        z.record(z.string(), z.bigint()).refine((o) => Object.keys(o).length > 0),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.union_with_any_fallback': {
    buildErrors: () => {
      const schema = z.any();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'UNION.union_with_unknown_fallback': {
    buildErrors: () => {
      const schema = z.unknown();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // union_subset_small_first: {a} before {a,b} — structurally, {a} arm matches both; both valid
  'UNION.union_subset_small_first': {
    buildErrors: () => {
      const schema = z.union([z.object({a: z.string()}), z.object({a: z.string(), b: z.number()})]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // union_subset_nested_levels: 3-level chain {x}, {x,y}, {x,y,z}
  'UNION.union_subset_nested_levels': {
    buildErrors: () => {
      const schema = z.union([
        z.object({x: z.string()}),
        z.object({x: z.string(), y: z.number()}),
        z.object({x: z.string(), y: z.number(), z: z.boolean()}),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // union_subset_mixed_related_unrelated: {id:string}, {id:string,name:string}, {value:number}
  'UNION.union_subset_mixed_related_unrelated': {
    buildErrors: () => {
      const schema = z.union([
        z.object({id: z.string()}),
        z.object({id: z.string(), name: z.string()}),
        z.object({value: z.number()}),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── TEMPLATE_LITERAL ──
  // templateLiteral uses z.templateLiteral([parts]) in zod v4
  'TEMPLATE_LITERAL.url_with_number_id': {
    buildErrors: () => {
      const schema = z.templateLiteral(['api/user/', z.number()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // multi_segment_url: version must be v1 or v2; username any string; post id number
  'TEMPLATE_LITERAL.multi_segment_url': {
    buildErrors: () => {
      const schema = z.union([
        z.templateLiteral(['/api/v1/user/', z.string(), '/posts/', z.number()]),
        z.templateLiteral(['/api/v2/user/', z.string(), '/posts/', z.number()]),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    buildErrors: () => {
      const schema = z.templateLiteral([z.string(), '/', z.number()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // regex_special_chars: literal '(' + number + ')' — template literal with parens in literal segments
  'TEMPLATE_LITERAL.regex_special_chars': {
    buildErrors: () => {
      const schema = z.templateLiteral(['(', z.number(), ')']);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // template_literal_nested_in_object: object with url prop that is template literal
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    buildErrors: () => {
      const schema = z.object({url: z.templateLiteral(['api/user/', z.number()]), method: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // template_literal_index_key: index sig with an 'api/<string>' key pattern and number values —
  // zod 4's z.record accepts a templateLiteral key schema that constrains every key.
  'TEMPLATE_LITERAL.template_literal_index_key': {
    buildErrors: () => {
      const schema = z.record(z.templateLiteral(['api/', z.string()]), z.number());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // template_literal_union_placeholder: 'a-<number>' | 'b-<number>'
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    buildErrors: () => {
      const schema = z.union([z.templateLiteral(['a-', z.number()]), z.templateLiteral(['b-', z.number()])]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': {
    buildErrors: () => {
      const schema = z.map(z.string(), z.number());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NATIVE.set_string': {
    buildErrors: () => {
      const schema = z.set(z.string());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // promise_string: thenable check — any object with typeof .then === 'function'
  'NATIVE.promise_string': {
    buildErrors: () => {
      const schema = z.custom((v) => typeof v === 'object' && v !== null && typeof (v as {then?: unknown}).then === 'function');
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NATIVE.awaited_promise': {
    buildErrors: () => {
      const schema = z.string();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'CIRCULAR.array_of_union_with_self_ref': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.array(z.union([z.date(), z.number(), z.string(), z.lazy(() => schema)]));
        return schema;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'CIRCULAR.object_with_tuple_prop': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          tuple: z.tuple([z.bigint()]).rest(z.lazy(() => schema) as z.ZodType),
        });
        return schema;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'CIRCULAR.object_with_index_prop': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // object_deeply_nested: T={deep1:{deep2:{deep3:{} | {deep4:T}}}}; deep4 must satisfy T or be absent
  'CIRCULAR.object_deeply_nested': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const schema: z.ZodType = z.object({
          deep1: z.object({
            deep2: z.object({
              deep3: z.custom((v) => {
                if (typeof v !== 'object' || v === null) return false;
                const obj = v as Record<string, unknown>;
                if ('deep4' in obj) {
                  // if deep4 is present it must be a valid T
                  return schema.safeParse(obj.deep4).success;
                }
                return true; // empty object (no deep4)
              }),
            }),
          }),
        });
        return schema;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // circular_child_under_literal_root: {isRoot:true, ciChild: ICircularDeep}
  // ICircularDeep: {name:string, big:bigint, embedded:{hello:string, child?: ICircularDeep}}
  'CIRCULAR.circular_child_under_literal_root': {
    buildErrors: () => {
      const schema = z.lazy(() => {
        const ciDeep: z.ZodType = z.object({
          name: z.string(),
          big: z.bigint(),
          embedded: z.object({hello: z.string(), child: z.lazy(() => ciDeep).optional()}),
        });
        return z.object({isRoot: z.literal(true), ciChild: ciDeep});
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // multiple_circular_types_cross_referenced: root with ciChild (ICircularDeep) + ciDate (ICircularDate) + optional self-ref
  'CIRCULAR.multiple_circular_types_cross_referenced': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── CIRCULAR_REFS ── (cyclic VALUES; zod has no cyclic-value detection)
  'CIRCULAR_REFS.linked_list_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.tree_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.object_self_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow

  // ── UTILITY ──
  // partial: {name?:string, age?:number, createdAt?:Date} with plain-object guard (rejects arrays/Date/Map/Set)
  // partial: {name?:string, age?:number, createdAt?:Date} — the Partial<> of UTILITY.required, declared
  // as the same interface as mion (idiomatic z.object). See the interface_all_optional note + the
  // correctness todo: zod accepts Date/Map/Set instances where mion rejects them.
  'UTILITY.partial': {
    buildErrors: () => {
      const schema = z.object({
        name: z.string().optional(),
        age: z.number().optional(),
        createdAt: z.date().optional(),
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // required: {name:string, age:number, createdAt:Date}
  'UTILITY.required': {
    buildErrors: () => {
      const schema = z.object({name: z.string(), age: z.number(), createdAt: z.date()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // pick: {name:string, createdAt:Date}
  'UTILITY.pick': {
    buildErrors: () => {
      const schema = z.object({name: z.string(), createdAt: z.date()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // omit: same resolved shape {name:string, createdAt:Date}
  'UTILITY.omit': {
    buildErrors: () => {
      const schema = z.object({name: z.string(), createdAt: z.date()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // exclude_atomic: "name" | "createdAt"
  'UTILITY.exclude_atomic': {
    buildErrors: () => {
      const schema = z.union([z.literal('name'), z.literal('createdAt')]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // extract_atomic: "name" | "createdAt"
  'UTILITY.extract_atomic': {
    buildErrors: () => {
      const schema = z.union([z.literal('name'), z.literal('createdAt')]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // exclude_from_object_union: {kind:'square',x:number} | {kind:'triangle',base:number,height:number}
  'UTILITY.exclude_from_object_union': {
    buildErrors: () => {
      const schema = z.union([
        z.object({kind: z.literal('square'), x: z.number()}),
        z.object({kind: z.literal('triangle'), base: z.number(), height: z.number()}),
      ]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // non_nullable: string | number (no null, no undefined) — valid: string/number; invalid: null/undefined/bool/{}/[]/NaN/Infinity
  'UTILITY.non_nullable': {
    buildErrors: () => {
      const schema = z.union([z.string(), z.number()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // return_type: Date
  'UTILITY.return_type': {
    buildErrors: () => {
      const schema = z.date();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // readonly: {name:string, age:number}
  'UTILITY.readonly': {
    buildErrors: () => {
      const schema = z.object({name: z.string(), age: z.number()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // intersection_with_required_override: {name:string, age?:number, createdAt?:Date}
  'UTILITY.intersection_with_required_override': {
    buildErrors: () => {
      const schema = z.object({name: z.string(), age: z.number().optional(), createdAt: z.date().optional()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // omit_keeping_optional: {b?:number, c:boolean}
  'UTILITY.omit_keeping_optional': {
    buildErrors: () => {
      const schema = z.object({b: z.number().optional(), c: z.boolean()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // keyof_to_literal_union: "name" | "age" | "createdAt"
  'UTILITY.keyof_to_literal_union': {
    buildErrors: () => {
      const schema = z.union([z.literal('name'), z.literal('age'), z.literal('createdAt')]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // typeof_variable_query: {url:string, port:number}
  'UTILITY.typeof_variable_query': {
    buildErrors: () => {
      const schema = z.object({url: z.string(), port: z.number()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // indexed_access_type: string
  'UTILITY.indexed_access_type': {
    buildErrors: () => {
      const schema = z.string();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // conditional_type_resolved: boolean (IsString<"hello"> resolves to boolean)
  'UTILITY.conditional_type_resolved': {
    buildErrors: () => {
      const schema = z.boolean();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // mapped_type_custom: {a:string|null, b:number|null}
  'UTILITY.mapped_type_custom': {
    buildErrors: () => {
      const schema = z.object({a: z.union([z.string(), z.null()]), b: z.union([z.number(), z.null()])});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // mapped_type_with_conditional_value: complex per-prop conditional shapes
  'UTILITY.mapped_type_with_conditional_value': {
    buildErrors: () => {
      const schema = z.object({
        name: z.object({kind: z.literal('text'), value: z.string()}),
        age: z.object({kind: z.literal('number'), value: z.number(), min: z.number().optional()}),
        admin: z.object({kind: z.literal('checkbox'), value: z.boolean()}),
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // distributive_conditional_over_union: {w:string} | {w:number}
  'UTILITY.distributive_conditional_over_union': {
    buildErrors: () => {
      const schema = z.union([z.object({w: z.string()}), z.object({w: z.number()})]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // deep_partial_recursive_mapped: {display?:{theme?:'light'|'dark', brightness?:number}, audio?:{volume?:number, muted?:boolean}}
  // declared as the same nested interface as mion (idiomatic nested z.object). See the
  // interface_all_optional note + the correctness todo: zod accepts Date/Map/Set instances where
  // mion rejects them (the outer/nested plain-object discrepancy).
  'UTILITY.deep_partial_recursive_mapped': {
    buildErrors: () => {
      const schema = z.object({
        display: z
          .object({theme: z.enum(['light', 'dark']).optional(), brightness: z.number().optional()})
          .optional(),
        audio: z.object({volume: z.number().optional(), muted: z.boolean().optional()}).optional(),
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── TYPE_MAPPINGS ──
  // key_prefix_rename: resolves to {user_id:number, user_name:string}
  'TYPE_MAPPINGS.key_prefix_rename': {
    buildErrors: () => {
      const schema = z.object({user_id: z.number(), user_name: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // key_conditional_rename: {_id:number, name:string, createdAt:Date}
  'TYPE_MAPPINGS.key_conditional_rename': {
    buildErrors: () => {
      const schema = z.object({_id: z.number(), name: z.string(), createdAt: z.date()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // key_filter_via_never: {id:number, name:string} (secret dropped)
  'TYPE_MAPPINGS.key_filter_via_never': {
    buildErrors: () => {
      const schema = z.object({id: z.number(), name: z.string()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── DATETIME ──
  'DATETIME.date': {
    buildErrors: () => {
      const schema = z.date();
      return (value: unknown) => schema.safeParse(value).success;
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
    buildErrors: () => {
      const schema = z.string().max(5);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_minLength': {
    buildErrors: () => {
      const schema = z.string().min(3);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_length': {
    buildErrors: () => {
      const schema = z.string().length(4);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_range': {
    buildErrors: () => {
      const schema = z.string().min(2).max(4);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedChars': {
    buildErrors: () => {
      const schema = z.string().regex(/^[0-9a-f]+$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': {
    buildErrors: () => {
      const schema = z.string().regex(/^[abc]+$/i);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedChars_literal': {
    buildErrors: () => {
      const schema = z.string().regex(/^[.\-]+$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    buildErrors: () => {
      const schema = z.string().regex(/^[^!@#]*$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    buildErrors: () => {
      const schema = z.enum(['red', 'green', 'blue']);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': {
    buildErrors: () => {
      const schema = z.string().regex(/^(red|green)$/i);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_allowedValues_escaped': {
    buildErrors: () => {
      const schema = z.enum(['a.b', 'c+d']);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_disallowedValues': {
    buildErrors: () => {
      const schema = z.string().refine((s) => !['admin', 'root'].includes(s));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    buildErrors: () => {
      const schema = z.enum(['a', 'b']);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.alpha': {
    buildErrors: () => {
      const schema = z.string().regex(/^[A-Za-z]+$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    buildErrors: () => {
      const schema = z.string().regex(/^[A-Za-z0-9]+$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.numeric': {
    buildErrors: () => {
      const schema = z.string().regex(/^[0-9]+$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.alpha_withLength': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^[A-Za-z]+$/)
        .max(3);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.lowercase_validate': {
    buildErrors: () => {
      const schema = z.string();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // uuidv4: first-class zod 4 builder (rejects v7 and the no-dash / non-uuid variants)
  'STRING_FORMAT.uuidv4': {
    buildErrors: () => {
      const schema = z.uuidv4();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // uuidv7: first-class zod 4 builder
  'STRING_FORMAT.uuidv7': {
    buildErrors: () => {
      const schema = z.uuidv7();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_iso: YYYY-MM-DD — z.iso.date() validates ISO layout AND calendar correctness (2023-02-29 rejected)
  'STRING_FORMAT.date_iso': {
    buildErrors: () => {
      const schema = z.iso.date();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_DMY: DD-MM-YYYY with calendar validity
  'STRING_FORMAT.date_DMY': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\d{2}-\d{2}-\d{4}$/)
        .refine((s) => {
          const [dd, mm, yyyy] = s.split('-');
          const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
          return !isNaN(d.getTime()) && d.getUTCDate() === +dd && d.getUTCMonth() + 1 === +mm;
        });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_YM: YYYY-MM (no day)
  'STRING_FORMAT.date_YM': {
    buildErrors: () => {
      const schema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_MD: MM-DD (no year) — note: 02-29 is valid (leap-day without year context), 13-01 invalid
  'STRING_FORMAT.date_MD': {
    buildErrors: () => {
      const schema = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_minMax_absolute: 2020-01-01..2020-12-31 inclusive
  'STRING_FORMAT.date_minMax_absolute': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((s) => s >= '2020-01-01' && s <= '2020-12-31');
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // time_iso: HH:mm:ss with timezone (Z or ±HH:MM)
  'STRING_FORMAT.time_iso': {
    buildErrors: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // time_HHmmss: HH:mm:ss, 00:00:00..23:59:59
  'STRING_FORMAT.time_HHmmss': {
    buildErrors: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // time_HHmmss_ms: HH:mm:ss[.mmm] optional milliseconds (exactly 1-3 digits)
  'STRING_FORMAT.time_HHmmss_ms': {
    buildErrors: () => {
      const schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // time_minMax_absolute: 09:00..17:00 (accepts HH:mm format too)
  'STRING_FORMAT.time_minMax_absolute': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .refine((s) => s >= '09:00' && s <= '17:00');
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // dateTime_default: ISO 8601 datetime — z.iso.datetime({offset:true}) requires the T separator,
  // accepts Z or ±HH:MM offsets, and validates calendar correctness (2023-02-29 rejected).
  'STRING_FORMAT.dateTime_default': {
    buildErrors: () => {
      const schema = z.iso.datetime({offset: true});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // dateTime_custom: DD-MM-YYYY HH:mm with calendar validity
  'STRING_FORMAT.dateTime_custom': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\d{2}-\d{2}-\d{4} ([01]\d|2[0-3]):[0-5]\d$/)
        .refine((s) => {
          const [date] = s.split(' ');
          const [dd, mm, yyyy] = date.split('-');
          const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
          return !isNaN(d.getTime()) && d.getUTCDate() === +dd && d.getUTCMonth() + 1 === +mm;
        });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // dateTime_minMax_absolute: 2020-01-01T00:00:00..2020-12-31T23:59:59 (no tz suffix in samples)
  'STRING_FORMAT.dateTime_minMax_absolute': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
        .refine((s) => s >= '2020-01-01T00:00:00' && s <= '2020-12-31T23:59:59');
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // ipv4: dotted-quad, each octet 0-255
  'STRING_FORMAT.ipv4': {
    buildErrors: () => {
      const schema = z.ipv4();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // ipv6: colon-separated
  'STRING_FORMAT.ipv6': {
    buildErrors: () => {
      const schema = z.ipv6();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // ip_any: v4 or v6
  'STRING_FORMAT.ip_any': {
    buildErrors: () => {
      const schema = z.union([z.ipv4(), z.ipv6()]);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // ipv4_port: v4:port where port ≤ 65535 — zod ipv4() doesn't include port
  'STRING_FORMAT.ipv4_port': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^(\d{1,3}\.){3}\d{1,3}:\d+$/)
        .refine((s) => {
          const [ip, portStr] = s.split(':');
          const port = +portStr;
          if (port < 0 || port > 65535) return false;
          return ip.split('.').every((o) => +o >= 0 && +o <= 255);
        });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // ipv6_port: [v6]:port where port ≤ 65535
  'STRING_FORMAT.ipv6_port': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^\[.+\]:\d+$/)
        .refine((s) => {
          const lastColon = s.lastIndexOf(':');
          const port = +s.slice(lastColon + 1);
          return port >= 0 && port <= 65535;
        });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // domain: standard domain (2+ labels, TLD ≥ 2 chars, no leading hyphen)
  'STRING_FORMAT.domain': {
    buildErrors: () => {
      const schema = z.string().regex(/^(?!-)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // domainStrict: 2-6 labels, no leading/trailing hyphen per label, no digit-only TLD, no underscore
  // valid: 'mion.io','sub.example.com','aa.bb.cc.dd.ee.com' (6 labels)
  // invalid: 'aa.bb.cc.dd.ee.ff.com' (7 labels), '-bad.com', 'example.123', 'ex_ample.com', 'localhost'
  'STRING_FORMAT.domainStrict': {
    buildErrors: () => {
      const schema = z.string().refine((s) => {
        const parts = s.split('.');
        if (parts.length < 2 || parts.length > 6) return false;
        const tld = parts[parts.length - 1];
        if (/^\d+$/.test(tld)) return false; // TLD must not be all digits
        for (const part of parts) {
          if (!part || part.startsWith('-') || part.endsWith('-')) return false;
          if (!/^[A-Za-z0-9-]+$/.test(part)) return false; // no underscore
        }
        return true;
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // email: zod 4 first-class z.email() builder. The case requires a localPart ≥2 chars and a first
  // domain label ≥2 chars (e.g. 'a@b.co' is rejected), which zod's default email regex does not enforce,
  // so we pass the case's pattern via the builder's {pattern} option rather than hand-rolling a refine.
  'STRING_FORMAT.email': {
    buildErrors: () => {
      const schema = z.email({pattern: /^[A-Za-z0-9.+_-]{2,}@([A-Za-z0-9][A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // emailPunycode: email with punycode TLD (xn--...)
  'STRING_FORMAT.emailPunycode': {
    buildErrors: () => {
      const schema = z
        .string()
        .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
        .refine((s) => {
          const [, domain] = s.split('@');
          return !!domain && domain.includes('.');
        });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // emailStrict: no + in local part, no spaces, no double @, no underscore in domain
  'STRING_FORMAT.emailStrict': {
    buildErrors: () => {
      const schema = z.string().regex(/^[a-zA-Z0-9.]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // url: http/ftp/ws/wss schemes (mailto rejected); zod strips trailing ':' from protocol before testing regex
  'STRING_FORMAT.url': {
    buildErrors: () => {
      const schema = z.url({protocol: /^(https?|ftps?|wss?)$/});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // urlHttp: http(s) only
  'STRING_FORMAT.urlHttp': {
    buildErrors: () => {
      const schema = z.httpUrl();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // urlFile: file:// URLs; zod strips trailing ':' from protocol before testing
  'STRING_FORMAT.urlFile': {
    buildErrors: () => {
      const schema = z.url({protocol: /^file$/});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    buildErrors: () => {
      const schema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    buildErrors: () => {
      const schema = z.string().regex(/^[0-9a-fA-F]+$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {
    buildErrors: () => {
      const schema = z.number().max(100);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_min': {
    buildErrors: () => {
      const schema = z.number().min(0);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_lt': {
    buildErrors: () => {
      const schema = z.number().lt(10);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_gt': {
    buildErrors: () => {
      const schema = z.number().gt(0);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_integer': {
    buildErrors: () => {
      const schema = z.number().int();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // FormatFloat carries no failable constraint, so the equivalent zod schema is a
  // plain number: whole values are legal floats.
  'NUMBER_FORMAT.number_float': {
    buildErrors: () => {
      const schema = z.number();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_multipleOf': {
    buildErrors: () => {
      const schema = z.number().multipleOf(5);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_combined': {
    buildErrors: () => {
      const schema = z.number().int().min(0).max(100).multipleOf(5);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    buildErrors: () => {
      const schema = z.number().int().min(-128).max(127);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    buildErrors: () => {
      const schema = z.number().int().min(0).max(255);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': {
    buildErrors: () => {
      const schema = z.bigint().lte(100n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_min': {
    buildErrors: () => {
      const schema = z.bigint().gte(0n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_lt': {
    buildErrors: () => {
      const schema = z.bigint().lt(10n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_gt': {
    buildErrors: () => {
      const schema = z.bigint().gt(0n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_multipleOf': {
    buildErrors: () => {
      const schema = z.bigint().multipleOf(5n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_combined': {
    buildErrors: () => {
      const schema = z.bigint().gte(0n).lte(1000n).multipleOf(10n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_int64': {
    buildErrors: () => {
      const schema = z.bigint().gte(-9223372036854775808n).lte(9223372036854775807n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'BIGINT_FORMAT.bigint_uint64': {
    buildErrors: () => {
      const schema = z.bigint().gte(0n).lte(18446744073709551615n);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── DATETIME ──
  // date_minmax: inclusive bounds — zod 4's z.date().min()/.max() are inclusive and reject Invalid Date
  'DATETIME.date_minmax': {
    buildErrors: () => {
      const schema = z.date().min(new Date(Date.UTC(2020, 0, 1))).max(new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'DATETIME.date_gtlt': {
    buildErrors: () => {
      const schema = z
        .date()
        .refine((d) => d > new Date(Date.UTC(2020, 0, 1, 0, 0, 0)) && d < new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_min_lt: inclusive lower via z.date().min(); the exclusive upper (lt) has no native builder, so refine
  'DATETIME.date_min_lt': {
    buildErrors: () => {
      const schema = z
        .date()
        .min(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)))
        .refine((d) => d < new Date(Date.UTC(2020, 11, 31, 23, 59, 59)));
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_max_now: inclusive upper bound (now) via z.date().max()
  'DATETIME.date_max_now': {
    buildErrors: () => {
      const schema = z.date().max(new Date());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_rel_window: inclusive relative window via z.date().min()/.max() over computed bounds
  'DATETIME.date_rel_window': {
    buildErrors: () => {
      const now = new Date();
      const minDate = new Date(now);
      minDate.setFullYear(minDate.getFullYear() - 1000);
      const maxDate = new Date(now);
      maxDate.setFullYear(maxDate.getFullYear() + 1000);
      const schema = z.date().min(minDate).max(maxDate);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  // date_rel_datetime_components: inclusive lower bound (now - 1000y - 12h) via z.date().min()
  'DATETIME.date_rel_datetime_components': {
    buildErrors: () => {
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 1000);
      minDate.setHours(minDate.getHours() - 12);
      const schema = z.date().min(minDate);
      return (value: unknown) => schema.safeParse(value).success;
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'REALWORLD.order': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'REALWORLD.blogPost': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'REALWORLD.product': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'REALWORLD.productPage': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'REALWORLD.registrationForm': {
    buildErrors: () => {
      const schema = z.object({
        email: z.string(),
        password: z.string(),
        acceptedTerms: z.literal(true),
        profile: z.object({firstName: z.string(), lastName: z.string(), age: z.number().optional()}),
      });
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'REALWORLD.toBeChecked': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── JSON_SCHEMA ──
  // zod has no JSON Schema INPUT door (it emits with z.toJSONSchema but cannot
  // build a validator from one), so these entries state the same CONSTRAINT in
  // zod's own dialect, exactly like every other group here. Only the keywords
  // zod genuinely cannot express opt out.
  'JSON_SCHEMA.property_names': {
    buildErrors: () => {
      const schema = z.record(z.string().regex(/^[a-z]+$/), z.number());
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'JSON_SCHEMA.contains_count': NOT_SUPPORTED, // no array `contains` / count-of-matching-items check
  'JSON_SCHEMA.unique_items': NOT_SUPPORTED, // no array uniqueness check
  'JSON_SCHEMA.object_size': NOT_SUPPORTED, // no key-count bounds on objects
  'JSON_SCHEMA.string_email': {
    buildErrors: () => {
      const schema = z.email();
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'JSON_SCHEMA.int_bounded': {
    buildErrors: () => {
      const schema = z.int().min(0).max(130);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'JSON_SCHEMA.string_pattern': {
    buildErrors: () => {
      const schema = z.string().regex(/^[a-z][a-z0-9-]*$/);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'JSON_SCHEMA.multiple_of': {
    buildErrors: () => {
      const schema = z.number().multipleOf(5);
      return (value: unknown) => schema.safeParse(value).success;
    },
  },

  // ── STRICT ──
  // z.strictObject is zod's closedness; nested objects are strict too. zod has no
  // cheap boolean validator, so (as everywhere here) only buildErrors is supplied.
  'STRICT.flat_required': {
    buildErrors: () => {
      const schema = z.strictObject({id: z.number(), name: z.string(), active: z.boolean()});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRICT.nested_required': {
    buildErrors: () => {
      const schema = z.strictObject({name: z.string(), inner: z.strictObject({x: z.number(), y: z.string()})});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRICT.moltar_dto': {
    buildErrors: () => {
      const schema = z.strictObject({number: z.number(), negNumber: z.number(), maxNumber: z.number(), string: z.string(), longString: z.string(), boolean: z.boolean(), deeplyNested: z.strictObject({foo: z.string(), num: z.number(), bool: z.boolean()})});
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
  'STRICT.realworld_order': {
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
      return (value: unknown) => schema.safeParse(value).success;
    },
  },
};
