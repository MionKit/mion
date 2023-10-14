import {startNodeServer} from '@mionkit/http';
import {Routes, initRouter, registerRoutes} from '@mionkit/router';
import {authHook, authDataFactory} from './auth.routes.ts';
import {logHook} from './log.routes.ts';
import {userRoutes} from './user.routes.ts';

// initialize routes
const routes = {
    authHook,
    userRoutes,
    logHook,
} satisfies Routes;

// shared data factory
const sharedDataFactory = () => ({
    ...authDataFactory(),
});

// #### Init Node Http Server ####
const routerOptions = {sharedDataFactory, prefix: 'api/'};
const httpOptions = {...routerOptions, port: 8080};
initRouter(httpOptions);
registerRoutes(routes);
startNodeServer();
