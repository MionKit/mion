/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {existsSync} from 'fs';
import {basename} from 'path';
import {Project, Node, OutputFile} from 'ts-morph';
import {CodegenOptions} from './types';

let project: Project | null = null;

export function initTsProject(tsConfigFilePath: string) {
    if (project) throw new Error('TS Project already initialized!');
    project = new Project({
        tsConfigFilePath: tsConfigFilePath,
        skipAddingFilesFromTsConfig: true,
    });
}

/**
 * Returns a list of names of the exported variables in entryFileName that are of the PublicRoutes type.
 * @param options
 * @returns
 */
export function getExportedRoutesVarNames(options: CodegenOptions): string[] {
    if (!project) throw new Error('TS Project has not been initialized!');
    if (options.tsConfigFilePath && !existsSync(options.tsConfigFilePath))
        throw new Error(`Ts config file '${options.tsConfigFilePath}' not found!`);
    if (!existsSync(options.entryFileName)) throw new Error(`Entry typescript file '${options.entryFileName}' not found!`);

    const typeId = getPublicRoutesTypeId(options);
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
            `No exported Public Methods found in entry file '${options.entryFileName}'.` +
                `\nPlease check you exporting a variable when calling @mionkit/router.registerRoutes!`
        );

    return exportedPublicRoutesNames;
}

/**
 * Returns the import section of the type.getText(), works as type ID
 *  I.e. type<PublicRoutes>.getText() returns:  import("/node_modules/@mionkit/packages/router/src/types").PublicRoutes<{}> | null
 *  The id part is:                             import("/node_modules/@mionkit/packages/router/src/types").PublicRoutes
 *  */
function getPublicRoutesTypeId(options: CodegenOptions) {
    if (!project) throw new Error('TS Project has not been initialized!');
    // we create a new file beside the entryFile and extract the import path (id) from type.getText() result.
    // !!Important this can change depending on the retunr type of router.registerRoutes()!!
    const publicRoutesFileSample = `
        import {initRouter, registerRoutes} from '@mionkit/router';
        const api = {};
        initRouter();
        export const PUBLIC_ROUTES = registerRoutes(api);
    `;
    const publicRoutesExportedName = 'PUBLIC_ROUTES';
    const exportSampleName = `${options.entryFileName}---ExPort-PuBlic_ROutEs--Sample---.ts`;
    project.createSourceFile(exportSampleName, publicRoutesFileSample);
    const exampleFile = project.getSourceFile(exportSampleName);
    if (!exampleFile) throw new Error(`Developer Error`); // this should never happen!
    const sampleExportsDeclaration = exampleFile.getExportedDeclarations().get(publicRoutesExportedName);
    if (!sampleExportsDeclaration) throw new Error(`Developer Error`);

    // this is expected to be something like: import("/node_modules/@mionkit/packages/router/src/types").PublicRoutes<{}> | null
    const samplePublicRoutesTypeText = sampleExportsDeclaration[0].getType().getText();
    return samplePublicRoutesTypeText.replace('<{}>', '');
}

/** Return the required JS code to run the router and generate the router spec. */
export function getGenerateSpecJsCode(options: CodegenOptions, exportedPublicRoutesNames: string[]): OutputFile {
    if (!project) throw new Error('TS Project has not been initialized!');
    const entryTsName = basename(options.entryFileName);
    const runAppAndGenerateSpec = `
        process.env.GENERATE_ROUTER_SPEC = 'true';
        import {${exportedPublicRoutesNames.join(', ')}} from './${entryTsName}';
        import {generateSpecFile} from '@mionkit/codegen';
        const exportedRoutes = ${JSON.stringify(exportedPublicRoutesNames)};
        generateSpecFile(${JSON.stringify(options.outputFileName)}, exportedRoutes); 
    `;

    const renAndGenerateName = `${options.entryFileName}---rUn-ApP-AnD-GeNerATe-sPEc---.ts`;
    project.createSourceFile(renAndGenerateName, runAppAndGenerateSpec);
    const renAndGenerateFile = project.getSourceFile(renAndGenerateName);
    if (!renAndGenerateFile) throw new Error(`Developer Error`); // this should never happen!
    const outFiles = renAndGenerateFile.getEmitOutput();
    const jsFile = outFiles
        .getOutputFiles()
        .find((file) => file.getFilePath().endsWith('.js') || file.getFilePath().endsWith('.mjs'));
    if (!jsFile) throw new Error('There was an unknow problem compiling typescript.');
    return jsFile;
}
