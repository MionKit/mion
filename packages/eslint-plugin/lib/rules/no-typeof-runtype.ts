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

const rule: TSESLint.RuleModule<'noTypeof', []> = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow using `typeof` with the `runType` function',
        },
        messages: {
            noTypeof: 'Do not use `typeof` with the `runType` function.',
        },
        schema: [], // No options
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node: TSESTree.CallExpression) {
                // Ensure the function being called is `runType`
                if (
                    node.callee.type === 'Identifier' &&
                    node.callee.name === 'runType' &&
                    node.typeArguments?.params.some(containsTypeof)
                ) {
                    context.report({
                        node,
                        messageId: 'noTypeof',
                    });
                }
            },
        };
    },
};

export default rule;
