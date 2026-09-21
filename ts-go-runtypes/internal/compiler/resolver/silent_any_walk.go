package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// The whole-graph half of the silent-`any` guard family: the probes in unresolved_import_guard.go /
// unresolved_name_guard.go only see the ROOT type argument and the syntax written AT the call, so a
// member that degraded to `any` one object deeper left the root healthy and its validator became
// `true`. This walk runs the same three predicates (TMP001, MKR007, MKR013) at every member of the
// RESOLVED checker type. A hand-written `any` is the `any` intrinsic, never error-like, so it stays
// legal here as at the root.

// silentAnyScanDepth bounds the walk like marker.FindFreeTypeParameter's; the visited set terminates a recursive type.
const silentAnyScanDepth = 64

// detectSilentAnyInGraph diagnoses every degraded-`any` member under typeArgument, one per member,
// most specific cause first; the root is excluded, the root probes own it.
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

// walkTypeMembers visits each member position under tsType once; function-typed properties are skipped, never data.
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

// silentAnyMemberDiag classifies one degraded-`any` member into the guard that owns it.
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

// declaredTypeNode returns the type annotation written on an interface member or class field, or nil.
func declaredTypeNode(declaration *ast.Node) *ast.Node {
	switch declaration.Kind {
	case ast.KindPropertySignature:
		return declaration.AsPropertySignatureDeclaration().Type
	case ast.KindPropertyDeclaration:
		return declaration.AsPropertyDeclaration().Type
	}
	return nil
}

// declaredInside reports whether declaration sits inside call's own text, already classified by the written-syntax walk.
func declaredInside(declaration, call *ast.Node) bool {
	if ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(call) {
		return false
	}
	return declaration.Pos() >= call.Pos() && declaration.End() <= call.End()
}
