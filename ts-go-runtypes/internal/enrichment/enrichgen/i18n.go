package enrichgen

import (
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
)

// PlanTranslations is the disk-free per-locale planner behind the OpEnrich
// daemon op's i18n sync: given the demanded type names a source file declares and
// one target locale, it emits the locale-prefixed translation mirror specs whose
// Scaffold / Reconcile keep <genDir>/enriched/i18n/<locale>/... in sync with the
// source types. This is SCAFFOLD + SYNC only — it emits the same skeletons the
// CLI `enrich --translate <locale> [--update]` write lane does (the target locale
// drives the plural arm set), never any translated content: no LLM, no
// dictionary. Untranslated leaves stay `@todo` blanks that fall through to the
// source language at runtime, exactly as the CLI leaves them.
//
// It mirrors the CLI's buildTranslationSpecs → translationSpecs but skips the
// friendly-mirror DISCOVERY step: the daemon already knows the demanded type
// names + their decl file, so it re-emits straight from the type. Like PlanMany
// it SKIPS an unresolvable / rt$-colliding type (a transient half-typed edit must
// not abort the file's sync) and dedupes the closure by FriendlyVar.
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

// TranslationSpecs transforms one locale's closure into its mirror.Specs: the four
// locale parameters applied to the ordinary friendly pipeline. Vars are
// locale-prefixed, sibling const references in every body are renamed to their
// locale twins (`home: friendlyAddress` → `home: pl_friendlyAddress`), each
// decl-file group targets the locale sibling of that file's friendly mirror, and
// cross-file value imports resolve to locale siblings via MirrorPathFor. Mock
// halves ride nothing — WantMock is false. It is the ONE implementation: the CLI
// `enrich --i18n` lane and the daemon i18n sync both call it (no cmd duplicate).
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
