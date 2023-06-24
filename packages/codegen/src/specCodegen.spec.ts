/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
process.env.GENERATE_ROUTER_SPEC = 'true'; // required to generate Public Methods object

import {serializeType, deserializeType, reflect, Type} from '@deepkit/type';
import {DEFAULT_ROUTE_OPTIONS, getParamValidators, isFunctionType, Handler} from '@mionkit/router';
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

    // this is almost an E2E test, generates spec files, compiles to js and dinamicaly evaluates to test generated data.
    // this test might take few more seonds than normal
    it('should generate ts spec file and file must compile correctly to js', () => {
        // generates and format ts spec file
        const tsSpec = getSpecFile(generateOptions, [myApi, authApi], ['myApi', 'authApi']);
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
        expect(result?.PUBLIC_METHODS).toEqual(PUBLIC_METHODS);
        expect(result?.ROUTES).toEqual(ROUTES);
    });

    it('should resolve relative import name', () => {
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

// bellow tests doesn't need to be run every time is just investigation work
// eslint-disable-next-line jest/no-disabled-tests
describe.skip('this is just investigation about how deepkit types serialization works', () => {
    enum Country {
        spain = 'spain',
        france = 'france',
        uk = 'uk',
        usa = 'usa',
    }
    type CountryKey = keyof typeof Country;
    type SimpleUser = {name: string; surname: string};
    type DataPoint = {date: Date};
    type AndUser = SimpleUser & {address?: string};
    type OrUser = SimpleUser | {whatAmI: string};
    interface ExtendedUser extends SimpleUser {
        country: string;
    }

    const routeCountry = (app, ctx, country: CountryKey): CountryKey => country;
    const routeSimpleUser = (app, ctx, user: SimpleUser): SimpleUser => user;
    const routeDataPoint = (app, ctx, dataPoint: DataPoint): DataPoint => dataPoint;
    const routeAndUser = (app, ctx, andUser: AndUser): AndUser => andUser;
    const routeOrUser = (app, ctx, orUser: OrUser): OrUser => orUser;
    const routeExtendedUser = (app, ctx, extendedUser: ExtendedUser): ExtendedUser => extendedUser;

    type rType = Parameters<typeof routeCountry>;
    type typeP = rType[1];

    const routers = {
        routeCountry,
        routeSimpleUser,
        routeDataPoint,
        routeAndUser,
        routeOrUser,
        routeExtendedUser,
    };

    const serializeDeserializeHandlerType = (handlerType: Type) => {
        if (!isFunctionType(handlerType)) throw 'Invalid handler';
        const serializedType = serializeType(handlerType);
        const json = JSON.stringify(serializedType);
        const restoredType = JSON.parse(json);
        const desHandlerType = deserializeType(restoredType);
        if (!isFunctionType(desHandlerType)) throw 'Invalid deserialized handler';
        return desHandlerType;
    };

    const getValidators = (route: Handler) => {
        const handlerType = reflect(route);
        const restoredHandlerType = serializeDeserializeHandlerType(handlerType);
        const validators = getParamValidators(route, DEFAULT_ROUTE_OPTIONS, handlerType);
        const restoredValidators = getParamValidators(undefined as any, DEFAULT_ROUTE_OPTIONS, restoredHandlerType);

        return {validators, restoredValidators};
    };

    it('validate serialize/deserialize types for routeCountry', () => {
        const {validators, restoredValidators} = getValidators(routeCountry);

        const validItem = 'spain';
        expect(validators[0]('a')).toEqual(restoredValidators[0]('a'));
        expect(validators[0](validItem)).toEqual(restoredValidators[0](validItem));
    });

    it('validate serialize/deserialize types for routeSimpleUser', () => {
        const {validators, restoredValidators} = getValidators(routeSimpleUser);

        const validItem = {name: 'hello', surname: 'world'};
        expect(validators[0]('a')).toEqual(restoredValidators[0]('a'));
        expect(validators[0](validItem)).toEqual(restoredValidators[0](validItem));
    });

    it('validate serialize/deserialize types for routeDataPoint', () => {
        const {validators, restoredValidators} = getValidators(routeDataPoint);

        const validItem = {hello: 'world'};

        expect(validators[0]('a')).toEqual(restoredValidators[0]('a'));
        expect(validators[0](validItem)).toEqual(restoredValidators[0](validItem));
    });
});
