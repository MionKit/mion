package enrichgen

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
)

// Plan resolves typeName in absPath and builds its per-family mirror.Spec set; the caller runs Scaffold / Reconcile over them.
// Disk-free, so CLI and daemon compute identical mirrors: the CLI writes the result, the daemon returns it on the wire.
// declFiles is the files the closure spans, first appearance first; the CLI migrates each legacy mirror before writing.
// A non-empty out is the CLI --out override: every const collapses into one combined single-file spec.
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
	// A name that failed to resolve checked as `any`, and a mirror scaffolded from it would silently miss the degraded members.
	if unresolved := enrichment.UnresolvedNameRefs(prog, chk, absPath, typeName); len(unresolved) > 0 {
		return nil, nil, fmt.Errorf("%s: type reference %s did not resolve and checked as 'any' — fix the name or include the missing declaration in the tsconfig before enriching",
			typeName, strings.Join(unresolved, ", "))
	}
	// rt$ is RESERVED for enrichment meta keys, so a colliding property makes the scaffold unrepresentable.
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

	specs, declFiles = specsFromClosure(cfg, closure, absPath, out, wantFriendly, wantMock)
	return specs, declFiles, nil
}

// PlanMany merges the closures of several type names into ONE per-family spec set, what a combined `enrich --update` produces.
// It backs OpEnrich when no explicit type name is given, over every exported-and-demanded name a source file declares.
// Unlike Plan it SKIPS an unresolvable or rt$-colliding type: a transient half-typed edit must not abort a whole file's sync.
// Consts are deduplicated by FriendlyVar, so two roots sharing a named sub-type emit it once.
func PlanMany(
	prog *program.Program,
	chk *checker.Checker,
	cache *runtype.Cache,
	absPath string,
	typeNames []string,
	out string,
	wantFriendly, wantMock bool,
	cfg Config,
) (specs []mirror.Spec, declFiles []string) {
	var closure []enrichment.NamedConst
	seenVar := map[string]bool{}
	for _, typeName := range typeNames {
		resolved, err := enrichment.ResolveTypeRaw(prog, chk, cache, absPath, typeName)
		if err != nil {
			continue
		}
		// A degraded type must not sync a wrong mirror, nor abort the file's other types.
		if unresolved := enrichment.UnresolvedNameRefs(prog, chk, absPath, typeName); len(unresolved) > 0 {
			continue
		}
		if collisions := enrichment.ReservedPropertyCollisions(resolved.Node, resolved.Resolve); len(collisions) > 0 {
			continue
		}
		for _, named := range enrichment.EmitClosure(resolved.Node, enrichment.ClosureOptions{
			TypeName:     typeName,
			Resolve:      resolved.Resolve,
			DeclFiles:    resolved.DeclFiles,
			SourceLocale: cfg.SourceLocale,
		}) {
			if seenVar[named.FriendlyVar] {
				continue // two roots reached the same named type, one const app-wide
			}
			seenVar[named.FriendlyVar] = true
			closure = append(closure, named)
		}
	}
	return specsFromClosure(cfg, closure, absPath, out, wantFriendly, wantMock)
}

// specsFromClosure is the tail of Plan / PlanMany; the per-var decl-file map lets a referrer import a var homed elsewhere.
func specsFromClosure(cfg Config, closure []enrichment.NamedConst, absPath, out string, wantFriendly, wantMock bool) (specs []mirror.Spec, declFiles []string) {
	groups := GroupByDeclFile(closure, absPath, out != "")

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
	return specs, declFiles
}

// BuildSpecs builds one spec PER wanted family for a source-file group, each with a family-matched MirrorPathFor.
// That keeps a cross-file value import on a sibling of the SAME family; the out override collapses it into one file.
// No legacy-mirror migration happens here, that disk pre-step is the CLI's alone.
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

// WantedFamilies lists the families an enrich invocation targets, friendly first, matching the combined file's const order.
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

// DeclFileGroup is one mirror file's worth of consts, in topological (declared-before-use) order.
type DeclFileGroup struct {
	DeclFile string
	Consts   []enrichment.NamedConst
}

// GroupByDeclFile buckets a topologically-ordered closure by declaration file, keeping the closure's order inside a bucket.
// forceSingle collapses everything into one group keyed by fallbackFile, the --out override.
// Group order follows first appearance, which keeps a referenced type's file ahead of its referrer's.
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
