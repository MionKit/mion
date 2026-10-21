package enrichgen

import (
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
)

// PlanTranslations is the per-locale planner behind OpEnrich's i18n sync, emitting what the CLI translate lane does.
// SCAFFOLD and SYNC only, never translated content: an untranslated leaf stays a blank falling back to the source language.
// It re-emits straight from the type, with no friendly-mirror discovery step, since the daemon already knows the decl file.
// Like PlanMany it SKIPS an unresolvable or rt$-colliding type and dedupes the closure by FriendlyVar.
func PlanTranslations(
	prog *program.Program,
	chk *checker.Checker,
	cache *runtype.Cache,
	absPath string,
	typeNames []string,
	locale string,
	cfg Config,
) []mirror.Spec {
	var closure []enrichment.NamedConst
	seenVar := map[string]bool{}
	for _, typeName := range typeNames {
		resolved, err := enrichment.ResolveTypeRaw(prog, chk, cache, absPath, typeName)
		if err != nil {
			continue
		}
		if collisions := enrichment.ReservedPropertyCollisions(resolved.Node, resolved.Resolve); len(collisions) > 0 {
			continue
		}
		for _, named := range enrichment.EmitClosure(resolved.Node, enrichment.ClosureOptions{
			TypeName:  typeName,
			Resolve:   resolved.Resolve,
			DeclFiles: resolved.DeclFiles,
			// The TARGET locale drives the plural arm set of the emitted scaffolds.
			SourceLocale: locale,
		}) {
			if seenVar[named.FriendlyVar] {
				continue
			}
			seenVar[named.FriendlyVar] = true
			closure = append(closure, named)
		}
	}
	if len(closure) == 0 {
		return nil
	}
	return TranslationSpecs(cfg, locale, closure, absPath)
}

// TranslationSpecs is the ordinary friendly pipeline with four locale parameters: prefixed vars, renamed sibling references
// in every body (`home: friendlyAddress` becomes `home: pl_friendlyAddress`), locale-sibling mirror paths, and no mock half.
// The ONE implementation: the CLI `enrich --i18n` lane and the daemon i18n sync both call it.
func TranslationSpecs(cfg Config, locale string, closure []enrichment.NamedConst, fallbackDeclFile string) []mirror.Spec {
	renames := make(map[string]string, len(closure))
	renameOrder := make([]string, 0, len(closure))
	for _, named := range closure {
		if _, ok := renames[named.FriendlyVar]; !ok {
			renameOrder = append(renameOrder, named.FriendlyVar)
		}
		renames[named.FriendlyVar] = mirror.TranslationVarName(locale, named.FriendlyVar)
	}

	varDeclFile := make(map[string]string, len(closure))
	transformed := make([]enrichment.NamedConst, 0, len(closure))
	for _, named := range closure {
		declFile := named.DeclFile
		if declFile == "" {
			declFile = fallbackDeclFile
		}
		body := []byte(named.Friendly)
		for _, oldVar := range renameOrder {
			body = mirror.RenameIdentifierAll(body, oldVar, renames[oldVar])
		}
		named.FriendlyVar = renames[named.FriendlyVar]
		named.Friendly = string(body)
		transformed = append(transformed, named)
		varDeclFile[named.FriendlyVar] = declFile
	}

	mirrorPathFor := func(declFile string) string {
		return cfg.TranslationPathFor(locale, cfg.MirrorPath(FamilyFriendly, declFile))
	}
	var specs []mirror.Spec
	for _, group := range GroupByDeclFile(transformed, fallbackDeclFile, false) {
		specs = append(specs, mirror.Spec{
			MirrorPath:    mirrorPathFor(group.DeclFile),
			SourceFile:    group.DeclFile,
			Consts:        group.Consts,
			VarDeclFile:   varDeclFile,
			WantFriendly:  true,
			WantMock:      false,
			MirrorPathFor: mirrorPathFor,
		})
	}
	return specs
}
