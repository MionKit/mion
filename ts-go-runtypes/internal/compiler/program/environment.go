package program

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// EnvironmentFile reports a file loaded by tsconfig `types` or any `/// <reference types>`, or their reference chains.
// Imports are never followed: an imported library is never environment, wherever it sits on disk.
func (p *Program) EnvironmentFile(sourceFile *ast.SourceFile) bool {
	if sourceFile == nil {
		return false
	}
	p.environmentOnce.Do(p.collectEnvironment)
	return p.environment[sourceFile.Path()]
}

func (p *Program) collectEnvironment() {
	environment := map[tspath.Path]bool{}
	var queue []*ast.SourceFile
	add := func(sourceFile *ast.SourceFile) {
		if sourceFile != nil && !environment[sourceFile.Path()] {
			environment[sourceFile.Path()] = true
			queue = append(queue, sourceFile)
		}
	}
	// All keys: the `types` list's synthetic containing file and any dependency's reference (`@types/express` loads `node`).
	for _, resolutions := range p.TS.GetResolvedTypeReferenceDirectives() {
		for _, resolution := range resolutions {
			if resolution != nil && resolution.IsResolved() {
				add(p.TS.GetSourceFileForResolvedModule(resolution.ResolvedFileName))
			}
		}
	}
	for len(queue) > 0 {
		sourceFile := queue[0]
		queue = queue[1:]
		for _, reference := range sourceFile.ReferencedFiles {
			add(p.TS.GetSourceFileFromReference(sourceFile, reference))
		}
	}
	p.environment = environment
}
