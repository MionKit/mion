function __assignType(fn, args) {
    fn.__type = args;
    return fn;
}
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
function containsTypeof(typeNode) {
    if (!typeNode)
        return false;
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
containsTypeof.__type = ['typeNode', 'containsTypeof', 'PP!,J2!)/"'];
function isRunTypeFromMionKit(node, context) {
    if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'runType') {
        return false;
    }
    const sourceCode = context.getSourceCode();
    const program = sourceCode.ast;
    for (const statement of program.body) {
        if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
            const source = statement.source.value;
            if (source === '@mionkit/run-types' ||
                source === '@mionkit/run-types/' ||
                (typeof source === 'string' && source.endsWith('/runType'))) {
                for (const specifier of statement.specifiers) {
                    if (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'runType') {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
isRunTypeFromMionKit.__type = ['node', 'context', 'isRunTypeFromMionKit', 'P!2!!2")/#'];
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
            CallExpression: __assignType(function CallExpression(node) {
                if (isRunTypeFromMionKit(node, context)) {
                    const typeArguments = node.typeArguments || node.typeParameters;
                    if (typeArguments?.params.some(containsTypeof)) {
                        context.report({
                            node,
                            messageId: 'noTypeof',
                        });
                    }
                }
            }, ['node', 'CallExpression', 'P!2!"/"']),
        };
    },
};
export default rule;
//# sourceMappingURL=no-typeof-runtype.js.map