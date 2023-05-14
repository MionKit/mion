/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerCLientRoutes} from './clienttest';
import type {MyApiRoutes} from './test/myApi.routes';

const printS = {showHidden: true, depth: 8, colors: true};

// bellow tests doesn't need to be run every time is just investigation work
// eslint-disable-next-line jest/no-disabled-tests
describe('Client test with receive type', () => {
    it('get info from type', () => {
        registerCLientRoutes<MyApiRoutes>();

        expect(true).toEqual(true);
    });
});
