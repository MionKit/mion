/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {routerHooks} from './hooks';

describe('hooks should', () => {
    // these hooks are indirectly tested by the router tests so we only need to test the proper configurations

    it('correctly configured to run even if there was an error in the execution paths', async () => {
        expect(routerHooks.parseRequestBody.isInternal).toBe(true);
        expect(routerHooks.stringifyResponseBody.isInternal).toBe(true);
    });
});
