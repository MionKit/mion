/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';
import {jitUtils} from '@mionkit/core/jitUtils';
import {DataOnly} from '@mionkit/core/types';

class MySerializableClass {
    name: string;
    surname: string;
    id: number;
    startDate: Date;
    constructor() {
        this.name = 'John';
        this.surname = 'Doe';
        this.id = 0;
        this.startDate = new Date();
    }

    getConstructorParams(): [] {
        return [];
    }

    getFullName() {
        return `${this.name} ${this.surname}`;
    }
}

class NonSerializableClass {
    constructor(
        public name: string,
        public surname: string,
        public id: number,
        public startDate: Date
    ) {}

    getFullName() {
        return `${this.name} ${this.surname}`;
    }
}

const serializable = new MySerializableClass();

const rt = runType<MySerializableClass>();
const rtNonS = runType<NonSerializableClass>();

it('validate class', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(serializable)).toBe(true);
});

it('validate empty class', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(new MySerializableClass())).toBe(true);
});

it('validate class + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(serializable)).toEqual([]);
});

it('encode/decode class to json', () => {
    const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
    // restored object has the properties of the original object but is not a class instance
    const restored = JSON.parse(JSON.stringify(toJsonVal(serializable)));
    // TODO: decide if we want to include methods in the serialization
    expect(restored).toEqual({
        name: serializable.name,
        surname: serializable.surname,
        id: serializable.id,
        startDate: serializable.startDate.toJSON(),
    });
});

it('json stringify class', () => {
    const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
    // restored object has the properties of the original object but is not a class instance
    const restored = JSON.parse(jsonStringify(serializable));
    // TODO: decide if we want to include methods in the serialization
    expect(restored).toEqual({
        name: serializable.name,
        surname: serializable.surname,
        id: serializable.id,
        startDate: serializable.startDate.toJSON(),
    });
});

it('non serializable classes can not be decoded', () => {
    expect(() => rtNonS.createJitFunction(JitFunctions.fromJsonVal)).toThrow(
        `Class NonSerializableClass can not be deserialized.`
    );
});

it('serializable class can be restored after they are registered', async () => {
    const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
    expect(() => rt.createJitFunction(JitFunctions.fromJsonVal)).toThrow();
    jitUtils.setSerializableClass(MySerializableClass);
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const restored = fromJsonVal(JSON.parse(jsonStringify(serializable)));
    expect(restored instanceof MySerializableClass).toBeTruthy();
});

it('classes can be deserialized suing a deserialize function', () => {
    const jsonStringify = rtNonS.createJitFunction(JitFunctions.jsonStringify);
    expect(() => rtNonS.createJitFunction(JitFunctions.fromJsonVal)).toThrow();
    jitUtils.setDeserializeFn(NonSerializableClass, (deserialized: DataOnly<NonSerializableClass>) => {
        const instance = new NonSerializableClass(
            deserialized.name,
            deserialized.surname,
            deserialized.id,
            deserialized.startDate
        );
        return instance;
    });
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const restored = fromJsonVal(JSON.parse(jsonStringify(serializable)));
    expect(restored instanceof MySerializableClass).toBeTruthy();
});

it('mock class', async () => {
    const mock = await rt.mock();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(mock instanceof MySerializableClass).toBeTruthy();
    expect(validate(mock)).toBe(true);
});

it.todo('decide what to do with methods in classes, if include them on jit functions or not');

describe('Classes that extend other classes', () => {
    class BaseClass {
        baseProp: string = 'base'; // properties must be all strongly typed otherwise types wont appear in the jit code
    }
    class ExtendedClass extends BaseClass {
        // TODO: build eslint rule that enforces all properties to be strongly typed
        extendedProp: string = 'extended'; // properties must be all strongly typed otherwise types wont appear in the jit code
    }
    const rtExtended = runType<ExtendedClass>();
    const extended = new ExtendedClass();
    const base = new BaseClass();

    it('validate all properties of extended class', () => {
        const validate = rtExtended.createJitFunction(JitFunctions.isType);
        expect(validate(extended)).toBe(true);
        expect(validate(base)).toBe(false);
    });

    it('validate extended class + errors', () => {
        const valWithErrors = rtExtended.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors(extended)).toEqual([]);
        expect(valWithErrors(base)).toEqual([{path: ['extendedProp'], expected: 'string'}]);
        expect(valWithErrors(null)).toEqual([{path: [], expected: 'class'}]);
    });

    it('encode/decode extended class to json', () => {
        const toJsonVal = rtExtended.createJitFunction(JitFunctions.toJsonVal);
        // restored object has the properties of the original object but is not a class instance
        const restored = JSON.parse(JSON.stringify(toJsonVal(extended)));
        expect(restored).toEqual({
            baseProp: extended.baseProp,
            extendedProp: extended.extendedProp,
        });
    });

    it('json stringify extended class', () => {
        const jsonStringify = rtExtended.createJitFunction(JitFunctions.jsonStringify);
        // restored object has the properties of the original object but is not a class instance
        const restored = JSON.parse(jsonStringify(extended));
        expect(restored).toEqual({
            baseProp: extended.baseProp,
            extendedProp: extended.extendedProp,
        });
    });

    it('mock extended class', async () => {
        const mock = await rtExtended.mock();
        const validate = rtExtended.createJitFunction(JitFunctions.isType);
        expect(mock instanceof ExtendedClass).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});
