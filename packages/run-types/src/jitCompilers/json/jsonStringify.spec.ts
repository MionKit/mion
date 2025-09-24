/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';
import {mockRegExpsList} from '../../mocking/constants.mock';

describe('jsonStringify compilation tests', () => {
    // Tests moved from various spec files under packages/run-types/src/runType/

    // Moved from packages/run-types/src/runType/atomic/string.spec.ts:34-40
    {
        const rt = runType<string>();

        it('json stringify', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            const typeValue = 'hello';
            const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
            expect(roundTrip).toEqual(typeValue);
        });
    }

    // Moved from packages/run-types/src/runType/atomic/regexp.spec.ts:38-46
    {
        const rt = runType<RegExp>();

        it('json stringify regexp', () => {
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
            const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
            mockRegExpsList.forEach((regexp) => {
                const typeValue = regexp;
                const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
                expect(roundTrip).toEqual(typeValue);
            });
        });
    }
});
