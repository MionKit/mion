/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';

export interface Options {
    backendSources: string[];
}

type MessageIds = 'enforceTypeImport' | 'enforceTypeExport' | 'sideEffectImport';

/** Enforce type-only imports from backend code to prevent bundling server code into the frontend. */
const rule: TSESLint.RuleModule<MessageIds, [Options]> = {
    meta: {
        type: 'suggestion',
        fixable: 'code',
        docs: {
            description: 'Enforce type-only imports from backend code paths to prevent bundling server code into the frontend.',
        },
        messages: {
            enforceTypeImport:
                'Import from "{{source}}" must use "import type" to avoid importing backend code into the frontend bundle.',
            enforceTypeExport:
                'Re-export from "{{source}}" must use "export type" to avoid importing backend code into the frontend bundle.',
            sideEffectImport:
                'Side-effect import from "{{source}}" imports backend code into the frontend bundle. Remove this import or use "import type".',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    backendSources: {
                        type: 'array',
                        items: {type: 'string'},
                        minItems: 1,
                        description: 'Array of regex patterns matching import sources that should use type-only imports.',
                    },
                },
                required: ['backendSources'],
                additionalProperties: false,
            },
        ],
    },
    defaultOptions: [{backendSources: []}],
    create(context) {
        const options = context.options[0];
        if (!options || !options.backendSources.length) return {};

        const patterns = options.backendSources.map((p) => new RegExp(p));

        function matchesBackend(source: string): boolean {
            return patterns.some((p) => p.test(source));
        }

        function hasAllValueSpecifiers(specifiers: TSESTree.ImportClause[]): boolean {
            return specifiers.every((s) => {
                if (s.type === AST_NODE_TYPES.ImportSpecifier) return s.importKind !== 'type';
                return true; // default and namespace imports are always value
            });
        }

        function fixImport(fixer: TSESLint.RuleFixer, node: TSESTree.ImportDeclaration): TSESLint.RuleFix | TSESLint.RuleFix[] {
            const sourceCode = context.sourceCode;
            if (hasAllValueSpecifiers(node.specifiers)) {
                // convert entire declaration: insert 'type ' after 'import'
                const importToken = sourceCode.getFirstToken(node)!;
                return fixer.insertTextAfter(importToken, ' type');
            }
            // mixed: add 'type' to each value specifier
            const fixes: TSESLint.RuleFix[] = [];
            for (const specifier of node.specifiers) {
                if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind !== 'type') {
                    fixes.push(fixer.insertTextBefore(specifier, 'type '));
                }
            }
            return fixes;
        }

        function fixExport(
            fixer: TSESLint.RuleFixer,
            node: TSESTree.ExportNamedDeclaration
        ): TSESLint.RuleFix | TSESLint.RuleFix[] {
            const sourceCode = context.sourceCode;
            const allValue = node.specifiers.every((s) => s.exportKind !== 'type');
            if (allValue) {
                const exportToken = sourceCode.getFirstToken(node)!;
                return fixer.insertTextAfter(exportToken, ' type');
            }
            const fixes: TSESLint.RuleFix[] = [];
            for (const specifier of node.specifiers) {
                if (specifier.exportKind !== 'type') {
                    fixes.push(fixer.insertTextBefore(specifier, 'type '));
                }
            }
            return fixes;
        }

        return {
            ImportDeclaration(node: TSESTree.ImportDeclaration) {
                const source = node.source.value;
                if (!matchesBackend(source)) return;
                if (node.importKind === 'type') return;

                // side-effect import (no specifiers)
                if (node.specifiers.length === 0) {
                    context.report({
                        node,
                        messageId: 'sideEffectImport',
                        data: {source},
                    });
                    return;
                }

                // check if all specifiers are already type-only
                const hasValueSpecifier = node.specifiers.some((s) => {
                    if (s.type === AST_NODE_TYPES.ImportSpecifier) return s.importKind !== 'type';
                    return true;
                });
                if (!hasValueSpecifier) return;

                context.report({
                    node,
                    messageId: 'enforceTypeImport',
                    data: {source},
                    fix(fixer) {
                        return fixImport(fixer, node);
                    },
                });
            },

            ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
                if (!node.source) return;
                const source = node.source.value;
                if (!matchesBackend(source)) return;
                if (node.exportKind === 'type') return;

                const hasValueSpecifier = node.specifiers.some((s) => s.exportKind !== 'type');
                if (!hasValueSpecifier) return;

                context.report({
                    node,
                    messageId: 'enforceTypeExport',
                    data: {source},
                    fix(fixer) {
                        return fixExport(fixer, node);
                    },
                });
            },
        };
    },
};

export default rule;
