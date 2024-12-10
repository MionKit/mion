/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';
import {BaseRunType} from '../../lib/baseRunTypes';

describe('Array', () => {
    const rt = runType<string[]>();
    const rD = runType<Date[]>();

    it('validate string[]', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate([])).toBe(true);
        expect(validate(['hello', 'world'])).toBe(true);
        expect(validate(['hello', 2])).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate string[] + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors(['hello', 'world'])).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'array'}]);
        expect(valWithErrors(['hello', 123])).toEqual([{path: [1], expected: 'string'}]);
    });

    it('encode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const typeValue = ['hello', 'world'];
        expect(toJsonVal(typeValue)).toEqual(typeValue);
        expect((rt as BaseRunType).getJitCompiledOperation(JitFnIDs.toJsonVal).isNoop).toBe(true);
    });

    it('decode from json', () => {
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = ['hello', 'world'];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJsonVal(json)).toEqual(typeValue);
        expect((rt as BaseRunType).getJitCompiledOperation(JitFnIDs.fromJsonVal).isNoop).toBe(true);
    });

    it('encode to json date', () => {
        const toJsonVal = rD.createJitFunction(JitFnIDs.toJsonVal);
        const typeValue = [new Date(), new Date()];
        expect(toJsonVal(typeValue)).toBe(typeValue);
        expect((rD as BaseRunType).getJitCompiledOperation(JitFnIDs.toJsonVal).isNoop).toBe(true);
    });

    it('decode from json date', () => {
        const fromJsonVal = rD.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = [new Date(), new Date()];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJsonVal(json)).toEqual(typeValue);
        expect((rD as BaseRunType).getJitCompiledOperation(JitFnIDs.fromJsonVal).isNoop).toBe(false);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = ['hello', 'world'];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = [];
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('mock', () => {
        expect(rt.mock() instanceof Array).toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Array with multiple dimensions', () => {
    const rt = runType<string[][]>();

    it('validate string[][]', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
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
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
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

    it('encode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const typeValue = [['hello', 'world'], ['a', 'b'], []];
        expect(toJsonVal(typeValue)).toEqual(typeValue);
    });

    it('decode from json', () => {
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = [['hello', 'world'], ['a', 'b'], []];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJsonVal(json)).toEqual(typeValue);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = [['hello', 'world'], ['a', 'b'], []];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = [];
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('mock', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(rt.mock() instanceof Array).toBe(true);
        expect(validate(rt.mock())).toBe(true);
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
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);

        expect(validate(arr)).toBe(true);
        expect(hasUnknownKeys(arr)).toBe(false);

        expect(hasUnknownKeys(arrWithExtraDeep)).toBe(true);
    });

    it('simple array hasUnknownKeys on array with non objects', () => {
        const validate = rtSimple.createJitFunction(JitFnIDs.isType);
        const hasUnknownKeys = rtSimple.createJitFunction(JitFnIDs.hasUnknownKeys);

        expect(hasUnknownKeys([])).toBe(false);
        expect(hasUnknownKeys(['hello', 'world', {hello: 'world'}])).toBe(false);
        expect(validate(['hello', 'world', {hello: 'world'}])).toBe(false); // is not string[]
    });

    it('array _compileUnknownKeyErrors', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const getUnknownKeys = rt.createJitFunction(JitFnIDs.unknownKeyErrors);

        expect(validate(arr)).toBe(true);
        expect(getUnknownKeys(arr)).toEqual([]);

        expect(validate(arrWithExtraDeep)).toBe(true); // type is ok but has unknown keys
        expect(getUnknownKeys(arrWithExtraDeep)).toEqual([
            {path: [0, 'extraA'], expected: 'never'},
            {path: [0, 'deep', 'extraB'], expected: 'never'},
        ]);
    });

    it('simple array _compileUnknownKeyErrors on array with non objects', () => {
        const validate = rtSimple.createJitFunction(JitFnIDs.isType);
        const getUnknownKeys = rtSimple.createJitFunction(JitFnIDs.unknownKeyErrors);

        expect(getUnknownKeys([])).toEqual([]);
        expect(getUnknownKeys(['hello', 'world', {hello: 'world'}])).toEqual([]);
        expect(validate(['hello', 'world', {hello: 'world'}])).toBe(false); // is not string[]
    });

    it('simple array _compileStripUnknownKeys _compileUnknownKeysToUndefined', () => {
        const stripUnknownKeys = rtSimple.createJitFunction(JitFnIDs.stripUnknownKeys);
        const unknownKeysToUndefined = rtSimple.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const validate = rtSimple.createJitFunction(JitFnIDs.isType);

        const wrongArray = ['hello', 'world', {hello: 'world'}];
        expect(validate(wrongArray)).toBe(false);

        // should do nothing as there are no unknown keys even if type is wrong
        expect(stripUnknownKeys(wrongArray)).toEqual(wrongArray);
        expect(unknownKeysToUndefined(wrongArray)).toEqual(wrongArray);
    });

    it('encode/decode to json safeJson deep', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);
        const unknownKeysToUndefined = rt.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const stripUnknownKeys = rt.createJitFunction(JitFnIDs.stripUnknownKeys);
        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return fromJsonVal(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return fromJsonVal(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return fromJsonVal(val);
        };

        const jsonString2 = JSON.stringify(toJsonVal(structuredClone(arrWithExtraDeep)));
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
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);

        expect(validate(obj)).toBe(true);
        expect(hasUnknownKeys(obj)).toBe(false);

        expect(validate(objWithExtra)).toBe(true);
        expect(hasUnknownKeys(objWithExtra)).toBe(true);
        expect(hasUnknownKeys(objWithExtraDeep)).toBe(true);
    });

    it('encode/decode to json safeJson', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);
        const unknownKeysToUndefined = rt.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const stripUnknownKeys = rt.createJitFunction(JitFnIDs.stripUnknownKeys);
        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return fromJsonVal(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return fromJsonVal(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return fromJsonVal(val);
        };

        const jsonString = JSON.stringify(toJsonVal(structuredClone(objWithExtra)));
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = JSON.parse(jsonString);
        const copy2 = JSON.parse(jsonString);
        const copy3 = JSON.parse(jsonString);
        const copy4 = JSON.parse(jsonString);

        const extraWithUndefined = structuredClone(objWithExtra) as any;
        extraWithUndefined.extraA = undefined;

        const extraWithStrip = structuredClone(objWithExtra) as any;
        delete extraWithStrip.extraA;

        expect(fromJsonVal(copy1)).toEqual(objWithExtra);
        expect(() => fromJsonSafeThrow(copy2)).toThrow('Unknown properties in JSON');
        expect(fromJsonSafeUndefined(copy3)).toEqual(extraWithUndefined);
        expect(fromJsonSafeStrip(copy4)).toEqual(extraWithStrip);
    });

    it('encode/decode to json safeJson deep', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);
        const unknownKeysToUndefined = rt.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const stripUnknownKeys = rt.createJitFunction(JitFnIDs.stripUnknownKeys);
        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return fromJsonVal(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return fromJsonVal(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return fromJsonVal(val);
        };

        const jsonString2 = JSON.stringify(toJsonVal(structuredClone(objWithExtraDeep)));
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

    it('json stringify to strip extra params without fail', () => {
        // json stringify automatically strips unknown keys
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
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
});

describe('Array circular ref', () => {
    // this type is not really useful as only allows empty array
    // but it is the only valid test for circular references in the array runType
    // other more common circular array involves unions and are tested there i.e: types CS = (CS | string)[]
    type CircularArray = CircularArray[];
    const rt = runType<CircularArray>();

    it('validate CircularArray', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const arr: CircularArray = [[[[]]], [[]], []];
        expect(validate(arr)).toBe(true);
    });

    it('validate CircularArray + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const arr: CircularArray = [];
        arr.push([]);
        arr[0].push([]);
        arr[0][0].push([]);
        expect(valWithErrors(arr)).toEqual([]);

        arr.push('A' as any);
        arr[0].push('A' as any);
        expect(valWithErrors(arr)).toEqual([
            {path: [0, 1], expected: 'array'},
            {path: [1], expected: 'array'},
        ]);
    });

    it('encode CircularArray to json', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const arr: CircularArray = [];
        arr.push([]);
        arr[0].push([]);
        arr[0][0].push([]);
        expect(toJsonVal(arr)).toEqual(arr);
    });

    it('decode CircularArray from json', () => {
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const arr: CircularArray = [];
        arr.push([]);
        arr[0].push([]);
        arr[0][0].push([]);
        const json = JSON.parse(JSON.stringify(arr));
        expect(fromJsonVal(json)).toEqual(arr);
    });

    it('json stringify CircularArray', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
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

    it('mock CircularArray', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(rt.mock() instanceof Array).toBe(true);
        expect(validate(rt.mock())).toBe(true);
    });
});
