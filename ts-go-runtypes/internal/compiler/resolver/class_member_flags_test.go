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

// Both marker call shapes reflect the same class node.
var classMemberFlagsSites = map[string]string{
	"static": `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from './account.ts';
getRunTypeId<Account>();
`,
	"value": `import {getRunTypeId} from '@mionjs/run-types';
import {Account} from './account.ts';
declare const account: Account;
getRunTypeId(account);
`,
}

func TestClassMemberFlags_PrivateFieldsAccessorsAndFunctionFields(t *testing.T) {
	for shape, site := range classMemberFlagsSites {
		t.Run(shape, func(t *testing.T) {
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
		})
	}
}

// Reading `v['\xFE#…@#secret']` failed validate on every real instance and made the encoder write a bogus key.
func TestClassMemberFlags_NoFamilyReadsAPrivateField(t *testing.T) {
	resolver := setupInline(t, map[string]string{"account.ts": classMemberFlagsSource, "site.ts": `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn, createRemoveUnknownKeysFn} from '@mionjs/run-types';
import {Account} from './account.ts';
export const isAccount = createValidateFn<Account>();
export const encode = createJsonEncoderFn<Account>();
export const decode = createJsonDecoderFn<Account>();
export const holder = createRemoveUnknownKeysFn<{account: {id: number; inner: Account}}>();
`})
	resp := resolver.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"site.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	sources := allEntrySources(resp)
	if strings.Contains(sources, "secret") || strings.Contains(sources, "\xFE#") {
		t.Errorf("a generated function reads the #field by its internal name:\n%s", sources)
	}
}

// A getter and a data property of the same name and type are different shapes, so they never share a cache entry.
func TestClassMemberFlags_AccessorAndFieldFoldIntoTheTypeID(t *testing.T) {
	ids := map[string]string{}
	for label, source := range map[string]string{
		"getter":   `export class Box { get size(): number { return 1; } }`,
		"data":     `export class Box { size = 1; }`,
		"method":   `export class Box { size(): number { return 1; } }`,
		"fnField":  `export class Box { size = (): number => 1; }`,
		"private":  `export class Box { #hidden = 1; }`,
		"noFields": `export class Box {}`,
	} {
		resolver := setupInline(t, map[string]string{"box.ts": source, "site.ts": `import {getRunTypeId} from '@mionjs/run-types';
import {Box} from './box.ts';
getRunTypeId<Box>();
`})
		ids[label] = resolveFile(t, resolver, "site.ts").ID
	}
	seen := map[string]string{}
	for label, id := range ids {
		if other, dup := seen[id]; dup {
			t.Errorf("%s and %s share type id %s", label, other, id)
		}
		seen[id] = label
	}
}
