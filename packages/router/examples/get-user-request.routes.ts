import {Route, Routes, Router} from '@mikrokit/router';

const getUser: Route = async (context: any, entity: {id: number}): Promise<User> => {
    const user = await context.db.getUserById(entity.id);
    return user;
};

const routes: Routes = {
    users: {
        getUser, // api/users/getUser
    },
};

Router.addRoutes(routes);
