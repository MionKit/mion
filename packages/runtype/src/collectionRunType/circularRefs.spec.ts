/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {JitFnIDs} from '../constants';

// ####### NOTE RUNTYPES SUPPORT CIRCULAR TYPE REFERENCES, BUT NOT CIRCULAR OBJECTS AT RUNTIME #####

/**  Test Circular object type:
interface Circular {
    n: number;
    s: string;
    c?: Circular;
    d?: Date;
}
*/
describe('Circular object', () => {
    interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
    }

    const rtCircular = runType<Circular>();

    const c1: Circular = {n: 1, s: 'hello', c: {n: 2, s: 'world'}};
    const c2: Circular = {n: 2, s: 'world'};
    const c3: Circular = {n: 3, s: 'foo', c: {n: 3, s: 'foo'}};

    const notC1 = {n: 1, s: 'hello', c: {n: 2, s: 123}}; // c.s is not a string
    const notC2 = {n: 1, s: 'hello', c: {n: 2}}; // c.s is missing

    it('should validate objects with circular references', () => {
        const validate = rtCircular.createJitFunction(JitFnIDs.isType);

        expect(validate(c1)).toBe(true);
        expect(validate(c2)).toBe(true);
        expect(validate(c3)).toBe(true);

        expect(validate(notC1)).toBe(false);
        expect(validate(notC2)).toBe(false);
    });

    it('should validate object + errors with circular references', () => {
        const valWithErrors = rtCircular.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(c1)).toEqual([]);
        expect(valWithErrors(c2)).toEqual([]);
        expect(valWithErrors(c3)).toEqual([]);

        expect(valWithErrors(notC1)).toEqual([{path: ['c', 's'], expected: 'string'}]);
        expect(valWithErrors(notC2)).toEqual([{path: ['c', 's'], expected: 'string'}]);
    });

    it('should encode/decode objects with circular references', () => {
        const toJson = rtCircular.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtCircular.createJitFunction(JitFnIDs.jsonDecode);

        const copy1 = structuredClone(c1);
        const copy2 = structuredClone(c2);
        const copy3 = structuredClone(c3);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(c1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(c2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy3))))).toEqual(c3);
    });

    it('should use JSON.stringify when there are circular references', () => {
        const jsonStringify = rtCircular.createJitFunction(JitFnIDs.jsonStringify);

        const toJson = rtCircular.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtCircular.createJitFunction(JitFnIDs.jsonDecode);

        const copy1 = structuredClone(c1);
        const copy2 = structuredClone(c2);
        const copy3 = structuredClone(c3);
        expect(fromJson(JSON.parse(jsonStringify(toJson(copy1))))).toEqual(c1);
        expect(fromJson(JSON.parse(jsonStringify(toJson(copy2))))).toEqual(c2);
        expect(fromJson(JSON.parse(jsonStringify(toJson(copy3))))).toEqual(c3);
    });
});

/**  Test Circular array + union type:
type CuArray = (CuArray | Date | number | string)[];
*/
describe('Circular array + union', () => {
    type CuArray = (CuArray | Date | number | string)[];
    const rt = runType<CuArray>();

    const date = new Date();

    const cu1: CuArray = [date, 123, 'hello', ['a', 'b', 'c']];
    const cu2: CuArray = [date, 123, 'hello', ['a', 2, 'c'], cu1];
    const cu3: CuArray = [];

    const notCu1 = [date, 123, 'hello', ['a', 2, 'c'], {a: 1, b: 2}]; // last element is not a CuArray
    const notCu2 = ['hello', 123, [{a: 1, b: 2}]]; // last element is not a CuArray
    const notCu3 = {};
    const notCu4 = null;

    it('validate CircularUnion array', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(cu1)).toBe(true);
        expect(validate(cu2)).toBe(true);
        expect(validate(cu3)).toBe(true);

        expect(validate(notCu1)).toBe(false);
        expect(validate(notCu2)).toBe(false);
        expect(validate(notCu3)).toBe(false);
        expect(validate(notCu4)).toBe(false);
    });

    it('validate CircularUnion array + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(cu1)).toEqual([]);
        expect(valWithErrors(cu2)).toEqual([]);
        expect(valWithErrors(cu3)).toEqual([]);

        expect(valWithErrors(notCu1)).toEqual([{path: [4], expected: 'union'}]);
        expect(valWithErrors(notCu2)).toEqual([{path: [2], expected: 'union'}]);
        expect(valWithErrors(notCu3)).toEqual([{path: [], expected: 'array'}]);
        expect(valWithErrors(notCu4)).toEqual([{path: [], expected: 'array'}]);
    });

    it('encode/decode CircularUnion array to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copy1: CuArray = [date, 123, 'hello', ['a', 'b', 'c']];
        const copy2: CuArray = [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]];
        const copy3: CuArray = [];

        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(cu1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(cu2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy3))))).toEqual(cu3);
    });

    it('json stringify CircularUnion array with discriminator', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copy1: CuArray = [date, 123, 'hello', ['a', 'b', 'c']];
        const copy2: CuArray = [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]];
        const copy3: CuArray = [];

        expect(fromJson(JSON.parse(jsonStringify(copy1))).length).toEqual(cu1.length);
        expect(fromJson(JSON.parse(jsonStringify(copy2))).length).toEqual(cu2.length);
        expect(fromJson(JSON.parse(jsonStringify(copy3))).length).toEqual(cu3.length);
    });

    it('mock CircularUnion array', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(rt.mock() instanceof Array).toBe(true);
        expect(validate(rt.mock())).toBe(true);
    });
});

/**  Test Circular Object with tuple for type:
interface CircularTuple {
    tuple: [number, CircularTuple];
}
*/
describe('Circular object with tuple', () => {
    interface CircularTuple {
        tuple: [bigint, CircularTuple?];
    }
    const rt = runType<CircularTuple>();

    const c1: CircularTuple = {tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]};
    const c2: CircularTuple = {tuple: [1n, {tuple: [2n]}]};
    const c3: CircularTuple = {tuple: [1n]};

    const notC1 = {tuple: [1n, {tuple: 'hello'}]}; // wrong tuple type
    const notC2 = {tuple: [1n, {tuple: []}]}; // missing big int
    const notC3 = [];
    const notC4 = null;

    it('validate CircularTuple object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(c1)).toBe(true);
        expect(validate(c2)).toBe(true);
        expect(validate(c3)).toBe(true);

        expect(validate(notC1)).toBe(false);
        expect(validate(notC2)).toBe(false);
        expect(validate(notC3)).toBe(false);
        expect(validate(notC4)).toBe(false);
    });

    it('validate CircularTuple object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(c1)).toEqual([]);
        expect(valWithErrors(c2)).toEqual([]);
        expect(valWithErrors(c3)).toEqual([]);

        expect(valWithErrors(notC1)).toEqual([{path: ['tuple', 1, 'tuple'], expected: 'tuple'}]);
        expect(valWithErrors(notC2)).toEqual([{path: ['tuple', 1, 'tuple', 0], expected: 'bigint'}]);
        // TODO: note this is an array and should fail at root but that would involve an extra check, for every single object, just to check against an empty array
        expect(valWithErrors(notC3)).toEqual([{path: ['tuple'], expected: 'tuple'}]);
        expect(valWithErrors(notC4)).toEqual([{path: [], expected: 'object'}]);
    });

    it('encode/decode CircularTuple object to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copy1: CircularTuple = {tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]};
        const copy2: CircularTuple = {tuple: [1n, {tuple: [2n]}]};
        const copy3: CircularTuple = {tuple: [1n]};

        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(c1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(c2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy3))))).toEqual(c3);
    });

    it('json stringify CircularTuple object with discriminator', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copy1: CircularTuple = {tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]};
        const copy2: CircularTuple = {tuple: [1n, {tuple: [2n]}]};
        const copy3: CircularTuple = {tuple: [1n]};

        expect(fromJson(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
        expect(fromJson(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
        expect(fromJson(JSON.parse(jsonStringify(copy3)))).toEqual(c3);
    });

    it('mock CircularTuple object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(rt.mock() instanceof Object).toBe(true);
        expect(validate(rt.mock())).toBe(true);
    });
});

/**  Test Circular Object with index property:
interface CircularIndex {
    index: {[key: string]: CircularIndex};
}
*/
describe('Circular Object with index property', () => {
    interface CircularIndex {
        index: {[key: string]: CircularIndex};
    }
    const rt = runType<CircularIndex>();

    const c1: CircularIndex = {index: {a: {index: {b: {index: {}}}}}};
    const c2: CircularIndex = {index: {a: {index: {}}}};
    const c3: CircularIndex = {index: {}};

    const notC1 = {index: {a: 1234}};
    const notC2 = {index: {a: {index: 'hello'}}};
    const notC3 = new Date();

    it('validate CircularIndex object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(c1)).toBe(true);
        expect(validate(c2)).toBe(true);
        expect(validate(c3)).toBe(true);

        expect(validate(notC1)).toBe(false);
        expect(validate(notC2)).toBe(false);
        expect(validate(notC3)).toBe(false);
    });

    it('validate CircularIndex object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(c1)).toEqual([]);
        expect(valWithErrors(c2)).toEqual([]);
        expect(valWithErrors(c3)).toEqual([]);

        expect(valWithErrors(notC1)).toEqual([{path: ['index', 'a'], expected: 'object'}]);
        expect(valWithErrors(notC2)).toEqual([{path: ['index', 'a', 'index'], expected: 'object'}]);
        // note date is an object but is missing the index property
        expect(valWithErrors(notC3)).toEqual([{path: ['index'], expected: 'object'}]);
    });

    it('encode/decode CircularIndex object to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copy1: CircularIndex = {index: {a: {index: {b: {index: {}}}}}};
        const copy2: CircularIndex = {index: {a: {index: {}}}};
        const copy3: CircularIndex = {index: {}};

        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(c1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(c2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy3))))).toEqual(c3);
    });

    it('json stringify CircularIndex object with discriminator', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copy1: CircularIndex = {index: {a: {index: {b: {index: {}}}}}};
        const copy2: CircularIndex = {index: {a: {index: {}}}};
        const copy3: CircularIndex = {index: {}};

        expect(fromJson(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
        expect(fromJson(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
        expect(fromJson(JSON.parse(jsonStringify(copy3)))).toEqual(c3);
    });

    it('mock CircularIndex object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(rt.mock() instanceof Object).toBe(true);
        expect(validate(rt.mock())).toBe(true);
    });
});

/**  Test Circular Object with deep nested properties:
interface CircularDeep {
    deep: {deep: {deep: {deep?: CircularDeep}}};
}
*/
describe('Circular Object with deep nested properties', () => {
    interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
    }
    const rt = runType<CircularDeep>();

    const c1: CircularDeep = {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}};
    const c2: CircularDeep = {deep1: {deep2: {deep3: {}}}};

    const notC1 = {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: 1234}}}}}}};
    const notC2 = {deep1: {}};
    const notC3 = {deep1: {deep2: {deep3: 12435}}};
    const notC4 = {deep1: {deep2: {deep3: {deep4: 'hello'}}}};
    const notC5 = 'hello';

    it('validate CircularDeep object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(c1)).toBe(true);
        expect(validate(c2)).toBe(true);

        expect(validate(notC1)).toBe(false);
        expect(validate(notC2)).toBe(false);
        expect(validate(notC3)).toBe(false);
        expect(validate(notC4)).toBe(false);
        expect(validate(notC5)).toBe(false);
    });

    it('validate CircularDeep object + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(c1)).toEqual([]);
        expect(valWithErrors(c2)).toEqual([]);

        expect(valWithErrors(notC1)).toEqual([
            {path: ['deep1', 'deep2', 'deep3', 'deep4', 'deep1', 'deep2', 'deep3'], expected: 'object'},
        ]);
        expect(valWithErrors(notC2)).toEqual([{path: ['deep1', 'deep2'], expected: 'object'}]);
        expect(valWithErrors(notC3)).toEqual([{path: ['deep1', 'deep2', 'deep3'], expected: 'object'}]);
        expect(valWithErrors(notC4)).toEqual([{path: ['deep1', 'deep2', 'deep3', 'deep4'], expected: 'object'}]);
        expect(valWithErrors(notC5)).toEqual([{path: [], expected: 'object'}]);
    });

    it('encode/decode CircularDeep object to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copy1: CircularDeep = {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}};
        const copy2: CircularDeep = {deep1: {deep2: {deep3: {}}}};

        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(c1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(c2);
    });

    it('json stringify CircularDeep object with discriminator', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copy1: CircularDeep = {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}};
        const copy2: CircularDeep = {deep1: {deep2: {deep3: {}}}};

        expect(fromJson(JSON.parse(jsonStringify(copy1)))).toEqual(c1);
        expect(fromJson(JSON.parse(jsonStringify(copy2)))).toEqual(c2);
    });

    it('mock CircularDeep object', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(rt.mock() instanceof Object).toBe(true);
        expect(validate(rt.mock())).toBe(true);
    });
});
