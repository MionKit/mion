/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    buildJsonEncodeJITFn,
    buildJsonDecodeJITFn,
    buildIsTypeJITFn,
    buildTypeErrorsJITFn,
    buildMockJITFn,
    buildJsonStringifyJITFn,
} from '../jitCompiler';

type ObjectType = {
    date: Date;
    number: number;
    string: string;
    nullValue: null;
    stringArray: string[];
    bigInt: bigint;
    optionalString?: string;
    // [key: symbol]: string;
    // [key: number]: number;
};

const x: ObjectType = {
    date: new Date(),
    number: 123,
    string: 'hello',
    nullValue: null,
    stringArray: ['a', 'b', 'c'],
    bigInt: BigInt(123),
    // [Symbol('test')]: 'hello',
    // 3: 3,
};

const rt = runType<ObjectType>();

it('validate object', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(
        validate({
            date: new Date(),
            number: 123,
            string: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            // note optionalString is missing
        })
    ).toBe(true);
    expect(
        validate({
            date: new Date(),
            number: 123,
            string: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            optionalString: 3, // wrong type
        })
    ).toBe(false);
    // missing props
    expect(
        validate({
            date: new Date(),
            number: 123,
            string: 'hello',
            nullValue: null,
        })
    ).toBe(false);
    expect(validate({})).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate object + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(
        valWithErrors({
            date: new Date(),
            number: 123,
            string: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
        })
    ).toEqual([]);
    expect(
        valWithErrors({
            date: new Date(),
            number: 123,
            string: 'hello',
        })
    ).toEqual([
        {path: '/nullValue', expected: 'null'},
        {path: '/stringArray', expected: 'array<string>'},
        {path: '/bigInt', expected: 'bigint'},
    ]);
    expect(valWithErrors({})).toEqual([
        {path: '/date', expected: 'date'},
        {path: '/number', expected: 'number'},
        {path: '/string', expected: 'string'},
        {path: '/nullValue', expected: 'null'},
        {path: '/stringArray', expected: 'array<string>'},
        {path: '/bigInt', expected: 'bigint'},
    ]);
    expect(valWithErrors('hello')).toEqual([
        {path: '', expected: 'object<date & number & string & null & array<string> & bigint & string>'},
    ]);
});

it('encode/decode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = {
        date: new Date(),
        number: 123,
        string: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
    };
    expect(rt.shouldDecodeJson).toBe(true);
    expect(rt.shouldEncodeJson).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt);
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = {
        date: new Date(),
        number: 123,
        string: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
    };
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);

    const typeValue2 = {
        date: new Date(),
        number: 123,
        string: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        optionalString: 'hello',
    };
    const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
    expect(roundTrip2).toEqual(typeValue2);
});

it('mock', () => {
    const mock = buildMockJITFn(rt);
    const mocked = mock();
    expect(mocked).toHaveProperty('date');
    expect(mocked).toHaveProperty('number');
    expect(mocked).toHaveProperty('string');
    expect(mocked).toHaveProperty('nullValue');
    expect(mocked).toHaveProperty('stringArray');
    expect(mocked).toHaveProperty('bigInt');
    const validate = buildIsTypeJITFn(rt);
    expect(validate(mock())).toBe(true);
});
