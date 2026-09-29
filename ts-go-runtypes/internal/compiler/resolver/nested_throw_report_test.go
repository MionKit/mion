package resolver_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A site calling an always-throw entry throws too, so it reports that root code even though it never named the
// failing type. Each family gets a paired static / value test, per the Marker test coverage rule.

const nestedThrowShared = `export interface Inner { s: symbol[] }
export class Counter { #count = 0; label = ''; }
const tag = Symbol('tag');
export interface Tagged { id: string; [tag]: string }
export interface Button { label: string; onClick: () => void }
`

const nestedThrowImports = `import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn, createRemoveUnknownKeysFn} from '@mionjs/run-types';
import type {Inner, Tagged, Button} from './shared.ts';
import {Counter} from './shared.ts';
`

func nestedThrowSources(site string) map[string]string {
	return map[string]string{"shared.ts": nestedThrowShared, "site.ts": nestedThrowImports + site + "\n"}
}

// expectReportedOnceAtSite asserts code is reported exactly once, at site.ts.
func expectReportedOnceAtSite(t *testing.T, response protocol.Response, code string) {
	t.Helper()
	sites := diagSitesFor(response, code)
	if len(sites) != 1 || sites[0] != "site.ts" {
		t.Errorf("%s must report once at the outer site, got %v; codes=%v", code, sites, codesOf(response))
	}
}

func assertNestedThrow(t *testing.T, code, site string) {
	t.Helper()
	expectReportedOnceAtSite(t, wholeProgram(t, nestedThrowSources(site)), code)
}

func TestNestedThrow_Validate_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeVLSymbolRoot, `export const check = createValidateFn<{inner: Inner}>();`)
}

func TestNestedThrow_Validate_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeVLSymbolRoot, `declare const value: {inner: Inner};
export const check = createValidateFn(value);`)
}

func TestNestedThrow_ValidationErrors_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeVESymbolRoot, `export const errors = createGetValidationErrorsFn<{inner: Inner}>();`)
}

func TestNestedThrow_ValidationErrors_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeVESymbolRoot, `declare const value: {inner: Inner};
export const errors = createGetValidationErrorsFn(value);`)
}

func TestNestedThrow_EncoderClone_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodePJSSymbolRoot, `export const encode = createJsonEncoderFn<{inner: Inner}>();`)
}

func TestNestedThrow_EncoderClone_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodePJSSymbolRoot, `declare const value: {inner: Inner};
export const encode = createJsonEncoderFn(value);`)
}

func TestNestedThrow_EncoderMutate_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodePJSymbolRoot, `export const encode = createJsonEncoderFn<{inner: Inner}>(undefined, {strategy: 'mutate'});`)
}

func TestNestedThrow_EncoderMutate_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodePJSymbolRoot, `declare const value: {inner: Inner};
export const encode = createJsonEncoderFn(value, {strategy: 'mutate'});`)
}

func TestNestedThrow_Decoder_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRJSymbolRoot, `export const decode = createJsonDecoderFn<{inner: Inner}>();`)
}

func TestNestedThrow_Decoder_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRJSymbolRoot, `declare const value: {inner: Inner};
export const decode = createJsonDecoderFn(value);`)
}

func TestNestedThrow_RemoveUnknownKeysPrivateFields_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKPrivateFields, `export const strip = createRemoveUnknownKeysFn<{counter: Counter}>();`)
}

func TestNestedThrow_RemoveUnknownKeysPrivateFields_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKPrivateFields, `declare const value: {counter: Counter};
export const strip = createRemoveUnknownKeysFn(value);`)
}

func TestNestedThrow_RemoveUnknownKeysTwoDeep_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKPrivateFields, `interface Holder { counter: Counter }
export const strip = createRemoveUnknownKeysFn<{holder: Holder}>();`)
}

func TestNestedThrow_RemoveUnknownKeysTwoDeep_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKPrivateFields, `interface Holder { counter: Counter }
declare const value: {holder: Holder};
export const strip = createRemoveUnknownKeysFn(value);`)
}

func TestNestedThrow_RemoveUnknownKeysSymbolKey_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKSymbolKeyedMember, `export const strip = createRemoveUnknownKeysFn<{tagged: Tagged}>();`)
}

func TestNestedThrow_RemoveUnknownKeysSymbolKey_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKSymbolKeyedMember, `declare const value: {tagged: Tagged};
export const strip = createRemoveUnknownKeysFn(value);`)
}

func TestNestedThrow_RemoveUnknownKeysShareMode_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKPrivateFields, `export const strip = createRemoveUnknownKeysFn<{counter: Counter}>(undefined, {sharedValues: 'share'});`)
}

func TestNestedThrow_RemoveUnknownKeysShareMode_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKPrivateFields, `declare const value: {counter: Counter};
export const strip = createRemoveUnknownKeysFn(value, {sharedValues: 'share'});`)
}

func TestNestedThrow_RemoveUnknownKeysRefused_Static(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKSharedRefused, `export const strip = createRemoveUnknownKeysFn<{button: Button}>(undefined, {sharedValues: 'refuse'});`)
}

func TestNestedThrow_RemoveUnknownKeysRefused_Value(t *testing.T) {
	assertNestedThrow(t, diagnostics.CodeRUKSharedRefused, `declare const value: {button: Button};
export const strip = createRemoveUnknownKeysFn(value, {sharedValues: 'refuse'});`)
}

// A site that reaches the failing type through a family that does not call it stays quiet.
func TestNestedThrow_OtherFamilySiteStaysQuiet(t *testing.T) {
	response := wholeProgram(t, nestedThrowSources(`export const check = createValidateFn<{counter: Counter}>();`))
	if sites := diagSitesFor(response, diagnostics.CodeRUKPrivateFields); len(sites) != 0 {
		t.Errorf("a validator must not report the copy's refusal, got %v", sites)
	}
}

// warmNestedThrow builds the same sources twice on one disk cache: the second build reads every entry from disk.
func warmNestedThrow(t *testing.T, code, site string) {
	t.Helper()
	cacheDir := t.TempDir()
	withCache := func(_ *program.Options, resolverOpts *resolver.Options) {
		resolverOpts.CacheDir = cacheDir
	}
	generate := func() protocol.Response {
		response := setupInlineWith(t, nestedThrowSources(site), withCache).Dispatch(protocol.Request{Op: protocol.OpGenerate})
		if response.Error != "" {
			t.Fatalf("generate: %s", response.Error)
		}
		return response
	}
	expectReportedOnceAtSite(t, generate(), code)
	if cachedEntryCount(t, cacheDir) == 0 {
		t.Fatalf("the cold build persisted no entry, so the warm build would not read from disk")
	}
	expectReportedOnceAtSite(t, generate(), code)
}

func cachedEntryCount(t *testing.T, root string) int {
	t.Helper()
	count := 0
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".json") {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var cached diskcache.RTEntry
		if json.Unmarshal(raw, &cached) == nil && cached.ArgsText != "" {
			count++
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking %s: %v", root, err)
	}
	return count
}

// The throwing entry is never persisted, so a warm build must still reach it from the cached outer entry.
func TestNestedThrow_WarmDiskCache_Static(t *testing.T) {
	warmNestedThrow(t, diagnostics.CodeRUKPrivateFields, `export const strip = createRemoveUnknownKeysFn<{counter: Counter}>();`)
}

func TestNestedThrow_WarmDiskCache_Value(t *testing.T) {
	warmNestedThrow(t, diagnostics.CodeRUKPrivateFields, `declare const value: {counter: Counter};
export const strip = createRemoveUnknownKeysFn(value);`)
}

func TestNestedThrow_WarmDiskCacheValidate_Static(t *testing.T) {
	warmNestedThrow(t, diagnostics.CodeVLSymbolRoot, `export const check = createValidateFn<{inner: Inner}>();`)
}

func TestNestedThrow_WarmDiskCacheValidate_Value(t *testing.T) {
	warmNestedThrow(t, diagnostics.CodeVLSymbolRoot, `declare const value: {inner: Inner};
export const check = createValidateFn(value);`)
}
