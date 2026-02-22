/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {pureServerFn} from '@mionkit/core';

/** Simple pure function for e2e testing of server pure functions extraction */
export const greetingPureFn = pureServerFn({
    pureFn: function greeting() {
        return 'hello from pure function';
    },
    fnName: 'greeting',
});
