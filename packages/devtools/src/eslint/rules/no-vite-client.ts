/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';
import {PURE_FN_SOURCE_PACKAGES} from '../../pureFns/purityRules.ts';

type MessageIds = 'missingMapFromName' | 'nameNotStringLiteral';

/** Enforces non-Vite client constraints: serverMapFrom() must reference a server-registered pure fn by name */
const rule: TSESLint.RuleModule<MessageIds, []> = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Enforce non-Vite client constraints: serverMapFrom() requires the name (string literal) of a server-registered pure fn as its second argument, since inline mappers need the mion vite plugin.',
        },
        messages: {
            missingMapFromName:
                'serverMapFrom() requires the name of a server-registered pure fn (string literal) as the second argument in non-Vite environments — inline mappers need the mion vite plugin.',
            nameNotStringLiteral: '{{callee}}() name argument must be a string literal, not a variable or expression.',
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
                            specifier.imported.type === AST_NODE_TYPES.Identifier &&
                            specifier.imported.name === 'serverMapFrom'
                        ) {
                            pureFnNames.set(specifier.local.name, specifier.imported.name);
                        }
                    }
                }
            },

            CallExpression(node: TSESTree.CallExpression) {
                if (!pureFnNames || pureFnNames.size === 0) return;
                if (node.callee.type !== AST_NODE_TYPES.Identifier) return;
                if (pureFnNames.get(node.callee.name) !== 'serverMapFrom') return;

                // non-Vite contract: the 2nd arg is the NAME of a server-registered pure fn
                // (inline mappers travel via the vite build-time transport, unavailable here)
                const mapperOrName = node.arguments[1];
                if (
                    !mapperOrName ||
                    mapperOrName.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                    mapperOrName.type === AST_NODE_TYPES.FunctionExpression
                ) {
                    context.report({node, messageId: 'missingMapFromName'});
                } else if (
                    mapperOrName.type !== AST_NODE_TYPES.Literal ||
                    typeof (mapperOrName as TSESTree.Literal).value !== 'string'
                ) {
                    context.report({
                        node: mapperOrName,
                        messageId: 'nameNotStringLiteral',
                        data: {callee: 'serverMapFrom'},
                    });
                }
            },
        };
    },
};

export default rule;
