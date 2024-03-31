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
import {registerSerializableClass} from '../jitUtils';

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

class NonRegisteredClass {
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
const nonSerializable = new NonRegisteredClass('Jane', 'Smith', 1, new Date());
registerSerializableClass(SerializableClass);

it('register a non class throws an error', () => {
    expect(() => registerSerializableClass(SerializableClass)).not.toThrow();
    // TODO: NON serializable class should throw an error. but we don't have a way to check the number of parameters in the constructor
    // MyClass.constructor.length always returns 1, and MyClass.length always return 0.  no matter the number of parameters in the constructor
    // So at the moment we can only rely in typescript to enforce Serializable classes
    expect(() => registerSerializableClass('hello' as any)).toThrow('Only classes can be registered as for deserialization');
});

it('validate serializable object', () => {
    const validate = buildIsTypeJITFn(runType<SerializableClass>()).fn;
    expect(validate(serializable)).toBe(true);
});

it('validate non-serializable object', () => {
    const validate = buildIsTypeJITFn(runType<NonRegisteredClass>()).fn;
    expect(validate(nonSerializable)).toBe(true);
});

it('validate empty serializable object', () => {
    const validate = buildIsTypeJITFn(runType<SerializableClass>()).fn;
    expect(validate(new SerializableClass())).toBe(true);
});

it('validate empty non-serializable object', () => {
    const validate = buildIsTypeJITFn(runType<NonRegisteredClass>()).fn;
    expect(validate(new NonRegisteredClass('', '', 0, new Date()))).toBe(true);
});

it('validate serializable object + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(runType<SerializableClass>()).fn;
    expect(valWithErrors(serializable)).toEqual([]);
});

it('validate non-serializable object + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(runType<NonRegisteredClass>()).fn;
    expect(valWithErrors(nonSerializable)).toEqual([]);
});

it('encode/decode serializable object to json', () => {
    const toJson = buildJsonEncodeJITFn(runType<SerializableClass>()).fn;
    const fromJson = buildJsonDecodeJITFn(runType<SerializableClass>()).fn;
    const roundtrip = fromJson(JSON.parse(JSON.stringify(toJson(serializable))));
    expect(roundtrip).toEqual(serializable);
    expect(roundtrip.getFullName()).toEqual(serializable.getFullName());
});

it('decode non registered class throws an error', () => {
    expect(() => buildJsonEncodeJITFn(runType<NonRegisteredClass>())).not.toThrow();
    expect(() => buildJsonDecodeJITFn(runType<NonRegisteredClass>())).toThrow(
        `Class NonRegisteredClass can't be serialized. Make sure to register it using registerSerializableClass()`
    );
});

it('json stringify serializable object', () => {
    const jsonStringify = buildJsonStringifyJITFn(runType<SerializableClass>()).fn;
    const fromJson = buildJsonDecodeJITFn(runType<SerializableClass>()).fn;
    const roundTrip = fromJson(JSON.parse(jsonStringify(serializable)));
    expect(roundTrip).toEqual(serializable);
});
