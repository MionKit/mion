/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SERIALIZATION_SPEC} from '../../serialization-suite';
import {JitFunctions} from '../../../constants.functions';
import {roundTrip, createSerializationFns} from './jsonHelpers';

const SERIALIZE_FN = JitFunctions.prepareForJson;
const DESERIALIZE_FN = JitFunctions.restoreFromJson;

let ranTests = 0;
afterEach(() => ranTests++);

it('string', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.string.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('number', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.number.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized, serialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('number not supported', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.number_not_supported.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        let didThrow = false;
        let result: any;
        try {
            result = roundTrip(serialize, deserialize, value).deserialized;
            expect(result).not.toEqual(value);
            return;
        } catch (error) {
            didThrow = true;
        }
        expect(didThrow).toBeTruthy();
    });
});

it('regexp', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.regexp.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('bigint', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.bigint.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('boolean', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.boolean.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('any', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.any.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);
    // JSON.parse(undefined) throws an error, so we need to skip deserialization
    const deserializeUndefined = (v: any) => (typeof v === 'undefined' ? undefined : deserialize(v));

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserializeUndefined, value);
        expect(value).toEqual(deserialized);
    });
});

it('any not supported', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.not_supported_any.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);
    values.forEach((value) => {
        let didThrow = false;
        let result: any;
        try {
            result = roundTrip(serialize, deserialize, value).deserialized;
            expect(result).not.toEqual(value);
            return;
        } catch (error) {
            didThrow = true;
        }
        expect(didThrow).toBeTruthy();
    });
});

it('null', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.null.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('undefined', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.undefined.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);
    // JSON.parse(undefined) throws an error, so we need to skip deserialization
    const deserializeUndefined = (v: any) => (typeof v === 'undefined' ? undefined : deserialize(v));

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserializeUndefined, value);
        // undefined returns undefined instead an string
        expect(typeof serialized).toBe('undefined');
        expect(value).toEqual(deserialized);
    });
});

it('date', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.date.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('enum', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.enum.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('symbol', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.symbol.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(deserialized.toString()).toEqual(value.toString());
    });
});

it('object', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.object.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('void', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.void.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);
    // json.parse does not support undefined, so we need to skip deserialization
    const deserializeUndefined = (v: any) => (typeof v === 'undefined' ? undefined : deserialize(v));

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserializeUndefined, value);
        expect(typeof serialized).toBe('undefined');
        expect(value).toEqual(deserialized);
    });
});

it('never', () => {
    const {rt} = SERIALIZATION_SPEC.ATOMIC.never.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow('Never type cannot be encoded to JSON.');
    expect(() => rt.createJitFunction(DESERIALIZE_FN)).toThrow('Never type cannot be decoded from JSON.');
});

it('literal string', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.literal_string.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('literal number', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.literal_number.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('literal boolean', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.literal_boolean.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('literal regexp', () => {
    const {rt, values} = SERIALIZATION_SPEC.ATOMIC.literal_regexp.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.ATOMIC).length;
    expect(ranTests).toBe(totalTest);
});
