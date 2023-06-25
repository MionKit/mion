/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getFunctionParamsDeserializer} from './functionDeSerialization';
import {DEFAULT_REFLECTION_OPTIONS} from './constants';

describe('Deepkit reflection should', () => {
    const skip = 2; // skipping app and ctx
    type User = {
        id: number;
        name: string;
        surname: string;
        counter: number;
        lastUpdate: Date;
    };
    type DatePoint = {
        date: Date;
    };

    const addDate = (app, ctx, data: DatePoint): DatePoint => {
        return data;
    };

    const updateUser = (app, ctx, user: User, counterStart?: number): User => {
        const updated = {
            ...user,
            lastUpdate: new Date(),
            counter: counterStart ? counterStart + 1 : user.counter + 1,
        };
        return updated;
    };

    it('should deserialize data', () => {
        const dataPoint: DatePoint = {date: new Date('2020-12-19T00:24:00.000')};
        const deSerializers = getFunctionParamsDeserializer(addDate, DEFAULT_REFLECTION_OPTIONS, skip);
        const input = JSON.parse(JSON.stringify(dataPoint)); // this would be same as json.parse(body)

        const deserialized = deSerializers[0](input);

        expect(deserialized).toEqual(dataPoint);
        expect(typeof deserialized.date).toEqual('object');
    });

    it('should not do soft deserialization with router default options', () => {
        const deSerializers = getFunctionParamsDeserializer(updateUser, DEFAULT_REFLECTION_OPTIONS, skip);
        const date = new Date();
        const user1 = {
            id: 1,
            name: false,
            surname: false,
            counter: false,
            lastUpdate: date,
        };
        const parsed1 = JSON.parse(JSON.stringify(user1));

        const deserialized1 = deSerializers[0](parsed1);
        expect(deserialized1).toEqual(user1);
    });
});
