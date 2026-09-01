// SchemaDocProbe — renders every resolvable declaration of a file through the
// runtime schema-document renderer (internal/schemadoc). The convert package
// hosts it because resolving a file's declarations to reflection nodes needs
// the recognizer + resolver harness that lives here; the probe itself never
// prints convert output. The corpus test pins the renderer's spelling for the
// shared-subset shapes as golden documents, and the seeded fuzz leg pins
// renderer determinism over the generated atom space.
package convert

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/schemadoc"
)

// SchemaDocPair is one declaration's rendered schema document.
type SchemaDocPair struct {
	Decl     string
	Renderer string
}

// SchemaDocProbe renders every resolvable non-generic declaration of absPath
// through schemadoc.RenderDocument.
func SchemaDocProbe(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, absPath string) ([]SchemaDocPair, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	decls := recognizeFile(sourceFile, typeChecker, markerOpts)
	var pairs []SchemaDocPair
	for _, decl := range decls {
		if decl.Generic {
			continue
		}
		resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
		if resolveErr != nil {
			continue
		}
		doc := schemadoc.RenderDocument(resolved.Node, func(node *reflection.RunType) *reflection.RunType {
			return resolved.Resolve(node.ID)
		})
		pairs = append(pairs, SchemaDocPair{Decl: declLabel(decl), Renderer: doc.Source})
	}
	return pairs, nil
}
