/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    buildJsonEncodeJITFn,
    buildJsonDecodeJITFn,
    buildIsTypeJITFn,
    buildTypeErrorsJITFn,
    buildJsonStringifyJITFn,
} from '../jitCompiler';

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
        // TODO: index
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
        const validate = buildIsTypeJITFn(rt).fn;
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
    });

    it('validate empty object for ObjectAllOptional type', () => {
        const validate = buildIsTypeJITFn(rtOpt).fn;
        expect(validate({})).toBe(true);
    });

    it('validate object + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
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
        expect(valWithErrors('hello')).toEqual([
            {
                path: [],
                expected: `interface`,
            },
        ]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const typeValue = {
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
        };
        expect(rt.isJsonDecodeRequired).toBe(true);
        expect(rt.isJsonEncodeRequired).toBe(true);
        expect(fromJson(toJson(typeValue))).toEqual(typeValue);
    });

    // TODO: disabled for now. JSON strict will be moved to an extra validation step instead when serializing/deserializing
    it.skip('skip props when encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rtSkip).fn;
        const fromJson = buildJsonDecodeJITFn(rtSkip).fn;
        const typeValue = {
            name: 'hello',
            methodProp: () => 'hello',
            [Symbol('test')]: 'hello',
        };
        expect(fromJson(toJson(typeValue))).toEqual({name: 'hello'});
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const typeValue = {
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
        };
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = {
            startDate: new Date(),
            quantity: 123,
            name: 'hello',
            nullValue: null,
            stringArray: ['a', 'b', 'c'],
            bigInt: BigInt(123),
            "weird prop name \n?>'\\\t\r": 'hello2',
            optionalString: 'hello',
        };
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
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
        const validate = buildIsTypeJITFn(rtI).fn;
        expect(validate({name: 'John', surname: 'Doe'})).toBe(true);

        const valWithErrors = buildTypeErrorsJITFn(rtI).fn;
        expect(valWithErrors({name: 'John', surname: 'Doe'})).toEqual([]);

        const toJson = buildJsonEncodeJITFn(rtI).fn;
        const fromJson = buildJsonDecodeJITFn(rtI).fn;
        const typeValue = {name: 'John', surname: 'Doe'};
        expect(fromJson(toJson(typeValue))).toEqual(typeValue);

        const jsonStringify = buildJsonStringifyJITFn(rtI).fn;
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('startDate');
        expect(mocked).toHaveProperty('quantity');
        expect(mocked).toHaveProperty('name');
        expect(mocked).toHaveProperty('nullValue');
        expect(mocked).toHaveProperty('stringArray');
        expect(mocked).toHaveProperty('bigInt');
        expect(mocked).toHaveProperty("weird prop name \n?>'\\\t\r");
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with circular properties', () => {
    interface ICircular {
        name: string;
        child?: ICircular;
        // TODO: infinite loop or self referencing objects
        // self: ICircular;
    }

    const rt = runType<ICircular>();

    it('validate circular object', () => {
        const validate = buildIsTypeJITFn(rt).fn;
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        expect(validate(obj)).toBe(true);
    });

    it('validate circular object + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        expect(valWithErrors(obj)).toEqual([]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        expect(fromJson(toJson(obj))).toEqual(obj);
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const obj: ICircular = {name: 'hello', child: {name: 'world'}};
        const roundTrip = fromJson(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parent === 'undefined' || typeof mocked.parent === 'object').toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with circular type array', () => {
    interface ICircularArray {
        name: string;
        children?: ICircularArray[];
    }

    const rt = runType<ICircularArray>();

    it('validate circular interface on array', () => {
        const validate = buildIsTypeJITFn(rt).fn;
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);
    });

    it('validate circular interface on array + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {name: 'hello', children: [{name: 123}, {name: 'world', children: null}]};
        expect(valWithErrors(obj3)).toEqual([
            {path: ['children', 0, 'name'], expected: 'string'},
            {path: ['children', 1, 'children'], expected: 'array'},
        ]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        expect(fromJson(toJson(obj1))).toEqual(obj1);
        expect(fromJson(toJson(obj2))).toEqual(obj2);
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const obj1: ICircularArray = {name: 'hello', children: []};
        const obj2: ICircularArray = {name: 'hello', children: [{name: 'world'}]};
        const roundTrip1 = fromJson(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    // todo: max stack size exceeded, this is because we are generating a full array with all recursive items with more array with recursive items.
    // so the fix would be ti reduce the probability of generating an optional property the deeper we go.
    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parents === 'undefined' || Array.isArray(mocked.parents)).toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
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
        const validate = buildIsTypeJITFn(rt).fn;
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);

        const obj3 = {name: 'hello', embedded: {hello: 123}};
        expect(validate(obj3)).toBe(false);
    });
    function anonymous(µTils) {
        function jitƒn(vλl) {
            return (
                typeof vλl === 'object' &&
                vλl !== null &&
                !Array.isArray(vλl) &&
                typeof vλl.name === 'string' &&
                typeof vλl.embedded === 'object' &&
                vλl.embedded !== null &&
                !Array.isArray(vλl.embedded) &&
                typeof vλl.embedded.hello === 'string' &&
                µTils.getFromJitCache('child?:undefined:isT')(vλl.embedded.child)
            );
        }
        return jitƒn;
    }

    it('validate circular interface on nested object + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {name: 'hello', embedded: {hello: 123}};
        expect(valWithErrors(obj3)).toEqual([{path: ['embedded', 'hello'], expected: 'string'}]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        expect(fromJson(toJson(obj1))).toEqual(obj1);
        expect(fromJson(toJson(obj2))).toEqual(obj2);
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const obj1: ICircularDeep = {name: 'hello', embedded: {hello: 'world'}};
        const obj2: ICircularDeep = {
            name: 'hello',
            embedded: {hello: 'world', child: {name: 'world1', embedded: {hello: 'world2'}}},
        };
        const roundTrip1 = fromJson(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(mocked).toHaveProperty('embedded');
        expect(typeof mocked.embedded.child === 'undefined' || typeof mocked.embedded.child === 'object').toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Interface with circular tuple', () => {
    interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
    }

    const rt = runType<ICircularTuple>();

    it('validate circular interface on tuple', () => {
        const validate = buildIsTypeJITFn(rt).fn;
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);

        const obj3 = {name: 'hello', parent: ['world', 123]};
        expect(validate(obj3)).toBe(false);
    });

    it('validate circular interface on tuple + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        expect(valWithErrors(obj1)).toEqual([]);
        expect(valWithErrors(obj2)).toEqual([]);

        const obj3 = {name: 'hello', parent: ['world', 123]};
        expect(valWithErrors(obj3)).toEqual([{path: ['parent', 1], expected: 'interface'}]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        expect(fromJson(toJson(obj1))).toEqual(obj1);
        expect(fromJson(toJson(obj2))).toEqual(obj2);
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        const roundTrip1 = fromJson(JSON.parse(jsonStringify(obj1)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(obj2)));
        expect(roundTrip1).toEqual(obj1);
        expect(roundTrip2).toEqual(obj2);
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(mocked).toHaveProperty('name');
        expect(typeof mocked.parent === 'undefined' || Array.isArray(mocked.parent)).toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});
