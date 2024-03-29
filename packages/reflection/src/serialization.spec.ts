/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    deserializeFunctionParams,
    getFunctionParamsDeserializer,
    getFunctionParamsSerializer,
    getFunctionReturnDeserializer,
    getFunctionReturnSerializer,
    serializeFunctionParams,
} from './serialization';
import {DEFAULT_REFLECTION_OPTIONS} from './constants';
import {getHandlerType} from './types';

describe('Deepkit serialization should', () => {
    const skip = 1; // skipping ctx
    type User = {
        id: number;
        name: string;
        surname: string;
        lastUpdate: Date;
    };
    type DatePoint = {
        date: Date;
    };

    const date1 = new Date('2021-12-19T00:24:00.000');
    const date1Serialized = '2021-12-19T00:24:00.000Z';

    const addDate = (ctx, data: DatePoint): DatePoint => {
        return data;
    };

    const updateUser = (ctx, user: User): User => {
        const updated = {
            ...user,
            lastUpdate: new Date('2023-12-19T00:24:00.000'),
        };
        return updated;
    };

    const updateUserType = getHandlerType(updateUser);
    const addDateType = getHandlerType(addDate);

    it('serialize/deserialize params', () => {
        const dataPoint: DatePoint = {date: date1};
        const serializedDataPoint = {date: date1Serialized};
        const serializers = getFunctionParamsSerializer(addDateType, DEFAULT_REFLECTION_OPTIONS, skip);
        const deSerializers = getFunctionParamsDeserializer(addDateType, DEFAULT_REFLECTION_OPTIONS, skip);
        const serializedParams = serializeFunctionParams(serializers, [dataPoint]);
        const deserializedParams = deserializeFunctionParams(deSerializers, serializedParams);

        expect(serializedParams).toEqual([serializedDataPoint]);
        expect(deserializedParams).toEqual([dataPoint]);
    });

    it('serialize/deserialize function return type', () => {
        const user: User = {
            id: 1,
            name: 'john',
            surname: 'smith',
            lastUpdate: date1,
        };
        const serializedUser = {
            id: 1,
            name: 'john',
            surname: 'smith',
            lastUpdate: date1Serialized,
        };
        const serializer = getFunctionReturnSerializer(updateUserType, DEFAULT_REFLECTION_OPTIONS);
        const deSerializer = getFunctionReturnDeserializer(updateUserType, DEFAULT_REFLECTION_OPTIONS);

        const serializedReturn = serializer(user);
        const deserializedReturn = deSerializer(serializedUser);

        expect(serializedReturn).toEqual(serializedUser);
        expect(deserializedReturn).toEqual(user);
    });
});
