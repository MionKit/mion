/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {pureServerFn} from '@mionjs/core';

export const greeting = pureServerFn(function greeting() {
    return 'Hello from pure fn!';
});

export const addOne = pureServerFn(function addOne(x: number) {
    return x + 1;
});
