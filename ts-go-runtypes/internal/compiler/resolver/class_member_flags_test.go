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

// assertAccountFlags checks the projection of Account: no #field member, the class flagged, each member's kind and flags.
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

// assertNoFamilyReadsPrivateField: reading `v['\xFE#…@#secret']` failed validate on every real instance and made
// the encoder write a bogus key.
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

// assertBoxVariantsHaveDistinctIDs: a getter, a data property, a method, a function field and a #field of the same
// name are different shapes, so they never share a cache entry.
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
