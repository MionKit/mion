package apimeta

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
)

// The handler type numbers @mionjs/core's HandlerType assigns; the API type
// carries each method's as a number literal.
const (
	TypeRoute           = 1
	TypeMiddleFn        = 2
	TypeHeadersMiddleFn = 3
)

// Method is one public route or middleFn read off a PublicApi type: its
// identity in the tree, the options the router resolved (as the type carries
// them), the types the server compiled it from, and, for a route, the ids of
// the middleFns its execution chain runs, composed the way the router does.
type Method struct {
	Id        string
	Pointer   []string
	NestLevel int
	Type      int
	// Options is the resolved options literal the API type carries, JSON-shaped
	// (`encoder` is a nested object). A key whose value is not a literal is
	// absent here and listed in WidenedOptions.
	Options        map[string]any
	WidenedOptions []string
	// Params / Return are the checker types the server's params and return
	// markers were compiled from; Headers is a headers middleFn's HeadersSubset
	// parameter type, nil for every other method.
	Params  *checker.Type
	Return  *checker.Type
	Headers *checker.Type
	IsAsync bool
	// MiddleFnIds is the route's public middleFn chain in execution order;
	// nil for a middleFn.
	MiddleFnIds []string
}

// Tree is a walked PublicApi type: every public method in checker order, and
// the checker that owns their types (ids must be assigned under it).
type Tree struct {
	Methods []*Method
	ById    map[string]*Method
	Checker *checker.Checker
}

// Ids returns the sorted ids of every method in the tree.
func (tree *Tree) Ids() []string {
	ids := make([]string, 0, len(tree.Methods))
	for _, method := range tree.Methods {
		ids = append(ids, method.Id)
	}
	sort.Strings(ids)
	return ids
}

// WalkApi reads a PublicApi type into a Tree. problem is non-empty when the
// type is not a PublicApi the build can read (a loose RemoteApi, `any`, a
// member without its handler or compiled types); it names what failed.
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

// level mirrors the router's recursiveFlatRoutes + recursiveCreateExecutionChain:
// the middleFns declared before a route at its own level run before it, those
// after run after it, and every level nests inside its parent's pre / post
// lists, so a route's chain is `[...pre, ...preLevel, route, ...postLevel,
// ...post]` with the router's own start / end middleFns (internal ids the
// public API never carries) left out.
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
		return "`" + id + "` is neither a route, a middleFn nor a group of routes (" + walker.typeChecker.TypeToString(propertyType) + ")"
	}
	levelMiddleFns := func(from, to int) []string {
		var ids []string
		for i := from; i < to; i++ {
			if entries[i].method != nil && entries[i].method.Type != TypeRoute {
				ids = append(ids, entries[i].method.Id)
			}
		}
		return ids
	}
	for index, entry := range entries {
		preLevel := levelMiddleFns(0, index)
		postLevel := levelMiddleFns(index+1, len(entries))
		if entry.method != nil {
			if entry.method.Type == TypeRoute {
				chain := make([]string, 0, len(pre)+len(preLevel)+len(postLevel)+len(post))
				chain = append(append(append(append(chain, pre...), preLevel...), postLevel...), post...)
				entry.method.MiddleFnIds = chain
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

// isMethod reports whether a member type is a public method: it carries the
// `type` and `handler` properties every PublicRoute / PublicMiddleFn declares.
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
	if !ok || (number != TypeRoute && number != TypeMiddleFn && number != TypeHeadersMiddleFn) {
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
	if method.Type == TypeHeadersMiddleFn {
		method.Headers = walker.compiledType(typesType, "headers")
		if method.Headers == nil {
			return nil, "`" + id + "` is a headers middleFn without a compiled HeadersSubset type"
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

// compiledType reads one of the MethodTypes fields; nil when absent or not a
// compiled type (`unknown`, the wide default of a RemoteApi; `never` for the
// headers of a non-headers method).
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

// readOptions copies a resolved options literal type into JSON-shaped values:
// string / number / boolean literals as they are, `undefined` as an absent key
// (the runtime object never carries the key either), the `encoder` pair as a
// nested object. A value that is not a single literal (a widened `boolean`,
// a `string`) is left absent and its dotted name reported in widened.
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
			// `T | undefined` (an optional literal) keeps the literal; `boolean`
			// and any other union is widened.
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

// Select returns the methods a site's ids resolve to plus, for every route
// among them, the middleFns of its chain, in tree order; missing lists the
// ids the tree does not declare.
func (tree *Tree) Select(ids []string) (methods []*Method, missing []string) {
	wanted := map[string]bool{}
	for _, id := range ids {
		method, ok := tree.ById[id]
		if !ok {
			missing = append(missing, id)
			continue
		}
		wanted[id] = true
		for _, middleFnId := range method.MiddleFnIds {
			wanted[middleFnId] = true
		}
	}
	for _, method := range tree.Methods {
		if wanted[method.Id] {
			methods = append(methods, method)
		}
	}
	return methods, missing
}

// Describe renders a method for reports and tests.
func (method *Method) Describe() string {
	return fmt.Sprintf("%s(type=%d nest=%d chain=%v async=%v options=%v)", method.Id, method.Type, method.NestLevel, method.MiddleFnIds, method.IsAsync, method.Options)
}
