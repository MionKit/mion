/* ########
 * 2021 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as path from 'path';
import {getDirectoryTree, getNonApiRouteItems, isApiRoute, isApiRouteOptions, isApiRoutes} from './utils';

describe.skip('generate types', () => {
    it('isApiRoute should return true when passed value is isApiRoute', async () => {
        const helloOK = () => {};
        const helloOK1 = (a, b, c, d) => {};
        const helloOK2 = function () {};
        const helloOK3 = function somefunc(a, b, c, d) {};
        const helloFailMax4Params = (a, b, c, d, e) => {};
        const helloFailApiRouteOptions = {handler: () => {}};

        // Fail
        expect(isApiRoute(5)).toBeFalsy();
        expect(isApiRoute({})).toBeFalsy();
        expect(isApiRoute(null)).toBeFalsy();
        expect(isApiRoute(undefined)).toBeFalsy();
        expect(isApiRoute(helloFailMax4Params)).toBeFalsy();
        expect(isApiRoute(helloFailApiRouteOptions)).toBeFalsy();

        // OK
        expect(isApiRoute(helloOK)).toBeTruthy();
        expect(isApiRoute(helloOK1)).toBeTruthy();
        expect(isApiRoute(helloOK2)).toBeTruthy();
        expect(isApiRoute(helloOK3)).toBeTruthy();
    });

    it('isApiRouteOptions should return true when passed value is ApiRouteOptions', async () => {
        const helloOK = {handler: () => {}};
        const helloOK1 = {handler: (a, b, c, d) => {}};
        const helloOK2 = {handler: function () {}};
        const helloOK3 = {handler: function somefunc(a, b, c, d) {}};
        const helloFailMax4Params = {handler: (a, b, c, d, e) => {}};
        const helloFailisApiRoute = () => {};

        // Fail
        expect(isApiRouteOptions(5)).toBeFalsy();
        expect(isApiRouteOptions({})).toBeFalsy();
        expect(isApiRouteOptions(null)).toBeFalsy();
        expect(isApiRouteOptions(undefined)).toBeFalsy();
        expect(isApiRouteOptions(helloFailMax4Params)).toBeFalsy();
        expect(isApiRouteOptions(helloFailisApiRoute)).toBeFalsy();

        // OK
        expect(isApiRouteOptions(helloOK)).toBeTruthy();
        expect(isApiRouteOptions(helloOK1)).toBeTruthy();
        expect(isApiRouteOptions(helloOK2)).toBeTruthy();
        expect(isApiRouteOptions(helloOK3)).toBeTruthy();
    });

    it('getNonApiRouteItems should return true when passed object contains items that are not ApiRouteOptions or isApiRoute', async () => {
        const routesOK = {hello1: () => {}}; // ApiRoute
        const routesOK1 = {hello2: {handler: () => {}}}; // ApiRouteOptions
        const routesOK2 = {hello1: () => {}, hello2: {handler: () => {}}}; // both
        const routesFail = {hello1: () => {}, hello2: 'fail_string'};
        const routesFailMax4Params = {hello1: (a, b, c, d, e) => {}};

        // Fail
        expect(getNonApiRouteItems(routesFail as any)).toMatchObject({hello2: 'fail_string'});
        expect(getNonApiRouteItems(routesFailMax4Params as any)).toMatchObject({hello1: expect.any(Function)});

        // OK
        expect(getNonApiRouteItems(routesOK)).toEqual({});
        expect(getNonApiRouteItems(routesOK1)).toEqual({});
        expect(getNonApiRouteItems(routesOK2)).toEqual({});
    });

    it('isApiRoutes should return true when passed value is ApiRoutes', async () => {
        const routesOK = {hello1: () => {}}; // ApiRoute
        const routesOK1 = {hello2: {handler: () => {}}}; // ApiRouteOptions
        const routesOK2 = {hello1: () => {}, hello2: {handler: () => {}}}; // both
        const routesFail = {hello1: () => {}, hello2: 'fail_string'};
        const routesFailMax4Params = {hello1: (a, b, c, d, e) => {}};

        // Fail
        expect(isApiRoutes(5)).toBeFalsy();
        expect(isApiRoutes(null)).toBeFalsy();
        expect(isApiRoutes(undefined)).toBeFalsy();

        // OK
        expect(isApiRoutes({})).toBeTruthy(); // Define if we allow empty routers
        expect(isApiRoutes(routesOK)).toBeTruthy();
        expect(isApiRoutes(routesOK1)).toBeTruthy();
        expect(isApiRoutes(routesOK2)).toBeTruthy();
        expect(isApiRoutes(routesFail)).toBeFalsy();
        expect(isApiRoutes(routesFailMax4Params)).toBeFalsy();
    });

    it('getDirectoryTree should return a DirectoryTree data structure from a directory', async () => {
        const rootDir = path.join(__dirname, '../test-artifacts/directory-tree');
        const tree = getDirectoryTree(rootDir);
        const result = {
            '.dir0': {'file0.txt': '.dir0/file0.txt'},
            dir1: {'file1.txt': 'dir1/file1.txt', 'file11.txt': 'dir1/file11.txt'},
            dir2: {'file2.txt': 'dir2/file2.txt'},
            'file.txt': 'file.txt',
        };
        expect(tree).toEqual(result);
    });
});
