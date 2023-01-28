/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {Options as PrettierOptions} from 'prettier';

export const DEFAULT_PRETTIER_OPTIONS: PrettierOptions = {
    bracketSpacing: false,
    singleQuote: true,
    printWidth: 200,
    trailingComma: 'es5',
    parser: 'babel',
};
