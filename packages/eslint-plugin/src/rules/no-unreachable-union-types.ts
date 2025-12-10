/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';

type PropertyInfo = {
    name: string;
    isOptional: boolean;
};

/**
 * Extracts property names from an object type (interface body, type literal)
 */
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

/**
 * Checks if typeA is a superset of typeB (typeA has all properties of typeB plus more)
 * This means if typeB comes before typeA in a union, typeA would be unreachable.
 * Only considers types as blocking if they have at least one REQUIRED property in common.
 */
function isSupersetOf(typeAProps: PropertyInfo[], typeBProps: PropertyInfo[]): boolean {
    if (typeAProps.length <= typeBProps.length) return false;

    // Get required properties from both types
    const typeBRequired = typeBProps.filter((p) => !p.isOptional);

    // If typeB has no required properties, it doesn't block typeA
    // (all-optional types need special handling via weakTypeCheck)
    if (typeBRequired.length === 0) return false;

    // Check if all required properties of typeB exist in typeA (and are also required)
    for (const propB of typeBRequired) {
        const propA = typeAProps.find((p) => p.name === propB.name);
        // If typeB has a required prop that typeA doesn't have as required, A is not a superset
        if (!propA || propA.isOptional) return false;
    }

    // typeA has all required properties of typeB, check if it has extra required ones
    const typeBRequiredNames = new Set(typeBRequired.map((p) => p.name));
    const typeARequired = typeAProps.filter((p) => !p.isOptional);
    const hasExtraRequiredProps = typeARequired.some((p) => !typeBRequiredNames.has(p.name));
    return hasExtraRequiredProps;
}

/**
 * Checks if a union type has interfaces where one is a superset of another
 * and the subset comes before the superset (making the superset unreachable)
 */
function findUnreachableTypes(unionNode: TSESTree.TSUnionType): {unreachable: TSESTree.TypeNode; blocker: TSESTree.TypeNode}[] {
    const issues: {unreachable: TSESTree.TypeNode; blocker: TSESTree.TypeNode}[] = [];
    const typesWithProps: {node: TSESTree.TypeNode; props: PropertyInfo[]}[] = [];

    // Collect all object types with their properties
    for (const typeNode of unionNode.types) {
        const props = getObjectTypeProperties(typeNode);
        if (props && props.length > 0) {
            typesWithProps.push({node: typeNode, props});
        }
    }

    // For each pair of types, check if one is a superset of another
    for (let i = 0; i < typesWithProps.length; i++) {
        for (let j = i + 1; j < typesWithProps.length; j++) {
            const typeA = typesWithProps[i];
            const typeB = typesWithProps[j];

            // If typeA (earlier) is a subset of typeB (later), typeB is unreachable
            if (isSupersetOf(typeB.props, typeA.props)) {
                issues.push({unreachable: typeB.node, blocker: typeA.node});
            }
        }
    }

    return issues;
}

/**
 * Gets a readable representation of an object type for error messages
 */
function getTypeDescription(node: TSESTree.TypeNode): string {
    if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
        const props = getObjectTypeProperties(node);
        if (props) {
            return `{${props.map((p) => (p.isOptional ? `${p.name}?` : p.name)).join(', ')}}`;
        }
    }
    return 'object type';
}

/**
 * Checks if the union type is a return type or parameter type of route/hook/headersHook
 */
function isRouterUnionType(node: TSESTree.TSUnionType, context: TSESLint.RuleContext<any, any>): boolean {
    // Check if we're in a return type annotation or parameter type annotation
    let current: TSESTree.Node | undefined = node.parent;
    while (current) {
        // Check if we're in a function that's used in route/hook/headersHook
        if (
            current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === AST_NODE_TYPES.FunctionExpression ||
            current.type === AST_NODE_TYPES.FunctionDeclaration
        ) {
            // Check if parent is a call to route/hook/headersHook
            const parent = current.parent;
            if (parent?.type === AST_NODE_TYPES.CallExpression) {
                return isRouterFunctionCall(parent, context);
            }
        }
        // Check if we're in a type annotation for Handler/HeaderHandler
        if (current.type === AST_NODE_TYPES.TSTypeAnnotation) {
            const typeAnnotationParent = current.parent;
            if (typeAnnotationParent?.type === AST_NODE_TYPES.Identifier) {
                const declarator = typeAnnotationParent.parent;
                if (declarator?.type === AST_NODE_TYPES.VariableDeclarator) {
                    // Check if the type annotation references Handler/HeaderHandler
                    if (current.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
                        const typeName = current.typeAnnotation.typeName;
                        if (typeName.type === AST_NODE_TYPES.Identifier) {
                            if (
                                (typeName.name === 'Handler' || typeName.name === 'HeaderHandler') &&
                                isImportedFromMionRouter(typeName.name, context)
                            ) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        current = current.parent;
    }
    return false;
}

/**
 * Checks if a call expression is a route/hook/headersHook from @mionkit/router
 */
function isRouterFunctionCall(node: TSESTree.CallExpression, context: TSESLint.RuleContext<any, any>): boolean {
    const routerFunctions = ['route', 'hook', 'headersHook'];
    if (node.callee.type !== AST_NODE_TYPES.Identifier || !routerFunctions.includes(node.callee.name)) {
        return false;
    }
    return isImportedFromMionRouter(node.callee.name, context);
}

/**
 * Checks if a name is imported from @mionkit/router
 */
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

const rule: TSESLint.RuleModule<'unreachableUnionType', []> = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Detect union types where one interface is unreachable because a subset type comes before it',
        },
        messages: {
            unreachableUnionType:
                'Union type {{unreachableType}} is unreachable because {{blockerType}} matches first. ' +
                'Move the more specific type (with more properties) before the less specific one.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            TSUnionType(node: TSESTree.TSUnionType) {
                // Only check unions in router context
                if (!isRouterUnionType(node, context)) {
                    return;
                }

                const issues = findUnreachableTypes(node);
                for (const issue of issues) {
                    context.report({
                        node: issue.unreachable,
                        messageId: 'unreachableUnionType',
                        data: {
                            unreachableType: getTypeDescription(issue.unreachable),
                            blockerType: getTypeDescription(issue.blocker),
                        },
                    });
                }
            },
        };
    },
};

export default rule;
