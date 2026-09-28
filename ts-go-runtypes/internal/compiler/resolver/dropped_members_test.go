package resolver_test

import (
	"slices"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Every dropped member is reported once per family that drops it: a class with two methods names both.
// Marker coverage rule: both getRunTypeId shapes ride alongside and resolve to one id.
func TestDiag_EveryDroppedMemberIsReported(t *testing.T) {
	const code = `import {createValidateFn, createJsonEncoderFn, getRunTypeId} from '@mionjs/run-types';
export class Pet {
  name = 'rex';
  speak(): string { return this.name; }
  run(): void {}
}
export const isPet = createValidateFn<Pet>();
export const encodePet = createJsonEncoderFn<Pet>(undefined, {strategy: 'mutate'});
export const staticId = getRunTypeId<Pet>();
const sample = new Pet();
export const reflectedId = getRunTypeId(sample);
`
	resolverSession := setupInline(t, map[string]string{"pet.ts": code})
	response := resolverSession.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"pet.ts"},
		IncludeEntryModules: true,
	})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}

	membersByCode := map[string][]string{}
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		if len(diagnostic.Args) > 0 {
			membersByCode[diagnostic.Code] = append(membersByCode[diagnostic.Code], diagnostic.Args[0])
		}
	}
	for _, dropCode := range []string{diagnostics.CodeVLMethodDropped, diagnostics.CodePJMethodDropped} {
		members := membersByCode[dropCode]
		slices.Sort(members)
		if !slices.Equal(members, []string{"run", "speak"}) {
			t.Errorf("%s must name each dropped method exactly once, got %v (all: %v)", dropCode, members, membersByCode)
		}
	}

	assertOneReflectionID(t, response)
}

// assertOneReflectionID checks the marker coverage rule: both getRunTypeId shapes resolve to one id.
func assertOneReflectionID(t *testing.T, response protocol.Response) {
	t.Helper()
	ids := map[string]bool{}
	for _, site := range response.Sites {
		if site.FnId == "" && site.ID != "" {
			ids[site.ID] = true
		}
	}
	if len(ids) != 1 {
		t.Errorf("both getRunTypeId shapes must resolve to one id, got %v", ids)
	}
}
