package resolver

// Internal guards of the batch transport renderer: the table never imports a
// mapper the batch source produced no module for (BAT007 names it instead),
// and the rendered module is deterministic regardless of site order.

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/requestbatch"
)

func rpcTestSites() []requestbatch.Site {
	return []requestbatch.Site{
		{
			FilePath: "/app/b.ts",
			BatchId:  "b_second",
			RouteIds: []string{"orders/list"},
		},
		{
			FilePath: "/app/a.ts",
			BatchId:  "b_first",
			RouteIds: []string{"users/getById", "orders/getById"},
			Mappings: []requestbatch.Mapping{{FromId: "users/getById", ToId: "orders/getById", ParamIndex: 0, MapperKey: "rt::known"}},
		},
		{
			FilePath: "/app/c.ts",
			BatchId:  "b_third",
			RouteIds: []string{"users/getById", "orders/list"},
			Mappings: []requestbatch.Mapping{{FromId: "users/getById", ToId: "orders/list", ParamIndex: 0, MapperKey: "rt::missing"}},
		},
	}
}

func TestRenderBatchesModule_SkipsMissingMapperAndSortsIds(t *testing.T) {
	entries := []purefunctions.Entry{{Namespace: "rt", FunctionName: "known", Code: "return (u) => u.id;"}}
	module := renderBatchesModule(rpcTestSites(), entries)
	if !strings.Contains(module, "import {__rt_pf$2Frt$2Fknown} from './pf/rt/known.js';") {
		t.Errorf("module lacks the known mapper import:\n%s", module)
	}
	if !strings.Contains(module, "registerInputMapperTuple('rt::known', __rt_pf$2Frt$2Fknown);") {
		t.Errorf("module lacks the known mapper registration:\n%s", module)
	}
	if strings.Contains(module, "pf/rt/missing") || strings.Contains(module, "registerInputMapperTuple('rt::missing'") {
		t.Errorf("module must not import a mapper the batch source produced no module for:\n%s", module)
	}
	// the table still names it (the BAT007 diagnostic is what fails the build)
	if !strings.Contains(module, `"mapperKey":"rt::missing"`) {
		t.Errorf("table dropped the missing mapper's mapping:\n%s", module)
	}
	first, second, third := strings.Index(module, `"b_first"`), strings.Index(module, `"b_second"`), strings.Index(module, `"b_third"`)
	if first < 0 || second < 0 || third < 0 || !(first < second && second < third) {
		t.Errorf("table ids are not sorted (%d, %d, %d):\n%s", first, second, third, module)
	}
	// site order never changes the output
	reversed := rpcTestSites()
	for i, j := 0, len(reversed)-1; i < j; i, j = i+1, j-1 {
		reversed[i], reversed[j] = reversed[j], reversed[i]
	}
	if renderBatchesModule(reversed, entries) != module {
		t.Errorf("module differs with the sites reversed")
	}
}

func TestReferencedMapperKeys_InlineOnlySortedUnique(t *testing.T) {
	sites := rpcTestSites()
	sites = append(sites, requestbatch.Site{
		FilePath: "/app/d.ts",
		BatchId:  "b_fourth",
		RouteIds: []string{"users/getById", "orders/getById"},
		Mappings: []requestbatch.Mapping{
			{FromId: "users/getById", ToId: "orders/getById", ParamIndex: 0, MapperKey: "mionjs::toOrderId"},
			{FromId: "users/getById", ToId: "orders/getById", ParamIndex: 1, MapperKey: "rt::known"},
		},
	})
	keys := referencedMapperKeys(sites)
	if strings.Join(keys, ",") != "rt::known,rt::missing" {
		t.Errorf("referencedMapperKeys = %v, want [rt::known rt::missing]", keys)
	}
}
