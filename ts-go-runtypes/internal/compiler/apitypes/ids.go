package apitypes

import (
	"fmt"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
)

// VerifyIDs recomputes the API's type ids over the package files: printing another package's types must not move one.
func VerifyIDs(input Input, output *Output) error {
	declarations := make(map[string]string, len(output.Files))
	for rel, text := range output.Files {
		declarations[filepath.Join(filepath.Clean(input.DeclarationDir), filepath.FromSlash(rel))] = text
	}
	trimmer, release, err := newTrimmer(input, declarations)
	if err != nil {
		return err
	}
	defer release()
	entry := trimmer.files[filepath.Join(trimmer.declarationDir, filepath.FromSlash(output.Entry))]
	if entry == nil {
		return fmt.Errorf("api types: the package has no entry %s", output.Entry)
	}
	if got := trimmer.apiMemberIDs(entry, output.ApiExports); got != output.apiIDs {
		return fmt.Errorf("api types: printing other packages' types changed the API's type ids, an internal error (please report it)\nserver:  %s\npackage: %s", output.apiIDs, got)
	}
	return nil
}

// apiMemberIDs lists each API export's members with their structural ids, nested route groups expanded.
func (trimmer *trimmer) apiMemberIDs(entry *fileInfo, apiExports []string) string {
	computer := typeid.New(trimmer.checker).SetEnvironment(trimmer.program.EnvironmentFile)
	return exportedMemberIDs(trimmer.checker, trimmer.checker.GetSymbolAtLocation(entry.source.AsNode()), computer, apiExports)
}

func exportedMemberIDs(typeChecker *checker.Checker, module *ast.Symbol, computer *typeid.Computer, apiExports []string) string {
	var parts []string
	for _, exported := range typeChecker.GetExportsOfModule(module) {
		if !slices.Contains(apiExports, exported.Name) {
			continue
		}
		target := exported
		if target.Flags&ast.SymbolFlagsAlias != 0 {
			target = typeChecker.GetAliasedSymbol(target)
		}
		if target.Flags&ast.SymbolFlagsValue == 0 {
			continue
		}
		parts = append(parts, exported.Name+"{"+memberIDsOf(typeChecker, typeChecker.GetTypeOfSymbol(target), computer)+"}")
	}
	sort.Strings(parts)
	return strings.Join(parts, " ")
}

func memberIDsOf(typeChecker *checker.Checker, apiType *checker.Type, computer *typeid.Computer) string {
	var members []string
	for _, property := range typeChecker.GetPropertiesOfType(apiType) {
		name := property.Name
		if strings.Contains(name, "apiBuildVersion") {
			name = "apiBuildVersion"
		}
		propertyType := typeChecker.GetTypeOfSymbol(property)
		text := computer.Compute(propertyType)
		if strings.HasPrefix(typeChecker.TypeToString(propertyType), "PublicApi<") {
			text = "{" + memberIDsOf(typeChecker, propertyType, computer) + "}"
		}
		members = append(members, name+": "+text)
	}
	sort.Strings(members)
	return strings.Join(members, "; ")
}
