/* ########
 * 2022 mion
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
    parser: 'typescript',
};

export const PUBLIC_METHODS_SPEC_EXPORT_NAME = 'PUBLIC_METHODS';
export const ROUTES_SPEC_EXPORT_NAME = 'ROUTES';
