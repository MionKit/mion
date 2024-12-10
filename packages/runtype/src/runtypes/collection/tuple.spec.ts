/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';
import {BaseRunType} from '../../lib/baseRunTypes';

describe('TupleRunType', () => {
    type TupleType = [Date, number, string, null, string[], bigint];
    type TupleWithOptionals = [number, bigint?, boolean?, number?];

    const rt = runType<TupleType>();

    it('validate tuple', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)])).toBe(true);
        expect(validate([new Date(), 123, 'hello', null, [], BigInt(123)])).toBe(true);
        expect(validate([new Date(), 123, 'hello', null, ['a', 'b', 'c']])).toBe(false);
        expect(validate([new Date(), 123, 'hello', null])).toBe(false);
        expect(validate([new Date(), 123, 'hello'])).toBe(false);
        expect(validate([new Date(), 123])).toBe(false);
        expect(validate([new Date()])).toBe(false);
        expect(validate([])).toBe(false);
        expect(validate({})).toBe(false);
        expect(validate('hello')).toBe(false);
        // extra elements in the tuple
        expect(validate([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34])).toBe(false);
    });

    it('validate tuple with optional parameters', () => {
        const validate = runType<TupleWithOptionals>().createJitFunction(JitFnIDs.isType);
        expect(validate([3, undefined, true, 4])).toBe(true);
        expect(validate([3, undefined, undefined, 4])).toBe(true);
        expect(validate([3, 2n, true, 4])).toBe(true);
        expect(validate([3])).toBe(true);
        // invalid scenarios
        expect(validate([])).toBe(false);
        expect(validate([3, '2', true, 4])).toBe(false);
    });

    it('validate tuple + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)])).toEqual([]);
        expect(valWithErrors([new Date(), 123, 'hello', null, [], BigInt(123)])).toEqual([]);
        expect(valWithErrors([new Date(), 123, 'hello', null])).toEqual([
            {path: [4], expected: 'array'},
            {path: [5], expected: 'bigint'},
        ]);
        expect(valWithErrors([new Date(), 123, 'hello'])).toEqual([
            {path: [3], expected: 'null'},
            {path: [4], expected: 'array'},
            {path: [5], expected: 'bigint'},
        ]);
        expect(valWithErrors([new Date(), 123])).toEqual([
            {path: [2], expected: 'string'},
            {path: [3], expected: 'null'},
            {path: [4], expected: 'array'},
            {path: [5], expected: 'bigint'},
        ]);
        expect(valWithErrors([new Date()])).toEqual([
            {path: [1], expected: 'number'},
            {path: [2], expected: 'string'},
            {path: [3], expected: 'null'},
            {path: [4], expected: 'array'},
            {path: [5], expected: 'bigint'},
        ]);
        expect(valWithErrors([])).toEqual([
            {path: [0], expected: 'date'},
            {path: [1], expected: 'number'},
            {path: [2], expected: 'string'},
            {path: [3], expected: 'null'},
            {path: [4], expected: 'array'},
            {path: [5], expected: 'bigint'},
        ]);
        expect(valWithErrors({})).toEqual([{path: [], expected: 'tuple'}]);
        // extra elements in the tuple
        expect(valWithErrors([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34])).toEqual([
            {path: [], expected: 'tuple'},
        ]);
    });

    it('validate tuple with optional parameters + errors', () => {
        const valWithErrors = runType<TupleWithOptionals>().createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors([3, undefined, true, 4])).toEqual([]);
        expect(valWithErrors([3, undefined, undefined, 4])).toEqual([]);
        expect(valWithErrors([3, 2n, true, 4])).toEqual([]);
        expect(valWithErrors([3])).toEqual([]);
        // invalid scenarios
        expect(valWithErrors([])).toEqual([{path: [0], expected: 'number'}]);
        expect(valWithErrors([3, '2', true, 4])).toEqual([{path: [1], expected: 'bigint'}]);
    });

    it('encode/decode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = structuredClone(typeValue);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy1))))).toEqual(typeValue);
    });

    it('encode/decode tuple with optional parameters to json', () => {
        const toJsonVal = runType<TupleWithOptionals>().createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = runType<TupleWithOptionals>().createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = [3, undefined, true, 4];
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal([3, undefined, true, 4]))))).toEqual(typeValue);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal([3, undefined, undefined, 4]))))).toEqual([
            3,
            undefined,
            undefined,
            4,
        ]);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal([3, 2n, true, 4]))))).toEqual([3, 2n, true, 4]);

        const allUndefined = [3, undefined, undefined, undefined];
        const restored1 = fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(allUndefined))));
        expect(restored1).toEqual([3, undefined, undefined, undefined]);
        expect(restored1.length).toBe(4);

        const allNotSet = [3];
        const restored2 = fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(allNotSet))));
        expect(restored2).toEqual([3]);
        expect(restored2.length).toBe(1);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    it('json stringify tuple with optional params', () => {
        const jsonStringify = runType<TupleWithOptionals>().createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = runType<TupleWithOptionals>().createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = [3, undefined, true, 4];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
        const typeValue2 = [3];
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual([3]);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveLength(6);
        expect(mocked[0]).toBeInstanceOf(Date);
        expect(typeof mocked[1]).toBe('number');
        expect(typeof mocked[2]).toBe('string');
        expect(mocked[3]).toBeNull();
        expect(Array.isArray(mocked[4])).toBe(true);
        expect(typeof mocked[5]).toBe('bigint');
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });

    it('mock  tuple with optional params', () => {
        const mocked = runType<TupleWithOptionals>().mock();
        expect(mocked.length).toBeLessThanOrEqual(4);
        expect(typeof mocked[0]).toBe('number');
        expect(typeof mocked[1] === 'bigint' || typeof mocked[1] === 'undefined').toBeTruthy();
        expect(typeof mocked[2] === 'boolean' || typeof mocked[2] === 'undefined').toBeTruthy();
        expect(typeof mocked[3] === 'number' || typeof mocked[3] === 'undefined').toBeTruthy();
        const validate = runType<TupleWithOptionals>().createJitFunction(JitFnIDs.isType);
        expect(validate(mocked)).toBe(true);
    });

    it('json encode/decode should be marked as noop when there are no actions required', () => {
        type NoJsonENCDECRequired = [number, string];
        type sonENCDECRequired = [bigint, Date];

        const rtNoop = runType<NoJsonENCDECRequired>() as BaseRunType;
        const rtEncRequired = runType<sonENCDECRequired>() as BaseRunType;
        expect(rtNoop.getJitCompiledOperation(JitFnIDs.toJsonVal).isNoop).toBe(true);
        expect(rtNoop.getJitCompiledOperation(JitFnIDs.fromJsonVal).isNoop).toBe(true);
        expect(rtEncRequired.getJitCompiledOperation(JitFnIDs.toJsonVal).isNoop).toBe(false);
        expect(rtEncRequired.getJitCompiledOperation(JitFnIDs.fromJsonVal).isNoop).toBe(false);
    });
});

describe('TupleRunType with circular type definitions', () => {
    type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];

    const rt = runType<TupleCircular>();

    it('validate tuple with circular type definitions', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        const tDeep: TupleCircular = [new Date(), 456, 'world', null, ['x', 'y', 'z'], BigInt(456)];
        const typeValue: TupleCircular = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), tDeep];
        const typeValueWrong = [null, 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
        expect(validate(typeValue)).toBe(true);
        expect(validate(typeValueWrong)).toBe(false);
    });

    it('validate tuple with circular type definitions + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const tDeep: TupleCircular = [new Date(), 456, 'world', null, ['x', 'y', 'z'], BigInt(456)];
        const typeValue: TupleCircular = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), tDeep];
        const typeValueWrong = [null, 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), null];
        expect(valWithErrors(typeValue)).toEqual([]);
        expect(valWithErrors(typeValueWrong)).toEqual([
            {path: [0], expected: 'date'},
            {path: [6], expected: 'tuple'},
        ]);
    });

    it('encode/decode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const tDeep: TupleCircular = [new Date(), 456, 'world', null, ['x', 'y', 'z'], BigInt(456)];
        const typeValue: TupleCircular = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), tDeep];
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = structuredClone(typeValue);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy1))))).toEqual(typeValue);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const tDeep: TupleCircular = [new Date(), 456, 'world', null, ['x', 'y', 'z'], BigInt(456)];
        const typeValue: TupleCircular = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), tDeep];

        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const expectMocked = (mocked: TupleCircular) => {
            expect(mocked.length).toBeLessThanOrEqual(7);
            expect(mocked.length).toBeGreaterThanOrEqual(6);
            expect(mocked[0]).toBeInstanceOf(Date);
            expect(typeof mocked[1]).toBe('number');
            expect(typeof mocked[2]).toBe('string');
            expect(mocked[3]).toBeNull();
            expect(Array.isArray(mocked[4])).toBe(true);
            expect(typeof mocked[5]).toBe('bigint');
            expect(mocked[6] === undefined || Array.isArray(mocked[6])).toBeTruthy();
            if (mocked[6]) {
                expectMocked(mocked[6]);
            }
        };
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(mocked)).toBe(true);
        expectMocked(mocked);
    });
});

describe('TupleRunType with rest parameter', () => {
    type TupleRest = [number, ...string[]];
    const rt = runType<TupleRest>();

    it('validate tuple with rest parameter', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate([3, 'a', 'b', 'c'])).toBe(true);
        expect(validate([3])).toBe(true);
        expect(validate([3, 'a'])).toBe(true);
        expect(validate([3, 'a', 'b'])).toBe(true);
        expect(validate([3, 'a', 'b', 4])).toBe(false);
    });

    it('validate tuple with rest parameter + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors([3, 'a', 'b', 'c'])).toEqual([]);
        expect(valWithErrors([3])).toEqual([]);
        expect(valWithErrors([3, 'a'])).toEqual([]);
        expect(valWithErrors([3, 'a', 'b'])).toEqual([]);
        expect(valWithErrors([3, 'a', 'b', 4])).toEqual([{path: [3], expected: 'string'}]);
    });

    it('encode/decode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue: TupleRest = [3, 'a', 'b', 'c'];
        // value used for json encode/decode gets modified so we need to copy it to compare later
        const copy1 = structuredClone(typeValue);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy1))))).toEqual(typeValue);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue: TupleRest = [3, 'a', 'b', 'c'];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked.length >= 1).toBe(true);
        expect(typeof mocked[0]).toBe('number');
        for (let i = 1; i < mocked.length; i++) {
            expect(typeof mocked[i]).toBe('string');
        }
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(mocked)).toBe(true);
    });
});
