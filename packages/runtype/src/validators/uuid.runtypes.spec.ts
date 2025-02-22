/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, typeErrorsFn} from '../functions';
import {UUID_V4, UUID_V7} from './uuid.runtypes';

// uuid v4 isType:å
// uuid v4 format is a string with the following format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
// where x is a random hex digit and y is a random hex digit from 8 to b
// the 3rd section must start with 4
it('validate uuid v4', async () => {
    const isType = await isTypeFn<UUID_V4>();
    // valid v4 and variant
    expect(isType('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    expect(isType('xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx')).toBe(true);
    // invalid version 4, start number of the 3rd must be 4, ie: xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx'
    expect(isType('f47ac10b-58cc-0372-a567-0e02b2c3d479')).toBe(false);
    // invalid variant, start number of the 4th section must be  ie: xxxxxxxx-xxxx-xxxx-Yxxx-xxxxxxxxxxxx'
});

//  uuid v4 typeErrors
it('get uuid v4 errors', async () => {
    const typeErrors = await typeErrorsFn<UUID_V4>();
    const expectedErr = {expected: 'string', path: [], info: {format: 'uuid', typeName: 'UUID_V4'}};
});

// uuid v7 isType:
// uuid v7 format is a string with the following format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
// where a is the first 8 characters of the current timestamp in hex
// where x is a random hex digit and y is a random hex digit from 8 to b
// the 3rd section must start with 7
it('validate uuid v7', async () => {
    const isType = await isTypeFn<UUID_V7>();
});

//  uuid v7 typeErrors
it('get uuid v7 errors', async () => {
    const typeErrors = await typeErrorsFn<UUID_V7>();
    const expectedErr = {expected: 'string', path: [], info: {format: 'uuid', typeName: 'UUID_V7'}};
});
