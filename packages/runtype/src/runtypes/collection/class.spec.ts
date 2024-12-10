/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';
import exp from 'constants';

class SerializableClass {
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

const serializable = new SerializableClass();

const rt = runType<SerializableClass>();
const rtNonS = runType<NonSerializableClass>();

it('validate class', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(serializable)).toBe(true);
});

it('validate empty class', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(new SerializableClass())).toBe(true);
});

it('validate class + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(serializable)).toEqual([]);
});

it('encode/decode class to json', () => {
    const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
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
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
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

it('classes can not be decoded', () => {
    expect(() => rtNonS.createJitFunction(JitFnIDs.fromJsonVal)).toThrow(`Classes can not be deserialized.`);
});

it('mock class', () => {
    const mock = rt.mock();
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(mock instanceof SerializableClass).toBeTruthy();
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
        const validate = rtExtended.createJitFunction(JitFnIDs.isType);
        expect(validate(extended)).toBe(true);
        expect(validate(base)).toBe(false);
    });

    it('validate extended class + errors', () => {
        const valWithErrors = rtExtended.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors(extended)).toEqual([]);
        expect(valWithErrors(base)).toEqual([{path: ['extendedProp'], expected: 'string'}]);
        expect(valWithErrors(null)).toEqual([{path: [], expected: 'class'}]);
    });

    it('encode/decode extended class to json', () => {
        const toJsonVal = rtExtended.createJitFunction(JitFnIDs.toJsonVal);
        // restored object has the properties of the original object but is not a class instance
        const restored = JSON.parse(JSON.stringify(toJsonVal(extended)));
        expect(restored).toEqual({
            baseProp: extended.baseProp,
            extendedProp: extended.extendedProp,
        });
    });

    it('json stringify extended class', () => {
        const jsonStringify = rtExtended.createJitFunction(JitFnIDs.jsonStringify);
        // restored object has the properties of the original object but is not a class instance
        const restored = JSON.parse(jsonStringify(extended));
        expect(restored).toEqual({
            baseProp: extended.baseProp,
            extendedProp: extended.extendedProp,
        });
    });

    it('mock extended class', () => {
        const mock = rtExtended.mock();
        const validate = rtExtended.createJitFunction(JitFnIDs.isType);
        expect(mock instanceof ExtendedClass).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});
