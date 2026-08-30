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
// at another directory and returns the restore func. Test-only seam for the
// MKR014 path: that diagnostic fires only for a type declared inside the
// bundled lib, and no lib type SHIPPING today still reaches the walk backstop —
// which is the point of the coverage that got it there. The diagnostic exists
// for the next lib edition that opens a new one, so a test has to be able to
// stage one rather than wait for a real regression to prove it works.
func SetBundledLibPrefixForTest(prefix string) func() {
	previous := bundledLibPrefix
	bundledLibPrefix = prefix
	return func() { bundledLibPrefix = previous }
}
