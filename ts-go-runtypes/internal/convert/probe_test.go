package convert

import (
	"encoding/json"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/testfixtures"
)

// Scratch probe used while building printer rows: dumps the graphs the
// resolver produces for the constructs under work. Not part of the suite.
func TestProbe_SentinelShapes(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}
	source := "import * as RT from '@ts-runtypes/core/builders';\n" +
		"import * as TF from '@ts-runtypes/core/formats';\n" +
		"const oneRT = RT.oneOf([TF.string(), TF.number()]);\n" +
		"type One = typeof oneRT extends {__rtBrand?: infer B} ? never : never;\n" +
		"const notRT = RT.not(TF.email());\n" +
		"const uniqRT = RT.array(TF.string(), {uniqueItems: true, maxItems: 4});\n" +
		"const cntRT = RT.array(TF.number(), {contains: {schema: TF.number({min: 5}), minContains: 1}});\n" +
		"const keysRT = RT.record(TF.string(), {minProperties: 1, propertyNames: TF.string({maxLength: 3})});\n" +
		"const emailRT = TF.email();\n"
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	markerFiles, markerErr := testfixtures.RealMarkerPackage()
	if markerErr != nil {
		t.Fatal(markerErr)
	}
	for rel, content := range markerFiles {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	mainPath := tspath.ResolvePath(cwd, "main.ts")
	overlay[mainPath] = source
	prog, progErr := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, []string{mainPath})
	if progErr != nil {
		t.Fatal(progErr)
	}
	session, resolverErr := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true, JSEngine: jsengine.NewSidecar("")})
	if resolverErr != nil {
		t.Fatal(resolverErr)
	}
	defer session.Close()
	sourceFile := prog.SourceFile(mainPath)
	for _, decl := range recognizeFile(sourceFile, session.Checker(), prog.FS) {
		resolved, resolveErr := resolveDecl(session.Checker(), session.Cache(), decl)
		if resolveErr != nil {
			t.Logf("%s: resolve error %v", declLabel(decl), resolveErr)
			continue
		}
		rootJSON, _ := json.Marshal(resolved.Node)
		t.Logf("%s root: %s", declLabel(decl), rootJSON)
		for _, childRef := range resolved.Node.Children {
			if childRef == nil || childRef.ID == "" {
				continue
			}
			childJSON, _ := json.Marshal(resolved.Resolve(childRef.ID))
			t.Logf("  child %s: %s", childRef.ID, childJSON)
		}
	}
}
