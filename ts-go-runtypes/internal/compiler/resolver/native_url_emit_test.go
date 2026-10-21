package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// emitUnderDom scans one file under lib dom (where URL lives) and requests entry modules.
func emitUnderDom(t *testing.T, code string) protocol.Response {
	t.Helper()
	session := setupUnderDomLib(t, map[string]string{"u.ts": code})
	response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"u.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scan: %s", response.Error)
	}
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		t.Errorf("a URL must compile clean, got %s %v", diagnostic.Code, diagnostic.Args)
	}
	return response
}

func assertFamilyContains(t *testing.T, response protocol.Response, family, want string) {
	t.Helper()
	if source := familyEntrySources(response, family); !strings.Contains(source, want) {
		t.Fatalf("%s missing %q:\n%s", family, want, source)
	}
}

func TestNativeUrl_EmitValidate(t *testing.T) {
	response := emitUnderDom(t, `import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';
export const isUrl = createValidateFn<URL>();
export const urlErrors = createGetValidationErrorsFn<URL>();
`)
	assertFamilyContains(t, response, "validate", "instanceof URL")
	assertFamilyContains(t, response, "validationErrors", "instanceof URL")
}

// The restore guard: only a string reaches `new URL` (MustValidateJson); a bad string throws, like Temporal.X.from.
func TestNativeUrl_EmitRestoreIsGuarded(t *testing.T) {
	response := emitUnderDom(t, `import {createJsonDecoderFn} from '@mionjs/run-types';
export const decodeMutate = createJsonDecoderFn<{link: URL}>(undefined, {strategy: 'mutate'});
export const decodeClone = createJsonDecoderFn<{link: URL}>();
export const decodeCompact = createJsonDecoderFn<{link: URL}>(undefined, {strategy: 'compact'});
`)
	for _, family := range []string{"restoreFromJsonMutate", "restoreFromJsonClone", "compactFromJson"} {
		// The entry body is a quoted string, so its quotes are escaped.
		assertFamilyContains(t, response, family, `=== \'string\' ? new URL(`)
	}
}

func TestNativeUrl_EmitEncodeWritesHref(t *testing.T) {
	response := emitUnderDom(t, `import {createJsonEncoderFn} from '@mionjs/run-types';
export const encodeClone = createJsonEncoderFn<{link: URL}>();
export const encodeCompact = createJsonEncoderFn<{link: URL}>(undefined, {strategy: 'compact'});
`)
	assertFamilyContains(t, response, "prepareForJsonClone", ".href")
	assertFamilyContains(t, response, "compactForJson", ".href")
}

// A URL is mutable (every component has a setter), so a clone must not share it.
func TestNativeUrl_EmitCloneRewraps(t *testing.T) {
	response := emitUnderDom(t, `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export const clean = createRemoveUnknownKeysFn<{link: URL}>();
`)
	assertFamilyContains(t, response, "removeUnknownKeys", "new URL(")
}

func TestNativeUrl_RunTypeCacheCarriesClassType(t *testing.T) {
	response := emitUnderDom(t, `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<URL>();
`)
	if !strings.Contains(allEntrySources(response), "globalThis.URL") {
		t.Fatalf("runType bundle missing classType wiring globalThis.URL:\n%s", allEntrySources(response))
	}
}

// Marker coverage rule: the value-first call reaches the same validator as the type-first one.
func TestNativeUrl_ValueFirstValidate(t *testing.T) {
	response := emitUnderDom(t, `import {createValidateFn} from '@mionjs/run-types';
const link = new URL('https://example.com');
export const isUrl = createValidateFn(link);
`)
	assertFamilyContains(t, response, "validate", "instanceof URL")
}
