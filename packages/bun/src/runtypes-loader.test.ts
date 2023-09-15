/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {expect, test} from 'bun:test';
import {User, user} from './models.js';
import {validate} from '@deepkit/type';

test('use deepkit reflection', async () => {
    const validationResult = validate<User>(user);
    console.log('validationResult', validationResult);
    expect(validationResult).toEqual([]);
});
