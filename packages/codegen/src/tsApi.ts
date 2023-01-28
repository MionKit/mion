/* ########
 * 2023 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as ts from 'typescript';

function getExportedRoutes(fileNames: string[], options: ts.CompilerOptions): void {
    const program = ts.createProgram(fileNames, options);
    const checker = program.getTypeChecker();
}
