/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';
import {mockRegExpsList} from '../../mocking/constants.mock';

describe('jsonStringify compilation tests', () => {
    // Tests moved from various spec files under packages/run-types/src/runType/

    // Moved from packages/run-types/src/runType/atomic/string.spec.ts:34-40
    {
        const rt = runType<string>();

        it('json stringify', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = 'hello';
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/regexp.spec.ts:38-46
    {
        const rt = runType<RegExp>();

        it('json stringify regexp', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            mockRegExpsList.forEach((regexp) => {
                const typeValue = regexp;
                const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
                expect(roundTrip).toEqual(typeValue);
            });
        });
    }

    // Moved from packages/run-types/src/runType/atomic/bigInt.spec.ts:42-48
    {
        const rt = runType<bigint>();

        it('json stringify bigint', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = 1n;
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/boolean.spec.ts:41-47
    {
        const rt = runType<boolean>();

        it('json stringify boolean', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = true;
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/any.spec.ts:41-47
    {
        const rt = runType<any>();

        it('json stringify any', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = {a: 42, b: 'hello'};
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/null.spec.ts:41-47
    {
        const rt = runType<null>();

        it('json stringify null', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = null;
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/undefined.spec.ts:40-46
    {
        const rt = runType<undefined>();

        it('json stringify undefined', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = undefined;
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/number.spec.ts:39-45
    {
        const rt = runType<number>();

        it('json stringify number', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = 42;
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/date.spec.ts:31-37
    {
        const rt = runType<Date>();

        it('json stringify date', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = new Date();
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/enum.spec.ts:51-61
    {
        enum Color {
            Red = 'red',
            Green = 'green',
            Blue = 'blue',
        }
        const rt = runType<Color>();

        it('json stringify enum', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = Color.Red;
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);

            const typeValueG = Color.Green;
            const roundTripG = fromJsonVal(JSON.parse(jsonStringify(typeValueG)));
            expect(roundTripG).toEqual(typeValueG);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/symbol.spec.ts:42-48
    {
        const rt = runType<symbol>();

        it('json stringify symbol', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = Symbol('foo');
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip.toString()).toEqual(typeValue.toString());
        });
    }

    // Moved from packages/run-types/src/runType/atomic/object.spec.ts:45-51
    {
        const rt = runType<object>();

        it('json stringify object', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = {a: 42, b: 'hello'};
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/void.spec.ts:40-43
    {
        const rt = runType<void>();

        it('json stringify should return undefined', () => {
            const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
            expect(stringify(undefined)).toBe(undefined);
        });
    }

    // Moved from packages/run-types/src/runType/utility/required.spec.ts:61-69
    {
        interface MaybePerson {
            name?: string;
            age?: number;
            createdAt?: Date;
        }
        const rtRequired = runType<MaybePerson>();
        const rt = runType<Required<MaybePerson>>();
        const createdAt = new Date();
        const person = {name: 'John', age: 30, createdAt};
        const maybePerson = {createdAt};

        it('json stringify required', () => {
            const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const stringifyMaybe = rtRequired.createJitFunction(JitFunctions.jsonStringify);
            const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
            const decodeMaybe = rtRequired.createJitFunction(JitFunctions.fromJsonVal);

            expect(decode(JSON.parse(stringify(person)))).toEqual({name: 'John', age: 30, createdAt});
            expect(decodeMaybe(JSON.parse(stringifyMaybe(maybePerson)))).toEqual({createdAt});
        });
    }

    // Note: Test from packages/run-types/src/runType/utility/string.spec.ts:41-48 was skipped in original (describe.skip)

    // Moved from packages/run-types/src/runType/utility/extract.spec.ts:53-61
    {
        type PersonProp = 'name' | 'age' | 'createdAt';
        const rt = runType<PersonProp>();
        const rtExtract = runType<Extract<PersonProp, 'name' | 'createdAt'>>();
        const personProp: PersonProp = 'age';
        const excludeAge: Extract<PersonProp, 'name' | 'createdAt'> = 'name';

        it('json stringify extract atomic', () => {
            const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const stringifyExtract = rtExtract.createJitFunction(JitFunctions.jsonStringify);
            const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
            const decodeExtract = rtExtract.createJitFunction(JitFunctions.fromJsonVal);

            expect(decode(JSON.parse(stringify(personProp)))).toEqual(personProp);
            expect(decodeExtract(JSON.parse(stringifyExtract(excludeAge)))).toEqual(excludeAge);
        });
    }

    // Moved from packages/run-types/src/runType/utility/extract.spec.ts:120-128
    {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        const rt = runType<Shape>();
        const rtExtract = runType<Extract<Shape, ToExtract>>();
        const shape: Shape = {kind: 'circle', radius: 3};
        const excludeShape: Extract<Shape, ToExtract> = {
            kind: 'square',
            x: 5,
        };

        it('json stringify extract objects', () => {
            const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const stringifyExtract = rtExtract.createJitFunction(JitFunctions.jsonStringify);
            const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
            const decodeExtract = rtExtract.createJitFunction(JitFunctions.fromJsonVal);

            expect(decode(JSON.parse(stringify(shape)))).toEqual(shape);
            expect(decodeExtract(JSON.parse(stringifyExtract(excludeShape)))).toEqual(excludeShape);
        });
    }
});
