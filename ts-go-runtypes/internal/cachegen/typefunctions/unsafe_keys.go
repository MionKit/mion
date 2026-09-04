package typefunctions

import (
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// UnsafeKeyMessage prefixes the one message every decoder throws for a wire
// key named in reflection.UnsafePropertyNames, on both roads (the binary
// reader's desSafePropName carries the same text).
const UnsafeKeyMessage = "[mion] Unsafe property name: "

// unsafeKeyCheck renders the JS condition that is true for a wire key no
// decoder, validator or rebuilding encoder accepts. The key's length is
// checked first: only a 9- or 11-character key can be one of the three names,
// so every other key costs one integer compare and no string compare. The
// names are grouped by length so the shape follows the name set.
func unsafeKeyCheck(keyVar string) string {
	byLen := map[int][]string{}
	var lens []int
	for _, name := range reflection.UnsafePropertyNames {
		if _, seen := byLen[len(name)]; !seen {
			lens = append(lens, len(name))
		}
		byLen[len(name)] = append(byLen[len(name)], keyVar+" === "+quoteJS(name))
	}
	sort.Ints(lens)
	groups := make([]string, 0, len(lens))
	for _, length := range lens {
		names := strings.Join(byLen[length], " || ")
		if len(byLen[length]) > 1 {
			names = "(" + names + ")"
		}
		groups = append(groups, "("+keyVar+".length === "+strconv.Itoa(length)+" && "+names+")")
	}
	return strings.Join(groups, " || ")
}

// unsafeKeyThrow: the decoder rule — refuse the key at decode time, naming it.
func unsafeKeyThrow(keyVar string) string {
	return "if (" + unsafeKeyCheck(keyVar) + ") throw new Error(" + quoteJS(UnsafeKeyMessage) + " + " + keyVar + ");"
}

// unsafeKeySkip: the rebuild rule — an encoder or clone that writes wire keys
// onto a fresh object leaves the key out. The in-place encoders (mutate,
// stringify, binary) carry no guard on purpose: they never write a key onto an
// object, and the receiving decoder refuses the key, so a compare per key
// there would buy nothing.
func unsafeKeySkip(keyVar string) string {
	return "if (" + unsafeKeyCheck(keyVar) + ") continue;"
}

// unsafeDeclaredMember returns the first declared member name anywhere in the
// type graph under rt that is one of reflection.UnsafePropertyNames, or "".
// Members are resolved through the ref table and the walk follows every child
// data slot (properties, elements, index signatures, type arguments), so
// a name declared on a nested object literal, a class, an intersection member or
// an array element fails the build exactly like one on the root. Required and
// optional members alike: an optional slot is still a wire key the decoders
// refuse, so it can never round-trip either.
func unsafeDeclaredMember(rt *reflection.RunType, refTable map[string]*reflection.RunType) string {
	visited := map[string]bool{}
	var walk func(node *reflection.RunType) string
	walk = func(node *reflection.RunType) string {
		if node == nil {
			return ""
		}
		if node.Kind == reflection.KindRef {
			node = refTable[node.ID]
			if node == nil {
				return ""
			}
		}
		if node.ID != "" {
			if visited[node.ID] {
				return ""
			}
			visited[node.ID] = true
		}
		// Function-like members and statics never reach the wire (DataOnly
		// strips them), so a name inside a parameter list, a return type or a
		// static side (`typeof Box` carries a real `prototype`) is not data.
		if isFunctionLikeKind(node.Kind) || node.IsStatic {
			return ""
		}
		switch node.Kind {
		case reflection.KindProperty, reflection.KindPropertySignature:
			if reflection.IsUnsafePropertyName(node.Name) {
				return node.Name
			}
		}
		for _, child := range node.Children {
			if name := walk(child); name != "" {
				return name
			}
		}
		for _, slot := range []*reflection.RunType{node.Child, node.Index} {
			if name := walk(slot); name != "" {
				return name
			}
		}
		for _, argument := range node.TypeArguments {
			if name := walk(argument); name != "" {
				return name
			}
		}
		return ""
	}
	return walk(rt)
}
