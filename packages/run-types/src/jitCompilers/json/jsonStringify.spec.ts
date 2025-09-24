/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType, reflectFunction} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';
import {mockRegExpsList} from '../../mocking/constants.mock';
import {FunctionRunType} from '../../runType/function/function';
import {jitUtils, DataOnly} from '@mionkit/core';

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

    // Function tests - error cases moved from packages/run-types/src/runType/function/function.spec.ts:72-74
    {
        type TestFunction = (a: number, b: boolean, c?: string) => Date;
        const rt = runType<TestFunction>();

        it('throw errors for jsonStringify on function type', () => {
            expect(() => rt.createJitFunction(JitFunctions.jsonStringify)).toThrow(
                `Compile function JsonStringify not supported, call compileParams or compileReturn instead.`
            );
        });
    }

    // Function parameters tests - moved from packages/run-types/src/runType/function/function.spec.ts:128-137
    {
        type TestFunction = (a: number, b: boolean, c?: string) => Date;
        const rt = runType<TestFunction>();

        it('json stringify parameters', () => {
            const jsonStringify = rt.createJitParamsFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitParamsFunction(JitFunctions.fromJsonVal);
            const typeValue = [3, true, 'hello'];
            const typeValue2 = [3, true];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
            expect(roundTrip).toEqual(typeValue);
            expect(roundTrip2).toEqual(typeValue2);
        });
    }

    // Function return tests - moved from packages/run-types/src/runType/function/function.spec.ts:235-241
    {
        type TestFunction = (a: number, b: boolean, c?: string) => Date;
        const rt = runType<TestFunction>();

        it('json stringify function return', () => {
            const jsonStringify = rt.createJitReturnFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitReturnFunction(JitFunctions.fromJsonVal);
            const returnValue = new Date();
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(returnValue)));
            expect(roundTrip).toEqual(returnValue);
        });
    }

    // Function with rest parameters - moved from packages/run-types/src/runType/function/function.spec.ts:339-348
    {
        type TestFunctionRest = (a: number, b: boolean, ...rest: Date[]) => Date;
        const rtRest = runType<TestFunctionRest>();

        it('stringify function with rest parameters', () => {
            const jsonStringify = rtRest.createJitParamsFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rtRest.createJitParamsFunction(JitFunctions.fromJsonVal);
            const typeValue = [3, true, new Date(), new Date()];
            const typeValue2 = [3, true];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
            expect(roundTrip).toEqual(typeValue);
            expect(roundTrip2).toEqual(typeValue2);
        });
    }

    // Circular references tests - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:71-83
    {
        type CircularObject = {
            name: string;
            child?: CircularObject;
        };
        const rtCircular = runType<CircularObject>();
        const c1: CircularObject = {name: 'hello', child: {name: 'world'}};

        it('should use JSON.stringify when there are circular references', () => {
            const jsonStringify = rtCircular.createJitFunction(JitFunctions.jsonStringify);
            const toJsonVal = rtCircular.createJitFunction(JitFunctions.toJsonVal);
            const fromJsonVal = rtCircular.createJitFunction(JitFunctions.fromJsonVal);

            const copy1 = structuredClone(c1);
            expect(fromJsonVal(JSON.parse(jsonStringify(toJsonVal(copy1))))).toEqual(c1);
        });
    }

    // Array tests - moved from packages/run-types/src/runType/member/array.spec.ts:60-70
    {
        const rt = runType<string[]>();

        it('json stringify array', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = ['hello', 'world'];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);

            const typeValue2 = [];
            const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
            expect(roundTrip2).toEqual(typeValue2);
        });
    }

    // Tuple tests - moved from packages/run-types/src/runType/collection/tuple.spec.ts:129-135
    {
        type TestTuple = [Date, number, string, null, string[], bigint];
        const rt = runType<TestTuple>();

        it('json stringify tuple', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Interface tests - moved from packages/run-types/src/runType/collection/interface.spec.ts:213-226
    {
        interface TestInterface {
            startDate: Date;
            quantity: number;
            name: string;
            nullValue: null;
            stringArray: string[];
            bigInt: bigint;
            "weird prop name \n?>'\\\t\r": string;
            optionalString?: string;
        }
        const rt = runType<TestInterface>();

        it('json stringify interface', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = {
                startDate: new Date(),
                quantity: 123,
                name: 'hello',
                nullValue: null,
                stringArray: ['a', 'b', 'c'],
                bigInt: BigInt(123),
                "weird prop name \n?>'\\\t\r": 'hello2',
            };
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Union tests - moved from packages/run-types/src/runType/collection/union.spec.ts:78-87
    {
        type AtomicUnion = Date | number | string | null | bigint;
        const rt = runType<AtomicUnion>();
        const a: AtomicUnion = new Date();
        const b: AtomicUnion = 123;
        const c: AtomicUnion = 'hello';
        const d: AtomicUnion = null;
        const e: AtomicUnion = 3n;

        it('json stringify union', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            expect(fromJsonVal(JSON.parse(jsonStringify(a)))).toEqual(a);
            expect(fromJsonVal(JSON.parse(jsonStringify(b)))).toEqual(b);
            expect(fromJsonVal(JSON.parse(jsonStringify(c)))).toEqual(c);
            expect(fromJsonVal(JSON.parse(jsonStringify(d)))).toEqual(d);
            expect(fromJsonVal(JSON.parse(jsonStringify(e)))).toEqual(e);
        });
    }

    // Function required parameters test - moved from packages/run-types/src/runType/function/function.spec.ts:128-138
    {
        type TestFunction2 = (a: Date, b?: boolean) => bigint;
        const rt2 = runType<TestFunction2>();

        it('json stringify required parameters', () => {
            const jsonStringify = rt2.createJitParamsFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt2.createJitParamsFunction(JitFunctions.fromJsonVal);
            const d = new Date();
            const typeValue = [d, true];
            const typeValue2 = [d];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
            expect(roundTrip).toEqual(typeValue);
            expect(roundTrip2).toEqual(typeValue2);
        });
    }

    // Function required return test - moved from packages/run-types/src/runType/function/function.spec.ts:226-232
    {
        type TestFunction2 = (a: Date, b?: boolean) => bigint;
        const rt2 = runType<TestFunction2>();

        it('json stringify required function return', () => {
            const jsonStringify = rt2.createJitReturnFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt2.createJitReturnFunction(JitFunctions.fromJsonVal);
            const returnValue = 1n;
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(returnValue)));
            expect(roundTrip).toEqual(returnValue);
        });
    }

    // Function with only rest parameters test - moved from packages/run-types/src/runType/function/function.spec.ts:324-333
    {
        type TestFunctionRest2 = (...rest: number[]) => Date;
        const rtRest2 = runType<TestFunctionRest2>();

        it('stringify function with only rest parameters', () => {
            const jsonStringify = rtRest2.createJitParamsFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rtRest2.createJitParamsFunction(JitFunctions.fromJsonVal);
            const typeValue = [3, 2, 1];
            const typeValue2: number[] = [];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            const roundTrip3 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
            expect(roundTrip).toEqual(typeValue);
            expect(roundTrip3).toEqual(typeValue2);
        });
    }

    // Function non serializable types test - moved from packages/run-types/src/runType/function/function.spec.ts:165-174
    {
        type TestFunctionWithFN = (a: number, b: boolean, c?: () => null) => Date;
        const rtWithFN = runType<TestFunctionWithFN>();

        it('json stringify non serializable types', () => {
            const jsonStringify = rtWithFN.createJitParamsFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rtWithFN.createJitParamsFunction(JitFunctions.fromJsonVal);
            const typeValue = [3, true, () => null];
            const typeValue2 = [3, true, undefined];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
            expect(roundTrip).toEqual([3, true, undefined]);
            expect(roundTrip2).toEqual([3, true, undefined]);
        });
    }

    // Function promise return type test - moved from packages/run-types/src/runType/function/function.spec.ts:217-232
    {
        it(`if function's return type is a promise then return type should be the promise's resolvedType`, () => {
            const fn = (a: number, b: boolean, c?: string): Promise<Date> => Promise.resolve(new Date());
            const reflectedType = reflectFunction(fn);
            expect(reflectedType instanceof FunctionRunType).toBe(true);

            const validateReturn = reflectedType.createJitReturnFunction(JitFunctions.isType);
            const typeErrorsReturn = reflectedType.createJitReturnFunction(JitFunctions.typeErrors);
            const toJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.toJsonVal);
            const fromJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.fromJsonVal);
            const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFunctions.jsonStringify);
            const returnValue = new Date();
            expect(validateReturn(returnValue)).toBe(true);
            expect(typeErrorsReturn(returnValue)).toEqual([]);
            expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
            expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
        });
    }

    // Function return type is function test - moved from packages/run-types/src/runType/function/function.spec.ts:219-236
    {
        it(`if function's return type is a function then return type should be the function's return type`, () => {
            const fn =
                (a: number, b: boolean, c?: string): (() => Date) =>
                () =>
                    new Date();
            const reflectedType = reflectFunction(fn);

            const validateReturn = reflectedType.createJitReturnFunction(JitFunctions.isType);
            const typeErrorsReturn = reflectedType.createJitReturnFunction(JitFunctions.typeErrors);
            const toJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.toJsonVal);
            const fromJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.fromJsonVal);
            const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFunctions.jsonStringify);
            const returnValue = new Date();
            expect(validateReturn(returnValue)).toBe(true);
            expect(typeErrorsReturn(returnValue)).toEqual([]);
            expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
            expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
        });
    }

    // Function reflectFunction general test - moved from packages/run-types/src/runType/function/function.spec.ts:271-297
    {
        it('should get runType from a function using reflectFunction', () => {
            const fn = (a: number, b: boolean, c?: string): Date => new Date();
            const reflectedType = reflectFunction(fn);
            expect(reflectedType instanceof FunctionRunType).toBe(true);

            const validate = reflectedType.createJitParamsFunction(JitFunctions.isType);
            const typeErrors = reflectedType.createJitParamsFunction(JitFunctions.typeErrors);
            const toJsonVal = reflectedType.createJitParamsFunction(JitFunctions.toJsonVal);
            const fromJsonVal = reflectedType.createJitParamsFunction(JitFunctions.fromJsonVal);
            const jsonStringify = reflectedType.createJitParamsFunction(JitFunctions.jsonStringify);
            const paramsValues = [3, true, 'hello'];
            expect(validate(paramsValues)).toBe(true);
            expect(typeErrors(paramsValues)).toEqual([]);
            expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal([3, true, 'hello']))))).toEqual(paramsValues);
            expect(fromJsonVal(JSON.parse(jsonStringify([3, true, 'hello'])))).toEqual(paramsValues);

            const validateReturn = reflectedType.createJitReturnFunction(JitFunctions.isType);
            const typeErrorsReturn = reflectedType.createJitReturnFunction(JitFunctions.typeErrors);
            const toJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.toJsonVal);
            const fromJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.fromJsonVal);
            const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFunctions.jsonStringify);
            const returnValue = new Date();
            expect(validateReturn(returnValue)).toBe(true);
            expect(typeErrorsReturn(returnValue)).toEqual([]);
            expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
            expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
        });
    }

    // Function createJitParamsFunction json stringify test - moved from packages/run-types/src/runType/function/function.spec.ts:351-356
    {
        const rt = runType<(a: number, b: boolean, c?: string) => Date>();

        it('createJitParamsFunction json stringify', () => {
            const jsonStringify = rt.createJitParamsFunction(JitFunctions.jsonStringify, {paramsSlice: {start: 1}});
            const fromJsonVal = rt.createJitParamsFunction(JitFunctions.fromJsonVal, {paramsSlice: {start: 1}});
            const paramsValues = [true, 'hello'];
            expect(fromJsonVal(JSON.parse(jsonStringify(paramsValues)))).toEqual(paramsValues);
        });
    }

    // Class json stringify test - moved from packages/run-types/src/runType/collection/class.spec.ts:79-90
    {
        class MySerializableClass {
            name: string;
            surname: string;
            id: number;
            startDate: Date;
            constructor() {
                this.name = 'John';
                this.surname = 'Doe';
                this.id = 0;
                this.startDate = new Date();
            }

            getConstructorParams(): [] {
                return [];
            }

            getFullName() {
                return `${this.name} ${this.surname}`;
            }
        }

        const serializable = new MySerializableClass();
        const rt = runType<MySerializableClass>();

        it('json stringify class', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            // restored object has the properties of the original object but is not a class instance
            const restored = JSON.parse(jsonStringify(serializable));
            // TODO: decide if we want to include methods in the serialization
            expect(restored).toEqual({
                name: serializable.name,
                surname: serializable.surname,
                id: serializable.id,
                startDate: serializable.startDate.toJSON(),
            });
        });
    }

    // Class serializable restoration test - moved from packages/run-types/src/runType/collection/class.spec.ts:87-94
    {
        class MySerializableClass {
            name: string;
            surname: string;
            id: number;
            startDate: Date;
            constructor() {
                this.name = 'John';
                this.surname = 'Doe';
                this.id = 0;
                this.startDate = new Date();
            }

            getConstructorParams(): [] {
                return [];
            }

            getFullName() {
                return `${this.name} ${this.surname}`;
            }
        }

        const serializable = new MySerializableClass();
        const rt = runType<MySerializableClass>();

        it('serializable class can be restored after they are registered', async () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            expect(() => rt.createJitFunction(JitFunctions.fromJsonVal)).toThrow();
            jitUtils.setSerializableClass(MySerializableClass);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const restored = fromJsonVal(JSON.parse(jsonStringify(serializable)));
            expect(restored instanceof MySerializableClass).toBeTruthy();
        });
    }

    // Class deserialize function test - moved from packages/run-types/src/runType/collection/class.spec.ts:89-104
    {
        class MySerializableClass {
            name: string;
            surname: string;
            id: number;
            startDate: Date;
            constructor() {
                this.name = 'John';
                this.surname = 'Doe';
                this.id = 0;
                this.startDate = new Date();
            }

            getConstructorParams(): [] {
                return [];
            }

            getFullName() {
                return `${this.name} ${this.surname}`;
            }
        }

        class NonSerializableClass {
            constructor(
                public name: string,
                public surname: string,
                public id: number,
                public startDate: Date
            ) {}

            getFullName() {
                return `${this.name} ${this.surname}`;
            }
        }

        const serializable = new MySerializableClass();
        const rt = runType<MySerializableClass>();
        const rtNonS = runType<NonSerializableClass>();

        it('classes can be deserialized suing a deserialize function', () => {
            const nonSerializable = new NonSerializableClass('John', 'Doe', 0, new Date());
            const jsonStringify = rtNonS.createJitFunction(JitFunctions.jsonStringify);
            expect(() => rtNonS.createJitFunction(JitFunctions.fromJsonVal)).toThrow();
            jitUtils.setDeserializeFn(NonSerializableClass, (deserialized: DataOnly<NonSerializableClass>) => {
                const instance = new NonSerializableClass(
                    deserialized.name,
                    deserialized.surname,
                    deserialized.id,
                    deserialized.startDate
                );
                return instance;
            });
            const fromJsonVal = rtNonS.createJitFunction(JitFunctions.fromJsonVal);
            const restored = fromJsonVal(JSON.parse(jsonStringify(nonSerializable)));
            expect(restored instanceof NonSerializableClass).toBeTruthy();
        });
    }

    // Extended class json stringify test - moved from packages/run-types/src/runType/collection/class.spec.ts:135-143
    {
        class BaseClass {
            baseProp: string = 'base'; // properties must be all strongly typed otherwise types wont appear in the jit code
        }
        class ExtendedClass extends BaseClass {
            // TODO: build eslint rule that enforces all properties to be strongly typed
            extendedProp: string = 'extended'; // properties must be all strongly typed otherwise types wont appear in the jit code
        }
        const rtExtended = runType<ExtendedClass>();
        const extended = new ExtendedClass();

        it('json stringify extended class', () => {
            const jsonStringify = rtExtended.createJitFunction(JitFunctions.jsonStringify);
            // restored object has the properties of the original object but is not a class instance
            const restored = JSON.parse(jsonStringify(extended));
            expect(restored).toEqual({
                baseProp: extended.baseProp,
                extendedProp: extended.extendedProp,
            });
        });
    }

    // Circular array union json stringify test - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:130-141
    {
        type CuArray = (CuArray | Date | number | string)[];
        const rt = runType<CuArray>();
        const date = new Date();
        const cu1: CuArray = [date, 123, 'hello', ['a', 'b', 'c']];
        const cu2: CuArray = [date, 123, 'hello', ['a', 2, 'c'], cu1];
        const cu3: CuArray = [];

        it('json stringify CircularUnion array with discriminator', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copy1: CuArray = [date, 123, 'hello', ['a', 'b', 'c']];
            const copy2: CuArray = [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]];
            const copy3: CuArray = [];

            expect(fromJsonVal(JSON.parse(jsonStringify(copy1))).length).toEqual(cu1.length);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy2))).length).toEqual(cu2.length);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy3))).length).toEqual(cu3.length);
        });
    }

    // Circular tuple json stringify test - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:199-210
    {
        interface CircularTuple {
            tuple: [bigint, CircularTuple?];
        }
        const rt = runType<CircularTuple>();
        const c1: CircularTuple = {tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]};
        const c2: CircularTuple = {tuple: [1n, {tuple: [2n]}]};
        const c3: CircularTuple = {tuple: [1n]};

        it('json stringify CircularTuple object with discriminator', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copy1: CircularTuple = {tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]};
            const copy2: CircularTuple = {tuple: [1n, {tuple: [2n]}]};
            const copy3: CircularTuple = {tuple: [1n]};

            expect(fromJsonVal(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy3)))).toEqual(c3);
        });
    }

    // Circular index json stringify test - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:265-276
    {
        interface CircularIndex {
            index: {[key: string]: CircularIndex};
        }
        const rt = runType<CircularIndex>();
        const c1: CircularIndex = {index: {a: {index: {b: {index: {}}}}}};
        const c2: CircularIndex = {index: {a: {index: {}}}};
        const c3: CircularIndex = {index: {}};

        it('json stringify CircularIndex object with discriminator', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copy1: CircularIndex = {index: {a: {index: {b: {index: {}}}}}};
            const copy2: CircularIndex = {index: {a: {index: {}}}};
            const copy3: CircularIndex = {index: {}};

            expect(fromJsonVal(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy3)))).toEqual(c3);
        });
    }

    // Circular deep json stringify test - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:333-342
    {
        interface CircularDeep {
            deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        const rt = runType<CircularDeep>();
        const c1: CircularDeep = {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}};
        const c2: CircularDeep = {deep1: {deep2: {deep3: {}}}};

        it('json stringify CircularDeep object with discriminator', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copy1: CircularDeep = {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}};
            const copy2: CircularDeep = {deep1: {deep2: {deep3: {}}}};

            expect(fromJsonVal(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
        });
    }

    // Union array json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:182-201
    {
        type UnionArr = string[] | number[] | boolean[] | Date[];
        const date1 = new Date();
        const arrA: UnionArr = ['a', 'b', 'c'];
        const arrB: UnionArr = [1, 2, 3];
        const arrC: UnionArr = [true, false, true];
        const arrD: UnionArr = [];
        const rt = runType<UnionArr>();

        it('json stringify union array', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copyA = structuredClone(arrA);
            const copyB = structuredClone(arrB);
            const copyC = structuredClone(arrC);
            const copyD = structuredClone(arrD);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyA)))).toEqual(arrA);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyB)))).toEqual(arrB);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyC)))).toEqual(arrC);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyD)))).toEqual(arrD);

            // ensure code for items that do not
            const stringifyCode = jsonStringify.toString();
            expect(stringifyCode).not.toContain('[0,');
            expect(stringifyCode).not.toContain('[1,');
            expect(stringifyCode).not.toContain('[2,');
            expect(stringifyCode).toContain('[3,'); // date must be encoded to tuple [index, type]
        });
    }

    // Array with union types json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:262-283
    {
        type ArrUnion = (string | bigint | boolean | Date)[];
        const date = new Date();
        const arrA: ArrUnion = ['a', 'b', 'c'];
        const arrB: ArrUnion = [1n, 2n, 3n];
        const arrC: ArrUnion = [true, false, true];
        const arrD: ArrUnion = [1n, 'b', date];
        const rt = runType<ArrUnion>();

        it('json stringify with discriminator', () => {
            // this should be serialized as [discriminatorIndex, value]
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copyA = structuredClone(arrA);
            const copyB = structuredClone(arrB);
            const copyC = structuredClone(arrC);
            const copyD = [1n, 'b', date]; // dates cant be cloned properly

            expect(fromJsonVal(JSON.parse(jsonStringify(copyA)))).toEqual(arrA);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyB)))).toEqual(arrB);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyC)))).toEqual(arrC);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyD)))).toEqual(arrD);

            // ensure code for items that do not need stringify to tuple is not emitted [index, type]
            const stringifyCode = jsonStringify.toString();
            expect(stringifyCode).not.toContain('[0,');
            expect(stringifyCode).toContain('[1,'); // bigint must be encoded to tuple [index, type]
            expect(stringifyCode).not.toContain('[2,');
            expect(stringifyCode).toContain('[3,'); // date must be encoded to tuple [index, type]
        });
    }

    // Union object json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:354-370
    {
        type UnionObj = {a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string};
        const objA: UnionObj = {a: 'hello', b: 123, c: 1n}; // unlike typescript we don't allow mix of properties in the union
        const objB: UnionObj = {a: 'world', aa: true};
        const objC: UnionObj = {c: 1n};
        const objD: UnionObj = {d: 'hello'};
        const objE: UnionObj = {};
        const rt = runType<UnionObj>();

        it('json stringify union object with discriminator', () => {
            // this should be serialized as [discriminatorIndex, value]
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copyA = structuredClone(objA);
            const copyB = structuredClone(objB);
            const copyC = structuredClone(objC);
            const copyD = structuredClone(objD);
            const copyE = structuredClone(objE);

            expect(() => jsonStringify(copyA)).toThrow(); // mion throws an error for mixed properties in the union
            expect(fromJsonVal(JSON.parse(jsonStringify(copyB)))).toEqual(objB);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyC)))).toEqual(objC);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyD)))).toEqual(objD);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyE)))).toEqual(objE);
        });
    }

    // Union with discriminator property json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:499-514
    {
        type UnionDisc =
            | {otherProp: boolean; type: 'a'}
            | {otherProp: number; type: 'b'}
            | {otherProp: string; type: 'c'; time: Date}
            | {type: boolean; otherProp: string};
        const objA: UnionDisc = {type: 'a', otherProp: true};
        const objB: UnionDisc = {type: 'b', otherProp: 123};
        const objC: UnionDisc = {type: 'c', otherProp: 'hello', time: new Date()};
        const objD: UnionDisc = {type: true, otherProp: 'typeD'};
        const rt = runType<UnionDisc>();

        it('json stringify union with discriminator property', () => {
            // this should be serialized as [discriminatorIndex, value]
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copyA = structuredClone(objA);
            const copyB = structuredClone(objB);
            // cant use structuredClone for dates: https://stackoverflow.com/questions/76664834/structuredclone-not-keeping-date-type
            const copyC = {...objC, time: new Date(objC.time.getTime())};
            const copyD = structuredClone(objD);

            expect(fromJsonVal(JSON.parse(jsonStringify(copyA)))).toEqual(objA);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyB)))).toEqual(objB);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyC)))).toEqual(objC);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyD)))).toEqual(objD);
        });
    }

    // Union mixed json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:577-584
    {
        type UnionMix = string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'};
        const mixA: UnionMix = ['a', 'b', 'c'];
        const mixB: UnionMix = {a: 'hello', aa: true};
        const rt = runType<UnionMix>();

        it('json stringify union mixed with discriminator', () => {
            // this should be serialized as [discriminatorIndex, value]
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            expect(fromJsonVal(JSON.parse(jsonStringify(mixA)))).toEqual(mixA);
            expect(fromJsonVal(JSON.parse(jsonStringify(mixB)))).toEqual(mixB);
        });
    }

    // Union mixed with index property json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:657-669
    {
        type UnionIndex =
            | string[]
            | {a: string; aa: boolean}
            | {b: number}
            | {a: string; [key: string]: string}
            | {[key: string]: bigint; b: bigint};
        const indexA: UnionIndex = ['a', 'b', 'c'];
        const indexB: UnionIndex = {a: 'hello', aa: true};
        const indexD: UnionIndex = {b: 1n, c: 2n};
        const rt = runType<UnionIndex>();

        it('json stringify union index property with discriminator', () => {
            // this should be serialized as [discriminatorIndex, value]
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copyA = structuredClone(indexA);
            const copyB = structuredClone(indexB);
            const copyD = structuredClone(indexD);

            expect(fromJsonVal(JSON.parse(jsonStringify(copyA)))).toEqual(indexA);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyB)))).toEqual(indexB);
            expect(fromJsonVal(JSON.parse(jsonStringify(copyD)))).toEqual(indexD);
        });
    }

    // Union circular json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:742-759
    {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const date = new Date();

        const mockData = () => {
            const d: UnionC = new Date(date.getTime());
            const n: UnionC = 123;
            const s: UnionC = 'hello';
            const recA: UnionC = {a: {a: {}}};
            const o1: UnionC = {};
            const a: UnionC = [];
            const a2: UnionC = [[]];
            const arrRec0: UnionC = [123, 3, {b: 'hello'}];
            const arrRec1: UnionC = [123, 3, 'hello'];
            const arrRec2: UnionC = [[123], 3, [3, 'hello']];

            const notA = true;
            const notB = {c: 'hello'}; // note existing properties are not allowed in the union
            const notC = {a: true}; // properties of the union must be of the correct type
            return {d, n, s, recA, o1, a, a2, arrRec0, arrRec1, arrRec2, notA, notB, notC};
        };
        const {d, n, s, recA, o1, a, a2, arrRec0, arrRec1, arrRec2, notA, notB, notC} = mockData();
        const rt = runType<UnionC>();

        it('json stringify Circular Union with discriminator', () => {
            // this should be serialized as [discriminatorIndex, value]
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const copy = mockData();

            expect(fromJsonVal(JSON.parse(jsonStringify(copy.d)))).toEqual(d);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.n)))).toEqual(n);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.s)))).toEqual(s);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.recA)))).toEqual(recA);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.o1)))).toEqual(o1);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.a)))).toEqual(a);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.a2)))).toEqual(a2);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.arrRec0)))).toEqual(arrRec0);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.arrRec1)))).toEqual(arrRec1);
            expect(fromJsonVal(JSON.parse(jsonStringify(copy.arrRec2)))).toEqual(arrRec2);
        });
    }

    // Union with methods json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:852-868
    {
        // unions use strict check to identify the objects in the union,
        // but we want to ignore methods an other non serializable properties, so those does not make the object invalid

        // Test union with objects that have methods - methods should be ignored during validation
        type UnionWithMethods =
            | {name: string; getName(): string}
            | {age: number; getAge(): number}
            | {active: boolean; isActive(): boolean};

        // Create test objects with methods - cast to specific types to avoid TypeScript errors
        const objWithName = {
            name: 'John',
            getName() {
                return 'John';
            },
        } as {name: string; getName(): string};

        const objWithAge = {
            age: 25,
            getAge() {
                return 25;
            },
        } as {age: number; getAge(): number};

        const objWithActive = {
            active: true,
            isActive() {
                return true;
            },
        } as {active: boolean; isActive(): boolean};

        const rt = runType<UnionWithMethods>();

        it('json stringify union with methods - methods should be excluded', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

            const stringifiedName = jsonStringify(objWithName);
            const stringifiedAge = jsonStringify(objWithAge);
            const stringifiedActive = jsonStringify(objWithActive);

            const parsedName = fromJsonVal(JSON.parse(stringifiedName));
            const parsedAge = fromJsonVal(JSON.parse(stringifiedAge));
            const parsedActive = fromJsonVal(JSON.parse(stringifiedActive));

            // Parsed objects should only have data properties, not methods
            expect(parsedName).toEqual({name: 'John'});
            expect(parsedAge).toEqual({age: 25});
            expect(parsedActive).toEqual({active: true});
        });
    }

    // Tuple with optional params json stringify test - moved from packages/run-types/src/runType/collection/tuple.spec.ts:131-140
    {
        type TupleWithOptionals = [number, bigint?, boolean?, number?];

        it('json stringify tuple with optional params', () => {
            const jsonStringify = runType<TupleWithOptionals>().createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = runType<TupleWithOptionals>().createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = [3, undefined, true, 4];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
            const typeValue2 = [3];
            const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
            expect(roundTrip2).toEqual([3]);
        });
    }

    // Tuple circular json stringify test - moved from packages/run-types/src/runType/collection/tuple.spec.ts:206-214
    {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const rt = runType<TupleCircular>();

        it('json stringify tuple circular', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const tDeep: TupleCircular = [new Date(), 456, 'world', null, ['x', 'y', 'z'], BigInt(456)];
            const typeValue: TupleCircular = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), tDeep];

            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Tuple rest parameter json stringify test - moved from packages/run-types/src/runType/collection/tuple.spec.ts:261-267
    {
        type TupleRest = [number, ...string[]];
        const rt = runType<TupleRest>();

        it('json stringify tuple rest parameter', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue: TupleRest = [3, 'a', 'b', 'c'];
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Interface optional properties json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:215-233
    {
        it('json stringify must set optional properties first in order to work properly', () => {
            type Obj1 = {
                a: string;
                b?: string;
            };
            const rtObj1 = runType<Obj1>();
            const jsonStringify = rtObj1.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rtObj1.createJitFunction(JitFunctions.fromJsonVal);

            const typeValue: Obj1 = {a: 'helloA', b: 'helloB'};
            const json = jsonStringify(typeValue);
            expect(json).toEqual(`{"b":"helloB","a":"helloA"}`);
            expect(fromJsonVal(JSON.parse(json))).toEqual(typeValue);

            const typeValue2: Obj1 = {a: 'helloA'};
            const json2 = jsonStringify(typeValue2);
            expect(json2).toEqual(`{"a":"helloA"}`);
            expect(fromJsonVal(JSON.parse(json2))).toEqual(typeValue2);
        });
    }

    // PROGRESS TRACKER: Tests moved so far: 53 tests
    //
    // ✅ COMPLETED FILES (all jsonStringify tests moved):
    // - packages/run-types/src/runType/atomic/* (all atomic types: string, regexp, bigint, boolean, any, null, undefined, number, date, enum, symbol, object, void)
    // - packages/run-types/src/runType/utility/* (required, extract)
    // - packages/run-types/src/runType/function/function.spec.ts (ALL 8 jsonStringify tests moved)
    // - packages/run-types/src/runType/collection/class.spec.ts (ALL 4 jsonStringify tests moved)
    // - packages/run-types/src/runType/collection/circularRefs.spec.ts (ALL 5 jsonStringify tests moved)
    // - packages/run-types/src/runType/collection/union.spec.ts (ALL 8 jsonStringify tests moved)
    // - packages/run-types/src/runType/collection/tuple.spec.ts (ALL 3 jsonStringify tests moved)
    //
    // 🔄 IN PROGRESS:
    // - packages/run-types/src/runType/collection/interface.spec.ts (0 of ~2 jsonStringify tests moved)
    //
    // ⏳ PENDING FILES (still have jsonStringify tests to move):
    // - packages/run-types/src/runType/collection/interface.spec.ts (~2 more jsonStringify tests)
    // - packages/run-types/src/runType/member/array.spec.ts (~2 more jsonStringify tests)
    // - packages/run-types/src/runType/member/indexProperty.spec.ts (~2 jsonStringify tests)
    // - packages/run-types/src/runType/member/callSignature.spec.ts (~1 jsonStringify test)
    // - packages/run-types/src/runType/native/set.spec.ts (~2 jsonStringify tests)
    // - packages/run-types/src/runType/native/map.spec.ts (~2 jsonStringify tests)
    // - packages/run-types/src/runType/native/promise.spec.ts (~1 jsonStringify error test)
    // - packages/run-types/src/runType/native/nonSerializable.spec.ts (~1 jsonStringify error test)
});
