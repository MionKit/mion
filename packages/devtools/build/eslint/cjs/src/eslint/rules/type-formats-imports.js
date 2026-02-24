"use strict";
const utils = require("@typescript-eslint/utils");
const src_eslint_rules_formatTypeNames = require("./formatTypeNames.js");
function getFormatTypePackage(source) {
  for (const [pkg] of src_eslint_rules_formatTypeNames.FORMAT_TYPES_BY_PACKAGE) {
    if (source === pkg || source.startsWith(pkg + "/")) return pkg;
  }
  return null;
}
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow type-only imports for TypeFormat types. Type-only imports strip type metadata needed by Deepkit for runtime type reflection, causing silent validation/serialization failures."
    },
    messages: {
      typeFormatsImports: 'Type "{{typeName}}" is imported as type-only from "{{source}}". Remove the "type" keyword from the import to preserve runtime type metadata for Deepkit reflection.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        const matchedPkg = getFormatTypePackage(source);
        if (!matchedPkg) return;
        const formatTypes = src_eslint_rules_formatTypeNames.FORMAT_TYPES_BY_PACKAGE.get(matchedPkg);
        if (!formatTypes) return;
        const isTypeOnlyImport = node.importKind === "type";
        for (const specifier of node.specifiers) {
          if (specifier.type !== utils.AST_NODE_TYPES.ImportSpecifier) continue;
          const importedName = specifier.imported.type === utils.AST_NODE_TYPES.Identifier ? specifier.imported.name : specifier.imported.value;
          if (!formatTypes.has(importedName)) continue;
          const isTypeOnlySpecifier = specifier.importKind === "type";
          if (isTypeOnlyImport || isTypeOnlySpecifier) {
            context.report({
              node: specifier,
              messageId: "typeFormatsImports",
              data: {
                typeName: importedName,
                source
              }
            });
          }
        }
      }
    };
  }
};
module.exports = rule;
//# sourceMappingURL=type-formats-imports.js.map
