/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Options as PrettierOptions} from 'prettier';
import {RemoteExecutable} from '@mikrokit/client';

export type GenerateClientOptions = {
    /** The path to the api client file */
    outputFileName: string;
    /** The Routes types name i.e: MyAppRoutes */
    routesTypeName: string;
    /**
     * The import sentences for the client must import all Isomorphic types as well the routes type
     * ie:
     * import * from './types';
     * import MyRoutes from './api.routes.ts';
     */
    routesImport: string;
    version: string;
    packageName: string;
    prettierOptions?: PrettierOptions;
};

export type ClientData = RemoteExecutable & {
    clientData: {
        /** Name to use in generated client */
        camelCaseName: string;
        pathComponents: string[];
        paramNames: string[];
        paramTypesAsSrcCode: {[key: string]: string};
        returnTypeAsSrcCode: string;
    };
};

export type ApiSpec = {
    [key: string]: RemoteExecutable[] | ApiSpec;
};

export type ExecutableSourceCode = {
    sourceCode: string;
    pointerName: string;
    remoteCallName: string;
    prefillName: string;
    remoteParamsName: string;
    remoteReturnName: string;
    requestName: string;
    responseName: string;
    remoteFunctionName: string;
    prefillFunctionName: string;
};

/**
 * An Api spec containing src code references instead the object itself
 * so when is serialized RemoteExecutables are not duplicated
 *  */
export type ApiSpecReferences = {
    [key: string]: string | ApiSpecReferences;
};
