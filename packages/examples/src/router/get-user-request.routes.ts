import {Routes, initMionRouter, route} from '@mionjs/router';
import {userRepository} from './myModels.ts';
import type {User} from './myModels.ts';

const getUser = route(async (ctx, entity: {id: number}): Promise<User> => {
    const user = await userRepository.getUserById(entity.id);
    return user;
});

const routes = {
    users: {
        getUser, // api/users/getUser
    },
} satisfies Routes;

export const apiSpec = await initMionRouter(routes);
