/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mionHooks} from '.';

/**
 * These hook are indirectly tested by router and http test, so wont be tested here
 */

describe('hooks should', () => {
    it('export hooks with the internal flags', () => {
        expect(mionHooks.mionHttpConnectionHook).toBeTruthy();
        expect(mionHooks.mionHttpCloseConnectionHook).toBeTruthy();
        expect(mionHooks.mionParseJsonRequestBodyHook).toBeTruthy();
        expect(mionHooks.mionStringifyJsonResponseBodyHook).toBeTruthy();
    });
});
