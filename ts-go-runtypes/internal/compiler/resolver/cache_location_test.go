package resolver

import (
	"path/filepath"
	"testing"
)

// TestCacheLocation pins the RT disk-cache enable+locate decision now that it
// follows TypeScript's incremental switch instead of a cacheDir knob:
//   - an explicit CacheDir override always wins (the internal RT_CACHE_DIR path);
//   - otherwise the cache is on only when the project is incremental AND
//     CacheFollowsIncremental is set, at <Cwd>/node_modules/.cache/ts-runtypes;
//   - everything else is off (empty result).
func TestCacheLocation(t *testing.T) {
	nodeModules := filepath.Join("/proj", "node_modules", ".cache", "ts-runtypes")
	tests := []struct {
		name        string
		opts        Options
		incremental bool
		want        string
	}{
		{"override path wins over everything", Options{CacheDir: "/tmp/rt", Cwd: "/proj"}, false, "/tmp/rt"},
		{"override path wins even when following incremental", Options{CacheDir: "/tmp/rt", Cwd: "/proj", CacheFollowsIncremental: true}, true, "/tmp/rt"},
		{"follow + incremental → node_modules default", Options{Cwd: "/proj", CacheFollowsIncremental: true}, true, nodeModules},
		{"follow + non-incremental → off", Options{Cwd: "/proj", CacheFollowsIncremental: true}, false, ""},
		{"not following + incremental → off (explicit disable)", Options{Cwd: "/proj"}, true, ""},
		{"not following + non-incremental → off", Options{Cwd: "/proj"}, false, ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := cacheLocation(test.opts, test.incremental); got != test.want {
				t.Errorf("cacheLocation = %q, want %q", got, test.want)
			}
		})
	}
}
