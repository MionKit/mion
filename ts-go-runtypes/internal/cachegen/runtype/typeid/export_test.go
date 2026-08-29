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
