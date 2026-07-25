package resolver

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/enrichgen"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// dispatchEnrich answers OpEnrich: the daemon face of the CLI `enrich` verb, so a
// bundler plugin can scaffold / reconcile the FriendlyText / MockData mirrors over
// the warm connection instead of spawning. It NEVER writes — it returns the
// computed mirror CONTENT (EnrichFiles) for the caller to write under its own
// HMR-suppression window. It shares enrichgen.Plan + mirror.Scaffold / Reconcile
// with the CLI verb, so the two produce byte-identical mirrors (the parity test).
//
// EnrichNoEmit=true returns Diagnostics only (the shared tag-hygiene pass over the
// source's existing mirrors); false returns EnrichFiles + the freshly-scaffolded
// @todo worklist diagnostics. request.GenDir is the resolved output root the
// mirrors hang off; the Enrich* flags mirror the CLI --friendly / --mock / --update.
func (sess *Session) dispatchEnrich(request protocol.Request) protocol.Response {
	if sess.Program == nil {
		return protocol.Response{Error: "enrich: no program loaded"}
	}
	cwd := tspath.NormalizePath(sess.Program.TS.GetCurrentDirectory())
	parsed, err := sess.ensureInferredConfig(cwd)
	if err != nil {
		return protocol.Response{Error: fmt.Sprintf("enrich: tsconfig: %v", err)}
	}

	wantFriendly, wantMock := request.EnrichFriendly, request.EnrichMock
	if !wantFriendly && !wantMock {
		wantFriendly, wantMock = true, true
	}

	// Plugin i18n sync knobs (the enrich.i18n object): the target locales whose
	// per-locale translation mirrors to keep in sync (SCAFFOLD + SYNC only, never
	// translated content), and the source-authoring locale that drives the friendly
	// scaffold's plural arms. Threaded through ResolveConfig so cfg.I18nLocales /
	// cfg.SourceLocale carry them. Absent for CLI-parity (TypeName-driven) calls.
	pluginSettings := enrichgen.PluginSettings{}
	if len(request.EnrichLocales) > 0 || request.EnrichSourceLocale != "" {
		pluginSettings.I18n = &enrichgen.I18nSettings{
			SourceLocale: request.EnrichSourceLocale,
			Locales:      request.EnrichLocales,
		}
	}

	// Reconcile reads sibling sources for cross-file value imports through the
	// Program FS, so the daemon never touches disk (parity with the CLI, which
	// injects an os-backed reader).
	readSource := func(path string) (string, error) {
		if content, ok := sess.Program.FS.ReadFile(path); ok {
			return content, nil
		}
		return "", fmt.Errorf("enrich: cannot read %s", path)
	}

	// demandedTypeNames is the set of named types the session's markers actually
	// requested — every cache node carrying a TypeName. Only the TypeName == ""
	// plugin-sync path consults it, so it is computed lazily once.
	var demanded map[string]bool
	demandedTypeNames := func() map[string]bool {
		if demanded == nil {
			demanded = map[string]bool{}
			for _, node := range sess.cache.Dump() {
				if node != nil && node.TypeName != "" {
					demanded[node.TypeName] = true
				}
			}
		}
		return demanded
	}

	// targetFiles: the caller's Files, or — for the whole-program plugin-sync pass
	// (empty Files, no TypeName) — every non-declaration source file, so a mirror is
	// scaffolded even for a demanded type declared in a file with no marker call.
	targetFiles := request.Files
	if len(targetFiles) == 0 && request.TypeName == "" {
		targetFiles = sess.enrichProgramSourceFiles()
	}

	var response protocol.Response
	for _, file := range targetFiles {
		absPath := tspath.ResolvePath(cwd, file)
		cfg := enrichgen.ResolveConfig(absPath, request.GenDir, sess.opts.TsconfigPath, parsed, pluginSettings)

		// Resolve which type name(s) drive this file's mirrors. An explicit
		// TypeName is the CLI-parity single-type path (enrichgen.Plan, which errors
		// on an unresolvable name); an empty TypeName is the demand-scoped plugin
		// path — the EXPORTED types this file declares that are ALSO demanded (the
		// server-side typeName → source-file mapping the plugin cannot do itself),
		// merged into one per-family spec set via PlanMany.
		var specs []mirror.Spec
		var typeNames []string
		if request.TypeName != "" {
			built, _, planErr := enrichgen.Plan(sess.Program, sess.checker, sess.cache, absPath, request.TypeName, "", wantFriendly, wantMock, cfg)
			if planErr != nil {
				// A demanded type that no longer resolves: skip it. The scan would not
				// have demanded a type it cannot resolve; a transient half-typed edit
				// heals on the next pass.
				continue
			}
			specs, typeNames = built, []string{request.TypeName}
		} else {
			typeNames = sess.demandedExportedTypes(absPath, demandedTypeNames())
			if len(typeNames) == 0 {
				continue
			}
			specs, _ = enrichgen.PlanMany(sess.Program, sess.checker, sess.cache, absPath, typeNames, "", wantFriendly, wantMock, cfg)
		}

		for _, spec := range specs {
			existing, _ := sess.Program.FS.ReadFile(spec.MirrorPath)
			mockFamily := spec.WantMock && !spec.WantFriendly

			if request.EnrichNoEmit {
				// Diagnostics-only: the shared tag-hygiene pass over the EXISTING
				// mirror (parity with the CLI `enrich <file> --no-emit`). A prod-build
				// drift gate additionally diffs the desired content it requests
				// without --no-emit.
				response.Diagnostics = append(response.Diagnostics, enrichgen.HygieneDiagnostics(existing, spec.MirrorPath, mockFamily)...)
				continue
			}

			content, added := materializeMirror(spec, existing, request.EnrichUpdate, readSource)
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
			// The freshly-scaffolded @todo worklist rides along (informational).
			response.Diagnostics = append(response.Diagnostics, enrichgen.HygieneDiagnostics(content, spec.MirrorPath, mockFamily)...)
		}

		// Per-locale translation-mirror sync (i18n). Emitting only — never in
		// --no-emit, where the plugin's prod-build drift gate instead diffs the
		// desired content it requests WITHOUT --no-emit. cfg.I18nLocales is empty
		// for CLI-parity calls, so this is inert unless enrich.i18n.locales is set.
		if !request.EnrichNoEmit {
			for _, locale := range cfg.I18nLocales {
				for _, spec := range enrichgen.PlanTranslations(sess.Program, sess.checker, sess.cache, absPath, typeNames, locale, cfg) {
					existing, _ := sess.Program.FS.ReadFile(spec.MirrorPath)
					content, added := materializeMirror(spec, existing, request.EnrichUpdate, readSource)
					response.EnrichFiles = append(response.EnrichFiles, protocol.EnrichFile{
						Path:    spec.MirrorPath,
						Content: content,
						Added:   added,
						Kind:    enrichgen.FamilyFriendly,
					})
				}
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

// materializeMirror computes one mirror's desired content: create-only Scaffold
// for a missing / empty mirror, property-merge Reconcile when update is set and
// the mirror already exists (the CLI's writeMirrorFile / updateMirrorFile split).
// Disk-free — existing content + sibling sources are injected. A create-only
// no-op (every requested export already present) returns the existing content
// unchanged so the caller writes / diffs a stable value.
func materializeMirror(spec mirror.Spec, existing string, update bool, readSource func(string) (string, error)) (content string, added bool) {
	added = existing == ""
	if update && existing != "" {
		out, _, err := mirror.Reconcile(spec, []byte(existing), readSource)
		if err != nil {
			return existing, false
		}
		return string(out), false
	}
	out, _, err := mirror.Scaffold(spec, existing)
	if err != nil || out == "" {
		// Scaffold failure, or a create-only no-op (every requested export already
		// present): return the existing content unchanged, nothing newly added.
		return existing, false
	}
	return out, added
}

// ensureInferredConfig lazily parses (and caches) the project tsconfig this
// session was configured with, so the enrich lane resolves rootDir / genDir
// exactly as the build does. (nil, nil) means no config was named — the fixed
// inferred defaults apply.
func (sess *Session) ensureInferredConfig(cwd string) (*program.InferredConfig, error) {
	if !sess.inferredConfigDone {
		inferredConfig, err := program.ParseInferredConfig(cwd, sess.opts.TsconfigPath)
		if err != nil {
			return nil, err
		}
		sess.inferredConfig = inferredConfig
		sess.inferredConfigDone = true
	}
	return sess.inferredConfig, nil
}
