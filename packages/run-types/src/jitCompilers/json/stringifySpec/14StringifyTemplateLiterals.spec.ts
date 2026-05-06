/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect, afterEach} from 'vitest';
import {SERIALIZATION_SPEC} from '../../serialization-suite.ts';
import {roundTrip, createSerializationFns} from './stringifyHelpers.ts';

let ranTests = 0;
afterEach(() => ranTests++);

it('template literal as URL string type', () => {
    const {rt, values} = SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_string.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(deserialized).toEqual(value);
    });
});

it('template literal as object property', () => {
    const {rt, values} = SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_in_object.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(deserialized).toEqual(value);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.TEMPLATE_LITERALS).length;
    expect(ranTests).toBe(totalTest);
});
