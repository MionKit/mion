package typeid

import "testing"

// TestIsBundledLibFile: a package's own lib.d.ts is not the platform, whatever its name.
func TestIsBundledLibFile(t *testing.T) {
	for fileName, want := range map[string]bool{
		bundledLibPrefix + "/lib.dom.d.ts":          true,
		bundledLibPrefix + "/lib.es2022.d.ts":       true,
		"/repo/packages/shapes/dist/lib.d.ts":       false,
		"/repo/node_modules/shapes/lib.es2022.d.ts": false,
	} {
		if got := IsBundledLibFile(fileName); got != want {
			t.Errorf("IsBundledLibFile(%q) = %v, want %v", fileName, got, want)
		}
	}
}
