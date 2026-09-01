package resolver

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/enrichgen"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// dispatchEnrich answers OpEnrich: the daemon face of the enrichment sync, so a
// bundler plugin can scaffold / reconcile the FriendlyText / MockData mirrors over
// the warm connection instead of spawning. It NEVER writes — it returns the
// computed mirror CONTENT (EnrichFiles) for the caller to write under its own
// HMR-suppression window. It shares enrichgen.PlanMany + mirror.Scaffold /
// Reconcile with the CLI verb, so the two produce byte-identical mirrors (the
// parity test).
//
// The wire carries only the EVENT (request.Files — empty = whole program); every
// piece of CONFIG is session state loaded at spawn (Options.EnrichFriendly/Mock,
// EnrichI18n + EnrichLocales/SourceLocale, and the output root via
// resolveOutDir — flag > tsconfig genDir > inferred — so enrich and generate
// always agree). The op is always a SYNC: reconcile an existing mirror
// (value-preserving), scaffold a missing one, and return the hygiene worklist
// alongside the content.
func (sess *Session) dispatchEnrich(request protocol.Request) protocol.Response {
	if sess.Program == nil {
		return protocol.Response{Error: "enrich: no program loaded"}
	}
	cwd := tspath.NormalizePath(sess.Program.TS.GetCurrentDirectory())
	parsed, err := sess.ensureInferredConfig(cwd)
	if err != nil {
		return protocol.Response{Error: fmt.Sprintf("enrich: tsconfig: %v", err)}
	}

	wantFriendly, wantMock := sess.opts.EnrichFriendly, sess.opts.EnrichMock
	if !wantFriendly && !wantMock {
		wantFriendly, wantMock = true, true
	}

	// i18n sync config (spawn-time): the target locales whose per-locale
	// translation mirrors to keep in sync (SCAFFOLD + SYNC only, never translated
	// content), and the source-authoring locale that drives the friendly
	// scaffold's plural arms. Threaded through ResolveConfig so cfg.I18nLocales /
	// cfg.SourceLocale carry them; gated on Options.EnrichI18n so a session
	// without the i18n opt-in stays inert even when the tsconfig lists locales.
	pluginSettings := enrichgen.PluginSettings{}
	if sess.opts.EnrichI18n {
		pluginSettings.I18n = &enrichgen.I18nSettings{
			SourceLocale: sess.opts.EnrichSourceLocale,
			Locales:      sess.opts.EnrichLocales,
		}
	}

	// The session-resolved output root, handed to ResolveConfig in its
	// flag-precedence slot — the same value OpGenerate resolves, so the mirror
	// tree and the generated-modules tree never disagree.
	genDir := sess.resolveOutDir()

	// Reconcile reads sibling sources for cross-file value imports through the
	// Program FS, so the daemon never touches disk (parity with the CLI, which
	// injects an os-backed reader).
	readSource := func(path string) (string, error) {
		if content, ok := sess.Program.FS.ReadFile(path); ok {
			return content, nil
		}
		return "", fmt.Errorf("enrich: cannot read %s", path)
	}

	// demanded is the set of named types the session's markers actually
	// requested — every cache node carrying a TypeName. The daemon owns the
	// (demanded type name → source file) mapping the plugin cannot do itself.
	demanded := map[string]bool{}
	for _, node := range sess.cache.Dump() {
		if node != nil && node.TypeName != "" {
			demanded[node.TypeName] = true
		}
	}

	// targetFiles: the caller's Files, or — for the whole-program sync pass
	// (empty Files) — every non-declaration source file, so a mirror is
	// scaffolded even for a demanded type declared in a file with no marker call.
	targetFiles := request.Files
	if len(targetFiles) == 0 {
		targetFiles = sess.enrichProgramSourceFiles()
	}

	var response protocol.Response
	for _, file := range targetFiles {
		absPath := tspath.ResolvePath(cwd, file)
		cfg := enrichgen.ResolveConfig(absPath, genDir, sess.opts.TsconfigPath, parsed, pluginSettings)

		// The EXPORTED types this file declares that are ALSO demanded, merged
		// into one per-family spec set via PlanMany (which skips an unresolvable /
		// colliding type — a transient half-typed edit must not abort the sync).
		typeNames := sess.demandedExportedTypes(absPath, demanded)
		if len(typeNames) == 0 {
			continue
		}
		specs, _ := enrichgen.PlanMany(sess.Program, sess.checker, sess.cache, absPath, typeNames, "", wantFriendly, wantMock, cfg)

		for _, spec := range specs {
			existing, _ := sess.Program.FS.ReadFile(spec.MirrorPath)
			mockFamily := spec.WantMock && !spec.WantFriendly

			content, added := materializeMirror(spec, existing, readSource)
			kind := enrichgen.FamilyFriendly
			if mockFamily {
				kind = enrichgen.FamilyMock
			}
			response.EnrichFiles = append(response.EnrichFiles, protocol.EnrichFile{
				Path:    spec.MirrorPath,
				Content: content,
				Added:   added,
				Kind:    kind,
			})
			// The freshly-scaffolded hygiene worklist rides along (informational for
			// dev; the plugin's production gate fails on its Error-severity entries).
			response.Diagnostics = append(response.Diagnostics, enrichgen.HygieneDiagnostics(content, spec.MirrorPath, mockFamily)...)
		}

		// Per-locale translation-mirror sync (i18n). cfg.I18nLocales is empty
		// unless the session opted in (Options.EnrichI18n), so this is inert
		// otherwise.
		for _, locale := range cfg.I18nLocales {
			for _, spec := range enrichgen.PlanTranslations(sess.Program, sess.checker, sess.cache, absPath, typeNames, locale, cfg) {
				existing, _ := sess.Program.FS.ReadFile(spec.MirrorPath)
				content, added := materializeMirror(spec, existing, readSource)
				response.EnrichFiles = append(response.EnrichFiles, protocol.EnrichFile{
					Path:    spec.MirrorPath,
					Content: content,
					Added:   added,
					Kind:    enrichgen.FamilyFriendly,
				})
			}
		}
	}
	return response
}

// demandedExportedTypes is the (demanded type NAME → source file) mapping the
// plugin cannot do itself: it returns the EXPORTED types absPath declares whose
// name is in the demanded set, in declaration order. Empty when the file declares
// no demanded type (a file with only undemanded types contributes no mirror).
func (sess *Session) demandedExportedTypes(absPath string, demanded map[string]bool) []string {
	sourceFile := sess.Program.SourceFile(absPath)
	if sourceFile == nil {
		return nil
	}
	var out []string
	for _, name := range enrichment.ExportedTypeNames(sourceFile) {
		if demanded[name] {
			out = append(out, name)
		}
	}
	return out
}

// enrichProgramSourceFiles lists every non-declaration source file in the
// Program — the target set for the whole-program plugin-sync pass (empty Files).
// Declaration files (.d.ts, incl. the lib) declare no enrichable project type and
// are the largest ASTs, so they are skipped, matching scanAllProgramFiles.
func (sess *Session) enrichProgramSourceFiles() []string {
	if sess.Program == nil || sess.Program.TS == nil {
		return nil
	}
	sourceFiles := sess.Program.TS.SourceFiles()
	files := make([]string, 0, len(sourceFiles))
	for _, sourceFile := range sourceFiles {
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		if name := sourceFile.FileName(); name != "" {
			files = append(files, name)
		}
	}
	return files
}

// materializeMirror computes one mirror's desired content — the SYNC semantic:
// property-merge Reconcile for an existing mirror (value-preserving), create-only
// Scaffold for a missing / empty one (the CLI's updateMirrorFile fallback shape).
// Disk-free — existing content + sibling sources are injected. On a reconcile
// failure the existing content is returned unchanged so the caller writes /
// diffs a stable value.
func materializeMirror(spec mirror.Spec, existing string, readSource func(string) (string, error)) (content string, added bool) {
	if existing != "" {
		out, _, err := mirror.Reconcile(spec, []byte(existing), readSource)
		if err != nil {
			return existing, false
		}
		return string(out), false
	}
	out, _, err := mirror.Scaffold(spec, existing)
	if err != nil || out == "" {
		return existing, false
	}
	return out, true
}

// ensureInferredConfig lazily parses (and caches) the project tsconfig this
// session was configured with, so the enrich lane resolves rootDir / genDir
// exactly as the build does. (nil, nil) means no config was named — the fixed
// inferred defaults apply. Also freezes configDeclarationRoots, the `.d.ts`
// subset every setSources-built Program unions into its roots.
func (sess *Session) ensureInferredConfig(cwd string) (*program.InferredConfig, error) {
	if !sess.inferredConfigDone {
		inferredConfig, err := program.ParseInferredConfig(cwd, sess.opts.TsconfigPath)
		if err != nil {
			return nil, err
		}
		sess.inferredConfig = inferredConfig
		sess.inferredConfigDone = true
		sess.configDeclarationRoots = inferredConfig.DeclarationFileNames()
	}
	return sess.inferredConfig, nil
}
