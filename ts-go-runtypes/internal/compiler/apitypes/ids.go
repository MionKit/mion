package apitypes

import (
	"fmt"
	"maps"
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
)

// movedIDs names each API member whose type id differs between the server and the package.
func movedIDs(server, published map[string]string) []string {
	var lines []string
	for _, member := range slices.Sorted(maps.Keys(server)) {
		if published[member] != server[member] {
			lines = append(lines, fmt.Sprintf("the API's type ids changed at %s: the server has %s, the package %s", member, server[member], published[member]))
		}
	}
	for _, member := range slices.Sorted(maps.Keys(published)) {
		if _, kept := server[member]; !kept {
			lines = append(lines, fmt.Sprintf("the API's type ids changed: the package adds %s", member))
		}
	}
	return lines
}

// apiMemberIDs maps each API export's members to their structural ids, by member path, nested route groups expanded.
func (trimmer *trimmer) apiMemberIDs(entry *fileInfo, apiExports []string) map[string]string {
	computer := typeid.New(trimmer.checker).SetEnvironment(trimmer.program.EnvironmentFile)
	return exportedMemberIDs(trimmer.checker, trimmer.checker.GetSymbolAtLocation(entry.source.AsNode()), computer, apiExports)
}

func exportedMemberIDs(typeChecker *checker.Checker, module *ast.Symbol, computer *typeid.Computer, apiExports []string) map[string]string {
	ids := map[string]string{}
	for _, exported := range typeChecker.GetExportsOfModule(module) {
		if !slices.Contains(apiExports, exported.Name) {
			continue
		}
		target := exported
		if target.Flags&ast.SymbolFlagsAlias != 0 {
			target = typeChecker.GetAliasedSymbol(target)
		}
		if target.Flags&ast.SymbolFlagsValue != 0 {
			addMemberIDs(typeChecker, typeChecker.GetTypeOfSymbol(target), computer, exported.Name, ids)
		}
	}
	return ids
}

func addMemberIDs(typeChecker *checker.Checker, apiType *checker.Type, computer *typeid.Computer, path string, ids map[string]string) {
	for _, property := range typeChecker.GetPropertiesOfType(apiType) {
		name := property.Name
		if typeid.IsUniqueSymbolKey(name, "apiBuildVersion") {
			name = "apiBuildVersion"
		}
		propertyType := typeChecker.GetTypeOfSymbol(property)
		if alias := checker.Type_alias(propertyType); alias != nil && alias.Symbol().Name == "PublicApi" {
			addMemberIDs(typeChecker, propertyType, computer, path+"."+name, ids)
			continue
		}
		ids[path+"."+name] = computer.Compute(propertyType)
	}
}
