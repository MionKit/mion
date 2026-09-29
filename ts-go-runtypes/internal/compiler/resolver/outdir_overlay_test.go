package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// TestGenerate_OutDirFollowsTheTsconfigNotTheOverlay: a dev server's setSources roots every project file, a root
// `vite.config.ts` included. The inferred folder must stay `<include dir>/.mion`, as the build start wrote it,
// instead of climbing to the project root after the first edit.
func TestGenerate_OutDirFollowsTheTsconfigNotTheOverlay(t *testing.T) {
	dir := tspath.NormalizePath(t.TempDir())
	writeDisk(t, tspath.ResolvePath(dir, "tsconfig.json"), `{"compilerOptions": {"strict": true, "noEmit": true, "types": []}, "include": ["src"]}`)
	source := `import {getRunTypeId} from '@mionjs/run-types';
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`
	writeDisk(t, tspath.ResolvePath(dir, "src/a.ts"), source)
	writeDisk(t, tspath.ResolvePath(dir, "vite.config.ts"), "export default {};\n")

	r := resolver.NewServer(resolver.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	t.Cleanup(r.Close)
	if resp := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: withRealMarker(t, map[string]string{"src/a.ts": source, "vite.config.ts": "export default {};\n"}),
	}); resp.Error != "" {
		t.Fatalf("setSources: %s", resp.Error)
	}
	resp := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if resp.Error != "" {
		t.Fatalf("generate: %s", resp.Error)
	}
	if want := tspath.ResolvePath(dir, "src/.mion"); tspath.NormalizePath(resp.OutDir) != want {
		t.Fatalf("outDir = %s, want %s", resp.OutDir, want)
	}
}
