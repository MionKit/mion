package program

import (
	"testing"
)

// Project references must not affect the resolver's program: with references
// honored, an import that lands in a referenced project's sources is redirected
// to that project's declaration OUTPUTS — absent in a dev loop — so the file
// (and every marker type reachable through it) silently drops out of the
// program. program.New drops references after parsing, so the import resolves
// to the on-disk source exactly like the bundler will at runtime.
func TestNew_IgnoresProjectReferences(t *testing.T) {
	files := map[string]string{
		// Referenced composite project with declaration outputs that were never built.
		"/virtual/refs/lib/tsconfig.json": `{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "allowImportingTsExtensions": true,
    "noEmit": false
  },
  "include": ["src"]
}`,
		"/virtual/refs/lib/src/user.ts": `export interface User {
  name: string;
}
`,
		// Main project references ../lib and imports its SOURCE file directly.
		"/virtual/refs/main/tsconfig.json": `{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src"],
  "references": [{"path": "../lib"}]
}`,
		"/virtual/refs/main/src/app.ts": `import {User} from '../../lib/src/user.ts';

export const owner: User = {name: 'ann'};
`,
	}

	prog, err := New(Options{
		Cwd:            "/virtual/refs/main",
		TsconfigPath:   "tsconfig.json",
		SingleThreaded: true,
		Overlay:        files,
	})
	if err != nil {
		t.Fatalf("program.New with project references failed: %v", err)
	}

	if prog.SourceFile("/virtual/refs/main/src/app.ts") == nil {
		t.Fatal("main project file missing from the program")
	}
	// The referenced project's SOURCE must be part of the program (not a
	// redirect to the unbuilt dist/user.d.ts, which would return nil here).
	if prog.SourceFile("/virtual/refs/lib/src/user.ts") == nil {
		t.Fatal("referenced project source was redirected to unbuilt outputs and dropped from the program")
	}
}
