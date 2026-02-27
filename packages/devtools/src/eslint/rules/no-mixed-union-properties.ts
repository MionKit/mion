/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';

type PropertyInfo = {name: string; isOptional: boolean};
type UnionTypeInfo = {node: TSESTree.TypeNode; properties: PropertyInfo[]};

function getObjectTypeProperties(node: TSESTree.TypeNode): PropertyInfo[] | null {
    if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
        const props: PropertyInfo[] = [];
        for (const member of node.members) {
            if (member.type === AST_NODE_TYPES.TSPropertySignature && member.key.type === AST_NODE_TYPES.Identifier) {
                props.push({name: member.key.name, isOptional: !!member.optional});
            }
        }
        return props;
    }
    return null;
}

function getUnionObjectTypes(unionNode: TSESTree.TSUnionType): UnionTypeInfo[] {
    const types: UnionTypeInfo[] = [];
    for (const typeNode of unionNode.types) {
        const props = getObjectTypeProperties(typeNode);
        if (props && props.length > 0) {
            types.push({node: typeNode, properties: props});
        }
    }
    return types;
}

function getObjectLiteralPropertyNames(node: TSESTree.ObjectExpression): string[] {
    const names: string[] = [];
    for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.Property && prop.key.type === AST_NODE_TYPES.Identifier) {
            names.push(prop.key.name);
        }
    }
    return names;
}

function getMatchingUnionTypes(objectProps: string[], unionTypes: UnionTypeInfo[]): number[] {
    const matchingIndices: number[] = [];
    for (let i = 0; i < unionTypes.length; i++) {
        const unionPropNames = new Set(unionTypes[i].properties.map((p) => p.name));
        if (objectProps.some((prop) => unionPropNames.has(prop))) {
            matchingIndices.push(i);
        }
    }
    return matchingIndices;
}

function getUniquePropertiesPerType(unionTypes: UnionTypeInfo[]): Map<number, Set<string>> {
    const allProps = new Map<string, number[]>();
    for (let i = 0; i < unionTypes.length; i++) {
        for (const prop of unionTypes[i].properties) {
            const existing = allProps.get(prop.name) || [];
            existing.push(i);
            allProps.set(prop.name, existing);
        }
    }
    const uniqueProps = new Map<number, Set<string>>();
    for (let i = 0; i < unionTypes.length; i++) {
        const unique = new Set<string>();
        for (const prop of unionTypes[i].properties) {
            if ((allProps.get(prop.name) || []).length === 1) {
                unique.add(prop.name);
            }
        }
        uniqueProps.set(i, unique);
    }
    return uniqueProps;
}

/**
 * Resolves a type reference to its actual union type definition
 */
function resolveTypeReference(node: TSESTree.TypeNode, context: TSESLint.RuleContext<any, any>): TSESTree.TSUnionType | null {
    if (node.type !== AST_NODE_TYPES.TSTypeReference) {
        return null;
    }

    // Get the type name
    if (node.typeName.type !== AST_NODE_TYPES.Identifier) {
        return null;
    }

    const typeName = node.typeName.name;
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;

    // Find the type alias declaration
    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
            if (statement.id.name === typeName && statement.typeAnnotation.type === AST_NODE_TYPES.TSUnionType) {
                return statement.typeAnnotation;
            }
        }
    }

    return null;
}

function getReturnTypeAnnotation(
    func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration,
    context: TSESLint.RuleContext<any, any>
): TSESTree.TSUnionType | null {
    const returnType = func.returnType?.typeAnnotation;
    if (!returnType) {
        return null;
    }

    // Direct union type
    if (returnType.type === AST_NODE_TYPES.TSUnionType) {
        return returnType;
    }

    // Type reference that might resolve to a union type
    if (returnType.type === AST_NODE_TYPES.TSTypeReference) {
        return resolveTypeReference(returnType, context);
    }

    return null;
}

function findReturnStatements(
    func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration
): TSESTree.Node[] {
    const returns: TSESTree.Node[] = [];
    if (
        func.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        func.expression &&
        func.body.type !== AST_NODE_TYPES.BlockStatement
    ) {
        returns.push(func.body);
        return returns;
    }
    if (func.body.type === AST_NODE_TYPES.BlockStatement) {
        findReturnsInBlock(func.body, returns);
    }
    return returns;
}

function findReturnsInBlock(block: TSESTree.BlockStatement, returns: TSESTree.Node[]): void {
    for (const statement of block.body) {
        if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
            returns.push(statement.argument);
        } else if (statement.type === AST_NODE_TYPES.IfStatement) {
            if (statement.consequent.type === AST_NODE_TYPES.BlockStatement) {
                findReturnsInBlock(statement.consequent, returns);
            } else if (statement.consequent.type === AST_NODE_TYPES.ReturnStatement && statement.consequent.argument) {
                returns.push(statement.consequent.argument);
            }
            if (statement.alternate?.type === AST_NODE_TYPES.BlockStatement) {
                findReturnsInBlock(statement.alternate, returns);
            } else if (statement.alternate?.type === AST_NODE_TYPES.ReturnStatement && statement.alternate.argument) {
                returns.push(statement.alternate.argument);
            }
        }
    }
}

function getConflictDescription(objectProps: string[], unionTypes: UnionTypeInfo[], matchingIndices: number[]): string {
    const uniqueProps = getUniquePropertiesPerType(unionTypes);
    const conflicts: string[] = [];
    for (const idx of matchingIndices) {
        const unique = uniqueProps.get(idx) || new Set();
        const matchingProps = objectProps.filter((p) => unique.has(p));
        if (matchingProps.length > 0) {
            conflicts.push(`'${matchingProps.join("', '")}' from type ${idx + 1}`);
        }
    }
    return conflicts.join(' and ');
}

function isRouterFunction(node: TSESTree.Node, context: TSESLint.RuleContext<any, any>): boolean {
    let current: TSESTree.Node | undefined = node;
    while (current) {
        if (current.type === AST_NODE_TYPES.CallExpression) {
            return isRouterFunctionCall(current, context);
        }
        current = current.parent;
    }
    return false;
}

function isRouterFunctionCall(node: TSESTree.CallExpression, context: TSESLint.RuleContext<any, any>): boolean {
    const routerFunctions = ['route', 'middleFn', 'headersFn'];
    if (node.callee.type !== AST_NODE_TYPES.Identifier || !routerFunctions.includes(node.callee.name)) {
        return false;
    }
    return isImportedFromMionRouter(node.callee.name, context);
}

function isImportedFromMionRouter(name: string, context: TSESLint.RuleContext<any, any>): boolean {
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;
    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            if (source === '@mionkit/router' || source === '@mionkit/router/') {
                for (const specifier of statement.specifiers) {
                    if (
                        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === name
                    ) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function checkFunction(
    func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration,
    context: TSESLint.RuleContext<'mixedUnionProperties', []>
) {
    if (!isRouterFunction(func, context)) return;
    const unionType = getReturnTypeAnnotation(func, context);
    if (!unionType) return;
    const unionTypes = getUnionObjectTypes(unionType);
    if (unionTypes.length < 2) return;
    const returnStatements = findReturnStatements(func);
    for (const returnNode of returnStatements) {
        if (returnNode.type !== AST_NODE_TYPES.ObjectExpression) continue;
        const objectProps = getObjectLiteralPropertyNames(returnNode);
        if (objectProps.length === 0) continue;
        const matchingIndices = getMatchingUnionTypes(objectProps, unionTypes);
        const uniqueProps = getUniquePropertiesPerType(unionTypes);
        const typesWithUniqueMatches = matchingIndices.filter((idx) => {
            const unique = uniqueProps.get(idx) || new Set();
            return objectProps.some((prop) => unique.has(prop));
        });
        if (typesWithUniqueMatches.length > 1) {
            const conflicts = getConflictDescription(objectProps, unionTypes, typesWithUniqueMatches);
            context.report({node: returnNode, messageId: 'mixedUnionProperties', data: {conflicts}});
        }
    }
}

const rule: TSESLint.RuleModule<'mixedUnionProperties', []> = {
    meta: {
        type: 'problem',
        docs: {description: 'Detect object literals with properties from multiple union types in router handlers'},
        messages: {
            mixedUnionProperties:
                'Object literal has properties from multiple union types: {{conflicts}}. ' +
                'With loose union matching, only the first matching type will be used for serialization.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
                checkFunction(node, context);
            },
            FunctionExpression(node: TSESTree.FunctionExpression) {
                checkFunction(node, context);
            },
            FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
                checkFunction(node, context);
            },
        };
    },
};

export default rule;
