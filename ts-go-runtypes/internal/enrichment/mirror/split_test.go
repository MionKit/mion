package mirror

import (
	"strings"
	"testing"
)

const combinedMirror = `import type { User, Address } from '../../src/models';
import type { FriendlyType, MockData } from '@ts-runtypes/core';
import { friendlyCard, mockCard } from './billing/card';

/** @rtType Address#a1 @rtIds {street: s1} */
// @todo: generated skeleton — fill in real data, then delete this line
export const friendlyAddress: FriendlyType<Address> = {
  rt$label: 'Address',
  rt$errors: {type: ''},
  street: {rt$label: 'Street name', rt$errors: {type: ''}},
};

/** @rtType Address#a1 @rtIds {street: s1} */
export const mockAddress: MockData<Address> = {
  street: {pool: ['Main St']},
};

// a hand-added helper the author references from a function-form rt$errors
const sharedHelper = 'shared';

/* @rtOrphan /** @rtType Gone#g1 *\/
export const mockGone: MockData<Gone> = {
  street: {pool: ['kept']},
}; */

/** @rtType User#u1 @rtIds {name: n1, home: a1} */
export const friendlyUser: FriendlyType<User> = {
  rt$label: 'User',
  rt$errors: {type: ''},
  name: {rt$label: 'Full name', rt$errors: {type: '', minLength: 'too short'}},
  home: friendlyAddress,
  card: friendlyCard,
};

/** @rtType User#u1 @rtIds {name: n1, home: a1} */
export const mockUser: MockData<User> = {
  name: {pool: ['Alice']},
  home: mockAddress,
  card: mockCard,
};
`

func TestSplitCombined(t *testing.T) {
	legacyPath := "/proj/runtypes/generated/models.ts"
	friendlyPath := "/proj/runtypes/generated/friendly/models.ts"
	mockPath := "/proj/runtypes/generated/mock/models.ts"
	sourceFile := "/proj/src/models.ts"

	friendlyOut, mockOut, err := SplitCombined(legacyPath, []byte(combinedMirror), friendlyPath, mockPath, sourceFile)
	if err != nil {
		t.Fatalf("SplitCombined error: %v", err)
	}
	friendly, mock := string(friendlyOut), string(mockOut)

	// Both outputs must be parseable mirrors with only their own family's consts.
	for _, half := range []struct {
		name, text, path   string
		wantVars, banVars  []string
		wantDSL, banDSL    string
		wantAuthoredValue  string
		wantValueImport    string
		droppedValueImport string
	}{
		{
			name: "friendly", text: friendly, path: friendlyPath,
			wantVars: []string{"friendlyAddress", "friendlyUser"}, banVars: []string{"mockAddress", "mockUser"},
			wantDSL: "import type { FriendlyType } from '@ts-runtypes/core';", banDSL: "MockData",
			wantAuthoredValue:  "street: {rt$label: 'Street name', rt$errors: {type: ''}},",
			wantValueImport:    "import { friendlyCard } from './billing/card';",
			droppedValueImport: "mockCard",
		},
		{
			name: "mock", text: mock, path: mockPath,
			wantVars: []string{"mockAddress", "mockUser"}, banVars: []string{"friendlyAddress", "friendlyUser"},
			wantDSL: "import type { MockData } from '@ts-runtypes/core';", banDSL: "FriendlyType",
			wantAuthoredValue:  "street: {pool: ['Main St']},",
			wantValueImport:    "import { mockCard } from './billing/card';",
			droppedValueImport: "friendlyCard",
		},
	} {
		t.Run(half.name, func(t *testing.T) {
			index, parseErr := ParseMirror(half.path, []byte(half.text))
			if parseErr != nil {
				t.Fatalf("split %s output does not parse: %v\n%s", half.name, parseErr, half.text)
			}
			for _, wantVar := range half.wantVars {
				if index.byVar[wantVar] == nil {
					t.Errorf("%s output missing const %s:\n%s", half.name, wantVar, half.text)
				}
			}
			for _, banVar := range half.banVars {
				if index.byVar[banVar] != nil {
					t.Errorf("%s output must not hold %s:\n%s", half.name, banVar, half.text)
				}
			}
			// The breadcrumb is recomputed one directory deeper.
			if want := "import type { User, Address } from '../../../src/models';"; !strings.Contains(half.text, want) {
				t.Errorf("%s output missing recomputed breadcrumb %q:\n%s", half.name, want, half.text)
			}
			if !strings.Contains(half.text, half.wantDSL) {
				t.Errorf("%s output missing DSL import %q:\n%s", half.name, half.wantDSL, half.text)
			}
			if strings.Contains(half.text, half.banDSL) {
				t.Errorf("%s output must not import %q:\n%s", half.name, half.banDSL, half.text)
			}
			// Authored values carry verbatim.
			if !strings.Contains(half.text, half.wantAuthoredValue) {
				t.Errorf("%s output lost authored value %q:\n%s", half.name, half.wantAuthoredValue, half.text)
			}
			// Cross-file value imports keep their specifier, names family-filtered.
			if !strings.Contains(half.text, half.wantValueImport) {
				t.Errorf("%s output missing value import %q:\n%s", half.name, half.wantValueImport, half.text)
			}
			if strings.Contains(half.text, half.droppedValueImport) {
				t.Errorf("%s output must not import %q:\n%s", half.name, half.droppedValueImport, half.text)
			}
			// The hand-added helper statement is kept in BOTH files.
			if want := "const sharedHelper = 'shared';"; !strings.Contains(half.text, want) {
				t.Errorf("%s output missing hand-added statement %q:\n%s", half.name, want, half.text)
			}
		})
	}

	// Marker + @todo lines ride with their const.
	if !strings.Contains(friendly, "/** @rtType Address#a1 @rtIds {street: s1} */\n// @todo: generated skeleton") {
		t.Errorf("friendly output lost the marker + @todo pairing:\n%s", friendly)
	}
	// The mock-family orphan carcass lands ONLY in the mock file.
	if strings.Contains(friendly, "@rtOrphan") {
		t.Errorf("friendly output must not carry the mock carcass:\n%s", friendly)
	}
	if !strings.Contains(mock, "/* @rtOrphan /** @rtType Gone#g1 *\\/") {
		t.Errorf("mock output lost the @rtOrphan carcass:\n%s", mock)
	}
}

// TestSplitCombined_FriendlyOnly: a combined file generated with --friendly
// (no mock consts at all) splits into a friendly file and a nil mock half.
func TestSplitCombined_FriendlyOnly(t *testing.T) {
	combined := `import type { User } from '../../src/models';
import type { FriendlyType, MockData } from '@ts-runtypes/core';

/** @rtType User#u1 */
export const friendlyUser: FriendlyType<User> = {
  rt$label: '',
  rt$errors: {type: ''},
};
`
	friendlyOut, mockOut, err := SplitCombined(
		"/p/rt/models.ts", []byte(combined), "/p/rt/friendly/models.ts", "/p/rt/mock/models.ts", "/p/src/models.ts")
	if err != nil {
		t.Fatalf("SplitCombined error: %v", err)
	}
	if mockOut != nil {
		t.Errorf("mock half should be nil for a friendly-only combined file, got:\n%s", mockOut)
	}
	if !strings.Contains(string(friendlyOut), "export const friendlyUser") {
		t.Errorf("friendly half missing the const:\n%s", friendlyOut)
	}
}
