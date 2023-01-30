/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Options as PrettierOptions} from 'prettier';

export type CodegenOptions = {
    /** The path to the generated public routes file */
    outputFileName: string;
    /** The path to the file where the public routes get exported. */
    entryFileName: string;
    /** path to tsConfig file. */
    tsConfigFilePath?: string;
    /** The public route types get imported as package instead of relative path. name in package.json used for this. */
    importAsPackage: boolean;
    /** Prettier options for the generated code. */
    prettierOptions?: PrettierOptions;
};
