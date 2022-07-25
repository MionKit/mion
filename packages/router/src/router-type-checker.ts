/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {relative, resolve, sep} from 'path';
import {
    Project,
    Node,
    FunctionDeclaration,
    ParameterDeclaration,
    VariableDeclaration,
    ts,
    ArrowFunction,
    Type,
    VariableStatement,
    FunctionExpression,
    TypeChecker,
    AsExpression,
    ParenthesizedExpression,
} from 'ts-morph';
import {ApiRouterOptions} from './types';
import {getAllFillesFromDirectory} from './utils';

export interface TypeInfo {
    type: string; // type
    name: string; // type as is declared in the file, used to get the schema id
    escapedName: string; // equal to name?
    fullyQualifiedName: string; // includes the type path i.e
    type_text: string; // full import sentence for the type
    aliasType: string | null; // In case the Type is a generic type ie: Route<Req, resp>
    aliasTypeArguments: TypeInfo[] | null; // if type is a generic this is the list of arguments to the generic ie: Req, Resp
    structure?: any;
    aliasSymbol?;
    properties?;
}

export interface TypesInfoMap {
    [key: string]: TypeInfo;
}

export interface FunctionData {
    kind: string;
    exportedName: string;
    parameters: TypesInfoMap;
    returnType: TypeInfo;
    signature?: any;
}

export interface RouteMetadata {
    exportedName: string;
    fileName: string;
    metadata: FunctionData;
}

export interface ExportedMetadata {
    [key: string]: RouteMetadata;
}

export type FunctionLike = FunctionDeclaration | ArrowFunction | FunctionExpression;

export function getRoutesMetadata(tsConfigFilePath: string, options: ApiRouterOptions): ExportedMetadata {
    const files = getAllFillesFromDirectory(options.srcDir);
    const project = new Project({tsConfigFilePath});
    let exportMetadata: ExportedMetadata = {};
    files.forEach((fileName) => {
        exportMetadata = {
            ...exportMetadata,
            ...getRouteMetadata(tsConfigFilePath, fileName, options, project),
        };
    });
    return exportMetadata;
}

export function getRouteMetadata(
    tsConfigFilePath: string,
    fileName: string,
    options: ApiRouterOptions,
    project = new Project({tsConfigFilePath}),
): ExportedMetadata {
    const rootPath = resolve(options.srcDir);
    const sourceFile = project.getSourceFileOrThrow(fileName);
    const typeChecker = project.getTypeChecker();
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    let exportMetadata: ExportedMetadata = {};
    for (const [name, declarations] of exportedDeclarations) {
        declarations.forEach((declaration) => {
            const exportedName = name;
            let metadata;
            // when exported item is a function
            if (Node.isFunctionDeclaration(declaration)) {
                metadata = getAPIDataFromExportedFuncion(exportedName, declaration, typeChecker);
            } else if (Node.isVariableDeclaration(declaration)) {
                metadata = getAPIDataFromExportedVariable(exportedName, declaration, typeChecker);
            } else {
                throw new Error(getNoExportedFunctionErrorMessage(declaration, false));
            }
            // when exported item is an ApiRoute
            // when exported item is casted as ApiRoute
            // when exported item is an ApiRouteOptions
            const relativePath = relative(rootPath, fileName);
            exportMetadata[`${relativePath}${sep}${exportedName}`] = {exportedName, fileName, metadata};
        });
    }

    // ####### LOGS ##########
    // console.dir(exportMetadata, {depth: 5});
    console.log(JSON.stringify(exportMetadata));
    return exportMetadata;
}

function getAPIDataFromExportedFuncion(exportName: string, functionNode: FunctionLike, checker: TypeChecker): FunctionData {
    if (!Node.isFunctionDeclaration(functionNode) && !Node.isArrowFunction!) throw new Error('node is not a function');
    const returnType = functionNode.getReturnType();
    const parameters = getFunctionparameters(functionNode, checker);
    validateFunctionParameters(exportName, functionNode, parameters);
    return {
        exportedName: exportName,
        kind: functionNode.getKindName(),
        parameters,
        returnType: getFunctionReturnType(returnType, checker),
    };
}

function getAPIDataFromExportedVariable(
    exportName: string,
    declaration: VariableDeclaration | AsExpression | ParenthesizedExpression,
    checker: TypeChecker,
): FunctionData {
    if (
        !Node.isVariableDeclaration(declaration) &&
        !Node.isAsExpression(declaration) &&
        !Node.isParenthesizedExpression(declaration)
    )
        throw new Error('node is not a variable declaration');
    let childFunctionData;
    declaration.forEachChildAsArray().forEach((node) => {
        checkIfIsValidNode(node);
        if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
            if (childFunctionData) throw new Error(getDuplicatedExportedFunctionErrorMessage(node));
            childFunctionData = getAPIDataFromExportedFuncion(exportName, node, checker);
        } else if (Node.isObjectLiteralExpression(node)) {
            // expression is an object literal and should have a property called handler that must be a function
        } else if (Node.isAsExpression(node) || Node.isParenthesizedExpression(node)) {
            // expression has been casted, should deep dive into childs to get the function
            childFunctionData = getAPIDataFromExportedVariable(exportName, node, checker);
        } else if (Node.isParenthesizedExpression(node)) {
            // expression has been casted, should deep dive into childs to get the function
            childFunctionData = getAPIDataFromExportedVariable(exportName, node, checker);
        }
    });

    return {
        exportedName: exportName,
        kind: declaration.getKindName(),
        ...childFunctionData,
    };
}

function getFunctionparameters(functionNode: FunctionLike, checker: TypeChecker): TypesInfoMap {
    const parameters: ParameterDeclaration[] = functionNode.getParameters();
    const params: any = {};
    parameters.forEach((param) => {
        const name = param.getName();
        const paramType = param.getType();
        params[name] = {
            ...getTypeInfo(paramType, checker),
            structure: param.getStructure(),
        };
    });
    return params;
}

function getTypeInfo(paramType: Type<ts.Type>, checker: TypeChecker): TypeInfo {
    const aliasArguments = paramType.getAliasTypeArguments();
    const aliasTypeArguments = aliasArguments.length ? aliasArguments.map((typeNode) => getTypeInfo(typeNode, checker)) : null;
    return {
        type: checker.compilerObject.typeToString(paramType.compilerType),
        name: paramType.getSymbol()?.getName() || '',
        escapedName: paramType.getSymbol()?.getEscapedName() || '',
        fullyQualifiedName: paramType.getSymbol()?.getFullyQualifiedName() || '',
        type_text: checker.getTypeText(paramType),
        aliasType: paramType.getAliasSymbol()?.getName() || null,
        aliasSymbol: paramType.getAliasSymbol(),
        aliasTypeArguments,
        // properties: paramType.getProperties().map((p) => ({
        //     name: p.getEscapedName(),
        //     type: // todo
        // })),
    };
}

function getFunctionReturnType(returnType: Type<ts.Type>, checker: TypeChecker) {
    return {
        ...getTypeInfo(returnType, checker),
        structure: null,
    };
}

// https://stackoverflow.com/questions/47421000/is-there-a-way-to-get-the-line-number-of-node-from-typescript-compiler-api
// https://github.com/Microsoft/TypeScript-wiki/blob/main/Using-the-Compiler-API.md
function getSourceCodeInfo(node: Node<ts.Node>, searchForParents = true) {
    const exportStatement = searchForParents ? findParentvariableStatement(node) : node;
    const sourceFile = node.compilerNode.getSourceFile();
    let {line} = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const fileLine = line + 1;
    const fileName = sourceFile.fileName;
    const description = `Source File: '${fileName}' at line: ${fileLine}`;
    const code = node.getFullText();
    return {fileLine, fileName, description, code};
}

function getNoExportedFunctionErrorMessage(node: Node<ts.Node>, searchForParents = true) {
    const info = getSourceCodeInfo(node, searchForParents);
    return `Router Files can only export functions and arrow funcions.\nNon valid export fount at => ${info.description}\n${info.code}`;
}

function getDuplicatedExportedFunctionErrorMessage(node: Node<ts.Node>) {
    const info = getSourceCodeInfo(node);
    return `More than one function Exported in a single statement fount at => ${info.description}\n${info.code}`;
}

function getInvalidNumberOfParametersMessage(node: Node<ts.Node>) {
    const info = getSourceCodeInfo(node);
    return `Route functions can only have 4 parameters.\nInvalid route found at => ${info.description}\n${info.code}`;
}

function getInvalidparameterTypeMessage(node: Node<ts.Node>) {
    const info = getSourceCodeInfo(node, false);
    return `Parameters in a Route function have the wrong type.
    The only valid signature for a route is 'function myRoute(body: any, api: ApiDS, req: FastifyRequest, reply: FastifyReply){}'.
    Invalid route found at => ${info.description}\n${info.code}`;
}

function checkIfIsValidNode(node: Node<ts.Node>) {
    if (
        !Node.isIdentifier(node) &&
        !Node.isFunctionDeclaration(node) &&
        !Node.isArrowFunction(node) &&
        !Node.isTypeReference(node) &&
        !Node.isFunctionTypeNode(node) &&
        !Node.isParenthesizedExpression(node) &&
        !Node.isFunctionExpression(node) &&
        !Node.isAsExpression(node) &&
        !Node.isObjectLiteralExpression(node)
    )
        throw new Error(getNoExportedFunctionErrorMessage(node));
}

function validateFunctionParameters(exportName: string, functionNode: FunctionLike, parameters: TypesInfoMap) {
    const parametersArray = Object.values(parameters);
    const apiDS = parametersArray[1];
    const fastifyRequest = parametersArray[2];
    const fastifyReply = parametersArray[3];
    // TODO check the actual ts.Type instead the parameter.name (would require checkint types are assignable)
    // this can be easyly implemented once checker.isAssignableTo gets made public https://github.com/microsoft/TypeScript/pull/9943
    const invalidApiDSType = apiDS && apiDS.name !== 'ApiDS' && apiDS.type !== 'any';
    const invalidFastifyRequestType = fastifyRequest && fastifyRequest.name !== 'FastifyRequest' && fastifyRequest.type !== 'any';
    const invalidFastifyReplyType = fastifyReply && fastifyReply.name !== 'FastifyReply' && fastifyRequest.type !== 'any';
    if (parametersArray.length > 4) throw new Error(getInvalidNumberOfParametersMessage(functionNode));
    if (invalidApiDSType || invalidFastifyRequestType || invalidFastifyReplyType) {
        console.log('parameters', parameters);
        throw new Error(getInvalidparameterTypeMessage(functionNode));
    }
}

function findParentvariableStatement(node: Node<ts.Node> | undefined): VariableStatement {
    if (node === undefined) throw new Error('Parent Variable Statement not found');
    if (Node.isVariableStatement(node)) return node;
    return findParentvariableStatement(node.getParent());
}
