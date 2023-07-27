/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
process.env.GENERATE_ROUTER_SPEC = 'true'; // required to generate Public Methods object

import {join} from 'path';
import {formatCode, getRelativeImport, getSpecFile} from './specCodegen';
import {myApi, authApi} from './test/myApi.routes';
import {CodegenOptions} from './types';
import {Project} from 'ts-morph';
import {importFromStringSync} from 'module-from-string';
import {PUBLIC_METHODS, ROUTES} from './test/expected.specapi';
import {writeFileSync} from 'fs';

describe('generate api spec should', () => {
    const generateOptions: CodegenOptions = {
        outputFileName: join(__dirname, './test/.spec/GENERATED.specapi.ts'),
        entryFileName: join(__dirname, './test/myApi.routes.ts'),
        tsConfigFilePath: join(__dirname, '../tsconfig.json'),
    };

    // this is almost an E2E test, generates spec files, compiles to js and dynamically evaluates to test generated data.
    // this test might take few more seconds than normal
    it('generate ts spec file and file must compile correctly to js', () => {
        // generates and format ts spec file
        const tsSpec = getSpecFile(generateOptions, {myApi, authApi});
        const formatedTsSpec = formatCode(tsSpec);
        writeFileSync(generateOptions.outputFileName, formatedTsSpec);

        // compiles to js
        const project = new Project({
            tsConfigFilePath: generateOptions.tsConfigFilePath,
            skipAddingFilesFromTsConfig: true,
        });
        const resultFileName = `${generateOptions.entryFileName}.specapi.ts`;
        project.createSourceFile(resultFileName, formatedTsSpec);
        const tsSpecFile = project.getSourceFile(resultFileName);
        if (!tsSpecFile) throw new Error('Typescript Spec file could not be generated');
        const outFiles = tsSpecFile.getEmitOutput();
        const compiledSpec = outFiles
            .getOutputFiles()
            .find((file) => file.getFilePath().endsWith('.js') || file.getFilePath().endsWith('.mjs'));
        if (!compiledSpec) throw new Error('There was a problem compiling typescript Spec file to JS.');

        // creates a module from generated js src code
        const result = importFromStringSync(compiledSpec.getText());

        //tests results
        // console.log(result?.PUBLIC_METHODS);
        expect(result?.PUBLIC_METHODS).toEqual(PUBLIC_METHODS);
        expect(result?.ROUTES).toEqual(ROUTES);
    });

    it('resolve relative import name', () => {
        const entry = join(__dirname, './test/routes.ts');
        const outIsSameLevel = join(__dirname, './test/generated.specapi.ts');
        const outIsLevelDown = join(__dirname, './test/down/generated.specapi.ts');
        const outIsLevelUp = join(__dirname, './generated.specapi.ts');

        const importSameLevel = getRelativeImport(entry, outIsSameLevel);
        const importIsUp = getRelativeImport(entry, outIsLevelDown);
        const importIsDown = getRelativeImport(entry, outIsLevelUp);

        expect(importSameLevel).toEqual('./routes');
        expect(importIsUp).toEqual('./../routes');
        expect(importIsDown).toEqual('./test/routes');
    });
});
