/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';

/**
 * Recursively checks if a type node contains `typeof`.
 * @param typeNode The type node to check.
 * @returns True if `typeof` is found, otherwise false.
 */
function containsTypeof(typeNode: TSESTree.Node | null): boolean {
    if (!typeNode) return false;

    switch (typeNode.type) {
        case AST_NODE_TYPES.TSTypeQuery:
            return true;
        case AST_NODE_TYPES.TSUnionType:
        case AST_NODE_TYPES.TSIntersectionType:
            return typeNode.types.some(containsTypeof);
        case AST_NODE_TYPES.TSTupleType:
            return typeNode.elementTypes.some(containsTypeof);
        default:
            return false;
    }
}

/**
 * Checks if a call expression is calling runType from @mionkit/run-types
 * @param node The call expression node
 * @param context The ESLint context
 * @returns True if it's a runType call from @mionkit/run-types
 */
function isRunTypeFromMionKit(node: TSESTree.CallExpression, context: TSESLint.RuleContext<any, any>): boolean {
    // Check if the callee is an identifier named 'runType'
    if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'runType') {
        return false;
    }

    // Get the source code to check imports
    const sourceCode = context.getSourceCode();
    const program = sourceCode.ast;

    // Look for import statements that import runType from @mionkit/run-types or relative paths
    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            // Check for @mionkit/run-types package or relative imports that end with runType
            if (
                source === '@mionkit/run-types' ||
                source === '@mionkit/run-types/' ||
                (typeof source === 'string' && source.endsWith('/runType'))
            ) {
                // Check if runType is imported
                for (const specifier of statement.specifiers) {
                    if (
                        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'runType'
                    ) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

const rule: TSESLint.RuleModule<'noTypeof', []> = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow using `typeof` with the `runType` function from @mionkit/run-types',
        },
        messages: {
            noTypeof: 'Do not use `typeof` with the `runType` function. Use explicit type definitions instead.',
        },
        schema: [], // No options
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node: TSESTree.CallExpression) {
                // Ensure the function being called is `runType` from @mionkit/run-types
                if (isRunTypeFromMionKit(node, context)) {
                    // Check if type arguments contain typeof
                    const typeArguments = (node as any).typeArguments || (node as any).typeParameters;
                    if (typeArguments?.params.some(containsTypeof)) {
                        context.report({
                            node,
                            messageId: 'noTypeof',
                        });
                    }
                }
            },
        };
    },
};

export default rule;
