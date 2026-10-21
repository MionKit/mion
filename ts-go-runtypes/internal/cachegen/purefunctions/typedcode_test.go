package purefunctions

import (
	"regexp"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

func TestCreatePureFnTS_TypesEveryImplicitAny(t *testing.T) {
	cases := []struct{ code, want string }{
		{"return function _err(pth, er, expected, accessPath = []) {er.push({expected, path: pth});};",
			"function(_utl?: any){return function _err(pth?: any, er?: any, expected?: any, _accessPath: any = []) {er.push({expected, path: pth});};}"},
		{"return (v) => v.map(x => x + 1).filter(async y => y);",
			"function(_utl?: any){return (v?: any) => v.map((x?: any) => x + 1).filter(async (y?: any) => y);}"},
		{"const out = {a: 1}; let last; const list = []; for (const k in out) last = k; try {} catch (err) {} return [list, last];",
			"function(_utl?: any){const out: any = {a: 1}; let last: any; const list: any = []; for (const k in out) last = k; try {} catch (err: any) {} return [list, last];}"},
		{"return ({a, b}, ...more) => a + b + more.length + utl.x;",
			"function(utl?: any){return ({a, b}: any, ...more: any) => a + b + more.length + utl.x;}"},
	}
	for _, c := range cases {
		if got := createPureFnTS(c.code, []string{"utl"}); got != c.want {
			t.Errorf("createPureFnTS(%q)\n got %s\nwant %s", c.code, got, c.want)
		}
	}
}

var annotations = regexp.MustCompile(`\??: any|\b_`)

// TestCreatePureFnTS_KeepsTheShippedCode: the typed factory differs from the JS one only by insertions.
func TestCreatePureFnTS_KeepsTheShippedCode(t *testing.T) {
	code := "const n = {}; return (x) => n[x] ?? x;"
	typed := annotations.ReplaceAllString(createPureFnTS(code, []string{"utl"}), "")
	if js := createPureFnJS(code, []string{"utl"}); typed != js {
		t.Errorf("typed minus annotations = %q, want %q", typed, js)
	}
}

func TestAmbientNames_OnlyTypeofReads(t *testing.T) {
	code := "if (typeof Bun !== 'undefined' && typeof Deno === 'object' && Deno.version) return 1; return typeof x;"
	got := ambientNames(code, constants.EmitTS)
	if len(got) != 2 || got[0] != "Bun" || got[1] != "x" {
		t.Errorf("ambientNames = %v, want [Bun x]", got)
	}
	if ambientNames(code, constants.EmitBoth) != nil {
		t.Error("an untyped mode declared names")
	}
}
