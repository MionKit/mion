// ts-runtypes validators keyed by suite case key ("GROUP.case"), TYPE form.
// Each entry is the case's own `validate` thunk copied VERBATIM from the shared
// suites (container/benchmarks/src/suites/**) — a `() => createValidateFn<T>()` arrow whose
// literal type argument the ts-runtypes-devtools rewrites at build time. Local
// enum / interface / type / function declarations inside a thunk are kept exactly
// as written so the plugin resolves `T` where it is authored. Cases the Go
// pipeline renders as an alwaysThrow factory (`factoryThrows`: symbol at a root or
// propagating position) opt out with NOT_SUPPORTED. This map also drives the
// runtime ts-go column and typecost's ts-go-type column. TOTAL over every key.

import type * as TF from '@ts-runtypes/core/formats';
import type * as TFT from '@ts-runtypes/core/formats/temporal';
import {createValidateFn, createGetValidationErrorsFn, registerFormatPattern} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

// Custom string-format patterns the STRING_FORMAT.pattern_* cases reference —
// copied VERBATIM from container/benchmarks/src/suites/format-validation/StringFormat.ts.
// The Go scanner recovers {source, flags, mockSamples} from these call sites, so
// the type aliases (`Slug` / `Hex`) resolve identically to the suite.
const slug = registerFormatPattern({
  source: '^[a-z0-9-]+$',
  mockSamples: ['my-slug', 'abc', 'a-b-c'],
  message: 'must be a slug',
});
type Slug = TF.String<{pattern: typeof slug}>;

const hex = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']});
type Hex = TF.String<{pattern: typeof hex}>;

export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': {
    build: () => createValidateFn<any>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<any>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.bigint': {
    build: () => createValidateFn<bigint>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<bigint>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.boolean': {
    build: () => createValidateFn<boolean>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<boolean>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.date': {
    build: () => createValidateFn<Date>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Date>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.enum_mixed': {
    build: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createValidateFn<Color>();
    },
    buildErrors: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const getErrors = createGetValidationErrorsFn<Color>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_2': {
    build: () => createValidateFn<2>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<2>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_a': {
    build: () => createValidateFn<'a'>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<'a'>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_true': {
    build: () => createValidateFn<true>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<true>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_1n': {
    build: () => createValidateFn<1n>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<1n>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_symbol': {
    build: () => {
      const sym = Symbol('hello');
      return createValidateFn<typeof sym>();
    },
    buildErrors: () => {
      const sym = Symbol('hello');
      const getErrors = createGetValidationErrorsFn<typeof sym>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.never': {
    build: () => createValidateFn<never>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<never>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.null': {
    build: () => createValidateFn<null>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<null>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.number': {
    build: () => createValidateFn<number>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<number>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.object': {
    build: () => createValidateFn<object>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<object>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.regexp': {
    build: () => createValidateFn<RegExp>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<RegExp>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.string': {
    build: () => createValidateFn<string>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.symbol': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.undefined': {
    build: () => createValidateFn<undefined>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<undefined>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.void': {
    build: () => createValidateFn<void>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<void>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_2_noLiterals': {
    build: () => createValidateFn<2>(undefined, {noLiterals: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<2>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_a_noLiterals': {
    build: () => createValidateFn<'a'>(undefined, {noLiterals: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<'a'>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_regexp_noLiterals': {
    build: () => {
      const reg = /abc/i;
      return createValidateFn<typeof reg>(undefined, {noLiterals: true});
    },
    buildErrors: () => {
      const reg = /abc/i;
      const getErrors = createGetValidationErrorsFn<typeof reg>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_true_noLiterals': {
    build: () => createValidateFn<true>(undefined, {noLiterals: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<true>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_1n_noLiterals': {
    build: () => createValidateFn<1n>(undefined, {noLiterals: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<1n>(undefined, {noLiterals: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // factoryThrows
  'ATOMIC.unknown': {
    build: () => createValidateFn<unknown>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<unknown>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── ARRAY ──
  'ARRAY.string_array': {
    build: () => createValidateFn<string[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.number_array': {
    build: () => createValidateFn<number[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<number[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.boolean_array': {
    build: () => createValidateFn<boolean[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<boolean[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.bigint_array': {
    build: () => createValidateFn<bigint[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<bigint[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.date_array': {
    build: () => createValidateFn<Date[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Date[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.regexp_array': {
    build: () => createValidateFn<RegExp[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<RegExp[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.undefined_array': {
    build: () => createValidateFn<undefined[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<undefined[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.null_array': {
    build: () => createValidateFn<null[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<null[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.array_generic': {
    build: () => createValidateFn<Array<string>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Array<string>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.string_array_2d': {
    build: () => createValidateFn<string[][]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string[][]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.string_array_3d': {
    build: () => createValidateFn<string[][][]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string[][][]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.string_array_noIsArrayCheck': {
    build: () => createValidateFn<string[]>(undefined, {noIsArrayCheck: true}),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string[]>(undefined, {noIsArrayCheck: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.object_array': {
    build: () => createValidateFn<{a: string}[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: string}[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.union_array': {
    build: () => createValidateFn<(string | number)[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<(string | number)[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.tuple_array': {
    build: () => createValidateFn<[string, number][]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[string, number][]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.circular_array': {
    build: () => {
      type CircularArray = CircularArray[];
      return createValidateFn<CircularArray>();
    },
    buildErrors: () => {
      type CircularArray = CircularArray[];
      const getErrors = createGetValidationErrorsFn<CircularArray>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.circular_object_with_array': {
    build: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createValidateFn<ObjectType>();
    },
    buildErrors: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const getErrors = createGetValidationErrorsFn<ObjectType>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // factoryThrows
  'ARRAY.readonly_string_array': {
    build: () => createValidateFn<ReadonlyArray<string>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<ReadonlyArray<string>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    build: () => createValidateFn<{a: string; b: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: string; b: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_as_const_literals': {
    build: () => createValidateFn<{readonly name: 'john'; readonly age: 30}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{readonly name: 'john'; readonly age: 30}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_via_return_type_utility': {
    build: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      return createValidateFn<ReturnType<typeof makeUser>>();
    },
    buildErrors: () => {
      function makeUser(): {id: number; name: string} {
        return {id: 1, name: 'john'};
      }
      const getErrors = createGetValidationErrorsFn<ReturnType<typeof makeUser>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_via_property_access': {
    build: () => createValidateFn<{id: number; name: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{id: number; name: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_via_array_access': {
    build: () => createValidateFn<{id: number; name: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{id: number; name: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_with_optional': {
    build: () => createValidateFn<{a: string; b?: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: string; b?: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_with_date': {
    build: () => createValidateFn<{date: Date; name: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{date: Date; name: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_with_method': {
    build: () => createValidateFn<{name: string; cb: () => any}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{name: string; cb: () => any}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.nested_object': {
    build: () => createValidateFn<{a: string; deep: {b: string; c: number}}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: string; deep: {b: string; c: number}}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_string_array_prop': {
    build: () => createValidateFn<{tags: string[]}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{tags: string[]}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.circular_interface': {
    build: () => {
      type ICircular = {name: string; child?: ICircular};
      return createValidateFn<ICircular>();
    },
    buildErrors: () => {
      type ICircular = {name: string; child?: ICircular};
      const getErrors = createGetValidationErrorsFn<ICircular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.circular_interface_on_array': {
    build: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      return createValidateFn<ICircularArray>();
    },
    buildErrors: () => {
      type ICircularArray = {name: string; children?: ICircularArray[]};
      const getErrors = createGetValidationErrorsFn<ICircularArray>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.circular_interface_on_nested_object': {
    build: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      return createValidateFn<ICircularDeep>();
    },
    buildErrors: () => {
      type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
      const getErrors = createGetValidationErrorsFn<ICircularDeep>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_string': {
    build: () => createValidateFn<{[key: string]: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{[key: string]: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_named_props': {
    build: () => createValidateFn<{a: string; b: number; [key: string]: string | number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: string; b: number; [key: string]: string | number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_nested': {
    build: () => createValidateFn<{[key: string]: {[key: string]: number}}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{[key: string]: {[key: string]: number}}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_date_value': {
    build: () => createValidateFn<{[key: string]: {[key: string]: Date}}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{[key: string]: {[key: string]: Date}}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_non_root': {
    build: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      return createValidateFn<Obj2>();
    },
    buildErrors: () => {
      interface Obj1 {
        a: string;
        [key: string]: string;
      }
      interface Obj2 {
        b: string;
        c: Obj1;
      }
      const getErrors = createGetValidationErrorsFn<Obj2>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.function_top_level': {
    build: () => createValidateFn<() => void>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<() => void>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_callable': {
    build: () => createValidateFn<{(a: number, b: boolean): string; extra: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{(a: number, b: boolean): string; extra: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_all_optional': {
    build: () => createValidateFn<{a?: string; b?: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a?: string; b?: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.class_simple': {
    build: () => {
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
      return createValidateFn<MySerializableClass>();
    },
    buildErrors: () => {
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
      const getErrors = createGetValidationErrorsFn<MySerializableClass>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.rpc_error_class': {
    build: () => {
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
      return createValidateFn<RpcError<'test-error'>>();
    },
    buildErrors: () => {
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
      const getErrors = createGetValidationErrorsFn<RpcError<'test-error'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params': {
    build: () => {
      type CallSig = (a: number, b: boolean) => string;
      return createValidateFn<Parameters<CallSig>>();
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean) => string;
      const getErrors = createGetValidationErrorsFn<Parameters<CallSig>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params_with_optional': {
    build: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      return createValidateFn<Parameters<CallSig>>();
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const getErrors = createGetValidationErrorsFn<Parameters<CallSig>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.call_signature_params_with_rest': {
    build: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      return createValidateFn<Parameters<CallSig>>();
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const getErrors = createGetValidationErrorsFn<Parameters<CallSig>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.record_union_keys': {
    build: () => createValidateFn<Record<'a' | 'b', number>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Record<'a' | 'b', number>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.union_value_index': {
    build: () => createValidateFn<{[key: string]: string | number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{[key: string]: string | number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.object_with_union_prop': {
    build: () => createValidateFn<{kind: 'a' | 'b'; n: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{kind: 'a' | 'b'; n: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.interface_inheritance': {
    build: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      return createValidateFn<Child>();
    },
    buildErrors: () => {
      interface Base {
        a: string;
      }
      interface Child extends Base {
        b: number;
      }
      const getErrors = createGetValidationErrorsFn<Child>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.class_inheritance': {
    build: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      return createValidateFn<Sub>();
    },
    buildErrors: () => {
      class Base {
        a: string = '';
      }
      class Sub extends Base {
        b: number = 0;
      }
      const getErrors = createGetValidationErrorsFn<Sub>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'OBJECT.index_signature_number_key': {
    build: () => createValidateFn<{[k: number]: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{[k: number]: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    build: () => createValidateFn<[string, number]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[string, number]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.full_mion_tuple': {
    build: () => createValidateFn<[Date, number, string, null, string[], bigint]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[Date, number, string, null, string[], bigint]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_with_optional': {
    build: () => createValidateFn<[number, bigint?, boolean?, number?]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[number, bigint?, boolean?, number?]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.nested_tuple_in_array': {
    build: () => createValidateFn<[string, number][]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[string, number][]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_rest': {
    build: () => createValidateFn<[number, ...string[]]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[number, ...string[]]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_circular': {
    build: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createValidateFn<TupleCircular>();
    },
    buildErrors: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const getErrors = createGetValidationErrorsFn<TupleCircular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_multiple_trailing_optionals': {
    build: () => createValidateFn<[number, bigint?, boolean?, number?]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[number, bigint?, boolean?, number?]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_named_labels': {
    build: () => createValidateFn<[name: string, age: number]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[name: string, age: number]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.tuple_with_non_serializable': {
    build: () => createValidateFn<[number, () => any]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[number, () => any]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.empty_tuple': {
    build: () => createValidateFn<[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.single_element_tuple': {
    build: () => createValidateFn<[string]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<[string]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TUPLE.readonly_tuple': {
    build: () => createValidateFn<readonly [string, number]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<readonly [string, number]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── UNION ──
  'UNION.atomic_union': {
    build: () => createValidateFn<Date | number | string | null | bigint>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Date | number | string | null | bigint>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.string_literal_union': {
    build: () => createValidateFn<'UNO' | 'DOS' | 'TRES'>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<'UNO' | 'DOS' | 'TRES'>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.large_union_eight_arms': {
    build: () => createValidateFn<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<
        'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.string_or_number': {
    build: () => createValidateFn<string | number>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string | number>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_of_array_types': {
    build: () => createValidateFn<string[] | number[] | boolean[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string[] | number[] | boolean[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.array_of_union': {
    build: () => createValidateFn<(string | bigint | boolean | Date)[]>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<(string | bigint | boolean | Date)[]>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_of_object_shapes': {
    build: () => createValidateFn<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: string; aa: boolean} | {b: number} | {c: bigint}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.discriminated_union': {
    build: () => createValidateFn<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{kind: 'a'; n: number} | {kind: 'b'; s: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.circular_union': {
    build: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createValidateFn<UnionC>();
    },
    buildErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const getErrors = createGetValidationErrorsFn<UnionC>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_with_methods': {
    build: () => createValidateFn<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{name: string; getName(): string} | {age: number; getAge(): number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.intersection_to_object': {
    build: () => createValidateFn<{a: string} & {b: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: string} & {b: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_with_index_arm': {
    build: () => createValidateFn<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_same_prop_different_types': {
    build: () => createValidateFn<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<
        {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_mixed_arrays_and_objects': {
    build: () =>
      createValidateFn<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_merged_property': {
    build: () => createValidateFn<{a: boolean} | {a: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{a: boolean} | {a: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_mixed_with_index': {
    build: () =>
      createValidateFn<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_with_any_fallback': {
    build: () => createValidateFn<string | any>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string | any>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_with_unknown_fallback': {
    build: () => createValidateFn<string | unknown>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<string | unknown>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_subset_small_first': {
    build: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createValidateFn<SmallObj | LargeObj>();
    },
    buildErrors: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const getErrors = createGetValidationErrorsFn<SmallObj | LargeObj>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_subset_nested_levels': {
    build: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createValidateFn<Tiny | Medium | Large>();
    },
    buildErrors: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const getErrors = createGetValidationErrorsFn<Tiny | Medium | Large>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UNION.union_subset_mixed_related_unrelated': {
    build: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createValidateFn<Base | Extended | Unrelated>();
    },
    buildErrors: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const getErrors = createGetValidationErrorsFn<Base | Extended | Unrelated>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': {
    build: () => createValidateFn<`api/user/${number}`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<`api/user/${number}`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => createValidateFn<`/api/v${number}/user/${string}/posts/${number}`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<`/api/v${number}/user/${string}/posts/${number}`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    build: () => createValidateFn<`${string}/${number}`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<`${string}/${number}`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.regex_special_chars': {
    build: () => createValidateFn<`(${number})`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<`(${number})`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    build: () => createValidateFn<{url: `api/user/${number}`; method: string}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{url: `api/user/${number}`; method: string}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_index_key': {
    build: () => createValidateFn<{[key: `api/${string}`]: number}>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<{[key: `api/${string}`]: number}>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    build: () => createValidateFn<`${'a' | 'b'}-${number}`>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<`${'a' | 'b'}-${number}`>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': {
    build: () => createValidateFn<Map<string, number>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Map<string, number>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NATIVE.set_string': {
    build: () => createValidateFn<Set<string>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Set<string>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NATIVE.promise_string': {
    build: () => createValidateFn<Promise<string>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Promise<string>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NATIVE.awaited_promise': {
    build: () => createValidateFn<Awaited<Promise<string>>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Awaited<Promise<string>>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': {
    build: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createValidateFn<Circular>();
    },
    buildErrors: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const getErrors = createGetValidationErrorsFn<Circular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.array_of_union_with_self_ref': {
    build: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createValidateFn<CuArray>();
    },
    buildErrors: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const getErrors = createGetValidationErrorsFn<CuArray>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.object_with_tuple_prop': {
    build: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createValidateFn<CircularTuple>();
    },
    buildErrors: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const getErrors = createGetValidationErrorsFn<CircularTuple>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.object_with_index_prop': {
    build: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createValidateFn<CircularIndex>();
    },
    buildErrors: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const getErrors = createGetValidationErrorsFn<CircularIndex>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.object_deeply_nested': {
    build: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createValidateFn<CircularDeep>();
    },
    buildErrors: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const getErrors = createGetValidationErrorsFn<CircularDeep>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.circular_child_under_literal_root': {
    build: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createValidateFn<RootNotCircular>();
    },
    buildErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const getErrors = createGetValidationErrorsFn<RootNotCircular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR.multiple_circular_types_cross_referenced': {
    build: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createValidateFn<RootCircular>();
    },
    buildErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      const getErrors = createGetValidationErrorsFn<RootCircular>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── CIRCULAR_REFS ── (cyclic VALUES; ts-go rejects via the {rejectCircularRefs} guard)
  'CIRCULAR_REFS.linked_list_cycle': {
    build: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      return createValidateFn<Node>(undefined, {rejectCircularRefs: true});
    },
    buildErrors: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      const getErrors = createGetValidationErrorsFn<Node>(undefined, {rejectCircularRefs: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR_REFS.tree_cycle': {
    build: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createValidateFn<Node>(undefined, {rejectCircularRefs: true});
    },
    buildErrors: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      const getErrors = createGetValidationErrorsFn<Node>(undefined, {rejectCircularRefs: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'CIRCULAR_REFS.object_self_cycle': {
    build: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createValidateFn<Node>(undefined, {rejectCircularRefs: true});
    },
    buildErrors: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      const getErrors = createGetValidationErrorsFn<Node>(undefined, {rejectCircularRefs: true});
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── UTILITY ──
  'UTILITY.partial': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<Partial<Person>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrorsFn<Partial<Person>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.required': {
    build: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createValidateFn<Required<MaybePerson>>();
    },
    buildErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const getErrors = createGetValidationErrorsFn<Required<MaybePerson>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.pick': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<Pick<Person, 'name' | 'createdAt'>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrorsFn<Pick<Person, 'name' | 'createdAt'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.omit': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<Omit<Person, 'age'>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrorsFn<Omit<Person, 'age'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.exclude_atomic': {
    build: () => createValidateFn<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Exclude<'name' | 'age' | 'createdAt', 'age'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.extract_atomic': {
    build: () => createValidateFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.exclude_from_object_union': {
    build: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createValidateFn<Exclude<Shape, {kind: 'circle'}>>();
    },
    buildErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const getErrors = createGetValidationErrorsFn<Exclude<Shape, {kind: 'circle'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.non_nullable': {
    build: () => createValidateFn<NonNullable<string | number | null | undefined>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<NonNullable<string | number | null | undefined>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.return_type': {
    build: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createValidateFn<ReturnType<Fn>>();
    },
    buildErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      const getErrors = createGetValidationErrorsFn<ReturnType<Fn>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.readonly': {
    build: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidateFn<Readonly<Person>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      const getErrors = createGetValidationErrorsFn<Readonly<Person>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.intersection_with_required_override': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrorsFn<Partial<Person> & Required<Pick<Person, 'name'>>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.omit_keeping_optional': {
    build: () => createValidateFn<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Omit<{a: string; b?: number; c: boolean}, 'a'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.keyof_to_literal_union': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<keyof Person>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const getErrors = createGetValidationErrorsFn<keyof Person>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.typeof_variable_query': {
    build: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createValidateFn<typeof config>();
    },
    buildErrors: () => {
      const config = {url: 'http://example.com', port: 8080};
      const getErrors = createGetValidationErrorsFn<typeof config>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.indexed_access_type': {
    build: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidateFn<Person['name']>();
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      const getErrors = createGetValidationErrorsFn<Person['name']>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.conditional_type_resolved': {
    build: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createValidateFn<IsString<'hello'>>();
    },
    buildErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      const getErrors = createGetValidationErrorsFn<IsString<'hello'>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.mapped_type_custom': {
    build: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createValidateFn<Nullable<Source>>();
    },
    buildErrors: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const getErrors = createGetValidationErrorsFn<Nullable<Source>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.mapped_type_with_conditional_value': {
    build: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createValidateFn<UserForm>();
    },
    buildErrors: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const getErrors = createGetValidationErrorsFn<UserForm>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.distributive_conditional_over_union': {
    build: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createValidateFn<Wrap<string | number>>();
    },
    buildErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const getErrors = createGetValidationErrorsFn<Wrap<string | number>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'UTILITY.deep_partial_recursive_mapped': {
    build: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createValidateFn<DeepPartial<Settings>>();
    },
    buildErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const getErrors = createGetValidationErrorsFn<DeepPartial<Settings>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': {
    build: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createValidateFn<Prefixed<Source>>();
    },
    buildErrors: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const getErrors = createGetValidationErrorsFn<Prefixed<Source>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TYPE_MAPPINGS.key_conditional_rename': {
    build: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createValidateFn<MongoForm<Source>>();
    },
    buildErrors: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const getErrors = createGetValidationErrorsFn<MongoForm<Source>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'TYPE_MAPPINGS.key_filter_via_never': {
    build: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createValidateFn<Public<Source>>();
    },
    buildErrors: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const getErrors = createGetValidationErrorsFn<Public<Source>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── DATETIME ──
  'DATETIME.date': {
    build: () => createValidateFn<Date>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Date>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.instant': {
    build: () => createValidateFn<Temporal.Instant>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Temporal.Instant>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime': {
    build: () => createValidateFn<Temporal.ZonedDateTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Temporal.ZonedDateTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate': {
    build: () => createValidateFn<Temporal.PlainDate>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Temporal.PlainDate>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainTime': {
    build: () => createValidateFn<Temporal.PlainTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Temporal.PlainTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime': {
    build: () => createValidateFn<Temporal.PlainDateTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Temporal.PlainDateTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth': {
    build: () => createValidateFn<Temporal.PlainYearMonth>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Temporal.PlainYearMonth>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainMonthDay': {
    build: () => createValidateFn<Temporal.PlainMonthDay>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Temporal.PlainMonthDay>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.duration': {
    build: () => createValidateFn<Temporal.Duration>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Temporal.Duration>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {
    build: () => createValidateFn<TF.String<{maxLength: 5}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{maxLength: 5}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_minLength': {
    build: () => createValidateFn<TF.String<{minLength: 3}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{minLength: 3}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_length': {
    build: () => createValidateFn<TF.String<{length: 4}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{length: 4}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_range': {
    build: () => createValidateFn<TF.String<{minLength: 2; maxLength: 4}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{minLength: 2; maxLength: 4}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars': {
    build: () => createValidateFn<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': {
    build: () => createValidateFn<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedChars_literal': {
    build: () => createValidateFn<TF.String<{allowedChars: {val: '.-'}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{allowedChars: {val: '.-'}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    build: () => createValidateFn<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    build: () => createValidateFn<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': {
    build: () => createValidateFn<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_allowedValues_escaped': {
    build: () => createValidateFn<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_disallowedValues': {
    build: () => createValidateFn<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    build: () => createValidateFn<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.alpha': {
    build: () => createValidateFn<TF.Alpha>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Alpha>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    build: () => createValidateFn<TF.AlphaNumeric>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.AlphaNumeric>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.numeric': {
    build: () => createValidateFn<TF.Numeric>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Numeric>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.alpha_withLength': {
    build: () => createValidateFn<TF.Alpha<{maxLength: 3}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Alpha<{maxLength: 3}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.lowercase_validate': {
    build: () => createValidateFn<TF.Lowercase>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Lowercase>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.uuidv4': {
    build: () => createValidateFn<TF.UUIDv4>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.UUIDv4>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.uuidv7': {
    build: () => createValidateFn<TF.UUIDv7>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.UUIDv7>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_iso': {
    build: () => createValidateFn<TF.StringDate>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringDate>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_DMY': {
    build: () => createValidateFn<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringDate<{format: 'DD-MM-YYYY'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_YM': {
    build: () => createValidateFn<TF.StringDate<{format: 'YYYY-MM'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringDate<{format: 'YYYY-MM'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_MD': {
    build: () => createValidateFn<TF.StringDate<{format: 'MM-DD'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringDate<{format: 'MM-DD'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.date_minMax_absolute': {
    build: () => createValidateFn<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_iso': {
    build: () => createValidateFn<TF.StringTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_HHmmss': {
    build: () => createValidateFn<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringTime<{format: 'HH:mm:ss'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => createValidateFn<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.time_minMax_absolute': {
    build: () => createValidateFn<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.dateTime_default': {
    build: () => createValidateFn<TF.StringDateTime>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.StringDateTime>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.dateTime_custom': {
    build: () => createValidateFn<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<
          TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>
        >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.dateTime_minMax_absolute': {
    build: () =>
      createValidateFn<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv4': {
    build: () => createValidateFn<TF.IPv4>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.IPv4>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv6': {
    build: () => createValidateFn<TF.IPv6>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.IPv6>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ip_any': {
    build: () => createValidateFn<TF.IP>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.IP>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv4_port': {
    build: () => createValidateFn<TF.IPv4WithPort>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.IPv4WithPort>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.ipv6_port': {
    build: () => createValidateFn<TF.IPv6WithPort>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.IPv6WithPort>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.domain': {
    build: () => createValidateFn<TF.Domain>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Domain>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.domainStrict': {
    build: () => createValidateFn<TF.DomainStrict>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.DomainStrict>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.email': {
    build: () => createValidateFn<TF.Email>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Email>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.emailPunycode': {
    build: () => createValidateFn<TF.EmailPunycode>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.EmailPunycode>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.emailStrict': {
    build: () => createValidateFn<TF.EmailStrict>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.EmailStrict>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.url': {
    build: () => createValidateFn<TF.Url>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Url>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.urlHttp': {
    build: () => createValidateFn<TF.UrlHttp>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.UrlHttp>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.urlFile': {
    build: () => createValidateFn<TF.UrlFile>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.UrlFile>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => createValidateFn<Slug>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Slug>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    build: () => createValidateFn<Hex>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<Hex>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {
    build: () => createValidateFn<TF.Number<{max: 100}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Number<{max: 100}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_min': {
    build: () => createValidateFn<TF.Number<{min: 0}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Number<{min: 0}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_lt': {
    build: () => createValidateFn<TF.Number<{lt: 10}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Number<{lt: 10}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_gt': {
    build: () => createValidateFn<TF.Number<{gt: 0}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Number<{gt: 0}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_integer': {
    build: () => createValidateFn<TF.Integer>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Integer>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_float': {
    build: () => createValidateFn<TF.Float>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Float>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_multipleOf': {
    build: () => createValidateFn<TF.Number<{multipleOf: 5}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Number<{multipleOf: 5}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_combined': {
    build: () => createValidateFn<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    build: () => createValidateFn<TF.Int8>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Int8>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => createValidateFn<TF.UInt8>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.UInt8>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': {
    build: () => createValidateFn<TF.BigInt<{max: 100n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.BigInt<{max: 100n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_min': {
    build: () => createValidateFn<TF.BigInt<{min: 0n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.BigInt<{min: 0n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_lt': {
    build: () => createValidateFn<TF.BigInt<{lt: 10n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.BigInt<{lt: 10n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_gt': {
    build: () => createValidateFn<TF.BigInt<{gt: 0n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.BigInt<{gt: 0n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_multipleOf': {
    build: () => createValidateFn<TF.BigInt<{multipleOf: 5n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.BigInt<{multipleOf: 5n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_combined': {
    build: () => createValidateFn<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_int64': {
    build: () => createValidateFn<TF.BigInt64>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.BigInt64>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'BIGINT_FORMAT.bigint_uint64': {
    build: () => createValidateFn<TF.BigUInt64>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.BigUInt64>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── DATETIME ──
  'DATETIME.date_minmax': {
    build: () => createValidateFn<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_gtlt': {
    build: () => createValidateFn<TF.Date<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Date<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_min_lt': {
    build: () => createValidateFn<TF.Date<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Date<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_max_now': {
    build: () => createValidateFn<TF.Date<{max: 'now'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Date<{max: 'now'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_rel_window': {
    build: () => createValidateFn<TF.Date<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Date<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.date_rel_datetime_components': {
    build: () => createValidateFn<TF.Date<{min: 'now-P1000YT12H'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TF.Date<{min: 'now-P1000YT12H'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.instant_minmax': {
    build: () => createValidateFn<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.instant_gtlt': {
    build: () => createValidateFn<TFT.Instant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<TFT.Instant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.instant_rel': {
    build: () => createValidateFn<TFT.Instant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.Instant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_minmax': {
    build: () => createValidateFn<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gtlt': {
    build: () => createValidateFn<TFT.PlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_min_lt': {
    build: () => createValidateFn<TFT.PlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gt_max': {
    build: () => createValidateFn<TFT.PlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_min_only': {
    build: () => createValidateFn<TFT.PlainDate<{min: '2020-01-01'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{min: '2020-01-01'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_max_only': {
    build: () => createValidateFn<TFT.PlainDate<{max: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{max: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_gt_only': {
    build: () => createValidateFn<TFT.PlainDate<{gt: '2020-01-01'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{gt: '2020-01-01'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_lt_only': {
    build: () => createValidateFn<TFT.PlainDate<{lt: '2020-12-31'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{lt: '2020-12-31'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_window': {
    build: () => createValidateFn<TFT.PlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_ymd': {
    build: () => createValidateFn<TFT.PlainDate<{min: 'now-P100Y6M15D'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{min: 'now-P100Y6M15D'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDate_rel_weeks': {
    build: () => createValidateFn<TFT.PlainDate<{min: 'now-P52200W'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{min: 'now-P52200W'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainTime_minmax': {
    build: () => createValidateFn<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainTime_gtlt': {
    build: () => createValidateFn<TFT.PlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_minmax': {
    build: () => createValidateFn<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_gtlt': {
    build: () => createValidateFn<TFT.PlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<TFT.PlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_rel': {
    build: () => createValidateFn<TFT.PlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainDateTime_rel_combo': {
    build: () => createValidateFn<TFT.PlainDateTime<{min: 'now-P500YT12H'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainDateTime<{min: 'now-P500YT12H'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_minmax': {
    build: () => createValidateFn<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_gtlt': {
    build: () => createValidateFn<TFT.PlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.plainYearMonth_rel': {
    build: () => createValidateFn<TFT.PlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.PlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_minmax': {
    build: () =>
      createValidateFn<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<
          TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>
        >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_gtlt': {
    build: () => createValidateFn<TFT.ZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    buildErrors: () => {
      const getErrors =
        createGetValidationErrorsFn<
          TFT.ZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>
        >();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'DATETIME.zonedDateTime_rel': {
    build: () => createValidateFn<TFT.ZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn<TFT.ZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── REALWORLD ──
  'REALWORLD.user': {
    build: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      return createValidateFn<User>();
    },
    buildErrors: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      const getErrors = createGetValidationErrorsFn<User>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.order': {
    build: () => {
      interface Address {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      }
      interface OrderItem {
        sku: string;
        name: string;
        qty: number;
        price: number;
      }
      interface Order {
        id: string;
        customer: {id: number; email: string};
        items: OrderItem[];
        shipping: Address;
        status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
        total: number;
        note?: string;
      }
      return createValidateFn<Order>();
    },
    buildErrors: () => {
      interface Address {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      }
      interface OrderItem {
        sku: string;
        name: string;
        qty: number;
        price: number;
      }
      interface Order {
        id: string;
        customer: {id: number; email: string};
        items: OrderItem[];
        shipping: Address;
        status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
        total: number;
        note?: string;
      }
      const getErrors = createGetValidationErrorsFn<Order>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.blogPost': {
    build: () => {
      interface BlogPost {
        id: number;
        title: string;
        slug: string;
        body: string;
        tags: string[];
        author: {name: string; email: string};
        published: boolean;
        publishedAt?: string;
        meta: {views: number; likes: number};
      }
      return createValidateFn<BlogPost>();
    },
    buildErrors: () => {
      interface BlogPost {
        id: number;
        title: string;
        slug: string;
        body: string;
        tags: string[];
        author: {name: string; email: string};
        published: boolean;
        publishedAt?: string;
        meta: {views: number; likes: number};
      }
      const getErrors = createGetValidationErrorsFn<BlogPost>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.product': {
    build: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      return createValidateFn<Product>();
    },
    buildErrors: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      const getErrors = createGetValidationErrorsFn<Product>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.productPage': {
    build: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      interface ProductPage {
        data: Product[];
        page: number;
        pageSize: number;
        total: number;
        hasMore: boolean;
      }
      return createValidateFn<ProductPage>();
    },
    buildErrors: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      interface ProductPage {
        data: Product[];
        page: number;
        pageSize: number;
        total: number;
        hasMore: boolean;
      }
      const getErrors = createGetValidationErrorsFn<ProductPage>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.registrationForm': {
    build: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      return createValidateFn<RegistrationForm>();
    },
    buildErrors: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      const getErrors = createGetValidationErrorsFn<RegistrationForm>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'REALWORLD.toBeChecked': {
    build: () => {
      interface ToBeChecked {
        number: number;
        negNumber: number;
        maxNumber: number;
        string: string;
        longString: string;
        boolean: boolean;
        deeplyNested: {foo: string; num: number; bool: boolean};
      }
      return createValidateFn<ToBeChecked>();
    },
    buildErrors: () => {
      interface ToBeChecked {
        number: number;
        negNumber: number;
        maxNumber: number;
        string: string;
        longString: string;
        boolean: boolean;
        deeplyNested: {foo: string; num: number; bool: boolean};
      }
      const getErrors = createGetValidationErrorsFn<ToBeChecked>();
      return (value: unknown) => getErrors(value).length === 0;
    },
  },

  // ── JSON_SCHEMA ──
  // The schema document is re-authored inline on purpose: `runTypeFromJsonSchema(…)` reads
  // its literal at BUILD time off this call site, so a cross-module reference
  // has nothing to read. Kept byte-honest against shared/cases (validation and
  // format-validation each hold half the group) by the alignment audit, which
  // runs every column over the same samples.
  'JSON_SCHEMA.closed_object': {
    build: () => createValidateFn(runTypeFromJsonSchema({
        type: 'object',
        properties: {id: {type: 'integer'}, name: {type: 'string'}},
        required: ['id', 'name'],
        additionalProperties: false,
      })),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({
        type: 'object',
        properties: {id: {type: 'integer'}, name: {type: 'string'}},
        required: ['id', 'name'],
        additionalProperties: false,
      }));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.pattern_properties': {
    build: () => createValidateFn(runTypeFromJsonSchema({
        type: 'object',
        patternProperties: {'^col_': {type: 'number'}},
        additionalProperties: false,
      })),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({
        type: 'object',
        patternProperties: {'^col_': {type: 'number'}},
        additionalProperties: false,
      }));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.property_names': {
    build: () => createValidateFn(runTypeFromJsonSchema({
        type: 'object',
        propertyNames: {pattern: '^[a-z]+$'},
        additionalProperties: {type: 'number'},
      })),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({
        type: 'object',
        propertyNames: {pattern: '^[a-z]+$'},
        additionalProperties: {type: 'number'},
      }));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.contains_count': {
    build: () => createValidateFn(runTypeFromJsonSchema({
        type: 'array',
        items: {type: 'number'},
        contains: {type: 'number', minimum: 10},
        minContains: 2,
      })),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({
        type: 'array',
        items: {type: 'number'},
        contains: {type: 'number', minimum: 10},
        minContains: 2,
      }));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.unique_items': {
    build: () => createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, uniqueItems: true})),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, uniqueItems: true}));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.object_size': {
    build: () => createValidateFn(runTypeFromJsonSchema({
        type: 'object',
        additionalProperties: {type: 'number'},
        minProperties: 1,
        maxProperties: 3,
      })),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({
        type: 'object',
        additionalProperties: {type: 'number'},
        minProperties: 1,
        maxProperties: 3,
      }));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.dependent_required': {
    build: () => createValidateFn(runTypeFromJsonSchema({
        type: 'object',
        properties: {credit_card: {type: 'integer'}, billing_address: {type: 'string'}},
        dependentRequired: {credit_card: ['billing_address']},
      })),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({
        type: 'object',
        properties: {credit_card: {type: 'integer'}, billing_address: {type: 'string'}},
        dependentRequired: {credit_card: ['billing_address']},
      }));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.string_email': {
    build: () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'email'})),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'string', format: 'email'}));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.int_bounded': {
    build: () => createValidateFn(runTypeFromJsonSchema({type: 'integer', minimum: 0, maximum: 130})),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'integer', minimum: 0, maximum: 130}));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.string_pattern': {
    build: () => createValidateFn(runTypeFromJsonSchema({type: 'string', pattern: '^[a-z][a-z0-9-]*$'})),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'string', pattern: '^[a-z][a-z0-9-]*$'}));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
  'JSON_SCHEMA.multiple_of': {
    build: () => createValidateFn(runTypeFromJsonSchema({type: 'number', multipleOf: 5})),
    buildErrors: () => {
      const getErrors = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'number', multipleOf: 5}));
      return (value: unknown) => getErrors(value).length === 0;
    },
  },
};
