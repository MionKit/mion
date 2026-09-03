package reflection

// UnsafePropertyNames are the property names that are never data. Writing
// `__proto__` on a plain object swaps its prototype instead of adding a key,
// and a lookup of a missing `constructor` or `prototype` walks the prototype
// chain, so a wire that could carry them is a prototype-pollution vector.
// Every decoder refuses them as wire keys, validate refuses them under an
// index signature, every encoder and clone that rebuilds an object from its
// keys skips them, and a type that declares one fails the build.
var UnsafePropertyNames = []string{"__proto__", "prototype", "constructor"}

// IsUnsafePropertyName reports whether name is one of UnsafePropertyNames.
func IsUnsafePropertyName(name string) bool {
	for _, unsafe := range UnsafePropertyNames {
		if name == unsafe {
			return true
		}
	}
	return false
}
