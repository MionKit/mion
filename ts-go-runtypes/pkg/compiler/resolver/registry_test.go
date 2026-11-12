package resolver

import (
	"slices"
	"testing"
)

func TestRegistry_Rules(t *testing.T) {
	table := NewRegistry[int]("row")
	table.Add("a", 1, false)
	table.Add("b", 2, false)
	expectRegistryPanic(t, func() { table.Add("a", 3, false) })
	expectRegistryPanic(t, func() { table.Add("c", 3, true) })
	expectRegistryPanic(t, func() { table.Add("", 3, false) })
	table.Add("a", 10, true)
	if !slices.Equal(table.List(), []int{10, 2}) || !slices.Equal(table.Names(), []string{"a", "b"}) {
		t.Fatalf("a replaced row keeps its slot: %v %v", table.Names(), table.List())
	}
	if row, ok := table.Get("b"); !ok || row != 2 {
		t.Fatal("Get must return the registered row")
	}
	copied := table.Clone()
	copied.Add("c", 3, false)
	if _, ok := table.Get("c"); ok || len(table.Names()) != 2 {
		t.Fatal("a clone must not share rows with its source")
	}
}
