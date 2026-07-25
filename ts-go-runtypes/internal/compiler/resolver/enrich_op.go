package resolver

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
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
	if request.TypeName == "" {
		return protocol.Response{Error: "enrich: no type name"}
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

	// Reconcile reads sibling sources for cross-file value imports through the
	// Program FS, so the daemon never touches disk (parity with the CLI, which
	// injects an os-backed reader).
	readSource := func(path string) (string, error) {
		if content, ok := sess.Program.FS.ReadFile(path); ok {
			return content, nil
		}
		return "", fmt.Errorf("enrich: cannot read %s", path)
	}

	var response protocol.Response
	for _, file := range request.Files {
		absPath := tspath.ResolvePath(cwd, file)
		cfg := enrichgen.ResolveConfig(absPath, request.GenDir, sess.opts.TsconfigPath, parsed, enrichgen.PluginSettings{})

		specs, _, planErr := enrichgen.Plan(sess.Program, sess.checker, sess.cache, absPath, request.TypeName, "", wantFriendly, wantMock, cfg)
		if planErr != nil {
			// A demanded type that no longer resolves: skip it. The scan would not
			// have demanded a type it cannot resolve; a transient half-typed edit
			// heals on the next pass.
			continue
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
	}
	return response
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
