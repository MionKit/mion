package typefunctions

import (
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// UnsafeKeyMessage prefixes the one message every decoder throws for a wire
// key named in reflection.UnsafePropertyNames (the runtime's
// UNSAFE_PROPERTY_NAME_MESSAGE carries the same text).
const UnsafeKeyMessage = "[mion] Unsafe property name: "

// unsafeKeyCheck renders the JS condition true for a wire key no decoder, validator or rebuilding encoder
// accepts. Grouped by length, and the length is compared first, so a key of another length costs one integer
// compare and no string compare.
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

// unsafeKeySkip: the rebuild rule, an encoder or clone writing wire keys onto a fresh object leaves it out.
// The in-place encoders (mutate, stringify) carry no guard on purpose: they never write a key onto an
// object, and the receiving decoder refuses it, so a compare per key would buy nothing.
func unsafeKeySkip(keyVar string) string {
	return "if (" + unsafeKeyCheck(keyVar) + ") continue;"
}
