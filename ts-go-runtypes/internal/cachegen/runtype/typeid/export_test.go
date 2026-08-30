package typeid

// SetMaxWalkOpsForTest lowers the walk-ops budget and returns the restore
// func. Test-only seam for the ops branch of the walk backstop: real spirals
// go deep before they go wide, so maxWalkDepth latches first and the ops
// branch is otherwise unreachable from a source fixture.
func SetMaxWalkOpsForTest(limit int) func() {
	previous := maxWalkOps
	maxWalkOps = limit
	return func() { maxWalkOps = previous }
}

// SetBundledLibPrefixForTest points the "is this a standard library file" check
// at another directory and returns the restore func. Test-only seam: the check
// decides what the projection takes whole, and the only honest way to test it
// is to stage a file that IS the standard library for the duration of one test.
// Nothing in production ever assigns the prefix.
func SetBundledLibPrefixForTest(prefix string) func() {
	previous := bundledLibPrefix
	bundledLibPrefix = prefix
	return func() { bundledLibPrefix = previous }
}
