// TOTAL map over every shared case key. TypeBox can't express bigint literals, int64 bounds (they lose float
// precision), RegExp instances, Map/Set/Promise, Temporal, symbols, calendar-aware date/time formats or the
// all-optional plain-object guard. TypeBox 1.x has no Date type: a Date is `Type.Refine` over an instanceof check.

import {Type} from 'typebox';
import {Compile} from 'typebox/compile';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

// Each thunk is self-contained and copy-paste runnable (shared sub-schemas inlined); compiling there is not timed.

export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': {
    build: () => {
      const schema = Type.Any();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Any();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.bigint': {
    build: () => {
      const schema = Type.BigInt();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.BigInt();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.boolean': {
    build: () => {
      const schema = Type.Boolean();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Boolean();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.date': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.enum_mixed': {
    build: () => {
      const schema = Type.Union([Type.Literal(0), Type.Literal('green'), Type.Literal(2)]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Literal(0), Type.Literal('green'), Type.Literal(2)]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.literal_2': {
    build: () => {
      const schema = Type.Literal(2);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Literal(2);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.literal_a': {
    build: () => {
      const schema = Type.Literal('a');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Literal('a');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.literal_true': {
    build: () => {
      const schema = Type.Literal(true);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Literal(true);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.literal_1n': NOT_SUPPORTED, // TypeBox has no bigint literal type
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // TypeBox has no symbol literal type
  'ATOMIC.never': {
    build: () => {
      const schema = Type.Never();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Never();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.null': {
    build: () => {
      const schema = Type.Null();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Null();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.number': {
    build: () => {
      const schema = Type.Number();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Number();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.object': NOT_SUPPORTED, // Type.Object({}) rejects arrays; no general 'object' type in TypeBox
  'ATOMIC.regexp': NOT_SUPPORTED, // TypeBox RegExp validates string matches a pattern, not instanceof RegExp
  'ATOMIC.string': {
    build: () => {
      const schema = Type.String();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows — symbol primitive unsupported
  'ATOMIC.undefined': {
    build: () => {
      const schema = Type.Undefined();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Undefined();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.void': {
    build: () => {
      const schema = Type.Void();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Void();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.unknown': {
    build: () => {
      const schema = Type.Unknown();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Unknown();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── ARRAY ──
  'ARRAY.string_array': {
    build: () => {
      const schema = Type.Array(Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.number_array': {
    build: () => {
      const schema = Type.Array(Type.Number());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Number());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.boolean_array': {
    build: () => {
      const schema = Type.Array(Type.Boolean());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Boolean());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.bigint_array': {
    build: () => {
      const schema = Type.Array(Type.BigInt());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.BigInt());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.date_array': {
    build: () => {
      const schema = Type.Array(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.regexp_array': NOT_SUPPORTED, // no RegExp instance type in TypeBox
  'ARRAY.undefined_array': {
    build: () => {
      const schema = Type.Array(Type.Undefined());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Undefined());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.null_array': {
    build: () => {
      const schema = Type.Array(Type.Null());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Null());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.array_generic': {
    build: () => {
      const schema = Type.Array(Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.string_array_2d': {
    build: () => {
      const schema = Type.Array(Type.Array(Type.String()));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Array(Type.String()));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.string_array_3d': {
    build: () => {
      const schema = Type.Array(Type.Array(Type.Array(Type.String())));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Array(Type.Array(Type.String())));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.object_array': {
    build: () => {
      const schema = Type.Array(Type.Object({a: Type.String()}));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Object({a: Type.String()}));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.union_array': {
    build: () => {
      const schema = Type.Array(Type.Union([Type.String(), Type.Number()]));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Union([Type.String(), Type.Number()]));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.tuple_array': {
    build: () => {
      const schema = Type.Array(Type.Tuple([Type.String(), Type.Number()]));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Tuple([Type.String(), Type.Number()]));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.circular_array': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Array(Type.Ref('Self'))}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Array(Type.Ref('Self'))}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.circular_object_with_array': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          a: Type.String(),
          deep: Type.Optional(Type.Object({b: Type.String(), c: Type.Number()})),
          d: Type.Optional(Type.Array(Type.Ref('Self'))),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          a: Type.String(),
          deep: Type.Optional(Type.Object({b: Type.String(), c: Type.Number()})),
          d: Type.Optional(Type.Array(Type.Ref('Self'))),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // no symbol type in TypeBox
  'ARRAY.readonly_string_array': {
    build: () => {
      const schema = Type.Array(Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    build: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.object_as_const_literals': {
    build: () => {
      const schema = Type.Object({name: Type.Literal('john'), age: Type.Literal(30)});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({name: Type.Literal('john'), age: Type.Literal(30)});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.object_via_return_type_utility': {
    build: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.object_via_property_access': {
    build: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.object_via_array_access': {
    build: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.interface_with_optional': {
    build: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Optional(Type.Number())});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Optional(Type.Number())});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.interface_with_date': {
    build: () => {
      const schema = Type.Object({date: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({date: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.interface_with_method': {
    build: () => {
      const schema = Type.Object({name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.nested_object': {
    build: () => {
      const schema = Type.Object({a: Type.String(), deep: Type.Object({b: Type.String(), c: Type.Number()})});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({a: Type.String(), deep: Type.Object({b: Type.String(), c: Type.Number()})});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.interface_string_array_prop': {
    build: () => {
      const schema = Type.Object({tags: Type.Array(Type.String())});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({tags: Type.Array(Type.String())});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.circular_interface': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({name: Type.String(), child: Type.Optional(Type.Ref('Self'))})}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({name: Type.String(), child: Type.Optional(Type.Ref('Self'))})}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.circular_interface_on_array': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({name: Type.String(), children: Type.Optional(Type.Array(Type.Ref('Self')))})}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({name: Type.String(), children: Type.Optional(Type.Array(Type.Ref('Self')))})}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.circular_interface_on_nested_object': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          name: Type.String(),
          embedded: Type.Object({hello: Type.String(), child: Type.Optional(Type.Ref('Self'))}),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          name: Type.String(),
          embedded: Type.Object({hello: Type.String(), child: Type.Optional(Type.Ref('Self'))}),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.index_signature_string': {
    build: () => {
      const schema = Type.Record(Type.String(), Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Record(Type.String(), Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.index_signature_named_props': {
    build: () => {
      const schema = Type.Intersect([
        Type.Object({a: Type.String(), b: Type.Number()}),
        Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()])),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Intersect([
        Type.Object({a: Type.String(), b: Type.Number()}),
        Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()])),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.index_signature_nested': {
    build: () => {
      const schema = Type.Record(Type.String(), Type.Record(Type.String(), Type.Number()));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Record(Type.String(), Type.Record(Type.String(), Type.Number()));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.index_signature_date_value': {
    build: () => {
      const schema = Type.Record(Type.String(), Type.Record(Type.String(), Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Record(Type.String(), Type.Record(Type.String(), Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.index_signature_non_root': {
    build: () => {
      const schema = Type.Object({
        b: Type.String(),
        c: Type.Intersect([Type.Object({a: Type.String()}), Type.Record(Type.String(), Type.String())]),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        b: Type.String(),
        c: Type.Intersect([Type.Object({a: Type.String()}), Type.Record(Type.String(), Type.String())]),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.function_top_level': {
    build: () => {
      const schema = Type.Function([], Type.Any());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Function([], Type.Any());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.interface_callable': NOT_SUPPORTED, // Intersect(Function, Object) compiles typeof 'object' check which rejects functions
  'OBJECT.interface_all_optional': {
    build: () => {
      const schema = Type.Object({a: Type.Optional(Type.String()), b: Type.Optional(Type.Number())});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({a: Type.Optional(Type.String()), b: Type.Optional(Type.Number())});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
    samples: {
      valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: undefined, b: undefined}],
      invalid: [[], null, 'hello', 42, undefined, true],
    },
  },
  'OBJECT.class_simple': {
    build: () => {
      const schema = Type.Object({date: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({date: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.rpc_error_class': {
    build: () => {
      const schema = Type.Object({
        'mion@isΣrrθr': Type.Literal(true),
        type: Type.Literal('test-error'),
        publicMessage: Type.String(),
        id: Type.Optional(Type.String()),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        'mion@isΣrrθr': Type.Literal(true),
        type: Type.Literal('test-error'),
        publicMessage: Type.String(),
        id: Type.Optional(Type.String()),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params': {
    build: () => {
      const schema = Type.Tuple([Type.Number(), Type.Boolean()]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple([Type.Number(), Type.Boolean()]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params_with_optional': {
    build: () => {
      const schema = Type.Union([
        Type.Tuple([Type.Number(), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.Boolean(), Type.String()]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Tuple([Type.Number(), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.Boolean(), Type.String()]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params_with_rest': {
    build: () => {
      const schema = Type.Unsafe<[number, boolean, ...Date[]]>(
        Type.Tuple([Type.Number(), Type.Boolean()], {additionalItems: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))})
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Unsafe<[number, boolean, ...Date[]]>(
        Type.Tuple([Type.Number(), Type.Boolean()], {additionalItems: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))})
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.record_union_keys': {
    build: () => {
      const schema = Type.Object({a: Type.Number(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({a: Type.Number(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.union_value_index': {
    build: () => {
      const schema = Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.object_with_union_prop': {
    build: () => {
      const schema = Type.Object({kind: Type.Union([Type.Literal('a'), Type.Literal('b')]), n: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({kind: Type.Union([Type.Literal('a'), Type.Literal('b')]), n: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.interface_inheritance': {
    build: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.class_inheritance': {
    build: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'OBJECT.index_signature_number_key': {
    build: () => {
      const schema = Type.Record(Type.String(), Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Record(Type.String(), Type.String());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    build: () => {
      const schema = Type.Tuple([Type.String(), Type.Number()]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple([Type.String(), Type.Number()]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.full_mion_tuple': {
    build: () => {
      const schema = Type.Tuple([
        Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())),
        Type.Number(),
        Type.String(),
        Type.Null(),
        Type.Array(Type.String()),
        Type.BigInt(),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple([
        Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())),
        Type.Number(),
        Type.String(),
        Type.Null(),
        Type.Array(Type.String()),
        Type.BigInt(),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.tuple_with_optional': {
    build: () => {
      const schema = Type.Union([
        Type.Tuple([Type.Number()]),
        Type.Tuple([Type.Number(), Type.BigInt()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()])]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean(), Type.Number()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean(), Type.Number()]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Union([Type.Boolean(), Type.Undefined()]), Type.Number()]),
        Type.Tuple([
          Type.Number(),
          Type.Union([Type.BigInt(), Type.Undefined()]),
          Type.Union([Type.Boolean(), Type.Undefined()]),
          Type.Number(),
        ]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Tuple([Type.Number()]),
        Type.Tuple([Type.Number(), Type.BigInt()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()])]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean(), Type.Number()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean(), Type.Number()]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Union([Type.Boolean(), Type.Undefined()]), Type.Number()]),
        Type.Tuple([
          Type.Number(),
          Type.Union([Type.BigInt(), Type.Undefined()]),
          Type.Union([Type.Boolean(), Type.Undefined()]),
          Type.Number(),
        ]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.nested_tuple_in_array': {
    build: () => {
      const schema = Type.Array(Type.Tuple([Type.String(), Type.Number()]));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Tuple([Type.String(), Type.Number()]));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.tuple_rest': {
    build: () => {
      const schema = Type.Unsafe<[number, ...string[]]>(Type.Tuple([Type.Number()], {additionalItems: Type.String()}));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Unsafe<[number, ...string[]]>(Type.Tuple([Type.Number()], {additionalItems: Type.String()}));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.tuple_circular': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Union([
          Type.Tuple([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt()]),
          Type.Tuple([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt(), Type.Ref('Self')]),
        ])}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Union([
          Type.Tuple([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt()]),
          Type.Tuple([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Null(), Type.Array(Type.String()), Type.BigInt(), Type.Ref('Self')]),
        ])}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.tuple_multiple_trailing_optionals': {
    build: () => {
      const schema = Type.Union([
        Type.Tuple([Type.Number()]),
        Type.Tuple([Type.Number(), Type.BigInt()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()])]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean(), Type.Number()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean(), Type.Number()]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Union([Type.Boolean(), Type.Undefined()]), Type.Number()]),
        Type.Tuple([
          Type.Number(),
          Type.Union([Type.BigInt(), Type.Undefined()]),
          Type.Union([Type.Boolean(), Type.Undefined()]),
          Type.Number(),
        ]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Tuple([Type.Number()]),
        Type.Tuple([Type.Number(), Type.BigInt()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()])]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean()]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Boolean(), Type.Number()]),
        Type.Tuple([Type.Number(), Type.Union([Type.BigInt(), Type.Undefined()]), Type.Boolean(), Type.Number()]),
        Type.Tuple([Type.Number(), Type.BigInt(), Type.Union([Type.Boolean(), Type.Undefined()]), Type.Number()]),
        Type.Tuple([
          Type.Number(),
          Type.Union([Type.BigInt(), Type.Undefined()]),
          Type.Union([Type.Boolean(), Type.Undefined()]),
          Type.Number(),
        ]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.tuple_named_labels': {
    build: () => {
      const schema = Type.Tuple([Type.String(), Type.Number()]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple([Type.String(), Type.Number()]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.tuple_with_non_serializable': {
    build: () => {
      const schema = Type.Union([Type.Tuple([Type.Number()]), Type.Tuple([Type.Number(), Type.Undefined()])]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Tuple([Type.Number()]), Type.Tuple([Type.Number(), Type.Undefined()])]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.empty_tuple': {
    build: () => {
      const schema = Type.Tuple([]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple([]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.single_element_tuple': {
    build: () => {
      const schema = Type.Tuple([Type.String()]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple([Type.String()]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.readonly_tuple': {
    build: () => {
      const schema = Type.Tuple([Type.String(), Type.Number()]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple([Type.String(), Type.Number()]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── UNION ──
  'UNION.atomic_union': {
    build: () => {
      const schema = Type.Union([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Null(), Type.BigInt()]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Null(), Type.BigInt()]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.string_literal_union': {
    build: () => {
      const schema = Type.Union([Type.Literal('UNO'), Type.Literal('DOS'), Type.Literal('TRES')]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Literal('UNO'), Type.Literal('DOS'), Type.Literal('TRES')]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.large_union_eight_arms': {
    build: () => {
      const schema = Type.Union([
        Type.Literal('a'),
        Type.Literal('b'),
        Type.Literal(42),
        Type.Literal(true),
        Type.Null(),
        Type.Object({a: Type.String()}),
        Type.Object({a: Type.String(), b: Type.Number()}),
        Type.Object({c: Type.BigInt()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Literal('a'),
        Type.Literal('b'),
        Type.Literal(42),
        Type.Literal(true),
        Type.Null(),
        Type.Object({a: Type.String()}),
        Type.Object({a: Type.String(), b: Type.Number()}),
        Type.Object({c: Type.BigInt()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.string_or_number': {
    build: () => {
      const schema = Type.Union([Type.String(), Type.Number()]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.String(), Type.Number()]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_of_array_types': {
    build: () => {
      const schema = Type.Union([Type.Array(Type.String()), Type.Array(Type.Number()), Type.Array(Type.Boolean())]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Array(Type.String()), Type.Array(Type.Number()), Type.Array(Type.Boolean())]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.array_of_union': {
    build: () => {
      const schema = Type.Array(Type.Union([Type.String(), Type.BigInt(), Type.Boolean(), Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))]));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Union([Type.String(), Type.BigInt(), Type.Boolean(), Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))]));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_of_object_shapes': {
    build: () => {
      const schema = Type.Union([
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Object({c: Type.BigInt()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Object({c: Type.BigInt()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.discriminated_union': {
    build: () => {
      const schema = Type.Union([
        Type.Object({kind: Type.Literal('a'), n: Type.Number()}),
        Type.Object({kind: Type.Literal('b'), s: Type.String()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Object({kind: Type.Literal('a'), n: Type.Number()}),
        Type.Object({kind: Type.Literal('b'), s: Type.String()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // A TypeBox 1.x Record accepts any non-array object, Invalid Date included: hence the plain-object refine.
  'UNION.circular_union': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Union([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Refine(Type.Record(Type.String(), Type.Ref('Self')), (value) => Object.prototype.toString.call(value) === '[object Object]'), Type.Array(Type.Ref('Self'))])}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Union([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Refine(Type.Record(Type.String(), Type.Ref('Self')), (value) => Object.prototype.toString.call(value) === '[object Object]'), Type.Array(Type.Ref('Self'))])}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_with_methods': {
    build: () => {
      const schema = Type.Union([Type.Object({name: Type.String()}), Type.Object({age: Type.Number()})]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Object({name: Type.String()}), Type.Object({age: Type.Number()})]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.intersection_to_object': {
    build: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({a: Type.String(), b: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_with_index_arm': {
    build: () => {
      const schema = Type.Union([
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Intersect([Type.Object({c: Type.BigInt()}), Type.Record(Type.String(), Type.BigInt())]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Intersect([Type.Object({c: Type.BigInt()}), Type.Record(Type.String(), Type.BigInt())]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_same_prop_different_types': {
    build: () => {
      const schema = Type.Union([
        Type.Object({type: Type.Literal('a'), prop: Type.Boolean()}),
        Type.Object({type: Type.Literal('b'), prop: Type.Number()}),
        Type.Object({type: Type.Literal('c'), prop: Type.String()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Object({type: Type.Literal('a'), prop: Type.Boolean()}),
        Type.Object({type: Type.Literal('b'), prop: Type.Number()}),
        Type.Object({type: Type.Literal('c'), prop: Type.String()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_mixed_arrays_and_objects': {
    build: () => {
      const schema = Type.Union([
        Type.Array(Type.String()),
        Type.Array(Type.Number()),
        Type.Array(Type.Boolean()),
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Array(Type.String()),
        Type.Array(Type.Number()),
        Type.Array(Type.Boolean()),
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_merged_property': {
    build: () => {
      const schema = Type.Union([Type.Object({a: Type.Boolean()}), Type.Object({a: Type.Number()})]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Object({a: Type.Boolean()}), Type.Object({a: Type.Number()})]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_mixed_with_index': {
    build: () => {
      const schema = Type.Union([
        Type.Array(Type.String()),
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Intersect([Type.Object({b: Type.BigInt()}), Type.Record(Type.String(), Type.BigInt())]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Array(Type.String()),
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Intersect([Type.Object({b: Type.BigInt()}), Type.Record(Type.String(), Type.BigInt())]),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_with_any_fallback': {
    build: () => {
      const schema = Type.Any();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Any();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_with_unknown_fallback': {
    build: () => {
      const schema = Type.Unknown();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Unknown();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_subset_small_first': {
    build: () => {
      const schema = Type.Union([Type.Object({a: Type.String()}), Type.Object({a: Type.String(), b: Type.Number()})]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Object({a: Type.String()}), Type.Object({a: Type.String(), b: Type.Number()})]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_subset_nested_levels': {
    build: () => {
      const schema = Type.Union([
        Type.Object({x: Type.String()}),
        Type.Object({x: Type.String(), y: Type.Number()}),
        Type.Object({x: Type.String(), y: Type.Number(), z: Type.Boolean()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Object({x: Type.String()}),
        Type.Object({x: Type.String(), y: Type.Number()}),
        Type.Object({x: Type.String(), y: Type.Number(), z: Type.Boolean()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.union_subset_mixed_related_unrelated': {
    build: () => {
      const schema = Type.Union([
        Type.Object({id: Type.String()}),
        Type.Object({id: Type.String(), name: Type.String()}),
        Type.Object({value: Type.Number()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Object({id: Type.String()}),
        Type.Object({id: Type.String(), name: Type.String()}),
        Type.Object({value: Type.Number()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── TEMPLATE_LITERAL ──
  // All expressed as Type.String({pattern: ...}) since TypeBox TemplateLiteral Number only
  // accepts non-negative integers; we use -?(\d+\.?\d*|\.\d+) semantics.
  'TEMPLATE_LITERAL.url_with_number_id': {
    build: () => {
      const schema = Type.String({pattern: `^api/user/${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: `^api/user/${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => {
      const schema = Type.String({pattern: `^/api/v[0-9]+/user/[^/]+/posts/${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: `^/api/v[0-9]+/user/[^/]+/posts/${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    build: () => {
      const schema = Type.String({pattern: `^[^]*?/${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: `^[^]*?/${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.regex_special_chars': {
    build: () => {
      const schema = Type.String({pattern: `^[(]${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}[)]$`});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: `^[(]${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}[)]$`});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    build: () => {
      const schema = Type.Object({
        url: Type.String({pattern: `^api/user/${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`}),
        method: Type.String(),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        url: Type.String({pattern: `^api/user/${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`}),
        method: Type.String(),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_index_key': {
    build: () => {
      const schema = Type.Record(Type.TemplateLiteral('api/${string}'), Type.Number(), {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Record(Type.TemplateLiteral('api/${string}'), Type.Number(), {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    build: () => {
      const schema = Type.String({pattern: `^(a|b)-${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: `^(a|b)-${'-?([0-9]+[.]?[0-9]*|[.][0-9]+)'}$`});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': NOT_SUPPORTED, // no Map type in TypeBox
  'NATIVE.set_string': NOT_SUPPORTED, // no Set type in TypeBox
  'NATIVE.promise_string': NOT_SUPPORTED, // no thenable/Promise type in TypeBox
  'NATIVE.awaited_promise': {
    build: () => {
      const schema = Type.String();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          n: Type.Number(),
          s: Type.String(),
          c: Type.Optional(Type.Ref('Self')),
          d: Type.Optional(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          n: Type.Number(),
          s: Type.String(),
          c: Type.Optional(Type.Ref('Self')),
          d: Type.Optional(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.array_of_union_with_self_ref': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Array(Type.Union([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Ref('Self')]))}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Array(Type.Union([Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String(), Type.Ref('Self')]))}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.object_with_tuple_prop': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          tuple: Type.Union([Type.Tuple([Type.BigInt()]), Type.Tuple([Type.BigInt(), Type.Ref('Self')])]),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          tuple: Type.Union([Type.Tuple([Type.BigInt()]), Type.Tuple([Type.BigInt(), Type.Ref('Self')])]),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.object_with_index_prop': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({index: Type.Record(Type.String(), Type.Ref('Self'))})}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({index: Type.Record(Type.String(), Type.Ref('Self'))})}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.object_deeply_nested': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          deep1: Type.Object({
            deep2: Type.Object({
              deep3: Type.Object({deep4: Type.Optional(Type.Ref('Self'))}),
            }),
          }),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          deep1: Type.Object({
            deep2: Type.Object({
              deep3: Type.Object({deep4: Type.Optional(Type.Ref('Self'))}),
            }),
          }),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.circular_child_under_literal_root': {
    build: () => {
      const schema = Type.Object({
        isRoot: Type.Literal(true),
        ciChild: Type.Cyclic({Self: Type.Object({
            name: Type.String(),
            big: Type.BigInt(),
            embedded: Type.Object({hello: Type.String(), child: Type.Optional(Type.Ref('Self'))}),
          })}, 'Self'),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        isRoot: Type.Literal(true),
        ciChild: Type.Cyclic({Self: Type.Object({
            name: Type.String(),
            big: Type.BigInt(),
            embedded: Type.Object({hello: Type.String(), child: Type.Optional(Type.Ref('Self'))}),
          })}, 'Self'),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.multiple_circular_types_cross_referenced': {
    build: () => {
      const schema = Type.Cyclic(
        {
          Deep: Type.Object({
            name: Type.String(),
            big: Type.BigInt(),
            embedded: Type.Object({hello: Type.String(), child: Type.Optional(Type.Ref('Deep'))}),
          }),
          CDate: Type.Object({
            date: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())),
            month: Type.Number(),
            year: Type.Number(),
            embedded: Type.Optional(Type.Ref('CDate')),
          }),
          Root: Type.Object({
            isRoot: Type.Literal(true),
            ciChild: Type.Ref('Deep'),
            ciDate: Type.Ref('CDate'),
            ciRoort: Type.Optional(Type.Ref('Root')),
          }),
        },
        'Root'
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic(
        {
          Deep: Type.Object({
            name: Type.String(),
            big: Type.BigInt(),
            embedded: Type.Object({hello: Type.String(), child: Type.Optional(Type.Ref('Deep'))}),
          }),
          CDate: Type.Object({
            date: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())),
            month: Type.Number(),
            year: Type.Number(),
            embedded: Type.Optional(Type.Ref('CDate')),
          }),
          Root: Type.Object({
            isRoot: Type.Literal(true),
            ciChild: Type.Ref('Deep'),
            ciDate: Type.Ref('CDate'),
            ciRoort: Type.Optional(Type.Ref('Root')),
          }),
        },
        'Root'
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── CIRCULAR_REFS ── (cyclic VALUES; TypeBox has no cyclic-value detection)
  'CIRCULAR_REFS.linked_list_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.tree_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.object_self_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow

  // ── UTILITY ──
  'UTILITY.partial': {
    build: () => {
      const schema = Type.Partial(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Partial(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
    samples: {
      valid: [{}, {name: 'John'}, {createdAt: new Date()}, {name: 'John', age: 30, createdAt: new Date()}],
      invalid: [[], {name: 42}, {createdAt: 'not date'}, null, undefined, {createdAt: new Date('invalid')}, {age: NaN}],
    },
  },
  'UTILITY.required': {
    build: () => {
      const schema = Type.Required(
        Type.Object({
          name: Type.Optional(Type.String()),
          age: Type.Optional(Type.Number()),
          createdAt: Type.Optional(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))),
        })
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Required(
        Type.Object({
          name: Type.Optional(Type.String()),
          age: Type.Optional(Type.Number()),
          createdAt: Type.Optional(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))),
        })
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.pick': {
    build: () => {
      const schema = Type.Pick(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}), [
        'name',
        'createdAt',
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Pick(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}), [
        'name',
        'createdAt',
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.omit': {
    build: () => {
      const schema = Type.Omit(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}), ['age']);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Omit(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}), ['age']);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.exclude_atomic': {
    build: () => {
      const schema = Type.Exclude(
        Type.Union([Type.Literal('name'), Type.Literal('age'), Type.Literal('createdAt')]),
        Type.Literal('age')
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Exclude(
        Type.Union([Type.Literal('name'), Type.Literal('age'), Type.Literal('createdAt')]),
        Type.Literal('age')
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.extract_atomic': {
    build: () => {
      const schema = Type.Extract(
        Type.Union([Type.Literal('name'), Type.Literal('age'), Type.Literal('createdAt')]),
        Type.Union([Type.Literal('name'), Type.Literal('createdAt')])
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Extract(
        Type.Union([Type.Literal('name'), Type.Literal('age'), Type.Literal('createdAt')]),
        Type.Union([Type.Literal('name'), Type.Literal('createdAt')])
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.exclude_from_object_union': {
    build: () => {
      const schema = Type.Exclude(
        Type.Union([
          Type.Object({kind: Type.Literal('circle'), radius: Type.Number()}),
          Type.Object({kind: Type.Literal('square'), x: Type.Number()}),
          Type.Object({kind: Type.Literal('triangle'), base: Type.Number(), height: Type.Number()}),
        ]),
        Type.Object({kind: Type.Literal('circle'), radius: Type.Number()})
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Exclude(
        Type.Union([
          Type.Object({kind: Type.Literal('circle'), radius: Type.Number()}),
          Type.Object({kind: Type.Literal('square'), x: Type.Number()}),
          Type.Object({kind: Type.Literal('triangle'), base: Type.Number(), height: Type.Number()}),
        ]),
        Type.Object({kind: Type.Literal('circle'), radius: Type.Number()})
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.non_nullable': {
    build: () => {
      const schema = Type.Exclude(
        Type.Union([Type.String(), Type.Number(), Type.Null(), Type.Undefined()]),
        Type.Union([Type.Null(), Type.Undefined()])
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Exclude(
        Type.Union([Type.String(), Type.Number(), Type.Null(), Type.Undefined()]),
        Type.Union([Type.Null(), Type.Undefined()])
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.return_type': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.readonly': {
    build: () => {
      const schema = Type.Object({name: Type.String(), age: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({name: Type.String(), age: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.intersection_with_required_override': {
    build: () => {
      const schema = Type.Intersect([
        Type.Partial(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))})),
        Type.Required(Type.Pick(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}), ['name'])),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Intersect([
        Type.Partial(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))})),
        Type.Required(Type.Pick(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}), ['name'])),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.omit_keeping_optional': {
    build: () => {
      const schema = Type.Omit(Type.Object({a: Type.String(), b: Type.Optional(Type.Number()), c: Type.Boolean()}), ['a']);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Omit(Type.Object({a: Type.String(), b: Type.Optional(Type.Number()), c: Type.Boolean()}), ['a']);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.keyof_to_literal_union': {
    build: () => {
      const schema = Type.KeyOf(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.KeyOf(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))}));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.typeof_variable_query': {
    build: () => {
      const schema = Type.Object({url: Type.String(), port: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({url: Type.String(), port: Type.Number()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.indexed_access_type': {
    build: () => {
      const schema = Type.String();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.conditional_type_resolved': {
    build: () => {
      const schema = Type.Boolean();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Boolean();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.mapped_type_custom': {
    build: () => {
      const schema = Type.Object({
        a: Type.Union([Type.String(), Type.Null()]),
        b: Type.Union([Type.Number(), Type.Null()]),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        a: Type.Union([Type.String(), Type.Null()]),
        b: Type.Union([Type.Number(), Type.Null()]),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.mapped_type_with_conditional_value': {
    build: () => {
      const schema = Type.Object({
        name: Type.Object({kind: Type.Literal('text'), value: Type.String()}),
        age: Type.Object({kind: Type.Literal('number'), value: Type.Number(), min: Type.Optional(Type.Number())}),
        admin: Type.Object({kind: Type.Literal('checkbox'), value: Type.Boolean()}),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        name: Type.Object({kind: Type.Literal('text'), value: Type.String()}),
        age: Type.Object({kind: Type.Literal('number'), value: Type.Number(), min: Type.Optional(Type.Number())}),
        admin: Type.Object({kind: Type.Literal('checkbox'), value: Type.Boolean()}),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.distributive_conditional_over_union': {
    build: () => {
      const schema = Type.Union([Type.Object({w: Type.String()}), Type.Object({w: Type.Number()})]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Object({w: Type.String()}), Type.Object({w: Type.Number()})]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UTILITY.deep_partial_recursive_mapped': {
    build: () => {
      const schema = Type.Object({
        display: Type.Optional(
          Type.Object({
            theme: Type.Optional(Type.Union([Type.Literal('light'), Type.Literal('dark')])),
            brightness: Type.Optional(Type.Number()),
          })
        ),
        audio: Type.Optional(
          Type.Object({
            volume: Type.Optional(Type.Number()),
            muted: Type.Optional(Type.Boolean()),
          })
        ),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        display: Type.Optional(
          Type.Object({
            theme: Type.Optional(Type.Union([Type.Literal('light'), Type.Literal('dark')])),
            brightness: Type.Optional(Type.Number()),
          })
        ),
        audio: Type.Optional(
          Type.Object({
            volume: Type.Optional(Type.Number()),
            muted: Type.Optional(Type.Boolean()),
          })
        ),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
    samples: {
      valid: [
        {},
        {display: {}},
        {audio: {volume: 1}},
        {display: {theme: 'light'}, audio: {muted: true}},
        {display: {theme: 'dark', brightness: 0.5}, audio: {volume: 1, muted: false}},
      ],
      invalid: [[], {display: 'not object'}, {display: {theme: 'invalid'}}, {audio: {volume: NaN}}, null, undefined],
    },
  },

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': {
    build: () => {
      const schema = Type.Object({user_id: Type.Number(), user_name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({user_id: Type.Number(), user_name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TYPE_MAPPINGS.key_conditional_rename': {
    build: () => {
      const schema = Type.Object({_id: Type.Number(), name: Type.String(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({_id: Type.Number(), name: Type.String(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TYPE_MAPPINGS.key_filter_via_never': {
    build: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String()});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── DATETIME ──
  'DATETIME.date': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()));
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()));
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.instant': NOT_SUPPORTED, // no Temporal.Instant type in TypeBox
  'DATETIME.zonedDateTime': NOT_SUPPORTED, // no Temporal.ZonedDateTime type in TypeBox
  'DATETIME.plainDate': NOT_SUPPORTED, // no Temporal.PlainDate type in TypeBox
  'DATETIME.plainTime': NOT_SUPPORTED, // no Temporal.PlainTime type in TypeBox
  'DATETIME.plainDateTime': NOT_SUPPORTED, // no Temporal.PlainDateTime type in TypeBox
  'DATETIME.plainYearMonth': NOT_SUPPORTED, // no Temporal.PlainYearMonth type in TypeBox
  'DATETIME.plainMonthDay': NOT_SUPPORTED, // no Temporal.PlainMonthDay type in TypeBox
  'DATETIME.duration': NOT_SUPPORTED, // no Temporal.Duration type in TypeBox

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {
    build: () => {
      const schema = Type.String({maxLength: 5});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({maxLength: 5});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_minLength': {
    build: () => {
      const schema = Type.String({minLength: 3});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({minLength: 3});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_length': {
    build: () => {
      const schema = Type.String({minLength: 4, maxLength: 4});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({minLength: 4, maxLength: 4});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_range': {
    build: () => {
      const schema = Type.String({minLength: 2, maxLength: 4});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({minLength: 2, maxLength: 4});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars': {
    build: () => {
      const schema = Type.String({pattern: '^[0-9a-f]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[0-9a-f]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': NOT_SUPPORTED, // TypeBox patterns are case-sensitive; no regex flags support
  'STRING_FORMAT.string_allowedChars_literal': {
    build: () => {
      const schema = Type.String({pattern: '^[.\\-]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[.\\-]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    build: () => {
      const schema = Type.String({pattern: '^[^!@#]*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[^!@#]*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    build: () => {
      const schema = Type.Union([Type.Literal('red'), Type.Literal('green'), Type.Literal('blue')]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Literal('red'), Type.Literal('green'), Type.Literal('blue')]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': NOT_SUPPORTED, // TypeBox patterns are case-sensitive; no regex flags support
  'STRING_FORMAT.string_allowedValues_escaped': {
    build: () => {
      const schema = Type.Union([Type.Literal('a.b'), Type.Literal('c+d')]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Literal('a.b'), Type.Literal('c+d')]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_disallowedValues': {
    build: () => {
      const schema = Type.String({pattern: '^(?!(?:admin|root)$)[\\s\\S]*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^(?!(?:admin|root)$)[\\s\\S]*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    build: () => {
      const schema = Type.Union([Type.Literal('a'), Type.Literal('b')]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([Type.Literal('a'), Type.Literal('b')]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.alpha': {
    build: () => {
      const schema = Type.String({pattern: '^[A-Za-z]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[A-Za-z]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    build: () => {
      const schema = Type.String({pattern: '^[A-Za-z0-9]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[A-Za-z0-9]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.numeric': {
    build: () => {
      const schema = Type.String({pattern: '^[0-9]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[0-9]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.alpha_withLength': {
    build: () => {
      const schema = Type.String({pattern: '^[A-Za-z]+$', maxLength: 3});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[A-Za-z]+$', maxLength: 3});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.lowercase_validate': {
    build: () => {
      const schema = Type.String();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.uuidv4': {
    build: () => {
      const schema = Type.String({
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.uuidv7': {
    build: () => {
      const schema = Type.String({
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_iso': NOT_SUPPORTED, // requires calendar-aware validation (leap year, month-day bounds)
  'STRING_FORMAT.date_DMY': NOT_SUPPORTED, // requires calendar-aware validation (leap year, month-day bounds)
  'STRING_FORMAT.date_YM': NOT_SUPPORTED, // requires calendar-aware validation (month 1-12)
  'STRING_FORMAT.date_MD': NOT_SUPPORTED, // requires calendar-aware validation (Feb 29 without year)
  'STRING_FORMAT.date_minMax_absolute': NOT_SUPPORTED, // requires date comparison semantics
  'STRING_FORMAT.time_iso': {
    build: () => {
      const schema = Type.String({
        pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](2[0-3]|[01][0-9]):[0-5][0-9])$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](2[0-3]|[01][0-9]):[0-5][0-9])$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_HHmmss': {
    build: () => {
      const schema = Type.String({pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => {
      const schema = Type.String({pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^(2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_minMax_absolute': NOT_SUPPORTED, // requires time comparison semantics
  'STRING_FORMAT.dateTime_default': NOT_SUPPORTED, // requires calendar-aware date validation (leap year)
  'STRING_FORMAT.dateTime_custom': NOT_SUPPORTED, // requires calendar-aware date validation
  'STRING_FORMAT.dateTime_minMax_absolute': NOT_SUPPORTED, // requires datetime comparison semantics
  'STRING_FORMAT.ipv4': {
    build: () => {
      const schema = Type.String({
        pattern: `^${`${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}`}$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: `^${`${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}`}$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv6': {
    build: () => {
      const schema = Type.String({
        pattern: `^${
          '(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,7}:' +
          '|:((:[0-9a-fA-F]{1,4}){1,7}|:)' +
          '|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}' +
          '|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}' +
          '|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}' +
          '|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6}))'
        }$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: `^${
          '(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,7}:' +
          '|:((:[0-9a-fA-F]{1,4}){1,7}|:)' +
          '|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}' +
          '|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}' +
          '|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}' +
          '|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6}))'
        }$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.ip_any': {
    build: () => {
      const schema = Type.String({
        pattern: `^(${`${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}`}|${
          '(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,7}:' +
          '|:((:[0-9a-fA-F]{1,4}){1,7}|:)' +
          '|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}' +
          '|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}' +
          '|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}' +
          '|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6}))'
        })$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: `^(${`${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}`}|${
          '(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,7}:' +
          '|:((:[0-9a-fA-F]{1,4}){1,7}|:)' +
          '|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}' +
          '|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}' +
          '|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}' +
          '|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}' +
          '|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6}))'
        })$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv4_port': {
    build: () => {
      const schema = Type.String({
        pattern: `^${`${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}`}:${'(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[0-9]{1,4})'}$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: `^${`${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}[.]${'(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'}`}:${'(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[0-9]{1,4})'}$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv6_port': {
    build: () => {
      const schema = Type.String({
        pattern: `^[\\[0-9a-fA-F:]{2,39}\\]:${'(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[0-9]{1,4})'}$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: `^[\\[0-9a-fA-F:]{2,39}\\]:${'(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[0-9]{1,4})'}$`,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.domain': {
    build: () => {
      const schema = Type.String({pattern: '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.domainParts': {
    build: () => {
      const schema = Type.String({pattern: '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.]){1,5}[a-zA-Z]{2,}$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.]){1,5}[a-zA-Z]{2,}$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.email': {
    build: () => {
      const schema = Type.String({
        pattern: '^[a-zA-Z0-9.+_-]+@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: '^[a-zA-Z0-9.+_-]+@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.emailPunycode': {
    build: () => {
      const schema = Type.String({
        pattern: '^[a-zA-Z0-9.+_-]+@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+(xn--[a-zA-Z0-9]+|[a-zA-Z]{2,})$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: '^[a-zA-Z0-9.+_-]+@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+(xn--[a-zA-Z0-9]+|[a-zA-Z]{2,})$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.emailParts': {
    build: () => {
      const schema = Type.String({
        pattern: '^[a-zA-Z0-9.][a-zA-Z0-9._-]{0,62}@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: '^[a-zA-Z0-9.][a-zA-Z0-9._-]{0,62}@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.url': {
    build: () => {
      const schema = Type.String({pattern: '^(https?|ftp|wss?)://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?([/:][^ ]*)?$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^(https?|ftp|wss?)://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?([/:][^ ]*)?$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.urlHttp': {
    build: () => {
      const schema = Type.String({pattern: '^https?://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?([/:][^ ]*)?$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^https?://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?([/:][^ ]*)?$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.urlFile': {
    build: () => {
      const schema = Type.String({pattern: '^file:///[^ ]*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^file:///[^ ]*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => {
      const schema = Type.String({pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    build: () => {
      const schema = Type.String({pattern: '^[0-9a-fA-F]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[0-9a-fA-F]+$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {
    build: () => {
      const schema = Type.Number({maximum: 100});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Number({maximum: 100});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_min': {
    build: () => {
      const schema = Type.Number({minimum: 0});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Number({minimum: 0});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_lt': {
    build: () => {
      const schema = Type.Number({exclusiveMaximum: 10});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Number({exclusiveMaximum: 10});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_gt': {
    build: () => {
      const schema = Type.Number({exclusiveMinimum: 0});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Number({exclusiveMinimum: 0});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_integer': {
    build: () => {
      const schema = Type.Integer();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Integer();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // FormatFloat carries no failable constraint, so the equivalent schema is a plain
  // Type.Number(): whole values are legal floats.
  'NUMBER_FORMAT.number_float': {
    build: () => {
      const schema = Type.Number();
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Number();
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_multipleOf': {
    build: () => {
      const schema = Type.Number({multipleOf: 5});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Number({multipleOf: 5});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_combined': {
    build: () => {
      const schema = Type.Integer({minimum: 0, maximum: 100, multipleOf: 5});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Integer({minimum: 0, maximum: 100, multipleOf: 5});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    build: () => {
      const schema = Type.Integer({minimum: -128, maximum: 127});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Integer({minimum: -128, maximum: 127});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => {
      const schema = Type.Integer({minimum: 0, maximum: 255});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Integer({minimum: 0, maximum: 255});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': {
    build: () => {
      const schema = Type.BigInt({maximum: 100n});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.BigInt({maximum: 100n});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_min': {
    build: () => {
      const schema = Type.BigInt({minimum: 0n});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.BigInt({minimum: 0n});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_lt': {
    build: () => {
      const schema = Type.BigInt({exclusiveMaximum: 10n});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.BigInt({exclusiveMaximum: 10n});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_gt': {
    build: () => {
      const schema = Type.BigInt({exclusiveMinimum: 0n});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.BigInt({exclusiveMinimum: 0n});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_multipleOf': {
    build: () => {
      const schema = Type.BigInt({multipleOf: 5n});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.BigInt({multipleOf: 5n});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_combined': {
    build: () => {
      const schema = Type.BigInt({minimum: 0n, maximum: 1000n, multipleOf: 10n});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.BigInt({minimum: 0n, maximum: 1000n, multipleOf: 10n});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED, // the compiler emits `value <= BigInt(9223372036854775807)` — the bound is stringified into a Number literal, which rounds to 9223372036854775808n, so the max+1 invalid sample is wrongly accepted
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED, // same `BigInt(<numeric-literal>)` rounding: 18446744073709551615 → 18446744073709551616n, so the max+1 invalid sample is wrongly accepted

  // ── DATETIME (min/max + relative) ──
  'DATETIME.date_minmax': NOT_SUPPORTED, // requires Date comparison semantics
  'DATETIME.date_gtlt': NOT_SUPPORTED, // requires Date comparison semantics
  'DATETIME.date_min_lt': NOT_SUPPORTED, // requires Date comparison semantics
  'DATETIME.date_max_now': NOT_SUPPORTED, // requires relative time (now) semantics
  'DATETIME.date_rel_window': NOT_SUPPORTED, // requires relative time semantics
  'DATETIME.date_rel_datetime_components': NOT_SUPPORTED, // requires relative time semantics
  'DATETIME.instant_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.instant_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.instant_rel': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_min_only': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_max_only': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainTime_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED, // no Temporal types in TypeBox
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED, // no Temporal types in TypeBox

  // ── REALWORLD ──
  'REALWORLD.user': {
    build: () => {
      const schema = Type.Object({
        id: Type.Number(),
        email: Type.String(),
        name: Type.String(),
        age: Type.Optional(Type.Number()),
        roles: Type.Array(Type.Union([Type.Literal('admin'), Type.Literal('editor'), Type.Literal('user')])),
        active: Type.Boolean(),
        createdAt: Type.String(),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        id: Type.Number(),
        email: Type.String(),
        name: Type.String(),
        age: Type.Optional(Type.Number()),
        roles: Type.Array(Type.Union([Type.Literal('admin'), Type.Literal('editor'), Type.Literal('user')])),
        active: Type.Boolean(),
        createdAt: Type.String(),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'REALWORLD.order': {
    build: () => {
      const schema = Type.Object({
        id: Type.String(),
        customer: Type.Object({id: Type.Number(), email: Type.String()}),
        items: Type.Array(Type.Object({sku: Type.String(), name: Type.String(), qty: Type.Number(), price: Type.Number()})),
        shipping: Type.Object({
          street: Type.String(),
          city: Type.String(),
          state: Type.String(),
          zip: Type.String(),
          country: Type.String(),
        }),
        status: Type.Union([
          Type.Literal('pending'),
          Type.Literal('paid'),
          Type.Literal('shipped'),
          Type.Literal('delivered'),
          Type.Literal('cancelled'),
        ]),
        total: Type.Number(),
        note: Type.Optional(Type.String()),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        id: Type.String(),
        customer: Type.Object({id: Type.Number(), email: Type.String()}),
        items: Type.Array(Type.Object({sku: Type.String(), name: Type.String(), qty: Type.Number(), price: Type.Number()})),
        shipping: Type.Object({
          street: Type.String(),
          city: Type.String(),
          state: Type.String(),
          zip: Type.String(),
          country: Type.String(),
        }),
        status: Type.Union([
          Type.Literal('pending'),
          Type.Literal('paid'),
          Type.Literal('shipped'),
          Type.Literal('delivered'),
          Type.Literal('cancelled'),
        ]),
        total: Type.Number(),
        note: Type.Optional(Type.String()),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'REALWORLD.blogPost': {
    build: () => {
      const schema = Type.Object({
        id: Type.Number(),
        title: Type.String(),
        slug: Type.String(),
        body: Type.String(),
        tags: Type.Array(Type.String()),
        author: Type.Object({name: Type.String(), email: Type.String()}),
        published: Type.Boolean(),
        publishedAt: Type.Optional(Type.String()),
        meta: Type.Object({views: Type.Number(), likes: Type.Number()}),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        id: Type.Number(),
        title: Type.String(),
        slug: Type.String(),
        body: Type.String(),
        tags: Type.Array(Type.String()),
        author: Type.Object({name: Type.String(), email: Type.String()}),
        published: Type.Boolean(),
        publishedAt: Type.Optional(Type.String()),
        meta: Type.Object({views: Type.Number(), likes: Type.Number()}),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'REALWORLD.product': {
    build: () => {
      const schema = Type.Object({
        id: Type.String(),
        name: Type.String(),
        description: Type.String(),
        price: Type.Number(),
        currency: Type.Union([Type.Literal('USD'), Type.Literal('EUR'), Type.Literal('GBP')]),
        inStock: Type.Boolean(),
        categories: Type.Array(Type.String()),
        dimensions: Type.Optional(Type.Object({width: Type.Number(), height: Type.Number(), depth: Type.Number()})),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        id: Type.String(),
        name: Type.String(),
        description: Type.String(),
        price: Type.Number(),
        currency: Type.Union([Type.Literal('USD'), Type.Literal('EUR'), Type.Literal('GBP')]),
        inStock: Type.Boolean(),
        categories: Type.Array(Type.String()),
        dimensions: Type.Optional(Type.Object({width: Type.Number(), height: Type.Number(), depth: Type.Number()})),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'REALWORLD.productPage': {
    build: () => {
      const schema = Type.Object({
        data: Type.Array(
          Type.Object({
            id: Type.String(),
            name: Type.String(),
            description: Type.String(),
            price: Type.Number(),
            currency: Type.Union([Type.Literal('USD'), Type.Literal('EUR'), Type.Literal('GBP')]),
            inStock: Type.Boolean(),
            categories: Type.Array(Type.String()),
            dimensions: Type.Optional(Type.Object({width: Type.Number(), height: Type.Number(), depth: Type.Number()})),
          })
        ),
        page: Type.Number(),
        pageSize: Type.Number(),
        total: Type.Number(),
        hasMore: Type.Boolean(),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        data: Type.Array(
          Type.Object({
            id: Type.String(),
            name: Type.String(),
            description: Type.String(),
            price: Type.Number(),
            currency: Type.Union([Type.Literal('USD'), Type.Literal('EUR'), Type.Literal('GBP')]),
            inStock: Type.Boolean(),
            categories: Type.Array(Type.String()),
            dimensions: Type.Optional(Type.Object({width: Type.Number(), height: Type.Number(), depth: Type.Number()})),
          })
        ),
        page: Type.Number(),
        pageSize: Type.Number(),
        total: Type.Number(),
        hasMore: Type.Boolean(),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'REALWORLD.registrationForm': {
    build: () => {
      const schema = Type.Object({
        email: Type.String(),
        password: Type.String(),
        acceptedTerms: Type.Literal(true),
        profile: Type.Object({firstName: Type.String(), lastName: Type.String(), age: Type.Optional(Type.Number())}),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        email: Type.String(),
        password: Type.String(),
        acceptedTerms: Type.Literal(true),
        profile: Type.Object({firstName: Type.String(), lastName: Type.String(), age: Type.Optional(Type.Number())}),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'REALWORLD.toBeChecked': {
    build: () => {
      const schema = Type.Object({
        number: Type.Number(),
        negNumber: Type.Number(),
        maxNumber: Type.Number(),
        string: Type.String(),
        longString: Type.String(),
        boolean: Type.Boolean(),
        deeplyNested: Type.Object({foo: Type.String(), num: Type.Number(), bool: Type.Boolean()}),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        number: Type.Number(),
        negNumber: Type.Number(),
        maxNumber: Type.Number(),
        string: Type.String(),
        longString: Type.String(),
        boolean: Type.Boolean(),
        deeplyNested: Type.Object({foo: Type.String(), num: Type.Number(), bool: Type.Boolean()}),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── JSON_SCHEMA ──
  // TypeBox schemas ARE JSON Schema: its own builders emit the same document as each constraint.
  'JSON_SCHEMA.property_names': {
    build: () => {
      const schema = Type.Record(Type.String(), Type.Number(), {propertyNames: {pattern: '^[a-z]+$'}});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Record(Type.String(), Type.Number(), {propertyNames: {pattern: '^[a-z]+$'}});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'JSON_SCHEMA.contains_count': {
    build: () => {
      const schema = Type.Array(Type.Number(), {contains: Type.Number({minimum: 10}), minContains: 2});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Number(), {contains: Type.Number({minimum: 10}), minContains: 2});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'JSON_SCHEMA.unique_items': {
    build: () => {
      const schema = Type.Array(Type.Number(), {uniqueItems: true});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Array(Type.Number(), {uniqueItems: true});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'JSON_SCHEMA.object_size': {
    build: () => {
      const schema = Type.Record(Type.String(), Type.Number(), {minProperties: 1, maxProperties: 3});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Record(Type.String(), Type.Number(), {minProperties: 1, maxProperties: 3});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'JSON_SCHEMA.string_email': {
    build: () => {
      const schema = Type.String({
        pattern: '^[a-zA-Z0-9.+_-]+@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: '^[a-zA-Z0-9.+_-]+@([a-zA-Z0-9]{2,}([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?[.])+[a-zA-Z]{2,}$',
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'JSON_SCHEMA.int_bounded': {
    build: () => {
      const schema = Type.Integer({minimum: 0, maximum: 130});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Integer({minimum: 0, maximum: 130});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'JSON_SCHEMA.string_pattern': {
    build: () => {
      const schema = Type.String({pattern: '^[a-z][a-z0-9-]*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: '^[a-z][a-z0-9-]*$'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'JSON_SCHEMA.multiple_of': {
    build: () => {
      const schema = Type.Number({multipleOf: 5});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Number({multipleOf: 5});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── STRICT ──
  // additionalProperties:false at EVERY level — the nested object must be closed
  // too, or the nested-extra-key sample would be accepted.
  'STRICT.flat_required': {
    build: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String(), active: Type.Boolean()}, {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({id: Type.Number(), name: Type.String(), active: Type.Boolean()}, {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRICT.nested_required': {
    build: () => {
      const schema = Type.Object({name: Type.String(), inner: Type.Object({x: Type.Number(), y: Type.String()}, {additionalProperties: false})}, {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({name: Type.String(), inner: Type.Object({x: Type.Number(), y: Type.String()}, {additionalProperties: false})}, {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRICT.moltar_dto': {
    build: () => {
      const schema = Type.Object({number: Type.Number(), negNumber: Type.Number(), maxNumber: Type.Number(), string: Type.String(), longString: Type.String(), boolean: Type.Boolean(), deeplyNested: Type.Object({foo: Type.String(), num: Type.Number(), bool: Type.Boolean()}, {additionalProperties: false})}, {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({number: Type.Number(), negNumber: Type.Number(), maxNumber: Type.Number(), string: Type.String(), longString: Type.String(), boolean: Type.Boolean(), deeplyNested: Type.Object({foo: Type.String(), num: Type.Number(), bool: Type.Boolean()}, {additionalProperties: false})}, {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRICT.realworld_order': {
    build: () => {
      const schema = Type.Object({id: Type.String(), customer: Type.Object({id: Type.Number(), email: Type.String()}, {additionalProperties: false}), items: Type.Array(Type.Object({sku: Type.String(), name: Type.String(), qty: Type.Number(), price: Type.Number()}, {additionalProperties: false})), shipping: Type.Object({street: Type.String(), city: Type.String(), state: Type.String(), zip: Type.String(), country: Type.String()}, {additionalProperties: false}), status: Type.Union([Type.Literal('pending'), Type.Literal('paid'), Type.Literal('shipped'), Type.Literal('delivered'), Type.Literal('cancelled')]), total: Type.Number(), note: Type.Optional(Type.String())}, {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({id: Type.String(), customer: Type.Object({id: Type.Number(), email: Type.String()}, {additionalProperties: false}), items: Type.Array(Type.Object({sku: Type.String(), name: Type.String(), qty: Type.Number(), price: Type.Number()}, {additionalProperties: false})), shipping: Type.Object({street: Type.String(), city: Type.String(), state: Type.String(), zip: Type.String(), country: Type.String()}, {additionalProperties: false}), status: Type.Union([Type.Literal('pending'), Type.Literal('paid'), Type.Literal('shipped'), Type.Literal('delivered'), Type.Literal('cancelled')]), total: Type.Number(), note: Type.Optional(Type.String())}, {additionalProperties: false});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
};
