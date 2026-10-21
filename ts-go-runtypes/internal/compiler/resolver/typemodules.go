package resolver

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// addTypeModules (emitMode ts) adds one type module per type id a typed entry names, closing over the ids those
// modules reference, and sets each entry's TypeImports. Type-only imports may cycle, so they never join the deps.
func addTypeModules(graph entrymodules.Graph, resolve func(id string) *reflection.RunType) {
	var queue []string
	for _, entry := range graph {
		if entry.Kind != entrymodules.KindTypeFn {
			continue
		}
		deps := append(append([]string(nil), entry.Deps...), entry.SoftDeps...)
		entry.TypeImports = typefunctions.TypeRefsIn(entry.Key, deps, entry.ArgsText)
		queue = append(queue, entry.TypeImports...)
	}
	printer := convert.NewTypeModulePrinter(resolve)
	spell := func(key string) string {
		typeID, _ := convert.TypeModuleID(key)
		return typefunctions.TypeRef(typeID)
	}
	for len(queue) > 0 {
		typeID := queue[0]
		queue = queue[1:]
		key := entrymodules.TypeDeclKey(typeID)
		if graph[key] != nil {
			continue
		}
		entry := &entrymodules.Entry{Key: key, Kind: entrymodules.KindTypeDecl, TypeText: "unknown"}
		graph.Add(entry)
		node := resolve(typeID)
		if node == nil {
			continue
		}
		entry.TypeDoc = node.TypeName
		text, formatImports, err := printer.TypeModuleText(node)
		if err != nil {
			// A type the printer cannot spell degrades to unknown: the factory still type-checks, only less precisely.
			continue
		}
		for _, refKey := range convert.DeclRefKeys(text) {
			if refID, ok := convert.TypeModuleID(refKey); ok {
				entry.TypeImports = append(entry.TypeImports, refID)
				queue = append(queue, refID)
			}
		}
		entry.TypeText = convert.ReplaceDeclRefs(text, spell)
		entry.FormatImports = formatImports
	}
}
