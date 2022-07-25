/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as path from 'path';
import {ExportedMetadata, getRouteMetadata, RouteMetadata} from './router-type-checker';
import {ApiRouterOptions} from './types';
import {metadataSnapshot} from '../test-artifacts/typescript-ast/router-type-checker-spec-metadata-snapshot';
import * as appRoot from 'app-root-path';

describe('router-type-checker', () => {
    // parse main routes api test file to reuse in every tet
    const apiRoutesFile = path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast/api-routes.ts'));
    const tsConfigfile = path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast/tsconfig.json'));
    const routesDir = path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast'));
    const options = {
        routesDir,
        appRootDir: appRoot.path,
        outDir: '',
    } as ApiRouterOptions;
    let routesMetadata: ExportedMetadata;
    let compileError;
    try {
        routesMetadata = getRouteMetadata(tsConfigfile, apiRoutesFile, options);
        // ####### LOG METADATA ##########
        // console.dir(routesMetadata, {depth: 5});
        // console.log(JSON.stringify(routesMetadata)); // to update snapshot file
    } catch (e) {
        compileError = e;
    }

    function compareRouteWithExpectedSnapshot(routeMeta: RouteMetadata, snapshotRouteMeta: RouteMetadata) {
        expect(routeMeta.exportedName).toEqual(snapshotRouteMeta.exportedName);
        expect(routeMeta.metadata.parameters).toEqual(snapshotRouteMeta.metadata.parameters);
        expect(routeMeta.metadata.returnType).toEqual(snapshotRouteMeta.metadata.returnType);
    }

    it('should compile valid api routes file', () => {
        if (compileError) throw compileError;
        expect(routesMetadata).toBeTruthy();
    });

    it('should get the route name relative to srcDir', () => {
        expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
        expect(routesMetadata['api-routes.ts/functionWithNoReturType']).toBeTruthy();
        // ... we could continue with all routes, but is not required all of them gonna be relative
    });

    it('should extrac metadata when exported item is a functionWithNoTypes', () => {
        const expectedRouteName = 'api-routes.ts/functionWithNoTypes';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    it('should extrac metadata when exported item is a functionWithNoReturType', () => {
        const expectedRouteName = 'api-routes.ts/functionWithNoReturType';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    it('should extrac metadata when exported item is a functionWithTypes', () => {
        const expectedRouteName = 'api-routes.ts/functionWithTypes';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    it('should extrac metadata when exported item is a arrowFunction', () => {
        const expectedRouteName = 'api-routes.ts/arrowFunction';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    it('should extrac metadata when exported item is a functionWithNoReturType', () => {
        const expectedRouteName = 'api-routes.ts/multipleExport1ArrowFunction';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    it('should extrac metadata when exported item is a functionWithTypes', () => {
        const expectedRouteName = 'api-routes.ts/anonimousFunction';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    it('should extrac metadata when exported item is a arrowFunction', () => {
        const expectedRouteName = 'api-routes.ts/namedFunction';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    it('should extrac metadata when exported item is a functionWithTypes', () => {
        const expectedRouteName = 'api-routes.ts/arrowFunctionWithCasting';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
        // ensure correct property types
        expect(routeMeta.metadata.parameters.body.escapedName).toEqual('User');
        expect(routeMeta.metadata.parameters.api.escapedName).toEqual('ApiDS');
        expect(routeMeta.metadata.parameters.req.escapedName).toEqual('FastifyRequest');
        expect(routeMeta.metadata.parameters.reply.escapedName).toEqual('FastifyReply');
    });

    it('should extrac metadata when exported item is a arrowFunction', () => {
        const expectedRouteName = 'api-routes.ts/anonimousFunctionWithCasting';
        const routeMeta = routesMetadata[expectedRouteName];
        const snapshotRoute = metadataSnapshot[expectedRouteName];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    // TODO sanitize metadata so no absulute paths are in the data
    it('should replace the absolute paths in metadata by {{PROJECT_ROOT}} string', () => {
        const expectedRouteName = 'api-routes.ts/functionWithTypes';
        const routeMeta = routesMetadata[expectedRouteName] as RouteMetadata;
        const snapshotRoute = metadataSnapshot[expectedRouteName] as RouteMetadata;
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    /**
     * TODO IMPORTANT accept exports from return values at runtime
     * ie a general wrapper to a route that adds extra functionality:
     * export const insertUser =  baseModelInsertRoute((body, api, req, reply) => {...}): ApiRoute<Req, Reply>;
     * in this example as long as the type of insertUser matches ApiRoute<Req, Reply> should be ok;
     *  */

    it('should extrac metadata when exported item is returned at runtime but the return type matches ApiRoute', () => {});

    it('should extrac metadata when exported item is returned at runtime but the return type matches ApiRouteOptions', () => {});

    // TODO ApiRouteOptions Objects

    // TODO WHEN COMPILE SHOULD FAIL
});
