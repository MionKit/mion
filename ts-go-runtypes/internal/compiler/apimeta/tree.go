package apimeta

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
)

// The handler type numbers @mionjs/core's HandlerType assigns; the API type carries them as number literals.
const (
	TypeRoute             = 1
	TypeMiddleware        = 2
	TypeHeadersMiddleware = 3
)

// Method is one public route or middleware read off a PublicApi type, as the type carries it.
type Method struct {
	Id        string
	Pointer   []string
	NestLevel int
	Type      int
	// Options is the resolved options literal the API type carries, JSON-shaped (`parser` nests).
	// A key whose value is not a literal is absent here and listed in WidenedOptions.
	Options        map[string]any
	WidenedOptions []string
	// Params / Return are the types the server's markers were compiled from; Headers is a headers
	// middleware's HeadersSubset parameter type, nil for every other method.
	Params  *checker.Type
	Return  *checker.Type
	Headers *checker.Type
	IsAsync bool
	// MiddlewareIds is the route's public middleware chain in execution order; nil for a middleware.
	MiddlewareIds []string
}

// Tree is a walked PublicApi type: every public method in checker order, and the checker their type ids must be assigned under.
type Tree struct {
	Methods []*Method
	ById    map[string]*Method
	Checker *checker.Checker
	// RouterOptions is the options type `initRoutes` puts under the ROUTER_OPTIONS key; nil on a bare PublicApi.
	RouterOptions *checker.Type
}

// tsgo names a symbol-keyed member with this internal prefix; ROUTER_OPTIONS is @mionjs/core's `unique symbol`.
const (
	symbolKeyPrefix     = "\xFE@"
	routerOptionsPrefix = symbolKeyPrefix + "ROUTER_OPTIONS@"
)

// Ids returns the sorted ids of every method in the tree.
func (tree *Tree) Ids() []string {
	ids := make([]string, 0, len(tree.Methods))
	for _, method := range tree.Methods {
		ids = append(ids, method.Id)
	}
	sort.Strings(ids)
	return ids
}

// WalkApi reads a PublicApi type into a Tree; problem names what failed when the type is not one the build can read.
func WalkApi(typeChecker *checker.Checker, apiType *checker.Type) (*Tree, string) {
	if apiType == nil {
		return nil, "the API type is missing"
	}
	if checker.IsTypeAny(apiType) {
		return nil, "the API type is `any`"
	}
	tree := &Tree{ById: map[string]*Method{}, Checker: typeChecker}
	walker := &treeWalker{typeChecker: typeChecker, tree: tree}
	if problem := walker.level(apiType, nil, 0, nil, nil); problem != "" {
		return nil, problem
	}
	return tree, ""
}

type treeWalker struct {
	typeChecker *checker.Checker
	tree        *Tree
}

// levelEntry is one property of a tree level: a method, or a sub-tree.
type levelEntry struct {
	key     string
	method  *Method
	subtree *checker.Type
}

// level mirrors the router's recursiveFlatRoutes + recursiveCreateExecutionChain: a route's chain is
// `[...pre, ...preLevel, route, ...postLevel, ...post]`, minus the router's own start / end middlewares.
func (walker *treeWalker) level(levelType *checker.Type, pointer []string, nestLevel int, pre, post []string) string {
	properties := walker.typeChecker.GetPropertiesOfType(levelType)
	if len(properties) == 0 {
		if len(pointer) == 0 {
			return "the API type declares no routes"
		}
		return "`" + strings.Join(pointer, "/") + "` declares no routes"
	}
	entries := make([]levelEntry, 0, len(properties))
	for _, property := range properties {
		if strings.HasPrefix(property.Name, symbolKeyPrefix) {
			if nestLevel == 0 && strings.HasPrefix(property.Name, routerOptionsPrefix) {
				walker.tree.RouterOptions = walker.typeChecker.GetNonNullableType(walker.typeChecker.GetTypeOfSymbol(property))
			}
			continue
		}
		propertyType := walker.typeChecker.GetTypeOfSymbol(property)
		memberPointer := append(append([]string(nil), pointer...), property.Name)
		id := strings.Join(memberPointer, "/")
		if walker.isMethod(propertyType) {
			method, problem := walker.method(propertyType, id, memberPointer, nestLevel)
			if problem != "" {
				return problem
			}
			entries = append(entries, levelEntry{key: property.Name, method: method})
			continue
		}
		if checker.Type_flags(propertyType)&checker.TypeFlagsObject != 0 {
			entries = append(entries, levelEntry{key: property.Name, subtree: propertyType})
			continue
		}
		return "`" + id + "` is neither a route, a middleware nor a group of routes (" + walker.typeChecker.TypeToString(propertyType) + ")"
	}
	levelMiddlewares := func(from, to int) []string {
		var ids []string
		for i := from; i < to; i++ {
			if entries[i].method != nil && entries[i].method.Type != TypeRoute {
				ids = append(ids, entries[i].method.Id)
			}
		}
		return ids
	}
	for index, entry := range entries {
		preLevel := levelMiddlewares(0, index)
		postLevel := levelMiddlewares(index+1, len(entries))
		if entry.method != nil {
			if entry.method.Type == TypeRoute {
				chain := make([]string, 0, len(pre)+len(preLevel)+len(postLevel)+len(post))
				chain = append(append(append(append(chain, pre...), preLevel...), postLevel...), post...)
				entry.method.MiddlewareIds = chain
			}
			walker.tree.Methods = append(walker.tree.Methods, entry.method)
			walker.tree.ById[entry.method.Id] = entry.method
			continue
		}
		subPre := append(append([]string(nil), pre...), preLevel...)
		subPost := append(append([]string(nil), postLevel...), post...)
		if problem := walker.level(entry.subtree, append(append([]string(nil), pointer...), entry.key), nestLevel+1, subPre, subPost); problem != "" {
			return problem
		}
	}
	return ""
}

// isMethod reports whether a member type is a public method: every PublicRoute / PublicMiddleware declares `type` and `handler`.
func (walker *treeWalker) isMethod(memberType *checker.Type) bool {
	if memberType == nil || checker.Type_flags(memberType)&checker.TypeFlagsObject == 0 {
		return false
	}
	return checker.Checker_getPropertyOfType(walker.typeChecker, memberType, "type") != nil &&
		checker.Checker_getPropertyOfType(walker.typeChecker, memberType, "handler") != nil
}

func (walker *treeWalker) method(memberType *checker.Type, id string, pointer []string, nestLevel int) (*Method, string) {
	typeChecker := walker.typeChecker
	method := &Method{Id: id, Pointer: pointer, NestLevel: nestLevel}
	typeValue := comptimeargs.TypeLiteralValue(typeChecker, typeChecker.GetTypeOfPropertyOfType(memberType, "type"), comptimeargs.TypeValueOptions{})
	number, ok := typeValue.(float64)
	if !ok || (number != TypeRoute && number != TypeMiddleware && number != TypeHeadersMiddleware) {
		return nil, "`" + id + "` has no literal handler type"
	}
	method.Type = int(number)
	if handlerType := typeChecker.GetTypeOfPropertyOfType(memberType, "handler"); handlerType == nil || checker.IsTypeAny(handlerType) {
		return nil, "`" + id + "` has an untyped handler; bundleApi needs the API's PublicApi type"
	}
	typesType := typeChecker.GetTypeOfPropertyOfType(memberType, "types")
	if typesType == nil {
		return nil, "`" + id + "` carries no compiled types (an older @mionjs/router declared it)"
	}
	typesType = typeChecker.GetNonNullableType(typesType)
	method.Params = walker.compiledType(typesType, "params")
	method.Return = walker.compiledType(typesType, "return")
	if method.Params == nil || method.Return == nil {
		return nil, "`" + id + "` has no compiled params or return type; bundleApi needs the API's PublicApi type"
	}
	if method.Type == TypeHeadersMiddleware {
		method.Headers = walker.compiledType(typesType, "headers")
		if method.Headers == nil {
			return nil, "`" + id + "` is a headers middleware without a compiled HeadersSubset type"
		}
	}
	isAsync := typeChecker.GetTypeOfPropertyOfType(typesType, "isAsync")
	if isAsync == nil || checker.Type_flags(isAsync)&checker.TypeFlagsBooleanLiteral == 0 {
		return nil, "`" + id + "` does not say whether its handler is async; bundleApi needs the API's PublicApi type"
	}
	method.IsAsync = typeChecker.TypeToString(isAsync) == "true"
	optionsType := typeChecker.GetTypeOfPropertyOfType(memberType, "options")
	if optionsType == nil {
		return nil, "`" + id + "` carries no resolved options (an older @mionjs/router declared it)"
	}
	method.Options, method.WidenedOptions = readOptions(typeChecker, optionsType, "")
	return method, ""
}

// compiledType reads one MethodTypes field; nil when absent or not compiled (`unknown` on a RemoteApi,
// `never` for the headers of a non-headers method).
func (walker *treeWalker) compiledType(typesType *checker.Type, name string) *checker.Type {
	fieldType := walker.typeChecker.GetTypeOfPropertyOfType(typesType, name)
	if fieldType == nil {
		return nil
	}
	if checker.Type_flags(fieldType)&(checker.TypeFlagsUnknown|checker.TypeFlagsNever|checker.TypeFlagsAny) != 0 {
		return nil
	}
	return fieldType
}

// ReadRouterOptions reads the literal router options a client acts on; nil when the tree carries none.
func (tree *Tree) ReadRouterOptions() map[string]any {
	if tree.RouterOptions == nil {
		return nil
	}
	options, _ := readOptions(tree.Checker, tree.RouterOptions, "")
	out := map[string]any{}
	for _, name := range clientRouterOptions {
		if value, ok := options[name]; ok {
			out[name] = value
		}
	}
	return out
}

// clientRouterOptions are the router options a client build injects at `initClient`.
var clientRouterOptions = []string{"syncRoutes"}

// readOptions copies a resolved options literal type into JSON-shaped values: `undefined` becomes an absent
// key (the runtime object drops it too) and the `parser` pair a nested object. A value that is not a
// single literal is left absent and its dotted name reported in widened.
func readOptions(typeChecker *checker.Checker, optionsType *checker.Type, prefix string) (map[string]any, []string) {
	out := map[string]any{}
	var widened []string
	for _, property := range typeChecker.GetPropertiesOfType(optionsType) {
		valueType := typeChecker.GetTypeOfSymbol(property)
		name := prefix + property.Name
		if valueType == nil {
			continue
		}
		flags := checker.Type_flags(valueType)
		if flags&checker.TypeFlagsUndefined != 0 && flags&checker.TypeFlagsUnion == 0 {
			continue
		}
		if flags&checker.TypeFlagsUnion != 0 {
			// `T | undefined` (an optional literal) keeps the literal; `boolean` and any other union is widened.
			nonNull := typeChecker.GetNonNullableType(valueType)
			if nonNull == nil || checker.Type_flags(nonNull)&checker.TypeFlagsUnion != 0 {
				widened = append(widened, name)
				continue
			}
			valueType = nonNull
			flags = checker.Type_flags(valueType)
		}
		switch {
		case flags&(checker.TypeFlagsStringLiteral|checker.TypeFlagsNumberLiteral|checker.TypeFlagsBooleanLiteral) != 0:
			out[property.Name] = comptimeargs.TypeLiteralValue(typeChecker, valueType, comptimeargs.TypeValueOptions{})
		case flags&checker.TypeFlagsObject != 0:
			nested, nestedWidened := readOptions(typeChecker, valueType, name+".")
			out[property.Name] = nested
			widened = append(widened, nestedWidened...)
		default:
			widened = append(widened, name)
		}
	}
	sort.Strings(widened)
	return out, widened
}

// Select returns the methods a site's ids resolve to plus each route's chain middlewares, in tree order.
func (tree *Tree) Select(ids []string) (methods []*Method, missing []string) {
	wanted := map[string]bool{}
	for _, id := range ids {
		method, ok := tree.ById[id]
		if !ok {
			missing = append(missing, id)
			continue
		}
		wanted[id] = true
		for _, middlewareId := range method.MiddlewareIds {
			wanted[middlewareId] = true
		}
	}
	for _, method := range tree.Methods {
		if wanted[method.Id] {
			methods = append(methods, method)
		}
	}
	return methods, missing
}
