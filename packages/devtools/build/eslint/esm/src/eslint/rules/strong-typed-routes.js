import { AST_NODE_TYPES } from "@typescript-eslint/utils";
//#region src/eslint/rules/strong-typed-routes.ts
var ROUTER_FUNCTIONS = [
	"route",
	"middleFn",
	"headersFn"
];
var HANDLER_TYPES = ["Handler", "HeaderHandler"];
/**
* Builds a cache of all imports from @mionjs/router
* This is called once per file in the Program visitor
*/
function buildImportCache(program) {
	const routerFunctions = /* @__PURE__ */ new Set();
	const handlerTypes = /* @__PURE__ */ new Set();
	for (const statement of program.body) if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
		const source = statement.source.value;
		if (source === "@mionjs/router" || source === "@mionjs/router/") {
			for (const specifier of statement.specifiers) if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.imported.type === AST_NODE_TYPES.Identifier) {
				const name = specifier.imported.name;
				if (ROUTER_FUNCTIONS.includes(name)) routerFunctions.add(name);
				if (HANDLER_TYPES.includes(name)) handlerTypes.add(name);
			}
		}
	}
	return {
		routerFunctions,
		handlerTypes
	};
}
/**
* Checks if a call expression is calling router functions from @mionjs/router
* Uses the cached import information for performance
*/
function getRouterFunctionName(node, importCache) {
	if (node.callee.type !== AST_NODE_TYPES.Identifier) return null;
	const functionName = node.callee.name;
	if (importCache.routerFunctions.has(functionName)) return functionName;
	return null;
}
/**
* Builds a cache of all top-level function declarations and function variable assignments
* This is called once per file in the Program visitor
*/
function buildFunctionCache(program) {
	const cache = /* @__PURE__ */ new Map();
	for (const statement of program.body) {
		if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id?.name) cache.set(statement.id.name, statement);
		if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
			for (const declarator of statement.declarations) if (declarator.id.type === AST_NODE_TYPES.Identifier) {
				if (declarator.init?.type === AST_NODE_TYPES.ArrowFunctionExpression || declarator.init?.type === AST_NODE_TYPES.FunctionExpression) cache.set(declarator.id.name, declarator.init);
			}
		}
	}
	return cache;
}
/**
* Gets the handler function from a router function call
* Uses the cached function information for performance
*/
function getHandlerFunction(node, functionCache) {
	const handlerIndex = 0;
	if (node.arguments.length <= handlerIndex) return null;
	const handlerArg = node.arguments[handlerIndex];
	if (handlerArg.type === AST_NODE_TYPES.ArrowFunctionExpression || handlerArg.type === AST_NODE_TYPES.FunctionExpression) return handlerArg;
	if (handlerArg.type === AST_NODE_TYPES.Identifier) return functionCache.get(handlerArg.name) ?? null;
	return null;
}
/**
* Checks if a function has an explicit return type annotation
* @param func The function node
* @returns True if it has explicit return type, false otherwise
*/
function hasExplicitReturnType(func) {
	return func.returnType !== void 0;
}
/**
* Checks if a node represents a primitive literal value
* @param node The node to check
* @returns True if the node is a primitive literal (boolean, string, number, null, undefined, bigint)
*/
function isPrimitiveLiteral(node) {
	if (node.type === AST_NODE_TYPES.Literal) {
		const value = node.value;
		if ("bigint" in node) return true;
		return typeof value === "boolean" || typeof value === "string" || typeof value === "number" || value === null;
	}
	if (node.type === AST_NODE_TYPES.Identifier && node.name === "undefined") return true;
	if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === "-" && node.argument.type === AST_NODE_TYPES.Literal) return typeof node.argument.value === "number";
	return false;
}
/**
* Checks if all parameters (except the first) have explicit type annotations
* @param func The function node
* @returns Object with validation results including the actual parameter nodes
*/
function validateParameterTypes(func) {
	const missingTypeParams = [];
	const missingParamNodes = [];
	for (let i = 1; i < func.params.length; i++) {
		const param = func.params[i];
		if (param.type === AST_NODE_TYPES.Identifier) {
			if (!param.typeAnnotation) {
				missingTypeParams.push(param.name);
				missingParamNodes.push(param);
			}
		} else if (param.type === AST_NODE_TYPES.RestElement) {
			if (param.argument.type === AST_NODE_TYPES.Identifier && !param.typeAnnotation) {
				missingTypeParams.push(`...${param.argument.name}`);
				missingParamNodes.push(param);
			}
		} else if (param.type === AST_NODE_TYPES.ArrayPattern || param.type === AST_NODE_TYPES.ObjectPattern) {
			if (!param.typeAnnotation) {
				missingTypeParams.push(`parameter ${i + 1}`);
				missingParamNodes.push(param);
			}
		} else if (param.type === AST_NODE_TYPES.AssignmentPattern) {
			const hasTypeAnnotationOnPattern = param.typeAnnotation !== void 0;
			const hasTypeAnnotationOnLeft = param.left.type === AST_NODE_TYPES.Identifier && param.left.typeAnnotation !== void 0;
			const hasTypeAnnotation = hasTypeAnnotationOnPattern || hasTypeAnnotationOnLeft;
			const hasPrimitiveDefault = isPrimitiveLiteral(param.right);
			if (!hasTypeAnnotation && !hasPrimitiveDefault) {
				const paramName = param.left.type === AST_NODE_TYPES.Identifier ? param.left.name : `parameter ${i + 1}`;
				missingTypeParams.push(paramName);
				missingParamNodes.push(param);
			}
		} else if (!("typeAnnotation" in param) || !param.typeAnnotation) {
			missingTypeParams.push(`parameter ${i + 1}`);
			missingParamNodes.push(param);
		}
	}
	return {
		valid: missingTypeParams.length === 0,
		missingTypeParams,
		missingParamNodes
	};
}
/**
* Extracts a readable parameter name from a parameter node
*/
function getParameterName(param) {
	if (param.type === AST_NODE_TYPES.Identifier) return param.name;
	else if (param.type === AST_NODE_TYPES.RestElement && param.argument.type === AST_NODE_TYPES.Identifier) return `...${param.argument.name}`;
	else if (param.type === AST_NODE_TYPES.ArrayPattern) return "[...]";
	else if (param.type === AST_NODE_TYPES.ObjectPattern) return "{...}";
	else if (param.type === AST_NODE_TYPES.AssignmentPattern) {
		if (param.left.type === AST_NODE_TYPES.Identifier) return param.left.name;
		return "param";
	}
	return "param";
}
/**
* Gets the node to report for missing return type
* For arrow functions, this is the arrow token area; for regular functions, the function keyword
*/
function getReturnTypeReportNode(func) {
	if ((func.type === AST_NODE_TYPES.FunctionDeclaration || func.type === AST_NODE_TYPES.FunctionExpression) && func.id) return func.id;
	return func;
}
/**
* Checks if a type annotation references Handler or HeaderHandler from @mionjs/router
* Uses the cached import information for performance
*/
function getHandlerTypeFromAnnotation(typeAnnotation, importCache) {
	if (typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
		const typeName = typeAnnotation.typeAnnotation.typeName;
		if (typeName.type === AST_NODE_TYPES.Identifier) {
			const name = typeName.name;
			if ((name === "Handler" || name === "HeaderHandler") && importCache.handlerTypes.has(name)) return name;
		}
	}
	return null;
}
/**
* Checks if a satisfies expression references Handler or HeaderHandler from @mionjs/router
* Uses the cached import information for performance
*/
function getHandlerTypeFromSatisfies(satisfiesExpression, importCache) {
	if (satisfiesExpression.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
		const typeName = satisfiesExpression.typeAnnotation.typeName;
		if (typeName.type === AST_NODE_TYPES.Identifier) {
			const name = typeName.name;
			if ((name === "Handler" || name === "HeaderHandler") && importCache.handlerTypes.has(name)) return name;
		}
	}
	return null;
}
/**
* Checks if a function has JSDoc tags indicating it should be type-checked
* @param node The node to check for JSDoc comments
* @param context The ESLint context
* @returns The handler type if JSDoc tag is found, null otherwise
*/
function getHandlerTypeFromJSDoc(node, context) {
	const comments = context.sourceCode.getCommentsBefore(node);
	for (const comment of comments) if (comment.type === "Block") {
		const commentText = comment.value;
		if (commentText.includes("@mion:route")) return "Handler";
		if (commentText.includes("@mion:middleFn")) return "MiddleFnHandler";
		if (commentText.includes("@mion:headersFn")) return "HeaderHandler";
	}
	return null;
}
var rule = {
	meta: {
		type: "problem",
		docs: { description: "Enforce explicit parameters and return type annotations for router handler functions" },
		messages: {
			missingReturnType: "mion {{handlerType}}() handler must define a return type.",
			missingParamTypes: "mion parameter \"{{paramName}}\" must have an explicit type definition.",
			missingReturnTypeRouter: "mion {{routerFunction}}() handler must define a return type.",
			missingParamTypesRouter: "mion parameter \"{{paramName}}\" must have an explicit type definition."
		},
		schema: []
	},
	defaultOptions: [],
	create(context) {
		let importCache = null;
		let functionCache = null;
		return {
			Program(node) {
				importCache = buildImportCache(node);
				functionCache = buildFunctionCache(node);
			},
			CallExpression(node) {
				if (!importCache || !functionCache) return;
				const functionName = getRouterFunctionName(node, importCache);
				if (!functionName) return;
				const handlerFunc = getHandlerFunction(node, functionCache);
				if (!handlerFunc) return;
				const hasReturnType = hasExplicitReturnType(handlerFunc);
				const paramValidation = validateParameterTypes(handlerFunc);
				if (!hasReturnType) context.report({
					node: getReturnTypeReportNode(handlerFunc),
					messageId: "missingReturnTypeRouter",
					data: { routerFunction: functionName }
				});
				for (const paramNode of paramValidation.missingParamNodes) context.report({
					node: paramNode,
					messageId: "missingParamTypesRouter",
					data: { paramName: getParameterName(paramNode) }
				});
			},
			VariableDeclarator(node) {
				if (!importCache) return;
				if (node.id.type === AST_NODE_TYPES.Identifier) {
					let handlerType = null;
					if (node.id.typeAnnotation) handlerType = getHandlerTypeFromAnnotation(node.id.typeAnnotation, importCache);
					if (!handlerType && node.parent?.type === AST_NODE_TYPES.VariableDeclaration) handlerType = getHandlerTypeFromJSDoc(node.parent, context);
					if (handlerType && (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression || node.init?.type === AST_NODE_TYPES.FunctionExpression)) checkHandlerFunction(node.init, handlerType, context);
				}
			},
			TSSatisfiesExpression(node) {
				if (!importCache) return;
				const handlerType = getHandlerTypeFromSatisfies(node, importCache);
				if (handlerType && (node.expression.type === AST_NODE_TYPES.ArrowFunctionExpression || node.expression.type === AST_NODE_TYPES.FunctionExpression)) checkHandlerFunction(node.expression, handlerType, context);
			},
			FunctionDeclaration(node) {
				const handlerType = getHandlerTypeFromJSDoc(node, context);
				if (handlerType) checkHandlerFunction(node, handlerType, context);
			},
			ArrowFunctionExpression(node) {
				const handlerType = getHandlerTypeFromJSDoc(node, context);
				if (handlerType) checkHandlerFunction(node, handlerType, context);
			},
			FunctionExpression(node) {
				const handlerType = getHandlerTypeFromJSDoc(node, context);
				if (handlerType) checkHandlerFunction(node, handlerType, context);
			}
		};
	}
};
/**
* Maps Handler/HeaderHandler/MiddleFnHandler type names to their corresponding router function names
*/
function handlerTypeToFunctionName(handlerType) {
	if (handlerType === "HeaderHandler") return "headersFn";
	if (handlerType === "MiddleFnHandler") return "middleFn";
	return "route";
}
/**
* Helper function to check a handler function for type annotations
* @param func The function node to check
* @param handlerType The expected handler type
* @param context The ESLint context
*/
function checkHandlerFunction(func, handlerType, context) {
	const hasReturnType = hasExplicitReturnType(func);
	const paramValidation = validateParameterTypes(func);
	const functionName = handlerTypeToFunctionName(handlerType);
	if (!hasReturnType) context.report({
		node: getReturnTypeReportNode(func),
		messageId: "missingReturnType",
		data: { handlerType: functionName }
	});
	for (const paramNode of paramValidation.missingParamNodes) context.report({
		node: paramNode,
		messageId: "missingParamTypes",
		data: { paramName: getParameterName(paramNode) }
	});
}
//#endregion
export { rule as default };

//# sourceMappingURL=strong-typed-routes.js.map