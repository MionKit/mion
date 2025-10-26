/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../createRunType';
import {JitFunctions} from '../../constants.functions';
import {BaseRunType} from '../../lib/baseRunTypes';

describe('Array', () => {
    const rt = runType<string[]>();
    const rD = runType<Date[]>();

    it('validate string[]', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate([])).toBe(true);
        expect(validate(['hello', 'world'])).toBe(true);
        expect(validate(['hello', 2])).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate string[] + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors(['hello', 'world'])).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'array'}]);
        expect(valWithErrors(['hello', 123])).toEqual([{path: [1], expected: 'string'}]);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked instanceof Array).toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('Array with multiple dimensions', () => {
    const rt = runType<string[][]>();

    it('validate string[][]', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate([])).toBe(true);
        expect(validate([[]])).toBe(true);
        expect(
            validate([
                ['hello', 'world'],
                ['a', 'b'],
            ])
        ).toBe(true);
        expect(validate([['hello', 2]])).toBe(false);
        expect(validate(['hello'])).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate string[][] + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors([])).toEqual([]);
        expect(valWithErrors([[]])).toEqual([]);
        expect(
            valWithErrors([
                ['hello', 'world'],
                ['a', 'b'],
            ])
        ).toEqual([]);
        expect(valWithErrors([['hello', 2]])).toEqual([{path: [0, 1], expected: 'string'}]);
        expect(valWithErrors(['hello'])).toEqual([{path: [0], expected: 'array'}]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'array'}]);
        expect(valWithErrors(['hello', 'world'])).toEqual([
            {path: [0], expected: 'array'},
            {path: [1], expected: 'array'},
        ]);
    });

    it('mock', async () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const mocked = await rt.mock();
        expect(mocked instanceof Array).toBe(true);
        expect(validate(mocked)).toBe(true);
    });
});

describe('test array strict modes', () => {
    type ObjectType = {
        a: string;
        deep?: {
            b: string;
            c: number;
        };
    };

    type ObjTArr = ObjectType[];

    const arr: ObjTArr = [
        {a: 'hello', deep: {b: 'world', c: 123}},
        {a: 'world', deep: {b: 'world', c: 456}},
    ];

    const arrWithExtraDeep = structuredClone(arr) as any;
    arrWithExtraDeep[0].extraA = 'extraA';
    arrWithExtraDeep[0].deep.extraB = 'extraB';

    const rt = runType<ObjTArr>();
    const rtSimple = runType<string[]>();

    it('array hasUnknownKeys', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);

        expect(validate(arr)).toBe(true);
        expect(hasUnknownKeys(arr)).toBe(false);

        expect(hasUnknownKeys(arrWithExtraDeep)).toBe(true);
    });

    it('simple array hasUnknownKeys on array with non objects', () => {
        const validate = rtSimple.createJitFunction(JitFunctions.isType);
        const hasUnknownKeys = rtSimple.createJitFunction(JitFunctions.hasUnknownKeys);

        expect(hasUnknownKeys([])).toBe(false);
        expect(hasUnknownKeys(['hello', 'world', {hello: 'world'}])).toBe(false);
        expect(validate(['hello', 'world', {hello: 'world'}])).toBe(false); // is not string[]
    });

    it('array visitUnknownKeyErrors', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const getUnknownKeys = rt.createJitFunction(JitFunctions.unknownKeyErrors);

        expect(validate(arr)).toBe(true);
        expect(getUnknownKeys(arr)).toEqual([]);

        expect(validate(arrWithExtraDeep)).toBe(true); // type is ok but has unknown keys
        expect(getUnknownKeys(arrWithExtraDeep)).toEqual([
            {path: [0, 'extraA'], expected: 'never'},
            {path: [0, 'deep', 'extraB'], expected: 'never'},
        ]);
    });

    it('simple array visitUnknownKeyErrors on array with non objects', () => {
        const validate = rtSimple.createJitFunction(JitFunctions.isType);
        const getUnknownKeys = rtSimple.createJitFunction(JitFunctions.unknownKeyErrors);

        expect(getUnknownKeys([])).toEqual([]);
        expect(getUnknownKeys(['hello', 'world', {hello: 'world'}])).toEqual([]);
        expect(validate(['hello', 'world', {hello: 'world'}])).toBe(false); // is not string[]
    });

    it('simple array visitStripUnknownKeys visitUnknownKeysToUndefined', () => {
        const stripUnknownKeys = rtSimple.createJitFunction(JitFunctions.stripUnknownKeys);
        const unknownKeysToUndefined = rtSimple.createJitFunction(JitFunctions.unknownKeysToUndefined);
        const validate = rtSimple.createJitFunction(JitFunctions.isType);

        const wrongArray = ['hello', 'world', {hello: 'world'}];
        expect(validate(wrongArray)).toBe(false);

        // should do nothing as there are no unknown keys even if type is wrong
        expect(stripUnknownKeys(wrongArray)).toEqual(wrongArray);
        expect(unknownKeysToUndefined(wrongArray)).toEqual(wrongArray);
    });

    it('stripUnknownKeys and unknownKeysToUndefined', () => {
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

        const jsonString2 = JSON.stringify(prepareForJson(structuredClone(arrWithExtraDeep)));
        const copyD1 = JSON.parse(jsonString2);
        const copyD2 = JSON.parse(jsonString2);
        const copyD3 = JSON.parse(jsonString2);
        expect(() => fromJsonSafeThrow(copyD1)).toThrow('Unknown properties in JSON');
        expect(fromJsonSafeUndefined(copyD2)).toEqual([
            {a: 'hello', deep: {b: 'world', c: 123}, extraA: undefined},
            {a: 'world', deep: {b: 'world', c: 456, extraB: undefined}},
        ]);
        expect(fromJsonSafeStrip(copyD3)).toEqual([
            {a: 'hello', deep: {b: 'world', c: 123}},
            {a: 'world', deep: {b: 'world', c: 456}},
        ]);
    });
});

describe('test array strict modes + circular reference', () => {
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

    const objWithExtraDeep = structuredClone(obj) as any;
    objWithExtraDeep.extraA = 'extraA';
    objWithExtraDeep.deep.extraB = 'extraB';

    const rt = runType<ObjectType>();

    it('validate object hasUnknownKeys', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);

        expect(validate(obj)).toBe(true);
        expect(hasUnknownKeys(obj)).toBe(false);

        expect(validate(objWithExtra)).toBe(true);
        expect(hasUnknownKeys(objWithExtra)).toBe(true);
        expect(hasUnknownKeys(objWithExtraDeep)).toBe(true);
    });

    it('stripUnknownKeys and unknownKeysToUndefined', () => {
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
        extraWithUndefined.extraA = undefined;

        const extraWithStrip = structuredClone(objWithExtra) as any;
        delete extraWithStrip.extraA;

        expect(restoreFromJson(copy1)).toEqual(objWithExtra);
        expect(() => fromJsonSafeThrow(copy2)).toThrow('Unknown properties in JSON');
        expect(fromJsonSafeUndefined(copy3)).toEqual(extraWithUndefined);
        expect(fromJsonSafeStrip(copy4)).toEqual(extraWithStrip);
    });

    it('stripUnknownKeys and unknownKeysToUndefined deep', () => {
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
            a: 'hello',
            deep: {
                b: 'world',
                c: 123,
                extraB: undefined,
            },
            d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
            extraA: undefined,
        });
        expect(fromJsonSafeStrip(copyD3)).toEqual({
            a: 'hello',
            deep: {
                b: 'world',
                c: 123,
            },
            d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
        });
    });
});

describe('Array circular ref', () => {
    // this type is not really useful as only allows empty array
    // but it is the only valid test for circular references in the array runType
    // other more common circular array involves unions and are tested there i.e: types CS = (CS | string)[]
    type CircularArray = CircularArray[];
    const rt = runType<CircularArray>();

    it('validate CircularArray', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const arr: CircularArray = [[[[]]], [[]], []];
        expect(validate(arr)).toBe(true);
    });

    it('validate CircularArray + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const arr: CircularArray = [];
        arr.push([[[]]]);
        expect(valWithErrors(arr)).toEqual([]);

        arr.push('A' as any);
        arr[0].push('A' as any);
        expect(valWithErrors(arr)).toEqual([
            {path: [0, 1], expected: 'array'},
            {path: [1], expected: 'array'},
        ]);
    });

    it('mock CircularArray', async () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const mocked = await rt.mock();
        expect(mocked instanceof Array).toBe(true);
        expect(validate(mocked)).toBe(true);
    });
});
