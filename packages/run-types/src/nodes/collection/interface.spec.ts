/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../createRunType.ts';
import {JitFunctions} from '../../constants.functions.ts';
import {BaseRunType} from '../../lib/baseRunTypes.ts';

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
        const validate = rt.createJitFunction(JitFunctions.isType);

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
        class AllOpt {
            public a?: string;
            public b?: number;
        }
        const validate = rtOpt.createJitFunction(JitFunctions.isType);
        expect(validate({})).toBe(true);
        expect(validate(new AllOpt())).toBe(true);

        // there is extra JIT code generated when all properties are optional
        // empty arrays also have typeof 'object' so we need to differentiate between them
        expect(validate([])).toBe(false);
        // we need to make sure native objects are not accepted
        expect(validate(new Date())).toBe(false);
        expect(validate(new Map())).toBe(false);
        expect(validate(new Set())).toBe(false);
    });

    it('validate object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
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
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'object'}]);
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
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors(null)).toEqual([{path: [], expected: 'object'}]);
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
        const validate = rtI.createJitFunction(JitFunctions.isType);
        expect(validate({name: 'John', surname: 'Doe'})).toBe(true);

        const valWithErrors = rtI.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors({name: 'John', surname: 'Doe'})).toEqual([]);

        const prepareForJson = rtI.createJitFunction(JitFunctions.prepareForJson);
        const restoreFromJson = rtI.createJitFunction(JitFunctions.restoreFromJson);
        const typeValue = {name: 'John', surname: 'Doe'};
        expect(restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(typeValue))))).toEqual(typeValue);

        const stringifyJson = rtI.createJitFunction(JitFunctions.stringifyJson);
        const roundTrip = restoreFromJson(JSON.parse(stringifyJson(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked).toHaveProperty('startDate');
        expect(mocked).toHaveProperty('quantity');
        expect(mocked).toHaveProperty('name');
        expect(mocked).toHaveProperty('nullValue');
        expect(mocked).toHaveProperty('stringArray');
        expect(mocked).toHaveProperty('bigInt');
        expect(mocked).toHaveProperty("weird prop name \n?>'\\\t\r");
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });

    it('mock should mock data only and skip methods', async () => {
        const mocked = await rtSkip.mock();
        expect(mocked).toHaveProperty('name');
        expect(mocked).not.toHaveProperty('methodProp');
        const validate = rtSkip.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('Interface with unknown props', () => {
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
        const validate = rt.createJitFunction(JitFunctions.isType);
        const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);

        expect(validate(obj)).toBe(true);
        expect(hasUnknownKeys(obj)).toBe(false);

        expect(validate(objWithExtra)).toBe(true);
        expect(hasUnknownKeys(objWithExtra)).toBe(true);
        expect(hasUnknownKeys(objWithExtraDeep)).toBe(true);
    });

    it('get unknown keys', () => {
        const getUnknownKeyErrors = rt.createJitFunction(JitFunctions.unknownKeyErrors);
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

    it('safeJson (remove/undefine extra props)', () => {
        const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);
        const unknownKeysToUndefined = rt.createJitFunction(JitFunctions.unknownKeysToUndefined);
        const stripUnknownKeys = rt.createJitFunction(JitFunctions.stripUnknownKeys);
        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return restoreFromJson(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return restoreFromJson(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return restoreFromJson(val);
        };

        const jsonString = JSON.stringify(prepareForJson(structuredClone(objWithExtra)));
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

        expect(restoreFromJson(copy1)).toEqual(objWithExtra);
        expect(() => fromJsonSafeThrow(copy2)).toThrow('Unknown properties in JSON');
        expect(fromJsonSafeUndefined(copy3)).toEqual(extraWithUndefined);
        expect(fromJsonSafeStrip(copy4)).toEqual(extraWithStrip);
    });

    it('safeJson deep (remove/undefine extra props)', () => {
        const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);
        const unknownKeysToUndefined = rt.createJitFunction(JitFunctions.unknownKeysToUndefined);
        const stripUnknownKeys = rt.createJitFunction(JitFunctions.stripUnknownKeys);
        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return restoreFromJson(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return restoreFromJson(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return restoreFromJson(val);
        };

        const jsonString2 = JSON.stringify(prepareForJson(structuredClone(objWithExtraDeep)));
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
});

describe('Interface with unknown props and opts run time param', () => {
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

    const rt = runType<ObjectType>();

    it('hasUnknownKeys function accepts options parameter', () => {
        const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);

        const validObject = {
            startDate: new Date(),
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
        };
        const objectWithUnknownKeys = {
            startDate: new Date(),
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
            extra: 'value',
        };

        // Test with default options (empty object)
        expect(hasUnknownKeys(validObject, {})).toBe(false);
        expect(hasUnknownKeys(objectWithUnknownKeys, {})).toBe(true);

        // Test with custom options
        expect(hasUnknownKeys(validObject, {strict: true})).toBe(false);
        expect(hasUnknownKeys(objectWithUnknownKeys, {strict: true})).toBe(true);

        // Test with undefined options (should use default)
        expect(hasUnknownKeys(validObject)).toBe(false);
        expect(hasUnknownKeys(objectWithUnknownKeys)).toBe(true);
    });

    it('hasUnknownKeys function works with different option values', () => {
        const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);

        const objectWithUnknownKeys = {
            startDate: new Date(),
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
            extra: 'value',
            another: 'test',
        };

        // Test with various option objects
        expect(hasUnknownKeys(objectWithUnknownKeys, {mode: 'strict'})).toBe(true);
        expect(hasUnknownKeys(objectWithUnknownKeys, {allowExtra: false})).toBe(true);
        expect(hasUnknownKeys(objectWithUnknownKeys, {customFlag: true, nested: {value: 42}})).toBe(true);
    });
});

describe('Callable Interface', () => {
    type CallableInterface = {
        (a: number, b: boolean): string;
        extraProp1: string;
        extraProp2: number;
    };

    const rt = runType<CallableInterface>();

    it('validate callable interface', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const obj: CallableInterface = Object.assign((a: number, b: boolean) => 'hello', {
            extraProp1: 'value1',
            extraProp2: 42,
        });

        expect(validate(obj)).toBe(true);

        expect(obj.extraProp1).toBe('value1');
        expect(obj.extraProp2).toBe(42);
    });

    it('validate callable interface + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const obj: CallableInterface = Object.assign((a: number, b: boolean) => 'hello', {
            extraProp1: 'value1',
            extraProp2: 42,
        });

        expect(valWithErrors(obj)).toEqual([]);
    });

    it('mock should throw an error', async () => {
        await expect(() => rt.mock()).rejects.toThrow('Mock is not allowed, call mockParams or mockReturn instead.');
    });
});

describe('Interface with circular ref properties', () => {
    interface ICircular {
        name: string;
        child?: ICircular;
    }

    const rt = runType<ICircular>();

    it('validate circular object', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        expect(validate(obj)).toBe(true);
    });

    it('validate circular object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        expect(valWithErrors(obj)).toEqual([]);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parent === 'undefined' || typeof mocked.parent === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('Interface with circular ref type array', () => {
    interface ICircularArray {
        name: string;
        children?: ICircularArray[];
    }

    const rt = runType<ICircularArray>();

    it('validate circular interface on array', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
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
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
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

    // todo: max comp size exceeded, this is because we are generating a full array with all recursive items with more array with recursive items.
    // so the fix would be ti reduce the probability of generating an optional property the deeper we go.
    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parents === 'undefined' || Array.isArray(mocked.parents)).toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
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
        const validate = rt.createJitFunction(JitFunctions.isType);
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
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
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

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(mocked).toHaveProperty('embedded');
        expect(typeof mocked.embedded.child === 'undefined' || typeof mocked.embedded.child === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
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
        const validate = rt.createJitFunction(JitFunctions.isType);
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
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
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

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked).toHaveProperty('isRoot');
        expect(mocked).toHaveProperty('ciChild');
        expect(typeof mocked.ciChild.child === 'undefined' || typeof mocked.ciChild.child === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
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
        const validate = rt.createJitFunction(JitFunctions.isType);
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
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
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

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked).toHaveProperty('isRoot');
        expect(mocked).toHaveProperty('ciChild');
        expect(typeof mocked.ciChild.child === 'undefined' || typeof mocked.ciChild.child === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('Interface with circular ref tuple', () => {
    interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
    }

    const rt = runType<ICircularTuple>();

    it('validate circular interface on tuple', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
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
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {name: 'hello', parent: ['world', 123]};
        const obj4 = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', 123]}]};
        expect(valWithErrors(obj3)).toEqual([{path: ['parent', 1], expected: 'object'}]);
        expect(valWithErrors(obj4)).toEqual([{path: ['parent', 1, 'parent', 1], expected: 'object'}]);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parent === 'undefined' || Array.isArray(mocked.parent)).toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});
