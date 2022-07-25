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
    const options: ApiRouterOptions = {
        srcDir: path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast')),
        outDir: '',
    };
    let routesMetadata: ExportedMetadata, compileError;
    try {
        routesMetadata = getRouteMetadata(tsConfigfile, apiRoutesFile, options);
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
        const routeMeta = routesMetadata['api-routes.ts/functionWithNoTypes'];
        const snapshotRoute = metadataSnapshot['api-routes.ts/functionWithNoTypes'];
        compareRouteWithExpectedSnapshot(routeMeta, snapshotRoute);
    });

    // it('should extrac metadata when exported item is a functionWithNoReturType', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });

    // it('should extrac metadata when exported item is a functionWithNoReturType', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });

    // it('should extrac metadata when exported item is a functionWithNoTypes', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });

    // it('should extrac metadata when exported item is a functionWithNoTypes', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });

    // it('should extrac metadata when exported item is a functionWithNoTypes', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });

    // it('should extrac metadata when exported item is a functionWithNoTypes', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });

    // it('should extrac metadata when exported item is a functionWithNoTypes', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });

    // it('should extrac metadata when exported item is a functionWithNoTypes', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });

    // it('should extrac metadata when exported item is a functionWithNoTypes', () => {
    //     expect(routesMetadata['api-routes.ts/functionWithNoTypes']).toBeTruthy();
    // });
});
