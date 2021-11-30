/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
/* eslint-disable @typescript-eslint/ban-types */
import {FastifyInstance, FastifyReply, FastifyRequest, FastifySchema, RouteShorthandOptions} from 'fastify';

export interface ApiDS extends FastifyInstance {} // todo: import ApiDS from ORM

/**
 * Fastify like route handler.
 */
export type ApiRoute<RequestSchema, ReplySchema> = (
    /**
     * Any Type representing http request body
     */
    body?: RequestSchema,

    /**
     * ApiDS application
     */
    db?: ApiDS,

    request?: FastifyRequest,
    reply?: FastifyReply,
) => ReplySchema | Promise<ReplySchema>;

/**
 * Fastify like Route Options object, a route handler is the only required field
 */
export interface ApiRouteOptions<RequestSchema, ReplySchema> extends RouteShorthandOptions {
    /**
     * Fastify like route handler.
     */
    handler: ApiRoute<RequestSchema, ReplySchema>;

    /**
     * Same as FastifySchema but only body and response allowed
     * @see https://www.fastify.io/docs/latest/Routes/#routes-options
     * @see https://www.fastify.io/docs/latest/Validation-and-Serialization/
     */
    schema: {
        body: unknown;
        response: unknown;
    };
}

/**
 * Object containing multiple ApiRoutes or ApiRouteOptions, or a single route itself
 */
export interface ApiRoutes {
    [keys: string]: ApiRoute<any, any> | ApiRouteOptions<any, any>;
}

/**
 * A routes file, it can be multiple routes or a single route itself.
 */
export type ApiRoutesFile = ApiRoutes | ApiRoute<any, any> | ApiRouteOptions<any, any>;

/**
 * Options used to generate the Api foutes
 */
export interface ApiCompilerOptions {
    /**
     * Root directory for the Api rooute files.
     */
    srcDir: string;

    /**
     * Glob patter to include route files, relative to @var srcDir
     * @example './src/routes/**'
     * @see https://github.com/micromatch/picomatch
     */
    srcInclude?: string | string[];

    /**
     * Glob patter to ignore file within the src directory, relative to @var srcDir
     * @see https://github.com/micromatch/picomatch
     */
    srcIgnore?: string | string[];

    /**
     * The directory where json schemas are located
     * @example './scehmas'
     */
    schemasDir?: string;

    /**
     * Glob patter to include files within the schemas directory, relative to @var schemasDir
     * @example './src/routes/package.json'
     */
    schemasInclude?: string | string[];

    /**
     * Glob patter to ignore files within the schemas directory, relative to @var schemasDir
     * @example './src/routes/package.json'
     */
    schemasIgone?: string | string[];

    /**
     * Prefix for the api url
     * @example 'mypath/api/'
     * htpps://mydomain.com/mypath/api/..
     */
    apiUrlPrefix?: string;

    /**
     * Output directory for the generated Api, generated files are typescript and should be included in tsconfig.
     */
    outDir: string;
}

/**
 * Data Structure representing a directory tree
 */
export interface DirectoryTree {
    [key: string]: DirectoryTree | string;
}
