/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ####### All difrent ways to export an api route #######
import {ApiRoute, ApiRouteOptions} from '@apids/router/src/types';
import {FastifyReply, FastifyRequest} from 'fastify';
import {HostCancellationToken} from 'typescript';

type ApiDS = any;

interface Request {
    username: string;
}

interface Response {
    sentence: string;
}

interface User {
    id: number;
    name: string;
    surname: string;
}

// no types
export function functionWithNoTypes(body, data, req, reply) {
    return {sentence: `hello to ${body.username}`};
}

// parameter types, no return type
export function functionWithNoReturType(body: Request, data: ApiDS, req: FastifyRequest, reply: FastifyReply) {
    return {sentence: `hello to ${body.username}`};
}

// parameter types, return type
export function functionWithTypes(body: Request, data: ApiDS, req: FastifyRequest, reply: FastifyReply): Response {
    return {sentence: `hello to ${body.username}`};
}

// constant with type + arrow function
export const arrowFunction: ApiRoute<Request, Response> = (body, data, req, reply) => ({
    sentence: `hello to ${body.username}`,
});

// multiple exported constants
export const multipleExport1ArrowFunction: ApiRoute<Request, Response> = (body, data, req, reply) => ({
        sentence: `hello to ${body.username}`,
    }),
    multipleExport2ArrowFunction: ApiRoute<Request, Response> = (body) => ({sentence: `hello to ${body.username}`});

// constant with type + anonimous function
export const anonimousFunction: ApiRoute<Request, Response> = function (body, data, req, reply) {
    return {sentence: `hello to ${body.username}`};
};

// constant with type + named function
export const namedFunction: ApiRoute<Request, Response> = function abc(body, data, req, reply) {
    return {sentence: `hello to ${body.username}`};
};

// constant + arrow function enclosing in parenthesis and declaring type using as (casting)
export const arrowFunctionWithCasting = ((body, data, req, reply) => ({
    sentence: `hello to ${body.username}`,
})) as ApiRoute<Request, Response>;

// constant + anonimous function and declaring type using as (casting)
export const anonimousFunctionWithCasting = function (body, data, req, reply) {
    return {sentence: `hello to ${body.username}`};
} as ApiRoute<Request, Response>;

// route options no types
export const optionsObjectWithNoTypes = {
    handler: (body) => ({sentence: `hello to ${body.username}`}),
    version: '1.0.0',
    logLevel: 'debug',
};

// route options
export const optionsObjectWithTypes: ApiRouteOptions<Request, Response> = {
    handler: (body) => ({sentence: `hello to ${body.username}`}),
    version: '1.0.0',
    logLevel: 'debug',
};

// route options using as (casting)
export const optionsObjectWithCasting = {
    handler: (body) => ({sentence: `hello to ${body.username}`}),
    version: '1.0.0',
    logLevel: 'debug',
} as ApiRouteOptions<Request, Response>;

// route options constructed
const handler1 = (body) => ({sentence: `hello to ${body.username}`});
const version1 = '1.0.0';
export const optionsObjecWithReferences: ApiRouteOptions<Request, Response> = {
    handler: handler1,
    version: version1,
    logLevel: 'debug',
};

// async
export const asyncAnonimousFunction: ApiRoute<Request, Response> = async function (body, data, req, reply) {
    return {sentence: `hello to ${body.username}`};
};

// async
export const asyncArrowFunction: ApiRoute<User, User> = async (body: User, ds: ApiDS): Promise<User> => {
    const userId = body.id;
    const user = await ds.users.findById(userId);
    return user;
};

// async
export const asyncOptionsObjectWithCasting = {
    handler: async (body) => ({sentence: `hello to ${body.username}`}),
    version: '1.0.0',
    logLevel: 'debug',
} as ApiRouteOptions<Request, Response>;

// self invoked function declaring type
export const selfInvokedReturningAnonimousFunctionWithTypes: ApiRoute<Request, Response> = (() => {
    const route: ApiRoute<Request, Response> = function (body, data, req, reply) {
        return {sentence: `hello to ${body.username}`};
    };
    return route;
})();

// self invoked function with no type
export const selfInvokedReturningAnonimousFunctionWithNoTypes = (() => {
    const route = function (body, data, req, reply) {
        return {sentence: `hello to ${body.username}`};
    };
    return route;
})();

// exporting after
const exportedAfterDeclaration: ApiRoute<Request, Response> = (body, data, req, reply) => ({
    sentence: `hello to ${body.username}`,
});
export {exportedAfterDeclaration};

// exporting after + renaming
const someRoute: ApiRoute<Request, Response> = (body, data, req, reply) => ({
    sentence: `hello to ${body.username}`,
});
export {someRoute as exportedAndRenameAfterDeclaration};

// reexporting something already exported
export const someRoute2: ApiRoute<Request, Response> = (body, data, req, reply) => ({
    sentence: `hello to ${body.username}`,
});
export {someRoute2 as reExportedRoute2};
