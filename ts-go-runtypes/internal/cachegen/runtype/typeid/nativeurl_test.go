package typeid_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// nodeUrlDTS mirrors how @types/node declares URL: a class in the `node:url` module plus a global interface and
// var re-exposing it, all outside the bundled lib. Kept hermetic instead of depending on @types/node.
var nodeUrlDTS = map[string]string{
	"node-url.d.ts": `declare module "node:url" {
  class URL {
    constructor(input: string, base?: string | URL);
    href: string;
    host: string;
    pathname: string;
    toJSON(): string;
    static canParse(input: string, base?: string): boolean;
  }
}
`,
	"node-globals.d.ts": `import * as url from "node:url";
declare global {
  interface URL extends url.URL {}
  var URL: typeof url.URL;
}
export {};
`,
}

func assertNativeUrl(t *testing.T, label string, root *reflection.RunType) {
	t.Helper()
	if root.Kind != reflection.KindClass || root.SubKind != reflection.SubKindUrl {
		t.Fatalf("%s: expected KindClass + SubKindUrl, got kind %d subKind %d", label, root.Kind, root.SubKind)
	}
	if root.ClassRef == nil || root.ClassRef.Builtin != "URL" {
		t.Fatalf("%s: expected builtin classRef URL, got %+v", label, root.ClassRef)
	}
	if len(root.Children) != 0 {
		t.Fatalf("%s: URL must project atomically, got %d members", label, len(root.Children))
	}
}

func TestNativeUrl_DomLib(t *testing.T) {
	root := rootUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<URL>();
`)
	assertNativeUrl(t, "lib dom", root)
}

// Node's global URL is declared outside the bundled lib, so the lib-global test never sees it; before URL was a
// native it was walked member by member.
func TestNativeUrl_NodeTypesOnly(t *testing.T) {
	res, response := scanUnderLibWith(t, "esnext", `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<URL>();
`, nodeUrlDTS)
	assertNativeUrl(t, "@types/node", rootOf(t, res, response))
}

func rootOf(t *testing.T, res *resolver.Session, response protocol.Response) *reflection.RunType {
	t.Helper()
	if len(response.Sites) == 0 {
		t.Fatalf("no sites, diagnostics %v", response.Diagnostics)
	}
	for _, node := range res.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes {
		if node.ID == response.Sites[0].ID {
			return node
		}
	}
	t.Fatalf("root id %q not in dump", response.Sites[0].ID)
	return nil
}

// One id whatever declared URL: a model must hash the same under lib dom and under @types/node.
func TestNativeUrl_SameIdUnderDomAndNode(t *testing.T) {
	const source = `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{link: URL}>();
`
	dom := structuralUnderLib(t, "esnext,dom", source)
	res, response := scanUnderLibWith(t, "esnext", source, nodeUrlDTS)
	node := res.Cache().StructuralForHash(response.Sites[0].ID)
	if dom != node {
		t.Fatalf("{link: URL} must share its structural id across lib dom and @types/node:\n  dom  %s\n  node %s", dom, node)
	}
}

func TestNativeUrl_NodeUrlModuleImport(t *testing.T) {
	res, response := scanUnderLibWith(t, "esnext", `import {getRunTypeId} from '@mionjs/run-types';
import {URL} from 'node:url';
export const id = getRunTypeId<URL>();
`, nodeUrlDTS)
	assertNativeUrl(t, "node:url import", rootOf(t, res, response))
}

// A consumer's own class named URL is theirs: walked like any user class.
func TestNativeUrl_UserClassNamedUrlIsNotNative(t *testing.T) {
	root := rootUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
class URL {href = ''; mine = 1}
export const id = getRunTypeId<URL>();
`)
	if root.SubKind == reflection.SubKindUrl || root.SubKind == reflection.SubKindNonSerializable {
		t.Fatalf("a user class URL must stay a user class, got subKind %d", root.SubKind)
	}
	if root.ClassRef == nil || root.ClassRef.Builtin != "" {
		t.Fatalf("a user class URL must not carry a builtin classRef, got %+v", root.ClassRef)
	}
}

func TestNativeUrl_FormEquivalence(t *testing.T) {
	static := rootUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{link: URL}>();
`)
	reflected := rootUnderLib(t, "esnext,dom", `import {getRunTypeId} from '@mionjs/run-types';
const row = {link: new URL('https://example.com')};
export const id = getRunTypeId(row);
`)
	if static.ID != reflected.ID {
		t.Fatalf("getRunTypeId<{link: URL}>() and getRunTypeId(value) must share an id: %q vs %q", static.ID, reflected.ID)
	}
}
