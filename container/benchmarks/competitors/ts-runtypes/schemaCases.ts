// ts-runtypes validators keyed by suite case key ("GROUP.case"), BUILDER form.
// Each entry is the case's own `validateSchema` thunk copied VERBATIM from the
// shared suites (container/benchmarks/src/suites/**) — a
// `() => createValidateFn(RT.…)` arrow built from the `ts-runtypes/builders`
// surface instead of a literal type argument. Consumed by typecost ONLY (it is
// NOT imported by main.ts). Cases whose value-first form can't be authored
// (`validateSchema: 'not-supported'`) or that render an alwaysThrow factory
// (`factoryThrows`) opt out with NOT_SUPPORTED. TOTAL over every key.

import * as TF from '@ts-runtypes/core/formats';
import * as TFT from '@ts-runtypes/core/formats/temporal';
import {createValidateFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

export const schemaCases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': () => createValidateFn(RT.any()),
  'ATOMIC.bigint': () => createValidateFn(TF.bigInt()),
  'ATOMIC.boolean': () => createValidateFn(RT.boolean()),
  'ATOMIC.date': () => createValidateFn(TF.date()),
  'ATOMIC.enum_mixed': () => {
    enum Color {
      Red,
      Green = 'green',
      Blue = 2,
    }
    return createValidateFn(RT.enum(Color));
  },
  'ATOMIC.literal_2': () => createValidateFn(RT.literal(2)),
  'ATOMIC.literal_a': () => createValidateFn(RT.literal('a')),
  'ATOMIC.literal_true': () => createValidateFn(RT.literal(true)),
  'ATOMIC.literal_1n': () => createValidateFn(RT.literal(1n)),
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // validateSchema not-supported
  'ATOMIC.never': () => createValidateFn(RT.never()),
  'ATOMIC.null': () => createValidateFn(RT.literal(null)),
  'ATOMIC.number': () => createValidateFn(TF.number()),
  'ATOMIC.object': NOT_SUPPORTED, // validateSchema not-supported
  'ATOMIC.regexp': () => createValidateFn(RT.regexp()),
  'ATOMIC.string': () => createValidateFn(TF.string()),
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.undefined': () => createValidateFn(RT.literal(undefined)),
  'ATOMIC.void': () => createValidateFn(RT.void()),
  'ATOMIC.literal_2_noLiterals': () => createValidateFn(RT.literal(2), {noLiterals: true}),
  'ATOMIC.literal_a_noLiterals': () => createValidateFn(RT.literal('a'), {noLiterals: true}),
  'ATOMIC.literal_regexp_noLiterals': () => createValidateFn(RT.regexp(), {noLiterals: true}),
  'ATOMIC.literal_true_noLiterals': () => createValidateFn(RT.literal(true), {noLiterals: true}),
  'ATOMIC.literal_1n_noLiterals': () => createValidateFn(RT.literal(1n), {noLiterals: true}),
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.unknown': () => createValidateFn(RT.unknown()),

  // ── ARRAY ──
  'ARRAY.string_array': () => createValidateFn(RT.array(TF.string())),
  'ARRAY.number_array': () => createValidateFn(RT.array(TF.number())),
  'ARRAY.boolean_array': () => createValidateFn(RT.array(RT.boolean())),
  'ARRAY.bigint_array': () => createValidateFn(RT.array(TF.bigInt())),
  'ARRAY.date_array': () => createValidateFn(RT.array(TF.date())),
  'ARRAY.regexp_array': () => createValidateFn(RT.array(RT.regexp())),
  'ARRAY.undefined_array': () => createValidateFn(RT.array(RT.literal(undefined))),
  'ARRAY.null_array': () => createValidateFn(RT.array(RT.literal(null))),
  'ARRAY.array_generic': () => createValidateFn(RT.array(TF.string())),
  'ARRAY.string_array_2d': () => createValidateFn(RT.array(RT.array(TF.string()))),
  'ARRAY.string_array_3d': () => createValidateFn(RT.array(RT.array(RT.array(TF.string())))),
  'ARRAY.string_array_noIsArrayCheck': () => createValidateFn(RT.array(TF.string()), {noIsArrayCheck: true}),
  'ARRAY.object_array': () => createValidateFn(RT.array(RT.object({a: TF.string()}))),
  'ARRAY.union_array': () => createValidateFn(RT.array(RT.union([TF.string(), TF.number()]))),
  'ARRAY.tuple_array': () => createValidateFn(RT.array(RT.tuple([TF.string(), TF.number()]))),
  'ARRAY.circular_array': () => {
    const ca = RT.circular(RT.array(RT.self()));
    return createValidateFn(ca);
  },
  'ARRAY.circular_object_with_array': () => {
    const ot = RT.circular(
      RT.object({
        a: TF.string(),
        deep: RT.optional(RT.object({b: TF.string(), c: TF.number()})),
        d: RT.optional(RT.array(RT.self())),
      })
    );
    return createValidateFn(ot);
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // factoryThrows
  'ARRAY.readonly_string_array': () => createValidateFn(RT.array(TF.string())),

  // ── OBJECT ──
  'OBJECT.simple_interface': () => createValidateFn(RT.object({a: TF.string(), b: TF.number()})),
  'OBJECT.object_as_const_literals': () =>
    createValidateFn(
      RT.object({name: RT.propMod({readonly: true}, RT.literal('john')), age: RT.propMod({readonly: true}, RT.literal(30))})
    ),
  'OBJECT.object_via_return_type_utility': () => createValidateFn(RT.object({id: TF.number(), name: TF.string()})),
  'OBJECT.object_via_property_access': () => createValidateFn(RT.object({id: TF.number(), name: TF.string()})),
  'OBJECT.object_via_array_access': () => createValidateFn(RT.object({id: TF.number(), name: TF.string()})),
  'OBJECT.interface_with_optional': () => createValidateFn(RT.object({a: TF.string(), b: RT.optional(TF.number())})),
  'OBJECT.interface_with_date': () => createValidateFn(RT.object({date: TF.date(), name: TF.string()})),
  'OBJECT.interface_with_method': () => createValidateFn(RT.object({name: TF.string(), cb: RT.func([], RT.any())})),
  'OBJECT.nested_object': () => createValidateFn(RT.object({a: TF.string(), deep: RT.object({b: TF.string(), c: TF.number()})})),
  'OBJECT.interface_string_array_prop': () => createValidateFn(RT.object({tags: RT.array(TF.string())})),
  'OBJECT.circular_interface': () => {
    const ic = RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}));
    return createValidateFn(ic);
  },
  'OBJECT.circular_interface_on_array': () => {
    const ica = RT.circular(RT.object({name: TF.string(), children: RT.optional(RT.array(RT.self()))}));
    return createValidateFn(ica);
  },
  'OBJECT.circular_interface_on_nested_object': () => {
    const icd = RT.circular(
      RT.object({
        name: TF.string(),
        embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())}),
      })
    );
    return createValidateFn(icd);
  },
  'OBJECT.index_signature_string': () => createValidateFn(RT.record(TF.string())),
  'OBJECT.index_signature_named_props': () =>
    createValidateFn(RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))),
  'OBJECT.index_signature_nested': () => createValidateFn(RT.record(RT.record(TF.number()))),
  'OBJECT.index_signature_date_value': () => createValidateFn(RT.record(RT.record(TF.date()))),
  'OBJECT.index_signature_non_root': () =>
    createValidateFn(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
  'OBJECT.function_top_level': () => createValidateFn(RT.func()),
  'OBJECT.interface_callable': () =>
    createValidateFn(RT.callable(RT.func([TF.number(), RT.boolean()], TF.string()), RT.object({extra: TF.string()}))),
  'OBJECT.interface_all_optional': () => createValidateFn(RT.object({a: RT.optional(TF.string()), b: RT.optional(TF.number())})),
  'OBJECT.class_simple': () => {
    class MySerializableClass {
      date: Date;
      name: string;
      constructor(date: Date, name: string) {
        this.date = date;
        this.name = name;
      }
      someMethod() {
        return 'unused';
      }
    }
    return createValidateFn(RT.classType(MySerializableClass));
  },
  'OBJECT.rpc_error_class': () => {
    class RpcError<ErrType extends string> {
      public readonly 'mion@isΣrrθr': true = true;
      public readonly type: ErrType;
      public readonly publicMessage: string;
      public readonly id?: string;
      constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
        this.type = args.type;
        this.publicMessage = args.publicMessage;
        this.id = args.id;
      }
    }
    return createValidateFn(RT.classType<RpcError<'test-error'>>(RpcError));
  },
  'OBJECT.call_signature_params': () => createValidateFn(RT.parameters(RT.func([TF.number(), RT.boolean()], TF.string()))),
  'OBJECT.call_signature_params_with_optional': () =>
    createValidateFn(RT.parameters(RT.func(RT.tuple([TF.number(), RT.boolean()], [TF.string()])))),
  'OBJECT.call_signature_params_with_rest': () =>
    createValidateFn(RT.parameters(RT.func(RT.tuple([TF.number(), RT.boolean()], TF.date())))),
  'OBJECT.record_union_keys': () => createValidateFn(RT.object({a: TF.number(), b: TF.number()})),
  'OBJECT.union_value_index': () => createValidateFn(RT.record(RT.union([TF.string(), TF.number()]))),
  'OBJECT.object_with_union_prop': () =>
    createValidateFn(RT.object({kind: RT.union([RT.literal('a'), RT.literal('b')]), n: TF.number()})),
  'OBJECT.interface_inheritance': () => createValidateFn(RT.object({a: TF.string(), b: TF.number()})),
  'OBJECT.class_inheritance': () => {
    class Base {
      a: string = '';
    }
    class Sub extends Base {
      b: number = 0;
    }
    return createValidateFn(RT.classType(Sub));
  },
  'OBJECT.index_signature_number_key': () => createValidateFn(RT.record(TF.number(), TF.string())),

  // ── TUPLE ──
  'TUPLE.string_number_pair': () => createValidateFn(RT.tuple([TF.string(), TF.number()])),
  'TUPLE.full_mion_tuple': () =>
    createValidateFn(RT.tuple([TF.date(), TF.number(), TF.string(), RT.literal(null), RT.array(TF.string()), TF.bigInt()])),
  'TUPLE.tuple_with_optional': () => createValidateFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
  'TUPLE.nested_tuple_in_array': () => createValidateFn(RT.array(RT.tuple([TF.string(), TF.number()]))),
  'TUPLE.tuple_rest': () => createValidateFn(RT.tuple([TF.number()], TF.string())),
  'TUPLE.tuple_circular': NOT_SUPPORTED, // validateSchema not-supported
  'TUPLE.tuple_multiple_trailing_optionals': () =>
    createValidateFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
  'TUPLE.tuple_named_labels': () => createValidateFn(RT.tuple([TF.string(), TF.number()])),
  'TUPLE.tuple_with_non_serializable': () => createValidateFn(RT.tuple([TF.number(), RT.func([], RT.any())])),
  'TUPLE.empty_tuple': () => createValidateFn(RT.tuple([])),
  'TUPLE.single_element_tuple': () => createValidateFn(RT.tuple([TF.string()])),
  'TUPLE.readonly_tuple': () => createValidateFn(RT.tuple([TF.string(), TF.number()])),

  // ── UNION ──
  'UNION.atomic_union': () => createValidateFn(RT.union([TF.date(), TF.number(), TF.string(), RT.literal(null), TF.bigInt()])),
  'UNION.string_literal_union': () => createValidateFn(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
  'UNION.large_union_eight_arms': () =>
    createValidateFn(
      RT.union([
        RT.literal('a'),
        RT.literal('b'),
        TF.number(),
        RT.boolean(),
        RT.literal(null),
        RT.object({a: TF.string()}),
        RT.object({a: TF.string(), b: TF.number()}),
        RT.object({c: TF.bigInt()}),
      ])
    ),
  'UNION.string_or_number': () => createValidateFn(RT.union([TF.string(), TF.number()])),
  'UNION.union_of_array_types': () =>
    createValidateFn(RT.union([RT.array(TF.string()), RT.array(TF.number()), RT.array(RT.boolean())])),
  'UNION.array_of_union': () => createValidateFn(RT.array(RT.union([TF.string(), TF.bigInt(), RT.boolean(), TF.date()]))),
  'UNION.union_of_object_shapes': () =>
    createValidateFn(
      RT.union([RT.object({a: TF.string(), aa: RT.boolean()}), RT.object({b: TF.number()}), RT.object({c: TF.bigInt()})])
    ),
  'UNION.discriminated_union': () =>
    createValidateFn(
      RT.union([RT.object({kind: RT.literal('a'), n: TF.number()}), RT.object({kind: RT.literal('b'), s: TF.string()})])
    ),
  'UNION.circular_union': () => {
    const uc = RT.circular(
      RT.union([
        TF.date(),
        TF.number(),
        TF.string(),
        RT.object({a: RT.optional(RT.self()), b: RT.optional(TF.string())}),
        RT.array(RT.self()),
      ])
    );
    return createValidateFn(uc);
  },
  'UNION.union_with_methods': () =>
    createValidateFn(
      RT.union([
        RT.object({name: TF.string(), getName: RT.func([], TF.string())}),
        RT.object({age: TF.number(), getAge: RT.func([], TF.number())}),
      ])
    ),
  'UNION.intersection_to_object': () => createValidateFn(RT.intersection(RT.object({a: TF.string()}), RT.object({b: TF.number()}))),
  'UNION.union_with_index_arm': () =>
    createValidateFn(
      RT.union([
        RT.object({a: TF.string(), aa: RT.boolean()}),
        RT.object({b: TF.number()}),
        RT.intersection(RT.record(TF.bigInt()), RT.object({c: TF.bigInt()})),
      ])
    ),
  'UNION.union_same_prop_different_types': () =>
    createValidateFn(
      RT.union([
        RT.object({type: RT.literal('a'), prop: RT.boolean()}),
        RT.object({type: RT.literal('b'), prop: TF.number()}),
        RT.object({type: RT.literal('c'), prop: TF.string()}),
      ])
    ),
  'UNION.union_mixed_arrays_and_objects': () =>
    createValidateFn(
      RT.union([
        RT.array(TF.string()),
        RT.array(TF.number()),
        RT.array(RT.boolean()),
        RT.object({a: TF.string(), aa: RT.boolean()}),
        RT.object({b: TF.number()}),
        RT.object({c: TF.bigInt(), aa: RT.literal('string')}),
      ])
    ),
  'UNION.union_merged_property': () => createValidateFn(RT.union([RT.object({a: RT.boolean()}), RT.object({a: TF.number()})])),
  'UNION.union_mixed_with_index': () =>
    createValidateFn(
      RT.union([
        RT.array(TF.string()),
        RT.object({a: TF.string(), aa: RT.boolean()}),
        RT.object({b: TF.number()}),
        RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()})),
        RT.intersection(RT.record(TF.bigInt()), RT.object({b: TF.bigInt()})),
      ])
    ),
  'UNION.union_with_any_fallback': () => createValidateFn(RT.any()),
  'UNION.union_with_unknown_fallback': () => createValidateFn(RT.unknown()),
  'UNION.union_subset_small_first': () =>
    createValidateFn(RT.union([RT.object({a: TF.string()}), RT.object({a: TF.string(), b: TF.number()})])),
  'UNION.union_subset_nested_levels': () =>
    createValidateFn(
      RT.union([
        RT.object({x: TF.string()}),
        RT.object({x: TF.string(), y: TF.number()}),
        RT.object({x: TF.string(), y: TF.number(), z: RT.boolean()}),
      ])
    ),
  'UNION.union_subset_mixed_related_unrelated': () =>
    createValidateFn(
      RT.union([RT.object({id: TF.string()}), RT.object({id: TF.string(), name: TF.string()}), RT.object({value: TF.number()})])
    ),

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': () => createValidateFn(RT.templateLiteral(['api/user/', TF.number()])),
  'TEMPLATE_LITERAL.multi_segment_url': () =>
    createValidateFn(RT.templateLiteral(['/api/v', TF.number(), '/user/', TF.string(), '/posts/', TF.number()])),
  'TEMPLATE_LITERAL.leading_string_placeholder': () => createValidateFn(RT.templateLiteral([TF.string(), '/', TF.number()])),
  'TEMPLATE_LITERAL.regex_special_chars': () => createValidateFn(RT.templateLiteral(['(', TF.number(), ')'])),
  'TEMPLATE_LITERAL.template_literal_nested_in_object': () =>
    createValidateFn(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
  'TEMPLATE_LITERAL.template_literal_index_key': () =>
    createValidateFn(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
  'TEMPLATE_LITERAL.template_literal_union_placeholder': () =>
    createValidateFn(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', TF.number()])),

  // ── NATIVE ──
  'NATIVE.map_string_number': () => createValidateFn(RT.map(TF.string(), TF.number())),
  'NATIVE.set_string': () => createValidateFn(RT.set(TF.string())),
  'NATIVE.promise_string': () => createValidateFn(RT.promise(TF.string())),
  'NATIVE.awaited_promise': () => createValidateFn(TF.string()),

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': () => {
    const cir = RT.circular(
      RT.object({
        n: TF.number(),
        s: TF.string(),
        c: RT.optional(RT.self()),
        d: RT.optional(TF.date()),
      })
    );
    return createValidateFn(cir);
  },
  'CIRCULAR.array_of_union_with_self_ref': () => {
    const cu = RT.circular(RT.array(RT.union([RT.self(), TF.date(), TF.number(), TF.string()])));
    return createValidateFn(cu);
  },
  'CIRCULAR.object_with_tuple_prop': () => {
    const ct = RT.circular(RT.object({tuple: RT.tuple([TF.bigInt()], [RT.self()])}));
    return createValidateFn(ct);
  },
  'CIRCULAR.object_with_index_prop': () => {
    const ci = RT.circular(RT.object({index: RT.record(RT.self())}));
    return createValidateFn(ci);
  },
  'CIRCULAR.object_deeply_nested': () => {
    const cd = RT.circular(
      RT.object({
        deep1: RT.object({
          deep2: RT.object({deep3: RT.object({deep4: RT.optional(RT.self())})}),
        }),
      })
    );
    return createValidateFn(cd);
  },
  'CIRCULAR.circular_child_under_literal_root': () => {
    // The recursive child is a `circular(...)`; the non-circular root is a plain
    // schema referencing it — no hand-written types at all.
    const icd = RT.circular(
      RT.object({
        name: TF.string(),
        big: TF.bigInt(),
        embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())}),
      })
    );
    const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
    return createValidateFn(root);
  },
  'CIRCULAR.multiple_circular_types_cross_referenced': () => {
    // Mutual recursion, no types: each type's OWN back-edge uses `self`;
    // cross-references to an already-declared run-type are plain const refs.
    const icd = RT.circular(
      RT.object({
        name: TF.string(),
        big: TF.bigInt(),
        embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())}),
      })
    );
    const icDate = RT.circular(
      RT.object({
        date: TF.date(),
        month: TF.number(),
        year: TF.number(),
        embedded: RT.optional(RT.self()),
        deep: RT.optional(icd),
      })
    );
    const root = RT.circular(
      RT.object({
        isRoot: RT.literal(true),
        ciChild: icd,
        ciRoort: RT.optional(RT.self()),
        ciDate: icDate,
      })
    );
    return createValidateFn(root);
  },

  // ── CIRCULAR_REFS ──
  // The runtime cycle-rejection lane (`rejectCircularRefs`), value-first twins of
  // the type-first entries in cases.ts.
  'CIRCULAR_REFS.linked_list_cycle': () => {
    const node = RT.circular(RT.object({value: TF.number(), next: RT.union([RT.self(), RT.literal(null)])}));
    return createValidateFn(node, {rejectCircularRefs: true});
  },
  'CIRCULAR_REFS.tree_cycle': () => {
    const node = RT.circular(RT.object({label: TF.string(), children: RT.array(RT.self())}));
    return createValidateFn(node, {rejectCircularRefs: true});
  },
  'CIRCULAR_REFS.object_self_cycle': () => {
    const node = RT.circular(RT.object({name: TF.string(), next: RT.optional(RT.self())}));
    return createValidateFn(node, {rejectCircularRefs: true});
  },

  // ── UTILITY ──
  'UTILITY.partial': () => createValidateFn(RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}))),
  'UTILITY.required': () =>
    createValidateFn(
      RT.required(RT.object({name: RT.optional(TF.string()), age: RT.optional(TF.number()), createdAt: RT.optional(TF.date())}))
    ),
  'UTILITY.pick': () =>
    createValidateFn(RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['name', 'createdAt'])),
  'UTILITY.omit': () => createValidateFn(RT.omit(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['age'])),
  'UTILITY.exclude_atomic': () =>
    createValidateFn(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]), RT.literal('age'))),
  'UTILITY.extract_atomic': () =>
    createValidateFn(
      RT.extract(
        RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
        RT.union([RT.literal('name'), RT.literal('createdAt')])
      )
    ),
  'UTILITY.exclude_from_object_union': () =>
    createValidateFn(
      RT.exclude(
        RT.union([
          RT.object({kind: RT.literal('circle'), radius: TF.number()}),
          RT.object({kind: RT.literal('square'), x: TF.number()}),
          RT.object({kind: RT.literal('triangle'), base: TF.number(), height: TF.number()}),
        ]),
        RT.object({kind: RT.literal('circle')})
      )
    ),
  'UTILITY.non_nullable': () =>
    createValidateFn(RT.nonNullable(RT.union([TF.string(), TF.number(), RT.literal(null), RT.literal(undefined)]))),
  'UTILITY.return_type': () => createValidateFn(RT.returnType(RT.func([TF.number(), RT.boolean()], TF.date()))),
  'UTILITY.readonly': () => createValidateFn(RT.readonly(RT.object({name: TF.string(), age: TF.number()}))),
  'UTILITY.intersection_with_required_override': () =>
    createValidateFn(
      RT.intersection(
        RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()})),
        RT.required(RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['name']))
      )
    ),
  'UTILITY.omit_keeping_optional': () =>
    createValidateFn(RT.omit(RT.object({a: TF.string(), b: RT.optional(TF.number()), c: RT.boolean()}), ['a'])),
  'UTILITY.keyof_to_literal_union': () =>
    createValidateFn(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
  'UTILITY.typeof_variable_query': () => createValidateFn(RT.object({url: TF.string(), port: TF.number()})),
  'UTILITY.indexed_access_type': () => createValidateFn(TF.string()),
  'UTILITY.conditional_type_resolved': () => createValidateFn(RT.boolean()),
  'UTILITY.mapped_type_custom': () =>
    createValidateFn(RT.object({a: RT.union([TF.string(), RT.literal(null)]), b: RT.union([TF.number(), RT.literal(null)])})),
  'UTILITY.mapped_type_with_conditional_value': () =>
    createValidateFn(
      RT.object({
        name: RT.object({kind: RT.literal('text'), value: TF.string()}),
        age: RT.object({kind: RT.literal('number'), value: TF.number(), min: RT.optional(TF.number())}),
        admin: RT.object({kind: RT.literal('checkbox'), value: RT.boolean()}),
      })
    ),
  'UTILITY.distributive_conditional_over_union': () =>
    createValidateFn(RT.union([RT.object({w: TF.string()}), RT.object({w: TF.number()})])),
  'UTILITY.deep_partial_recursive_mapped': () =>
    createValidateFn(
      RT.object({
        display: RT.optional(
          RT.object({
            theme: RT.optional(RT.union([RT.literal('light'), RT.literal('dark')])),
            brightness: RT.optional(TF.number()),
          })
        ),
        audio: RT.optional(RT.object({volume: RT.optional(TF.number()), muted: RT.optional(RT.boolean())})),
      })
    ),

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': () => createValidateFn(RT.object({user_id: TF.number(), user_name: TF.string()})),
  'TYPE_MAPPINGS.key_conditional_rename': () =>
    createValidateFn(RT.object({_id: TF.number(), name: TF.string(), createdAt: TF.date()})),
  'TYPE_MAPPINGS.key_filter_via_never': () => createValidateFn(RT.object({id: TF.number(), name: TF.string()})),

  // ── DATETIME ──
  'DATETIME.date': () => createValidateFn(TF.date()),
  'DATETIME.instant': () => createValidateFn(TFT.instant()),
  'DATETIME.zonedDateTime': () => createValidateFn(TFT.zonedDateTime()),
  'DATETIME.plainDate': () => createValidateFn(TFT.plainDate()),
  'DATETIME.plainTime': () => createValidateFn(TFT.plainTime()),
  'DATETIME.plainDateTime': () => createValidateFn(TFT.plainDateTime()),
  'DATETIME.plainYearMonth': () => createValidateFn(TFT.plainYearMonth()),
  'DATETIME.plainMonthDay': () => createValidateFn(TFT.plainMonthDay()),
  'DATETIME.duration': () => createValidateFn(TFT.duration()),

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': () => createValidateFn(TF.string({maxLength: 5})),
  'STRING_FORMAT.string_minLength': () => createValidateFn(TF.string({minLength: 3})),
  'STRING_FORMAT.string_length': () => createValidateFn(TF.string({length: 4})),
  'STRING_FORMAT.string_range': () => createValidateFn(TF.string({minLength: 2, maxLength: 4})),
  'STRING_FORMAT.string_allowedChars': () => createValidateFn(TF.string({allowedChars: {val: '0123456789abcdef'}})),
  'STRING_FORMAT.string_allowedChars_ignoreCase': () => createValidateFn(TF.string({allowedChars: {val: 'abc', ignoreCase: true}})),
  'STRING_FORMAT.string_allowedChars_literal': () => createValidateFn(TF.string({allowedChars: {val: '.-'}})),
  'STRING_FORMAT.string_disallowedChars': () => createValidateFn(TF.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
  'STRING_FORMAT.string_allowedValues': () => createValidateFn(TF.string({allowedValues: {val: ['red', 'green', 'blue']}})),
  'STRING_FORMAT.string_allowedValues_ignoreCase': () =>
    createValidateFn(TF.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
  'STRING_FORMAT.string_allowedValues_escaped': () => createValidateFn(TF.string({allowedValues: {val: ['a.b', 'c+d']}})),
  'STRING_FORMAT.string_disallowedValues': () =>
    createValidateFn(TF.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
  'STRING_FORMAT.string_customErrorMessage': () =>
    createValidateFn(TF.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
  'STRING_FORMAT.alpha': () => createValidateFn(TF.alpha()),
  'STRING_FORMAT.alphaNumeric': () => createValidateFn(TF.alphaNumeric()),
  'STRING_FORMAT.numeric': () => createValidateFn(TF.numeric()),
  'STRING_FORMAT.alpha_withLength': () => createValidateFn(TF.alpha({maxLength: 3})),
  'STRING_FORMAT.lowercase_validate': () => createValidateFn(TF.lowercase()),
  'STRING_FORMAT.uuidv4': () => createValidateFn(TF.uuidv4()),
  'STRING_FORMAT.uuidv7': () => createValidateFn(TF.uuidv7()),
  'STRING_FORMAT.date_iso': () => createValidateFn(TF.stringDate()),
  'STRING_FORMAT.date_DMY': () => createValidateFn(TF.stringDate({format: 'DD-MM-YYYY'})),
  'STRING_FORMAT.date_YM': () => createValidateFn(TF.stringDate({format: 'YYYY-MM'})),
  'STRING_FORMAT.date_MD': () => createValidateFn(TF.stringDate({format: 'MM-DD'})),
  'STRING_FORMAT.date_minMax_absolute': () =>
    createValidateFn(TF.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
  'STRING_FORMAT.time_iso': () => createValidateFn(TF.stringTime()),
  'STRING_FORMAT.time_HHmmss': () => createValidateFn(TF.stringTime({format: 'HH:mm:ss'})),
  'STRING_FORMAT.time_HHmmss_ms': () => createValidateFn(TF.stringTime({format: 'HH:mm:ss[.mmm]'})),
  'STRING_FORMAT.time_minMax_absolute': () => createValidateFn(TF.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
  'STRING_FORMAT.dateTime_default': () => createValidateFn(TF.stringDateTime()),
  'STRING_FORMAT.dateTime_custom': () =>
    createValidateFn(TF.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
  'STRING_FORMAT.dateTime_minMax_absolute': () =>
    createValidateFn(
      TF.stringDateTime({
        date: {format: 'YYYY-MM-DD'},
        time: {format: 'HH:mm:ss'},
        splitChar: 'T',
        min: '2020-01-01T00:00:00',
        max: '2020-12-31T23:59:59',
      })
    ),
  'STRING_FORMAT.ipv4': () => createValidateFn(TF.ipv4()),
  'STRING_FORMAT.ipv6': () => createValidateFn(TF.ipv6()),
  'STRING_FORMAT.ip_any': () => createValidateFn(TF.ip()),
  'STRING_FORMAT.ipv4_port': () => createValidateFn(TF.ipv4WithPort()),
  'STRING_FORMAT.ipv6_port': () => createValidateFn(TF.ipv6WithPort()),
  'STRING_FORMAT.domain': () => createValidateFn(TF.domain()),
  'STRING_FORMAT.domainStrict': () => createValidateFn(TF.domainStrict()),
  'STRING_FORMAT.email': () => createValidateFn(TF.email()),
  'STRING_FORMAT.emailPunycode': () => createValidateFn(TF.emailPunycode()),
  'STRING_FORMAT.emailStrict': () => createValidateFn(TF.emailStrict()),
  'STRING_FORMAT.url': () => createValidateFn(TF.url()),
  'STRING_FORMAT.urlHttp': () => createValidateFn(TF.urlHttp()),
  'STRING_FORMAT.urlFile': () => createValidateFn(TF.urlFile()),
  'STRING_FORMAT.pattern_slug': () =>
    createValidateFn(
      TF.string({
        pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
      })
    ),
  'STRING_FORMAT.pattern_hex': () =>
    createValidateFn(TF.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': () => createValidateFn(TF.number({max: 100})),
  'NUMBER_FORMAT.number_min': () => createValidateFn(TF.number({min: 0})),
  'NUMBER_FORMAT.number_lt': () => createValidateFn(TF.number({lt: 10})),
  'NUMBER_FORMAT.number_gt': () => createValidateFn(TF.number({gt: 0})),
  'NUMBER_FORMAT.number_integer': () => createValidateFn(TF.integer()),
  'NUMBER_FORMAT.number_float': () => createValidateFn(TF.float()),
  'NUMBER_FORMAT.number_multipleOf': () => createValidateFn(TF.number({multipleOf: 5})),
  'NUMBER_FORMAT.number_combined': () => createValidateFn(TF.number({min: 0, max: 100, integer: true, multipleOf: 5})),
  'NUMBER_FORMAT.number_int8': () => createValidateFn(TF.int8()),
  'NUMBER_FORMAT.number_uint8': () => createValidateFn(TF.uint8()),

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': () => createValidateFn(TF.bigInt({max: 100n})),
  'BIGINT_FORMAT.bigint_min': () => createValidateFn(TF.bigInt({min: 0n})),
  'BIGINT_FORMAT.bigint_lt': () => createValidateFn(TF.bigInt({lt: 10n})),
  'BIGINT_FORMAT.bigint_gt': () => createValidateFn(TF.bigInt({gt: 0n})),
  'BIGINT_FORMAT.bigint_multipleOf': () => createValidateFn(TF.bigInt({multipleOf: 5n})),
  'BIGINT_FORMAT.bigint_combined': () => createValidateFn(TF.bigInt({min: 0n, max: 1000n, multipleOf: 10n})),
  'BIGINT_FORMAT.bigint_int64': () => createValidateFn(TF.bigInt64()),
  'BIGINT_FORMAT.bigint_uint64': () => createValidateFn(TF.bigUInt64()),

  // ── DATETIME ──
  'DATETIME.date_minmax': () => createValidateFn(TF.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
  'DATETIME.date_gtlt': () => createValidateFn(TF.date({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.date_min_lt': () => createValidateFn(TF.date({min: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.date_max_now': () => createValidateFn(TF.date({max: 'now'})),
  'DATETIME.date_rel_window': () => createValidateFn(TF.date({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.date_rel_datetime_components': () => createValidateFn(TF.date({min: 'now-P1000YT12H'})),
  'DATETIME.instant_minmax': () => createValidateFn(TFT.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
  'DATETIME.instant_gtlt': () => createValidateFn(TFT.instant({gt: '2020-01-01T00:00:00Z', lt: '2020-12-31T23:59:59Z'})),
  'DATETIME.instant_rel': () => createValidateFn(TFT.instant({min: 'now-PT8760000H', max: 'now+PT8760000H'})),
  'DATETIME.plainDate_minmax': () => createValidateFn(TFT.plainDate({min: '2020-01-01', max: '2020-12-31'})),
  'DATETIME.plainDate_gtlt': () => createValidateFn(TFT.plainDate({gt: '2020-01-01', lt: '2020-12-31'})),
  'DATETIME.plainDate_min_lt': () => createValidateFn(TFT.plainDate({min: '2020-01-01', lt: '2020-01-10'})),
  'DATETIME.plainDate_gt_max': () => createValidateFn(TFT.plainDate({gt: '2020-01-01', max: '2020-01-10'})),
  'DATETIME.plainDate_min_only': () => createValidateFn(TFT.plainDate({min: '2020-01-01'})),
  'DATETIME.plainDate_max_only': () => createValidateFn(TFT.plainDate({max: '2020-12-31'})),
  'DATETIME.plainDate_gt_only': () => createValidateFn(TFT.plainDate({gt: '2020-01-01'})),
  'DATETIME.plainDate_lt_only': () => createValidateFn(TFT.plainDate({lt: '2020-12-31'})),
  'DATETIME.plainDate_rel_window': () => createValidateFn(TFT.plainDate({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.plainDate_rel_ymd': () => createValidateFn(TFT.plainDate({min: 'now-P100Y6M15D'})),
  'DATETIME.plainDate_rel_weeks': () => createValidateFn(TFT.plainDate({min: 'now-P52200W'})),
  'DATETIME.plainTime_minmax': () => createValidateFn(TFT.plainTime({min: '09:00:00', max: '17:00:00'})),
  'DATETIME.plainTime_gtlt': () => createValidateFn(TFT.plainTime({gt: '09:00:00', lt: '17:00:00'})),
  'DATETIME.plainDateTime_minmax': () =>
    createValidateFn(TFT.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
  'DATETIME.plainDateTime_gtlt': () => createValidateFn(TFT.plainDateTime({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
  'DATETIME.plainDateTime_rel': () => createValidateFn(TFT.plainDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.plainDateTime_rel_combo': () => createValidateFn(TFT.plainDateTime({min: 'now-P500YT12H'})),
  'DATETIME.plainYearMonth_minmax': () => createValidateFn(TFT.plainYearMonth({min: '2020-01', max: '2020-12'})),
  'DATETIME.plainYearMonth_gtlt': () => createValidateFn(TFT.plainYearMonth({gt: '2020-01', lt: '2020-12'})),
  'DATETIME.plainYearMonth_rel': () => createValidateFn(TFT.plainYearMonth({min: 'now-P1000Y', max: 'now+P1000Y'})),
  'DATETIME.zonedDateTime_minmax': () =>
    createValidateFn(TFT.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
  'DATETIME.zonedDateTime_gtlt': () =>
    createValidateFn(TFT.zonedDateTime({gt: '2020-01-01T00:00:00[UTC]', lt: '2020-12-31T23:59:59[UTC]'})),
  'DATETIME.zonedDateTime_rel': () => createValidateFn(TFT.zonedDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),

  // ── REALWORLD ──
  'REALWORLD.user': () =>
    createValidateFn(
      RT.object({
        id: TF.number(),
        email: TF.string(),
        name: TF.string(),
        age: RT.optional(TF.number()),
        roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
        active: RT.boolean(),
        createdAt: TF.string(),
      })
    ),
  'REALWORLD.order': () =>
    createValidateFn(
      RT.object({
        id: TF.string(),
        customer: RT.object({id: TF.number(), email: TF.string()}),
        items: RT.array(RT.object({sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.number()})),
        shipping: RT.object({
          street: TF.string(),
          city: TF.string(),
          state: TF.string(),
          zip: TF.string(),
          country: TF.string(),
        }),
        status: RT.union([
          RT.literal('pending'),
          RT.literal('paid'),
          RT.literal('shipped'),
          RT.literal('delivered'),
          RT.literal('cancelled'),
        ]),
        total: TF.number(),
        note: RT.optional(TF.string()),
      })
    ),
  'REALWORLD.blogPost': () =>
    createValidateFn(
      RT.object({
        id: TF.number(),
        title: TF.string(),
        slug: TF.string(),
        body: TF.string(),
        tags: RT.array(TF.string()),
        author: RT.object({name: TF.string(), email: TF.string()}),
        published: RT.boolean(),
        publishedAt: RT.optional(TF.string()),
        meta: RT.object({views: TF.number(), likes: TF.number()}),
      })
    ),
  'REALWORLD.product': () =>
    createValidateFn(
      RT.object({
        id: TF.string(),
        name: TF.string(),
        description: TF.string(),
        price: TF.number(),
        currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
        inStock: RT.boolean(),
        categories: RT.array(TF.string()),
        dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
      })
    ),
  'REALWORLD.productPage': () =>
    createValidateFn(
      RT.object({
        data: RT.array(
          RT.object({
            id: TF.string(),
            name: TF.string(),
            description: TF.string(),
            price: TF.number(),
            currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
            inStock: RT.boolean(),
            categories: RT.array(TF.string()),
            dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
          })
        ),
        page: TF.number(),
        pageSize: TF.number(),
        total: TF.number(),
        hasMore: RT.boolean(),
      })
    ),
  'REALWORLD.registrationForm': () =>
    createValidateFn(
      RT.object({
        email: TF.string(),
        password: TF.string(),
        acceptedTerms: RT.literal(true),
        profile: RT.object({
          firstName: TF.string(),
          lastName: TF.string(),
          age: RT.optional(TF.number()),
        }),
      })
    ),

  // ── JSON_SCHEMA ──
  // The whole group opts out, on purpose. These cases exist to measure the JSON
  // SCHEMA door, and there is no runtypes-to-JSON-Schema transform: a value-first
  // builder that happens to describe the same shape is a stand-in we invented for
  // the bench, not a second way to consume the document. Presenting its cost as
  // "ts-runtypes on this document" would be a fabricated comparison, so the
  // jsonSchema column is the single ts-runtypes answer on these rows.
  'JSON_SCHEMA.closed_object': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.pattern_properties': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.property_names': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.contains_count': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.unique_items': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.object_size': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.dependent_required': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.string_email': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.int_bounded': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.string_pattern': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
  'JSON_SCHEMA.multiple_of': NOT_SUPPORTED, // no value-first twin: the subject is the document itself
};
