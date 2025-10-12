/* eslint-disable */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitUtils, DataOnly} from '@mionkit/core';
import {runType, reflectFunction} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';
import {InterfaceRunType} from '../../runType/collection/interface';
import {mockRegExpsList} from '../../mocking/constants.mock';
import {FunctionRunType} from '../../runType/function/function';

function cloneSet<T>(set: Set<T>): Set<T> {
    const copyValues = Array.from(set.values()).map((v) => structuredClone(v));
    return new Set(copyValues);
}

function cloneMap<K, V>(map: Map<K, V>): Map<K, V> {
    const copyEntries = Array.from(map.entries()).map(([k, v]) => [structuredClone(k), structuredClone(v)] as [K, V]);
    return new Map(copyEntries);
}

describe('atomic', () => {
    // Moved from packages/run-types/src/runType/atomic/string.spec.ts:34-40
    it('string', () => {
        const rt = runType<string>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = 'hello';
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/number.spec.ts:39-45
    it('number', () => {
        const rt = runType<number>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = 42;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/regexp.spec.ts:38-46
    it('regexp', () => {
        const rt = runType<RegExp>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        mockRegExpsList.forEach((regexp) => {
            const typeValue = regexp;
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    });

    // Moved from packages/run-types/src/runType/atomic/bigInt.spec.ts:42-48
    it('bigint', () => {
        const rt = runType<bigint>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = 1n;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/boolean.spec.ts:41-47
    it('boolean', () => {
        const rt = runType<boolean>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = true;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/any.spec.ts:41-47
    it('any', () => {
        const rt = runType<any>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = {a: 42, b: 'hello'};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/null.spec.ts:41-47
    it('null', () => {
        const rt = runType<null>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = null;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/undefined.spec.ts:40-46
    it('undefined', () => {
        const rt = runType<undefined>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = undefined;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/date.spec.ts:31-37
    it('date', () => {
        const rt = runType<Date>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = new Date();
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/enum.spec.ts:51-61
    it('enum', () => {
        enum Color {
            Red = 'red',
            Green = 'green',
            Blue = 'blue',
        }
        const rt = runType<Color>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = Color.Red;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValueG = Color.Green;
        const roundTripG = fromJsonVal(JSON.parse(jsonStringify(typeValueG)));
        expect(roundTripG).toEqual(typeValueG);
    });

    // Moved from packages/run-types/src/runType/atomic/symbol.spec.ts:42-48
    it('symbol', () => {
        const rt = runType<symbol>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = Symbol('foo');
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip.toString()).toEqual(typeValue.toString());
    });

    // Moved from packages/run-types/src/runType/atomic/object.spec.ts:45-51
    it('object', () => {
        const rt = runType<object>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = {a: 42, b: 'hello'};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Moved from packages/run-types/src/runType/atomic/void.spec.ts:40-43
    it('void', () => {
        const rt = runType<void>();
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        expect(stringify(undefined)).toBe(undefined);
    });
});

describe('arrays', () => {
    // Array tests - moved from packages/run-types/src/runType/member/array.spec.ts:60-70
    it('array', () => {
        const rt = runType<string[]>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = ['hello', 'world'];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = [] as string[];
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    // Array multi-dimensional json stringify test - moved from packages/run-types/src/runType/member/array.spec.ts:120-130
    it('multi dimensional array', () => {
        const rt = runType<string[][]>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = [['hello', 'world'], ['a', 'b'], []];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = [];
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    // Array strip extra params json stringify test - moved from packages/run-types/src/runType/member/array.spec.ts:365-379
    it('array to strip extra params without fail', () => {
        type ObjectType = {
            a: string;
            deep?: {
                b: string;
                c: number;
            };
            d?: ObjectType[];
        };

        const obj: ObjectType = {
            a: 'hello',
            deep: {
                b: 'world',
                c: 123,
            },
            d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
        };

        const objWithExtra = structuredClone(obj) as any;
        objWithExtra.extraA = 'extraA';

        const rt = runType<ObjectType>();
        // json stringify automatically strips unknown keys
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const jsonString = jsonStringify(objWithExtra);
        const roundTrip = fromJsonVal(JSON.parse(jsonString));
        expect(roundTrip).toEqual({
            a: 'hello',
            deep: {
                b: 'world',
                c: 123,
            },
            d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
        });
    });

    // Array circular json stringify test - moved from packages/run-types/src/runType/member/array.spec.ts:414-427
    it('array circular', () => {
        // this type is not really useful as only allows empty array
        // but it is the only valid test for circular references in the array runType
        // other more common circular array involves unions and are tested there i.e: types CS = (CS | string)[]
        type CircularArray = CircularArray[];
        const rt = runType<CircularArray>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const arr: CircularArray = [];
        arr.push([]);
        arr[0].push([]);
        arr[0][0].push([]);
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(arr)));
        expect(roundTrip).toEqual(arr);

        const arr2: CircularArray = [];
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(arr2)));
        expect(roundTrip2).toEqual(arr2);
    });

    // Index property json stringify test - moved from packages/run-types/src/runType/member/indexProperty.spec.ts:100-110
    it('index property', () => {
        interface IndexString {
            [key: string]: string;
        }
        const rt = runType<IndexString>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = {key1: 'value1', key2: 'value2'};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = {};
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    // Index property with extra props json stringify test - moved from packages/run-types/src/runType/member/indexProperty.spec.ts:102-113
    it('index property with extra props', () => {
        type IndexWithExtraProps = {
            a: string;
            b: number;
            [key: string]: string | number;
        };
        const rtExtra = runType<IndexWithExtraProps>();
        const jsonStringify = rtExtra.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtExtra.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue: IndexWithExtraProps = {
            key1: 'value1',
            key2: 'value2',
            a: 'extra1',
            b: 123,
        };
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Index property nested json stringify tests - moved from packages/run-types/src/runType/member/indexProperty.spec.ts:200-214
    it('index property nested', () => {
        const rtNested = runType<{[key: string]: {[key: string]: number}}>();
        const jsonStringify = rtNested.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtNested.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('index property nested date', () => {
        const rtNested2 = runType<{[key: string]: {[key: string]: Date}}>();
        const jsonStringify = rtNested2.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtNested2.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {key1: {nestedKey1: new Date(), nestedKey2: new Date()}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    // Index property non-root json stringify test - moved from packages/run-types/src/runType/member/indexProperty.spec.ts:251-258
    it('index property non-root', () => {
        interface Obj1 {
            a: string;
            [key: string]: string;
        }

        interface Obj2 {
            b: string;
            c: Obj1;
        }

        const rt = runType<Obj2>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {b: 'hello', c: {a: 'world', c: 'world'}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    // Call signature return json stringify test - moved from packages/run-types/src/runType/member/callSignature.spec.ts:161-168
    it('call signature return', () => {
        type CallSignatureType = {
            (a: number, b: boolean): string;
        };
        const rt = runType<CallSignatureType>() as InterfaceRunType;
        const jsonStringify = rt.getCallSignature()!.createJitReturnFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.getCallSignature()!.createJitReturnFunction(JitFunctions.fromJsonVal);
        const returnValue = 'result';

        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(returnValue)));
        expect(roundTrip).toEqual(returnValue);
    });
});

describe('objects', () => {
    // Interface tests - moved from packages/run-types/src/runType/collection/interface.spec.ts:213-226
    it('interface', () => {
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

    // Class json stringify test - moved from packages/run-types/src/runType/collection/class.spec.ts:79-90
    it('class', () => {
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

    // Class serializable restoration test - moved from packages/run-types/src/runType/collection/class.spec.ts:87-94
    it('serializable class can be restored after they are registered', async () => {
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
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        expect(() => rt.createJitFunction(JitFunctions.fromJsonVal)).toThrow();
        jitUtils.setSerializableClass(MySerializableClass);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const restored = fromJsonVal(JSON.parse(jsonStringify(serializable)));
        expect(restored instanceof MySerializableClass).toBeTruthy();
    });

    // Class deserialize function test - moved from packages/run-types/src/runType/collection/class.spec.ts:89-104
    it('classes can be deserialized suing a deserialize function', () => {
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

        const rtNonS = runType<NonSerializableClass>();
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

    // Extended class json stringify test - moved from packages/run-types/src/runType/collection/class.spec.ts:135-143
    it('extended class', () => {
        class BaseClass {
            baseProp: string = 'base'; // properties must be all strongly typed otherwise types wont appear in the jit code
        }
        class ExtendedClass extends BaseClass {
            // TODO: build eslint rule that enforces all properties to be strongly typed
            extendedProp: string = 'extended'; // properties must be all strongly typed otherwise types wont appear in the jit code
        }
        const rtExtended = runType<ExtendedClass>();
        const extended = new ExtendedClass();
        const jsonStringify = rtExtended.createJitFunction(JitFunctions.jsonStringify);
        // restored object has the properties of the original object but is not a class instance
        const restored = JSON.parse(jsonStringify(extended));
        expect(restored).toEqual({
            baseProp: extended.baseProp,
            extendedProp: extended.extendedProp,
        });
    });

    // Interface optional properties json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:215-233
    it('must set optional properties first in order to work properly', () => {
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

    // Interface all optional fields json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:217-240
    it('should work when all fields are optional', () => {
        type Obj2 = {
            a?: string;
            b?: string;
        };
        const rtObj1 = runType<Obj2>();
        const jsonStringify = rtObj1.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtObj1.createJitFunction(JitFunctions.fromJsonVal);

        const typeValue: Obj2 = {a: 'helloA', b: 'helloB'};
        const json = jsonStringify(typeValue);
        expect(json).toEqual(`{"a":"helloA","b":"helloB"}`);
        expect(fromJsonVal(JSON.parse(json))).toEqual(typeValue);

        const typeValue2: Obj2 = {a: 'helloA'};
        const json2 = jsonStringify(typeValue2);
        expect(json2).toEqual(`{"a":"helloA"}`);
        expect(fromJsonVal(JSON.parse(json2))).toEqual(typeValue2);

        const typeValue3: Obj2 = {};
        const json3 = jsonStringify(typeValue3);
        expect(json3).toEqual(`{}`);
        expect(fromJsonVal(JSON.parse(json3))).toEqual(typeValue3);
    });

    // Interface with index properties json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:219-237
    it('interfaces with a single property and index properties', () => {
        type Obj1 = {
            a: string;
            [key: string]: string;
        };
        const rtObj1 = runType<Obj1>();
        const jsonStringify = rtObj1.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtObj1.createJitFunction(JitFunctions.fromJsonVal);

        const typeValue: Obj1 = {a: 'helloA'};
        const json = jsonStringify(typeValue);
        expect(json).toEqual(`{"a":"helloA"}`);
        expect(fromJsonVal(JSON.parse(json))).toEqual(typeValue);

        const typeValue2: Obj1 = {a: 'helloA', b: 'helloB'};
        const json2 = jsonStringify(typeValue2);
        expect(json2).toEqual(`{"b":"helloB","a":"helloA"}`); // properties are reordered for json stringify to work properly
        expect(fromJsonVal(JSON.parse(json2))).toEqual(typeValue2);
    });

    // Interface strip extra params json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:476-495
    it('to strip extra params without fail', () => {
        type ObjectType = {
            startDate: Date;
            quantity: number;
            name: string;
            nullValue: null;
            stringArray: string[];
            bigInt: bigint;
            optionalString?: string;
            "weird prop name \n?>'\\\t\r": string;
            deep?: {
                a: string;
                b: number;
            };
        };

        type ObjectTypeWithExtra = {
            startDate: Date;
            quantity: number;
            name: string;
            nullValue: null;
            stringArray: string[];
            bigInt: bigint;
            optionalString?: string;
            "weird prop name \n?>'\\\t\r": string;
            someExtra: string;
            someExtra2: number;
            "extra weird prop name \n?>'\\\t\r": string;
            deep?: {
                a: string;
                b: number;
                cExtra: boolean;
            };
        };

        const rt = runType<ObjectType>();
        const startDate = new Date();

        const objWithExtra: ObjectTypeWithExtra = {
            startDate,
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
            someExtra: 'hello',
            someExtra2: 123,
            "extra weird prop name \n?>'\\\t\r": 'hello3',
            deep: {
                a: 'hello',
                b: 123,
                cExtra: true,
            },
        };
        // json stringify automatically strips unknown keys
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const jsonString = jsonStringify(objWithExtra);
        const roundTrip = fromJsonVal(JSON.parse(jsonString));
        expect(roundTrip).toEqual({
            startDate,
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
            deep: {
                a: 'hello',
                b: 123,
            },
        });
    });

    // Interface circular ref json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:648-654
    it('interface circular', () => {
        interface ICircular {
            name: string;
            child?: ICircular;
        }
        const rt = runType<ICircular>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    // Interface circular array json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:707-716
    it('interface circular array', () => {
        interface ICircularArray {
            name: string;
            children?: ICircularArray[];
        }
        const rt = runType<ICircularArray>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        const roundTrip1 = fromJsonVal(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    // Interface circular deep json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:777-789
    it('interface circular deep', () => {
        interface ICircularDeep {
            name: string;
            embedded: {
                hello: string;
                child?: ICircularDeep;
            };
        }
        const rt = runType<ICircularDeep>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        const roundTrip1 = fromJsonVal(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    // Interface root not circular json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:889-905
    it('interface root not circular', () => {
        interface ICircularDeep {
            name: string;
            big: bigint;
            embedded: {
                hello: string;
                child?: ICircularDeep;
            };
        }

        interface RootNotCircular {
            isRoot: true;
            ciChild: ICircularDeep;
        }

        const rt = runType<RootNotCircular>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const obj1: RootNotCircular = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}};
        const obj2: RootNotCircular = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
        };
        const roundTrip1 = fromJsonVal(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    // Interface multiple circular json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:1035-1053
    it('interface multiple circular', () => {
        interface ICircularDeep {
            name: string;
            big: bigint;
            embedded: {
                hello: string;
                child?: ICircularDeep;
            };
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

        const rt = runType<RootCircular>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const ciDate: ICircularDate = {date: new Date(), month: 1, year: 2021};
        const obj1: RootCircular = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}, ciDate};
        const obj2: RootCircular = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
            ciDate,
        };
        const roundTrip1 = fromJsonVal(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    // Interface circular tuple json stringify test - moved from packages/run-types/src/runType/collection/interface.spec.ts:1093-1102
    it('interface circular tuple', () => {
        interface ICircularTuple {
            name: string;
            parent?: [string, ICircularTuple];
        }

        const rt = runType<ICircularTuple>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        const roundTrip1 = fromJsonVal(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });
});

describe('circular-references', () => {
    // Circular references tests - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:71-83
    it('should use JSON.stringify when there are circular references', () => {
        type CircularObject = {
            name: string;
            child?: CircularObject;
        };
        const rtCircular = runType<CircularObject>();
        const c1: CircularObject = {name: 'hello', child: {name: 'world'}};

        const jsonStringify = rtCircular.createJitFunction(JitFunctions.jsonStringify);
        const toJsonVal = rtCircular.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rtCircular.createJitFunction(JitFunctions.fromJsonVal);

        const copy1 = structuredClone(c1);
        expect(fromJsonVal(JSON.parse(jsonStringify(toJsonVal(copy1))))).toEqual(c1);
    });

    // Circular array union json stringify test - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:130-141
    it('CircularUnion array with discriminator', () => {
        type CuArray = (CuArray | Date | number | string)[];
        const rt = runType<CuArray>();
        const date = new Date();
        const cu1: CuArray = [date, 123, 'hello', ['a', 'b', 'c']];
        const cu2: CuArray = [date, 123, 'hello', ['a', 2, 'c'], cu1];
        const cu3: CuArray = [];
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copy1: CuArray = [date, 123, 'hello', ['a', 'b', 'c']];
        const copy2: CuArray = [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]];
        const copy3: CuArray = [];

        expect(fromJsonVal(JSON.parse(jsonStringify(copy1))).length).toEqual(cu1.length);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy2))).length).toEqual(cu2.length);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy3))).length).toEqual(cu3.length);
    });

    // Circular tuple json stringify test - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:199-210
    it('CircularTuple object with discriminator', () => {
        interface CircularTuple {
            list: [bigint, CircularTuple?];
        }
        const rt = runType<CircularTuple>();
        const c1: CircularTuple = {list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]};
        const c2: CircularTuple = {list: [1n, {list: [2n]}]};
        const c3: CircularTuple = {list: [1n]};
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copy1: CircularTuple = {list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]};
        const copy2: CircularTuple = {list: [1n, {list: [2n]}]};
        const copy3: CircularTuple = {list: [1n]};

        expect(fromJsonVal(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy3)))).toEqual(c3);
    });

    // Circular index json stringify test - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:265-276
    it('CircularIndex object with discriminator', () => {
        interface CircularIndex {
            index: {[key: string]: CircularIndex};
        }
        const rt = runType<CircularIndex>();
        const c1: CircularIndex = {index: {a: {index: {b: {index: {}}}}}};
        const c2: CircularIndex = {index: {a: {index: {}}}};
        const c3: CircularIndex = {index: {}};
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copy1: CircularIndex = {index: {a: {index: {b: {index: {}}}}}};
        const copy2: CircularIndex = {index: {a: {index: {}}}};
        const copy3: CircularIndex = {index: {}};

        expect(fromJsonVal(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy3)))).toEqual(c3);
    });

    // Circular deep json stringify test - moved from packages/run-types/src/runType/collection/circularRefs.spec.ts:333-342
    it('CircularDeep object with discriminator', () => {
        interface CircularDeep {
            deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        const rt = runType<CircularDeep>();
        const c1: CircularDeep = {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}};
        const c2: CircularDeep = {deep1: {deep2: {deep3: {}}}};
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copy1: CircularDeep = {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}};
        const copy2: CircularDeep = {deep1: {deep2: {deep3: {}}}};

        expect(fromJsonVal(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
    });
});

describe('tuples', () => {
    // Tuple tests - moved from packages/run-types/src/runType/collection/tuple.spec.ts:129-135
    it('tuple', () => {
        type TestTuple = [Date, number, string, null, string[], bigint];
        const rt = runType<TestTuple>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Tuple with optional params json stringify test - moved from packages/run-types/src/runType/collection/tuple.spec.ts:131-140
    it('tuple with optional params', () => {
        type TupleWithOptionals = [number, bigint?, boolean?, number?];
        const jsonStringify = runType<TupleWithOptionals>().createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = runType<TupleWithOptionals>().createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = [3, undefined, true, 4];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
        const typeValue2 = [3];
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual([3]);
    });

    // Tuple rest parameter json stringify test - moved from packages/run-types/src/runType/collection/tuple.spec.ts:261-267
    it('tuple rest parameter', () => {
        type TupleRest = [number, ...string[]];
        const rt = runType<TupleRest>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue: TupleRest = [3, 'a', 'b', 'c'];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    // Tuple circular json stringify test - moved from packages/run-types/src/runType/collection/tuple.spec.ts:206-214
    it('tuple circular', () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const rt = runType<TupleCircular>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const tDeep: TupleCircular = [new Date(), 456, 'world', null, ['x', 'y', 'z'], BigInt(456)];
        const typeValue: TupleCircular = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), tDeep];

        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });
});

describe('functions', () => {
    // Function tests - error cases moved from packages/run-types/src/runType/function/function.spec.ts:72-74
    it('throw errors for jsonStringify on function type', () => {
        type TestFunction = (a: number, b: boolean, c?: string) => Date;
        const rt = runType<TestFunction>();
        expect(() => rt.createJitFunction(JitFunctions.jsonStringify)).toThrow(
            `Compile function JsonStringify not supported, call compileParams or compileReturn instead.`
        );
    });

    // Function parameters tests - moved from packages/run-types/src/runType/function/function.spec.ts:128-137
    it('parameters', () => {
        type TestFunction = (a: number, b: boolean, c?: string) => Date;
        const rt = runType<TestFunction>() as FunctionRunType;
        const jsonStringify = rt.createJitParamsFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitParamsFunction(JitFunctions.fromJsonVal);
        const typeValue = [3, true, 'hello'];
        const typeValue2 = [3, true];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    // Function required parameters test - moved from packages/run-types/src/runType/function/function.spec.ts:128-138
    it('required parameters', () => {
        type TestFunction2 = (a: Date, b?: boolean) => bigint;
        const rt2 = runType<TestFunction2>() as FunctionRunType;
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

    // Function return tests - moved from packages/run-types/src/runType/function/function.spec.ts:235-241
    it('function return', () => {
        type TestFunction = (a: number, b: boolean, c?: string) => Date;
        const rt = runType<TestFunction>() as FunctionRunType;
        const jsonStringify = rt.createJitReturnFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitReturnFunction(JitFunctions.fromJsonVal);
        const returnValue = new Date();
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(returnValue)));
        expect(roundTrip).toEqual(returnValue);
    });

    // Function with rest parameters - moved from packages/run-types/src/runType/function/function.spec.ts:339-348
    it('stringify function with rest parameters', () => {
        type TestFunctionRest = (a: number, b: boolean, ...rest: Date[]) => Date;
        const rtRest = runType<TestFunctionRest>() as FunctionRunType;
        const jsonStringify = rtRest.createJitParamsFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtRest.createJitParamsFunction(JitFunctions.fromJsonVal);
        const typeValue = [3, true, new Date(), new Date()];
        const typeValue2 = [3, true];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    // Function required return test - moved from packages/run-types/src/runType/function/function.spec.ts:226-232
    it('required function return', () => {
        type TestFunction2 = (a: Date, b?: boolean) => bigint;
        const rt2 = runType<TestFunction2>() as FunctionRunType;
        const jsonStringify = rt2.createJitReturnFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt2.createJitReturnFunction(JitFunctions.fromJsonVal);
        const returnValue = 1n;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(returnValue)));
        expect(roundTrip).toEqual(returnValue);
    });

    // Function with only rest parameters test - moved from packages/run-types/src/runType/function/function.spec.ts:324-333
    it('stringify function with only rest parameters', () => {
        type TestFunctionRest2 = (...rest: number[]) => Date;
        const rtRest2 = runType<TestFunctionRest2>() as FunctionRunType;
        const jsonStringify = rtRest2.createJitParamsFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtRest2.createJitParamsFunction(JitFunctions.fromJsonVal);
        const typeValue = [3, 2, 1];
        const typeValue2: number[] = [];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip3 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip3).toEqual(typeValue2);
    });

    // Function non serializable types test - moved from packages/run-types/src/runType/function/function.spec.ts:165-174
    it('non serializable types', () => {
        type TestFunctionWithFN = (a: number, b: boolean, c?: () => null) => Date;
        const rtWithFN = runType<TestFunctionWithFN>() as FunctionRunType;
        const jsonStringify = rtWithFN.createJitParamsFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtWithFN.createJitParamsFunction(JitFunctions.fromJsonVal);
        const typeValue = [3, true, () => null];
        const typeValue2 = [3, true, undefined];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual([3, true, undefined]);
        expect(roundTrip2).toEqual([3, true, undefined]);
    });

    // Function promise return type test - moved from packages/run-types/src/runType/function/function.spec.ts:217-232
    it(`if function's return type is a promise then return type should be the promise's resolvedType`, () => {
        const fn = (a: number, b: boolean, c?: string): Promise<Date> => Promise.resolve(new Date());
        const reflectedType = reflectFunction(fn);
        expect(reflectedType instanceof FunctionRunType).toBe(true);

        const fromJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.fromJsonVal);
        const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFunctions.jsonStringify);
        const returnValue = new Date();
        expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
    });

    // Function return type is function test - moved from packages/run-types/src/runType/function/function.spec.ts:219-236
    it(`if function's return type is a function then return type should be the function's return type`, () => {
        const fn =
            (a: number, b: boolean, c?: string): (() => Date) =>
            () =>
                new Date();
        const reflectedType = reflectFunction(fn);

        const fromJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.fromJsonVal);
        const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFunctions.jsonStringify);
        const returnValue = new Date();
        expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
    });

    // Function reflectFunction general test - moved from packages/run-types/src/runType/function/function.spec.ts:271-297
    it('should get runType from a function using reflectFunction', () => {
        const fn = (a: number, b: boolean, c?: string): Date => new Date();
        const reflectedType = reflectFunction(fn);
        expect(reflectedType instanceof FunctionRunType).toBe(true);

        const fromJsonVal = reflectedType.createJitParamsFunction(JitFunctions.fromJsonVal);
        const jsonStringify = reflectedType.createJitParamsFunction(JitFunctions.jsonStringify);
        const paramsValues = [3, true, 'hello'];

        expect(fromJsonVal(JSON.parse(jsonStringify([3, true, 'hello'])))).toEqual(paramsValues);

        const fromJsonReturn = reflectedType.createJitReturnFunction(JitFunctions.fromJsonVal);
        const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFunctions.jsonStringify);
        const returnValue = new Date();
        expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
    });

    // Function createJitParamsFunction json stringify test - moved from packages/run-types/src/runType/function/function.spec.ts:351-356
    it('createJitParamsFunction json stringify', () => {
        const rt = runType<(a: number, b: boolean, c?: string) => Date>() as FunctionRunType;
        const jsonStringify = rt.createJitParamsFunction(JitFunctions.jsonStringify, {paramsSlice: {start: 1}});
        const fromJsonVal = rt.createJitParamsFunction(JitFunctions.fromJsonVal, {paramsSlice: {start: 1}});
        const paramsValues = [true, 'hello'];
        expect(fromJsonVal(JSON.parse(jsonStringify(paramsValues)))).toEqual(paramsValues);
    });
});

describe('utility-types', () => {
    // Moved from packages/run-types/src/runType/utility/required.spec.ts:61-69
    it('required properties', () => {
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

        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyMaybe = rtRequired.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeMaybe = rtRequired.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(stringify(person)))).toEqual({name: 'John', age: 30, createdAt});
        expect(decodeMaybe(JSON.parse(stringifyMaybe(maybePerson)))).toEqual({createdAt});
    });

    // Note: Test from packages/run-types/src/runType/utility/string.spec.ts:41-48 was skipped in original (describe.skip)

    // Moved from packages/run-types/src/runType/utility/extract.spec.ts:53-61
    it('extract atomic', () => {
        type PersonProp = 'name' | 'age' | 'createdAt';
        const rt = runType<PersonProp>();
        const rtExtract = runType<Extract<PersonProp, 'name' | 'createdAt'>>();
        const personProp: PersonProp = 'age';
        const excludeAge: Extract<PersonProp, 'name' | 'createdAt'> = 'name';

        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyExtract = rtExtract.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeExtract = rtExtract.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(stringify(personProp)))).toEqual(personProp);
        expect(decodeExtract(JSON.parse(stringifyExtract(excludeAge)))).toEqual(excludeAge);
    });

    // Moved from packages/run-types/src/runType/utility/extract.spec.ts:120-128
    it('extract objects', () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        const rt = runType<Shape>();
        const rtExtract = runType<Extract<Shape, ToExtract>>();
        const shape: Shape = {kind: 'circle', radius: 3};
        const excludeShape: Extract<Shape, ToExtract> = {
            kind: 'square',
            x: 5,
        };

        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyExtract = rtExtract.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeExtract = rtExtract.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(stringify(shape)))).toEqual(shape);
        expect(decodeExtract(JSON.parse(stringifyExtract(excludeShape)))).toEqual(excludeShape);
    });
});

describe('unions', () => {
    // Union tests - moved from packages/run-types/src/runType/collection/union.spec.ts:78-87
    it('union', () => {
        type AtomicUnion = Date | number | string | null | bigint;
        const rt = runType<AtomicUnion>();
        const a: AtomicUnion = new Date();
        const b: AtomicUnion = 123;
        const c: AtomicUnion = 'hello';
        const d: AtomicUnion = null;
        const e: AtomicUnion = 3n;

        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        expect(fromJsonVal(JSON.parse(jsonStringify(a)))).toEqual(a);
        expect(fromJsonVal(JSON.parse(jsonStringify(b)))).toEqual(b);
        expect(fromJsonVal(JSON.parse(jsonStringify(c)))).toEqual(c);
        expect(fromJsonVal(JSON.parse(jsonStringify(d)))).toEqual(d);
        expect(fromJsonVal(JSON.parse(jsonStringify(e)))).toEqual(e);
    });

    // Union array json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:182-201
    it('union array', () => {
        type UnionArr = string[] | number[] | boolean[] | Date[];
        const arrA: UnionArr = ['a', 'b', 'c'];
        const arrB: UnionArr = [1, 2, 3];
        const arrC: UnionArr = [true, false, true];
        const arrD: UnionArr = [];
        const rt = runType<UnionArr>();
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

    // Array with union types json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:262-283
    it('with discriminator', () => {
        type ArrUnion = (string | bigint | boolean | Date)[];
        const date = new Date();
        const arrA: ArrUnion = ['a', 'b', 'c'];
        const arrB: ArrUnion = [1n, 2n, 3n];
        const arrC: ArrUnion = [true, false, true];
        const arrD: ArrUnion = [1n, 'b', date];
        const rt = runType<ArrUnion>();
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

    // Union object json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:354-370
    it('union object with discriminator', () => {
        type UnionObj = {a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string};
        const objA: UnionObj = {a: 'hello', b: 123, c: 1n}; // unlike typescript we don't allow mix of properties in the union
        const objB: UnionObj = {a: 'world', aa: true};
        const objC: UnionObj = {c: 1n};
        const objD: UnionObj = {d: 'hello'};
        const objE: UnionObj = {};
        const rt = runType<UnionObj>();
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

    // Union with discriminator property json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:499-514
    it('union with discriminator property', () => {
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

    // Union mixed json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:577-584
    it('union mixed with discriminator', () => {
        type UnionMix = string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'};
        const mixA: UnionMix = ['a', 'b', 'c'];
        const mixB: UnionMix = {a: 'hello', aa: true};
        const rt = runType<UnionMix>();
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        expect(fromJsonVal(JSON.parse(jsonStringify(mixA)))).toEqual(mixA);
        expect(fromJsonVal(JSON.parse(jsonStringify(mixB)))).toEqual(mixB);
    });

    // Union mixed with index property json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:657-669
    it('union index property with discriminator', () => {
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

    // Union circular json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:742-759
    it('Circular Union with discriminator', () => {
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

    // Union with methods json stringify test - moved from packages/run-types/src/runType/collection/union.spec.ts:852-868
    it('union with methods - methods should be excluded', () => {
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
});

describe('maps-sets', () => {
    // Tests moved from various spec files under packages/run-types/src/runType/

    // Set json stringify test - moved from packages/run-types/src/runType/native/set.spec.ts:62-71
    it('Set', () => {
        const testSet = new Set<string>(['one', 'two', 'three']);
        const rt = runType<Set<string>>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const setCopy = cloneSet(testSet);
        const jsonString = jsonStringify(setCopy);
        const restored = fromJsonVal(JSON.parse(jsonString));

        expect(restored).toEqual(testSet);
    });

    // Set with complex objects json stringify test - moved from packages/run-types/src/runType/native/set.spec.ts:143-152
    it('Set<SmallObject>', () => {
        interface SmallObject {
            prop1: string;
            prop2: number;
            prop3: boolean;
            prop4?: Date;
            prop5?: bigint;
        }

        const testSetSmallObject = new Set<SmallObject>([
            {prop1: 'value1', prop2: 1, prop3: true},
            {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date()},
            {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)},
        ]);

        const rtSmallObject = runType<Set<SmallObject>>();
        const jsonStringify = rtSmallObject.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtSmallObject.createJitFunction(JitFunctions.fromJsonVal);

        const setCopy = cloneSet(testSetSmallObject);
        const jsonString = jsonStringify(setCopy);
        const restored = fromJsonVal(JSON.parse(jsonString));

        expect(restored).toEqual(testSetSmallObject);
    });

    // Set nested objects json stringify test - moved from packages/run-types/src/runType/native/set.spec.ts:271-288
    it('objects with nested sets', () => {
        interface DeepWithSet {
            a: string;
            b: Set<{s: string; arr: number[]}>;
        }
        const rtDeepWithSet = runType<DeepWithSet>();
        const jsonStringify = rtDeepWithSet.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtDeepWithSet.createJitFunction(JitFunctions.fromJsonVal);

        const set1: DeepWithSet['b'] = new Set([
            {s: 'a', arr: [1, 2, 3]},
            {s: 'b', arr: [4, 5, 6]},
        ]);
        const obj: DeepWithSet = {
            a: 'a',
            b: set1,
        };
        const objCopy = structuredClone(obj);
        const jsonString = jsonStringify(objCopy);
        const restored = fromJsonVal(JSON.parse(jsonString));

        expect(restored).toEqual(obj);
    });

    // Map json stringify test - moved from packages/run-types/src/runType/native/map.spec.ts:83-91
    it('Map', () => {
        const testMap = new Map<string, number>([
            ['one', 1],
            ['two', 2],
            ['three', 3],
        ]);
        const rt = runType<Map<string, number>>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        // Should serialize the Map as an array of entries
        const mapCopy = cloneMap(testMap);
        const jsonString = jsonStringify(mapCopy);
        const restored = fromJsonVal(JSON.parse(jsonString));
        expect(restored).toEqual(testMap);
    });

    // Map with complex objects json stringify test - moved from packages/run-types/src/runType/native/map.spec.ts:185-193
    it('Map<string, SmallObject>', () => {
        interface SmallObject {
            prop1: string;
            prop2: number;
            prop3: boolean;
            prop4?: Date;
            prop5?: bigint;
        }

        const testMapStringSmallObject = new Map<string, SmallObject>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
            ['key2', {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date()}],
            ['key3', {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}],
        ]);

        const rtStringSmallObject = runType<Map<string, SmallObject>>();
        const jsonStringify = rtStringSmallObject.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtStringSmallObject.createJitFunction(JitFunctions.fromJsonVal);
        // Should serialize the Map as an array of entries
        const mapCopy = cloneMap(testMapStringSmallObject);
        const jsonString = jsonStringify(mapCopy);
        const restored = fromJsonVal(JSON.parse(jsonString));
        expect(restored).toEqual(testMapStringSmallObject);
    });

    // Map with complex keys json stringify test - moved from packages/run-types/src/runType/native/map.spec.ts:310-318
    it('Map<SmallObject, number>', () => {
        interface SmallObject {
            prop1: string;
            prop2: number;
            prop3: boolean;
            prop4?: Date;
            prop5?: bigint;
        }

        const testMapSmallObjectNumber = new Map<SmallObject, number>([
            [{prop1: 'value1', prop2: 1, prop3: true}, 1],
            [{prop1: 'value2', prop2: 2, prop3: false, prop4: new Date()}, 2],
            [{prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}, 3],
        ]);

        const rtSmallObjectNumber = runType<Map<SmallObject, number>>();
        const jsonStringify = rtSmallObjectNumber.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtSmallObjectNumber.createJitFunction(JitFunctions.fromJsonVal);
        // Should serialize the Map as an array of entries
        const mapCopy = cloneMap(testMapSmallObjectNumber);
        const jsonString = jsonStringify(mapCopy);
        const restored = fromJsonVal(JSON.parse(jsonString));
        expect(restored).toEqual(testMapSmallObjectNumber);
    });

    // Map nested objects json stringify test - moved from packages/run-types/src/runType/native/map.spec.ts:434-448
    it('objects with nested maps', () => {
        interface DeepWithMap {
            a: string;
            b: Map<string, {sm: {s: string; arr: number[]}}>;
        }

        const rtDeepWithMap = runType<DeepWithMap>();
        const jsonStringify = rtDeepWithMap.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtDeepWithMap.createJitFunction(JitFunctions.fromJsonVal);

        const obj: DeepWithMap = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };
        const jsonString = jsonStringify(obj);
        const restored = fromJsonVal(JSON.parse(jsonString));
        expect(restored).toEqual(obj);
    });
});

describe('others', () => {
    // Promise jsonStringify error test - moved from packages/run-types/src/runType/native/promise.spec.ts:12-19
    it('jsonStringify should throw error for Promise types', () => {
        const rt = runType<Promise<string>>();
        const errorMessage = `Jit compilation disabled for Non Serializable types.`;
        expect(() => rt.createJitFunction(JitFunctions.jsonStringify)).toThrow(errorMessage);
    });

    // Non-serializable types jsonStringify error tests - moved from packages/run-types/src/runType/native/nonSerializable.spec.ts:34-46
    it('jsonStringify should throw error for non-serializable types', () => {
        const errorMessage = `Jit compilation disabled for Non Serializable types.`;

        // Test various non-serializable types
        const rtInt8Array = runType<Int8Array>();
        expect(() => rtInt8Array.createJitFunction(JitFunctions.jsonStringify)).toThrow(errorMessage);

        const rtInterfaceWithNonSerializable = runType<{a: Int8Array}>();
        expect(() => rtInterfaceWithNonSerializable.createJitFunction(JitFunctions.jsonStringify)).toThrow(errorMessage);

        const rtArrayWithNonSerializable = runType<Int8Array[]>();
        expect(() => rtArrayWithNonSerializable.createJitFunction(JitFunctions.jsonStringify)).toThrow(errorMessage);

        const rtTupleWithNonSerializable = runType<[Int8Array]>();
        expect(() => rtTupleWithNonSerializable.createJitFunction(JitFunctions.jsonStringify)).toThrow(errorMessage);
    });
});
