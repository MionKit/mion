package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// newExpressionBox: Box takes data in argument 0 (HeadersSubset shape), Wrap takes the marker's T (getRunTypeId shape).
const newExpressionBox = `import type {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
export class Box<Required extends string, Optional extends string = never> {
  constructor(
    readonly headers: {[K in Required]: string} & {[K in NoInfer<Optional>]?: string},
    fns?: InjectTypeFnArgs<Box<Required, Optional>, 'validate', 'validationErrors'>
  ) {}
}
export class Wrap<T> {
  constructor(value?: T, id?: InjectRunTypeId<T>) {}
}
export class Data {
  constructor(readonly data: {checkUnknowns: boolean}, fns?: InjectTypeFnArgs<Data, 'validate'>) {}
}
export class TwoSlots {
  constructor(readonly data: {checkUnknowns: boolean}, fns?: InjectTypeFnArgs<TwoSlots, 'validate'>, id?: InjectRunTypeId<TwoSlots>) {}
}
`

const staticBox = `import {Box} from './box';
new Box<'A'>({A: 'x'});
`

func scanNewSites(t *testing.T, sources map[string]string) (map[string][]protocol.Site, []diagnostics.Diagnostic) {
	t.Helper()
	sources["box.ts"] = newExpressionBox
	session := setupInline(t, sources)
	var files []string
	for name := range sources {
		if name != "box.ts" {
			files = append(files, name)
		}
	}
	resp := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: files})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	byFile := map[string][]protocol.Site{}
	for _, site := range resp.Sites {
		byFile[site.File] = append(byFile[site.File], site)
	}
	return byFile, resp.Diagnostics
}

func oneSite(t *testing.T, byFile map[string][]protocol.Site, file string) protocol.Site {
	t.Helper()
	for name, sites := range byFile {
		if strings.HasSuffix(name, file) {
			if len(sites) != 1 {
				t.Fatalf("%s: expected 1 site, got %d (%+v)", file, len(sites), sites)
			}
			return sites[0]
		}
	}
	t.Fatalf("%s: no site", file)
	return protocol.Site{}
}

func TestNewExpression_StaticForm(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{"static.ts": staticBox})
	site := oneSite(t, byFile, "static.ts")
	if site.ID == "" || len(site.FnIds) != 2 {
		t.Fatalf("expected an id and two fn ids, got %+v", site)
	}
	if site.ParamIndex != 1 || site.ArgsCount != 1 || site.NoArgList {
		t.Fatalf("expected paramIndex 1, argsCount 1, an argument list, got %+v", site)
	}
}

func TestNewExpression_InferredFromReturnType(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{
		"static.ts": staticBox,
		"inferred.ts": `import {Box} from './box';
export function handler(): Box<'A'> {
  return new Box({A: 'x'});
}
`,
	})
	static := oneSite(t, byFile, "static.ts")
	inferred := oneSite(t, byFile, "inferred.ts")
	if static.ID != inferred.ID {
		t.Fatalf("static and inferred `new Box` must share one id, got %q vs %q", static.ID, inferred.ID)
	}
}

func TestNewExpression_InferredOptionalFromReturnType(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{
		"static.ts": `import {Box} from './box';
new Box<'A', 'B'>({A: 'x'});
`,
		"inferred.ts": `import {Box} from './box';
export function handler(): Box<'A', 'B'> {
  return new Box({A: 'x'});
}
`,
	})
	if oneSite(t, byFile, "static.ts").ID != oneSite(t, byFile, "inferred.ts").ID {
		t.Fatal("the optional names must come from the return type, not the argument")
	}
}

func TestNewExpression_InferredContexts(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{
		"static.ts": staticBox,
		"async.ts": `import {Box} from './box';
export async function handler(): Promise<Box<'A'>> {
  return new Box({A: 'x'});
}
`,
		"union.ts": `import {Box} from './box';
export function handler(flag: boolean): Box<'A'> | null {
  if (!flag) return null;
  return new Box({A: 'x'});
}
`,
		"argument.ts": `import {Box} from './box';
declare function take(box: Box<'A'>): void;
take(new Box({A: 'x'}));
`,
		"module.ts": `import {Box} from './box';
export const box = new Box({A: 'x'});
`,
	})
	want := oneSite(t, byFile, "static.ts").ID
	for _, file := range []string{"async.ts", "union.ts", "argument.ts", "module.ts"} {
		if got := oneSite(t, byFile, file).ID; got != want {
			t.Errorf("%s: id %q, want the static form's %q", file, got, want)
		}
	}
}

func TestNewExpression_NoParens(t *testing.T) {
	const code = `import {Wrap} from './box';
export const wrapped = new Wrap<string>;
`
	byFile, _ := scanNewSites(t, map[string]string{"noparens.ts": code, "withparens.ts": `import {Wrap} from './box';
export const wrapped = new Wrap<string>();
`})
	noParens := oneSite(t, byFile, "noparens.ts")
	parens := oneSite(t, byFile, "withparens.ts")
	if !noParens.NoArgList || parens.NoArgList {
		t.Fatalf("only the paren-less form sets NoArgList, got %v and %v", noParens.NoArgList, parens.NoArgList)
	}
	if want := strings.Index(code, "<string>;") + len("<string>"); noParens.Pos != want {
		t.Fatalf("paren-less Pos = %d, want the expression end %d", noParens.Pos, want)
	}
	if noParens.ID != parens.ID {
		t.Fatalf("paren-less and paren forms must share one id, got %q vs %q", noParens.ID, parens.ID)
	}
}

func TestNewExpression_TrailingComma(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{"comma.ts": `import {Box} from './box';
new Box<'A'>({A: 'x'},);
`})
	if site := oneSite(t, byFile, "comma.ts"); !site.TrailingComma {
		t.Fatalf("expected TrailingComma, got %+v", site)
	}
}

func TestNewExpression_ExplicitPassThroughMakesNoSite(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{"pass.ts": `import {Box} from './box';
declare const fns: any;
new Box<'A'>({A: 'x'}, fns);
`})
	for name, sites := range byFile {
		if strings.HasSuffix(name, "pass.ts") && len(sites) > 0 {
			t.Fatalf("a filled marker slot is a pass-through, got %+v", sites)
		}
	}
}

func TestNewExpression_FreeTypeParameter(t *testing.T) {
	_, diags := scanNewSites(t, map[string]string{"generic.ts": `import {Wrap} from './box';
export function make<T>() {
  return new Wrap<T>();
}
`})
	for _, diagnostic := range diags {
		if diagnostic.Code == diagnostics.CodeMarkerFreeTypeParameter {
			return
		}
	}
	t.Fatalf("expected MKR003 for a free T in `new Wrap<T>()`, got %+v", diags)
}

// Argument 0 of Box is data, so its annotation never replaces the class type the constructor resolved.
func TestNewExpression_AnnotatedDataArgumentKeepsT(t *testing.T) {
	byFile, diags := scanNewSites(t, map[string]string{
		"static.ts": staticBox,
		"annotated.ts": `import {Box} from './box';
const map: {A: string} = {A: 'x'};
export const box: Box<'A'> = new Box(map);
`,
		"call.ts": `import {Box} from './box';
declare function read(): {A: string};
export const box: Box<'A'> = new Box(read());
`,
	})
	want := oneSite(t, byFile, "static.ts").ID
	if got := oneSite(t, byFile, "annotated.ts").ID; got != want {
		t.Fatalf("annotated data argument replaced T: id %q, want %q", got, want)
	}
	if got := oneSite(t, byFile, "call.ts").ID; got != want {
		t.Fatalf("call data argument replaced T: id %q, want %q", got, want)
	}
	for _, diagnostic := range diags {
		if strings.HasSuffix(diagnostic.Site.FilePath, "call.ts") {
			t.Fatalf("a data argument raises no reflect-form diagnostic, got %+v", diagnostic)
		}
	}
}

// Data's argument 0 carries a key named like a validate option, which must never pick the fn variant.
func TestNewExpression_OptionsNotReadFromDataArgument(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{"data.ts": `import {Data} from './box';
new Data({checkUnknowns: true});
`})
	if site := oneSite(t, byFile, "data.ts"); site.FnId != leafFnHash(t, "validate") {
		t.Fatalf("FnId %q, want the plain validate fn %q", site.FnId, leafFnHash(t, "validate"))
	}
}

// Wrap is shaped like getRunTypeId, so the static and value-first forms resolve to one id.
func TestNewExpression_ReflectFormEquivalence(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{
		"static.ts": `import {Wrap} from './box';
new Wrap<string>();
`,
		"reflect.ts": `import {Wrap} from './box';
const value: string = 'hello';
new Wrap(value);
`,
	})
	static := oneSite(t, byFile, "static.ts")
	reflect := oneSite(t, byFile, "reflect.ts")
	if static.ID != reflect.ID {
		t.Fatalf("static and reflect `new Wrap` must share one id, got %q vs %q", static.ID, reflect.ID)
	}
	if reflect.ArgsCount != 1 || reflect.ParamIndex != 1 {
		t.Fatalf("reflect form injects after the value, got %+v", reflect)
	}
}

// On the multi-slot path too, a `new` data argument never picks the fn variant.
func TestNewExpression_MultiSlotOptionsNotReadFromDataArgument(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{"two.ts": `import {TwoSlots} from './box';
new TwoSlots({checkUnknowns: true});
`})
	for name, sites := range byFile {
		if !strings.HasSuffix(name, "two.ts") {
			continue
		}
		for _, site := range sites {
			if site.FnId != "" && site.FnId != leafFnHash(t, "validate") {
				t.Fatalf("FnId %q, want the plain validate fn %q", site.FnId, leafFnHash(t, "validate"))
			}
		}
		return
	}
	t.Fatal("two.ts: no site")
}

// A call keeps reading the argument before its marker as options, whatever that parameter's declared type.
func TestNewExpression_CallStillReadsPlainOptions(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{"wrapper.ts": `import type {InjectTypeFnArgs} from '@mionjs/run-types';
declare function check<T>(val?: T, options?: {checkUnknowns?: boolean}, id?: InjectTypeFnArgs<T, 'validate'>): unknown;
check<{a: string}>(undefined, {checkUnknowns: true});
`})
	if site := oneSite(t, byFile, "wrapper.ts"); site.FnId == leafFnHash(t, "validate") {
		t.Fatalf("checkUnknowns must still pick the strict validator for a call, got the plain one %q", site.FnId)
	}
}

// A builder nested in a marker-bearing `new` needs no id: the `new` reflects it.
func TestNewExpression_EnclosesNestedBuilder(t *testing.T) {
	byFile, _ := scanNewSites(t, map[string]string{"nested.ts": `import {Wrap} from './box';
import * as TF from '@mionjs/run-types/formats';
export const wrapped = new Wrap(TF.string());
`})
	oneSite(t, byFile, "nested.ts")
}
