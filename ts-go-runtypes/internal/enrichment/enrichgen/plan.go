package enrichgen

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// Plan resolves typeName in absPath, emits the enrichment closure, and builds the
// per-family mirror.Spec set for it — the shared heart of the enrich lane. It is
// disk-free: no migration, no writes. The caller runs mirror.Scaffold /
// mirror.Reconcile over the returned specs (the CLI writes the result to disk,
// the daemon returns it on the wire), so the two paths compute identical mirrors.
//
// declFiles is the unique, first-appearance-ordered set of source files the
// closure spans — the CLI migrates each pre-split legacy mirror before writing
// (a disk pre-step the daemon skips). out mirrors the CLI --out override: when
// non-empty every const collapses into one combined single-file spec.
func Plan(
	prog *program.Program,
	chk *checker.Checker,
	cache *runtype.Cache,
	absPath, typeName, out string,
	wantFriendly, wantMock bool,
	cfg Config,
) (specs []mirror.Spec, declFiles []string, err error) {
	resolved, err := enrichment.ResolveTypeRaw(prog, chk, cache, absPath, typeName)
	if err != nil {
		return nil, nil, err
	}
	// The rt$ prefix is RESERVED for enrichment meta keys — a colliding property
	// makes the scaffold unrepresentable, so refuse up front.
	if collisions := enrichment.ReservedPropertyCollisions(resolved.Node, resolved.Resolve); len(collisions) > 0 {
		return nil, nil, fmt.Errorf("%s: property %s collides with the reserved enrichment meta prefix 'rt$' — rename the property or exclude the type from enrichment",
			typeName, strings.Join(collisions, ", "))
	}

	closure := enrichment.EmitClosure(resolved.Node, enrichment.ClosureOptions{
		TypeName:     typeName,
		Resolve:      resolved.Resolve,
		DeclFiles:    resolved.DeclFiles,
		SourceLocale: cfg.SourceLocale,
	})

	groups := GroupByDeclFile(closure, absPath, out != "")

	// varDeclFile maps each emitted const var → the source file its type is
	// declared in, so a referrer in mirror file A can emit a cross-file value
	// import for a var whose home is mirror file B.
	varDeclFile := map[string]string{}
	for _, named := range closure {
		declFile := named.DeclFile
		if declFile == "" {
			declFile = absPath
		}
		varDeclFile[named.FriendlyVar] = declFile
		varDeclFile[named.MockVar] = declFile
	}

	for _, group := range groups {
		declFiles = append(declFiles, group.DeclFile)
		specs = append(specs, BuildSpecs(cfg, group, varDeclFile, out, wantFriendly, wantMock)...)
	}
	return specs, declFiles, nil
}

// BuildSpecs builds the mirror.Spec set for one source-file group: one spec PER
// WANTED FAMILY (friendly / mock), each targeting its own family-segment mirror
// file with a family-matched MirrorPathFor (so cross-file value imports resolve
// to sibling files of the SAME family). The out override collapses everything
// into one combined single-file spec (the legacy shape, kept for the explicit
// escape hatch). Unlike the old cmd groupSpecs, this performs NO legacy-mirror
// migration — that disk pre-step is the CLI's alone.
func BuildSpecs(cfg Config, group DeclFileGroup, varDeclFile map[string]string, out string, wantFriendly, wantMock bool) []mirror.Spec {
	if out != "" {
		return []mirror.Spec{{
			MirrorPath:    out,
			SourceFile:    group.DeclFile,
			Consts:        group.Consts,
			VarDeclFile:   varDeclFile,
			Out:           out,
			WantFriendly:  wantFriendly,
			WantMock:      wantMock,
			MirrorPathFor: cfg.LegacyMirrorPath,
		}}
	}

	var specs []mirror.Spec
	for _, family := range WantedFamilies(wantFriendly, wantMock) {
		family := family
		specs = append(specs, mirror.Spec{
			MirrorPath:    cfg.MirrorPath(family, group.DeclFile),
			SourceFile:    group.DeclFile,
			Consts:        group.Consts,
			VarDeclFile:   varDeclFile,
			WantFriendly:  family == FamilyFriendly,
			WantMock:      family == FamilyMock,
			MirrorPathFor: func(declFile string) string { return cfg.MirrorPath(family, declFile) },
		})
	}
	return specs
}

// WantedFamilies lists the family segments an enrich invocation targets, friendly
// first (matching the historical const order in the combined file).
func WantedFamilies(wantFriendly, wantMock bool) []string {
	var families []string
	if wantFriendly {
		families = append(families, FamilyFriendly)
	}
	if wantMock {
		families = append(families, FamilyMock)
	}
	return families
}

// DeclFileGroup is one mirror file's worth of consts: every NamedConst whose type
// is declared in DeclFile, in topological (declared-before-use) order.
type DeclFileGroup struct {
	DeclFile string
	Consts   []enrichment.NamedConst
}

// GroupByDeclFile buckets a topologically-ordered closure by each const's
// declaration file (falling back to fallbackFile when DeclFile is empty),
// preserving the closure's order within each bucket. forceSingle collapses every
// const into one group keyed by fallbackFile (the --out single-file override).
// Group order follows first appearance, so dependency order is preserved when a
// referenced type's file is emitted before its referrer's.
func GroupByDeclFile(closure []enrichment.NamedConst, fallbackFile string, forceSingle bool) []DeclFileGroup {
	indexByFile := map[string]int{}
	var groups []DeclFileGroup
	for _, named := range closure {
		declFile := fallbackFile
		if !forceSingle && named.DeclFile != "" {
			declFile = named.DeclFile
		}
		index, ok := indexByFile[declFile]
		if !ok {
			index = len(groups)
			indexByFile[declFile] = index
			groups = append(groups, DeclFileGroup{DeclFile: declFile})
		}
		groups[index].Consts = append(groups[index].Consts, named)
	}
	return groups
}
