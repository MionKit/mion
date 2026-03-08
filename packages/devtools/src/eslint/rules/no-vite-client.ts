/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';
import {PURE_FN_SOURCE_PACKAGES} from '../../pureFns/purityRules.ts';

type MessageIds = 'missingPureFnName' | 'missingMapFromName' | 'nameNotStringLiteral' | 'registerPureFnFactoryNotAllowed';

/** Enforces non-Vite client constraints: requires names for pureServerFn/mapFrom and disallows registerPureFnFactory */
const rule: TSESLint.RuleModule<MessageIds, []> = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Enforce non-Vite client constraints: require name/bodyHash string literal for pureServerFn() and mapFrom(), and disallow registerPureFnFactory() which requires Vite transforms.',
        },
        messages: {
            missingPureFnName:
                'pureServerFn() requires a name as the second argument (string literal) for non-Vite environments.',
            missingMapFromName: 'mapFrom() requires a name as the third argument (string literal) for non-Vite environments.',
            nameNotStringLiteral: '{{callee}}() name argument must be a string literal, not a variable or expression.',
            registerPureFnFactoryNotAllowed:
                'registerPureFnFactory() is not supported in non-Vite environments. It requires Vite build-time transforms.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        let pureFnNames: Map<string, string> | null = null;

        return {
            Program(node: TSESTree.Program) {
                pureFnNames = new Map();
                for (const statement of node.body) {
                    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;
                    const source = statement.source.value;
                    if (!PURE_FN_SOURCE_PACKAGES.includes(source as (typeof PURE_FN_SOURCE_PACKAGES)[number])) continue;

                    for (const specifier of statement.specifiers) {
                        if (
                            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                            specifier.imported.type === AST_NODE_TYPES.Identifier
                        ) {
                            const importedName = specifier.imported.name;
                            if (
                                importedName === 'pureServerFn' ||
                                importedName === 'mapFrom' ||
                                importedName === 'registerPureFnFactory'
                            ) {
                                pureFnNames.set(specifier.local.name, importedName);
                            }
                        }
                    }
                }
            },

            CallExpression(node: TSESTree.CallExpression) {
                if (!pureFnNames || pureFnNames.size === 0) return;
                if (node.callee.type !== AST_NODE_TYPES.Identifier) return;
                const importedName = pureFnNames.get(node.callee.name);
                if (!importedName) return;

                if (importedName === 'pureServerFn') {
                    if (node.arguments.length < 2) {
                        context.report({node, messageId: 'missingPureFnName'});
                    } else if (
                        node.arguments[1].type !== AST_NODE_TYPES.Literal ||
                        typeof (node.arguments[1] as TSESTree.Literal).value !== 'string'
                    ) {
                        context.report({
                            node: node.arguments[1],
                            messageId: 'nameNotStringLiteral',
                            data: {callee: 'pureServerFn'},
                        });
                    }
                } else if (importedName === 'mapFrom') {
                    if (node.arguments.length < 3) {
                        context.report({node, messageId: 'missingMapFromName'});
                    } else if (
                        node.arguments[2].type !== AST_NODE_TYPES.Literal ||
                        typeof (node.arguments[2] as TSESTree.Literal).value !== 'string'
                    ) {
                        context.report({
                            node: node.arguments[2],
                            messageId: 'nameNotStringLiteral',
                            data: {callee: 'mapFrom'},
                        });
                    }
                } else if (importedName === 'registerPureFnFactory') {
                    context.report({node, messageId: 'registerPureFnFactoryNotAllowed'});
                }
            },
        };
    },
};

export default rule;
