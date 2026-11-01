// TOTAL map over every shared case key. TypeBox 1.x has no Date, Map, Set or Temporal type: each is a leaf
// `Type.Refine` over `Type.Unsafe({})` (instanceof check, plus the bound compares for min/max/relative cases).
// Bigint literals and int64 / uint64 bounds are refines too: TypeBox prints a bigint const or bound as a number
// literal, wrong above 2^53 (and `Type.Literal(1n)` never matches). All-optional and index-signature objects get
// mion's plain-object guard as a refine (TypeBox's Object only rejects arrays). Patterns are RegExp objects: they
// keep mion's flags and are not re-compiled per `.Errors` call. Unsupported: the non-data cases mion refuses
// (factoryThrows: symbol, RegExp, Promise, callable interface).

import {Type} from 'typebox';
import {Compile} from 'typebox/compile';
import {Format} from 'typebox/format';
import {Settings} from 'typebox/system';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

// Errors metric collects every error like mion: TypeBox caps `.Errors` at 8 by default.
Settings.Set({maxErrors: Infinity});

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
      const schema = Type.Enum([0, 'green', 2]); // enum Color {Red, Green = 'green', Blue = 2} member values
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Enum([0, 'green', 2]); // enum Color {Red, Green = 'green', Blue = 2} member values
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
  'ATOMIC.literal_1n': {
    build: () => {
      // Type.Literal(1n) compiles to `v === 1` (bigint printed as a number literal): always false. Leaf Refine instead.
      const schema = Type.Refine(Type.Unsafe<bigint>({}), (value) => value === 1n);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      // Type.Literal(1n) compiles to `v === 1` (bigint printed as a number literal): always false. Leaf Refine instead.
      const schema = Type.Refine(Type.Unsafe<bigint>({}), (value) => value === 1n);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // factoryThrows: mion refuses a symbol literal (non-data); Type.Literal(symbol) throws
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
  'ATOMIC.object': {
    build: () => {
      // TS `object`: Type.Object rejects arrays, so the raw JSON Schema type list object | array (no hook needed).
      const schema = Type.Unsafe<object>({type: ['object', 'array']});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      // TS `object`: Type.Object rejects arrays, so the raw JSON Schema type list object | array (no hook needed).
      const schema = Type.Unsafe<object>({type: ['object', 'array']});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'ATOMIC.regexp': NOT_SUPPORTED, // factoryThrows: mion refuses RegExp (non-data); TypeBox has no RegExp instance type
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
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows: shared case has no samples
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
  'ARRAY.regexp_array': NOT_SUPPORTED, // factoryThrows: mion refuses RegExp (non-data); TypeBox has no RegExp instance type
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
  'ARRAY.symbol_array': NOT_SUPPORTED, // factoryThrows: shared case has no samples
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
  // Refine = mion's plain-object guard on the index-signature node; TypeBox's Record only rejects arrays.
  'OBJECT.index_signature_string': {
    build: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.String()), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.String()), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // additionalProperties as a schema = the index signature: only undeclared keys hit the union, like mion's sibling skip.
  // The refine adds mion's plain-object guard (every index-signature node).
  'OBJECT.index_signature_named_props': {
    build: () => {
      const schema = Type.Refine(Type.Object({a: Type.String(), b: Type.Number()}, {additionalProperties: Type.Union([Type.String(), Type.Number()])}), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Object({a: Type.String(), b: Type.Number()}, {additionalProperties: Type.Union([Type.String(), Type.Number()])}), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // Refine = mion's plain-object guard, on both index-signature levels.
  'OBJECT.index_signature_nested': {
    build: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.Refine(Type.Record(Type.String(), Type.Number()), (value) => Object.prototype.toString.call(value) === '[object Object]')), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.Refine(Type.Record(Type.String(), Type.Number()), (value) => Object.prototype.toString.call(value) === '[object Object]')), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // Refine = mion's plain-object guard, on both index-signature levels.
  'OBJECT.index_signature_date_value': {
    build: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.Refine(Type.Record(Type.String(), Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))), (value) => Object.prototype.toString.call(value) === '[object Object]')), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.Refine(Type.Record(Type.String(), Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))), (value) => Object.prototype.toString.call(value) === '[object Object]')), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // additionalProperties as a schema = the index signature on `c`; refine = mion's plain-object guard on that node only.
  'OBJECT.index_signature_non_root': {
    build: () => {
      const schema = Type.Object({
        b: Type.String(),
        c: Type.Refine(Type.Object({a: Type.String()}, {additionalProperties: Type.String()}), (value) => Object.prototype.toString.call(value) === '[object Object]'),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        b: Type.String(),
        c: Type.Refine(Type.Object({a: Type.String()}, {additionalProperties: Type.String()}), (value) => Object.prototype.toString.call(value) === '[object Object]'),
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
  // TypeBox Object rejects arrays only; the refine adds mion's plain-object guard so Date / Map / Set / RegExp fail.
  'OBJECT.interface_all_optional': {
    build: () => {
      const schema = Type.Refine(Type.Object({a: Type.Optional(Type.String()), b: Type.Optional(Type.Number())}), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Object({a: Type.Optional(Type.String()), b: Type.Optional(Type.Number())}), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
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
      // One tuple, not a union of two: minItems 2 (overrides Tuple's minItems = length) makes slot 3 optional; it may hold undefined, like mion.
      const schema = Type.Tuple([Type.Number(), Type.Boolean(), Type.Union([Type.Undefined(), Type.String()])], {minItems: 2});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple([Type.Number(), Type.Boolean(), Type.Union([Type.Undefined(), Type.String()])], {minItems: 2});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // prefixItems + items (2020-12): the Errors walk over rest slots reports every bad one (additionalItems stops at the first).
  // minItems 2: the two leading params are required, as in mion.
  'OBJECT.call_signature_params_with_rest': {
    build: () => {
      const schema = Type.Unsafe<[number, boolean, ...Date[]]>(
        Type.Array(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), {prefixItems: [Type.Number(), Type.Boolean()], minItems: 2})
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Unsafe<[number, boolean, ...Date[]]>(
        Type.Array(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), {prefixItems: [Type.Number(), Type.Boolean()], minItems: 2})
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
  // Refine = mion's plain-object guard on the index-signature node.
  'OBJECT.union_value_index': {
    build: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()])), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()])), (value) => Object.prototype.toString.call(value) === '[object Object]');
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
  // String key on purpose: mion does not check that keys are numeric. Refine = mion's plain-object guard.
  'OBJECT.index_signature_number_key': {
    build: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.String()), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.String()), (value) => Object.prototype.toString.call(value) === '[object Object]');
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
      // [number, bigint?, boolean?, number?]: only slot 0 required (minItems 1); an optional slot may hold undefined
      const schema = Type.Tuple(
        [
          Type.Number(),
          Type.Union([Type.Undefined(), Type.BigInt()]),
          Type.Union([Type.Undefined(), Type.Boolean()]),
          Type.Union([Type.Undefined(), Type.Number()]),
        ],
        {minItems: 1},
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple(
        [
          Type.Number(),
          Type.Union([Type.Undefined(), Type.BigInt()]),
          Type.Union([Type.Undefined(), Type.Boolean()]),
          Type.Union([Type.Undefined(), Type.Number()]),
        ],
        {minItems: 1},
      );
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
      // prefixItems + items (2020-12 rest form): Errors walks every rest element (additionalItems stops at the first)
      const schema = Type.Unsafe<[number, ...string[]]>({type: 'array', prefixItems: [Type.Number()], items: Type.String(), minItems: 1});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Unsafe<[number, ...string[]]>({type: 'array', prefixItems: [Type.Number()], items: Type.String(), minItems: 1});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.tuple_circular': {
    build: () => {
      // T = [Date, number, string, null, string[], bigint, T?]: one tuple, slot 6 optional (minItems 6)
      const schema = Type.Cyclic(
        {
          Self: Type.Tuple(
            [
              Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())),
              Type.Number(),
              Type.String(),
              Type.Null(),
              Type.Array(Type.String()),
              Type.BigInt(),
              Type.Union([Type.Undefined(), Type.Ref('Self')]),
            ],
            {minItems: 6},
          ),
        },
        'Self',
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic(
        {
          Self: Type.Tuple(
            [
              Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())),
              Type.Number(),
              Type.String(),
              Type.Null(),
              Type.Array(Type.String()),
              Type.BigInt(),
              Type.Union([Type.Undefined(), Type.Ref('Self')]),
            ],
            {minItems: 6},
          ),
        },
        'Self',
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TUPLE.tuple_multiple_trailing_optionals': {
    build: () => {
      // [number, bigint?, boolean?, number?]: only slot 0 required (minItems 1); an optional slot may hold undefined
      const schema = Type.Tuple(
        [
          Type.Number(),
          Type.Union([Type.Undefined(), Type.BigInt()]),
          Type.Union([Type.Undefined(), Type.Boolean()]),
          Type.Union([Type.Undefined(), Type.Number()]),
        ],
        {minItems: 1},
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Tuple(
        [
          Type.Number(),
          Type.Union([Type.Undefined(), Type.BigInt()]),
          Type.Union([Type.Undefined(), Type.Boolean()]),
          Type.Union([Type.Undefined(), Type.Number()]),
        ],
        {minItems: 1},
      );
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
      const schema = Type.Enum(['UNO', 'DOS', 'TRES']);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Enum(['UNO', 'DOS', 'TRES']);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'UNION.large_union_eight_arms': {
    build: () => {
      const schema = Type.Union([
        Type.Enum(['a', 'b']),
        Type.Number(),
        Type.Boolean(),
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
        Type.Enum(['a', 'b']),
        Type.Number(),
        Type.Boolean(),
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
  // Object arm {a?: U; b?: string} is all-optional: refine = mion's plain-object guard + weak-type guard (a known key, or no key).
  'UNION.circular_union': {
    build: () => {
      const schema = Type.Cyclic(
        {
          Self: Type.Union([
            Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())),
            Type.Number(),
            Type.String(),
            Type.Refine(
              Type.Object({a: Type.Optional(Type.Ref('Self')), b: Type.Optional(Type.String())}),
              (value) =>
                Object.prototype.toString.call(value) === '[object Object]' &&
                ('a' in value || 'b' in value || Object.keys(value).length === 0),
            ),
            Type.Array(Type.Ref('Self')),
          ]),
        },
        'Self',
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic(
        {
          Self: Type.Union([
            Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())),
            Type.Number(),
            Type.String(),
            Type.Refine(
              Type.Object({a: Type.Optional(Type.Ref('Self')), b: Type.Optional(Type.String())}),
              (value) =>
                Object.prototype.toString.call(value) === '[object Object]' &&
                ('a' in value || 'b' in value || Object.keys(value).length === 0),
            ),
            Type.Array(Type.Ref('Self')),
          ]),
        },
        'Self',
      );
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
      // arm 3 {c: bigint; [k: string]: bigint}: named c + additionalProperties for every other key
      const schema = Type.Union([
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Object({c: Type.BigInt()}, {additionalProperties: Type.BigInt()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Object({c: Type.BigInt()}, {additionalProperties: Type.BigInt()}),
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
      // last arm's aa is the string LITERAL 'string', as in the shared type
      const schema = Type.Union([
        Type.Array(Type.String()),
        Type.Array(Type.Number()),
        Type.Array(Type.Boolean()),
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Object({c: Type.BigInt(), aa: Type.Literal('string')}),
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
        Type.Object({c: Type.BigInt(), aa: Type.Literal('string')}),
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
      // index arms: named props + additionalProperties for every other key (mion skips the named keys in its index loop)
      const schema = Type.Union([
        Type.Array(Type.String()),
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Object({a: Type.String()}, {additionalProperties: Type.String()}),
        Type.Object({b: Type.BigInt()}, {additionalProperties: Type.BigInt()}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.Array(Type.String()),
        Type.Object({a: Type.String(), aa: Type.Boolean()}),
        Type.Object({b: Type.Number()}),
        Type.Object({a: Type.String()}, {additionalProperties: Type.String()}),
        Type.Object({b: Type.BigInt()}, {additionalProperties: Type.BigInt()}),
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
  // Hand patterns as RegExp objects (mion's regex, no flags): TypeBox's ${number} placeholder rejects 1., .5, 007.
  'TEMPLATE_LITERAL.url_with_number_id': {
    build: () => {
      const schema = Type.String({pattern: /^api\/user\/-?(?:\d+\.?\d*|\.\d+)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^api\/user\/-?(?:\d+\.?\d*|\.\d+)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => {
      const schema = Type.String({pattern: /^\/api\/v-?(?:\d+\.?\d*|\.\d+)\/user\/[\s\S]*\/posts\/-?(?:\d+\.?\d*|\.\d+)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^\/api\/v-?(?:\d+\.?\d*|\.\d+)\/user\/[\s\S]*\/posts\/-?(?:\d+\.?\d*|\.\d+)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    build: () => {
      const schema = Type.String({pattern: /^[\s\S]*\/-?(?:\d+\.?\d*|\.\d+)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[\s\S]*\/-?(?:\d+\.?\d*|\.\d+)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.regex_special_chars': {
    build: () => {
      const schema = Type.String({pattern: /^\(-?(?:\d+\.?\d*|\.\d+)\)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^\(-?(?:\d+\.?\d*|\.\d+)\)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    build: () => {
      const schema = Type.Object({
        url: Type.String({pattern: /^api\/user\/-?(?:\d+\.?\d*|\.\d+)$/}),
        method: Type.String(),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        url: Type.String({pattern: /^api\/user\/-?(?:\d+\.?\d*|\.\d+)$/}),
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
      const schema = Type.String({pattern: /^(?:a|b)--?(?:\d+\.?\d*|\.\d+)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^(?:a|b)--?(?:\d+\.?\d*|\.\d+)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': {
    build: () => {
      // No Map type in TypeBox: leaf Refine, instanceof Map + string key + finite number value per entry, like mion.
      const schema = Type.Refine(Type.Unsafe<Map<string, number>>({}), (value) => {
        if (!(value instanceof Map)) return false;
        for (const [k, v] of value) {
          if (typeof k !== 'string' || !Number.isFinite(v)) return false;
        }
        return true;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      // No Map type in TypeBox: leaf Refine. Visits every entry (mion reports each bad key and value); one Refine error.
      const schema = Type.Refine(Type.Unsafe<Map<string, number>>({}), (value) => {
        if (!(value instanceof Map)) return false;
        let ok = true;
        for (const [k, v] of value) {
          if (typeof k !== 'string') ok = false;
          if (!Number.isFinite(v)) ok = false;
        }
        return ok;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NATIVE.set_string': {
    build: () => {
      // No Set type in TypeBox: leaf Refine, instanceof Set + string item check per value, like mion.
      const schema = Type.Refine(Type.Unsafe<Set<string>>({}), (value) => {
        if (!(value instanceof Set)) return false;
        for (const item of value) {
          if (typeof item !== 'string') return false;
        }
        return true;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      // No Set type in TypeBox: leaf Refine. Visits every item (mion reports each bad item); one Refine error.
      const schema = Type.Refine(Type.Unsafe<Set<string>>({}), (value) => {
        if (!(value instanceof Set)) return false;
        let ok = true;
        for (const item of value) {
          if (typeof item !== 'string') ok = false;
        }
        return ok;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'NATIVE.promise_string': NOT_SUPPORTED, // factoryThrows: mion refuses Promise (non-data); TypeBox has no Promise type
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
      const schema = Type.Cyclic({Self: Type.Array(Type.Union([Type.Ref('Self'), Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String()]))}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Array(Type.Union([Type.Ref('Self'), Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), Type.Number(), Type.String()]))}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.object_with_tuple_prop': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          tuple: Type.Tuple([Type.BigInt(), Type.Union([Type.Undefined(), Type.Ref('Self')])], {minItems: 1}),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          tuple: Type.Tuple([Type.BigInt(), Type.Union([Type.Undefined(), Type.Ref('Self')])], {minItems: 1}),
        })}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.object_with_index_prop': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({index: Type.Refine(Type.Record(Type.String(), Type.Ref('Self')), (value) => Object.prototype.toString.call(value) === '[object Object]')})}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Cyclic({Self: Type.Object({index: Type.Refine(Type.Record(Type.String(), Type.Ref('Self')), (value) => Object.prototype.toString.call(value) === '[object Object]')})}, 'Self');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR.object_deeply_nested': {
    build: () => {
      const schema = Type.Cyclic({Self: Type.Object({
          deep1: Type.Object({
            deep2: Type.Object({
              deep3: Type.Refine(Type.Object({deep4: Type.Optional(Type.Ref('Self'))}), (value) => Object.prototype.toString.call(value) === '[object Object]'),
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
              deep3: Type.Refine(Type.Object({deep4: Type.Optional(Type.Ref('Self'))}), (value) => Object.prototype.toString.call(value) === '[object Object]'),
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
            deep: Type.Optional(Type.Ref('Deep')),
          }),
          Root: Type.Object({
            isRoot: Type.Literal(true),
            ciChild: Type.Ref('Deep'),
            ciRoort: Type.Optional(Type.Ref('Root')),
            ciDate: Type.Ref('CDate'),
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
            deep: Type.Optional(Type.Ref('Deep')),
          }),
          Root: Type.Object({
            isRoot: Type.Literal(true),
            ciChild: Type.Ref('Deep'),
            ciRoort: Type.Optional(Type.Ref('Root')),
            ciDate: Type.Ref('CDate'),
          }),
        },
        'Root'
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── CIRCULAR_REFS ── (cyclic VALUES; TypeBox has no cycle detection: one root cycle hook gates the schema)
  'CIRCULAR_REFS.linked_list_cycle': {
    build: () => {
      // Root cycle hook along `next` only; `then` (the recursive schema) runs only on an acyclic value.
      const hasCycle = (node: unknown, stack: object[]): boolean => {
        if (node === null || typeof node !== 'object') return false;
        if (stack.indexOf(node) !== -1) return true;
        stack.push(node);
        const hit = hasCycle((node as {next?: unknown}).next, stack);
        stack.pop();
        return hit;
      };
      const shape = Type.Cyclic({Node: Type.Object({value: Type.Number(), next: Type.Union([Type.Null(), Type.Ref('Node')])})}, 'Node');
      const schema = Type.Unsafe<unknown>({if: Type.Refine(Type.Unknown(), (value) => !hasCycle(value, [])), then: shape, else: false});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const hasCycle = (node: unknown, stack: object[]): boolean => {
        if (node === null || typeof node !== 'object') return false;
        if (stack.indexOf(node) !== -1) return true;
        stack.push(node);
        const hit = hasCycle((node as {next?: unknown}).next, stack);
        stack.pop();
        return hit;
      };
      const shape = Type.Cyclic({Node: Type.Object({value: Type.Number(), next: Type.Union([Type.Null(), Type.Ref('Node')])})}, 'Node');
      const schema = Type.Unsafe<unknown>({if: Type.Refine(Type.Unknown(), (value) => !hasCycle(value, [])), then: shape, else: false});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR_REFS.tree_cycle': {
    build: () => {
      // Root cycle hook along `children[*]` only; `then` (the recursive schema) runs only on an acyclic value.
      const hasCycle = (node: unknown, stack: object[]): boolean => {
        if (node === null || typeof node !== 'object') return false;
        if (stack.indexOf(node) !== -1) return true;
        const children = (node as {children?: unknown}).children;
        if (!Array.isArray(children)) return false;
        stack.push(node);
        for (let i = 0; i < children.length; i++) if (hasCycle(children[i], stack)) return true;
        stack.pop();
        return false;
      };
      const shape = Type.Cyclic({Node: Type.Object({label: Type.String(), children: Type.Array(Type.Ref('Node'))})}, 'Node');
      const schema = Type.Unsafe<unknown>({if: Type.Refine(Type.Unknown(), (value) => !hasCycle(value, [])), then: shape, else: false});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const hasCycle = (node: unknown, stack: object[]): boolean => {
        if (node === null || typeof node !== 'object') return false;
        if (stack.indexOf(node) !== -1) return true;
        const children = (node as {children?: unknown}).children;
        if (!Array.isArray(children)) return false;
        stack.push(node);
        for (let i = 0; i < children.length; i++) if (hasCycle(children[i], stack)) return true;
        stack.pop();
        return false;
      };
      const shape = Type.Cyclic({Node: Type.Object({label: Type.String(), children: Type.Array(Type.Ref('Node'))})}, 'Node');
      const schema = Type.Unsafe<unknown>({if: Type.Refine(Type.Unknown(), (value) => !hasCycle(value, [])), then: shape, else: false});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'CIRCULAR_REFS.object_self_cycle': {
    build: () => {
      // Root cycle hook along `next` only; `then` (the recursive schema) runs only on an acyclic value.
      const hasCycle = (node: unknown, stack: object[]): boolean => {
        if (node === null || typeof node !== 'object') return false;
        if (stack.indexOf(node) !== -1) return true;
        stack.push(node);
        const hit = hasCycle((node as {next?: unknown}).next, stack);
        stack.pop();
        return hit;
      };
      const shape = Type.Cyclic({Node: Type.Object({name: Type.String(), next: Type.Optional(Type.Ref('Node'))})}, 'Node');
      const schema = Type.Unsafe<unknown>({if: Type.Refine(Type.Unknown(), (value) => !hasCycle(value, [])), then: shape, else: false});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const hasCycle = (node: unknown, stack: object[]): boolean => {
        if (node === null || typeof node !== 'object') return false;
        if (stack.indexOf(node) !== -1) return true;
        stack.push(node);
        const hit = hasCycle((node as {next?: unknown}).next, stack);
        stack.pop();
        return hit;
      };
      const shape = Type.Cyclic({Node: Type.Object({name: Type.String(), next: Type.Optional(Type.Ref('Node'))})}, 'Node');
      const schema = Type.Unsafe<unknown>({if: Type.Refine(Type.Unknown(), (value) => !hasCycle(value, [])), then: shape, else: false});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── UTILITY ──
  'UTILITY.partial': {
    build: () => {
      const schema = Type.Refine(
        Type.Partial(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))})),
        (value) => Object.prototype.toString.call(value) === '[object Object]'
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(
        Type.Partial(Type.Object({name: Type.String(), age: Type.Number(), createdAt: Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))})),
        (value) => Object.prototype.toString.call(value) === '[object Object]'
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
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
      const schema = Type.Object({
        name: Type.String(),
        age: Type.Optional(Type.Number()),
        createdAt: Type.Optional(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))),
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Object({
        name: Type.String(),
        age: Type.Optional(Type.Number()),
        createdAt: Type.Optional(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))),
      });
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
      const schema = Type.Refine(
        Type.Object({
          display: Type.Optional(
            Type.Refine(
              Type.Object({
                theme: Type.Optional(Type.Union([Type.Literal('light'), Type.Literal('dark')])),
                brightness: Type.Optional(Type.Number()),
              }),
              (value) => Object.prototype.toString.call(value) === '[object Object]'
            )
          ),
          audio: Type.Optional(
            Type.Refine(
              Type.Object({
                volume: Type.Optional(Type.Number()),
                muted: Type.Optional(Type.Boolean()),
              }),
              (value) => Object.prototype.toString.call(value) === '[object Object]'
            )
          ),
        }),
        (value) => Object.prototype.toString.call(value) === '[object Object]'
      );
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(
        Type.Object({
          display: Type.Optional(
            Type.Refine(
              Type.Object({
                theme: Type.Optional(Type.Union([Type.Literal('light'), Type.Literal('dark')])),
                brightness: Type.Optional(Type.Number()),
              }),
              (value) => Object.prototype.toString.call(value) === '[object Object]'
            )
          ),
          audio: Type.Optional(
            Type.Refine(
              Type.Object({
                volume: Type.Optional(Type.Number()),
                muted: Type.Optional(Type.Boolean()),
              }),
              (value) => Object.prototype.toString.call(value) === '[object Object]'
            )
          ),
        }),
        (value) => Object.prototype.toString.call(value) === '[object Object]'
      );
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
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
  'DATETIME.instant': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.Instant>({}), (value) => value instanceof Temporal.Instant);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.Instant>({}), (value) => value instanceof Temporal.Instant);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({}), (value) => value instanceof Temporal.ZonedDateTime);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({}), (value) => value instanceof Temporal.ZonedDateTime);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainTime': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainTime>({}), (value) => value instanceof Temporal.PlainTime);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainTime>({}), (value) => value instanceof Temporal.PlainTime);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({}), (value) => value instanceof Temporal.PlainYearMonth);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({}), (value) => value instanceof Temporal.PlainYearMonth);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainMonthDay': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainMonthDay>({}), (value) => value instanceof Temporal.PlainMonthDay);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainMonthDay>({}), (value) => value instanceof Temporal.PlainMonthDay);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.duration': {
    build: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.Duration>({}), (value) => value instanceof Temporal.Duration);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Unsafe<Temporal.Duration>({}), (value) => value instanceof Temporal.Duration);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

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
      const schema = Type.String({pattern: /^[0-9a-f]+$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[0-9a-f]+$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': {
    build: () => {
      const schema = Type.String({pattern: /^[abc]+$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[abc]+$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars_literal': {
    build: () => {
      const schema = Type.String({pattern: /^[.\-]+$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[.\-]+$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    build: () => {
      const schema = Type.String({pattern: /^[^!@#]*$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[^!@#]*$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    build: () => {
      const schema = Type.Enum(['red', 'green', 'blue']);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Enum(['red', 'green', 'blue']);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': {
    build: () => {
      const schema = Type.String({pattern: /^(?:red|green)$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^(?:red|green)$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues_escaped': {
    build: () => {
      const schema = Type.Enum(['a.b', 'c+d']);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Enum(['a.b', 'c+d']);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_disallowedValues': {
    build: () => {
      const schema = Type.String({pattern: /^(?!(?:admin|root)$)/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^(?!(?:admin|root)$)/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    build: () => {
      const schema = Type.Enum(['a', 'b']);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Enum(['a', 'b']);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.alpha': {
    build: () => {
      const schema = Type.String({pattern: /^[\p{L}]+$/u});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[\p{L}]+$/u});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    build: () => {
      const schema = Type.String({pattern: /^[\p{L}\p{N}]+$/u});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[\p{L}\p{N}]+$/u});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.numeric': {
    build: () => {
      const schema = Type.String({pattern: /^[\p{N}]+$/u});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[\p{N}]+$/u});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.alpha_withLength': {
    build: () => {
      const schema = Type.String({maxLength: 3, pattern: /^[\p{L}]+$/u});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({maxLength: 3, pattern: /^[\p{L}]+$/u});
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
      const schema = Type.String({pattern: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.uuidv7': {
    build: () => {
      const schema = Type.String({pattern: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_iso': {
    build: () => {
      const schema = Type.String({format: 'date'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({format: 'date'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // No built-in DD-MM-YYYY format: leaf refine, digits-only parts + month / day limits + leap year.
  'STRING_FORMAT.date_DMY': {
    build: () => {
      const shape = /^\d{2}-\d{2}-\d{4}$/;
      const schema = Type.Refine(Type.String(), (v) => {
        if (!shape.test(v)) return false;
        const y = Number(v.slice(6, 10));
        const m = Number(v.slice(3, 5));
        const d = Number(v.slice(0, 2));
        if (m < 1 || m > 12 || d < 1) return false;
        if (m === 2) return d <= 28 || (d === 29 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
        return d <= (m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31);
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const shape = /^\d{2}-\d{2}-\d{4}$/;
      const schema = Type.Refine(Type.String(), (v) => {
        if (!shape.test(v)) return false;
        const y = Number(v.slice(6, 10));
        const m = Number(v.slice(3, 5));
        const d = Number(v.slice(0, 2));
        if (m < 1 || m > 12 || d < 1) return false;
        if (m === 2) return d <= 28 || (d === 29 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
        return d <= (m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31);
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // No built-in YYYY-MM format: leaf refine, digits-only parts + month 1-12.
  'STRING_FORMAT.date_YM': {
    build: () => {
      const shape = /^\d{4}-\d{2}$/;
      const schema = Type.Refine(Type.String(), (v) => {
        if (!shape.test(v)) return false;
        const m = Number(v.slice(5, 7));
        return m >= 1 && m <= 12;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const shape = /^\d{4}-\d{2}$/;
      const schema = Type.Refine(Type.String(), (v) => {
        if (!shape.test(v)) return false;
        const m = Number(v.slice(5, 7));
        return m >= 1 && m <= 12;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // No built-in MM-DD format: leaf refine, digits-only parts + month / day limits (no year: Feb 29 allowed).
  'STRING_FORMAT.date_MD': {
    build: () => {
      const shape = /^\d{2}-\d{2}$/;
      const schema = Type.Refine(Type.String(), (v) => {
        if (!shape.test(v)) return false;
        const m = Number(v.slice(0, 2));
        const d = Number(v.slice(3, 5));
        if (m < 1 || m > 12 || d < 1) return false;
        return d <= (m === 2 ? 29 : m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31);
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const shape = /^\d{2}-\d{2}$/;
      const schema = Type.Refine(Type.String(), (v) => {
        if (!shape.test(v)) return false;
        const m = Number(v.slice(0, 2));
        const d = Number(v.slice(3, 5));
        if (m < 1 || m > 12 || d < 1) return false;
        return d <= (m === 2 ? 29 : m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31);
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_minMax_absolute': {
    build: () => {
      const min = Date.UTC(2020, 0, 1);
      const max = Date.UTC(2020, 11, 31);
      const schema = Type.Refine(Type.String({format: 'date'}), (v) => {
        const t = Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
        return t >= min && t <= max;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const min = Date.UTC(2020, 0, 1);
      const max = Date.UTC(2020, 11, 31);
      const schema = Type.Refine(Type.String({format: 'date'}), (v) => {
        const t = Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
        return t >= min && t <= max;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_iso': {
    build: () => {
      const schema = Type.String({format: 'time'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({format: 'time'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_HHmmss': {
    build: () => {
      const schema = Type.String({pattern: /^(?:2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^(?:2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => {
      const schema = Type.String({pattern: /^(?:2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{3})?$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^(?:2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{3})?$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_minMax_absolute': {
    build: () => {
      const schema = Type.Refine(Type.String({pattern: /^(?:2[0-3]|[01][0-9]):[0-5][0-9]$/}), (v) => {
        const mins = Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
        return mins >= 540 && mins <= 1020;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.String({pattern: /^(?:2[0-3]|[01][0-9]):[0-5][0-9]$/}), (v) => {
        const mins = Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
        return mins >= 540 && mins <= 1020;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.dateTime_default': {
    build: () => {
      const schema = Type.String({format: 'date-time'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({format: 'date-time'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // No built-in "DD-MM-YYYY HH:mm" format: leaf refine, digits-only date parts + calendar limits, then HH:mm.
  'STRING_FORMAT.dateTime_custom': {
    build: () => {
      const shape = /^\d{2}-\d{2}-\d{4} (?:2[0-3]|[01]\d):[0-5]\d$/;
      const schema = Type.Refine(Type.String(), (v) => {
        if (!shape.test(v)) return false;
        const y = Number(v.slice(6, 10));
        const m = Number(v.slice(3, 5));
        const d = Number(v.slice(0, 2));
        if (m < 1 || m > 12 || d < 1) return false;
        if (m === 2) return d <= 28 || (d === 29 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
        return d <= (m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31);
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const shape = /^\d{2}-\d{2}-\d{4} (?:2[0-3]|[01]\d):[0-5]\d$/;
      const schema = Type.Refine(Type.String(), (v) => {
        if (!shape.test(v)) return false;
        const y = Number(v.slice(6, 10));
        const m = Number(v.slice(3, 5));
        const d = Number(v.slice(0, 2));
        if (m < 1 || m > 12 || d < 1) return false;
        if (m === 2) return d <= 28 || (d === 29 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
        return d <= (m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31);
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.dateTime_minMax_absolute': {
    build: () => {
      const min = Date.UTC(2020, 0, 1, 0, 0, 0);
      const max = Date.UTC(2020, 11, 31, 23, 59, 59);
      const sep = /[Tt]/;
      const hhmmss = /^(?:2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]$/;
      const schema = Type.Refine(Type.String(), (v) => {
        const i = v.search(sep);
        if (i === -1) return false;
        const d = v.substring(0, i);
        const t = v.substring(i + 1);
        if (!Format.IsDate(d) || !hhmmss.test(t)) return false;
        const ms = Date.UTC(
          Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)),
          Number(t.slice(0, 2)), Number(t.slice(3, 5)), Number(t.slice(6, 8)),
        );
        return ms >= min && ms <= max;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const min = Date.UTC(2020, 0, 1, 0, 0, 0);
      const max = Date.UTC(2020, 11, 31, 23, 59, 59);
      const sep = /[Tt]/;
      const hhmmss = /^(?:2[0-3]|[01][0-9]):[0-5][0-9]:[0-5][0-9]$/;
      const schema = Type.Refine(Type.String(), (v) => {
        const i = v.search(sep);
        if (i === -1) return false;
        const d = v.substring(0, i);
        const t = v.substring(i + 1);
        if (!Format.IsDate(d) || !hhmmss.test(t)) return false;
        const ms = Date.UTC(
          Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)),
          Number(t.slice(0, 2)), Number(t.slice(3, 5)), Number(t.slice(6, 8)),
        );
        return ms >= min && ms <= max;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv4': {
    build: () => {
      const schema = Type.String({pattern: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv6': {
    build: () => {
      const schema = Type.String({format: 'ipv6'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({format: 'ipv6'});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.ip_any': {
    build: () => {
      const schema = Type.Union([
        Type.String({pattern: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/}),
        Type.String({format: 'ipv6'}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Union([
        Type.String({pattern: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/}),
        Type.String({format: 'ipv6'}),
      ]);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // Port required (stricter than mion, which accepts a missing port); a port is 1-5 digits <= 65535, leading zeros allowed.
  'STRING_FORMAT.ipv4_port': {
    build: () => {
      const schema = Type.String({
        pattern: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?):(?:6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[0-5]\d{4}|\d{1,4})$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        pattern: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?):(?:6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[0-5]\d{4}|\d{1,4})$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  // Leaf refine: brackets + TypeBox's own ipv6 check inside + port <= 65535. Port required (stricter than mion).
  'STRING_FORMAT.ipv6_port': {
    build: () => {
      const bracketed = /^\[([^\]]+)\]:(\d+)$/;
      const schema = Type.Refine(Type.String(), (v) => {
        const m = bracketed.exec(v);
        return m !== null && Format.IsIPv6(m[1]) && Number(m[2]) <= 65535;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const bracketed = /^\[([^\]]+)\]:(\d+)$/;
      const schema = Type.Refine(Type.String(), (v) => {
        const m = bracketed.exec(v);
        return m !== null && Format.IsIPv6(m[1]) && Number(m[2]) <= 65535;
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.domain': {
    build: () => {
      const schema = Type.String({
        minLength: 5,
        maxLength: 253,
        pattern: /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        minLength: 5,
        maxLength: 253,
        pattern: /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.domainParts': {
    build: () => {
      const schema = Type.String({
        minLength: 5,
        maxLength: 253,
        pattern: /^(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.){1,5}[a-zA-Z]{2,12}$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        minLength: 5,
        maxLength: 253,
        pattern: /^(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.){1,5}[a-zA-Z]{2,12}$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.email': {
    build: () => {
      const schema = Type.String({
        minLength: 7,
        maxLength: 254,
        pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        minLength: 7,
        maxLength: 254,
        pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.emailPunycode': {
    build: () => {
      const schema = Type.String({
        minLength: 7,
        maxLength: 254,
        pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z0-9-]{2,63}$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        minLength: 7,
        maxLength: 254,
        pattern: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z0-9-]{2,63}$/,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.emailParts': {
    build: () => {
      const schema = Type.String({
        maxLength: 254,
        pattern: /^[^ ()<>\[\]:;\\,{}|+@]{1,64}@(?=.{5,253}$)(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.){1,5}[a-zA-Z]{2,12}$/u,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({
        maxLength: 254,
        pattern: /^[^ ()<>\[\]:;\\,{}|+@]{1,64}@(?=.{5,253}$)(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.){1,5}[a-zA-Z]{2,12}$/u,
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.url': {
    build: () => {
      const schema = Type.String({maxLength: 2048, pattern: /^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({maxLength: 2048, pattern: /^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.urlHttp': {
    build: () => {
      const schema = Type.String({maxLength: 2048, pattern: /^https?:\/\/[^\s/$.?#-][^\s]*$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({maxLength: 2048, pattern: /^https?:\/\/[^\s/$.?#-][^\s]*$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.urlFile': {
    build: () => {
      const schema = Type.String({maxLength: 2048, pattern: /^file:\/\/\/?(?:[a-zA-Z]:)?[^\s/$.?#-][^\s]*$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({maxLength: 2048, pattern: /^file:\/\/\/?(?:[a-zA-Z]:)?[^\s/$.?#-][^\s]*$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => {
      const schema = Type.String({pattern: /^[a-z0-9-]+$/});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[a-z0-9-]+$/});
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    build: () => {
      const schema = Type.String({pattern: /^[0-9a-f]+$/i});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({pattern: /^[0-9a-f]+$/i});
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
  'BIGINT_FORMAT.bigint_int64': {
    build: () => {
      const schema = Type.Refine(Type.BigInt(), (v) => v <= 9223372036854775807n && v >= -9223372036854775808n);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.BigInt(), (v) => v <= 9223372036854775807n && v >= -9223372036854775808n);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_uint64': {
    build: () => {
      const schema = Type.Refine(Type.BigInt(), (v) => v <= 18446744073709551615n && v >= 0n);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.BigInt(), (v) => v <= 18446744073709551615n && v >= 0n);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

  // ── DATETIME (min/max + relative) ──
  'DATETIME.date_minmax': {
    build: () => {
      const MIN = Date.UTC(2020, 0, 1, 0, 0, 0);
      const MAX = Date.UTC(2020, 11, 31, 23, 59, 59);
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), (value) => value.getTime() >= MIN), (value) => value.getTime() <= MAX);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Date.UTC(2020, 0, 1, 0, 0, 0);
      const MAX = Date.UTC(2020, 11, 31, 23, 59, 59);
      // allOf gate: the bound refines run only on a Date, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Date>({allOf: [Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))]}), (value) => value.getTime() >= MIN), (value) => value.getTime() <= MAX);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.date_gtlt': {
    build: () => {
      const MIN = Date.UTC(2020, 0, 1, 0, 0, 0);
      const MAX = Date.UTC(2020, 11, 31, 23, 59, 59);
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), (value) => value.getTime() > MIN), (value) => value.getTime() < MAX);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Date.UTC(2020, 0, 1, 0, 0, 0);
      const MAX = Date.UTC(2020, 11, 31, 23, 59, 59);
      // allOf gate: the bound refines run only on a Date, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Date>({allOf: [Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))]}), (value) => value.getTime() > MIN), (value) => value.getTime() < MAX);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.date_min_lt': {
    build: () => {
      const MIN = Date.UTC(2020, 0, 1, 0, 0, 0);
      const MAX = Date.UTC(2020, 11, 31, 23, 59, 59);
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), (value) => value.getTime() >= MIN), (value) => value.getTime() < MAX);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Date.UTC(2020, 0, 1, 0, 0, 0);
      const MAX = Date.UTC(2020, 11, 31, 23, 59, 59);
      // allOf gate: the bound refines run only on a Date, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Date>({allOf: [Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))]}), (value) => value.getTime() >= MIN), (value) => value.getTime() < MAX);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.date_max_now': {
    build: () => {
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), (value) => value.getTime() <= Date.now());
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      // allOf gate: the bound refines run only on a Date, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Date>({allOf: [Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))]}), (value) => value.getTime() <= Date.now());
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.date_rel_window': {
    build: () => {
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), (value) => {
        const bound = new Date();
        bound.setUTCFullYear(bound.getUTCFullYear() - 1000);
        return value.getTime() >= bound.getTime();
      }), (value) => {
        const bound = new Date();
        bound.setUTCFullYear(bound.getUTCFullYear() + 1000);
        return value.getTime() <= bound.getTime();
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      // allOf gate: the bound refines run only on a Date, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Date>({allOf: [Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))]}), (value) => {
        const bound = new Date();
        bound.setUTCFullYear(bound.getUTCFullYear() - 1000);
        return value.getTime() >= bound.getTime();
      }), (value) => {
        const bound = new Date();
        bound.setUTCFullYear(bound.getUTCFullYear() + 1000);
        return value.getTime() <= bound.getTime();
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.date_rel_datetime_components': {
    build: () => {
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime())), (value) => {
        const bound = new Date();
        bound.setUTCFullYear(bound.getUTCFullYear() - 1000);
        bound.setTime(bound.getTime() - 12 * 3600000);
        return value.getTime() >= bound.getTime();
      });
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      // allOf gate: the bound refines run only on a Date, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Date>({allOf: [Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date && !Number.isNaN(value.getTime()))]}), (value) => {
        const bound = new Date();
        bound.setUTCFullYear(bound.getUTCFullYear() - 1000);
        bound.setTime(bound.getTime() - 12 * 3600000);
        return value.getTime() >= bound.getTime();
      });
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.instant_minmax': {
    build: () => {
      const MIN = Temporal.Instant.from('2020-01-01T00:00:00Z');
      const MAX = Temporal.Instant.from('2020-12-31T23:59:59Z');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.Instant>({}), (value) => value instanceof Temporal.Instant), (value) => Temporal.Instant.compare(value, MIN) >= 0), (value) => Temporal.Instant.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Temporal.Instant.from('2020-01-01T00:00:00Z');
      const MAX = Temporal.Instant.from('2020-12-31T23:59:59Z');
      // allOf gate: the bound refines run only on a Instant, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.Instant>({allOf: [Type.Refine(Type.Unsafe<Temporal.Instant>({}), (value) => value instanceof Temporal.Instant)]}), (value) => Temporal.Instant.compare(value, MIN) >= 0), (value) => Temporal.Instant.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.instant_gtlt': {
    build: () => {
      const GT = Temporal.Instant.from('2020-01-01T00:00:00Z');
      const LT = Temporal.Instant.from('2020-12-31T23:59:59Z');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.Instant>({}), (value) => value instanceof Temporal.Instant), (value) => Temporal.Instant.compare(value, GT) > 0), (value) => Temporal.Instant.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const GT = Temporal.Instant.from('2020-01-01T00:00:00Z');
      const LT = Temporal.Instant.from('2020-12-31T23:59:59Z');
      // allOf gate: the bound refines run only on a Instant, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.Instant>({allOf: [Type.Refine(Type.Unsafe<Temporal.Instant>({}), (value) => value instanceof Temporal.Instant)]}), (value) => Temporal.Instant.compare(value, GT) > 0), (value) => Temporal.Instant.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.instant_rel': {
    build: () => {
      const DUR = Temporal.Duration.from('PT8760000H');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.Instant>({}), (value) => value instanceof Temporal.Instant), (value) => Temporal.Instant.compare(value, Temporal.Now.instant().subtract(DUR)) >= 0), (value) => Temporal.Instant.compare(value, Temporal.Now.instant().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const DUR = Temporal.Duration.from('PT8760000H');
      // allOf gate: the bound refines run only on a Instant, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.Instant>({allOf: [Type.Refine(Type.Unsafe<Temporal.Instant>({}), (value) => value instanceof Temporal.Instant)]}), (value) => Temporal.Instant.compare(value, Temporal.Now.instant().subtract(DUR)) >= 0), (value) => Temporal.Instant.compare(value, Temporal.Now.instant().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_minmax': {
    build: () => {
      const MIN = Temporal.PlainDate.from('2020-01-01');
      const MAX = Temporal.PlainDate.from('2020-12-31');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, MIN) >= 0), (value) => Temporal.PlainDate.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Temporal.PlainDate.from('2020-01-01');
      const MAX = Temporal.PlainDate.from('2020-12-31');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, MIN) >= 0), (value) => Temporal.PlainDate.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gtlt': {
    build: () => {
      const GT = Temporal.PlainDate.from('2020-01-01');
      const LT = Temporal.PlainDate.from('2020-12-31');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, GT) > 0), (value) => Temporal.PlainDate.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const GT = Temporal.PlainDate.from('2020-01-01');
      const LT = Temporal.PlainDate.from('2020-12-31');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, GT) > 0), (value) => Temporal.PlainDate.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_min_lt': {
    build: () => {
      const MIN = Temporal.PlainDate.from('2020-01-01');
      const LT = Temporal.PlainDate.from('2020-01-10');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, MIN) >= 0), (value) => Temporal.PlainDate.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Temporal.PlainDate.from('2020-01-01');
      const LT = Temporal.PlainDate.from('2020-01-10');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, MIN) >= 0), (value) => Temporal.PlainDate.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gt_max': {
    build: () => {
      const MAX = Temporal.PlainDate.from('2020-01-10');
      const GT = Temporal.PlainDate.from('2020-01-01');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, MAX) <= 0), (value) => Temporal.PlainDate.compare(value, GT) > 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MAX = Temporal.PlainDate.from('2020-01-10');
      const GT = Temporal.PlainDate.from('2020-01-01');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, MAX) <= 0), (value) => Temporal.PlainDate.compare(value, GT) > 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_min_only': {
    build: () => {
      const MIN = Temporal.PlainDate.from('2020-01-01');
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, MIN) >= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Temporal.PlainDate.from('2020-01-01');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, MIN) >= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_max_only': {
    build: () => {
      const MAX = Temporal.PlainDate.from('2020-12-31');
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MAX = Temporal.PlainDate.from('2020-12-31');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gt_only': {
    build: () => {
      const GT = Temporal.PlainDate.from('2020-01-01');
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, GT) > 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const GT = Temporal.PlainDate.from('2020-01-01');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, GT) > 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_lt_only': {
    build: () => {
      const LT = Temporal.PlainDate.from('2020-12-31');
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const LT = Temporal.PlainDate.from('2020-12-31');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_window': {
    build: () => {
      const DUR = Temporal.Duration.from('P1000Y');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, Temporal.Now.plainDateISO().subtract(DUR)) >= 0), (value) => Temporal.PlainDate.compare(value, Temporal.Now.plainDateISO().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const DUR = Temporal.Duration.from('P1000Y');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, Temporal.Now.plainDateISO().subtract(DUR)) >= 0), (value) => Temporal.PlainDate.compare(value, Temporal.Now.plainDateISO().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_ymd': {
    build: () => {
      const DUR = Temporal.Duration.from('P100Y6M15D');
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, Temporal.Now.plainDateISO().subtract(DUR)) >= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const DUR = Temporal.Duration.from('P100Y6M15D');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, Temporal.Now.plainDateISO().subtract(DUR)) >= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_weeks': {
    build: () => {
      const DUR = Temporal.Duration.from('P52200W');
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate), (value) => Temporal.PlainDate.compare(value, Temporal.Now.plainDateISO().subtract(DUR)) >= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const DUR = Temporal.Duration.from('P52200W');
      // allOf gate: the bound refines run only on a PlainDate, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDate>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDate>({}), (value) => value instanceof Temporal.PlainDate)]}), (value) => Temporal.PlainDate.compare(value, Temporal.Now.plainDateISO().subtract(DUR)) >= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainTime_minmax': {
    build: () => {
      const MIN = Temporal.PlainTime.from('09:00:00');
      const MAX = Temporal.PlainTime.from('17:00:00');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainTime>({}), (value) => value instanceof Temporal.PlainTime), (value) => Temporal.PlainTime.compare(value, MIN) >= 0), (value) => Temporal.PlainTime.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Temporal.PlainTime.from('09:00:00');
      const MAX = Temporal.PlainTime.from('17:00:00');
      // allOf gate: the bound refines run only on a PlainTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainTime>({}), (value) => value instanceof Temporal.PlainTime)]}), (value) => Temporal.PlainTime.compare(value, MIN) >= 0), (value) => Temporal.PlainTime.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainTime_gtlt': {
    build: () => {
      const GT = Temporal.PlainTime.from('09:00:00');
      const LT = Temporal.PlainTime.from('17:00:00');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainTime>({}), (value) => value instanceof Temporal.PlainTime), (value) => Temporal.PlainTime.compare(value, GT) > 0), (value) => Temporal.PlainTime.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const GT = Temporal.PlainTime.from('09:00:00');
      const LT = Temporal.PlainTime.from('17:00:00');
      // allOf gate: the bound refines run only on a PlainTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainTime>({}), (value) => value instanceof Temporal.PlainTime)]}), (value) => Temporal.PlainTime.compare(value, GT) > 0), (value) => Temporal.PlainTime.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_minmax': {
    build: () => {
      const MIN = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
      const MAX = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime), (value) => Temporal.PlainDateTime.compare(value, MIN) >= 0), (value) => Temporal.PlainDateTime.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
      const MAX = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
      // allOf gate: the bound refines run only on a PlainDateTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime)]}), (value) => Temporal.PlainDateTime.compare(value, MIN) >= 0), (value) => Temporal.PlainDateTime.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_gtlt': {
    build: () => {
      const GT = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
      const LT = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime), (value) => Temporal.PlainDateTime.compare(value, GT) > 0), (value) => Temporal.PlainDateTime.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const GT = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
      const LT = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
      // allOf gate: the bound refines run only on a PlainDateTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime)]}), (value) => Temporal.PlainDateTime.compare(value, GT) > 0), (value) => Temporal.PlainDateTime.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_rel': {
    build: () => {
      const DUR = Temporal.Duration.from('P1000Y');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime), (value) => Temporal.PlainDateTime.compare(value, Temporal.Now.plainDateTimeISO().subtract(DUR)) >= 0), (value) => Temporal.PlainDateTime.compare(value, Temporal.Now.plainDateTimeISO().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const DUR = Temporal.Duration.from('P1000Y');
      // allOf gate: the bound refines run only on a PlainDateTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime)]}), (value) => Temporal.PlainDateTime.compare(value, Temporal.Now.plainDateTimeISO().subtract(DUR)) >= 0), (value) => Temporal.PlainDateTime.compare(value, Temporal.Now.plainDateTimeISO().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_rel_combo': {
    build: () => {
      const DUR = Temporal.Duration.from('P500YT12H');
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime), (value) => Temporal.PlainDateTime.compare(value, Temporal.Now.plainDateTimeISO().subtract(DUR)) >= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const DUR = Temporal.Duration.from('P500YT12H');
      // allOf gate: the bound refines run only on a PlainDateTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainDateTime>({}), (value) => value instanceof Temporal.PlainDateTime)]}), (value) => Temporal.PlainDateTime.compare(value, Temporal.Now.plainDateTimeISO().subtract(DUR)) >= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_minmax': {
    build: () => {
      const MIN = Temporal.PlainYearMonth.from('2020-01');
      const MAX = Temporal.PlainYearMonth.from('2020-12');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({}), (value) => value instanceof Temporal.PlainYearMonth), (value) => Temporal.PlainYearMonth.compare(value, MIN) >= 0), (value) => Temporal.PlainYearMonth.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Temporal.PlainYearMonth.from('2020-01');
      const MAX = Temporal.PlainYearMonth.from('2020-12');
      // allOf gate: the bound refines run only on a PlainYearMonth, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({}), (value) => value instanceof Temporal.PlainYearMonth)]}), (value) => Temporal.PlainYearMonth.compare(value, MIN) >= 0), (value) => Temporal.PlainYearMonth.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_gtlt': {
    build: () => {
      const GT = Temporal.PlainYearMonth.from('2020-01');
      const LT = Temporal.PlainYearMonth.from('2020-12');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({}), (value) => value instanceof Temporal.PlainYearMonth), (value) => Temporal.PlainYearMonth.compare(value, GT) > 0), (value) => Temporal.PlainYearMonth.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const GT = Temporal.PlainYearMonth.from('2020-01');
      const LT = Temporal.PlainYearMonth.from('2020-12');
      // allOf gate: the bound refines run only on a PlainYearMonth, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({}), (value) => value instanceof Temporal.PlainYearMonth)]}), (value) => Temporal.PlainYearMonth.compare(value, GT) > 0), (value) => Temporal.PlainYearMonth.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_rel': {
    build: () => {
      const DUR = Temporal.Duration.from('P1000Y');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({}), (value) => value instanceof Temporal.PlainYearMonth), (value) => Temporal.PlainYearMonth.compare(value, Temporal.Now.plainDateISO().toPlainYearMonth().subtract(DUR)) >= 0), (value) => Temporal.PlainYearMonth.compare(value, Temporal.Now.plainDateISO().toPlainYearMonth().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const DUR = Temporal.Duration.from('P1000Y');
      // allOf gate: the bound refines run only on a PlainYearMonth, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({allOf: [Type.Refine(Type.Unsafe<Temporal.PlainYearMonth>({}), (value) => value instanceof Temporal.PlainYearMonth)]}), (value) => Temporal.PlainYearMonth.compare(value, Temporal.Now.plainDateISO().toPlainYearMonth().subtract(DUR)) >= 0), (value) => Temporal.PlainYearMonth.compare(value, Temporal.Now.plainDateISO().toPlainYearMonth().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_minmax': {
    build: () => {
      const MIN = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
      const MAX = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({}), (value) => value instanceof Temporal.ZonedDateTime), (value) => Temporal.ZonedDateTime.compare(value, MIN) >= 0), (value) => Temporal.ZonedDateTime.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const MIN = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
      const MAX = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
      // allOf gate: the bound refines run only on a ZonedDateTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({}), (value) => value instanceof Temporal.ZonedDateTime)]}), (value) => Temporal.ZonedDateTime.compare(value, MIN) >= 0), (value) => Temporal.ZonedDateTime.compare(value, MAX) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_gtlt': {
    build: () => {
      const GT = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
      const LT = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({}), (value) => value instanceof Temporal.ZonedDateTime), (value) => Temporal.ZonedDateTime.compare(value, GT) > 0), (value) => Temporal.ZonedDateTime.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const GT = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
      const LT = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
      // allOf gate: the bound refines run only on a ZonedDateTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({}), (value) => value instanceof Temporal.ZonedDateTime)]}), (value) => Temporal.ZonedDateTime.compare(value, GT) > 0), (value) => Temporal.ZonedDateTime.compare(value, LT) < 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_rel': {
    build: () => {
      const DUR = Temporal.Duration.from('P1000Y');
      const schema = Type.Refine(Type.Refine(Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({}), (value) => value instanceof Temporal.ZonedDateTime), (value) => Temporal.ZonedDateTime.compare(value, Temporal.Now.zonedDateTimeISO().subtract(DUR)) >= 0), (value) => Temporal.ZonedDateTime.compare(value, Temporal.Now.zonedDateTimeISO().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const DUR = Temporal.Duration.from('P1000Y');
      // allOf gate: the bound refines run only on a ZonedDateTime, each failed bound adds one error.
      const schema = Type.Refine(Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({allOf: [Type.Refine(Type.Unsafe<Temporal.ZonedDateTime>({}), (value) => value instanceof Temporal.ZonedDateTime)]}), (value) => Temporal.ZonedDateTime.compare(value, Temporal.Now.zonedDateTimeISO().subtract(DUR)) >= 0), (value) => Temporal.ZonedDateTime.compare(value, Temporal.Now.zonedDateTimeISO().add(DUR)) <= 0);
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },

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
      const schema = Type.Refine(Type.Record(Type.String(), Type.Number(), {propertyNames: {pattern: '^[a-z]+$'}}), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.Number(), {propertyNames: {pattern: '^[a-z]+$'}}), (value) => Object.prototype.toString.call(value) === '[object Object]');
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
      const schema = Type.Refine(Type.Record(Type.String(), Type.Number(), {minProperties: 1, maxProperties: 3}), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.Refine(Type.Record(Type.String(), Type.Number(), {minProperties: 1, maxProperties: 3}), (value) => Object.prototype.toString.call(value) === '[object Object]');
      const check = Compile(schema);
      return (value: unknown) => check.Errors(value).length === 0;
    },
  },
  'JSON_SCHEMA.string_email': {
    build: () => {
      // TypeBox's email format allows a dotless domain (`missing@tld`); the pattern adds mion's dotted-TLD rule.
      const schema = Type.String({format: 'email', pattern: '\\.[a-zA-Z]{2,63}$'});
      const check = Compile(schema);
      return (value: unknown) => check.Check(value);
    },
    buildErrors: () => {
      const schema = Type.String({format: 'email', pattern: '\\.[a-zA-Z]{2,63}$'});
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
