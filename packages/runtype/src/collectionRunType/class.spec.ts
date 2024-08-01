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
const nonSerializable = new NonSerializableClass('Jane', 'Smith', 1, new Date());

it('validate serializable object', () => {
    const validate = buildIsTypeJITFn(runType<SerializableClass>()).fn;
    expect(validate(serializable)).toBe(true);
});

it('validate non-serializable object', () => {
    const validate = buildIsTypeJITFn(runType<NonSerializableClass>()).fn;
    expect(validate(nonSerializable)).toBe(true);
});

it('validate empty serializable object', () => {
    const validate = buildIsTypeJITFn(runType<SerializableClass>()).fn;
    expect(validate(new SerializableClass())).toBe(true);
});

it('validate empty non-serializable object', () => {
    const validate = buildIsTypeJITFn(runType<NonSerializableClass>()).fn;
    expect(validate(new NonSerializableClass('', '', 0, new Date()))).toBe(true);
});

it('validate serializable object + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(runType<SerializableClass>()).fn;
    expect(valWithErrors(serializable)).toEqual([]);
});

it('validate non-serializable object + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(runType<NonSerializableClass>()).fn;
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
    expect(() => buildJsonEncodeJITFn(runType<NonSerializableClass>())).not.toThrow();
    expect(() => buildJsonDecodeJITFn(runType<NonSerializableClass>())).toThrow(
        `Class NonSerializableClass can't be deserialized. Only classes with and empty constructor can be deserialized.`
    );
});

it('json stringify serializable object', () => {
    const jsonStringify = buildJsonStringifyJITFn(runType<SerializableClass>()).fn;
    const fromJson = buildJsonDecodeJITFn(runType<SerializableClass>()).fn;
    const roundTrip = fromJson(JSON.parse(jsonStringify(serializable)));
    expect(roundTrip).toEqual(serializable);
});
