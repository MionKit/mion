/* ########
 * 2023 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {existsSync} from 'fs';
import {Project, Node} from 'ts-morph';
import {CodegenOptions} from './types';

/**
 * Returns a list of names of the exported variables in entryFileName that are of the PublicRoutes type.
 * @param options
 * @returns
 */
export function getExportedRoutesVarNames(options: CodegenOptions): string[] {
    if (options.tsConfigFilePath && !existsSync(options.tsConfigFilePath))
        throw new Error(`Ts config file '${options.tsConfigFilePath}' not found!`);
    if (!existsSync(options.entryFileName)) throw new Error(`Entry typescript file '${options.entryFileName}' not found!`);

    const project = new Project({
        tsConfigFilePath: options.tsConfigFilePath,
        skipAddingFilesFromTsConfig: true,
    });

    const typeId = getPublicRoutesTypeId(options, project);

    project.addSourceFileAtPathIfExists(options.entryFileName);
    const mainFile = project.getSourceFile(options.entryFileName);
    if (!mainFile) throw new Error(`Unknown error with entry file '${options.entryFileName}'.`);

    const exportedPublicRoutesNames: string[] = [];

    for (const [name, declarations] of mainFile.getExportedDeclarations()) {
        declarations.map((d) => {
            if (Node.isVariableDeclaration(d) && d.getType().getText().startsWith(typeId)) {
                exportedPublicRoutesNames.push(name);
            }
        });
    }

    if (!exportedPublicRoutesNames.length)
        throw new Error(
            `No exported Public Routes found in entry file '${options.entryFileName}'.` +
                `\nPlease check you exporting a variable when calling @mikrokit/router.registerRoutes!`
        );

    return exportedPublicRoutesNames;
}

/**
 * Returns the import section of the type.getText(), works as type ID
 *  I.e. type<PublicRoutes>.getText() returns:  import("/node_modules/@mikrokit/packages/router/src/types").PublicRoutes<{}> | null
 *  The id part is:                             import("/node_modules/@mikrokit/packages/router/src/types").PublicRoutes
 *  */
const getPublicRoutesTypeId = (options: CodegenOptions, project: Project) => {
    // we create a new file beside the entryFile and extract the import path (id) from type.getText() result.
    const PUBLIC_ROUTES_FILE_SAMPLE = `
        import {initRouter, registerRoutes} from '@mikrokit/router';
        const myApp = {};
        const getShared = () => ({});
        const api = {};
        initRouter(myApp, getShared);
        export const PUBLIC_ROUTES = registerRoutes(api);
    `;
    const PUBLIC_ROUTES_EXPORTED_NAME = 'PUBLIC_ROUTES';
    const exportSampleName = `${options.entryFileName}---ExPort-PuBlic_ROutEs--Sample---.ts`;
    project.createSourceFile(exportSampleName, PUBLIC_ROUTES_FILE_SAMPLE);
    const exampleFile = project.getSourceFile(exportSampleName);
    if (!exampleFile) throw new Error(`Developer Error`);
    const sampleExportsDeclaration = exampleFile.getExportedDeclarations().get(PUBLIC_ROUTES_EXPORTED_NAME);
    if (!sampleExportsDeclaration) throw new Error(`Developer Error`);

    // this is expected to be something like: import("/node_modules/@mikrokit/packages/router/src/types").PublicRoutes<{}> | null
    const samplePublicRoutesTypeText = sampleExportsDeclaration[0].getType().getText();
    return samplePublicRoutesTypeText.replace('<{}> | null', '');
};
