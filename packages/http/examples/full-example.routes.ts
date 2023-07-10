import {initHttpRouter, startHttpServer} from '@mionkit/http';
import {registerRoutes} from '@mionkit/router';

// #### App ####

type SimpleUser = {name: string; surname: string};
type DataPoint = {date: Date};
type SharedData = {auth: {me: any}};

const dbChangeUserName = (user: SimpleUser): SimpleUser => ({name: 'NewName', surname: user.surname});
const app = {db: {changeUserName: dbChangeUserName}};
const sharedDataFactory = (): SharedData => ({auth: {me: null}});

// #### Routes ####

const changeUserName = (app, ctx, user: SimpleUser): SimpleUser => {
    return ctx.app.db.changeUserName(user);
};

const getDate = (app, ctx, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('December 17, 2020 03:24:00')};
};

// #### Init server ####

const routerOpts = {prefix: 'api/'};
const routes = {changeUserName, getDate};
initHttpRouter(app, sharedDataFactory, routerOpts);
registerRoutes(routes);
startHttpServer({port: 8080});
