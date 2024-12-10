/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

function cloneSet<T>(set: Set<T>): Set<T> {
    const copyValues = Array.from(set.values()).map((v) => structuredClone(v));
    return new Set(copyValues);
}

describe('SerRunType with simple keys Set<string>', () => {
    const testSet = new Set<string>(['one', 'two', 'three']);
    const rt = runType<Set<string>>();

    it('validate Set', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(testSet)).toBe(true);

        const notSet = 'hello';
        const wrongValue = new Set([1, 2, 3]); // expecting strings

        expect(validate(notSet)).toBe(false);
        expect(validate(wrongValue)).toBe(false);
    });

    it('validate empty Set', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(new Set())).toBe(true);
    });

    it('Get Set<string> errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors(testSet)).toEqual([]);

        const notSet = 'hello';
        const wrongValue = new Set([51, 52, 53]); // expecting strings

        expect(valWithErrors(notSet)).toEqual([{path: [], expected: 'set'}]);
        expect(valWithErrors(wrongValue)).toEqual([
            {path: [{key: 51, index: 0}], expected: 'string'},
            {path: [{key: 52, index: 1}], expected: 'string'},
            {path: [{key: 53, index: 2}], expected: 'string'},
        ]);
    });

    it('encode/decode Set to json', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);

        const setCopy = cloneSet(testSet);
        const encoded = toJsonVal(setCopy);
        const stringified = JSON.stringify(encoded);
        const decoded = fromJsonVal(JSON.parse(stringified));

        expect(decoded).toEqual(testSet);
    });

    it('json stringify Set', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);

        const setCopy = cloneSet(testSet);
        const jsonString = jsonStringify(setCopy);
        const restored = fromJsonVal(JSON.parse(jsonString));

        expect(restored).toEqual(testSet);
    });

    it('has unknown keys in Set<string>', () => {
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const validSet = new Set<string>(['one', 'two']);

        expect(hasUnknownKeys(validSet)).toEqual(false);
        expect(validate(validSet)).toBe(true);
    });

    it('unknown key errors in Set<string>', () => {
        const unknownKeyErrors = rt.createJitFunction(JitFnIDs.unknownKeyErrors);
        const validSet = new Set<string>(['one', 'two']);

        expect(unknownKeyErrors(validSet)).toEqual([]);
    });

    it('mock Set<string>', () => {
        const mock = rt.mock();
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(mock instanceof Set).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});

describe('SerRunType with complex objects keys Set<SmallObject>', () => {
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

    it('validate Set<SmallObject>', () => {
        const validate = rtSmallObject.createJitFunction(JitFnIDs.isType);
        expect(validate(testSetSmallObject)).toBe(true);

        const notSet = 'hello';
        const wrongValue = new Set([{prop1: 'value1'}]); // missing prop2 and prop3

        expect(validate(notSet)).toBe(false);
        expect(validate(wrongValue)).toBe(false);
    });

    it('Get Set<SmallObject> errors', () => {
        const valWithErrors = rtSmallObject.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors(testSetSmallObject)).toEqual([]);

        const notSet = 'hello';
        const wrongValue = new Set([{prop1: 'value1'}]); // missing prop2 and prop3

        expect(valWithErrors(notSet)).toEqual([{path: [], expected: 'set'}]);
        // keys in errors are null because key are not safeKeys
        expect(valWithErrors(wrongValue)).toEqual([
            {path: [{key: null, index: 0}, 'prop2'], expected: 'number'}, // missing prop2
            {path: [{key: null, index: 0}, 'prop3'], expected: 'boolean'}, // missing prop3
        ]);
    });

    it('encode/decode Set<SmallObject> to json', () => {
        const toJsonVal = rtSmallObject.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rtSmallObject.createJitFunction(JitFnIDs.fromJsonVal);

        const setCopy = cloneSet(testSetSmallObject);
        const encoded = toJsonVal(setCopy);
        const stringified = JSON.stringify(encoded);
        const decoded = fromJsonVal(JSON.parse(stringified));

        expect(decoded).toEqual(testSetSmallObject);
    });

    it('json stringify Set<SmallObject>', () => {
        const jsonStringify = rtSmallObject.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rtSmallObject.createJitFunction(JitFnIDs.fromJsonVal);

        const setCopy = cloneSet(testSetSmallObject);
        const jsonString = jsonStringify(setCopy);
        const restored = fromJsonVal(JSON.parse(jsonString));

        expect(restored).toEqual(testSetSmallObject);
    });

    it('has unknown keys in Set<SmallObject>', () => {
        const hasUnknownKeys = rtSmallObject.createJitFunction(JitFnIDs.hasUnknownKeys);
        const validate = rtSmallObject.createJitFunction(JitFnIDs.isType);
        const validSet = new Set<SmallObject>([
            {prop1: 'value1', prop2: 1, prop3: true},
            {prop1: 'value2', prop2: 2, prop3: false},
        ]);
        const setWithUnknownKeys = new Set<any>([
            {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'},
            {prop1: 'value2', prop2: 2, prop3: false},
        ]);

        expect(hasUnknownKeys(validSet)).toBe(false);
        expect(hasUnknownKeys(setWithUnknownKeys)).toBe(true);
        expect(validate(setWithUnknownKeys)).toBe(true);
    });

    it('unknown key errors in Set<SmallObject>', () => {
        const unknownKeyErrors = rtSmallObject.createJitFunction(JitFnIDs.unknownKeyErrors);
        const validate = rtSmallObject.createJitFunction(JitFnIDs.isType);
        const validSet = new Set<SmallObject>([{prop1: 'value1', prop2: 1, prop3: true}]);
        const setWithUnknownKeys = new Set<any>([{prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}]);

        expect(unknownKeyErrors(validSet)).toEqual([]);
        expect(unknownKeyErrors(setWithUnknownKeys)).toEqual([{path: [{key: null, index: 0}, 'unknownProp'], expected: 'never'}]);
        expect(validate(setWithUnknownKeys)).toBe(true);
    });

    it('strip unknown keys in Set<SmallObject>', () => {
        const stripUnknownKeys = rtSmallObject.createJitFunction(JitFnIDs.stripUnknownKeys);
        const setWithUnknownKeys = new Set<any>([{prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}]);

        stripUnknownKeys(setWithUnknownKeys);
        expect(Array.from(setWithUnknownKeys.values())[0]).toEqual({prop1: 'value1', prop2: 1, prop3: true});
    });

    it('unknown keys to undefined in Set<SmallObject>', () => {
        const unknownKeysToUndefined = rtSmallObject.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const setWithUnknownKeys = new Set<any>([{prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}]);

        unknownKeysToUndefined(setWithUnknownKeys);
        expect(Array.from(setWithUnknownKeys.values())[0]).toEqual({
            prop1: 'value1',
            prop2: 1,
            prop3: true,
            unknownProp: undefined,
        });
    });

    it('mock Set<SmallObject>', () => {
        const mock = rtSmallObject.mock();
        const validate = rtSmallObject.createJitFunction(JitFnIDs.isType);
        expect(mock instanceof Set).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});

describe('SerRunType with nested sets', () => {
    interface DeepWithSet {
        a: string;
        b: Set<{s: string; arr: number[]}>;
    }
    const rtDeepWithSet = runType<DeepWithSet>();

    it('validate objects with nested sets', () => {
        const validate = rtDeepWithSet.createJitFunction(JitFnIDs.isType);
        const set1: DeepWithSet['b'] = new Set([
            {s: 'a', arr: [1, 2, 3]},
            {s: 'b', arr: [4, 5, 6]},
        ]);
        const obj: DeepWithSet = {
            a: 'a',
            b: set1,
        };
        expect(validate(obj)).toBe(true);

        const notSet = {a: 'a', b: 'b'};
        const wrongValue = {
            a: 'a',
            b: new Set([{sm: {s: 's', arr: 1}}]), // arr should be number[]
        };
        expect(validate(notSet)).toBe(false);
        expect(validate(wrongValue)).toBe(false);
    });

    it('Get errors for objects with nested sets', () => {
        const valWithErrors = rtDeepWithSet.createJitFunction(JitFnIDs.typeErrors);
        const set1: DeepWithSet['b'] = new Set([
            {s: 'a', arr: [1, 2, 3]},
            {s: 'b', arr: [4, 5, 6]},
        ]);
        const obj: DeepWithSet = {
            a: 'a',
            b: set1,
        };
        expect(valWithErrors(obj)).toEqual([]);

        const notSet = {a: 'a', b: 'b'};
        const wrongValue = {
            a: 'a',
            b: new Set([{s: 's', arr: 1}]), // arr should be number[]
        };
        expect(valWithErrors(notSet)).toEqual([{path: ['b'], expected: 'set'}]);
        expect(valWithErrors(wrongValue)).toEqual([{path: ['b', {key: null, index: 0}, 'arr'], expected: 'array'}]);
    });

    it('encode/decode objects with nested sets to json', () => {
        const toJsonVal = rtDeepWithSet.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rtDeepWithSet.createJitFunction(JitFnIDs.fromJsonVal);

        const set1: DeepWithSet['b'] = new Set([
            {s: 'a', arr: [1, 2, 3]},
            {s: 'b', arr: [4, 5, 6]},
        ]);
        const obj: DeepWithSet = {
            a: 'a',
            b: set1,
        };
        const objCopy = structuredClone(obj);
        const encoded = toJsonVal(objCopy);
        const stringified = JSON.stringify(encoded);
        const decoded = fromJsonVal(JSON.parse(stringified));

        expect(decoded).toEqual(obj);
    });

    it('json stringify objects with nested sets', () => {
        const jsonStringify = rtDeepWithSet.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rtDeepWithSet.createJitFunction(JitFnIDs.fromJsonVal);

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

    it('has unknown keys in objects with nested sets', () => {
        const hasUnknownKeys = rtDeepWithSet.createJitFunction(JitFnIDs.hasUnknownKeys);
        const validate = rtDeepWithSet.createJitFunction(JitFnIDs.isType);
        const set1: DeepWithSet['b'] = new Set([
            {s: 'a', arr: [1, 2, 3]},
            {s: 'b', arr: [4, 5, 6]},
        ]);
        const obj: DeepWithSet = {
            a: 'a',
            b: set1,
        };
        const objWithUnknownKeys: any = {
            a: 'a',
            b: set1,
            unknown: 'key',
        };

        expect(hasUnknownKeys(obj)).toBe(false);
        expect(hasUnknownKeys(objWithUnknownKeys)).toBe(true);
        expect(validate(objWithUnknownKeys)).toBe(true);
    });

    it('unknown key errors in objects with nested sets', () => {
        const unknownKeyErrors = rtDeepWithSet.createJitFunction(JitFnIDs.unknownKeyErrors);
        const validate = rtDeepWithSet.createJitFunction(JitFnIDs.isType);
        const set1: DeepWithSet['b'] = new Set([
            {s: 'a', arr: [1, 2, 3]},
            {s: 'b', arr: [4, 5, 6]},
        ]);
        const obj: DeepWithSet = {
            a: 'a',
            b: set1,
        };
        const objWithUnknownKeys: any = {
            a: 'a',
            b: set1,
            unknown: 'key',
        };

        expect(unknownKeyErrors(obj)).toEqual([]);
        expect(unknownKeyErrors(objWithUnknownKeys)).toEqual([{path: ['unknown'], expected: 'never'}]);
        expect(validate(objWithUnknownKeys)).toBe(true);
    });

    it('strip unknown keys in objects with nested sets', () => {
        const stripUnknownKeys = rtDeepWithSet.createJitFunction(JitFnIDs.stripUnknownKeys);
        const objWithUnknownKeys: any = {
            a: 'a',
            b: new Set([
                {s: 'a', arr: [1, 2, 3]},
                {s: 'b', arr: [4, 5, 6]},
            ]),
            unknown: 'key',
        };

        stripUnknownKeys(objWithUnknownKeys);
        expect(objWithUnknownKeys).toEqual({
            a: 'a',
            b: new Set([
                {s: 'a', arr: [1, 2, 3]},
                {s: 'b', arr: [4, 5, 6]},
            ]),
        });
    });

    it('unknown keys to undefined in objects with nested sets', () => {
        const unknownKeysToUndefined = rtDeepWithSet.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const objWithUnknownKeys: any = {
            a: 'a',
            b: new Set([
                {s: 'a', arr: [1, 2, 3]},
                {s: 'b', arr: [4, 5, 6]},
            ]),
            unknown: 'key',
        };

        unknownKeysToUndefined(objWithUnknownKeys);
        expect(objWithUnknownKeys).toEqual({
            a: 'a',
            b: new Set([
                {s: 'a', arr: [1, 2, 3]},
                {s: 'b', arr: [4, 5, 6]},
            ]),
            unknown: undefined,
        });
    });

    it('mock objects with nested sets', () => {
        const mock = rtDeepWithSet.mock();
        const validate = rtDeepWithSet.createJitFunction(JitFnIDs.isType);
        expect(mock.b instanceof Set).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});
