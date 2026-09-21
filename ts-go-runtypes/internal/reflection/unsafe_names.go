package reflection

// UnsafePropertyNames are the names that are never a property. `__proto__` is the only one: `target[key] =
// value` under that key swaps the target's prototype instead of storing a value, and reading it answers the
// prototype. `prototype` and `constructor` were once refused alongside it and are ordinary names: both land as
// plain own keys, `({}).prototype` is undefined, and `({}).constructor` only needs the own-key presence test
// the emitters already apply to an inherited member.
//
// Refused in both positions, differently. As a WIRE KEY admitted by an index signature, every decoder and
// validate refuse it and every encoder or clone that rebuilds from keys leaves it out. As a DECLARED member it
// is dropped like any member that cannot cross the wire; TypeScript accepts the declaration, so the type
// promises a value the runtime never carries, which is what the UPN001 Warning is for.
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
