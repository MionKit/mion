/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {random} from './mock';

it('random includes first and last item (inclusive)', () => {
    const result = new Set<number>();
    for (let i = 0; i < 100; i++) {
        const value = random(0, 1);
        result.add(value);
    }
    expect(result).toEqual(new Set([0, 1]));
});

// other mock tests are done in the runtype tests
