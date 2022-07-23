/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    Project,
    Node,
    FunctionDeclaration,
    ParameterDeclaration,
    ExportedDeclarations,
    VariableDeclaration,
    ts,
    Symbol,
    ArrowFunction,
    Type,
    VariableStatement,
    FunctionExpression,
    TypeChecker,
} from 'ts-morph';

interface TypeInfo {
    type: string; // type
    name: string; // type as is declared in the file, used to get the schema id
    escapedName: string; // equal to name?
    fullyQualifiedName: string; // uncludes the type path i.e
    structure: any;
    type_solved?: any;
}

interface TypesInfoMap {
    [key: string]: TypeInfo;
}

interface FunctionData {
    exportName: string;
    decType: string;
    parameters: TypesInfoMap;
    returnType: TypeInfo;
    signature?: any;
}

export function getRoutesTypes(tsConfigFilePath: string, fileName: string) {
    const project = new Project({
        tsConfigFilePath,
    });
    const sourceFile = project.getSourceFileOrThrow(fileName);
    const typeChecker = project.getTypeChecker();
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    for (const [name, declarations] of exportedDeclarations) {
        const functionsData: any = declarations
            .map((declaration) => {
                // when exported item is a function
                if (Node.isFunctionDeclaration(declaration)) {
                    return getAPIDataFromExportedFuncion(name, declaration, typeChecker);
                } else if (Node.isVariableDeclaration(declaration)) {
                    return getAPIDataFromExportedVariable(name, declaration, typeChecker);
                } else {
                    // TODO throw when is other type
                    return getOtherType(name, declaration, typeChecker);
                }
                // when exported item is an ApiRoute
                // when exported item is casted as ApiRoute
                // when exported item is an ApiRouteOptions
            })
            .filter((item) => !!item);
        // console.log('####### functionData ##########');
        // console.log(functionsData);
        // console.log(functionsData[0]?.parameters);
    }
}

// https://stackoverflow.com/questions/47421000/is-there-a-way-to-get-the-line-number-of-node-from-typescript-compiler-api
// https://github.com/Microsoft/TypeScript-wiki/blob/main/Using-the-Compiler-API.md
function getSourceCodeInfo(node: Node<ts.Node>) {
    const sourceFile = node.compilerNode.getSourceFile();
    let {line} = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const fileLine = line + 1;
    const fileName = sourceFile.fileName;
    const description = `Source File: '${fileName}' at line: ${fileLine}`;
    const code = node.getFullText();
    return {fileLine, fileName, description, code};
}

function getNoExportedFunctionErrorMessage(node: Node<ts.Node>) {
    const parentVariableStatement = findParentvariableStatement(node);
    const info = getSourceCodeInfo(parentVariableStatement);
    console.log('Node kind', node.getKindName());
    return `Router Files can only export functions and arrow funcions.\nNon valid export fount at => ${info.description}\n${info.code}`;
}

function getDuplicatedExportedFunctionErrorMessage(node: Node<ts.Node>) {
    const parentVariableStatement = findParentvariableStatement(node);
    const info = getSourceCodeInfo(parentVariableStatement);
    console.log('Node kind', node.getKindName());
    return `More than one function Exported in a single statement fount at => ${info.description}\n${info.code}`;
}

function checkIfIsValidExportedFunction(node: Node<ts.Node>) {
    if (
        !Node.isIdentifier(node) &&
        !Node.isFunctionDeclaration(node) &&
        !Node.isArrowFunction(node) &&
        !Node.isTypeReference(node) &&
        !Node.isFunctionTypeNode(node) &&
        !Node.isParenthesizedExpression(node) &&
        !Node.isFunctionExpression(node) &&
        !Node.isAsExpression(node) &&
        !Node.isObjectLiteralExpression(node) &&
        !Node.isCallExpression(node)
    )
        throw new Error(getNoExportedFunctionErrorMessage(node));
}

function findParentvariableStatement(node: Node<ts.Node> | undefined): VariableStatement {
    if (node === undefined) throw new Error('Parent Variable Statement not found');
    if (Node.isVariableStatement(node)) return node;
    return findParentvariableStatement(node.getParent());
}

function getAPIDataFromExportedFuncion(
    exportName: string,
    declaration: FunctionDeclaration | ArrowFunction | FunctionExpression,
    checker: TypeChecker,
): FunctionData {
    if (!Node.isFunctionDeclaration(declaration) && !Node.isArrowFunction!) throw new Error('node is not a function');
    const returnType = declaration.getReturnType();
    return {
        exportName: exportName,
        decType: declaration.getKindName(),
        // signature: checker.getResolvedSignature(declaration.getSignature()),
        parameters: getFunctionparameters(declaration.getParameters(), checker),
        returnType: getFunctionReturnType(returnType, checker),
    };
}

function getFunctionparameters(parameters: ParameterDeclaration[], checker: TypeChecker): TypesInfoMap {
    const params: any = {};
    parameters.forEach((param) => {
        const name = param.getName();
        const paramType = param.getType();
        const paramSymbol = paramType.getSymbol();
        params[name] = {
            paramType,
            type: checker.compilerObject.typeToString(paramType.compilerType),
            type_solved:
                paramSymbol !== undefined
                    ? checker.compilerObject.typeToString(checker.getTypeOfSymbolAtLocation(paramSymbol, param).compilerType)
                    : '',
            name: paramType.getSymbol()?.getName() || '',
            escapedName: paramType.getSymbol()?.getEscapedName() || '',
            fullyQualifiedName: paramType.getSymbol()?.getFullyQualifiedName() || '',
            structure: param.getStructure(),
        };
    });
    return params;
}

function getFunctionReturnType(returnType: Type<ts.Type>, checker: TypeChecker) {
    return {
        type: checker.compilerObject.typeToString(returnType.compilerType),
        name: symbolToString(returnType.getSymbol(), checker),
        escapedName: returnType.getSymbol()?.getEscapedName() || '',
        fullyQualifiedName: returnType.getSymbol()?.getFullyQualifiedName() || '',
        structure: null,
    };
}

function getAPIDataFromExportedVariable(exportName: string, declaration: VariableDeclaration, checker: TypeChecker) {
    if (!Node.isVariableDeclaration(declaration)) throw new Error('node is not a variable declaration');
    let childFunctionData;
    declaration.forEachChildAsArray().forEach((node) => {
        checkIfIsValidExportedFunction(node);
        if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
            if (childFunctionData) throw new Error(getDuplicatedExportedFunctionErrorMessage(node));
            childFunctionData = getAPIDataFromExportedFuncion(exportName, node, checker);
        } else if (Node.isAsExpression(node)) {
            // expression has been casted, whe should deep dive into childs
        } else if (Node.isObjectLiteralExpression(node)) {
            // expression is an object literal and should match the Api Schema
        } else if (Node.isParenthesizedExpression(node)) {
            const returnType = node;
            // Enclosing expression
            if (exportName === 'selfInvokedReturningAnonimousFunctionWithTypes') {
                console.log;
            }
        } else if (Node.isAsExpression(node)) {
            // todo
        } else if (Node.isCallExpression(node)) {
            // Call expression, we need to get the returned value
        }
    });

    const apiData = {
        ...getOtherType(exportName, declaration, checker),
        ...childFunctionData,
    };

    if (apiData.exportName === 'arrowFunction') {
        // console.log(apiData);
        console.log(apiData);
    }
    return apiData;
}

function symbolToString(symbol: Symbol | undefined, checker: TypeChecker) {
    if (symbol === undefined) return '';
    return checker.compilerObject.symbolToString(symbol.compilerSymbol);
}

function getOtherType(exportName: string, declaration: ExportedDeclarations, checker: TypeChecker) {
    const declarationType = declaration.getType();
    const apiData = {
        exportName: exportName,
        decType: declaration.getKindName(),
        type: checker.compilerObject.typeToString(declarationType.compilerType),
    };

    if (apiData.exportName === 'suma') console.log(apiData);
    return apiData;
}
