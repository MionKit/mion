package resolver

import (
	"strings"
	"testing"
)

func TestRelWithinTypes(t *testing.T) {
	cases := []struct{ from, dep, want string }{
		{"val_Foo", "runtypes", "./runtypes.js"},
		{"runtypes", "val_Foo", "./val_Foo.js"},
		{"fns/val", "runtypes", "../runtypes.js"},
		{"pf/rt/foo", "val_X", "../../val_X.js"},
		{"fns/val", "fns/verr", "./verr.js"},
	}
	for _, c := range cases {
		if got := relWithinTypes(c.from, c.dep); got != c.want {
			t.Errorf("relWithinTypes(%q, %q) = %q, want %q", c.from, c.dep, got, c.want)
		}
	}
}

func TestRelativizeModuleImports(t *testing.T) {
	src := "import {__rt_runtypes} from 'rtmod:/runtypes.js';\nexport const __rt_fns_val=[1];\n"
	got := relativizeModuleImports("fns/val", src)
	if want := "from '../runtypes.js'"; !strings.Contains(got, want) {
		t.Fatalf("expected relative import %q in:\n%s", want, got)
	}
	if strings.Contains(got, "rtmod:/") {
		t.Fatalf("virtual specifier survived relativization:\n%s", got)
	}
}

func TestRelativizeUserImports(t *testing.T) {
	code := "import {__rt_val_Foo1234} from 'rtmod:/val_Foo1234.js';\nconst v = createValidateFn(__rt_val_Foo1234);\n"
	got := relativizeUserImports("src/models/user.ts", "src/__runtypes", code)
	if want := "from '../__runtypes/types/val_Foo1234.js'"; !strings.Contains(got, want) {
		t.Fatalf("expected relative import %q in:\n%s", want, got)
	}
	if strings.Contains(got, "rtmod:/") {
		t.Fatalf("virtual specifier survived relativization:\n%s", got)
	}
	// Rewriting only the specifier text must not change the line count (source
	// map stays valid — the injected import block is a single physical line).
	if strings.Count(got, "\n") != strings.Count(code, "\n") {
		t.Fatalf("relativization changed the line count: %d != %d", strings.Count(got, "\n"), strings.Count(code, "\n"))
	}
}
