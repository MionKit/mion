package typeid_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// Where a type is declared decides if it is data: a platform type stays not data unless another file adds a member.

type platformIntent struct {
	// Extra tsconfig compiler options; empty lists the staged runtime packages in `types`.
	options string
	spelled string
	imports string
	extra   map[string]string
	notData bool
	builtin string
}

func (intent platformIntent) source(valueShape bool, siteType string) string {
	source := `import {getRunTypeId} from '@mionjs/run-types';
` + intent.imports
	if valueShape {
		return source + "declare const value: " + siteType + ";\nexport const id = getRunTypeId(value);\n"
	}
	return source + "export const id = getRunTypeId<" + siteType + ">();\n"
}

const runtimeTypes = `"types":["node","handles"]`

func (intent platformIntent) tsconfigOptions() string {
	if intent.options == "" {
		return runtimeTypes
	}
	return intent.options
}

func (intent platformIntent) files() map[string]string {
	files := testfixtures.RuntimePackages()
	for name, content := range intent.extra {
		files[name] = content
	}
	return files
}

func (intent platformIntent) root(t *testing.T, valueShape bool) *reflection.RunType {
	t.Helper()
	root, _ := dumpUnderLib(t, "esnext,dom", intent.tsconfigOptions(), intent.source(valueShape, intent.spelled), intent.files())
	return root
}

func (intent platformIntent) checkRoot(t *testing.T, valueShape bool) {
	t.Helper()
	root := intent.root(t, valueShape)
	assertPlatformNode(t, intent, root)
}

func assertPlatformNode(t *testing.T, intent platformIntent, node *reflection.RunType) {
	t.Helper()
	if isNotData := node.SubKind == reflection.SubKindNonSerializable; isNotData != intent.notData {
		t.Fatalf("%s: not data = %v, want %v", intent.spelled, isNotData, intent.notData)
	}
	if !intent.notData {
		return
	}
	if node.ClassRef == nil || node.ClassRef.Builtin != intent.builtin {
		t.Errorf("%s: expected builtin classRef %q, got %+v", intent.spelled, intent.builtin, node.ClassRef)
	}
	if len(node.Children) != 0 {
		t.Errorf("%s must project atomically, got %d members", intent.spelled, len(node.Children))
	}
}

func globals(content string) map[string]string { return map[string]string{"globals.d.ts": content} }

var (
	emptyMerge      = platformIntent{spelled: "Headers", extra: globals("interface Headers {}\n"), notData: true, builtin: "Headers"}
	restatedMembers = platformIntent{spelled: "Headers", extra: globals("interface Headers {get(name: string): string | null}\n"), notData: true, builtin: "Headers"}
	varOnly         = platformIntent{spelled: "Headers", extra: globals("declare var Headers: {new (): Headers};\n"), notData: true, builtin: "Headers"}
	packageRestates = platformIntent{spelled: "Headers", notData: true, builtin: "Headers"}
	ambientModule   = platformIntent{spelled: "EventEmitter", imports: "import {EventEmitter} from 'events';\n", notData: true, builtin: "EventEmitter"}
	globalNamespace = platformIntent{spelled: "NodeJS.Timeout", notData: true, builtin: "Timeout"}
	declareGlobal   = platformIntent{spelled: "RuntimeHandle", notData: true, builtin: "RuntimeHandle"}
	// An inherited member restated on a merge adds nothing: `dispatchEvent` only comes from EventTarget.
	inheritedRestated = platformIntent{
		spelled: "AbortSignal", notData: true, builtin: "AbortSignal",
		extra: globals("interface AbortSignal {dispatchEvent(event: Event): boolean}\n"),
	}
	// A second declaration of an existing method name counts as a restatement, whatever its parameters.
	addedOverload = platformIntent{spelled: "Headers", extra: globals("interface Headers {get(name: string, fallback: string): string}\n"), notData: true, builtin: "Headers"}

	addedMember      = platformIntent{spelled: "Headers", extra: globals("interface Headers {mine: string}\n")}
	addedCallSig     = platformIntent{spelled: "Headers", extra: globals("interface Headers {(): void}\n")}
	interfaceExtends = platformIntent{spelled: "Headers", extra: globals("interface Base {a: string}\ninterface Headers extends Base {}\n")}
	classExtends     = platformIntent{spelled: "RuntimeHandle", extra: globals("declare class Base {a: string}\ndeclare class RuntimeHandle extends Base {}\n")}
	userOnlyShape    = platformIntent{spelled: "Widget", extra: globals("interface Widget {id: string}\ndeclare var Widget: {new (): Widget};\n")}
	userOnlyClass    = platformIntent{spelled: "Emitter", extra: globals("declare class Emitter {on(): void}\n")}
	libraryClass     = platformIntent{spelled: "Dto", imports: "import {Dto} from 'dto-lib';\n"}
)

// Where the environment starts and stops: what the tsconfig loads, never a folder.
var (
	notInTypes      = platformIntent{spelled: "RuntimeHandle", options: `"types":[]`}
	namespaceNotIn  = platformIntent{spelled: "NodeJS.Timeout", options: `"types":[]`}
	noTypesList     = platformIntent{spelled: "RuntimeHandle", options: `"noEmit":true`}
	libWithoutTypes = platformIntent{spelled: "Headers", options: `"noEmit":true`, extra: globals("interface Headers {}\n"), notData: true, builtin: "Headers"}
	ambientLibrary  = platformIntent{
		spelled: "AmbientDto", imports: "import {AmbientDto} from 'ambient-lib';\n",
		extra: map[string]string{"node_modules/ambient-lib/index.d.ts": ambientLibraryDTS},
	}
	ambientLibraryGlobal = platformIntent{spelled: "AmbientGlobal", extra: map[string]string{"node_modules/ambient-lib/index.d.ts": ambientLibraryDTS}}
	customTypeRoot       = platformIntent{
		spelled: "EdgeHandle", options: `"typeRoots":["./custom-types"],"types":["edge"]`, notData: true, builtin: "EdgeHandle",
		extra: map[string]string{"custom-types/edge/index.d.ts": "interface EdgeHandle {close(): void}\n"},
	}
	nodeModulesNotInTypes = platformIntent{spelled: "EdgeCopyHandle", extra: map[string]string{"node_modules/edge-copy/index.d.ts": "interface EdgeCopyHandle {close(): void}\n"}}
	referenceChain        = platformIntent{
		spelled: "RuntimeHandle", options: `"types":["runtime-a"]`, notData: true, builtin: "RuntimeHandle",
		extra: map[string]string{"node_modules/@types/runtime-a/index.d.ts": "/// <reference types=\"handles\" />\ninterface RuntimeAThing {close(): void}\n"},
	}
	wildcardTypes       = platformIntent{spelled: "RuntimeHandle", options: `"types":["*"]`, notData: true, builtin: "RuntimeHandle"}
	firstPartyReference = platformIntent{
		spelled: "RuntimeHandle", options: `"types":[]`, notData: true, builtin: "RuntimeHandle",
		extra: globals("/// <reference types=\"handles\" />\n"),
	}
	dependencyReference = platformIntent{
		spelled: "RuntimeHandle", options: `"types":[]`, notData: true, builtin: "RuntimeHandle",
		imports: "import {serve} from 'web-lib';\n",
		extra:   map[string]string{"node_modules/web-lib/index.d.ts": "/// <reference types=\"handles\" />\nexport declare function serve(): void;\n"},
	}
	moduleClassInTypes = platformIntent{
		spelled: "TypesDto", options: `"types":["node","handles","dto-types"]`, imports: "import {TypesDto} from 'dto-types';\n",
		extra: map[string]string{"node_modules/@types/dto-types/index.d.ts": "export declare class TypesDto {id: string}\n"},
	}
)

// An imported library, not loaded through `types`.
const ambientLibraryDTS = `declare module "ambient-lib" {
  export class AmbientDto {
    id: string;
  }
}
interface AmbientGlobal {
  close(): void;
}
`

var allPlatformIntents = []platformIntent{
	emptyMerge, restatedMembers, varOnly, packageRestates, ambientModule, globalNamespace, declareGlobal, inheritedRestated,
	addedOverload, addedMember, addedCallSig, interfaceExtends, classExtends, userOnlyShape, userOnlyClass, libraryClass,
	notInTypes, namespaceNotIn, noTypesList, libWithoutTypes, ambientLibrary, ambientLibraryGlobal, customTypeRoot,
	nodeModulesNotInTypes, referenceChain, wildcardTypes, firstPartyReference, dependencyReference, moduleClassInTypes,
}

func TestPlatformDeclared_PackageNotInTypesStaysData_Static(t *testing.T) {
	notInTypes.checkRoot(t, false)
}
func TestPlatformDeclared_PackageNotInTypesStaysData_Value(t *testing.T) {
	notInTypes.checkRoot(t, true)
}

func TestPlatformDeclared_NamespaceNotInTypesStaysData_Static(t *testing.T) {
	namespaceNotIn.checkRoot(t, false)
}
func TestPlatformDeclared_NamespaceNotInTypesStaysData_Value(t *testing.T) {
	namespaceNotIn.checkRoot(t, true)
}

func TestPlatformDeclared_NoTypesListLoadsNoRuntime_Static(t *testing.T) {
	noTypesList.checkRoot(t, false)
}
func TestPlatformDeclared_NoTypesListLoadsNoRuntime_Value(t *testing.T) {
	noTypesList.checkRoot(t, true)
}

func TestPlatformDeclared_NoTypesListKeepsTheLib_Static(t *testing.T) {
	libWithoutTypes.checkRoot(t, false)
}
func TestPlatformDeclared_NoTypesListKeepsTheLib_Value(t *testing.T) {
	libWithoutTypes.checkRoot(t, true)
}

func TestPlatformDeclared_ImportedAmbientModuleClassStaysData_Static(t *testing.T) {
	ambientLibrary.checkRoot(t, false)
}
func TestPlatformDeclared_ImportedAmbientModuleClassStaysData_Value(t *testing.T) {
	ambientLibrary.checkRoot(t, true)
}

func TestPlatformDeclared_ImportedLibraryGlobalStaysData_Static(t *testing.T) {
	ambientLibraryGlobal.checkRoot(t, false)
}
func TestPlatformDeclared_ImportedLibraryGlobalStaysData_Value(t *testing.T) {
	ambientLibraryGlobal.checkRoot(t, true)
}

func TestPlatformDeclared_TypesOutsideNodeModules_Static(t *testing.T) {
	customTypeRoot.checkRoot(t, false)
}
func TestPlatformDeclared_TypesOutsideNodeModules_Value(t *testing.T) {
	customTypeRoot.checkRoot(t, true)
}

func TestPlatformDeclared_NodeModulesNotInTypesStaysData_Static(t *testing.T) {
	nodeModulesNotInTypes.checkRoot(t, false)
}
func TestPlatformDeclared_NodeModulesNotInTypesStaysData_Value(t *testing.T) {
	nodeModulesNotInTypes.checkRoot(t, true)
}

func TestPlatformDeclared_ReferenceTypesChain_Static(t *testing.T) {
	referenceChain.checkRoot(t, false)
}
func TestPlatformDeclared_ReferenceTypesChain_Value(t *testing.T) { referenceChain.checkRoot(t, true) }

func TestPlatformDeclared_WildcardTypes_Static(t *testing.T) { wildcardTypes.checkRoot(t, false) }
func TestPlatformDeclared_WildcardTypes_Value(t *testing.T)  { wildcardTypes.checkRoot(t, true) }

func TestPlatformDeclared_FirstPartyReferenceTypes_Static(t *testing.T) {
	firstPartyReference.checkRoot(t, false)
}
func TestPlatformDeclared_FirstPartyReferenceTypes_Value(t *testing.T) {
	firstPartyReference.checkRoot(t, true)
}

// A dependency's `/// <reference types>` target is environment, as `node` is for `@types/express`.
func TestPlatformDeclared_DependencyReferenceTypes_Static(t *testing.T) {
	dependencyReference.checkRoot(t, false)
}
func TestPlatformDeclared_DependencyReferenceTypes_Value(t *testing.T) {
	dependencyReference.checkRoot(t, true)
}

func TestPlatformDeclared_ModuleClassLoadedByTypesStaysData_Static(t *testing.T) {
	moduleClassInTypes.checkRoot(t, false)
}
func TestPlatformDeclared_ModuleClassLoadedByTypesStaysData_Value(t *testing.T) {
	moduleClassInTypes.checkRoot(t, true)
}

func TestPlatformDeclared_EmptyMerge_Static(t *testing.T) { emptyMerge.checkRoot(t, false) }
func TestPlatformDeclared_EmptyMerge_Value(t *testing.T)  { emptyMerge.checkRoot(t, true) }

func TestPlatformDeclared_RestatedMembers_Static(t *testing.T) { restatedMembers.checkRoot(t, false) }
func TestPlatformDeclared_RestatedMembers_Value(t *testing.T)  { restatedMembers.checkRoot(t, true) }

func TestPlatformDeclared_VarOnly_Static(t *testing.T) { varOnly.checkRoot(t, false) }
func TestPlatformDeclared_VarOnly_Value(t *testing.T)  { varOnly.checkRoot(t, true) }

func TestPlatformDeclared_RuntimePackageRestatesLib_Static(t *testing.T) {
	packageRestates.checkRoot(t, false)
}
func TestPlatformDeclared_RuntimePackageRestatesLib_Value(t *testing.T) {
	packageRestates.checkRoot(t, true)
}

func TestPlatformDeclared_AmbientModuleClass_Static(t *testing.T) { ambientModule.checkRoot(t, false) }
func TestPlatformDeclared_AmbientModuleClass_Value(t *testing.T)  { ambientModule.checkRoot(t, true) }

func TestPlatformDeclared_GlobalNamespaceType_Static(t *testing.T) {
	globalNamespace.checkRoot(t, false)
}
func TestPlatformDeclared_GlobalNamespaceType_Value(t *testing.T) { globalNamespace.checkRoot(t, true) }

func TestPlatformDeclared_DeclareGlobalType_Static(t *testing.T) { declareGlobal.checkRoot(t, false) }
func TestPlatformDeclared_DeclareGlobalType_Value(t *testing.T)  { declareGlobal.checkRoot(t, true) }

func TestPlatformDeclared_InheritedMemberRestated_Static(t *testing.T) {
	inheritedRestated.checkRoot(t, false)
}
func TestPlatformDeclared_InheritedMemberRestated_Value(t *testing.T) {
	inheritedRestated.checkRoot(t, true)
}

func TestPlatformDeclared_AddedOverloadIsARestatement_Static(t *testing.T) {
	addedOverload.checkRoot(t, false)
}
func TestPlatformDeclared_AddedOverloadIsARestatement_Value(t *testing.T) {
	addedOverload.checkRoot(t, true)
}

func TestPlatformDeclared_AddedMemberStaysData_Static(t *testing.T) { addedMember.checkRoot(t, false) }
func TestPlatformDeclared_AddedMemberStaysData_Value(t *testing.T)  { addedMember.checkRoot(t, true) }

func TestPlatformDeclared_AddedCallSignatureStaysData_Static(t *testing.T) {
	addedCallSig.checkRoot(t, false)
}
func TestPlatformDeclared_AddedCallSignatureStaysData_Value(t *testing.T) {
	addedCallSig.checkRoot(t, true)
}

func TestPlatformDeclared_InterfaceHeritageStaysData_Static(t *testing.T) {
	interfaceExtends.checkRoot(t, false)
}
func TestPlatformDeclared_InterfaceHeritageStaysData_Value(t *testing.T) {
	interfaceExtends.checkRoot(t, true)
}

func TestPlatformDeclared_ClassHeritageStaysData_Static(t *testing.T) {
	classExtends.checkRoot(t, false)
}
func TestPlatformDeclared_ClassHeritageStaysData_Value(t *testing.T) { classExtends.checkRoot(t, true) }

func TestPlatformDeclared_UserOnlyShapeStaysData_Static(t *testing.T) {
	userOnlyShape.checkRoot(t, false)
}
func TestPlatformDeclared_UserOnlyShapeStaysData_Value(t *testing.T) {
	userOnlyShape.checkRoot(t, true)
}

func TestPlatformDeclared_UserOnlyClassStaysData_Static(t *testing.T) {
	userOnlyClass.checkRoot(t, false)
}
func TestPlatformDeclared_UserOnlyClassStaysData_Value(t *testing.T) {
	userOnlyClass.checkRoot(t, true)
}

func TestPlatformDeclared_LibraryClassStaysData_Static(t *testing.T) {
	libraryClass.checkRoot(t, false)
}
func TestPlatformDeclared_LibraryClassStaysData_Value(t *testing.T) { libraryClass.checkRoot(t, true) }

// A supported native is matched by name first, so an empty merge into it leaves it the native.
func TestPlatformDeclared_DateStaysDate_Static(t *testing.T) {
	dateStaysDate(t, platformIntent{spelled: "Date", extra: globals("interface Date {}\n")}, false)
}

func TestPlatformDeclared_DateStaysDate_Value(t *testing.T) {
	dateStaysDate(t, platformIntent{spelled: "Date", extra: globals("interface Date {}\n")}, true)
}

func dateStaysDate(t *testing.T, intent platformIntent, valueShape bool) {
	t.Helper()
	if root := intent.root(t, valueShape); root.SubKind != reflection.SubKindDate {
		t.Fatalf("Date with an empty merge must stay Date, got subKind %d", root.SubKind)
	}
}

// One level deeper: the property's own node is the not-data one, and a data type stays walked.
func checkPlatformProperty(t *testing.T, valueShape bool) {
	t.Helper()
	for _, intent := range allPlatformIntents {
		root, nodes := dumpUnderLib(t, "esnext,dom", intent.tsconfigOptions(), intent.source(valueShape, "{id: number; field: "+intent.spelled+"}"), intent.files())
		field := fieldOf(root, nodes)
		if field == nil {
			t.Errorf("%s: no `field` property in %+v", intent.spelled, root)
			continue
		}
		assertPlatformPropertyNode(t, intent, field)
	}
}

func assertPlatformPropertyNode(t *testing.T, intent platformIntent, field *reflection.RunType) {
	t.Helper()
	if intent.notData {
		assertPlatformNode(t, intent, field)
		return
	}
	if field.SubKind == reflection.SubKindNonSerializable {
		t.Errorf("%s: a type the author or an ordinary library declared must stay walked", intent.spelled)
	}
}

func fieldOf(root *reflection.RunType, nodes map[string]*reflection.RunType) *reflection.RunType {
	for _, member := range root.Children {
		if member.Kind == reflection.KindRef {
			member = nodes[member.ID]
		}
		if member == nil || member.Name != "field" || member.Child == nil {
			continue
		}
		if member.Child.Kind == reflection.KindRef {
			return nodes[member.Child.ID]
		}
		return member.Child
	}
	return nil
}

func TestPlatformDeclared_PropertyOneLevelDeeper_Static(t *testing.T) {
	checkPlatformProperty(t, false)
}
func TestPlatformDeclared_PropertyOneLevelDeeper_Value(t *testing.T) { checkPlatformProperty(t, true) }

// A type reached through a node_modules or merged declaration gets one id in both call shapes.
func TestPlatformDeclared_FormEquivalence(t *testing.T) {
	for _, intent := range []platformIntent{emptyMerge, ambientModule, inheritedRestated, customTypeRoot, notInTypes} {
		if static, reflected := intent.root(t, false), intent.root(t, true); static.ID != reflected.ID {
			t.Errorf("%s: static and value forms must share an id: %q vs %q", intent.spelled, static.ID, reflected.ID)
		}
	}
}

// A view keeps its lib name unless a package adds a member, which makes it the author's and `Uint8Array` stands in.
func binaryViewBuiltin(t *testing.T, restated string, valueShape bool) string {
	t.Helper()
	intent := platformIntent{spelled: "Float32Array", extra: map[string]string{"node_modules/@types/typed/index.d.ts": restated}}
	root := intent.root(t, valueShape)
	if root.SubKind != reflection.SubKindNonSerializable || root.ClassRef == nil {
		t.Fatalf("a typed array is not data, got subKind %d classRef %+v", root.SubKind, root.ClassRef)
	}
	return root.ClassRef.Builtin
}

func TestPlatformDeclared_BinaryViewRestatedByRuntimePackage_Static(t *testing.T) {
	if got := binaryViewBuiltin(t, "interface Float32Array {}\n", false); got != "Float32Array" {
		t.Errorf("builtin = %q, want the lib name", got)
	}
}

func TestPlatformDeclared_BinaryViewRestatedByRuntimePackage_Value(t *testing.T) {
	if got := binaryViewBuiltin(t, "interface Float32Array {}\n", true); got != "Float32Array" {
		t.Errorf("builtin = %q, want the lib name", got)
	}
}

func TestPlatformDeclared_BinaryViewExtendedByRuntimePackage_Static(t *testing.T) {
	if got := binaryViewBuiltin(t, "interface Float32Array {extra(): void}\n", false); got != "Uint8Array" {
		t.Errorf("builtin = %q, want Uint8Array standing in for a view the lib alone does not declare", got)
	}
}

func TestPlatformDeclared_BinaryViewExtendedByRuntimePackage_Value(t *testing.T) {
	if got := binaryViewBuiltin(t, "interface Float32Array {extra(): void}\n", true); got != "Uint8Array" {
		t.Errorf("builtin = %q, want Uint8Array standing in for a view the lib alone does not declare", got)
	}
}

// URL is data, a supported native, from lib.dom, a runtime package's global, `node:url` and an empty `.ts` merge.
// Only a merge that adds a member makes it the author's.
type urlCase struct {
	imports, siteType string
	extra             map[string]string
	native            bool
}

var (
	urlFromLib         = urlCase{siteType: "URL", extra: map[string]string{}, native: true}
	urlRestatedByNode  = urlCase{siteType: "URL", native: true}
	urlFromNodeModule  = urlCase{imports: "import {URL as NodeURL} from 'node:url';\n", siteType: "NodeURL", native: true}
	urlEmptyMergeInTs  = urlCase{siteType: "URL", extra: map[string]string{"augment.ts": "export {};\ndeclare global {\n  interface URL {}\n}\n"}, native: true}
	urlAddedMemberInTs = urlCase{siteType: "URL", extra: map[string]string{"augment.ts": "export {};\ndeclare global {\n  interface URL {mine: string}\n}\n"}}
	urlEmptyMergeInDts = urlCase{siteType: "URL", extra: globals("interface URL {}\n"), native: true}
)

func (urlTest urlCase) check(t *testing.T, valueShape bool, property bool) {
	t.Helper()
	intent := platformIntent{spelled: urlTest.siteType, imports: urlTest.imports, extra: urlTest.extra}
	if urlTest.extra != nil && len(urlTest.extra) == 0 {
		intent.options = `"types":[]`
	}
	siteType := urlTest.siteType
	if property {
		siteType = "{id: number; field: " + siteType + "}"
	}
	root, nodes := dumpUnderLib(t, "esnext,dom", intent.tsconfigOptions(), intent.source(valueShape, siteType), intent.files())
	node := root
	if property {
		if node = fieldOf(root, nodes); node == nil {
			t.Fatalf("%s: no `field` property", urlTest.siteType)
		}
	}
	if isNative := node.SubKind == reflection.SubKindUrl; isNative != urlTest.native {
		t.Fatalf("%s: native URL = %v, want %v (subKind %d)", urlTest.siteType, isNative, urlTest.native, node.SubKind)
	}
	if node.SubKind == reflection.SubKindNonSerializable {
		t.Fatalf("%s: URL must never be taken whole as not data", urlTest.siteType)
	}
}

func TestPlatformDeclared_UrlFromLib_Static(t *testing.T) { urlFromLib.check(t, false, false) }
func TestPlatformDeclared_UrlFromLib_Value(t *testing.T)  { urlFromLib.check(t, true, false) }

func TestPlatformDeclared_UrlRestatedByRuntimePackage_Static(t *testing.T) {
	urlRestatedByNode.check(t, false, false)
}
func TestPlatformDeclared_UrlRestatedByRuntimePackage_Value(t *testing.T) {
	urlRestatedByNode.check(t, true, false)
}

func TestPlatformDeclared_UrlFromNodeModule_Static(t *testing.T) {
	urlFromNodeModule.check(t, false, false)
}
func TestPlatformDeclared_UrlFromNodeModule_Value(t *testing.T) {
	urlFromNodeModule.check(t, true, false)
}

func TestPlatformDeclared_UrlEmptyMergeInTs_Static(t *testing.T) {
	urlEmptyMergeInTs.check(t, false, false)
}
func TestPlatformDeclared_UrlEmptyMergeInTs_Value(t *testing.T) {
	urlEmptyMergeInTs.check(t, true, false)
}

func TestPlatformDeclared_UrlEmptyMergeInDts_Static(t *testing.T) {
	urlEmptyMergeInDts.check(t, false, false)
}
func TestPlatformDeclared_UrlEmptyMergeInDts_Value(t *testing.T) {
	urlEmptyMergeInDts.check(t, true, false)
}

func TestPlatformDeclared_UrlAddedMemberIsTheAuthors_Static(t *testing.T) {
	urlAddedMemberInTs.check(t, false, false)
}
func TestPlatformDeclared_UrlAddedMemberIsTheAuthors_Value(t *testing.T) {
	urlAddedMemberInTs.check(t, true, false)
}

func TestPlatformDeclared_UrlOneLevelDeeper_Static(t *testing.T) {
	for _, urlTest := range []urlCase{urlFromLib, urlRestatedByNode, urlFromNodeModule, urlEmptyMergeInTs, urlAddedMemberInTs} {
		urlTest.check(t, false, true)
	}
}

func TestPlatformDeclared_UrlOneLevelDeeper_Value(t *testing.T) {
	for _, urlTest := range []urlCase{urlFromLib, urlRestatedByNode, urlFromNodeModule, urlEmptyMergeInTs, urlAddedMemberInTs} {
		urlTest.check(t, true, true)
	}
}
