let _typescript_eslint_utils = require("@typescript-eslint/utils");
//#region src/eslint/rules/no-unreachable-union-types.ts
/**
* Extracts property names from an object type (interface body, type literal)
*/
function getObjectTypeProperties(node) {
	if (node.type === _typescript_eslint_utils.AST_NODE_TYPES.TSTypeLiteral) {
		const props = [];
		for (const member of node.members) if (member.type === _typescript_eslint_utils.AST_NODE_TYPES.TSPropertySignature && member.key.type === _typescript_eslint_utils.AST_NODE_TYPES.Identifier) props.push({
			name: member.key.name,
			isOptional: !!member.optional
		});
		return props;
	}
	return null;
}
/**
* Checks if typeB (earlier in union) blocks typeA (later in union), making typeA unreachable.
*
* TypeB blocks TypeA when:
* - All properties of TypeB (required + optional) exist in TypeA
* - TypeA has at least as many required properties as TypeB
* - TypeA is more specific than TypeB (more properties OR same properties but more required)
*
* Examples:
* - {a: string} blocks {a: string; b: number} - TypeB has 'a' (req), TypeA has 'a' (req) + 'b' (req)
* - {a?: string} does NOT block {b: number; c: string} - TypeB has 'a', TypeA doesn't have 'a'
* - {a: string; b?: number} blocks {a: string; b: number} - same props, but TypeA has more required
*
* @param typeAProps - Properties of the later type (potentially unreachable)
* @param typeBProps - Properties of the earlier type (potentially blocking)
* @returns true if typeB blocks typeA
*/
function isSupersetOf(typeAProps, typeBProps) {
	const typeARequired = typeAProps.filter((p) => !p.isOptional);
	const typeBRequired = typeBProps.filter((p) => !p.isOptional);
	if (typeARequired.length < typeBRequired.length) return false;
	if (!(typeAProps.length > typeBProps.length || typeAProps.length === typeBProps.length && typeARequired.length > typeBRequired.length)) return false;
	for (const propB of typeBProps) if (!typeAProps.find((p) => p.name === propB.name)) return false;
	return true;
}
/**
* Checks if a union type has interfaces where one is a superset of another
* and the subset comes before the superset (making the superset unreachable)
*/
function findUnreachableTypes(unionNode) {
	const issues = [];
	const typesWithProps = [];
	for (const typeNode of unionNode.types) {
		const props = getObjectTypeProperties(typeNode);
		if (props && props.length > 0) typesWithProps.push({
			node: typeNode,
			props
		});
	}
	for (let i = 0; i < typesWithProps.length; i++) for (let j = i + 1; j < typesWithProps.length; j++) {
		const typeA = typesWithProps[i];
		const typeB = typesWithProps[j];
		if (isSupersetOf(typeB.props, typeA.props)) issues.push({
			unreachable: typeB.node,
			blocker: typeA.node
		});
	}
	return issues;
}
/**
* Gets a readable representation of an object type for error messages
*/
function getTypeDescription(node) {
	if (node.type === _typescript_eslint_utils.AST_NODE_TYPES.TSTypeLiteral) {
		const props = getObjectTypeProperties(node);
		if (props) return `{${props.map((p) => p.isOptional ? `${p.name}?` : p.name).join(", ")}}`;
	}
	return "object type";
}
/**
* Gets the router function name if the function is a handler for route/middleFn/headersFn
*/
function getRouterFunctionName(func, context) {
	const parent = func.parent;
	if (parent?.type === _typescript_eslint_utils.AST_NODE_TYPES.CallExpression) {
		if (parent.callee.type === _typescript_eslint_utils.AST_NODE_TYPES.Identifier) {
			const functionName = parent.callee.name;
			if ([
				"route",
				"middleFn",
				"headersFn"
			].includes(functionName) && isImportedFromMionRouter(functionName, context)) return functionName;
		}
	}
	return null;
}
/**
* Checks if the union type or type reference is in a parameter that should be checked
*/
function isInCheckableParameter(node, func, routerFunctionName) {
	let current = node.parent;
	while (current && current !== func) {
		if (current.type === _typescript_eslint_utils.AST_NODE_TYPES.Identifier || current.type === _typescript_eslint_utils.AST_NODE_TYPES.ArrayPattern || current.type === _typescript_eslint_utils.AST_NODE_TYPES.ObjectPattern) {
			const paramIndex = func.params.indexOf(current);
			if (paramIndex !== -1) {
				if ((routerFunctionName === "route" || routerFunctionName === "middleFn") && paramIndex >= 1) return true;
				if (routerFunctionName === "headersFn" && paramIndex >= 2) return true;
				return false;
			}
		}
		current = current.parent;
	}
	return false;
}
/**
* Checks if the union type or type reference is a return type or parameter type of route/middleFn/headersFn
*/
function isRouterUnionType(node, context) {
	let current = node.parent;
	while (current) {
		if (current.type === _typescript_eslint_utils.AST_NODE_TYPES.ArrowFunctionExpression || current.type === _typescript_eslint_utils.AST_NODE_TYPES.FunctionExpression || current.type === _typescript_eslint_utils.AST_NODE_TYPES.FunctionDeclaration) {
			const routerFunctionName = getRouterFunctionName(current, context);
			if (routerFunctionName) {
				if (current.returnType?.typeAnnotation === node || isDescendantOf(node, current.returnType?.typeAnnotation)) return true;
				if (isInCheckableParameter(node, current, routerFunctionName)) return true;
			}
		}
		if (current.type === _typescript_eslint_utils.AST_NODE_TYPES.TSTypeAnnotation) {
			const typeAnnotationParent = current.parent;
			if (typeAnnotationParent?.type === _typescript_eslint_utils.AST_NODE_TYPES.Identifier) {
				if (typeAnnotationParent.parent?.type === _typescript_eslint_utils.AST_NODE_TYPES.VariableDeclarator) {
					if (current.typeAnnotation.type === _typescript_eslint_utils.AST_NODE_TYPES.TSTypeReference) {
						const typeName = current.typeAnnotation.typeName;
						if (typeName.type === _typescript_eslint_utils.AST_NODE_TYPES.Identifier) {
							if ((typeName.name === "Handler" || typeName.name === "HeaderHandler") && isImportedFromMionRouter(typeName.name, context)) return true;
						}
					}
				}
			}
		}
		current = current.parent;
	}
	return false;
}
/**
* Checks if a node is a descendant of another node
*/
function isDescendantOf(node, ancestor) {
	if (!node || !ancestor) return false;
	let current = node;
	while (current) {
		if (current === ancestor) return true;
		current = current.parent;
	}
	return false;
}
/**
* Checks if a name is imported from @mionjs/router
*/
function isImportedFromMionRouter(name, context) {
	const program = context.sourceCode.ast;
	for (const statement of program.body) if (statement.type === _typescript_eslint_utils.AST_NODE_TYPES.ImportDeclaration) {
		const source = statement.source.value;
		if (source === "@mionjs/router" || source === "@mionjs/router/") {
			for (const specifier of statement.specifiers) if (specifier.type === _typescript_eslint_utils.AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === _typescript_eslint_utils.AST_NODE_TYPES.Identifier && specifier.imported.name === name) return true;
		}
	}
	return false;
}
/**
* Resolves a type reference to its actual union type definition
*/
function resolveTypeReference(node, context) {
	if (node.type !== _typescript_eslint_utils.AST_NODE_TYPES.TSTypeReference) return null;
	if (node.typeName.type !== _typescript_eslint_utils.AST_NODE_TYPES.Identifier) return null;
	const typeName = node.typeName.name;
	const program = context.sourceCode.ast;
	for (const statement of program.body) if (statement.type === _typescript_eslint_utils.AST_NODE_TYPES.TSTypeAliasDeclaration) {
		if (statement.id.name === typeName && statement.typeAnnotation.type === _typescript_eslint_utils.AST_NODE_TYPES.TSUnionType) return statement.typeAnnotation;
	}
	return null;
}
var rule = {
	meta: {
		type: "problem",
		docs: { description: "Detect union types where one interface is unreachable at runtime when using isType function because a subset type comes before it" },
		messages: { unreachableUnionType: "Union type {{unreachableType}} is unreachable at runtime when doing type checking because {{blockerType}} will always match first. To fix this move the more specific type {{unreachableType}} first within the union, ie: {{unreachableType}} | {{blockerType}} " },
		schema: []
	},
	defaultOptions: [],
	create(context) {
		return {
			TSUnionType(node) {
				if (!isRouterUnionType(node, context)) return;
				const issues = findUnreachableTypes(node);
				for (const issue of issues) context.report({
					node,
					messageId: "unreachableUnionType",
					data: {
						unreachableType: getTypeDescription(issue.unreachable),
						blockerType: getTypeDescription(issue.blocker)
					}
				});
			},
			TSTypeReference(node) {
				const unionType = resolveTypeReference(node, context);
				if (!unionType) return;
				if (!isRouterUnionType(node, context)) return;
				const issues = findUnreachableTypes(unionType);
				for (const issue of issues) context.report({
					node,
					messageId: "unreachableUnionType",
					data: {
						unreachableType: getTypeDescription(issue.unreachable),
						blockerType: getTypeDescription(issue.blocker)
					}
				});
			}
		};
	}
};
//#endregion
module.exports = rule;

//# sourceMappingURL=no-unreachable-union-types.cjs.map