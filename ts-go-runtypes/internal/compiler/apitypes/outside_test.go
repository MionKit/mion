package apitypes

import (
	"strings"
	"testing"
)

// geoDTS is an outside package the API reaches: one declaration per shape a printed type must keep.
const geoDTS = `export interface Address { street: string; city: string; zip?: string }
export type Point = { lat: number; lng: number };
export interface TreeNode { value: string; children: TreeNode[] }
export interface Page<T> { items: T[]; total: number }
export declare class Money {
    #private;
    private secret;
    amount: number;
    readonly currency: string;
    get rounded(): number;
    add(other: Money): Money;
    map<T>(fn: (value: number) => T): T[];
    static zero(): Money;
}
export declare class Priced extends Money { label: string }
export declare class GeoError extends Error { code: number }
export declare enum Role { Admin = "admin", User = "user" }
export declare const enum Level { Low = 0, High = 1 }
declare const brand: unique symbol;
export type UserId = string & { [brand]: "UserId" };
export interface Meta {
    /** @nonEnumerable */
    cached?: string;
    name: string;
}
export declare const origin: { lat: number; lng: number };
export declare namespace Geo { interface Area { name: string } }
export interface Area { size: number }
export * from './extra.js';
`

// trimWithGeo trims an API whose index.d.ts reaches the geo package, laid out beside the usual stubs.
func trimWithGeo(t *testing.T, index string, extra map[string]string) (*Output, Input) {
	t.Helper()
	project := map[string]string{
		"node_modules/geo/package.json": `{"name": "geo", "types": "index.d.ts"}`,
		"node_modules/geo/index.d.ts":   geoDTS,
		"node_modules/geo/extra.d.ts":   "export type Extra = { note: string };\n",
	}
	for rel, text := range extra {
		project[rel] = text
	}
	output, input, err := tryTrimIn(t, map[string]string{"index.d.ts": index}, "", project)
	if err != nil {
		t.Fatal(err)
	}
	return output, input
}

// assertSelfContained: no peer but the router (and the listed libraries), the package checks alone, ids hold.
func assertSelfContained(t *testing.T, output *Output, input Input, peers ...string) {
	t.Helper()
	want := strings.Join(append([]string{"@mionjs/router"}, peers...), ",")
	if strings.Join(output.Externals, ",") != want {
		t.Errorf("peers %v, want %s; warnings %v", output.Externals, want, output.Warnings)
	}
	for rel, text := range output.Files {
		if strings.Contains(text, "'geo'") || strings.Contains(text, `"geo"`) {
			t.Errorf("%s still imports geo:\n%s", rel, text)
		}
	}
	assertChecks(t, input, output)
	assertIDParity(t, input, output)
}

func TestOutside_InterfacesAliasesAndReExports(t *testing.T) {
	output, input := trimWithGeo(t, `import type { Address, Point, Extra } from 'geo';
`+apiOf(`get: import("@mionjs/router").PublicRoute<(a: Address, p: Point) => Promise<Extra>>;`), nil)
	assertSelfContained(t, output, input)
	assertContains(t, output.Files["_outside/geo.d.ts"], "export type Address = {", "export type Point = {", "export type Extra = {note: string};")
}

func TestOutside_RecursiveAndGenericTypes(t *testing.T) {
	output, input := trimWithGeo(t, `import type { TreeNode, Page, Address } from 'geo';
`+apiOf(`get: import("@mionjs/router").PublicRoute<(tree: TreeNode) => Promise<Page<Address>>>;`), nil)
	assertSelfContained(t, output, input)
	assertContains(t, output.Files["_outside/geo.d.ts"], "export type TreeNode = {children: TreeNode[]; value: string};")
}

func TestOutside_ClassesKeepTheirNameMembersAndPrivateMarker(t *testing.T) {
	output, input := trimWithGeo(t, `import type { Money, Priced, GeoError } from 'geo';
`+apiOf(`get: import("@mionjs/router").PublicRoute<(m: Money, p: Priced) => Promise<GeoError>>;`), nil)
	assertSelfContained(t, output, input)
	assertContains(t, output.Files["_outside/geo.d.ts"], "export declare class Money {", "#private;", "private secret;", "get rounded(): number;",
		"export declare class Priced {", "label: string;", "export declare class GeoError {")
	assertLacks(t, output.Files["_outside/geo.d.ts"], "zero")
}

func TestOutside_EnumsAndConstEnums(t *testing.T) {
	output, input := trimWithGeo(t, `import type { Role, Level } from 'geo';
`+apiOf(`get: import("@mionjs/router").PublicRoute<(r: Role, l: Level) => Promise<Role.Admin>>;`), nil)
	assertSelfContained(t, output, input)
	assertContains(t, output.Files["_outside/geo.d.ts"], "export declare enum Role { Admin = 'admin', User = 'user' }")
}

func TestOutside_UniqueSymbolBrandsAndNonEnumerableMembers(t *testing.T) {
	output, input := trimWithGeo(t, `import type { UserId, Meta } from 'geo';
`+apiOf(`get: import("@mionjs/router").PublicRoute<(id: UserId) => Promise<Meta>>;`), nil)
	assertSelfContained(t, output, input)
	assertContains(t, output.Files["_outside/geo.d.ts"], "declare const brand: unique symbol;", "[brand]: 'UserId'", "@nonEnumerable")
}

func TestOutside_ImportTypesNamespacesAndTypeofValues(t *testing.T) {
	output, input := trimWithGeo(t, `import type * as geo from 'geo';
import type { origin } from 'geo';
`+apiOf(`get: import("@mionjs/router").PublicRoute<(a: geo.Geo.Area, b: import("geo").Area, c: typeof origin) => Promise<void>>;`), nil)
	assertSelfContained(t, output, input)
}

func TestOutside_ATypeofProjectValueTypedByAnOutsideTypePrintsTheValueType(t *testing.T) {
	output, input := trimWithGeo(t, `import type { Page, Address } from 'geo';
declare const book: Page<Address>;
export type Book = typeof book;
`+apiOf(`get: import("@mionjs/router").PublicRoute<() => Promise<Book>>;`), nil)
	assertSelfContained(t, output, input)
	assertLacks(t, output.Files["index.d.ts"], "declare const book")
}

func TestOutside_AProjectInterfaceExtendingAnOutsideOneImportsIt(t *testing.T) {
	output, input := trimWithGeo(t, `import type { Address, Money } from 'geo';
export interface Office extends Address { floor: number }
export declare class Wallet extends Money { owner: string }
`+apiOf(`get: import("@mionjs/router").PublicRoute<(o: Office) => Promise<Wallet>>;`), nil)
	assertSelfContained(t, output, input)
	assertContains(t, output.Files["index.d.ts"], `from "./_outside/geo.js";`, "extends Address", "extends Money")
}

func TestOutside_AnOutsideTypeOverAProjectTypeKeepsTheProjectOne(t *testing.T) {
	output, input := trimWithGeo(t, `import type { Page } from 'geo';
export declare class Owner { name: string }
`+apiOf(`get: import("@mionjs/router").PublicRoute<() => Promise<Page<Owner>>>;`), nil)
	assertSelfContained(t, output, input)
	assertContains(t, output.Files["_outside/geo.d.ts"], `import("../index.js").Owner`)
	assertLacks(t, output.Files["_outside/geo.d.ts"], "declare class Owner")
}

func TestOutside_ATypeParameterKeepsTheImportWithAWarning(t *testing.T) {
	output, input := trimWithGeo(t, `import type { Page } from 'geo';
export type Paged<T> = Page<T>;
`+apiOf(`get: import("@mionjs/router").PublicRoute<() => Promise<Paged<string>>>;`), nil)
	if strings.Join(output.Externals, ",") != "@mionjs/router,geo" || len(output.Warnings) != 1 || !strings.Contains(output.Warnings[0], "type parameter") {
		t.Errorf("a use over a type parameter must stay an import with a warning, got peers %v warnings %v", output.Externals, output.Warnings)
	}
	assertChecks(t, input, output)
	if _, problems := clientMemberIDs(t, input, output, nil); len(problems) == 0 {
		t.Errorf("the parity client must fail on a package import it lacks, or it proves nothing")
	}
}

// nodeTypesDTS is a node typings stub with a global class and an ambient module class, both platform.
const nodeTypesDTS = `declare class Socketish { remote: string; close(): void }
declare module 'node:http' { export class IncomingMessage { url?: string; headers: Record<string, string> } }
`

func TestOutside_PlatformTypesStayAndTheEntryLoadsThem(t *testing.T) {
	output, input := trimWithGeo(t, `import type { IncomingMessage } from 'node:http';
`+apiOf(`get: import("@mionjs/router").PublicRoute<(s: Socketish, m: IncomingMessage) => Promise<void>>;`),
		map[string]string{"node_modules/@types/node/index.d.ts": nodeTypesDTS})
	assertSelfContained(t, output, input, "@types/node")
	assertContains(t, output.Files["index.d.ts"], `/// <reference types="node" />`, "import type { IncomingMessage } from 'node:http';")
	assertLacks(t, strings.Join(mapValues(output.Files), "\n"), "class Socketish", "class IncomingMessage")
}

func TestOutside_APrintedTypeNamingAPlatformClassSpellsItWhereItIsDeclared(t *testing.T) {
	output, input := trimWithGeo(t, `import type { Conn } from 'conn';
`+apiOf(`get: import("@mionjs/router").PublicRoute<(c: Conn) => Promise<void>>;`),
		map[string]string{
			"node_modules/@types/node/index.d.ts": nodeTypesDTS,
			"node_modules/conn/package.json":      `{"name": "conn", "types": "index.d.ts"}`,
			"node_modules/conn/index.d.ts":        "import type { IncomingMessage } from 'node:http';\nexport interface Conn { socket: Socketish; request: IncomingMessage }\n",
		})
	assertSelfContained(t, output, input, "@types/node")
	assertContains(t, output.Files["_outside/conn.d.ts"], "socket: Socketish", `request: import("node:http").IncomingMessage`)
	assertContains(t, output.Files["index.d.ts"], `/// <reference types="node" />`)
}

func TestOutside_ADomTypeAddsItsLibReference(t *testing.T) {
	output, input := trimWithGeo(t, apiOf(`get: import("@mionjs/router").PublicRoute<(b: Blob) => Promise<void>>;`),
		map[string]string{"tsconfig.json": `{"compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "strict": true, "lib": ["ES2022", "DOM"], "types": []}, "include": ["src"]}`})
	assertContains(t, output.Files["index.d.ts"], `/// <reference lib="dom" />`)
	assertLacks(t, output.Files["index.d.ts"], `reference lib="es`)
	assertSelfContained(t, output, input)
}
