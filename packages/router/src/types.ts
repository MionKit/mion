/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
/* eslint-disable @typescript-eslint/ban-types */
import {FastifyReply, FastifyRequest, RouteShorthandOptions} from 'fastify';

export interface ApiDS {
    [key: string]: any;
} // todo: import ApiDS from ORM

/**
 * Fastify like route handler.
 */
export type ApiRoute<RequestBody, ReplyBody> = (
    /**
     * Any Type representing http request body
     */
    body: RequestBody,

    /**
     * ApiDS application
     */
    db: ApiDS,

    request: FastifyRequest,
    reply: FastifyReply,
) => ReplyBody | Promise<ReplyBody>;

/**
 * Fastify like Route Options object, a route handler is the only required field
 */
export interface ApiRouteOptions<RequestBody, ReplyBody> extends RouteShorthandOptions {
    /**
     * Fastify like route handler.
     */
    handler: ApiRoute<RequestBody, ReplyBody>;

    /**
     * Same as FastifySchema but only body and response allowed
     * @see https://www.fastify.io/docs/latest/Routes/#routes-options
     * @see https://www.fastify.io/docs/latest/Validation-and-Serialization/
     */
    schema?: {
        body?: unknown;
        response?: unknown;
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
export interface ApiRouterOptions {
    /**
     * Root directory for the Api rooute files.
     */
    srcDir: string;

    /**
     * Glob patter to include route files, relative to @var srcDir
     * @example './src/routes/**'
     * @see https://github.com/micromatch/picomatch
     */
    // TODO
    srcInclude?: string | string[];

    /**
     * Glob patter to ignore file within the src directory, relative to @var srcDir
     * @see https://github.com/micromatch/picomatch
     */
    // TODO
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
    // TODO
    // schemasInclude?: string | string[];

    /**
     * Glob patter to ignore files within the schemas directory, relative to @var schemasDir
     * @example './src/routes/package.json'
     */
    // schemasIgone?: string | string[];

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
