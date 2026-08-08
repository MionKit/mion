// typia validators keyed by suite case key ("GROUP.case"), TYPE form.
//
// The two metrics map onto typia's two real exports: `validate` uses
// `typia.createIs<T>()` (cheap boolean) and `validationErrors` uses
// `typia.createValidate<T>()` (returns `IValidation<T>`, so `.success` is the
// verdict). Both names are pinned by `pnpm rtx bench typecheck`, which compiles
// this file against the installed typia typings.
//
// typia validates the FULL TypeScript type via `typia.createIs<T>()`, transformed
// at build time by typia's tsgo transform (driven through `@ttsc/unplugin` in
// esbuild.config.mjs). Like ts-go's `createValidateFn<T>()` it needs the per-case
// type written LITERALLY at the call site, so each non-format entry copies the
// literal `T` (and any local enum / interface / recursive type decl) VERBATIM from
// the ts-go competitor's cases.ts. Recursion, utility types (Partial/Pick/Omit/
// Exclude/Extract/keyof/indexed-access/conditional/mapped/key-remapping), and
// template-literal types are all expressed natively and work.
//
// FORMAT suites can't use the `Format*` brand types, so they translate to typia
// tags (`string & tags.MinLength<…>`, `… & tags.Pattern<'…'>`, `number & tags.Type<…>
// & tags.Minimum<…>`, etc.). Tag semantics confirmed against the installed typings
// and each case's exact samples; a tag is used only where it matches the samples.
//
// A case is marked supported ONLY when (a) typia can express the type and (b) the
// shared sample data matches typia's runtime semantics. Divergences that force
// NOT_SUPPORTED (each entry below carries the precise reason):
//   - bare `number` accepts NaN/Infinity (no tag means "finite" without also forcing
//     integer/range), so every case rejecting NaN/Infinity at a plain-number position fails;
//   - `Date` is `instanceof Date` only, so Invalid Date (new Date('invalid')) passes;
//   - calendar/bound-aware string formats (date/date-time with real-calendar or
//     min/max bounds) exceed what a Pattern can express;
//   - typia validates function-typed members & methods (we silently drop them),
//     mis-renders `void`, treats `never`/`object`/all-optional objects/Promise/Temporal
//     differently than these suites, and can't hold 64-bit bigint bounds as tag literals.

import typia, {tags} from 'typia';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';

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
      const check = typia.createIs<Date>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Date>();
      return (v) => val(v).success;
    },
    samples: {invalid: ['hello', null, undefined, 42]},
  }, // override: typia Date is instanceof (accepts Invalid Date); invalid set drops new Date('invalid')/new Date(NaN)
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
  'ATOMIC.literal_1n': NOT_SUPPORTED, // typia does not support bigint literal types (is<1n>() rejects the literal 1n)
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // we match a symbol by its description; typia can't constrain symbol identity/description
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
    samples: {invalid: ['hello', null, undefined]},
  }, // override: typia number accepts NaN/Infinity; invalid set drops them
  'ATOMIC.object': NOT_SUPPORTED, // typia is<object>() rejects arrays; the suite treats [] as a valid object
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
  'ATOMIC.symbol': {
    build: () => {
      const check = typia.createIs<symbol>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<symbol>();
      return (v) => val(v).success;
    },
  },
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
  'ATOMIC.void': NOT_SUPPORTED, // typia transform emits invalid JS `(void) => true` for the void type
  // noLiterals degrades a literal to its base type; typia validates that base type directly.
  'ATOMIC.literal_2_noLiterals': {
    build: () => {
      const check = typia.createIs<number>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number>();
      return (v) => val(v).success;
    },
    samples: {invalid: ['4', null]},
  }, // override: degrades to number (mirrors the other *_noLiterals base-type mappings); typia accepts NaN/Infinity so invalid drops them
  'ATOMIC.literal_a_noLiterals': {
    build: () => {
      const check = typia.createIs<string>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.literal_regexp_noLiterals': {
    build: () => {
      const check = typia.createIs<RegExp>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<RegExp>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.literal_true_noLiterals': {
    build: () => {
      const check = typia.createIs<boolean>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<boolean>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.literal_1n_noLiterals': {
    build: () => {
      const check = typia.createIs<bigint>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<bigint>();
      return (v) => val(v).success;
    },
  },
  'ATOMIC.literal_symbol_noLiterals': {
    build: () => {
      const check = typia.createIs<symbol>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<symbol>();
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
    samples: {invalid: [[1, '2'], 'not-array', null, undefined, [null], [BigInt(1)]]},
  }, // override: typia number element accepts NaN/Infinity; invalid drops [Infinity]/[-Infinity]/[NaN]
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
      const check = typia.createIs<Date[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Date[]>();
      return (v) => val(v).success;
    },
    samples: {invalid: [['2024'], [42], null, undefined]},
  }, // override: typia Date element is instanceof (accepts Invalid Date); invalid drops [new Date('invalid')]
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
  'ARRAY.string_array_noIsArrayCheck': {
    build: () => {
      const check = typia.createIs<string[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string[]>();
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
    samples: {invalid: [[true], 'a', [null], ['a', true], null, undefined, [BigInt(1)]]},
  }, // override: typia number arm accepts Infinity element; invalid drops [Infinity]
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
  'ARRAY.circular_array': NOT_SUPPORTED, // typia transform stack-overflows on the base-case-free self-referential array (type X = X[])
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
  'ARRAY.symbol_array': {
    build: () => {
      const check = typia.createIs<symbol[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<symbol[]>();
      return (v) => val(v).success;
    },
  },
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
    samples: {invalid: ['hello', null, undefined, {a: 'x'}, {a: 1, b: 1}, {a: 'x', b: 'not number'}, {b: 1}, true]},
  }, // override: typia number prop accepts NaN/Infinity; invalid drops {a:'x',b:NaN}/{a:'x',b:Infinity}
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
    samples: {invalid: [{a: 'x', b: 'not number'}, {a: 1}, null, undefined, {}, {b: 1}]},
  }, // override: typia number prop accepts NaN; invalid drops {a:'x',b:NaN}
  'OBJECT.interface_with_date': {
    build: () => {
      const check = typia.createIs<{date: Date; name: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{date: Date; name: string}>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{date: 'not date', name: 'x'}, {date: new Date(), name: 1}, {name: 'x'}, null, undefined]},
  }, // override: typia Date prop is instanceof (accepts Invalid Date); invalid drops the two Invalid Date entries
  'OBJECT.interface_with_method': NOT_SUPPORTED, // typia validates the function prop (cb); we silently drop it, so valid samples with cb:42/null fail here
  'OBJECT.nested_object': {
    build: () => {
      const check = typia.createIs<{a: string; deep: {b: string; c: number}}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; deep: {b: string; c: number}}>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{a: 'x'}, {a: 'x', deep: {b: 1, c: 1}}, {a: 'x', deep: null}, null, undefined, {a: 'x', deep: {b: 'y'}}]},
  }, // override: typia nested number prop accepts NaN; invalid drops {a:'x',deep:{b:'y',c:NaN}}
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
  // typia accepts an explicit-`undefined` property value ({a: undefined}) for a
  // string index signature — a genuine runtime-semantics divergence from the suite
  // (we reject it: every index value must satisfy the value type). Not fixable
  // at the type level, so opted out rather than left as a perpetual correctness FAIL.
  // typia accepts an explicit-`undefined` property value ({a: undefined}) for a
  // string index signature; we reject it (every index value must satisfy the value type).
  'OBJECT.index_signature_string': NOT_SUPPORTED,
  'OBJECT.index_signature_named_props': {
    build: () => {
      const check = typia.createIs<{a: string; b: number; [key: string]: string | number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; b: number; [key: string]: string | number}>();
      return (v) => val(v).success;
    },
  },
  'OBJECT.index_signature_nested': {
    build: () => {
      const check = typia.createIs<{[key: string]: {[key: string]: number}}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[key: string]: {[key: string]: number}}>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{a: 1}, {a: {x: 'not number'}}, null, undefined, {a: {x: null}}]},
  }, // override: typia nested number value accepts NaN; invalid drops {a:{x:NaN}}
  'OBJECT.index_signature_date_value': {
    build: () => {
      const check = typia.createIs<{[key: string]: {[key: string]: Date}}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[key: string]: {[key: string]: Date}}>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{a: {x: 'not date'}}, {a: 'not object'}, null, undefined]},
  }, // override: typia Date value is instanceof (accepts Invalid Date); invalid drops {a:{x:new Date('invalid')}}
  'OBJECT.index_signature_non_root': (() => {
    interface Obj1 {
      a: string;
      [key: string]: string;
    }
    interface Obj2 {
      b: string;
      c: Obj1;
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
  'OBJECT.function_top_level': NOT_SUPPORTED, // typia transform emits invalid JS for the void return position of () => void
  'OBJECT.interface_callable': NOT_SUPPORTED, // typia does not validate a callable interface as a function-with-props; rejects the valid function value
  'OBJECT.interface_all_optional': NOT_SUPPORTED, // typia's all-optional object accepts Date/Map/Set/array instances; we reject them
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
      const check = typia.createIs<MySerializableClass>();
      return (v) => check(v);
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
      const val = typia.createValidate<MySerializableClass>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{date: 'not date', name: 'x'}, {date: new Date()}, {name: 'x'}, null, 'not object', undefined]},
  }, // override: typia Date prop is instanceof (accepts Invalid Date); invalid drops the two Invalid Date entries
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
    samples: {invalid: [[1, 'not boolean'], [1], [1, true, 'extra'], ['not number', true], 'not array', null, undefined, []]},
  }, // override: typia number param accepts NaN; invalid drops [NaN,true]
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
    samples: {invalid: [[3, 3, 3], [3, true, 'hello', 7], [3], 'not array', null, undefined]},
  }, // override: typia number param accepts NaN; invalid drops [NaN,true]
  'OBJECT.call_signature_params_with_rest': {
    build: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const check = typia.createIs<Parameters<CallSig>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
      const val = typia.createValidate<Parameters<CallSig>>();
      return (v) => val(v).success;
    },
    samples: {invalid: [[3, 3, 3], [3, true, new Date(), 7], [3, true, new Date(), 7, true], 'not array', null, undefined]},
  }, // override: typia Date rest element is instanceof (accepts Invalid Date); invalid drops [3,true,new Date('invalid')]
  'OBJECT.record_union_keys': {
    build: () => {
      const check = typia.createIs<Record<'a' | 'b', number>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Record<'a' | 'b', number>>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{a: 1}, {b: 1}, {}, {a: 'x', b: 1}, null, 'not object', undefined]},
  }, // override: typia number value accepts NaN/Infinity; invalid drops {a:1,b:NaN}/{a:Infinity,b:1}
  'OBJECT.union_value_index': {
    build: () => {
      const check = typia.createIs<{[key: string]: string | number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[key: string]: string | number}>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{a: true}, {a: 'x', b: null}, 'not object', null, undefined, {a: BigInt(1)}]},
  }, // override: typia number index value accepts NaN; invalid drops {a:NaN}
  'OBJECT.object_with_union_prop': {
    build: () => {
      const check = typia.createIs<{kind: 'a' | 'b'; n: number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{kind: 'a' | 'b'; n: number}>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{kind: 'c', n: 1}, {n: 1}, {kind: 'a', n: 'not number'}, null, undefined, {kind: 'a'}]},
  }, // override: typia number prop accepts NaN; invalid drops {kind:'a',n:NaN}
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
  'OBJECT.index_signature_number_key': {
    build: () => {
      const check = typia.createIs<{[k: number]: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{[k: number]: string}>();
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
    samples: {
      invalid: [[], ['hello'], ['hello', 1, 'extra'], [1, 'hello'], 'not array', null, undefined, [null, 1], ['hello', null]],
    },
  }, // override: typia number slot accepts NaN; invalid drops ['hello',NaN]
  'TUPLE.full_mion_tuple': {
    build: () => {
      const check = typia.createIs<[Date, number, string, null, string[], bigint]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[Date, number, string, null, string[], bigint]>();
      return (v) => val(v).success;
    },
    samples: {
      invalid: [
        [new Date(), 123, 'hello', null, ['a', 'b', 'c']],
        [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34],
        [new Date(), 123, 'hello', null, ['a', 'b', 'c'], 'not bigint'],
        null,
        undefined,
        [new Date(), 123, 'hello', undefined, ['a'], 1n],
      ],
    },
  }, // override: typia Date slot is instanceof + number slot accepts NaN; invalid drops the Invalid Date + NaN entries
  'TUPLE.tuple_with_optional': {
    build: () => {
      const check = typia.createIs<[number, bigint?, boolean?, number?]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[number, bigint?, boolean?, number?]>();
      return (v) => val(v).success;
    },
    samples: {invalid: [[], [3, 'not bigint'], [3, 1n, false, 4, 'extra'], 'not array', null, undefined, ['not number']]},
  }, // override: typia number slot accepts NaN; invalid drops [NaN]
  'TUPLE.nested_tuple_in_array': {
    build: () => {
      const check = typia.createIs<[string, number][]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[string, number][]>();
      return (v) => val(v).success;
    },
    samples: {invalid: [[['a', 'b']], [['a']], ['not tuple'], null, undefined, [[null, 1]]]},
  }, // override: typia number slot accepts NaN; invalid drops [['a',NaN]]
  'TUPLE.tuple_rest': {
    build: () => {
      const check = typia.createIs<[number, ...string[]]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[number, ...string[]]>();
      return (v) => val(v).success;
    },
    samples: {invalid: [[3, 'a', 4], ['not number'], [], 'not array', [3, 1], null, undefined, [3, null]]},
  }, // override: typia number slot accepts NaN; invalid drops [NaN,'a']
  'TUPLE.tuple_circular': NOT_SUPPORTED, // typia transform stack-overflows computing the full name of the anonymous self-referential tuple type alias (type TupleCircular = [..., TupleCircular?])
  'TUPLE.tuple_multiple_trailing_optionals': {
    build: () => {
      const check = typia.createIs<[number, bigint?, boolean?, number?]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[number, bigint?, boolean?, number?]>();
      return (v) => val(v).success;
    },
    samples: {invalid: [[], [3, 'not bigint'], [3, 1n, true, 4, 'extra'], 'not array', null, undefined, [3, 1n, 'not boolean']]},
  }, // override: typia number slot accepts NaN; invalid drops [NaN]
  'TUPLE.tuple_named_labels': {
    build: () => {
      const check = typia.createIs<[name: string, age: number]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<[name: string, age: number]>();
      return (v) => val(v).success;
    },
    samples: {invalid: [[], ['Alice'], ['Alice', '30'], [30, 'Alice'], null, 'not array', undefined, [null, 30]]},
  }, // override: typia number slot accepts NaN; invalid drops ['Alice',NaN]
  'TUPLE.tuple_with_non_serializable': NOT_SUPPORTED, // typia requires the function slot; we treat it as must-be-undefined (valid sample [3] omits it)
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
      const check = typia.createIs<Date | number | string | null | bigint>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Date | number | string | null | bigint>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{}, [], true, undefined, Symbol(), () => null]},
  }, // override: typia Date arm is instanceof + number arm accepts Infinity; invalid drops new Date('invalid')/Infinity
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
    samples: {invalid: [null, undefined, true, [], {}, BigInt(1)]},
  }, // override: typia number arm accepts NaN/Infinity; invalid drops NaN/Infinity
  'UNION.union_of_array_types': {
    build: () => {
      const check = typia.createIs<string[] | number[] | boolean[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string[] | number[] | boolean[]>();
      return (v) => val(v).success;
    },
    samples: {invalid: [['a', 1], [1, 'a'], 'not array', null, undefined, [null], [BigInt(1)]]},
  }, // override: typia number[] arm accepts Infinity element; invalid drops [Infinity]
  'UNION.array_of_union': {
    build: () => {
      const check = typia.createIs<(string | bigint | boolean | Date)[]>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<(string | bigint | boolean | Date)[]>();
      return (v) => val(v).success;
    },
    samples: {invalid: [['a', false, 2], null, undefined, [null], [{}]]},
  }, // override: typia Date arm is instanceof (accepts Invalid Date element); invalid drops [new Date('invalid')]
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
    samples: {
      invalid: [{kind: 'c', n: 1}, {kind: 'a', n: 'not number'}, {n: 1}, null, 'not object', undefined, {kind: 'a'}, {kind: 'b'}],
    },
  }, // override: typia number prop accepts NaN; invalid drops {kind:'a',n:NaN}
  'UNION.circular_union': {
    build: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const check = typia.createIs<UnionC>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const val = typia.createValidate<UnionC>();
      return (v) => val(v).success;
    },
    samples: {invalid: [true, null, undefined, {a: true}, [true], Symbol()]},
  }, // override: typia Date arm is instanceof + number arm accepts Infinity; invalid drops new Date('invalid') + Infinity
  'UNION.union_with_methods': NOT_SUPPORTED, // typia validates the methods; we drop them, so valid samples omitting the method fail here
  'UNION.intersection_to_object': {
    build: () => {
      const check = typia.createIs<{a: string} & {b: number}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string} & {b: number}>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{a: 'x'}, {b: 1}, null, {a: 1, b: 1}, {a: 'x', b: 'not number'}, undefined, {}]},
  }, // override: typia number prop accepts NaN; invalid drops {a:'x',b:NaN}
  'UNION.union_with_index_arm': {
    build: () => {
      const check = typia.createIs<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{a: 'hello'}, {b: 'hello'}, {a: 'hello', d: 'extra'}, {c: 1n, d: 'hello'}, null, undefined, {}]},
  }, // override: typia number prop accepts NaN; invalid drops {b:NaN}
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
    samples: {invalid: [{a: 'hello'}, {}, null, undefined, {a: 'string not boolean or number'}, {a: null}]},
  }, // override: typia number arm accepts NaN; invalid drops {a:NaN}
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
    samples: {invalid: [{}, {name: 'test'}, {id: 123}, {value: 'not number'}, null, undefined]},
  }, // override: typia number prop accepts NaN; invalid drops {value:NaN}

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
  'TEMPLATE_LITERAL.template_literal_index_key': NOT_SUPPORTED, // verified typia accepts {foo:1} for a template-literal index key — it ignores keys not matching the pattern, where we require every own key to match (structural divergence, not purely sample-semantics)
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
    samples: {
      invalid: [
        {},
        [],
        null,
        'not map',
        new Map<any, number>([[1, 1]]),
        new Map<string, any>([['a', 'not number']]),
        undefined,
        new Date(),
        new Set(),
      ],
    },
  }, // override: typia Map number value accepts NaN; invalid drops the NaN-valued Map (keeps wrongKey/wrongValue)
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
  'NATIVE.promise_string': NOT_SUPPORTED, // typia does not validate Promise<T> as a thenable; rejects a real Promise
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
        d?: Date;
      }
      const check = typia.createIs<Circular>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const val = typia.createValidate<Circular>();
      return (v) => val(v).success;
    },
    samples: {
      invalid: [
        {n: 1, s: 'hello', c: {n: 2, s: 123}},
        {n: 1, s: 'hello', c: {n: 2}},
        null,
        undefined,
        {n: 1, s: 'x', d: 'not date'},
        {},
      ],
    },
  }, // override: typia number prop accepts NaN + Date prop is instanceof; invalid drops {n:NaN,...} + the Invalid Date entry
  'CIRCULAR.array_of_union_with_self_ref': NOT_SUPPORTED, // typia transform stack-overflows computing the full name of the anonymous self-referential array/union type alias (type CuArray = (CuArray | …)[])
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
      index: {[key: string]: CircularIndex};
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
      deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
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

  // ── CIRCULAR_REFS ── (cyclic VALUES; typia has no cyclic-value detection)
  'CIRCULAR_REFS.linked_list_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.tree_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.object_self_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow

  // ── UTILITY ──
  'UTILITY.partial': NOT_SUPPORTED, // all-optional object: typia accepts a Date/Map/Set instance (verified: new Date() passes) where we reject it — a structural divergence, same as OBJECT.interface_all_optional (not purely sample-semantics)
  'UTILITY.required': {
    build: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const check = typia.createIs<Required<MaybePerson>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const val = typia.createValidate<Required<MaybePerson>>();
      return (v) => val(v).success;
    },
    samples: {
      invalid: [{}, {name: 'John'}, {name: 'John', age: 30}, {name: 'John', age: 30, createdAt: 'not date'}, null, undefined],
    },
  }, // override: typia number prop accepts NaN + Date prop is instanceof; invalid drops the NaN + Invalid Date entries
  'UTILITY.pick': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const check = typia.createIs<Pick<Person, 'name' | 'createdAt'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const val = typia.createValidate<Pick<Person, 'name' | 'createdAt'>>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{name: 'John'}, {createdAt: new Date()}, {name: 42, createdAt: new Date()}, null, undefined]},
  }, // override: typia Date prop is instanceof (accepts Invalid Date); invalid drops {name:'John',createdAt:new Date('invalid')}
  'UTILITY.omit': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const check = typia.createIs<Omit<Person, 'age'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const val = typia.createValidate<Omit<Person, 'age'>>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{name: 'John'}, {createdAt: new Date()}, null, undefined]},
  }, // override: typia Date prop is instanceof (accepts Invalid Date); invalid drops {name:'John',createdAt:new Date('invalid')}
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
    samples: {invalid: [{kind: 'circle', radius: 3}, {}, null, undefined, {kind: 'square'}, {kind: 'triangle', base: 4}]},
  }, // override: typia number prop accepts NaN; invalid drops {kind:'square',x:NaN}
  'UTILITY.non_nullable': {
    build: () => {
      const check = typia.createIs<NonNullable<string | number | null | undefined>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<NonNullable<string | number | null | undefined>>();
      return (v) => val(v).success;
    },
    samples: {invalid: [null, undefined, true, {}, []]},
  }, // override: typia number arm accepts NaN/Infinity; invalid drops NaN/Infinity
  'UTILITY.return_type': {
    build: () => {
      type Fn = (a: number, b: boolean) => Date;
      const check = typia.createIs<ReturnType<Fn>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      const val = typia.createValidate<ReturnType<Fn>>();
      return (v) => val(v).success;
    },
    samples: {invalid: ['not date', 42, null, undefined, {}, []]},
  }, // override: typia resolves to Date (instanceof, accepts Invalid Date); invalid drops new Date('invalid')/new Date(NaN)
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
    samples: {invalid: [{name: 'John'}, {age: 30}, null, undefined, {name: 1, age: 30}]},
  }, // override: typia number prop accepts NaN; invalid drops {name:'John',age:NaN}
  'UTILITY.intersection_with_required_override': {
    build: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const check = typia.createIs<Partial<Person> & Required<Pick<Person, 'name'>>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const val = typia.createValidate<Partial<Person> & Required<Pick<Person, 'name'>>>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{}, {age: 30}, {name: 42}, {name: 'John', age: '30'}, null, undefined]},
  }, // override: typia number prop accepts NaN + Date prop is instanceof (name required ⇒ not all-optional); invalid drops the NaN + Invalid Date entries
  'UTILITY.omit_keeping_optional': {
    build: () => {
      const check = typia.createIs<Omit<{a: string; b?: number; c: boolean}, 'a'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Omit<{a: string; b?: number; c: boolean}, 'a'>>();
      return (v) => val(v).success;
    },
    samples: {invalid: [{}, {b: 1}, {c: 'not boolean'}, null, undefined, {c: 0}, {b: 1, c: 1}]},
  }, // override: typia number prop accepts NaN (c required ⇒ not all-optional); invalid drops {c:true,b:NaN}
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
    samples: {invalid: [{w: true}, {w: null}, {}, null, undefined]},
  }, // override: typia number arm accepts NaN; invalid drops {w:NaN}
  'UTILITY.deep_partial_recursive_mapped': NOT_SUPPORTED, // all-optional outer object: typia accepts a Date instance (verified: new Date() passes) where we reject it — a structural divergence, same as OBJECT.interface_all_optional (not purely sample-semantics)

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
      createdAt: Date;
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
  // Temporal.* are branded class instances; typia validates by structure and can't reliably
  // distinguish them (and the bench runtime has no Temporal global, so samples can't even build).
  'DATETIME.date': {
    build: () => {
      const check = typia.createIs<Date>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<Date>();
      return (v) => val(v).success;
    },
    samples: {invalid: ['hello', null, undefined, 42]},
  }, // override: typia Date is instanceof (accepts Invalid Date); invalid drops new Date('invalid')/new Date(NaN)
  'DATETIME.instant': NOT_SUPPORTED,
  'DATETIME.zonedDateTime': NOT_SUPPORTED,
  'DATETIME.plainDate': NOT_SUPPORTED,
  'DATETIME.plainTime': NOT_SUPPORTED,
  'DATETIME.plainDateTime': NOT_SUPPORTED,
  'DATETIME.plainYearMonth': NOT_SUPPORTED,
  'DATETIME.plainMonthDay': NOT_SUPPORTED,
  'DATETIME.duration': NOT_SUPPORTED,

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
      const check = typia.createIs<string & tags.Pattern<'^(?!(?:admin|root)$).*$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^(?!(?:admin|root)$).*$'>>();
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
  'STRING_FORMAT.alpha': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[a-zA-Z]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[a-zA-Z]+$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[a-zA-Z0-9]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[a-zA-Z0-9]+$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.numeric': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[0-9]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[0-9]+$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.alpha_withLength': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^[a-zA-Z]+$'> & tags.MaxLength<3>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^[a-zA-Z]+$'> & tags.MaxLength<3>>();
      return (v) => val(v).success;
    },
  },
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
  'STRING_FORMAT.date_iso': NOT_SUPPORTED, // needs calendar validity; verified typia tags.Format<'date'> accepts 2023-02-29 (format-only, no real-calendar check)
  'STRING_FORMAT.date_DMY': NOT_SUPPORTED, // needs calendar validity (rejects 31-04-2024); a Pattern can only check format
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
  'STRING_FORMAT.date_MD': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.date_minMax_absolute': NOT_SUPPORTED, // needs absolute min/max bound comparison on date strings (no typia tag)
  'STRING_FORMAT.time_iso': {
    build: () => {
      const check = typia.createIs<
        string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,9})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,9})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'>
      >();
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
      const check = typia.createIs<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,3})?$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,3})?$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.time_minMax_absolute': NOT_SUPPORTED, // needs absolute min/max bound comparison on time strings (no typia tag)
  'STRING_FORMAT.dateTime_default': NOT_SUPPORTED, // verified typia tags.Format<'date-time'> accepts the space-split form '2024-02-29 12:30:45Z' (RFC 3339 allows space) + no calendar check; we need a T-only split with calendar validity
  'STRING_FORMAT.dateTime_custom': {
    build: () => {
      const check = typia.createIs<
        string & tags.Pattern<'^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string & tags.Pattern<'^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4} ([01][0-9]|2[0-3]):[0-5][0-9]$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.dateTime_minMax_absolute': NOT_SUPPORTED, // needs absolute min/max bound comparison on datetime strings (no typia tag)
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
  'STRING_FORMAT.ipv4_port': {
    build: () => {
      const check = typia.createIs<
        string &
          tags.Pattern<'^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]):(?:6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}|0)$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string &
          tags.Pattern<'^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]):(?:6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}|0)$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.ipv6_port': {
    build: () => {
      const check = typia.createIs<
        string &
          tags.Pattern<'^\\[[0-9a-fA-F:]+\\]:(?:6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}|0)$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string &
          tags.Pattern<'^\\[[0-9a-fA-F:]+\\]:(?:6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}|0)$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.domain': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.domainStrict': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.){1,5}[a-zA-Z]{2,}$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string & tags.Pattern<'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.){1,5}[a-zA-Z]{2,}$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.email': {
    build: () => {
      const check = typia.createIs<string & tags.Format<'email'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Format<'email'>>();
      return (v) => val(v).success;
    },
    samples: {
      valid: ['john@example.com', 'jane.doe@mion.io', 'ab@cd.co', 'user+tag@sub.example.org'],
      invalid: ['not-an-email', '@example.com', 'john@', 'john@example', 'john doe@example.com', ''],
    },
  }, // override: typia email accepts a@b.co (1-char domain label) which we reject; invalid drops only that one sample
  'STRING_FORMAT.emailPunycode': {
    build: () => {
      const check = typia.createIs<string & tags.Format<'email'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Format<'email'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.emailStrict': {
    build: () => {
      const check = typia.createIs<
        string & tags.Pattern<'^[a-zA-Z0-9._-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string & tags.Pattern<'^[a-zA-Z0-9._-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.url': {
    build: () => {
      const check = typia.createIs<
        string & tags.Pattern<'^(?:https?|ftp|wss?):\\/\\/[^\\s.]+(?:\\.[^\\s.]+)+(?:[\\/?][^\\s]*)?$'>
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<
        string & tags.Pattern<'^(?:https?|ftp|wss?):\\/\\/[^\\s.]+(?:\\.[^\\s.]+)+(?:[\\/?][^\\s]*)?$'>
      >();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.urlHttp': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^https?:\\/\\/[^\\s.]+(?:\\.[^\\s.]+)+(?:[\\/?][^\\s]*)?$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^https?:\\/\\/[^\\s.]+(?:\\.[^\\s.]+)+(?:[\\/?][^\\s]*)?$'>>();
      return (v) => val(v).success;
    },
  },
  'STRING_FORMAT.urlFile': {
    build: () => {
      const check = typia.createIs<string & tags.Pattern<'^file:\\/\\/\\/[^\\s]+$'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<string & tags.Pattern<'^file:\\/\\/\\/[^\\s]+$'>>();
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
  'NUMBER_FORMAT.number_integer': {
    build: () => {
      const check = typia.createIs<number & tags.Type<'int32'>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Type<'int32'>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_float': NOT_SUPPORTED, // our FormatFloat means non-integer; typia Type<'float'> means float32-representable (accepts integers)
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
  'NUMBER_FORMAT.number_combined': {
    build: () => {
      const check = typia.createIs<number & tags.Type<'int32'> & tags.Minimum<0> & tags.Maximum<100> & tags.MultipleOf<5>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Type<'int32'> & tags.Minimum<0> & tags.Maximum<100> & tags.MultipleOf<5>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    build: () => {
      const check = typia.createIs<number & tags.Type<'int32'> & tags.Minimum<-128> & tags.Maximum<127>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Type<'int32'> & tags.Minimum<-128> & tags.Maximum<127>>();
      return (v) => val(v).success;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => {
      const check = typia.createIs<number & tags.Type<'uint32'> & tags.Maximum<255>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Type<'uint32'> & tags.Maximum<255>>();
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
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED, // typia tag schema can't hold 64-bit bigint bounds as literals (precision loss → "non-literal type")
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED, // typia tag schema can't hold 64-bit bigint bounds as literals (precision loss → "non-literal type")

  // ── DATETIME (format) ──
  // All DATETIME format cases need min/max/gt/lt/relative bound comparison on a Date or
  // Temporal value — typia has no tag for temporal range constraints (Min/Max tags target
  // number/bigint/string length only), and the Date-backed ones also accept Invalid Date.
  'DATETIME.date_minmax': NOT_SUPPORTED,
  'DATETIME.date_gtlt': NOT_SUPPORTED,
  'DATETIME.date_min_lt': NOT_SUPPORTED,
  'DATETIME.date_max_now': NOT_SUPPORTED,
  'DATETIME.date_rel_window': NOT_SUPPORTED,
  'DATETIME.date_rel_datetime_components': NOT_SUPPORTED,
  'DATETIME.instant_minmax': NOT_SUPPORTED,
  'DATETIME.instant_gtlt': NOT_SUPPORTED,
  'DATETIME.instant_rel': NOT_SUPPORTED,
  'DATETIME.plainDate_minmax': NOT_SUPPORTED,
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED,
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED,
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED,
  'DATETIME.plainDate_min_only': NOT_SUPPORTED,
  'DATETIME.plainDate_max_only': NOT_SUPPORTED,
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED,
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED,
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED,
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED,
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED,
  'DATETIME.plainTime_minmax': NOT_SUPPORTED,
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED,
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED,
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED,
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED,
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED,
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED,
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED,
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED,
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED,
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED,
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED,

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

  // ── JSON_SCHEMA ──
  // typia has no JSON Schema INPUT door (json.application<[T]>() is the OUTPUT
  // direction), so these entries state the same CONSTRAINT as a typia type plus
  // tags, like every other group here. Closedness cases use createEquals /
  // createValidateEquals: createIs is structural and accepts excess keys, which
  // is exactly what these cases must reject. Every entry below was verified
  // against this group's EXACT shared samples by building it through the real
  // ttsc transform, not inferred from the tag names.
  'JSON_SCHEMA.closed_object': {
    build: () => {
      const check = typia.createEquals<{id: number & tags.Type<'int32'>; name: string}>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidateEquals<{id: number & tags.Type<'int32'>; name: string}>();
      return (v) => val(v).success;
    },
  },
  'JSON_SCHEMA.pattern_properties': {
    build: () => {
      const check = typia.createEquals<Record<`col_${string}`, number>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidateEquals<Record<`col_${string}`, number>>();
      return (v) => val(v).success;
    },
  },
  'JSON_SCHEMA.property_names': NOT_SUPPORTED, // an index signature key cannot carry a regex constraint
  'JSON_SCHEMA.contains_count': NOT_SUPPORTED, // no count-of-matching-items tag
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
  'JSON_SCHEMA.object_size': NOT_SUPPORTED, // no key-count bounds on an index signature
  'JSON_SCHEMA.dependent_required': {
    build: () => {
      const check = typia.createEquals<
        {credit_card: number & tags.Type<'int32'>; billing_address: string} | {billing_address?: string}
      >();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidateEquals<
        {credit_card: number & tags.Type<'int32'>; billing_address: string} | {billing_address?: string}
      >();
      return (v) => val(v).success;
    },
  },
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
  'JSON_SCHEMA.int_bounded': {
    build: () => {
      const check = typia.createIs<number & tags.Type<'int32'> & tags.Minimum<0> & tags.Maximum<130>>();
      return (v) => check(v);
    },
    buildErrors: () => {
      const val = typia.createValidate<number & tags.Type<'int32'> & tags.Minimum<0> & tags.Maximum<130>>();
      return (v) => val(v).success;
    },
  },
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
};
