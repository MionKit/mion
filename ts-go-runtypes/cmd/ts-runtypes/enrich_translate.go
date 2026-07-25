package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/enrichgen"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// runGenTranslate implements the `enrich --translate <locale|all> [<src>]` verbs:
// scaffold (create-only), --update (the i18n reconcile), and --prune (strip
// carcasses from the locale's translation files). Translations are SRC-DERIVED:
// the desired side is emitted from the TYPE by the same EmitClosure walk as the
// friendly mirror, parameterized per locale (const prefix, output path, plural
// arms, sibling refs) — the friendly mirror is read for DISCOVERY only (which
// types to emit), never for generation content.
func runGenTranslate(translateValue string, positional []string, update, prune bool, genDirFlag, tsconfigFlag string) {
	tsconfigPath, parsed := resolveEnrichProject(tsconfigFlag)
	config, sourceMirrors := translateTargets(positional, genDirFlag, tsconfigPath, parsed)
	locales := resolveTranslateLocales(translateValue, config)
	// The i18n root is a conventional dir under genDir — self-document it the
	// moment the translate lane touches it.
	ensureFamilyReadme(config, defaultI18nDirName)

	// --prune is a pure carcass sweep over the locale files — it never needs the
	// Program, so it runs (and exits) before any program building.
	if prune {
		pruned := 0
		for _, locale := range locales {
			for _, sourceMirror := range sourceMirrors {
				pruned += pruneMirrorFile(config.TranslationPathFor(locale, sourceMirror))
			}
		}
		fmt.Fprintf(os.Stderr, "enrich --translate --prune: %d orphan block(s) removed\n", pruned)
		os.Exit(0)
	}

	var written, skipped int
	for _, sourceMirror := range sourceMirrors {
		// OUTER loop per friendly mirror: one Program amortizes across all locales.
		specsByLocale, ok := buildTranslationSpecs(config, sourceMirror, locales)
		if !ok {
			skipped += len(locales)
			continue
		}
		for _, locale := range locales {
			for _, spec := range specsByLocale[locale] {
				var wrote bool
				if update {
					wrote = updateMirrorFile(spec)
				} else {
					wrote = writeMirrorFile(spec)
				}
				if wrote {
					written++
				} else {
					skipped++
				}
			}
		}
	}
	if written == 0 {
		fmt.Printf("enrich --translate: nothing to write — translation file(s) already up to date\n")
	}
	os.Exit(0)
}

// translateTargets resolves the enrich config + the friendly source mirror set
// for a translate invocation: `<src>` (a source .ts) maps to its friendly
// mirror; no positional walks every mirror under the friendly family root.
func translateTargets(positional []string, genDirFlag, tsconfigPath string, parsed *program.InferredConfig) (enrichConfig, []string) {
	if len(positional) > 0 {
		src := tspath.NormalizePath(mustAbs(positional[0]))
		config := resolveEnrichConfig(src, genDirFlag, tsconfigPath, parsed)
		return config, []string{config.MirrorPath(familyFriendly, src)}
	}
	cwd, err := os.Getwd()
	if err != nil {
		fatal("enrich --translate: getwd: %v", err)
	}
	config := resolveEnrichConfig(tspath.NormalizePath(filepath.Join(cwd, "_")), genDirFlag, tsconfigPath, parsed)
	sourceMirrors, err := collectMirrorFiles(filepath.Join(config.EnrichDir, familyFriendly))
	if err != nil {
		fatal("enrich --translate: %v", err)
	}
	return config, sourceMirrors
}

// resolveTranslateLocales expands the --translate value: a concrete tag is
// used as-is; `all` fans out over the tsconfig i18n.locales entries.
func resolveTranslateLocales(translateValue string, config enrichConfig) []string {
	if translateValue != "all" {
		return []string{translateValue}
	}
	if len(config.I18nLocales) == 0 {
		fatal("enrich --translate all: no locales configured — add i18n.locales to the ts-runtypes tsconfig plugin entry")
	}
	return config.I18nLocales
}

// translationDiscovery is what a translate run reads off a friendly mirror —
// DISCOVERY ONLY, never generation content: the breadcrumb resolves the src
// decl file the Program builds over, and each friendly const's type name says
// which types to re-emit from src.
type translationDiscovery struct {
	declFile  string
	typeNames []string
}

// discoverTranslationTypes parses one friendly mirror for its src decl file +
// the type names of its friendly consts (translation-named consts are never
// sources; a const without a type name is skipped with a stderr note).
// ok=false (with a stderr note) when the mirror is missing, unparseable,
// breadcrumb-less, or names no types.
func discoverTranslationTypes(sourceMirror string) (translationDiscovery, bool) {
	sourceBytes, err := os.ReadFile(sourceMirror)
	if err != nil {
		fmt.Fprintf(os.Stderr, "enrich --translate: skipping %s: %v\n", sourceMirror, err)
		return translationDiscovery{}, false
	}
	index, err := mirror.ParseMirror(sourceMirror, sourceBytes)
	if err != nil {
		fmt.Fprintf(os.Stderr, "enrich --translate: skipping %s: %v\n", sourceMirror, err)
		return translationDiscovery{}, false
	}
	breadcrumb, ok := index.Breadcrumb()
	if !ok {
		fmt.Fprintf(os.Stderr, "enrich --translate: skipping %s: no source breadcrumb\n", sourceMirror)
		return translationDiscovery{}, false
	}
	declFile := mirror.ResolveBreadcrumb(sourceMirror, breadcrumb)

	var typeNames []string
	seen := map[string]bool{}
	for _, friendlyConst := range index.FriendlyConstTypes() {
		if friendlyConst.TypeName == "" {
			fmt.Fprintf(os.Stderr, "enrich --translate: %s: skipping %s: no type name on its annotation\n",
				sourceMirror, friendlyConst.VarName)
			continue
		}
		if seen[friendlyConst.TypeName] {
			continue
		}
		seen[friendlyConst.TypeName] = true
		typeNames = append(typeNames, friendlyConst.TypeName)
	}
	if len(typeNames) == 0 {
		fmt.Fprintf(os.Stderr, "enrich --translate: skipping %s: no friendly consts with a type name\n", sourceMirror)
		return translationDiscovery{}, false
	}
	return translationDiscovery{declFile: declFile, typeNames: typeNames}, true
}

// buildTranslationSpecs runs the src-derived pipeline for one friendly mirror:
// discovery, ONE Program over the decl file (amortized across every locale of
// the run), then per locale a fresh EmitClosure — the TARGET locale drives the
// emitted plural arm set — transformed into locale-prefixed mirror.Specs
// grouped by decl file exactly like gen. ok=false (with a stderr note) when
// the mirror is unusable; the caller skips it.
func buildTranslationSpecs(config enrichConfig, sourceMirror string, locales []string) (map[string][]mirror.Spec, bool) {
	discovery, ok := discoverTranslationTypes(sourceMirror)
	if !ok {
		return nil, false
	}
	prog, res, err := buildProgram(discovery.declFile, config.Parsed, config.HashLength)
	if err != nil {
		fmt.Fprintf(os.Stderr, "enrich --translate: skipping %s: %v\n", sourceMirror, err)
		return nil, false
	}
	defer res.Close()

	// Resolve each type once — resolution is locale-independent; only the
	// emitted plural arms differ per locale, so EmitClosure runs PER LOCALE.
	type resolvedType struct {
		typeName string
		resolved *enrichment.Resolved
	}
	var resolvedTypes []resolvedType
	for _, typeName := range discovery.typeNames {
		resolved, resolveErr := enrichment.ResolveTypeRaw(prog, res.Checker(), res.Cache(), discovery.declFile, typeName)
		if resolveErr != nil {
			fmt.Fprintf(os.Stderr, "enrich --translate: %s: skipping type %s: %v\n", sourceMirror, typeName, resolveErr)
			continue
		}
		// The rt$ prefix is RESERVED for enrichment meta keys (see gen).
		if collisions := enrichment.ReservedPropertyCollisions(resolved.Node, resolved.Resolve); len(collisions) > 0 {
			fatal("enrich --translate: %s: property %s collides with the reserved enrichment meta prefix 'rt$' — rename the property or exclude the type from enrichment", typeName, strings.Join(collisions, ", "))
		}
		resolvedTypes = append(resolvedTypes, resolvedType{typeName: typeName, resolved: resolved})
	}
	if len(resolvedTypes) == 0 {
		fmt.Fprintf(os.Stderr, "enrich --translate: skipping %s: no resolvable types\n", sourceMirror)
		return nil, false
	}

	specsByLocale := make(map[string][]mirror.Spec, len(locales))
	for _, locale := range locales {
		var closure []enrichment.NamedConst
		seenVar := map[string]bool{}
		for _, item := range resolvedTypes {
			for _, named := range enrichment.EmitClosure(item.resolved.Node, enrichment.ClosureOptions{
				TypeName:  item.typeName,
				Resolve:   item.resolved.Resolve,
				DeclFiles: item.resolved.DeclFiles,
				// The TARGET locale drives the plural arm set of the emitted scaffolds.
				SourceLocale: locale,
			}) {
				if seenVar[named.FriendlyVar] {
					continue // two roots reached the same named type — one const app-wide
				}
				seenVar[named.FriendlyVar] = true
				closure = append(closure, named)
			}
		}
		specsByLocale[locale] = translationSpecs(config, locale, closure, discovery.declFile)
	}
	return specsByLocale, true
}

// translationSpecs transforms one locale's closure into its mirror.Specs: the
// four locale parameters applied to the ordinary gen pipeline. Vars are
// locale-prefixed, sibling const references in every body are renamed to their
// locale twins (`home: friendlyAddress` → `home: pl_friendlyAddress`), each
// decl-file group targets the locale sibling of that file's friendly mirror,
// and cross-file value imports resolve to locale siblings via MirrorPathFor.
// The breadcrumb is the normal src type import (SourceFile = the decl file).
// Mock halves ride along untouched — WantMock is false, nothing reads them.
func translationSpecs(config enrichConfig, locale string, closure []enrichment.NamedConst, fallbackDeclFile string) []mirror.Spec {
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
		return config.TranslationPathFor(locale, config.MirrorPath(familyFriendly, declFile))
	}
	var specs []mirror.Spec
	for _, group := range enrichgen.GroupByDeclFile(transformed, fallbackDeclFile, false) {
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

// specForMirrorPath finds the spec targeting mirrorPath, or nil (the friendly
// mirror was skipped, or that group's home is another translation file).
func specForMirrorPath(specs []mirror.Spec, mirrorPath string) *mirror.Spec {
	for i := range specs {
		if specs[i].MirrorPath == mirrorPath {
			return &specs[i]
		}
	}
	return nil
}

// translationFinding is one `enrich --translate --no-emit` completeness finding.
type translationFinding struct {
	File     string
	Severity enrichment.Severity
	Code     string
	Message  string
}

// todoBlankPattern counts unfilled template leaves (`: ”` — a @todo blank) in
// a translation file. Rough by design: the completeness gate reports work
// remaining, it does not parse.
var todoBlankPattern = regexp.MustCompile(`:\s*''`)

// runCheckTranslate implements `enrich --translate --no-emit <locale|all>`: the
// non-writing completeness gate. Findings: TR001 missing translation file,
// TR002 unfilled @todo blanks, TR003 out of date vs the src type (a src-derived
// reconcile would change it), TR004 orphan carcasses awaiting --prune.
// Severity is Warning unless tsconfig i18n.strict is true (then everything is
// an Error and the exit code drives CI).
func runCheckTranslate(translateValue string, genDirFlag, tsconfigFlag string) {
	cwd, err := os.Getwd()
	if err != nil {
		fatal("enrich --translate --no-emit: getwd: %v", err)
	}
	tsconfigPath, parsed := resolveEnrichProject(tsconfigFlag)
	config := resolveEnrichConfig(tspath.NormalizePath(filepath.Join(cwd, "_")), genDirFlag, tsconfigPath, parsed)
	locales := resolveTranslateLocales(translateValue, config)
	sourceMirrors, err := collectMirrorFiles(filepath.Join(config.EnrichDir, familyFriendly))
	if err != nil {
		fatal("enrich --translate --no-emit: %v", err)
	}

	severity := enrichment.Warning
	if config.I18nStrict {
		severity = enrichment.Error
	}

	var findings []translationFinding
	checkedFiles := 0
	for _, sourceMirror := range sourceMirrors {
		// One Program + closure per friendly mirror, specs per locale. A mirror
		// that can't be processed (unreadable / markerless / unresolvable) was
		// already noted on stderr; its targets still count as checked and get the
		// file-local findings (TR001/TR002/TR004) — just no TR003.
		specsByLocale, _ := buildTranslationSpecs(config, sourceMirror, locales)
		for _, locale := range locales {
			translationPath := config.TranslationPathFor(locale, sourceMirror)
			checkedFiles++
			spec := specForMirrorPath(specsByLocale[locale], translationPath)
			findings = append(findings, checkTranslationFile(locale, translationPath, spec, severity)...)
		}
	}
	sort.SliceStable(findings, func(left, right int) bool {
		if findings[left].File != findings[right].File {
			return findings[left].File < findings[right].File
		}
		return findings[left].Code < findings[right].Code
	})

	hasError := false
	for _, finding := range findings {
		if finding.Severity == enrichment.Error {
			hasError = true
		}
		fmt.Printf("%s: [%s %s] %s\n", finding.File, finding.Code, finding.Severity.String(), finding.Message)
	}
	fmt.Fprintf(os.Stderr, "enrich --translate --no-emit: %d translation file(s), %d finding(s)\n", checkedFiles, len(findings))
	if hasError {
		os.Exit(1)
	}
	os.Exit(0)
}

// checkTranslationFile produces the completeness findings for one translation
// target. spec is the already-built src-derived desired side for THIS file —
// nil when the friendly mirror couldn't be processed, which skips TR003 while
// the file-local findings (TR001/TR002/TR004) still run.
func checkTranslationFile(locale, translationPath string, spec *mirror.Spec, severity enrichment.Severity) []translationFinding {
	var findings []translationFinding

	translationBytes, err := os.ReadFile(translationPath)
	if err != nil {
		findings = append(findings, translationFinding{
			File: translationPath, Severity: severity, Code: "TR001",
			Message: fmt.Sprintf("missing translation for locale %q — run: ts-runtypes enrich --translate %s", locale, locale),
		})
		return findings
	}

	if blanks := len(todoBlankPattern.FindAllString(string(translationBytes), -1)); blanks > 0 {
		findings = append(findings, translationFinding{
			File: translationPath, Severity: severity, Code: "TR002",
			Message: fmt.Sprintf("%d unfilled @todo blank template(s) — untranslated leaves fall through to the source language", blanks),
		})
	}

	// TR003 — a dry-run src-derived reconcile that would change the file means
	// the source type moved since the last --translate --update.
	if spec != nil {
		if _, changed, reconcileErr := mirror.Reconcile(*spec, translationBytes, readSourceFile); reconcileErr == nil && changed {
			findings = append(findings, translationFinding{
				File: translationPath, Severity: severity, Code: "TR003",
				Message: fmt.Sprintf("out of date vs %s — run: ts-runtypes enrich --translate %s --update", spec.SourceFile, locale),
			})
		}
	}

	if orphans := strings.Count(string(translationBytes), "@rtOrphan"); orphans > 0 {
		findings = append(findings, translationFinding{
			File: translationPath, Severity: severity, Code: "TR004",
			Message: fmt.Sprintf("%d orphan carcass(es) awaiting review — restore or strip with enrich --translate %s --prune", orphans, locale),
		})
	}
	return findings
}
