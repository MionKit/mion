package convert_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
)

// CNV010: an unresolved runtypes or drizzle import must warn, not read as a clean, empty conversion.

func TestUnresolvedImport_WarnsPerPackage(t *testing.T) {
	source := "import * as RT from '@mionjs/run-types/missing';\n" +
		"import {pgTable, text} from '@mionjs/drizzle-orm-nope-core';\n" +
		"import {type Other} from '@mionjs/run-types/missing';\n" +
		"import {thing} from 'some-unrelated-lib';\n" +
		"export const userRT = RT.object({name: RT.string()});\n" +
		"export const users = pgTable('users', {name: text('name')});\n"
	for _, target := range []convert.Target{convert.TargetType, convert.TargetBuilders} {
		output, diags := convertOne(t, source, convert.Options{Target: target})
		var warned []string
		for _, diagnostic := range diags {
			if diagnostic.Code != convert.CodeUnresolvedImport {
				continue
			}
			if diagnostic.Severity != convert.SeverityWarning {
				t.Errorf("--to %s: CNV010 must be a warning", target)
			}
			if !strings.Contains(diagnostic.Message, diagnostic.Decl) {
				t.Errorf("--to %s: CNV010 must name the package; got %q", target, diagnostic.Message)
			}
			warned = append(warned, diagnostic.Decl)
		}
		want := []string{"@mionjs/run-types/missing", "@mionjs/drizzle-orm-nope-core"}
		if strings.Join(warned, ",") != strings.Join(want, ",") {
			t.Errorf("--to %s: warned for %v, want %v (once per package, unrelated packages ignored)", target, warned, want)
		}
		if output != source {
			t.Errorf("--to %s: the file must stay untouched:\n%s", target, output)
		}
	}
}

func TestUnresolvedImport_SilentWhenImportsResolve(t *testing.T) {
	source := buildersHeader + "export const userRT = RT.object({name: TF.string()});\n" +
		"export type User = InferType<typeof userRT>;\n"
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetType})
	for _, diagnostic := range diags {
		if diagnostic.Code == convert.CodeUnresolvedImport {
			t.Errorf("resolved imports must not warn: %s", diagnostic.Message)
		}
	}
}
