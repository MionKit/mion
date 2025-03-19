/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '../functions';
import {RunTypeError} from '../types';
import {UUID_V4, UUID_V7, mockUuidV7} from './uuid.runtype';

// ####### UUID v4 #######

// uuid v4 isType
// uuid v4 format is a string with the following name: xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx
// the 3rd section must start with 4
it('validate uuid v4', async () => {
    const isType = await isTypeFn<UUID_V4>();
    // valid v4 and variant
    expect(isType('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    expect(isType('FFFFFFFF-0000-4fff-aaaa-FFFFFFff9900')).toBe(true);
    // invalid version 4, start number of the 3rd must be 4, ie: xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx'
    expect(isType('f47ac10b-58cc-0372-a567-0e02b2c3d479')).toBe(false);
    // invalid characters
    expect(isType('!47ac10b-58cc-4372-a567-0e02b2c3d45f')).toBe(false);
    expect(isType('G47ac10b-58cc-4372-a567-0e02b2c3d45f')).toBe(false);
    // wrong length
    expect(isType('f47ac10b-58cc-4372-a567-')).toBe(false);

    const someIds = Array.from({length: 20}, () => crypto.randomUUID());
    for (const uuid of someIds) expect(isType(uuid)).toBe(true);
});

//  uuid v4 typeErrors
it('get uuid v4 errors', async () => {
    const typeErrors = await typeErrorsFn<UUID_V4>();
    const expectedError: RunTypeError = {expected: 'string', path: [], format: {name: 'uuid', formatPath: ['version'], val: '4'}};
    // valid v4 and variant
    expect(typeErrors('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toEqual([]);
    expect(typeErrors('FFFFFFFF-0000-4fff-aaaa-FFFFFFff9900')).toEqual([]);
    // invalid version 4, start number of the 3rd must be 4, ie: xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx'
    expect(typeErrors('f47ac10b-58cc-0372-a567-0e02b2c3d479')).toEqual([expectedError]);
    // invalid characters
    expect(typeErrors('!47ac10b-58cc-4372-a567-0e02b2c3d45f')).toEqual([expectedError]);
    expect(typeErrors('G47ac10b-58cc-4372-a567-0e02b2c3d45f')).toEqual([expectedError]);
    // wrong length
    expect(typeErrors('f47ac10b-58cc-4372-a567-')).toEqual([expectedError]);

    const someIds = Array.from({length: 20}, () => crypto.randomUUID());
    for (const uuid of someIds) expect(typeErrors(uuid)).toEqual([]);
});

// uuid v4 mock
it('mock uuid v4', async () => {
    const mockType = mockTypeFn<UUID_V4>();
    const isType = await isTypeFn<UUID_V4>();
    const someIds = Array.from({length: 20}, () => mockType());
    for (const uuid of someIds) expect(isType(uuid)).toBe(true);
});

// ####### UUID v7 #######

// uuid v7 isType
it('validate uuid v7', async () => {
    const isType = await isTypeFn<UUID_V7>();
    // valid v7 and variant
    expect(isType('f47ac10b-58cc-7372-b909-0e02b2c3d479')).toBe(true);
    expect(isType('FFFFFFFF-0000-7fff-aaaa-FFFFFFff9900')).toBe(true);
    // invalid version 7, start number of the 3rd must be 7, ie: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx'
    expect(isType('f47ac10b-58cc-4372-4xxx-0e02b2c3d479')).toBe(false);
    // invalid characters
    expect(isType('!47ac10b-58cc-7372-a567-0e02b2c3d45f')).toBe(false);
    expect(isType('G47ac10b-58cc-7372-a567-0e02b2c3d45f')).toBe(false);
    // wrong length
    expect(isType('f47ac10b-58cc-7372-a567-')).toBe(false);

    const someIds = Array.from({length: 20}, () => mockUuidV7());
    for (const uuid of someIds) expect(isType(uuid)).toBe(true);
});

//  uuid v7 typeErrors
it('get uuid v7 errors', async () => {
    const typeErrors = await typeErrorsFn<UUID_V7>();
    const expectedError: RunTypeError = {expected: 'string', path: [], format: {name: 'uuid', formatPath: ['version'], val: '7'}};
    // valid v7 and variant
    expect(typeErrors('f47ac10b-58cc-7372-b909-0e02b2c3d479')).toEqual([]);
    expect(typeErrors('FFFFFFFF-0000-7fff-aaaa-FFFFFFff9900')).toEqual([]);
    // invalid version 7, start number of the 3rd must be 7, ie: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx'
    expect(typeErrors('f47ac10b-58cc-4372-4xxx-0e02b2c3d479')).toEqual([expectedError]);
    // invalid characters
    expect(typeErrors('!47ac10b-58cc-7372-a567-0e02b2c3d45f')).toEqual([expectedError]);
    expect(typeErrors('G47ac10b-58cc-7372-a567-0e02b2c3d45f')).toEqual([expectedError]);
    // wrong length
    expect(typeErrors('f47ac10b-58cc-7372-a567-')).toEqual([expectedError]);

    const someIds = Array.from({length: 20}, () => mockUuidV7());
    for (const uuid of someIds) expect(typeErrors(uuid)).toEqual([]);
});

// uuid v7 mock
it('mock uuid v7', async () => {
    const mockType = mockTypeFn<UUID_V7>();
    const isType = await isTypeFn<UUID_V7>();
    const someIds = Array.from({length: 20}, () => mockType());
    for (const uuid of someIds) expect(isType(uuid)).toBe(true);
});
