package resolver_test

// Pins the registerClassSerializer decoupling: the site carries
// InjectTypeFnArgs<T, 'csr'>, so it demands ONE classSerializerReg name-card
// entry (its typeName slot is the build-time class name) instead of forcing
// the class's whole reflection graph into the runtype bundle.

import (
	"strings"
	"testing"
)

// TestClassSerializerReg_NameCardNotGraph — a registration-only file emits the
// csr name card (carrying the source class name) and NO runtype data bundle.
func TestClassSerializerReg_NameCardNotGraph(t *testing.T) {
	resp := scopeScan(t, `import {registerClassSerializer} from '@mionjs/run-types';
export class WireThing { a = 1; }
registerClassSerializer(WireThing);
`)
	keys := familyEntryKeys(resp, "classSerializerReg")
	if len(keys) != 1 {
		t.Fatalf("expected exactly one classSerializerReg card, got %v", keys)
	}
	source := entryModule(resp, keys[0])
	if !strings.Contains(source, "WireThing") {
		t.Errorf("the csr card must carry the build-time class name, got: %s", source)
	}
	// The bundle's module basename is the fixed `runtypes`
	// (entrymodules.ModuleName special-cases KindRunTypeBundle); check the
	// entry-key prefix too so either representation trips the assertion.
	for basename := range resp.EntryModules {
		if basename == "runtypes" || strings.HasPrefix(basename, "rts_") {
			t.Errorf("a registration-only file must not emit the runtype data bundle, got %s", basename)
		}
	}
}
