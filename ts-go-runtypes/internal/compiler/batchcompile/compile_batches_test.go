package batchcompile

// The batch transport through the tsc-like lane: a SERVER project compiled
// with ClientTsconfig ends up with `<genDir>/rpc/` and an emitted router-init
// module that imports the table by a relative path; the CLIENT project's
// emitted `.js` carries the batch id and the mapper hash. Both halves live in
// separate on-disk projects, the way a real client + API pair does.

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// batchClientDTS is the ambient stand-in for the `@mionjs/client` surface the
// batches lane reads (the markers come from the real package under
// node_modules, so the brands are the shipped declarations).
const batchClientDTS = `declare module '@mionjs/client' {
  import type {PureFunction, InjectPureFnHash, InjectBatchId} from '@mionjs/run-types';
  export interface RouteSubRequest<PH> { id: string }
  export type ClientRoutes<RA> = { [K in keyof RA]: RA[K] extends (...a: infer P) => infer R ? (...p: P) => RouteSubRequest<RA[K]> : ClientRoutes<RA[K]> };
  export function initClient<RA>(o?: unknown): {client: unknown; routes: ClientRoutes<RA>};
  export interface InputFromRef<F> { asArg(): ReturnType<F> }
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, name: string): InputFromRef<(v: any) => M>;
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnHash<(v: any) => M>): InputFromRef<(v: any) => M>;
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R], batchId?: InjectBatchId<R>): unknown;
}
`

const routerDTS = `declare module '@mionjs/router' {
  export function createMionRouter(opts?: unknown): {initRoutes: (routes: unknown) => unknown};
}
`

const clientRoutesTS = `import {initClient} from '@mionjs/client';
export type Routes = {
  users: {getById: (id: number) => {id: number; name: string}};
  orders: {getById: (id: number) => {id: number}};
};
export const {routes} = initClient<Routes>();
`

const clientBatchTS = `import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(inputFrom(user, (u: {id: number}) => u.id))]);
`

const serverTS = `import {createMionRouter} from '@mionjs/router';
export const mion = createMionRouter();
export const api = mion.initRoutes({});
`

const projectTsconfigJSON = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "rootDir": "src", "outDir": "dist", "sourceMap": true, "strict": true,
    "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true
  },
  "include": ["src"]
}
`

// writeProject lays out one on-disk project: the tsconfig, the real marker
// package under node_modules, and the given src files.
func writeProject(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "tsconfig.json"), projectTsconfigJSON)
	marker, err := testfixtures.RealMarkerPackage()
	if err != nil {
		t.Fatalf("real marker package: %v", err)
	}
	for rel, content := range marker {
		writeFile(t, filepath.Join(dir, filepath.FromSlash(rel)), content)
	}
	for rel, content := range files {
		writeFile(t, filepath.Join(dir, "src", rel), content)
	}
	return dir
}

func compileProject(t *testing.T, dir string, mutate func(*Options)) *Result {
	t.Helper()
	opts := Options{
		Cwd:          dir,
		TsconfigPath: "tsconfig.json",
		GenDir:       filepath.Join(dir, ".mion"),
		ResolverOpts: resolver.Options{
			Cwd:        dir,
			EmitMode:   constants.EmitCode,
			ModuleMode: constants.ModuleModeDefault,
			InlineMode: constants.InlineModeDefault,
			CacheDir:   filepath.Join(dir, ".cache"),
		},
	}
	if mutate != nil {
		mutate(&opts)
	}
	result, err := Run(opts)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	return result
}

func readEmitted(t *testing.T, dir, name string) string {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(dir, "dist", name))
	if err != nil {
		t.Fatalf("read emitted %s: %v", name, err)
	}
	return string(content)
}

// TestCompile_ServerGeneratesBatchTransportFromClientTsconfig: the server
// compile writes rpc/ from the client project and appends the relativized
// table import to the emitted router-init module.
func TestCompile_ServerGeneratesBatchTransportFromClientTsconfig(t *testing.T) {
	clientDir := writeProject(t, map[string]string{"client.d.ts": batchClientDTS, "routes.ts": clientRoutesTS, "a.ts": clientBatchTS})
	serverDir := writeProject(t, map[string]string{"router.d.ts": routerDTS, "server.ts": serverTS})

	compileProject(t, serverDir, func(opts *Options) {
		opts.ResolverOpts.ClientTsconfig = filepath.Join(clientDir, "tsconfig.json")
	})

	module, err := os.ReadFile(filepath.Join(serverDir, ".mion", "rpc", "batches.generated.js"))
	if err != nil {
		t.Fatalf("the server compile wrote no batch module: %v", err)
	}
	if !strings.Contains(string(module), "replaceBatches({") || !strings.Contains(string(module), "from './pf/rt/") {
		t.Errorf("batch module lacks the table or the relative mapper import:\n%s", module)
	}
	if strings.Contains(string(module), clientDir) {
		t.Errorf("batch module leaks the client path:\n%s", module)
	}
	mappers, _ := filepath.Glob(filepath.Join(serverDir, ".mion", "rpc", "pf", "rt", "*.js"))
	if len(mappers) != 1 {
		t.Errorf("expected one mapper module under rpc/pf/rt, got %v", mappers)
	}

	// The emitted server module ends with the import, relativized from
	// dist/server.js to .mion/rpc/; the virtual specifier never survives emit.
	server := readEmitted(t, serverDir, "server.js")
	if strings.Contains(server, "rtrpc:") {
		t.Errorf("emitted server still has the virtual specifier:\n%s", server)
	}
	if !strings.Contains(server, "import '../.mion/rpc/batches.generated.js';") {
		t.Errorf("emitted server lacks the relativized table import:\n%s", server)
	}
	if !strings.Contains(server, "createMionRouter(") {
		t.Errorf("emitted server lost its body:\n%s", server)
	}
}

// TestCompile_ClientCarriesBatchIdAndMapperHash: the client compile splices
// the batch id and the inline mapper's hash into the emitted `.js`, even
// though the file has no reflection marker of its own.
func TestCompile_ClientCarriesBatchIdAndMapperHash(t *testing.T) {
	clientDir := writeProject(t, map[string]string{"client.d.ts": batchClientDTS, "routes.ts": clientRoutesTS, "a.ts": clientBatchTS})
	compileProject(t, clientDir, nil)
	emitted := readEmitted(t, clientDir, "a.js")
	if !regexp.MustCompile(`'b_[A-Za-z0-9_-]+'`).MatchString(emitted) {
		t.Errorf("emitted client lacks the batch id:\n%s", emitted)
	}
	if !regexp.MustCompile(`'rt::[A-Za-z0-9_-]+'`).MatchString(emitted) {
		t.Errorf("emitted client lacks the mapper hash:\n%s", emitted)
	}
	// a client is not a server: nothing generated under rpc/, no import appended
	if _, err := os.Stat(filepath.Join(clientDir, ".mion", "rpc")); !os.IsNotExist(err) {
		t.Errorf("a client-only compile must write no rpc/ (stat err = %v)", err)
	}
}

// TestCompile_NeverWritesOutsideOutDir: a program that reaches a file outside
// its rootDir (here through a relative import above the source root, the same
// shape a `paths` entry into a sibling package takes) must not get that file
// emitted beside its source. tsgo places such outputs outside outDir; the
// compile lane skips them and reports which.
func TestCompile_NeverWritesOutsideOutDir(t *testing.T) {
	base := t.TempDir()
	shared := filepath.Join(base, "shared", "util.ts")
	writeFile(t, shared, "export const shared = 1;\n")
	app := filepath.Join(base, "app")
	writeFile(t, filepath.Join(app, "tsconfig.json"), projectTsconfigJSON)
	marker, err := testfixtures.RealMarkerPackage()
	if err != nil {
		t.Fatalf("real marker package: %v", err)
	}
	for rel, content := range marker {
		writeFile(t, filepath.Join(app, filepath.FromSlash(rel)), content)
	}
	writeFile(t, filepath.Join(app, "src", "a.ts"), "import {shared} from '../../shared/util.ts';\nexport const a = shared + 1;\n")

	result := compileProject(t, app, nil)

	if _, statErr := os.Stat(filepath.Join(base, "shared", "util.js")); !os.IsNotExist(statErr) {
		t.Errorf("util.js was written beside its source, outside outDir (stat err = %v)", statErr)
	}
	if _, statErr := os.Stat(filepath.Join(app, "dist", "a.js")); statErr != nil {
		t.Errorf("dist/a.js missing: %v", statErr)
	}
	// the emitted module and its source map, both refused
	if len(result.SkippedOutsideOutDir) != 2 || !strings.HasSuffix(result.SkippedOutsideOutDir[0], "util.js") || !strings.HasSuffix(result.SkippedOutsideOutDir[1], "util.js.map") {
		t.Errorf("SkippedOutsideOutDir = %v, want util.js and util.js.map", result.SkippedOutsideOutDir)
	}
	for _, emitted := range result.EmittedFiles {
		if !strings.HasPrefix(emitted, filepath.Join(app, "dist")) {
			t.Errorf("emitted file outside outDir: %s", emitted)
		}
	}
}
