package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// UnsafeKeyMessage prefixes the one message every decoder throws for a wire
// key named in reflection.UnsafePropertyNames, on both roads (the binary
// reader's desSafePropName carries the same text).
const UnsafeKeyMessage = "[mion] Unsafe property name: "

// unsafeKeyCheck renders the JS condition that is true for a wire key no
// decoder, validator or rebuilding encoder accepts. Plain `===` compares
// against internalized literals: a length check first would cost the same.
func unsafeKeyCheck(keyVar string) string {
	parts := make([]string, 0, len(reflection.UnsafePropertyNames))
	for _, name := range reflection.UnsafePropertyNames {
		parts = append(parts, keyVar+" === "+quoteJS(name))
	}
	return strings.Join(parts, " || ")
}

// unsafeKeyThrow: the decoder rule — refuse the key at decode time, naming it.
func unsafeKeyThrow(keyVar string) string {
	return "if (" + unsafeKeyCheck(keyVar) + ") throw new Error(" + quoteJS(UnsafeKeyMessage) + " + " + keyVar + ");"
}

// unsafeKeySkip: the rebuild rule — an encoder or clone that writes wire keys
// onto a fresh object leaves the key out.
func unsafeKeySkip(keyVar string) string {
	return "if (" + unsafeKeyCheck(keyVar) + ") continue;"
}

// unsafeKeyDelete: the in-place encoder rule — the mutating encoder drops the
// key from the object it was handed, so the wire never carries it.
func unsafeKeyDelete(keyVar, v string) string {
	return "if (" + unsafeKeyCheck(keyVar) + ") { delete " + v + "[" + keyVar + "]; continue; }"
}

// unsafeDeclaredMember returns the first declared member name of an object-like
// type that is one of reflection.UnsafePropertyNames, or "". Members are
// resolved through the ref table, so an interface, a class and an intersection
// all report it.
func unsafeDeclaredMember(rt *reflection.RunType, refTable map[string]*reflection.RunType) string {
	if rt == nil {
		return ""
	}
	switch rt.Kind {
	case reflection.KindObjectLiteral, reflection.KindClass, reflection.KindIntersection:
	default:
		return ""
	}
	for _, child := range rt.Children {
		member := child
		if member != nil && member.Kind == reflection.KindRef {
			member = refTable[member.ID]
		}
		if member == nil {
			continue
		}
		switch member.Kind {
		case reflection.KindProperty, reflection.KindPropertySignature:
			if reflection.IsUnsafePropertyName(member.Name) {
				return member.Name
			}
		}
	}
	return ""
}
