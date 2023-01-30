/* ########
 * 2023 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {getExportedRoutesVarNames} from './tsApi';
import {CodegenOptions} from './types';

describe('tsApi should', () => {
    const defaultOptions: CodegenOptions = {
        outputFileName: join(__dirname, 'test/.spec/tsApi.spec.ts'),
        entryFileName: join(__dirname, 'test/myApi.routes.ts'),
        tsConfigFilePath: join(__dirname, '../tsconfig.json'),
        importAsPackage: false,
    };

    it('get exported declarations', () => {
        const exportedNames = getExportedRoutesVarNames(defaultOptions);
        expect(exportedNames).toEqual(['routes']);
    });

    it('throw an error when tsConfig file is not found', () => {
        const noTsConfig = {
            ...defaultOptions,
            tsConfigFilePath: undefined,
        };
        const wrongTsconfig = {
            ...defaultOptions,
            tsConfigFilePath: 'abc',
        };
        expect(() => getExportedRoutesVarNames(noTsConfig)).not.toThrow(`Ts config file 'abc' not found!`);
        expect(() => getExportedRoutesVarNames(wrongTsconfig)).toThrow(`Ts config file 'abc' not found!`);
    });

    it('throw an error when entryFileName file is not found', () => {
        const wrongEntryName = {
            ...defaultOptions,
            entryFileName: 'abc',
        };
        expect(() => getExportedRoutesVarNames(wrongEntryName)).toThrow(`Entry typescript file 'abc' not found!`);
    });

    it('throw an error when there are no public routes exported in the entry file', () => {
        const noRoutes = {
            ...defaultOptions,
            entryFileName: join(__dirname, 'test/myApi.types.ts'),
        };
        expect(() => getExportedRoutesVarNames(noRoutes)).toThrow(
            `No exported Public Routes found in entry file '${noRoutes.entryFileName}'.` +
                `\nPlease check you exporting a variable when calling @mikrokit/router.registerRoutes!`
        );
    });
});
