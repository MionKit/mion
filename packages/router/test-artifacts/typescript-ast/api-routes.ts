/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ####### All difrent ways to export an api route #######
// AST VIEWER USED FOR DEVELOPING https://ts-ast-viewer.com/
import {ApiRoute, ApiRouteOptions, ApiDS} from '@apids/router/src/types';
import {FastifyReply, FastifyRequest} from 'fastify';

interface Message {
    sentence: string;
}

interface Entity {
    id: number;
}

interface User extends Entity {
    username: string;
}

// function with no types should fail
export function functionWithNoTypes(body, data, req, reply) {
    return {sentence: `hello to ${body.username}`};
}

// parameter types, no return type
export function functionWithNoReturType(body: User, api: ApiDS, req: FastifyRequest, reply: FastifyReply) {
    return {sentence: `hello to ${body.username}`};
}

// parameter types, return type
export function functionWithTypes(body: User, api: ApiDS, req: FastifyRequest, reply: FastifyReply): Message {
    return {sentence: `hello to ${body.username}`};
}

// constant with type + arrow function
export const arrowFunction: ApiRoute<User, Message> = (body, api, req, reply) => ({
    sentence: `hello to ${body.username}`,
});

// multiple exported constants
export const multipleExport1ArrowFunction: ApiRoute<User, Message> = (body, api, req, reply) => ({
        sentence: `hello to ${body.username}`,
    }),
    multipleExport2ArrowFunction: ApiRoute<User, Message> = (body) => ({sentence: `hello to ${body.username}`});

// constant with type + anonimous function
export const anonimousFunction: ApiRoute<User, Message> = function (body, api, req, reply) {
    return {sentence: `hello to ${body.username}`};
};

// constant with type + named function
export const namedFunction: ApiRoute<User, Message> = function abc(body, api, req, reply) {
    return {sentence: `hello to ${body.username}`};
};

// constant + arrow function enclosing in parenthesis and declaring type using as (casting)
export const arrowFunctionWithCasting = ((body, api, req, reply) => ({
    sentence: `hello to ${body.username}`,
})) as ApiRoute<User, Message>;

// constant + anonimous function and declaring type using as (casting)
export const anonimousFunctionWithCasting = function (body, api, req, reply) {
    return {sentence: `hello to ${body.username}`};
} as ApiRoute<User, Message>;

// route options
export const optionsObjectWithTypes: ApiRouteOptions<User, Message> = {
    handler: (body) => ({sentence: `hello to ${body.username}`}),
    version: '1.0.0',
    logLevel: 'debug',
};

// route options using as (casting)
export const optionsObjectWithCasting = {
    handler: (body) => ({sentence: `hello to ${body.username}`}),
    version: '1.0.0',
    logLevel: 'debug',
} as ApiRouteOptions<User, Message>;

// route options constructed
const handler1 = (body) => ({sentence: `hello to ${body.username}`});
const version1 = '1.0.0';
export const optionsObjecWithReferences: ApiRouteOptions<User, Message> = {
    handler: handler1,
    version: version1,
    logLevel: 'debug',
};

// async
export const asyncAnonimousFunction: ApiRoute<User, Message> = async function (body, api, req, reply) {
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
} as ApiRouteOptions<User, Message>;

// exporting after
const exportedAfterDeclaration: ApiRoute<User, Message> = (body, api, req, reply) => ({
    sentence: `hello to ${body.username}`,
});
export {exportedAfterDeclaration};

// exporting after + renaming
const someRoute: ApiRoute<User, Message> = (body, api, req, reply) => ({
    sentence: `hello to ${body.username}`,
});
export {someRoute as exportedAndRenameAfterDeclaration};

// reexporting something already exported
export const someRoute2: ApiRoute<User, Message> = (body, api, req, reply) => ({
    sentence: `hello to ${body.username}`,
});
export {someRoute2 as reExportedRoute2};
