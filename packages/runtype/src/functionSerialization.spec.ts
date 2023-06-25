/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getFunctionReturnSerializer} from './functionSerialization';
import {DEFAULT_REFLECTION_OPTIONS} from './constants';

describe('Deepkit reflection should', () => {
    type DatePoint = {
        date: Date;
    };

    const addDate = (app, ctx, data: DatePoint): DatePoint => {
        return data;
    };

    it('should serialize data', () => {
        const dataPoint: DatePoint = {date: new Date('2020-12-19T00:24:00.000')};
        const serializedDataPoint = {date: '2020-12-19T00:24:00.000Z'};
        const outputSerializer = getFunctionReturnSerializer(addDate, DEFAULT_REFLECTION_OPTIONS);

        const output = addDate({}, {}, dataPoint);
        const serialized = outputSerializer(output); //safe fo Json to parse

        expect(serialized).toEqual(serializedDataPoint);
    });
});
