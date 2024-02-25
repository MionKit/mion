/* ########
 * 2021 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from '@sinclair/typebox';
import {TypeCompiler} from '@sinclair/typebox/compiler';
import {typeBox} from './reflection';

describe('native runtypes', () => {
    it('never', () => {
        type T = never;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Never());
    });
    it('any', () => {
        type T = any;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Any());
    });
    it('unknown', () => {
        type T = unknown;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Unknown());
    });
    it('void', () => {
        type T = void;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Void());
    });
    it('object', () => {
        // TODO: object
    });
    it('string', () => {
        type T = string;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.String());
        // TODO: string formats
    });
    it('boolean', () => {
        type T = boolean;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Boolean());
    });
    it('symbol', () => {
        type T = symbol;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Symbol());
    });
    it('bigint', () => {
        type T = bigint;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.BigInt());
    });
    it('null', () => {
        type T = null;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Null());
    });
    it('undefined', () => {
        type T = undefined;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Undefined());
    });
    it('literal number', () => {
        type T = 2;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Literal(2));
    });
    it('literal string', () => {
        type T = 2;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Literal(2));
    });
    it('literal boolean', () => {
        type T = true;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Literal(true));
    });
    it('literal regexp', () => {
        // Typebox does not support literal regexp so they are transformed to Regexp directly
        const reg = /abc/i;
        const boxType = typeBox<typeof reg>();
        expect(boxType).toEqual(Type.RegExp(reg));
    });

    it('template literal gets resolved to literal', () => {
        const a = 3;
        const b = `${a}hello`; // this should be resolved
        type T = typeof b;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Literal('3hello'));
    });

    it('function', () => {
        function abc(a: string): string {
            return a;
        }
        const boxType = typeBox<typeof abc>();
        expect(boxType).toEqual(Type.Function([Type.String()], Type.String()));
    });

    it('enum', () => {
        enum T {
            a,
            b = 5,
            c = 'hello',
        }
        const boxType = typeBox<T>();
        const boxT = Type.Enum(T);
        expect(boxType).toEqual(boxT);
    });

    it('array', () => {
        type A = string[];
        type B = Array<string>;
        const c: number[] = [1, 2, 3];
        const boxTypeA = typeBox<A>();
        const boxTypeB = typeBox<B>();
        const boxTypeC = typeBox<typeof c>();

        expect(boxTypeA).toEqual(Type.Array(Type.String()));
        expect(boxTypeB).toEqual(Type.Array(Type.String()));
        expect(boxTypeC).toEqual(Type.Array(Type.Number()));
    });

    it('tuple', () => {
        type A = [string, number];
        type B = [string, number, 6, 'hello'];
        const c: B = ['rolf', 5, 6, 'hello'];

        const boxTypeA = typeBox<A>();
        const boxTypeB = typeBox<B>();

        expect(boxTypeA).toEqual(Type.Tuple([Type.String(), Type.Number()]));
        expect(boxTypeB).toEqual(Type.Tuple([Type.String(), Type.Number(), Type.Literal(6), Type.Literal('hello')]));

        /* typeof c is not supported by deepkit (typeof only supported in classes, object literals and some others). Bellow code will fail */
        // const boxTypeC = typeBox<typeof c>();
        // expect(boxTypeC).toEqual(Type.Tuple([Type.String(), Type.Number(), Type.Literal(6), Type.Literal('hello')]));
    });

    it('union', () => {
        type A = string | number;
        interface B {
            b1: string;
            b2: number;
        }
        class C {
            constructor(
                public c1: string,
                public c2: number
            ) {}
        }
        type D = B | C;

        const f = {
            f1: 'hello',
            f2: 5,
        };
        type F = typeof f;
        type E = F | C;

        const boxTypeA = typeBox<A>();
        const boxA = Type.Union([Type.String(), Type.Number()]);
        expect(boxTypeA).toEqual(boxA);

        const boxTypeD = typeBox<D>();
        const boxB = Type.Object({b1: Type.String(), b2: Type.Number()});
        const boxC = Type.Object({
            constructor: Type.Function([Type.String(), Type.Number()], Type.Any()),
            c1: Type.String(),
            c2: Type.Number(),
        });
        const boxD = Type.Union([boxB, boxC]);
        expect(boxTypeD).toEqual(boxD);

        const boxTypeE = typeBox<E>();
        const boxF = Type.Object({f1: Type.String(), f2: Type.Number()});
        const boxE = Type.Union([boxF, boxC]);
        expect(boxTypeE).toEqual(boxE);
    });

    // deepkit is collapsing intersections so they get resolved before we call get type or typeof
    // https://github.com/deepkit/deepkit-framework/blob/master/packages/type/src/reflection/processor.ts#L1354
    it('intersection', () => {
        // type A = string & number; // the reflection should not be union but never, but there is a bug on deepkit and is returning string instead of never
        type A = string & string;
        interface BI {
            b1: string;
            b2?: number;
        }
        class BC {
            constructor(
                public b1: string,
                public aaa: number
            ) {}
        }
        type D = BI & BC;
        const bConst = {
            b1: 'hello',
            b2: 5,
            ccc: false,
        };
        type BCONST = typeof bConst;
        type E = BCONST & BI;

        // const boxTypeA = typeBox<A>();
        // const boxA = Type.String(); // union gets collapsed by deepkit
        // expect(boxTypeA).toEqual(boxA);

        // const boxTypeD = typeBox<D>();
        // const boxD = Type.Object({
        //     b2: Type.Optional(Type.Number()),
        //     constructor: Type.Function([Type.String(), Type.Number()], Type.Any()),
        //     b1: Type.String(),
        //     aaa: Type.Number(),
        // });
        // expect(boxTypeD).toEqual(boxD);

        const boxTypeE = typeBox<E>();
        const boxE = Type.Object({
            ccc: Type.Boolean(),
            b1: Type.String(),
            b2: Type.Optional(Type.Number()),
        });
        expect(boxTypeE).toEqual(boxE);
    });

    it('class with default types & functions', () => {
        // access modifiers like private, public, protected has no effect, they are all serialized
        class MyClass {
            private b: number = 5;
            public c: number = 6;
            // constructor return any on Deepkit
            constructor(protected a: string) {}
            getTotal(t: number): number {
                return this.b + this.c;
            }
        }
        const boxType = typeBox<MyClass>();
        // order of the properties should be same as the class, constructor params are defined after constructor
        const box = Type.Object({
            b: Type.Number({default: 5}),
            c: Type.Number({default: 6}),
            constructor: Type.Function([Type.String()], Type.Any()),
            a: Type.String(),
            getTotal: Type.Function([Type.Number()], Type.Number()),
        });
        expect(boxType).toEqual(box);
    });
    it('class extends', () => {
        class A {
            constructor(public a: string = 'hello') {}
        }
        class B extends A {
            c: number = 3;
            constructor(protected b: string) {
                super();
            }
        }
        const boxTypeA = typeBox<A>();

        const boxA = Type.Object({
            constructor: Type.Function([Type.String({default: 'hello'})], Type.Any()),
            a: Type.String({default: 'hello'}),
        });
        expect(boxTypeA).toEqual(boxA);

        const boxTypeB = typeBox<B>();
        const boxB = Type.Object({
            // super class properties are defined before parent class properties
            a: Type.String({default: 'hello'}),
            c: Type.Number({default: 3}),
            constructor: Type.Function([Type.String()], Type.Any()),
            b: Type.String(),
        });
        expect(boxTypeB).toEqual(boxB);
    });
    it('interface', () => {
        // access modifiers like private, public, protected has no effect, they are all serialized
        interface T {
            a: 6;
            b: number;
            c: string;
        }
        const boxType = typeBox<T>();
        // order of the properties should be same as the class, constructor params are defined after constructor
        const box = Type.Object({
            a: Type.Literal(6),
            b: Type.Number(),
            c: Type.String(),
        });
        expect(boxType).toEqual(box);
    });
    it('interface & object literal extends', () => {
        // extending from object Literal
        const a = {
            a: 'hello',
            callTo(): void {},
        };
        type A = typeof a;
        type B = A & {b: string};

        interface C extends B {
            c: number;
            callTo(): string;
        }

        const boxTypeA = typeBox<A>();
        const boxTypeB = typeBox<B>();
        const boxTypeC = typeBox<C>();

        const boxA = Type.Object({
            a: Type.String(),
            callTo: Type.Function([], Type.Void()),
        });
        const boxB = Type.Object({
            a: Type.String(),
            callTo: Type.Function([], Type.Void()),
            b: Type.String(),
        });
        const boxC = Type.Object({
            a: Type.String(),
            // note return has been overridden from extended interface
            callTo: Type.Function([], Type.String()),
            b: Type.String(),
            c: Type.Number(),
        });

        expect(boxTypeA).toEqual(boxA);
        expect(boxTypeB).toEqual(boxB);
        expect(boxTypeC).toEqual(boxC);
    });

    it('try the typebox compiler', () => {
        interface T {
            a: 6;
            b: number;
            c: string;
            d: null;
            f: undefined;
        }
        const boxTypeT = typeBox<T>();
        const compiled = TypeCompiler.Compile(boxTypeT);
        // console.log(compiled);
    });
});
