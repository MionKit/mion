// SchemaParityProbe — the drift alarm between the convert printer's schema
// target and the runtime document renderer (internal/schemadoc). Both spell
// schemas in the same textual dialect; for every declaration BOTH can render
// purely structurally the two outputs must be byte-identical. The probe
// resolves a file's declarations and returns the pairs; the parity tests
// (corpus + the seeded fuzz leg) assert equality over them.
//
// Skipped, by design: declarations the printer refuses (its identity
// round-trip rules are stricter than a descriptive document needs), spellings
// that reach a dialect escape or a name reference, and cyclic shapes (the
// renderer closes them with $defs, which the printer never emits).
package convert

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/reflection"
	"github.com/mionkit/ts-runtypes/internal/schemadoc"
)

// SchemaParityPair is one declaration's two schema spellings.
type SchemaParityPair struct {
	Decl     string
	Printer  string
	Renderer string
}

// SchemaParityProbe renders every comparable declaration of absPath through
// both schema backends. Declarations only one side can spell are skipped, so
// callers should also assert a corpus-appropriate floor on len(pairs).
func SchemaParityProbe(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, absPath string) ([]SchemaParityPair, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	decls := recognizeFile(sourceFile, typeChecker, markerOpts)
	imports := scanImports(sourceFile, sourceFile.Text())
	names := newNames(decls, imports, inScopeNames(sourceFile))
	var pairs []SchemaParityPair
	for _, decl := range decls {
		if decl.Generic {
			continue
		}
		resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
		if resolveErr != nil {
			continue
		}
		// A nil set means every reference inlines — the pure structural
		// spelling both backends share.
		ctx := &printContext{names: names, opts: Options{Target: TargetJSONSchema}, decl: decl,
			resolve: resolved.Resolve, rootID: resolved.Node.ID}
		printed, diag := ctx.schemaExpr(resolved.Node)
		if diag != nil {
			continue
		}
		if strings.Contains(printed, names.EmbedType+"<") {
			continue // dialect escape — the renderer deliberately diverges (structural render)
		}
		doc := schemadoc.RenderDocument(resolved.Node, func(node *reflection.RunType) *reflection.RunType {
			return resolved.Resolve(node.ID)
		})
		if strings.Contains(doc.Source, "$defs") {
			continue // cyclic — printer has no $defs spelling
		}
		pairs = append(pairs, SchemaParityPair{Decl: declLabel(decl), Printer: printed, Renderer: doc.Source})
	}
	return pairs, nil
}
