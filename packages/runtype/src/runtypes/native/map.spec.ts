/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

interface SmallObject {
    prop1: string;
    prop2: number;
    prop3: boolean;
    prop4?: Date;
    prop5?: bigint;
}

const testMap = new Map<string, number>([
    ['one', 1],
    ['two', 2],
    ['three', 3],
]);

const rt = runType<Map<string, number>>();

const testMapStringSmallObject = new Map<string, SmallObject>([
    ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
    ['key2', {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date()}],
    ['key3', {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}],
]);

const rtStringSmallObject = runType<Map<string, SmallObject>>();

interface DeepWithMap {
    a: string;
    b: Map<string, {sm: {s: string; arr: number[]}}>;
}

const rtDeepWithMap = runType<DeepWithMap>();

function cloneMap<K, V>(map: Map<K, V>): Map<K, V> {
    const copyEntries = Array.from(map.entries()).map(([k, v]) => [structuredClone(k), structuredClone(v)] as [K, V]);
    return new Map(copyEntries);
}

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

it('validate empty Map', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(new Map())).toBe(true);
});

it('validate Map + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(testMap)).toEqual([]);

    const notMap = 'hello';
    const wrongKey = new Map([[1, 1]]);
    const wrongValue = new Map([['one', 'one']]);
    expect(valWithErrors(notMap)).toEqual([{path: [], expected: 'map'}]);
    // when a map key fails, the static path indicates if it is the key or the value that failed
    expect(valWithErrors(wrongKey)).toEqual([{path: [['key', 1]], expected: 'string'}]);
    expect(valWithErrors(wrongValue)).toEqual([{path: [['val', 'one']], expected: 'number'}]);
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

it('json stringify Map', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
    // Should serialize the Map as an array of entries
    const mapCopy = cloneMap(testMap);
    const jsonString = jsonStringify(mapCopy);
    const restored = fromJson(JSON.parse(jsonString));
    expect(restored).toEqual(testMap);
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

it('unknown key errors in Map<string, SmallObject>', () => {
    const unknownKeyErrors = rtStringSmallObject.createJitFunction(JitFnIDs.unknownKeyErrors);
    const validate = rtStringSmallObject.createJitFunction(JitFnIDs.isType);
    const validMap = new Map<string, SmallObject>([['key1', {prop1: 'value1', prop2: 1, prop3: true}]]);
    const mapWithUnknownKeys = new Map<string, any>([['key1', {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}]]);

    expect(unknownKeyErrors(validMap)).toEqual([]);
    expect(unknownKeyErrors(mapWithUnknownKeys)).toEqual([{path: [['val', 'key1'], 'unknownProp'], expected: 'never'}]);
    expect(validate(mapWithUnknownKeys)).toBe(true); // objects inside the map are valid but have unknown keys
});

it('strip unknown keys in Map<string, SmallObject>', () => {
    const stripUnknownKeys = rtStringSmallObject.createJitFunction(JitFnIDs.stripUnknownKeys);
    const mapWithUnknownKeys = new Map<string, any>([['key1', {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}]]);

    stripUnknownKeys(mapWithUnknownKeys);
    expect(mapWithUnknownKeys.get('key1')).toEqual({prop1: 'value1', prop2: 1, prop3: true});
});

it('unknown keys to undefined in Map<string, SmallObject>', () => {
    const unknownKeysToUndefined = rtStringSmallObject.createJitFunction(JitFnIDs.unknownKeysToUndefined);
    const mapWithUnknownKeys = new Map<string, any>([['key1', {prop1: 'value1', prop2: 1, prop3: true, unknownProp: 'test'}]]);

    unknownKeysToUndefined(mapWithUnknownKeys);
    expect(mapWithUnknownKeys.get('key1')).toEqual({
        prop1: 'value1',
        prop2: 1,
        prop3: true,
        unknownProp: undefined,
    });
});

// MOck should be working correctly

it('mock Map', () => {
    const mock = rt.mock();
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(mock instanceof Map).toBeTruthy();
    expect(validate(mock)).toBe(true);
});
