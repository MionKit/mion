import {FormatString, FormatEmail, FormatStringDateTime} from '@mionjs/type-formats/StringFormats';
import {FormatNumber} from '@mionjs/type-formats/NumberFormats';
import {FormatBigInt} from '@mionjs/type-formats/BigintFormats';
import {initMionRouter, route} from '@mionjs/router';
import {RpcError} from '@mionjs/core';

type UserWithFormats = {
    name: FormatString<{maxLength: 100; minLength: 2}>;
    age: FormatNumber<{min: 0; max: 150}>;
    balance: FormatBigInt<{min: 0n}>;
    isActive: boolean;
    tags: string[];
    createdAt: FormatStringDateTime;
    nested: {
        email: FormatEmail;
        score: FormatNumber<{min: 0}>;
    };
};

export const myApi = await initMionRouter({
    setUser: route((_ctx, user: UserWithFormats): UserWithFormats | RpcError<'user-exists'> => {
        return user;
    }),
});
export type MyApi = typeof myApi;
