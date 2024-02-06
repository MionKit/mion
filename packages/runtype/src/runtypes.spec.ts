/* ########
 * 2021 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from '@sinclair/typebox';
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
        type T = any;
        const boxType = typeBox<T>();
        expect(boxType).toEqual(Type.Any());
    });
    it('regexp', () => {
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
    it('function', () => {
        function abc(a: string): string {
            return a;
        }
        const boxType = typeBox<typeof abc>();
        expect(boxType).toEqual(Type.Function([Type.String()], Type.String()));
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
});
