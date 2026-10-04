package convert

import "testing"

// TestDeclKind_EveryKindAnswersEveryQuestion: a kind missing from a declaration-kind switch panics here, not in a build.
func TestDeclKind_EveryKindAnswersEveryQuestion(t *testing.T) {
	for kind := DeclClass; kind < declKindCount; kind++ {
		func() {
			defer func() {
				if recovered := recover(); recovered != nil {
					t.Errorf("DeclKind %d: %v", kind, recovered)
				}
			}()
			kind.KeepsItsName()
			kind.HasHome()
			statement := (&PrintedDecl{Kind: kind, Name: "Named"}).declarationStatement("Named")
			if (statement == "") != (kind == DeclBuiltin) {
				t.Errorf("DeclKind %d prints %q; only a platform class prints nothing", kind, statement)
			}
		}()
	}
}
