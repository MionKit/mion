import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { PURE_FN_SOURCE_PACKAGES } from "../../pureFns/purityRules.js";
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce non-Vite client constraints: serverMapFrom() requires the name (string literal) of a server-registered pure fn as its second argument, since inline mappers need the mion vite plugin."
    },
    messages: {
      missingMapFromName: "serverMapFrom() requires the name of a server-registered pure fn (string literal) as the second argument in non-Vite environments — inline mappers need the mion vite plugin.",
      nameNotStringLiteral: "{{callee}}() name argument must be a string literal, not a variable or expression."
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
          if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;
          const source = statement.source.value;
          if (!PURE_FN_SOURCE_PACKAGES.includes(source)) continue;
          for (const specifier of statement.specifiers) {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === AST_NODE_TYPES.Identifier && specifier.imported.name === "serverMapFrom") {
              pureFnNames.set(specifier.local.name, specifier.imported.name);
            }
          }
        }
      },
      CallExpression(node) {
        if (!pureFnNames || pureFnNames.size === 0) return;
        if (node.callee.type !== AST_NODE_TYPES.Identifier) return;
        if (pureFnNames.get(node.callee.name) !== "serverMapFrom") return;
        const mapperOrName = node.arguments[1];
        if (!mapperOrName || mapperOrName.type === AST_NODE_TYPES.ArrowFunctionExpression || mapperOrName.type === AST_NODE_TYPES.FunctionExpression) {
          context.report({ node, messageId: "missingMapFromName" });
        } else if (mapperOrName.type !== AST_NODE_TYPES.Literal || typeof mapperOrName.value !== "string") {
          context.report({
            node: mapperOrName,
            messageId: "nameNotStringLiteral",
            data: { callee: "serverMapFrom" }
          });
        }
      }
    };
  }
};
export {
  rule as default
};
//# sourceMappingURL=no-vite-client.js.map
