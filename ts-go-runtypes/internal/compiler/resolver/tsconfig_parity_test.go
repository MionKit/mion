package resolver_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// The parity oracle — the architectural verification of "one tsconfig, one
// behavior": one on-disk fixture scanned through the BUILD lane (program.New +
// resolver.New) and the DAEMON lane (NewServer + OpSetSources, identical file
// content) must yield identical site kinds and reflection ids. Before the
// wholesale-adoption fix the daemon hardcoded its options (cherry-picking four
// resolution fields), so any option-sensitive type diverged between the lanes.
//
// Matrix rows cover a bundler config, module/moduleResolution node16, a
// lib-sensitive type (lib with ESNext.Temporal), and strict: false. Fixtures
// carry BOTH marker shapes — static getRunTypeId<T>() and value-first
// getRunTypeId(v) — with id equality asserted across shapes AND lanes (the
// marker coverage rule; pattern: TestAtomic_FormEquivalence).

const parityModelsSrc = `export interface ParityUser {
	id: string;
	name?: string;
	count: number;
}
`

// parityConsumerSrc pins both getRunTypeId call shapes plus a function-family
// site over the same T. The './models.js' specifier resolves under bundler AND
// node16 resolution (the .js → .ts remap), so every matrix row shares it.
const parityConsumerSrc = `import {getRunTypeId, createValidateFn} from '@ts-runtypes/core';
import type {ParityUser} from './models.js';

// static getRunTypeId<T>()
getRunTypeId<ParityUser>();

// value-first getRunTypeId(value)
declare const sample: ParityUser;
getRunTypeId(sample);

export const validateUser = createValidateFn<ParityUser>();
`

// parityTemporalSrc is the lib-sensitive row: Temporal only exists when the
// config's lib loads ESNext.Temporal — a lane that ignored lib degraded it to
// any (false TMP001).
const parityTemporalSrc = `import {getRunTypeId, createValidateFn} from '@ts-runtypes/core';

// static getRunTypeId<T>()
getRunTypeId<Temporal.PlainDate>();

// value-first getRunTypeId(value)
declare const sample: Temporal.PlainDate;
getRunTypeId(sample);

export const validatePlain = createValidateFn<Temporal.PlainDate>();
`

type parityLane struct {
	sites    []protocol.Site
	kindByID map[string]protocol.ReflectionKind
}

func scanParityLanes(t *testing.T, tsconfig, consumerSrc string, extraFiles map[string]string) (build, daemon parityLane) {
	t.Helper()
	dir := tspath.NormalizePath(t.TempDir())

	// The real marker package rides the same map both lanes consume: written
	// to disk for the build lane, sent as sources for the daemon lane.
	overlay := withRealMarker(t, map[string]string{"consumer.ts": consumerSrc})
	for name, content := range extraFiles {
		overlay[name] = content
	}
	writeDisk(t, tspath.ResolvePath(dir, "tsconfig.json"), tsconfig)
	for name, content := range overlay {
		writeDisk(t, tspath.ResolvePath(dir, name), content)
	}

	scan := func(r *resolver.Session, lane string) parityLane {
		resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}, IncludeRunTypes: true})
		if resp.Error != "" {
			t.Fatalf("%s lane scanFiles: %s", lane, resp.Error)
		}
		for _, diagnostic := range resp.Diagnostics {
			if diagnostic.Code == diagnostics.CodeTemporalNotLoaded || diagnostic.Code == diagnostics.CodeMarkerAnyFromUnresolvedImport {
				t.Fatalf("%s lane emitted %s — the config was not honored: %+v", lane, diagnostic.Code, diagnostic)
			}
		}
		return parityLane{sites: resp.Sites, kindByID: kindByID(resp)}
	}

	// Build lane: the Program comes from the tsconfig itself (program.New;
	// the path is pre-resolved, as main's single resolution seam does).
	buildProg, err := program.New(program.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	if err != nil {
		t.Fatalf("build lane program.New: %v", err)
	}
	buildResolver, err := resolver.New(buildProg, resolver.Options{Cwd: dir})
	if err != nil {
		t.Fatalf("build lane resolver.New: %v", err)
	}
	t.Cleanup(buildResolver.Close)
	build = scan(buildResolver, "build")

	// Daemon lane: the real server path (NewServer -> OpSetSources ->
	// dispatchSetSources), identical file content via the overlay.
	server := resolver.NewServer(resolver.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	t.Cleanup(server.Close)
	if resp := server.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: overlay}); resp.Error != "" {
		t.Fatalf("daemon lane setSources: %s", resp.Error)
	}
	daemon = scan(server, "daemon")
	return build, daemon
}

// assertLaneParity pins the oracle: both lanes agree on every site id and on
// the kind behind each id, and within each lane the two getRunTypeId shapes
// resolve to ONE reflection id (which also matches across lanes).
func assertLaneParity(t *testing.T, build, daemon parityLane) {
	t.Helper()
	if len(build.sites) != 3 || len(daemon.sites) != 3 {
		t.Fatalf("want 3 marker sites per lane (2 getRunTypeId shapes + createValidateFn); build=%d daemon=%d", len(build.sites), len(daemon.sites))
	}

	laneIDs := func(lane parityLane, name string) []string {
		var reflectIDs []string
		ids := make([]string, 0, len(lane.sites))
		for _, site := range lane.sites {
			ids = append(ids, site.ID)
			if site.FnId == "" {
				reflectIDs = append(reflectIDs, site.ID)
			}
		}
		// Marker coverage rule: static getRunTypeId<T>() and value-first
		// getRunTypeId(value) must share one reflection id within the lane.
		if len(reflectIDs) != 2 {
			t.Fatalf("%s lane: want 2 reflection getRunTypeId sites, got %d", name, len(reflectIDs))
		}
		if reflectIDs[0] != reflectIDs[1] {
			t.Errorf("%s lane: static vs value-first getRunTypeId diverged: %q vs %q", name, reflectIDs[0], reflectIDs[1])
		}
		sort.Strings(ids)
		return ids
	}

	buildIDs, daemonIDs := laneIDs(build, "build"), laneIDs(daemon, "daemon")
	if strings.Join(buildIDs, ",") != strings.Join(daemonIDs, ",") {
		t.Fatalf("lane site ids diverged:\n  build:  %v\n  daemon: %v", buildIDs, daemonIDs)
	}
	for _, id := range buildIDs {
		if build.kindByID[id] != daemon.kindByID[id] {
			t.Errorf("kind for %q diverged: build=%d daemon=%d", id, build.kindByID[id], daemon.kindByID[id])
		}
	}
}

func TestTsconfigParity_BuildLaneEqualsDaemonLane(t *testing.T) {
	rows := []struct {
		name       string
		tsconfig   string
		consumer   string
		extraFiles map[string]string
	}{
		{
			name: "bundler",
			tsconfig: `{"compilerOptions": {"module": "ESNext", "moduleResolution": "bundler",
				"target": "ES2022", "strict": true, "skipLibCheck": true, "noEmit": true, "types": []}}`,
			consumer:   parityConsumerSrc,
			extraFiles: map[string]string{"models.ts": parityModelsSrc},
		},
		{
			name: "node16",
			tsconfig: `{"compilerOptions": {"module": "node16", "moduleResolution": "node16",
				"target": "ES2022", "strict": true, "skipLibCheck": true, "noEmit": true, "types": []}}`,
			consumer:   parityConsumerSrc,
			extraFiles: map[string]string{"models.ts": parityModelsSrc},
		},
		{
			name: "temporal lib",
			tsconfig: `{"compilerOptions": {"module": "ESNext", "moduleResolution": "bundler",
				"target": "ES2022", "lib": ["ES2022", "ESNext.Temporal"], "strict": true,
				"skipLibCheck": true, "noEmit": true, "types": []}}`,
			consumer: parityTemporalSrc,
		},
		{
			name: "strict false",
			tsconfig: `{"compilerOptions": {"module": "ESNext", "moduleResolution": "bundler",
				"target": "ES2022", "strict": false, "skipLibCheck": true, "noEmit": true, "types": []}}`,
			consumer:   parityConsumerSrc,
			extraFiles: map[string]string{"models.ts": parityModelsSrc},
		},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			build, daemon := scanParityLanes(t, row.tsconfig, row.consumer, row.extraFiles)
			assertLaneParity(t, build, daemon)
		})
	}
}

// TestSetSources_TsconfigErrors pins the daemon error semantics: a NAMED config
// that is broken or missing fails the op loudly (CFG001-tagged), nothing named
// falls back, and a fixed config heals on the next setSources without a
// respawn (the parse error is never cached).
func TestSetSources_TsconfigErrors(t *testing.T) {
	sources := withRealMarker(t, map[string]string{"consumer.ts": "export const answer = 42;\n"})

	t.Run("named but broken fails the op, then heals once fixed", func(t *testing.T) {
		dir := tspath.NormalizePath(t.TempDir())
		configPath := tspath.ResolvePath(dir, "tsconfig.json")
		writeDisk(t, configPath, `this is not json at all {{{`)

		server := resolver.NewServer(resolver.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
		t.Cleanup(server.Close)

		resp := server.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: sources})
		if resp.Error == "" {
			t.Fatalf("setSources over a broken named tsconfig must fail the op")
		}
		if !strings.Contains(resp.Error, diagnostics.CodeTsconfigLoadFailed) {
			t.Errorf("op error should carry %s for lint hosts; got %q", diagnostics.CodeTsconfigLoadFailed, resp.Error)
		}

		writeDisk(t, configPath, `{"compilerOptions": {"module": "ESNext", "moduleResolution": "bundler", "strict": true, "skipLibCheck": true, "types": []}}`)
		if resp := server.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: sources}); resp.Error != "" {
			t.Fatalf("fixed tsconfig must heal on the next setSources without a respawn; got %q", resp.Error)
		}
	})

	t.Run("named but missing fails the op", func(t *testing.T) {
		dir := tspath.NormalizePath(t.TempDir())
		server := resolver.NewServer(resolver.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
		t.Cleanup(server.Close)

		resp := server.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: sources})
		if resp.Error == "" || !strings.Contains(resp.Error, "tsconfig not found") {
			t.Fatalf("setSources naming a missing tsconfig must fail the op; got %q", resp.Error)
		}
	})

	t.Run("nothing named falls back to the inferred defaults", func(t *testing.T) {
		dir := tspath.NormalizePath(t.TempDir())
		server := resolver.NewServer(resolver.Options{Cwd: dir, SingleThreaded: true})
		t.Cleanup(server.Close)

		if resp := server.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: sources}); resp.Error != "" {
			t.Fatalf("no tsconfig named must keep the fallback working; got %q", resp.Error)
		}
	})
}
