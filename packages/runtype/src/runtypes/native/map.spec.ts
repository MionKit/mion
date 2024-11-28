/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFnIDs} from '../../constants';
import {logJitCache} from '../../lib/jitUtils';
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

it('mock Map', () => {
    const mock = rt.mock();
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(mock instanceof Map).toBeTruthy();
    expect(validate(mock)).toBe(true);
});

afterAll(() => {
    logJitCache();
    logJitCache();
});
