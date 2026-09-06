/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TSESTree, TSESLint, AST_NODE_TYPES} from '@typescript-eslint/utils';
import {getRouterHelperOfHandler, RouterHelperName} from '../routerHelperCall.ts';

// mion handlers answer with errors, they never throw them. The two return forms stay in the
// handler's signature, so the client handles them at the call site, strongly typed:
//
//   return new RpcError(...)     typed slot, the rest of the chain keeps running
//   return new FatalError(...)   typed slot, the request stops here
//   throw anything               untyped, lands in @thrownErrors, the request stops
//
// A throw is the escape hatch for what nobody declared, not the pattern. The router never
// inspects what was thrown (`onExecutableError` stamps anything fatal and drops it in the
// undeclared slot), so this rule reports the `throw` itself and never classifies the thrown
// value: a class extending Error through any number of parents, a bare string and a rethrown
// `unknown` are all the same mistake. That is what keeps the rule syntactic, which is what
// OXlint's plugin host requires (the `@mionjs/*` rules get no type information).

type HandlerFunction = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

const FUNCTION_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
]);

function isFunctionNode(node: TSESTree.Node): node is HandlerFunction {
  return FUNCTION_TYPES.has(node.type);
}

/** True when `node` is the `try` block of a try/catch, so a throw inside it never leaves the handler. */
function isCaughtTryBlock(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return parent.type === AST_NODE_TYPES.TryStatement && parent.block === node && parent.handler !== null;
}

/**
 * The helper whose handler this `throw` sits in, or null when it escapes no handler.
 * Walks outward so a throw nested in a callback still resolves to the handler that contains it;
 * stops at a try/catch that swallows it, since that throw never reaches the router.
 */
function findEscapedHandler(throwStatement: TSESTree.ThrowStatement, program: TSESTree.Program): RouterHelperName | null {
  let node: TSESTree.Node = throwStatement;
  let parent: TSESTree.Node | undefined = node.parent;
  while (parent) {
    if (isCaughtTryBlock(node, parent)) return null;
    if (isFunctionNode(parent)) {
      const helper = getRouterHelperOfHandler(parent, program);
      if (helper) return helper;
    }
    node = parent;
    parent = node.parent;
  }
  return null;
}

type MessageIds = 'noThrow';

const rule: TSESLint.RuleModule<MessageIds, []> = {
  meta: {
    type: 'problem',
    docs: {description: 'Enforce that mion route and middleFn handlers return errors instead of throwing them'},
    messages: {
      noThrow:
        'mion {{helper}}() handlers must return errors, not throw them. Return a FatalError to stop the request, ' +
        'or an RpcError to let the chain continue. A thrown error leaves the handler signature, so the client ' +
        'only receives its public message, untyped.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      ThrowStatement(node: TSESTree.ThrowStatement) {
        const helper = findEscapedHandler(node, context.sourceCode.ast);
        if (helper) context.report({node, messageId: 'noThrow', data: {helper}});
      },
    };
  },
};

export default rule;
