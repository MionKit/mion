"use strict";
const utils = require("@typescript-eslint/utils");
const purityRules = require("../../pureFns/purityRules.cjs");
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce non-Vite client constraints: require name/bodyHash string literal for pureServerFn() and serverMapFrom(), and disallow registerPureFnFactory() which requires Vite transforms."
    },
    messages: {
      missingPureFnName: "pureServerFn() requires a name as the second argument (string literal) for non-Vite environments.",
      missingMapFromName: "serverMapFrom() requires a name as the third argument (string literal) for non-Vite environments.",
      nameNotStringLiteral: "{{callee}}() name argument must be a string literal, not a variable or expression.",
      registerPureFnFactoryNotAllowed: "registerPureFnFactory() is not supported in non-Vite environments. It requires Vite build-time transforms."
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    let pureFnNames = null;
    return {
      Program(node) {
        pureFnNames = /* @__PURE__ */ new Map();
        for (const statement of node.body) {
          if (statement.type !== utils.AST_NODE_TYPES.ImportDeclaration) continue;
          const source = statement.source.value;
          if (!purityRules.PURE_FN_SOURCE_PACKAGES.includes(source)) continue;
          for (const specifier of statement.specifiers) {
            if (specifier.type === utils.AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === utils.AST_NODE_TYPES.Identifier) {
              const importedName = specifier.imported.name;
              if (importedName === "pureServerFn" || importedName === "serverMapFrom" || importedName === "registerPureFnFactory") {
                pureFnNames.set(specifier.local.name, importedName);
              }
            }
          }
        }
      },
      CallExpression(node) {
        if (!pureFnNames || pureFnNames.size === 0) return;
        if (node.callee.type !== utils.AST_NODE_TYPES.Identifier) return;
        const importedName = pureFnNames.get(node.callee.name);
        if (!importedName) return;
        if (importedName === "pureServerFn") {
          if (node.arguments.length < 2) {
            context.report({ node, messageId: "missingPureFnName" });
          } else if (node.arguments[1].type !== utils.AST_NODE_TYPES.Literal || typeof node.arguments[1].value !== "string") {
            context.report({
              node: node.arguments[1],
              messageId: "nameNotStringLiteral",
              data: { callee: "pureServerFn" }
            });
          }
        } else if (importedName === "serverMapFrom") {
          if (node.arguments.length < 3) {
            context.report({ node, messageId: "missingMapFromName" });
          } else if (node.arguments[2].type !== utils.AST_NODE_TYPES.Literal || typeof node.arguments[2].value !== "string") {
            context.report({
              node: node.arguments[2],
              messageId: "nameNotStringLiteral",
              data: { callee: "serverMapFrom" }
            });
          }
        } else if (importedName === "registerPureFnFactory") {
          context.report({ node, messageId: "registerPureFnFactoryNotAllowed" });
        }
      }
    };
  }
};
module.exports = rule;
//# sourceMappingURL=no-vite-client.cjs.map
