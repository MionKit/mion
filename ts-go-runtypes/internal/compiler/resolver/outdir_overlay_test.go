package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// TestGenerate_OutDirFollowsTheTsconfigNotTheOverlay: once setSources roots a root `vite.config.ts`, the folder must
// stay `<include dir>/.mion` rather than climb to the project root.
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

	session := resolver.NewServer(resolver.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	t.Cleanup(session.Close)
	if resp := session.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: withRealMarker(t, map[string]string{"src/a.ts": source, "vite.config.ts": "export default {};\n"}),
	}); resp.Error != "" {
		t.Fatalf("setSources: %s", resp.Error)
	}
	resp := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if resp.Error != "" {
		t.Fatalf("generate: %s", resp.Error)
	}
	if want := tspath.ResolvePath(dir, "src/.mion"); tspath.NormalizePath(resp.OutDir) != want {
		t.Fatalf("outDir = %s, want %s", resp.OutDir, want)
	}
}
