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
    const runTypeFunctions = ['runType', 'isTypeFn', 'typeErrorsFn', 'isStrictTypeFn', 'mockTypeFn', 'toCodeFn'];
    if (node.callee.type !== utils_1.AST_NODE_TYPES.Identifier || !runTypeFunctions.includes(node.callee.name)) {
        return false;
    }
    const sourceCode = context.sourceCode;
    const program = sourceCode.ast;
    for (const statement of program.body) {
        if (statement.type === utils_1.AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            if (source === '@mionkit/run-types' ||
                source === '@mionkit/run-types/' ||
                (typeof source === 'string' && (source.endsWith('/runType') || source.endsWith('/runTypeFunctions')))) {
                for (const specifier of statement.specifiers) {
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                        runTypeFunctions.includes(specifier.imported.name)) {
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
            description: 'Disallow using `typeof` with run-type functions from @mionkit/run-types',
        },
        messages: {
            noTypeof: 'Do not use `typeof` with `{{functionName}}()`. Use explicit type definitions instead.',
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
                        const functionName = node.callee.name;
                        context.report({
                            node,
                            messageId: 'noTypeof',
                            data: {
                                functionName,
                            },
                        });
                    }
                }
            },
        };
    },
};
exports.default = rule;
//# sourceMappingURL=no-typeof-runtype.js.map