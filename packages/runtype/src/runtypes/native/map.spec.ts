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
]);

const rtStringSmallObject = runType<Map<string, SmallObject>>();

interface DeepWithMap {
    a: string;
    b: Map<string, {sm: {s: string; arr: number[]}}>;
}

const rtDeepWithMap = runType<DeepWithMap>();

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
    const wrongKey = new Map([[1, testMapStringSmallObject]]);
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

// it('encode/decode Map to json', () => {
//     const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
//     // Should serialize the Map as an array of entries
//     const serialized = toJson(testMap);
//     const restored = JSON.parse(JSON.stringify(serialized));
//     expect(restored).toEqual(Array.from(testMap.entries()));
// });

// it('json stringify Map', () => {
//     const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
//     // Should serialize the Map as an array of entries
//     const jsonString = jsonStringify(testMap);
//     const restored = JSON.parse(jsonString);
//     expect(restored).toEqual(Array.from(testMap.entries()));
// });

// it('Maps cannot be decoded', () => {
//     expect(() => rt.createJitFunction(JitFnIDs.jsonDecode)).toThrow(`Maps cannot be deserialized.`);
// });

// it('mock Map', () => {
//     const mock = rt.mock();
//     const validate = rt.createJitFunction(JitFnIDs.isType);
//     expect(mock instanceof Map).toBeTruthy();
//     expect(validate(mock)).toBe(true);
// });

// it.todo('decide how to handle Maps in jit functions, whether to include methods or not');

// it('validate Map<string, SmallObject> + errors', () => {
//     const valWithErrors = rtStringSmallObject.createJitFunction(JitFnIDs.typeErrors);
//     expect(valWithErrors(testMapStringSmallObject)).toEqual([]);
// });

// it('encode/decode Map<string, SmallObject> to json', () => {
//     const toJson = rtStringSmallObject.createJitFunction(JitFnIDs.jsonEncode);
//     const serialized = toJson(testMapStringSmallObject);
//     const restored = JSON.parse(JSON.stringify(serialized));
//     expect(restored).toEqual(Array.from(testMapStringSmallObject.entries()));
// });

// it('json stringify Map<string, SmallObject>', () => {
//     const jsonStringify = rtStringSmallObject.createJitFunction(JitFnIDs.jsonStringify);
//     const jsonString = jsonStringify(testMapStringSmallObject);
//     const restored = JSON.parse(jsonString);
//     expect(restored).toEqual(Array.from(testMapStringSmallObject.entries()));
// });

// it('mock Map<string, SmallObject>', () => {
//     const mock = rtStringSmallObject.mock();
//     const validate = rtStringSmallObject.createJitFunction(JitFnIDs.isType);
//     expect(mock instanceof Map).toBeTruthy();
//     expect(validate(mock)).toBe(true);
// });

// const testMapSmallObjectDate = new Map<SmallObject, Date>([
//     [{prop1: 'value1', prop2: 1, prop3: true}, new Date()],
//     [{prop1: 'value2', prop2: 2, prop3: false}, new Date()],
// ]);

// const rtSmallObjectDate = runType<Map<SmallObject, Date>>();

// it('validate Map<SmallObject, Date>', () => {
//     const validate = rtSmallObjectDate.createJitFunction(JitFnIDs.isType);
//     expect(validate(testMapSmallObjectDate)).toBe(true);
// });

// it('validate Map<SmallObject, Date> + errors', () => {
//     const valWithErrors = rtSmallObjectDate.createJitFunction(JitFnIDs.typeErrors);
//     expect(valWithErrors(testMapSmallObjectDate)).toEqual([]);
// });

// it('encode/decode Map<SmallObject, Date> to json', () => {
//     const toJson = rtSmallObjectDate.createJitFunction(JitFnIDs.jsonEncode);
//     const serialized = toJson(testMapSmallObjectDate);
//     const restored = JSON.parse(JSON.stringify(serialized));
//     expect(restored).toEqual(Array.from(testMapSmallObjectDate.entries()));
// });

// it('json stringify Map<SmallObject, Date>', () => {
//     const jsonStringify = rtSmallObjectDate.createJitFunction(JitFnIDs.jsonStringify);
//     const jsonString = jsonStringify(testMapSmallObjectDate);
//     const restored = JSON.parse(jsonString);
//     expect(restored).toEqual(Array.from(testMapSmallObjectDate.entries()));
// });

// it('mock Map<SmallObject, Date>', () => {
//     const mock = rtSmallObjectDate.mock();
//     const validate = rtSmallObjectDate.createJitFunction(JitFnIDs.isType);
//     expect(mock instanceof Map).toBeTruthy();
//     expect(validate(mock)).toBe(true);
// });
