package reflection

import "slices"

// NonData is how DataOnly<T> (packages/run-types/src/runtypes/dataOnly.ts) treats one node: data it keeps, or the
// class of non-data it strips. The emitters, their shortcut predicates, the root codes and the wire NotSupported flag
// all read this one answer, so a kind cannot be data to one of them and stripped by another.
type NonData int

const (
	Data NonData = iota
	// NonDataFunction is a function, a method, a call signature, or an interface carrying a call signature.
	NonDataFunction
	// NonDataSymbol is `symbol` or a unique symbol.
	NonDataSymbol
	// NonDataNever has no value at all.
	NonDataNever
	// NonDataOpaque is a real value with no data form: a Promise, a RegExp or a non-serializable built-in class.
	NonDataOpaque
)

// NonDataOf classifies a node; resolve follows a ref to its node and may be nil when none can be followed.
func NonDataOf(runType *RunType, resolve func(*RunType) *RunType) NonData {
	if runType == nil {
		return Data
	}
	switch runType.Kind {
	case KindFunction, KindMethod, KindMethodSignature, KindCallSignature:
		return NonDataFunction
	case KindSymbol:
		return NonDataSymbol
	case KindLiteral:
		if slices.Contains(runType.Flags, "symbol") {
			return NonDataSymbol
		}
	case KindNever:
		return NonDataNever
	case KindPromise, KindRegexp:
		return NonDataOpaque
	case KindClass:
		if runType.SubKind == SubKindNonSerializable {
			return NonDataOpaque
		}
	case KindObjectLiteral:
		if hasCallSignature(runType, resolve) {
			return NonDataFunction
		}
	}
	return Data
}

func hasCallSignature(runType *RunType, resolve func(*RunType) *RunType) bool {
	for _, child := range runType.Children {
		if child != nil && child.Kind == KindRef && resolve != nil {
			child = resolve(child)
		}
		if child != nil && child.Kind == KindCallSignature {
			return true
		}
	}
	return false
}
