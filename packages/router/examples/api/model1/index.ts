import {ApiRoute, ApiRouteOptions} from '@apids/router/src/types';
import {FastifyReply, FastifyRequest} from 'fastify';

export type ApiDS = any;

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

// exporting a route as a function, we can't declare the correct ApiRoute type for the function
export function sayHello(body: Request, data: ApiDS, req: FastifyRequest, reply: FastifyReply) {
    return {sentence: `hello to ${body.username}`};
}

// exporting a route function as a constant, can declare the correct ApiRoute type
export const sayHello2 = ((body, data, req, reply) => ({
    sentence: `hello to ${body.username}`,
})) as ApiRoute<Request, Response>;

// exporting a Route Options object (wrapper for Fastify Route Options)
export const sayHello3 = {
    handler: (body) => ({sentence: `hello to ${body.username}`}),
    version: '1.0.0',
    logLevel: 'debug',
} as ApiRouteOptions<Request, Response>;

export const getById: ApiRoute<User, User> = async (body: User, ds: ApiDS): Promise<User> => {
    const userId = body.id;
    const user = await ds.users.findById(userId);
    return user;
};
