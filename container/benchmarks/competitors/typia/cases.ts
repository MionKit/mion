// typia validators keyed by suite case key ("GROUP.case"), TYPE form.
//
// The two metrics map onto typia's two real exports: `validate` uses
// `typia.createIs<T>()` (cheap boolean) and `validationErrors` uses
// `typia.createValidate<T>()` (returns `IValidation<T>`, so `.success` is the
// verdict). Both names are pinned by `pnpm miondevx bench typecheck`, which compiles
// this file against the installed typia typings.
//
// typia validates the FULL TypeScript type via `typia.createIs<T>()`, transformed
// at build time by typia's tsgo transform (driven through `@ttsc/unplugin` in
// esbuild.config.mjs). Like ts-go's `createValidateFn<T>()` it needs the per-case
// type written LITERALLY at the call site, so each non-format entry copies the
// literal `T` (and any local enum / interface / recursive type decl) from the ts-go
// competitor's cases.ts, plus a leaf tag where typia's own check differs (below).
// Recursion, utility types (Partial/Pick/Omit/Exclude/Extract/keyof/indexed-access/
// conditional/mapped/key-remapping), and template-literal types are expressed natively.
//
// FORMAT suites can't use the `Format*` brand types, so they translate to typia
// tags (`Format<…>`, `Pattern<…>`, `Type<…>`, bounds, `Exclude<…>`), or to a custom
// tag (`tags.TagBase`) where no built-in tag does mion's exact rule. Every entry is
// checked against the case's exact shared samples; no entry overrides them.
//
// Same work as mion:
//   - the plugin entry sets `finite: true` (tsconfig.json), so every number rejects
//     NaN / Infinity like mion's `Number.isFinite`;
//   - typia's `Date` is `instanceof` only, Temporal is checked by structure and all-optional /
//     index-signature objects only reject arrays, so leaf object tags add mion's rule
//     (ValidDate, `instanceof Temporal.X` + `compare`, PlainObject);
//   - typia drops function members and methods from is / validate, as mion does;
//   - CIRCULAR_REFS: typia ends its walk on a cycle (accepts it), so a root tag rejects it.
// NOT_SUPPORTED (each entry carries its reason): a symbol literal and the two function cases (typia emits no
// symbol / function check and no tag can target either), `never` (accepts undefined), and the two cases with no
// shared samples.

import typia, {tags} from 'typia';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

// Leaf hooks shared by many entries (typia custom tags, inlined at each use):
// - ValidDate: typia's Date check is `instanceof Date` only and a tag on `Date` is dropped, so mion's valid-Date rule
//   sits on `object` (`{}` would be erased from the intersection). typia adds its own typeof / null / isArray prefix.
// - PlainObject: mion's plain-object guard on all-optional and index-signature nodes; typia already rejects arrays there.
type ValidDate = object &
  tags.TagBase<{
    target: 'object';
    kind: 'validDate';
    value: undefined;
    validate: '$input instanceof Date && !isNaN($input.getTime())';
  }>;
type PlainObject = tags.TagBase<{
  target: 'object';
  kind: 'plainObject';
  value: undefined;
  validate: "Object.prototype.toString.call($input) === '[object Object]'";
}>;

export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': {
    build: () => {
      const check = typia.createIs<any>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<any>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.bigint': {
    build: () => {
      const check = typia.createIs<bigint>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.boolean': {
    build: () => {
      const check = typia.createIs<boolean>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<boolean>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.date': {
    build: () => {
      const check = typia.createIs<ValidDate>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<ValidDate>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.enum_mixed': (() => {
    enum Color {
      Red,
      Green = 'green',
      Blue = 2,
    }
    return {
      build: () => {
        const check = typia.createIs<Color>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Color>();
        return (v) => val(v).success;
      },
    };
  })(),
  'ATOMIC.literal_2': {
    build: () => {
      const check = typia.createIs<2>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<2>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.literal_a': {
    build: () => {
      const check = typia.createIs<'a'>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<'a'>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.literal_true': {
    build: () => {
      const check = typia.createIs<true>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<true>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.literal_1n': {
    build: () => {
      const check = typia.createIs<1n>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<1n>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // typia emits no symbol check and no tag targets a symbol, so the description test has no place
  'ATOMIC.never': NOT_SUPPORTED, // typia is<never>() accepts undefined
  'ATOMIC.null': {
    build: () => {
      const check = typia.createIs<null>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<null>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.number': {
    build: () => {
      const check = typia.createIs<number>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number>();
      return (v) => val(v).success;
    },
  },
  // TS `object` includes arrays; typia's `object` rejects them, so the array arm is spelled out
  'ATOMIC.object': {
    build: () => {
      const check = typia.createIs<object | unknown[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<object | unknown[]>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.regexp': {
    build: () => {
      const check = typia.createIs<RegExp>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<RegExp>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.string': {
    build: () => {
      const check = typia.createIs<string>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.symbol': NOT_SUPPORTED, // no shared samples (factoryThrows): nothing to check
  'ATOMIC.undefined': {
    build: () => {
      const check = typia.createIs<undefined>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<undefined>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.void': {
    build: () => {
      const check = typia.createIs<void>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<void>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.unknown': {
    build: () => {
      const check = typia.createIs<unknown>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<unknown>();
      return (v) => val(v).success;
    },
  },

  // ── ARRAY ──
  'ARRAY.string_array': {
    build: () => {
      const check = typia.createIs<string[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.number_array': {
    build: () => {
      const check = typia.createIs<number[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.boolean_array': {
    build: () => {
      const check = typia.createIs<boolean[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<boolean[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.bigint_array': {
    build: () => {
      const check = typia.createIs<bigint[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.date_array': {
    build: () => {
      const check = typia.createIs<ValidDate[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<ValidDate[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.regexp_array': {
    build: () => {
      const check = typia.createIs<RegExp[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<RegExp[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.undefined_array': {
    build: () => {
      const check = typia.createIs<undefined[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<undefined[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.null_array': {
    build: () => {
      const check = typia.createIs<null[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<null[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.array_generic': {
    build: () => {
      const check = typia.createIs<Array<string>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Array<string>>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.string_array_2d': {
    build: () => {
      const check = typia.createIs<string[][]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string[][]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.string_array_3d': {
    build: () => {
      const check = typia.createIs<string[][][]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string[][][]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.object_array': {
    build: () => {
      const check = typia.createIs<{a: string}[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string}[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.union_array': {
    build: () => {
      const check = typia.createIs<(string | number)[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<(string | number)[]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.tuple_array': {
    build: () => {
      const check = typia.createIs<[string, number][]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[string, number][]>();
      return (v) => val(v).success;
    },
  },
  'ARRAY.circular_array': (() => {
    type CircularArray = CircularArray[];
    return {
      build: () => {
        const check = typia.createIs<CircularArray>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<CircularArray>();
        return (v) => val(v).success;
      },
    };
  })(),
  'ARRAY.circular_object_with_array': (() => {
    type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
    return {
      build: () => {
        const check = typia.createIs<ObjectType>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<ObjectType>();
        return (v) => val(v).success;
      },
    };
  })(),
  'ARRAY.symbol_array': NOT_SUPPORTED, // no shared samples (factoryThrows): nothing to check
  'ARRAY.readonly_string_array': {
    build: () => {
      const check = typia.createIs<ReadonlyArray<string>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<ReadonlyArray<string>>();
      return (v) => val(v).success;
    },
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    build: () => {
      const check = typia.createIs<{a: string; b: number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; b: number}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.object_as_const_literals': {
    build: () => {
      const check = typia.createIs<{readonly name: 'john'; readonly age: 30}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{readonly name: 'john'; readonly age: 30}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.object_via_return_type_utility': (() => {
    function makeUser(): {id: number; name: string} {
      return {id: 1, name: 'john'};
    }
    return {
      build: () => {
        const check = typia.createIs<ReturnType<typeof makeUser>>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<ReturnType<typeof makeUser>>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.object_via_property_access': {
    build: () => {
      const check = typia.createIs<{id: number; name: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{id: number; name: string}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.object_via_array_access': {
    build: () => {
      const check = typia.createIs<{id: number; name: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{id: number; name: string}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.interface_with_optional': {
    build: () => {
      const check = typia.createIs<{a: string; b?: number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; b?: number}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.interface_with_date': {
    build: () => {
      const check = typia.createIs<{date: ValidDate; name: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{date: ValidDate; name: string}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.interface_with_method': (() => {
    // Named, so typia's emitted `input is WithCb` predicate holds no `=>` (the build's predicate strip miscounts it).
    interface WithCb {
      name: string;
      cb: () => any;
    }
    return {
      build: () => {
        const check = typia.createIs<WithCb>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<WithCb>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.nested_object': {
    build: () => {
      const check = typia.createIs<{a: string; deep: {b: string; c: number}}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; deep: {b: string; c: number}}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.interface_string_array_prop': {
    build: () => {
      const check = typia.createIs<{tags: string[]}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{tags: string[]}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.circular_interface': (() => {
    type ICircular = {name: string; child?: ICircular};
    return {
      build: () => {
        const check = typia.createIs<ICircular>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<ICircular>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.circular_interface_on_array': (() => {
    type ICircularArray = {name: string; children?: ICircularArray[]};
    return {
      build: () => {
        const check = typia.createIs<ICircularArray>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<ICircularArray>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.circular_interface_on_nested_object': (() => {
    type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
    return {
      build: () => {
        const check = typia.createIs<ICircularDeep>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<ICircularDeep>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.index_signature_string': (() => {
    // typia's index loop skips explicit-undefined values, mion checks every value, so {a: undefined} must fail.
    type NoUndefinedValues = tags.TagBase<{
      target: 'object';
      kind: 'noUndefinedValues';
      value: undefined;
      validate: '!Object.values($input).includes(undefined)';
    }>;
    return {
      build: () => {
        const check = typia.createIs<{[key: string]: string} & PlainObject & NoUndefinedValues>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<{[key: string]: string} & PlainObject & NoUndefinedValues>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.index_signature_named_props': {
    build: () => {
      const check = typia.createIs<{a: string; b: number; [key: string]: string | number} & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; b: number; [key: string]: string | number} & PlainObject>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.index_signature_nested': {
    build: () => {
      const check = typia.createIs<{[key: string]: {[key: string]: number} & PlainObject} & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[key: string]: {[key: string]: number} & PlainObject} & PlainObject>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.index_signature_date_value': {
    build: () => {
      const check = typia.createIs<{[key: string]: {[key: string]: ValidDate} & PlainObject} & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[key: string]: {[key: string]: ValidDate} & PlainObject} & PlainObject>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.index_signature_non_root': (() => {
    interface Obj1 {
      a: string;
      [key: string]: string;
    }
    interface Obj2 {
      b: string;
      c: Obj1 & PlainObject;
    }
    return {
      build: () => {
        const check = typia.createIs<Obj2>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Obj2>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.function_top_level': NOT_SUPPORTED, // typia emits no check for a function type (`() => true`) and no tag targets a function
  'OBJECT.interface_callable': NOT_SUPPORTED, // typia checks a callable interface as `typeof 'object'`, rejecting every function; no tag targets a function
  'OBJECT.interface_all_optional': {
    build: () => {
      const check = typia.createIs<{a?: string; b?: number} & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a?: string; b?: number} & PlainObject>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.class_simple': {
    build: () => {
      class MySerializableClass {
        date: ValidDate;
        name: string;
        constructor(date: ValidDate, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      const check = typia.createIs<MySerializableClass>();
      return (v) => check(v);
    },
    buildErrors: () => {
      class MySerializableClass {
        date: ValidDate;
        name: string;
        constructor(date: ValidDate, name: string) {
          this.date = date;
          this.name = name;
        }
        someMethod() {
          return 'unused';
        }
      }
      const val = typia.createValidate<MySerializableClass>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.rpc_error_class': (() => {
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
    return {
      build: () => {
        const check = typia.createIs<RpcError<'test-error'>>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<RpcError<'test-error'>>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.call_signature_params': {
    build: () => {
      type CallSig = (a: number, b: boolean) => string;
      const check = typia.createIs<Parameters<CallSig>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean) => string;
      const val = typia.createValidate<Parameters<CallSig>>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.call_signature_params_with_optional': {
    build: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const check = typia.createIs<Parameters<CallSig>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean, c?: string) => Date;
      const val = typia.createValidate<Parameters<CallSig>>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.call_signature_params_with_rest': {
    build: () => {
      type CallSig = (a: number, b: boolean, ...c: ValidDate[]) => Date;
      const check = typia.createIs<Parameters<CallSig>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean, ...c: ValidDate[]) => Date;
      const val = typia.createValidate<Parameters<CallSig>>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.record_union_keys': {
    build: () => {
      const check = typia.createIs<Record<'a' | 'b', number>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Record<'a' | 'b', number>>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.union_value_index': {
    build: () => {
      const check = typia.createIs<{[key: string]: string | number} & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[key: string]: string | number} & PlainObject>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.object_with_union_prop': {
    build: () => {
      const check = typia.createIs<{kind: 'a' | 'b'; n: number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{kind: 'a' | 'b'; n: number}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.interface_inheritance': (() => {
    interface Base {
      a: string;
    }
    interface Child extends Base {
      b: number;
    }
    return {
      build: () => {
        const check = typia.createIs<Child>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Child>();
        return (v) => val(v).success;
      },
    };
  })(),
  'OBJECT.class_inheritance': (() => {
    class Base {
      a: string = '';
    }
    class Sub extends Base {
      b: number = 0;
    }
    return {
      build: () => {
        const check = typia.createIs<Sub>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Sub>();
        return (v) => val(v).success;
      },
    };
  })(),
  // JS keys are strings and mion does not test them; typia's number key adds a Number(key) test per key (and skips
  // the value of a non-numeric key), so the string-key spelling does mion's work.
  'OBJECT.index_signature_number_key': {
    build: () => {
      const check = typia.createIs<{[k: string]: string} & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[k: string]: string} & PlainObject>();
      return (v) => val(v).success;
    },
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    build: () => {
      const check = typia.createIs<[string, number]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[string, number]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.full_mion_tuple': {
    build: () => {
      const check = typia.createIs<[ValidDate, number, string, null, string[], bigint]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[ValidDate, number, string, null, string[], bigint]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.tuple_with_optional': {
    build: () => {
      const check = typia.createIs<[number, bigint?, boolean?, number?]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[number, bigint?, boolean?, number?]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.nested_tuple_in_array': {
    build: () => {
      const check = typia.createIs<[string, number][]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[string, number][]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.tuple_rest': {
    build: () => {
      const check = typia.createIs<[number, ...string[]]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[number, ...string[]]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.tuple_circular': (() => {
    type TupleCircular = [ValidDate, number, string, null, string[], bigint, TupleCircular?];
    return {
      build: () => {
        const check = typia.createIs<TupleCircular>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<TupleCircular>();
        return (v) => val(v).success;
      },
    };
  })(),
  'TUPLE.tuple_multiple_trailing_optionals': {
    build: () => {
      const check = typia.createIs<[number, bigint?, boolean?, number?]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[number, bigint?, boolean?, number?]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.tuple_named_labels': {
    build: () => {
      const check = typia.createIs<[name: string, age: number]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[name: string, age: number]>();
      return (v) => val(v).success;
    },
  },
  // the function slot must be `undefined`, like zod / TypeBox / ajv (an absent slot passes too)
  'TUPLE.tuple_with_non_serializable': {
    build: () => {
      const check = typia.createIs<[number, undefined?]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[number, undefined?]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.empty_tuple': {
    build: () => {
      const check = typia.createIs<[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.single_element_tuple': {
    build: () => {
      const check = typia.createIs<[string]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[string]>();
      return (v) => val(v).success;
    },
  },
  'TUPLE.readonly_tuple': {
    build: () => {
      const check = typia.createIs<readonly [string, number]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<readonly [string, number]>();
      return (v) => val(v).success;
    },
  },

  // ── UNION ──
  'UNION.atomic_union': {
    build: () => {
      const check = typia.createIs<ValidDate | number | string | null | bigint>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<ValidDate | number | string | null | bigint>();
      return (v) => val(v).success;
    },
  },
  'UNION.string_literal_union': {
    build: () => {
      const check = typia.createIs<'UNO' | 'DOS' | 'TRES'>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<'UNO' | 'DOS' | 'TRES'>();
      return (v) => val(v).success;
    },
  },
  'UNION.large_union_eight_arms': {
    build: () => {
      const check = typia.createIs<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}
      >();
      return (v) => val(v).success;
    },
  },
  'UNION.string_or_number': {
    build: () => {
      const check = typia.createIs<string | number>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string | number>();
      return (v) => val(v).success;
    },
  },
  'UNION.union_of_array_types': {
    build: () => {
      const check = typia.createIs<string[] | number[] | boolean[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string[] | number[] | boolean[]>();
      return (v) => val(v).success;
    },
  },
  'UNION.array_of_union': {
    build: () => {
      const check = typia.createIs<(string | bigint | boolean | ValidDate)[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<(string | bigint | boolean | ValidDate)[]>();
      return (v) => val(v).success;
    },
  },
  'UNION.union_of_object_shapes': {
    build: () => {
      const check = typia.createIs<{a: string; aa: boolean} | {b: number} | {c: bigint}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint}>();
      return (v) => val(v).success;
    },
  },
  'UNION.discriminated_union': {
    build: () => {
      const check = typia.createIs<{kind: 'a'; n: number} | {kind: 'b'; s: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{kind: 'a'; n: number} | {kind: 'b'; s: string}>();
      return (v) => val(v).success;
    },
  },
  'UNION.circular_union': (() => {
    // The all-optional arm carries mion's plain-object + weak-type guard as an object tag (R3), so an Invalid Date
    // rejected by ValidDate cannot fall through to it.
    type PlainWeak = tags.TagBase<{
      target: 'object';
      kind: 'plainWeak';
      value: undefined;
      validate: "Object.prototype.toString.call($input) === '[object Object]' && ('a' in $input || 'b' in $input || Object.keys($input).length === 0)";
    }>;
    type UnionC = ValidDate | number | string | ({a?: UnionC; b?: string} & PlainWeak) | UnionC[];
    return {
      build: () => {
        const check = typia.createIs<UnionC>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<UnionC>();
        return (v) => val(v).success;
      },
    };
  })(),
  'UNION.union_with_methods': {
    build: () => {
      const check = typia.createIs<{name: string; getName(): string} | {age: number; getAge(): number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{name: string; getName(): string} | {age: number; getAge(): number}>();
      return (v) => val(v).success;
    },
  },
  'UNION.intersection_to_object': {
    build: () => {
      const check = typia.createIs<{a: string} & {b: number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string} & {b: number}>();
      return (v) => val(v).success;
    },
  },
  // No PlainObject on the index-signature arm: a tag on a union arm makes typia's createValidate run that arm with
  // `_exceptionable = false`, which skips its index-value loop (`{c: 1n, d: 'hello'}` would pass). The shared samples
  // do not need the guard, so typia runs this case without mion's toString test.
  'UNION.union_with_index_arm': {
    build: () => {
      const check = typia.createIs<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>();
      return (v) => val(v).success;
    },
  },
  'UNION.union_same_prop_different_types': {
    build: () => {
      const check = typia.createIs<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>();
      return (v) => val(v).success;
    },
  },
  'UNION.union_mixed_arrays_and_objects': {
    build: () => {
      const check = typia.createIs<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >();
      return (v) => val(v).success;
    },
  },
  'UNION.union_merged_property': {
    build: () => {
      const check = typia.createIs<{a: boolean} | {a: number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: boolean} | {a: number}>();
      return (v) => val(v).success;
    },
  },
  // No PlainObject on each index-signature arm: a tag on a union arm makes typia's createValidate run that arm with
  // `_exceptionable = false`, which skips its index-value loop (`{c: 1n, d: 'hello'}` would pass). The shared samples
  // do not need the guard, so typia runs this case without mion's toString test.
  'UNION.union_mixed_with_index': {
    build: () => {
      const check = typia.createIs<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >();
      return (v) => val(v).success;
    },
  },
  'UNION.union_with_any_fallback': {
    build: () => {
      const check = typia.createIs<string | any>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string | any>();
      return (v) => val(v).success;
    },
  },
  'UNION.union_with_unknown_fallback': {
    build: () => {
      const check = typia.createIs<string | unknown>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string | unknown>();
      return (v) => val(v).success;
    },
  },
  'UNION.union_subset_small_first': (() => {
    interface SmallObj {
      a: string;
    }
    interface LargeObj {
      a: string;
      b: number;
    }
    return {
      build: () => {
        const check = typia.createIs<SmallObj | LargeObj>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<SmallObj | LargeObj>();
        return (v) => val(v).success;
      },
    };
  })(),
  'UNION.union_subset_nested_levels': (() => {
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
    return {
      build: () => {
        const check = typia.createIs<Tiny | Medium | Large>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Tiny | Medium | Large>();
        return (v) => val(v).success;
      },
    };
  })(),
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
      const check = typia.createIs<Base | Extended | Unrelated>();
      return (v) => check(v);
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
      const val = typia.createValidate<Base | Extended | Unrelated>();
      return (v) => val(v).success;
    },
  },

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': {
    build: () => {
      const check = typia.createIs<`api/user/${number}`>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<`api/user/${number}`>();
      return (v) => val(v).success;
    },
  },
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => {
      const check = typia.createIs<`/api/v${number}/user/${string}/posts/${number}`>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<`/api/v${number}/user/${string}/posts/${number}`>();
      return (v) => val(v).success;
    },
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    build: () => {
      const check = typia.createIs<`${string}/${number}`>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<`${string}/${number}`>();
      return (v) => val(v).success;
    },
  },
  'TEMPLATE_LITERAL.regex_special_chars': {
    build: () => {
      const check = typia.createIs<`(${number})`>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<`(${number})`>();
      return (v) => val(v).success;
    },
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    build: () => {
      const check = typia.createIs<{url: `api/user/${number}`; method: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{url: `api/user/${number}`; method: string}>();
      return (v) => val(v).success;
    },
  },
  // A Pattern tag on a string key covers every key, so a key outside `api/…` is rejected (a template-literal key
  // type would leave it as an accepted surplus key).
  // PlainObject = mion's plain-object guard on the index-signature node.
  'TEMPLATE_LITERAL.template_literal_index_key': {
    build: () => {
      const check = typia.createIs<{[key: string & tags.Pattern<'^api/'>]: number} & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[key: string & tags.Pattern<'^api/'>]: number} & PlainObject>();
      return (v) => val(v).success;
    },
  },
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    build: () => {
      const check = typia.createIs<`${'a' | 'b'}-${number}`>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<`${'a' | 'b'}-${number}`>();
      return (v) => val(v).success;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': {
    build: () => {
      const check = typia.createIs<Map<string, number>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Map<string, number>>();
      return (v) => val(v).success;
    },
  },
  'NATIVE.set_string': {
    build: () => {
      const check = typia.createIs<Set<string>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Set<string>>();
      return (v) => val(v).success;
    },
  },
  'NATIVE.promise_string': (() => {
    // a thenable: an object whose `then` is a function, as an object tag (typia's Promise check rejects a thenable)
    type Thenable = object &
      tags.TagBase<{target: 'object'; kind: 'thenable'; value: undefined; validate: "typeof $input.then === 'function'"}>;
    return {
      build: () => {
        const check = typia.createIs<Thenable>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Thenable>();
        return (v) => val(v).success;
      },
    };
  })(),
  'NATIVE.awaited_promise': {
    build: () => {
      const check = typia.createIs<Awaited<Promise<string>>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Awaited<Promise<string>>>();
      return (v) => val(v).success;
    },
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': {
    build: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: ValidDate;
      }
      const check = typia.createIs<Circular>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: ValidDate;
      }
      const val = typia.createValidate<Circular>();
      return (v) => val(v).success;
    },
  },
  'CIRCULAR.array_of_union_with_self_ref': (() => {
    type CuArray = (CuArray | ValidDate | number | string)[];
    return {
      build: () => {
        const check = typia.createIs<CuArray>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<CuArray>();
        return (v) => val(v).success;
      },
    };
  })(),
  'CIRCULAR.object_with_tuple_prop': (() => {
    interface CircularTuple {
      tuple: [bigint, CircularTuple?];
    }
    return {
      build: () => {
        const check = typia.createIs<CircularTuple>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<CircularTuple>();
        return (v) => val(v).success;
      },
    };
  })(),
  'CIRCULAR.object_with_index_prop': (() => {
    interface CircularIndex {
      index: {[key: string]: CircularIndex} & PlainObject;
    }
    return {
      build: () => {
        const check = typia.createIs<CircularIndex>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<CircularIndex>();
        return (v) => val(v).success;
      },
    };
  })(),
  'CIRCULAR.object_deeply_nested': (() => {
    interface CircularDeep {
      deep1: {deep2: {deep3: {deep4?: CircularDeep} & PlainObject}};
    }
    return {
      build: () => {
        const check = typia.createIs<CircularDeep>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<CircularDeep>();
        return (v) => val(v).success;
      },
    };
  })(),
  'CIRCULAR.circular_child_under_literal_root': (() => {
    interface ICircularDeep {
      name: string;
      big: bigint;
      embedded: {hello: string; child?: ICircularDeep};
    }
    interface RootNotCircular {
      isRoot: true;
      ciChild: ICircularDeep;
    }
    return {
      build: () => {
        const check = typia.createIs<RootNotCircular>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<RootNotCircular>();
        return (v) => val(v).success;
      },
    };
  })(),
  'CIRCULAR.multiple_circular_types_cross_referenced': (() => {
    interface ICircularDeep {
      name: string;
      big: bigint;
      embedded: {hello: string; child?: ICircularDeep};
    }
    interface ICircularDate {
      date: ValidDate;
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
    return {
      build: () => {
        const check = typia.createIs<RootCircular>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<RootCircular>();
        return (v) => val(v).success;
      },
    };
  })(),

  // ── CIRCULAR_REFS ──
  'CIRCULAR_REFS.linked_list_cycle': (() => {
    // R6 root hook along `next` only: typia's visit guard ends its walk on a cycle (it would accept it), so this tag on
    // the ROOT reference rejects it. `hasCycle` is named in the tag string and resolves at the call site.
    const hasCycle = (node: unknown, stack: object[]): boolean => {
      if (node === null || typeof node !== 'object') return false;
      if (stack.indexOf(node) !== -1) return true;
      stack.push(node);
      const hit = hasCycle((node as {next?: unknown}).next, stack);
      stack.pop();
      return hit;
    };
    type CycleFree = tags.TagBase<{target: 'object'; kind: 'cycleFree'; value: undefined; validate: '!hasCycle($input, [])'}>;
    interface Node {
      value: number;
      next: Node | null;
    }
    return {
      build: () => {
        const check = typia.createIs<Node & CycleFree>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Node & CycleFree>();
        return (v) => val(v).success;
      },
    };
  })(),
  'CIRCULAR_REFS.tree_cycle': (() => {
    // R6 root hook along `children[*]` only (ancestor stack + finished set, like mion's walker); see linked_list_cycle.
    const hasCycle = (node: unknown, stack: object[], safe: Set<object>): boolean => {
      if (node === null || typeof node !== 'object' || safe.has(node)) return false;
      if (stack.indexOf(node) !== -1) return true;
      const children = (node as {children?: unknown}).children;
      if (Array.isArray(children)) {
        stack.push(node);
        for (let i = 0; i < children.length; i++) if (hasCycle(children[i], stack, safe)) return true;
        stack.pop();
      }
      safe.add(node);
      return false;
    };
    type CycleFree = tags.TagBase<{target: 'object'; kind: 'cycleFree'; value: undefined; validate: '!hasCycle($input, [], new Set())'}>;
    interface Node {
      label: string;
      children: Node[];
    }
    return {
      build: () => {
        const check = typia.createIs<Node & CycleFree>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Node & CycleFree>();
        return (v) => val(v).success;
      },
    };
  })(),
  'CIRCULAR_REFS.object_self_cycle': (() => {
    // R6 root hook along `next` only; see linked_list_cycle.
    const hasCycle = (node: unknown, stack: object[]): boolean => {
      if (node === null || typeof node !== 'object') return false;
      if (stack.indexOf(node) !== -1) return true;
      stack.push(node);
      const hit = hasCycle((node as {next?: unknown}).next, stack);
      stack.pop();
      return hit;
    };
    type CycleFree = tags.TagBase<{target: 'object'; kind: 'cycleFree'; value: undefined; validate: '!hasCycle($input, [])'}>;
    interface Node {
      name: string;
      next?: Node;
    }
    return {
      build: () => {
        const check = typia.createIs<Node & CycleFree>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Node & CycleFree>();
        return (v) => val(v).success;
      },
    };
  })(),

  // ── UTILITY ──
  'UTILITY.partial': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: ValidDate;
      }
      const check = typia.createIs<Partial<Person> & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: ValidDate;
      }
      const val = typia.createValidate<Partial<Person> & PlainObject>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.required': {
    build: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: ValidDate;
      }
      const check = typia.createIs<Required<MaybePerson>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: ValidDate;
      }
      const val = typia.createValidate<Required<MaybePerson>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.pick': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: ValidDate;
      }
      const check = typia.createIs<Pick<Person, 'name' | 'createdAt'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: ValidDate;
      }
      const val = typia.createValidate<Pick<Person, 'name' | 'createdAt'>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.omit': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: ValidDate;
      }
      const check = typia.createIs<Omit<Person, 'age'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: ValidDate;
      }
      const val = typia.createValidate<Omit<Person, 'age'>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.exclude_atomic': {
    build: () => {
      const check = typia.createIs<Exclude<'name' | 'age' | 'createdAt', 'age'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Exclude<'name' | 'age' | 'createdAt', 'age'>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.extract_atomic': {
    build: () => {
      const check = typia.createIs<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.exclude_from_object_union': {
    build: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const check = typia.createIs<Exclude<Shape, {kind: 'circle'}>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const val = typia.createValidate<Exclude<Shape, {kind: 'circle'}>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.non_nullable': {
    build: () => {
      const check = typia.createIs<NonNullable<string | number | null | undefined>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<NonNullable<string | number | null | undefined>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.return_type': {
    build: () => {
      type Fn = (a: number, b: boolean) => ValidDate;
      const check = typia.createIs<ReturnType<Fn>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type Fn = (a: number, b: boolean) => ValidDate;
      const val = typia.createValidate<ReturnType<Fn>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.readonly': {
    build: () => {
      interface Person {
        name: string;
        age: number;
      }
      const check = typia.createIs<Readonly<Person>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      const val = typia.createValidate<Readonly<Person>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.intersection_with_required_override': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: ValidDate;
      }
      const check = typia.createIs<Partial<Person> & Required<Pick<Person, 'name'>>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: ValidDate;
      }
      const val = typia.createValidate<Partial<Person> & Required<Pick<Person, 'name'>>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.omit_keeping_optional': {
    build: () => {
      const check = typia.createIs<Omit<{a: string; b?: number; c: boolean}, 'a'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Omit<{a: string; b?: number; c: boolean}, 'a'>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.keyof_to_literal_union': (() => {
    interface Person {
      name: string;
      age: number;
      createdAt: Date;
    }
    return {
      build: () => {
        const check = typia.createIs<keyof Person>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<keyof Person>();
        return (v) => val(v).success;
      },
    };
  })(),
  'UTILITY.typeof_variable_query': (() => {
    const config = {url: 'http://example.com', port: 8080};
    return {
      build: () => {
        const check = typia.createIs<typeof config>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<typeof config>();
        return (v) => val(v).success;
      },
    };
  })(),
  'UTILITY.indexed_access_type': (() => {
    interface Person {
      name: string;
      age: number;
    }
    return {
      build: () => {
        const check = typia.createIs<Person['name']>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Person['name']>();
        return (v) => val(v).success;
      },
    };
  })(),
  'UTILITY.conditional_type_resolved': {
    build: () => {
      type IsString<T> = T extends string ? boolean : number;
      const check = typia.createIs<IsString<'hello'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      const val = typia.createValidate<IsString<'hello'>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.mapped_type_custom': (() => {
    interface Source {
      a: string;
      b: number;
    }
    type Nullable<T> = {[K in keyof T]: T[K] | null};
    return {
      build: () => {
        const check = typia.createIs<Nullable<Source>>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Nullable<Source>>();
        return (v) => val(v).success;
      },
    };
  })(),
  'UTILITY.mapped_type_with_conditional_value': (() => {
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
    return {
      build: () => {
        const check = typia.createIs<UserForm>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<UserForm>();
        return (v) => val(v).success;
      },
    };
  })(),
  'UTILITY.distributive_conditional_over_union': {
    build: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const check = typia.createIs<Wrap<string | number>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const val = typia.createValidate<Wrap<string | number>>();
      return (v) => val(v).success;
    },
  },
  'UTILITY.deep_partial_recursive_mapped': {
    build: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]} & PlainObject;
      const check = typia.createIs<DeepPartial<Settings>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]} & PlainObject;
      const val = typia.createValidate<DeepPartial<Settings>>();
      return (v) => val(v).success;
    },
  },

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': (() => {
    interface Source {
      id: number;
      name: string;
    }
    type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
    return {
      build: () => {
        const check = typia.createIs<Prefixed<Source>>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Prefixed<Source>>();
        return (v) => val(v).success;
      },
    };
  })(),
  'TYPE_MAPPINGS.key_conditional_rename': (() => {
    interface Source {
      id: number;
      name: string;
      createdAt: ValidDate;
    }
    type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
    return {
      build: () => {
        const check = typia.createIs<MongoForm<Source>>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<MongoForm<Source>>();
        return (v) => val(v).success;
      },
    };
  })(),
  'TYPE_MAPPINGS.key_filter_via_never': (() => {
    interface Source {
      id: number;
      name: string;
      secret: string;
    }
    type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
    return {
      build: () => {
        const check = typia.createIs<Public<Source>>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Public<Source>>();
        return (v) => val(v).success;
      },
    };
  })(),

  // ── DATETIME ──
  // Temporal is no typia native and a tag on a class type is dropped, so `instanceof Temporal.X` (R4) is an object tag.
  'DATETIME.date': {
    build: () => {
      const check = typia.createIs<ValidDate>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<ValidDate>();
      return (v) => val(v).success;
    },
  },
  'DATETIME.instant': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalInstant';
        value: undefined;
        validate: '$input instanceof Temporal.Instant';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.zonedDateTime': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalZonedDateTime';
        value: undefined;
        validate: '$input instanceof Temporal.ZonedDateTime';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDate';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainTime': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainTime';
        value: undefined;
        validate: '$input instanceof Temporal.PlainTime';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDateTime': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateTime';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDateTime';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainYearMonth': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainYearMonth';
        value: undefined;
        validate: '$input instanceof Temporal.PlainYearMonth';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainMonthDay': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainMonthDay';
        value: undefined;
        validate: '$input instanceof Temporal.PlainMonthDay';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.duration': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalDuration';
        value: undefined;
        validate: '$input instanceof Temporal.Duration';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {
    build: () => {
      const check = typia.createIs<string & tags.MaxLength<5>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MaxLength<5>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_minLength': {
    build: () => {
      const check = typia.createIs<string & tags.MinLength<3>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MinLength<3>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_length': {
    build: () => {
      const check = typia.createIs<string & tags.MinLength<4> & tags.MaxLength<4>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MinLength<4> & tags.MaxLength<4>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_range': {
    build: () => {
      const check = typia.createIs<string & tags.MinLength<2> & tags.MaxLength<4>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MinLength<2> & tags.MaxLength<4>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_allowedChars': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[0-9a-f]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[0-9a-f]+$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[abcABC]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[abcABC]+$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_allowedChars_literal': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[.\\-]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[.\\-]+$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[^!@#]*$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[^!@#]*$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    build: () => {
      const check = typia.createIs<'red' | 'green' | 'blue'>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<'red' | 'green' | 'blue'>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^(?:[Rr][Ee][Dd]|[Gg][Rr][Ee][Ee][Nn])$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^(?:[Rr][Ee][Dd]|[Gg][Rr][Ee][Ee][Nn])$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_allowedValues_escaped': {
    build: () => {
      const check = typia.createIs<'a.b' | 'c+d'>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<'a.b' | 'c+d'>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_disallowedValues': {
    build: () => {
      const check = typia.createIs<string & tags.Exclude<['admin', 'root']>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Exclude<['admin', 'root']>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    build: () => {
      const check = typia.createIs<'a' | 'b'>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<'a' | 'b'>();
      return (v) => val(v).success;
    },
  },
  // Unicode classes need the `u` flag, which Pattern cannot take: alpha / alphaNumeric / numeric use a leaf tag on
  // a hoisted regex.
  'STRING_FORMAT.alpha': (() => {
    const ALPHA = /^[\p{L}]+$/u;
    type Alpha = tags.TagBase<{target: 'string'; kind: 'alpha'; value: undefined; validate: 'ALPHA.test($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<string & Alpha>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & Alpha>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.alphaNumeric': (() => {
    const ALPHA_NUMERIC = /^[\p{L}\p{N}]+$/u;
    type AlphaNumeric = tags.TagBase<{target: 'string'; kind: 'alphaNumeric'; value: undefined; validate: 'ALPHA_NUMERIC.test($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<string & AlphaNumeric>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & AlphaNumeric>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.numeric': (() => {
    const NUMERIC = /^[\p{N}]+$/u;
    type Numeric = tags.TagBase<{target: 'string'; kind: 'numeric'; value: undefined; validate: 'NUMERIC.test($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<string & Numeric>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & Numeric>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.alpha_withLength': (() => {
    const ALPHA = /^[\p{L}]+$/u;
    type Alpha = tags.TagBase<{target: 'string'; kind: 'alpha'; value: undefined; validate: 'ALPHA.test($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<string & tags.MaxLength<3> & Alpha>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & tags.MaxLength<3> & Alpha>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.lowercase_validate': {
    build: () => {
      const check = typia.createIs<string>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.uuidv4': {
    build: () => {
      const check = typia.createIs<
        string & tags.Pattern<'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string & tags.Pattern<'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.uuidv7': {
    build: () => {
      const check = typia.createIs<
        string & tags.Pattern<'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string & tags.Pattern<'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.date_iso': {
    build: () => {
      const check = typia.createIs<string & tags.Format<'date'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Format<'date'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.date_DMY': (() => {
    // Pattern = layout, then typia's own calendar helper on the reordered parts.
    type CalendarDMY = tags.TagBase<{
      target: 'string';
      kind: 'calendarDMY';
      value: undefined;
      validate: '$importInternal("isFormatDate")($input.slice(6, 10) + "-" + $input.slice(3, 5) + "-" + $input.slice(0, 2))';
    }>;
    return {
      build: () => {
        const check = typia.createIs<string & tags.Pattern<'^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4}$'> & CalendarDMY>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & tags.Pattern<'^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4}$'> & CalendarDMY>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.date_YM': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[0-9]{4}-(0[1-9]|1[0-2])$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[0-9]{4}-(0[1-9]|1[0-2])$'>>();
      return (v) => val(v).success;
    },
  },
  // month day limits as mion, Feb 29 always allowed
  'STRING_FORMAT.date_MD': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1[0-9]|2[0-9])|(?:0[13-9]|1[0-2])-30|(?:0[13578]|1[02])-31)$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1[0-9]|2[0-9])|(?:0[13-9]|1[0-2])-30|(?:0[13578]|1[02])-31)$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.date_minMax_absolute': (() => {
    // After Format<'date'> the value is fixed-width YYYY-MM-DD, so a string compare is the exact inclusive day bound.
    type DateMin = tags.TagBase<{target: 'string'; kind: 'dateMin'; value: undefined; validate: '"2020-01-01" <= $input'}>;
    type DateMax = tags.TagBase<{target: 'string'; kind: 'dateMax'; value: undefined; validate: '$input <= "2020-12-31"'}>;
    return {
      build: () => {
        const check = typia.createIs<string & tags.Format<'date'> & DateMin & DateMax>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & tags.Format<'date'> & DateMin & DateMax>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.time_iso': {
    build: () => {
      const check = typia.createIs<string & tags.Format<'time'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Format<'time'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.time_HHmmss': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{3})?$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{3})?$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.time_minMax_absolute': (() => {
    // After the Pattern the value is fixed-width HH:mm, so a string compare is the exact inclusive minute bound.
    type TimeMin = tags.TagBase<{target: 'string'; kind: 'timeMin'; value: undefined; validate: '"09:00" <= $input'}>;
    type TimeMax = tags.TagBase<{target: 'string'; kind: 'timeMax'; value: undefined; validate: '$input <= "17:00"'}>;
    return {
      build: () => {
        const check = typia.createIs<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]$'> & TimeMin & TimeMax>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]$'> & TimeMin & TimeMax>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.dateTime_default': {
    build: () => {
      const check = typia.createIs<string & tags.Format<'date-time'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Format<'date-time'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.dateTime_custom': (() => {
    // Pattern = layout, then typia's own calendar helper on the reordered date parts.
    type CalendarDMY = tags.TagBase<{
      target: 'string';
      kind: 'calendarDMY';
      value: undefined;
      validate: '$importInternal("isFormatDate")($input.slice(6, 10) + "-" + $input.slice(3, 5) + "-" + $input.slice(0, 2))';
    }>;
    return {
      build: () => {
        const check = typia.createIs<string & tags.Pattern<'^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]$'> & CalendarDMY>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & tags.Pattern<'^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]$'> & CalendarDMY>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.dateTime_minMax_absolute': (() => {
    // Pattern = layout, calendar via typia's helper, then fixed-width string bounds on a `T`-normalised copy (mion accepts `t`).
    type CalendarDate = tags.TagBase<{
      target: 'string';
      kind: 'calendarDate';
      value: undefined;
      validate: '$importInternal("isFormatDate")($input.slice(0, 10))';
    }>;
    type DateTimeMin = tags.TagBase<{
      target: 'string';
      kind: 'dateTimeMin';
      value: undefined;
      validate: '"2020-01-01T00:00:00" <= ($input[10] === "t" ? $input.slice(0, 10) + "T" + $input.slice(11) : $input)';
    }>;
    type DateTimeMax = tags.TagBase<{
      target: 'string';
      kind: 'dateTimeMax';
      value: undefined;
      validate: '($input[10] === "t" ? $input.slice(0, 10) + "T" + $input.slice(11) : $input) <= "2020-12-31T23:59:59"';
    }>;
    type DateTimeMinMax = string &
      tags.Pattern<'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])[Tt]([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'> &
      CalendarDate &
      DateTimeMin &
      DateTimeMax;
    return {
      build: () => {
        const check = typia.createIs<DateTimeMinMax>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<DateTimeMinMax>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.ipv4': {
    build: () => {
      const check = typia.createIs<string & tags.Format<'ipv4'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Format<'ipv4'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.ipv6': {
    build: () => {
      const check = typia.createIs<string & tags.Format<'ipv6'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Format<'ipv6'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.ip_any': {
    build: () => {
      const check = typia.createIs<(string & tags.Format<'ipv4'>) | (string & tags.Format<'ipv6'>)>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<(string & tags.Format<'ipv4'>) | (string & tags.Format<'ipv6'>)>();
      return (v) => val(v).success;
    },
  },
  // typia's own IPv4 octet rule (`_isFormatIpv4`) + a port of 1-5 digits <= 65535, leading zeros allowed like mion.
  // Port required (stricter than mion, which accepts a missing port).
  'STRING_FORMAT.ipv4_port': {
    build: () => {
      const check = typia.createIs<
        string &
          tags.Pattern<'^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]):(?:[0-9]{1,4}|[0-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string &
          tags.Pattern<'^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]):(?:[0-9]{1,4}|[0-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.ipv6_port': (() => {
    // Leaf tag: typia's own IPv6 check on the bracket content + port <= 65535; the port stays required.
    const BRACKETED = /^\[([^\]]+)\]:(\d+)$/;
    const ipv6WithPort = (s: string, isIpv6: (v: string) => boolean): boolean => {
      const m = BRACKETED.exec(s);
      return m !== null && isIpv6(m[1]) && Number(m[2]) <= 65535;
    };
    type Ipv6WithPort = tags.TagBase<{
      target: 'string';
      kind: 'ipv6WithPort';
      value: undefined;
      validate: 'ipv6WithPort($input, $importInternal("isFormatIpv6"))';
    }>;
    return {
      build: () => {
        const check = typia.createIs<string & Ipv6WithPort>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & Ipv6WithPort>();
        return (v) => val(v).success;
      },
    };
  })(),
  'STRING_FORMAT.domain': {
    build: () => {
      const check = typia.createIs<string & tags.MaxLength<253> & tags.MinLength<5> & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MaxLength<253> & tags.MinLength<5> & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$'>>();
      return (v) => val(v).success;
    },
  },
  // labels 2..63 chars, 2..6 parts, TLD 2..12 letters, as mion
  'STRING_FORMAT.domainParts': {
    build: () => {
      const check = typia.createIs<string & tags.MaxLength<253> & tags.MinLength<5> & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])\\.){1,5}[a-zA-Z]{2,12}$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MaxLength<253> & tags.MinLength<5> & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])\\.){1,5}[a-zA-Z]{2,12}$'>>();
      return (v) => val(v).success;
    },
  },
  // email / emailPunycode: mion's rule (7..254 code points + its regex); Format<'email'> allows 1-char labels and has
  // no length rule.
  'STRING_FORMAT.email': {
    build: () => {
      const check = typia.createIs<string & tags.MaxLength<254> & tags.MinLength<7> & tags.Pattern<'^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z]{2,63}$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MaxLength<254> & tags.MinLength<7> & tags.Pattern<'^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z]{2,63}$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.emailPunycode': {
    build: () => {
      const check = typia.createIs<string & tags.MaxLength<254> & tags.MinLength<7> & tags.Pattern<'^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z0-9-]{2,63}$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MaxLength<254> & tags.MinLength<7> & tags.Pattern<'^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z0-9-]{2,63}$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.emailParts': (() => {
    // The local part is 1..64 code points, so a `u` regex (Pattern takes no flags) on a hoisted literal.
    const EMAIL_PARTS = /^[^ ()<>\[\]:;\\,{}|+@]{1,64}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])\.){1,5}[a-zA-Z]{2,12}$/u;
    type EmailParts = tags.TagBase<{target: 'string'; kind: 'emailParts'; value: undefined; validate: 'EMAIL_PARTS.test($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<string & tags.MaxLength<254> & EmailParts>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<string & tags.MaxLength<254> & EmailParts>();
        return (v) => val(v).success;
      },
    };
  })(),
  // url / urlHttp / urlFile: mion's regex, its `i` flag spelled as case classes (Pattern takes no flags).
  'STRING_FORMAT.url': {
    build: () => {
      const check = typia.createIs<string & tags.MaxLength<2048> & tags.Pattern<'^(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP][sS]?|[wW][sS][sS]?):\\/\\/[^\\s/$.?#-][^\\s]*$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MaxLength<2048> & tags.Pattern<'^(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP][sS]?|[wW][sS][sS]?):\\/\\/[^\\s/$.?#-][^\\s]*$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.urlHttp': {
    build: () => {
      const check = typia.createIs<string & tags.MaxLength<2048> & tags.Pattern<'^[hH][tT][tT][pP][sS]?:\\/\\/[^\\s/$.?#-][^\\s]*$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MaxLength<2048> & tags.Pattern<'^[hH][tT][tT][pP][sS]?:\\/\\/[^\\s/$.?#-][^\\s]*$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.urlFile': {
    build: () => {
      const check = typia.createIs<string & tags.MaxLength<2048> & tags.Pattern<'^[fF][iI][lL][eE]:\\/\\/\\/?(?:[a-zA-Z]:)?[^\\s/$.?#-][^\\s]*$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.MaxLength<2048> & tags.Pattern<'^[fF][iI][lL][eE]:\\/\\/\\/?(?:[a-zA-Z]:)?[^\\s/$.?#-][^\\s]*$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[a-z0-9-]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[a-z0-9-]+$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[0-9a-fA-F]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[0-9a-fA-F]+$'>>();
      return (v) => val(v).success;
    },
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {
    build: () => {
      const check = typia.createIs<number & tags.Maximum<100>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Maximum<100>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_min': {
    build: () => {
      const check = typia.createIs<number & tags.Minimum<0>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Minimum<0>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_lt': {
    build: () => {
      const check = typia.createIs<number & tags.ExclusiveMaximum<10>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.ExclusiveMaximum<10>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_gt': {
    build: () => {
      const check = typia.createIs<number & tags.ExclusiveMinimum<0>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.ExclusiveMinimum<0>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_integer': (() => {
    // Number.isInteger as a leaf tag: every typia integer Type also adds a range check mion does not run.
    type Integer = tags.TagBase<{target: 'number'; kind: 'integer'; value: undefined; validate: 'Number.isInteger($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<number & Integer>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<number & Integer>();
        return (v) => val(v).success;
      },
    };
  })(),
  // FormatFloat carries no failable constraint, so the equivalent typia type is a plain
  // number. `tags.Type<'float'>` is NOT the match: it adds a float32 representability
  // check RunTypes never imposes.
  'NUMBER_FORMAT.number_float': {
    build: () => {
      const check = typia.createIs<number>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_multipleOf': {
    build: () => {
      const check = typia.createIs<number & tags.MultipleOf<5>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.MultipleOf<5>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_combined': (() => {
    // Number.isInteger as a leaf tag (no range check, as mion); tags in mion's order.
    type Integer = tags.TagBase<{target: 'number'; kind: 'integer'; value: undefined; validate: 'Number.isInteger($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<number & Integer & tags.Maximum<100> & tags.Minimum<0> & tags.MultipleOf<5>>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<number & Integer & tags.Maximum<100> & tags.Minimum<0> & tags.MultipleOf<5>>();
        return (v) => val(v).success;
      },
    };
  })(),
  'NUMBER_FORMAT.number_int8': {
    build: () => {
      const check = typia.createIs<number & tags.Type<'int8'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Type<'int8'>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => {
      const check = typia.createIs<number & tags.Type<'uint8'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Type<'uint8'>>();
      return (v) => val(v).success;
    },
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': {
    build: () => {
      const check = typia.createIs<bigint & tags.Maximum<100n>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint & tags.Maximum<100n>>();
      return (v) => val(v).success;
    },
  },
  'BIGINT_FORMAT.bigint_min': {
    build: () => {
      const check = typia.createIs<bigint & tags.Minimum<0n>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint & tags.Minimum<0n>>();
      return (v) => val(v).success;
    },
  },
  'BIGINT_FORMAT.bigint_lt': {
    build: () => {
      const check = typia.createIs<bigint & tags.ExclusiveMaximum<10n>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint & tags.ExclusiveMaximum<10n>>();
      return (v) => val(v).success;
    },
  },
  'BIGINT_FORMAT.bigint_gt': {
    build: () => {
      const check = typia.createIs<bigint & tags.ExclusiveMinimum<0n>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint & tags.ExclusiveMinimum<0n>>();
      return (v) => val(v).success;
    },
  },
  'BIGINT_FORMAT.bigint_multipleOf': {
    build: () => {
      const check = typia.createIs<bigint & tags.MultipleOf<5n>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint & tags.MultipleOf<5n>>();
      return (v) => val(v).success;
    },
  },
  'BIGINT_FORMAT.bigint_combined': {
    build: () => {
      const check = typia.createIs<bigint & tags.Minimum<0n> & tags.Maximum<1000n> & tags.MultipleOf<10n>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint & tags.Minimum<0n> & tags.Maximum<1000n> & tags.MultipleOf<10n>>();
      return (v) => val(v).success;
    },
  },
  // Type<'int64'> on bigint: exact 64-bit bounds (Minimum / Maximum literals cannot hold them).
  'BIGINT_FORMAT.bigint_int64': {
    build: () => {
      const check = typia.createIs<bigint & tags.Type<'int64'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint & tags.Type<'int64'>>();
      return (v) => val(v).success;
    },
  },
  // Type<'uint64'> on bigint: exact 64-bit bounds (Minimum / Maximum literals cannot hold them).
  'BIGINT_FORMAT.bigint_uint64': {
    build: () => {
      const check = typia.createIs<bigint & tags.Type<'uint64'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint & tags.Type<'uint64'>>();
      return (v) => val(v).success;
    },
  },

  // ── DATETIME (format) ──
  // Each case is ONE object tag: valid Date (R2) or `instanceof Temporal.X` (R4), then mion's bounds in mion's order.
  // Fixed bounds are UTC epoch-ms literals for Date and parsed once per builder for Temporal (R4b); builders, not the
  // module, hold them so a runtime with no Temporal global still loads the file. "now" is read on every call.
  'DATETIME.date_minmax': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'dateBounds';
        value: undefined;
        validate: '$input instanceof Date && !isNaN($input.getTime()) && $input.getTime() >= 1577836800000 && $input.getTime() <= 1609459199000';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.date_gtlt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'dateBounds';
        value: undefined;
        validate: '$input instanceof Date && !isNaN($input.getTime()) && $input.getTime() > 1577836800000 && $input.getTime() < 1609459199000';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.date_min_lt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'dateBounds';
        value: undefined;
        validate: '$input instanceof Date && !isNaN($input.getTime()) && $input.getTime() >= 1577836800000 && $input.getTime() < 1609459199000';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.date_max_now': (() => {
    // R2 + bound as one leaf hook on `object`; "now" read per call (R4b).
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'dateBounds';
        value: undefined;
        validate: '$input instanceof Date && !isNaN($input.getTime()) && $input.getTime() <= Date.now()';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.date_rel_window': (() => {
    // R2 + bounds as one leaf hook on `object`; now ± P1000Y with UTC calendar math per call, as mion (R4b).
    const yearsFromNow = (years: number) => {
      const d = new Date();
      return d.setUTCFullYear(d.getUTCFullYear() + years);
    };
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'dateBounds';
        value: undefined;
        validate: '$input instanceof Date && !isNaN($input.getTime()) && $input.getTime() >= yearsFromNow(-1000) && $input.getTime() <= yearsFromNow(1000)';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.date_rel_datetime_components': (() => {
    // R2 + bound as one leaf hook on `object`; now - P1000YT12H with UTC calendar math per call, as mion (R4b).
    const minBound = () => {
      const d = new Date();
      return d.setUTCFullYear(d.getUTCFullYear() - 1000) - 43200000;
    };
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'dateBounds';
        value: undefined;
        validate: '$input instanceof Date && !isNaN($input.getTime()) && $input.getTime() >= minBound()';
      }>;
    return {
      build: () => {
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.instant_minmax': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalInstantBounds';
        value: undefined;
        validate: '$input instanceof Temporal.Instant && Temporal.Instant.compare($input, MIN) >= 0 && Temporal.Instant.compare($input, MAX) <= 0';
      }>;
    return {
      build: () => {
        const MIN = Temporal.Instant.from('2020-01-01T00:00:00Z');
        const MAX = Temporal.Instant.from('2020-12-31T23:59:59Z');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MIN = Temporal.Instant.from('2020-01-01T00:00:00Z');
        const MAX = Temporal.Instant.from('2020-12-31T23:59:59Z');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.instant_gtlt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalInstantBounds';
        value: undefined;
        validate: '$input instanceof Temporal.Instant && Temporal.Instant.compare($input, GT) > 0 && Temporal.Instant.compare($input, LT) < 0';
      }>;
    return {
      build: () => {
        const GT = Temporal.Instant.from('2020-01-01T00:00:00Z');
        const LT = Temporal.Instant.from('2020-12-31T23:59:59Z');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const GT = Temporal.Instant.from('2020-01-01T00:00:00Z');
        const LT = Temporal.Instant.from('2020-12-31T23:59:59Z');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.instant_rel': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalInstantBounds';
        value: undefined;
        validate: '$input instanceof Temporal.Instant && Temporal.Instant.compare($input, Temporal.Now.instant().subtract(SPAN)) >= 0 && Temporal.Instant.compare($input, Temporal.Now.instant().add(SPAN)) <= 0';
      }>;
    return {
      build: () => {
        const SPAN = Temporal.Duration.from('PT8760000H');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const SPAN = Temporal.Duration.from('PT8760000H');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_minmax': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, MIN) >= 0 && Temporal.PlainDate.compare($input, MAX) <= 0';
      }>;
    return {
      build: () => {
        const MIN = Temporal.PlainDate.from('2020-01-01');
        const MAX = Temporal.PlainDate.from('2020-12-31');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MIN = Temporal.PlainDate.from('2020-01-01');
        const MAX = Temporal.PlainDate.from('2020-12-31');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_gtlt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, GT) > 0 && Temporal.PlainDate.compare($input, LT) < 0';
      }>;
    return {
      build: () => {
        const GT = Temporal.PlainDate.from('2020-01-01');
        const LT = Temporal.PlainDate.from('2020-12-31');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const GT = Temporal.PlainDate.from('2020-01-01');
        const LT = Temporal.PlainDate.from('2020-12-31');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_min_lt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, MIN) >= 0 && Temporal.PlainDate.compare($input, LT) < 0';
      }>;
    return {
      build: () => {
        const MIN = Temporal.PlainDate.from('2020-01-01');
        const LT = Temporal.PlainDate.from('2020-01-10');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MIN = Temporal.PlainDate.from('2020-01-01');
        const LT = Temporal.PlainDate.from('2020-01-10');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_gt_max': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, MAX) <= 0 && Temporal.PlainDate.compare($input, GT) > 0';
      }>;
    return {
      build: () => {
        const MAX = Temporal.PlainDate.from('2020-01-10');
        const GT = Temporal.PlainDate.from('2020-01-01');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MAX = Temporal.PlainDate.from('2020-01-10');
        const GT = Temporal.PlainDate.from('2020-01-01');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_min_only': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, MIN) >= 0';
      }>;
    return {
      build: () => {
        const MIN = Temporal.PlainDate.from('2020-01-01');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MIN = Temporal.PlainDate.from('2020-01-01');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_max_only': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, MAX) <= 0';
      }>;
    return {
      build: () => {
        const MAX = Temporal.PlainDate.from('2020-12-31');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MAX = Temporal.PlainDate.from('2020-12-31');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_gt_only': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, GT) > 0';
      }>;
    return {
      build: () => {
        const GT = Temporal.PlainDate.from('2020-01-01');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const GT = Temporal.PlainDate.from('2020-01-01');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_lt_only': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, LT) < 0';
      }>;
    return {
      build: () => {
        const LT = Temporal.PlainDate.from('2020-12-31');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const LT = Temporal.PlainDate.from('2020-12-31');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_rel_window': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, Temporal.Now.plainDateISO().subtract(SPAN)) >= 0 && Temporal.PlainDate.compare($input, Temporal.Now.plainDateISO().add(SPAN)) <= 0';
      }>;
    return {
      build: () => {
        const SPAN = Temporal.Duration.from('P1000Y');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const SPAN = Temporal.Duration.from('P1000Y');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_rel_ymd': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, Temporal.Now.plainDateISO().subtract(SPAN)) >= 0';
      }>;
    return {
      build: () => {
        const SPAN = Temporal.Duration.from('P100Y6M15D');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const SPAN = Temporal.Duration.from('P100Y6M15D');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDate_rel_weeks': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDate && Temporal.PlainDate.compare($input, Temporal.Now.plainDateISO().subtract(SPAN)) >= 0';
      }>;
    return {
      build: () => {
        const SPAN = Temporal.Duration.from('P52200W');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const SPAN = Temporal.Duration.from('P52200W');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainTime_minmax': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainTime && Temporal.PlainTime.compare($input, MIN) >= 0 && Temporal.PlainTime.compare($input, MAX) <= 0';
      }>;
    return {
      build: () => {
        const MIN = Temporal.PlainTime.from('09:00:00');
        const MAX = Temporal.PlainTime.from('17:00:00');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MIN = Temporal.PlainTime.from('09:00:00');
        const MAX = Temporal.PlainTime.from('17:00:00');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainTime_gtlt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainTime && Temporal.PlainTime.compare($input, GT) > 0 && Temporal.PlainTime.compare($input, LT) < 0';
      }>;
    return {
      build: () => {
        const GT = Temporal.PlainTime.from('09:00:00');
        const LT = Temporal.PlainTime.from('17:00:00');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const GT = Temporal.PlainTime.from('09:00:00');
        const LT = Temporal.PlainTime.from('17:00:00');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDateTime_minmax': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDateTime && Temporal.PlainDateTime.compare($input, MIN) >= 0 && Temporal.PlainDateTime.compare($input, MAX) <= 0';
      }>;
    return {
      build: () => {
        const MIN = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
        const MAX = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MIN = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
        const MAX = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDateTime_gtlt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDateTime && Temporal.PlainDateTime.compare($input, GT) > 0 && Temporal.PlainDateTime.compare($input, LT) < 0';
      }>;
    return {
      build: () => {
        const GT = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
        const LT = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const GT = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
        const LT = Temporal.PlainDateTime.from('2020-12-31T23:59:59');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDateTime_rel': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDateTime && Temporal.PlainDateTime.compare($input, Temporal.Now.plainDateTimeISO().subtract(SPAN)) >= 0 && Temporal.PlainDateTime.compare($input, Temporal.Now.plainDateTimeISO().add(SPAN)) <= 0';
      }>;
    return {
      build: () => {
        const SPAN = Temporal.Duration.from('P1000Y');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const SPAN = Temporal.Duration.from('P1000Y');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainDateTime_rel_combo': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainDateTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainDateTime && Temporal.PlainDateTime.compare($input, Temporal.Now.plainDateTimeISO().subtract(SPAN)) >= 0';
      }>;
    return {
      build: () => {
        const SPAN = Temporal.Duration.from('P500YT12H');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const SPAN = Temporal.Duration.from('P500YT12H');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainYearMonth_minmax': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainYearMonthBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainYearMonth && Temporal.PlainYearMonth.compare($input, MIN) >= 0 && Temporal.PlainYearMonth.compare($input, MAX) <= 0';
      }>;
    return {
      build: () => {
        const MIN = Temporal.PlainYearMonth.from('2020-01');
        const MAX = Temporal.PlainYearMonth.from('2020-12');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MIN = Temporal.PlainYearMonth.from('2020-01');
        const MAX = Temporal.PlainYearMonth.from('2020-12');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainYearMonth_gtlt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainYearMonthBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainYearMonth && Temporal.PlainYearMonth.compare($input, GT) > 0 && Temporal.PlainYearMonth.compare($input, LT) < 0';
      }>;
    return {
      build: () => {
        const GT = Temporal.PlainYearMonth.from('2020-01');
        const LT = Temporal.PlainYearMonth.from('2020-12');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const GT = Temporal.PlainYearMonth.from('2020-01');
        const LT = Temporal.PlainYearMonth.from('2020-12');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.plainYearMonth_rel': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalPlainYearMonthBounds';
        value: undefined;
        validate: '$input instanceof Temporal.PlainYearMonth && Temporal.PlainYearMonth.compare($input, Temporal.Now.plainDateISO().toPlainYearMonth().subtract(SPAN)) >= 0 && Temporal.PlainYearMonth.compare($input, Temporal.Now.plainDateISO().toPlainYearMonth().add(SPAN)) <= 0';
      }>;
    return {
      build: () => {
        const SPAN = Temporal.Duration.from('P1000Y');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const SPAN = Temporal.Duration.from('P1000Y');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.zonedDateTime_minmax': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalZonedDateTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.ZonedDateTime && Temporal.ZonedDateTime.compare($input, MIN) >= 0 && Temporal.ZonedDateTime.compare($input, MAX) <= 0';
      }>;
    return {
      build: () => {
        const MIN = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
        const MAX = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const MIN = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
        const MAX = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.zonedDateTime_gtlt': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalZonedDateTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.ZonedDateTime && Temporal.ZonedDateTime.compare($input, GT) > 0 && Temporal.ZonedDateTime.compare($input, LT) < 0';
      }>;
    return {
      build: () => {
        const GT = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
        const LT = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const GT = Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]');
        const LT = Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),
  'DATETIME.zonedDateTime_rel': (() => {
    type Check = object &
      tags.TagBase<{
        target: 'object';
        kind: 'temporalZonedDateTimeBounds';
        value: undefined;
        validate: '$input instanceof Temporal.ZonedDateTime && Temporal.ZonedDateTime.compare($input, Temporal.Now.zonedDateTimeISO().subtract(SPAN)) >= 0 && Temporal.ZonedDateTime.compare($input, Temporal.Now.zonedDateTimeISO().add(SPAN)) <= 0';
      }>;
    return {
      build: () => {
        const SPAN = Temporal.Duration.from('P1000Y');
        const check = typia.createIs<Check>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const SPAN = Temporal.Duration.from('P1000Y');
        const val = typia.createValidate<Check>();
        return (v) => val(v).success;
      },
    };
  })(),

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
      const check = typia.createIs<User>();
      return (v) => check(v);
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
      const val = typia.createValidate<User>();
      return (v) => val(v).success;
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
      const check = typia.createIs<Order>();
      return (v) => check(v);
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
      const val = typia.createValidate<Order>();
      return (v) => val(v).success;
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
      const check = typia.createIs<BlogPost>();
      return (v) => check(v);
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
      const val = typia.createValidate<BlogPost>();
      return (v) => val(v).success;
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
      const check = typia.createIs<Product>();
      return (v) => check(v);
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
      const val = typia.createValidate<Product>();
      return (v) => val(v).success;
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
      const check = typia.createIs<ProductPage>();
      return (v) => check(v);
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
      const val = typia.createValidate<ProductPage>();
      return (v) => val(v).success;
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
      const check = typia.createIs<RegistrationForm>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      const val = typia.createValidate<RegistrationForm>();
      return (v) => val(v).success;
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
      const check = typia.createIs<ToBeChecked>();
      return (v) => check(v);
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
      const val = typia.createValidate<ToBeChecked>();
      return (v) => val(v).success;
    },
  },

  // ── JSON_SCHEMA ──
  // typia has no JSON Schema INPUT door (json.application<[T]>() is the OUTPUT
  // direction), so these entries state the same CONSTRAINT as a typia type plus
  // tags, like every other group here. Every entry below was verified against
  // this group's EXACT shared samples by building it through the real ttsc
  // transform, not inferred from the tag names.
  // A Pattern tag on the index-signature key is enforced per key by is + validate.
  'JSON_SCHEMA.property_names': {
    build: () => {
      const check = typia.createIs<{[key: string & tags.Pattern<'^[a-z]+$'>]: number} & PlainObject>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[key: string & tags.Pattern<'^[a-z]+$'>]: number} & PlainObject>();
      return (v) => val(v).success;
    },
  },
  'JSON_SCHEMA.contains_count': (() => {
    // contains {minimum: 10} + minContains 2 as an array tag (no typia feature); full counting loop like mion.
    const countAtLeast10 = (items: unknown[]): number => {
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        const x = items[i];
        if (Number.isFinite(x) && (x as number) >= 10) n++;
      }
      return n;
    };
    type MinContains = tags.TagBase<{target: 'array'; kind: 'minContains'; value: 2; validate: 'countAtLeast10($input) >= 2'}>;
    return {
      build: () => {
        const check = typia.createIs<Array<number> & MinContains>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<Array<number> & MinContains>();
        return (v) => val(v).success;
      },
    };
  })(),
  'JSON_SCHEMA.unique_items': {
    build: () => {
      const check = typia.createIs<Array<number> & tags.UniqueItems>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Array<number> & tags.UniqueItems>();
      return (v) => val(v).success;
    },
  },
  'JSON_SCHEMA.object_size': (() => {
    // minProperties 1 / maxProperties 3 as an object tag (no typia key-count feature); counts keys like mion's for-in.
    const sizeInRange = (o: object): boolean => {
      let n = 0;
      for (const _k in o) n++;
      return n >= 1 && n <= 3;
    };
    type ObjectSize = tags.TagBase<{target: 'object'; kind: 'objectSize'; value: undefined; validate: 'sizeInRange($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<{[key: string]: number} & PlainObject & ObjectSize>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<{[key: string]: number} & PlainObject & ObjectSize>();
        return (v) => val(v).success;
      },
    };
  })(),
  'JSON_SCHEMA.string_email': {
    build: () => {
      const check = typia.createIs<string & tags.Format<'email'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Format<'email'>>();
      return (v) => val(v).success;
    },
  },
  'JSON_SCHEMA.int_bounded': (() => {
    // Number.isInteger as a leaf tag: every typia integer Type also adds a range check mion does not run.
    type Integer = tags.TagBase<{target: 'number'; kind: 'integer'; value: undefined; validate: 'Number.isInteger($input)'}>;
    return {
      build: () => {
        const check = typia.createIs<number & Integer & tags.Maximum<130> & tags.Minimum<0>>();
        return (v) => check(v);
      },
      buildErrors: () => {
        const val = typia.createValidate<number & Integer & tags.Maximum<130> & tags.Minimum<0>>();
        return (v) => val(v).success;
      },
    };
  })(),
  'JSON_SCHEMA.string_pattern': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[a-z][a-z0-9-]*$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[a-z][a-z0-9-]*$'>>();
      return (v) => val(v).success;
    },
  },
  'JSON_SCHEMA.multiple_of': {
    build: () => {
      const check = typia.createIs<number & tags.MultipleOf<5>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.MultipleOf<5>>();
      return (v) => val(v).success;
    },
  },

  // ── STRICT ──
  // createIs is structural and ACCEPTS excess keys, so the closed forms
  // (createEquals / createValidateEquals) are the correct pair here.
  'STRICT.flat_required': {
    build: () => {
      interface StrictFlat {
        id: number;
        name: string;
        active: boolean;
      }
      const check = typia.createEquals<StrictFlat>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface StrictFlat {
        id: number;
        name: string;
        active: boolean;
      }
      const val = typia.createValidateEquals<StrictFlat>();
      return (v) => val(v).success;
    },
  },
  'STRICT.nested_required': {
    build: () => {
      interface StrictNested {
        name: string;
        inner: {x: number; y: string};
      }
      const check = typia.createEquals<StrictNested>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface StrictNested {
        name: string;
        inner: {x: number; y: string};
      }
      const val = typia.createValidateEquals<StrictNested>();
      return (v) => val(v).success;
    },
  },
  'STRICT.moltar_dto': {
    build: () => {
      interface StrictMoltarDto {
        number: number;
        negNumber: number;
        maxNumber: number;
        string: string;
        longString: string;
        boolean: boolean;
        deeplyNested: {foo: string; num: number; bool: boolean};
      }
      const check = typia.createEquals<StrictMoltarDto>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface StrictMoltarDto {
        number: number;
        negNumber: number;
        maxNumber: number;
        string: string;
        longString: string;
        boolean: boolean;
        deeplyNested: {foo: string; num: number; bool: boolean};
      }
      const val = typia.createValidateEquals<StrictMoltarDto>();
      return (v) => val(v).success;
    },
  },
  'STRICT.realworld_order': {
    build: () => {
      interface StrictOrder {
        id: string;
        customer: {id: number; email: string};
        items: {sku: string; name: string; qty: number; price: number}[];
        shipping: {street: string; city: string; state: string; zip: string; country: string};
        status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
        total: number;
        note?: string;
      }
      const check = typia.createEquals<StrictOrder>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface StrictOrder {
        id: string;
        customer: {id: number; email: string};
        items: {sku: string; name: string; qty: number; price: number}[];
        shipping: {street: string; city: string; state: string; zip: string; country: string};
        status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
        total: number;
        note?: string;
      }
      const val = typia.createValidateEquals<StrictOrder>();
      return (v) => val(v).success;
    },
  },
};
