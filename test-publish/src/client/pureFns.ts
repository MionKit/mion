/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {pureServerFn} from '@mionjs/core';

export const greeting = pureServerFn({
    pureFn: function greeting() {
        return 'Hello from pure fn!';
    },
    fnName: 'greeting',
});

export const addOne = pureServerFn({
    pureFn: function addOne(x: number) {
        return x + 1;
    },
    fnName: 'addOne',
});
