package reflection

import (
	"reflect"
	"sort"
	"strings"
	"testing"
)

// refSlotExcluded lists the RunType / SchemaChecks fields that hold a
// *RunType or []*RunType but are deliberately NOT enumerated by EachRefSlot,
// each with the reason. Empty today: every child-bearing slot is a walk slot.
// A field added here needs a reason a reviewer can check, because every
// standalone pass built on WalkGraph will be blind to it.
var refSlotExcluded = map[string]string{}

// TestEachRefSlot_CoversEveryChildSlot is the slot-coverage gate: it fills
// every *RunType / []*RunType field reachable from a RunType (SchemaChecks and
// its check structs included) with a node named after the field, runs
// EachRefSlot, and fails when any of those nodes was not visited. Adding a
// child slot to the struct without wiring it into EachRefSlot fails here, in
// the 2ms reflection package, before any walker can silently miss it.
func TestEachRefSlot_CoversEveryChildSlot(t *testing.T) {
	root := &RunType{}
	expected := map[string]bool{}
	fillChildSlots(t, reflect.ValueOf(root).Elem(), "", expected)
	if len(expected) == 0 {
		t.Fatal("no child slots found on RunType; the reflect filler is broken")
	}

	visited := map[string]bool{}
	root.EachRefSlot(func(child *RunType) { visited[child.ID] = true })

	var missing []string
	for id := range expected {
		if !visited[id] && refSlotExcluded[id] == "" {
			missing = append(missing, id)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("child slots not enumerated by EachRefSlot (wire them in refslots.go or list them in refSlotExcluded with a reason): %s", strings.Join(missing, ", "))
	}
	for id, reason := range refSlotExcluded {
		if !expected[id] {
			t.Errorf("refSlotExcluded names %q which is not a child slot any more (stale entry: %s)", id, reason)
		}
		if visited[id] {
			t.Errorf("refSlotExcluded names %q but EachRefSlot visits it; drop the exclusion", id)
		}
	}
}

var runTypePointer = reflect.TypeOf(&RunType{})

// fillChildSlots sets every *RunType field under value to a fresh node whose
// id is the dotted field path, every []*RunType field to a one-element slice
// of such a node, and recurses into embedded structs and slices of struct
// pointers (the SchemaChecks check entries) so their nested slots count too.
func fillChildSlots(t *testing.T, value reflect.Value, prefix string, expected map[string]bool) {
	t.Helper()
	structType := value.Type()
	for index := 0; index < structType.NumField(); index++ {
		field := structType.Field(index)
		slot := value.Field(index)
		name := prefix + field.Name
		switch {
		case field.Type == runTypePointer:
			slot.Set(reflect.ValueOf(&RunType{ID: name}))
			expected[name] = true
		case field.Type.Kind() == reflect.Slice && field.Type.Elem() == runTypePointer:
			slot.Set(reflect.ValueOf([]*RunType{{ID: name}}))
			expected[name] = true
		case field.Anonymous && field.Type.Kind() == reflect.Struct:
			fillChildSlots(t, slot, prefix, expected)
		case field.Type.Kind() == reflect.Slice && field.Type.Elem().Kind() == reflect.Ptr && field.Type.Elem().Elem().Kind() == reflect.Struct:
			entry := reflect.New(field.Type.Elem().Elem())
			before := len(expected)
			fillChildSlots(t, entry.Elem(), name+".", expected)
			if len(expected) > before {
				slice := reflect.MakeSlice(field.Type, 0, 1)
				slot.Set(reflect.Append(slice, entry))
			}
		}
	}
}

// TestWalkGraph_ReachesEverySlotThroughRefs pins the three WalkGraph
// contracts a pass relies on: every EachRefSlot slot is reached, a KindRef is
// resolved before it is visited, and a cycle terminates with each node seen
// once.
func TestWalkGraph_ReachesEverySlotThroughRefs(t *testing.T) {
	root := &RunType{ID: "root", Kind: KindObjectLiteral}
	expected := map[string]bool{}
	fillChildSlots(t, reflect.ValueOf(root).Elem(), "", expected)
	// Route every slot through a ref so the walk has to resolve it: the slot
	// holds a ref named after the field, the table holds the real node.
	refTable := map[string]*RunType{}
	root.EachRefSlot(func(child *RunType) {
		refTable[child.ID] = &RunType{ID: child.ID, Kind: KindString}
		child.Kind = KindRef
	})
	// One resolved node points back at the root: the cycle guard must stop it.
	first := ""
	for id := range refTable {
		if first == "" || id < first {
			first = id
		}
	}
	refTable[first].Child = NewRef("root")
	refTable["root"] = root

	visits := map[string]int{}
	WalkGraph(NewRef("root"), refTable, func(node *RunType) WalkAction {
		if node.Kind == KindRef {
			t.Errorf("visitor handed an unresolved ref %q", node.ID)
		}
		visits[node.ID]++
		return WalkContinue
	})
	for id := range expected {
		if visits[id] != 1 {
			t.Errorf("slot %q visited %d times, want exactly once", id, visits[id])
		}
	}
	if visits["root"] != 1 {
		t.Errorf("root visited %d times, want exactly once", visits["root"])
	}
}

// TestWalkGraph_StopAndSkip pins that WalkStop ends the walk and
// WalkSkipChildren prunes a subtree without ending it.
func TestWalkGraph_StopAndSkip(t *testing.T) {
	leafA := &RunType{ID: "leafA", Kind: KindString}
	leafB := &RunType{ID: "leafB", Kind: KindString}
	skipped := &RunType{ID: "skipped", Kind: KindObjectLiteral, Children: []*RunType{NewRef("leafA")}}
	kept := &RunType{ID: "kept", Kind: KindObjectLiteral, Children: []*RunType{NewRef("leafB")}}
	root := &RunType{ID: "root", Kind: KindObjectLiteral, Children: []*RunType{NewRef("skipped"), NewRef("kept")}}
	refTable := map[string]*RunType{"leafA": leafA, "leafB": leafB, "skipped": skipped, "kept": kept}

	var order []string
	WalkGraph(root, refTable, func(node *RunType) WalkAction {
		order = append(order, node.ID)
		if node.ID == "skipped" {
			return WalkSkipChildren
		}
		return WalkContinue
	})
	if got := strings.Join(order, ","); got != "root,skipped,kept,leafB" {
		t.Errorf("skip order = %s, want root,skipped,kept,leafB", got)
	}

	order = nil
	WalkGraph(root, refTable, func(node *RunType) WalkAction {
		order = append(order, node.ID)
		if node.ID == "leafA" {
			return WalkStop
		}
		return WalkContinue
	})
	if got := strings.Join(order, ","); got != "root,skipped,leafA" {
		t.Errorf("stop order = %s, want root,skipped,leafA", got)
	}
}
