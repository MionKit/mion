/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {parametersToSrcCode, returnToSrcCode} from './clientReflection';

describe('client reflection should', () => {
    it('return  a type when parameters are primitives', () => {
        const handler = (
            a: undefined,
            b: any,
            c: null,
            d: number,
            e: string,
            f: symbol,
            g: unknown,
            h: bigint,
            j: boolean,
        ): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            a: 'undefined',
            b: 'any',
            c: 'null',
            d: 'number',
            e: 'string',
            f: 'symbol',
            g: 'unknown',
            h: 'bigint',
            j: 'boolean',
        });
    });

    it('return  a type when parameter is an union', () => {
        const handler = (a: string | number | boolean): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            a: '(string | number | boolean)',
        });
    });

    it('return  a type when parameter is a tuple', () => {
        const handler = (a: [string, number, boolean]): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            a: '[string , number , boolean]',
        });
    });

    it('return  a type when parameter is an array', () => {
        const handler = (a: string[], b: (string | number)[], c: number[][], d: (number | boolean)[][]): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            a: 'string[]',
            b: '(string | number)[]',
            c: 'number[][]',
            d: '(number | boolean)[][]',
        });
    });

    it('return  a type when parameter is an object literal', () => {
        type ObjS = {s: string};
        interface IntS {
            s: string;
        }
        class ClassS implements IntS {
            constructor(public s: string) {}
        }
        const handler = (a: ObjS, b: {s: string}, c: IntS, d: ClassS): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            a: 'ObjS',
            b: '{s : string}',
            c: 'IntS',
            d: 'ClassS',
        });
    });

    it('return  a type when when using generics', () => {
        type ObjectS = {
            s: string;
        };
        type ObjABC<A, B, C> = {
            a: A;
            b: B;
            c: C;
        };
        type ObjectA<A> = Omit<ObjABC<A, any, any>, 'b' | 'c'>;
        class ClassA<A> {
            constructor(public a: A) {}
        }
        const handler = (
            a: ObjectA<ObjectS>,
            b: ObjABC<ObjectS, number, boolean>,
            c: ObjABC<ObjectA<string>, number, boolean>,
            d: ObjABC<ObjectA<ObjectS>, number, boolean>,
            e: ClassA<number>,
        ): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            a: 'ObjectA<ObjectS>',
            b: 'ObjABC<ObjectS , number , boolean>',
            c: 'ObjABC<ObjectA<string> , number , boolean>',
            d: 'ObjABC<ObjectA<ObjectS> , number , boolean>',
            e: 'ClassA<number>',
        });
    });

    it('return  a type when parameter is an intersection', () => {
        type objS = {s: string};
        type objN = {n: number};
        type objB = {b: boolean};
        const handler = (a: objS & objN & objB): void => {
            a;
        };

        expect(parametersToSrcCode('', handler)).toEqual({
            a: '{s : string , n : number , b : boolean}',
        });
    });

    it('should sanitize non js names an enclose in double quotes', () => {
        const handler = (a: {'s/asd/"': string; "'asd+/dfc": boolean}): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            a: `{"s/asd/\\"" : string , "'asd+/dfc" : boolean}`,
        });
    });

    it('return  a type when parameter is an enum', () => {
        enum Letters {
            a,
            b,
            c,
        }
        const handler = (a: Letters): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            a: 'Letters',
        });
    });

    it('should return an unique type when parameter is a literal', () => {
        const handler = (letter: 'A' | 'B' | 'C', port: 8080 | 80 | 3000, bol: false | true): void => {};

        expect(parametersToSrcCode('', handler)).toEqual({
            letter: '("A" | "B" | "C")',
            port: '(8080 | 80 | 3000)',
            bol: '(false | true)',
        });
    });

    it('return  a type when return type is a promise', () => {
        const handler = async (): Promise<number> => 3;
        const handlerB = async (): Promise<{a: number; b: string}> => ({a: 3, b: 'b'});

        expect(returnToSrcCode('', handler)).toEqual('Promise<number>');
        expect(returnToSrcCode('', handlerB)).toEqual('Promise<{a : number , b : string}>');
    });

    it('throw and error when parameter type is not supported', () => {
        const handler = (a: Promise<number>): void => {};
        const handlerMethod = (a: (p1: any) => any): void => {};
        const handlerNever = (a: never): void => {};
        const handlerRest = (...args): void => {};

        expect(() => parametersToSrcCode('path1', handler)).toThrow("Invalid Handler in path1.a, parameters can't be promises");
        expect(() => parametersToSrcCode('path1', handlerMethod)).toThrow(
            "Invalid Handler in path1.a, Parameter can't be of type function.",
        );
        expect(() => parametersToSrcCode('path1', handlerNever)).toThrow(
            "Invalid Handler in path1.a, Parameter can't be of type never.",
        );
        expect(() => parametersToSrcCode('path1', handlerRest)).toThrow(
            "Invalid Handler in path1.args, Parameter can't be of type rest.",
        );
    });
});
