package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// The whole-graph half of the silent-`any` guard family. The three probes in
// unresolved_import_guard.go / unresolved_name_guard.go see the ROOT type
// argument and the syntax written AT the call; a member that degraded to
// `any` one object deeper leaves the root a healthy object literal, so
// nothing fired and that member's validator became `true`:
//
//	import type {User} from './auth/user';   // unresolved in the scan program
//	interface Payload {id: string; user: User}
//	createValidateFn<Payload>();             // the root is fine; `user` is `any`
//
// detectSilentAnyInGraph walks the RESOLVED checker type instead (properties,
// index signatures, type arguments of references, union members), each type
// once, and runs the same three per-node predicates at every member:
//
//   - TMP001: the member's written type is `Temporal.<Known>` and it resolved
//     any-flavored (temporalDegradedToAny).
//   - MKR007: the member is error-like `any` and the file that DECLARES it
//     (not the call site's file) carries an unresolved import; names the
//     import.
//   - MKR013: the member is error-like `any` (marker.IsErrorLikeAny) with no
//     import to blame; names the written type when the declaration wrote one.
//
// A hand-written `any` member is the `any` intrinsic, never error-like, so it
// stays legal by construction, exactly as at the root. The site is the marker
// call (where every other diagnostic lands); a Related entry points at the
// member's declaration. Members declared inside the call's own type-argument
// syntax are skipped: detectWrittenTypeRefGuards already reported those.

// silentAnyScanDepth bounds the walk like marker.FindFreeTypeParameter's; the
// visited set is what terminates on a recursive type.
const silentAnyScanDepth = 64

// detectSilentAnyInGraph returns the diagnostics for every degraded-`any`
// member reachable under typeArgument, the root itself excluded (the root
// probes own it). One diagnostic per member, most specific cause first.
func (state scanState) detectSilentAnyInGraph(file string, call *ast.Node, typeArgument *checker.Type) []diagnostics.Diagnostic {
	if typeArgument == nil || state.scanChecker == nil {
		return nil
	}
	callFile := ast.GetSourceFileOfNode(call)
	if callFile == nil {
		return nil
	}
	site := textpos.NodeSite(file, callFile, call)
	var diags []diagnostics.Diagnostic
	visited := map[*checker.Type]bool{typeArgument: true}
	state.walkTypeMembers(typeArgument, visited, 0, func(memberType *checker.Type, memberSymbol *ast.Symbol) {
		declaration := firstDeclaration(memberSymbol)
		if declaration != nil && declaredInside(declaration, call) {
			return
		}
		if diagnostic, ok := state.silentAnyMemberDiag(memberType, memberSymbol, declaration, site); ok {
			diags = append(diags, diagnostic)
		}
	})
	return diags
}

// walkTypeMembers visits every member position under tsType: for an object
// its properties (function-typed ones excluded, a signature interior is never
// data) and index signatures, for a reference its type arguments (array
// element, Map/Set arguments, generic instantiation), for a union each arm.
// visit receives the member's type and, for a property, its symbol (nil for
// an element or an arm, which has no declaration of its own).
func (state scanState) walkTypeMembers(tsType *checker.Type, visited map[*checker.Type]bool, depth int, visit func(memberType *checker.Type, memberSymbol *ast.Symbol)) {
	if tsType == nil || depth > silentAnyScanDepth {
		return
	}
	typeChecker := state.scanChecker
	descend := func(memberType *checker.Type, memberSymbol *ast.Symbol) {
		if memberType == nil || visited[memberType] {
			return
		}
		visited[memberType] = true
		visit(memberType, memberSymbol)
		state.walkTypeMembers(memberType, visited, depth+1, visit)
	}
	flags := checker.Type_flags(tsType)
	if flags&checker.TypeFlagsUnion != 0 {
		for _, arm := range tsType.Distributed() {
			descend(arm, nil)
		}
		return
	}
	if flags&(checker.TypeFlagsObject|checker.TypeFlagsIntersection) == 0 {
		return
	}
	if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		for _, typeArgument := range typeChecker.GetTypeArguments(tsType) {
			descend(typeArgument, nil)
		}
	}
	for _, propertySymbol := range typeChecker.GetPropertiesOfType(tsType) {
		propertyType := typeChecker.GetTypeOfSymbol(propertySymbol)
		if propertyType == nil {
			continue
		}
		if len(typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)) > 0 &&
			len(typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			continue
		}
		descend(propertyType, propertySymbol)
	}
	for _, indexInfo := range typeChecker.GetIndexInfosOfType(tsType) {
		descend(indexInfo.KeyType(), nil)
		descend(indexInfo.ValueType(), nil)
	}
}

// silentAnyMemberDiag classifies one member into the guard that owns it, or
// reports nothing for a member that is not a degraded `any`.
func (state scanState) silentAnyMemberDiag(memberType *checker.Type, memberSymbol *ast.Symbol, declaration *ast.Node, site diagnostics.Site) (diagnostics.Diagnostic, bool) {
	if memberType == nil || checker.Type_flags(memberType)&checker.TypeFlagsAny == 0 {
		return diagnostics.Diagnostic{}, false
	}
	memberName := "member"
	if memberSymbol != nil && memberSymbol.Name != "" {
		memberName = memberSymbol.Name
	}
	var related []diagnostics.Related
	var declarationFile *ast.SourceFile
	var typeNode *ast.Node
	if declaration != nil {
		declarationFile = ast.GetSourceFileOfNode(declaration)
		typeNode = declaredTypeNode(declaration)
		if declarationFile != nil {
			related = append(related, diagnostics.Related{
				Site:    textpos.NodeSite(declarationFile.FileName(), declarationFile, declaration),
				Message: "member `" + memberName + "` is declared here",
			})
		}
	}
	// TMP001: a builtin Temporal name may never mean `any`, intrinsic included.
	if typeNode != nil && ast.IsTypeReferenceNode(typeNode) {
		if temporalName, isTemporal := temporalQualifiedName(typeNode); isTemporal && temporalDegradedToAny(memberType) {
			return diagnostics.NewWithRelated(diagnostics.CodeTemporalNotLoaded, site, []string{temporalName}, related...), true
		}
	}
	if !marker.IsErrorLikeAny(memberType) {
		return diagnostics.Diagnostic{}, false
	}
	// MKR007: the declaring file's unresolved import is the actionable cause.
	if declarationFile != nil {
		if specifiers := state.unresolvedImportSpecifiers(declarationFile); len(specifiers) > 0 {
			return diagnostics.NewWithRelated(diagnostics.CodeMarkerAnyFromUnresolvedImport, site, []string{specifiers[0]}, related...), true
		}
	}
	// MKR013: name the written type when the declaration wrote one.
	written := memberName
	if typeNode != nil && ast.IsTypeReferenceNode(typeNode) {
		if name, ok := writtenEntityName(typeNode); ok {
			written = name
		}
	}
	return diagnostics.NewWithRelated(diagnostics.CodeMarkerUnresolvedTypeName, site, []string{written}, related...), true
}

// firstDeclaration returns a symbol's first declaration node, or nil.
func firstDeclaration(symbol *ast.Symbol) *ast.Node {
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if declaration != nil {
			return declaration
		}
	}
	return nil
}

// declaredTypeNode returns the type annotation written on a property
// declaration (interface member or class field), or nil.
func declaredTypeNode(declaration *ast.Node) *ast.Node {
	switch declaration.Kind {
	case ast.KindPropertySignature:
		return declaration.AsPropertySignatureDeclaration().Type
	case ast.KindPropertyDeclaration:
		return declaration.AsPropertyDeclaration().Type
	}
	return nil
}

// declaredInside reports whether declaration sits inside call's own text: a
// member of an object literal written as the call's type argument, which the
// written-syntax walk already classified.
func declaredInside(declaration, call *ast.Node) bool {
	if ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(call) {
		return false
	}
	return declaration.Pos() >= call.Pos() && declaration.End() <= call.End()
}
