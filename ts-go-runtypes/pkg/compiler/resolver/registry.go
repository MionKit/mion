package resolver

import (
	"maps"
	"slices"
)

// Registry is one extension table: rows by name in registration order. A name already present panics unless the
// row replaces it, and replacing an absent name panics, so the bump that deletes a built-in forces a plain row.
// Every table a binary built on mion fills (the resolver's and pkg/cli's) is one of these. Rows are registered
// before cli.Main serves, so the tables need no lock.
type Registry[T any] struct {
	kind  string
	order []string
	rows  map[string]T
}

// NewRegistry is an empty table; kind names its rows in the panics.
func NewRegistry[T any](kind string) *Registry[T] {
	return &Registry[T]{kind: kind, rows: map[string]T{}}
}

// Add registers row under name; replace swaps a registered row in place.
func (table *Registry[T]) Add(name string, row T, replace bool) {
	if name == "" {
		panic("mion: " + table.kind + " registered without a name")
	}
	_, exists := table.rows[name]
	switch {
	case exists && !replace:
		panic("mion: duplicate registration of " + table.kind + " " + name)
	case !exists && replace:
		panic("mion: " + table.kind + " " + name + " is not registered, so there is nothing to replace")
	case !exists:
		table.order = append(table.order, name)
	}
	table.rows[name] = row
}

// Get returns the row registered under name.
func (table *Registry[T]) Get(name string) (T, bool) {
	row, ok := table.rows[name]
	return row, ok
}

// List returns the rows in registration order; a replaced row keeps its slot.
func (table *Registry[T]) List() []T {
	out := make([]T, 0, len(table.order))
	for _, name := range table.order {
		out = append(out, table.rows[name])
	}
	return out
}

// Names returns the registered names in registration order.
func (table *Registry[T]) Names() []string { return slices.Clone(table.order) }

// Clone copies the table, so a test can restore it.
func (table *Registry[T]) Clone() *Registry[T] {
	return &Registry[T]{kind: table.kind, order: slices.Clone(table.order), rows: maps.Clone(table.rows)}
}
