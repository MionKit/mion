package apitypesmeta

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

const root = "/virtual/pkg"

func read(files map[string]string) PackageInfo {
	overlay := map[string]string{}
	for rel, text := range files {
		overlay[root+"/"+rel] = text
	}
	return ReadPackage(root, program.NewOverlayFS(osvfs.FS(), overlay))
}

// TestReadPackage_TypesOnly: only a package with no way to load JavaScript is types-only.
func TestReadPackage_TypesOnly(t *testing.T) {
	cases := []struct {
		name      string
		files     map[string]string
		typesOnly bool
	}{
		{"types only", map[string]string{"package.json": `{"types": "./index.d.ts"}`}, true},
		{"exports types only", map[string]string{"package.json": `{"exports": {".": {"types": "./index.d.ts"}, "./*": {"types": "./*.d.ts"}}}`}, true},
		{"exports a .d.ts string", map[string]string{"package.json": `{"exports": "./index.d.ts"}`}, true},
		{"exports null", map[string]string{"package.json": `{"types": "./index.d.ts", "exports": null}`}, true},
		{"main", map[string]string{"package.json": `{"types": "./index.d.ts", "main": "./index.js"}`}, false},
		{"module", map[string]string{"package.json": `{"module": "./index.mjs"}`}, false},
		{"browser", map[string]string{"package.json": `{"browser": "./index.js"}`}, false},
		{"exports default", map[string]string{"package.json": `{"exports": {".": {"types": "./index.d.ts", "default": "./index.js"}}}`}, false},
		{"exports a .js string", map[string]string{"package.json": `{"exports": "./index.js"}`}, false},
		{"exports array with js", map[string]string{"package.json": `{"exports": {".": ["./index.d.ts", "./index.js"]}}`}, false},
		{"root index.js with no main", map[string]string{"package.json": `{"types": "./index.d.ts"}`, "index.js": "export {};"}, false},
		{"root index.mjs with no main", map[string]string{"package.json": `{"types": "./index.d.ts"}`, "index.mjs": "export {};"}, false},
	}
	for _, testCase := range cases {
		if got := read(testCase.files).TypesOnly; got != testCase.typesOnly {
			t.Errorf("%s: TypesOnly = %v, want %v", testCase.name, got, testCase.typesOnly)
		}
	}
}

// TestReadPackage_Marker: a usable marker, and every way one is refused.
func TestReadPackage_Marker(t *testing.T) {
	pkg := `{"types": "./index.d.ts", "mion": {"apiTypes": "./mion-api.json"}}`
	good := read(map[string]string{"package.json": pkg, "mion-api.json": `{"format": 1, "package": "@acme/api", "compiler": "1.0.0", "buildVersion": "v"}`})
	if good.Marker == nil || good.Marker.Package != "@acme/api" || good.Problem != "" {
		t.Fatalf("a valid marker must read: %+v", good)
	}
	refused := []struct{ name, files, problem string }{
		{"no field", "", "no `mion.apiTypes` field"},
		{"missing file", "-", "is missing"},
		{"not json", "{nope", "not a mion API marker"},
		{"no package", `{"format": 1, "compiler": "1"}`, "not a mion API marker"},
		{"no format", `{"package": "x", "compiler": "1"}`, "not a mion API marker"},
		{"no compiler", `{"format": 1, "package": "x"}`, "not a mion API marker"},
		{"newer format", `{"format": 2, "package": "x", "compiler": "1"}`, "newer than this compiler"},
	}
	for _, testCase := range refused {
		files := map[string]string{"package.json": pkg}
		switch testCase.files {
		case "":
			files["package.json"] = `{"types": "./index.d.ts"}`
		case "-":
		default:
			files["mion-api.json"] = testCase.files
		}
		info := read(files)
		if info.Marker != nil || !strings.Contains(info.Problem, testCase.problem) {
			t.Errorf("%s: want no marker and a problem with %q, got %+v", testCase.name, testCase.problem, info)
		}
	}
}
