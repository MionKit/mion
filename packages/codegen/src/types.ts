/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicProcedure, PublicApi} from '@mionkit/router';
import {Options as PrettierOptions} from 'prettier';

export type CodegenOptions = {
    /** The path to the generated Public Methods file */
    outputFileName: string;
    /** The path to the file where the Public Methods get exported. */
    entryFileName: string;
    /** path to tsConfig file. */
    tsConfigFilePath?: string;
    /** The public route types get imported as package instead of relative path. name in package.json used for this. */
    importAsPackage?: boolean;
    /** Prettier options for the generated code. */
    prettierOptions?: PrettierOptions;
};

/** A directory of routes exported into the specs file.  */
export type ExportedRoutesMap = {
    [key: string]: PublicApi<any>;
};

export type PublicMethodsSpec = {
    [key: string]: PublicMethodsSpec | PublicApi<any> | null;
};

export type RoutesSpec = {
    [key: string]: RoutesSpec | PublicProcedure[];
};

// #######  guards #######

export const hasChildRoutes = (entry: PublicProcedure | PublicApi<any> | null): entry is PublicApi<any> => {
    if (!entry) return false;
    return typeof entry.handler !== 'function' && typeof entry.handler !== 'string'; // string is the real value
};
