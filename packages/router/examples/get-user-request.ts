import {Route, Routes, MkkRouter} from '@mikrokit/router';

interface Entity {
    id: number;
}

const getUser: Route = async (context, entity: Entity) => {
    const user = await context.db.getUserById(entity.id);
    return user;
};

const routes: Routes = {
    users: {
        getUser, // api/users/getUser
    },
};

MkkRouter.addRoutes(routes);
