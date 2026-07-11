"use strict";
const utils = require("@typescript-eslint/utils");
const rule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description: "Enforce type-only imports from backend code paths to prevent bundling server code into the frontend."
    },
    messages: {
      enforceTypeImport: 'Import from "{{source}}" must use "import type" to avoid importing backend code into the frontend bundle.',
      enforceTypeExport: 'Re-export from "{{source}}" must use "export type" to avoid importing backend code into the frontend bundle.',
      sideEffectImport: 'Side-effect import from "{{source}}" imports backend code into the frontend bundle. Remove this import or use "import type".'
    },
    schema: [
      {
        type: "object",
        properties: {
          backendSources: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "Array of regex patterns matching import sources that should use type-only imports."
          }
        },
        required: ["backendSources"],
        additionalProperties: false
      }
    ]
  },
  defaultOptions: [{ backendSources: [] }],
  create(context) {
    const options = context.options[0];
    if (!options || !options.backendSources.length) return {};
    const patterns = options.backendSources.map((p) => new RegExp(p));
    function matchesBackend(source) {
      return patterns.some((p) => p.test(source));
    }
    function hasAllValueSpecifiers(specifiers) {
      return specifiers.every((s) => {
        if (s.type === utils.AST_NODE_TYPES.ImportSpecifier) return s.importKind !== "type";
        return true;
      });
    }
    function fixImport(fixer, node) {
      const sourceCode = context.sourceCode;
      if (hasAllValueSpecifiers(node.specifiers)) {
        const importToken = sourceCode.getFirstToken(node);
        return fixer.insertTextAfter(importToken, " type");
      }
      const fixes = [];
      for (const specifier of node.specifiers) {
        if (specifier.type === utils.AST_NODE_TYPES.ImportSpecifier && specifier.importKind !== "type") {
          fixes.push(fixer.insertTextBefore(specifier, "type "));
        }
      }
      return fixes;
    }
    function fixExport(fixer, node) {
      const sourceCode = context.sourceCode;
      const allValue = node.specifiers.every((s) => s.exportKind !== "type");
      if (allValue) {
        const exportToken = sourceCode.getFirstToken(node);
        return fixer.insertTextAfter(exportToken, " type");
      }
      const fixes = [];
      for (const specifier of node.specifiers) {
        if (specifier.exportKind !== "type") {
          fixes.push(fixer.insertTextBefore(specifier, "type "));
        }
      }
      return fixes;
    }
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (!matchesBackend(source)) return;
        if (node.importKind === "type") return;
        if (node.specifiers.length === 0) {
          context.report({
            node,
            messageId: "sideEffectImport",
            data: { source }
          });
          return;
        }
        const hasValueSpecifier = node.specifiers.some((s) => {
          if (s.type === utils.AST_NODE_TYPES.ImportSpecifier) return s.importKind !== "type";
          return true;
        });
        if (!hasValueSpecifier) return;
        context.report({
          node,
          messageId: "enforceTypeImport",
          data: { source },
          fix(fixer) {
            return fixImport(fixer, node);
          }
        });
      },
      ExportNamedDeclaration(node) {
        if (!node.source) return;
        const source = node.source.value;
        if (!matchesBackend(source)) return;
        if (node.exportKind === "type") return;
        const hasValueSpecifier = node.specifiers.some((s) => s.exportKind !== "type");
        if (!hasValueSpecifier) return;
        context.report({
          node,
          messageId: "enforceTypeExport",
          data: { source },
          fix(fixer) {
            return fixExport(fixer, node);
          }
        });
      }
    };
  }
};
module.exports = rule;
//# sourceMappingURL=enforce-type-imports.cjs.map
