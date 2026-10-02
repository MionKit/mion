package batchcompile

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

const overridePackageJSON = `{"name": "@acme/money", "type": "module", "types": "dist/index.d.ts", "peerDependencies": {"@mionjs/run-types": "*"}}`

const overrideLibTS = `import {getRunTypeId, overrideValidate, registerFormatPattern} from '@mionjs/run-types';
import type * as TF from '@mionjs/run-types/formats';
export type Cents = {amount: number; currency: string};
overrideValidate<Cents>((value) => typeof value === 'object' && value !== null && 'amount' in value);
const skuPattern = registerFormatPattern({source: '^[A-Z]{3}-[0-9]{4}$'});
export type Sku = TF.String<{pattern: typeof skuPattern}>;
export class Price {
  constructor(public cents: number, public sku: Sku) {}
}
export const centsId = getRunTypeId<Cents>();
export const skuId = getRunTypeId<Sku>();
export const priceId = getRunTypeId<Price>();
`

const overrideConsumerTS = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
import type {Cents, Price, Sku} from '@acme/money';
export const centsId = getRunTypeId<Cents>();
const value: Cents = {amount: 1, currency: 'EUR'};
export const centsIdByValue = getRunTypeId(value);
export const isCents = createValidateFn<Cents>();
export const skuId = getRunTypeId<Sku>();
export const priceId = getRunTypeId<Price>();
`

var runTypeIdBindingRE = regexp.MustCompile(`export const (\w+) = getRunTypeId\((?:\w+|undefined), (__rt_[A-Za-z0-9_$]+)\)`)

// buildOverrideLibrary compiles the library with declarations and returns its dist dir and the id its own build gave Cents.
func buildOverrideLibrary(t *testing.T) (string, string) {
	dist, ids := buildOverrideLibraryIDs(t)
	return dist, ids["centsId"]
}

// buildOverrideLibraryIDs is buildOverrideLibrary returning every probe's id.
func buildOverrideLibraryIDs(t *testing.T) (string, map[string]string) {
	t.Helper()
	lib := writeProject(t, map[string]string{"index.ts": overrideLibTS})
	writeFile(t, filepath.Join(lib, "package.json"), overridePackageJSON)
	writeFile(t, filepath.Join(lib, "tsconfig.json"), strings.Replace(projectTsconfigJSON, `"strict": true,`, `"strict": true, "declaration": true,`, 1))
	compileProject(t, lib, nil)
	bindings := emittedRunTypeIds(t, readEmitted(t, lib, "index.js"))
	if len(bindings) != 3 {
		t.Fatalf("the library's own probes got no ids: %v", bindings)
	}
	return filepath.Join(lib, "dist"), bindings
}

// installOverrideLibrary copies the library's dist into a consumer as node_modules/@acme/money.
func installOverrideLibrary(t *testing.T, consumer, dist string) string {
	t.Helper()
	installed := filepath.Join(consumer, "node_modules", "@acme", "money")
	writeFile(t, filepath.Join(installed, "package.json"), overridePackageJSON)
	if err := os.CopyFS(filepath.Join(installed, "dist"), os.DirFS(dist)); err != nil {
		t.Fatalf("install: %v", err)
	}
	return installed
}

func emittedRunTypeIds(t *testing.T, js string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, match := range runTypeIdBindingRE.FindAllStringSubmatch(js, -1) {
		out[match[1]] = match[2]
	}
	return out
}

// TestCompile_PackageOverrideReachesItsConsumer: a consumer reading an overridden type from a mion-built package's .d.ts
// gets the id the package's own build gave it, for both getRunTypeId call shapes, and its validator runs the override.
func TestCompile_PackageOverrideReachesItsConsumer(t *testing.T) {
	dist, libraryID := buildOverrideLibrary(t)
	index, err := os.ReadFile(filepath.Join(dist, "mion-pure-fns", "index.json"))
	if err != nil || !strings.Contains(string(index), `"overrides"`) {
		t.Fatalf("the library's artifact must carry its override rows: %v\n%s", err, index)
	}

	consumer := writeProject(t, map[string]string{"main.ts": overrideConsumerTS})
	installOverrideLibrary(t, consumer, dist)
	result := compileProject(t, consumer, nil)
	for _, diag := range result.Diagnostics {
		if strings.HasPrefix(diag.Code, "OVR") || strings.HasPrefix(diag.Code, "PFE") {
			t.Errorf("unexpected %s: %v", diag.Code, diag.Args)
		}
	}
	bindings := emittedRunTypeIds(t, readEmitted(t, consumer, "main.js"))
	if bindings["centsId"] != libraryID || bindings["centsIdByValue"] != libraryID {
		t.Fatalf("both call shapes must get the library's id %s, got %v", libraryID, bindings)
	}
	generated := strings.Join(generatedFiles(t, filepath.Join(consumer, ".mion")), "\n")
	if !strings.Contains(generated, "usePureFn(") || !strings.Contains(generated, "@acme/money#") {
		t.Errorf("the consumer's validator must redirect to the library's override:\n%s", generated)
	}
}

// TestCompile_DeclarationIDsAgreeWithSource: a class, a format pattern and an overridden type read from a mion-built
// package's .d.ts get the ids the package's own build gave them from source.
func TestCompile_DeclarationIDsAgreeWithSource(t *testing.T) {
	dist, libraryIDs := buildOverrideLibraryIDs(t)
	consumer := writeProject(t, map[string]string{"main.ts": overrideConsumerTS})
	installOverrideLibrary(t, consumer, dist)
	compileProject(t, consumer, nil)
	consumerIDs := emittedRunTypeIds(t, readEmitted(t, consumer, "main.js"))
	for _, probe := range []string{"centsId", "skuId", "priceId"} {
		if consumerIDs[probe] != libraryIDs[probe] {
			t.Errorf("%s: the package's build gave %s, the consumer reading its .d.ts %s", probe, libraryIDs[probe], consumerIDs[probe])
		}
	}
}

// TestCompile_PackageWithoutOverrideArtifactKeepsPlainIDs: a package published without its artifact gives the
// consumer nothing to seed from, so the overridden type gets its plain id.
func TestCompile_PackageWithoutOverrideArtifactKeepsPlainIDs(t *testing.T) {
	dist, libraryID := buildOverrideLibrary(t)
	consumer := writeProject(t, map[string]string{"main.ts": overrideConsumerTS})
	installed := installOverrideLibrary(t, consumer, dist)
	if err := os.RemoveAll(filepath.Join(installed, "dist", "mion-pure-fns")); err != nil {
		t.Fatal(err)
	}
	compileProject(t, consumer, nil)
	if id := emittedRunTypeIds(t, readEmitted(t, consumer, "main.js"))["centsId"]; id == "" || id == libraryID {
		t.Fatalf("without the artifact the consumer cannot know the override, so its id must be the plain one, got %q", id)
	}
}

// TestCompile_ConsumerOverrideOfAPackagesTypeIsADuplicate: the package's override won first, so a second one is OVR001.
func TestCompile_ConsumerOverrideOfAPackagesTypeIsADuplicate(t *testing.T) {
	dist, _ := buildOverrideLibrary(t)
	consumer := writeProject(t, map[string]string{"main.ts": overrideConsumerTS + `import {overrideValidate} from '@mionjs/run-types';
overrideValidate<Cents>((value) => value !== null);
`})
	installOverrideLibrary(t, consumer, dist)
	result := compileProject(t, consumer, nil)
	for _, diag := range result.Diagnostics {
		if diag.Code == "OVR001" {
			return
		}
	}
	t.Fatalf("expected OVR001 for overriding a type the package already overrides, got %v", result.Diagnostics)
}

// generatedFiles reads every generated module under dir.
func generatedFiles(t *testing.T, dir string) []string {
	t.Helper()
	var out []string
	_ = filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err == nil && !entry.IsDir() && strings.HasSuffix(path, ".js") {
			if content, readErr := os.ReadFile(path); readErr == nil {
				out = append(out, string(content))
			}
		}
		return nil
	})
	return out
}
