/* ######## 2021 ApiDS - MIT LICENSE ######## */
/* eslint-disable @typescript-eslint/ban-types */
import {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
    RouteShorthandOptions,
} from 'fastify';

export type ApiDS = any; // todo: import ApiDS from ORM

export type ApiRoute<RequestSchema, ReplySchema> = (
    body: RequestSchema,
    db: ApiDS,
    request: FastifyRequest,
    reply: FastifyReply,
) => ReplySchema | Promise<ReplySchema>;

export interface ApiRouteOptions<RequestSchema, ReplySchema>
    extends RouteShorthandOptions {
    handler: ApiRoute<RequestSchema, ReplySchema>;
}

export interface ApiRoutes {
    [keys: string]: ApiRoute<Object, Object> | ApiRouteOptions<Object, Object>;
}
