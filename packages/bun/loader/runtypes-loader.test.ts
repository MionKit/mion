/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {expect, test} from 'bun:test';
import {validate, reflect, serialize, deserialize, ReflectionKind, TypeFunction} from '@deepkit/type';

interface User {
    id: number;
    username: string;
    createdAt?: Date;
}

const routes = {
    sum: (a: number, b: number): number => a + b,
    changeName: (user: User): User => ({...user, username: 'changed'}),
};

test('test reflect function works', async () => {
    const sumType = reflect(routes.sum) as TypeFunction;
    expect(sumType.kind).toEqual(ReflectionKind.function);
    expect(sumType.return.kind).toEqual(ReflectionKind.number);
    expect(sumType.parameters.length).toEqual(2);
});

test('test validate works', async () => {
    const user: User = {id: 1, username: 'shimu'};
    const validationResult = validate<User>(user);
    expect(validationResult).toEqual([]);
});

test('test serialize works', async () => {
    const user: User = {id: 1, username: 'shimu', createdAt: new Date('2023-04-10T02:13:00.000Z')};
    const serializedUser = serialize<User>(user);
    const deserializedUser = deserialize<User>(serializedUser);
    expect(deserializedUser).toEqual(user);
});
