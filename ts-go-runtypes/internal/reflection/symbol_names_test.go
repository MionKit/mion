package reflection

import "testing"

func TestIsSymbolKeyedName(t *testing.T) {
	for name, want := range map[string]bool{"\xFE@tag": true, "@@iterator": true, "tag": false, "@tag": false, "": false, "\xFE": false} {
		if got := IsSymbolKeyedName(name); got != want {
			t.Errorf("IsSymbolKeyedName(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestSymbolKeyLabel(t *testing.T) {
	for name, want := range map[string]string{"\xFE@tag": "[tag]", "@@iterator": "[iterator]", "plain": "plain"} {
		if got := SymbolKeyLabel(name); got != want {
			t.Errorf("SymbolKeyLabel(%q) = %q, want %q", name, got, want)
		}
	}
}
