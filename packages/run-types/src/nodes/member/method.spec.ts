/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../createRunType';

it('should generate different type ids for optional methods', () => {
    type TestType = {value: number; a?: () => void; getValue(): number};
    type TestType2 = {value: number; a: () => void; getValue(): number};

    const rt = runType<TestType>();
    const rt2 = runType<TestType2>();
    expect(rt.getTypeID('ANY')).not.toEqual(rt2.getTypeID('ANY'));
});
