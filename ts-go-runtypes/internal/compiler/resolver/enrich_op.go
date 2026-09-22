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

// dispatchEnrich answers OpEnrich, the daemon face of the enrichment sync, so a bundler plugin can
// scaffold / reconcile the FriendlyText / MockData mirrors over the warm connection instead of spawning.
// It NEVER writes: it returns the computed mirror CONTENT (EnrichFiles) for the caller to write under its
// own HMR-suppression window. It shares enrichgen.PlanMany + mirror.Scaffold / Reconcile with the CLI
// verb, so the two produce byte-identical mirrors. The wire carries only the EVENT (request.Files, empty
// meaning the whole program); every piece of CONFIG is session state loaded at spawn, the output root
// through resolveOutDir (flag > tsconfig genDir > inferred), so enrich and generate always agree. The op
// is always a SYNC: reconcile an existing mirror (value-preserving), scaffold a missing one, return the
// hygiene worklist alongside the content.
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

	// i18n sync config (spawn-time): the target locales whose translation mirrors stay in sync (SCAFFOLD +
	// SYNC only, never translated content) and the source-authoring locale driving the friendly scaffold's
	// plural arms. Gated on Options.EnrichI18n, so a session without the opt-in stays inert even when the
	// tsconfig lists locales.
	pluginSettings := enrichgen.PluginSettings{}
	if sess.opts.EnrichI18n {
		pluginSettings.I18n = &enrichgen.I18nSettings{
			SourceLocale: sess.opts.EnrichSourceLocale,
			Locales:      sess.opts.EnrichLocales,
		}
	}

	// Handed to ResolveConfig in its flag-precedence slot, the same value OpGenerate resolves, so the
	// mirror tree and the generated-modules tree never disagree.
	genDir := sess.resolveOutDir()

	// Reconcile reads sibling sources for cross-file value imports through the Program FS, so the daemon
	// never touches disk; the CLI injects an os-backed reader instead.
	readSource := func(path string) (string, error) {
		if content, ok := sess.Program.FS.ReadFile(path); ok {
			return content, nil
		}
		return "", fmt.Errorf("enrich: cannot read %s", path)
	}

	// demanded is the named types the session's markers actually requested, every cache node with a TypeName.
	demanded := map[string]bool{}
	for _, node := range sess.cache.Dump() {
		if node != nil && node.TypeName != "" {
			demanded[node.TypeName] = true
		}
	}

	// The whole-program pass (empty Files) scaffolds a mirror even for a demanded type declared in a file
	// with no marker call.
	targetFiles := request.Files
	if len(targetFiles) == 0 {
		targetFiles = sess.programSourceFiles()
	}

	var response protocol.Response
	for _, file := range targetFiles {
		absPath := tspath.ResolvePath(cwd, file)
		cfg := enrichgen.ResolveConfig(absPath, genDir, sess.opts.TsconfigPath, parsed, pluginSettings)

		// PlanMany merges them into one per-family spec set, skipping an unresolvable or colliding type: a
		// transient half-typed edit must not abort the sync.
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
			// The hygiene worklist is informational in dev; the plugin's production gate fails on its
			// Error-severity entries.
			response.Diagnostics = append(response.Diagnostics, enrichgen.HygieneDiagnostics(content, spec.MirrorPath, mockFamily)...)
		}

		// cfg.I18nLocales is empty unless the session opted in, so the translation-mirror sync is inert then.
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

// demandedExportedTypes is the (demanded type NAME → source file) mapping the plugin cannot do itself:
// the EXPORTED types absPath declares that are also demanded, in declaration order.
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

// programSourceFiles skips declaration files, as scanAllProgramFiles does: the largest ASTs, and nothing a pass reads.
func (sess *Session) programSourceFiles() []string {
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

// materializeMirror computes one mirror's desired content, the SYNC semantic: value-preserving
// property-merge Reconcile for an existing mirror, create-only Scaffold for a missing or empty one (the
// CLI's updateMirrorFile fallback shape). Disk-free, existing content and sibling sources are injected.
// On a reconcile failure the existing content comes back unchanged, so the caller writes a stable value.
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

// ensureInferredConfig lazily parses and caches the session's tsconfig, so the enrich lane resolves
// rootDir / genDir exactly as the build does; (nil, nil) means no config was named and the fixed inferred
// defaults apply. Also freezes configDeclarationRoots, the `.d.ts` subset every setSources-built Program
// unions into its roots.
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
