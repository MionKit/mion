"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@typescript-eslint/utils");
function containsTypeof(typeNode) {
    if (!typeNode)
        return false;
    switch (typeNode.type) {
        case utils_1.AST_NODE_TYPES.TSTypeQuery:
            return true;
        case utils_1.AST_NODE_TYPES.TSUnionType:
        case utils_1.AST_NODE_TYPES.TSIntersectionType:
            return typeNode.types.some(containsTypeof);
        case utils_1.AST_NODE_TYPES.TSTupleType:
            return typeNode.elementTypes.some(containsTypeof);
        default:
            return false;
    }
}
function isRunTypeFromMionKit(node, context) {
    if (node.callee.type !== utils_1.AST_NODE_TYPES.Identifier || node.callee.name !== 'runType') {
        return false;
    }
    const sourceCode = context.getSourceCode();
    const program = sourceCode.ast;
    for (const statement of program.body) {
        if (statement.type === utils_1.AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            if (source === '@mionkit/run-types' ||
                source === '@mionkit/run-types/' ||
                (typeof source === 'string' && source.endsWith('/runType'))) {
                for (const specifier of statement.specifiers) {
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'runType') {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow using `typeof` with the `runType` function from @mionkit/run-types',
        },
        messages: {
            noTypeof: 'Do not use `typeof` with the `runType` function. Use explicit type definitions instead.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (isRunTypeFromMionKit(node, context)) {
                    const typeArguments = node.typeArguments || node.typeParameters;
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
exports.default = rule;
