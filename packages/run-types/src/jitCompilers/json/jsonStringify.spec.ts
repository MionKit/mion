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

    // Note: Many more tests exist in the original files but are not moved to keep this file manageable.
    // Original files with jsonStringify tests include:
    // - packages/run-types/src/runType/function/function.spec.ts (many more function-related tests)
    // - packages/run-types/src/runType/collection/circularRefs.spec.ts (more circular reference tests)
    // - packages/run-types/src/runType/collection/union.spec.ts (many more union tests)
    // - packages/run-types/src/runType/collection/tuple.spec.ts (more tuple tests)
    // - packages/run-types/src/runType/collection/interface.spec.ts (many more interface tests)
    // - packages/run-types/src/runType/collection/class.spec.ts (class serialization tests)
    // - packages/run-types/src/runType/member/array.spec.ts (more array tests)
    // - packages/run-types/src/runType/member/indexProperty.spec.ts (index property tests)
    // - packages/run-types/src/runType/member/callSignature.spec.ts (call signature tests)
    // - packages/run-types/src/runType/native/set.spec.ts (Set serialization tests)
    // - packages/run-types/src/runType/native/map.spec.ts (Map serialization tests)
    // - packages/run-types/src/runType/native/promise.spec.ts (Promise error tests)
    // - packages/run-types/src/runType/native/nonSerializable.spec.ts (error tests)
});
