/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as path from 'path';
import {ExportedMetadata, getRouteMetadata, RouteMetadata} from './router-type-checker';
import {ApiRouterOptions} from './types';
import {metadataSnapshot} from './router-type-cheker-spec-metadata-snapshot';

describe('router-type-checker', () => {
    const apiRoutesFile = path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast/api-routes.ts'));
    const tsConfigfile = path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast/tsconfig.json'));
    const packageRoot = path.resolve(path.join(__dirname, '../'));
    const packageRootSnapshot = '/PACKAGE_ROOT';
    const options: ApiRouterOptions = {
        srcDir: path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast')),
        outDir: '',
    };
    let routesMetadata: ExportedMetadata, compileError;
    try {
        const meta = getRouteMetadata(tsConfigfile, apiRoutesFile, options);
        const metaString = JSON.stringify(meta);
        const metaFixPackageRoot = (metaString as any).replaceAll(packageRoot, packageRootSnapshot);
        routesMetadata = JSON.parse(metaFixPackageRoot);
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

    // TODO ApiRouteOptions Objects

    // TODO WHEN COMPILE SHOULD FAIL
});
