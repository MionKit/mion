package purefunctions

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// stripFactoryBody parses `source` (wrapped in a TS file), locates the first
// FunctionExpression or ArrowFunction at top level, and strips its body.
// Returns the stripped JS body text. Used to feed bite-sized cases into the
// stripper without building a full Program per case.
func stripFactoryBody(t *testing.T, source string) string {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	filePath := tspath.ResolvePath(cwd, "case.ts")
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        map[string]string{filePath: source},
	}, []string{filePath})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	sourceFile := prog.SourceFile(filePath)
	if sourceFile == nil {
		t.Fatalf("source file not parsed")
	}

	factory := findFirstFactory(sourceFile.AsNode())
	if factory == nil {
		t.Fatalf("no FunctionExpression/ArrowFunction found in source:\n%s", source)
	}
	body := factory.Body()
	if body == nil {
		t.Fatalf("factory has no body")
	}
	if body.Kind == ast.KindBlock {
		return stripTypesFromBlock(sourceFile, body)
	}
	return stripTypesFromExpr(sourceFile, body)
}

func findFirstFactory(node *ast.Node) *ast.Node {
	if node == nil {
		return nil
	}
	if node.Kind == ast.KindFunctionExpression || node.Kind == ast.KindArrowFunction || node.Kind == ast.KindFunctionDeclaration {
		return node
	}
	var found *ast.Node
	node.ForEachChild(func(child *ast.Node) bool {
		if found != nil {
			return true
		}
		if got := findFirstFactory(child); got != nil {
			found = got
		}
		return false
	})
	return found
}

func TestStripTypes_NoAnnotations(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  const a = 1;
  return a + 1;
};`)
	want := "const a = 1;\n  return a + 1;"
	if got != want {
		t.Errorf("got:\n%q\nwant:\n%q", got, want)
	}
}

func TestStripTypes_ParameterAnnotation(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  return function inner(s: string, n: number): boolean {
    return s.length > n;
  };
};`)
	if strings.Contains(got, ": string") || strings.Contains(got, ": number") || strings.Contains(got, ": boolean") {
		t.Errorf("parameter / return annotations not stripped:\n%s", got)
	}
	if !strings.Contains(got, "function inner(s, n)") {
		t.Errorf("expected `function inner(s, n)` in stripped output, got:\n%s", got)
	}
}

func TestStripTypes_VariableAnnotation(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  const unknownKeys: string[] = [];
  return unknownKeys;
};`)
	if strings.Contains(got, ": string[]") {
		t.Errorf("variable annotation not stripped:\n%s", got)
	}
	if !strings.Contains(got, "const unknownKeys = [];") {
		t.Errorf("expected `const unknownKeys = [];` in:\n%s", got)
	}
}

func TestStripTypes_AsCast(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  const v = (1 as number);
  return v;
};`)
	if strings.Contains(got, "as number") {
		t.Errorf("`as number` not stripped:\n%s", got)
	}
}

func TestStripTypes_SatisfiesCast(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  const v = ({a: 1} satisfies Record<string, number>);
  return v;
};`)
	if strings.Contains(got, "satisfies") {
		t.Errorf("`satisfies` not stripped:\n%s", got)
	}
}

func TestStripTypes_NonNullAssertion(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  const v = foo()!.bar;
  return v;
};`)
	if strings.Contains(got, "!.") {
		t.Errorf("non-null `!` not stripped:\n%s", got)
	}
	if !strings.Contains(got, "foo().bar") {
		t.Errorf("expected `foo().bar` in:\n%s", got)
	}
}

func TestStripTypes_TypeAlias_Dropped(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  type Local = string;
  return 1;
};`)
	if strings.Contains(got, "type Local") {
		t.Errorf("type alias not dropped:\n%s", got)
	}
}

func TestStripTypes_Interface_Dropped(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  interface Local {x: number}
  return 1;
};`)
	if strings.Contains(got, "interface") {
		t.Errorf("interface declaration not dropped:\n%s", got)
	}
}

func TestStripTypes_OptionalParameter(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  return function inner(s?: string) {
    return s;
  };
};`)
	if strings.Contains(got, "?") || strings.Contains(got, ": string") {
		t.Errorf("optional marker + type not stripped:\n%s", got)
	}
	if !strings.Contains(got, "function inner(s)") {
		t.Errorf("expected `function inner(s)` in:\n%s", got)
	}
}

func TestStripTypes_ArrowExpressionBody(t *testing.T) {
	// Arrow with expression body renders as `return <expr>;`.
	got := stripFactoryBody(t, `
export const x = (n: number) => n + 1;`)
	want := "return n + 1;"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestStripTypes_NestedTypesInsideReturnedFn(t *testing.T) {
	// The pure-fn pattern: outer factory returns an inner function. The
	// inner function's annotations also need stripping (it's what
	// `new Function` ends up parsing).
	got := stripFactoryBody(t, `
export const x = function () {
  return function _fn(arr: number[], keys: readonly string[]): string[] {
    const out: string[] = [];
    return out;
  };
};`)
	for _, ann := range []string{": number[]", ": readonly string[]", ": string[]"} {
		if strings.Contains(got, ann) {
			t.Errorf("annotation %q not stripped:\n%s", ann, got)
		}
	}
}

// TestStripTypes_TypeArguments pins the call / new type-argument positions.
// Left in place these do not merely look wrong: `new Set<any>()` is a
// SyntaxError, and `foo<T>(1)` quietly parses as `(foo < T) > 1`.
func TestStripTypes_TypeArguments(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{
			name: "new with one type argument",
			body: "const seen = new Set<string>();\n  return seen;",
			want: "const seen = new Set();\n  return seen;",
		},
		{
			name: "new with two type arguments",
			body: "const seen = new Map<string, number>();\n  return seen;",
			want: "const seen = new Map();\n  return seen;",
		},
		{
			name: "new with nested type arguments",
			body: "const seen = new Map<string, Set<number>>();\n  return seen;",
			want: "const seen = new Map();\n  return seen;",
		},
		{
			name: "new without parentheses",
			body: "const seen = new Set<string>;\n  return seen;",
			want: "const seen = new Set;\n  return seen;",
		},
		{
			name: "generic call",
			body: "return ident<number>(1);",
			want: "return ident(1);",
		},
		{
			name: "generic call with two type arguments",
			body: "return pick<string, number>(a, b);",
			want: "return pick(a, b);",
		},
		{
			name: "type arguments nested in an argument",
			body: "return wrap(new Set<string>(), 1);",
			want: "return wrap(new Set(), 1);",
		},
		{
			name: "type arguments on a property-access callee",
			body: "return util.make<string>(1);",
			want: "return util.make(1);",
		},
		{
			name: "annotation and type argument together",
			body: "const seen: Set<string> = new Set<string>();\n  return seen;",
			want: "const seen = new Set();\n  return seen;",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := stripFactoryBody(t, "export const x = function () {\n  "+tc.body+"\n};")
			if got != tc.want {
				t.Errorf("got:\n%q\nwant:\n%q", got, tc.want)
			}
			if strings.ContainsAny(got, "<>") {
				t.Errorf("angle brackets survived stripping:\n%s", got)
			}
		})
	}
}

func TestStripTypes_ReadonlyParameterType(t *testing.T) {
	got := stripFactoryBody(t, `
export const x = function () {
  return function _err(path: readonly string[]) {
    return path.length;
  };
};`)
	if strings.Contains(got, "readonly") || strings.Contains(got, ": ") {
		t.Errorf("readonly array param annotation not stripped:\n%s", got)
	}
}
