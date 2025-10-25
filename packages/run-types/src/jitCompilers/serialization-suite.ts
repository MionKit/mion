/* eslint-disable jest/no-export */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DataOnly, jitUtils, RpcError} from '@mionkit/core';
import {reflectFunction, runType} from '../lib/createRunType';
import {mockRegExpsList} from '../mocking/constants.mock';
import {type RunType} from '../types';

// ========================================================================
// TEST Types
// Bellow test Types cant be defined inside getTestData() function, so are defined here
// ========================================================================

enum Color {
    Red = 'red',
    Green = 'green',
    Blue = 'blue',
}

interface SmallObject {
    prop1: string;
    prop2: number;
    prop3: boolean;
    prop4?: Date;
    prop5?: bigint;
}

// classes

class MySerializableClass {
    name: string;
    surname: string;
    id: number;
    startDate: Date;
    constructor() {
        this.name = 'John';
        this.surname = 'Doe';
        this.id = 0;
        this.startDate = new Date('2000-08-06T02:13:00.000Z');
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

// circular refs

type ObjCircularArr = {
    a: string;
    deep?: {
        b: string;
        c: number;
    };
    d?: ObjCircularArr[];
};

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

interface RootNotCircular {
    isRoot: true;
    ciChild: ICircularDeep;
}

interface ICircularArray {
    name: string;
    children?: ICircularArray[];
}

interface ICircularTuple {
    name: string;
    parent?: [string, ICircularTuple];
}

interface ObjectWithMethods {
    name: string;
    methodProp: () => any;
}

// ========================================================================
// SERIALIZATION_TEST_DATA - Reusable test data for all serializers/deserializers
// ========================================================================

export type SingleTest = {
    title: string;
    description?: string; // extended functionality description
    getTestData: (dataOnly?: boolean) => {
        /** RunType to be used for serialization */
        rt: RunType;
        /** Values to be serialized */
        values: any[];
        /**
         * Deserialized values,
         * Set only when the expected deserialized values are different from the original values
         * So serialization/deserialization is asymmetric
         * */
        deserializedValues?: any[];
    };
};
export type CategoryTest = Record<string, SingleTest>;
export type TestSuite = Record<string, CategoryTest>;

export const SERIALIZATION_SPEC = {
    ATOMIC: {
        string: {
            title: 'string',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<string>();
                const values = ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨'];
                return {rt, values};
            },
        },
        number: {
            title: 'number',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<number>();
                const values = [
                    0,
                    99,
                    -1,
                    1.1,
                    -1.1,
                    1988,
                    2045,
                    2 ** 31,
                    Number.MAX_SAFE_INTEGER,
                    Number.MIN_SAFE_INTEGER,
                    Number.MIN_VALUE,
                    Number.MAX_VALUE,
                ];
                return {rt, values};
            },
        },
        number_not_supported: {
            title: 'number values not supported by all protocols',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<number>();
                const values = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN];
                return {rt, values};
            },
        },
        regexp: {
            title: 'regexp',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<RegExp>();
                const values = mockRegExpsList;
                return {rt, values};
            },
        },
        bigint: {
            title: 'bigint',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<bigint>();
                const values = [1n];
                return {rt, values};
            },
        },
        boolean: {
            title: 'boolean',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<boolean>();
                const values = [true];
                return {rt, values};
            },
        },
        // TODO, any is not supported by non native protocols like binary because JIT code is generated for each type unlike JSON.stringify(any)
        // so we might change this or use a flag to throw if any types is used
        any: {
            title: 'any',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<any>();
                const values = [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]];
                return {rt, values};
            },
        },
        not_supported_any: {
            title: 'not supported in JSON stringify when any type is used',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<any>();
                // some values are not supported when any type is used
                const values = [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)];
                return {rt, values};
            },
        },
        null: {
            title: 'null',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<null>();
                const values = [null];
                return {rt, values};
            },
        },
        undefined: {
            title: 'undefined',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<undefined>();
                const values = [undefined];
                return {rt, values};
            },
        },
        date: {
            title: 'date',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Date>();
                const values = [new Date('2000-08-06T02:13:00.000Z')];
                return {rt, values};
            },
        },
        enum: {
            title: 'enum',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Color>();
                const values = [Color.Red, Color.Green];
                return {rt, values};
            },
        },
        symbol: {
            title: 'symbol',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<symbol>();
                const values = [Symbol('foo'), Symbol()];
                return {rt, values};
            },
        },
        object: {
            title: 'object',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<object>();
                const values = [{a: 42, b: 'hello'}, null];
                return {rt, values};
            },
        },
        void: {
            title: 'void',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<void>();
                const values = [undefined];
                return {rt, values};
            },
        },
        never: {
            title: 'never',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<never>();
                const values = []; // never is not serializable, should throw
                return {rt, values};
            },
        },
        literal_string: {
            title: 'string literal',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<'hello'>();
                const values = ['hello'];
                return {rt, values};
            },
        },
        literal_number: {
            title: 'number literal',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<42>();
                const values = [42];
                return {rt, values};
            },
        },
        literal_boolean: {
            title: 'boolean literal',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<true>();
                const values = [true];
                return {rt, values};
            },
        },
        literal_regexp: {
            title: 'regexp literal',
            getTestData: (dataOnly = false) => {
                const reg = /abc/;
                // eslint-disable-next-line @mionkit/no-typeof-runtype
                const rt = dataOnly ? (null as any) : runType<typeof reg>();
                const values = [reg];
                return {rt, values};
            },
        },
    },
    ARRAYS: {
        array: {
            title: 'array',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<string[]>();
                const values = [['hello', 'world'], []];
                return {rt, values};
            },
        },
        array_date: {
            title: 'array of dates',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Date[]>();
                const values = [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []];
                return {rt, values};
            },
        },
        undefined_in_array: {
            title: 'undefined is serialized as null in array',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<undefined[]>();
                const original: undefined[] = [undefined, undefined];
                const values = [original];
                return {rt, values};
            },
        },
        multi_dimensional: {
            title: 'multi dimensional array',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<string[][]>();
                const values = [[['hello', 'world'], ['a', 'b'], []], []];
                return {rt, values};
            },
        },
        non_serializable_in_array: {
            title: 'non serializable items throws an error',
            description: 'non serializable in array throws an error at compile time. ',
            getTestData: (dataOnly = false) => {
                type NonSerializableArray = symbol[];
                const rt = dataOnly ? (null as any) : runType<NonSerializableArray>();
                const values = []; // doesn't matter as should throw at compile time
                return {rt, values};
            },
        },
        circular: {
            title: 'array circular',
            getTestData: (dataOnly = false) => {
                type CircularArray = CircularArray[]; // this type is not really useful as only allows empty array, but still posible
                const rt = dataOnly ? (null as any) : runType<CircularArray>();
                const arr: CircularArray = [];
                arr.push([]);
                arr[0].push([]);
                arr[0][0].push([]);
                const values = [arr, []];
                return {rt, values};
            },
        },
    },
    OBJECTS: {
        interface: {
            title: 'interface',
            getTestData: (dataOnly = false) => {
                type TestInterface = {
                    startDate: Date;
                    quantity: number;
                    name: string;
                    nullValue: null;
                    big: bigint;
                    stringArray: string[];
                    "weird prop name \n?>'\\\t\r": string;
                    optionalString?: string;
                };
                const rt = dataOnly ? (null as any) : runType<TestInterface>();
                const value: TestInterface = {
                    startDate: new Date('2000-08-06T02:13:00.000Z'),
                    quantity: 123,
                    name: 'hello',
                    nullValue: null,
                    big: BigInt(123),
                    stringArray: ['a', 'b', 'c'],
                    "weird prop name \n?>'\\\t\r": 'hello2',
                };
                const valueWIthOptional: TestInterface = {
                    ...value,
                    optionalString: 'hello3',
                };
                const values = [value, valueWIthOptional];
                return {rt, values};
            },
        },
        many_optional_props: {
            title: 'interface',
            getTestData: (dataOnly = false) => {
                type N = number;
                // prettier-ignore
                type ManyOptional = {
                    // 8 bitmap
                    a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?:N;
                    a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
                    b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
                    b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
                };
                const rt = dataOnly ? (null as any) : runType<ManyOptional>();
                // prettier-ignore
                const value1: ManyOptional = {a0: 0, a1: 1, b0:16, a8: 8, b7: 23, b15: 31};
                // prettier-ignore
                const values2: ManyOptional = {a0: 0, b8: 24};
                const values3: ManyOptional = {};
                const values = [value1, values2, values3];
                return {rt, values};
            },
        },
        class: {
            title: 'class',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<MySerializableClass>();
                // class deserialization are asymmetric, restored values only contains the properties
                // class are deserialized as a plain objects instead original class instance
                const item = new MySerializableClass();
                const restored = {
                    name: item.name,
                    surname: item.surname,
                    id: item.id,
                    startDate: item.startDate,
                };
                const values = [new MySerializableClass()];
                const deserializedValues = [restored];
                return {rt, values, deserializedValues};
            },
        },
        extended_class: {
            title: 'extended class',
            getTestData: (dataOnly = false) => {
                class BaseClass {
                    baseProp: string = 'base';
                }
                class ExtendedClass extends BaseClass {
                    extendedProp: string = 'extended';
                }
                const rt = dataOnly ? (null as any) : runType<ExtendedClass>();
                const values = [new ExtendedClass()];
                return {rt, values};
            },
        },
        rpc_error_class: {
            title: 'rpc error class',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<RpcError<'test-error'>>();
                const error = new RpcError({
                    statusCode: 400,
                    publicMessage: 'error',
                    message: 'error',
                    type: 'test-error',
                });
                const values = [error];
                return {rt, values};
            },
        },
        serializable_class_restored: {
            title: 'serializable class can be restored after they are registered',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<MySerializableClass>();
                const values = [new MySerializableClass()];
                // Register class so it can be deserialized, this would ensure we have a reference to the class
                jitUtils.setSerializableClass(MySerializableClass);
                return {rt, values};
            },
        },
        classes_deserialize_function: {
            title: 'classes can be deserialized using a deserialize function',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<NonSerializableClass>();
                const values = [new NonSerializableClass('John', 'Doe', 0, new Date('2000-08-06T02:13:00.000Z'))];
                if (!jitUtils.getDeserializeFn(NonSerializableClass.name)) {
                    jitUtils.setDeserializeFn(NonSerializableClass, (deserialized: DataOnly<NonSerializableClass>) => {
                        return new NonSerializableClass(
                            deserialized.name,
                            deserialized.surname,
                            deserialized.id,
                            deserialized.startDate
                        );
                    });
                }
                return {rt, values};
            },
        },
        undefined_in_object: {
            title: 'undefined is omitted in object prop',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<{a: string; b: number; c: undefined}>();
                const values = [{a: 'hello', b: 42, c: undefined}];
                const deserializedValues = [{a: 'hello', b: 42}];
                return {rt, values, deserializedValues};
            },
        },
        optional_properties_order: {
            title: 'optional properties',
            getTestData: (dataOnly = false) => {
                type Obj1 = {
                    a: string;
                    b?: string;
                };
                const rt = dataOnly ? (null as any) : runType<Obj1>();
                const values = [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}];
                return {rt, values};
            },
        },
        all_optional_fields: {
            title: 'should work when all fields are optional',
            getTestData: (dataOnly = false) => {
                type Obj2 = {
                    a?: string;
                    b?: string;
                };
                const rt = dataOnly ? (null as any) : runType<Obj2>();
                const values = [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}, {}];
                return {rt, values};
            },
        },
        strip_extra_params: {
            title: 'strip extra params',
            getTestData: (dataOnly = false) => {
                type SomeObject = {
                    startDate: Date;
                    quantity: number;
                    name: string;
                    nullValue: null;
                    stringArray: string[];
                    bigInt: bigint;
                    optionalString?: string;
                    "weird prop name \n?>'\\\t\r": string;
                    deep: {
                        a: string;
                        b: number;
                    };
                    '?other weird p': {
                        c: string;
                        d: number;
                    };
                };
                const rt = dataOnly ? (null as any) : runType<SomeObject>();
                const startDate = new Date('2000-08-06T02:13:00.000Z');
                const noExtraParams: SomeObject = {
                    startDate,
                    quantity: 123,
                    name: 'hello',
                    nullValue: null,
                    stringArray: ['a', 'b', 'c'],
                    bigInt: BigInt(123),
                    "weird prop name \n?>'\\\t\r": 'hello2',
                    deep: {a: 'hello', b: 123},
                    '?other weird p': {c: 'hello', d: 123},
                };
                const objectWithExtraParams = {
                    ...noExtraParams,
                    startDate: new Date('2000-08-06T02:13:00.000Z'),
                    deep: {a: 'hello', b: 123, cExtra: true},
                    '?other weird p': {c: 'hello', d: 123, eExtra: true},
                    extraA: 'hello',
                    extraB: 123,
                    extraC: true,
                };
                const values = [objectWithExtraParams];
                const deserializedValues = [noExtraParams];
                return {rt, values, deserializedValues};
            },
        },
        interface_circular: {
            title: 'interface circular',
            getTestData: (dataOnly = false) => {
                interface ICircular {
                    name: string;
                    child?: ICircular;
                }
                const rt = dataOnly ? (null as any) : runType<ICircular>();
                const values = [{name: 'hello', child: {name: 'world'}}];
                return {rt, values};
            },
        },
        interface_circular_array: {
            title: 'interface circular array',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<ICircularArray>();
                const values: ICircularArray[] = [
                    {name: 'hello', children: []},
                    {name: 'hello', children: [{name: 'world'}]},
                ];
                return {rt, values};
            },
        },
        interface_circular_deep: {
            title: 'interface circular deep',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<ICircularDeep>();
                const values: ICircularDeep[] = [
                    {name: 'hello', big: 1n, embedded: {hello: 'world'}},
                    {
                        name: 'hello',
                        big: 2n,
                        embedded: {hello: 'world', child: {name: 'world1', big: 3n, embedded: {hello: 'world2'}}},
                    },
                ];
                return {rt, values};
            },
        },
        interface_root_not_circular: {
            title: 'interface root not circular',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<RootNotCircular>();
                const values: RootNotCircular[] = [
                    {
                        isRoot: true,
                        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
                    },
                    {
                        isRoot: true,
                        ciChild: {
                            name: 'hello',
                            big: 2n,
                            embedded: {
                                hello: 'world',
                                child: {name: 'world1', big: 2n, embedded: {hello: 'world2'}},
                            },
                        },
                    },
                ];
                return {rt, values};
            },
        },
        interface_multiple_circular: {
            title: 'interface multiple circular',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<RootCircular>();
                const ciDate: ICircularDate = {date: new Date('2000-08-06T02:13:00.000Z'), month: 1, year: 2021};
                const values = [
                    {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}, ciDate},
                    {
                        isRoot: true,
                        ciChild: {
                            name: 'hello',
                            big: 1n,
                            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
                        },
                        ciDate,
                    },
                ];
                return {rt, values};
            },
        },
        interface_with_methods: {
            title: 'methods should be excluded from interface when serializing',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<ObjectWithMethods>();
                const objWithMethod = {
                    name: 'John',
                    methodProp() {
                        return 'method result';
                    },
                } as ObjectWithMethods;
                const values = [objWithMethod];
                const deserializedValues = [{name: 'John'}]; // method should be excluded
                return {rt, values, deserializedValues};
            },
        },
    },
    // Records are Object/Interfaces that use index properties where prop names are unknown at compile time
    RECORDS: {
        index_property: {
            title: 'index property',
            getTestData: (dataOnly = false) => {
                interface IndexString {
                    [key: string]: string;
                }
                const rt = dataOnly ? (null as any) : runType<IndexString>();
                const values = [{key1: 'value1', key2: 'value2'}, {}];
                return {rt, values};
            },
        },
        index_property_and_prop: {
            title: 'interfaces with a single property and index properties',
            getTestData: (dataOnly = false) => {
                type Obj1 = {
                    a: string;
                    [key: string]: string;
                };
                const rt = dataOnly ? (null as any) : runType<Obj1>();
                const values = [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}];
                return {rt, values};
            },
        },
        index_property_extra: {
            title: 'index property with extra props and unions',
            getTestData: (dataOnly = false) => {
                type IndexWithExtraProps = {
                    a: string;
                    b: number;
                    [key: string]: string | number;
                };
                const rt = dataOnly ? (null as any) : runType<IndexWithExtraProps>();
                const value: IndexWithExtraProps = {
                    key1: 'value1',
                    key2: 'value2',
                    a: 'extra1',
                    b: 123,
                };
                const values = [value];
                return {rt, values};
            },
        },
        multiple_index_props: {
            title: 'multiple index properties',
            getTestData: (dataOnly = false) => {
                type MultipleIndex = {
                    [key: string]: string;
                    [key: number]: string;
                    [abc: symbol]: Date;
                };
                const objWithSymbolKeys: MultipleIndex = {
                    key1: 'value1',
                    key2: 'value2',
                    [Symbol('key3')]: new Date(),
                    [Symbol('key4')]: new Date(),
                }; // symbol keys should be skipped from jit
                const rt = dataOnly ? (null as any) : runType<MultipleIndex>();
                const values = [{key1: 'value1', key2: 'value2'}, objWithSymbolKeys];
                const deserializedValues = [
                    {key1: 'value1', key2: 'value2'},
                    {key1: 'value1', key2: 'value2'},
                ]; // symbol keys should be skipped
                return {rt, values, deserializedValues};
            },
        },
        index_property_nested: {
            title: 'index property nested',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<{[key: string]: {[key: string]: number}}>();
                const values = [{key1: {nestedKey1: 1, nestedKey2: 2}}];
                return {rt, values};
            },
        },
        index_property_nested_date: {
            title: 'index property nested date',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<{[key: string]: {[key: string]: Date}}>();
                const values = [
                    {key1: {nestedKey1: new Date('2000-08-06T02:13:00.000Z'), nestedKey2: new Date('2000-08-06T02:13:00.000Z')}},
                ];
                return {rt, values};
            },
        },
        index_property_bigint: {
            title: 'index property with bigint values',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<{[key: string]: bigint}>();
                const values = [
                    {key1: 1n, key2: 2n},
                    {hello: 1n, world: 2n},
                ];
                return {rt, values};
            },
        },
        index_property_non_root: {
            title: 'index property non-root',
            getTestData: (dataOnly = false) => {
                interface Obj1 {
                    a: string;
                    [key: string]: string;
                }
                interface Obj2 {
                    b: string;
                    c: Obj1;
                }
                const rt = dataOnly ? (null as any) : runType<Obj2>();
                const values = [{b: 'hello', c: {a: 'world', c: 'world'}}];
                return {rt, values};
            },
        },
    },
    TUPLES: {
        tuple: {
            title: 'tuple',
            getTestData: (dataOnly = false) => {
                type TestTuple = [Date, number, string, null, string[], bigint];
                const rt = dataOnly ? (null as any) : runType<TestTuple>();
                const tuple: TestTuple = [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
                const values = [tuple];
                return {rt, values};
            },
        },
        tuple_with_optional: {
            title: 'tuple with optional params',
            getTestData: (dataOnly = false) => {
                type TupleWithOptionals = [number, bigint?, boolean?, number?];
                const rt = dataOnly ? (null as any) : runType<TupleWithOptionals>();
                const values = [[3, undefined, true, 4], [446]];
                return {rt, values};
            },
        },
        tuple_rest_parameter: {
            title: 'tuple rest parameter',
            getTestData: (dataOnly = false) => {
                type TupleRest = [number, ...bigint[]];
                const rt = dataOnly ? (null as any) : runType<TupleRest>();
                const values: TupleRest[] = [[34567, 1n, 2n, 3n], [3]];
                return {rt, values};
            },
        },
        tuple_with_non_serializable: {
            title: 'tuple with non serializable types are transformed to undefined',
            description:
                'tuples relies in the order and length of the array to work, so non serializable types are transformed to undefined, to keep the order and length of the tuple.',
            getTestData: (dataOnly = false) => {
                type TupleWithNonSerializable = [number, () => any];
                const rt = dataOnly ? (null as any) : runType<TupleWithNonSerializable>();
                const values = [[3, () => null]];
                const deserializedValues = [[3, undefined]];
                return {rt, values, deserializedValues};
            },
        },
        tuple_circular: {
            title: 'tuple circular',
            getTestData: (dataOnly = false) => {
                type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
                const rt = dataOnly ? (null as any) : runType<TupleCircular>();
                const tDeep: TupleCircular = [
                    new Date('2000-08-06T02:13:00.000Z'),
                    456,
                    'world',
                    null,
                    ['x', 'y', 'z'],
                    BigInt(456),
                ];
                const typeValue: TupleCircular = [
                    new Date('2000-08-06T02:13:00.000Z'),
                    123,
                    'hello',
                    null,
                    ['a', 'b', 'c'],
                    BigInt(123),
                    tDeep,
                ];
                const values = [typeValue];
                return {rt, values};
            },
        },
        interface_circular_tuple: {
            title: 'interface circular tuple',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<ICircularTuple>();
                const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
                const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
                const values = [obj1, obj2];
                return {rt, values};
            },
        },
    },
    FUNCTIONS: {
        throw_errors_for_functions: {
            title: 'throw errors for functions',
            getTestData: (dataOnly = false) => {
                type TestFunction = (a: number, b: boolean, c?: string) => Date;
                const rt = dataOnly ? (null as any) : runType<TestFunction>();
                const values = []; // This test throws an error, so no values
                return {rt, values};
            },
        },
        parameters: {
            title: 'parameters',
            getTestData: (dataOnly = false) => {
                type TestFunction = (a: number, b: boolean, c: string) => Date;
                const rt = dataOnly ? (null as any) : runType<TestFunction>();
                const values = [
                    [3, true, 'hello'],
                    [3, true, 'world'],
                ];
                return {rt, values};
            },
        },
        optional_params: {
            title: 'optional parameters',
            getTestData: (dataOnly = false) => {
                type TestFunction2 = (a: Date, b?: boolean) => bigint;
                const rt = dataOnly ? (null as any) : runType<TestFunction2>();
                const d = new Date('2000-08-06T02:13:00.000Z');
                const values = [[d, true], [d]];
                return {rt, values};
            },
        },
        function_return: {
            title: 'function return',
            getTestData: (dataOnly = false) => {
                type TestFunction = (a: number, b: boolean, c?: string) => Date;
                const rt = dataOnly ? (null as any) : runType<TestFunction>();
                const values = [new Date('2000-08-06T02:13:00.000Z')];
                return {rt, values};
            },
        },
        function_with_rest_parameters: {
            title: 'stringify function with rest parameters',
            getTestData: (dataOnly = false) => {
                type TestFunctionRest = (a: number, b: boolean, ...rest: Date[]) => Date;
                const rt = dataOnly ? (null as any) : runType<TestFunctionRest>();
                const values = [
                    [3, true, new Date('2000-08-06T02:13:00.000Z'), new Date('2000-08-06T02:13:00.000Z')],
                    [3, true],
                ];
                return {rt, values};
            },
        },
        function_with_date_parameters: {
            title: 'function with Date parameters requiring serialization',
            getTestData: (dataOnly = false) => {
                type TestFunctionDate = (a: Date, b?: boolean) => bigint;
                const rt = dataOnly ? (null as any) : runType<TestFunctionDate>();
                const d = new Date('2000-08-06T02:13:00.000Z');
                const values = [[d, true], [d]];
                return {rt, values};
            },
        },
        required_function_return: {
            title: 'required function return',
            getTestData: (dataOnly = false) => {
                type TestFunction2 = (a: Date, b?: boolean) => bigint;
                const rt = dataOnly ? (null as any) : runType<TestFunction2>();
                const values = [1n];
                return {rt, values};
            },
        },
        function_with_only_rest_parameters: {
            title: 'stringify function with only rest parameters',
            getTestData: (dataOnly = false) => {
                type TestFunctionRest2 = (...rest: number[]) => Date;
                const rt = dataOnly ? (null as any) : runType<TestFunctionRest2>();
                const values = [[3, 2, 1], []];
                return {rt, values};
            },
        },
        non_serializable_params: {
            title: 'non serializable types',
            getTestData: (dataOnly = false) => {
                type TestFunctionWithFN = (a: number, b: boolean, c?: () => null) => Date;
                const rt = dataOnly ? (null as any) : runType<TestFunctionWithFN>();
                const values = [
                    [3, true, () => null],
                    [3, true, undefined],
                ];
                const deserializedValues = [
                    [3, true, undefined],
                    [3, true, undefined],
                ];
                return {rt, values, deserializedValues};
            },
        },
        function_promise_return_type: {
            title: `functions returns a promise`,
            getTestData: (dataOnly = false) => {
                type TestFunctionPromise = (a: number, b: boolean, c?: string) => Promise<Date>;
                const rt = dataOnly ? (null as any) : runType<TestFunctionPromise>();
                const values = [new Date('2000-08-06T02:13:00.000Z')]; // This tests the return value
                return {rt, values};
            },
        },
        function_return_type_is_function: {
            title: `return type of a closure`,
            getTestData: (dataOnly = false) => {
                type TestFunctionReturnsFunction = (a: number, b: boolean, c?: string) => () => Date;
                const rt = dataOnly ? (null as any) : runType<TestFunctionReturnsFunction>();
                const values = [new Date('2000-08-06T02:13:00.000Z')]; // This tests the return value
                return {rt, values};
            },
        },
        reflectFunction_params: {
            title: 'should get runType from a function using reflectFunction',
            getTestData: (dataOnly = false) => {
                function abc1(a: number, b: boolean, c?: string): string {
                    return `${a}-${b}-${c}`;
                }
                const rt = dataOnly ? (null as any) : reflectFunction(abc1);
                const values = [
                    [3, true, 'hello'],
                    [3, true],
                ];
                return {rt, values};
            },
        },
        reflectFunction_return: {
            title: 'should get runType from a function using reflectFunction',
            getTestData: (dataOnly = false) => {
                function abc2(a: number, b: boolean, c?: string): string {
                    return `${a}-${b}-${c}`;
                }
                const rt = dataOnly ? (null as any) : reflectFunction(abc2);
                const values = ['1-true-c', '1-true'];
                return {rt, values};
            },
        },
        function_slice_params: {
            title: 'create jit function with params slice',
            getTestData: (dataOnly = false) => {
                type TestFunction = (a: number, b: boolean, c?: string) => Date;
                const rt = dataOnly ? (null as any) : runType<TestFunction>();
                const values = [[true, 'hello']]; // Params with slice starting from index 1
                return {rt, values};
            },
        },
        call_signature_params: {
            title: 'call signature params',
            getTestData: (dataOnly = false) => {
                type CallSignatureType = {
                    (a: number, b: boolean): string;
                };
                const rt = dataOnly ? (null as any) : runType<CallSignatureType>();
                const values = [[3, true]];
                return {rt, values};
            },
        },
        call_signature_return: {
            title: 'call signature return',
            getTestData: (dataOnly = false) => {
                type CallSignatureType = {
                    (a: number, b: boolean): string;
                };
                const rt = dataOnly ? (null as any) : runType<CallSignatureType>();
                const values = ['result']; // This is the return value being tested
                return {rt, values};
            },
        },
        throw_errors_for_call_signature: {
            title: 'throw errors for  call signature',
            getTestData: (dataOnly = false) => {
                type CallSignatureType = {
                    (a: number, b: boolean): string;
                };
                const rt = dataOnly ? (null as any) : runType<CallSignatureType>();
                const values = [[3, 'invalid']]; // This is the return value being tested
                return {rt, values};
            },
        },
    },
    UTILITY_TYPES: {
        awaited: {
            title: 'awaited',
            getTestData: (dataOnly = false) => {
                type MyPromise = Promise<{a: string; b: number; c: Date}>; // note how record does not check the type of keys
                type MyType = Awaited<MyPromise>;
                const rt = dataOnly ? (null as any) : runType<MyType>();
                const values = [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}];
                return {rt, values};
            },
        },
        exclude_atomic: {
            title: 'exclude atomic',
            getTestData: (dataOnly = false) => {
                type PersonProp = 'name' | 'age' | number;
                const rt = dataOnly ? (null as any) : runType<Exclude<PersonProp, 'age'>>();
                const values = ['name', 3, 4];
                return {rt, values};
            },
        },
        exclude_objects: {
            title: 'exclude objects',
            getTestData: (dataOnly = false) => {
                type Circle = {kind: 'circle'; radius: number};
                type Square = {kind: 'square'; x: number};
                type Triangle = {kind: 'triangle'; x: number; y: number};
                type Shape = Circle | Square | Triangle;
                type ExcludeCircle = Exclude<Shape, Circle>;
                const rt = dataOnly ? (null as any) : runType<ExcludeCircle>();
                const values: ExcludeCircle[] = [
                    {kind: 'square', x: 5},
                    {kind: 'triangle', x: 5, y: 10},
                ];
                return {rt, values};
            },
        },
        required_properties: {
            title: 'required properties',
            getTestData: (dataOnly = false) => {
                interface MaybePerson {
                    name?: string;
                    age?: number;
                    createdAt?: Date;
                }
                const rt = dataOnly ? (null as any) : runType<Required<MaybePerson>>();
                const createdAt = new Date('2000-08-06T02:13:00.000Z');
                const values = [{name: 'John', age: 30, createdAt}];
                return {rt, values};
            },
        },
        extract_atomic: {
            title: 'extract atomic',
            getTestData: (dataOnly = false) => {
                type PersonProp = 'name' | 'age' | 'createdAt';
                const rt = dataOnly ? (null as any) : runType<Extract<PersonProp, 'name' | 'createdAt'>>();
                const values = ['name'];
                return {rt, values};
            },
        },
        extract_objects: {
            title: 'extract objects',
            getTestData: (dataOnly = false) => {
                type Shape =
                    | {kind: 'circle'; radius: number}
                    | {kind: 'square'; x: number}
                    | {kind: 'triangle'; x: number; y: number};
                type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
                const rt = dataOnly ? (null as any) : runType<Extract<Shape, ToExtract>>();
                const values = [{kind: 'square', x: 5}];
                return {rt, values};
            },
        },
        partial_properties: {
            title: 'partial properties',
            getTestData: (dataOnly = false) => {
                interface Person {
                    name: string;
                    age: number;
                    createdAt: Date;
                }
                const rt = dataOnly ? (null as any) : runType<Partial<Person>>();
                const createdAt = new Date('2000-08-06T02:13:00.000Z');
                const values = [{name: 'John'}, {age: 30}, {createdAt}, {}];
                return {rt, values};
            },
        },
        pick_properties: {
            title: 'pick properties',
            getTestData: (dataOnly = false) => {
                interface Person {
                    name: string;
                    age: number;
                    createdAt: Date;
                    email: string;
                }
                const rt = dataOnly ? (null as any) : runType<Pick<Person, 'name' | 'createdAt'>>();
                const createdAt = new Date('2000-08-06T02:13:00.000Z');
                const values = [{name: 'John', createdAt}];
                return {rt, values};
            },
        },
        omit_properties: {
            title: 'omit properties',
            getTestData: (dataOnly = false) => {
                interface Person {
                    name: string;
                    age: number;
                    createdAt: Date;
                    email: string;
                }
                const rt = dataOnly ? (null as any) : runType<Omit<Person, 'email'>>();
                const createdAt = new Date('2000-08-06T02:13:00.000Z');
                const values = [{name: 'John', age: 30, createdAt}];
                return {rt, values};
            },
        },
        record_type: {
            title: 'record type',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Record<string, Date>>();
                const date1 = new Date('2000-08-06T02:13:00.000Z');
                const date2 = new Date('2001-09-07T03:14:00.000Z');
                const values = [{key1: date1, key2: date2}, {}];
                return {rt, values};
            },
        },
    },
    UNIONS: {
        union: {
            title: 'union',
            getTestData: (dataOnly = false) => {
                type AtomicUnion = Date | number | string | null | bigint;
                const rt = dataOnly ? (null as any) : runType<AtomicUnion>();
                const values = [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, 3n];
                return {rt, values};
            },
        },
        union_errors: {
            title: 'union throw errors when item does not belong to the union',
            getTestData: (dataOnly = false) => {
                type AtomicUnion2 = Date | number | {isValid: boolean};
                const rt = dataOnly ? (null as any) : runType<AtomicUnion2>();
                const values = ['hello', null, true, {hello: 'world'}];
                return {rt, values};
            },
        },
        union_array: {
            title: 'union array',
            getTestData: (dataOnly = false) => {
                type UnionArr = string[] | number[] | boolean[] | Date[];
                const rt = dataOnly ? (null as any) : runType<UnionArr>();
                const values = [
                    ['a', 'b', 'c'],
                    [1, 2, 3],
                    [true, false, true],
                    [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')],
                    [],
                ];
                return {rt, values};
            },
        },
        with_discriminator: {
            title: 'with discriminator',
            getTestData: (dataOnly = false) => {
                type ArrUnion = (string | bigint | boolean | Date)[];
                const rt = dataOnly ? (null as any) : runType<ArrUnion>();
                const date = new Date('2000-08-06T02:13:00.000Z');
                const values = [
                    ['a', 'b', 'c'],
                    [1n, 2n, 3n],
                    [true, false, true],
                    [1n, 'b', date],
                ];
                return {rt, values};
            },
        },
        union_object_with_discriminator: {
            title: 'union object with discriminator',
            getTestData: (dataOnly = false) => {
                type UnionObj = {a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string};
                const rt = dataOnly ? (null as any) : runType<UnionObj>();
                const values = [{a: 'world', aa: true}, {c: 1n}, {d: 'hello'}, {}];
                return {rt, values};
            },
        },
        union_with_discriminator_property: {
            title: 'union with discriminator property',
            getTestData: (dataOnly = false) => {
                type UnionDisc =
                    | {type: 'a'; otherProp: boolean}
                    | {type: 'b'; otherProp: number}
                    | {type: 'c'; otherProp: string; time: Date}
                    | {type: boolean; otherProp: string};
                const rt = dataOnly ? (null as any) : runType<UnionDisc>();
                const values = [
                    {type: 'a', otherProp: true},
                    {type: 'b', otherProp: 123},
                    {type: 'c', otherProp: 'hello', time: new Date('2000-08-06T02:13:00.000Z')},
                    {type: true, otherProp: 'typeD'},
                ];
                return {rt, values};
            },
        },
        union_mixed_with_discriminator: {
            title: 'union mixed with discriminator',
            getTestData: (dataOnly = false) => {
                type UnionMix =
                    | string[]
                    | number[]
                    | boolean[]
                    | {a: string; aa: boolean}
                    | {b: number}
                    | {c: bigint; aa: 'string'};
                const rt = dataOnly ? (null as any) : runType<UnionMix>();
                const values = [['a', 'b', 'c'], {a: 'hello', aa: true}];
                return {rt, values};
            },
        },
        union_index_property_with_discriminator: {
            title: 'union index property with discriminator',
            getTestData: (dataOnly = false) => {
                type UnionIndex =
                    | string[]
                    | {a: string; aa: boolean}
                    | {b: number}
                    | {a: string; [key: string]: string}
                    | {[key: string]: bigint; b: bigint};
                const rt = dataOnly ? (null as any) : runType<UnionIndex>();
                const values = [['a', 'b', 'c'], {a: 'hello', aa: true}, {b: 1n, c: 2n}];
                return {rt, values};
            },
        },
        circular_union_with_discriminator: {
            title: 'Circular Union with discriminator',
            getTestData: (dataOnly = false) => {
                type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
                const rt = dataOnly ? (null as any) : runType<UnionC>();
                const date = new Date('2000-08-06T02:13:00.000Z');
                const values = [
                    new Date(date.getTime()),
                    123,
                    'hello',
                    {a: {a: {}}},
                    {},
                    [],
                    [[]],
                    [123, 3, {b: 'hello'}],
                    [123, 3, 'hello'],
                    [[123], 3, [3, 'hello']],
                ];
                return {rt, values};
            },
        },
        union_with_methods: {
            title: 'union with methods - methods should be excluded',
            getTestData: (dataOnly = false) => {
                type UnionWithMethods =
                    | {name: string; getName(): string}
                    | {age: number; getAge(): number}
                    | {active: boolean; isActive(): boolean};
                const rt = dataOnly ? (null as any) : runType<UnionWithMethods>();
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
                const values = [objWithName, objWithAge, objWithActive];
                const deserializedValues = [{name: 'John'}, {age: 25}, {active: true}];
                return {rt, values, deserializedValues};
            },
        },
        union_whit_non_serializable: {
            title: 'union with non serializable types throws an error',
            description:
                "should throw an error at compile time because we don't have the isType logic for non serializable, and isType is used at runtime to determine the type of the union.",
            getTestData: (dataOnly = false) => {
                type UnionWithNonSerializable = Date | number | string | (() => any);
                const rt = dataOnly ? (null as any) : runType<UnionWithNonSerializable>();
                const values = []; // doesn't matter as should throw at compile time
                return {rt, values};
            },
        },
    },
    ITERABLES: {
        set: {
            title: 'Set',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Set<string>>();
                const values = [new Set<string>(['one', 'two', 'three'])];
                return {rt, values};
            },
        },
        set_small_object: {
            title: 'Set<SmallObject>',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Set<SmallObject>>();
                const values = [
                    new Set<SmallObject>([
                        {prop1: 'value1', prop2: 1, prop3: true},
                        {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')},
                        {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)},
                    ]),
                ];
                return {rt, values};
            },
        },
        objects_with_nested_sets: {
            title: 'objects with nested sets',
            getTestData: (dataOnly = false) => {
                interface DeepWithSet {
                    a: string;
                    b: Set<{s: string; arr: number[]}>;
                }
                const rt = dataOnly ? (null as any) : runType<DeepWithSet>();
                const set1: DeepWithSet['b'] = new Set([
                    {s: 'a', arr: [1, 2, 3]},
                    {s: 'b', arr: [4, 5, 6]},
                ]);
                const values = [{a: 'a', b: set1}];
                return {rt, values};
            },
        },
        map: {
            title: 'Map',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Map<string, number>>();
                const values = [
                    new Map<string, number>([
                        ['one', 1],
                        ['two', 2],
                        ['three', 3],
                    ]),
                ];
                return {rt, values};
            },
        },
        map_string_small_object: {
            title: 'Map<string, SmallObject>',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Map<string, SmallObject>>();
                const values = [
                    new Map<string, SmallObject>([
                        ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
                        ['key2', {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}],
                        ['key3', {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}],
                    ]),
                ];
                return {rt, values};
            },
        },
        map_small_object_number: {
            title: 'Map<SmallObject, number>',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Map<SmallObject, number>>();
                const values = [
                    new Map<SmallObject, number>([
                        [{prop1: 'value1', prop2: 1, prop3: true}, 1],
                        [{prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}, 2],
                        [{prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}, 3],
                    ]),
                ];
                return {rt, values};
            },
        },
        objects_with_nested_maps: {
            title: 'objects with nested maps',
            getTestData: (dataOnly = false) => {
                interface DeepWithMap {
                    a: string;
                    b: Map<string, {sm: {s: string; arr: number[]}}>;
                }
                const rt = dataOnly ? (null as any) : runType<DeepWithMap>();
                const values = [
                    {
                        a: 'a',
                        b: new Map([
                            ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                            ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
                        ]),
                    },
                ];
                return {rt, values};
            },
        },
        map_with_bigint_keys: {
            title: 'Map with bigint keys',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Map<bigint, number>>();
                const values = [
                    new Map<bigint, number>([
                        [1n, 1],
                        [2n, 2],
                        [3n, 3],
                    ]),
                ];
                return {rt, values};
            },
        },
        map_with_date_values: {
            title: 'Map with Date values',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Map<string, Date>>();
                const values = [
                    new Map<string, Date>([
                        ['date1', new Date('2000-08-06T02:13:00.000Z')],
                        ['date2', new Date('2001-09-07T03:14:00.000Z')],
                    ]),
                ];
                return {rt, values};
            },
        },
    },
    CIRCULAR_REFS: {
        circular_types: {
            title: 'circular objects',
            getTestData: (dataOnly = false) => {
                type CircularObject = {
                    name: string;
                    child?: CircularObject;
                };
                const rt = dataOnly ? (null as any) : runType<CircularObject>();
                const values = [{name: 'hello', child: {name: 'world'}}];
                return {rt, values};
            },
        },
        circular_union_array: {
            title: 'CircularUnion array with discriminator',
            getTestData: (dataOnly = false) => {
                type CuArray = (CuArray | Date | number | string)[];
                const rt = dataOnly ? (null as any) : runType<CuArray>();
                const date = new Date('2000-08-06T02:13:00.000Z');
                const values = [
                    [date, 123, 'hello', ['a', 'b', 'c']],
                    [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]],
                    [],
                ];
                return {rt, values};
            },
        },
        circular_tuple: {
            title: 'CircularTuple object with discriminator',
            getTestData: (dataOnly = false) => {
                interface CircularTuple {
                    list: [bigint, CircularTuple?];
                }
                const rt = dataOnly ? (null as any) : runType<CircularTuple>();
                const values = [{list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]}, {list: [1n, {list: [2n]}]}, {list: [1n]}];
                return {rt, values};
            },
        },
        circular_index: {
            title: 'CircularIndex object with discriminator',
            getTestData: (dataOnly = false) => {
                interface CircularIndex {
                    index: {[key: string]: CircularIndex};
                }
                const rt = dataOnly ? (null as any) : runType<CircularIndex>();
                const values = [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}];
                return {rt, values};
            },
        },
        circular_deep: {
            title: 'CircularDeep object with discriminator',
            getTestData: (dataOnly = false) => {
                interface CircularDeep {
                    deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
                }
                const rt = dataOnly ? (null as any) : runType<CircularDeep>();
                const values = [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}];
                return {rt, values};
            },
        },
        circular_tuple_complex: {
            title: 'Circular tuple with complex structure',
            getTestData: (dataOnly = false) => {
                type CircularTupleComplex = [bigint, CircularTupleComplex?];
                const rt = dataOnly ? (null as any) : runType<CircularTupleComplex>();
                const values = [[1n, [2n, [3n, [4n]]]], [1n, [2n]], [1n]];
                return {rt, values};
            },
        },
        object_with_circular_array: {
            title: 'array strip extra params',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<ObjCircularArr>();
                const value: ObjCircularArr = {
                    a: 'hello',
                    deep: {
                        b: 'world',
                        c: 123,
                    },
                    d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
                };
                const values = [value];
                return {rt, values};
            },
        },
    },
    OTHERS: {
        promise_jsonStringify_error: {
            title: 'throw error for Promise types',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Promise<string>>();
                const values = []; // This test throws an error, so no values
                return {rt, values};
            },
        },
        non_serializable: {
            title: 'throw error for non-serializable types',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Int8Array>();
                const values = []; // This test throws an error, so no values
                return {rt, values};
            },
        },
        non_serializable_interface: {
            title: 'throw error for non-serializable types in interfaces',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<{a: Int8Array}>();
                const values = []; // This test throws an error, so no values
                return {rt, values};
            },
        },
        non_serializable_array: {
            title: 'throw error for non-serializable types in arrays',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<Int8Array[]>();
                const values = []; // This test throws an error, so no values
                return {rt, values};
            },
        },
        non_serializable_tuple: {
            title: 'throw error for non-serializable types in tuples',
            getTestData: (dataOnly = false) => {
                const rt = dataOnly ? (null as any) : runType<[Int8Array]>();
                const values = []; // This test throws an error, so no values
                return {rt, values};
            },
        },
    },
} satisfies TestSuite;
