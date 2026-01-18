import {Routes, initMionRouter, route} from '@mionkit/router';
import {userRepository} from 'MyModels';
import type {User} from 'MyModels';

const getUser = route(async (ctx, entity: {id: number}): Promise<User> => {
    const user = await userRepository.getUserById(entity.id);
    return user;
});

const routes = {
    users: {
        getUser, // api/users/getUser
    },
} satisfies Routes;

export const apiSpec = initMionRouter(routes);
