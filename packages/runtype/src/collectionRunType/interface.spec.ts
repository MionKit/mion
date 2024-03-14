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
    buildJsonStringifyJITFn,
} from '../jitCompiler';

type ObjectType = {
    startDate: Date;
    quantity: number;
    name: string;
    nullValue: null;
    stringArray: string[];
    bigInt: bigint;
    optionalString?: string;
    "weird prop name \n?>'\\\t\r": string;
    // TODO: index
};

interface objectSkipProps {
    name: string;
    methodProp: () => any;
}

type objectIndexedProps = {
    someProp: 2;
    otherProp: 'hello';
    [key: symbol]: string;
    [key: number]: number;
};

const rt = runType<ObjectType>();
const rtSkip = runType<objectSkipProps>();
// TODO: implement indexed properties
const rtIndexed = runType<objectIndexedProps>();

it('validate object', () => {
    const validate = buildIsTypeJITFn(rt).fn;
    expect(
        validate({
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
            // note optionalString is missing
        })
    ).toBe(true);
    expect(
        validate({
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
            optionalString: 3, // wrong type
        })
    ).toBe(false);
    // missing props
    expect(
        validate({
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
            nullValue: null,
        })
    ).toBe(false);
    expect(validate({})).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate object + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt).fn;
    expect(
        valWithErrors({
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
        })
    ).toEqual([]);
    expect(
        valWithErrors({
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
        })
    ).toEqual([
        {path: '/nullValue', expected: 'null'},
        {path: '/stringArray', expected: 'array<string>'},
        {path: '/bigInt', expected: 'bigint'},
        {path: `/weird prop name \n?>'\\\t\r`, expected: 'string'},
    ]);
    expect(valWithErrors({})).toEqual([
        {path: '/startDate', expected: 'date'},
        {path: '/quantity', expected: 'number'},
        {path: '/name', expected: 'string'},
        {path: '/nullValue', expected: 'null'},
        {path: '/stringArray', expected: 'array<string>'},
        {path: '/bigInt', expected: 'bigint'},
        {path: `/weird prop name \n?>'\\\t\r`, expected: 'string'},
    ]);
    expect(valWithErrors('hello')).toEqual([
        {
            path: '',
            expected: `object<startDate:date, quantity:number, name:string, nullValue:null, stringArray:array<string>, bigInt:bigint, optionalString?:string, weird prop name \n?>'\\\t\r:string>`,
        },
    ]);
});

it('encode/decode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = {
        startDate: new Date(),
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
    };
    expect(rt.isJsonDecodeRequired).toBe(true);
    expect(rt.isJsonEncodeRequired).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
});

it('skip props when encode/decode to json', () => {
    const toJson = buildJsonEncodeJITFn(rtSkip).fn;
    const fromJson = buildJsonDecodeJITFn(rtSkip).fn;
    const typeValue = {
        name: 'hello',
        methodProp: () => 'hello',
        [Symbol('test')]: 'hello',
    };
    expect(fromJson(toJson(typeValue))).toEqual({name: 'hello'});
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = {
        startDate: new Date(),
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
    };
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);

    const typeValue2 = {
        startDate: new Date(),
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        optionalString: 'hello',
    };
    const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
    expect(roundTrip2).toEqual(typeValue2);
});

it('object with repeated property types', () => {
    interface I {
        name: string;
        surname: string;
        startDate?: Date;
        bigN?: bigint;
        dates?: Date[];
    }

    const rtI = runType<I>();
    const validate = buildIsTypeJITFn(rtI).fn;
    expect(validate({name: 'John', surname: 'Doe'})).toBe(true);

    const valWithErrors = buildTypeErrorsJITFn(rtI).fn;
    expect(valWithErrors({name: 'John', surname: 'Doe'})).toEqual([]);

    const toJson = buildJsonEncodeJITFn(rtI).fn;
    const fromJson = buildJsonDecodeJITFn(rtI).fn;
    const typeValue = {name: 'John', surname: 'Doe'};
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);

    const jsonStringify = buildJsonStringifyJITFn(rtI).fn;
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    const mocked = rt.mock();
    expect(mocked).toHaveProperty('startDate');
    expect(mocked).toHaveProperty('quantity');
    expect(mocked).toHaveProperty('name');
    expect(mocked).toHaveProperty('nullValue');
    expect(mocked).toHaveProperty('stringArray');
    expect(mocked).toHaveProperty('bigInt');
    expect(mocked).toHaveProperty("weird prop name \n?>'\\\t\r");
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(rt.mock())).toBe(true);
});
