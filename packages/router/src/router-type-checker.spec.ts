/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as path from 'path';
import * as routes from '../test-artifacts/typescript-ast/api-routes';
import {getRoutesTypes} from './router-type-checker';

describe('router-type-checker', () => {
    it('should extrac the type when exported item is a function', async () => {
        const file = path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast/api-routes.ts'));
        const tsConfigfile = path.resolve(path.join(__dirname, '../test-artifacts/typescript-ast/tsconfig.json'));
        getRoutesTypes(tsConfigfile, file);
        expect(routes.someRoute2 === routes.reExportedRoute2).toBeTruthy();
    });
});
