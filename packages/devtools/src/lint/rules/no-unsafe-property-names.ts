/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';

// The three property names that are never data: writing `__proto__` on a plain object swaps its
// prototype, and a missing `constructor` or `prototype` is found on the prototype chain. Every
// decoder refuses them on the wire and the build fails (UPN001) when a compiled type declares one,
// but that only fires for a type a marker reaches; this rule catches the declaration itself, in any
// interface, type literal or class, before it gets that far. The same list lives in
// `reflection.UnsafePropertyNames` (Go) and `UNSAFE_PROPERTY_NAMES` (@mionjs/core).
const UNSAFE_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

type Key = TSESTree.PropertyName | TSESTree.Expression | TSESTree.PrivateIdentifier;

/** The declared name when the key is a plain identifier or a string literal, else undefined. */
function keyName(key: Key, computed: boolean): string | undefined {
  if (key.type === AST_NODE_TYPES.Identifier && !computed) return key.name;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') return key.value;
  return undefined;
}

type MessageIds = 'unsafePropertyName';

const rule: TSESLint.RuleModule<MessageIds, []> = {
  meta: {
    type: 'problem',
    docs: {description: 'Disallow properties named __proto__, prototype or constructor in types, interfaces and classes'},
    messages: {
      unsafePropertyName:
        "Property '{{name}}' is named after a prototype slot and can never be data: every decoder refuses it on the wire " +
        'and the build fails for any type that declares it. Rename the property.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const check = (node: TSESTree.Node, key: Key, computed: boolean): void => {
      const name = keyName(key, computed);
      if (name !== undefined && UNSAFE_NAMES.has(name)) context.report({node, messageId: 'unsafePropertyName', data: {name}});
    };
    return {
      TSPropertySignature(node: TSESTree.TSPropertySignature) {
        check(node, node.key, node.computed);
      },
      TSMethodSignature(node: TSESTree.TSMethodSignature) {
        check(node, node.key, node.computed);
      },
      PropertyDefinition(node: TSESTree.PropertyDefinition) {
        check(node, node.key, node.computed);
      },
      TSAbstractPropertyDefinition(node: TSESTree.TSAbstractPropertyDefinition) {
        check(node, node.key, node.computed);
      },
      MethodDefinition(node: TSESTree.MethodDefinition) {
        // a class constructor is a method, not a property, and the one legitimate use of the name
        if (node.kind === 'constructor') return;
        check(node, node.key, node.computed);
      },
    };
  },
};

export default rule;
