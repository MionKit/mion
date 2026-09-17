package reflection

// UnsafePropertyNames are the names that are never a property. `__proto__` is
// the only one: `target[key] = value` under that key swaps the target's
// prototype instead of storing a value, and reading it answers the prototype
// rather than data. `prototype` and `constructor` were once refused alongside
// it and are ordinary names: both land as plain own keys, `({}).prototype` is
// undefined, and `({}).constructor` only needs the own-key presence test the
// emitters already apply to an inherited member.
//
// The name is refused in both positions, differently. As a WIRE KEY admitted by
// an index signature every decoder refuses it, validate refuses it, and every
// encoder or clone that rebuilds an object from its keys leaves it out. As a
// DECLARED member it is dropped like any other member that cannot cross the
// wire. TypeScript accepts such a declaration, so the type promises a value the
// runtime never carries: that is what the UPN001 Warning is for.
var UnsafePropertyNames = []string{"__proto__"}

// IsUnsafePropertyName reports whether name is one of UnsafePropertyNames.
func IsUnsafePropertyName(name string) bool {
	for _, unsafe := range UnsafePropertyNames {
		if name == unsafe {
			return true
		}
	}
	return false
}
