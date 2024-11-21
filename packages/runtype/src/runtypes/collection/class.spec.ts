/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

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
    const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
    // restored object has the properties of the original object but is not a class instance
    const restored = JSON.parse(JSON.stringify(toJson(serializable)));
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
    expect(() => rtNonS.createJitFunction(JitFnIDs.jsonDecode)).toThrow(`Classes can not be deserialized.`);
});

it('mock class', () => {
    const mock = rt.mock();
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(mock instanceof SerializableClass).toBeTruthy();
    expect(validate(mock)).toBe(true);
});

it.todo('decide what to do with methods in classes, if include them on jit functions or not');
