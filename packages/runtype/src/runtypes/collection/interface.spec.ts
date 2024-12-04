/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';
import {BaseRunType} from '../../lib/baseRunTypes';

describe('Interface', () => {
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

    interface objectSkipProps {
        name: string;
        methodProp: () => any;
    }

    type ObjectAllOptional = {
        a?: string;
        b?: number;
    };

    const rt = runType<ObjectType>();
    const rtSkip = runType<objectSkipProps>();
    const rtOpt = runType<ObjectAllOptional>();

    it('validate object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);

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
                deep: {
                    a: 'hello',
                    b: 123,
                },
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
        expect(validate(null)).toBe(false);
    });

    it('validate empty object for ObjectAllOptional type', () => {
        const validate = rtOpt.createJitFunction(JitFnIDs.isType);
        expect(validate({})).toBe(true);
        // there is extra JIT code generated when all properties are optional
        // empty arrays also have typeof 'object' so we need to differentiate between them
        expect(validate([])).toBe(false);
    });

    it('validate object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
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
            {path: ['nullValue'], expected: 'null'},
            {path: ['stringArray'], expected: 'array'},
            {path: ['bigInt'], expected: 'bigint'},
            {path: [`weird prop name \n?>'\\\t\r`], expected: 'string'},
        ]);
        expect(valWithErrors({})).toEqual([
            {path: ['startDate'], expected: 'date'},
            {path: ['quantity'], expected: 'number'},
            {path: ['name'], expected: 'string'},
            {path: ['nullValue'], expected: 'null'},
            {path: ['stringArray'], expected: 'array'},
            {path: ['bigInt'], expected: 'bigint'},
            {path: [`weird prop name \n?>'\\\t\r`], expected: 'string'},
        ]);
        expect(valWithErrors('hello')).toEqual([
            {
                path: [],
                expected: `object`,
            },
        ]);
        expect(
            valWithErrors({
                startDate: new Date(),
                quantity: 123,
                name: 'hello',
                nullValue: null,
                stringArray: ['a', 'b', 'c'],
                bigInt: BigInt(123),
                "weird prop name \n?>'\\\t\r": 'hello2',
                deep: {
                    a: 123, // should be string
                    b: 'hello', // should be number
                },
            })
        ).toEqual([
            {path: ['deep', 'a'], expected: 'string'},
            {path: ['deep', 'b'], expected: 'number'},
        ]);
    });

    it('validate object + errors for null', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors(null)).toEqual([{path: [], expected: 'object'}]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const typeValue = {
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
        };
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy = {...typeValue};
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy))))).toEqual(typeValue);
    });

    // TODO: decide if we want to serialise some properties that are usually skipped by json
    it('skip props when encode/decode to json', () => {
        const toJson = rtSkip.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtSkip.createJitFunction(JitFnIDs.jsonDecode);
        const jsonStringify = rtSkip.createJitFunction(JitFnIDs.jsonStringify);
        const typeValue = {
            name: 'hello',
            methodProp: () => 'hello',
            [Symbol('test')]: 'hello',
        };
        expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue))))).toEqual({name: 'hello'});
        expect(fromJson(JSON.parse(jsonStringify(typeValue)))).toEqual({name: 'hello'});
    });

    it('json encode/decode should be marked as noop when there are no actions required', () => {
        interface NoJsonENCDECRequired {
            a: number;
            b: string;
        }
        interface sonENCDECRequired {
            a: bigint;
            c: Date;
        }

        const rtNoop = runType<NoJsonENCDECRequired>() as BaseRunType;
        const rtEncRequired = runType<sonENCDECRequired>() as BaseRunType;
        expect(rtNoop.getJitCompiledOperation(JitFnIDs.jsonEncode).isNoop).toBe(true);
        expect(rtNoop.getJitCompiledOperation(JitFnIDs.jsonDecode).isNoop).toBe(true);
        expect(rtEncRequired.getJitCompiledOperation(JitFnIDs.jsonEncode).isNoop).toBe(false);
        expect(rtEncRequired.getJitCompiledOperation(JitFnIDs.jsonDecode).isNoop).toBe(false);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
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

    it('json stringify must set optional properties first in order to work properly', () => {
        type Obj1 = {
            a: string;
            b?: string;
        };
        const rtObj1 = runType<Obj1>();
        const jsonStringify = rtObj1.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rtObj1.createJitFunction(JitFnIDs.jsonDecode);

        const typeValue: Obj1 = {a: 'helloA', b: 'helloB'};
        const json = jsonStringify(typeValue);
        expect(json).toEqual(`{"b":"helloB","a":"helloA"}`);
        expect(fromJson(JSON.parse(json))).toEqual(typeValue);

        const typeValue2: Obj1 = {a: 'helloA'};
        const json2 = jsonStringify(typeValue2);
        expect(json2).toEqual(`{"a":"helloA"}`);
        expect(fromJson(JSON.parse(json2))).toEqual(typeValue2);
    });

    it('json stringify should work when all fields are optional', () => {
        type Obj2 = {
            a?: string;
            b?: string;
        };
        const rtObj1 = runType<Obj2>();
        const jsonStringify = rtObj1.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rtObj1.createJitFunction(JitFnIDs.jsonDecode);

        const typeValue: Obj2 = {a: 'helloA', b: 'helloB'};
        const json = jsonStringify(typeValue);
        expect(json).toEqual(`{"a":"helloA","b":"helloB"}`);
        expect(fromJson(JSON.parse(json))).toEqual(typeValue);

        const typeValue2: Obj2 = {a: 'helloA'};
        const json2 = jsonStringify(typeValue2);
        expect(json2).toEqual(`{"a":"helloA"}`);
        expect(fromJson(JSON.parse(json2))).toEqual(typeValue2);
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
        const validate = rtI.createJitFunction(JitFnIDs.isType);
        expect(validate({name: 'John', surname: 'Doe'})).toBe(true);

        const valWithErrors = rtI.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors({name: 'John', surname: 'Doe'})).toEqual([]);

        const toJson = rtI.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtI.createJitFunction(JitFnIDs.jsonDecode);
        const typeValue = {name: 'John', surname: 'Doe'};
        expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue))))).toEqual(typeValue);

        const jsonStringify = rtI.createJitFunction(JitFnIDs.jsonStringify);
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
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with strict modes', () => {
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

    const obj: ObjectType = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
    };

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

    const objWithExtraDeep = {
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
            cExtra: true,
        },
    };

    it('validate hasUnknownKeys', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);

        expect(validate(obj)).toBe(true);
        expect(hasUnknownKeys(obj)).toBe(false);

        expect(validate(objWithExtra)).toBe(true);
        expect(hasUnknownKeys(objWithExtra)).toBe(true);
        expect(hasUnknownKeys(objWithExtraDeep)).toBe(true);
    });

    it('get unknown keys', () => {
        const getUnknownKeyErrors = rt.createJitFunction(JitFnIDs.unknownKeyErrors);
        expect(getUnknownKeyErrors(obj)).toEqual([]);

        // unknown key are always type 'never', we might want to investigate if returning other kind of error, as returning always same thing might be a bit useless
        expect(getUnknownKeyErrors(objWithExtra)).toEqual([
            {path: ['someExtra'], expected: 'never'},
            {path: ['someExtra2'], expected: 'never'},
            {path: ["extra weird prop name \n?>'\\\t\r"], expected: 'never'},
            {path: ['deep', 'cExtra'], expected: 'never'},
        ]);
        expect(getUnknownKeyErrors(objWithExtraDeep)).toEqual([{path: ['deep', 'cExtra'], expected: 'never'}]);
    });

    it.todo('hasunknowkeys is generating code that is not needed, stringArray property generates extra function that is empty');

    it('encode/decode to json safeJson', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);
        const unknownKeysToUndefined = rt.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const stripUnknownKeys = rt.createJitFunction(JitFnIDs.stripUnknownKeys);
        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return fromJson(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return fromJson(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return fromJson(val);
        };

        const jsonString = JSON.stringify(toJson(structuredClone(objWithExtra)));
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = JSON.parse(jsonString);
        const copy2 = JSON.parse(jsonString);
        const copy3 = JSON.parse(jsonString);
        const copy4 = JSON.parse(jsonString);

        const extraWithUndefined = structuredClone(objWithExtra) as any;
        extraWithUndefined.someExtra = undefined;
        extraWithUndefined.someExtra2 = undefined;
        extraWithUndefined["extra weird prop name \n?>'\\\t\r"] = undefined;
        extraWithUndefined.deep.cExtra = undefined;

        const extraWithStrip = structuredClone(objWithExtra) as any;
        delete extraWithStrip.someExtra;
        delete extraWithStrip.someExtra2;
        delete extraWithStrip["extra weird prop name \n?>'\\\t\r"];
        delete extraWithStrip.deep.cExtra;

        expect(fromJson(copy1)).toEqual(objWithExtra);
        expect(() => fromJsonSafeThrow(copy2)).toThrow('Unknown properties in JSON');
        expect(fromJsonSafeUndefined(copy3)).toEqual(extraWithUndefined);
        expect(fromJsonSafeStrip(copy4)).toEqual(extraWithStrip);
    });

    it('encode/decode to json safeJson deep', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);
        const unknownKeysToUndefined = rt.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const stripUnknownKeys = rt.createJitFunction(JitFnIDs.stripUnknownKeys);
        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return fromJson(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return fromJson(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return fromJson(val);
        };

        const jsonString2 = JSON.stringify(toJson(structuredClone(objWithExtraDeep)));
        const copyD1 = JSON.parse(jsonString2);
        const copyD2 = JSON.parse(jsonString2);
        const copyD3 = JSON.parse(jsonString2);
        expect(() => fromJsonSafeThrow(copyD1)).toThrow('Unknown properties in JSON');
        expect(fromJsonSafeUndefined(copyD2)).toEqual({
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
                cExtra: undefined,
            },
        });
        expect(fromJsonSafeStrip(copyD3)).toEqual({
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

    it('json stringify to strip extra params without fail', () => {
        // json stringify automatically strips unknown keys
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const jsonString = jsonStringify(objWithExtra);
        const roundTrip = fromJson(JSON.parse(jsonString));
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
});

describe('Interface with circular ref properties', () => {
    interface ICircular {
        name: string;
        child?: ICircular;
    }

    const rt = runType<ICircular>();

    it('validate circular object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        expect(validate(obj)).toBe(true);
    });

    it('validate circular object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        expect(valWithErrors(obj)).toEqual([]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy = {...obj};
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy))))).toEqual(obj);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        const roundTrip = fromJson(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parent === 'undefined' || typeof mocked.parent === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with circular ref type array', () => {
    interface ICircularArray {
        name: string;
        children?: ICircularArray[];
    }

    const rt = runType<ICircularArray>();

    it('validate circular interface on array', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);
        const obj3 = {name: 'hello', children: [{name: 123}]};
        const obj4 = {name: 'hello', children: [123]};
        expect(validate(obj3)).toBe(false);
        expect(validate(obj4)).toBe(false);
    });

    it('validate circular interface on array + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {name: 'hello', children: [{name: 123}, {name: 'world', children: null}]};
        const obj4 = {name: 'hello', children: [123]};
        expect(valWithErrors(obj3)).toEqual([
            {path: ['children', 0, 'name'], expected: 'string'},
            {path: ['children', 1, 'children'], expected: 'array'},
        ]);
        expect(valWithErrors(obj4)).toEqual([{path: ['children', 0], expected: 'object'}]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = {...obj1};
        const copy2 = {...obj2};
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(obj1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(obj2);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        const roundTrip1 = fromJson(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    // todo: max comp size exceeded, this is because we are generating a full array with all recursive items with more array with recursive items.
    // so the fix would be ti reduce the probability of generating an optional property the deeper we go.
    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parents === 'undefined' || Array.isArray(mocked.parents)).toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with nested circular type', () => {
    interface ICircularDeep {
        name: string;
        embedded: {
            hello: string;
            child?: ICircularDeep;
        };
    }
    const rt = runType<ICircularDeep>();

    it('validate circular interface on nested object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);

        const obj3 = {name: 'hello', embedded: {hello: 123}};
        const obj4 = {name: 'hello', embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 123}}}};
        expect(validate(obj3)).toBe(false);
        expect(validate(obj4)).toBe(false);
    });

    it('validate circular interface on nested object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {name: 'hello', embedded: {hello: 123}};
        const obj4 = {name: 'hello', embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 123}}}};
        expect(valWithErrors(obj3)).toEqual([{path: ['embedded', 'hello'], expected: 'string'}]);
        expect(valWithErrors(obj4)).toEqual([{path: ['embedded', 'child', 'embedded', 'hello'], expected: 'string'}]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = {...obj1};
        const copy2 = {...obj2};
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(obj1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(obj2);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        const roundTrip1 = fromJson(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(mocked).toHaveProperty('embedded');
        expect(typeof mocked.embedded.child === 'undefined' || typeof mocked.embedded.child === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with nested circular type where root is not the circular ref', () => {
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

    it('validate circular interface that is not the root object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const obj1: RootNotCircular = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}};
        const obj2: RootNotCircular = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {
                    hello: 'world',
                    child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}},
                },
            },
        };
        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);

        const obj3 = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}};
        const obj4 = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
            },
        };
        const obj5 = {isRoot: false, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world', child: 123}}};
        expect(validate(obj3)).toBe(false);
        expect(validate(obj4)).toBe(false);
        expect(validate(obj5)).toBe(false);
    });

    it('validate circular interface that is not the root object object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const obj1: RootNotCircular = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}};
        const obj2: RootNotCircular = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
        };
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}};
        const obj4 = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
            },
        };
        const obj5 = {isRoot: false, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world', child: 123}}};
        expect(valWithErrors(obj3)).toEqual([{path: ['ciChild', 'embedded', 'hello'], expected: 'string'}]);
        expect(valWithErrors(obj4)).toEqual([{path: ['ciChild', 'embedded', 'child', 'embedded', 'hello'], expected: 'string'}]);
        expect(valWithErrors(obj5)).toEqual([
            {path: ['isRoot'], expected: 'literal'},
            {path: ['ciChild', 'embedded', 'child'], expected: 'object'},
        ]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj1: RootNotCircular = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}};
        const obj2: RootNotCircular = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
        };
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = structuredClone(obj1);
        const copy2 = structuredClone(obj2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(obj1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(obj2);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj1: RootNotCircular = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}};
        const obj2: RootNotCircular = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
        };
        const roundTrip1 = fromJson(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('isRoot');
        expect(mocked).toHaveProperty('ciChild');
        expect(typeof mocked.ciChild.child === 'undefined' || typeof mocked.ciChild.child === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with nested circular + multiple circular', () => {
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

    it('validate circular interface that is not the root object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const ciDate: ICircularDate = {date: new Date(), month: 1, year: 2021};
        const obj1: RootCircular = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}, ciDate};
        const obj2: RootCircular = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {
                    hello: 'world',
                    child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}},
                },
            },
            ciDate,
        };
        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);

        const obj3 = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}};
        const obj4 = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
            },
        };
        const obj5 = {isRoot: false, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world', child: 123}}};
        expect(validate(obj3)).toBe(false);
        expect(validate(obj4)).toBe(false);
        expect(validate(obj5)).toBe(false);
    });

    it('validate circular interface that is not the root object object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const ciDate: ICircularDate = {
            date: new Date(),
            month: 1,
            year: 2021,
            embedded: {date: new Date(), month: 1, year: 2021},
        };
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
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}; // missing ciDate as well
        const obj4 = {
            isRoot: true,
            ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
            },
            ciDate,
        };
        const obj5 = {isRoot: false, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world', child: 123}}, ciDate};
        expect(valWithErrors(obj3)).toEqual([
            {path: ['ciChild', 'embedded', 'hello'], expected: 'string'},
            {path: ['ciDate'], expected: 'object'},
        ]);
        expect(valWithErrors(obj4)).toEqual([{path: ['ciChild', 'embedded', 'child', 'embedded', 'hello'], expected: 'string'}]);
        expect(valWithErrors(obj5)).toEqual([
            {path: ['isRoot'], expected: 'literal'},
            {path: ['ciChild', 'embedded', 'child'], expected: 'object'},
        ]);

        // wrong ciDate
        obj5.ciDate = {date: 'fello', month: 1, year: 2021, embedded: true} as any;
        expect(valWithErrors(obj5)).toEqual([
            {path: ['isRoot'], expected: 'literal'},
            {path: ['ciChild', 'embedded', 'child'], expected: 'object'},
            {path: ['ciDate', 'date'], expected: 'date'},
            {path: ['ciDate', 'embedded'], expected: 'object'},
        ]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
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
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = structuredClone(obj1);
        const copy2 = structuredClone(obj2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(obj1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(obj2);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
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
        const roundTrip1 = fromJson(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('isRoot');
        expect(mocked).toHaveProperty('ciChild');
        expect(typeof mocked.ciChild.child === 'undefined' || typeof mocked.ciChild.child === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with circular ref tuple', () => {
    interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
    }

    const rt = runType<ICircularTuple>();

    it('validate circular interface on tuple', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);

        const obj3 = {name: 'hello', parent: ['world', 123]};
        const obj4 = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', 123]}]};
        expect(validate(obj3)).toBe(false);
        expect(validate(obj4)).toBe(false);
    });

    it('validate circular interface on tuple + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {name: 'hello', parent: ['world', 123]};
        const obj4 = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', 123]}]};
        expect(valWithErrors(obj3)).toEqual([{path: ['parent', 1], expected: 'object'}]);
        expect(valWithErrors(obj4)).toEqual([{path: ['parent', 1, 'parent', 1], expected: 'object'}]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = structuredClone(obj1);
        const copy2 = structuredClone(obj2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(obj1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(obj2);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        const roundTrip1 = fromJson(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parent === 'undefined' || Array.isArray(mocked.parent)).toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});
