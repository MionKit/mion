package resolver_test

import (
	"slices"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

const classMemberFlagsSource = `export class Account {
	#secret = 1;
	id = 1;
	onChange = () => 1;
	handler!: () => void;
	get label(): string { return 'x'; }
	total(): number { return this.#secret; }
}
`

const accountStaticSite = `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from './account.ts';
getRunTypeId<Account>();
`

const accountValueSite = `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from './account.ts';
declare const account: Account;
getRunTypeId(account);
`

func assertAccountFlags(t *testing.T, site string) {
	t.Helper()
	resolver := setupInline(t, map[string]string{"account.ts": classMemberFlagsSource, "site.ts": site})
	root := resolveFile(t, resolver, "site.ts")
	types := dump(resolver)
	if !slices.Contains(root.Flags, reflection.FlagPrivateFields) {
		t.Errorf("class with a #field must carry %q, flags=%v", reflection.FlagPrivateFields, root.Flags)
	}
	for _, ref := range root.Children {
		if member := deref(types, ref); member != nil && strings.HasPrefix(member.Name, "\xFE#") {
			t.Errorf("#field projected as member %q", member.Name)
		}
	}
	cases := []struct {
		name    string
		kind    reflection.ReflectionKind
		flag    string
		notFlag string
	}{
		{name: "id", kind: reflection.KindProperty, notFlag: reflection.FlagAccessor},
		{name: "label", kind: reflection.KindProperty, flag: reflection.FlagAccessor},
		{name: "onChange", kind: reflection.KindMethod, flag: reflection.FlagField},
		{name: "handler", kind: reflection.KindMethod, flag: reflection.FlagField},
		{name: "total", kind: reflection.KindMethod, notFlag: reflection.FlagField},
	}
	for _, want := range cases {
		member := findMember(types, root, want.name)
		if member == nil {
			t.Errorf("member %q missing", want.name)
			continue
		}
		if member.Kind != want.kind {
			t.Errorf("%s: kind %d, want %d", want.name, member.Kind, want.kind)
		}
		if want.flag != "" && !slices.Contains(member.Flags, want.flag) {
			t.Errorf("%s: missing flag %q, flags=%v", want.name, want.flag, member.Flags)
		}
		if want.notFlag != "" && slices.Contains(member.Flags, want.notFlag) {
			t.Errorf("%s: unexpected flag %q", want.name, want.notFlag)
		}
	}
}

func TestClassMemberFlags_Static(t *testing.T) {
	assertAccountFlags(t, accountStaticSite)
}

func TestClassMemberFlags_Value(t *testing.T) {
	assertAccountFlags(t, accountValueSite)
}

func TestClassMemberFlags_FormEquivalence(t *testing.T) {
	resolver := setupInline(t, map[string]string{"account.ts": classMemberFlagsSource, "static.ts": accountStaticSite, "value.ts": accountValueSite})
	static := resolveFile(t, resolver, "static.ts")
	value := resolveFile(t, resolver, "value.ts")
	if static.ID != value.ID {
		t.Fatalf("static and value forms of Account must share one type id, got %q vs %q", static.ID, value.ID)
	}
}

// Reading `v['\xFE#…@#secret']` once failed validate on every real instance and made the encoder write a bogus key.
func assertNoFamilyReadsPrivateField(t *testing.T, calls string) {
	t.Helper()
	resolver := setupInline(t, map[string]string{"account.ts": classMemberFlagsSource, "site.ts": `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn, createRemoveUnknownKeysFn} from '@mionjs/run-types';
import {Account} from './account.ts';
` + calls})
	response := resolver.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"site.ts"}, IncludeEntryModules: true})
	if response.Error != "" {
		t.Fatalf("scan: %s", response.Error)
	}
	sources := allEntrySources(response)
	if strings.Contains(sources, "secret") || strings.Contains(sources, "\xFE#") {
		t.Errorf("a generated function reads the #field by its internal name:\n%s", sources)
	}
}

func TestClassMemberFlags_NoFamilyReadsAPrivateField_Static(t *testing.T) {
	assertNoFamilyReadsPrivateField(t, `export const isAccount = createValidateFn<Account>();
export const encode = createJsonEncoderFn<Account>();
export const decode = createJsonDecoderFn<Account>();
export const holder = createRemoveUnknownKeysFn<{account: {id: number; inner: Account}}>();
`)
}

func TestClassMemberFlags_NoFamilyReadsAPrivateField_Value(t *testing.T) {
	assertNoFamilyReadsPrivateField(t, `declare const account: Account;
declare const holder: {account: {id: number; inner: Account}};
export const isAccount = createValidateFn(account);
export const encode = createJsonEncoderFn(account);
export const decode = createJsonDecoderFn(account);
export const strip = createRemoveUnknownKeysFn(holder);
`)
}

var boxVariants = map[string]string{
	"getter":   `export class Box { get size(): number { return 1; } }`,
	"data":     `export class Box { size = 1; }`,
	"method":   `export class Box { size(): number { return 1; } }`,
	"fnField":  `export class Box { size = (): number => 1; }`,
	"private":  `export class Box { #hidden = 1; }`,
	"noFields": `export class Box {}`,
}

// A getter, data property, method, function field and #field of one name are different shapes: never one cache entry.
func assertBoxVariantsHaveDistinctIDs(t *testing.T, site string) {
	t.Helper()
	seen := map[string]string{}
	for label, source := range boxVariants {
		resolver := setupInline(t, map[string]string{"box.ts": source, "site.ts": site})
		id := resolveFile(t, resolver, "site.ts").ID
		if other, dup := seen[id]; dup {
			t.Errorf("%s and %s share type id %s", label, other, id)
		}
		seen[id] = label
	}
}

func TestClassMemberFlags_AccessorAndFieldFoldIntoTheTypeID_Static(t *testing.T) {
	assertBoxVariantsHaveDistinctIDs(t, `import {getRunTypeId} from '@mionjs/run-types';
import {Box} from './box.ts';
getRunTypeId<Box>();
`)
}

func TestClassMemberFlags_AccessorAndFieldFoldIntoTheTypeID_Value(t *testing.T) {
	assertBoxVariantsHaveDistinctIDs(t, `import {getRunTypeId} from '@mionjs/run-types';
import {Box} from './box.ts';
declare const box: Box;
getRunTypeId(box);
`)
}

// TS `private` / `protected` is only a compile-time word: the field is data, checked like a public one, with one id.
var visibilityVariants = map[string]map[string]string{
	"public":            {"box.ts": `export class Box { size = 1; }`},
	"private":           {"box.ts": `export class Box { private size = 1; }`},
	"protected":         {"box.ts": `export class Box { protected size = 1; }`},
	"private param":     {"box.ts": `export class Box { constructor(private size: number) {} }`},
	"typed private dts": {"box.d.ts": `export declare class Box { private size: number; }`},
	"protected dts":     {"box.d.ts": `export declare class Box { protected size: number; }`},
}

func assertVisibilityKeepsOneID(t *testing.T, site string) {
	t.Helper()
	ids := map[string]string{}
	for label, files := range visibilityVariants {
		withSite := map[string]string{"site.ts": site}
		for name, content := range files {
			withSite[name] = content
		}
		resolver := setupInline(t, withSite)
		root := resolveFile(t, resolver, "site.ts")
		if member := findMember(dump(resolver), root, "size"); member == nil {
			t.Errorf("%s: `size` must stay a checked member", label)
		}
		ids[label] = root.ID
	}
	for label, id := range ids {
		if id != ids["public"] {
			t.Errorf("%s: id %s, want the public id %s", label, id, ids["public"])
		}
	}
}

func TestClassMemberFlags_VisibilityKeepsOneID_Static(t *testing.T) {
	assertVisibilityKeepsOneID(t, `import {getRunTypeId} from '@mionjs/run-types';
import {Box} from './box';
getRunTypeId<Box>();
`)
}

func TestClassMemberFlags_VisibilityKeepsOneID_Value(t *testing.T) {
	assertVisibilityKeepsOneID(t, `import {getRunTypeId} from '@mionjs/run-types';
import {Box} from './box';
declare const box: Box;
getRunTypeId(box);
`)
}

func TestClassMemberFlags_VisibilityFormEquivalence(t *testing.T) {
	resolver := setupInline(t, map[string]string{
		"box.ts":    `export class Box { private size = 1; }`,
		"static.ts": "import {getRunTypeId} from '@mionjs/run-types';\nimport {Box} from './box';\ngetRunTypeId<Box>();\n",
		"value.ts":  "import {getRunTypeId} from '@mionjs/run-types';\nimport {Box} from './box';\ndeclare const box: Box;\ngetRunTypeId(box);\n",
	})
	if static, value := resolveFile(t, resolver, "static.ts"), resolveFile(t, resolver, "value.ts"); static.ID != value.ID {
		t.Fatalf("static and value forms must share one id, got %q vs %q", static.ID, value.ID)
	}
}
