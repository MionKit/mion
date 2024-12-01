/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

function cloneMap<K, V>(map: Map<K, V>): Map<K, V> {
    const copyEntries = Array.from(map.entries()).map(([k, v]) => [structuredClone(k), structuredClone(v)] as [K, V]);
    return new Map(copyEntries);
}

describe('MapRunType with simple key and values Map<string, number>', () => {
    const testMap = new Map<string, number>([
        ['one', 1],
        ['two', 2],
        ['three', 3],
    ]);

    const rt = runType<Map<string, number>>();

    it('validate Map', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(testMap)).toBe(true);

        const notMap = 'hello';
        const wrongKey = new Map([[1, 1]]);
        const wrongValue = new Map([['one', 'one']]);
        expect(validate(notMap)).toBe(false);
        expect(validate(wrongKey)).toBe(false);
        expect(validate(wrongValue)).toBe(false);
    });

    it('validate empty Map', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(new Map())).toBe(true);
    });

    it('Get Map errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors(testMap)).toEqual([]);

        const notMap = 'hello';
        const wrongKey = new Map([[1, 1]]);
        const wrongValue = new Map([['one', 'one']]);
        expect(valWithErrors(notMap)).toEqual([{path: [], expected: 'map'}]);
        // when a map key fails, the static path indicates if it is the key or the value that failed
        expect(valWithErrors(wrongKey)).toEqual([{path: [{key: 1, index: 0, failed: 'mapKey'}], expected: 'string'}]);
        expect(valWithErrors(wrongValue)).toEqual([{path: [{key: 'one', index: 0, failed: 'mapVal'}], expected: 'number'}]);
    });

    it('Get errors for a map which keys can not be serialized to json ie: Map<bigint, number>', () => {
        const rtBigMap = runType<Map<bigint, number>>();
        const valWithErrors = rtBigMap.createJitFunction(JitFnIDs.typeErrors);
        const bigMap = new Map<bigint, number>([[BigInt(1), 1]]);
        expect(valWithErrors(bigMap)).toEqual([]);

        const notMap = 'hello';
        const wrongKey = new Map([[1, 1]]);
        const wrongValue = new Map([[1n, 'one']]);
        expect(valWithErrors(notMap)).toEqual([{path: [], expected: 'map'}]);
        // when a map key fails, the static path indicates if it is the key or the value that failed

        expect(valWithErrors(wrongKey)).toEqual([{path: [{key: 1, index: 0, failed: 'mapKey'}], expected: 'bigint'}]); // wrong key 1 can be serialized to json so is returned as a number
        expect(valWithErrors(wrongValue)).toEqual([{path: [{key: null, index: 0, failed: 'mapVal'}], expected: 'number'}]); // correct key 1n can not be serialized to json so is returned as null
    });

    it('encode/decode Map to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        // the encode/decode operations are destructive, so we need to clone the map
        const mapCopy = cloneMap(testMap);
        const encoded = toJson(mapCopy);
        const stringified = JSON.stringify(encoded);
        const decoded = fromJson(JSON.parse(stringified));

        expect(decoded).toEqual(testMap);
    });

    it('json stringify Map', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        // Should serialize the Map as an array of entries
        const mapCopy = cloneMap(testMap);
        const jsonString = jsonStringify(mapCopy);
        const restored = fromJson(JSON.parse(jsonString));
        expect(restored).toEqual(testMap);
    });

    it('has unknown keys in Map<string, number>', () => {
        const hasUnknownKeys = rt.createJitFunction(JitFnIDs.hasUnknownKeys);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const validMap = new Map<string, number>([
            ['one', 1],
            ['two', 2],
        ]);
        const mapWithWrongKeys = new Map<any, any>([
            [1, 1],
            [1, 2],
            [3, 3],
        ]);

        expect(hasUnknownKeys(validMap)).toEqual(false);
        // maps on itself never have unknown keys.
        // A map can have invalid type keys but not unknown keys as map key are not strongly typed
        expect(hasUnknownKeys(mapWithWrongKeys)).toBe(false);
        expect(validate(mapWithWrongKeys)).toBe(false);
    });

    it('unknown key errors in Map<string, number>', () => {
        const unknownKeyErrors = rt.createJitFunction(JitFnIDs.unknownKeyErrors);
        const validMap = new Map<string, number>([
            ['one', 1],
            ['two', 2],
        ]);
        const mapWithUnknownKeys = new Map([
            ['one', 1],
            ['two', 2],
            ['three', 3],
        ]);

        expect(unknownKeyErrors(validMap)).toEqual([]);
        expect(unknownKeyErrors(mapWithUnknownKeys)).toEqual([]);
    });

    it('mock Map<string, number>', () => {
        const mock = rt.mock();
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(mock instanceof Map).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});

describe('MapRunType with simple key and complex objects Map<string, SmallObject>', () => {
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

    it('validate Map<string, SmallObject>', () => {
        const validate = rtStringSmallObject.createJitFunction(JitFnIDs.isType);
        expect(validate(testMapStringSmallObject)).toBe(true);

        const notMap = 'hello';
        const wrongKey = new Map([[1, {prop1: 'value1', prop2: 1, prop3: true}]]);
        const wrongValue = new Map([['one', {prop1: 'value1'}]]); // missing prop2 and prop3
        expect(validate(notMap)).toBe(false);
        expect(validate(wrongKey)).toBe(false);
        expect(validate(wrongValue)).toBe(false);
    });

    it('Get Map errors Map<string, SmallObject>', () => {
        const valWithErrors = rtStringSmallObject.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors(testMapStringSmallObject)).toEqual([]);

        const notMap = 'hello';
        const wrongKey = new Map([[1, {prop1: 'value1', prop2: 1, prop3: true}]]);
        const wrongValue = new Map([['one', {prop1: 'value1'}]]); // missing prop2 and prop3
        expect(valWithErrors(notMap)).toEqual([{path: [], expected: 'map'}]);
        expect(valWithErrors(wrongKey)).toEqual([{path: [{key: 1, index: 0, failed: 'mapKey'}], expected: 'string'}]);
        expect(valWithErrors(wrongValue)).toEqual([
            {path: [{key: 'one', index: 0, failed: 'mapVal'}, 'prop2'], expected: 'number'},
            {path: [{key: 'one', index: 0, failed: 'mapVal'}, 'prop3'], expected: 'boolean'},
        ]);
    });

    it('encode/decode Map<string, SmallObject> to json', () => {
        const toJson = rtStringSmallObject.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtStringSmallObject.createJitFunction(JitFnIDs.jsonDecode);

        // the encode/decode operations are destructive, so we need to clone the map
        const mapCopy = cloneMap(testMapStringSmallObject);
        const encoded = toJson(mapCopy);
        const stringified = JSON.stringify(encoded);
        const decoded = fromJson(JSON.parse(stringified));
        expect(decoded).toEqual(testMapStringSmallObject);
    });

    it('json stringify Map<string, SmallObject>', () => {
        const jsonStringify = rtStringSmallObject.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rtStringSmallObject.createJitFunction(JitFnIDs.jsonDecode);
        // Should serialize the Map as an array of entries
        const mapCopy = cloneMap(testMapStringSmallObject);
        const jsonString = jsonStringify(mapCopy);
        const restored = fromJson(JSON.parse(jsonString));
        expect(restored).toEqual(testMapStringSmallObject);
    });

    it('has unknown keys in Map<string, SmallObject>', () => {
        const hasUnknownKeys = rtStringSmallObject.createJitFunction(JitFnIDs.hasUnknownKeys);
        const validate = rtStringSmallObject.createJitFunction(JitFnIDs.isType);
        const validMap = new Map<string, SmallObject>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
            ['key2', {prop1: 'value2', prop2: 2, prop3: false}],
        ]);
        const mapWithUnknownKeys = new Map<string, any>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}],
            ['key2', {prop1: 'value2', prop2: 2, prop3: false}],
        ]);

        expect(hasUnknownKeys(validMap)).toBe(false);
        expect(hasUnknownKeys(mapWithUnknownKeys)).toBe(true); // in this case the objects inside the map has unknown keys
        expect(validate(mapWithUnknownKeys)).toBe(true); // objects inside the map are valid but have unknown keys
    });

    it('unknown key errors in Map<string, SmallObject>', () => {
        const unknownKeyErrors = rtStringSmallObject.createJitFunction(JitFnIDs.unknownKeyErrors);
        const validate = rtStringSmallObject.createJitFunction(JitFnIDs.isType);
        const validMap = new Map<string, SmallObject>([['key1', {prop1: 'value1', prop2: 1, prop3: true}]]);
        const mapWithUnknownKeys = new Map<string, any>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}],
        ]);

        expect(unknownKeyErrors(validMap)).toEqual([]);
        expect(unknownKeyErrors(mapWithUnknownKeys)).toEqual([
            {path: [{key: 'key1', index: 0, failed: 'mapVal'}, 'unknownProp'], expected: 'never'},
        ]);
        expect(validate(mapWithUnknownKeys)).toBe(true); // objects inside the map are valid but have unknown keys
    });

    it('strip unknown keys in Map<string, SmallObject>', () => {
        const stripUnknownKeys = rtStringSmallObject.createJitFunction(JitFnIDs.stripUnknownKeys);
        const mapWithUnknownKeys = new Map<string, any>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}],
        ]);

        stripUnknownKeys(mapWithUnknownKeys);
        expect(mapWithUnknownKeys.get('key1')).toEqual({prop1: 'value1', prop2: 1, prop3: true});
    });

    it('unknown keys to undefined in Map<string, SmallObject>', () => {
        const unknownKeysToUndefined = rtStringSmallObject.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const mapWithUnknownKeys = new Map<string, any>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}],
        ]);

        unknownKeysToUndefined(mapWithUnknownKeys);
        expect(mapWithUnknownKeys.get('key1')).toEqual({
            prop1: 'value1',
            prop2: 1,
            prop3: true,
            unknownProp: undefined,
        });
    });

    it('mock Map<string, SmallObject>', () => {
        const mock = rtStringSmallObject.mock();
        const validate = rtStringSmallObject.createJitFunction(JitFnIDs.isType);
        expect(mock instanceof Map).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});

describe('MapRunType with complex key and simple values Map<SmallObject, number>', () => {
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

    it('validate Map<SmallObject, number>', () => {
        const validate = rtSmallObjectNumber.createJitFunction(JitFnIDs.isType);
        expect(validate(testMapSmallObjectNumber)).toBe(true);

        const notMap = 'hello';
        const wrongKey = new Map([[1, 1]]);
        const wrongValue = new Map([[{prop1: 'value1'}, 'one']]); // missing prop2 and prop3
        expect(validate(notMap)).toBe(false);
        expect(validate(wrongKey)).toBe(false);
        expect(validate(wrongValue)).toBe(false);
    });

    it('Get Map errors Map<SmallObject, number>', () => {
        const valWithErrors = rtSmallObjectNumber.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors(testMapSmallObjectNumber)).toEqual([]);

        const notMap = 'hello';
        const wrongKey = new Map([[1, 1]]);
        const wrongKeyValue = new Map([[{prop1: 'value1'}, 'one']]); // missing prop2 and prop3
        expect(valWithErrors(notMap)).toEqual([{path: [], expected: 'map'}]);
        expect(valWithErrors(wrongKey)).toEqual([{path: [{key: 1, index: 0, failed: 'mapKey'}], expected: 'object'}]);
        // key in path are null because the key is an object
        expect(valWithErrors(wrongKeyValue)).toEqual([
            {path: [{key: null, index: 0, failed: 'mapKey'}, 'prop2'], expected: 'number'},
            {path: [{key: null, index: 0, failed: 'mapKey'}, 'prop3'], expected: 'boolean'},
            {path: [{key: null, index: 0, failed: 'mapVal'}], expected: 'number'},
        ]);
    });

    it('encode/decode Map<SmallObject, number> to json', () => {
        const toJson = rtSmallObjectNumber.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtSmallObjectNumber.createJitFunction(JitFnIDs.jsonDecode);

        // the encode/decode operations are destructive, so we need to clone the map
        const mapCopy = cloneMap(testMapSmallObjectNumber);
        const encoded = toJson(mapCopy);
        const stringified = JSON.stringify(encoded);
        const decoded = fromJson(JSON.parse(stringified));
        expect(decoded).toEqual(testMapSmallObjectNumber);
    });

    it('json stringify Map<SmallObject, number>', () => {
        const jsonStringify = rtSmallObjectNumber.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rtSmallObjectNumber.createJitFunction(JitFnIDs.jsonDecode);
        // Should serialize the Map as an array of entries
        const mapCopy = cloneMap(testMapSmallObjectNumber);
        const jsonString = jsonStringify(mapCopy);
        const restored = fromJson(JSON.parse(jsonString));
        expect(restored).toEqual(testMapSmallObjectNumber);
    });

    it('has unknown keys in Map<SmallObject, number>', () => {
        const hasUnknownKeys = rtSmallObjectNumber.createJitFunction(JitFnIDs.hasUnknownKeys);
        const validate = rtSmallObjectNumber.createJitFunction(JitFnIDs.isType);
        const validMap = new Map<SmallObject, number>([
            [{prop1: 'value1', prop2: 1, prop3: true}, 1],
            [{prop1: 'value2', prop2: 2, prop3: false}, 2],
        ]);
        const mapWithUnknownKeys = new Map<any, number>([
            [{prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}, 1],
            [{prop1: 'value2', prop2: 2, prop3: false}, 2],
        ]);

        expect(hasUnknownKeys(validMap)).toBe(false);
        expect(hasUnknownKeys(mapWithUnknownKeys)).toBe(true); // in this case the objects inside the map has unknown keys
        expect(validate(mapWithUnknownKeys)).toBe(true); // objects inside the map are valid but have unknown keys
    });

    it('unknown key errors in Map<SmallObject, number>', () => {
        const unknownKeyErrors = rtSmallObjectNumber.createJitFunction(JitFnIDs.unknownKeyErrors);
        const validate = rtSmallObjectNumber.createJitFunction(JitFnIDs.isType);
        const validMap = new Map<SmallObject, number>([[{prop1: 'value1', prop2: 1, prop3: true}, 1]]);
        const mapWithUnknownKeys = new Map<any, number>([[{prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}, 1]]);

        expect(unknownKeyErrors(validMap)).toEqual([]);
        expect(unknownKeyErrors(mapWithUnknownKeys)).toEqual([
            {path: [{key: null, index: 0, failed: 'mapKey'}, 'unknownProp'], expected: 'never'},
        ]);
        expect(validate(mapWithUnknownKeys)).toBe(true); // objects inside the map are valid but have unknown keys
    });

    it('strip unknown keys in Map<SmallObject, number>', () => {
        const stripUnknownKeys = rtSmallObjectNumber.createJitFunction(JitFnIDs.stripUnknownKeys);
        const entry = {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'};
        const mapWithUnknownKeys = new Map<any, number>([[entry, 1]]);

        stripUnknownKeys(mapWithUnknownKeys);
        expect(entry).toEqual({prop1: 'value1', prop2: 1, prop3: true});
    });

    it('unknown keys to undefined in Map<SmallObject, number>', () => {
        const unknownKeysToUndefined = rtSmallObjectNumber.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const entry = {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'};
        const mapWithUnknownKeys = new Map<any, number>([[entry, 1]]);

        unknownKeysToUndefined(mapWithUnknownKeys);
        expect(entry).toEqual({prop1: 'value1', prop2: 1, prop3: true, unknownProp: undefined});
    });

    it('mock Map<SmallObject, number>', () => {
        const mock = rtSmallObjectNumber.mock();
        const validate = rtSmallObjectNumber.createJitFunction(JitFnIDs.isType);
        expect(mock instanceof Map).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});

describe('MapRunType with nested maps', () => {
    interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
    }

    const rtDeepWithMap = runType<DeepWithMap>();

    it('validate objects with nested maps', () => {
        const validate = rtDeepWithMap.createJitFunction(JitFnIDs.isType);
        const obj: DeepWithMap = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };
        expect(validate(obj)).toBe(true);

        const notMap = {a: 'a', b: 'b'};
        const wrongKey = {a: 'a', b: new Map([[1, {sm: {s: 's', arr: [1, 2, 3]}}]])};
        const wrongValue = {a: 'a', b: new Map([['key1', {sm: {s: 's', arr: 1}}]])};
        expect(validate(notMap)).toBe(false);
        expect(validate(wrongKey)).toBe(false);
        expect(validate(wrongValue)).toBe(false);
    });

    it('Get Map errors with nested maps', () => {
        const valWithErrors = rtDeepWithMap.createJitFunction(JitFnIDs.typeErrors);
        const obj: DeepWithMap = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };
        expect(valWithErrors(obj)).toEqual([]);

        const notMap = {a: 'a', b: 'b'};
        const wrongKey = {a: 'a', b: new Map([[1, {sm: {s: 's', arr: [1, 2, 3]}}]])}; // expecting string keys
        const wrongValue = {a: 'a', b: new Map([['key1', {sm: {s: 's', arr: 1}}]])}; // expecting arr = number[]
        expect(valWithErrors(notMap)).toEqual([{path: ['b'], expected: 'map'}]);
        expect(valWithErrors(wrongKey)).toEqual([{path: ['b', {key: 1, index: 0, failed: 'mapKey'}], expected: 'string'}]);
        expect(valWithErrors(wrongValue)).toEqual([
            {path: ['b', {key: 'key1', index: 0, failed: 'mapVal'}, 'sm', 'arr'], expected: 'array'},
        ]);
    });

    it('encode/decode objects with nested maps to json', () => {
        const toJson = rtDeepWithMap.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtDeepWithMap.createJitFunction(JitFnIDs.jsonDecode);

        const obj: DeepWithMap = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };
        const clone = {...obj, b: cloneMap(obj.b)}; // the encode/decode operations are destructive, so we need to clone the map
        const encoded = toJson(clone);
        const stringified = JSON.stringify(encoded);
        const decoded = fromJson(JSON.parse(stringified));
        expect(decoded).toEqual(obj);
    });

    it('json stringify objects with nested maps', () => {
        const jsonStringify = rtDeepWithMap.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rtDeepWithMap.createJitFunction(JitFnIDs.jsonDecode);

        const obj: DeepWithMap = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };
        const jsonString = jsonStringify(obj);
        const restored = fromJson(JSON.parse(jsonString));
        expect(restored).toEqual(obj);
    });

    it('has unknown keys in objects with nested maps', () => {
        const hasUnknownKeys = rtDeepWithMap.createJitFunction(JitFnIDs.hasUnknownKeys);
        const validate = rtDeepWithMap.createJitFunction(JitFnIDs.isType);
        const obj: DeepWithMap = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };
        const objWithUnknownKeys = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3], unknownProp: 'test'}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };

        expect(hasUnknownKeys(obj)).toBe(false);
        expect(hasUnknownKeys(objWithUnknownKeys)).toBe(true);
        expect(validate(objWithUnknownKeys)).toBe(true);
    });

    it('unknown key errors in objects with nested maps', () => {
        const unknownKeyErrors = rtDeepWithMap.createJitFunction(JitFnIDs.unknownKeyErrors);
        const validate = rtDeepWithMap.createJitFunction(JitFnIDs.isType);
        const obj: DeepWithMap = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };
        const objWithUnknownKeys = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3], unknownProp: 'test'}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };

        expect(unknownKeyErrors(obj)).toEqual([]);
        expect(unknownKeyErrors(objWithUnknownKeys)).toEqual([
            {path: ['b', {failed: 'mapVal', index: 0, key: 'key1'}, 'sm', 'unknownProp'], expected: 'never'},
        ]);
        expect(validate(objWithUnknownKeys)).toBe(true);
    });

    it('strip unknown keys in objects with nested maps', () => {
        const stripUnknownKeys = rtDeepWithMap.createJitFunction(JitFnIDs.stripUnknownKeys);
        const objWithUnknownKeys = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3], unknownProp: 'test'}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };

        stripUnknownKeys(objWithUnknownKeys);
        expect(objWithUnknownKeys).toEqual({
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        });
    });

    it('unknown keys to undefined in objects with nested maps', () => {
        const unknownKeysToUndefined = rtDeepWithMap.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const objWithUnknownKeys = {
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3], unknownProp: 'test'}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        };

        unknownKeysToUndefined(objWithUnknownKeys);
        expect(objWithUnknownKeys).toEqual({
            a: 'a',
            b: new Map([
                ['key1', {sm: {s: 's', arr: [1, 2, 3], unknownProp: undefined}}],
                ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
        });
    });

    it('mock objects with nested maps', () => {
        const mock = rtDeepWithMap.mock();
        const validate = rtDeepWithMap.createJitFunction(JitFnIDs.isType);
        expect(mock.b instanceof Map).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});
